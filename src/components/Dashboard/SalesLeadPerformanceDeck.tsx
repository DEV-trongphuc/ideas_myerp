import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from 'react';
import {
  Users,
  PhoneCall,
  PhoneOff,
  DollarSign,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  RefreshCw,
  ArrowUpRight,
  RotateCcw,
  Clock,
  Search,
  HelpCircle,
  Eye,
  Info,
  Target,
  Edit3,
  Download
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../ui/Avatar';
import { SalesTargetModal, getTargetProgressTone } from './SalesTargetModal';
import { CustomSelect } from '../ui/CustomSelect';
import { VietnameseDateInput } from '../ui/VietnameseDateInput';
import { CustomModal } from '../ui/CustomModal';
import { Pagination } from '../ui/Pagination';
import { downloadExportFile } from '../../utils/exportHelper';
import { extractCleanCardDescription } from '../../utils/taskBodyParser';
import { ensureArray } from '../../utils/safeArray';
import {
  DomDashboardToolbar,
  DomToolbarButton,
  DomSegmentedSwitch,
  DomDateRangePill,
  DomKpiTile,
  DomRankBarRow,
  DomEmptyChartState,
  MYERP_CHART_PALETTE,
  formatDomNumber
} from './DomationDashboardKit';
import {
  KpiCardSkeleton,
  TableSkeleton,
  PipelineCardsAndSpectrumSkeleton,
  LeaderboardCardSkeleton,
  DonutAndRankedListSkeleton
} from '../ui/Skeleton';

const CustomerProfileDrawer = lazy(() =>
  import('../../pages/CustomerProfileDrawer').then((m) => ({ default: m.CustomerProfileDrawer }))
);

interface SalesLeadPerformanceData {
  month: string;
  period_label?: string;
  date_range: {
    from: string;
    to: string;
    prev_from?: string;
    prev_to?: string;
    prev_month: string;
  };
  filters?: {
    consultant_id: number;
    funnel_consultant_id?: number;
    source: string;
    available_consultants: Array<{
      id: number;
      full_name: string;
      avatar_url: string | null;
      role: string;
      job_title: string | null;
    }>;
    available_sources: string[];
  };
  summary: {
    total_leads: number;
    funnel_total_leads?: number;
    prev_total_leads: number;
    growth_rate: number;
    excluded_personal_count?: number;
    excluded_error_count?: number;
    reminder_count?: number;
    reassigned_profile_count?: number;
    duplicate_blocked_count?: number;
    duplicate_profile_count?: number;
    qualified_leads: number;
    qualified_rate: number;
    win_funnel_leads?: number;
    win_funnel_rate?: number;
    unconnected_leads?: number;
    unconnected_rate?: number;
    funnel_qualified_leads?: number;
    funnel_qualified_rate?: number;
    funnel_win_leads?: number;
    funnel_win_rate?: number;
    funnel_unconnected_leads?: number;
    funnel_unconnected_rate?: number;
    contacted_leads: number;
    connected_rate: number;
    uncontacted_leads: number;
    uncontacted_rate: number;
    total_deals: number;
    deal_conversion_rate: number;
    total_deal_value: number;
    won_deals: number;
    won_value: number;
    approved_deals?: number;
    approved_value?: number;
    pending_deals?: number;
    pending_value?: number;
    prev_won_deals?: number;
    prev_won_value?: number;
    revenue_growth_rate?: number;
    win_rate: number;
    total_sales_target?: number;
    total_cash_in_period?: number;
    total_so_attributed_value?: number;
    target_achievement_rate?: number;
    so_target_achievement_rate?: number;
    target_month?: string;
    can_manage_targets?: boolean;
    quality_distribution: {
      hot: number;
      warm: number;
      cold: number;
    };
  };
  funnel: Array<{
    id: number;
    name: string;
    color: string;
    order_index: number;
    stage_number?: number;
    is_won: boolean;
    is_lost: boolean;
    system_slug?: string;
    count: number;
    conversion_rate: number;
  }>;
  sources: Array<{
    source: string;
    total_leads: number;
    new_leads?: number;
    prior_closed_leads?: number;
    uncontacted_leads: number;
    contacted_leads: number;
    connected_rate: number;
    qualified_leads: number;
    qualified_rate: number;
    deal_count: number;
    won_count: number;
    won_value: number;
    approved_value?: number;
    pending_value?: number;
    win_rate: number;
    tier: 'vip' | 'good' | 'warning' | 'neutral';
    tier_label: string;
  }>;
  sales_leaderboard: Array<{
    rank: number;
    user_id: number;
    full_name: string;
    avatar_url: string | null;
    role: string;
    job_title: string;
    assigned_leads: number;
    contacted_leads: number;
    uncontacted_leads: number;
    contact_rate: number;
    qualified_leads: number;
    personal_leads_excluded?: number;
    reminder_leads?: number;
    reassigned_profile_leads?: number;
    duplicate_blocked_leads?: number;
    duplicate_profile_leads?: number;
    deal_count: number;
    pipeline_value: number;
    won_count: number;
    won_value: number;
    approved_count?: number;
    approved_value?: number;
    pending_count?: number;
    pending_value?: number;
    monthly_target?: number;
    default_kpi_target?: number;
    has_month_override?: boolean;
    cash_in_period?: number;
    so_attributed_value?: number;
    target_achievement_pct?: number;
    so_target_achievement_pct?: number;
    target_remaining?: number;
    win_rate: number;
    status_note: string;
  }>;
  recent_orders?: Array<{
    id: number;
    contact_id: number;
    customer_name: string;
    phone: string;
    program: string;
    source: string;
    value: number;
    collected_value?: number;
    uncollected_value?: number;
    status: string;
    created_at: string;
    sale_id: number;
    sale_name: string;
    sale_avatar: string | null;
  }>;
  lost_reasons: Array<{
    reason: string;
    count: number;
  }>;
  initial_drilldown_pool?: any[];
  initial_drilldown_pool_complete?: boolean;
}

type DrilldownType =
  | 'all'
  | 'uncontacted'
  | 'unconnected'
  | 'contacted'
  | 'qualified'
  | 'qualified_all'
  | 'win'
  | 'stage'
  | 'reminder'
  | 'duplicate_profile';

interface DrilldownModalState {
  isOpen: boolean;
  type: DrilldownType;
  title: string;
  consultantId: number;
  source: string;
  stageId: number;
  stageName?: string;
}

interface Props {
  embedInPage?: 'dashboard' | 'contacts';
  externalDateFilter?: string;
}

const DRILLDOWN_PAGE_SIZE = 20;
const SECTION_PAGE_SIZE = 10;

const formatVND = (val: number): string => {
  if (!val || isNaN(val)) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(Math.round(val)) + ' đ';
};

const formatDateShort = (dateStr?: string): string => {
  if (!dateStr) return '';
  const parts = dateStr.substring(0, 10).split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatDateTimeVN = (dateStr?: string): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return formatDateShort(dateStr);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatUncontactedDuration = (hours?: number): string => {
  const h = Number(hours || 0);
  if (h <= 0) return 'Vừa nhận';
  if (h < 24) return `Chưa tương tác ${h} giờ`;
  const days = Math.floor(h / 24);
  const remHours = h % 24;
  return remHours > 0 ? `Chưa tương tác ${days} ngày ${remHours}h` : `Chưa tương tác ${days} ngày`;
};

const deckCache = new Map<string, { data: SalesLeadPerformanceData; timestamp: number }>();
const SWR_TTL_MS = 45_000;
const MAX_DECK_CACHE_ENTRIES = 30;

const setBoundedPerfCache = (key: string, data: SalesLeadPerformanceData) => {
  if (deckCache.has(key)) {
    deckCache.delete(key);
  } else if (deckCache.size >= MAX_DECK_CACHE_ENTRIES) {
    const oldestKey = deckCache.keys().next().value;
    if (oldestKey !== undefined) deckCache.delete(oldestKey);
  }
  deckCache.set(key, { data, timestamp: Date.now() });
};

const buildSalesPerfCacheKey = (
  scope: string,
  dateVal: string,
  fromDateVal: string,
  toDateVal: string,
  dateFieldVal: 'created_at' | 'deposit_date',
  consultantId: number,
  funnelSaleId: number,
  sourceVal: string
) => `${scope}|${dateVal}|${fromDateVal}|${toDateVal}|${dateFieldVal}|${consultantId}|${funnelSaleId}|${sourceVal || 'all'}`;

const SalesPerfKpiStrip = React.memo<{
  summary: any;
  funnelAnalytics: { unconnectedCount: number; winCount: number };
  onOpenDrilldown: (opts: { type: DrilldownType; title: string }) => void;
  onScrollOrders: () => void;
}>(({ summary, funnelAnalytics, onOpenDrilldown, onScrollOrders }) => {
  const linkBtnStyle: React.CSSProperties = {
    border: 'none',
    background: 'transparent',
    padding: 0,
    fontSize: 'inherit',
    color: 'inherit',
    cursor: 'pointer',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    fontWeight: 700
  };

  return (
    <div className="dashboard-kpi-grid sales-perf-kpi-grid" style={{ marginBottom: 0 }}>
      {/* KPI 1: TỔNG LEAD — Brand Red Hero Tile */}
      <DomKpiTile
        variant="hero"
        label="TỔNG LEAD"
        value={formatDomNumber(summary.total_leads)}
        icon={<Users size={16} />}
        growth={Number(summary.growth_rate ?? 0)}
        onClick={() => onOpenDrilldown({ type: 'all', title: 'Danh sách Tổng Lead' })}
        breakdown={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>
              • Đã tương tác: <strong>{formatDomNumber(summary.contacted_leads)}</strong> • Chưa gọi:{' '}
              <strong>{formatDomNumber(summary.uncontacted_leads)}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={linkBtnStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDrilldown({
                    type: 'duplicate_profile',
                    title: 'Lead Trùng hồ sơ (Chia lại >6T & Trùng bị chặn)'
                  });
                }}
              >
                • Trùng hồ sơ: {summary.duplicate_profile_count ?? 0}
              </button>
              <button
                type="button"
                style={linkBtnStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDrilldown({ type: 'reminder', title: 'Lead Nhắc lại (<6 tháng)' });
                }}
              >
                Nhắc lại (&lt;6T): {summary.reminder_count ?? 0}
              </button>
            </div>
          </div>
        }
        comparisonLabel={`Self/GT: ${formatDomNumber(summary.excluded_personal_count || 0)} • Lead công ty tạo mới`}
      />

      {/* KPI 2: ĐÃ TƯƠNG TÁC — Blue Value Accent */}
      <DomKpiTile
        label="ĐÃ TƯƠNG TÁC"
        value={formatDomNumber(summary.contacted_leads)}
        valueTone="blue"
        icon={<PhoneCall size={16} />}
        accent="blue"
        onClick={() => onOpenDrilldown({ type: 'contacted', title: 'Danh sách Lead Đã tương tác' })}
        breakdown={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>
              • Tỷ lệ tương tác: <strong style={{ color: 'var(--color-text)' }}>{summary.connected_rate}%</strong> • Chưa connect:{' '}
              <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(summary.unconnected_leads ?? funnelAnalytics.unconnectedCount)}</strong>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                style={{ ...linkBtnStyle, color: 'var(--dom-blue-text, #1d4ed8)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDrilldown({ type: 'qualified', title: 'Lead Qualified' });
                }}
              >
                • Qualified: {summary.qualified_leads}
              </button>
              <button
                type="button"
                style={{ ...linkBtnStyle, color: 'var(--dom-emerald-text, #047857)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenDrilldown({ type: 'win', title: 'Lead Win' });
                }}
              >
                Win: {summary.win_funnel_leads ?? funnelAnalytics.winCount}
              </button>
            </div>
          </div>
        }
        comparisonLabel={`${summary.qualified_rate}% Qualified trên tổng Lead`}
      />

      {/* KPI 3: CHƯA TƯƠNG TÁC — Amber SLA Attention */}
      <DomKpiTile
        label="CHƯA TƯƠNG TÁC"
        value={formatDomNumber(summary.uncontacted_leads)}
        icon={<PhoneOff size={16} />}
        accent="amber"
        badge={summary.uncontacted_leads === 0 ? 'SLA 100%' : `${summary.uncontacted_rate}% tồn`}
        onClick={() => onOpenDrilldown({ type: 'uncontacted', title: 'Danh sách Lead Chưa tương tác' })}
        breakdown={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>
              • Tỷ lệ tồn đọng: <strong style={{ color: 'var(--color-text)' }}>{summary.uncontacted_rate}%</strong>
            </div>
            <div>
              • Trạng thái: <strong style={{ color: 'var(--color-text)' }}>Chưa gọi &amp; chưa ghi chú</strong>
            </div>
          </div>
        }
        comparisonLabel="Click để mở danh sách kiểm tra SLA ngay →"
      />

      {/* KPI 4: DOANH THU DỰ KIẾN & THỰC THU — Emerald Revenue */}
      <DomKpiTile
        label="DOANH THU DỰ KIẾN & THỰC THU"
        value={formatVND(summary.won_value)}
        valueTone="emerald"
        icon={<DollarSign size={16} />}
        accent="emerald"
        growth={Number(summary.revenue_growth_rate ?? 0)}
        onClick={onScrollOrders}
        breakdown={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>
              • Thực thu đã duyệt: <strong style={{ color: 'var(--color-text)' }}>{formatVND(summary.approved_value || 0)}</strong>
            </div>
            <div>
              • Còn phải thu: <strong style={{ color: 'var(--color-text)' }}>{formatVND(summary.pending_value || 0)}</strong> •{' '}
              <strong style={{ color: 'var(--color-text)' }}>{summary.won_deals}</strong> đơn SO
            </div>
          </div>
        }
        comparisonLabel={`so với kỳ trước (${summary.prev_won_deals || 0} đơn)`}
      />
    </div>
  );
});
SalesPerfKpiStrip.displayName = 'SalesPerfKpiStrip';

