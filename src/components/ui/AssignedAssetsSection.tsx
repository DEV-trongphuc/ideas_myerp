import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Package, Laptop, Key, Smartphone, Plus, Edit2, Trash2, CheckCircle2, RotateCcw, AlertTriangle, XCircle, ShieldCheck, X, Save, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../api/axios';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';
import { useUIStore } from '../../store/uiStore';
import { ensureArray, extractArray } from '../../utils/safeArray';
import { getLocalDateStr, formatDateVN } from '../../utils/dateUtils';
import { pushOverlay } from '../../utils/overlayStack';
import { EmptyCard } from './EmptyCard';

export interface AssignedAsset {
  id: string;
  name: string;
  code: string;
  category: string;
  assignedDate: string;
  condition: string;
  status: 'using' | 'returned' | 'maintenance' | 'lost';
  note?: string;
}

interface AssignedAssetsSectionProps {
  assets: AssignedAsset[];
  onChange: (newAssets: AssignedAsset[]) => void;
  readOnly?: boolean;
  userId?: number | string | null;
}

const mapServerStatus = (status: string | undefined): AssignedAsset['status'] => {
  switch (String(status || '').toLowerCase()) {
    case 'returned':
      return 'returned';
    case 'maintenance':
      return 'maintenance';
    case 'lost':
      return 'lost';
    case 'assigned':
    case 'using':
    default:
      return 'using';
  }
};

const toServerStatus = (status: AssignedAsset['status'] | undefined): string => {
  switch (status) {
    case 'returned':
      return 'returned';
    case 'maintenance':
      return 'maintenance';
    case 'lost':
      return 'lost';
    case 'using':
    default:
      return 'assigned';
  }
};

const parseServerAsset = (raw: any): AssignedAsset => {
  const rawCond = String(raw?.condition_note ?? raw?.condition ?? '').trim();
  let category = String(raw?.category || '').trim();
  let condition = rawCond;
  let note = String(raw?.note || '').trim();

  if (!category && rawCond.startsWith('[')) {
    const closeIdx = rawCond.indexOf(']');
    if (closeIdx > 1) {
      category = rawCond.slice(1, closeIdx).trim();
      condition = rawCond.slice(closeIdx + 1).trim();
    }
  }
  if (!note && condition.includes(' | Ghi chú: ')) {
    const [condPart, ...rest] = condition.split(' | Ghi chú: ');
    condition = condPart.trim();
    note = rest.join(' | Ghi chú: ').trim();
  }

  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.asset_name ?? raw?.name ?? ''),
    code: String(raw?.asset_code ?? raw?.code ?? ''),
    category: category || 'Thiết bị công nghệ',
    assignedDate: String(raw?.given_date ?? raw?.assignedDate ?? getLocalDateStr()).slice(0, 10),
    condition: condition || 'Mới 100%',
    status: mapServerStatus(raw?.status),
    note,
  };
};

const buildConditionNote = (category: string, condition: string, note: string): string => {
  const catPrefix = category ? `[${category}] ` : '';
  const condText = (condition || 'Mới 100%').trim();
  const noteSuffix = note.trim() ? ` | Ghi chú: ${note.trim()}` : '';
  return `${catPrefix}${condText}${noteSuffix}`;
};

