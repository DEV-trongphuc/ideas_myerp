import React, { useEffect, useState, lazy, Suspense, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { fetchAPI } from '../utils/api';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { CustomModal } from '../components/ui/CustomModal';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CreditCard, Plus, X, AlertCircle, Calendar, Ban, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Info, Edit, Loader2, Search, Clock, DollarSign, TrendingUp, Award, CheckCircle2, MoreHorizontal, Target, Download } from 'lucide-react';
import { SalesTargetModal, getTargetProgressTone, type SalesTargetsPayload } from '../components/Dashboard/SalesTargetModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../contexts/LanguageContext';
import { EmptyCard } from '../components/ui/EmptyCard';
import { Avatar } from '../components/ui/Avatar';
import { TableSkeleton, TimelineSkeleton } from '../components/ui/Skeleton';
const CustomerProfileDrawer = lazy(() => import('./CustomerProfileDrawer').then(module => ({ default: module.CustomerProfileDrawer })));
const DepositDetailDrawer = lazy(() => import('../components/DepositDetailDrawer').then(module => ({ default: module.DepositDetailDrawer })));
import { PeriodFilter, getDateRange } from '../components/ui/PeriodFilter';
import type { Period, DateRange } from '../components/ui/PeriodFilter';
import { Pagination } from '../components/ui/Pagination';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { isViewer as checkIsViewer, isSales } from '../utils/roleUtils';
import { getLocalDateStr, formatDateVN } from '../utils/dateUtils';
import { downloadExportFile } from '../utils/exportHelper';
import { pushOverlay } from '../utils/overlayStack';
import {
  XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, ResponsiveContainer, ComposedChart,
  Bar, Line, Legend, Area
} from 'recharts';
import { ensureArray } from '../utils/safeArray';
import {
  DomKpiTile,
  DomPanelCard,
  DomChartTooltip,
  DomToolbarButton,
  DomEmptyChartState,
} from '../components/Dashboard/DomationDashboardKit';

interface DepositsListKpiStripProps {
  loading: boolean;
  hasDateFilter: boolean;
  listStats: {
    totalSOAmount: number;
    totalScopedMilestonesCount: number;
    activeOrderCount: number;
    approvedMilestoneAmount: number;
    approvedCount: number;
    pendingMilestoneAmount: number;
    pendingStudentMilestoneAmount: number;
    pendingCount: number;
    maxSOAmount: number;
    maxSOTitle: string;
  };
}

const DepositsListKpiStrip: React.FC<DepositsListKpiStripProps> = React.memo(({
  loading,
  hasDateFilter,
  listStats,
}) => (
  <div className="responsive-grid-4 dashboard-kpi-grid" style={{ marginBottom: '24px' }}>
    <DomKpiTile
      label="Tổng doanh thu kỳ này"
      value={`${Math.round(listStats.totalSOAmount).toLocaleString('vi-VN')} đ`}
      icon={<DollarSign size={16} />}
      accent="brand"
      loading={loading}
      breakdown={
        <span>
          {hasDateFilter
            ? `Phạm vi: ${listStats.totalScopedMilestonesCount} đợt (${listStats.activeOrderCount} đơn)`
            : `Tổng số: ${listStats.activeOrderCount} đơn hàng`}
        </span>
      }
    />
    <DomKpiTile
      label="Đã đối soát (Đã thu)"
      value={`${Math.round(listStats.approvedMilestoneAmount).toLocaleString('vi-VN')} đ`}
      icon={<CheckCircle2 size={16} />}
      accent="brand"
      valueTone="brand"
      loading={loading}
      breakdown={<span>Đã thu: <strong style={{ color: '#0F172A' }}>{listStats.approvedCount} đợt hoàn tất</strong></span>}
    />
    <DomKpiTile
      label="Chờ đối soát (Chờ thu)"
      value={`${Math.round(listStats.pendingMilestoneAmount).toLocaleString('vi-VN')} đ`}
      icon={<Clock size={16} />}
      accent="slate"
      loading={loading}
      breakdown={
        <span>
          {listStats.pendingStudentMilestoneAmount > 0
            ? `Chờ thu: ${listStats.pendingCount} đợt • Bảo lưu: +${Math.round(listStats.pendingStudentMilestoneAmount).toLocaleString('vi-VN')} đ`
            : `Đang chờ: ${listStats.pendingCount} đợt thanh toán`}
        </span>
      }
    />
    <DomKpiTile
      label="Đơn hàng lớn nhất"
      value={listStats.maxSOAmount > 0 ? `${Math.round(listStats.maxSOAmount).toLocaleString('vi-VN')} đ` : '—'}
      icon={<Award size={16} />}
      accent="slate"
      loading={loading}
      breakdown={
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }} title={listStats.maxSOTitle || 'Chưa có dữ liệu'}>
          {listStats.maxSOTitle || 'Chưa có dữ liệu'}
        </span>
      }
    />
  </div>
));

const DepositsForecastKpiStrip: React.FC<{
  projectedRec7Days: number;
  rec7Count: number;
  pendingStudentRec7Days: number;
  overdueRecTotal: number;
  overdueRecCount: number;
  projectedRec30Days: number;
  rec30Count: number;
  pendingStudentRec30Days: number;
  projectedExp7Days: number;
  exp7Count: number;
  overdueExpTotal: number;
  overdueExpCount: number;
  projectedExp30Days: number;
  exp30Count: number;
}> = React.memo(({
  projectedRec7Days,
  rec7Count,
  pendingStudentRec7Days,
  overdueRecTotal,
  overdueRecCount,
  projectedRec30Days,
  rec30Count,
  pendingStudentRec30Days,
  projectedExp7Days,
  exp7Count,
  overdueExpTotal,
  overdueExpCount,
  projectedExp30Days,
  exp30Count,
}) => (
  <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
    <DomKpiTile
      label="Dự thu 7 ngày tới"
      value={`${Math.round(projectedRec7Days).toLocaleString('vi-VN')} đ`}
      icon={<TrendingUp size={16} />}
      accent="brand"
      breakdown={
        <>
          <span>Số đợt: <strong style={{ color: '#0f172a' }}>{rec7Count} đợt</strong>{pendingStudentRec7Days > 0 ? ` • Bảo lưu: +${Math.round(pendingStudentRec7Days).toLocaleString('vi-VN')} đ` : ''}</span>
          {overdueRecTotal > 0 ? (
            <span>Quá hạn: <strong style={{ color: '#BD1D2D' }}>{Math.round(overdueRecTotal).toLocaleString('vi-VN')} đ ({overdueRecCount})</strong></span>
          ) : (
            <span>Dòng tiền dự kiến thu</span>
          )}
        </>
      }
    />
    <DomKpiTile
      label="Dự thu 30 ngày tới"
      value={`${Math.round(projectedRec30Days).toLocaleString('vi-VN')} đ`}
      icon={<Calendar size={16} />}
      accent="brand"
      valueTone="brand"
      breakdown={
        <>
          <span>Số đợt: <strong style={{ color: '#0f172a' }}>{rec30Count} đợt</strong>{pendingStudentRec30Days > 0 ? ` • Bảo lưu: +${Math.round(pendingStudentRec30Days).toLocaleString('vi-VN')} đ` : ''}</span>
          <span>Chu kỳ: 30 ngày tiếp theo</span>
        </>
      }
    />
    <DomKpiTile
      label="Dự chi 7 ngày tới"
      value={`${Math.round(projectedExp7Days).toLocaleString('vi-VN')} đ`}
      icon={<CreditCard size={16} />}
      accent="slate"
      breakdown={
        <>
          <span>Khoản chi: <strong style={{ color: '#0f172a' }}>{exp7Count} khoản PO/chi phí</strong></span>
          {overdueExpTotal > 0 ? (
            <span>Tồn đọng: <strong style={{ color: '#BD1D2D' }}>{Math.round(overdueExpTotal).toLocaleString('vi-VN')} đ ({overdueExpCount})</strong></span>
          ) : (
            <span>Dòng tiền dự kiến chi</span>
          )}
        </>
      }
    />
    <DomKpiTile
      label="Dự chi 30 ngày tới"
      value={`${Math.round(projectedExp30Days).toLocaleString('vi-VN')} đ`}
      icon={<AlertCircle size={16} />}
      accent="slate"
      breakdown={
        <>
          <span>Khoản chi: <strong style={{ color: '#0f172a' }}>{exp30Count} khoản PO/chi phí</strong></span>
          <span>Cam kết: <strong style={{ color: '#BD1D2D' }}>Chi tiêu 30 ngày</strong></span>
        </>
      }
    />
  </div>
));

const DepositsForecastCharts: React.FC<{
  forecastChartData: any[];
  cumulativeChartData: any[];
}> = React.memo(({ forecastChartData, cumulativeChartData }) => {
  const safeForecast = Array.isArray(forecastChartData) ? forecastChartData : [];
  const safeCumul = Array.isArray(cumulativeChartData) ? cumulativeChartData : [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '20px' }}>
      <DomPanelCard
        deferred
        title="Xu hướng dự thu & dự chi (30 ngày tới)"
        subtitle="So sánh dòng tiền dự kiến thu và cam kết chi theo ngày"
        icon={<TrendingUp size={16} />}
        iconAccent="brand"
        rightSlot={<span className="dom-kpi-tile__badge dom-tone-slate">Đơn vị: VND</span>}
      >
        {safeForecast.length === 0 ? (
          <DomEmptyChartState title="Chưa có dữ liệu dự báo 30 ngày" minHeight={260} />
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={safeForecast} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" strokeOpacity={0.7} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => Math.abs(val) >= 1000000 ? `${(val / 1000000).toFixed(0)}M` : Math.round(val).toLocaleString('vi-VN')}
                />
                <RechartsTooltip
                  content={<DomChartTooltip valueFormatter={(v) => `${Math.round(v).toLocaleString('vi-VN')} đ`} />}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 500 }} />
                <Bar dataKey="Dự thu" fill="#BD1D2D" radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="Dự chi" fill="#334155" radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Line type="monotone" dataKey="Dòng tiền ròng" stroke="#64748B" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </DomPanelCard>

      <DomPanelCard
        deferred
        title="Dự báo dòng tiền ròng tích lũy"
        subtitle="Biến động số dư ròng cộng dồn theo tiến độ thu chi"
        icon={<DollarSign size={16} />}
        iconAccent="slate"
        rightSlot={<span className="dom-kpi-tile__badge dom-tone-slate">Đơn vị: VND</span>}
      >
        {safeCumul.length === 0 ? (
          <DomEmptyChartState title="Chưa có dữ liệu dòng tiền tích lũy" minHeight={260} />
        ) : (
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={safeCumul} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="depCumulAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#BD1D2D" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#BD1D2D" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" strokeOpacity={0.7} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} tickLine={false} axisLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => Math.abs(val) >= 1000000 ? `${(val / 1000000).toFixed(0)}M` : Math.round(val).toLocaleString('vi-VN')}
                />
                <RechartsTooltip
                  content={<DomChartTooltip valueFormatter={(v) => `${Math.round(v).toLocaleString('vi-VN')} đ`} />}
                />
                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 500 }} />
                <Area type="monotone" dataKey="Tích lũy" fill="url(#depCumulAreaGrad)" stroke="#BD1D2D" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});

interface Deposit {
  id: number;
  contact_id: number;
  project_id: number;
  unit_code: string;
  price: number;
  expected_commission: number;
  status: string;
  cancelled_reason: string | null;
  created_at: string;
  full_name: string;
  phone: string;
  email?: string;
  avatar_url?: string;
  project_name: string;
  creator_name: string;
  creator_avatar?: string;
  milestones: Milestone[];
  created_by?: number;
  contact_owner_id?: number;
  auto_remind?: number;
  remind_days_before?: number;
  remind_at_hour?: number;
  remind_target?: number;
  currency?: string;
  exchange_rate?: string | number;
  pipeline_status?: string;
}