export const SalesLeadPerformanceDeck: React.FC<Props> = ({
  embedInPage = 'dashboard',
  externalDateFilter
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantScope = `${Number((user as any)?.tenant_id || 0)}:${Number(user?.id || 0)}`;
  const [localDateFilter, setLocalDateFilter] = useState<string>('Tháng này');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [dateField, setDateField] = useState<'created_at' | 'deposit_date'>('created_at');
  const activeDateFilter = embedInPage === 'dashboard' && externalDateFilter ? externalDateFilter : localDateFilter;

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const handleChange = () => setIsMobile(mq.matches);
    handleChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (embedInPage === 'dashboard' && externalDateFilter) {
      setCustomFrom('');
      setCustomTo('');
    }
  }, [embedInPage, externalDateFilter]);

  const [selectedConsultantId, setSelectedConsultantId] = useState<number>(0);
  const [funnelConsultantId, setFunnelConsultantId] = useState<number>(0);
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const initialPerfCacheKey = buildSalesPerfCacheKey(
    tenantScope,
    activeDateFilter,
    '',
    '',
    'created_at',
    0,
    0,
    'all'
  );
  const [data, setData] = useState<SalesLeadPerformanceData | null>(
    () => deckCache.get(initialPerfCacheKey)?.data ?? null
  );
  const [loading, setLoading] = useState<boolean>(() => !deckCache.has(initialPerfCacheKey));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortPerfRef = useRef<AbortController | null>(null);
  const inFlightRefreshRef = useRef<boolean>(false);
  const inFlightExportRef = useRef<boolean>(false);

  // Table pagination states for high-speed rendering
  const [salesPage, setSalesPage] = useState<number>(1);
  const [sourcePage, setSourcePage] = useState<number>(1);
  const [ordersPage, setOrdersPage] = useState<number>(1);
  const [showAllFunnelStages, setShowAllFunnelStages] = useState<boolean>(false);
  const [targetModalOpen, setTargetModalOpen] = useState<boolean>(false);
  const [targetFocusUserId, setTargetFocusUserId] = useState<number | null>(null);

  // In-place Drilldown Modal State (20 items/page)
  const [drillModal, setDrillModal] = useState<DrilldownModalState>({
    isOpen: false,
    type: 'uncontacted',
    title: 'Danh sách Lead Chưa tương tác',
    consultantId: 0,
    source: 'all',
    stageId: 0
  });
  const [drillItems, setDrillItems] = useState<any[]>([]);
  const [drillTotal, setDrillTotal] = useState<number>(0);
  const [drillPage, setDrillPage] = useState<number>(1);
  const [drillSearchInput, setDrillSearchInput] = useState<string>('');
  const [drillSearch, setDrillSearch] = useState<string>('');
  const [drillLoading, setDrillLoading] = useState<boolean>(false);
  const [showUncontactedHelp, setShowUncontactedHelp] = useState<boolean>(false);

  // Fast in-memory cache for Drilldown pages & main deck
  const drillCacheRef = useRef<Map<string, { items: any[]; total: number }>>(new Map());
  const abortDrillRef = useRef<AbortController | null>(null);

  // 360 Customer Profile Drawer opened directly from Drilldown Modal or Order Table
  const [drawerContact, setDrawerContact] = useState<any | null>(null);

  // Debounce search inside Drilldown Modal (220ms) for smooth typing
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDrillSearch(drillSearchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [drillSearchInput]);

  const fetchPerformance = useCallback(
    async (
      dateVal: string,
      consultantId: number,
      funnelSaleId: number,
      sourceVal: string,
      forceRefresh = false,
      fromDateVal = customFrom,
      toDateVal = customTo,
      dateFieldVal: 'created_at' | 'deposit_date' = dateField
    ) => {
      const hasCustomRange = Boolean(fromDateVal && toDateVal);
      const cacheKey = buildSalesPerfCacheKey(
        tenantScope,
        dateVal,
        fromDateVal,
        toDateVal,
        dateFieldVal,
        consultantId,
        funnelSaleId,
        sourceVal
      );
      const cached = deckCache.get(cacheKey);
      const now = Date.now();

      if (cached) {
        setData(cached.data);
        setLoading(false);
        setError(null);
        if (!forceRefresh && now - cached.timestamp < SWR_TTL_MS) {
          return;
        }
        setIsRefreshing(true);
      } else {
        setLoading(true);
        setError(null);
      }

      if (abortPerfRef.current) {
        abortPerfRef.current.abort();
      }
      const controller = new AbortController();
      abortPerfRef.current = controller;

      try {
        const params: Record<string, any> = {
          funnel_consultant_id: funnelSaleId,
          date_field: dateFieldVal
        };
        if (hasCustomRange) {
          params.from = fromDateVal;
          params.to = toDateVal;
          params.from_date = fromDateVal;
          params.to_date = toDateVal;
        } else {
          params.date = dateVal;
        }
        if (consultantId > 0) {
          params.consultant_id = consultantId;
        }
        if (sourceVal && sourceVal !== 'all') {
          params.source = sourceVal;
        }
        const res = await api.get('/dashboard/sales-lead-performance', {
          params,
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        const payload = res.data?.data || res.data;
        setBoundedPerfCache(cacheKey, payload);
        setData(payload);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError' || controller.signal.aborted) return;
        if (!cached) {
          setError(err?.response?.data?.message || 'Không thể tải dữ liệu hiệu suất Sales & Lead');
        }
      } finally {
        if (abortPerfRef.current === controller) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [tenantScope, customFrom, customTo, dateField]
  );

  // Keep funnelConsultantId synced when user changes top consultant filter
  const handleTopConsultantChange = (newId: number) => {
    setSelectedConsultantId(newId);
    setFunnelConsultantId(newId);
    setSalesPage(1);
    setSourcePage(1);
    setOrdersPage(1);
  };

  useEffect(() => {
    fetchPerformance(
      activeDateFilter,
      selectedConsultantId,
      funnelConsultantId,
      selectedSource,
      false,
      customFrom,
      customTo,
      dateField
    );
    return () => {
      if (abortPerfRef.current) {
        abortPerfRef.current.abort();
      }
    };
  }, [
    activeDateFilter,
    selectedConsultantId,
    funnelConsultantId,
    selectedSource,
    customFrom,
    customTo,
    dateField,
    fetchPerformance
  ]);

  useEffect(() => {
    const handleContactSync = () => {
      deckCache.clear();
      drillCacheRef.current.clear();
      fetchPerformance(
        activeDateFilter,
        selectedConsultantId,
        funnelConsultantId,
        selectedSource,
        true,
        customFrom,
        customTo,
        dateField
      );
    };
    window.addEventListener('contact-updated', handleContactSync);
    window.addEventListener('contacts-updated', handleContactSync);
    window.addEventListener('deposit-created', handleContactSync);
    return () => {
      window.removeEventListener('contact-updated', handleContactSync);
      window.removeEventListener('contacts-updated', handleContactSync);
      window.removeEventListener('deposit-created', handleContactSync);
    };
  }, [
    activeDateFilter,
    selectedConsultantId,
    funnelConsultantId,
    selectedSource,
    customFrom,
    customTo,
    dateField,
    fetchPerformance
  ]);

  // 0ms Instant Client-Side Drilldown Filter from pre-warmed initial_drilldown_pool
  const resolveFromLocalPool = useCallback(
    (
      modalState: DrilldownModalState,
      pageNum: number,
      searchText: string
    ): { items: any[]; total: number } | null => {
      if (
        !data?.initial_drilldown_pool_complete ||
        !Array.isArray(data?.initial_drilldown_pool) ||
        modalState.type === 'reminder' ||
        modalState.type === 'duplicate_profile'
      ) {
        return null;
      }
      // Only use local pool if the modal's consultant/source filter is compatible with the pool's top-level filter
      if (selectedConsultantId > 0 && modalState.consultantId !== selectedConsultantId) {
        return null;
      }
      if (selectedSource && selectedSource !== 'all' && modalState.source !== selectedSource) {
        return null;
      }

      const hasSourceFilter = Boolean(modalState.source && modalState.source !== 'all');
      const kw = searchText.trim().toLowerCase();

      const matched = data.initial_drilldown_pool.filter((r: any) => {
        // 1. Period & deposit scope
        if (hasSourceFilter) {
          if (Number(r.in_period_created || 0) !== 1 && Number(r.has_period_deposit || 0) !== 1) return false;
        } else {
          if (Number(r.in_period_created || 0) !== 1) return false;
        }

        // 2. Consultant filter
        if (modalState.consultantId > 0 && Number(r.owner_id || 0) !== Number(modalState.consultantId)) {
          return false;
        }

        // 3. Source filter
        if (hasSourceFilter && String(r.source || 'Chưa phân loại').trim() !== modalState.source) {
          return false;
        }

        // 4. Drilldown type filter
        const isUc = Number(r.is_uncontacted || 0) === 1;
        const isQual = Number(r.is_qualified || 0) === 1;
        const isWin = Number(r.is_win || 0) === 1;
        const hasDep = Number(r.has_period_deposit || 0) === 1;

        if (modalState.type === 'uncontacted' && !isUc) return false;
        if (modalState.type === 'contacted' && isUc) return false;
        if (modalState.type === 'qualified' && !isQual) return false;
        if (modalState.type === 'qualified_all') {
          if (hasSourceFilter) {
            if (!isQual && !isWin && !hasDep) return false;
          } else {
            if (!isQual && !isWin) return false;
          }
        }
        if (modalState.type === 'win' && !isWin) return false;
        if (modalState.type === 'unconnected' && (isQual || isWin)) return false;
        if (modalState.type === 'stage' && modalState.stageId > 0) {
          if (Number(r.resolved_stage_id || r.stage_id || 0) !== Number(modalState.stageId)) return false;
        }

        // 5. Search keyword
        if (kw !== '') {
          const fn = String(r.full_name || '').toLowerCase();
          const ph = String(r.phone || '').toLowerCase();
          const em = String(r.email || '').toLowerCase();
          const pr = String(r.program || '').toLowerCase();
          if (!fn.includes(kw) && !ph.includes(kw) && !em.includes(kw) && !pr.includes(kw)) {
            return false;
          }
        }

        return true;
      });

      const startIdx = (pageNum - 1) * DRILLDOWN_PAGE_SIZE;
      return {
        items: matched.slice(startIdx, startIdx + DRILLDOWN_PAGE_SIZE),
        total: matched.length
      };
    },
    [data?.initial_drilldown_pool, data?.initial_drilldown_pool_complete, selectedConsultantId, selectedSource]
  );

  const fetchDrilldownList = useCallback(
    async (
      modalState: DrilldownModalState,
      pageNum: number,
      searchText: string,
      bypassCache = false
    ) => {
      if (!modalState.isOpen) return;

      // 0ms Instant Resolution from in-memory pool
      if (!bypassCache) {
        const localRes = resolveFromLocalPool(modalState, pageNum, searchText);
        if (localRes) {
          setDrillItems(localRes.items);
          setDrillTotal(localRes.total);
          setDrillLoading(false);
          return;
        }
      }

      const cacheKey = `${tenantScope}|${activeDateFilter}|${customFrom}|${customTo}|${dateField}|${modalState.type}|${modalState.consultantId}|${modalState.source}|${modalState.stageId}|${pageNum}|${searchText}`;
      if (!bypassCache && drillCacheRef.current.has(cacheKey)) {
        const cached = drillCacheRef.current.get(cacheKey)!;
        setDrillItems(cached.items);
        setDrillTotal(cached.total);
        setDrillLoading(false);
        return;
      }

      if (abortDrillRef.current) {
        abortDrillRef.current.abort();
      }
      const controller = new AbortController();
      abortDrillRef.current = controller;

      setDrillLoading(true);
      try {
        const params: Record<string, any> = {
          drilldown: modalState.type,
          page: pageNum,
          limit: DRILLDOWN_PAGE_SIZE,
          drilldown_consultant_id: modalState.consultantId,
          drilldown_source: modalState.source,
          date_field: dateField
        };
        if (customFrom && customTo) {
          params.from = customFrom;
          params.to = customTo;
          params.from_date = customFrom;
          params.to_date = customTo;
        } else {
          params.date = activeDateFilter;
        }
        if (modalState.type === 'stage' && modalState.stageId > 0) {
          params.drilldown_stage_id = modalState.stageId;
        }
        if (searchText !== '') {
          params.search = searchText;
        }
        const res = await api.get('/dashboard/sales-lead-performance', {
          params,
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        const payload = res.data?.data || res.data;
        const items = ensureArray(payload?.items);
        const total = Number(payload?.total || 0);
        drillCacheRef.current.set(cacheKey, { items, total });
        setDrillItems(items);
        setDrillTotal(total);
      } catch (e: any) {
        if (e?.name === 'CanceledError' || e?.name === 'AbortError' || controller.signal.aborted) return;
        setDrillItems([]);
        setDrillTotal(0);
      } finally {
        if (abortDrillRef.current === controller) {
          setDrillLoading(false);
        }
      }
    },
    [tenantScope, activeDateFilter, customFrom, customTo, dateField, resolveFromLocalPool]
  );

  useEffect(() => {
    if (drillModal.isOpen) {
      fetchDrilldownList(drillModal, drillPage, drillSearch);
    } else if (abortDrillRef.current) {
      abortDrillRef.current.abort();
    }
  }, [drillModal, drillPage, drillSearch, fetchDrilldownList]);

  useEffect(() => {
    return () => {
      abortDrillRef.current?.abort();
    };
  }, []);

  const [salesViewMode, setSalesViewMode] = useState<'table' | 'rank'>('table');

  const openDrilldownModal = useCallback(
    (opts: {
      type: DrilldownType;
      title: string;
      consultantId?: number;
      source?: string;
      stageId?: number;
      stageName?: string;
    }) => {
      const nextModal: DrilldownModalState = {
        isOpen: true,
        type: opts.type,
        title: opts.title,
        consultantId: opts.consultantId !== undefined ? opts.consultantId : selectedConsultantId,
        source: opts.source !== undefined ? opts.source : selectedSource,
        stageId: opts.stageId || 0,
        stageName: opts.stageName
      };
      setDrillPage(1);
      setDrillSearchInput('');
      setDrillSearch('');
      const localRes = resolveFromLocalPool(nextModal, 1, '');
      if (localRes) {
        setDrillItems(localRes.items);
        setDrillTotal(localRes.total);
        setDrillLoading(false);
      }
      setDrillModal(nextModal);
    },
    [selectedConsultantId, selectedSource, resolveFromLocalPool]
  );

  const handleScrollOrders = useCallback(() => {
    const el = document.getElementById('sales-orders-revenue-section');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const summary = data?.summary || {
    total_leads: 0,
    funnel_total_leads: 0,
    prev_total_leads: 0,
    growth_rate: 0,
    excluded_personal_count: 0,
    excluded_error_count: 0,
    qualified_leads: 0,
    qualified_rate: 0,
    win_funnel_leads: 0,
    win_funnel_rate: 0,
    unconnected_leads: 0,
    unconnected_rate: 0,
    funnel_qualified_leads: 0,
    funnel_qualified_rate: 0,
    funnel_win_leads: 0,
    funnel_win_rate: 0,
    funnel_unconnected_leads: 0,
    funnel_unconnected_rate: 0,
    contacted_leads: 0,
    connected_rate: 0,
    uncontacted_leads: 0,
    uncontacted_rate: 0,
    total_deals: 0,
    deal_conversion_rate: 0,
    total_deal_value: 0,
    won_deals: 0,
    won_value: 0,
    approved_deals: 0,
    approved_value: 0,
    pending_deals: 0,
    pending_value: 0,
    prev_won_deals: 0,
    prev_won_value: 0,
    revenue_growth_rate: 0,
    win_rate: 0,
    quality_distribution: { hot: 0, warm: 0, cold: 0 }
  };

  const funnel = ensureArray(data?.funnel);
  const sources = ensureArray(data?.sources);
  const sales = ensureArray(data?.sales_leaderboard);
  const recentOrders = ensureArray(data?.recent_orders);
  const lostReasons = ensureArray(data?.lost_reasons);
  const canManageTargets = summary.can_manage_targets === true;

  // Compute Funnel Donut Breakdown (1-2 Chưa connect, 3-12 Qualified, 13-14 Win)
  const funnelAnalytics = useMemo(() => {
    const total =
      summary.funnel_total_leads !== undefined ? Number(summary.funnel_total_leads) : Number(summary.total_leads || 0);
    const safeTotal = Math.max(1, total);

    let stage1Count = 0;
    let stage2Count = 0;
    let stage1Id = 0;
    let stage2Id = 0;
    let stage3to4Count = 0;
    let stage5to12Count = 0;
    let stage13to14Count = 0;

    funnel.forEach((st, idx) => {
      const m = String(st.name || '').match(/^0?(\d{1,2})\b/);
      const ord = st.stage_number !== undefined ? Number(st.stage_number) : m ? Number(m[1]) : idx + 1;
      const cnt = Number(st.count || 0);
      if (ord === 1) {
        stage1Count += cnt;
        stage1Id = st.id;
      } else if (ord === 2) {
        stage2Count += cnt;
        stage2Id = st.id;
      } else if (ord >= 3 && ord <= 12 && !st.is_lost) {
        if (ord <= 4) stage3to4Count += cnt;
        else stage5to12Count += cnt;
      } else if ((ord === 13 || ord === 14 || st.is_won) && !st.is_lost) {
        stage13to14Count += cnt;
      }
    });

    const unconnectedCount =
      summary.funnel_unconnected_leads !== undefined
        ? Number(summary.funnel_unconnected_leads)
        : stage1Count + stage2Count;
    const qualifiedCount =
      summary.funnel_qualified_leads !== undefined
        ? Number(summary.funnel_qualified_leads)
        : stage3to4Count + stage5to12Count;
    const winCount =
      summary.funnel_win_leads !== undefined
        ? Number(summary.funnel_win_leads)
        : stage13to14Count;

    const qualifiedPct = total > 0 ? Number(((qualifiedCount / safeTotal) * 100).toFixed(1)) : 0;
    const winPct = total > 0 ? Number(((winCount / safeTotal) * 100).toFixed(1)) : 0;
    const unconnectedPct = total > 0 ? Number(((unconnectedCount / safeTotal) * 100).toFixed(1)) : 0;
    const stage1Pct = total > 0 ? Number(((stage1Count / safeTotal) * 100).toFixed(1)) : 0;
    const stage2Pct = total > 0 ? Number(((stage2Count / safeTotal) * 100).toFixed(1)) : 0;
    const stage3to4Pct = total > 0 ? Number(((stage3to4Count / safeTotal) * 100).toFixed(1)) : 0;
    const stage5to12Pct = total > 0 ? Number(((stage5to12Count / safeTotal) * 100).toFixed(1)) : 0;
    const stage13to14Pct = total > 0 ? Number(((stage13to14Count / safeTotal) * 100).toFixed(1)) : 0;

    return {
      total,
      qualifiedCount,
      qualifiedPct,
      winCount,
      winPct,
      unconnectedCount,
      unconnectedPct,
      stage1Count,
      stage1Pct,
      stage1Id,
      stage2Count,
      stage2Pct,
      stage2Id,
      stage3to4Count,
      stage3to4Pct,
      stage5to12Count,
      stage5to12Pct,
      stage13to14Count,
      stage13to14Pct
    };
  }, [
    funnel,
    summary.funnel_total_leads,
    summary.total_leads,
    summary.funnel_qualified_leads,
    summary.funnel_win_leads,
    summary.funnel_unconnected_leads
  ]);

  const availableConsultants = Array.isArray(data?.filters?.available_consultants)
    ? data!.filters!.available_consultants
    : sales.map((s) => ({
        id: s.user_id,
        full_name: s.full_name,
        avatar_url: s.avatar_url,
        role: s.role,
        job_title: s.job_title
      }));
  const availableSources = Array.isArray(data?.filters?.available_sources) ? data!.filters!.available_sources : [];

  const consultantOptions = useMemo(
    () => [
      { value: 0, label: 'Tất cả Sale (Role Sale)' },
      ...availableConsultants.map((c) => ({
        value: Number(c.id),
        label: c.full_name,
        avatar: c.avatar_url || undefined,
        sublabel: c.job_title || 'Chuyên viên Tư vấn'
      }))
    ],
    [availableConsultants]
  );

  const sourceOptions = useMemo(
    () => [
      { value: 'all', label: 'Tất cả Nguồn Marketing' },
      ...availableSources.map((src) => ({
        value: src,
        label: src
      }))
    ],
    [availableSources]
  );

  const localDateOptions = [
    { value: 'Hôm nay', label: 'Hôm nay' },
    { value: 'Hôm qua', label: 'Hôm qua' },
    { value: 'Tuần này', label: 'Tuần này' },
    { value: 'Tuần trước', label: 'Tuần trước' },
    { value: '7 ngày qua', label: '7 ngày qua' },
    { value: '30 ngày qua', label: '30 ngày qua' },
    { value: 'Tháng này', label: 'Tháng này' },
    { value: 'Tháng trước', label: 'Tháng trước' },
    { value: 'Tất cả', label: 'Tất cả thời gian' }
  ];

  // Paginated slices for tables
  const pagedSales = useMemo(
    () => sales.slice((salesPage - 1) * SECTION_PAGE_SIZE, salesPage * SECTION_PAGE_SIZE),
    [sales, salesPage]
  );
  const pagedSources = useMemo(
    () => sources.slice((sourcePage - 1) * SECTION_PAGE_SIZE, sourcePage * SECTION_PAGE_SIZE),
    [sources, sourcePage]
  );
  const pagedOrders = useMemo(
    () => recentOrders.slice((ordersPage - 1) * SECTION_PAGE_SIZE, ordersPage * SECTION_PAGE_SIZE),
    [recentOrders, ordersPage]
  );

  if (loading && !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        <div className="dashboard-kpi-grid">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
        <PipelineCardsAndSpectrumSkeleton />
        <LeaderboardCardSkeleton rows={5} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
          <DonutAndRankedListSkeleton rows={5} />
          <LeaderboardCardSkeleton rows={5} />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div
        className="card"
        style={{
          padding: '2rem',
          textAlign: 'center',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
        }}
      >
        <AlertTriangle size={32} style={{ color: '#BD1D2D', margin: '0 auto 0.75rem' }} />
        <div style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.25rem' }}>{error}</div>
        <div style={{ marginTop: '0.75rem', display: 'inline-flex' }}>
          <DomToolbarButton
            variant="outline"
            icon={<RefreshCw size={14} />}
            onClick={() =>
              fetchPerformance(
                activeDateFilter,
                selectedConsultantId,
                funnelConsultantId,
                selectedSource,
                true,
                customFrom,
                customTo,
                dateField
              )
            }
          >
            Thử lại
          </DomToolbarButton>
        </div>
      </div>
    );
  }

  const hasActiveSubFilters =
    selectedConsultantId > 0 ||
    funnelConsultantId > 0 ||
    (selectedSource !== '' && selectedSource !== 'all') ||
    Boolean(customFrom || customTo) ||
    dateField !== 'created_at';

  const handleManualRefresh = () => {
    if (inFlightRefreshRef.current || loading || isRefreshing) return;
    inFlightRefreshRef.current = true;
    drillCacheRef.current.clear();
    fetchPerformance(
      activeDateFilter,
      selectedConsultantId,
      funnelConsultantId,
      selectedSource,
      true,
      customFrom,
      customTo,
      dateField
    ).finally(() => {
      inFlightRefreshRef.current = false;
    });
  };

  const handleExportCsv = async () => {
    if (inFlightExportRef.current) return;
    inFlightExportRef.current = true;
    setIsExporting(true);
    try {
      const fromParam = customFrom || data?.date_range?.from || undefined;
      const toParam = customTo || data?.date_range?.to || undefined;
      await downloadExportFile({
        endpoint: '/export',
        params: {
          type: 'contact',
          segment: 'tiem_nang',
          data_type: 'distributed',
          date_field: dateField,
          from: fromParam,
          to: toParam,
          from_date: fromParam,
          to_date: toParam,
          owner_id: selectedConsultantId > 0 ? selectedConsultantId : undefined,
          source: selectedSource !== 'all' ? selectedSource : undefined
        },
        defaultFilename: `sales_lead_performance_${fromParam || 'all'}_${toParam || 'now'}.csv`,
        onSuccess: () => toast.success('Đã xuất file Excel/CSV đối chiếu thành công!'),
        onError: (msg) => toast.error(msg)
      });
    } finally {
      inFlightExportRef.current = false;
      setIsExporting(false);
    }
  };

  // SVG Donut chart geometry (r = 82, circumference = 2 * PI * 82 = 515.22)
  // 3 segments: Qualified (#334155), Win (#BD1D2D), Chưa Connect (#94A3B8)
  const donutRadius = 82;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const qualArc = (Math.min(100, Math.max(0, funnelAnalytics.qualifiedPct)) / 100) * donutCircumference;
  const winArc = (Math.min(100 - funnelAnalytics.qualifiedPct, Math.max(0, funnelAnalytics.winPct)) / 100) * donutCircumference;
  const unconnArc = Math.max(0, donutCircumference - qualArc - winArc);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
      {/* Unified 36px DOMATION Dashboard Filter Toolbar */}
      <DomDashboardToolbar
        elevated
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', flex: isMobile ? '1 1 100%' : '0 1 auto', justifyContent: isMobile ? 'space-between' : 'flex-start' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--color-text)', fontWeight: 700, fontSize: isMobile ? '0.75rem' : '0.8rem', whiteSpace: 'nowrap' }}>
              <Calendar size={14} style={{ color: '#BD1D2D', flexShrink: 0 }} />
              <span>
                Kỳ: {formatDateShort(data?.date_range?.from)} – {formatDateShort(data?.date_range?.to)}
              </span>
            </span>

            {!isMobile && (
              <DomToolbarButton
                variant="outline"
                active={showUncontactedHelp}
                icon={<HelpCircle size={13} style={{ color: '#BD1D2D' }} />}
                onClick={() => setShowUncontactedHelp((v) => !v)}
              >
                Quy chuẩn Chưa tương tác &amp; Qualified
              </DomToolbarButton>
            )}

            {isMobile && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <DomToolbarButton
                  variant="outline"
                  active={showUncontactedHelp}
                  icon={<HelpCircle size={14} />}
                  onClick={() => setShowUncontactedHelp((v) => !v)}
                  title="Quy chuẩn Chưa tương tác & Qualified"
                  aria-label="Quy chuẩn"
                  style={{ width: '36px', padding: 0 }}
                />
                <DomToolbarButton
                  variant="outline"
                  active={showMobileFilters || hasActiveSubFilters}
                  icon={<Filter size={13} />}
                  onClick={() => setShowMobileFilters((v) => !v)}
                >
                  Lọc{hasActiveSubFilters ? ' •' : ''}
                </DomToolbarButton>
              </div>
            )}
          </div>
        }
        right={
          !isMobile || showMobileFilters ? (
            <>
              <DomSegmentedSwitch<'created_at' | 'deposit_date'>
                size="md"
                ariaLabel="Chọn mốc thời gian thống kê"
                value={dateField}
                onChange={(nextField) => {
                  setDateField(nextField);
                  setSalesPage(1);
                  setSourcePage(1);
                  setOrdersPage(1);
                }}
                options={[
                  { value: 'created_at', label: 'Ngày tạo' },
                  { value: 'deposit_date', label: 'Ngày cọc' }
                ]}
              />

              {embedInPage === 'contacts' && (
                <div style={{ minWidth: isMobile ? '100%' : '148px', flex: isMobile ? '1 1 100%' : '0 1 160px' }}>
                  <CustomSelect
                    options={localDateOptions}
                    value={localDateFilter}
                    onChange={(val) => {
                      setLocalDateFilter(String(val));
                      setCustomFrom('');
                      setCustomTo('');
                      setSalesPage(1);
                      setSourcePage(1);
                      setOrdersPage(1);
                    }}
                    size="sm"
                    width="100%"
                  />
                </div>
              )}

              <DomDateRangePill
                fromDate={customFrom}
                toDate={customTo}
                onFromChange={(iso) => {
                  setCustomFrom(iso);
                  setSalesPage(1);
                  setSourcePage(1);
                  setOrdersPage(1);
                }}
                onToChange={(iso) => {
                  setCustomTo(iso);
                  setSalesPage(1);
                  setSourcePage(1);
                  setOrdersPage(1);
                }}
                style={{ flex: isMobile ? '1 1 100%' : undefined }}
              />

              <div style={{ minWidth: isMobile ? '140px' : '188px', flex: isMobile ? '1 1 45%' : '1 1 180px', maxWidth: isMobile ? undefined : '230px' }}>
                <CustomSelect
                  options={consultantOptions}
                  value={selectedConsultantId}
                  onChange={(val) => handleTopConsultantChange(Number(val))}
                  showAvatars
                  searchable
                  size="sm"
                  width="100%"
                />
              </div>

              <div style={{ minWidth: isMobile ? '140px' : '170px', flex: isMobile ? '1 1 45%' : '1 1 165px', maxWidth: isMobile ? undefined : '215px' }}>
                <CustomSelect
                  options={sourceOptions}
                  value={selectedSource}
                  onChange={(val) => {
                    setSelectedSource(String(val));
                    setSalesPage(1);
                    setSourcePage(1);
                    setOrdersPage(1);
                  }}
                  searchable
                  size="sm"
                  width="100%"
                />
              </div>
            </>
          ) : undefined
        }
        actions={
          <>
            {hasActiveSubFilters && (
              <DomToolbarButton
                variant="outline"
                icon={<RotateCcw size={13} />}
                onClick={() => {
                  setSelectedConsultantId(0);
                  setFunnelConsultantId(0);
                  setSelectedSource('all');
                  setCustomFrom('');
                  setCustomTo('');
                  setDateField('created_at');
                  setSalesPage(1);
                  setSourcePage(1);
                  setOrdersPage(1);
                }}
                title="Đặt lại bộ lọc"
              >
                Đặt lại
              </DomToolbarButton>
            )}

            <DomToolbarButton
              variant="outline"
              disabled={isExporting || loading}
              loading={isExporting}
              icon={!isExporting ? <Download size={13} /> : undefined}
              onClick={handleExportCsv}
              title="Xuất CSV đối chiếu đúng bộ lọc hiện tại"
            >
              {!isMobile ? (isExporting ? 'Đang xuất...' : 'Xuất CSV') : undefined}
            </DomToolbarButton>

            <DomToolbarButton
              variant="outline"
              disabled={loading || isRefreshing}
              icon={<RefreshCw size={14} className={loading || isRefreshing ? 'animate-spin' : ''} />}
              onClick={handleManualRefresh}
              title="Làm mới số liệu"
              aria-label="Làm mới số liệu"
              style={{ width: '36px', padding: 0 }}
            />
          </>
        }
      />

      {/* Collapsible Definition Banner */}
      {showUncontactedHelp && (
        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            borderLeft: '3px solid var(--color-primary)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem'
          }}
        >
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
            <Info size={18} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 2 }} />
            <div style={{ fontSize: '0.8125rem', color: 'var(--color-text)', lineHeight: 1.55 }}>
              <div style={{ fontWeight: 800, marginBottom: '4px' }}>
                Quy chuẩn phân loại Lead trong Hiệu suất Sale
              </div>
              <div style={{ color: 'var(--color-text-muted)' }}>
                <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  <li><strong>Chưa tương tác:</strong> Lead được phân bổ trong kỳ nhưng chưa có bất kỳ hoạt động chăm sóc, chưa có ghi chú tư vấn thủ công và trường Liên hệ cuối đang trống.</li>
                  <li><strong>Chưa Connect:</strong> Lead đang nằm ở giai đoạn <strong>01 – New Lead</strong> hoặc <strong>02 – Contact Attempted</strong>.</li>
                  <li><strong>Lead Qualified:</strong> Lead đã kết nối và đi vào phễu tư vấn chuyên sâu từ giai đoạn <strong>03</strong> đến <strong>12</strong>.</li>
                  <li><strong>Win:</strong> Lead chốt thành công ở giai đoạn <strong>13 – Deposit</strong> và <strong>14 – Enrolled</strong>.</li>
                </ul>
              </div>
            </div>
          </div>
          <DomToolbarButton
            variant="outline"
            onClick={() =>
              openDrilldownModal({
                type: 'uncontacted',
                title: 'Danh sách Lead Chưa tương tác'
              })
            }
            style={{ flexShrink: 0 }}
          >
            Mở DS Chưa tương tác
          </DomToolbarButton>
        </div>
      )}

      {/* 4 App-Standard KPI Cards — 100% Unified with Dashboard.tsx */}
      <style>{`
        .sales-perf-kpi-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1rem;
        }
        @media (max-width: 1100px) {
          .sales-perf-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 640px) {
          .sales-perf-kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem;
          }
        }
        .sales-perf-kpi-grid .stat-card {
          border: 1px solid var(--color-border-light, #e2e8f0) !important;
        }
        .sales-perf-kpi-grid .stat-card:hover {
          border-color: var(--color-border, #cbd5e1) !important;
          box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06) !important;
        }
      `}</style>
      <SalesPerfKpiStrip
        summary={summary}
        funnelAnalytics={funnelAnalytics}
        onOpenDrilldown={openDrilldownModal}
        onScrollOrders={handleScrollOrders}
      />

      {/* SECTION 1 (FULL WIDTH): BẢNG XẾP HẠNG HIỆU SUẤT ĐỘI NGŨ SALE */}
      <div
        className="card dom-cv-card"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
              Bảng xếp hạng hiệu suất đội ngũ Sale
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Click vào số liệu bất kỳ để mở danh sách khách hàng chi tiết
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {Number(summary.total_sales_target || 0) > 0 && (
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 8,
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                Target kỳ:{' '}
                <strong style={{ color: 'var(--color-text)' }}>{formatVND(Number(summary.total_sales_target || 0))}</strong>
                {' • Đạt '}
                <strong style={{ color: getTargetProgressTone(Number(summary.target_achievement_rate || 0)) }}>
                  {Number(summary.target_achievement_rate || 0)}%
                </strong>
              </span>
            )}
            <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
              Nhân sự Sale: <strong style={{ color: 'var(--color-text)' }}>{sales.length}</strong>
            </span>
            <DomSegmentedSwitch<'table' | 'rank'>
              size="sm"
              ariaLabel="Chế độ xem bảng xếp hạng Sale"
              value={salesViewMode}
              onChange={setSalesViewMode}
              options={[
                { value: 'table', label: 'Bảng chi tiết' },
                { value: 'rank', label: 'Xếp hạng thanh' }
              ]}
            />
            {canManageTargets && (
              <DomToolbarButton
                variant="primary"
                icon={<Target size={14} />}
                onClick={() => {
                  setTargetFocusUserId(null);
                  setTargetModalOpen(true);
                }}
                style={{ height: '32px', padding: '0 12px', fontSize: '0.75rem' }}
              >
                Thiết lập Target TVV
              </DomToolbarButton>
            )}
          </div>
        </div>

        {salesViewMode === 'rank' ? (
          sales.length === 0 ? (
            <DomEmptyChartState icon={<Users size={20} />} title="Chưa có dữ liệu hiệu suất đội ngũ Sale" minHeight={160} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(() => {
                const maxAssigned = Math.max(1, ...sales.map((s) => Number(s.assigned_leads || 0)));
                return sales.map((s, idx) => (
                  <DomRankBarRow
                    key={s.user_id}
                    rank={s.rank || idx + 1}
                    icon={<Avatar src={s.avatar_url || undefined} name={s.full_name} size={24} />}
                    label={s.full_name}
                    sublabel={`${formatDomNumber(s.contacted_leads)} tương tác • ${formatDomNumber(s.qualified_leads)} Qualified • ${formatDomNumber(s.won_count)} đơn SO`}
                    value={formatVND(Number(s.cash_in_period ?? s.approved_value ?? s.won_value ?? 0))}
                    secondaryValue={`${formatDomNumber(s.assigned_leads)} lead`}
                    badge={`${s.contact_rate}% gọi`}
                    badgeTone={s.contact_rate >= 80 ? 'emerald' : s.contact_rate >= 50 ? 'amber' : 'brand'}
                    percent={Math.max(4, Math.round((Number(s.assigned_leads || 0) / maxAssigned) * 100))}
                    barColor={MYERP_CHART_PALETTE[idx % MYERP_CHART_PALETTE.length]}
                    onClick={() =>
                      openDrilldownModal({
                        type: 'all',
                        title: `Lead của ${s.full_name}`,
                        consultantId: s.user_id
                      })
                    }
                  />
                ));
              })()}
            </div>
          )
        ) : (
          <>
            <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--color-border-light)', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border-light)' }}>
                <th style={{ padding: '11px 12px', textAlign: 'center', width: 52 }}>Hạng</th>
                <th style={{ padding: '11px 12px', textAlign: 'left' }}>Chuyên viên Sale</th>
                <th style={{ padding: '11px 12px', textAlign: 'center' }}>Tổng Lead</th>
                <th style={{ padding: '11px 12px', textAlign: 'left', minWidth: 160 }}>Đã tương tác</th>
                <th style={{ padding: '11px 12px', textAlign: 'center' }}>Chưa tương tác</th>
                <th style={{ padding: '11px 12px', textAlign: 'center' }}>Qualified</th>
                <th style={{ padding: '11px 12px', textAlign: 'center' }}>Đơn hàng</th>
                <th style={{ padding: '11px 12px', textAlign: 'right' }}>Doanh thu dự kiến</th>
                <th style={{ padding: '11px 12px', textAlign: 'right' }}>Thực thu</th>
                <th style={{ padding: '11px 12px', textAlign: 'right', minWidth: 175 }}>Target Tháng &amp; % Đạt</th>
              </tr>
            </thead>
            <tbody>
              {pagedSales.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Không có dữ liệu nhân sự Sale trong kỳ đã chọn.
                  </td>
                </tr>
              ) : (
                pagedSales.map((s) => {
                  const isTop1 = s.rank === 1 && s.won_value > 0;
                  const displayContactRate = s.assigned_leads > 0 ? s.contact_rate : 0;
                  const rateColor = displayContactRate >= 80 ? '#10b981' : displayContactRate >= 50 ? '#f59e0b' : '#ef4444';
                  const qualPct = s.assigned_leads > 0 ? Math.round((s.qualified_leads / s.assigned_leads) * 100) : 0;

                  return (
                    <tr
                      key={s.user_id}
                      className="hover-bg"
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        transition: 'background 0.15s'
                      }}
                    >
                      {/* Rank */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 26,
                            height: 26,
                            borderRadius: '50%',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            background:
                              s.rank === 1
                                ? '#C6333D'
                                : s.rank === 2
                                ? '#334155'
                                : s.rank === 3
                                ? '#64748B'
                                : '#f1f5f9',
                            color: s.rank <= 3 ? '#ffffff' : '#475569'
                          }}
                        >
                          {s.rank}
                        </span>
                      </td>

                      {/* Consultant Info */}
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar name={s.full_name} src={s.avatar_url || undefined} size={34} />
                          <div>
                            <div
                              onClick={() => handleTopConsultantChange(selectedConsultantId === s.user_id ? 0 : s.user_id)}
                              style={{
                                fontWeight: 700,
                                color: selectedConsultantId === s.user_id ? '#BD1D2D' : 'var(--color-text)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                              }}
                              title="Click để lọc riêng Sale này"
                            >
                              <span>{s.full_name}</span>
                              {isTop1 && (
                                <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', fontWeight: 800 }}>
                                  TOP 1
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                              {s.job_title || 'Chuyên viên Tư vấn'}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Assigned Leads */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                          <button
                            onClick={() =>
                              openDrilldownModal({
                                type: 'all',
                                title: `Tổng Lead của ${s.full_name}`,
                                consultantId: s.user_id
                              })
                            }
                            style={{
                              border: '1px solid var(--color-border)',
                              background: 'var(--color-surface)',
                              padding: '4px 10px',
                              borderRadius: 8,
                              fontWeight: 800,
                              fontSize: '0.8125rem',
                              color: 'var(--color-text)',
                              cursor: 'pointer'
                            }}
                            title={`Mở danh sách ${s.assigned_leads} lead mới của ${s.full_name}`}
                          >
                            {s.assigned_leads}
                          </button>
                          {((s.duplicate_profile_leads || 0) > 0 || (s.reminder_leads || 0) > 0) && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, flexWrap: 'wrap' }}>
                              {(s.duplicate_profile_leads || 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDrilldownModal({
                                      type: 'duplicate_profile',
                                      title: `Trùng hồ sơ — ${s.full_name}`,
                                      consultantId: s.user_id
                                    });
                                  }}
                                  style={{
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-bg-secondary)',
                                    color: 'var(--color-text-secondary)',
                                    borderRadius: 6,
                                    padding: '1px 6px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={`Xem ${s.duplicate_profile_leads} lead trùng hồ sơ của ${s.full_name}`}
                                >
                                  {s.duplicate_profile_leads} trùng
                                </button>
                              )}
                              {(s.reminder_leads || 0) > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openDrilldownModal({
                                      type: 'reminder',
                                      title: `Lead Nhắc lại (<6T) — ${s.full_name}`,
                                      consultantId: s.user_id
                                    });
                                  }}
                                  style={{
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-bg-secondary)',
                                    color: 'var(--color-text-secondary)',
                                    borderRadius: 6,
                                    padding: '1px 6px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                  }}
                                  title={`Xem ${s.reminder_leads} lead nhắc lại (<6T) của ${s.full_name}`}
                                >
                                  {s.reminder_leads} nhắc
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Contacted Leads + Progress */}
                      <td style={{ padding: '10px 12px' }}>
                        <div
                          onClick={() =>
                            openDrilldownModal({
                              type: 'contacted',
                              title: `Lead Đã tương tác — ${s.full_name}`,
                              consultantId: s.user_id
                            })
                          }
                          style={{ cursor: 'pointer' }}
                          title={`Mở danh sách ${s.contacted_leads} lead đã tương tác của ${s.full_name}`}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                              {s.contacted_leads}/{s.assigned_leads} lead
                            </span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                              {displayContactRate}%
                            </span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, displayContactRate)}%`, height: '100%', background: rateColor, borderRadius: 4 }} />
                          </div>
                        </div>
                      </td>

                      {/* Uncontacted Leads (Chưa Tương Tác) */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {s.uncontacted_leads > 0 ? (
                          <button
                            onClick={() =>
                              openDrilldownModal({
                                type: 'uncontacted',
                                title: `Lead Chưa tương tác — ${s.full_name}`,
                                consultantId: s.user_id
                              })
                            }
                            style={{
                              border: '1px solid rgba(189, 29, 45, 0.22)',
                              background: '#fef2f2',
                              color: '#BD1D2D',
                              padding: '4px 10px',
                              borderRadius: 8,
                              fontWeight: 700,
                              fontSize: '0.76rem',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 5
                            }}
                            title={`Click mở danh sách ${s.uncontacted_leads} lead chưa tương tác của ${s.full_name}`}
                          >
                            <PhoneOff size={12} />
                            <span>{s.uncontacted_leads} chưa tương tác</span>
                          </button>
                        ) : (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              padding: '3px 9px',
                              borderRadius: 8,
                              background: 'var(--color-bg-secondary)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text-secondary)',
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}
                          >
                            <CheckCircle2 size={12} /> 0 chưa tương tác
                          </span>
                        )}
                      </td>

                      {/* Qualified Leads */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() =>
                            openDrilldownModal({
                              type: 'qualified_all',
                              title: `Lead Qualified — ${s.full_name}`,
                              consultantId: s.user_id
                            })
                          }
                          style={{
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-secondary)',
                            padding: '3px 10px',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: '0.76rem',
                            color: 'var(--color-text)',
                            cursor: 'pointer'
                          }}
                          title={`Xem ${s.qualified_leads} lead Qualified của ${s.full_name}`}
                        >
                          {s.qualified_leads} • {qualPct}%
                        </button>
                      </td>

                      {/* Won Orders (SO) */}
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {s.won_count > 0 ? (
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                            <span style={{ fontWeight: 800, color: 'var(--color-text)', fontSize: '0.825rem' }}>
                              {s.won_count} đơn
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                              Win: {s.win_rate}%
                            </span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>0 đơn</span>
                        )}
                      </td>

                      {/* Expected Revenue (Doanh Thu Dự Kiến) */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: s.won_value > 0 ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                          {formatVND(s.won_value)}
                        </div>
                      </td>

                      {/* Collected Revenue (Thực Thu) */}
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.85rem', color: Number(s.approved_value || 0) > 0 ? '#BD1D2D' : 'var(--color-text-muted)' }}>
                          {formatVND(s.approved_value || 0)}
                        </div>
                        {Number(s.pending_value || 0) > 0 && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                            Còn thu: {formatVND(s.pending_value || 0)}
                          </div>
                        )}
                      </td>

                      {/* Monthly Target & % Achievement */}
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {Number(s.monthly_target || 0) > 0 ? (
                          <div
                            onClick={() => {
                              if (canManageTargets) {
                                setTargetFocusUserId(s.user_id);
                                setTargetModalOpen(true);
                              }
                            }}
                            style={{ cursor: canManageTargets ? 'pointer' : 'default' }}
                            title={canManageTargets ? `Click để điều chỉnh Target của ${s.full_name}` : undefined}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                              <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--color-text)' }}>
                                {formatVND(Number(s.monthly_target || 0))}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  color: getTargetProgressTone(Number(s.target_achievement_pct || 0))
                                }}
                              >
                                ({Number(s.target_achievement_pct || 0)}%)
                              </span>
                              {canManageTargets && <Edit3 size={12} style={{ color: 'var(--color-text-muted)' }} />}
                            </div>
                            <div style={{ width: '100%', height: 5, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                              <div
                                style={{
                                  width: `${Math.min(100, Number(s.target_achievement_pct || 0))}%`,
                                  height: '100%',
                                  background: getTargetProgressTone(Number(s.target_achievement_pct || 0)),
                                  borderRadius: 4
                                }}
                              />
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 3 }}>
                              {Number(s.target_remaining || 0) > 0
                                ? `Còn thiếu: ${formatVND(Number(s.target_remaining || 0))}`
                                : 'Đã hoàn thành Target'}
                            </div>
                          </div>
                        ) : canManageTargets ? (
                          <button
                            type="button"
                            onClick={() => {
                              setTargetFocusUserId(s.user_id);
                              setTargetModalOpen(true);
                            }}
                            style={{
                              border: '1px dashed #cbd5e1',
                              background: 'var(--color-surface)',
                              color: 'var(--color-text-muted)',
                              borderRadius: 7,
                              padding: '4px 9px',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4
                            }}
                          >
                            <Target size={12} style={{ color: '#BD1D2D' }} />
                            <span>Đặt Target</span>
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)' }}>Chưa đặt</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {sales.length > SECTION_PAGE_SIZE && (
          <Pagination
            total={sales.length}
            page={salesPage}
            pageSize={SECTION_PAGE_SIZE}
            onChange={(p) => setSalesPage(p)}
          />
        )}
          </>
        )}
      </div>

      {/* SECTION 2 (50% BIỂU ĐỒ PHỄU CHUYỂN ĐỔI + 50% BIỂU ĐỒ TRÒN ĐÁNH GIÁ QUALIFIED / WIN / CHƯA CONNECT) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
          gap: '1.25rem',
          alignItems: 'stretch'
        }}
      >
        {/* LEFT 50% CARD: BIỂU ĐỒ PHỄU CHUYỂN ĐỔI GIAI ĐOẠN */}
        <div
          className="card dom-cv-card"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
            minWidth: 0,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
          }}
        >
          {/* Clean Single-Row Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Phễu chuyển đổi giai đoạn
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                Tổng: <strong style={{ color: 'var(--color-text)' }}>{funnelAnalytics.total} lead</strong> • Click tầng phễu để mở danh sách
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <DomSegmentedSwitch<'main' | 'all'>
                size="sm"
                ariaLabel="Chế độ xem phễu"
                value={showAllFunnelStages ? 'all' : 'main'}
                onChange={(m) => setShowAllFunnelStages(m === 'all')}
                options={[
                  { value: 'main', label: 'Tháp chính' },
                  { value: 'all', label: '14 bước' }
                ]}
              />
              <div style={{ width: '195px' }}>
                <CustomSelect
                  options={consultantOptions}
                  value={funnelConsultantId}
                  onChange={(val) => setFunnelConsultantId(Number(val))}
                  showAvatars
                  searchable
                  size="sm"
                  width="100%"
                />
              </div>
            </div>
          </div>

          {/* CENTERED PROPORTIONAL PYRAMID FUNNEL ("VIDEO FUNNEL" MULTI-COLOR STYLE) */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '0.5rem 0.25rem',
              maxHeight: showAllFunnelStages ? '360px' : 'none',
              overflowY: showAllFunnelStages ? 'auto' : 'visible'
            }}
          >
            {(() => {
              const safeTotal = Math.max(1, funnelAnalytics.total);
              const contactedInFunnel =
                funnelConsultantId > 0 && funnelConsultantId !== selectedConsultantId
                  ? Math.max(
                      funnelAnalytics.qualifiedCount + funnelAnalytics.winCount,
                      sales.find((s) => Number(s.user_id) === Number(funnelConsultantId))?.contacted_leads ??
                        funnelAnalytics.total
                    )
                  : Math.min(funnelAnalytics.total, Number(summary.contacted_leads || 0));
              const contactedPct =
                funnelAnalytics.total > 0 ? Number(((contactedInFunnel / safeTotal) * 100).toFixed(1)) : 0;

              // Middle buckets sorted descending by count so the pyramid ALWAYS narrows from top to bottom
              const middleTiers = [
                {
                  key: 'unconnected',
                  label: 'Chưa kết nối',
                  count: funnelAnalytics.unconnectedCount,
                  pct: funnelAnalytics.unconnectedPct,
                  gradient: '#64748B',
                  glow: 'none',
                  onClick: () =>
                    openDrilldownModal({
                      type: 'unconnected',
                      title: 'Lead Chưa Connect',
                      consultantId: funnelConsultantId
                    })
                },
                {
                  key: 'qualified',
                  label: 'Lead Qualified',
                  count: funnelAnalytics.qualifiedCount,
                  pct: funnelAnalytics.qualifiedPct,
                  gradient: '#C6333D',
                  glow: 'none',
                  onClick: () =>
                    openDrilldownModal({
                      type: 'qualified',
                      title: 'Lead Qualified',
                      consultantId: funnelConsultantId
                    })
                }
              ].sort((a, b) => b.count - a.count);

              const pyramidRows = showAllFunnelStages
                ? funnel.map((st) => ({
                    key: `st_${st.id}`,
                    label: st.name,
                    count: st.count,
                    pct: st.conversion_rate,
                    gradient: st.color || '#334155',
                    glow: 'none',
                    onClick: () =>
                      openDrilldownModal({
                        type: 'stage',
                        title: `Giai đoạn: ${st.name}`,
                        consultantId: funnelConsultantId,
                        stageId: st.id,
                        stageName: st.name
                      })
                  }))
                : [
                    {
                      key: 'total',
                      label: 'Tổng Lead',
                      count: funnelAnalytics.total,
                      pct: funnelAnalytics.total > 0 ? 100 : 0,
                      gradient: '#0F172A',
                      glow: 'none',
                      onClick: () =>
                        openDrilldownModal({
                          type: 'all',
                          title: 'Tổng Lead trong Phễu',
                          consultantId: funnelConsultantId
                        })
                    },
                    {
                      key: 'contacted',
                      label: 'Đã tương tác',
                      count: contactedInFunnel,
                      pct: contactedPct,
                      gradient: 'var(--color-text-secondary)',
                      glow: 'none',
                      onClick: () =>
                        openDrilldownModal({
                          type: 'contacted',
                          title: 'Lead Đã tương tác',
                          consultantId: funnelConsultantId
                        })
                    },
                    ...middleTiers,
                    {
                      key: 'win',
                      label: 'Win',
                      count: funnelAnalytics.winCount,
                      pct: funnelAnalytics.winPct,
                      gradient: '#BD1D2D',
                      glow: 'none',
                      onClick: () =>
                        openDrilldownModal({
                          type: 'win',
                          title: 'Lead Win',
                          consultantId: funnelConsultantId
                        })
                    }
                  ];

              return pyramidRows.map((row, idx) => {
                const prevRow = idx > 0 ? pyramidRows[idx - 1] : null;
                const diffPct =
                  prevRow && prevRow.count > 0
                    ? Math.round(((row.count - prevRow.count) / prevRow.count) * 100)
                    : 0;
                // Ensure strict pyramid tapering visual width while staying proportional to pct
                const visualWidthPct = showAllFunnelStages
                  ? Math.max(16, Math.min(100, row.pct))
                  : idx === 0
                  ? 100
                  : Math.max(18, Math.min(100 - idx * 10, Math.round(16 + row.pct * 0.82)));

                return (
                  <React.Fragment key={row.key}>
                    {idx > 0 && (
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '140px 1fr 56px',
                          alignItems: 'center',
                          gap: '12px',
                          height: '18px'
                        }}
                      >
                        <div
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: 'var(--color-text-light)',
                            paddingLeft: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px'
                          }}
                        >
                          <span>↓</span>
                          <span>{diffPct <= 0 ? `${diffPct}%` : `${row.pct}%`}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                          <div style={{ width: '2px', height: '12px', background: 'var(--color-border)', borderRadius: '2px' }} />
                        </div>
                        <div />
                      </div>
                    )}

                    <div
                      onClick={row.onClick}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '140px 1fr 56px',
                        alignItems: 'center',
                        gap: '12px',
                        cursor: 'pointer'
                      }}
                      title={`Click để mở danh sách: ${row.label} (${row.count} lead)`}
                    >
                      {/* Left Label */}
                      <div
                        style={{
                          textAlign: 'right',
                          fontSize: '0.82rem',
                          fontWeight: 700,
                          color: 'var(--color-text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {row.label}
                      </div>

                      {/* Center Proportional Rounded Pyramid Block */}
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%' }}>
                        <div
                          style={{
                            width: `${visualWidthPct}%`,
                            minWidth: '64px',
                            height: '38px',
                            borderRadius: '10px',
                            background: row.gradient,
                            boxShadow: row.glow,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '0.82rem',
                            transition: 'width 0.3s ease, transform 0.15s ease'
                          }}
                        >
                          {row.pct}%
                        </div>
                      </div>

                      {/* Right Count */}
                      <div
                        style={{
                          textAlign: 'left',
                          fontSize: '0.86rem',
                          fontWeight: 800,
                          color: 'var(--color-text)',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {row.count.toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        </div>

        {/* RIGHT 50% CARD: ĐÁNH GIÁ CHART TRÒN — QUALIFIED (03–12), WIN (13–14) & CHƯA CONNECT (01–02) */}
        <div
          className="card dom-cv-card"
          style={{
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            gap: '1rem',
            minWidth: 0,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 16,
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
          }}
        >
          {/* Clean Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text)' }}>
                Đánh giá tỷ lệ chuyển đổi phễu
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                Tỷ lệ Lead Qualified, Win &amp; chưa kết nối
              </p>
            </div>

            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '4px 10px', borderRadius: 8, background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', color: 'var(--color-text)', flexShrink: 0 }}>
              Tổng Lead: {funnelAnalytics.total}
            </span>
          </div>

          {/* Center Layout: Larger 3-Segment Donut SVG on Left + Compact Basic Cards on Right */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1.25rem',
              flexWrap: 'wrap',
              padding: '0.375rem 0'
            }}
          >
            {/* Larger 3-Segment Donut SVG (212x212) */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0, margin: '0 auto' }}>
              <div style={{ position: 'relative', width: 212, height: 212, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="212" height="212" viewBox="0 0 212 212" style={{ transform: 'rotate(-90deg)' }}>
                  <circle
                    cx="106"
                    cy="106"
                    r={donutRadius}
                    fill="transparent"
                    stroke="var(--color-bg)"
                    strokeWidth="22"
                  />
                  {/* Segment 3: Chưa Connect (Muted Slate #94A3B8) */}
                  {funnelAnalytics.total > 0 && unconnArc > 0 && (
                    <circle
                      cx="106"
                      cy="106"
                      r={donutRadius}
                      fill="transparent"
                      stroke="#94A3B8"
                      strokeWidth="22"
                      strokeDasharray={`${unconnArc} ${donutCircumference}`}
                      strokeDashoffset={-(qualArc + winArc)}
                      style={{ transition: 'stroke-dasharray 0.35s cubic-bezier(0.22, 1, 0.36, 1), stroke-dashoffset 0.35s cubic-bezier(0.22, 1, 0.36, 1)', cursor: 'pointer' }}
                      onClick={() =>
                        openDrilldownModal({
                          type: 'unconnected',
                          title: 'Lead Chưa Connect',
                          consultantId: funnelConsultantId
                        })
                      }
                    />
                  )}
                  {/* Segment 2: Win (Semantic Emerald #10B981) */}
                  {funnelAnalytics.total > 0 && winArc > 0 && (
                    <circle
                      cx="106"
                      cy="106"
                      r={donutRadius}
                      fill="transparent"
                      stroke="#10B981"
                      strokeWidth="22"
                      strokeDasharray={`${winArc} ${donutCircumference}`}
                      strokeDashoffset={-qualArc}
                      style={{ transition: 'stroke-dasharray 0.35s cubic-bezier(0.22, 1, 0.36, 1), stroke-dashoffset 0.35s cubic-bezier(0.22, 1, 0.36, 1)', cursor: 'pointer' }}
                      onClick={() =>
                        openDrilldownModal({
                          type: 'win',
                          title: 'Lead Win',
                          consultantId: funnelConsultantId
                        })
                      }
                    />
                  )}
                  {/* Segment 1: Qualified (Semantic Royal Blue #2563EB) */}
                  {funnelAnalytics.total > 0 && qualArc > 0 && (
                    <circle
                      cx="106"
                      cy="106"
                      r={donutRadius}
                      fill="transparent"
                      stroke="#2563EB"
                      strokeWidth="22"
                      strokeDasharray={`${qualArc} ${donutCircumference}`}
                      strokeDashoffset={0}
                      style={{ transition: 'stroke-dasharray 0.35s cubic-bezier(0.22, 1, 0.36, 1)', cursor: 'pointer' }}
                      onClick={() =>
                        openDrilldownModal({
                          type: 'qualified',
                          title: 'Lead Qualified',
                          consultantId: funnelConsultantId
                        })
                      }
                    />
                  )}
                </svg>

                {/* Center Label: Fits 100% inside the 142px inner circle without touching ring */}
                <div
                  onClick={() =>
                    openDrilldownModal({
                      type: 'all',
                      title: 'Danh sách Tổng Lead trong Phễu',
                      consultantId: funnelConsultantId
                    })
                  }
                  style={{
                    position: 'absolute',
                    width: 124,
                    height: 124,
                    borderRadius: '50%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    textAlign: 'center',
                    padding: '4px'
                  }}
                  title="Click để xem toàn bộ Lead trong phễu"
                >
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                    Tổng Lead
                  </span>
                  <span style={{ fontSize: '1.65rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {funnelAnalytics.total.toLocaleString('vi-VN')}
                  </span>
                </div>
              </div>
            </div>

            {/* 3 Evaluation Cards (Compact Width on Right, Basic Neutral Card Style without Colored Borders) */}
            <div style={{ flex: '1 1 210px', maxWidth: '330px', minWidth: '200px', marginLeft: 'auto', marginRight: 'auto', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
              {/* Card A: Lead Qualified (03 – 12) */}
              <div
                onClick={() =>
                  openDrilldownModal({
                    type: 'qualified',
                    title: 'Lead Qualified',
                    consultantId: funnelConsultantId
                  })
                }
                className="hover-bg"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border-light)',
                  background: 'var(--color-bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
                title="Click để mở danh sách Lead Qualified"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                      Lead Qualified
                    </span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      03–12
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-text)' }}>
                      {funnelAnalytics.qualifiedCount}
                    </span>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#2563EB' }}>
                      {funnelAnalytics.qualifiedPct}%
                    </span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 5, background: 'var(--color-surface)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, funnelAnalytics.qualifiedPct)}%`, height: '100%', background: '#2563EB', borderRadius: 4 }} />
                </div>
              </div>

              {/* Card B: Win (13 – 14) */}
              <div
                onClick={() =>
                  openDrilldownModal({
                    type: 'win',
                    title: 'Lead Win',
                    consultantId: funnelConsultantId
                  })
                }
                className="hover-bg"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border-light)',
                  background: 'var(--color-bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
                title="Click để mở danh sách Lead Win"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                      Win
                    </span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      13–14
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-text)' }}>
                      {funnelAnalytics.winCount}
                    </span>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#10B981' }}>
                      {funnelAnalytics.winPct}%
                    </span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 5, background: 'var(--color-surface)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, funnelAnalytics.winPct)}%`, height: '100%', background: '#10B981', borderRadius: 4 }} />
                </div>
              </div>

              {/* Card C: Chưa Connect (01 – 02) */}
              <div
                onClick={() =>
                  openDrilldownModal({
                    type: 'unconnected',
                    title: 'Lead Chưa Connect',
                    consultantId: funnelConsultantId
                  })
                }
                className="hover-bg"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--color-border-light)',
                  background: 'var(--color-bg)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6
                }}
                title="Click để mở danh sách Lead Chưa Connect"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94A3B8', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                      Chưa kết nối
                    </span>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, padding: '1px 5px', borderRadius: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                      01–02
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--color-text)' }}>
                      {funnelAnalytics.unconnectedCount}
                    </span>
                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                      {funnelAnalytics.unconnectedPct}%
                    </span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 5, background: 'var(--color-surface)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, funnelAnalytics.unconnectedPct)}%`, height: '100%', background: '#94A3B8', borderRadius: 4 }} />
                </div>
              </div>
            </div>
          </div>

          {/* 4-Mini Breakdown Row (Basic Card Style — No Colored Borders) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.625rem' }}>
            <div
              onClick={() => {
                if (funnelAnalytics.stage1Id > 0) {
                  openDrilldownModal({
                    type: 'stage',
                    title: 'Giai đoạn: 01 – New Lead',
                    consultantId: funnelConsultantId,
                    stageId: funnelAnalytics.stage1Id
                  });
                } else {
                  openDrilldownModal({
                    type: 'unconnected',
                    title: 'Lead Chưa Connect',
                    consultantId: funnelConsultantId
                  });
                }
              }}
              className="hover-bg"
              style={{
                padding: '9px 11px',
                borderRadius: 10,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-light)',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                01 – New Lead
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                <strong style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--color-text)' }}>{funnelAnalytics.stage1Count}</strong>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{funnelAnalytics.stage1Pct}%</span>
              </div>
            </div>

            <div
              onClick={() => {
                if (funnelAnalytics.stage2Id > 0) {
                  openDrilldownModal({
                    type: 'stage',
                    title: 'Giai đoạn: 02 – Contact Attempted',
                    consultantId: funnelConsultantId,
                    stageId: funnelAnalytics.stage2Id
                  });
                } else {
                  openDrilldownModal({
                    type: 'unconnected',
                    title: 'Lead Chưa Connect',
                    consultantId: funnelConsultantId
                  });
                }
              }}
              className="hover-bg"
              style={{
                padding: '9px 11px',
                borderRadius: 10,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-light)',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                02 – Attempted
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                <strong style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--color-text)' }}>{funnelAnalytics.stage2Count}</strong>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{funnelAnalytics.stage2Pct}%</span>
              </div>
            </div>

            <div
              onClick={() =>
                openDrilldownModal({
                  type: 'qualified',
                  title: 'Lead Qualified',
                  consultantId: funnelConsultantId
                })
              }
              className="hover-bg"
              style={{
                padding: '9px 11px',
                borderRadius: 10,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-light)',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                03–12 Qualified
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                <strong style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--color-text)' }}>{funnelAnalytics.qualifiedCount}</strong>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{funnelAnalytics.qualifiedPct}%</span>
              </div>
            </div>

            <div
              onClick={() =>
                openDrilldownModal({
                  type: 'win',
                  title: 'Lead Win',
                  consultantId: funnelConsultantId
                })
              }
              className="hover-bg"
              style={{
                padding: '9px 11px',
                borderRadius: 10,
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border-light)',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                13–14 Win
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                <strong style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--color-text)' }}>{funnelAnalytics.winCount}</strong>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{funnelAnalytics.winPct}%</span>
              </div>
            </div>
          </div>

          {lostReasons.length > 0 && (
            <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                Nguyên nhân Lost:
              </span>
              {lostReasons.map((lr, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '0.71rem',
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border-light)',
                    color: 'var(--color-text)'
                  }}
                >
                  {lr.reason}: <strong>{lr.count}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3 (FULL WIDTH — 1 BẢNG 1 HÀNG): HIỆU QUẢ THEO NGUỒN MARKETING */}
      <div
        className="card dom-cv-card"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          width: '100%',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
              Hiệu quả theo nguồn Marketing
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Đánh giá tỷ lệ tương tác, chưa tương tác, Lead Qualified, Doanh thu dự kiến và Thực thu theo từng kênh Marketing
            </p>
          </div>

          <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
            Tổng kênh Marketing: <strong style={{ color: 'var(--color-text)' }}>{sources.length}</strong>
          </span>
        </div>

        {sources.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
            {(() => {
              const topSources = sources.slice(0, 6);
              const maxSrcLeads = Math.max(1, ...topSources.map((s) => Number(s.total_leads || 0)));
              return topSources.map((src, sIdx) => (
                <DomRankBarRow
                  key={`top_src_${src.source}_${sIdx}`}
                  rank={sIdx + 1}
                  label={src.source}
                  sublabel={`${src.qualified_leads} Qualified (${src.qualified_rate}%) • ${src.won_count} đơn`}
                  value={`${formatDomNumber(src.total_leads)} lead`}
                  secondaryValue={src.won_value > 0 ? formatVND(src.won_value) : undefined}
                  badge={`${src.connected_rate}%`}
                  badgeTone={src.connected_rate >= 80 ? 'emerald' : src.connected_rate >= 50 ? 'amber' : 'brand'}
                  percent={Math.max(4, Math.round((Number(src.total_leads || 0) / maxSrcLeads) * 100))}
                  barColor={MYERP_CHART_PALETTE[sIdx % MYERP_CHART_PALETTE.length]}
                  onClick={() =>
                    openDrilldownModal({
                      type: 'all',
                      title: `Danh sách Lead nguồn: ${src.source}`,
                      source: src.source
                    })
                  }
                />
              ));
            })()}
          </div>
        )}

        <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--color-border-light)', borderRadius: '12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border-light)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: 48 }}>#</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>Nguồn Marketing</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Tổng Lead</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: 160 }}>Đã Tương Tác</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Chưa Tương Tác</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Qualified</th>
                <th style={{ padding: '10px 12px', textAlign: 'center' }}>Đơn SO</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Doanh Thu Dự Kiến</th>
                <th style={{ padding: '10px 12px', textAlign: 'right' }}>Thực Thu</th>
              </tr>
            </thead>
            <tbody>
              {pagedSources.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                    Không có dữ liệu nguồn Marketing trong kỳ này.
                  </td>
                </tr>
              ) : (
                pagedSources.map((src, idx) => {
                  const rowIndex = (sourcePage - 1) * SECTION_PAGE_SIZE + idx + 1;
                  const displayConnRate = src.total_leads > 0 ? src.connected_rate : 0;
                  const connColor = displayConnRate >= 80 ? '#10b981' : displayConnRate >= 50 ? '#f59e0b' : '#ef4444';
                  const srcColor = rowIndex <= 3 ? '#C6333D' : 'var(--color-text-secondary)';
                  const srcApproved = Number(src.approved_value || 0);
                  const srcPending = Number(src.pending_value !== undefined ? src.pending_value : Math.max(0, Number(src.won_value || 0) - srcApproved));
                  return (
                    <tr
                      key={src.source + idx}
                      className="hover-bg"
                      style={{ borderBottom: '1px solid var(--color-border-light)' }}
                    >
                      <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        {rowIndex}
                      </td>
                      <td
                        style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text)', cursor: 'pointer' }}
                        onClick={() =>
                          openDrilldownModal({
                            type: 'all',
                            title: `Danh sách Lead nguồn: ${src.source}`,
                            source: src.source
                          })
                        }
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              background: srcColor,
                              color: '#ffffff',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              flexShrink: 0,
                              boxShadow: '0 2px 4px rgba(0,0,0,0.08)'
                            }}
                          >
                            {src.source.substring(0, 2).toUpperCase()}
                          </span>
                          <span>{src.source}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <button
                            onClick={() =>
                              openDrilldownModal({
                                type: 'all',
                                title: `Danh sách Lead nguồn: ${src.source}`,
                                source: src.source
                              })
                            }
                            style={{
                              border: '1px solid var(--color-border-light)',
                              background: 'var(--color-surface)',
                              padding: '3px 10px',
                              borderRadius: 8,
                              fontWeight: 800,
                              fontSize: '0.8125rem',
                              color: 'var(--color-text)',
                              cursor: 'pointer'
                            }}
                          >
                            {src.total_leads}
                          </button>
                          {Number(src.prior_closed_leads || 0) > 0 && (
                            <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                              {src.new_leads || 0} mới • {src.prior_closed_leads} kỳ trước chốt
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div
                          onClick={() =>
                            openDrilldownModal({
                              type: 'contacted',
                              title: `Lead Đã tương tác — Nguồn: ${src.source}`,
                              source: src.source
                            })
                          }
                          style={{ cursor: 'pointer' }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{src.contacted_leads} lead</span>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                              {displayConnRate}%
                            </span>
                          </div>
                          <div style={{ width: '100%', height: 6, background: 'var(--color-bg)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, displayConnRate)}%`, height: '100%', background: connColor, borderRadius: 4 }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        {src.uncontacted_leads > 0 ? (
                          <button
                            onClick={() =>
                              openDrilldownModal({
                                type: 'uncontacted',
                                title: `Lead Chưa tương tác — Nguồn: ${src.source}`,
                                source: src.source
                              })
                            }
                            style={{
                              border: '1px solid rgba(239, 68, 68, 0.25)',
                              background: 'rgba(239, 68, 68, 0.08)',
                              color: 'var(--color-danger)',
                              padding: '3px 9px',
                              borderRadius: 8,
                              fontWeight: 700,
                              fontSize: '0.75rem',
                              cursor: 'pointer'
                            }}
                          >
                            {src.uncontacted_leads} chưa tương tác
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>0</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() =>
                            openDrilldownModal({
                              type: 'qualified_all',
                              title: `Lead Qualified — Nguồn: ${src.source}`,
                              source: src.source
                            })
                          }
                          style={{
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-bg-secondary)',
                            padding: '3px 9px',
                            borderRadius: 8,
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            color: 'var(--color-text)',
                            cursor: 'pointer'
                          }}
                        >
                          {src.qualified_leads} • {src.qualified_rate}%
                        </button>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: src.won_count > 0 ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                        {src.won_count > 0 ? `${src.won_count} đơn` : '0'}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: src.won_value > 0 ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                        {formatVND(src.won_value)}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: srcApproved > 0 ? '#BD1D2D' : 'var(--color-text-muted)' }}>
                          {formatVND(srcApproved)}
                        </div>
                        {srcPending > 0 && (
                          <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 1 }}>
                            Còn thu: {formatVND(srcPending)}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {sources.length > SECTION_PAGE_SIZE && (
          <Pagination
            total={sources.length}
            page={sourcePage}
            pageSize={SECTION_PAGE_SIZE}
            onChange={(p) => setSourcePage(p)}
          />
        )}
      </div>

      {/* SECTION 4 (FULL WIDTH): CHI TIẾT ĐƠN HÀNG & DOANH SỐ SALE THU VỀ TRONG KỲ */}
      <div
        id="sales-orders-revenue-section"
        className="card dom-cv-card"
        style={{
          padding: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          width: '100%',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>
              Chi tiết đơn hàng &amp; doanh thu dự kiến / thực thu
            </h3>
            <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              Doanh thu dự kiến: <strong style={{ color: 'var(--color-text)' }}>{formatVND(summary.won_value)}</strong> • Thực thu (đã duyệt):{' '}
              <strong style={{ color: 'var(--dom-emerald-text, #047857)' }}>{formatVND(summary.approved_value || 0)}</strong> • Còn phải thu:{' '}
              <strong style={{ color: 'var(--color-text-secondary)' }}>{formatVND(summary.pending_value || 0)}</strong>
            </p>
          </div>

            <DomToolbarButton
              variant="outline"
              icon={<ArrowUpRight size={13} />}
              onClick={() => navigate('/sales-orders')}
              style={{ height: '32px', padding: '0 12px', fontSize: '0.75rem' }}
            >
              Mở Quản lý Đơn hàng
            </DomToolbarButton>
        </div>

        {recentOrders.length === 0 ? (
          <DomEmptyChartState
            icon={<DollarSign size={20} />}
            title="Chưa có đơn hàng phát sinh trong khoảng thời gian này"
            minHeight={130}
          />
        ) : (
          <>
            <div className="table-wrap" style={{ overflowX: 'auto', border: '1px solid var(--color-border-light)', borderRadius: '12px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border-light)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Mã Đơn</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Khách Hàng / Học Viên</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Chương Trình</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Nguồn</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Sale Phụ Trách</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Doanh Thu Dự Kiến</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Thực Thu</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center' }}>Trạng Thái</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ngày Tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOrders.map((ord) => {
                    const isApproved = ['approved', 'completed', 'paid', 'confirmed'].includes((ord.status || '').toLowerCase());
                    const expectedVal = Number(ord.value || 0);
                    const collectedVal = ord.collected_value !== undefined ? Number(ord.collected_value) : (isApproved ? expectedVal : 0);
                    const uncollectedVal = ord.uncollected_value !== undefined ? Number(ord.uncollected_value) : Math.max(0, expectedVal - collectedVal);
                    return (
                      <tr
                        key={ord.id}
                        className="hover-bg"
                        onClick={() => {
                          if (ord.contact_id) {
                            setDrawerContact({ id: ord.contact_id, full_name: ord.customer_name, phone: ord.phone });
                          } else {
                            navigate(`/sales-orders?open_id=${ord.id}`);
                          }
                        }}
                        style={{ borderBottom: '1px solid var(--color-border-light)', cursor: 'pointer' }}
                      >
                        <td style={{ padding: '9px 12px', fontWeight: 800, color: 'var(--color-primary)' }}>
                          #SO-{ord.id}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <Avatar name={ord.customer_name || 'KH'} size={30} />
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>{ord.customer_name}</div>
                              {ord.phone && <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{ord.phone}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--color-text)' }}>
                          {ord.program || '—'}
                        </td>
                        <td style={{ padding: '9px 12px', color: 'var(--color-text-muted)' }}>
                          {ord.source || 'Chưa phân loại'}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={ord.sale_name || 'Sale'} src={ord.sale_avatar || undefined} size={26} />
                            <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{ord.sale_name || '—'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--color-text)' }}>
                          {formatVND(expectedVal)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: collectedVal > 0 ? '#BD1D2D' : 'var(--color-text-muted)' }}>
                            {formatVND(collectedVal)}
                          </div>
                          {uncollectedVal > 0 && (
                            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', marginTop: 1 }}>
                              Còn thu: {formatVND(uncollectedVal)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <span
                            className="badge"
                            style={{
                              background: isApproved ? 'rgba(189, 29, 45, 0.08)' : '#f1f5f9',
                              color: isApproved ? '#BD1D2D' : 'var(--color-text-secondary)',
                              border: '1px solid var(--color-border)'
                            }}
                          >
                            {isApproved ? 'Đã duyệt' : 'Chờ duyệt'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {formatDateShort(ord.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {recentOrders.length > SECTION_PAGE_SIZE && (
              <Pagination
                total={recentOrders.length}
                page={ordersPage}
                pageSize={SECTION_PAGE_SIZE}
                onChange={(p) => setOrdersPage(p)}
              />
            )}
          </>
        )}
      </div>

      {/* IN-PLACE DRILL-DOWN MODAL (20 ITEMS / PAGE WITH COLORED AVATARS & STICKY PAGINATION) */}
      <CustomModal
        isOpen={drillModal.isOpen}
        onClose={() => setDrillModal((prev) => ({ ...prev, isOpen: false }))}
        title={`${drillModal.title} • ${drillTotal} lead`}
        width="1140px"
        zIndex={2147483610}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Modal Toolbar: Explicit Segmented Pill Switcher + Search + Sale/Source Filters */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.625rem' }}>
            {isMobile ? (
              <div style={{ flex: '1 1 100%' }}>
                <select
                  value={drillModal.type}
                  onChange={(e) => {
                    const nextType = e.target.value as DrilldownType;
                    const tabMap: Record<string, string> = {
                      all: 'Tất cả Lead',
                      uncontacted: 'Chưa tương tác',
                      unconnected: 'Chưa Connect',
                      contacted: 'Đã tương tác',
                      qualified: 'Lead Qualified',
                      win: 'Win',
                      duplicate_profile: `Trùng hồ sơ (${summary.duplicate_profile_count ?? 0})`,
                      reminder: `Nhắc lại (${summary.reminder_count ?? 0})`
                    };
                    setDrillPage(1);
                    const next: DrilldownModalState = {
                      ...drillModal,
                      type: nextType,
                      stageId: 0,
                      title: tabMap[nextType] || drillModal.title
                    };
                    setDrillModal(next);
                    const localRes = resolveFromLocalPool(next, 1, drillSearch);
                    if (localRes) {
                      setDrillItems(localRes.items);
                      setDrillTotal(localRes.total);
                      setDrillLoading(false);
                    }
                  }}
                  style={{
                    width: '100%',
                    height: 34,
                    padding: '0 10px',
                    borderRadius: 8,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-secondary)',
                    color: '#BD1D2D',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    outline: 'none'
                  }}
                >
                  <option value="all">Nhóm: Tất cả Lead</option>
                  <option value="uncontacted">Nhóm: Chưa tương tác</option>
                  <option value="unconnected">Nhóm: Chưa Connect (1–2)</option>
                  <option value="contacted">Nhóm: Đã tương tác</option>
                  <option value="qualified">Nhóm: Lead Qualified (3–12)</option>
                  <option value="win">Nhóm: Win (13–14)</option>
                  <option value="duplicate_profile">Nhóm: Trùng hồ sơ ({summary.duplicate_profile_count ?? 0})</option>
                  <option value="reminder">Nhóm: Nhắc lại ({summary.reminder_count ?? 0})</option>
                </select>
              </div>
            ) : (
              <DomSegmentedSwitch<DrilldownType>
                size="sm"
                ariaLabel="Lọc nhanh nhóm Lead"
                value={drillModal.type}
                onChange={(nextType) => {
                  const labels: Record<string, string> = {
                    all: 'Tất cả Lead',
                    uncontacted: 'Chưa tương tác',
                    unconnected: 'Chưa Connect',
                    contacted: 'Đã tương tác',
                    qualified: 'Lead Qualified',
                    win: 'Win',
                    duplicate_profile: `Trùng hồ sơ (${summary.duplicate_profile_count ?? 0})`,
                    reminder: `Nhắc lại (${summary.reminder_count ?? 0})`
                  };
                  setDrillPage(1);
                  const next: DrilldownModalState = {
                    ...drillModal,
                    type: nextType,
                    stageId: 0,
                    title: labels[nextType] || 'Danh sách Lead'
                  };
                  setDrillModal(next);
                  const localRes = resolveFromLocalPool(next, 1, drillSearch);
                  if (localRes) {
                    setDrillItems(localRes.items);
                    setDrillTotal(localRes.total);
                    setDrillLoading(false);
                  }
                }}
                options={[
                  { value: 'all', label: 'Tất cả Lead' },
                  { value: 'uncontacted', label: 'Chưa tương tác' },
                  { value: 'unconnected', label: 'Chưa Connect' },
                  { value: 'contacted', label: 'Đã tương tác' },
                  { value: 'qualified', label: 'Lead Qualified' },
                  { value: 'win', label: 'Win' },
                  { value: 'duplicate_profile', label: `Trùng hồ sơ (${summary.duplicate_profile_count ?? 0})` },
                  { value: 'reminder', label: `Nhắc lại (${summary.reminder_count ?? 0})` }
                ]}
              />
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '0 10px',
                  height: 32,
                  minWidth: isMobile ? '100%' : '215px',
                  flex: isMobile ? '1 1 100%' : undefined,
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)'
                }}
              >
                <Search size={14} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Tìm tên, SĐT, chương trình..."
                  value={drillSearchInput}
                  onChange={(e) => {
                    setDrillPage(1);
                    setDrillSearchInput(e.target.value);
                  }}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    width: '100%',
                    height: '100%',
                    fontSize: '0.78rem',
                    color: 'var(--color-text)',
                    padding: 0
                  }}
                />
              </div>

              <div style={{ minWidth: isMobile ? '130px' : '185px', flex: isMobile ? '1 1 45%' : undefined }}>
                <CustomSelect
                  options={consultantOptions}
                  value={drillModal.consultantId}
                  onChange={(val) => {
                    setDrillPage(1);
                    const next: DrilldownModalState = { ...drillModal, consultantId: Number(val) };
                    setDrillModal(next);
                    const localRes = resolveFromLocalPool(next, 1, drillSearch);
                    if (localRes) {
                      setDrillItems(localRes.items);
                      setDrillTotal(localRes.total);
                      setDrillLoading(false);
                    }
                  }}
                  showAvatars
                  searchable
                  size="sm"
                  width="100%"
                />
              </div>

              <div style={{ minWidth: isMobile ? '130px' : '170px', flex: isMobile ? '1 1 45%' : undefined }}>
                <CustomSelect
                  options={sourceOptions}
                  value={drillModal.source}
                  onChange={(val) => {
                    setDrillPage(1);
                    const next: DrilldownModalState = { ...drillModal, source: String(val) };
                    setDrillModal(next);
                    const localRes = resolveFromLocalPool(next, 1, drillSearch);
                    if (localRes) {
                      setDrillItems(localRes.items);
                      setDrillTotal(localRes.total);
                      setDrillLoading(false);
                    }
                  }}
                  searchable
                  size="sm"
                  width="100%"
                />
              </div>
            </div>
          </div>

          {/* Scrollable Paginated Table (20 rows / page) with Sticky Header */}
          {drillLoading ? (
            <TableSkeleton rows={6} cols={7} />
          ) : drillItems.length === 0 ? (
            <div
              style={{
                padding: '3rem 1.5rem',
                textAlign: 'center',
                color: 'var(--color-text-muted)',
                background: 'var(--color-bg)',
                borderRadius: '12px',
                border: '1px dashed var(--color-border-light)'
              }}
            >
              Không có khách hàng nào trong danh sách này.
            </div>
          ) : (
            <div
              className="table-wrap"
              style={{
                maxHeight: '54vh',
                overflowY: 'auto',
                overflowX: 'auto',
                border: '1px solid var(--color-border-light)',
                borderRadius: '12px'
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 5 }}>
                  <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border-light)' }}>
                    <th style={{ padding: '10px 12px', textAlign: 'center', width: 46 }}>STT</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Khách Hàng</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Chương Trình &amp; Nguồn</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Giai Đoạn</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left' }}>Sale Phụ Trách</th>
                    <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: 210 }}>Trạng Thái Tương Tác</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Ngày Tạo</th>
                    <th style={{ padding: '10px 12px', textAlign: 'center', width: 78 }}>Hồ Sơ</th>
                  </tr>
                </thead>
                <tbody>
                  {drillItems.map((item, idx) => {
                    const rowNum = (drillPage - 1) * DRILLDOWN_PAGE_SIZE + idx + 1;
                    const isUncontacted = Number(item.is_uncontacted || 0) === 1;
                    const rawLastText = String(item.latest_interaction || item.latest_manual_note || item.notes || '').trim();
                    const lastText = extractCleanCardDescription(rawLastText)
                      .replace(/\s*\n?\(?Giai đoạn:.*$/si, '')
                      .trim();
                    return (
                      <tr
                        key={`${item.id}-${idx}`}
                        className="hover-bg"
                        onClick={() => setDrawerContact({ ...item, id: item.contact_id || item.id })}
                        style={{ borderBottom: '1px solid var(--color-border-light)', cursor: 'pointer' }}
                      >
                        <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          {rowNum}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={item.full_name || 'KH'} size={34} />
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.full_name || 'Khách hàng'}
                              </div>
                              <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.phone || '—'} {item.email ? `• ${item.email}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{item.program || '—'}</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                            Nguồn: {item.source || 'Chưa phân loại'}
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '3px 9px',
                              borderRadius: 999,
                              fontSize: '0.72rem',
                              fontWeight: 650,
                              background: 'var(--color-bg-secondary)',
                              border: '1px solid var(--color-border)',
                              color: 'var(--color-text-secondary)',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            {item.stage_name || '01 – New Lead'}
                          </span>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Avatar name={item.owner_name || 'Sale'} src={item.owner_avatar || undefined} size={26} />
                            <span style={{ fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>{item.owner_name || '—'}</span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          {isUncontacted ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 5,
                                  color: 'var(--color-danger)',
                                  fontWeight: 700,
                                  fontSize: '0.75rem'
                                }}
                              >
                                <Clock size={12} />
                                {formatUncontactedDuration(item.hours_since_created)}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                Chưa gọi &amp; chưa có ghi chú tư vấn
                              </span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 250 }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {lastText || 'Đã cập nhật tương tác'}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                Liên hệ cuối: {formatDateTimeVN(item.latest_interaction_at || item.last_contact)}
                              </span>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'right', fontSize: '0.74rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                          {formatDateTimeVN(item.created_at)}
                        </td>
                        <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                          <DomToolbarButton
                            variant="outline"
                            icon={<Eye size={12} />}
                            onClick={(e) => {
                              e.stopPropagation();
                              setDrawerContact({ ...item, id: item.contact_id || item.id });
                            }}
                            style={{ height: '28px', padding: '0 10px', fontSize: '0.72rem' }}
                          >
                            Mở
                          </DomToolbarButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Always-Visible 20/page Pagination Footer */}
          <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '0.25rem' }}>
            <Pagination
              total={drillTotal}
              page={drillPage}
              pageSize={DRILLDOWN_PAGE_SIZE}
              onChange={(p) => setDrillPage(p)}
            />
          </div>
        </div>
      </CustomModal>

      {/* TVV Monthly Revenue Target Configuration Modal */}
      <SalesTargetModal
        isOpen={targetModalOpen}
        onClose={() => {
          setTargetModalOpen(false);
          setTargetFocusUserId(null);
        }}
        initialMonth={summary.target_month || data?.month}
        focusUserId={targetFocusUserId}
        onSaved={() => {
          deckCache.clear();
          drillCacheRef.current.clear();
          fetchPerformance(activeDateFilter, selectedConsultantId, funnelConsultantId, selectedSource, true);
        }}
      />

      {/* 360° Customer Profile Drawer opened directly on top of the Modal / Deck */}
      {drawerContact && (
        <Suspense fallback={null}>
          <CustomerProfileDrawer
            isOpen={!!drawerContact}
            contact={drawerContact}
            onClose={() => {
              setDrawerContact(null);
              deckCache.clear();
              drillCacheRef.current.clear();
              fetchPerformance(
                activeDateFilter,
                selectedConsultantId,
                funnelConsultantId,
                selectedSource,
                true,
                customFrom,
                customTo,
                dateField
              );
              if (drillModal.isOpen) {
                fetchDrilldownList(drillModal, drillPage, drillSearch, true);
              }
            }}
            onUpdate={(updated) => {
              if (updated) {
                setDrawerContact(updated);
              }
              deckCache.clear();
              drillCacheRef.current.clear();
              fetchPerformance(
                activeDateFilter,
                selectedConsultantId,
                funnelConsultantId,
                selectedSource,
                true,
                customFrom,
                customTo,
                dateField
              );
              if (drillModal.isOpen) {
                fetchDrilldownList(drillModal, drillPage, drillSearch, true);
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
};

export default SalesLeadPerformanceDeck;
