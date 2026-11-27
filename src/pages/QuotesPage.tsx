import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import {
  FileText, Plus, Search, Download, Clock,
  Eye, Trash2, TrendingUp, DollarSign,
  Pencil, Send, FileCheck, XCircle, Calendar,
  ChevronDown, Filter, Printer, X, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { useAuthStore, getModulePermissionScope } from '../store/authStore';
import { useTenantConfig, getTenantOrganizationName, getTenantLogoUrl } from '../contexts/TenantConfigContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { isSystemAdmin, isViewer as checkIsViewer } from '../utils/roleUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import { formatDateVN, getLocalDateStr } from '../utils/dateUtils';
import { numberToVietnameseText } from '../utils/numberToText';
import { pushOverlay } from '../utils/overlayStack';
import { PeriodFilter, getDateRange } from '../components/ui/PeriodFilter';
import { CustomCheckbox } from '../components/ui/CustomCheckbox';
import type { Period, DateRange } from '../components/ui/PeriodFilter';
import { Pagination } from '../components/ui/Pagination';
import { QuoteEditorModal } from '../components/ui/QuoteEditorModal';
import { EmptyCard } from '../components/ui/EmptyCard';
import api from '../api/axios';
import { Tooltip } from '../components/ui/Tooltip';
import { useDebounce } from '../hooks/useDebounce';
import { Avatar } from '../components/ui/Avatar';
import { TableRowSkeleton } from '../components/ui/Skeleton';
import { useViewportDevice } from '../hooks/useViewportDevice';

const FMT = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n) || 0);

const parseSafeDate = (d: any): Date | null => {
  if (!d) return null;
  const s = String(d).trim();
  if (!s || s.startsWith('0000-00-00')) return null;
  const normalized = s.includes('T') ? s : s.replace(/-/g, '/');
  const date = new Date(normalized);
  return isNaN(date.getTime()) ? null : date;
};

const fmtDate = (d: any) => {
  if (!d || String(d).startsWith('0000-00-00')) return '—';
  return formatDateVN(String(d)) || '—';
};