interface Milestone {
  id: number;
  deposit_id: number;
  milestone_name: string;
  expected_amount: number;
  unc_file_path: string | null;
  status: 'pending' | 'paid' | 'approved' | 'failed';
  approval_date: string | null;
  expected_pay_date?: string | null;
  last_reminded_at?: string | null;
}

interface Contact {
  id: number;
  full_name: string;
  phone: string;
  email?: string;
  expected_revenue?: number | string;
}

interface Project {
  id: number;
  name: string;
  code: string;
}

const formatMoney = (val: string | number, currency: string = 'VND') => {
  const num = Number(val);
  if (!Number.isFinite(num)) return '0 đ';
  const normCurrency = currency === 'EURO' ? 'EUR' : currency;
  if (normCurrency === 'VND') {
    return Math.round(num).toLocaleString('vi-VN') + ' đ';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normCurrency
  }).format(num);
};

const depositsCache: {
  scopeKey: string;
  deposits: Deposit[];
  contacts: Contact[];
  companies: any[];
  suppliers: any[];
  projects: Project[];
  usersList: any[];
  coopSlips: any[];
  purchaseOrders: any[];
  salesOrders: any[];
  expenses: any[];
  timestamp: number;
} = {
  scopeKey: '',
  deposits: [],
  contacts: [],
  companies: [],
  suppliers: [],
  projects: [],
  usersList: [],
  coopSlips: [],
  purchaseOrders: [],
  salesOrders: [],
  expenses: [],
  timestamp: 0
};

function resetDepositsCacheForScope(scopeKey: string) {
  depositsCache.scopeKey = scopeKey;
  depositsCache.deposits = [];
  depositsCache.contacts = [];
  depositsCache.companies = [];
  depositsCache.suppliers = [];
  depositsCache.projects = [];
  depositsCache.usersList = [];
  depositsCache.coopSlips = [];
  depositsCache.purchaseOrders = [];
  depositsCache.salesOrders = [];
  depositsCache.expenses = [];
  depositsCache.timestamp = 0;
}

