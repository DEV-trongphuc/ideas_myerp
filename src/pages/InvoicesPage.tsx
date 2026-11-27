import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FileText, Plus, Search, Download, CheckCircle2, Clock, AlertCircle,
  Eye, Trash2, Printer, X, ArrowUpRight, ArrowDownRight, TrendingUp,
  Package, ShoppingBag, Receipt, Ban, Send
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { isExecutive, isAccountant, isManagement, isSales, isViewer as checkIsViewer } from '../utils/roleUtils';
import { PeriodFilter, getDateRange } from '../components/ui/PeriodFilter';
import { CustomCheckbox } from '../components/ui/CustomCheckbox';
import type { Period, DateRange } from '../components/ui/PeriodFilter';
import { Pagination } from '../components/ui/Pagination';
import { ResponsiveSegmentedTabs } from '../components/ui/MobileResponsiveTabs';
import api from '../api/axios';
import { EmptyCard } from '../components/ui/EmptyCard';
import { Tooltip } from '../components/ui/Tooltip';
import { useDebounce } from '../hooks/useDebounce';
import { Avatar } from '../components/ui/Avatar';
import { InvoiceQuickViewModal } from '../components/InvoiceQuickViewModal';
import { POSModal } from '../components/ui/POSModal';
import { CustomModal } from '../components/ui/CustomModal';
import { formatDateVN, getLocalDateStr } from '../utils/dateUtils';
import { extractArray, ensureArray } from '../utils/safeArray';
import { escapeHtml } from '../utils/sanitizeHtml';
import { downloadExportFile } from '../utils/exportHelper';
import {
  DomKpiTile,
  DomToolbarButton,
  DomSegmentedSwitch,
} from '../components/Dashboard/DomationDashboardKit';

