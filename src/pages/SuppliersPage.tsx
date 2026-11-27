import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { 
  Truck, Plus, Search, Mail, Phone, MapPin, 
  Trash2, Pencil, ExternalLink, Download, User,
  Building2, X, Layers, History, FileBadge,
  BarChart3, Receipt, DollarSign, Clock, Save,
  ChevronLeft, ChevronRight, Loader2
} from 'lucide-react';
import api from '../api/axios';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { canEditPartnerOrSupplier } from '../utils/roleUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import { formatDateVN, formatDateTimeVN, getLocalDateStr } from '../utils/dateUtils';
import { pushOverlay } from '../utils/overlayStack';
import { EmptyCard } from '../components/ui/EmptyCard';
import { AddressSelect } from '../components/ui/AddressSelect';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Pagination } from '../components/ui/Pagination';
import { Avatar } from '../components/ui/Avatar';
import { CopyButton } from '../components/ui/CopyButton';
import { CardSkeleton } from '../components/ui/Skeleton';
import { ActivityModal } from '../components/ui/ActivityModal';
import styles from './EntityDrawer.module.css';

const PRESTIGE_OPTIONS = [
  { value: 'A', label: 'Hạng A (Rất uy tín)' },
  { value: 'B', label: 'Hạng B (Uy tín)' },
  { value: 'C', label: 'Hạng C (Trung bình)' }
];

const COOP_OPTIONS = [
  { value: 'active', label: 'Đang liên kết' },
  { value: 'paused', label: 'Tạm ngưng' },
  { value: 'inactive', label: 'Ngừng hợp tác' }
];

const getCoopMeta = (status?: string) => {
  switch (String(status || '').toLowerCase()) {
    case 'active':
      return { label: 'Đang liên kết', bg: 'rgba(15, 23, 42, 0.06)', color: '#0F172A' };
    case 'paused':
    case 'negotiating':
      return { label: 'Tạm ngưng', bg: '#F1F5F9', color: '#475569' };
    case 'inactive':
    case 'suspended':
      return { label: 'Ngừng hợp tác', bg: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D' };
    default:
      return { label: status || 'Đang liên kết', bg: '#F1F5F9', color: '#475569' };
  }
};

const normalizeCoopStatusForSubmit = (status?: string): 'active' | 'paused' | 'inactive' => {
  const s = String(status || 'active').toLowerCase();
  if (s === 'active') return 'active';
  if (s === 'paused' || s === 'negotiating' || s === 'suspended') return 'paused';
  if (s === 'inactive') return 'inactive';
  return 'active';
};

const SUPPLIER_TABS = [
  { id: 'info', label: 'Thông tin', icon: Building2, color: '#BD1D2D' },
  { id: 'activities', label: 'Hoạt động / Tương tác', icon: History, color: '#334155' },
  { id: 'purchase_orders', label: 'Đơn mua (PO)', icon: FileBadge, color: '#BD1D2D' },
  { id: 'stats', label: 'Thống kê', icon: BarChart3, color: '#334155' },
  { id: 'invoices_docs', label: 'Chứng từ & Chi phí NCC', icon: Receipt, color: '#334155' },
];

const FMT = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n) || 0);