export default function DepositsPage({ defaultTab = 'list' }: { defaultTab?: 'list' | 'stats' }) {
  const { user } = useAuth();
  const { hasPermission } = useTenantConfig();
  const scopeKey = `${(user as any)?.tenant_id ?? 1}:${user?.id ?? 0}:${user?.role ?? ''}`;
  if (depositsCache.scopeKey && depositsCache.scopeKey !== scopeKey) {
    resetDepositsCacheForScope(scopeKey);
  } else if (!depositsCache.scopeKey) {
    depositsCache.scopeKey = scopeKey;
  }

  const isViewer = checkIsViewer(user) || !hasPermission('deposits', 'write');
  const { addToast, setShowPOS } = useUIStore(useShallow((s) => ({ addToast: s.addToast, setShowPOS: s.setShowPOS })));
  const { t } = useLanguage();

  const ITEMS_PER_PAGE = Math.max(1, Number(useTypedSubSetting<number>('finance.ui_pagination_sizes', 'deposits', 8)) || 8);
  const TIMELINE_PAGE_SIZE = Math.max(10, Number(useTypedSubSetting<number>('finance.ui_pagination_sizes', 'timeline', 50)) || 50);
  const DEPOSITS_SWR_TTL_MS = Math.max(5000, Number(useTypedSubSetting<number>('ui.swr_cache_ttl_ms', 'deposits', 45_000)) || 45_000);
  const SEARCH_DEBOUNCE_MS = Math.max(100, Number(useTypedSubSetting<number>('ui.debounce_intervals_ms', 'standard_search_ms', 300)) || 300);

  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (ev: MediaQueryListEvent) => setIsMobile(ev.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [activeViewTab] = useState<'list' | 'stats'>(defaultTab);
  const [deposits, setDeposits] = useState<Deposit[]>(() => depositsCache.deposits);
  const [contacts, setContacts] = useState<Contact[]>(() => depositsCache.contacts);
  const [companies, setCompanies] = useState<any[]>(() => depositsCache.companies);
  const [suppliers, setSuppliers] = useState<any[]>(() => depositsCache.suppliers);
  const [projects, setProjects] = useState<Project[]>(() => depositsCache.projects);
  const [usersList, setUsersList] = useState<any[]>(() => depositsCache.usersList);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>(() => depositsCache.purchaseOrders);
  const [salesOrders, setSalesOrders] = useState<any[]>(() => depositsCache.salesOrders);
  const [expenses, setExpenses] = useState<any[]>(() => depositsCache.expenses);
  const [loading, setLoading] = useState(() => depositsCache.deposits.length === 0);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [period, setPeriod] = useState<Period>('all');
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange('all'));
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchQuery, SEARCH_DEBOUNCE_MS]);

  const [filterProjectId, setFilterProjectId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSalesId, setFilterSalesId] = useState('');
  const [filterOverdue, setFilterOverdue] = useState(false);

  useEffect(() => {
    if (!showMobileFilters) return;
    return pushOverlay('deposits-mobile-filters', () => setShowMobileFilters(false), 55);
  }, [showMobileFilters]);

  const projectOptions = useMemo(() => {
    return [
      { value: '', label: t("Tất cả chương trình") },
      ...ensureArray<Project>(projects).map(p => ({
        value: String(p.id),
        label: p.name
      }))
    ];
  }, [projects, t]);

  const salesOptions = useMemo(() => {
    return [
      { value: '', label: t("Tất cả TVV") },
      ...ensureArray<any>(usersList).map(u => ({
        value: String(u.id),
        label: u.full_name || u.name || `TVV #${u.id}`,
        avatar: u.avatar || u.avatar_url || '',
        sublabel: u.role || u.department || ''
      }))
    ];
  }, [usersList, t]);

  const statusOptions = useMemo(() => {
    return [
      { value: '', label: t("Tất cả trạng thái") },
      { value: 'pending_admin', label: t("Đang giao dịch") },
      { value: 'pending_student_reserved', label: t("SO Bảo lưu") },
      { value: 'approved', label: t("Hoàn tất") },
      { value: 'cancelled', label: t("Đã hủy") }
    ];
  }, [t]);

  const hasDateFilter = Boolean(dateRange.from || dateRange.to);

  const getScopedMilestones = React.useCallback((d: any): Milestone[] => {
    const ms: Milestone[] = Array.isArray(d?.milestones) ? d.milestones : [];
    if (!dateRange.from && !dateRange.to) {
      return ms;
    }
    return ms.filter((m: any) => {
      const rawDate = m?.expected_pay_date || d?.created_at || '';
      const mDate = typeof rawDate === 'string' ? rawDate.substring(0, 10) : '';
      if (!mDate) return false;
      if (dateRange.from && mDate < dateRange.from) return false;
      if (dateRange.to && mDate > dateRange.to) return false;
      return true;
    });
  }, [dateRange.from, dateRange.to]);

  const overdueSoCount = useMemo(() => {
    const todayStr = getLocalDateStr();
    return ensureArray<any>(deposits).filter((d: any) => {
      if (d.status === 'cancelled') return false;
      const ms = hasDateFilter ? getScopedMilestones(d) : ensureArray<any>(d?.milestones);
      if (ms.length === 0) return false;
      return ms.some((m: any) => m.status !== 'approved' && m.expected_pay_date && String(m.expected_pay_date).substring(0, 10) < todayStr);
    }).length;
  }, [deposits, hasDateFilter, getScopedMilestones]);

  const filteredDepositsList = React.useMemo(() => {
    let list = ensureArray<Deposit>(deposits);
    if (isSales(user)) {
      list = list.filter((d: any) =>
        String(d.created_by) === String(user?.id) ||
        String(d.owner_id) === String(user?.id) ||
        (d.contact_owner_id && String(d.contact_owner_id) === String(user?.id)) ||
        (Array.isArray(d.shareholders) && d.shareholders.some((sh: any) => String(sh.user_id) === String(user?.id)))
      );
    }

    // Filter by TVV / Sales
    if (filterSalesId) {
      list = list.filter((d: any) =>
        String(d.created_by) === filterSalesId ||
        String(d.contact_owner_id) === filterSalesId ||
        (Array.isArray(d.shareholders) && d.shareholders.some((sh: any) => String(sh.user_id) === filterSalesId))
      );
    }

    // Filter by dateRange using milestone payment schedule (expected_pay_date)
    if (dateRange.from || dateRange.to) {
      list = list.filter((d: any) => {
        if (d.status === 'cancelled' && filterStatus !== 'cancelled') return false;
        const ms = Array.isArray(d.milestones) ? d.milestones : [];
        if (ms.length > 0) {
          return getScopedMilestones(d).length > 0;
        }
        const dateStr = d.created_at?.substring(0, 10);
        if (!dateStr) return false;
        if (dateRange.from && dateStr < dateRange.from) return false;
        if (dateRange.to && dateStr > dateRange.to) return false;
        return true;
      });
    }

    // Filter by Overdue (scoped to filtered period when date filter is active)
    if (filterOverdue) {
      const todayStr = getLocalDateStr();
      list = list.filter((d: any) => {
        if (d.status === 'cancelled') return false;
        const ms = hasDateFilter ? getScopedMilestones(d) : ensureArray<any>(d?.milestones);
        if (ms.length === 0) return false;
        return ms.some((m: any) => m.status !== 'approved' && m.expected_pay_date && String(m.expected_pay_date).substring(0, 10) < todayStr);
      });
    }

    const q = debouncedSearch.trim().toLowerCase();
    return list.filter((d: any) => {
      const clientName = (d.full_name || '').toLowerCase();
      const matchesSearch = !q ? true :
        clientName.includes(q) ||
        (d.phone && String(d.phone).includes(debouncedSearch.trim())) ||
        (d.unit_code && String(d.unit_code).toLowerCase().includes(q));

      const matchesProject = !filterProjectId ? true : String(d.project_id) === filterProjectId;
      const matchesStatus = !filterStatus ? true :
        filterStatus === 'pending_student_reserved' ? (d.status !== 'approved' && d.status !== 'cancelled' && d.pipeline_status === 'pending') :
        d.status === filterStatus;

      return matchesSearch && matchesProject && matchesStatus;
    });
  }, [deposits, user, debouncedSearch, filterProjectId, filterStatus, filterSalesId, filterOverdue, dateRange, hasDateFilter, getScopedMilestones]);

  const paginatedDeposits = React.useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredDepositsList.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredDepositsList, currentPage, ITEMS_PER_PAGE]);

  const totalPages = Math.ceil(filteredDepositsList.length / ITEMS_PER_PAGE);

  useEffect(() => {
    setCurrentPage(1);
  }, [filteredDepositsList.length]);

  // Manage Milestones State
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedDepForManage, setSelectedDepForManage] = useState<Deposit | null>(null);

  // TVV Monthly Target vs SO Cash-In State
  const [salesTargetsMonth, setSalesTargetsMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [salesTargetsData, setSalesTargetsData] = useState<SalesTargetsPayload | null>(null);
  const [showSalesTargetsTable, setShowSalesTargetsTable] = useState<boolean>(false);
  const [targetModalOpen, setTargetModalOpen] = useState<boolean>(false);
  const [targetFocusUserId, setTargetFocusUserId] = useState<number | null>(null);
  const targetsAbortRef = useRef<AbortController | null>(null);

  const loadSalesTargets = React.useCallback(async (ym?: string) => {
    const monthToFetch = ym || salesTargetsMonth;
    if (!/^\d{4}-\d{2}$/.test(monthToFetch)) return;
    if (targetsAbortRef.current) {
      targetsAbortRef.current.abort();
    }
    const ctrl = new AbortController();
    targetsAbortRef.current = ctrl;
    try {
      const res = await api.get('/dashboard/sales-targets', {
        params: { month: monthToFetch, _t: Date.now() },
        signal: ctrl.signal,
      });
      if (!ctrl.signal.aborted && res.data?.data) {
        setSalesTargetsData(res.data.data);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
    }
  }, [salesTargetsMonth]);

  useEffect(() => {
    loadSalesTargets(salesTargetsMonth);
    const onTargetsUpdated = () => loadSalesTargets(salesTargetsMonth);
    window.addEventListener('sales-targets-updated', onTargetsUpdated);
    return () => {
      window.removeEventListener('sales-targets-updated', onTargetsUpdated);
      if (targetsAbortRef.current) targetsAbortRef.current.abort();
    };
  }, [salesTargetsMonth, loadSalesTargets]);

  const location = useLocation();
  const isDepositsRouteActive = location.pathname.startsWith('/deposits') || location.pathname.startsWith('/sales-orders') || location.pathname.startsWith('/cash-flow');

  // Auto-open deposit drawer from notification deep-link or POS from ?action=create
  useEffect(() => {
    if (!isDepositsRouteActive) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'create' || params.get('create') === '1') {
      params.delete('action');
      params.delete('create');
      const newSearch = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}${window.location.hash}`);
      useUIStore.getState().setShowPOS(true);
      return;
    }
    const openId = params.get('open_id') || params.get('id');
    if (!openId) return;

    const controller = new AbortController();
    api.get(`/deposits/${encodeURIComponent(openId)}`, { signal: controller.signal })
      .then(res => {
        if (controller.signal.aborted) return;
        if (res.data?.data) {
          useUIStore.getState().closeDepositDrawer();
          setSelectedDepForManage(res.data.data);
          setShowManageModal(true);
          const nextParams = new URLSearchParams(window.location.search);
          nextParams.delete('open_id');
          nextParams.delete('id');
          const nextQs = nextParams.toString();
          window.history.replaceState({}, '', `${window.location.pathname}${nextQs ? `?${nextQs}` : ''}${window.location.hash}`);
        }
      })
      .catch(err => {
        if (controller.signal.aborted || err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
        console.error('Error fetching deposit from deep-link:', err);
        const found = deposits.find((d: any) => String(d.id) === String(openId));
        if (found) {
          useUIStore.getState().closeDepositDrawer();
          setSelectedDepForManage(found);
          setShowManageModal(true);
          const nextParams = new URLSearchParams(window.location.search);
          nextParams.delete('open_id');
          nextParams.delete('id');
          const nextQs = nextParams.toString();
          window.history.replaceState({}, '', `${window.location.pathname}${nextQs ? `?${nextQs}` : ''}${window.location.hash}`);
        }
      });

    return () => controller.abort();
  }, [deposits, isDepositsRouteActive, location.search]);

  useEffect(() => {
    let activeController: AbortController | null = null;
    const handleOpenDepositDrawer = (e: any) => {
      const path = window.location.pathname;
      if (!path.startsWith('/deposits') && !path.startsWith('/sales-orders') && !path.startsWith('/cash-flow')) return;
      const depId = e.detail?.id || e.detail?.depositId;
      if (!depId) return;
      if (activeController) activeController.abort();
      activeController = new AbortController();
      const ctrl = activeController;
      api.get(`/deposits/${encodeURIComponent(depId)}`, { signal: ctrl.signal })
        .then(res => {
          if (ctrl.signal.aborted) return;
          if (res.data?.data) {
            useUIStore.getState().closeDepositDrawer();
            setSelectedDepForManage(res.data.data);
            setShowManageModal(true);
          }
        })
        .catch(err => {
          if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
          console.error('Error opening deposit drawer from event:', err);
        });
    };
    window.addEventListener('open-deposit-drawer', handleOpenDepositDrawer);
    return () => {
      if (activeController) activeController.abort();
      window.removeEventListener('open-deposit-drawer', handleOpenDepositDrawer);
    };
  }, []);

  const [tempMilestones, setTempMilestones] = useState<any[]>([]);
  const [isSavingMilestones, setIsSavingMilestones] = useState(false);
  const [actioningMilestoneId, setActioningMilestoneId] = useState<any>(null);
  const [actioningType, setActioningType] = useState<'approve' | 'reject' | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [previewReminderMilestone, setPreviewReminderMilestone] = useState<any | null>(null);

  const [activeDrawerTab, setActiveDrawerTab] = useState<'comments' | 'history'>('history');
  const [comments, setComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const commentEndRef = useRef<HTMLDivElement>(null);

  const [showContactDrawer, setShowContactDrawer] = useState(false);
  const [selectedContact, setSelectedContact] = useState<any>(null);

  const handleExportDeposits = async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const exportParams: Record<string, any> = {
        type: 'deposit',
        program: filterProjectId || '',
        owner_id: filterSalesId || '',
        milestone_status: filterOverdue ? 'overdue' : '',
        from_date: dateRange.from || '',
        to_date: dateRange.to || '',
        search: debouncedSearch.trim() || ''
      };
      if (filterStatus && filterStatus !== 'pending_student_reserved') {
        exportParams.status = filterStatus;
      }
      await downloadExportFile({
        endpoint: '/export',
        params: exportParams,
        defaultFilename: `so-dat-coc_${getLocalDateStr()}.csv`,
        onSuccess: () => addToast('Xuất file Excel/CSV thành công', 'success')
      });
    } catch (err: any) {
      addToast(err?.message || 'Không thể xuất file dữ liệu', 'error');
    } finally {
      setExportingCsv(false);
    }
  };

  const loadDataAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      if (loadDataAbortRef.current) loadDataAbortRef.current.abort();
    };
  }, []);

  const loadData = async (isSilent = false) => {
    if (loadDataAbortRef.current) {
      loadDataAbortRef.current.abort();
    }
    const controller = new AbortController();
    loadDataAbortRef.current = controller;
    const { signal } = controller;

    const hasCached = depositsCache.deposits.length > 0 && depositsCache.scopeKey === scopeKey;
    if (!isSilent && !hasCached) {
      setLoading(true);
    }
    try {
      const isStats = activeViewTab === 'stats';
      const auxFresh = Date.now() - depositsCache.timestamp < DEPOSITS_SWR_TTL_MS;
      const needListAux = !isStats && (!auxFresh || depositsCache.contacts.length === 0);

      const [resDep, resCont, resProj, resCoop, resUsr, resPO, resExp, resComp, resSup, resSO] = await Promise.all([
        fetchAPI('deposits', { signal }),
        needListAux ? fetchAPI('contacts?limit=1000', { signal }) : Promise.resolve({ success: false, data: [] }),
        !auxFresh || depositsCache.projects.length === 0
          ? fetchAPI('projects?bypass_roster=1', { signal })
          : Promise.resolve({ success: false, data: [] }),
        needListAux ? fetchAPI('cooperation-slips', { signal }).catch(() => ({ success: false, data: [] })) : Promise.resolve({ success: false, data: [] }),
        needListAux ? fetchAPI('users?all=1', { signal }).catch(() => ({ success: false, data: [] })) : Promise.resolve({ success: false, data: [] }),
        isStats ? fetchAPI('purchase-orders?payment_status=unpaid&simple=1', { signal }).catch(() => ({ success: false, data: [] })) : Promise.resolve({ success: false, data: [] }),
        isStats ? fetchAPI('expenses?status=pending&limit=5000&simple=1', { signal }).catch(() => ({ success: false, data: [] })) : Promise.resolve({ success: false, data: [] }),
        needListAux ? fetchAPI('companies?limit=1000', { signal }).catch(() => ({ success: false, data: [] })) : Promise.resolve({ success: false, data: [] }),
        needListAux ? fetchAPI('suppliers', { signal }).catch(() => ({ success: false, data: [] })) : Promise.resolve({ success: false, data: [] }),
        isStats ? fetchAPI('sales-orders?exclude_status=cancelled&payment_status=unpaid&limit=5000&simple=1', { signal }).catch(() => ({ success: false, data: [] })) : Promise.resolve({ success: false, data: [] })
      ]);

      if (signal.aborted) return;

      if (resDep.success) {
        const rawDeps = resDep.data?.items || resDep.data || [];
        const nextDeps = Array.isArray(rawDeps) ? rawDeps : [];
        setDeposits(nextDeps);
        depositsCache.scopeKey = scopeKey;
        depositsCache.deposits = nextDeps;
        depositsCache.timestamp = Date.now();
        loadSalesTargets(salesTargetsMonth);
      }
      if (resCont.success) {
        const rawCont = resCont.data?.items || resCont.data || [];
        const allContacts = Array.isArray(rawCont) ? rawCont : [];
        const filteredContacts = isSales(user)
          ? allContacts.filter((c: any) => String(c.owner_id) === String(user?.id))
          : allContacts;
        setContacts(filteredContacts);
        depositsCache.contacts = filteredContacts;
      }
      if (resComp?.success) {
        const rawComp = resComp.data?.items || resComp.data || [];
        const nextComp = Array.isArray(rawComp) ? rawComp : [];
        setCompanies(nextComp);
        depositsCache.companies = nextComp;
      }
      if (resSup?.success) {
        const rawSup = resSup.data?.items || resSup.data?.suppliers || resSup.data || [];
        const nextSup = Array.isArray(rawSup) ? rawSup : [];
        setSuppliers(nextSup);
        depositsCache.suppliers = nextSup;
      }
      if (resProj.success) {
        const rawProj = resProj.data?.items || resProj.data || [];
        const nextProj = Array.isArray(rawProj) ? rawProj : [];
        setProjects(nextProj);
        depositsCache.projects = nextProj;
      }
      if (resCoop.success) {
        const rawCoop = resCoop.data?.items || resCoop.data || [];
        const nextCoop = Array.isArray(rawCoop) ? rawCoop : [];
        depositsCache.coopSlips = nextCoop;
      }
      if (resUsr.success) {
        const rawUsr = resUsr.data?.items || resUsr.data || [];
        const nextUsr = Array.isArray(rawUsr) ? rawUsr : [];
        setUsersList(nextUsr);
        depositsCache.usersList = nextUsr;
      }
      if (isStats && resPO) {
        const poData = resPO.data?.items || resPO.data || resPO;
        const nextPo = Array.isArray(poData) ? poData : [];
        setPurchaseOrders(nextPo);
        depositsCache.purchaseOrders = nextPo;
      }
      if (isStats && resSO) {
        const soData = resSO.data?.orders || resSO.data || resSO;
        const nextSo = Array.isArray(soData) ? soData : [];
        setSalesOrders(nextSo);
        depositsCache.salesOrders = nextSo;
      }
      if (isStats && resExp) {
        const expData = resExp.data?.items || resExp.data || resExp;
        const nextExp = Array.isArray(expData) ? expData : [];
        setExpenses(nextExp);
        depositsCache.expenses = nextExp;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      addToast(e.message || 'Lỗi kết nối', 'error');
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    setDeposits(depositsCache.scopeKey === scopeKey ? depositsCache.deposits : []);
    loadData(depositsCache.scopeKey === scopeKey && depositsCache.deposits.length > 0);
    const handleRefresh = () => {
      loadData(true);
    };
    window.addEventListener('deposit-created', handleRefresh);
    window.addEventListener('deposit-updated', handleRefresh);
    window.addEventListener('refresh-deposits', handleRefresh);
    return () => {
      window.removeEventListener('deposit-created', handleRefresh);
      window.removeEventListener('deposit-updated', handleRefresh);
      window.removeEventListener('refresh-deposits', handleRefresh);
    };
  }, [activeViewTab, scopeKey]);

  const handleOpenManageMilestones = (dep: Deposit) => {
    setSelectedDepForManage(dep);
    setShowManageModal(true);
  };

  const parseLocalIsoDate = React.useCallback((dateStr: string): Date => {
    const clean = String(dateStr || '').substring(0, 10);
    const parts = clean.split('-');
    if (parts.length === 3) {
      const y = Number(parts[0]);
      const m = Number(parts[1]);
      const d = Number(parts[2]);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
        return new Date(y, m - 1, d);
      }
    }
    const fallback = new Date(dateStr);
    fallback.setHours(0, 0, 0, 0);
    return fallback;
  }, []);

  const projectedReceivables = React.useMemo(() => {
    const todayStr = getLocalDateStr();
    const map: Record<string, { date: string; totalAmount: number; milestones: any[] }> = {};

    const depList = Array.isArray(deposits) ? deposits : [];
    depList.forEach(d => {
      const isPendingStudent = d.pipeline_status === 'pending';

      const depMilestones = ensureArray(d?.milestones);
      if (depMilestones.length > 0) {
        depMilestones.forEach(m => {
          if (m.status !== 'approved' && m.expected_pay_date) {
            const rawDateStr = m.expected_pay_date.substring(0, 10);
            const dateStr = rawDateStr;
            const amount = Math.round(Number(m.expected_amount) || 0);
            
            if (!map[dateStr]) {
              map[dateStr] = {
                date: dateStr,
                totalAmount: 0,
                milestones: []
              };
            }
            if (!isPendingStudent) {
              map[dateStr].totalAmount += amount;
            }
            map[dateStr].milestones.push({
              ...m,
              expected_amount: amount,
              milestone_name: m.milestone_name || t('Thanh toán đợt cọc'),
              customerName: d.full_name || '',
              phone: d.phone,
              unitCode: d.unit_code,
              projectName: d.project_name,
              customerAvatar: d.avatar_url,
              isOverdue: rawDateStr < todayStr,
              isPendingStudent
            });
          }
        });
      }
    });

    const soList = Array.isArray(salesOrders) ? salesOrders : [];
    soList.forEach(so => {
      if (so.payment_status !== 'paid' && so.status !== 'cancelled' && so.order_date) {
        const rawDateStr = so.order_date.substring(0, 10);
        const dateStr = rawDateStr;
        const unpaid = Math.round((Number(so.total) || 0) - (Number(so.paid_amount) || 0));

        if (unpaid > 0) {
          if (!map[dateStr]) {
            map[dateStr] = {
              date: dateStr,
              totalAmount: 0,
              milestones: []
            };
          }
          map[dateStr].totalAmount += unpaid;
          map[dateStr].milestones.push({
            id: `so-${so.id}`,
            expected_amount: unpaid,
            expected_pay_date: dateStr,
            milestone_name: t('Thanh toán đơn hàng'),
            status: 'pending',
            customerName: so.contact_name || so.company_name || t('Khách hàng'),
            phone: so.contact_phone || '',
            unitCode: so.so_number,
            projectName: t('Đơn bán hàng'),
            isSO: true,
            isOverdue: rawDateStr < todayStr
          });
        }
      }
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [deposits, salesOrders, t]);

  const projectedExpenditures = React.useMemo(() => {
    const todayStr = getLocalDateStr();
    const map: Record<string, { date: string; totalAmount: number; items: any[] }> = {};

    const expList = Array.isArray(expenses) ? expenses : [];
    const poList = Array.isArray(purchaseOrders) ? purchaseOrders : [];

    // 1. Add pending expenses
    expList.forEach(e => {
      if (e.status === 'pending' && e.date) {
        const rawDateStr = e.date.substring(0, 10);
        const dateStr = rawDateStr;
        const amount = Math.round(Number(e.amount) || 0);
        if (!map[dateStr]) {
          map[dateStr] = { date: dateStr, totalAmount: 0, items: [] };
        }
        map[dateStr].totalAmount += amount;
        map[dateStr].items.push({
          type: 'Expense',
          title: e.title,
          category: e.category,
          amount,
          vendor: e.vendor_name || 'Khác',
          isOverdue: rawDateStr < todayStr
        });
      }
    });

    // 2. Add unpaid/partial POs
    poList.forEach(po => {
      if (po.payment_status !== 'paid' && po.order_date) {
        const rawDateStr = po.order_date.substring(0, 10);
        const dateStr = rawDateStr;
        const unpaid = Math.round((Number(po.total) || 0) - (Number(po.paid_amount) || 0));
        if (unpaid > 0) {
          if (!map[dateStr]) {
            map[dateStr] = { date: dateStr, totalAmount: 0, items: [] };
          }
          map[dateStr].totalAmount += unpaid;
          map[dateStr].items.push({
            type: 'PO',
            title: `Đơn mua hàng: ${po.po_number}`,
            category: 'Mua hàng',
            amount: unpaid,
            vendor: po.supplier_name || 'Nhà cung cấp',
            isOverdue: rawDateStr < todayStr
          });
        }
      }
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [expenses, purchaseOrders]);

  const projectedRec7Days = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedReceivables.filter(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 7;
    }).reduce((sum, r) => sum + r.totalAmount, 0);
  }, [projectedReceivables, parseLocalIsoDate]);

  const rec7Count = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedReceivables.filter(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 7;
    }).reduce((sum, r) => sum + r.milestones.length, 0);
  }, [projectedReceivables, parseLocalIsoDate]);

  const projectedRec30Days = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedReceivables.filter(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 30;
    }).reduce((sum, r) => sum + r.totalAmount, 0);
  }, [projectedReceivables, parseLocalIsoDate]);

  const rec30Count = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedReceivables.filter(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 30;
    }).reduce((sum, r) => sum + r.milestones.length, 0);
  }, [projectedReceivables, parseLocalIsoDate]);

  const overdueRecTotal = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedReceivables.filter(r => {
      const target = parseLocalIsoDate(r.date);
      return target.getTime() < today.getTime();
    }).reduce((sum, r) => sum + r.totalAmount, 0);
  }, [projectedReceivables, parseLocalIsoDate]);

  const overdueRecCount = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedReceivables.filter(r => {
      const target = parseLocalIsoDate(r.date);
      return target.getTime() < today.getTime();
    }).reduce((sum, r) => sum + r.milestones.length, 0);
  }, [projectedReceivables, parseLocalIsoDate]);

  const pendingStudentRec7Days = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let sum = 0;
    projectedReceivables.forEach(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      if (diff >= 0 && diff <= 7) {
        ensureArray(r?.milestones).forEach((m: any) => {
          if (m.isPendingStudent) {
            sum += Math.round(Number(m.expected_amount) || 0);
          }
        });
      }
    });
    return sum;
  }, [projectedReceivables, parseLocalIsoDate]);

  const pendingStudentRec30Days = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let sum = 0;
    projectedReceivables.forEach(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      if (diff >= 0 && diff <= 30) {
        ensureArray(r?.milestones).forEach((m: any) => {
          if (m.isPendingStudent) {
            sum += Math.round(Number(m.expected_amount) || 0);
          }
        });
      }
    });
    return sum;
  }, [projectedReceivables, parseLocalIsoDate]);

  const projectedExp7Days = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedExpenditures.filter(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 7;
    }).reduce((sum, r) => sum + r.totalAmount, 0);
  }, [projectedExpenditures, parseLocalIsoDate]);

  const exp7Count = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedExpenditures.filter(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 7;
    }).reduce((sum, r) => sum + r.items.length, 0);
  }, [projectedExpenditures, parseLocalIsoDate]);

  const projectedExp30Days = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedExpenditures.filter(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 30;
    }).reduce((sum, r) => sum + r.totalAmount, 0);
  }, [projectedExpenditures, parseLocalIsoDate]);

  const exp30Count = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedExpenditures.filter(r => {
      const target = parseLocalIsoDate(r.date);
      const diff = (target.getTime() - today.getTime()) / (1000 * 3600 * 24);
      return diff >= 0 && diff <= 30;
    }).reduce((sum, r) => sum + r.items.length, 0);
  }, [projectedExpenditures, parseLocalIsoDate]);

  const overdueExpTotal = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedExpenditures.filter(r => {
      const target = parseLocalIsoDate(r.date);
      return target.getTime() < today.getTime();
    }).reduce((sum, r) => sum + r.totalAmount, 0);
  }, [projectedExpenditures, parseLocalIsoDate]);

  const overdueExpCount = React.useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return projectedExpenditures.filter(r => {
      const target = parseLocalIsoDate(r.date);
      return target.getTime() < today.getTime();
    }).reduce((sum, r) => sum + r.items.length, 0);
  }, [projectedExpenditures, parseLocalIsoDate]);

  const forecastChartData = React.useMemo(() => {
    const data: any[] = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = getLocalDateStr(d);
      
      const rec = projectedReceivables.find(r => r.date === dateStr);
      const recAmount = rec ? rec.totalAmount : 0;
      
      const exp = projectedExpenditures.find(e => e.date === dateStr);
      const expAmount = exp ? exp.totalAmount : 0;
      
      const label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      
      data.push({
        date: dateStr,
        label,
        'Dự thu': Math.round(recAmount),
        'Dự chi': Math.round(expAmount),
        'Dòng tiền ròng': Math.round(recAmount - expAmount)
      });
    }
    
    return data;
  }, [projectedReceivables, projectedExpenditures]);

  const cumulativeChartData = React.useMemo(() => {
    let acc = 0;
    return forecastChartData.map(d => {
      acc += d['Dòng tiền ròng'];
      return { ...d, 'Tích lũy': acc };
    });
  }, [forecastChartData]);

  const unifiedTimeline = React.useMemo(() => {
    const map: Record<string, { date: string; receiptTotal: number; expenditureTotal: number; items: any[] }> = {};

    projectedReceivables.forEach(r => {
      if (!map[r.date]) {
        map[r.date] = { date: r.date, receiptTotal: 0, expenditureTotal: 0, items: [] };
      }
      map[r.date].receiptTotal += r.totalAmount;
      ensureArray(r?.milestones).forEach((m: any) => {
        map[r.date].items.push({
          type: 'receipt',
          title: m.isPendingStudent 
            ? `Dự thu (HV Pending): ${m.customerName} (${m.unitCode || 'Không có mã'})`
            : `Dự thu: ${m.customerName} (${m.unitCode || 'Không có mã'})`,
          desc: `${m.projectName || 'Chương trình'} - Đợt thanh toán: ${m.milestone_name}`,
          amount: Math.round(Number(m.expected_amount) || 0),
          customerAvatar: m.customerAvatar,
          customerName: m.customerName,
          isPendingStudent: m.isPendingStudent,
          isOverdue: m.isOverdue
        });
      });
    });

    projectedExpenditures.forEach(e => {
      if (!map[e.date]) {
        map[e.date] = { date: e.date, receiptTotal: 0, expenditureTotal: 0, items: [] };
      }
      map[e.date].expenditureTotal += e.totalAmount;
      ensureArray(e?.items).forEach((item: any) => {
        map[e.date].items.push({
          type: 'expenditure',
          title: item.title,
          desc: `${item.category} - ${item.vendor}`,
          amount: Math.round(Number(item.amount) || 0),
          isOverdue: item.isOverdue
        });
      });
    });

    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [projectedReceivables, projectedExpenditures]);

  const [timelineFilter, setTimelineFilter] = useState<'upcoming' | 'overdue' | 'all'>('upcoming');
  const [timelinePage, setTimelinePage] = useState(1);
  const todayDateStr = React.useMemo(() => getLocalDateStr(), []);

  const allTimelineItems = React.useMemo(() => {
    const list: any[] = [];
    unifiedTimeline.forEach(day => {
      ensureArray(day?.items).forEach((item: any) => {
        list.push({
          ...item,
          date: day.date,
          isOverdue: day.date < todayDateStr
        });
      });
    });
    return list;
  }, [unifiedTimeline, todayDateStr]);

  const upcomingTimelineCount = React.useMemo(() => {
    return allTimelineItems.filter(it => it.date >= todayDateStr).length;
  }, [allTimelineItems, todayDateStr]);

  const overdueTimelineCount = React.useMemo(() => {
    return allTimelineItems.filter(it => it.date < todayDateStr).length;
  }, [allTimelineItems, todayDateStr]);

  const filteredTimelineItems = React.useMemo(() => {
    let items = allTimelineItems;
    if (timelineFilter === 'upcoming') {
      items = items.filter(it => it.date >= todayDateStr);
      items = [...items].sort((a, b) => a.date.localeCompare(b.date));
    } else if (timelineFilter === 'overdue') {
      items = items.filter(it => it.date < todayDateStr);
      items = [...items].sort((a, b) => b.date.localeCompare(a.date));
    } else {
      items = [...items].sort((a, b) => a.date.localeCompare(b.date));
    }
    return items;
  }, [allTimelineItems, timelineFilter, todayDateStr]);

  const paginatedTimelineItems = React.useMemo(() => {
    const start = (timelinePage - 1) * TIMELINE_PAGE_SIZE;
    return filteredTimelineItems.slice(start, start + TIMELINE_PAGE_SIZE);
  }, [filteredTimelineItems, timelinePage]);

  const paginatedTimelineGroups = React.useMemo(() => {
    const groups: { date: string; receiptTotal: number; expenditureTotal: number; items: any[] }[] = [];
    const groupMap: Record<string, { date: string; receiptTotal: number; expenditureTotal: number; items: any[] }> = {};

    paginatedTimelineItems.forEach(item => {
      if (!groupMap[item.date]) {
        groupMap[item.date] = {
          date: item.date,
          receiptTotal: 0,
          expenditureTotal: 0,
          items: []
        };
        groups.push(groupMap[item.date]);
      }
      if (item.type === 'receipt') {
        groupMap[item.date].receiptTotal += item.amount;
      } else {
        groupMap[item.date].expenditureTotal += item.amount;
      }
      groupMap[item.date].items.push(item);
    });

    return groups;
  }, [paginatedTimelineItems]);

  const handleTimelineFilterChange = (f: 'upcoming' | 'overdue' | 'all') => {
    setTimelineFilter(f);
    setTimelinePage(1);
  };

  const listStats = React.useMemo(() => {
    let totalSOAmount = 0;
    let approvedMilestoneAmount = 0;
    let pendingMilestoneAmount = 0;
    let pendingStudentMilestoneAmount = 0;
    let maxSOAmount = 0;
    let maxSOTitle = '';
    
    let approvedCount = 0;
    let pendingCount = 0;
    let pendingStudentCount = 0;
    let activeOrderCount = 0;
    let totalScopedMilestonesCount = 0;

    filteredDepositsList.forEach(d => {
      if (d.status === 'cancelled' && filterStatus !== 'cancelled') {
        return;
      }
      activeOrderCount++;

      const scopedMs = getScopedMilestones(d);
      let depScopedAmount = 0;

      if (scopedMs.length > 0) {
        scopedMs.forEach(m => {
          const amt = Number(m.expected_amount) || 0;
          depScopedAmount += amt;
          totalScopedMilestonesCount++;
          if (m.status === 'approved') {
            approvedMilestoneAmount += amt;
            approvedCount++;
          } else {
            // Exclude from projected receivables if student is pending (bảo lưu)
            if (d.pipeline_status === 'pending') {
              pendingStudentMilestoneAmount += amt;
              pendingStudentCount++;
              return;
            }
            pendingMilestoneAmount += amt;
            pendingCount++;
          }
        });
      } else if (!hasDateFilter) {
        depScopedAmount = Number(d.price) || 0;
      }

      totalSOAmount += depScopedAmount;

      if (depScopedAmount > maxSOAmount) {
        maxSOAmount = depScopedAmount;
        const isPartial = hasDateFilter && scopedMs.length > 0 && (d.milestones?.length || 0) > scopedMs.length;
        const msSuffix = isPartial ? ` (${scopedMs.map((m: any) => m.milestone_name).join(', ')})` : '';
        maxSOTitle = `${d.full_name || ''} - ${d.project_name || 'Dự án'}${msSuffix}`;
      }
    });

    return {
      totalSOAmount,
      approvedMilestoneAmount,
      pendingMilestoneAmount,
      pendingStudentMilestoneAmount,
      maxSOAmount,
      maxSOTitle,
      approvedCount,
      pendingCount,
      pendingStudentCount,
      activeOrderCount,
      totalScopedMilestonesCount
    };
  }, [filteredDepositsList, filterStatus, hasDateFilter, getScopedMilestones]);

  return (
    <div className="anim-fade-up" style={{ color: 'var(--color-text)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Notifications */}

      {/* Header */}
      <div className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
            <span>{activeViewTab === 'stats' ? t("Dự báo dòng tiền") : t("Quản lý thanh toán")}</span>
            {activeViewTab !== 'stats' && (
              <button
                onClick={() => setShowInfoModal(true)}
                style={{
                  background: 'rgba(0, 0, 0, 0.02)',
                  border: '1px solid var(--color-border)',
                  padding: isMobile ? '2px 6px' : '3px 8px',
                  borderRadius: '20px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  cursor: 'pointer',
                  color: 'var(--color-text-muted)',
                  transition: 'all 0.2s',
                  height: isMobile ? '22px' : '24px',
                  flexShrink: 0
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = 'var(--color-primary)';
                  e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                  e.currentTarget.style.background = 'var(--color-primary-light)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = 'var(--color-text-muted)';
                  e.currentTarget.style.borderColor = 'var(--color-border)';
                  e.currentTarget.style.background = 'rgba(0, 0, 0, 0.02)';
                }}
                title={t("Xem hướng dẫn quy tắc đặt hàng & đổi sản phẩm")}
              >
                <Info size={12} />
                <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>{isMobile ? t("Cơ chế") : t("Giải thích cơ chế")}</span>
              </button>
            )}
          </h1>
          <p className="page-subtitle">
            {activeViewTab === 'stats' 
              ? t("Theo dõi và dự báo dòng tiền vào ra chi tiết theo các mốc thời gian") 
              : t("Theo dõi đơn hàng, tiến độ thanh toán và duyệt Sales Order")}
          </p>
        </div>
        <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile && activeViewTab !== 'stats' ? 'repeat(2, minmax(0, 1fr))' : (isMobile ? 'minmax(0, 1fr)' : undefined), alignItems: 'center', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
          {activeViewTab !== 'stats' && (
            <div style={{ minWidth: 0, gridColumn: isMobile ? '1 / -1' : undefined }}>
              <PeriodFilter
                value={period}
                onChange={(p, r) => { setPeriod(p); setDateRange(r); setCurrentPage(1); }}
                buttonStyle={{ height: 36, minHeight: 36, borderRadius: 10 }}
              />
            </div>
          )}
          {activeViewTab !== 'stats' && (
            <DomToolbarButton
              variant="outline"
              icon={exportingCsv ? <Loader2 size={14} className="spin" /> : <Download size={14} />}
              onClick={handleExportDeposits}
              disabled={exportingCsv}
              style={{ width: isMobile ? '100%' : 'auto' }}
              title="Xuất danh sách đơn hàng / đặt cọc ra CSV"
            >
              {exportingCsv ? 'Đang xuất...' : (isMobile ? 'Xuất CSV' : 'Xuất Excel / CSV')}
            </DomToolbarButton>
          )}
          {!isViewer && activeViewTab !== 'stats' && (
            <DomToolbarButton
              variant="primary"
              icon={<Plus size={15} />}
              onClick={() => setShowPOS(true)}
              style={{ width: isMobile ? '100%' : 'auto' }}
            >
              {isMobile ? 'Tạo đơn mới' : 'Tạo đơn hàng mới'}
            </DomToolbarButton>
          )}
        </div>
      </div>

      {activeViewTab === 'list' ? (
        <>
          <DepositsListKpiStrip
            loading={loading}
            hasDateFilter={hasDateFilter}
            listStats={listStats}
          />

          {/* Real-time CRM TVV Monthly Revenue Target vs SO Cash-In Card */}
          {salesTargetsData && (
            <div
              className="card"
              style={{
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border-light, #e2e8f0)',
                borderRadius: '16px',
                padding: isMobile ? '14px' : '16px 20px',
                marginBottom: '20px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(189, 29, 45, 0.08)',
                      color: '#BD1D2D',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Target size={16} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                        {salesTargetsData.can_view_all
                          ? 'Tiến độ Target Doanh Thu Tháng TVV (Theo SO & Thực Thu)'
                          : 'Tiến độ Target Doanh Thu Tháng Của Bạn'}
                      </span>
                      <input
                        type="month"
                        value={salesTargetsMonth}
                        onChange={(e) => {
                          if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                            setSalesTargetsMonth(e.target.value);
                          }
                        }}
                        className="form-input"
                        style={{
                          height: '28px',
                          width: '136px',
                          margin: 0,
                          padding: '0 8px',
                          borderRadius: '7px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          color: '#0f172a',
                        }}
                      />
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '12px', fontVariantNumeric: 'tabular-nums' }}>
                      <span>
                        • Target tháng:{' '}
                        <strong style={{ color: '#0f172a' }}>
                          {Math.round(salesTargetsData.summary?.total_target || 0).toLocaleString('vi-VN')} đ
                        </strong>
                      </span>
                      <span>
                        • Lên đơn SO:{' '}
                        <strong style={{ color: '#0f172a' }}>
                          {Math.round(salesTargetsData.summary?.total_so_value || 0).toLocaleString('vi-VN')} đ
                        </strong>
                      </span>
                      <span>
                        • Thực thu đã duyệt:{' '}
                        <strong style={{ color: '#BD1D2D' }}>
                          {Math.round(salesTargetsData.summary?.total_cash_in_approved || 0).toLocaleString('vi-VN')} đ
                        </strong>
                      </span>
                      <span>
                        • Đạt:{' '}
                        <strong style={{ color: getTargetProgressTone(Number(salesTargetsData.summary?.achievement_pct || 0)) }}>
                          {Number(salesTargetsData.summary?.achievement_pct || 0)}%
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  {Array.isArray(salesTargetsData.items) && salesTargetsData.items.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowSalesTargetsTable((prev) => !prev)}
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                        color: '#334155',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        cursor: 'pointer',
                      }}
                    >
                      <span>Chi tiết TVV ({salesTargetsData.items.length})</span>
                      {showSalesTargetsTable ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                  {salesTargetsData.can_manage_targets && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetFocusUserId(null);
                        setTargetModalOpen(true);
                      }}
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #BD1D2D',
                        background: '#BD1D2D',
                        color: '#ffffff',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                      }}
                    >
                      <Target size={14} />
                      <span>Thiết lập Target TVV</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Overall Progress Bar */}
              {Number(salesTargetsData.summary?.total_target || 0) > 0 && (
                <div style={{ width: '100%', height: '6px', borderRadius: '4px', background: '#f1f5f9', overflow: 'hidden', marginTop: '12px' }}>
                  <div
                    style={{
                      width: `${Math.min(100, Number(salesTargetsData.summary?.achievement_pct || 0))}%`,
                      height: '100%',
                      background: getTargetProgressTone(Number(salesTargetsData.summary?.achievement_pct || 0)),
                      borderRadius: '4px',
                      transition: 'width 0.25s ease',
                    }}
                  />
                </div>
              )}

              {/* Expandable Per-TVV Target vs SO Table */}
              {showSalesTargetsTable && Array.isArray(salesTargetsData.items) && salesTargetsData.items.length > 0 && (
                <div style={{ marginTop: '14px', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Tư vấn viên</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Target Tháng</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Giá trị lên SO</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Thực thu đã duyệt</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>Còn thiếu</th>
                        <th style={{ padding: '10px 12px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', minWidth: '130px' }}>% Hoàn thành</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesTargetsData.items.map((tvv) => {
                        const pct = Number(tvv.achievement_pct || 0);
                        const tone = getTargetProgressTone(pct);
                        return (
                          <tr key={tvv.user_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '9px 12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                <Avatar name={tvv.full_name} src={tvv.avatar_url || undefined} size={30} />
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{tvv.full_name}</div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                    {tvv.team_name ? `${tvv.team_name} • ` : ''}
                                    {tvv.so_count || 0} đơn SO
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td
                              onClick={() => {
                                if (salesTargetsData.can_manage_targets) {
                                  setTargetFocusUserId(tvv.user_id);
                                  setTargetModalOpen(true);
                                }
                              }}
                              style={{
                                padding: '9px 12px',
                                textAlign: 'right',
                                fontWeight: 800,
                                color: tvv.target_amount > 0 ? '#0f172a' : '#94a3b8',
                                fontVariantNumeric: 'tabular-nums',
                                cursor: salesTargetsData.can_manage_targets ? 'pointer' : 'default',
                              }}
                              title={salesTargetsData.can_manage_targets ? 'Click để điều chỉnh Target tháng' : undefined}
                            >
                              {tvv.target_amount > 0 ? `${Math.round(tvv.target_amount).toLocaleString('vi-VN')} đ` : 'Đặt Target'}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: '#334155', fontVariantNumeric: 'tabular-nums' }}>
                              {Math.round(tvv.so_value || 0).toLocaleString('vi-VN')} đ
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: tvv.cash_in_approved > 0 ? '#BD1D2D' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                              {Math.round(tvv.cash_in_approved || 0).toLocaleString('vi-VN')} đ
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                              {tvv.target_amount > 0
                                ? tvv.remaining_target > 0
                                  ? `${Math.round(tvv.remaining_target).toLocaleString('vi-VN')} đ`
                                  : 'Đạt 100%+'
                                : '—'}
                            </td>
                            <td style={{ padding: '9px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {tvv.target_amount > 0 ? (
                                <div>
                                  <div style={{ fontWeight: 800, color: tone }}>{pct}%</div>
                                  <div style={{ width: '100%', height: '5px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden', marginTop: '3px' }}>
                                    <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: tone, borderRadius: '4px' }} />
                                  </div>
                                </div>
                              ) : (
                                <span style={{ color: '#94a3b8', fontSize: '0.73rem' }}>—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Search & Filter Bar */}
          <div style={{ 
            display: 'flex', 
            gap: isMobile ? '8px' : '12px', 
            marginBottom: '1.25rem', 
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#FFFFFF',
            padding: isMobile ? '8px 10px' : '12px',
            borderRadius: '14px',
            border: '1px solid #E2E8F0',
            position: 'relative',
            overflow: 'visible',
            zIndex: 5
          }}>
            <div style={{ position: 'relative', flex: '1', minWidth: 0 }}>
              <input
                type="text"
                placeholder={t("Tìm kiếm theo khách hàng, số điện thoại...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ width: '100%', paddingRight: '2.5rem', paddingLeft: '12px', height: isMobile ? '36px' : '38px', borderRadius: '10px', margin: 0, fontSize: isMobile ? '0.82rem' : '0.875rem' }}
              />
              <Search style={{ position: 'absolute', right: '12px', top: isMobile ? '10px' : '11px', color: 'var(--color-text-muted)' }} size={16} />
            </div>

            {/* Mobile [...] Filter Button */}
            {isMobile ? (
              <div style={{ position: 'relative' }}>
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
                    border: '1px solid #E2E8F0',
                    borderRadius: '8px',
                    background: showMobileFilters ? '#F1F5F9' : '#FFFFFF',
                    color: (filterProjectId || filterStatus || filterSalesId || filterOverdue) ? '#BD1D2D' : '#0F172A',
                    outline: 'none',
                    boxShadow: 'var(--shadow-sm)',
                    flexShrink: 0,
                    position: 'relative'
                  }}
                  title="Bộ lọc đơn hàng / cọc"
                >
                  <MoreHorizontal size={18} />
                  {(filterProjectId || filterStatus || filterSalesId || filterOverdue) && (
                    <span style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#BD1D2D'
                    }} />
                  )}
                </button>

                {/* Mobile Filters Portal Popover */}
                {typeof document !== 'undefined' && createPortal(
                  <AnimatePresence>
                    {showMobileFilters && (
                      <>
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                          onClick={() => setShowMobileFilters(false)}
                          style={{ position: 'fixed', inset: 0, zIndex: 2147483644, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(4px)' }}
                        />
                        <motion.div
                          initial={{ opacity: 0, y: 12, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 12, scale: 0.98 }}
                          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'fixed',
                            left: '16px',
                            right: '16px',
                            bottom: '20px',
                            background: '#FFFFFF',
                            border: '1px solid #E2E8F0',
                            borderRadius: '16px',
                            boxShadow: '0 20px 45px rgba(15, 23, 42, 0.22)',
                            padding: '16px',
                            zIndex: 2147483645,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                            <strong style={{ fontSize: '0.88rem', color: '#0F172A' }}>{t("Bộ lọc đơn hàng")}</strong>
                            <button type="button" onClick={() => setShowMobileFilters(false)} style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', padding: '4px' }}>
                              <X size={16} />
                            </button>
                          </div>

                          <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                              {t("Chương trình")}
                            </label>
                            <CustomSelect
                              options={projectOptions}
                              value={filterProjectId}
                              onChange={(val) => { setFilterProjectId(val); setShowMobileFilters(false); }}
                              searchable={true}
                              placeholder={t("Tất cả chương trình")}
                              width="100%"
                              size="xs"
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                              {t("Tư vấn viên (TVV)")}
                            </label>
                            <CustomSelect
                              options={salesOptions}
                              value={filterSalesId}
                              onChange={(val) => { setFilterSalesId(val); setShowMobileFilters(false); }}
                              searchable={true}
                              showAvatars={true}
                              placeholder={t("Tất cả TVV")}
                              width="100%"
                              size="xs"
                            />
                          </div>

                          <div>
                            <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                              {t("Trạng thái")}
                            </label>
                            <CustomSelect
                              options={statusOptions}
                              value={filterStatus}
                              onChange={(val) => { setFilterStatus(val); setShowMobileFilters(false); }}
                              placeholder={t("Tất cả trạng thái")}
                              width="100%"
                              size="xs"
                            />
                          </div>

                          <div>
                            <button
                              type="button"
                              onClick={() => { setFilterOverdue(!filterOverdue); setShowMobileFilters(false); }}
                              style={{
                                width: '100%',
                                padding: '9px',
                                borderRadius: '8px',
                                border: filterOverdue ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                                background: filterOverdue ? 'rgba(189, 29, 45, 0.08)' : '#FFFFFF',
                                color: filterOverdue ? '#BD1D2D' : '#0F172A',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px'
                              }}
                            >
                              <Clock size={14} />
                              <span>{t("SO trễ hạn thanh toán")}</span>
                              {overdueSoCount > 0 && (
                                <span style={{ background: '#BD1D2D', color: '#fff', padding: '1px 6px', borderRadius: '6px', fontSize: '0.7rem' }}>
                                  {overdueSoCount}
                                </span>
                              )}
                            </button>
                          </div>

                          {(filterProjectId || filterStatus || filterSalesId || filterOverdue) && (
                            <button
                              type="button"
                              onClick={() => { setFilterProjectId(''); setFilterStatus(''); setFilterSalesId(''); setFilterOverdue(false); setShowMobileFilters(false); }}
                              style={{
                                padding: '8px',
                                borderRadius: '8px',
                                border: 'none',
                                background: 'rgba(189, 29, 45, 0.08)',
                                color: '#BD1D2D',
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                textAlign: 'center'
                              }}
                            >
                              {t("Đặt lại bộ lọc")}
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
              /* Desktop Filters */
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ width: '180px' }}>
                  <CustomSelect
                    options={projectOptions}
                    value={filterProjectId}
                    onChange={(val) => setFilterProjectId(val)}
                    searchable={true}
                    placeholder={t("Tất cả chương trình")}
                    width="100%"
                    size="sm"
                  />
                </div>

                <div style={{ width: '180px' }}>
                  <CustomSelect
                    options={salesOptions}
                    value={filterSalesId}
                    onChange={(val) => setFilterSalesId(val)}
                    searchable={true}
                    showAvatars={true}
                    placeholder={t("Tất cả TVV")}
                    width="100%"
                    size="sm"
                  />
                </div>

                <div style={{ width: '160px' }}>
                  <CustomSelect
                    options={statusOptions}
                    value={filterStatus}
                    onChange={(val) => setFilterStatus(val)}
                    placeholder={t("Tất cả trạng thái")}
                    width="100%"
                    size="sm"
                  />
                </div>

                <DomToolbarButton
                  variant="outline"
                  active={filterOverdue}
                  icon={<Clock size={15} />}
                  badge={overdueSoCount > 0 ? overdueSoCount : undefined}
                  onClick={() => setFilterOverdue(!filterOverdue)}
                  title="Lọc danh sách các đơn hàng có đợt thanh toán quá hạn chưa nộp"
                >
                  Trễ hạn
                </DomToolbarButton>

                {(filterProjectId || filterStatus || filterSalesId || filterOverdue) && (
                  <DomToolbarButton
                    variant="danger"
                    icon={<X size={15} />}
                    onClick={() => { setFilterProjectId(''); setFilterStatus(''); setFilterSalesId(''); setFilterOverdue(false); }}
                    style={{ width: 36, padding: 0 }}
                    title="Xóa tất cả bộ lọc"
                  />
                )}
              </div>
            )}
          </div>

          {/* List */}
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : filteredDepositsList.length === 0 ? (
            <EmptyCard
              icon={<CreditCard />}
              title="Chưa có lịch thanh toán nào"
              description="Theo dõi đơn hàng, tiến độ thanh toán và duyệt Sales Order."
              actionText={isViewer ? undefined : "Tạo đơn hàng mới"}
              onAction={isViewer ? undefined : () => setShowPOS(true)}
            />
          ) : (
            <>
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {paginatedDeposits.map(dep => {
                  let statusText = 'Đang giao dịch';
                  let statusBg = 'rgba(15, 23, 42, 0.04)';
                  let statusColor = '#475569';
                  if (dep.status === 'approved') {
                    statusText = 'Hoàn tất';
                    statusBg = 'rgba(15, 23, 42, 0.08)';
                    statusColor = '#0F172A';
                  } else if (dep.status === 'cancelled') {
                    statusText = 'Đã hủy';
                    statusBg = 'rgba(189, 29, 45, 0.08)';
                    statusColor = '#BD1D2D';
                  }
                  const scopedMs = getScopedMilestones(dep);
                  const scopedVndAmount = hasDateFilter && scopedMs.length > 0
                    ? scopedMs.reduce((sum, m) => sum + (Number(m.expected_amount) || 0), 0)
                    : (Number(dep.price) || 0);
                  const depMilestones = ensureArray(dep?.milestones);
                  const approvedCount = depMilestones.filter(m => m.status === 'approved').length;
                  const totalCount = depMilestones.length;

                  return (
                    <div
                      key={`mob-so-${dep.id}`}
                      onClick={() => handleOpenManageMilestones(dep)}
                      className="mobile-card-item"
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: '16px',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                          <Avatar src={dep.avatar_url} name={dep.full_name || ''} size={36} style={{ flexShrink: 0 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {dep.full_name}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: '#64748b', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {dep.project_name || 'Chưa gắn chương trình'}
                            </div>
                          </div>
                        </div>
                        <span style={{ background: statusBg, color: statusColor, padding: '3px 9px', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {statusText}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', background: '#f8fafc', borderRadius: '10px', padding: '8px 10px', border: '1px solid #f1f5f9' }}>
                        <div>
                          <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Giá trị SO</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                            {formatMoney(scopedVndAmount, 'VND')}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.66rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Tiến độ đợt thu</div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                            {approvedCount} / {totalCount} đợt • {dep.creator_name || '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
            <div className="card" style={{ padding: 0, borderRadius: '16px', border: '1px solid #E2E8F0', overflow: 'hidden', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
              <div className="table-wrap" style={{ maxHeight: '480px', overflowY: 'auto', overflowX: 'auto' }}>
                <table className="w-full text-left" style={{ borderCollapse: 'collapse', minWidth: 900, fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '240px', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>Khách hàng / Chương trình</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '240px', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>Sale / Ngày tạo</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '160px', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>Giá trị</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '110px', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>Thanh toán gần nhất</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '130px', textAlign: 'center', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>Trạng thái</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '100px', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>Tiến độ</th>
                      <th style={{ padding: '1rem', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: '0.5px', width: '100px', textAlign: 'right', position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                {paginatedDeposits.map(dep => {
                  let statusText = 'Đang giao dịch';
                  let statusBg = 'rgba(15, 23, 42, 0.04)';
                  let statusColor = '#475569';

                  if (dep.status === 'approved') {
                    statusText = 'Hoàn tất';
                    statusBg = 'rgba(15, 23, 42, 0.08)';
                    statusColor = '#0F172A';
                  } else if (dep.status === 'cancelled') {
                    statusText = 'Đã hủy';
                    statusBg = 'rgba(189, 29, 45, 0.08)';
                    statusColor = '#BD1D2D';
                  }

                  return (
                    <tr 
                      key={dep.id} 
                      style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.2s', cursor: 'pointer' }}
                      className="table-row-hover"
                      onClick={() => handleOpenManageMilestones(dep)}
                    >
                      {/* Client / Program */}
                      <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar src={dep.avatar_url} name={dep.full_name || ''} size="md" style={{ width: 38, height: 38, fontSize: 13, flexShrink: 0 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', lineHeight: 1.25 }}>
                              {dep.full_name}
                            </span>
                            <span style={{ fontWeight: 600, color: 'var(--color-text-light)', fontSize: '0.75rem', lineHeight: 1.2 }}>
                              {dep.project_name}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Sale / Date Created */}
                      <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar src={dep.creator_avatar} name={dep.creator_name || 'Sale'} size="md" style={{ width: 38, height: 38, fontSize: 13, flexShrink: 0 }} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.25 }}>
                              {dep.creator_name || '—'}
                            </span>
                            <span style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', lineHeight: 1.2 }}>
                              {formatDateVN(dep.created_at)} {dep.created_at ? new Date(dep.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Value */}
                      <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                        {(() => {
                          const scopedMs = getScopedMilestones(dep);
                          const totalMsCount = Array.isArray(dep.milestones) ? dep.milestones.length : 0;
                          const scopedVndAmount = hasDateFilter && scopedMs.length > 0
                            ? scopedMs.reduce((sum, m) => sum + (Number(m.expected_amount) || 0), 0)
                            : (Number(dep.price) || 0);
                          const isPartialRoadmap = hasDateFilter && totalMsCount > scopedMs.length && Math.round(scopedVndAmount) !== Math.round(Number(dep.price) || 0);
                          const rate = parseFloat(String(dep.exchange_rate)) || 1;
                          return (
                            <div style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.875rem' }}>
                              {dep.currency && dep.currency !== 'VND' ? (
                                <div>
                                  <div>{formatMoney(scopedVndAmount / rate, dep.currency)}</div>
                                  <div style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 500 }}>
                                    ≈ {formatMoney(scopedVndAmount, 'VND')}
                                  </div>
                                </div>
                              ) : (
                                <div>{formatMoney(scopedVndAmount, 'VND')}</div>
                              )}
                              {isPartialRoadmap && (
                                <div style={{ marginTop: '3px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <span style={{ fontSize: '0.7rem', color: '#BD1D2D', fontWeight: 600 }}>
                                    {scopedMs.map(m => m.milestone_name).join(', ')}
                                  </span>
                                  <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                    Tổng SO: {formatMoney(dep.price, 'VND')}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Nearest Payment Date */}
                      <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                        {(() => {
                          const ms = hasDateFilter ? getScopedMilestones(dep) : ensureArray(dep.milestones);
                          if (ms.length === 0) return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</span>;

                          const allApproved = ms.every((m: any) => m.status === 'approved');
                          if (allApproved) {
                            const dates = ms.map((m: any) => m.expected_pay_date || m.paid_at || m.approval_date).filter(Boolean);
                            const latestDate = dates.length > 0 ? dates.sort().slice(-1)[0] : null;
                            const latestDateStr = latestDate ? formatDateVN(latestDate) : '—';
                            return (
                              <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#0F172A', display: 'block' }}>{latestDateStr}</span>
                                <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginTop: '2px', fontWeight: 600 }}>Đã đối soát</span>
                              </div>
                            );
                          }

                          const unpaid = ms.filter((m: any) => m.status !== 'approved');
                          const validUnpaid = unpaid.filter((m: any) => m.expected_pay_date);
                          if (validUnpaid.length === 0) return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>—</span>;

                          const sortedUnpaid = [...validUnpaid].sort((a, b) => parseLocalIsoDate(a.expected_pay_date).getTime() - parseLocalIsoDate(b.expected_pay_date).getTime());
                          const nearestM = sortedUnpaid[0];

                          const payDate = parseLocalIsoDate(nearestM.expected_pay_date);
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          const diffTime = payDate.getTime() - today.getTime();
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                          const payDateStr = formatDateVN(nearestM.expected_pay_date);

                          if (diffDays > 0) {
                            const isUrgent = diffDays < 7;
                            return (
                              <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: isUrgent ? '#BD1D2D' : '#0F172A', display: 'block' }}>{payDateStr}</span>
                                <span style={{ fontSize: '0.725rem', color: isUrgent ? '#BD1D2D' : '#64748B', display: 'block', marginTop: '2px', fontWeight: isUrgent ? 600 : 400 }}>Còn {diffDays} ngày nữa</span>
                              </div>
                            );
                          } else if (diffDays === 0) {
                            return (
                              <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#BD1D2D', display: 'block' }}>{payDateStr}</span>
                                <span style={{ fontSize: '0.725rem', color: '#BD1D2D', display: 'block', marginTop: '2px', fontWeight: 600 }}>Hạn hôm nay</span>
                              </div>
                            );
                          } else {
                            return (
                              <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#BD1D2D', display: 'block' }}>{payDateStr}</span>
                                <span style={{ fontSize: '0.725rem', color: '#BD1D2D', display: 'block', marginTop: '2px', fontWeight: 700 }}>Trễ {Math.abs(diffDays)} ngày</span>
                              </div>
                            );
                          }
                        })()}
                      </td>

                      {/* Status */}
                      <td style={{ padding: '1rem', verticalAlign: 'middle', textAlign: 'center' }}>
                        <span
                          style={{
                            background: statusBg,
                            color: statusColor,
                            border: `1px solid ${statusColor}18`,
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '0.725rem',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {statusText}
                        </span>
                      </td>

                      {/* Milestones steps formatted as approved/total (mấy trên mấy) */}
                      <td style={{ padding: '1rem', verticalAlign: 'middle' }}>
                        {(() => {
                          const depMilestones = ensureArray(dep?.milestones);
                          const approvedCount = depMilestones.filter(m => m.status === 'approved').length;
                          const totalCount = depMilestones.length;
                          const isFullyApproved = totalCount > 0 && approvedCount === totalCount;
                          const pillColor = isFullyApproved ? '#0F172A' : '#475569';
                          return (
                            <span style={{
                              background: isFullyApproved ? 'rgba(15, 23, 42, 0.08)' : 'rgba(15, 23, 42, 0.04)',
                              color: pillColor,
                              border: `1px solid ${pillColor}18`,
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isFullyApproved ? '#BD1D2D' : pillColor }} />
                              {approvedCount} / {totalCount}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '1rem', verticalAlign: 'middle', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'inline-flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
                          {dep.status !== 'cancelled' && (!isViewer || String(dep.created_by) === String(user?.id) || String(dep.contact_owner_id) === String(user?.id)) && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenManageMilestones(dep);
                              }}
                              style={{
                                padding: '6px',
                                height: '32px',
                                width: '32px',
                                background: 'transparent',
                                border: 'none',
                                color: '#64748b',
                                borderRadius: '50%',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease'
                              }}
                              className="hover-bg-muted"
                            >
                              <Edit size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
            )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ 
              padding: isMobile ? '0.75rem' : '1rem 1.25rem', 
              borderTop: isMobile ? 'none' : '1px solid var(--color-border-light)', 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              flexWrap: 'wrap',
              gap: '8px',
              alignItems: 'center', 
              justifyContent: 'space-between', 
              background: isMobile ? 'transparent' : 'var(--color-surface)',
              borderBottomLeftRadius: '16px',
              borderBottomRightRadius: '16px'
            }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                Hiển thị <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{Math.min(currentPage * ITEMS_PER_PAGE, filteredDepositsList.length)}</span> trên <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{filteredDepositsList.length}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} 
                  disabled={currentPage === 1} 
                  className="btn sm outline" 
                  style={{ height: 32, width: 32, padding: 0, minWidth: 32, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronLeft size={16} />
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(() => {
                    const maxVisible = 5;
                    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
                    let end = Math.min(totalPages, start + maxVisible - 1);
                    if (end - start + 1 < maxVisible) {
                      start = Math.max(1, end - maxVisible + 1);
                    }
                    const pageNumbers = [];
                    for (let p = start; p <= end; p++) {
                      pageNumbers.push(p);
                    }
                    return pageNumbers.map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        style={{
                          width: 32, height: 32, borderRadius: 8, fontSize: '0.8125rem', fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          border: currentPage === pageNum ? 'none' : '1px solid var(--color-border-light)',
                          background: currentPage === pageNum ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: currentPage === pageNum ? 'white' : 'var(--color-text-muted)',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease, border-color 0.15s ease'
                        }}
                      >
                        {pageNum}
                      </button>
                    ));
                  })()}
                </div>
                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} 
                  disabled={currentPage === totalPages} 
                  className="btn sm outline" 
                  style={{ height: 32, width: 32, padding: 0, minWidth: 32, borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: currentPage === totalPages ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
            </>
          )}
        </>
      ) : (
        <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <DepositsForecastKpiStrip
            projectedRec7Days={projectedRec7Days}
            rec7Count={rec7Count}
            pendingStudentRec7Days={pendingStudentRec7Days}
            overdueRecTotal={overdueRecTotal}
            overdueRecCount={overdueRecCount}
            projectedRec30Days={projectedRec30Days}
            rec30Count={rec30Count}
            pendingStudentRec30Days={pendingStudentRec30Days}
            projectedExp7Days={projectedExp7Days}
            exp7Count={exp7Count}
            overdueExpTotal={overdueExpTotal}
            overdueExpCount={overdueExpCount}
            projectedExp30Days={projectedExp30Days}
            exp30Count={exp30Count}
          />

          <DepositsForecastCharts
            forecastChartData={forecastChartData}
            cumulativeChartData={cumulativeChartData}
          />

          {/* List by date */}
          <div className="card" style={{ padding: '24px', borderRadius: '16px', border: '1px solid #E2E8F0', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontWeight: 700, fontSize: '1.05rem', margin: 0, color: '#0F172A' }}>Dự báo dòng tiền chi tiết theo ngày</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: '#64748B' }}>
                  Hiển thị danh sách các khoản thu và chi theo từng ngày (tối đa {TIMELINE_PAGE_SIZE} khoản mỗi trang)
                </p>
              </div>

              {/* Filter Tabs (Ch. V Segmented Control) */}
              <div style={{ display: 'inline-flex', gap: '2px', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <button
                  type="button"
                  onClick={() => handleTimelineFilterChange('upcoming')}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    borderRadius: '7px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: timelineFilter === 'upcoming' ? 700 : 600,
                    cursor: 'pointer',
                    background: timelineFilter === 'upcoming' ? '#ffffff' : 'transparent',
                    color: timelineFilter === 'upcoming' ? '#BD1D2D' : '#64748b',
                    boxShadow: timelineFilter === 'upcoming' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>Sắp tới</span>
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontVariantNumeric: 'tabular-nums',
                    background: timelineFilter === 'upcoming' ? 'rgba(189, 29, 45, 0.08)' : '#e2e8f0',
                    color: timelineFilter === 'upcoming' ? '#BD1D2D' : '#64748b'
                  }}>
                    {upcomingTimelineCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTimelineFilterChange('overdue')}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    borderRadius: '7px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: timelineFilter === 'overdue' ? 700 : 600,
                    cursor: 'pointer',
                    background: timelineFilter === 'overdue' ? '#ffffff' : 'transparent',
                    color: timelineFilter === 'overdue' ? '#BD1D2D' : '#64748b',
                    boxShadow: timelineFilter === 'overdue' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>Quá hạn / Tồn đọng</span>
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontVariantNumeric: 'tabular-nums',
                    background: timelineFilter === 'overdue' ? 'rgba(189, 29, 45, 0.08)' : 'rgba(189, 29, 45, 0.1)',
                    color: '#BD1D2D'
                  }}>
                    {overdueTimelineCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handleTimelineFilterChange('all')}
                  style={{
                    height: '32px',
                    padding: '0 14px',
                    borderRadius: '7px',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: timelineFilter === 'all' ? 700 : 600,
                    cursor: 'pointer',
                    background: timelineFilter === 'all' ? '#ffffff' : 'transparent',
                    color: timelineFilter === 'all' ? '#BD1D2D' : '#64748b',
                    boxShadow: timelineFilter === 'all' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>Tất cả</span>
                  <span style={{
                    padding: '1px 6px',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    fontVariantNumeric: 'tabular-nums',
                    background: timelineFilter === 'all' ? 'rgba(189, 29, 45, 0.08)' : '#e2e8f0',
                    color: timelineFilter === 'all' ? '#BD1D2D' : '#64748b'
                  }}>
                    {allTimelineItems.length}
                  </span>
                </button>
              </div>
            </div>

            {loading ? (
              <TimelineSkeleton count={5} />
            ) : filteredTimelineItems.length === 0 ? (
              <EmptyCard
                icon={<Calendar />}
                title={timelineFilter === 'upcoming' ? 'Không có khoản dự thu/chi sắp tới' : (timelineFilter === 'overdue' ? 'Không có khoản nợ quá hạn' : 'Chưa có dữ liệu dòng tiền')}
                description={timelineFilter === 'upcoming'
                  ? 'Không có khoản dự thu hay dự chi nào trong tương lai gần.'
                  : (timelineFilter === 'overdue' ? 'Tất cả khoản thu chi đều đang đúng hạn.' : 'Dữ liệu dự báo dòng tiền sẽ hiển thị khi có đơn hàng hoặc chi phí chờ thanh toán.')}
              />
            ) : (
              <>
                <div 
                  className="custom-scrollbar" 
                  style={{ 
                    maxHeight: '620px', 
                    overflowY: 'auto', 
                    paddingRight: '8px',
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '24px',
                    fontVariantNumeric: 'tabular-nums'
                  }}
                >
                  {paginatedTimelineGroups.map(r => {
                    const isToday = r.date === todayDateStr;
                    const isOverdue = r.date < todayDateStr;
                    return (
                      <div key={r.date} style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '20px' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px' }}>
                          <span style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                            <Calendar size={16} style={{ color: isOverdue ? '#BD1D2D' : (isToday ? '#BD1D2D' : '#64748B') }} />
                            <span>{parseLocalIsoDate(r.date).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
                            {isToday && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', textTransform: 'uppercase' }}>
                                Hôm nay
                              </span>
                            )}
                            {isOverdue && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', textTransform: 'uppercase' }}>
                                Quá hạn
                              </span>
                            )}
                          </span>
                          <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', fontWeight: 600 }}>
                            {r.receiptTotal > 0 && <span style={{ color: '#0F172A' }}>Thu: +{Math.round(r.receiptTotal).toLocaleString('vi-VN')} đ</span>}
                            {r.expenditureTotal > 0 && <span style={{ color: '#64748B' }}>Chi: -{Math.round(r.expenditureTotal).toLocaleString('vi-VN')} đ</span>}
                            <span style={{ color: '#BD1D2D' }}>Ròng: {Math.round(r.receiptTotal - r.expenditureTotal).toLocaleString('vi-VN')} đ</span>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '24px' }}>
                          {ensureArray(r?.items).map((item, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', gap: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                {item.type === 'receipt' && (
                                  <Avatar 
                                    src={item.customerAvatar} 
                                    name={item.customerName || ''} 
                                    size={32} 
                                    style={{ borderRadius: '50%', flexShrink: 0 }} 
                                  />
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                                  <span style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
                                  <span style={{ fontSize: '0.75rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.desc}</span>
                                </div>
                              </div>
                              <span style={{ 
                                fontWeight: 700, 
                                fontSize: '0.9rem',
                                color: item.type === 'receipt' ? '#0F172A' : '#BD1D2D',
                                flexShrink: 0,
                                display: 'inline-flex',
                                flexDirection: 'column',
                                alignItems: 'flex-end',
                                gap: '2px'
                              }}>
                                <span>{item.type === 'receipt' ? '+' : '-'}{Math.round(item.amount).toLocaleString('vi-VN')} đ</span>
                                {item.isPendingStudent && (
                                  <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#475569', background: 'rgba(15, 23, 42, 0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                                    Bảo lưu
                                  </span>
                                )}
                                {item.isOverdue && (
                                  <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#BD1D2D', background: 'rgba(189, 29, 45, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>
                                    Quá hạn
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {filteredTimelineItems.length > TIMELINE_PAGE_SIZE && (
                  <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '12px', marginTop: '8px' }}>
                    <Pagination 
                      total={filteredTimelineItems.length} 
                      page={timelinePage} 
                      pageSize={TIMELINE_PAGE_SIZE} 
                      onChange={setTimelinePage} 
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}


      {/* Explanation of Deposit & Unit Switch Modal */}
      {showInfoModal && (
      <CustomModal
        isOpen={showInfoModal}
        onClose={() => setShowInfoModal(false)}
        title={t("Quy trình Đặt cọc & Chính sách Bể cọc / Đổi căn")}
        width="760px"
      >
        <div style={{ padding: '4px 0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 12, 
            padding: '12px 16px', 
            background: 'rgba(189, 29, 45, 0.06)', 
            border: '1px solid rgba(189, 29, 45, 0.18)', 
            borderRadius: 12 
          }}>
            <Info size={24} color="#BD1D2D" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>
              {t("Hệ thống quản lý đặt cọc và kiểm soát doanh thu bán hàng. Nhằm bảo vệ quyền lợi của Tư vấn viên (TVV) và tính toàn vẹn của dữ liệu, vui lòng tuân thủ các quy tắc sau:")}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Quy tắc 1 */}
            <div style={{ 
              display: 'flex', 
              gap: 12, 
              padding: '16px', 
              background: 'var(--color-surface)', 
              border: '1px solid var(--color-border)',
              borderRadius: '12px'
            }}>
              <CreditCard size={20} color="#334155" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h5 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                  {t("1. Đợt thanh toán & Phê duyệt UNC")}
                </h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                  {t("Mỗi phiếu cọc có thể chia thành nhiều đợt thanh toán (milestones). TVV có nhiệm vụ tải lên hình ảnh UNC (Ủy nhiệm chi). Khi được Kế toán/Admin phê duyệt trạng thái \"Đã đóng\", doanh thu thực tế mới được ghi nhận vào hệ thống.")}
                </p>
              </div>
            </div>

            {/* Quy tắc 2 */}
            <div style={{ 
              display: 'flex', 
              gap: 12, 
              padding: '16px', 
              background: 'var(--color-surface)', 
              border: '1px solid var(--color-border)',
              borderRadius: '12px'
            }}>
              <Ban size={20} color="#BD1D2D" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h5 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                  {t("2. Quy tắc Bể cọc (Deposit Cancellation)")}
                </h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                  {t("• Chưa phát sinh doanh thu: Nếu khách hàng hủy đặt cọc trước khi đóng bất kỳ đợt thanh toán nào, trạng thái của KHTN/Person sẽ bị hạ về mức trước đó (Booking/Đã Gặp). Đồng hồ bảo mật của lead kích hoạt trở lại và lead có thể bị tự động giải phóng ra Databank chung nếu hết hạn.")}
                  <br />
                  {t("• Đã phát sinh doanh thu (đã đóng đợt 1): Trạng thái KHTN được giữ nguyên là Đặt Cọc để bảo vệ quyền sở hữu trọn đời của TVV chăm sóc.")}
                </p>
              </div>
            </div>

            {/* Quy tắc 3 */}
            <div style={{ 
              display: 'flex', 
              gap: 12, 
              padding: '16px', 
              background: 'var(--color-surface)', 
              border: '1px solid var(--color-border)',
              borderRadius: '12px'
            }}>
              <Calendar size={20} color="#334155" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <h5 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-text)' }}>
                  {t("3. Cơ chế Đổi Sản phẩm / Chiến dịch (Product Switching)")}
                </h5>
                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.4 }}>
                  {t("Khi khách hàng muốn đổi sản phẩm hoặc chiến dịch giao dịch khác, bắt buộc thực hiện theo đúng vết kiểm toán (audit trail):")}
                  <br />
                  {t("• Đóng đơn hàng cũ lại (đánh dấu thất bại hoặc đã đổi).")}
                  <br />
                  {t("• Tạo một đơn hàng mới hoàn toàn.")}
                  <br />
                  {t("• Gắn liên kết ghi rõ \"Đổi từ sản phẩm [Mã SKU Cũ]\" ở đơn mới để lưu trọn vẹn lịch sử doanh thu.")}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem', gap: '0.75rem', borderTop: '1px solid var(--color-border-light)', paddingTop: '1rem' }}>
          <button className="btn primary" onClick={() => setShowInfoModal(false)} style={{ minWidth: 100 }}>{t("Đồng ý")}</button>
        </div>
      </CustomModal>
      )}

      {showManageModal && selectedDepForManage && (
        <Suspense fallback={null}>
          <DepositDetailDrawer
            isOpen={showManageModal}
            onClose={() => {
              setShowManageModal(false);
              const params = new URLSearchParams(window.location.search);
              if (params.has('highlight_comment_id') || params.has('comment_id') || params.has('open_id') || params.has('id')) {
                params.delete('highlight_comment_id');
                params.delete('comment_id');
                params.delete('open_id');
                params.delete('id');
                const qs = params.toString();
                window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
              }
            }}
            deposit={selectedDepForManage}
            onSaveSuccess={loadData}
          />
        </Suspense>
      )}

      {targetModalOpen && (
        <SalesTargetModal
          isOpen={targetModalOpen}
          onClose={() => {
            setTargetModalOpen(false);
            setTargetFocusUserId(null);
          }}
          initialMonth={salesTargetsMonth}
          focusUserId={targetFocusUserId}
          onSaved={(updated) => {
            if (updated) {
              if (updated.month_year && updated.month_year !== salesTargetsMonth) {
                setSalesTargetsMonth(updated.month_year);
              }
              setSalesTargetsData(updated);
            } else {
              loadSalesTargets(salesTargetsMonth);
            }
          }}
        />
      )}

      {showContactDrawer && selectedContact && (
        <Suspense fallback={null}>
          <CustomerProfileDrawer
            isOpen={showContactDrawer}
            onClose={() => setShowContactDrawer(false)}
            contact={selectedContact}
            onUpdate={() => {
              loadData();
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
