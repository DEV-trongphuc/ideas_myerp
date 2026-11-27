import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  DollarSign, Plus, Search, Download, Truck, Coffee, Home,
  Briefcase, CreditCard, Tag, Eye, Pencil, Trash2,
  CheckCircle2, Clock, TrendingDown, X, ArrowUpRight, ArrowDownRight,
  XCircle, Copy, SlidersHorizontal, Receipt
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar } from '../components/ui/Avatar';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { PeriodFilter, getDateRange } from '../components/ui/PeriodFilter';
import type { Period, DateRange } from '../components/ui/PeriodFilter';
import { Pagination } from '../components/ui/Pagination';
import { CustomSelect } from '../components/ui/CustomSelect';
import { EmptyCard } from '../components/ui/EmptyCard';
import api from '../api/axios';
import { Tooltip } from '../components/ui/Tooltip';
import { useAuth } from '../contexts/AuthContext';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { useTypedSetting, useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { getLocalDateStr, formatDateTimeVN } from '../utils/dateUtils';
import { downloadExportFile } from '../utils/exportHelper';
import { ensureArray } from '../utils/safeArray';
import { pushOverlay } from '../utils/overlayStack';
import { isViewer as checkIsViewer, isManagement, isAccountant } from '../utils/roleUtils';
import {
  DomKpiTile,
  DomToolbarButton,
  DomSegmentedSwitch,
} from '../components/Dashboard/DomationDashboardKit';

const ExpenseCreateDrawer = React.lazy(() =>
  import('../components/ExpenseCreateDrawer').then(m => ({ default: m.ExpenseCreateDrawer }))
);
const ExpenseQuickViewDrawer = React.lazy(() =>
  import('../components/ExpenseQuickViewDrawer').then(m => ({ default: m.ExpenseQuickViewDrawer }))
);

const CATEGORIES = [
  { label: 'Vận Chuyển', icon: Truck, color: '#334155' },
  { label: 'Ăn uống', icon: Coffee, color: '#475569' },
  { label: 'Vận hành', icon: Home, color: '#0F172A' },
  { label: 'Marketing', icon: Briefcase, color: '#BD1D2D' },
  { label: 'Văn phòng phẩm', icon: CreditCard, color: '#64748B' },
  { label: 'Nhân sự', icon: Tag, color: '#334155' },
];

const FMT = (n: number, currency: string = 'VND') => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0 ₫';
  const rawCurr = (currency || 'VND').toUpperCase().trim();
  const normCurrency = rawCurr === 'EURO' ? 'EUR' : rawCurr;
  try {
    return new Intl.NumberFormat(normCurrency === 'VND' ? 'vi-VN' : 'en-US', {
      style: 'currency',
      currency: normCurrency,
      minimumFractionDigits: normCurrency === 'VND' ? 0 : 2,
      maximumFractionDigits: normCurrency === 'VND' ? 0 : 2
    }).format(num);
  } catch {
    return `${Math.round(num).toLocaleString('vi-VN')} ${normCurrency}`;
  }
};

const calcExpensePct = (cur: number, prev: number): number | null => {
  if (!prev || prev === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prev) / prev) * 100);
};

interface ExpensesKpiStripProps {
  loading: boolean;
  totalAmt: number;
  prevTotal: number;
  approvedAmt: number;
  prevApproved: number;
  pendingAmt: number;
  prevPending: number;
  summary: any;
  periodLabel: string;
  onOpenMaxExpense?: () => void;
}

const ExpensesKpiStrip: React.FC<ExpensesKpiStripProps> = React.memo(({
  loading,
  totalAmt,
  prevTotal,
  approvedAmt,
  prevApproved,
  pendingAmt,
  prevPending,
  summary,
  periodLabel,
  onOpenMaxExpense,
}) => (
  <div className="responsive-grid-4 dashboard-kpi-grid" style={{ marginBottom: '1.5rem' }}>
    <DomKpiTile
      label="Tổng chi phí kỳ này"
      value={FMT(totalAmt)}
      icon={<TrendingDown size={16} />}
      accent="brand"
      loading={loading}
      growth={calcExpensePct(totalAmt, prevTotal)}
      comparisonLabel={periodLabel}
      breakdown={<span>{summary.total_count || 0} khoản chi phí</span>}
    />
    <DomKpiTile
      label="Đã phê duyệt"
      value={FMT(approvedAmt)}
      icon={<CheckCircle2 size={16} />}
      accent="brand"
      valueTone="brand"
      loading={loading}
      growth={calcExpensePct(approvedAmt, prevApproved)}
      comparisonLabel={periodLabel}
      breakdown={<span>{summary.approved_count || 0} khoản đã duyệt</span>}
    />
    <DomKpiTile
      label="Chờ phê duyệt"
      value={FMT(pendingAmt)}
      icon={<Clock size={16} />}
      accent="slate"
      loading={loading}
      growth={calcExpensePct(pendingAmt, prevPending)}
      comparisonLabel={periodLabel}
      breakdown={<span>{summary.pending_count || 0} khoản đang chờ</span>}
    />
    <DomKpiTile
      label="Chi phí lớn nhất"
      value={summary.max_amount ? FMT(summary.max_amount) : '—'}
      icon={<DollarSign size={16} />}
      accent="slate"
      loading={loading}
      onClick={summary.max_id ? onOpenMaxExpense : undefined}
      breakdown={
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={summary.max_title || 'Chưa có dữ liệu'}>
          {summary.max_title || 'Chưa có dữ liệu'}
        </span>
      }
    />
  </div>
));

const expensesCache = new Map<string, { items: any[]; total: number; summary: any; timestamp: number }>();
const expensesAuxCache: { scopeKey: string; users: any[]; timestamp: number } = {
  scopeKey: '',
  users: [],
  timestamp: 0
};

const buildExpensesCacheKey = (
  scopeKey: string,
  page: number,
  pageSize: number,
  from: string,
  to: string,
  status: string,
  category: string,
  creator: string,
  search: string
) => `${scopeKey}|${page}|${pageSize}|${from || ''}|${to || ''}|${status || ''}|${category || ''}|${creator || ''}|${search || ''}`;