const csvSafe = (val: unknown): string => {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const SuppliersPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canEdit = canEditPartnerOrSupplier(user);

  const pageSizeSetting = useTypedSubSetting<number>('finance.ui_pagination_sizes', 'suppliers', 12);
  const drawerMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);
  const zBackdrop = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_backdrop', 2147483620);
  const zDrawer = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_drawer', 2147483625);
  const pageSize = Number(pageSizeSetting) > 0 ? Number(pageSizeSetting) : 12;

  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const { addToast, showConfirm, closeConfirm } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm, closeConfirm: s.closeConfirm })));
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [filters, setFilters] = useState({ prestige_tier: '', cooperation_status: '' });
  const [projectsList, setProjectsList] = useState<any[]>([]);
  const [projSearch, setProjSearch] = useState('');
  const [showProjDropdown, setShowProjDropdown] = useState(false);

  const [activeTab, setActiveTab] = useState(() => window.innerWidth < 1024 ? '' : 'info');
  const [isVisible, setIsVisible] = useState(showModal);
  const [animateIn, setAnimateIn] = useState(showModal);
  const isFirstRender = useRef(true);

  // Data fetching for Supplier Drawer Tabs
  const [activities, setActivities] = useState<any[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [showActivityModal, setShowActivityModal] = useState(false);

  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [loadingPO, setLoadingPO] = useState(false);

  const [expenses, setExpenses] = useState<any[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);

  const suppliersAbortRef = useRef<AbortController | null>(null);
  const projectsAbortRef = useRef<AbortController | null>(null);
  const actAbortRef = useRef<AbortController | null>(null);
  const poAbortRef = useRef<AbortController | null>(null);
  const expAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const renderColoredIcon = (IconComponent: any, bgColor: string) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '28px',
      height: '28px',
      borderRadius: '8px',
      backgroundColor: bgColor,
      color: 'white',
      flexShrink: 0
    }}>
      <IconComponent size={14} />
    </div>
  );

  useEffect(() => {
    if (showModal) {
      setIsVisible(true);
      const timer = setTimeout(() => setAnimateIn(true), 12);
      return () => clearTimeout(timer);
    }
    setAnimateIn(false);
    const timer = setTimeout(() => setIsVisible(false), drawerMs);
    return () => clearTimeout(timer);
  }, [showModal, drawerMs]);

  useEffect(() => {
    if (!showModal) return;
    return pushOverlay('supplier-drawer', () => setShowModal(false), zDrawer);
  }, [showModal, zDrawer]);

  useEffect(() => {
    if (!isVisible) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isVisible]);

  useEffect(() => {
    projectsAbortRef.current?.abort();
    const controller = new AbortController();
    projectsAbortRef.current = controller;
    api.get('/projects?all=1', { signal: controller.signal })
      .then(res => {
        if (!controller.signal.aborted) setProjectsList(extractArray(res?.data));
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: '', contact_name: '', email: '', phone: '', address: '', tax_code: '', notes: '',
    contact_position: '', website: '', scale_capital: '', typical_projects: '', focused_type: '', prestige_tier: 'A', cooperation_status: 'active', bank_account: ''
  });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const fetchActivities = useCallback(async (supplierId?: number) => {
    const sId = supplierId || selectedSupplier?.id;
    if (!sId) return;
    actAbortRef.current?.abort();
    const controller = new AbortController();
    actAbortRef.current = controller;
    setActivitiesLoading(true);
    try {
      const r = await api.get('/activities', { params: { related_type: 'supplier', related_id: sId }, signal: controller.signal });
      if (!controller.signal.aborted) setActivities(extractArray(r?.data));
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setActivities([]);
    } finally {
      if (!controller.signal.aborted) setActivitiesLoading(false);
    }
  }, [selectedSupplier?.id]);

  const fetchPurchaseOrders = useCallback(async (supplierId?: number) => {
    const sId = supplierId || selectedSupplier?.id;
    if (!sId) return;
    poAbortRef.current?.abort();
    const controller = new AbortController();
    poAbortRef.current = controller;
    setLoadingPO(true);
    try {
      const r = await api.get('/purchase-orders', { params: { supplier_id: sId, limit: 100 }, signal: controller.signal });
      if (!controller.signal.aborted) setPurchaseOrders(extractArray(r?.data, 'orders', 'items'));
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setPurchaseOrders([]);
    } finally {
      if (!controller.signal.aborted) setLoadingPO(false);
    }
  }, [selectedSupplier?.id]);

  const fetchSupplierExpenses = useCallback(async (supplierId?: number) => {
    const sId = supplierId || selectedSupplier?.id;
    if (!sId) return;
    expAbortRef.current?.abort();
    const controller = new AbortController();
    expAbortRef.current = controller;
    setLoadingExpenses(true);
    try {
      const r = await api.get(`/expenses/entity/supplier/${sId}`, { signal: controller.signal });
      if (!controller.signal.aborted) setExpenses(extractArray(r?.data, 'expenses', 'items'));
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setExpenses([]);
    } finally {
      if (!controller.signal.aborted) setLoadingExpenses(false);
    }
  }, [selectedSupplier?.id]);

  // Single deduplicated drawer hydration on open
  useEffect(() => {
    if (!showModal || !selectedSupplier?.id) return;
    const sId = Number(selectedSupplier.id);
    void fetchActivities(sId);
    void fetchPurchaseOrders(sId);
    void fetchSupplierExpenses(sId);
    return () => {
      actAbortRef.current?.abort();
      poAbortRef.current?.abort();
      expAbortRef.current?.abort();
    };
  }, [showModal, selectedSupplier?.id, fetchActivities, fetchPurchaseOrders, fetchSupplierExpenses]);

  const fetchSuppliers = useCallback(async () => {
    suppliersAbortRef.current?.abort();
    const controller = new AbortController();
    suppliersAbortRef.current = controller;
    const { signal } = controller;
    setLoading(true);
    try {
      const params: any = { page, limit: pageSize, search: searchTerm };
      if (filters.prestige_tier) params.prestige_tier = filters.prestige_tier;
      if (filters.cooperation_status) params.cooperation_status = filters.cooperation_status;
      const res = await api.get('/suppliers', { params, signal });
      if (signal.aborted) return;
      const data = res.data?.data ?? res.data ?? {};
      setSuppliers(ensureArray<any>(data.items ?? data));
      setTotal(Number(data.total ?? (Array.isArray(data) ? data.length : 0)) || 0);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      addToast('Lỗi khi tải danh sách đối tác / nhà cung cấp', 'error');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, pageSize, searchTerm, filters, addToast]);

  useEffect(() => {
    void fetchSuppliers();
    return () => {
      suppliersAbortRef.current?.abort();
    };
  }, [fetchSuppliers]);

  useEffect(() => {
    setPage(1);
  }, [filters]);

  useEffect(() => {
    if (total > 0 && page > 1) {
      const maxPage = Math.ceil(total / pageSize);
      if (page > maxPage) {
        setPage(maxPage);
      }
    }
  }, [total, page, pageSize]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (page === 1) void fetchSuppliers();
      else setPage(1);
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const [isReadOnly, setIsReadOnly] = useState(false);

  const handleOpenModal = (s: any = null, readOnly: boolean = false) => {
    setActivities([]);
    setPurchaseOrders([]);
    setExpenses([]);
    setSelectedSupplier(s);
    setFormData(s ? {
      ...s,
      cooperation_status: normalizeCoopStatusForSubmit(s.cooperation_status),
    } : {
      name: '', contact_name: '', email: '', phone: '', address: '', tax_code: '', notes: '',
      contact_position: '', website: '', scale_capital: '', typical_projects: '', focused_type: '', prestige_tier: 'A', cooperation_status: 'active', bank_account: ''
    });
    setIsReadOnly(s ? (readOnly || !canEdit) : !canEdit);
    setActiveTab(isMobile ? '' : 'info');
    setShowModal(true);
  };

  const handleAddProject = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = formData.typical_projects ? formData.typical_projects.split(',').map(p => p.trim()).filter(Boolean) : [];
    if (!current.includes(trimmed)) {
      const updated = [...current, trimmed].join(', ');
      setFormData(prev => ({ ...prev, typical_projects: updated }));
    }
    setProjSearch('');
    setShowProjDropdown(false);
  };

  const handleRemoveProject = (name: string) => {
    const current = formData.typical_projects ? formData.typical_projects.split(',').map(p => p.trim()).filter(Boolean) : [];
    const updated = current.filter(p => p !== name).join(', ');
    setFormData(prev => ({ ...prev, typical_projects: updated }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || inFlightRef.current || !canEdit) return;
    if (!formData.name?.trim()) {
      addToast('Vui lòng nhập tên đối tác / nhà cung cấp', 'warning');
      return;
    }

    inFlightRef.current = true;
    setIsSaving(true);
    try {
      const cleanData = {
        ...formData,
        name: formData.name.trim(),
        cooperation_status: normalizeCoopStatusForSubmit(formData.cooperation_status),
      };
      if (selectedSupplier) {
        await api.put(`/suppliers/${selectedSupplier.id}`, cleanData);
        addToast('Đã cập nhật đối tác', 'success');
      } else {
        await api.post('/suppliers', cleanData);
        addToast('Đã thêm đối tác mới', 'success');
      }
      setShowModal(false);
      await fetchSuppliers();
    } catch (err: any) {
      addToast(err.response?.data?.message || 'Lỗi khi lưu dữ liệu đối tác', 'error');
    } finally {
      inFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDelete = (id: number) => {
    if (!canEdit) return;
    showConfirm({
      title: 'Xóa đối tác',
      message: 'Bạn có chắc chắn muốn xóa mềm đối tác này khỏi danh sách?',
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          await api.delete(`/suppliers/${id}`);
          setSuppliers(prev => prev.filter(s => s.id !== id));
          if (selectedSupplier?.id === id) {
            setShowModal(false);
          }
          addToast('Đã xóa đối tác', 'success');
          await fetchSuppliers();
        } catch (e: any) {
          addToast(e?.response?.data?.message || 'Lỗi khi xóa đối tác', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  // Full multi-page paginated CSV Export matching active filters
  const handleExport = async () => {
    if (isExporting || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsExporting(true);
    try {
      const allRows: any[] = [];
      let p = 1;
      const limit = 100;
      let hasMore = true;
      while (hasMore && p <= 50) {
        const params: any = { page: p, limit, search: searchTerm };
        if (filters.prestige_tier) params.prestige_tier = filters.prestige_tier;
        if (filters.cooperation_status) params.cooperation_status = filters.cooperation_status;
        const res = await api.get('/suppliers', { params });
        const data = res.data?.data ?? res.data ?? {};
        const chunk = ensureArray<any>(data.items ?? data);
        allRows.push(...chunk);
        const totalRows = Number(data.total ?? allRows.length);
        if (chunk.length < limit || allRows.length >= totalRows) {
          hasMore = false;
        } else {
          p += 1;
        }
      }

      if (allRows.length === 0) {
        addToast('Không có dữ liệu đối tác khớp bộ lọc để xuất', 'info');
        return;
      }

      const headers = ['Mã ĐT', 'Tên Đối Tác', 'Người Đại Diện', 'Chức Vụ', 'SĐT', 'Email', 'Địa Chỉ', 'Mã Số Thuế', 'Quy Mô / Vốn', 'Dự Án / Chương Trình', 'Xếp Hạng', 'Trạng Thái', 'Tài Khoản Ngân Hàng', 'Ghi Chú'];
      const rows = allRows.map(s => [
        `DT-${s.id}`,
        s.name || '',
        s.contact_name || '',
        s.contact_position || '',
        s.phone || '',
        s.email || '',
        s.address || '',
        s.tax_code || '',
        s.scale_capital || '',
        s.typical_projects || '',
        s.prestige_tier || 'A',
        getCoopMeta(s.cooperation_status).label,
        s.bank_account || '',
        s.notes || ''
      ]);

      const csvContent = '\uFEFF' + [
        headers.map(csvSafe).join(','),
        ...rows.map(row => row.map(csvSafe).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `danh_sach_doi_tac_${getLocalDateStr()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast(`Đã xuất ${allRows.length} đối tác thành công`, 'success');
    } catch (e: any) {
      addToast('Lỗi khi xuất danh sách đối tác: ' + (e?.message || 'Không xác định'), 'error');
    } finally {
      inFlightRef.current = false;
      setIsExporting(false);
    }
  };

  const filtered = ensureArray<any>(suppliers);
  const selectedProjects = formData.typical_projects ? formData.typical_projects.split(',').map((p: any) => p.trim()).filter(Boolean) : [];

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý Đối tác &amp; Nhà cung cấp</h1>
          <p className="page-subtitle">Quản lý danh sách trường học, viện đào tạo, nhà cung cấp và đối tác liên kết</p>
        </div>
        <div className="flex gap-3">
          <button type="button" className="btn outline" onClick={handleExport} disabled={isExporting} title="Xuất danh sách đối tác">
            {isExporting ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
            <span>{isExporting ? 'Đang xuất...' : 'Xuất Excel / CSV'}</span>
          </button>
          {canEdit && (
            <button type="button" className="btn primary" style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }} onClick={() => handleOpenModal()}>
              <Plus size={18} /> Thêm đối tác
            </button>
          )}
        </div>
      </div>

      {/* Control row */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
        background: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        padding: '0.625rem 1.25rem',
        marginBottom: '1.25rem',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
        width: '100%'
      }}>
        {/* Left: Search input */}
        <div style={{
          flex: '1 1 300px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: '10px',
          padding: '0 12px',
          height: '36px',
        }}>
          <Search size={14} style={{ color: '#64748B' }} />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên trường, doanh nghiệp, đối tác hoặc người liên hệ..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '0.825rem',
              color: '#0F172A',
              padding: 0
            }}
          />
        </div>

        {/* Right side: Filters & Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>Phân hạng:</span>
            <select
              value={filters.prestige_tier}
              onChange={e => setFilters({ ...filters, prestige_tier: e.target.value })}
              style={{
                padding: '0 8px',
                height: '30px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#0F172A',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Tất cả phân hạng</option>
              {PRESTIGE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>Hợp tác:</span>
            <select
              value={filters.cooperation_status}
              onChange={e => setFilters({ ...filters, cooperation_status: e.target.value })}
              style={{
                padding: '0 8px',
                height: '30px',
                borderRadius: '6px',
                border: '1px solid #E2E8F0',
                background: '#FFFFFF',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#0F172A',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="">Tất cả trạng thái</option>
              {COOP_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={{
            fontSize: '0.8rem',
            color: '#64748B',
            fontWeight: 500,
            background: '#F8FAFC',
            padding: '4px 10px',
            borderRadius: '8px',
            border: '1px solid #E2E8F0',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            boxSizing: 'border-box'
          }}>
            Hiển thị <strong style={{ color: '#BD1D2D', marginLeft: '4px', marginRight: '4px', fontVariantNumeric: 'tabular-nums' }}>{total}</strong> đối tác
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ width: '100%' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: '1rem',
            width: '100%',
            marginBottom: '1.5rem'
          }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} height={180} />
            ))}
          </div>
        </div>
      ) : total === 0 ? (
        <EmptyCard
          icon={<Truck size={48} />}
          title="Chưa có đối tác nào"
          description="Bắt đầu thêm các trường học, viện đào tạo hoặc doanh nghiệp đối tác để quản lý."
          actionText={canEdit ? 'Thêm đối tác ngay' : undefined}
          onAction={canEdit ? () => handleOpenModal() : undefined}
        />
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}>
            {filtered.map(s => {
              const cardProjList = s.typical_projects
                ? String(s.typical_projects).split(',').map((p: any) => p.trim()).filter(Boolean)
                : [];
              const coopMeta = getCoopMeta(s.cooperation_status);

              return (
                <motion.div
                  key={s.id}
                  className="card relative overflow-hidden"
                  style={{
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: '16px',
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                    cursor: 'pointer',
                    position: 'relative',
                    transition: 'border-color 0.15s ease, background-color 0.15s ease',
                    minHeight: '180px'
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleOpenModal(s, true)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                      <Avatar name={s.name} size={36} />
                      <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                        <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.name}>
                          {s.name}
                        </h3>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '3px', alignItems: 'center' }}>
                          {s.prestige_tier && (
                            <span style={{ background: '#F1F5F9', color: '#334155', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '6px' }}>
                              Hạng {s.prestige_tier}
                            </span>
                          )}
                          {s.cooperation_status && (
                            <span style={{ background: coopMeta.bg, color: coopMeta.color, fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '6px' }}>
                              {coopMeta.label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {canEdit && (
                      <div style={{ display: 'flex', gap: '4px', marginLeft: '8px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                        <button type="button" className="btn ghost sm" onClick={() => handleOpenModal(s)} style={{ padding: '4px', borderRadius: '6px', width: '26px', height: '26px' }}><Pencil size={12} /></button>
                        <button type="button" className="btn ghost sm" style={{ color: '#BD1D2D', padding: '4px', borderRadius: '6px', width: '26px', height: '26px' }} onClick={() => handleDelete(s.id)}><Trash2 size={12} /></button>
                      </div>
                    )}
                  </div>

                  {/* Clean details list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid #F1F5F9', paddingTop: '8px', flex: 1, textAlign: 'left' }}>
                    {s.contact_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748B' }}>
                        <span>Đại diện:</span>
                        <span style={{ fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.contact_name} {s.contact_position ? `(${s.contact_position})` : ''}
                        </span>
                      </div>
                    )}
                    {s.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569' }}>
                        <Phone size={11} style={{ opacity: 0.6 }} />
                        <span>{s.phone}</span>
                      </div>
                    )}
                    {s.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569', minWidth: 0 }}>
                        <Mail size={11} style={{ opacity: 0.6 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.email}>{s.email}</span>
                      </div>
                    )}
                    {s.address && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569', minWidth: 0 }}>
                        <MapPin size={11} style={{ opacity: 0.6 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.address}>{s.address}</span>
                        <CopyButton text={s.address} size={11} style={{ padding: '1px 4px', margin: 0, flexShrink: 0 }} />
                      </div>
                    )}
                    {cardProjList.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '0.75rem', color: '#64748B', minWidth: 0, marginTop: '2px', flexWrap: 'wrap' }}>
                        <Building2 size={11} style={{ opacity: 0.6, marginTop: '2px', flexShrink: 0 }} />
                        <span style={{ flexShrink: 0 }}>Dự án:</span>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                          {cardProjList.map((proj, pIdx) => {
                            const pId = projectsList.find(p => String(p.name || '').trim().toLowerCase() === proj.trim().toLowerCase())?.id;
                            return (
                              <span
                                key={pIdx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(pId ? `/projects?project_id=${pId}` : `/projects?search=${encodeURIComponent(proj)}`);
                                }}
                                style={{
                                  color: '#BD1D2D',
                                  fontWeight: 600,
                                  textDecoration: 'underline',
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap'
                                }}
                                title="Click để mở chi tiết dự án"
                              >
                                {proj}{pIdx < cardProjList.length - 1 ? ',' : ''}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {total > pageSize && (
            <div className="mt-6 flex justify-center">
              <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} />
            </div>
          )}
        </>
      )}

      {/* Slide-over Drawer (220ms synchronized motion) */}
      {typeof document !== 'undefined' && isVisible && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="drawer-backdrop"
            onClick={() => setShowModal(false)}
            style={{
              zIndex: zBackdrop,
              ...({ '--drawer-backdrop-z': zBackdrop } as any),
              opacity: animateIn ? 1 : 0,
              transition: `opacity ${drawerMs}ms cubic-bezier(0.25, 0.1, 0.25, 1)`,
              pointerEvents: animateIn ? 'auto' : 'none'
            }}
          />

          {/* Drawer Sheet */}
          <div
            className={`${styles.drawer} drawer-panel drawer-sheet`}
            style={{
              transform: animateIn ? 'translateX(0)' : 'translateX(100%)',
              transition: `transform ${drawerMs}ms cubic-bezier(0.25, 0.1, 0.25, 1)`,
              willChange: 'transform',
              zIndex: zDrawer,
              '--drawer-panel-z': zDrawer
            } as React.CSSProperties}
          >
            {/* Header */}
            <div
              className={styles.header}
              style={{
                borderBottom: '1px solid #E2E8F0',
                padding: isMobile ? '0.75rem 1rem' : '1.25rem 1.5rem',
                background: '#FFFFFF',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px'
              }}
            >
              {isMobile && activeTab ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                  <button
                    type="button"
                    onClick={() => setActiveTab('')}
                    title="Quay lại danh mục"
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      cursor: 'pointer',
                      color: '#0F172A',
                      flexShrink: 0
                    }}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div style={{ textAlign: 'left', minWidth: 0 }}>
                    <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {SUPPLIER_TABS.find(t => t.id === activeTab)?.label || 'Chi tiết'}
                    </h2>
                    <div style={{ fontSize: '0.72rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formData.name || 'Đối tác'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '10px' : '12px', flex: 1, minWidth: 0 }}>
                  <Avatar name={formData.name || 'ĐT'} size={isMobile ? 38 : 42} />
                  <div style={{ textAlign: 'left', minWidth: 0 }}>
                    <h2 style={{ fontSize: isMobile ? '1rem' : '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {formData.name || 'Thêm đối tác mới'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#64748B', marginTop: '2px', flexWrap: 'wrap' }}>
                      <span>MST: {formData.tax_code || '—'}</span>
                      <span>•</span>
                      <span>Hạng: {formData.prestige_tier || 'A'}</span>
                      {!isMobile && formData.cooperation_status && (() => {
                        const cm = getCoopMeta(formData.cooperation_status);
                        return (
                          <>
                            <span>•</span>
                            <span style={{ padding: '1px 7px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: cm.bg, color: cm.color }}>
                              {cm.label}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              {/* Right Side Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '10px', flexShrink: 0 }}>
                {canEdit && (
                  !isReadOnly ? (
                    <button
                      type="button"
                      onClick={handleSubmit}
                      className="btn primary sm"
                      disabled={isSaving}
                      style={{ height: '36px', fontSize: '0.825rem', padding: isMobile ? '0 10px' : '0 16px', borderRadius: '9px', display: 'flex', alignItems: 'center', gap: '6px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }}
                    >
                      {isSaving ? <Loader2 size={16} className="spin" /> : <Save size={16} />}
                      {!isMobile && <span>{isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}</span>}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsReadOnly(false);
                        if (!activeTab) setActiveTab('info');
                      }}
                      className="btn primary sm"
                      style={{ height: '36px', fontSize: '0.825rem', padding: isMobile ? '0 10px' : '0 16px', borderRadius: '9px', display: 'flex', alignItems: 'center', gap: '6px', background: '#0F172A', borderColor: '#0F172A', color: '#FFFFFF' }}
                    >
                      <Pencil size={16} />
                      {!isMobile && <span>Chỉnh sửa</span>}
                    </button>
                  )
                )}
                {canEdit && selectedSupplier?.id && (
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedSupplier.id)}
                    title="Xóa đối tác / Nhà cung cấp"
                    style={{
                      height: '36px',
                      fontSize: '0.825rem',
                      padding: isMobile ? '0 10px' : '0 14px',
                      borderRadius: '9px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'rgba(189, 29, 45, 0.08)',
                      color: '#BD1D2D',
                      border: '1px solid rgba(189, 29, 45, 0.25)',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={16} />
                    {!isMobile && <span>Xóa</span>}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={() => setShowModal(false)}
                  title="Đóng"
                  style={{ width: 36, height: 36, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className={styles.drawerBody}>
              {/* Desktop Left Sidebar Tabs */}
              {!isMobile && (
                <div className={styles.sidebarTabs}>
                  {SUPPLIER_TABS.map(tab => {
                    const IconComponent = tab.icon;
                    const count = tab.id === 'activities' ? activities.length
                      : tab.id === 'purchase_orders' ? purchaseOrders.length
                      : tab.id === 'invoices_docs' ? expenses.length
                      : 0;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className={`${styles.sidebarTabBtn} ${activeTab === tab.id ? styles.sidebarTabActive : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                          justifyContent: 'space-between',
                          display: 'flex',
                          alignItems: 'center',
                          width: '100%',
                          padding: '10px 14px',
                          borderRadius: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {renderColoredIcon(IconComponent, activeTab === tab.id ? '#BD1D2D' : '#334155')}
                          <span style={{ fontSize: '0.825rem' }}>{tab.label}</span>
                        </div>
                        {count > 0 && (
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            background: activeTab === tab.id ? '#BD1D2D' : '#F1F5F9',
                            color: activeTab === tab.id ? '#ffffff' : '#64748B',
                            padding: '2px 7px',
                            borderRadius: '100px',
                            lineHeight: 1
                          }}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Mobile Root Navigation List */}
              {isMobile && !activeTab && (
                <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    padding: '16px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Avatar name={formData.name || 'ĐT'} size={44} />
                        <div>
                          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>{formData.name || 'Đối tác'}</h3>
                          <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>MST: {formData.tax_code || '—'}</p>
                        </div>
                      </div>
                      {(() => {
                        const cm = getCoopMeta(formData.cooperation_status);
                        return (
                          <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, background: cm.bg, color: cm.color }}>
                            {cm.label}
                          </span>
                        );
                      })()}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', paddingTop: '12px', borderTop: '1px solid #F1F5F9', fontSize: '0.75rem' }}>
                      <div>
                        <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Người liên hệ</span>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{formData.contact_name || '—'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Số điện thoại</span>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{formData.phone || '—'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Phân hạng uy tín</span>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>Hạng {formData.prestige_tier || 'A'}</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748B', display: 'block', fontSize: '0.7rem' }}>Quy mô / Vốn</span>
                        <span style={{ fontWeight: 600, color: '#0F172A' }}>{formData.scale_capital || '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{
                    background: '#FFFFFF',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    {SUPPLIER_TABS.map((tab, idx) => {
                      const IconComponent = tab.icon;
                      const count = tab.id === 'activities' ? activities.length
                        : tab.id === 'purchase_orders' ? purchaseOrders.length
                        : tab.id === 'invoices_docs' ? expenses.length
                        : 0;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          style={{
                            width: '100%',
                            padding: '14px 16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'transparent',
                            border: 'none',
                            borderBottom: idx < SUPPLIER_TABS.length - 1 ? '1px solid #F1F5F9' : 'none',
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {renderColoredIcon(IconComponent, tab.color)}
                            <div>
                              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>{tab.label}</div>
                              <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '1px' }}>
                                {tab.id === 'info' ? 'Hồ sơ, liên hệ, tài khoản & dự án'
                                  : tab.id === 'activities' ? `${activities.length} hoạt động ghi nhận`
                                  : tab.id === 'purchase_orders' ? `${purchaseOrders.length} đơn đặt hàng / mua`
                                  : tab.id === 'stats' ? 'Tổng chi phí & hiệu suất đối tác'
                                  : `${expenses.length} chứng từ & chi phí`}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {count > 0 && (
                              <span style={{
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                background: 'rgba(189, 29, 45, 0.08)',
                                color: '#BD1D2D',
                                padding: '2px 8px',
                                borderRadius: '100px'
                              }}>
                                {count}
                              </span>
                            )}
                            <ChevronRight size={18} color="#94A3B8" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab Content Area */}
              {(!isMobile || activeTab) && (
                <div
                  className={styles.contentArea}
                  style={{
                    padding: isMobile ? '1rem' : '1.75rem',
                    background: '#F8FAFC',
                    flex: 1,
                    overflowY: 'auto'
                  }}
                >
                  {/* TAB 1: THÔNG TIN */}
                  {activeTab === 'info' && (
                    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
                        {/* Left Column */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px', marginBottom: '16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Building2 size={16} style={{ color: '#BD1D2D' }} />
                            Thông tin Trường / Doanh nghiệp
                          </h3>

                          {isReadOnly ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Tên trường / Doanh nghiệp / Đối tác</span>
                                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0F172A' }}>{formData.name || '—'}</span>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Mã số thuế</span>
                                  <span style={{ fontSize: '0.875rem', color: '#0F172A' }}>{formData.tax_code || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Vốn điều lệ / Quy mô</span>
                                  <span style={{ fontSize: '0.875rem', color: '#0F172A' }}>{formData.scale_capital || '—'}</span>
                                </div>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Website</span>
                                {formData.website ? (
                                  <a href={formData.website.startsWith('http') ? formData.website : `https://${formData.website}`} target="_blank" rel="noopener noreferrer" style={{ color: '#BD1D2D', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }}>
                                    {formData.website} <ExternalLink size={12} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                  </a>
                                ) : (
                                  <span style={{ fontSize: '0.875rem', color: '#64748B' }}>—</span>
                                )}
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Lĩnh vực hoạt động / Ngành nghề</span>
                                <span style={{ fontSize: '0.875rem', color: '#0F172A' }}>{formData.focused_type || '—'}</span>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '4px' }}>Phân hạng uy tín</span>
                                  <span style={{ background: '#F1F5F9', color: '#334155', padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>Hạng {formData.prestige_tier || 'A'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '4px' }}>Trạng thái hợp tác</span>
                                  {(() => {
                                    const cm = getCoopMeta(formData.cooperation_status);
                                    return (
                                      <span style={{ background: cm.bg, color: cm.color, padding: '2px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                                        {cm.label}
                                      </span>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                              <div className="form-group">
                                <label className="form-label">Tên Trường / Doanh nghiệp / Đối tác <span style={{ color: '#BD1D2D' }}>*</span></label>
                                <input
                                  className="form-input"
                                  placeholder="Ví dụ: Swiss UMEF, Đại học Quốc tế, Công ty TNHH ABC..."
                                  required
                                  value={formData.name}
                                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                  <label className="form-label">Mã số thuế</label>
                                  <input
                                    className="form-input"
                                    placeholder="MST doanh nghiệp / cơ sở"
                                    value={formData.tax_code || ''}
                                    onChange={e => setFormData({ ...formData, tax_code: e.target.value })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Vốn điều lệ / Quy mô</label>
                                  <input
                                    className="form-input"
                                    placeholder="Ví dụ: 5.000 tỷ..."
                                    value={formData.scale_capital || ''}
                                    onChange={e => setFormData({ ...formData, scale_capital: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="form-group">
                                <label className="form-label">Website đơn vị</label>
                                <input
                                  className="form-input"
                                  placeholder="https://..."
                                  value={formData.website || ''}
                                  onChange={e => setFormData({ ...formData, website: e.target.value })}
                                />
                              </div>

                              <div className="form-group">
                                <label className="form-label">Lĩnh vực hoạt động / Ngành nghề</label>
                                <input
                                  className="form-input"
                                  placeholder="Ví dụ: Giáo dục, Đào tạo đại học/sau ĐH, Du học, Công nghệ, Dịch vụ..."
                                  value={formData.focused_type || ''}
                                  onChange={e => setFormData({ ...formData, focused_type: e.target.value })}
                                />
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                  <label className="form-label">Phân hạng uy tín</label>
                                  <CustomSelect
                                    options={PRESTIGE_OPTIONS}
                                    value={formData.prestige_tier || 'A'}
                                    onChange={val => setFormData({ ...formData, prestige_tier: String(val) })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Trạng thái hợp tác</label>
                                  <CustomSelect
                                    options={COOP_OPTIONS}
                                    value={normalizeCoopStatusForSubmit(formData.cooperation_status)}
                                    onChange={val => setFormData({ ...formData, cooperation_status: normalizeCoopStatusForSubmit(String(val)) })}
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Right Column */}
                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                          <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px', marginBottom: '16px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <User size={16} style={{ color: '#334155' }} />
                            Thông tin liên hệ &amp; Giao dịch
                          </h3>

                          {isReadOnly ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'left' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Người liên hệ</span>
                                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A' }}>{formData.contact_name || '—'}</span>
                                </div>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Chức vụ</span>
                                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>{formData.contact_position || '—'}</span>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Số điện thoại</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.875rem', color: '#0F172A', fontWeight: 600 }}>{formData.phone || '—'}</span>
                                    {formData.phone && <CopyButton text={formData.phone} size={12} />}
                                  </div>
                                </div>
                                <div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Email</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '0.875rem', color: '#0F172A' }}>{formData.email || '—'}</span>
                                    {formData.email && <CopyButton text={formData.email} size={12} />}
                                  </div>
                                </div>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Tài khoản ngân hàng giao dịch</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '0.875rem', color: '#0F172A' }}>{formData.bank_account || '—'}</span>
                                  {formData.bank_account && <CopyButton text={formData.bank_account} size={12} />}
                                </div>
                              </div>

                              <div>
                                <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginBottom: '2px' }}>Địa chỉ văn phòng</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <span style={{ fontSize: '0.875rem', color: '#0F172A' }}>{formData.address || '—'}</span>
                                  {formData.address && <CopyButton text={formData.address} size={12} />}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                  <label className="form-label">Người liên hệ</label>
                                  <input
                                    className="form-input"
                                    placeholder="Họ và tên"
                                    value={formData.contact_name || ''}
                                    onChange={e => setFormData({ ...formData, contact_name: e.target.value })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Chức vụ</label>
                                  <input
                                    className="form-input"
                                    placeholder="Ví dụ: GĐ Kinh doanh..."
                                    value={formData.contact_position || ''}
                                    onChange={e => setFormData({ ...formData, contact_position: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div className="form-group">
                                  <label className="form-label">Số điện thoại</label>
                                  <input
                                    className="form-input"
                                    placeholder="09xx..."
                                    value={formData.phone || ''}
                                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                                  />
                                </div>
                                <div className="form-group">
                                  <label className="form-label">Email</label>
                                  <input
                                    className="form-input"
                                    type="email"
                                    placeholder="lienhe@doitac.vn"
                                    value={formData.email || ''}
                                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="form-group">
                                <label className="form-label">Tài khoản ngân hàng giao dịch</label>
                                <input
                                  className="form-input"
                                  placeholder="Số TK - Tên NH - Chi nhánh..."
                                  value={formData.bank_account || ''}
                                  onChange={e => setFormData({ ...formData, bank_account: e.target.value })}
                                />
                              </div>

                              <div className="form-group">
                                <AddressSelect
                                  label="Địa chỉ văn phòng"
                                  value={formData.address || ''}
                                  onChange={val => setFormData({ ...formData, address: val })}
                                  placeholder="Chọn địa chỉ văn phòng..."
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Typical Projects & Notes */}
                      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', textAlign: 'left', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
                        <h3 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', borderBottom: '1px solid #E2E8F0', paddingBottom: '10px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Layers size={16} style={{ color: '#BD1D2D' }} />
                          Chương trình / Dự án hợp tác &amp; Ghi chú
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                          <div>
                            <label className="form-label" style={{ fontWeight: 600, color: '#64748B', marginBottom: '6px', fontSize: '0.78rem' }}>Chương trình / Dự án hợp tác tiêu biểu</label>

                            {isReadOnly ? (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {selectedProjects.length > 0 ? (
                                  selectedProjects.map((p, idx) => {
                                    const pId = projectsList.find(proj => String(proj.name || '').trim().toLowerCase() === p.trim().toLowerCase())?.id;
                                    return (
                                      <span
                                        key={idx}
                                        onClick={() => navigate(pId ? `/projects?project_id=${pId}` : `/projects?search=${encodeURIComponent(p)}`)}
                                        style={{
                                          background: 'rgba(189, 29, 45, 0.06)',
                                          color: '#BD1D2D',
                                          border: '1px solid rgba(189, 29, 45, 0.16)',
                                          padding: '4px 12px',
                                          borderRadius: '8px',
                                          fontSize: '0.825rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '6px'
                                        }}
                                        title="Nhấp để xem chi tiết dự án"
                                      >
                                        {p} <ExternalLink size={12} />
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span style={{ fontSize: '0.875rem', color: '#64748B' }}>Không có chương trình hợp tác tiêu biểu.</span>
                                )}
                              </div>
                            ) : (
                              <div style={{ position: 'relative' }}>
                                <div style={{
                                  display: 'flex',
                                  flexWrap: 'wrap',
                                  gap: '6px',
                                  minHeight: '40px',
                                  padding: '6px 12px',
                                  background: '#FFFFFF',
                                  border: '1px solid #CBD5E1',
                                  borderRadius: '8px',
                                  alignItems: 'center',
                                  cursor: 'text'
                                }}
                                onClick={() => setShowProjDropdown(true)}
                                >
                                  {selectedProjects.map((p, idx) => (
                                    <span
                                      key={idx}
                                      style={{
                                        background: '#F1F5F9',
                                        color: '#0F172A',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        fontSize: '0.8rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      {p}
                                      <X
                                        size={12}
                                        style={{ cursor: 'pointer', color: '#64748B' }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleRemoveProject(p);
                                        }}
                                      />
                                    </span>
                                  ))}

                                  <input
                                    type="text"
                                    style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: '140px', fontSize: '0.85rem' }}
                                    placeholder={selectedProjects.length === 0 ? 'Chọn hoặc nhập tên chương trình/dự án...' : 'Thêm tiếp...'}
                                    value={projSearch}
                                    onChange={(e) => {
                                      setProjSearch(e.target.value);
                                      setShowProjDropdown(true);
                                    }}
                                    onFocus={() => setShowProjDropdown(true)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && projSearch.trim()) {
                                        e.preventDefault();
                                        handleAddProject(projSearch);
                                      }
                                    }}
                                  />
                                </div>

                                {showProjDropdown && (
                                  <>
                                    <div
                                      style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
                                      onClick={() => setShowProjDropdown(false)}
                                    />
                                    <div style={{
                                      position: 'absolute',
                                      top: '100%',
                                      left: 0,
                                      right: 0,
                                      background: '#FFFFFF',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: '8px',
                                      marginTop: '4px',
                                      boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                                      maxHeight: '220px',
                                      overflowY: 'auto',
                                      zIndex: 1001
                                    }}>
                                      {projectsList
                                        .filter(p => !selectedProjects.includes(p.name) && String(p.name || '').toLowerCase().includes(projSearch.toLowerCase()))
                                        .map(p => (
                                          <div
                                            key={p.id}
                                            style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', borderBottom: '1px solid #F1F5F9' }}
                                            onClick={() => handleAddProject(p.name)}
                                            onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                          >
                                            {p.name} {p.code ? `(${p.code})` : ''}
                                          </div>
                                        ))}
                                      {projSearch.trim() && !projectsList.some(p => String(p.name || '').toLowerCase() === projSearch.trim().toLowerCase()) && (
                                        <div
                                          style={{ padding: '8px 12px', fontSize: '0.85rem', cursor: 'pointer', color: '#BD1D2D', fontWeight: 600 }}
                                          onClick={() => handleAddProject(projSearch)}
                                          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                          + Thêm chương trình/dự án: &quot;{projSearch}&quot;
                                        </div>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          <div>
                            <label className="form-label" style={{ fontWeight: 600, color: '#64748B', marginBottom: '6px', fontSize: '0.78rem' }}>Ghi chú thêm</label>
                            {isReadOnly ? (
                              <div style={{ fontSize: '0.875rem', color: '#475569', whiteSpace: 'pre-wrap', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                {formData.notes || 'Không có ghi chú thêm.'}
                              </div>
                            ) : (
                              <textarea
                                className="form-textarea"
                                placeholder="Thông tin thêm về đối tác..."
                                value={formData.notes || ''}
                                onChange={e => setFormData({ ...formData, notes: e.target.value })}
                                rows={4}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: HOẠT ĐỘNG / TƯƠNG TÁC */}
                  {activeTab === 'activities' && (
                    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>Lịch sử hoạt động &amp; tương tác</h4>
                          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748B' }}>Các cuộc gọi, lịch hẹn làm việc, đàm phán và ghi chú đối tác</p>
                        </div>
                        {canEdit && selectedSupplier?.id && (
                          <button
                            type="button"
                            className="btn primary sm"
                            onClick={() => setShowActivityModal(true)}
                            style={{ height: '36px', fontSize: '0.825rem', padding: '0 16px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }}
                          >
                            <Plus size={16} />
                            Thêm hoạt động
                          </button>
                        )}
                      </div>

                      {activitiesLoading ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                          <Loader2 size={26} className="spin" style={{ margin: '0 auto 8px' }} />
                          <div style={{ fontSize: '0.825rem' }}>Đang tải hoạt động...</div>
                        </div>
                      ) : activities.length === 0 ? (
                        <EmptyCard
                          icon={<History size={36} />}
                          title="Chưa có hoạt động nào được ghi nhận"
                          description="Ghi lại các cuộc gọi, email hoặc biên bản làm việc để theo dõi đối tác tốt hơn."
                          actionText={canEdit && selectedSupplier?.id ? 'Thêm hoạt động đầu tiên' : undefined}
                          onAction={canEdit && selectedSupplier?.id ? () => setShowActivityModal(true) : undefined}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {activities.map((act: any) => {
                            const typeLabel = act.activity_type === 'call' ? 'Cuộc gọi'
                              : act.activity_type === 'meeting' ? 'Cuộc họp'
                              : act.activity_type === 'email' ? 'Email'
                              : act.activity_type === 'note' ? 'Ghi chú'
                              : 'Hoạt động';

                            return (
                              <div
                                key={act.id}
                                className="card-panel"
                                style={{
                                  padding: '14px 16px',
                                  background: '#FFFFFF',
                                  borderRadius: '14px',
                                  border: '1px solid #E2E8F0',
                                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#F1F5F9', color: '#334155' }}>
                                      {typeLabel}
                                    </span>
                                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>
                                      {act.title || act.subject || 'Không có tiêu đề'}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                    {formatDateTimeVN(act.created_at) || '—'}
                                  </span>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.825rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                                  {act.description || act.content || act.notes || '—'}
                                </p>
                                {act.created_by_name && (
                                  <div style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Avatar name={act.created_by_name} size={18} />
                                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{act.created_by_name}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: ĐƠN MUA HÀNG (PURCHASE_ORDERS) */}
                  {activeTab === 'purchase_orders' && (
                    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>Danh sách Đơn mua hàng (PO)</h4>
                          <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748B' }}>Đơn đặt hàng, đặt dịch vụ từ đối tác / trường / đơn vị cung cấp</p>
                        </div>
                        {canEdit && selectedSupplier?.id && (
                          <button
                            type="button"
                            className="btn primary sm"
                            onClick={() => {
                              setShowModal(false);
                              navigate(`/inventory?tab=purchase_orders&create_po=1&supplier_id=${selectedSupplier.id}`);
                            }}
                            style={{ height: '36px', fontSize: '0.825rem', padding: '0 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '6px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }}
                          >
                            <Plus size={16} />
                            Tạo Đơn mua (PO)
                          </button>
                        )}
                      </div>

                      {loadingPO ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                          <Loader2 size={26} className="spin" style={{ margin: '0 auto 8px' }} />
                          <div style={{ fontSize: '0.825rem' }}>Đang tải đơn mua...</div>
                        </div>
                      ) : purchaseOrders.length === 0 ? (
                        <EmptyCard
                          icon={<FileBadge size={36} />}
                          title="Chưa có đơn mua hàng (PO) nào"
                          description="Tạo đơn mua hàng hoặc đơn dịch vụ mới để theo dõi chi phí với đối tác này."
                          actionText={canEdit && selectedSupplier?.id ? 'Tạo đơn PO đầu tiên' : undefined}
                          onAction={canEdit && selectedSupplier?.id ? () => {
                            setShowModal(false);
                            navigate(`/inventory?tab=purchase_orders&create_po=1&supplier_id=${selectedSupplier.id}`);
                          } : undefined}
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {purchaseOrders.map((po: any) => {
                            const poTotal = Number(po.total_amount || po.total || 0);
                            const isCompleted = ['received', 'ordered', 'approved', 'completed'].includes(String(po.status));
                            const isCancelled = ['cancelled', 'rejected'].includes(String(po.status));
                            const statusText = po.status === 'received' ? 'Đã nhập kho'
                              : po.status === 'ordered' ? 'Đã đặt hàng'
                              : po.status === 'approved' ? 'Đã duyệt'
                              : po.status === 'completed' ? 'Hoàn thành'
                              : po.status === 'pending_approval' || po.status === 'pending' ? 'Chờ duyệt'
                              : po.status === 'cancelled' || po.status === 'rejected' ? 'Từ chối'
                              : po.status || 'Mới';

                            return (
                              <div
                                key={po.id}
                                className="card-panel"
                                onClick={() => {
                                  setShowModal(false);
                                  navigate(`/inventory?tab=purchase_orders&open_id=${po.id}`);
                                }}
                                style={{
                                  padding: '14px 16px',
                                  background: '#FFFFFF',
                                  borderRadius: '14px',
                                  border: '1px solid #E2E8F0',
                                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '12px',
                                  cursor: 'pointer'
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#BD1D2D', fontFamily: 'monospace' }}>
                                      {po.po_number || po.code || `PO-#${po.id}`}
                                    </span>
                                    <span style={{
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      background: isCancelled ? 'rgba(189, 29, 45, 0.08)' : isCompleted ? 'rgba(15, 23, 42, 0.06)' : '#F1F5F9',
                                      color: isCancelled ? '#BD1D2D' : isCompleted ? '#0F172A' : '#475569',
                                    }}>
                                      {statusText}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>
                                    Ngày đặt: {formatDateVN(po.order_date) || '—'}
                                    {po.delivery_date && ` • Giao dự kiến: ${formatDateVN(po.delivery_date)}`}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                    {FMT(poTotal)}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                    {po.payment_status === 'paid' ? 'Đã thanh toán' : 'Theo dõi công nợ'}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: THỐNG KÊ */}
                  {activeTab === 'stats' && (() => {
                    const activePOs = purchaseOrders.filter(p => !['cancelled', 'rejected'].includes(String(p.status)));
                    const totalPOCost = activePOs.reduce((acc, curr) => acc + (Number(curr.total_amount || curr.total) || 0), 0);
                    const completedPOs = purchaseOrders.filter(p => ['received', 'ordered', 'approved', 'completed'].includes(String(p.status))).length;
                    const pendingPOs = purchaseOrders.filter(p => ['pending', 'pending_approval', 'draft'].includes(String(p.status))).length;

                    return (
                      <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>Hiệu suất &amp; thống kê đối tác NCC</h4>
                          <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748B' }}>Tổng hợp số liệu mua hàng (PO), chi phí phát sinh và giao dịch cung ứng</p>
                        </div>

                        {/* 4 Chapter V KPI Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                          <div style={{ padding: '20px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tổng chi phí mua (PO)</span>
                              <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <DollarSign size={17} />
                              </div>
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                              {FMT(totalPOCost)}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                              Chi phí từ {activePOs.length} đơn đặt hàng hợp lệ
                            </div>
                          </div>

                          <div style={{ padding: '20px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Đơn mua hoàn tất</span>
                              <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FileBadge size={17} />
                              </div>
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                              {completedPOs}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              Đã duyệt / đặt hàng / nhập kho
                            </div>
                          </div>

                          <div style={{ padding: '20px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Đơn mua chờ duyệt</span>
                              <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Clock size={17} />
                              </div>
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                              {pendingPOs}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              Đang thẩm định / chờ ký duyệt
                            </div>
                          </div>

                          <div style={{ padding: '20px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Chương trình liên kết</span>
                              <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Building2 size={17} />
                              </div>
                            </div>
                            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                              {selectedProjects.length}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              Dự án &amp; chương trình đào tạo phối hợp
                            </div>
                          </div>
                        </div>

                        <div style={{
                          background: '#FFFFFF',
                          borderRadius: '16px',
                          padding: '20px',
                          border: '1px solid #E2E8F0',
                          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '14px'
                        }}>
                          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tổng quan hợp tác</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '14px' }}>
                            <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                              <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block' }}>Chương trình liên kết</span>
                              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>{selectedProjects.length} chương trình</span>
                            </div>
                            <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                              <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block' }}>Tương tác &amp; Trao đổi</span>
                              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>{activities.length} hoạt động</span>
                            </div>
                            <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                              <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block' }}>Chứng từ &amp; Chi phí</span>
                              <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>{expenses.length} khoản chi</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* TAB 5: CHỨNG TỪ & CHI PHÍ NCC */}
                  {activeTab === 'invoices_docs' && (
                    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>Chứng từ &amp; Phiếu chi NCC</h4>
                          <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748B' }}>Quản lý phiếu chi, chứng từ thanh toán và công nợ phát sinh với đối tác</p>
                        </div>
                      </div>

                      {loadingExpenses ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                          <Loader2 size={26} className="spin" style={{ margin: '0 auto 8px' }} />
                          <div style={{ fontSize: '0.825rem' }}>Đang tải chứng từ &amp; phiếu chi...</div>
                        </div>
                      ) : expenses.length === 0 ? (
                        <EmptyCard
                          icon={<Receipt size={36} />}
                          title="Chưa có chứng từ hoặc phiếu chi nào"
                          description="Các phiếu chi và chứng từ thanh toán liên kết trực tiếp với đối tác / nhà cung cấp này sẽ hiển thị tại đây."
                        />
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {expenses.map((exp: any) => {
                            const expTotal = Number(exp.amount || exp.total || 0);
                            const isPaid = ['paid', 'approved', 'completed'].includes(String(exp.status));
                            const isRejected = ['rejected', 'cancelled'].includes(String(exp.status));
                            return (
                              <div
                                key={exp.id}
                                className="card-panel"
                                style={{
                                  padding: '14px 16px',
                                  background: '#FFFFFF',
                                  borderRadius: '14px',
                                  border: '1px solid #E2E8F0',
                                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: '12px'
                                }}
                              >
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#BD1D2D', fontFamily: 'monospace' }}>
                                      {exp.expense_code || exp.code || `EXP-#${exp.id}`}
                                    </span>
                                    <span style={{
                                      padding: '2px 8px',
                                      borderRadius: '6px',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      background: isRejected ? 'rgba(189, 29, 45, 0.08)' : isPaid ? 'rgba(15, 23, 42, 0.06)' : '#F1F5F9',
                                      color: isRejected ? '#BD1D2D' : isPaid ? '#0F172A' : '#475569',
                                    }}>
                                      {exp.status === 'paid' ? 'Đã chi trả' : exp.status === 'approved' ? 'Đã duyệt chi' : exp.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                                    </span>
                                  </div>
                                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '4px' }}>
                                    {exp.title || exp.description || 'Phiếu chi NCC'} • Ngày: {formatDateVN(exp.expense_date || exp.created_at) || '—'}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                    {FMT(expTotal)}
                                  </div>
                                  {exp.receipt_url && (
                                    <a
                                      href={exp.receipt_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ fontSize: '0.72rem', color: '#BD1D2D', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}
                                    >
                                      Xem chứng từ <ExternalLink size={11} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Activity Modal for Supplier */}
          {showActivityModal && selectedSupplier?.id && (
            <ActivityModal
              entityType="supplier"
              entityId={selectedSupplier.id}
              isOpen={showActivityModal}
              onClose={() => setShowActivityModal(false)}
              onSuccess={() => {
                setShowActivityModal(false);
                void fetchActivities(selectedSupplier.id);
              }}
            />
          )}
        </>
      , document.body)}
    </div>
  );
};

