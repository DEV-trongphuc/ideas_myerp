import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Search, Trash2, Package, Plus, X, 
  User, Loader2, FileType, ChevronDown, 
  Percent, Calculator, ShoppingCart
} from 'lucide-react';
import api from '../../api/axios';
import { useUIStore } from '../../store/uiStore';
import { numberToText } from '../../utils/numberToText';
import { useAuth } from '../../contexts/AuthContext';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';
import { isViewer as checkIsViewer } from '../../utils/roleUtils';
import { getLocalDateStr } from '../../utils/dateUtils';
import { VietnameseDateInput } from './VietnameseDateInput';
import { Avatar } from './Avatar';
import { pushOverlay } from '../../utils/overlayStack';
import { ensureArray, extractArray } from '../../utils/safeArray';

interface Product {
  id: number;
  name: string;
  price: number;
  sku?: string;
  description?: string;
}

interface Contact {
  id: number;
  full_name?: string;
  phone?: string;
  email?: string;
  company_name?: string;
  avatar_url?: string;
}

interface QuoteItem {
  product_id?: number;
  name: string;
  description?: string;
  quantity: number;
  unit_price: number;
  discount: number; // percent (0-100)
  discount_type?: 'percent';
  subtotal: number;
}

interface QuoteEditorProps {
  isOpen: boolean;
  onClose: () => void;
  quote?: any; // If editing
  onSuccess: () => void;
  initialContact?: Contact | null;
  isViewer?: boolean;
  onEdit?: () => void;
  zIndex?: number;
}