export const ExpensesPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get('status') || '';
  const { addToast, showConfirm } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm })));
  const { user } = useAuth();
  const { hasPermission } = useTenantConfig();

  const configuredPageSize = Math.max(5, Number(useTypedSubSetting('finance.ui_pagination_sizes', 'expenses', 10)) || 10);
  const swrTtlMs = Math.max(5000, Number(useTypedSubSetting('ui.swr_cache_ttl_ms', 'expenses', 45_000)) || 45_000);
  const searchDebounceMs = Math.max(100, Number(useTypedSubSetting('ui.debounce_intervals_ms', 'standard_search_ms', 300)) || 300);
  const overlayUi = useTypedSetting<{ z_backdrop?: number; z_drawer?: number; z_modal?: number; motion_ms?: number }>('ui.overlay_zindex_and_motion_ms', {
    z_backdrop: 2147483620,
    z_drawer: 2147483625,
    z_modal: 2147483640,
    motion_ms: 220,
  });
  const expenseCatConfig = useTypedSetting<{ categories?: Array<{ id?: string; label: string }> }>('finance.expense_categories_and_filters', {});

  const scopeKey = `${(user as any)?.tenant_id || 0}:${user?.id || 0}:${user?.role || ''}`;
  const isViewer = checkIsViewer(user);
  const canWriteExpenses = !isViewer && hasPermission('expenses', 'write');
  const canDeleteExpenses = !isViewer && hasPermission('expenses', 'delete');
  const canManageOrAccountant = Boolean(user && (isManagement(user) || isAccountant(user, true)));
  const motionSec = Math.max(0.15, Math.min(0.4, Number(overlayUi.motion_ms || 220) / 1000));

  const resolvedCategories = useMemo(() => {
    const iconByLabel = new Map(CATEGORIES.map(c => [c.label, c]));
    const custom = ensureArray<{ id?: string; label: string }>(expenseCatConfig?.categories);
    if (custom.length === 0) return CATEGORIES;
    return custom
      .filter(c => c && (c.label || c.id))
      .map((c, idx) => {
        const lbl = String(c.label || c.id);
        const def = iconByLabel.get(lbl) || CATEGORIES[idx % CATEGORIES.length];
        return { label: lbl, icon: def.icon, color: def.color };
      });
  }, [expenseCatConfig]);

  const deleteExpenseInFlightRef = useRef(false);
  const maxExpenseAbortRef = useRef<AbortController | null>(null);
  const mobileFilterAnchorRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!showMobileFilters) return;
    return pushOverlay('expenses-mobile-filters', () => setShowMobileFilters(false), 15);
  }, [showMobileFilters]);

  const initialDateRange = urlStatus ? getDateRange('all') : (location.state?.dateRange || getDateRange('all'));
  const initialCacheKey = buildExpensesCacheKey(scopeKey, 1, configuredPageSize, initialDateRange.from, initialDateRange.to, urlStatus, '', '', '');
  const initialCached = expensesCache.get(initialCacheKey);

  const [items, setItems] = useState<any[]>(() => initialCached?.items ?? []);
  const [loading, setLoading] = useState(() => !initialCached);
  const [period, setPeriod] = useState<Period>(urlStatus ? 'all' : (location.state?.period || 'all'));
  const [dateRange, setDateRange] = useState<DateRange>(initialDateRange);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [creatorFilter, setCreatorFilter] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, searchDebounceMs);
    return () => clearTimeout(timer);
  }, [search, searchDebounceMs]);

  useEffect(() => {
    if (!location.pathname.startsWith('/expenses')) return;
    const s = searchParams.get('status');
    if (s) {
      setStatusFilter(s);
      setPeriod('all');
      setDateRange(getDateRange('all'));
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('status');
      setSearchParams(nextParams, { replace: true });
    }
  }, [location.pathname, searchParams, setSearchParams]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(configuredPageSize);
  const hasCustomPageSizeRef = useRef(false);
  useEffect(() => {
    if (!hasCustomPageSizeRef.current && pageSize !== configuredPageSize) {
      setPageSize(configuredPageSize);
    }
  }, [configuredPageSize, pageSize]);

  const [total, setTotal] = useState(() => initialCached?.total ?? 0);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [viewItem, setViewItem] = useState<any>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [users, setUsers] = useState<any[]>(() => (expensesAuxCache.scopeKey === scopeKey ? expensesAuxCache.users : []));

  const [summary, setSummary] = useState<any>(() => initialCached?.summary ?? { total: 0, approved: 0 });
  const expensesAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      if (expensesAbortRef.current) expensesAbortRef.current.abort();
      if (maxExpenseAbortRef.current) maxExpenseAbortRef.current.abort();
    };
  }, []);

  const fetchExpenses = useCallback(async (isSilent = false) => {
    const cacheKey = buildExpensesCacheKey(
      scopeKey,
      page,
      pageSize,
      dateRange.from,
      dateRange.to,
      statusFilter,
      catFilter,
      creatorFilter,
      debouncedSearch
    );
    const cached = expensesCache.get(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setSummary(cached.summary);
      setLoading(false);
      if (!isSilent && Date.now() - cached.timestamp < swrTtlMs) {
        return;
      }
    } else if (!isSilent) {
      setLoading(true);
    }

    if (expensesAbortRef.current) {
      expensesAbortRef.current.abort();
    }
    const controller = new AbortController();
    expensesAbortRef.current = controller;
    const { signal } = controller;

    try {
      const params: any = { 
        page, 
        limit: pageSize, 
        from: dateRange.from, 
        to: dateRange.to, 
        status: statusFilter,
        category: catFilter,
        search: debouncedSearch,
        created_by: creatorFilter,
        is_po: 1
      };
      const r = await api.get('/expenses', { params, signal });
      if (signal.aborted) return;
      const data = r.data?.data || {};
      const rawItems = ensureArray<any>(data.items);
      const filteredPoItems = rawItems.filter((item: any) => {
        const amt = Number(item.amount || 0);
        const st = String(item.status || '').toLowerCase();
        if (amt === 0 && st !== 'draft') return false;
        return true;
      });
      const nextTotal = Number(data.total || 0);
      const nextSummary = data.summary || { total: 0, approved: 0 };
      setItems(filteredPoItems);
      setTotal(nextTotal);
      setSummary(nextSummary);
      expensesCache.set(cacheKey, {
        items: filteredPoItems,
        total: nextTotal,
        summary: nextSummary,
        timestamp: Date.now()
      });
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      if (!cached) {
        setItems([]);
        setTotal(0);
      }
      addToast('Không thể tải danh sách chi phí', 'error');
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [scopeKey, page, pageSize, dateRange, statusFilter, catFilter, creatorFilter, debouncedSearch, swrTtlMs, addToast]);

  // Reset page & selection when scope or filters change
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [scopeKey, dateRange, statusFilter, catFilter, creatorFilter, debouncedSearch]);

  // Auto fallback to last available page if current page becomes empty after deletions
  useEffect(() => {
    if (total > 0 && page > 1) {
      const maxPage = Math.ceil(total / pageSize);
      if (page > maxPage) {
        setPage(maxPage);
      }
    }
  }, [total, page, pageSize]);

  useEffect(() => {
    if (expensesAuxCache.scopeKey === scopeKey && expensesAuxCache.users.length > 0 && Date.now() - expensesAuxCache.timestamp < swrTtlMs) {
      setUsers(expensesAuxCache.users);
      return;
    }
    const controller = new AbortController();
    api.get('/users', { signal: controller.signal }).then((res) => {
      if (controller.signal.aborted) return;
      const d = res.data?.data;
      const list = Array.isArray(d) ? d : ensureArray(d?.items);
      setUsers(list);
      expensesAuxCache.scopeKey = scopeKey;
      expensesAuxCache.users = list;
      expensesAuxCache.timestamp = Date.now();
    }).catch(() => {});
    return () => controller.abort();
  }, [scopeKey, swrTtlMs]);

  useEffect(() => { fetchExpenses(false); }, [fetchExpenses]);

  useEffect(() => {
    if (location.state?.openCreate && canWriteExpenses) {
      const defContact = location.state.defaultContact;
      setEditItem(
        defContact?.id
          ? {
              contact_id: defContact.id,
              entity_id: defContact.id,
              entity_type: 'contact',
              contact_name: defContact.name || '',
            }
          : null
      );
      setShowModal(true);
      navigate(location.pathname, { replace: true });
    }
  }, [location.state, location.pathname, canWriteExpenses, navigate]);

  // KPIs from server-side summary
  const totalAmt = Number(summary.total || 0);
  const approvedAmt = Number(summary.approved || 0);
  const pendingAmt = Number(summary.pending || 0);
  const prevTotal = Number(summary.prev_total || 0);
  const prevApproved = Number(summary.prev_approved || 0);
  const prevPending = Number(summary.prev_pending || 0);

  const getChangePercent = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  const getPeriodCompareText = (p: string) => {
    switch (p) {
      case 'this_month': return 'so với tháng trước';
      case 'last_month': return 'so với tháng trước nữa';
      case 'today': return 'so với hôm qua';
      case 'this_week': return 'so với tuần trước';
      case 'last_30_days': return 'so với 30 ngày trước';
      default: return 'so với kỳ trước';
    }
  };

  const handleOpenMaxExpense = useCallback(async () => {
    const maxId = summary?.max_id;
    if (!maxId) return;
    const found = ensureArray(items).find((e: any) => Number(e.id) === Number(maxId));
    if (found) {
      setViewItem(found);
      return;
    }
    if (maxExpenseAbortRef.current) maxExpenseAbortRef.current.abort();
    const controller = new AbortController();
    maxExpenseAbortRef.current = controller;
    try {
      const res = await api.get(`/expenses/${maxId}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const expenseData = res.data?.data || res.data;
      if (expenseData && (expenseData.id || expenseData.amount)) {
        setViewItem(expenseData);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') {
        addToast('Không thể mở chi tiết chi phí lớn nhất', 'error');
      }
    }
  }, [summary?.max_id, items, addToast]);

  const openCreate = () => {
    if (!canWriteExpenses) {
      addToast('Bạn không có quyền tạo phiếu chi mới', 'error');
      return;
    }
    setEditItem(null);
    setShowModal(true);
  };

  const openEdit = (item: any) => {
    if (!canWriteExpenses) {
      addToast('Bạn không có quyền chỉnh sửa phiếu chi', 'error');
      return;
    }
    if (item && item.id && !item.isClone) {
      const creatorId = Number(item.created_by || item.user_id);
      const currentUserId = Number(user?.id);
      if (creatorId && currentUserId && creatorId !== currentUserId && !canManageOrAccountant) {
        addToast('Chỉ người tạo phiếu hoặc quản lý mới có quyền chỉnh sửa', 'error');
        return;
      }
    }
    setEditItem(item);
    setShowModal(true);
  };

  const getCatInfo = (label: string) => {
    let normalized = label;
    if (normalized === 'Di chuyển' || normalized === 'Vận chuyển') normalized = 'Vận Chuyển';
    if (normalized === 'Công cụ' || normalized === 'công cụ') normalized = 'Văn phòng phẩm';
    return resolvedCategories.find(c => c.label === normalized) || { color: '#64748B', icon: Tag };
  };

  const usersMap = useMemo(() => {
    const map = new Map<number, any>();
    ensureArray<any>(users).forEach((u: any) => {
      if (u?.id) map.set(Number(u.id), u);
    });
    return map;
  }, [users]);

  const creatorOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; avatar?: string; sublabel?: string }> = [{ value: '', label: 'Tất cả người tạo' }];
    const sorted = [...ensureArray<any>(users)].sort((a: any, b: any) => 
      String(a.full_name || a.name || '').localeCompare(String(b.full_name || b.name || ''), 'vi')
    );
    sorted.forEach((u: any) => {
      opts.push({
        value: String(u.id),
        label: u.full_name || u.name || `User #${u.id}`,
        avatar: u.avatar_url || u.avatar || '',
        sublabel: u.role || u.department || ''
      });
    });
    return opts;
  }, [users]);

  const toggleSelectOne = (id: number, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectableIds = useMemo(
    () => ensureArray<any>(items).filter(exp => exp.status !== 'approved').map(exp => Number(exp.id)),
    [items]
  );

  const allSelectableChecked = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  const toggleSelectAll = () => {
    if (allSelectableChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableIds));
    }
  };

  const handleExportExpenses = () => {
    const fromVal = dateRange.from || (dateRange as any).startDate || '';
    const toVal = dateRange.to || (dateRange as any).endDate || '';
    downloadExportFile({
      endpoint: '/export',
      params: {
        type: 'expense',
        status: statusFilter && statusFilter !== 'all' ? statusFilter : '',
        category: catFilter && catFilter !== 'all' ? catFilter : '',
        created_by: creatorFilter || '',
        search: debouncedSearch || '',
        from: fromVal,
        to: toVal,
        from_date: fromVal,
        to_date: toVal
      },
      defaultFilename: 'danh_sach_chi_phi.csv'
    });
  };

  const renderWorkflowStepsAndWatchers = (exp: any) => {
    interface StepInfo {
      stepIndex: number;
      title: string;
      userId?: number;
      userName?: string;
      userAvatar?: string;
      status: 'approved' | 'rejected' | 'pending' | 'waiting';
    }

    const steps: StepInfo[] = [];
    const overall = String(exp.status || 'pending').toLowerCase();
    const isDraft = overall === 'draft' || Boolean(exp.is_draft);
    const isPaid = Boolean(exp.is_refunded) || overall === 'paid' || overall === 'refunded';
    
    const s1 = String(exp.status_level_1 || (overall === 'level1_approved' || overall === 'approved' || isPaid ? 'approved' : overall === 'rejected' ? 'rejected' : 'pending')).toLowerCase();
    const s2 = String(exp.status_level_2 || 'none').toLowerCase();
    const s3 = String(exp.status_level_3 || 'none').toLowerCase();

    const app1Id = Number(exp.approver_id || 0);
    const app1Name = exp.approver_name || usersMap.get(app1Id)?.full_name || '';
    const app1Avatar = exp.approver_avatar || usersMap.get(app1Id)?.avatar_url || usersMap.get(app1Id)?.avatar;
    if (app1Id > 0 || app1Name || exp.approver_id_2) {
      let stepStatus: StepInfo['status'] = 'pending';
      if (isDraft) stepStatus = 'waiting';
      else if (s1 === 'approved' || overall === 'approved' || isPaid || overall === 'level1_approved') stepStatus = 'approved';
      else if (s1 === 'rejected' || (overall === 'rejected' && s1 !== 'approved')) stepStatus = 'rejected';
      else stepStatus = 'pending';

      steps.push({
        stepIndex: 1,
        title: 'Cấp 1',
        userId: app1Id,
        userName: app1Name,
        userAvatar: app1Avatar,
        status: stepStatus
      });
    }

    const app2Id = Number(exp.approver_id_2 || 0);
    const app2Name = exp.approver_name_2 || usersMap.get(app2Id)?.full_name || '';
    const app2Avatar = exp.approver_avatar_2 || usersMap.get(app2Id)?.avatar_url || usersMap.get(app2Id)?.avatar;
    if (app2Id > 0 || (app2Name && app2Name.trim() !== '')) {
      let stepStatus: StepInfo['status'] = 'waiting';
      if (isDraft) stepStatus = 'waiting';
      else if (s2 === 'approved' || (overall === 'approved' && s2 !== 'rejected')) stepStatus = 'approved';
      else if (s2 === 'rejected') stepStatus = 'rejected';
      else if (s1 === 'approved' && s2 !== 'approved' && s2 !== 'rejected') stepStatus = 'pending';
      else stepStatus = 'waiting';

      steps.push({
        stepIndex: 2,
        title: 'Cấp 2',
        userId: app2Id,
        userName: app2Name,
        userAvatar: app2Avatar,
        status: stepStatus
      });
    }

    const app3Id = Number(exp.approver_id_3 || 0);
    const app3Name = exp.approver_name_3 || usersMap.get(app3Id)?.full_name || '';
    const app3Avatar = exp.approver_avatar_3 || usersMap.get(app3Id)?.avatar_url || usersMap.get(app3Id)?.avatar;
    if (app3Id > 0 || (app3Name && app3Name.trim() !== '')) {
      let stepStatus: StepInfo['status'] = 'waiting';
      if (isDraft) stepStatus = 'waiting';
      else if (s3 === 'approved' || (overall === 'approved' && s3 !== 'rejected')) stepStatus = 'approved';
      else if (s3 === 'rejected') stepStatus = 'rejected';
      else if (s1 === 'approved' && (s2 === 'approved' || s2 === 'none') && s3 !== 'approved' && s3 !== 'rejected') stepStatus = 'pending';
      else stepStatus = 'waiting';

      steps.push({
        stepIndex: 3,
        title: 'Cấp 3',
        userId: app3Id,
        userName: app3Name,
        userAvatar: app3Avatar,
        status: stepStatus
      });
    }

    if (steps.length === 0) {
      steps.push({
        stepIndex: 1,
        title: 'Duyệt',
        userId: app1Id,
        userName: app1Name || 'Người duyệt',
        userAvatar: app1Avatar,
        status: isDraft ? 'waiting' : (overall === 'approved' || isPaid ? 'approved' : overall === 'rejected' ? 'rejected' : 'pending')
      });
    }

    let relIds: number[] = [];
    const rawWatchers = exp.related_user_ids || exp.related_users;
    if (Array.isArray(rawWatchers)) {
      relIds = rawWatchers.map((id: any) => Number(typeof id === 'object' && id !== null ? (id.id || id.user_id) : id)).filter((id: number) => id > 0);
    } else if (typeof rawWatchers === 'string') {
      const trimmed = rawWatchers.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            relIds = parsed.map((id: any) => Number(typeof id === 'object' && id !== null ? (id.id || id.user_id) : id)).filter((id: number) => id > 0);
          }
        } catch {
          relIds = trimmed.slice(1, -1).split(',').map((id: string) => Number(id.trim().replace(/^['"]|['"]$/g, ''))).filter((id: number) => id > 0);
        }
      } else {
        relIds = trimmed.split(',').map((id: string) => Number(id.trim())).filter((id: number) => id > 0);
      }
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {steps.map((st, idx) => {
            const uObj = st.userId ? usersMap.get(st.userId) : null;
            const displayName = uObj?.full_name || uObj?.name || st.userName || st.title;
            const avatarUrl = st.userAvatar || uObj?.avatar_url || uObj?.avatar;

            const isApproved = !isDraft && st.status === 'approved';
            const isRejected = !isDraft && st.status === 'rejected';
            const isPending = !isDraft && st.status === 'pending';

            const borderColor = isApproved ? '#34C759' : isRejected ? '#BD1D2D' : isPending ? '#FF9500' : 'var(--color-border)';
            const statusText = isApproved ? 'Đã duyệt' : isRejected ? 'Từ chối' : isPending ? 'Đang chờ duyệt' : isDraft ? 'Dự kiến duyệt (Bản nháp)' : 'Chưa đến lượt';

            return (
              <React.Fragment key={`exp-step-${st.stepIndex}`}>
                {idx > 0 && (
                  <span style={{ fontSize: '0.65rem', color: '#64748B', margin: '0 1px' }}>➔</span>
                )}
                <div 
                  title={`${st.title}: ${displayName} (${statusText})`}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    borderRadius: '50%',
                    padding: '1.5px',
                    border: `2px solid ${borderColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    opacity: isDraft ? 0.95 : (st.status === 'waiting' ? 0.6 : 1)
                  }}>
                    <Avatar src={avatarUrl} name={displayName} size={24} />
                  </div>
                  <div style={{
                    position: 'absolute',
                    bottom: '-2px',
                    right: '-2px',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: isApproved ? '#34C759' : isRejected ? '#BD1D2D' : isPending ? '#FF9500' : isDraft ? '#64748B' : '#8E8E93',
                    border: '1.5px solid #ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '8px',
                    fontWeight: 800
                  }}>
                    {isApproved ? '✓' : isRejected ? '✕' : isPending ? '•' : st.stepIndex}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {relIds.length > 0 && (
          <div 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              marginLeft: '4px',
              paddingLeft: '6px',
              borderLeft: '1px solid var(--color-border)'
            }}
            title={`Người liên quan (${relIds.length}): ${relIds.map(id => usersMap.get(id)?.full_name || usersMap.get(id)?.name || id).join(', ')}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', color: '#64748B', marginRight: '1px' }}>
              <Eye size={12} />
            </div>
            {relIds.slice(0, 3).map(id => {
              const relU = usersMap.get(id);
              return (
                <Avatar
                  key={`rel-${id}`}
                  src={relU?.avatar_url || relU?.avatar}
                  name={relU?.full_name || relU?.name || `ID ${id}`}
                  size={22}
                />
              );
            })}
            {relIds.length > 3 && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748B' }}>
                +{relIds.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderExpenseStatusBadge = (exp: any) => {
    const overall = String(exp.status || 'pending').toLowerCase();
    const isDraft = overall === 'draft' || Boolean(exp.is_draft);
    const isPaid = Boolean(exp.is_refunded) || overall === 'paid' || overall === 'refunded';

    const s1 = String(exp.status_level_1 || 'pending').toLowerCase();
    const s2 = String(exp.status_level_2 || 'pending').toLowerCase();
    const s3 = String(exp.status_level_3 || 'pending').toLowerCase();

    const hasL2 = Boolean(exp.approver_id_2);
    const hasL3 = Boolean(exp.approver_id_3);

    if (isDraft) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '0.68rem',
          fontWeight: 700,
          color: '#64748B',
          background: 'rgba(100, 116, 139, 0.1)',
          padding: '2px 6px',
          borderRadius: '6px',
          width: 'fit-content',
          marginTop: '2px'
        }}>
          Bản nháp
        </span>
      );
    }

    if (isPaid) {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '0.68rem',
          fontWeight: 700,
          color: '#10b981',
          background: 'rgba(16, 185, 129, 0.1)',
          padding: '2px 6px',
          borderRadius: '6px',
          width: 'fit-content',
          marginTop: '2px'
        }}>
          <CheckCircle2 size={10} /> Đã thanh toán
        </span>
      );
    }

    if (overall === 'approved') {
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '0.68rem',
          fontWeight: 700,
          color: '#d97706',
          background: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          padding: '2px 6px',
          borderRadius: '6px',
          width: 'fit-content',
          marginTop: '2px'
        }}>
          <Clock size={10} /> Đã duyệt - Chưa hạch toán
        </span>
      );
    }

    if (overall === 'rejected') {
      const rejectText = s3 === 'rejected' ? 'Cấp 3 từ chối' : (s2 === 'rejected' ? 'Cấp 2 từ chối' : (s1 === 'rejected' ? 'Cấp 1 từ chối' : 'Từ chối'));
      return (
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '3px',
          fontSize: '0.68rem',
          fontWeight: 700,
          color: '#BD1D2D',
          background: 'rgba(189, 29, 45, 0.08)',
          padding: '2px 6px',
          borderRadius: '6px',
          width: 'fit-content',
          marginTop: '2px'
        }}>
          <XCircle size={10} /> {rejectText}
        </span>
      );
    }

    let pendingText = 'Chờ duyệt';
    if (s1 === 'approved' && s2 === 'approved' && hasL3 && s3 !== 'approved') {
      pendingText = 'Chờ Cấp 3 duyệt';
    } else if (s1 === 'approved' && hasL2 && s2 !== 'approved') {
      pendingText = 'Chờ Cấp 2 duyệt';
    } else if (hasL2 && s1 !== 'approved') {
      pendingText = 'Chờ Cấp 1 duyệt';
    }

    return (
      <span style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize: '0.68rem',
        fontWeight: 700,
        color: '#f59e0b',
        background: 'rgba(245, 158, 11, 0.1)',
        padding: '2px 6px',
        borderRadius: '6px',
        width: 'fit-content',
        marginTop: '2px'
      }}>
        <Clock size={10} /> {pendingText}
      </span>
    );
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <h1 className="page-title">Chi phí Vận hành</h1>
          <p className="page-subtitle">Quản lý và theo dõi các khoản chi phí doanh nghiệp</p>
        </div>
        <div className="no-wrap-mobile" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: isMobile ? '100%' : 'auto',
          flexWrap: 'nowrap'
        }}>
          <DomToolbarButton
            variant="outline"
            icon={<Download size={15} />}
            onClick={handleExportExpenses}
            title="Xuất Excel / CSV"
            style={{ width: '36px', padding: 0 }}
          />
          <div style={{ flex: isMobile ? 1 : 'none', minWidth: 0 }}>
            <PeriodFilter
              value={period}
              onChange={(p, r) => { setPeriod(p); setDateRange(r); setPage(1); }}
              buttonStyle={{ minWidth: isMobile ? '0' : '160px', width: '100%', height: '36px', minHeight: '36px', borderRadius: '10px' }}
            />
          </div>
          {canWriteExpenses && (
            <DomToolbarButton
              variant="primary"
              icon={<Plus size={15} />}
              onClick={openCreate}
              title="Nhập chi phí"
              style={{ flex: isMobile ? 1 : 'none' }}
            >
              Nhập chi phí
            </DomToolbarButton>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <ExpensesKpiStrip
        loading={loading}
        totalAmt={totalAmt}
        prevTotal={prevTotal}
        approvedAmt={approvedAmt}
        prevApproved={prevApproved}
        pendingAmt={pendingAmt}
        prevPending={prevPending}
        summary={summary}
        periodLabel={getPeriodCompareText(period)}
        onOpenMaxExpense={summary.max_id ? handleOpenMaxExpense : undefined}
      />

      {/* Quick Status Filter Pills - Segmented Pill Control */}
      <div style={{ marginBottom: '1rem' }}>
        <DomSegmentedSwitch
          value={statusFilter}
          onChange={(val) => { setStatusFilter(val); setPage(1); }}
          options={[
            { value: '', label: 'Tất cả' },
            { value: 'pending', label: 'Chờ duyệt' },
            { value: 'unpaid', label: 'Chưa thanh toán' },
            { value: 'paid', label: 'Đã thanh toán' },
          ]}
        />
      </div>

      {/* Filter bar */}
      <div className="card" style={{ padding: isMobile ? '8px 10px' : '0.875rem 1.25rem', marginBottom: '1rem', display: 'flex', gap: isMobile ? '8px' : '0.75rem', alignItems: 'center', justifyContent: 'space-between', position: 'relative', border: '1px solid #E2E8F0', borderRadius: '16px', background: '#FFFFFF' }}>
        <div className="filter-search" style={{ flex: 1, minWidth: 0 }}>
          <Search size={15} style={{ color: 'var(--color-text-muted)' }} />
          <input 
            placeholder="Tìm theo #ID, nội dung, người nhập, NCC..." 
            value={search} 
            onChange={e => { setSearch(e.target.value); setPage(1); }} 
          />
          {search && (
            <button type="button" onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}>
              <X size={13} />
            </button>
          )}
        </div>

        {isMobile ? (
          <div style={{ position: 'relative' }} ref={mobileFilterAnchorRef}>
            <button
              type="button"
              onClick={() => setShowMobileFilters(!showMobileFilters)}
              style={{
                width: '36px',
                height: '36px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                background: showMobileFilters ? 'var(--color-border-light)' : 'var(--color-surface)',
                color: (statusFilter || catFilter || creatorFilter) ? '#BD1D2D' : 'var(--color-text)',
                outline: 'none',
                boxShadow: 'var(--shadow-sm)',
                flexShrink: 0,
                transition: 'all 0.15s ease'
              }}
              title="Bộ lọc nâng cao"
            >
              <SlidersHorizontal size={16} />
              {(statusFilter || catFilter || creatorFilter) && (
                <span
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: '#BD1D2D'
                  }}
                />
              )}
            </button>

            {typeof document !== 'undefined' && createPortal(
              <AnimatePresence>
                {showMobileFilters && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] }}
                      onClick={() => setShowMobileFilters(false)}
                      style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.35)',
                        zIndex: Number(overlayUi.z_backdrop || 2147483620)
                      }}
                    />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.96, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -8 }}
                      transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] }}
                      style={{
                        position: 'fixed',
                        top: Math.max(72, (mobileFilterAnchorRef.current?.getBoundingClientRect().bottom || 120) + 8),
                        right: 16,
                        width: 'min(270px, calc(100vw - 32px))',
                        background: 'var(--color-surface, #ffffff)',
                        border: '1px solid #E2E8F0',
                        borderRadius: '14px',
                        boxShadow: '0 16px 36px rgba(15, 23, 42, 0.18)',
                        padding: '14px',
                        zIndex: Number(overlayUi.z_modal || 2147483640),
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          Trạng thái
                        </label>
                        <CustomSelect 
                          options={[
                            { value: '', label: 'Tất cả trạng thái' },
                            { value: 'pending', label: 'Chờ duyệt' },
                            { value: 'unpaid', label: 'Chưa thanh toán' },
                            { value: 'paid', label: 'Đã thanh toán' },
                            { value: 'approved', label: 'Đã duyệt (Tất cả)' }
                          ]} 
                          value={statusFilter} 
                          onChange={val => { setStatusFilter(val.toString()); setPage(1); setShowMobileFilters(false); }} 
                          size="xs"
                          width="100%"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          Người tạo
                        </label>
                        <CustomSelect 
                          options={creatorOptions} 
                          value={creatorFilter} 
                          onChange={val => { setCreatorFilter(val.toString()); setPage(1); setShowMobileFilters(false); }} 
                          size="xs"
                          width="100%"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          Danh mục
                        </label>
                        <CustomSelect 
                          options={[
                            { value: '', label: 'Tất cả danh mục' },
                            ...resolvedCategories.map(c => ({ value: c.label, label: c.label }))
                          ]} 
                          value={catFilter} 
                          onChange={val => { setCatFilter(val.toString()); setPage(1); setShowMobileFilters(false); }} 
                          size="xs"
                          width="100%"
                        />
                      </div>

                      {(statusFilter || catFilter || creatorFilter) && (
                        <button
                          type="button"
                          onClick={() => { setStatusFilter(''); setCatFilter(''); setCreatorFilter(''); setPage(1); setShowMobileFilters(false); }}
                          style={{
                            marginTop: '2px',
                            padding: '6px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'rgba(189, 29, 45, 0.08)',
                            color: '#BD1D2D',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'center'
                          }}
                        >
                          Đặt lại bộ lọc
                        </button>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>,
              document.body
            )}
          </div>
        ) : (
          /* Desktop Filter Controls */
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ width: 165 }}>
              <CustomSelect 
                options={[
                  { value: '', label: 'Tất cả danh mục' },
                  ...resolvedCategories.map(c => ({ value: c.label, label: c.label }))
                ]} 
                value={catFilter} 
                onChange={val => { setCatFilter(val.toString()); setPage(1); }} 
                size="sm"
                placeholder="Danh mục..."
              />
            </div>
            <div style={{ width: 165 }}>
              <CustomSelect 
                options={[
                  { value: '', label: 'Tất cả trạng thái' },
                  { value: 'pending', label: 'Chờ duyệt' },
                  { value: 'unpaid', label: 'Chưa thanh toán' },
                  { value: 'paid', label: 'Đã thanh toán' },
                  { value: 'approved', label: 'Đã duyệt (Tất cả)' }
                ]} 
                value={statusFilter} 
                onChange={val => { setStatusFilter(val.toString()); setPage(1); }} 
                size="sm"
              />
            </div>
            <div style={{ width: 185 }}>
              <CustomSelect 
                options={creatorOptions} 
                value={creatorFilter} 
                onChange={val => { setCreatorFilter(val.toString()); setPage(1); }} 
                size="sm"
                searchable={true}
                showAvatars={true}
                align="right"
                placeholder="Tìm người tạo..."
              />
            </div>
            {canDeleteExpenses && selected.size > 0 && (
              <DomToolbarButton
                variant="danger"
                icon={<Trash2 size={14} />}
                onClick={async () => {
                  if (deleteExpenseInFlightRef.current) return;
                  const idsToDelete = Array.from(selected);
                  showConfirm({
                    title: 'Xóa các khoản chi đã chọn?',
                    message: `Bạn có chắc chắn muốn xóa ${idsToDelete.length} khoản chi đã chọn khỏi hệ thống?`,
                    confirmText: 'Xóa ngay',
                    cancelText: 'Hủy',
                    isDanger: true,
                    onConfirm: async () => {
                      if (deleteExpenseInFlightRef.current) return;
                      deleteExpenseInFlightRef.current = true;
                      const idSet = new Set(idsToDelete);
                      setItems(prev => prev.filter(item => !idSet.has(item.id)));
                      setTotal(prev => Math.max(0, prev - idsToDelete.length));
                      setSelected(new Set());
                      expensesCache.clear();
                      try {
                        await Promise.all(idsToDelete.map(id => api.delete(`/expenses/${id}`)));
                        addToast(`Đã xóa ${idsToDelete.length} khoản`, 'success');
                        fetchExpenses(true);
                      } catch (error: any) {
                        addToast(error?.response?.data?.message || 'Lỗi khi xóa khoản chi', 'error');
                        fetchExpenses(true);
                      } finally {
                        deleteExpenseInFlightRef.current = false;
                      }
                    }
                  });
                }}
              >
                Xóa {selected.size} đã chọn
              </DomToolbarButton>
            )}
          </div>
        )}
      </div>

      {/* Main list: Dedicated Mobile Smart Cards on phones, Full Table on desktop */}
      {isMobile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`exp-sk-${i}`} className="card" style={{ padding: '12px 14px', borderRadius: '14px' }}>
                <div className="skeleton" style={{ height: 15, width: '70%', borderRadius: 4, marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 18, width: '45%', borderRadius: 6 }} />
              </div>
            ))
          ) : ensureArray(items).length === 0 ? (
            <EmptyCard
              icon={<Receipt size={26} />}
              title="Không có khoản chi phí nào"
              description="Chưa ghi nhận khoản chi phí nào phù hợp với bộ lọc trong kỳ này."
              actionText={canWriteExpenses ? 'Nhập chi phí' : undefined}
              onAction={canWriteExpenses ? openCreate : undefined}
            />
          ) : (
            ensureArray(items).map(exp => {
              const catInfo = getCatInfo(exp.category);
              const CatIcon = catInfo.icon;
              return (
                <div
                  key={`mob-exp-${exp.id}`}
                  onClick={() => setViewItem(exp)}
                  className="mobile-card-item"
                  style={{
                    background: 'var(--color-surface, #ffffff)',
                    border: '1px solid #e2e8f0',
                    borderRadius: '16px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px', flexWrap: 'wrap' }}>
                        <span style={{ padding: '1px 6px', borderRadius: '5px', background: '#f1f5f9', border: '1px solid #e2e8f0', fontSize: '0.68rem', fontWeight: 700, color: '#64748b' }}>
                          #{exp.id}
                        </span>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 7px', borderRadius: '6px', background: `${catInfo.color}12`, fontSize: '0.68rem', fontWeight: 600, color: catInfo.color }}>
                          <CatIcon size={10} color={catInfo.color} /> {exp.category}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a', lineHeight: 1.35 }}>
                        {exp.title}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                        {FMT(exp.amount, exp.currency)}
                      </div>
                      <div style={{ marginTop: '3px' }}>{renderExpenseStatusBadge(exp)}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <Avatar src={exp.creator_avatar} name={exp.creator_name} size={22} />
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {exp.creator_name}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                      {renderWorkflowStepsAndWatchers(exp)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <Pagination
            total={total}
            page={page}
            pageSize={pageSize}
            onChange={setPage}
            showSizeChanger
            onPageSizeChange={(newSize) => { hasCustomPageSizeRef.current = true; setPageSize(newSize); setPage(1); }}
          />
        </div>
      ) : (
      <div className="card" style={{ overflow: 'visible', border: '1px solid #E2E8F0', borderRadius: '16px', background: '#FFFFFF' }}>
        <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ minWidth: 960 }}>
            <thead>
              <tr>
                {canDeleteExpenses && (
                  <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)', width: 38, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={allSelectableChecked}
                      onChange={toggleSelectAll}
                      disabled={selectableIds.length === 0}
                      style={{ accentColor: '#BD1D2D', cursor: 'pointer' }}
                      title="Chọn tất cả các khoản chưa duyệt"
                    />
                  </th>
                )}
                <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)', minWidth: 340, width: '32%' }}>Tên hóa đơn</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)' }}>Người tạo</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)', minWidth: 150 }}>Số tiền</th>
                <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)', minWidth: 200 }}>Các bước & Người liên quan <Tooltip content="Tiến trình phê duyệt qua các cấp và những người liên quan theo dõi." /></th>
                <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)', textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  {canDeleteExpenses && <td />}
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div className="skeleton" style={{ height: 14, width: '75%', borderRadius: 4 }} />
                      <div className="skeleton" style={{ height: 18, width: 90, borderRadius: 6 }} />
                    </div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0 }} />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                        <div className="skeleton" style={{ height: 12, width: 100, borderRadius: 4 }} />
                        <div className="skeleton" style={{ height: 10, width: 70, borderRadius: 4 }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <div className="skeleton" style={{ height: 14, width: 95, borderRadius: 4 }} />
                      <div className="skeleton" style={{ height: 16, width: 75, borderRadius: 4 }} />
                    </div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div className="skeleton" style={{ width: 26, height: 26, borderRadius: '50%' }} />
                      <div className="skeleton" style={{ width: 26, height: 26, borderRadius: '50%' }} />
                    </div>
                  </td>
                  <td style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>
                    <div className="skeleton" style={{ height: 24, width: 56, borderRadius: 6, marginLeft: 'auto' }} />
                  </td>
                </tr>
              ))}
              {!loading && ensureArray(items).map(exp => {
                    const catInfo = getCatInfo(exp.category);
                    const CatIcon = catInfo.icon;
                    const canRowModify = canWriteExpenses && (
                      Number(user?.id) === Number(exp.created_by || exp.user_id) || canManageOrAccountant
                    );
                    const canRowDelete = canDeleteExpenses && (
                      Number(user?.id) === Number(exp.created_by || exp.user_id) || canManageOrAccountant
                    );
                  return (
                    <tr 
                      key={exp.id} 
                      onClick={() => setViewItem(exp)}
                      style={{ cursor: 'pointer' }}
                      className="hover-bg transition-colors"
                    >
                      {canDeleteExpenses && (
                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          {exp.status !== 'approved' && (
                            <input
                              type="checkbox"
                              checked={selected.has(Number(exp.id))}
                              onChange={e => toggleSelectOne(Number(exp.id), e)}
                              style={{ accentColor: '#BD1D2D', cursor: 'pointer' }}
                            />
                          )}
                        </td>
                      )}
                      <td style={{ minWidth: 340 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '1px 6px',
                              borderRadius: '5px',
                              background: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#64748b',
                              lineHeight: '1.2'
                            }}>
                              #{exp.id}
                            </span>
                            <span>{exp.title}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '6px', background: `${catInfo.color}12`, fontSize: '0.75rem', fontWeight: 600, color: catInfo.color }}>
                              <CatIcon size={10} color={catInfo.color} /> {exp.category}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar src={exp.creator_avatar} name={exp.creator_name} size={24} style={{ border: '1px solid var(--color-border-light)' }} />
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>{exp.creator_name}</span>
                            <span style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                              {formatDateTimeVN(exp.created_at)}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{FMT(exp.amount, exp.currency)}</span>
                          {renderExpenseStatusBadge(exp)}
                        </div>
                      </td>
                      <td>
                        {renderWorkflowStepsAndWatchers(exp)}
                      </td>
                      <td>
                        <div className="flex gap-1" style={{ justifyContent: 'flex-end' }}>
                          {canWriteExpenses && (
                            <button
                              type="button"
                              className="btn-icon sm"
                              title="Nhân bản đề nghị mua hàng"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEdit({
                                  ...exp,
                                  id: undefined,
                                  isClone: true,
                                  status: 'pending',
                                  approval_status: 'pending',
                                  status_level_1: undefined,
                                  status_level_2: undefined,
                                  status_level_3: undefined,
                                  approved_at: undefined,
                                  approved_at_2: undefined,
                                  approved_at_3: undefined,
                                  reject_reason: undefined,
                                  is_refunded: 0,
                                  refunded_at: undefined,
                                  refund_image_url: undefined,
                                  refunder_id: undefined,
                                  date: getLocalDateStr(),
                                });
                              }}
                            >
                              <Copy size={13} />
                            </button>
                          )}
                          {exp.status !== 'approved' && (
                            <>
                              {canRowModify && (
                                <button type="button" className="btn-icon sm" title="Sửa" onClick={(e) => { e.stopPropagation(); openEdit(exp); }}><Pencil size={13} /></button>
                              )}
                              {canRowDelete && (
                                <button type="button" className="btn-icon sm text-danger" title="Xóa" onClick={(e) => {
                                  e.stopPropagation();
                                  if (deleteExpenseInFlightRef.current) return;
                                  showConfirm({
                                    title: 'Xóa khoản chi phí?',
                                    message: `Khoản chi "${exp.title}" sẽ được chuyển vào lưu trữ (xóa mềm).`,
                                    confirmText: 'Xóa ngay',
                                    cancelText: 'Hủy',
                                    isDanger: true,
                                    onConfirm: async () => {
                                      if (deleteExpenseInFlightRef.current) return;
                                      deleteExpenseInFlightRef.current = true;
                                      setItems(prev => prev.filter(item => item.id !== exp.id));
                                      setTotal(prev => Math.max(0, prev - 1));
                                      expensesCache.clear();
                                      try {
                                        await api.delete(`/expenses/${exp.id}`);
                                        addToast('Đã xóa chi phí', 'success');
                                        fetchExpenses(true);
                                      } catch (error: any) {
                                        addToast(error.response?.data?.message || 'Lỗi khi xóa chi phí', 'error');
                                        fetchExpenses(true);
                                      } finally {
                                        deleteExpenseInFlightRef.current = false;
                                      }
                                    }
                                  });
                                }}><Trash2 size={13} /></button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              {!loading && total === 0 && (
                <tr>
                  <td colSpan={canDeleteExpenses ? 6 : 5} style={{ padding: '2.5rem 1rem' }}>
                    <EmptyCard
                      icon={<Receipt size={26} />}
                      title="Không có khoản chi phí nào"
                      description="Chưa ghi nhận khoản chi phí nào phù hợp với bộ lọc trong kỳ này."
                      actionText={canWriteExpenses ? 'Nhập chi phí' : undefined}
                      onAction={canWriteExpenses ? openCreate : undefined}
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          total={total}
          page={page}
          pageSize={pageSize}
          onChange={setPage}
          showSizeChanger
          onPageSizeChange={(newSize) => { hasCustomPageSizeRef.current = true; setPageSize(newSize); setPage(1); }}
        />
      </div>
      )}

      {/* Add/Edit Drawer */}
      {showModal && (
        <React.Suspense fallback={null}>
          <ExpenseCreateDrawer
            isOpen={showModal}
            onClose={() => setShowModal(false)}
            editItem={editItem}
            onSaveSuccess={() => {
              expensesCache.clear();
              fetchExpenses(true);
            }}
            user={user}
            users={users}
          />
        </React.Suspense>
      )}

      {/* Quick View Drawer */}
      {Boolean(viewItem) && (
        <React.Suspense fallback={null}>
          <ExpenseQuickViewDrawer
            expenseId={viewItem ? Number(viewItem.id) : null}
            initialItem={viewItem}
            onClose={() => setViewItem(null)}
            user={user}
            onStatusChange={() => {
              expensesCache.clear();
              fetchExpenses(true);
            }}
            onEditClick={(itemToEdit: any) => {
              setViewItem(null);
              openEdit(itemToEdit);
            }}
          />
        </React.Suspense>
      )}
    </div>
  );
};