const csvSafe = (val: unknown): string => {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

export const QuotesPage: React.FC = () => {
  const { addToast, showConfirm, closeConfirm } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm, closeConfirm: s.closeConfirm })));
  const { isMobile } = useViewportDevice();
  const currentUser = useAuthStore(state => state.user);
  const { config, hasPermission } = useTenantConfig();
  const pageSize = useTypedSubSetting<number>('finance.ui_pagination_sizes', 'quotes', 10);
  const zModalNested = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);
  const motionMs = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);

  const isViewer = useMemo(() => {
    const roleUser = currentUser
      ? { ...currentUser, manager_behavior_mode: currentUser.manager_behavior_mode ?? undefined }
      : null;
    if (!roleUser || checkIsViewer(roleUser)) return true;
    if (isSystemAdmin(roleUser)) return false;
    const scope = getModulePermissionScope(currentUser, 'quotes', 'write');
    return scope === 'none' && !hasPermission('quotes', 'write');
  }, [currentUser, hasPermission]);

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('this_month');
  const [dateRange, setDateRange] = useState<DateRange>(getDateRange('this_month'));
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editorQuote, setEditorQuote] = useState<any>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState({ total_val: 0, accepted_val: 0, sent_count: 0, accepted_count: 0, total_count: 0 });
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [printQuote, setPrintQuote] = useState<any>(null);
  const [printLoading, setPrintLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  useEffect(() => {
    const handleClose = (e: MouseEvent) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setIsStatusDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClose);
    return () => document.removeEventListener('mousedown', handleClose);
  }, []);

  useEffect(() => {
    if (!printQuote) return;
    return pushOverlay('quote-print-preview', () => setPrintQuote(null), zModalNested);
  }, [printQuote, zModalNested]);

  const quotesAbortRef = useRef<AbortController | null>(null);
  const printAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  const fetchQuotes = useCallback(async () => {
    if (quotesAbortRef.current) {
      quotesAbortRef.current.abort();
    }
    const controller = new AbortController();
    quotesAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const params = {
        page,
        limit: pageSize || 10,
        from: dateRange.from,
        to: dateRange.to,
        status: statusFilter,
        search: debouncedSearch
      };
      const r = await api.get('/quotes', { params, signal });
      if (signal.aborted) return;
      const data = r.data?.data ?? r.data ?? {};
      setItems(ensureArray<any>(data.items));
      setTotal(Number(data.total) || 0);
      setSummary(data.summary || { total_val: 0, accepted_val: 0, sent_count: 0, accepted_count: 0, total_count: 0 });
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED' || signal.aborted) return;
      setItems([]);
      setTotal(0);
      addToast('Lỗi khi tải danh sách báo giá', 'error');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [page, pageSize, dateRange, statusFilter, debouncedSearch, addToast]);

  useEffect(() => {
    fetchQuotes();
    return () => {
      quotesAbortRef.current?.abort();
      printAbortRef.current?.abort();
    };
  }, [fetchQuotes]);

  // KPIs
  const totalVal = Number(summary.total_val) || 0;
  const acceptedVal = Number(summary.accepted_val) || 0;
  const sentCount = Number(summary.sent_count) || 0;
  const convRate = Number(summary.total_count) > 0 ? (Number(summary.accepted_count) / Number(summary.total_count)) * 100 : 0;

  const STATUS_CONFIG: Record<string, { label: string; class: string; icon: React.ReactNode; color: string; bg: string }> = {
    draft: { label: 'Nháp', class: 'info', icon: <Pencil size={12} />, color: '#475569', bg: '#F1F5F9' },
    sent: { label: 'Chờ phản hồi', class: 'warning', icon: <Send size={12} />, color: '#0F172A', bg: 'rgba(15, 23, 42, 0.06)' },
    accepted: { label: 'Đã duyệt', class: 'success', icon: <FileCheck size={12} />, color: '#0F172A', bg: 'rgba(15, 23, 42, 0.08)' },
    invoiced: { label: 'Đã xuất HĐ', class: 'secondary', icon: <Download size={12} />, color: '#BD1D2D', bg: 'rgba(189, 29, 45, 0.08)' },
    rejected: { label: 'Từ chối', class: 'danger', icon: <XCircle size={12} />, color: '#BD1D2D', bg: 'rgba(189, 29, 45, 0.08)' },
    expired: { label: 'Hết hạn', class: 'secondary', icon: <Clock size={12} />, color: '#64748b', bg: '#F1F5F9' },
  };

  const handleOpenEditor = (quote: any = null) => {
    setEditorQuote(quote);
    setShowEditor(true);
  };

  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/quotes')) return;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('create') === '1' || sessionStorage.getItem('pending_quote_draft')) {
      let initialQuote: any = null;
      try {
        const pending = sessionStorage.getItem('pending_quote_draft');
        if (pending) {
          sessionStorage.removeItem('pending_quote_draft');
          const parsed = JSON.parse(pending);
          const createdAt = parsed?._draft_created_at || 0;
          if (!createdAt || Date.now() - createdAt < 10 * 60 * 1000) {
            initialQuote = parsed;
          }
        }
      } catch (_e) {}

      handleOpenEditor(initialQuote);

      if (urlParams.get('create') === '1') {
        urlParams.delete('create');
        const cleanUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, [location.pathname, location.search]);

  const handleDelete = (id: number) => {
    if (isViewer) return;
    showConfirm({
      title: 'Xóa báo giá',
      message: 'Bạn có chắc chắn muốn chuyển bản báo giá này vào thùng rác (xóa mềm)?',
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          await api.delete(`/quotes/${id}`);
          addToast('Đã xóa báo giá', 'success');
          await fetchQuotes();
        } catch (e: any) {
          addToast(e?.response?.data?.message || 'Lỗi khi xóa báo giá', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  const handleConvertToInvoice = (quote: any) => {
    if (isViewer) return;
    if (quote?.status !== 'accepted' || quote?.converted_invoice_id) {
      addToast('Chỉ báo giá ở trạng thái Đã duyệt và chưa xuất hóa đơn mới có thể chuyển đổi', 'warning');
      return;
    }
    showConfirm({
      title: 'Chuyển thành Hóa đơn',
      message: `Bạn có chắc chắn muốn chuyển báo giá ${quote.quote_number || ''} thành hóa đơn không?`,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          await api.post(`/quotes/${quote.id}/convert`);
          addToast('Đã chuyển thành hóa đơn thành công', 'success');
          await fetchQuotes();
        } catch (e: any) {
          addToast(e.response?.data?.message || 'Lỗi khi chuyển đổi', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  const handleOpenPrintPreview = async (quote: any) => {
    printAbortRef.current?.abort();
    const controller = new AbortController();
    printAbortRef.current = controller;
    setPrintQuote({ ...quote, items: ensureArray(quote.items) });
    setPrintLoading(true);
    try {
      const r = await api.get(`/quotes/${quote.id}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const detail = r.data?.data ?? r.data ?? {};
      setPrintQuote({ ...quote, ...detail, items: extractArray<any>(detail, 'items') });
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      addToast('Không thể tải chi tiết hạng mục để in', 'warning');
    } finally {
      if (!controller.signal.aborted) setPrintLoading(false);
    }
  };

  const handleExportCsv = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const allRows: any[] = [];
      let p = 1;
      const batchSize = 100;
      let hasMore = true;
      while (hasMore && p <= 50) {
        const res = await api.get('/quotes', {
          params: {
            page: p,
            limit: batchSize,
            from: dateRange.from,
            to: dateRange.to,
            status: statusFilter,
            search: debouncedSearch,
          },
        });
        const data = res.data?.data ?? res.data ?? {};
        const chunk = ensureArray<any>(data.items);
        allRows.push(...chunk);
        const totalRows = Number(data.total) || allRows.length;
        if (chunk.length < batchSize || allRows.length >= totalRows) {
          hasMore = false;
        } else {
          p += 1;
        }
      }

      if (allRows.length === 0) {
        addToast('Không có báo giá nào khớp bộ lọc để xuất', 'warning');
        return;
      }

      const headers = ['Mã báo giá', 'Tiêu đề', 'Khách hàng', 'Công ty', 'Trạng thái', 'Tạm tính (VND)', 'Giảm giá (VND)', 'Thuế VAT (VND)', 'Tổng cộng (VND)', 'Hạn hiệu lực', 'Ngày tạo'];
      const rows = allRows.map(q => [
        csvSafe(q.quote_number || ''),
        csvSafe(q.title || ''),
        csvSafe(q.contact_name || 'Khách lẻ'),
        csvSafe(q.company_name || ''),
        csvSafe(STATUS_CONFIG[q.status]?.label || q.status || ''),
        csvSafe(Number(q.subtotal) || 0),
        csvSafe(Number(q.discount) || 0),
        csvSafe(Number(q.tax) || 0),
        csvSafe(Number(q.total) || 0),
        csvSafe(fmtDate(q.valid_until)),
        csvSafe(fmtDate(q.created_at)),
      ].join(','));

      const csvContent = `\uFEFF${headers.map(csvSafe).join(',')}\n${rows.join('\n')}`;
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bao-gia-${getLocalDateStr()}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast(`Đã xuất ${allRows.length} báo giá ra CSV`, 'success');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi xuất báo giá CSV', 'error');
    } finally {
      setExportingCsv(false);
    }
  };

  const handlePrintWindow = () => {
    window.print();
  };

  const safeItems = ensureArray<any>(items);
  const org = config?.organization;
  const orgName = getTenantOrganizationName();
  const orgLogo = getTenantLogoUrl();

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý Báo giá</h1>
          <p className="page-subtitle">Tạo và theo dõi các đề xuất kinh doanh với khách hàng</p>
        </div>
        <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile && !isViewer ? 'repeat(2, minmax(0, 1fr))' : (isMobile ? 'minmax(0, 1fr)' : undefined), gap: '8px', width: isMobile ? '100%' : 'auto' }}>
          <div style={{ minWidth: 0 }}>
            <PeriodFilter value={period} onChange={(p, r) => { setPeriod(p); setDateRange(r); setPage(1); }} />
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exportingCsv}
            className="btn outline"
            style={{
              height: isMobile ? '36px' : '38px',
              fontSize: isMobile ? '0.8rem' : '0.875rem',
              padding: '0 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              borderRadius: '8px',
            }}
            title="Xuất danh sách báo giá CSV"
          >
            <Download size={15} />
            <span>{exportingCsv ? 'Đang xuất...' : 'Xuất CSV'}</span>
          </button>
          {!isViewer && (
            <button 
              type="button"
              onClick={() => handleOpenEditor()} 
              className="btn primary"
              style={{
                height: isMobile ? '36px' : '38px',
                fontSize: isMobile ? '0.8rem' : '0.875rem',
                padding: '0 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                borderRadius: '8px',
                width: isMobile ? '100%' : 'auto',
                background: '#BD1D2D',
                borderColor: '#BD1D2D',
                color: '#FFFFFF',
              }}
              title="Tạo báo giá mới"
            >
              <Plus size={16} />
              <span>{isMobile ? 'Tạo báo giá' : 'Tạo báo giá mới'}</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Section (Chapter V DNA) */}
      <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
        {[
          {
            label: 'Tổng giá trị đề xuất',
            value: FMT(totalVal),
            icon: TrendingUp,
            color: '#BD1D2D',
            bg: 'rgba(189, 29, 45, 0.08)',
            sub: `${total} bản báo giá`,
          },
          {
            label: 'Giá trị đã chốt',
            value: FMT(acceptedVal),
            icon: FileCheck,
            color: '#BD1D2D',
            bg: 'rgba(189, 29, 45, 0.08)',
            sub: 'Đã ký hợp đồng',
          },
          {
            label: 'Đang chờ phản hồi',
            value: String(sentCount),
            icon: Clock,
            color: '#334155',
            bg: 'rgba(15, 23, 42, 0.06)',
            sub: 'Báo giá chờ phản hồi',
          },
          {
            label: 'Tỉ lệ chốt (Win Rate)',
            value: `${convRate.toFixed(1)}%`,
            icon: DollarSign,
            color: '#334155',
            bg: 'rgba(15, 23, 42, 0.06)',
            sub: 'Hiệu suất bán hàng',
          },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div 
              key={i} 
              className="stat-card" 
              initial={{ opacity: 0, y: 12 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: i * 0.05 }} 
              style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                minHeight: '132px',
                padding: '20px',
                borderRadius: '16px',
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="stat-label" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, fontSize: '0.73rem', color: '#64748b' }}>{k.label}</span>
                <div className="stat-icon" style={{
                  background: k.bg,
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: k.color,
                  flexShrink: 0
                }}>
                  <Icon size={17} />
                </div>
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {loading ? (
                  <div className="skeleton" style={{ height: 28, width: '80%', borderRadius: 6, marginBottom: 8 }} />
                ) : (
                  <div className="stat-value" style={{ fontWeight: 800, color: i === 1 ? '#BD1D2D' : '#0F172A', fontSize: '1.65rem', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{k.value}</div>
                )}
                <div className="stat-desc" style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 'auto', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }} title={k.sub}>{k.sub}</div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="card-panel mb-4" style={{ padding: isMobile ? '0.75rem' : '1rem', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '8px' : '16px', flexWrap: 'wrap', width: '100%' }}>
          <div className="filter-search flex-1" style={{ minWidth: isMobile ? '100%' : '200px', width: isMobile ? '100%' : 'auto' }}>
            <Search size={18} className="text-muted" />
            <input 
              placeholder="Tìm theo mã báo giá, tiêu đề hoặc khách hàng..." 
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              style={{ minWidth: 0, width: '100%' }}
            />
          </div>

          {/* Status Dropdown Filter */}
          <div style={{ position: 'relative', width: isMobile ? '100%' : 'auto', minWidth: 0 }} ref={statusDropdownRef}>
            <button
              type="button"
              onClick={() => setIsStatusDropdownOpen(!isStatusDropdownOpen)}
              className="btn secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: isMobile ? '100%' : 'auto',
                minWidth: isMobile ? 0 : '190px',
                justifyContent: 'space-between',
                padding: isMobile ? '0 0.875rem' : '0 1.25rem',
                height: isMobile ? 36 : 38,
                fontSize: isMobile ? '0.8125rem' : '0.875rem',
                borderRadius: '10px',
                background: isStatusDropdownOpen ? '#F8FAFC' : '#FFFFFF',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                fontWeight: 600,
                color: '#0F172A'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={15} style={{ color: '#64748B' }} />
                <span>
                  {statusFilter === '' ? 'Tất cả trạng thái' : (STATUS_CONFIG[statusFilter]?.label || statusFilter)}
                </span>
              </span>
              <ChevronDown size={14} style={{ 
                color: '#64748B',
                transform: isStatusDropdownOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s'
              }} />
            </button>

            <AnimatePresence>
              {isStatusDropdownOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '12px',
                    boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.12)',
                    padding: '6px',
                    zIndex: 30,
                    minWidth: '200px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px'
                  }}
                >
                  {['', 'draft', 'sent', 'accepted', 'invoiced', 'rejected', 'expired'].map(s => {
                    const label = s === '' ? 'Tất cả trạng thái' : (STATUS_CONFIG[s]?.label || s);
                    const isActive = statusFilter === s;
                    return (
                      <div
                        key={s || 'all'}
                        onClick={() => {
                          setStatusFilter(s);
                          setPage(1);
                          setIsStatusDropdownOpen(false);
                        }}
                        style={{
                          padding: '8px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: isActive ? 700 : 500,
                          background: isActive ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                          color: isActive ? '#BD1D2D' : '#0F172A',
                          transition: 'background-color 0.15s ease, color 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between'
                        }}
                        onMouseEnter={e => {
                          if (!isActive) e.currentTarget.style.background = '#F8FAFC';
                        }}
                        onMouseLeave={e => {
                          if (!isActive) e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <span>{label}</span>
                        {isActive && (
                          <div style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#BD1D2D'
                          }} />
                        )}
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* List */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`quote-sk-${i}`} className="card" style={{ padding: '12px 14px', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                <div className="skeleton" style={{ height: 15, width: '60%', borderRadius: 4, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 18, width: '40%', borderRadius: 6 }} />
              </div>
            ))
          ) : safeItems.length === 0 ? (
            <EmptyCard
              icon={<FileText />}
              title="Không tìm thấy báo giá nào"
              description="Hãy thử điều chỉnh bộ lọc hoặc tạo một báo giá mới."
              actionText={isViewer ? undefined : "Tạo báo giá mới"}
              onAction={isViewer ? undefined : () => handleOpenEditor()}
            />
          ) : (
            safeItems.map(q => {
              const st = STATUS_CONFIG[q.status] || { label: q.status, color: '#475569', bg: '#F1F5F9', icon: null };
              const itemsCnt = q.items_count ?? (Array.isArray(q.items) ? q.items.length : 0);
              return (
                <div
                  key={`mob-quote-${q.id}`}
                  onClick={() => handleOpenEditor(q)}
                  className="mobile-card-item"
                  style={{
                    background: '#FFFFFF',
                    border: '1px solid #E2E8F0',
                    borderRadius: '16px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span className="font-bold text-xs font-mono" style={{ color: '#BD1D2D' }}>{q.quote_number}</span>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{q.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                        <Avatar name={q.contact_name || 'Khách lẻ'} size={18} />
                        <span style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {q.contact_name || 'Khách lẻ'}
                        </span>
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 700, color: st.color, background: st.bg }}>
                      {st.icon} {st.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: '8px', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{FMT(q.total)}</div>
                      <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{itemsCnt} hạng mục • Hạn: {fmtDate(q.valid_until)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }} onClick={e => e.stopPropagation()}>
                      <button type="button" className="btn outline sm" onClick={() => handleOpenPrintPreview(q)} title="In báo giá"><Printer size={13} /></button>
                      <button type="button" className="btn outline sm" onClick={() => setPreviewItem(q)}><Eye size={13} /> Xem</button>
                      {!isViewer && (
                        <button type="button" className="btn ghost sm" style={{ color: '#BD1D2D' }} onClick={() => handleDelete(q.id)}><Trash2 size={13} /></button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <Pagination total={total} page={page} pageSize={pageSize || 10} onChange={setPage} />
        </div>
      ) : (
      <div className="card overflow-hidden" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
          <table style={{ minWidth: 850 }}>
            <thead>
              <tr>
                <th className="col-check">
                  <CustomCheckbox 
                    checked={selected.size === safeItems.length && safeItems.length > 0} 
                    onChange={() => setSelected(selected.size === safeItems.length ? new Set() : new Set(safeItems.map(i => i.id)))} 
                  />
                </th>
                <th>MÃ BÁO GIÁ</th>
                <th>TIÊU ĐỀ & KHÁCH HÀNG</th>
                <th>TRẠNG THÁI <Tooltip content="Báo giá có các trạng thái: Nháp, Chờ phản hồi, Đã duyệt (có thể chuyển thành hóa đơn), Đã xuất HĐ, Từ chối hoặc Hết hạn." /></th>
                <th>GIÁ TRỊ</th>
                <th>HẠN HIỆU LỰC <Tooltip content="Báo giá quá hạn hiệu lực sẽ không thể chuyển đổi thành hóa đơn trực tiếp." /></th>
                <th>NGÀY TẠO</th>
                <th style={{ textAlign: 'right' }}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRowSkeleton key={i} cols={8} />
                ))
              ) : safeItems.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={8} style={{ padding: '2rem 1rem' }}>
                    <EmptyCard
                      icon={<FileText />}
                      title="Không tìm thấy báo giá nào"
                      description="Hệ thống không tìm thấy bản báo giá nào khớp với điều kiện lọc hiện tại. Hãy thử điều chỉnh bộ lọc hoặc tạo một báo giá mới."
                      actionText={isViewer ? undefined : "Tạo báo giá mới"}
                      onAction={isViewer ? undefined : () => handleOpenEditor()}
                    />
                  </td>
                </tr>
              ) : (
                safeItems.map(q => {
                  const st = STATUS_CONFIG[q.status] || { label: q.status, color: '#475569', bg: '#F1F5F9', icon: null };
                  const itemsCnt = q.items_count ?? (Array.isArray(q.items) ? q.items.length : 0);
                  const validDate = parseSafeDate(q.valid_until);
                  const isExpired = Boolean(validDate && validDate < new Date() && q.status !== 'accepted' && q.status !== 'invoiced');
                  return (
                    <tr key={q.id} className="table-row-hover" onClick={() => handleOpenEditor(q)}>
                      <td className="col-check" onClick={e => e.stopPropagation()}>
                        <CustomCheckbox checked={selected.has(q.id)} onChange={() => {
                          const ns = new Set(selected);
                          if (ns.has(q.id)) ns.delete(q.id); else ns.add(q.id);
                          setSelected(ns);
                        }} />
                      </td>
                      <td>
                        <span className="font-bold text-xs font-mono" style={{ color: '#BD1D2D' }}>{q.quote_number}</span>
                      </td>
                      <td>
                        <div className="font-bold text-sm" style={{ color: '#0F172A' }}>{q.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                          <Avatar name={q.contact_name || 'Khách lẻ'} size={20} />
                          <span className="text-xs text-light" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#64748B' }}>
                            {q.contact_name || 'Khách lẻ'} {q.company_name ? `(${q.company_name})` : ''}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 700, color: st.color, background: st.bg }}>
                          {st.icon} {st.label}
                        </span>
                      </td>
                      <td>
                        <div className="font-bold text-sm" style={{ color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{FMT(q.total)}</div>
                        <div className="text-[11px]" style={{ color: '#64748B' }}>{itemsCnt} hạng mục</div>
                      </td>
                      <td>
                        <div className="text-xs flex items-center gap-1" style={{ color: isExpired ? '#BD1D2D' : '#334155', fontWeight: isExpired ? 700 : 500 }}>
                          <Calendar size={12} /> {fmtDate(q.valid_until)}
                        </div>
                      </td>
                      <td><span className="text-xs" style={{ color: '#64748B' }}>{fmtDate(q.created_at)}</span></td>
                      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div className="flex gap-2 justify-end">
                          {!isViewer && q.status === 'accepted' && !q.converted_invoice_id && (
                            <button type="button" className="btn-icon sm" title="Chuyển thành Hóa đơn" onClick={() => handleConvertToInvoice(q)} style={{ color: '#BD1D2D', background: 'rgba(189, 29, 45, 0.08)' }}><FileCheck size={14} /></button>
                          )}
                          <button type="button" className="btn-icon sm" title="In / PDF báo giá" onClick={() => handleOpenPrintPreview(q)}><Printer size={14} /></button>
                          <button type="button" className="btn-icon sm" title="Xem nhanh" onClick={() => setPreviewItem(q)}><Eye size={14} /></button>
                          {!isViewer && (
                            <>
                              <button type="button" className="btn-icon sm" title="Chỉnh sửa" onClick={() => handleOpenEditor(q)}><Pencil size={14} /></button>
                              <button type="button" className="btn-icon sm" style={{ color: '#BD1D2D' }} title="Xóa" onClick={() => handleDelete(q.id)}><Trash2 size={14} /></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination total={total} page={page} pageSize={pageSize || 10} onChange={setPage} />
      </div>
      )}

      {/* Editor Modal */}
      {showEditor && (
        <QuoteEditorModal 
          isOpen={showEditor}
          onClose={() => setShowEditor(false)}
          quote={editorQuote}
          isViewer={isViewer}
          onSuccess={() => {
            setShowEditor(false);
            fetchQuotes();
            window.dispatchEvent(new CustomEvent('erp-action-completed', { detail: { actionType: 'quote' } }));
          }}
        />
      )}

      {/* Preview Modal */}
      {Boolean(previewItem) && (
        <QuoteEditorModal 
          isOpen={!!previewItem}
          onClose={() => setPreviewItem(null)}
          quote={previewItem}
          isViewer={true}
          onEdit={() => {
            const itemToEdit = previewItem;
            setPreviewItem(null);
            setTimeout(() => {
              handleOpenEditor(itemToEdit);
            }, 150);
          }}
          onSuccess={() => {
            setPreviewItem(null);
            fetchQuotes();
          }}
        />
      )}

      {/* Printable Quote Sheet Modal */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {printQuote && (
            <motion.div
              key="quote-print-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.5)',
                backdropFilter: 'blur(3px)',
                zIndex: zModalNested,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
              }}
              onClick={() => setPrintQuote(null)}
            >
              <motion.div
                key="quote-print-card"
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: motionMs / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                style={{
                  width: '100%',
                  maxWidth: '820px',
                  maxHeight: '90vh',
                  background: '#FFFFFF',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 25px 60px rgba(15, 23, 42, 0.28)',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Toolbar (hidden on print) */}
                <div className="no-print" style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Printer size={18} style={{ color: '#BD1D2D' }} />
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                      Xem trước bản in Báo giá — {printQuote.quote_number || `#${printQuote.id}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button type="button" className="btn primary sm" style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={handlePrintWindow}>
                      <Printer size={14} /> In / Lưu PDF
                    </button>
                    <button type="button" className="btn-icon sm" onClick={() => setPrintQuote(null)}><X size={18} /></button>
                  </div>
                </div>

                {/* Printable White Sheet */}
                <div style={{ padding: '28px 32px', overflowY: 'auto', background: '#FFFFFF', color: '#0F172A' }}>
                  {/* Organization Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #BD1D2D', paddingBottom: '16px', marginBottom: '20px', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {orgLogo && (
                        <img src={orgLogo} alt={orgName} style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: '8px' }} />
                      )}
                      <div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>{orgName}</div>
                        {org?.address && <div style={{ fontSize: '0.75rem', color: '#475569' }}>{org.address}</div>}
                        <div style={{ fontSize: '0.75rem', color: '#475569', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          {org?.tax_id && <span>MST: {org.tax_id}</span>}
                          {org?.support_hotline && <span>Hotline: {org.support_hotline}</span>}
                          {org?.support_email && <span>Email: {org.support_email}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#BD1D2D', letterSpacing: '0.03em' }}>BÁO GIÁ</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 700, fontFamily: 'monospace', color: '#0F172A' }}>{printQuote.quote_number}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>Ngày lập: {fmtDate(printQuote.created_at)}</div>
                      <div style={{ fontSize: '0.72rem', color: '#64748B' }}>Hiệu lực đến: {fmtDate(printQuote.valid_until)}</div>
                    </div>
                  </div>

                  {/* Customer Block */}
                  <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', marginBottom: '18px' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', color: '#64748B', marginBottom: '4px' }}>Kính gửi Khách hàng</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>{printQuote.contact_name || 'Khách lẻ'}{printQuote.company_name ? ` — ${printQuote.company_name}` : ''}</div>
                    <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
                      {printQuote.title}
                      {printQuote.contact_phone ? ` • SĐT: ${printQuote.contact_phone}` : ''}
                      {printQuote.contact_email ? ` • Email: ${printQuote.contact_email}` : ''}
                    </div>
                  </div>

                  {/* Items Table */}
                  {printLoading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '2rem', color: '#64748B' }}>
                      <Loader2 size={16} className="spin" />
                      <span>Đang tải chi tiết hạng mục...</span>
                    </div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '18px' }}>
                      <thead>
                        <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #CBD5E1' }}>
                          <th style={{ padding: '8px', textAlign: 'center', width: '40px' }}>STT</th>
                          <th style={{ padding: '8px', textAlign: 'left' }}>Sản phẩm / Dịch vụ</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '70px' }}>SL</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '115px' }}>Đơn giá</th>
                          <th style={{ padding: '8px', textAlign: 'center', width: '75px' }}>Giảm (%)</th>
                          <th style={{ padding: '8px', textAlign: 'right', width: '130px' }}>Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ensureArray<any>(printQuote.items).map((it: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #E2E8F0' }}>
                            <td style={{ padding: '8px', textAlign: 'center', color: '#64748B' }}>{idx + 1}</td>
                            <td style={{ padding: '8px' }}>
                              <div style={{ fontWeight: 600, color: '#0F172A' }}>{it.name}</div>
                              {it.description && <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>{it.description}</div>}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Number(it.quantity) || 0}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{FMT(Number(it.unit_price) || 0)}</td>
                            <td style={{ padding: '8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{Number(it.discount) || 0}%</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{FMT(Number(it.subtotal) || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Financial Totals */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                    <div style={{ width: '300px', borderTop: '1px solid #E2E8F0', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Tạm tính:</span>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{FMT(printQuote.subtotal)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Giảm giá:</span>
                        <strong style={{ color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>-{FMT(printQuote.discount)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#64748B' }}>Thuế VAT:</span>
                        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{FMT(printQuote.tax)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #CBD5E1', paddingTop: '8px', fontSize: '1rem', fontWeight: 800, color: '#BD1D2D' }}>
                        <span>Tổng cộng:</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{FMT(printQuote.total)}</span>
                      </div>
                      {Number(printQuote.total) > 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#475569', textAlign: 'right', fontStyle: 'italic' }}>
                          Bằng chữ: {numberToVietnameseText(Number(printQuote.total))}
                        </div>
                      )}
                    </div>
                  </div>

                  {(printQuote.terms || printQuote.notes) && (
                    <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '12px', fontSize: '0.78rem', color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {printQuote.terms && <div><strong>Điều khoản:</strong><div style={{ whiteSpace: 'pre-wrap', marginTop: '4px' }}>{printQuote.terms}</div></div>}
                      {printQuote.notes && <div><strong>Ghi chú:</strong><div style={{ whiteSpace: 'pre-wrap', marginTop: '4px' }}>{printQuote.notes}</div></div>}
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