export const QuoteEditorModal: React.FC<QuoteEditorProps> = ({ 
  isOpen, onClose, quote, onSuccess, initialContact, isViewer: isViewerProp, onEdit, zIndex
}) => {
  const addToast = useUIStore((s) => s.addToast);
  const { user: currentUser } = useAuth();
  const vatRates = useTypedSubSetting<number[]>('finance.vat_and_cit_policy', 'vat_rates', [0, 5, 8, 10]);
  const defaultQuoteVat = useTypedSubSetting<number>('finance.vat_and_cit_policy', 'quote_default_vat', 10);
  const zModalNested = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);
  const motionMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);

  const isViewer = Boolean(isViewerProp || checkIsViewer(currentUser));
  const resolvedZIndex = zIndex || zModalNested;
  const safeVatPresets = useMemo(
    () => ensureArray<number>(vatRates, [0, 5, 8, 10]).filter((r) => Number.isFinite(Number(r)) && Number(r) >= 0),
    [vatRates]
  );

  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  const [form, setForm] = useState<{
    title: string;
    contact_id: number | null;
    deal_id: number | null;
    valid_until: string;
    status: string;
    notes: string;
    terms: string;
    discount_type: 'fixed' | 'percent';
    discount: number;
    tax_rate: number;
  }>({
    title: '',
    contact_id: null,
    deal_id: null,
    valid_until: '',
    status: 'draft',
    notes: '',
    terms: '',
    discount_type: 'fixed',
    discount: 0,
    tax_rate: defaultQuoteVat,
  });

  const [items, setItems] = useState<QuoteItem[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [searchContact, setSearchContact] = useState('');
  const [showContactResults, setShowContactResults] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(initialContact || null);
  const contactSearchRef = useRef<HTMLDivElement>(null);
  const productSearchRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      const unregister = pushOverlay('quote-editor-modal', onClose, resolvedZIndex);
      return () => unregister();
    }
  }, [isOpen, onClose, resolvedZIndex]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contactSearchRef.current && !contactSearchRef.current.contains(event.target as Node)) {
        setShowContactResults(false);
      }
      if (productSearchRef.current && !productSearchRef.current.contains(event.target as Node)) {
        setShowProductDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();

    api.get('/products', { params: { limit: 200 }, signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setProducts(extractArray(r?.data, 'items')); })
      .catch((err) => {
        if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      });

    api.get('/contacts', { params: { limit: 200 }, signal: controller.signal })
      .then(r => { if (!controller.signal.aborted) setContacts(extractArray(r?.data, 'items')); })
      .catch((err) => {
        if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      });

    if (quote) {
      const qSub = Number(quote.subtotal) || 0;
      const qDisc = Number(quote.discount) || 0;
      const qTax = Number(quote.tax) || 0;
      const base = qSub - qDisc;
      const calculatedTaxRate = quote.tax_percent !== undefined && quote.tax_percent !== null
        ? Number(quote.tax_percent)
        : (base > 0 ? Math.round((qTax / base) * 100) : defaultQuoteVat);
      const discType: 'fixed' | 'percent' = quote.discount_type === 'percent' ? 'percent' : 'fixed';
      const discVal = discType === 'percent'
        ? Number(quote.discount_percent ?? quote.discount ?? 0)
        : Number(quote.discount ?? 0);

      setForm({
        title: quote.title || '',
        contact_id: quote.contact_id || null,
        deal_id: quote.deal_id || null,
        valid_until: quote.valid_until || '',
        status: quote.status || 'draft',
        notes: quote.notes || '',
        terms: quote.terms || '',
        discount_type: discType,
        discount: Number.isFinite(discVal) ? discVal : 0,
        tax_rate: Number.isFinite(calculatedTaxRate) ? calculatedTaxRate : defaultQuoteVat,
      });

      if (quote.contact_id && quote.contact_name) {
        setSelectedContact({
          id: quote.contact_id,
          full_name: quote.contact_name,
          phone: quote.contact_phone,
          email: quote.contact_email,
          company_name: quote.company_name,
        });
      }

      api.get(`/quotes/${quote.id}`, { signal: controller.signal })
        .then(r => {
          if (controller.signal.aborted) return;
          const detail = r.data?.data ?? r.data;
          const rawItems = extractArray<any>(detail, 'items');
          setItems(rawItems.map((it: any) => {
            const qty = Math.max(0.01, Number(it.quantity) || 1);
            const up = Math.max(0, Number(it.unit_price) || 0);
            const disc = Math.min(100, Math.max(0, Number(it.discount) || 0));
            return {
              product_id: it.product_id ? Number(it.product_id) : undefined,
              name: String(it.name || ''),
              description: it.description || '',
              quantity: qty,
              unit_price: up,
              discount: disc,
              discount_type: 'percent',
              subtotal: Number.isFinite(Number(it.subtotal)) ? Number(it.subtotal) : Math.max(0, qty * up * (1 - disc / 100)),
            };
          }));
          if (detail?.discount_type === 'percent') {
            setForm(prev => ({
              ...prev,
              discount_type: 'percent',
              discount: Number(detail.discount_percent ?? detail.discount ?? prev.discount) || 0,
              tax_rate: detail.tax_percent !== undefined ? Number(detail.tax_percent) : prev.tax_rate,
            }));
          }
        })
        .catch((err) => {
          if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
          addToast(err?.response?.data?.message || 'Không thể tải chi tiết hạng mục báo giá', 'error');
        });
    } else {
      setForm({
        title: '',
        contact_id: initialContact?.id || null,
        deal_id: null,
        valid_until: getLocalDateStr(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        status: 'draft',
        notes: '',
        terms: 'Thanh toán 100% sau khi ký báo giá.',
        discount_type: 'fixed',
        discount: 0,
        tax_rate: defaultQuoteVat,
      });
      setItems([]);
      setSelectedContact(initialContact || null);
    }

    return () => controller.abort();
  }, [isOpen, quote, initialContact, defaultQuoteVat, addToast]);

  useEffect(() => {
    if (quote?.contact_id && contacts.length > 0) {
      const c = contacts.find(x => Number(x.id) === Number(quote.contact_id));
      if (c) setSelectedContact(c);
    }
  }, [quote, contacts]);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const filteredProducts = useMemo(() => {
    if (!showProductDropdown) return [];
    const prodList = ensureArray<Product>(products);
    if (!searchProduct) return prodList.slice(0, 20);
    const q = searchProduct.toLowerCase();
    return prodList.filter(p => `${p.name} ${p.sku || ''}`.toLowerCase().includes(q)).slice(0, 20);
  }, [products, searchProduct, showProductDropdown]);

  const filteredContacts = useMemo(() => {
    const contactList = ensureArray<Contact>(contacts);
    if (!searchContact) return contactList.slice(0, 8);
    const q = searchContact.toLowerCase();
    return contactList.filter(c => `${c.full_name || ''} ${c.phone || ''} ${c.email || ''}`.toLowerCase().includes(q)).slice(0, 12);
  }, [contacts, searchContact]);

  const addItem = (p: Product) => {
    const unitPrice = Math.max(0, Number(p.price) || 0);
    const newItem: QuoteItem = {
      product_id: p.id,
      name: p.name,
      description: p.description,
      quantity: 1,
      unit_price: unitPrice,
      discount: 0,
      discount_type: 'percent',
      subtotal: unitPrice,
    };
    setItems(prev => [...prev, newItem]);
    setSearchProduct('');
    setShowProductDropdown(false);
  };

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, fields: Partial<QuoteItem>) => {
    setItems(prev => {
      const newItems = [...prev];
      const item = { ...newItems[index], ...fields };
      const up = Math.max(0, Number(item.unit_price) || 0);
      const qty = Math.max(0.01, Number(item.quantity) || 1);
      const disc = Math.min(100, Math.max(0, Number(item.discount) || 0));
      item.quantity = qty;
      item.unit_price = up;
      item.discount = disc;
      item.discount_type = 'percent';
      item.subtotal = Math.max(0, up * qty * (1 - disc / 100));
      newItems[index] = item;
      return newItems;
    });
  };

  const subtotal = Math.max(0, items.reduce((sum, i) => sum + (Number(i.subtotal) || 0), 0));
  const rawDiscountInput = Math.max(0, Number(form.discount) || 0);
  const effectiveDiscount = form.discount_type === 'percent'
    ? Math.min(subtotal, Math.round((subtotal * Math.min(100, rawDiscountInput)) / 100))
    : Math.min(subtotal, rawDiscountInput);
  const taxRate = Math.min(100, Math.max(0, Number(form.tax_rate) || 0));
  const taxableAmount = Math.max(0, subtotal - effectiveDiscount);
  const taxAmount = Math.round((taxableAmount * taxRate) / 100);
  const total = Math.max(0, taxableAmount + taxAmount);

  const handleSave = async () => {
    if (inFlightRef.current || loading || isViewer) return;
    if (!form.title.trim()) return addToast('Vui lòng nhập tiêu đề báo giá', 'warning');
    if (!selectedContact) return addToast('Vui lòng chọn khách hàng', 'warning');
    if (items.length === 0) return addToast('Báo giá phải có ít nhất 1 sản phẩm', 'warning');
    if (form.discount_type === 'fixed' && rawDiscountInput > subtotal) {
      return addToast('Chiết khấu tổng đơn không được vượt quá tổng tiền hàng', 'warning');
    }
    if (form.discount_type === 'percent' && rawDiscountInput > 100) {
      return addToast('Phần trăm chiết khấu không được vượt quá 100%', 'warning');
    }
    if (items.some(it => !it.name.trim())) {
      return addToast('Vui lòng nhập đầy đủ tên cho tất cả hạng mục', 'warning');
    }

    inFlightRef.current = true;
    setLoading(true);
    const normalizedItems = items.map(it => ({
      ...it,
      discount_type: 'percent' as const,
      quantity: Math.max(0.01, Number(it.quantity) || 1),
      unit_price: Math.max(0, Number(it.unit_price) || 0),
      discount: Math.min(100, Math.max(0, Number(it.discount) || 0)),
    }));
    const payload: Record<string, any> = {
      title: form.title.trim(),
      contact_id: selectedContact.id,
      deal_id: form.deal_id ?? quote?.deal_id ?? null,
      valid_until: form.valid_until || null,
      status: form.status,
      notes: form.notes,
      terms: form.terms,
      discount_type: form.discount_type,
      discount: form.discount_type === 'percent' ? Math.min(100, rawDiscountInput) : effectiveDiscount,
      discount_amount: effectiveDiscount,
      ...(form.discount_type === 'percent' ? { discount_percent: Math.min(100, rawDiscountInput) } : {}),
      tax_percent: taxRate,
      tax: taxAmount,
      subtotal,
      total,
      items: normalizedItems,
    };

    try {
      if (quote) {
        await api.put(`/quotes/${quote.id}`, payload);
        addToast('Cập nhật báo giá thành công', 'success');
      } else {
        await api.post('/quotes', payload);
        addToast('Tạo báo giá thành công', 'success');
      }
      onSuccess();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi lưu báo giá', 'error');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  };

  const FMT = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="quote-editor-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
          className="overlay-backdrop"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            zIndex: resolvedZIndex,
            overflow: 'hidden',
            position: 'fixed',
            inset: 0,
          }}
        >
          <motion.div
            key="quote-editor-sheet"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
            className="modal-sheet"
            style={{ width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', borderRadius: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', margin: 0, background: 'var(--color-bg)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="modal-header" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
              <div className="flex items-center gap-4">
                <div style={{ background: '#BD1D2D', color: '#fff', width: 44, height: 44, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={20} strokeWidth={1.75} />
                </div>
                <div>
                  <h2 className="text-xl font-bold" style={{ color: '#0F172A' }}>{quote ? (isViewer ? 'Xem chi tiết Báo giá' : 'Chỉnh sửa Báo giá') : 'Tạo Báo giá Mới'}</h2>
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>{quote ? quote.quote_number : 'Bản nháp báo giá'}</p>
                </div>
              </div>
              <button type="button" className="btn-icon sm" onClick={onClose}><X size={20} /></button>
            </div>

            <div className="modal-body" style={{ background: 'var(--color-bg)', padding: '1.5rem 2rem 1.5rem', flex: 1, overflowY: 'auto', maxHeight: 'none' }}>
              <fieldset disabled={isViewer} style={{ border: 'none', padding: 0, margin: 0, width: '100%', display: 'contents' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.5rem', alignItems: 'stretch', minHeight: 'calc(100vh - 180px)' }}>
                
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', height: '100%' }}>
                  {/* Section 1: Basic Info */}
                  <div className="card" style={{ padding: '1.5rem', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                    <h3 style={{ fontSize: '0.73rem', fontWeight: 700, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '6px' }}><FileType size={14} /> Thông tin chung</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">Tiêu đề báo giá <span style={{ color: '#BD1D2D' }}>*</span></label>
                        <input 
                          className="form-input" 
                          style={{ fontWeight: 700 }}
                          placeholder="VD: Báo giá triển khai hệ thống quản trị..." 
                          value={form.title}
                          onChange={e => setForm({ ...form, title: e.target.value })}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div className="form-group" style={{ position: 'relative' }} ref={contactSearchRef}>
                          <label className="form-label">Khách hàng nhận <span style={{ color: '#BD1D2D' }}>*</span></label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 1rem', height: '44px', border: `1.5px solid ${selectedContact ? '#BD1D2D' : '#E2E8F0'}`, borderRadius: 'var(--radius-lg)', background: '#FFFFFF', transition: 'all 0.2s', boxShadow: selectedContact ? '0 0 0 3px rgba(189, 29, 45, 0.08)' : 'none' }}>
                            <User size={16} style={{ color: selectedContact ? '#BD1D2D' : '#64748B', flexShrink: 0 }} />
                            <input 
                              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.875rem', color: '#0F172A', fontWeight: selectedContact ? 700 : 400 }}
                              placeholder="Tìm theo tên, SĐT hoặc Email..." 
                              value={selectedContact ? selectedContact.full_name || '' : searchContact}
                              onChange={e => { setSearchContact(e.target.value); setShowContactResults(true); if (selectedContact) setSelectedContact(null); }}
                              onFocus={() => setShowContactResults(true)}
                            />
                            {(selectedContact || searchContact) && (
                              <button type="button" onClick={() => { setSelectedContact(null); setSearchContact(''); }} style={{ color: '#64748B', display: 'flex', background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={14} />
                              </button>
                            )}
                            <ChevronDown size={14} style={{ color: '#64748B', transform: showContactResults ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                          </div>

                          {showContactResults && (
                            <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 20px 40px -8px rgba(15, 23, 42, 0.14)', zIndex: 100, overflow: 'hidden' }}>
                              <div style={{ padding: '8px 14px', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>Kết quả tìm kiếm</span>
                              </div>
                              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                                {filteredContacts.length === 0 ? (
                                  <div style={{ padding: '20px', textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>Không tìm thấy khách hàng nào</div>
                                ) : (
                                  filteredContacts.map(c => (
                                    <div 
                                      key={c.id}
                                      onClick={() => { setSelectedContact(c); setShowContactResults(false); setSearchContact(''); }}
                                      style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', cursor: 'pointer', transition: 'background 0.15s' }}
                                      onMouseEnter={e => (e.currentTarget.style.background = '#F8FAFC')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                                    >
                                      <Avatar src={c.avatar_url} name={c.full_name || 'KH'} size={34} />
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#0F172A' }}>{c.full_name}</p>
                                        <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          {c.phone && <span>{c.phone}</span>}
                                          {c.phone && c.email && <span>•</span>}
                                          {c.email && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>}
                                        </p>
                                      </div>
                                      {c.company_name && (
                                        <div style={{ fontSize: '0.65rem', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px', border: '1px solid #E2E8F0', color: '#475569', fontWeight: 700 }}>
                                          {c.company_name}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="form-group">
                          <label className="form-label">Ngày hết hiệu lực</label>
                          <VietnameseDateInput
                            value={form.valid_until}
                            onChange={val => setForm({ ...form, valid_until: val })}
                            inputStyle={{ height: '44px', borderRadius: 'var(--radius-lg)' }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                    {/* Section 2: Items */}
                  <div className="card overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                    <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', background: '#FFFFFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                      <h3 style={{ fontSize: '0.73rem', fontWeight: 700, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', margin: 0 }}>
                        <Package size={14} /> Danh mục hàng hóa
                      </h3>
                      {/* Product search */}
                      <div style={{ position: 'relative', flex: 1, maxWidth: '340px' }} ref={productSearchRef}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 0.875rem', height: '40px', border: `1.5px solid ${showProductDropdown ? '#BD1D2D' : '#E2E8F0'}`, borderRadius: '12px', background: showProductDropdown ? 'rgba(189, 29, 45, 0.03)' : '#F8FAFC', transition: 'all 0.2s', boxShadow: showProductDropdown ? '0 0 0 3px rgba(189, 29, 45, 0.08)' : 'none' }}>
                          <Search size={15} style={{ color: showProductDropdown ? '#BD1D2D' : '#64748B', flexShrink: 0 }} />
                          <input
                            placeholder="Thêm sản phẩm / dịch vụ..."
                            style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: '0.8125rem', color: '#0F172A', fontWeight: 500 }}
                            value={searchProduct}
                            onChange={e => setSearchProduct(e.target.value)}
                            onFocus={() => setShowProductDropdown(true)}
                          />
                          {searchProduct && <button type="button" onClick={() => setSearchProduct('')} style={{ color: '#64748B', display: 'flex', flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer' }}><X size={13} /></button>}
                          <div style={{ flexShrink: 0, width: 1, height: 16, background: '#E2E8F0' }} />
                          <Plus size={14} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                        </div>
                        {/* Dropdown */}
                        {showProductDropdown && (
                          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 20px 40px -8px rgba(15, 23, 42, 0.16)', zIndex: 200, overflow: 'hidden' }}>
                            <div style={{ padding: '8px 12px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '6px', background: '#F8FAFC' }}>
                              <Package size={12} style={{ color: '#BD1D2D' }} />
                              <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>
                                {searchProduct ? `Kết quả tìm kiếm` : `Tất cả sản phẩm (${products.length})`}
                              </span>
                            </div>
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                              {filteredProducts.length === 0 ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '0.8rem' }}>
                                  <Package size={28} style={{ opacity: 0.3, margin: '0 auto 8px' }} />
                                  <p>Không tìm thấy sản phẩm</p>
                                </div>
                              ) : filteredProducts.map(p => {
                                const alreadyAdded = items.some(i => Number(i.product_id) === Number(p.id));
                                return (
                                  <div
                                    key={p.id}
                                    onClick={() => addItem(p)}
                                    style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', cursor: 'pointer', transition: 'background 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                  >
                                    <div style={{ width: 34, height: 34, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <Package size={16} style={{ color: '#BD1D2D' }} strokeWidth={1.75} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                                        {alreadyAdded && <span style={{ flexShrink: 0, fontSize: '0.65rem', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>Đã có</span>}
                                      </div>
                                      {p.sku && <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>SKU: {p.sku}</span>}
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{FMT(p.price)}</div>
                                      {p.description && <div style={{ fontSize: '0.65rem', color: '#64748B', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            {/* Manual add option */}
                            <div
                              style={{ padding: '10px 14px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: '#F8FAFC' }}
                              onClick={() => {
                                const manual: QuoteItem = { name: searchProduct || 'Hạng mục mới', quantity: 1, unit_price: 0, discount: 0, discount_type: 'percent', subtotal: 0 };
                                setItems(prev => [...prev, manual]);
                                setSearchProduct('');
                                setShowProductDropdown(false);
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(189, 29, 45, 0.05)')}
                              onMouseLeave={e => (e.currentTarget.style.background = '#F8FAFC')}
                            >
                              <div style={{ width: 28, height: 28, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Plus size={14} style={{ color: '#BD1D2D' }} />
                              </div>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#BD1D2D' }}>
                                {searchProduct ? `Thêm "${searchProduct}" thủ công` : 'Thêm hạng mục tùy chỉnh'}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ padding: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {items.length === 0 ? (
                          <div style={{ background: '#F8FAFC', border: '2px dashed #E2E8F0', borderRadius: '14px', padding: '3rem 2rem', textAlign: 'center', color: '#64748B' }}>
                            <div className="flex flex-col items-center gap-3">
                              <ShoppingCart size={44} strokeWidth={1.5} style={{ opacity: 0.45 }} />
                              <p className="text-sm font-bold" style={{ margin: 0, color: '#0F172A' }}>Chưa có sản phẩm nào được chọn</p>
                              <p className="text-[11px] uppercase tracking-wider" style={{ margin: 0 }}>Sử dụng thanh tìm kiếm phía trên để thêm</p>
                            </div>
                          </div>
                        ) : (
                          items.map((item, idx) => (
                            <div 
                              key={idx} 
                              style={{ 
                                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px', 
                                display: 'flex', flexDirection: 'column', gap: '12px', transition: 'border-color 0.2s', 
                                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)' 
                              }} 
                              onMouseEnter={e => e.currentTarget.style.borderColor = '#CBD5E1'} 
                              onMouseLeave={e => e.currentTarget.style.borderColor = '#E2E8F0'}
                            >
                              
                              {/* Row 1: Name & Delete */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'center' }}>
                                <div style={{ flex: 1 }}>
                                  <input 
                                    style={{ width: '100%', border: 'none', borderBottom: '1.5px solid transparent', outline: 'none', background: 'transparent', fontSize: '0.98rem', fontWeight: 700, color: '#0F172A', paddingBottom: '2px', transition: 'border-color 0.2s' }}
                                    placeholder="Nhập tên sản phẩm / dịch vụ..."
                                    value={item.name}
                                    onChange={e => updateItem(idx, { name: e.target.value })}
                                    onFocus={e => e.target.style.borderBottomColor = '#BD1D2D'}
                                    onBlur={e => e.target.style.borderBottomColor = 'transparent'}
                                  />
                                </div>
                                <button 
                                  type="button" 
                                  className="btn-icon sm" 
                                  style={{ color: '#BD1D2D', border: 'none', background: 'rgba(189, 29, 45, 0.08)', width: '32px', height: '32px', flexShrink: 0 }} 
                                  onClick={() => removeItem(idx)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              
                              {/* Row 2: Description */}
                              <div style={{ width: '100%' }}>
                                <textarea 
                                  style={{ width: '100%', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px', outline: 'none', fontSize: '0.8125rem', color: '#475569', resize: 'vertical', minHeight: '50px', background: '#F8FAFC', lineHeight: 1.5, transition: 'all 0.2s' }}
                                  placeholder="Mô tả chi tiết sản phẩm / dịch vụ (không bắt buộc)..."
                                  value={item.description || ''}
                                  onChange={e => updateItem(idx, { description: e.target.value })}
                                  onFocus={e => { e.target.style.borderColor = '#BD1D2D'; e.target.style.background = '#FFFFFF'; }}
                                  onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.background = '#F8FAFC'; }}
                                  rows={2}
                                />
                              </div>
                              
                              {/* Row 3: Pricing grid */}
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', 
                                gap: '1.25rem', 
                                alignItems: 'flex-start',
                                background: '#F8FAFC',
                                padding: '12px 16px',
                                borderRadius: '12px',
                                border: '1px solid #E2E8F0'
                              }}>
                                {/* Quantity (supports decimals) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Số lượng</label>
                                  <input 
                                    type="number" 
                                    style={{ width: '100%', height: '36px', border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '8px', outline: 'none', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#0F172A', transition: 'border 0.2s' }}
                                    value={item.quantity}
                                    min={0.01}
                                    step="any"
                                    onChange={e => {
                                      const parsed = parseFloat(e.target.value);
                                      updateItem(idx, { quantity: Number.isFinite(parsed) && parsed >= 0.01 ? parsed : 1 });
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#BD1D2D'}
                                    onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                                  />
                                </div>

                                {/* Unit Price */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', position: 'relative' }}>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Đơn giá (đ)</label>
                                  <input 
                                    type="text" 
                                    style={{ width: '100%', height: '36px', border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '8px', outline: 'none', textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#0F172A', padding: '0 12px', transition: 'border 0.2s' }}
                                    value={item.unit_price ? Number(item.unit_price).toLocaleString('en-US') : ''}
                                    onChange={e => {
                                      const rawDigits = e.target.value.replace(/\D/g, '');
                                      updateItem(idx, { unit_price: rawDigits ? Number(rawDigits) : 0 });
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#BD1D2D'}
                                    onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                                  />
                                  {item.unit_price > 0 && (
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, marginTop: '2px', whiteSpace: 'normal', wordBreak: 'break-word', lineHeight: 1.25, textAlign: 'right' }}>
                                      {numberToText(item.unit_price)}
                                    </div>
                                  )}
                                </div>

                                {/* Discount (%) */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Giảm (%)</label>
                                  <div style={{ position: 'relative' }}>
                                    <input 
                                      type="number" 
                                      style={{ width: '100%', height: '36px', border: '1px solid #CBD5E1', background: '#FFFFFF', borderRadius: '8px', outline: 'none', textAlign: 'center', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D', paddingRight: '22px', transition: 'border 0.2s' }}
                                      value={item.discount}
                                      min={0}
                                      max={100}
                                      step="any"
                                      onChange={e => {
                                        const val = parseFloat(e.target.value);
                                        updateItem(idx, { discount: Number.isFinite(val) ? Math.min(100, Math.max(0, val)) : 0 });
                                      }}
                                      onFocus={e => e.target.style.borderColor = '#BD1D2D'}
                                      onBlur={e => e.target.style.borderColor = '#CBD5E1'}
                                    />
                                    <Percent size={12} style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', color: '#BD1D2D', pointerEvents: 'none' }} />
                                  </div>
                                </div>

                                {/* Subtotal */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'right' }}>
                                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Thành tiền</label>
                                  <div style={{ height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: '1.05rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>
                                    {FMT(item.subtotal)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', flex: 1 }}>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <label className="form-label">Ghi chú nội bộ</label>
                      <textarea 
                        className="form-textarea"
                        style={{ flex: 1, minHeight: '120px', resize: 'none' }}
                        placeholder="Lời nhắn hoặc ghi chú đặc biệt..."
                        value={form.notes}
                        onChange={e => setForm({ ...form, notes: e.target.value })}
                      />
                    </div>
                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <label className="form-label">Điều khoản áp dụng</label>
                      <textarea 
                        className="form-textarea"
                        style={{ flex: 1, minHeight: '120px', resize: 'none' }}
                        value={form.terms}
                        onChange={e => setForm({ ...form, terms: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Financials - Sticky */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', position: 'sticky', top: '10px', height: 'fit-content' }}>
                  <div className="card overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                    {/* Panel header */}
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', gap: '8px', background: '#FFFFFF' }}>
                      <Calculator size={16} style={{ color: '#BD1D2D' }} />
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A' }}>Tóm tắt tài chính</span>
                    </div>

                    <div style={{ background: '#FFFFFF', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      {/* Subtotal row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8125rem', color: '#64748B' }}>Thành tiền hàng</span>
                        <span style={{ fontSize: '0.9375rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#0F172A' }}>{FMT(subtotal)}</span>
                      </div>

                      {/* Discount row with fixed / percent toggle */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.8125rem', color: '#64748B', whiteSpace: 'nowrap' }}>Giảm giá</span>
                            <div style={{ display: 'inline-flex', padding: '2px', borderRadius: '8px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px' }}>
                              {(['fixed', 'percent'] as const).map(mode => (
                                <button
                                  key={mode}
                                  type="button"
                                  onClick={() => setForm(prev => ({ ...prev, discount_type: mode, discount: 0 }))}
                                  style={{
                                    height: '24px',
                                    padding: '0 8px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    fontSize: '0.7rem',
                                    fontWeight: form.discount_type === mode ? 700 : 600,
                                    background: form.discount_type === mode ? '#ffffff' : 'transparent',
                                    color: form.discount_type === mode ? '#BD1D2D' : '#64748B',
                                    boxShadow: form.discount_type === mode ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {mode === 'fixed' ? '₫' : '%'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {form.discount_type === 'percent' ? (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="any"
                              style={{
                                width: '110px', height: '34px', padding: '0 10px', textAlign: 'right',
                                border: '1px solid #CBD5E1', borderRadius: '8px',
                                fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D',
                                background: 'rgba(189, 29, 45, 0.05)', outline: 'none',
                              }}
                              value={form.discount}
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                setForm({ ...form, discount: Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0 });
                              }}
                            />
                          ) : (
                            <input
                              type="text"
                              style={{
                                width: '110px', height: '34px', padding: '0 10px', textAlign: 'right',
                                border: '1px solid #CBD5E1', borderRadius: '8px',
                                fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D',
                                background: 'rgba(189, 29, 45, 0.05)', outline: 'none',
                              }}
                              value={form.discount ? Number(form.discount).toLocaleString('en-US') : ''}
                              onChange={e => {
                                const rawDigits = e.target.value.replace(/\D/g, '');
                                setForm({ ...form, discount: rawDigits ? Number(rawDigits) : 0 });
                              }}
                            />
                          )}
                        </div>
                        {effectiveDiscount > 0 && (
                          <div style={{ textAlign: 'right', fontSize: '0.7rem', color: '#BD1D2D', fontWeight: 600 }}>
                            -{FMT(effectiveDiscount)} ({numberToText(effectiveDiscount)})
                          </div>
                        )}
                      </div>

                      {/* Tax row with configured VAT presets */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                          <span style={{ fontSize: '0.8125rem', color: '#64748B', whiteSpace: 'nowrap' }}>Thuế VAT (%)</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            style={{
                              width: '76px', height: '34px', padding: '0 10px', textAlign: 'center',
                              border: '1px solid #CBD5E1', borderRadius: '8px',
                              fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#0F172A',
                              background: '#F8FAFC', outline: 'none',
                            }}
                            value={form.tax_rate}
                            onChange={e => {
                              const v = parseFloat(e.target.value);
                              setForm({ ...form, tax_rate: Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0 });
                            }}
                          />
                        </div>
                        {safeVatPresets.length > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', flexWrap: 'wrap' }}>
                            {safeVatPresets.map(rate => (
                              <button
                                key={rate}
                                type="button"
                                onClick={() => setForm(prev => ({ ...prev, tax_rate: Number(rate) }))}
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #E2E8F0',
                                  background: Number(form.tax_rate) === Number(rate) ? 'rgba(189, 29, 45, 0.08)' : '#F8FAFC',
                                  color: Number(form.tax_rate) === Number(rate) ? '#BD1D2D' : '#64748B',
                                  fontSize: '0.7rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {rate}%
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Tax amount */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.75rem', borderBottom: '1px dashed #E2E8F0' }}>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Tiền thuế</span>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: '#334155' }}>+{FMT(taxAmount)}</span>
                      </div>

                      {/* Total */}
                      <div style={{ background: 'rgba(189, 29, 45, 0.06)', borderRadius: '12px', padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>Tổng cộng báo giá</div>
                        <div style={{ fontSize: '1.35rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: '#BD1D2D', lineHeight: 1.1 }}>{FMT(total)}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '4px' }}>Đã bao gồm thuế & chiết khấu</div>
                        {total > 0 && (
                          <div style={{ fontSize: '0.68rem', color: '#BD1D2D', fontWeight: 600, marginTop: '8px', lineHeight: 1.4, borderTop: '1px solid rgba(189, 29, 45, 0.12)', paddingTop: '8px' }}>
                            {numberToText(total)}
                          </div>
                        )}
                      </div>

                      {/* Status toggle */}
                      <div style={{ paddingTop: '0.25rem' }}>
                        <div style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginBottom: '8px' }}>Trạng thái</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                          {[
                            { id: 'draft', label: 'Lưu Nháp' },
                            { id: 'sent',  label: 'Chờ phản hồi' },
                          ].map(s => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => setForm({ ...form, status: s.id })}
                              style={{
                                height: '36px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', transition: 'all 0.18s',
                                border: form.status === s.id ? '1.5px solid #BD1D2D' : '1.5px solid #E2E8F0',
                                background: form.status === s.id ? '#BD1D2D' : '#FFFFFF',
                                color: form.status === s.id ? '#FFFFFF' : '#64748B',
                              }}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              </fieldset>
            </div>

            <div className="modal-footer" style={{ padding: '0.75rem 2rem', background: 'var(--color-bg)', borderTop: '1px solid #E2E8F0', borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}>
               <button type="button" className="btn ghost font-bold text-muted" onClick={onClose} disabled={loading}>
                 {isViewerProp ? 'Đóng' : 'Hủy bỏ'}
               </button>
               {isViewerProp ? (
                 !checkIsViewer(currentUser) && onEdit && (
                   <button 
                     type="button"
                     className="btn primary" 
                     style={{ minWidth: '220px', background: '#BD1D2D', color: 'white' }}
                     onClick={onEdit}
                   >
                     Chỉnh sửa báo giá
                   </button>
                 )
               ) : (
                 <button 
                   type="button"
                   className="btn primary" 
                   style={{ minWidth: '220px', background: isViewer ? '#CBD5E1' : '#BD1D2D', color: isViewer ? '#475569' : 'white' }}
                   onClick={handleSave}
                   disabled={loading || isViewer}
                 >
                   {loading ? <Loader2 className="animate-spin" /> : (isViewer ? 'Bạn không có quyền chỉnh sửa' : (quote ? 'Cập nhật thay đổi' : 'Xác nhận & Lưu báo giá'))}
                 </button>
               )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