export const AssignedAssetsSection: React.FC<AssignedAssetsSectionProps> = ({
  assets = [],
  onChange,
  readOnly = false,
  userId,
}) => {
  const { t } = useLanguage();
  const showConfirm = useUIStore((s) => s.showConfirm);
  const closeConfirm = useUIStore((s) => s.closeConfirm);
  const addToast = useUIStore((s) => s.addToast);
  const assetPrefix = useTypedSubSetting<string>('finance.document_code_prefixes', 'asset_prefix', 'TS-');
  const zModalNested = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);
  const motionMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);

  const safeAssets = ensureArray<AssignedAsset>(assets);
  const numericUserId = userId !== null && userId !== undefined && Number(userId) > 0 ? Number(userId) : null;

  const [showModal, setShowModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<AssignedAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string>('');

  const inFlightRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [formData, setFormData] = useState<Partial<AssignedAsset>>({
    name: '',
    code: '',
    category: 'Thiết bị công nghệ',
    assignedDate: getLocalDateStr(),
    condition: 'Mới 100%',
    status: 'using',
    note: '',
  });

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setValidationError('');
  }, []);

  useEffect(() => {
    if (!showModal) return;
    return pushOverlay('assigned-asset-modal', handleCloseModal, zModalNested);
  }, [showModal, handleCloseModal, zModalNested]);

  const fetchServerAssets = useCallback(async () => {
    if (!numericUserId) return;
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;
    setLoading(true);
    try {
      const res = await api.get('/assets', {
        params: { user_id: numericUserId },
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const rows = extractArray<any>(res.data, 'items', 'assets').map(parseServerAsset);
      onChangeRef.current(rows);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      addToast(err?.response?.data?.message || 'Không thể tải danh sách tài sản cấp phát', 'error');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [numericUserId, addToast]);

  useEffect(() => {
    if (!numericUserId) return;
    void fetchServerAssets();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [numericUserId, fetchServerAssets]);

  const handleOpenAddModal = () => {
    setEditingAsset(null);
    setValidationError('');
    const prefix = (assetPrefix || 'TS-').trim();
    setFormData({
      name: '',
      code: `${prefix}${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      category: 'Thiết bị công nghệ',
      assignedDate: getLocalDateStr(),
      condition: 'Mới 100%',
      status: 'using',
      note: '',
    });
    setShowModal(true);
  };

  const handleOpenEditModal = (asset: AssignedAsset) => {
    setEditingAsset(asset);
    setValidationError('');
    setFormData({ ...asset });
    setShowModal(true);
  };

  const handleDeleteAsset = (asset: AssignedAsset) => {
    showConfirm({
      title: t('Xóa tài sản cấp phát'),
      message: t('Bạn có chắc chắn muốn xóa mềm tài sản này khỏi danh sách cấp phát không?'),
      confirmText: t('Xóa tài sản'),
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          const isPersistedNumeric = numericUserId && /^\d+$/.test(String(asset.id));
          if (isPersistedNumeric) {
            if (asset.status === 'using') {
              await api.put(`/assets/${asset.id}`, {
                status: 'returned',
                returned_date: getLocalDateStr(),
              });
            }
            await api.delete(`/assets/${asset.id}`);
            addToast('Đã xóa tài sản khỏi danh sách cấp phát', 'success');
            await fetchServerAssets();
          } else {
            const updated = safeAssets.filter(a => a.id !== asset.id);
            onChange(updated);
          }
        } catch (err: any) {
          addToast(err?.response?.data?.message || 'Không thể xóa tài sản cấp phát', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      },
    });
  };

  const handleSaveAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = (formData.name || '').trim();
    const trimmedCode = (formData.code || '').trim();
    if (!trimmedName || !trimmedCode) {
      const msg = 'Vui lòng nhập đầy đủ Tên tài sản và Mã tài sản';
      setValidationError(msg);
      addToast(msg, 'warning');
      return;
    }

    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSaving(true);
    setValidationError('');

    const normalizedAsset: Omit<AssignedAsset, 'id'> = {
      name: trimmedName,
      code: trimmedCode,
      category: formData.category || 'Thiết bị công nghệ',
      assignedDate: formData.assignedDate || getLocalDateStr(),
      condition: (formData.condition || 'Mới 100%').trim(),
      status: formData.status || 'using',
      note: (formData.note || '').trim(),
    };

    try {
      if (numericUserId) {
        const payload = {
          user_id: numericUserId,
          asset_name: normalizedAsset.name,
          name: normalizedAsset.name,
          asset_code: normalizedAsset.code,
          code: normalizedAsset.code,
          given_date: normalizedAsset.assignedDate,
          returned_date: normalizedAsset.status === 'returned' ? getLocalDateStr() : null,
          condition_note: buildConditionNote(normalizedAsset.category, normalizedAsset.condition, normalizedAsset.note || ''),
          status: toServerStatus(normalizedAsset.status),
        };

        if (editingAsset && /^\d+$/.test(String(editingAsset.id))) {
          await api.put(`/assets/${editingAsset.id}`, payload);
          addToast('Đã cập nhật thông tin tài sản', 'success');
        } else {
          await api.post('/assets', payload);
          addToast('Đã cấp phát tài sản mới', 'success');
        }
        setShowModal(false);
        await fetchServerAssets();
      } else {
        if (editingAsset) {
          const updated = safeAssets.map(a =>
            a.id === editingAsset.id ? { ...normalizedAsset, id: editingAsset.id } : a
          );
          onChange(updated);
        } else {
          const newAsset: AssignedAsset = {
            ...normalizedAsset,
            id: `asset_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          };
          onChange([...safeAssets, newAsset]);
        }
        setShowModal(false);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'Không thể lưu thông tin tài sản';
      setValidationError(msg);
      addToast(msg, 'error');
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  };

  const getStatusBadge = (status: AssignedAsset['status']) => {
    switch (status) {
      case 'using':
        return { label: 'Đang sử dụng', bg: 'rgba(15, 23, 42, 0.06)', color: '#0F172A', icon: CheckCircle2 };
      case 'returned':
        return { label: 'Đã thu hồi', bg: '#f1f5f9', color: '#64748b', icon: RotateCcw };
      case 'maintenance':
        return { label: 'Đang bảo trì', bg: 'rgba(198, 51, 61, 0.08)', color: '#C6333D', icon: AlertTriangle };
      case 'lost':
        return { label: 'Báo mất', bg: 'rgba(189, 29, 45, 0.12)', color: '#BD1D2D', icon: XCircle };
      default:
        return { label: 'Đang sử dụng', bg: 'rgba(15, 23, 42, 0.06)', color: '#0F172A', icon: CheckCircle2 };
    }
  };

  const getCategoryIcon = (cat: string) => {
    if (cat?.includes('Thẻ') || cat?.includes('Phương tiện') || cat?.includes('Xe')) return Key;
    if (cat?.includes('SIM') || cat?.includes('Thoại') || cat?.includes('Điện thoại')) return Smartphone;
    return Laptop;
  };

  return (
    <div style={{
      background: '#FFFFFF',
      borderRadius: '16px',
      border: '1px solid #E2E8F0',
      boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
      overflow: 'hidden',
      marginTop: '1rem'
    }}>
      {/* Section Header */}
      <div style={{
        padding: '1rem 1.25rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #E2E8F0',
        backgroundColor: '#F8FAFC'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '8px',
            background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Package size={16} strokeWidth={1.75} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', letterSpacing: '0.02em', fontVariantNumeric: 'tabular-nums' }}>
              TÀI SẢN ĐƯỢC CẤP PHÁT ({safeAssets.length})
            </h4>
            <p style={{ margin: '2px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
              Danh sách thiết bị & tài sản công ty bàn giao cho nhân viên quản lý
            </p>
          </div>
        </div>

        {!readOnly && (
          <button
            type="button"
            className="btn primary sm"
            onClick={handleOpenAddModal}
            style={{
              borderRadius: '8px',
              fontSize: '0.75rem',
              padding: '6px 12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontWeight: 600,
              background: '#BD1D2D',
              borderColor: '#BD1D2D',
              color: '#ffffff',
            }}
          >
            <Plus size={14} />
            <span>Thêm tài sản</span>
          </button>
        )}
      </div>

      {/* Assets Body */}
      <div style={{ padding: '1.25rem' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '2rem', color: '#64748B', fontSize: '0.82rem' }}>
            <Loader2 size={16} className="spin" />
            <span>Đang tải dữ liệu tài sản...</span>
          </div>
        ) : safeAssets.length === 0 ? (
          <EmptyCard
            icon={<ShieldCheck size={24} strokeWidth={1.75} />}
            title="Chưa có tài sản nào được cấp phát"
            description={
              readOnly
                ? 'Hiện tại chưa có thiết bị hay tài sản công ty nào ghi nhận bàn giao cho bạn.'
                : 'Quản lý có thể thêm thiết bị (Laptop, SIM, Xe, Thẻ từ...) cấp phát cho nhân sự này.'
            }
            actionText={!readOnly ? '+ Cấp phát tài sản đầu tiên' : undefined}
            onAction={!readOnly ? handleOpenAddModal : undefined}
          />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '1rem'
          }}>
            {safeAssets.map((asset) => {
              const badge = getStatusBadge(asset.status);
              const BadgeIcon = badge.icon;
              const CatIcon = getCategoryIcon(asset.category);

              return (
                <div
                  key={asset.id}
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '14px',
                    padding: '16px',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '12px',
                    transition: 'border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1)'
                  }}
                >
                  {/* Top: Icon + Name + Status */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '8px',
                        background: 'rgba(15, 23, 42, 0.06)', color: '#334155',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <CatIcon size={18} strokeWidth={1.75} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <h5 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {asset.name}
                        </h5>
                        <span style={{ fontSize: '0.72rem', color: '#BD1D2D', fontWeight: 600, fontFamily: 'monospace' }}>
                          {asset.code}
                        </span>
                      </div>
                    </div>

                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '4px',
                      padding: '4px 8px', borderRadius: '6px',
                      fontSize: '0.68rem', fontWeight: 600,
                      color: badge.color, backgroundColor: badge.bg,
                      flexShrink: 0
                    }}>
                      <BadgeIcon size={11} strokeWidth={1.75} />
                      <span>{badge.label}</span>
                    </div>
                  </div>

                  {/* Mid: Info Table */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                    padding: '10px 12px', borderRadius: '10px',
                    background: '#F8FAFC',
                    border: '1px solid #F1F5F9',
                    fontSize: '0.72rem'
                  }}>
                    <div>
                      <span style={{ color: '#64748B' }}>Danh mục: </span>
                      <strong style={{ color: '#0F172A' }}>{asset.category}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748B' }}>Ngày giao: </span>
                      <strong style={{ color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDateVN(asset.assignedDate) || asset.assignedDate || '—'}
                      </strong>
                    </div>
                    <div style={{ gridColumn: 'span 2' }}>
                      <span style={{ color: '#64748B' }}>Tình trạng: </span>
                      <strong style={{ color: '#0F172A' }}>{asset.condition}</strong>
                    </div>
                    {asset.note && (
                      <div style={{ gridColumn: 'span 2', color: '#64748B', borderTop: '1px solid #E2E8F0', paddingTop: '6px', marginTop: '2px' }}>
                        {asset.note}
                      </div>
                    )}
                  </div>

                  {/* Bottom: Manager Actions */}
                  {!readOnly && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', paddingTop: '4px' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(asset)}
                        style={{
                          border: 'none', background: 'transparent',
                          color: '#64748B', cursor: 'pointer',
                          padding: '5px 7px', borderRadius: '6px'
                        }}
                        className="hover-bg-muted"
                        title="Chỉnh sửa tài sản"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAsset(asset)}
                        style={{
                          border: 'none', background: 'transparent',
                          color: '#BD1D2D', cursor: 'pointer',
                          padding: '5px 7px', borderRadius: '6px'
                        }}
                        className="hover-bg-muted"
                        title="Xóa cấp phát"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ADD / EDIT ASSET MODAL (Portaled & synchronized 220ms transition) */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {showModal && (
            <motion.div
              key="assigned-asset-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(3px)',
                zIndex: zModalNested,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
              }}
              onClick={handleCloseModal}
            >
              <motion.div
                key="assigned-asset-panel"
                style={{
                  width: '100%',
                  maxWidth: '520px',
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)',
                  border: '1px solid #E2E8F0',
                  overflow: 'hidden',
                }}
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                onClick={e => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{
                  padding: '1.15rem 1.5rem',
                  borderBottom: '1px solid #E2E8F0',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '8px',
                      background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Package size={17} strokeWidth={1.75} />
                    </div>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                      {editingAsset ? 'Cập nhật thông tin cấp phát' : 'Khai báo cấp phát tài sản mới'}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: '4px' }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSaveAsset} style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {validationError && (
                    <div style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(189, 29, 45, 0.08)',
                      color: '#BD1D2D',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                    }}>
                      {validationError}
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Tên tài sản / Thiết bị *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="ví dụ: Laptop MacBook Pro M2 16 inch"
                      value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      required
                      autoFocus
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Mã tài sản / Serial *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={`${assetPrefix || 'TS-'}${new Date().getFullYear()}-001 hoặc S/N...`}
                        value={formData.code || ''}
                        onChange={e => setFormData({ ...formData, code: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Danh mục tài sản</label>
                      <select
                        className="form-input"
                        value={formData.category || 'Thiết bị công nghệ'}
                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                      >
                        <option value="Thiết bị công nghệ">Thiết bị công nghệ (Laptop, PC, Màn hình)</option>
                        <option value="SIM & Điện thoại">SIM & Điện thoại hotline</option>
                        <option value="Phương tiện & Thẻ">Phương tiện & Thẻ từ ra vào</option>
                        <option value="Văn phòng phẩm & Đồng phục">Đồng phục & Thẻ đeo</option>
                        <option value="Khác">Tài sản khác</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Ngày cấp phát</label>
                      <input
                        type="date"
                        className="form-input"
                        value={formData.assignedDate || ''}
                        onChange={e => setFormData({ ...formData, assignedDate: e.target.value })}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" style={{ fontWeight: 600 }}>Tình trạng khi bàn giao</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="ví dụ: Mới 100%, Tốt 95%..."
                        value={formData.condition || ''}
                        onChange={e => setFormData({ ...formData, condition: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Trạng thái cấp phát hiện tại</label>
                    <select
                      className="form-input"
                      value={formData.status || 'using'}
                      onChange={e => setFormData({ ...formData, status: e.target.value as AssignedAsset['status'] })}
                    >
                      <option value="using">Đang sử dụng (Đang lưu giữ)</option>
                      <option value="returned">Đã thu hồi (Đã trả lại công ty)</option>
                      <option value="maintenance">Đang bảo trì (Sửa chữa)</option>
                      <option value="lost">Báo mất (Thất lạc / Làm mất)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontWeight: 600 }}>Ghi chú phụ kiện đi kèm</label>
                    <textarea
                      className="form-input"
                      rows={2}
                      placeholder="ví dụ: Kèm sạc 140W, chuột không dây, túi chống sốc..."
                      value={formData.note || ''}
                      onChange={e => setFormData({ ...formData, note: e.target.value })}
                      style={{ resize: 'none' }}
                    />
                  </div>

                  {/* Footer Buttons */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={handleCloseModal}
                      disabled={saving}
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="btn primary sm"
                      disabled={saving}
                      style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} strokeWidth={1.75} />}
                      <span>{saving ? 'Đang lưu...' : 'Lưu thông tin'}</span>
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
