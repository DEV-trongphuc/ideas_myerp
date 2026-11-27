import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, DollarSign, Briefcase, FileText, 
  Building2, Search, Check, ChevronDown, StickyNote,
  Car, UtensilsCrossed, Settings, Gift, Wrench, User, Loader2
} from 'lucide-react';
import api from '../../api/axios';
import { useUIStore } from '../../store/uiStore';
import { Avatar } from './Avatar';
import { numberToVietnameseText } from '../../utils/numberToText';
import { useAuth } from '../../contexts/AuthContext';
import { useTenantConfig } from '../../contexts/TenantConfigContext';
import { useTypedSetting } from '../../contexts/SettingsBootstrapContext';
import { compressToWebP } from '../../utils/imageCompress';
import { VietnameseDateInput } from './VietnameseDateInput';
import { ensureArray, extractArray } from '../../utils/safeArray';
import { getLocalDateStr } from '../../utils/dateUtils';
import { isViewer as checkIsViewer } from '../../utils/roleUtils';
import { pushOverlay } from '../../utils/overlayStack';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialEntity?: { type: 'contact' | 'company' | 'deal'; id: number; name: string };
  onSuccess?: () => void;
}

const CATEGORIES = [
  { id: 'Vận Chuyển', label: 'Vận Chuyển', icon: Car, color: '#334155' },
  { id: 'Ăn uống', label: 'Ăn uống', icon: UtensilsCrossed, color: '#475569' },
  { id: 'Vận hành', label: 'Vận hành', icon: Settings, color: '#BD1D2D' },
  { id: 'Marketing', label: 'Marketing', icon: Briefcase, color: '#64748B' },
  { id: 'Văn phòng phẩm', label: 'Văn phòng phẩm', icon: Wrench, color: '#0F172A' },
  { id: 'Nhân sự', label: 'Nhân sự', icon: User, color: '#334155' },
  { id: 'Quà tặng', label: 'Quà tặng', icon: Gift, color: '#BD1D2D' },
  { id: 'Khác', label: 'Khác', icon: FileText, color: '#64748B' },
];

const isSafeMediaUrl = (url: string) => {
  const s = String(url || '').trim();
  if (!s) return false;
  return /^(https?:\/\/|\/|uploads\/)/i.test(s);
};