const FMT = (n: number, currency = 'VND') => {
  const num = Number(n || 0);
  if (currency !== 'VND') {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num)} ${currency}`;
  }
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(num);
};

const csvSafe = (val: any): string => {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #E2E8F0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
};

const calcPctChange = (cur: number, prev: number): number | null => {
  if (!prev || prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
};

interface InvoicesKpiStripProps {
  isMobile: boolean;
  loading: boolean;
  total: number;
  period: string;
  defaultCurrency: string;
  totalRev: number;
  prevTotalRev: number;
  paidAmt: number;
  prevPaidAmt: number;
  pendingAmt: number;
  prevPendingAmt: number;
  overdueAmt: number;
  prevOverdueAmt: number;
}

const InvoicesKpiStrip: React.FC<InvoicesKpiStripProps> = React.memo(({
  isMobile,
  loading,
  total,
  period,
  defaultCurrency,
  totalRev,
  prevTotalRev,
  paidAmt,
  prevPaidAmt,
  pendingAmt,
  prevPendingAmt,
  overdueAmt,
  prevOverdueAmt,
}) => (
  <div
    className="responsive-grid-4 dashboard-kpi-grid"
    style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
      gap: '16px',
      marginBottom: '20px',
    }}
  >
    <DomKpiTile
      label="TỔNG GIÁ TRỊ HÓA ĐƠN"
      value={FMT(totalRev, defaultCurrency)}
      icon={<TrendingUp size={16} />}
      accent="brand"
      loading={loading}
      growth={calcPctChange(totalRev, prevTotalRev)}
      breakdown={
        <>
          <span>Tổng bản ghi: <strong style={{ color: '#0F172A' }}>{total}</strong></span>
          <span>Kỳ lọc: <strong style={{ color: '#0F172A' }}>{period}</strong></span>
        </>
      }
    />
    <DomKpiTile
      label="ĐÃ THU HỒI"
      value={FMT(paidAmt, defaultCurrency)}
      icon={<CheckCircle2 size={16} />}
      accent="brand"
      valueTone="brand"
      loading={loading}
      growth={calcPctChange(paidAmt, prevPaidAmt)}
      breakdown={
        <>
          <span>Tỷ lệ thu: <strong style={{ color: '#BD1D2D' }}>{totalRev > 0 ? Math.round((paidAmt / totalRev) * 100) : 0}%</strong></span>
          <span>Trong kỳ báo cáo</span>
        </>
      }
    />
    <DomKpiTile
      label="CHỜ THANH TOÁN"
      value={FMT(pendingAmt, defaultCurrency)}
      icon={<Clock size={16} />}
      accent="slate"
      loading={loading}
      growth={calcPctChange(pendingAmt, prevPendingAmt)}
      breakdown={
        <>
          <span>Tỷ trọng chờ: <strong style={{ color: '#0F172A' }}>{totalRev > 0 ? Math.round((pendingAmt / totalRev) * 100) : 0}%</strong></span>
          <span>Công nợ chưa thu</span>
        </>
      }
    />
    <DomKpiTile
      label="NỢ QUÁ HẠN"
      value={FMT(overdueAmt, defaultCurrency)}
      icon={<AlertCircle size={16} />}
      accent={overdueAmt > 0 ? 'rose' : 'slate'}
      valueTone={overdueAmt > 0 ? 'brand' : 'default'}
      loading={loading}
      growth={calcPctChange(overdueAmt, prevOverdueAmt)}
      breakdown={
        <>
          <span>Tỷ trọng quá hạn: <strong style={{ color: '#BD1D2D' }}>{totalRev > 0 ? Math.round((overdueAmt / totalRev) * 100) : 0}%</strong></span>
          <span>Cần nhắc thanh toán</span>
        </>
      }
    />
  </div>
));

export interface InvoicesPageProps {
  defaultTab?: 'invoices' | 'sales_orders' | 'pos';
}

export const InvoicesPage: React.FC<InvoicesPageProps> = ({ defaultTab = 'invoices' }) => {
  const { addToast, showConfirm, closeConfirm } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm, closeConfirm: s.closeConfirm })));
  const { user } = useAuth();
  const { hasPermission } = useTenantConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const defaultCurrency = useTypedSubSetting<string>('finance.currency_and_fx_rates', 'default', 'VND');
  const defaultInvPageSize = useTypedSubSetting<number>('finance.ui_pagination_sizes', 'invoices', 10);

  const [activeMode, setActiveMode] = useState<'invoices' | 'sales_orders' | 'pos'>(defaultTab);
  useEffect(() => {
    setActiveMode(defaultTab);
  }, [defaultTab]);

  // Shared filter states
  const [period, setPeriod] = useState<Period>('all');
  const [dateRange, setDateRange] = useState<DateRange>(getDateRange('all'));
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(defaultInvPageSize || 10);
  const [isMobile, setIsMobile] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Invoices states
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewItem, setPreviewItem] = useState<any>(null);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<any>({ total_rev: 0, paid_amt: 0, pending_amt: 0, overdue_amt: 0 });
  const [showPosModal, setShowPosModal] = useState(false);

  // Sales Orders states
  const [soList, setSoList] = useState<any[]>([]);
  const [soTotal, setSoTotal] = useState(0);
  const [soLoading, setSoLoading] = useState(false);
  const [soPreview, setSoPreview] = useState<any>(null);
  const [rejectModalSo, setRejectModalSo] = useState<any>(null);
  const [rejectReasonText, setRejectReasonText] = useState('');

  // POS orders & sessions states
  const [posOrders, setPosOrders] = useState<any[]>([]);
  const [posSessions, setPosSessions] = useState<any[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [openCashInput, setOpenCashInput] = useState('0');
  const [closeCashInput, setCloseCashInput] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef<Record<string, boolean>>({});

  const isViewer = checkIsViewer(user);
  const canWriteInvoice = !isViewer && (
    isExecutive(user) || isAccountant(user, false) || isManagement(user) || isSales(user) || hasPermission('invoices', 'write')
  );
  const canDeleteInvoice = !isViewer && (isExecutive(user) || isAccountant(user, false) || hasPermission('invoices', 'delete'));
  const canApproveSO = !isViewer && (isExecutive(user) || isAccountant(user, false) || isManagement(user) || hasPermission('sales_orders', 'approve'));

  const fetchInvoices = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const r = await api.get('/invoices', {
        params: { page, limit: pageSize, from: dateRange.from, to: dateRange.to, status: statusFilter, search: debouncedSearch },
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      const data = r.data?.data || {};
      setItems(extractArray(data, 'items'));
      setTotal(Number(data.total || 0));
      setSummary(data.summary || { total_rev: 0, paid_amt: 0, pending_amt: 0, overdue_amt: 0 });
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || ctrl.signal.aborted) return;
      setItems([]);
      setTotal(0);
      addToast(e?.response?.data?.message || 'Không thể tải danh sách hóa đơn', 'error');
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [page, pageSize, dateRange, statusFilter, debouncedSearch, addToast]);

  const fetchSalesOrders = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSoLoading(true);
    try {
      const r = await api.get('/sales-orders', {
        params: { page, limit: pageSize, from: dateRange.from, to: dateRange.to, status: statusFilter, search: debouncedSearch },
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      const data = r.data?.data || {};
      setSoList(extractArray(data, 'items'));
      setSoTotal(Number(data.total || extractArray(data, 'items').length));
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || ctrl.signal.aborted) return;
      setSoList([]);
      setSoTotal(0);
      addToast(e?.response?.data?.message || 'Không thể tải danh sách đơn bán hàng (SO)', 'error');
    } finally {
      if (!ctrl.signal.aborted) setSoLoading(false);
    }
  }, [page, pageSize, dateRange, statusFilter, debouncedSearch, addToast]);

  const fetchPosData = useCallback(async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPosLoading(true);
    try {
      const [ordRes, sessRes] = await Promise.all([
        api.get('/pos/orders', { params: { page, limit: pageSize, search: debouncedSearch }, signal: ctrl.signal }).catch(() => ({ data: { data: [] } })),
        api.get('/pos/sessions', { params: { limit: 10 }, signal: ctrl.signal }).catch(() => ({ data: { data: [] } })),
      ]);
      if (ctrl.signal.aborted) return;
      setPosOrders(extractArray(ordRes?.data, 'items'));
      setPosSessions(extractArray(sessRes?.data, 'items'));
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || ctrl.signal.aborted) return;
    } finally {
      if (!ctrl.signal.aborted) setPosLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useEffect(() => {
    if (activeMode === 'invoices') fetchInvoices();
    else if (activeMode === 'sales_orders') fetchSalesOrders();
    else fetchPosData();
    return () => abortRef.current?.abort();
  }, [activeMode, fetchInvoices, fetchSalesOrders, fetchPosData]);

  // Handle ?open_id= deep link cleanly & clear on close
  useEffect(() => {
    const rawId = searchParams.get('open_id') || searchParams.get('id');
    if (!rawId) return;
    const parsed = Number(rawId);
    if (!Number.isInteger(parsed) || parsed <= 0) return;

    if (activeMode === 'sales_orders') {
      api.get(`/sales-orders/${parsed}`)
        .then(r => { if (r.data?.data) setSoPreview(r.data.data); })
        .catch(() => addToast('Không tìm thấy đơn bán hàng', 'warning'));
    } else {
      setPreviewItem({ id: parsed });
    }
  }, [searchParams, activeMode, addToast]);

  const clearOpenIdParam = () => {
    if (searchParams.has('open_id') || searchParams.has('id')) {
      const next = new URLSearchParams(searchParams);
      next.delete('open_id');
      next.delete('id');
      setSearchParams(next, { replace: true });
    }
  };

  useEffect(() => {
    if (!location.pathname.startsWith('/invoices')) return;
    if (location.state?.openCreate) {
      setShowPosModal(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.state, navigate]);

  const totalRev = Number(summary.total_rev || 0);
  const paidAmt = Number(summary.paid_amt || 0);
  const pendingAmt = Number(summary.pending_amt || 0);
  const overdueAmt = Number(summary.overdue_amt || 0);
  const prevTotalRev = Number(summary.prev_total_rev || 0);
  const prevPaidAmt = Number(summary.prev_paid_amt || 0);
  const prevPendingAmt = Number(summary.prev_pending_amt || 0);
  const prevOverdueAmt = Number(summary.prev_overdue_amt || 0);

  const getChangePercent = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
    paid: { label: 'Đã thanh toán', icon: <CheckCircle2 size={11} /> },
    pending: { label: 'Chờ thanh toán', icon: <Clock size={11} /> },
    overdue: { label: 'Quá hạn', icon: <AlertCircle size={11} /> },
    cancelled: { label: 'Đã hủy', icon: <Ban size={11} /> },
  };

  const toggleSelect = (id: number) => setSelected(prev => {
    const ns = new Set(prev);
    if (ns.has(id)) ns.delete(id);
    else ns.add(id);
    return ns;
  });
  const allSelected = items.length > 0 && items.every(i => selected.has(i.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map(i => i.id)));

  const handleMarkPaid = (inv: any) => {
    showConfirm({
      title: 'Xác nhận thanh toán',
      message: `Đánh dấu hóa đơn ${inv.invoice_number} đã được thanh toán đầy đủ?`,
      confirmText: 'Xác nhận',
      onConfirm: async () => {
        const key = `pay_${inv.id}`;
        if (mutationInFlightRef.current[key]) return;
        mutationInFlightRef.current[key] = true;
        try {
          await api.post(`/invoices/${inv.id}/pay`);
          addToast(`Đã cập nhật ${inv.invoice_number} thành Đã thanh toán`, 'success');
          fetchInvoices();
        } catch (e: any) {
          addToast(e.response?.data?.message || 'Không thể cập nhật trạng thái', 'error');
        } finally {
          mutationInFlightRef.current[key] = false;
          closeConfirm();
        }
      },
    });
  };

  const handleSendReminder = (inv: any) => {
    const targetUid = Number(inv.created_by || 0);
    if (!targetUid || targetUid === Number(user?.id || 0)) {
      addToast('Hóa đơn chưa có nhân sự phụ trách khác để gửi nhắc nhở', 'warning');
      return;
    }
    showConfirm({
      title: 'Gửi nhắc nhở thu hồi công nợ',
      message: `Gửi thông báo nhắc nhở thu tiền hóa đơn ${inv.invoice_number} (${inv.contact_name || 'Khách lẻ'}) cho nhân sự phụ trách?`,
      confirmText: 'Gửi ngay',
      onConfirm: async () => {
        try {
          await api.post('/notifications/reminder', {
            target_user_id: targetUid,
            item_type: 'invoice',
            item_id: inv.id,
            item_title: inv.invoice_number || inv.title,
            message: `Hóa đơn ${inv.invoice_number} (${FMT(inv.total, defaultCurrency)}) đến hạn ${formatDateVN(inv.due_date)}. Vui lòng theo dõi thu hồi công nợ.`,
          });
          addToast(`Đã gửi nhắc nhở hóa đơn ${inv.invoice_number}`, 'success');
        } catch (e: any) {
          addToast(e.response?.data?.message || 'Không thể gửi nhắc nhở', 'error');
        } finally {
          closeConfirm();
        }
      },
    });
  };

  const handleBulkPrint = () => {
    const selectedInvoices = items.filter(i => selected.has(i.id));
    if (selectedInvoices.length === 0) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
      addToast('Trình duyệt đang chặn cửa sổ in mới', 'warning');
      return;
    }
    const rowsHtml = selectedInvoices.map((inv, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeHtml(inv.invoice_number)}</strong></td>
        <td>${escapeHtml(inv.contact_name || inv.company_name || 'Khách lẻ')}</td>
        <td>${escapeHtml(inv.title || '')}</td>
        <td style="text-align:right">${escapeHtml(FMT(inv.total, defaultCurrency))}</td>
        <td>${escapeHtml(formatDateVN(inv.due_date))}</td>
        <td>${escapeHtml(STATUS_CONFIG[inv.status]?.label || inv.status)}</td>
      </tr>
    `).join('');
    win.document.write(`<!doctype html><html><head><title>In danh sách Hóa đơn</title>
      <style>body{font-family:sans-serif;padding:24px;background:#fff;color:#0f172a}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #e2e8f0;padding:8px;font-size:13px;text-align:left}th{background:#f8fafc}</style>
      </head><body><h2>Bảng kê Hóa đơn (${selectedInvoices.length} chứng từ)</h2>
      <table><thead><tr><th>#</th><th>Mã HĐ</th><th>Khách hàng</th><th>Nội dung</th><th>Số tiền</th><th>Hạn TT</th><th>Trạng thái</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table><script>window.onload=function(){window.print();}</script></body></html>`);
    win.document.close();
  };

  const handleBulkDeleteInvoices = () => {
    const ids = Array.from(selected);
    if (ids.length === 0 || !canDeleteInvoice) return;
    showConfirm({
      title: `Xóa mềm ${ids.length} hóa đơn đã chọn?`,
      message: `Thao tác sẽ lưu trữ mềm ${ids.length} hóa đơn đã chọn. Bạn không thể thao tác trực tiếp lên hóa đơn đã xóa.`,
      confirmText: 'Xác nhận xóa',
      isDanger: true,
      onConfirm: async () => {
        if (mutationInFlightRef.current.bulkDelete) return;
        mutationInFlightRef.current.bulkDelete = true;
        let successCount = 0;
        try {
          for (const id of ids) {
            try {
              await api.delete(`/invoices/${id}`);
              successCount += 1;
            } catch {
              // continue remaining items
            }
          }
          if (successCount > 0) {
            addToast(`Đã xóa ${successCount}/${ids.length} hóa đơn`, 'success');
            setSelected(new Set());
            fetchInvoices();
          } else {
            addToast('Không thể xóa các hóa đơn đã chọn', 'error');
          }
        } finally {
          mutationInFlightRef.current.bulkDelete = false;
          closeConfirm();
        }
      },
    });
  };

  const handleExportCSV = async () => {
    try {
      await downloadExportFile({
        endpoint: '/export',
        params: {
          type: activeMode === 'sales_orders' ? 'sales_orders' : 'invoices',
          from: dateRange.from,
          to: dateRange.to,
          status: statusFilter,
          search: debouncedSearch,
        },
        defaultFilename: `${activeMode}_${getLocalDateStr()}.csv`,
        onSuccess: () => addToast('Đã xuất dữ liệu CSV đầy đủ', 'success'),
      });
    } catch {
      // Safe fallback client-side UTF-8 BOM Blob export
      const headers = ['Mã', 'Khách hàng', 'Nội dung', 'Tổng tiền', 'Ngày lập', 'Đến hạn', 'Trạng thái'];
      const source = activeMode === 'sales_orders' ? soList : items;
      const rows = source.map(i => [
        i.invoice_number || i.so_number, i.contact_name || i.company_name, i.title || '', i.total, i.issue_date || i.order_date || i.created_at, i.due_date || i.delivery_date || '', i.status
      ]);
      const csvContent = '\uFEFF' + [headers.map(csvSafe).join(','), ...rows.map(r => r.map(csvSafe).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${activeMode}_${getLocalDateStr()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      addToast('Đã xuất file CSV hiện tại', 'success');
    }
  };

  const handleSoAction = async (action: 'approve' | 'reject' | 'convert' | 'cancel' | 'delete', so: any, reason?: string) => {
    const lockKey = `so_${action}_${so.id}`;
    if (mutationInFlightRef.current[lockKey]) return;
    mutationInFlightRef.current[lockKey] = true;
    try {
      if (action === 'approve') {
        await api.post(`/sales-orders/${so.id}/approve`);
        addToast(`Đã duyệt đơn bán hàng ${so.so_number}`, 'success');
      } else if (action === 'reject') {
        await api.post(`/sales-orders/${so.id}/reject`, { reason });
        addToast(`Đã từ chối đơn ${so.so_number}`, 'success');
      } else if (action === 'convert') {
        const res = await api.post(`/sales-orders/${so.id}/convert-to-invoice`);
        addToast(`Đã xuất hóa đơn cho ${so.so_number}`, 'success');
        if (res.data?.data?.invoice_id) {
          setPreviewItem({ id: res.data.data.invoice_id });
        }
      } else if (action === 'cancel') {
        await api.post(`/sales-orders/${so.id}/cancel`);
        addToast(`Đã hủy đơn ${so.so_number}`, 'success');
      } else if (action === 'delete') {
        await api.delete(`/sales-orders/${so.id}`);
        addToast(`Đã xóa đơn ${so.so_number}`, 'success');
      }
      fetchSalesOrders();
    } catch (e: any) {
      addToast(e.response?.data?.message || 'Thao tác thất bại', 'error');
    } finally {
      mutationInFlightRef.current[lockKey] = false;
      closeConfirm();
    }
  };

  const handleOpenSession = async () => {
    if (mutationInFlightRef.current.openSess) return;
    mutationInFlightRef.current.openSess = true;
    try {
      await api.post('/pos/sessions/open', { opening_cash: Math.max(0, Number(openCashInput || 0)) });
      addToast('Mở ca bán hàng POS thành công', 'success');
      fetchPosData();
    } catch (e: any) {
      addToast(e.response?.data?.message || 'Không thể mở ca POS', 'error');
    } finally {
      mutationInFlightRef.current.openSess = false;
    }
  };

  const handleCloseSession = async (sessId: number) => {
    if (mutationInFlightRef.current.closeSess) return;
    mutationInFlightRef.current.closeSess = true;
    try {
      await api.post(`/pos/sessions/${sessId}/close`, { closing_cash: Math.max(0, Number(closeCashInput || 0)) });
      addToast(`Đã chốt ca POS #${sessId}`, 'success');
      setCloseCashInput('');
      fetchPosData();
    } catch (e: any) {
      addToast(e.response?.data?.message || 'Không thể chốt ca POS', 'error');
    } finally {
      mutationInFlightRef.current.closeSess = false;
    }
  };

  const openPosSession = posSessions.find((s: any) => s.status === 'open');

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header" style={isMobile ? { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '10px' } : undefined}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">Hóa đơn, Đơn bán (SO) & Thu tiền POS</h1>
          <p className="page-subtitle">Quản lý hóa đơn tài chính, đơn bán hàng SO và giao dịch POS theo thời gian thực</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <PeriodFilter
            value={period}
            onChange={(p, r) => { setPeriod(p); setDateRange(r); setPage(1); }}
            buttonStyle={{ height: 36, minHeight: 36, borderRadius: 10 }}
          />
          <DomToolbarButton variant="outline" icon={<Download size={15} />} onClick={handleExportCSV} title="Xuất CSV">
            Xuất CSV
          </DomToolbarButton>
          {canWriteInvoice && (
            <DomToolbarButton variant="primary" icon={<Plus size={15} />} onClick={() => setShowPosModal(true)} title="Bán hàng POS">
              Bán hàng POS
            </DomToolbarButton>
          )}
        </div>
      </div>

      {/* Mode Switcher */}
      <div style={{ marginBottom: '18px' }}>
        <ResponsiveSegmentedTabs
          activeId={activeMode}
          onChange={(id) => { setActiveMode(id as any); setStatusFilter(''); setPage(1); setSelected(new Set()); }}
          mobileMaxVisible={3}
          tabs={[
            { id: 'invoices', label: 'Hóa đơn (Invoices)', icon: <FileText size={14} /> },
            { id: 'sales_orders', label: 'Đơn bán hàng (SO)', icon: <ShoppingBag size={14} /> },
            { id: 'pos', label: 'Ca & Đơn POS', icon: <Receipt size={14} /> },
          ]}
        />
      </div>

      {activeMode === 'invoices' && (
        <>
          <InvoicesKpiStrip
            isMobile={isMobile}
            loading={loading}
            total={total}
            period={period}
            defaultCurrency={defaultCurrency}
            totalRev={totalRev}
            prevTotalRev={prevTotalRev}
            paidAmt={paidAmt}
            prevPaidAmt={prevPaidAmt}
            pendingAmt={pendingAmt}
            prevPendingAmt={prevPendingAmt}
            overdueAmt={overdueAmt}
            prevOverdueAmt={prevOverdueAmt}
          />

          {/* Status Segmented Tabs + Search Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <DomSegmentedSwitch
              value={statusFilter}
              onChange={(id) => { setStatusFilter(id); setPage(1); }}
              options={[
                { value: '', label: 'Tất cả' },
                { value: 'paid', label: 'Đã thanh toán' },
                { value: 'pending', label: 'Chờ thanh toán' },
                { value: 'overdue', label: 'Quá hạn' },
              ]}
            />
          </div>

          <div className="card" style={{ ...cardStyle, padding: '0.875rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="filter-search" style={{ flex: 1, minWidth: '180px' }}>
              <Search size={15} style={{ color: '#64748B' }} />
              <input placeholder="Tìm mã hóa đơn, khách hàng, công ty..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ width: '100%' }} />
              {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
            </div>
            {selected.size > 0 && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <DomToolbarButton variant="outline" icon={<Printer size={14} />} onClick={handleBulkPrint}>
                  In {selected.size} HĐ
                </DomToolbarButton>
                {canDeleteInvoice && (
                  <DomToolbarButton variant="danger" icon={<Trash2 size={14} />} onClick={handleBulkDeleteInvoices}>
                    Xóa {selected.size}
                  </DomToolbarButton>
                )}
              </div>
            )}
          </div>

          {/* Invoices Table */}
          <div className="card" style={{ ...cardStyle, overflow: 'visible' }}>
            <div className="table-wrap responsive-table-wrap mobile-card-table" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th className="col-check"><CustomCheckbox checked={allSelected} onChange={toggleAll} /></th>
                    <th>Hóa đơn <Tooltip content="Mã định danh duy nhất của hóa đơn tài chính & nội dung diễn giải." /></th>
                    <th>Khách hàng</th>
                    <th>Số tiền</th>
                    <th>Thời hạn</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j}><div className="skeleton" style={{ height: 20, borderRadius: 4 }} /></td>)}</tr>
                  ))}
                  {!loading && items.map(inv => {
                    const sc = STATUS_CONFIG[inv.status] || { label: inv.status, icon: null };
                    const isOverdue = inv.status === 'overdue';
                    return (
                      <tr key={inv.id} style={{ background: isOverdue ? 'rgba(189,29,45,0.02)' : undefined, cursor: 'pointer' }} className="table-row-hover" onClick={() => setPreviewItem(inv)}>
                        <td data-label="Chọn" className="col-check" onClick={e => e.stopPropagation()}>
                          <CustomCheckbox checked={selected.has(inv.id)} onChange={() => toggleSelect(inv.id)} />
                        </td>
                        <td data-label="Hóa đơn">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontWeight: 700, color: '#BD1D2D', fontSize: '0.8125rem', fontFamily: 'monospace' }}>{inv.invoice_number}</span>
                              {inv.is_inventory_deducted === 1 && (
                                <Tooltip content="Hóa đơn này đã khấu trừ kho FIFO.">
                                  <Package size={12} style={{ color: '#334155', cursor: 'help' }} />
                                </Tooltip>
                              )}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={inv.title}>{inv.title}</div>
                          </div>
                        </td>
                        <td data-label="Khách hàng">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Avatar name={inv.contact_name || inv.company_name || 'Khách lẻ'} size="sm" />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#0F172A' }}>{inv.contact_name || inv.company_name || 'Khách lẻ'}</div>
                              {inv.company_name && inv.contact_name && <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{inv.company_name}</div>}
                            </div>
                          </div>
                        </td>
                        <td data-label="Số tiền"><span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{FMT(inv.total, defaultCurrency)}</span></td>
                        <td data-label="Thời hạn">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '0.75rem' }}>
                            <span style={{ color: '#64748B' }}>Lập: {formatDateVN(inv.issue_date || inv.created_at)}</span>
                            <span style={{ color: isOverdue ? '#BD1D2D' : '#64748B', fontWeight: isOverdue ? 700 : 500 }}>Hạn: {formatDateVN(inv.due_date)}</span>
                          </div>
                        </td>
                        <td data-label="Trạng thái">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: inv.status === 'paid' ? '#F1F5F9' : '#FEF2F2', color: inv.status === 'paid' ? '#0F172A' : '#BD1D2D' }}>
                            {sc.icon} {sc.label}
                          </span>
                        </td>
                        <td data-label="Thao tác" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn-icon sm" title="Xem & In" onClick={() => setPreviewItem(inv)}><Eye size={14} /></button>
                            {canWriteInvoice && inv.status !== 'paid' && (
                              <>
                                <button className="btn-icon sm" title="Gửi nhắc thu tiền" onClick={() => handleSendReminder(inv)}><Send size={14} /></button>
                                <button className="btn-icon sm" title="Đánh dấu đã thanh toán" onClick={() => handleMarkPaid(inv)} style={{ color: '#334155' }}><CheckCircle2 size={14} /></button>
                              </>
                            )}
                            {canDeleteInvoice && (
                              <button
                                className="btn-icon sm text-danger"
                                title="Xóa mềm"
                                onClick={() => {
                                  showConfirm({
                                    title: `Xóa hóa đơn ${inv.invoice_number}?`,
                                    message: `Hóa đơn này sẽ được lưu trữ mềm trong hệ thống.`,
                                    confirmText: 'Xóa ngay',
                                    cancelText: 'Hủy',
                                    isDanger: true,
                                    onConfirm: async () => {
                                      try {
                                        await api.delete(`/invoices/${inv.id}`);
                                        addToast('Đã xóa hóa đơn', 'success');
                                        fetchInvoices();
                                      } catch (e: any) {
                                        addToast(e.response?.data?.message || 'Không thể xóa hóa đơn', 'error');
                                      } finally {
                                        closeConfirm();
                                      }
                                    },
                                  });
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!loading && items.length === 0 && (
                    <tr className="empty-state-row">
                      <td colSpan={7} style={{ padding: '2rem 1rem' }}>
                        <EmptyCard icon={<FileText />} title="Không tìm thấy Hóa đơn nào" description="Không có hóa đơn nào khớp với bộ lọc hoặc khoảng thời gian hiện tại." />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination total={total} page={page} pageSize={pageSize} onChange={setPage} showSizeChanger onPageSizeChange={(newSize) => { setPageSize(newSize); setPage(1); }} />
          </div>
        </>
      )}

      {activeMode === 'sales_orders' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <ResponsiveSegmentedTabs
              activeId={statusFilter}
              onChange={(id) => { setStatusFilter(id); setPage(1); }}
              mobileMaxVisible={4}
              tabs={[
                { id: '', label: 'Tất cả SO' },
                { id: 'pending_approval', label: 'Chờ duyệt' },
                { id: 'approved', label: 'Đã duyệt' },
                { id: 'completed', label: 'Hoàn tất / Đã xuất HĐ' },
                { id: 'cancelled', label: 'Đã hủy / Từ chối' },
              ]}
            />
          </div>

          <div className="card" style={{ ...cardStyle, padding: '0.875rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div className="filter-search" style={{ flex: 1 }}>
              <Search size={15} style={{ color: '#64748B' }} />
              <input placeholder="Tìm mã SO, khách hàng..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ width: '100%' }} />
              {search && <button onClick={() => setSearch('')}><X size={13} /></button>}
            </div>
          </div>

          <div className="card" style={{ ...cardStyle, overflow: 'visible' }}>
            <div className="table-wrap responsive-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã SO</th>
                    <th>Khách hàng</th>
                    <th>Tổng tiền</th>
                    <th>Ngày đặt</th>
                    <th>Trạng thái</th>
                    <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {soLoading && Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><div className="skeleton" style={{ height: 20, borderRadius: 4 }} /></td>)}</tr>
                  ))}
                  {!soLoading && soList.map((so: any) => {
                    const isSelf = Number(so.created_by || 0) === Number(user?.id || 0);
                    const canActApproval = canApproveSO && ['draft', 'pending', 'pending_approval'].includes(so.status) && (!isSelf || isExecutive(user));
                    const canConvert = canWriteInvoice && so.status === 'approved' && !so.invoice_id;
                    return (
                      <tr key={so.id} className="table-row-hover" style={{ cursor: 'pointer' }} onClick={() => setSoPreview(so)}>
                        <td style={{ fontWeight: 700, color: '#BD1D2D', fontFamily: 'monospace' }}>{so.so_number || `#SO-${so.id}`}</td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#0F172A' }}>{so.contact_name || so.company_name || 'Khách lẻ'}</div>
                          <div style={{ fontSize: '0.75rem', color: '#64748B' }}>{so.creator_name || ''}</div>
                        </td>
                        <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{FMT(so.total || 0, defaultCurrency)}</td>
                        <td style={{ fontSize: '0.8rem', color: '#64748B' }}>{formatDateVN(so.order_date || so.created_at)}</td>
                        <td>
                          <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700, background: so.status === 'cancelled' ? '#FEF2F2' : '#F1F5F9', color: so.status === 'cancelled' ? '#BD1D2D' : '#0F172A' }}>
                            {so.status}
                          </span>
                        </td>
                        <td onClick={e => e.stopPropagation()}>
                          <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn-icon sm" title="Xem SO" onClick={() => setSoPreview(so)}><Eye size={14} /></button>
                            {canActApproval && (
                              <>
                                <button
                                  className="btn outline sm"
                                  onClick={() => showConfirm({ title: `Duyệt đơn ${so.so_number}?`, message: 'Xác nhận phê duyệt đơn bán hàng này.', confirmText: 'Duyệt', onConfirm: () => handleSoAction('approve', so) })}
                                >
                                  Duyệt
                                </button>
                                <button className="btn danger sm" onClick={() => { setRejectReasonText(''); setRejectModalSo(so); }}>Từ chối</button>
                              </>
                            )}
                            {canConvert && (
                              <button
                                className="btn primary sm"
                                onClick={() => showConfirm({ title: `Xuất hóa đơn cho ${so.so_number}?`, message: 'Hệ thống sẽ sinh hóa đơn chính thức từ đơn bán hàng đã duyệt.', confirmText: 'Xuất HĐ', onConfirm: () => handleSoAction('convert', so) })}
                              >
                                Xuất Hóa đơn
                              </button>
                            )}
                            {so.invoice_id && (
                              <button className="btn outline sm" onClick={() => setPreviewItem({ id: so.invoice_id })}>Xem HĐ</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!soLoading && soList.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '2rem' }}><EmptyCard icon={<ShoppingBag />} title="Chưa có Đơn bán hàng (SO)" description="Tạo mới hoặc chuyển từ Báo giá để hiển thị tại đây." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pagination total={soTotal} page={page} pageSize={pageSize} onChange={setPage} />
          </div>
        </>
      )}

      {activeMode === 'pos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="card" style={{ ...cardStyle, padding: '18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>Quản lý Ca Thu Ngân POS</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#64748B' }}>
                {openPosSession ? `Đang mở Ca #${openPosSession.id} • Tiền đầu ca: ${FMT(openPosSession.opening_cash || 0, defaultCurrency)}` : 'Chưa có ca thu ngân đang mở.'}
              </p>
            </div>
            {canWriteInvoice && (
              openPosSession ? (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input className="form-input sm" type="number" min={0} placeholder="Tiền thực đếm cuối ca" value={closeCashInput} onChange={e => setCloseCashInput(e.target.value)} style={{ width: '170px' }} />
                  <button className="btn danger sm" onClick={() => handleCloseSession(openPosSession.id)}>Đóng Ca POS</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input className="form-input sm" type="number" min={0} placeholder="Tiền đầu ca" value={openCashInput} onChange={e => setOpenCashInput(e.target.value)} style={{ width: '140px' }} />
                  <button className="btn primary sm" onClick={handleOpenSession}>Mở Ca POS</button>
                </div>
              )
            )}
          </div>

          <div className="card" style={{ ...cardStyle, overflow: 'visible' }}>
            <div className="table-wrap responsive-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mã HĐ POS</th>
                    <th>Khách hàng</th>
                    <th>Thu ngân</th>
                    <th>Tổng thanh toán</th>
                    <th>Ngày bán</th>
                    <th style={{ textAlign: 'right' }}>THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {posLoading && Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((__, j) => <td key={j}><div className="skeleton" style={{ height: 20, borderRadius: 4 }} /></td>)}</tr>
                  ))}
                  {!posLoading && posOrders.map((o: any) => (
                    <tr key={o.id} className="table-row-hover">
                      <td style={{ fontWeight: 700, color: '#BD1D2D', fontFamily: 'monospace' }}>{o.invoice_number || `#POS-${o.id}`}</td>
                      <td style={{ fontWeight: 600 }}>{o.contact_name || 'Khách lẻ'}</td>
                      <td style={{ color: '#64748B' }}>{o.creator_name || '—'}</td>
                      <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{FMT(o.total || 0, defaultCurrency)}</td>
                      <td style={{ color: '#64748B', fontSize: '0.8rem' }}>{formatDateVN(o.created_at || o.issue_date)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <button className="btn-icon sm" title="Xem & In" onClick={() => setPreviewItem({ id: o.id })}><Eye size={14} /></button>
                      </td>
                    </tr>
                  ))}
                  {!posLoading && posOrders.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: '2rem' }}><EmptyCard icon={<Receipt />} title="Chưa có giao dịch POS nào" description="Nhấn nút Bán hàng POS ở góc trên để lập hóa đơn nhanh." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal for SO */}
      {Boolean(rejectModalSo) && (
      <CustomModal
        isOpen={Boolean(rejectModalSo)}
        onClose={() => setRejectModalSo(null)}
        title={`Từ chối Đơn bán ${rejectModalSo?.so_number || ''}`}
        zIndex={2147483646}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#0F172A' }}>Lý do từ chối *</label>
          <textarea
            className="form-input"
            rows={3}
            value={rejectReasonText}
            onChange={e => setRejectReasonText(e.target.value)}
            placeholder="Nhập lý do từ chối đơn bán hàng..."
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn ghost" onClick={() => setRejectModalSo(null)}>Hủy</button>
            <button
              className="btn danger"
              disabled={!rejectReasonText.trim()}
              onClick={() => {
                const target = rejectModalSo;
                setRejectModalSo(null);
                handleSoAction('reject', target, rejectReasonText.trim());
              }}
            >
              Xác nhận từ chối
            </button>
          </div>
        </div>
      </CustomModal>
      )}

      {/* SO Quick View Modal */}
      {Boolean(soPreview) && (
      <CustomModal
        isOpen={Boolean(soPreview)}
        onClose={() => { setSoPreview(null); clearOpenIdParam(); }}
        title={`Chi tiết Đơn bán hàng ${soPreview?.so_number || ''}`}
        zIndex={2147483646}
      >
        {soPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '0.875rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '12px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
              <div><span style={{ color: '#64748B' }}>Khách hàng:</span> <strong>{soPreview.contact_name || soPreview.company_name || 'Khách lẻ'}</strong></div>
              <div><span style={{ color: '#64748B' }}>Tổng tiền:</span> <strong style={{ color: '#BD1D2D' }}>{FMT(soPreview.total || 0, defaultCurrency)}</strong></div>
              <div><span style={{ color: '#64748B' }}>Ngày đặt:</span> <strong>{formatDateVN(soPreview.order_date || soPreview.created_at)}</strong></div>
              <div><span style={{ color: '#64748B' }}>Trạng thái:</span> <strong>{soPreview.status}</strong></div>
            </div>
            {soPreview.notes && <div style={{ color: '#475569' }}><strong>Ghi chú:</strong> {soPreview.notes}</div>}
          </div>
        )}
      </CustomModal>
      )}

      {/* POS Modal */}
      {showPosModal && (
        <POSModal
          onClose={() => setShowPosModal(false)}
          posSessionId={openPosSession?.id}
          onSuccess={(created) => {
            fetchInvoices();
            fetchPosData();
            if (created?.invoice_id) setPreviewItem({ id: created.invoice_id });
          }}
        />
      )}

      {/* Invoice Quick View Modal */}
      {Boolean(previewItem?.id) && (
        <InvoiceQuickViewModal
          invoiceId={previewItem?.id || null}
          onClose={() => { setPreviewItem(null); clearOpenIdParam(); }}
        />
      )}
    </div>
  );
};

export default InvoicesPage;