export const CreateExpenseModal: React.FC<Props> = ({ isOpen, onClose, initialEntity, onSuccess }) => {
  const addToast = useUIStore((s) => s.addToast);
  const { user: currentUser } = useAuth();
  const { hasPermission } = useTenantConfig();
  const overlayUi = useTypedSetting<{ z_backdrop?: number; z_drawer?: number; z_modal?: number; z_modal_nested?: number; motion_ms?: number }>('ui.overlay_zindex_and_motion_ms', {
    z_backdrop: 2147483620,
    z_drawer: 2147483625,
    z_modal: 2147483640,
    z_modal_nested: 2147483646,
    motion_ms: 220,
  });
  const uploadPolicy = useTypedSetting<{ max_mb?: number; forbidden_exts?: string[] }>('core.upload_security_policy', {
    max_mb: 50,
    forbidden_exts: ['php', 'phtml', 'php3', 'php4', 'php5', 'phar', 'exe', 'bat', 'cmd', 'sh', 'js', 'mjs', 'cjs', 'html', 'htm', 'svg', 'asp', 'aspx', 'jsp', 'py', 'rb', 'pl', 'cgi', 'htaccess'],
  });
  const expenseCatConfig = useTypedSetting<{ categories?: Array<{ id?: string; label: string; color?: string }> }>('finance.expense_categories_and_filters', {});

  const resolvedCategories = useMemo(() => {
    const iconById = new Map(CATEGORIES.map(c => [c.id, c]));
    const custom = ensureArray<{ id?: string; label: string; color?: string }>(expenseCatConfig?.categories);
    if (custom.length === 0) return CATEGORIES;
    return custom
      .filter(c => c && (c.id || c.label))
      .map((c, idx) => {
        const key = String(c.id || c.label);
        const def = iconById.get(key) || CATEGORIES[idx % CATEGORIES.length];
        return {
          id: key,
          label: String(c.label || key),
          icon: def.icon,
          color: def.color,
        };
      });
  }, [expenseCatConfig]);

  const isViewer = checkIsViewer(currentUser) || !hasPermission('expenses', 'write');
  const modalZIndex = Number(overlayUi.z_modal_nested || 2147483646);
  const motionSec = Math.max(0.15, Math.min(0.4, Number(overlayUi.motion_ms || 220) / 1000));
  const maxUploadMb = Math.max(1, Number(uploadPolicy.max_mb || 50));

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 992px)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 992px)');
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    date: getLocalDateStr(),
    category: 'Ăn uống',
    notes: '',
    beneficiary: '', // free text or selected supplier
    has_vat_invoice: false,
    is_vat_inclusive: false,
    vat_amount: '',
    image_url: '',
  });
  const [loading, setLoading] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const submitInFlightRef = useRef(false);
  const uploadInFlightRef = useRef(false);
  const submitAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const unregister = pushOverlay('create-expense-modal', () => {
      if (!submitInFlightRef.current && !loading) onClose();
    }, 20);
    return unregister;
  }, [isOpen, loading, onClose]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    if (!file) return;
    if (uploadInFlightRef.current || uploadingImg) {
      inputEl.value = '';
      return;
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || '' : '';
    const forbiddenExts = ensureArray<string>(uploadPolicy.forbidden_exts).map(x => String(x).toLowerCase());
    if (ext === 'svg' || forbiddenExts.includes(ext) || file.type === 'image/svg+xml') {
      addToast('Định dạng tệp không được phép tải lên vì lý do bảo mật.', 'error');
      inputEl.value = '';
      return;
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      addToast(`Tệp đính kèm vượt quá giới hạn ${maxUploadMb}MB.`, 'error');
      inputEl.value = '';
      return;
    }

    uploadInFlightRef.current = true;
    setUploadingImg(true);
    try {
      let fileToUpload: File = file;
      if (file.type.startsWith('image/') && !file.type.includes('svg')) {
        try {
          fileToUpload = await compressToWebP(file);
        } catch {
          fileToUpload = file;
        }
      }
      const uploadData = new FormData();
      uploadData.append('file', fileToUpload);
      if (formData.image_url) {
        uploadData.append('previous_url', formData.image_url);
      }
      const res = await api.post('/upload', uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data && res.data.success && res.data.data?.url) {
        setFormData(prev => ({ ...prev, image_url: res.data.data.url }));
        addToast('Tải lên tệp đính kèm thành công!', 'success');
      } else {
        addToast('Tải tệp thất bại', 'error');
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || ('Lỗi khi tải tệp: ' + (err?.message || '')), 'error');
    } finally {
      uploadInFlightRef.current = false;
      setUploadingImg(false);
      inputEl.value = '';
    }
  };

  // Entities selection
  const [selectedContacts, setSelectedContacts] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  
  // Beneficiary (supplier) search
  const [beneficiarySearch, setBeneficiarySearch] = useState('');
  const [showBeneficiaryResults, setShowBeneficiaryResults] = useState(false);
  const beneficiaryRef = useRef<HTMLDivElement>(null);

  // Contact search
  const [contactSearch, setContactSearch] = useState('');
  const [showContactResults, setShowContactResults] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      submitAbortRef.current?.abort();
      return;
    }

    const controller = new AbortController();
    setFormData({
      title: '',
      amount: '',
      date: getLocalDateStr(),
      category: 'Ăn uống',
      notes: '',
      beneficiary: '',
      has_vat_invoice: false,
      is_vat_inclusive: false,
      vat_amount: '',
      image_url: '',
    });
    setBeneficiarySearch('');
    setContactSearch('');
    if (initialEntity && initialEntity.type === 'contact') {
      setSelectedContacts([{ id: initialEntity.id, name: initialEntity.name }]);
    } else {
      setSelectedContacts([]);
    }

    api.get('/contacts', { signal: controller.signal }).then(res => {
      setContacts(extractArray(res?.data));
    }).catch((err: any) => {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        setContacts([]);
      }
    });

    api.get('/suppliers', { signal: controller.signal }).then(res => {
      setSuppliers(extractArray(res?.data));
    }).catch((err: any) => {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        setSuppliers([]);
      }
    });

    return () => {
      controller.abort();
      submitAbortRef.current?.abort();
    };
  }, [isOpen, initialEntity]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (beneficiaryRef.current && !beneficiaryRef.current.contains(e.target as Node)) {
        setShowBeneficiaryResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredSuppliers = useMemo(() => {
    const safeSuppliers = ensureArray<any>(suppliers);
    const q = beneficiarySearch.toLowerCase();
    if (!q) return safeSuppliers.slice(0, 8);
    return safeSuppliers.filter(s => 
      (s.name || s.company_name || '').toLowerCase().includes(q) || 
      (s.phone || '').includes(q)
    ).slice(0, 8);
  }, [suppliers, beneficiarySearch]);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return [];
    const safeContacts = ensureArray<any>(contacts);
    const safeSelected = ensureArray<any>(selectedContacts);
    const q = contactSearch.toLowerCase();
    return safeContacts
      .filter(c => !safeSelected.find(sc => sc.id === c.id))
      .filter(c => `${c.full_name || ''} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(q))
      .slice(0, 6);
  }, [contacts, contactSearch, selectedContacts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitInFlightRef.current || loading || isViewer) return;

    const amountNum = parseFloat(String(formData.amount).replace(/,/g, ''));
    if (!formData.title.trim() || !Number.isFinite(amountNum) || amountNum <= 0) {
      addToast('Vui lòng nhập nội dung chi và số tiền lớn hơn 0', 'error');
      return;
    }

    const vatNum = formData.has_vat_invoice ? parseFloat(String(formData.vat_amount || 0).replace(/,/g, '')) : 0;
    if (!Number.isFinite(vatNum) || vatNum < 0) {
      addToast('Số tiền VAT không hợp lệ', 'error');
      return;
    }

    submitInFlightRef.current = true;
    setLoading(true);
    submitAbortRef.current?.abort();
    const controller = new AbortController();
    submitAbortRef.current = controller;

    try {
      const safeSelected = ensureArray<any>(selectedContacts);
      let entities: any[] = [];
      if (safeSelected.length > 0) {
        const splitAmount = Math.round((amountNum / safeSelected.length) * 100) / 100;
        entities = safeSelected.map(c => ({
          entity_type: 'contact',
          entity_id: c.id,
          amount: splitAmount
        }));
      } else if (initialEntity) {
        entities = [{
          entity_type: initialEntity.type,
          entity_id: initialEntity.id,
          amount: amountNum
        }];
      }

      await api.post('/expenses', {
        title: formData.title.trim(),
        amount: amountNum,
        date: formData.date || getLocalDateStr(),
        category: formData.category,
        notes: formData.notes,
        beneficiary: formData.beneficiary || beneficiarySearch,
        vendor_name: formData.beneficiary || beneficiarySearch,
        has_vat_invoice: formData.has_vat_invoice ? 1 : 0,
        is_vat_inclusive: formData.is_vat_inclusive ? 1 : 0,
        vat_amount: vatNum,
        image_url: formData.image_url && isSafeMediaUrl(formData.image_url) ? formData.image_url : null,
        entities,
      }, { signal: controller.signal });

      addToast('Đã tạo chi phí thành công', 'success');
      if (onSuccess) onSuccess();
      onClose();
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        addToast(err?.response?.data?.message || 'Lỗi khi tạo chi phí', 'error');
      }
    } finally {
      submitInFlightRef.current = false;
      setLoading(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
      <motion.div 
        className="overlay-backdrop" 
        style={{ zIndex: modalZIndex, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={() => { if (!loading) onClose(); }}
      >
        <motion.div
          initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 16 }}
          animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] }}
          className="modal-sheet"
          style={{ width: '100%', maxWidth: isMobile ? '100%' : '880px' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: 44, height: 44, borderRadius: '10px',
                background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <DollarSign size={20} strokeWidth={2} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A' }}>Nhập Chi phí Mới</h3>
                <p style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>Ghi nhận và theo dõi chi tiêu của nhóm</p>
              </div>
            </div>
            <button type="button" className="btn-icon sm" onClick={() => { if (!loading) onClose(); }}><X size={18} /></button>
          </div>

          {/* Body */}
          <div className="modal-body" style={{ gap: '1.25rem', padding: isMobile ? '1rem' : '1.5rem' }}>
            <fieldset disabled={isViewer} style={{ border: 'none', padding: 0, margin: 0, width: '100%' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1fr',
                gap: '1.5rem',
                width: '100%'
              }}>
                {/* Left Column: Expense Main details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Title */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Nội dung chi <span style={{ color: '#BD1D2D' }}>*</span></label>
                    <input
                      className="form-input"
                      placeholder="VD: Thuê văn phòng tháng 6, Mua nguyên liệu..."
                      value={formData.title}
                      onChange={e => setFormData({ ...formData, title: e.target.value })}
                      autoFocus
                    />
                  </div>

                  {/* Amount + Date */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Số tiền (VNĐ) <span style={{ color: '#BD1D2D' }}>*</span></label>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '0 1rem', height: '44px',
                        border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                        background: 'var(--color-surface)',
                      }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>₫</span>
                        <input
                          type="text"
                          style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.9375rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-text)' }}
                          placeholder="0"
                          value={formData.amount ? Number(formData.amount).toLocaleString('en-US') : ''}
                          onChange={e => {
                            const rawDigits = e.target.value.replace(/\D/g, '');
                            setFormData({ ...formData, amount: rawDigits });
                          }}
                        />
                      </div>
                      {formData.amount && Number(formData.amount) > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                          style={{ fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 600, marginTop: '8px' }}
                        >
                          Bằng chữ: {numberToVietnameseText(formData.amount)}
                        </motion.div>
                      )}
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">Ngày chi</label>
                      <VietnameseDateInput
                        value={formData.date}
                        onChange={val => setFormData({ ...formData, date: val })}
                        inputStyle={{ height: '44px', borderRadius: 'var(--radius-lg)' }}
                      />
                    </div>
                  </div>

                  {/* Category Pills */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Danh mục chi phí</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                      {ensureArray(resolvedCategories).map(cat => {
                        const Icon = cat.icon;
                        const isActive = formData.category === cat.id;
                        return (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => setFormData({ ...formData, category: cat.id })}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '6px',
                              padding: '5px 12px', borderRadius: '8px', cursor: 'pointer',
                              fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.18s',
                              border: `1px solid ${isActive ? '#BD1D2D' : '#E2E8F0'}`,
                              background: isActive ? 'rgba(189, 29, 45, 0.08)' : '#FFFFFF',
                              color: isActive ? '#BD1D2D' : '#475569',
                            }}
                          >
                            <Icon size={12} />
                            {cat.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <StickyNote size={14} style={{ color: 'var(--color-text-muted)' }} />
                      Ghi chú thêm
                    </label>
                    <textarea
                      className="form-textarea"
                      style={{ minHeight: '80px', resize: 'vertical' }}
                      placeholder="Mô tả chi tiết, mã hóa đơn, lý do chi..."
                      value={formData.notes}
                      onChange={e => setFormData({ ...formData, notes: e.target.value })}
                    />
                  </div>
                </div>

                {/* Right Column: Beneficiary & Financials */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Beneficiary - Smart search/type */}
                  <div className="form-group" style={{ position: 'relative', margin: 0 }} ref={beneficiaryRef}>
                    <label className="form-label">Đơn vị thụ hưởng <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>(Thanh toán cho ai?)</span></label>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '0 1rem', height: '44px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-lg)',
                      background: 'var(--color-surface)',
                      transition: 'border-color 0.2s, box-shadow 0.2s',
                    }}
                      onFocus={() => setShowBeneficiaryResults(true)}
                      tabIndex={-1}
                    >
                      <input
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.875rem', color: 'var(--color-text)' }}
                        placeholder="Tìm nhà cung cấp hoặc nhập tự do..."
                        value={beneficiarySearch || formData.beneficiary}
                        onChange={e => {
                          setBeneficiarySearch(e.target.value);
                          setFormData({ ...formData, beneficiary: e.target.value });
                          setShowBeneficiaryResults(true);
                        }}
                        onFocus={() => setShowBeneficiaryResults(true)}
                      />
                      {(formData.beneficiary || beneficiarySearch) && (
                        <button type="button" onClick={() => { setBeneficiarySearch(''); setFormData({ ...formData, beneficiary: '' }); }} style={{ color: 'var(--color-text-muted)', display: 'flex', border: 'none', background: 'none' }}>
                          <X size={14} />
                        </button>
                      )}
                      <Building2 size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                      <ChevronDown size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                    </div>

                    <AnimatePresence>
                      {showBeneficiaryResults && filteredSuppliers.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          style={{
                            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                            background: 'var(--color-surface)', borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 20px 40px -8px rgba(0,0,0,0.12)',
                            zIndex: 2147483645, overflow: 'hidden',
                          }}
                        >
                          <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border-light)' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)' }}>
                              Nhà cung cấp trong hệ thống
                            </span>
                          </div>
                          {ensureArray(filteredSuppliers).map(s => (
                            <div
                              key={s.id}
                              onClick={() => {
                                const name = s.name || s.company_name || '';
                                setFormData({ ...formData, beneficiary: name });
                                setBeneficiarySearch(name);
                                setShowBeneficiaryResults(false);
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '10px 16px', cursor: 'pointer', transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div style={{
                                width: 34, height: 34, borderRadius: '10px',
                                background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                fontSize: '0.8rem', fontWeight: 800,
                              }}>
                                {(s.name || s.company_name || '?')[0]}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text)' }}>{s.name || s.company_name}</p>
                                {s.phone && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.phone}</p>}
                              </div>
                              {(formData.beneficiary === (s.name || s.company_name)) && (
                                <Check size={16} style={{ color: '#BD1D2D' }} />
                              )}
                            </div>
                          ))}
                          {beneficiarySearch && !filteredSuppliers.find(s => (s.name || s.company_name) === beneficiarySearch) && (
                            <div
                              onClick={() => { setFormData({ ...formData, beneficiary: beneficiarySearch }); setShowBeneficiaryResults(false); }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px', cursor: 'pointer',
                                borderTop: '1px solid var(--color-border-light)',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <div style={{ fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 700 }}>
                                + Dùng "{beneficiarySearch}" (nhập tự do)
                              </div>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Apply to Contact (Bill Split) */}
                  <div className="form-group" style={{ position: 'relative', margin: 0 }}>
                    <label className="form-label">Áp dụng cho khách hàng <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>(Chia đều tiền bill)</span></label>
                    
                    {ensureArray(selectedContacts).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                        {ensureArray(selectedContacts).map(c => (
                          <span key={c.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D',
                            padding: '4px 10px', borderRadius: '8px', fontSize: '0.8125rem', fontWeight: 700,
                            border: '1px solid rgba(189, 29, 45, 0.2)',
                          }}>
                            <Avatar name={c.name} size={18} />
                            {c.name}
                            <button type="button" onClick={() => setSelectedContacts(prev => prev.filter(x => x.id !== c.id))} style={{ display: 'flex', marginLeft: '2px', color: '#BD1D2D', border: 'none', background: 'none', cursor: 'pointer' }}>
                              <X size={13} />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '0 1rem', height: '44px',
                      border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)',
                      background: 'var(--color-surface)',
                    }}>
                      <Search size={15} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                      <input
                        style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.875rem', color: 'var(--color-text)' }}
                        placeholder="Tìm khách hàng để thêm vào bill..."
                        value={contactSearch}
                        onChange={e => { setContactSearch(e.target.value); setShowContactResults(true); }}
                        onFocus={() => setShowContactResults(true)}
                      />
                    </div>

                    <AnimatePresence>
                      {showContactResults && filteredContacts.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          style={{
                            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                            background: 'var(--color-surface)', borderRadius: '16px',
                            border: '1px solid #E2E8F0',
                            boxShadow: '0 20px 40px -8px rgba(0,0,0,0.12)',
                            zIndex: 2147483645, overflow: 'hidden',
                          }}
                        >
                          {ensureArray(filteredContacts).map(c => (
                            <div
                              key={c.id}
                              onClick={() => {
                                setSelectedContacts(prev => [...prev, {
                                  id: c.id,
                                  name: (c.full_name || '').trim(),
                                  avatar: c.avatar_url,
                                }]);
                                setContactSearch('');
                                setShowContactResults(false);
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '10px 16px', cursor: 'pointer', transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                            >
                              <Avatar name={c.full_name || ''} size={32} src={c.avatar_url} />
                              <div>
                                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>{c.full_name}</p>
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{c.phone || c.email}</p>
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* VAT & Invoice details */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--color-border-light)', paddingTop: '0.75rem', margin: 0 }}>
                    <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={formData.has_vat_invoice}
                          onChange={e => setFormData({ ...formData, has_vat_invoice: e.target.checked })}
                          style={{ accentColor: '#BD1D2D' }}
                        />
                        Xuất hóa đơn VAT (Có hóa đơn đỏ)
                      </label>
                    </div>

                    {formData.has_vat_invoice && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', overflow: 'hidden' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label className="form-label">Số tiền VAT (VNĐ)</label>
                            <input
                              type="number"
                              min={0}
                              className="form-input"
                              placeholder="VD: 50000"
                              value={formData.vat_amount}
                              onChange={e => setFormData({ ...formData, vat_amount: e.target.value })}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', height: '100%', marginTop: '1.25rem' }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={formData.is_vat_inclusive}
                                onChange={e => setFormData({ ...formData, is_vat_inclusive: e.target.checked })}
                                style={{ accentColor: '#BD1D2D' }}
                              />
                              Giá bán đã bao gồm thuế VAT
                            </label>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Receipt Image link & Upload */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Ảnh chụp hóa đơn / chứng từ đính kèm</span>
                      {formData.image_url && (
                        <button 
                          type="button" 
                          className="btn-icon-bare text-danger" 
                          onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                          style={{ fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer', padding: 0, border: 'none', background: 'none' }}
                        >
                          Xóa ảnh
                        </button>
                      )}
                    </label>
                    
                    {formData.image_url && isSafeMediaUrl(formData.image_url) ? (
                      /* Image Preview Mode */
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px', 
                        padding: '10px', 
                        border: '1px solid var(--color-border-light)', 
                        borderRadius: '10px',
                        background: 'var(--color-bg-alt)',
                        position: 'relative'
                      }}>
                        {/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(formData.image_url) ? (
                          <img 
                            src={formData.image_url.startsWith('http') ? formData.image_url : `${import.meta.env.VITE_API_URL || '/backend'}/${formData.image_url.replace(/^\//, '')}`} 
                            alt="Hóa đơn đính kèm" 
                            style={{ 
                              width: '64px', 
                              height: '64px', 
                              borderRadius: '8px', 
                              objectFit: 'cover',
                              border: '1px solid var(--color-border)'
                            }} 
                          />
                        ) : (
                          <div style={{ width: '64px', height: '64px', borderRadius: '8px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <FileText size={32} style={{ color: '#BD1D2D' }} />
                          </div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formData.image_url.split('/').pop() || 'Đã tải lên tệp đính kèm'}
                          </p>
                          <a 
                            href={formData.image_url.startsWith('http') ? formData.image_url : `${import.meta.env.VITE_API_URL || '/backend'}/${formData.image_url.replace(/^\//, '')}`}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            style={{ fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 600, textDecoration: 'underline' }}
                          >
                            Xem tệp đính kèm
                          </a>
                        </div>
                      </div>
                    ) : (
                      /* Upload Button / Drag Drop */
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Dán link file hoặc tải lên..."
                          value={formData.image_url}
                          onChange={e => setFormData({ ...formData, image_url: e.target.value })}
                          style={{ flex: 1 }}
                        />
                        <label style={{ 
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          height: '38px',
                          padding: '0 16px',
                          borderRadius: '8px',
                          border: '1px dashed var(--color-border)',
                          background: 'var(--color-surface)',
                          color: 'var(--color-text)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          cursor: uploadingImg ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s ease'
                        }}>
                          <input 
                            type="file" 
                            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv,image/png,image/jpeg,image/webp,image/gif" 
                            onChange={handleImageUpload} 
                            style={{ display: 'none' }} 
                            disabled={uploadingImg}
                          />
                          {uploadingImg ? 'Đang tải lên...' : 'Tải tệp / ảnh lên'}
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </fieldset>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn outline" onClick={() => { if (!loading) onClose(); }} disabled={loading}>Hủy</button>
            <button
              type="button"
              className="btn primary"
              onClick={handleSubmit}
              disabled={loading || isViewer}
              style={{ minWidth: '160px', background: isViewer ? 'var(--color-border)' : '#BD1D2D', color: isViewer ? 'var(--color-text-muted)' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Đang gửi phê duyệt...</span>
                </>
              ) : (isViewer ? 'Bạn không có quyền gửi chi phí' : 'Gửi phê duyệt')}
            </button>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
