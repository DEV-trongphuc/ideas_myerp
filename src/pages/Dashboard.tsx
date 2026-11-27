import React, { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Users, AlertTriangle, RefreshCw,
  GitBranch, UserPlus, Zap, Calendar, BarChart2, Scale,
  FileSpreadsheet, MessageCircle, Database, Server, ExternalLink, Clock, CheckCircle, Cpu,
  ShieldAlert, Filter, Ticket as TicketIcon,
  FileText, CheckSquare, AlertCircle, CheckCircle2, Settings, DollarSign, Send, CreditCard, TrendingUp, Receipt, Award, Flame, ArrowRight,
  Package,
  Tag,
  XCircle,
  Eye,
  Briefcase,
  Home,
  Coffee,
  Truck,
  GraduationCap,
  Layers,
  ChevronDown
} from 'lucide-react';
import {
  Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ComposedChart,
  PieChart, Pie, Cell, BarChart, LabelList, Line, Legend, Area
} from 'recharts';
import { CustomSelect } from '../components/ui/CustomSelect';
import { CustomModal } from '../components/ui/CustomModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { withRouterFreezer } from '../components/RouterFreezer';
import { fetchAPI, getDefaultDateFilter } from '../utils/api';
import api from '../api/axios';
import { useLanguage } from '../contexts/LanguageContext';
import { getCachedTenantBootstrap } from '../contexts/TenantConfigContext';

import { VietnameseDateInput } from '../components/ui/VietnameseDateInput';
import toast from 'react-hot-toast';
import { KpiCardSkeleton, Skeleton, ChartSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import { getLocalDateStr } from '../utils/dateUtils';

import { Avatar } from '../components/ui/Avatar';
import { Pagination } from '../components/ui/Pagination';
import { useAuth } from '../contexts/AuthContext';
import { useTabActive } from '../contexts/TabActiveContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { pushOverlay } from '../utils/overlayStack';
import { getUserJobTitle, getUserDisplayRoleOrTitle, isManagement, isExecutive, isAccountant, isHR, isMarketing } from '../utils/roleUtils';
import {
  DomKpiTile,
  DomPanelCard,
  DomChartTooltip,
  DomDashboardToolbar,
  DomToolbarButton,
  DomSegmentedSwitch,
  DomDateRangePill,
  DomHeatmapGrid,
  DomRankBarRow,
  DomEmptyChartState,
  MYERP_CHART_PALETTE,
  formatDomNumber,
} from '../components/Dashboard/DomationDashboardKit';

const WarRoomFlightDeck = React.lazy(() =>
  import('../components/Dashboard/WarRoomFlightDeck').then((m) => ({ default: m.WarRoomFlightDeck }))
);
const SalesLeadPerformanceDeck = React.lazy(() =>
  import('../components/Dashboard/SalesLeadPerformanceDeck').then((m) => ({
    default: m.SalesLeadPerformanceDeck,
  }))
);
const CustomerPersonaOverviewDeck = React.lazy(() =>
  import('../components/Dashboard/CustomerPersonaOverviewDeck').then((m) => ({
    default: m.CustomerPersonaOverviewDeck,
  }))
);

const ExpenseQuickViewDrawer = React.lazy(() => import('../components/ExpenseQuickViewDrawer').then(m => ({ default: m.ExpenseQuickViewDrawer })));
const DepositDetailDrawer = React.lazy(() => import('../components/DepositDetailDrawer').then(m => ({ default: m.DepositDetailDrawer })));
const CustomerProfileDrawer = React.lazy(() => import('./CustomerProfileDrawer').then(m => ({ default: m.CustomerProfileDrawer })));
const MetaAdsAttributionDeck = React.lazy<React.ComponentType<any>>(() =>
  import('../components/Dashboard/MetaAdsAttributionDeck')
    .then((m: any) => ({ default: m.MetaAdsAttributionDeck || m.default }))
    .catch(() => ({
      default: (_props?: any) => (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
          Đang tải báo cáo Meta Ads Attribution...
        </div>
      )
    }))
);

const ensureArray = <T,>(val: unknown): T[] => (Array.isArray(val) ? (val as T[]) : []);

const parseDeltaPct = (raw?: string | number | null): number | null => {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = parseFloat(String(raw).replace(/[^0-9.\-+]/g, ''));
  return Number.isFinite(num) ? num : null;
};

const formatCurrencyVnd = (n: any) => {
  const num = Math.round(Number(n || 0));
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
};

const formatCompactNumber = (val: number) => {
  if (val >= 1000000) {
    return (val / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
  }
  if (val >= 10000) {
    return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return Number(val || 0).toLocaleString();
};

const parseServerDate = (dateStr: string) => {
  if (!dateStr) return new Date();
  const trimmed = dateStr.trim();
  if (trimmed.includes('T') || trimmed.includes('+') || trimmed.includes('Z')) {
    return new Date(trimmed);
  }
  const isoStr = trimmed.replace(' ', 'T') + '+07:00';
  return new Date(isoStr);
};

const EXECUTIVE_PALETTE = MYERP_CHART_PALETTE;

interface DashboardMainCacheEntry {
  stats: any;
  recentLogs: any[];
  settings: any;
  connections: any[];
  timestamp: number;
}

interface DashboardHrCacheEntry {
  hrProfiles: any[];
  hrLeaves: any[];
  hrAdvances: any[];
  hrTeams: any[];
  hrTodayCheckIns: any[];
  hrWeeklyCheckIns: any[];
  hrMonthCheckIns: any[];
  hrShifts: any[];
  hrDashboardPayslips: any[];
  timestamp: number;
}

const deckCache = new Map<string, DashboardMainCacheEntry>();
const hrDashboardCache = new Map<string, DashboardHrCacheEntry>();
let financeDashboardCache: { poList: any[]; soList: any[]; usersList: any[]; timestamp: number } | null = null;
const SWR_TTL_MS = 45_000;

/* ── Memoized Dashboard Widgets (Render Isolation & Content-Visibility) ────── */

interface LeadTrafficTrendCardProps {
  chartData: any[];
  displayChartMode: 'day' | 'hour' | 'heatmap';
  chartMode: 'day' | 'hour' | 'heatmap';
  setChartMode: (mode: 'day' | 'hour' | 'heatmap') => void;
  isSingleDay: boolean;
  isMobile: boolean;
  dateFilterLabel: string;
  isCustomDate: boolean;
  daysOfWeek: string[];
  daysOfWeekShort: string[];
  t: (k: string) => string;
}

const LeadTrafficTrendCard = React.memo<LeadTrafficTrendCardProps>(({
  chartData,
  displayChartMode,
  setChartMode,
  isSingleDay,
  isMobile,
  dateFilterLabel,
  isCustomDate,
  daysOfWeek,
  daysOfWeekShort,
  t,
}) => {
  const safeChartData = ensureArray<any>(chartData);

  const heatmapRows = useMemo(
    () => daysOfWeekShort.map((shortLabel, idx) => ({ key: idx, label: shortLabel })),
    [daysOfWeekShort]
  );

  const heatmapCols = useMemo(
    () => Array.from({ length: 24 }, (_, h) => ({ key: h, label: h % 2 === 0 ? `${String(h).padStart(2, '0')}h` : '' })),
    []
  );

  const heatmapCells = useMemo(
    () =>
      safeChartData
        .filter((item: any) => item && typeof item.wday === 'number' && typeof item.hour === 'number')
        .map((item: any) => {
          const wday = Number(item.wday);
          const hour = Number(item.hour);
          const vol = Number(item.volume || 0);
          return {
            row: wday,
            col: hour,
            value: vol,
            tooltip: `${daysOfWeek[wday] || ''} • ${String(hour).padStart(2, '0')}:00: ${formatDomNumber(vol)} lead`,
          };
        }),
    [safeChartData, daysOfWeek]
  );

  return (
    <DomPanelCard
      title={
        displayChartMode === 'heatmap'
          ? t('Bản đồ mật độ Lead theo ngày và giờ')
          : `${t('Hiệu suất xử lý Data theo')} ${displayChartMode === 'hour' ? t('giờ') : t('ngày')}`
      }
      subtitle={`${t('Biểu đồ thể hiện lưu lượng Data đổ về')} ${
        isCustomDate ? t('trong khoảng thời gian đã chọn') : `${t('trong')} ${dateFilterLabel.toLowerCase()}`
      }.`}
      rightSlot={
        !isSingleDay ? (
          <DomSegmentedSwitch<'day' | 'hour' | 'heatmap'>
            size="sm"
            value={displayChartMode}
            onChange={(next) => setChartMode(next)}
            ariaLabel={t('Chế độ hiển thị lưu lượng')}
            options={[
              { value: 'day', label: t('Theo ngày') },
              { value: 'hour', label: t('Theo giờ') },
              { value: 'heatmap', label: t('Heatmap') },
            ]}
          />
        ) : undefined
      }
    >
      {displayChartMode === 'heatmap' ? (
        <DomHeatmapGrid
          cells={heatmapCells}
          rows={heatmapRows}
          cols={heatmapCols}
          valueFormatter={(v) => `${formatDomNumber(v)} lead`}
          emptyHint={t('Chưa có dữ liệu mật độ theo giờ')}
          legendLessLabel={t('Ít')}
          legendMoreLabel={t('Nhiều')}
          showTopSlots={false}
        />
      ) : safeChartData.length > 0 ? (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={safeChartData} margin={{ left: -10, right: 5, top: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: '#64748B' }}
              axisLine={false}
              tickLine={false}
              interval={isMobile ? 'preserveStartEnd' : 'preserveEnd'}
            />
            <YAxis
              domain={[0, (max) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
              tick={{ fontSize: 11, fill: '#64748B' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              cursor={false}
              content={<DomChartTooltip valueFormatter={(v) => `${formatDomNumber(v)} lead`} />}
            />
            <Bar dataKey="volume" name={t('Lưu lượng Data')} fill="#2563EB" fillOpacity={0.9} radius={[5, 5, 0, 0]} maxBarSize={22}>
              <LabelList
                dataKey="volume"
                position="top"
                style={{ fill: 'var(--color-text)', fontSize: '11px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                offset={6}
              />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <DomEmptyChartState title={t('Chưa có dữ liệu thống kê')} minHeight={260} />
      )}
    </DomPanelCard>
  );
});

interface TopConsultantsCardProps {
  consultants: any[];
  onSelectConsultant: (consultant: any) => void;
  t: (k: string) => string;
}

const TopConsultantsCard = React.memo<TopConsultantsCardProps>(({
  consultants,
  onSelectConsultant,
  t,
}) => {
  const safeConsultants = ensureArray<any>(consultants).slice(0, 20);

  return (
    <DomPanelCard
      title={t('Top Tư vấn viên nhận Data')}
      deferred
      rightSlot={
        safeConsultants.length > 0 ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', padding: '3px 9px', borderRadius: '8px', fontVariantNumeric: 'tabular-nums' }}>
            {safeConsultants.length} {t('tư vấn viên')}
          </span>
        ) : undefined
      }
    >
      <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', overflowY: 'auto', maxHeight: 280, paddingRight: 4 }}>
        {safeConsultants.length > 0 ? (
          safeConsultants.map((c: any, i: number) => {
            const isPaused = c.status === 'inactive' || c.status === 'leave' || Number(c.vacation_mode) === 1;
            const pctVal = Math.min(100, Math.max(0, Number(c.percent) || 0));
            return (
              <DomRankBarRow
                key={c.id || i}
                rank={i + 1}
                icon={
                  <Avatar
                    src={c.avatar}
                    name={c.name}
                    size={28}
                    style={{
                      flexShrink: 0,
                      filter: isPaused ? 'grayscale(1)' : 'none',
                      opacity: isPaused ? 0.5 : 1,
                    }}
                  />
                }
                label={c.name || '—'}
                sublabel={
                  c.company_data !== undefined
                    ? `${c.company_data} ${t('chia')} • ${c.self_data || 0} self`
                    : undefined
                }
                value={`${formatDomNumber(c.data || 0)} ${t('lead')}`}
                badge={`${pctVal}%`}
                badgeTone={i === 0 ? 'emerald' : i < 3 ? 'blue' : 'slate'}
                percent={pctVal}
                barColor={i === 0 ? '#10B981' : i < 3 ? '#2563EB' : '#64748B'}
                onClick={() => onSelectConsultant(c)}
              />
            );
          })
        ) : (
          <DomEmptyChartState title={t('Chưa có dữ liệu thống kê')} minHeight={210} />
        )}
      </div>
    </DomPanelCard>
  );
});

interface RoundDistributionCardProps {
  roundRatio: any[];
  isMobile: boolean;
  t: (k: string) => string;
}

const RoundDistributionCard = React.memo<RoundDistributionCardProps>(({
  roundRatio,
  isMobile,
  t,
}) => {
  const safeRounds = ensureArray<any>(roundRatio);
  const totalDistributions = useMemo(
    () => safeRounds.reduce((sum: number, r: any) => sum + (Number(r?.count) || 0), 0),
    [safeRounds]
  );

  const roundSegments = useMemo(() => {
    const r = 60;
    const circumference = 2 * Math.PI * r;
    let accumulatedPct = 0;
    return safeRounds.slice(0, 8).map((item: any, idx: number) => {
      const pct = Number(item?.percent) || 0;
      const arc = (pct / 100) * circumference;
      const offset = -(accumulatedPct / 100) * circumference;
      accumulatedPct += pct;
      return {
        ...item,
        color: MYERP_CHART_PALETTE[idx % MYERP_CHART_PALETTE.length],
        pct,
        arc,
        offset,
        circumference,
        radius: r,
      };
    });
  }, [safeRounds]);

  const topRound = safeRounds[0];

  return (
    <DomPanelCard
      title={t('Tỷ lệ theo Vòng Phân Bổ')}
      deferred
      rightSlot={
        safeRounds.length > 0 ? (
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', padding: '3px 9px', borderRadius: '8px', fontVariantNumeric: 'tabular-nums' }}>
            {formatDomNumber(totalDistributions)} {t('lượt chia')}
          </span>
        ) : undefined
      }
    >
      {roundSegments.length > 0 ? (
        <div className="dom-donut-split-wrap">
          <div className="dom-donut-split">
            <div className="dom-donut-split__list custom-scrollbar" style={{ gap: '0.25rem', maxHeight: 270, overflowY: 'auto', paddingRight: 4 }}>
              {roundSegments.map((r: any, i: number) => (
                <DomRankBarRow
                  key={i}
                  label={t(r.round)}
                  value={`${formatDomNumber(r.count || 0)} ${t('lead')}`}
                  badge={`${r.pct}%`}
                  badgeTone={i === 0 ? 'blue' : i === 1 ? 'emerald' : 'slate'}
                  percent={r.pct}
                  barColor={r.color}
                />
              ))}
            </div>
            <div className="dom-donut-split__ring">
              <div style={{ position: 'relative', width: 146, height: 146, maxWidth: '100%' }}>
                <svg width="146" height="146" viewBox="0 0 164 164" style={{ transform: 'rotate(-90deg)', display: 'block', width: '100%', height: '100%' }}>
                  <circle cx="82" cy="82" r={60} fill="transparent" stroke="var(--color-border-light)" strokeWidth="18" />
                  {roundSegments.map((seg: any, idx: number) => (
                    <circle
                      key={idx}
                      cx="82"
                      cy="82"
                      r={seg.radius}
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="18"
                      strokeDasharray={`${seg.arc} ${seg.circumference}`}
                      strokeDashoffset={seg.offset}
                      style={{ transition: 'all 0.25s ease' }}
                    />
                  ))}
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none', padding: '0 12px', fontVariantNumeric: 'tabular-nums' }}>
                  <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1 }}>
                    {topRound ? `${topRound.percent}%` : '0%'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: 2, maxWidth: 88, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {topRound ? t(topRound.round) : t('Vòng')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <DomEmptyChartState title={t('Chưa có dữ liệu thống kê')} minHeight={210} />
      )}
    </DomPanelCard>
  );
});

interface LeadSourceBreakdownCardProps {
  sourceStats: any[];
  leadSourceStats: any[];
  sourceViewMode: 'connection' | 'lead';
  setSourceViewMode: (m: 'connection' | 'lead') => void;
  isMobile: boolean;
  t: (k: string) => string;
}

const LeadSourceBreakdownCard = React.memo<LeadSourceBreakdownCardProps>(({
  sourceStats,
  leadSourceStats,
  sourceViewMode,
  setSourceViewMode,
  isMobile,
  t,
}) => {
  const activeSourceData = useMemo(
    () => ensureArray<any>(sourceViewMode === 'connection' ? sourceStats : leadSourceStats),
    [sourceViewMode, sourceStats, leadSourceStats]
  );

  const sourceSegments = useMemo(() => {
    const totalVal = activeSourceData.reduce((acc: number, item: any) => acc + (Number(item?.value) || 0), 0);
    const r = 60;
    const circumference = 2 * Math.PI * r;
    let accumulatedPct = 0;
    return activeSourceData.slice(0, 8).map((entry: any, idx: number) => {
      const itemVal = Number(entry?.value) || 0;
      const pct = totalVal > 0 ? (itemVal / totalVal) * 100 : 0;
      const arc = (pct / 100) * circumference;
      const offset = -(accumulatedPct / 100) * circumference;
      accumulatedPct += pct;
      return {
        ...entry,
        color: entry?.color || MYERP_CHART_PALETTE[idx % MYERP_CHART_PALETTE.length],
        val: itemVal,
        pctNum: pct,
        pctStr: pct.toFixed(1),
        arc,
        offset,
        circumference,
        radius: r,
      };
    });
  }, [activeSourceData]);

  const topSource = sourceSegments[0];

  return (
    <DomPanelCard
      title={t('Tỷ lệ Nguồn Data')}
      deferred
      rightSlot={
        <DomSegmentedSwitch<'connection' | 'lead'>
          size="sm"
          value={sourceViewMode}
          onChange={setSourceViewMode}
          ariaLabel={t('Nguồn dữ liệu')}
          options={[
            { value: 'connection', label: t('Theo Kết nối') },
            { value: 'lead', label: t('Theo Nguồn Lead') },
          ]}
        />
      }
    >
      <div style={{ minHeight: 260, display: 'flex', alignItems: 'center' }}>
        {sourceSegments.length === 0 ? (
          <div style={{ width: '100%' }}>
            <DomEmptyChartState title={t('Chưa có dữ liệu thống kê')} minHeight={210} />
          </div>
        ) : (
          <div className="dom-donut-split-wrap">
            <div className="dom-donut-split">
              <div className="dom-donut-split__list custom-scrollbar" style={{ gap: '0.25rem', maxHeight: 260, overflowY: 'auto', paddingRight: 4 }}>
                {sourceSegments.map((entry: any, index: number) => (
                  <DomRankBarRow
                    key={index}
                    label={t(entry.name)}
                    value={formatDomNumber(entry.val)}
                    badge={`${entry.pctStr}%`}
                    badgeTone={index === 0 ? 'blue' : index === 1 ? 'emerald' : 'slate'}
                    percent={entry.pctNum}
                    barColor={entry.color}
                  />
                ))}
              </div>

              <div className="dom-donut-split__ring">
                <div style={{ position: 'relative', width: 146, height: 146, maxWidth: '100%' }}>
                  <svg width="146" height="146" viewBox="0 0 164 164" style={{ transform: 'rotate(-90deg)', display: 'block', width: '100%', height: '100%' }}>
                    <circle cx="82" cy="82" r={60} fill="transparent" stroke="var(--color-border-light)" strokeWidth="18" />
                    {sourceSegments.map((seg: any, idx: number) => (
                      <circle
                        key={idx}
                        cx="82"
                        cy="82"
                        r={seg.radius}
                        fill="transparent"
                        stroke={seg.color}
                        strokeWidth="18"
                        strokeDasharray={`${seg.arc} ${seg.circumference}`}
                        strokeDashoffset={seg.offset}
                        style={{ transition: 'all 0.25s ease' }}
                      />
                    ))}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', pointerEvents: 'none', padding: '0 12px', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1 }}>
                      {topSource ? `${topSource.pctStr}%` : '0%'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: 2, maxWidth: 88, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {topSource ? t(topSource.name) : t('Tổng')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DomPanelCard>
  );
});

interface HrExecutiveOverviewSectionProps {
  hrLoading: boolean;
  hrProfiles: any[];
  hrLeaves: any[];
  hrAdvances: any[];
  hrTeams: any[];
  hrTodayCheckIns: any[];
  hrWeeklyCheckIns: any[];
  hrMonthCheckIns: any[];
  hrShifts: any[];
  hrDashboardPayslips: any[];
  isMobile: boolean;
  user: any;
  renderAdminWelcomeBanner: () => React.ReactNode;
  renderWelcomeBannerForRole: (desc: string, issues: any[]) => React.ReactNode;
  renderHeaderForRole: (title: string, subtitle: string) => React.ReactNode;
  onNavigate: (path: string) => void;
  t: (k: string) => string;
}

const HrExecutiveOverviewSection = React.memo<HrExecutiveOverviewSectionProps>(({
  hrLoading,
  hrProfiles,
  hrLeaves,
  hrAdvances,
  hrTeams,
  hrTodayCheckIns,
  hrWeeklyCheckIns,
  hrMonthCheckIns,
  hrShifts,
  hrDashboardPayslips,
  isMobile,
  user,
  renderAdminWelcomeBanner,
  renderWelcomeBannerForRole,
  renderHeaderForRole,
  onNavigate,
  t,
}) => {
  const safeProfiles = ensureArray<any>(hrProfiles);
  const safeLeaves = ensureArray<any>(hrLeaves);
  const safeAdvances = ensureArray<any>(hrAdvances);
  const safeTeams = ensureArray<any>(hrTeams);
  const safeTodayCheckIns = ensureArray<any>(hrTodayCheckIns);
  const safeWeeklyCheckIns = ensureArray<any>(hrWeeklyCheckIns);
  const safeMonthCheckIns = ensureArray<any>(hrMonthCheckIns);
  const safeShifts = ensureArray<any>(hrShifts);
  const safePayslips = ensureArray<any>(hrDashboardPayslips);

  const isHrLoading = hrLoading || (safeProfiles.length === 0 && safeLeaves.length === 0);

  const hrProfileMap = useMemo(() => {
    const map = new Map<any, any>();
    safeProfiles.forEach((p: any) => {
      if (p.id) map.set(Number(p.id), p);
      if (p.user_id) map.set(Number(p.user_id), p);
      if (p.code) map.set(String(p.code), p);
    });
    return map;
  }, [safeProfiles]);

  const hrTopLatenessList = useMemo(() => {
    const isExcludedLateUser = (prof: any, row: any) => {
      const emailStr = String(prof?.email || row?.email || row?.user_email || '').trim().toLowerCase();
      return isExecutive(prof || row) || (getCachedTenantBootstrap()?.organization?.excluded_system_emails || []).includes(emailStr);
    };

    const map: Record<string, { id: any; name: string; avatar?: string; department?: string; count: number; value: number; grace: number; genderLabel: string }> = {};
    const checkinSource = safeMonthCheckIns.length > 0 ? safeMonthCheckIns : safeWeeklyCheckIns;
    checkinSource.forEach((c: any) => {
      const lateness = Number(c.late_minutes ?? c.lateness_minutes ?? 0);
      let actualLate = lateness;
      if (actualLate <= 0 && c.check_in_time && c.work_start_time) {
        const inStr = c.check_in_time.length > 8 ? c.check_in_time.substring(11, 16) : c.check_in_time.substring(0, 5);
        const startStr = String(c.work_start_time).substring(0, 5);
        const [ih, im] = inStr.split(':').map(Number);
        const [sh, sm] = startStr.split(':').map(Number);
        if (!isNaN(ih) && !isNaN(im) && !isNaN(sh) && !isNaN(sm)) {
          const diff = (ih * 60 + im) - (sh * 60 + sm);
          if (diff > 0) actualLate = diff;
        }
      }
      const isLate = actualLate > 0 || c.status === 'late';
      if (isLate) {
        const uid = c.user_id;
        const prof = hrProfileMap.get(Number(uid)) || hrProfileMap.get(uid);
        if (isExcludedLateUser(prof, c)) return;
        const gRaw = String(prof?.gender || c.gender || '').toLowerCase().trim();
        const isMale = gRaw === 'male' || gRaw === 'nam';
        const grace = isMale ? 30 : 60;
        const genderLabel = isMale ? 'Nam' : 'Nữ';
        if (!map[uid]) {
          map[uid] = {
            id: uid,
            name: prof?.full_name || prof?.name || c.user_name || t('Nhân viên'),
            avatar: prof?.avatar || prof?.avatar_url || c.user_avatar,
            department: prof?.department_name || prof?.department || '',
            count: 0,
            value: 0,
            grace,
            genderLabel,
          };
        }
        const addVal = actualLate > 0 ? actualLate : 15;
        map[uid].count += 1;
        map[uid].value += addVal;
      }
    });

    const list = Object.values(map).sort((a, b) => b.value - a.value || b.count - a.count);
    if (list.length > 0) {
      const maxVal = Math.max(...list.map((x) => x.value)) || 1;
      return list.map((item) => ({ ...item, percent: Math.min(100, (item.value / maxVal) * 100) })).slice(0, 10);
    }

    const fromPayslips = [...safePayslips]
      .filter((p) => {
        if (Number(p.lateness_minutes || 0) <= 0) return false;
        const prof = hrProfileMap.get(Number(p.user_id || p.employee_id || p.id));
        return !isExcludedLateUser(prof, p);
      })
      .map((p) => {
        const prof = hrProfileMap.get(Number(p.user_id || p.employee_id || p.id));
        const gRaw = String(p.gender || prof?.gender || '').toLowerCase().trim();
        const isMale = gRaw === 'male' || gRaw === 'nam';
        const grace = Number(p.late_grace_minutes) || (isMale ? 30 : 60);
        const genderLabel = isMale ? 'Nam' : 'Nữ';
        return {
          id: p.id || p.user_id,
          name: prof?.full_name || p.employee_name,
          avatar: prof?.avatar || prof?.avatar_url,
          department: prof?.department_name || prof?.department || '',
          count: Number(p.lateness_count || 1),
          value: Number(p.lateness_minutes || 0),
          grace,
          genderLabel,
        };
      });

    if (fromPayslips.length > 0) {
      fromPayslips.sort((a, b) => b.value - a.value);
      const maxVal = Math.max(...fromPayslips.map((x) => x.value)) || 1;
      return fromPayslips.map((item) => ({ ...item, percent: Math.min(100, (item.value / maxVal) * 100) })).slice(0, 10);
    }

    return [];
  }, [safePayslips, safeMonthCheckIns, safeWeeklyCheckIns, hrProfileMap, t]);

  const hrTopOTList = useMemo(() => {
    const map: Record<string, { id: any; name: string; avatar?: string; department?: string; count: number; value: number; unit: string }> = {};

    safeShifts
      .filter((s: any) => s.shift_type === 'overtime' && (Number(s.approved) === 1 || s.status === 'approved'))
      .forEach((s: any) => {
        const uid = s.user_id;
        const prof = hrProfileMap.get(Number(uid)) || hrProfileMap.get(uid);
        if (!map[uid]) {
          map[uid] = {
            id: uid,
            name: s.user_name || prof?.full_name || t('Nhân viên'),
            avatar: s.user_avatar || prof?.avatar_url || prof?.avatar,
            department: prof?.department_name || prof?.department || '',
            count: 0,
            value: 0,
            unit: t('giờ'),
          };
        }
        map[uid].count += 1;
        let shiftHours = Number(s.hours || s.total_hours || s.duration_hours || 0);
        if (shiftHours <= 0 && s.start_time && s.end_time) {
          const [sh, sm] = String(s.start_time).split(':').map(Number);
          const [eh, em] = String(s.end_time).split(':').map(Number);
          const diff = (eh * 60 + em) - (sh * 60 + sm);
          if (diff > 0) shiftHours = Math.round((diff / 60) * 10) / 10;
        }
        if (shiftHours <= 0 && s.total_days) shiftHours = Number(s.total_days) * 8;
        if (shiftHours > 0) map[uid].value = Math.round((map[uid].value + shiftHours) * 10) / 10;
      });

    safeLeaves
      .filter((l: any) => l.leave_type === 'overtime' && (Number(l.approved) === 1 || l.status === 'approved'))
      .forEach((l: any) => {
        const uid = l.user_id;
        const prof = hrProfileMap.get(Number(uid)) || hrProfileMap.get(uid);
        if (!map[uid]) {
          map[uid] = {
            id: uid,
            name: l.user_name || prof?.full_name || t('Nhân viên'),
            avatar: l.user_avatar || prof?.avatar_url || prof?.avatar,
            department: prof?.department_name || prof?.department || '',
            count: 0,
            value: 0,
            unit: t('giờ'),
          };
        }
        let hours = 0;
        if (l.total_hours && Number(l.total_hours) > 0) hours = Number(l.total_hours);
        else if (l.start_time && l.end_time) {
          const [sh, sm] = String(l.start_time).split(':').map(Number);
          const [eh, em] = String(l.end_time).split(':').map(Number);
          const diff = (eh * 60 + em) - (sh * 60 + sm);
          if (diff > 0) hours = Math.round((diff / 60) * 10) / 10;
        } else if (l.reason) {
          const m = String(l.reason).match(/(\d+(\.\d+)?)\s*giờ/i);
          if (m) hours = Number(m[1]);
        }
        if (hours <= 0 && l.total_days) hours = Number(l.total_days) * 8;
        if (hours > 0) {
          map[uid].count += 1;
          map[uid].value = Math.round((map[uid].value + hours) * 10) / 10;
        }
      });

    const shiftAndLeaveList = Object.values(map).filter((item) => item.value > 0);
    if (shiftAndLeaveList.length > 0) {
      const sorted = shiftAndLeaveList.sort((a, b) => b.value - a.value);
      const maxVal = Math.max(...sorted.map((x) => x.value)) || 1;
      return sorted.map((item) => ({ ...item, percent: Math.min(100, (item.value / maxVal) * 100) })).slice(0, 10);
    }

    const fromPayslips = [...safePayslips]
      .filter((p) => Number(p.overtime_days || 0) > 0 || Number(p.overtime_hours || 0) > 0)
      .map((p) => {
        const prof = hrProfileMap.get(Number(p.user_id || p.employee_id || p.id));
        const hours = Number(p.overtime_hours || 0) > 0
          ? Number(p.overtime_hours)
          : Math.round(Number(p.overtime_days || 0) * 8 * 10) / 10;
        return {
          id: p.id || p.user_id,
          name: prof?.full_name || p.employee_name,
          avatar: prof?.avatar || prof?.avatar_url,
          department: prof?.department_name || prof?.department || '',
          count: 1,
          value: hours,
          unit: t('giờ'),
        };
      });

    if (fromPayslips.length > 0) {
      fromPayslips.sort((a, b) => b.value - a.value);
      const maxVal = Math.max(...fromPayslips.map((x) => x.value)) || 1;
      return fromPayslips.map((item) => ({ ...item, percent: Math.min(100, (item.value / maxVal) * 100) })).slice(0, 10);
    }

    return [];
  }, [safePayslips, safeShifts, safeLeaves, hrProfileMap, t]);

  const totalHeadcount = safeProfiles.length;
  const pendingLeaves = safeLeaves.filter((l) => l.status === 'pending').length;
  const pendingAdvances = safeAdvances.filter((a) => a.status === 'pending').length;
  const totalPendingRequests = pendingLeaves + pendingAdvances;

  const { presentToday, presentPctToday, lateToday, deptData, weeklyAttendanceData } = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().substring(0, 10);
    const todayCheckIns =
      safeTodayCheckIns.length > 0
        ? safeTodayCheckIns
        : safeWeeklyCheckIns.filter((c: any) => c.check_in_date === todayStr);

    const present = new Set(todayCheckIns.map((c: any) => c.user_id)).size;
    const presentPct = totalHeadcount > 0 ? Math.min(100, Math.round((present / totalHeadcount) * 100)) : 0;
    const late = todayCheckIns.filter(
      (c: any) =>
        c.status === 'late' ||
        Number(c.lateness_minutes || 0) > 0 ||
        c.status === 'early_leave' ||
        Number(c.early_leave_minutes || 0) > 0
    ).length;

    const deptMap: Record<string, number> = {};
    safeProfiles.forEach((p) => {
      const userTeam = safeTeams.find((tm) => Number(tm.id) === Number(p.team_id));
      const dept = userTeam ? userTeam.name : t('Khác');
      deptMap[dept] = (deptMap[dept] || 0) + 1;
    });
    const nextDeptData = Object.entries(deptMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const currentDay = now.getDay();
    const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    const nextWeekly = [
      { name: t('Thứ 2'), dayOffset: 0 },
      { name: t('Thứ 3'), dayOffset: 1 },
      { name: t('Thứ 4'), dayOffset: 2 },
      { name: t('Thứ 5'), dayOffset: 3 },
      { name: t('Thứ 6'), dayOffset: 4 },
      { name: t('Thứ 7'), dayOffset: 5 },
    ].map((d) => {
      const dayDate = new Date(monday);
      dayDate.setDate(monday.getDate() + d.dayOffset);
      const dateStr = dayDate.toISOString().substring(0, 10);

      if (dateStr > todayStr) {
        return { name: d.name, rate: 0, count: 0, total: totalHeadcount, isFuture: true };
      }

      const dayCheckIns = safeWeeklyCheckIns.filter((c: any) => c.check_in_date === dateStr);
      const uniqueUsers = new Set(dayCheckIns.map((c: any) => c.user_id)).size;
      const rate = totalHeadcount > 0 ? Math.min(100, Math.round((uniqueUsers / totalHeadcount) * 100)) : 0;
      return {
        name: d.name,
        rate,
        count: uniqueUsers,
        total: totalHeadcount,
        isFuture: false,
      };
    });

    return {
      presentToday: present,
      presentPctToday: presentPct,
      lateToday: late,
      deptData: nextDeptData,
      weeklyAttendanceData: nextWeekly,
    };
  }, [safeTodayCheckIns, safeWeeklyCheckIns, safeProfiles, safeTeams, totalHeadcount, t]);

  const hrIssues: any[] = [];
  if (totalPendingRequests > 0) {
    hrIssues.push({
      icon: <ShieldAlert size={14} style={{ color: '#ff8a8a' }} />,
      text: `${totalPendingRequests} ${t('yêu cầu phê duyệt nghỉ phép & tạm ứng đang chờ duyệt.')}`,
      action: () => onNavigate('/hrm'),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {user?.role === 'admin' || user?.role === 'director' || user?.role === 'superadmin'
        ? renderAdminWelcomeBanner()
        : renderWelcomeBannerForRole(t('Chào mừng trở lại! Báo cáo nhanh nhân sự, ngày công & phê duyệt nghỉ phép.'), hrIssues)}

      {renderHeaderForRole(t('Quản lý nhân sự'), t('Tính toán công phép, khấu trừ bảo hiểm, tính thuế lũy tiến TNCN và xác thực lương online.'))}

      <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
        <DomKpiTile
          label={t('TỔNG NHÂN SỰ')}
          value={formatDomNumber(totalHeadcount)}
          icon={<Users size={16} />}
          accent="indigo"
          loading={isHrLoading}
          onClick={() => onNavigate('/hrm')}
          breakdown={
            <span style={{ fontSize: '0.73rem', color: 'var(--color-text-secondary)' }}>
              • {deptData.length} {t('phòng ban đang hoạt động')}
            </span>
          }
        />

        <DomKpiTile
          label={t('ĐI LÀM HÔM NAY')}
          value={`${formatDomNumber(presentToday)} (${presentPctToday}%)`}
          icon={<CheckCircle size={16} />}
          accent="emerald"
          loading={isHrLoading}
          onClick={() => onNavigate('/hrm')}
          breakdown={
            <span style={{ fontSize: '0.73rem', color: 'var(--color-text-secondary)' }}>
              • {t('Nhân viên đã chấm công ngày hôm nay')}
            </span>
          }
        />

        <DomKpiTile
          label={t('ĐI TRỄ / VỀ SỚM')}
          value={formatDomNumber(lateToday)}
          icon={<Clock size={16} />}
          accent="amber"
          loading={isHrLoading}
          onClick={() => onNavigate('/hrm')}
          breakdown={
            <span style={{ fontSize: '0.73rem', color: 'var(--color-text-secondary)' }}>
              • {t('Ghi nhận đi trễ hoặc về sớm hôm nay')}
            </span>
          }
        />

        <DomKpiTile
          label={t('YÊU CẦU CHỜ DUYỆT')}
          value={formatDomNumber(totalPendingRequests)}
          icon={<ShieldAlert size={16} />}
          accent="rose"
          loading={isHrLoading}
          onClick={() => onNavigate('/hrm')}
          breakdown={
            <span style={{ fontSize: '0.73rem', color: 'var(--color-text-secondary)' }}>
              • {t('Đơn xin nghỉ phép & tạm ứng chờ duyệt')}
            </span>
          }
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem' }}>
        <DomPanelCard
          title={t('Top Nhân viên Đi trễ')}
          subtitle={t('Tổng số phút đi trễ ghi nhận trong kỳ')}
          icon={<Clock size={16} />}
          iconAccent="amber"
          loading={isHrLoading}
          rightSlot={
            <span style={{ padding: '3px 9px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {hrTopLatenessList.length} {t('nhân sự')}
            </span>
          }
        >
          <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', overflowY: 'auto', maxHeight: 270, paddingRight: 4 }}>
            {hrTopLatenessList.length > 0 ? (
              hrTopLatenessList.map((item: any, i: number) => {
                const grace = item.grace || 60;
                const totalMins = Number(item.value || 0);
                const isExceeded = totalMins > grace;
                const excessMins = Math.max(0, totalMins - grace);
                const remainingGrace = Math.max(0, grace - totalMins);
                return (
                  <DomRankBarRow
                    key={item.id || i}
                    rank={i + 1}
                    icon={<Avatar src={item.avatar} name={item.name} size={28} />}
                    label={item.name}
                    sublabel={`Trễ ${item.count || 1} lần • Định mức (${item.genderLabel || 'Nữ'}): ${grace}p/tháng`}
                    value={`Tổng: ${totalMins} phút`}
                    badge={isExceeded ? `Vượt +${excessMins}p` : `Còn ${remainingGrace}p`}
                    badgeTone={isExceeded ? 'rose' : 'amber'}
                    percent={Math.max(4, item.percent)}
                    barColor={isExceeded ? '#EF4444' : '#F59E0B'}
                  />
                );
              })
            ) : (
              <DomEmptyChartState title={t('Không có nhân viên nào đi trễ trong kỳ')} minHeight={200} />
            )}
          </div>
        </DomPanelCard>

        <DomPanelCard
          title={t('Top Nhân viên tăng ca (OT)')}
          subtitle={t('Số giờ tăng ca đã được phê duyệt trong kỳ')}
          icon={<Flame size={16} />}
          iconAccent="indigo"
          loading={isHrLoading}
          rightSlot={
            <span style={{ padding: '3px 9px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
              {hrTopOTList.length} {t('nhân sự')}
            </span>
          }
        >
          <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', overflowY: 'auto', maxHeight: 270, paddingRight: 4 }}>
            {hrTopOTList.length > 0 ? (
              hrTopOTList.map((item: any, i: number) => (
                <DomRankBarRow
                  key={item.id || i}
                  rank={i + 1}
                  icon={<Avatar src={item.avatar} name={item.name} size={28} />}
                  label={item.name}
                  sublabel={`${item.department || 'Chung'} • ${item.count || 1} ca`}
                  value={`${item.value} ${item.unit || t('giờ')}`}
                  percent={Math.max(4, item.percent)}
                  barColor={i === 0 ? '#6366F1' : i < 3 ? '#2563EB' : '#0D9488'}
                />
              ))
            ) : (
              <DomEmptyChartState title={t('Chưa có nhân viên nào ghi nhận tăng ca trong kỳ.')} minHeight={200} />
            )}
          </div>
        </DomPanelCard>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '6fr 4fr', gap: '1.25rem' }}>
        <DomPanelCard
          title={t('Tỷ Lệ Chuyên Cần Trong Tuần (%)')}
          subtitle={t('Phân màu tự động: Xanh (≥ 80%), Vàng (50–79%), Đỏ (< 50%)')}
          deferred
          loading={isHrLoading}
          rightSlot={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.72rem', fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#059669' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} /> ≥80%</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#d97706' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> 50–79%</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#dc2626' }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} /> &lt;50%</span>
            </div>
          }
        >
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyAttendanceData} margin={{ left: -10, right: 5, top: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontWeight: 600, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} unit="%" />
                <Tooltip
                  content={
                    <DomChartTooltip
                      valueFormatter={(value, _name, entry) => {
                        const payload = (entry as any)?.payload;
                        if (payload?.isFuture) return t('Chưa diễn ra');
                        return `${value}% (${payload?.count || 0}/${payload?.total || 0} ${t('nhân sự')})`;
                      }}
                    />
                  }
                />
                <Bar dataKey="rate" name={t('Đi làm')} radius={[4, 4, 0, 0]} barSize={32}>
                  {weeklyAttendanceData.map((entry, idx) => {
                    const fill = entry.isFuture ? '#e2e8f0' : entry.rate >= 80 ? '#10b981' : entry.rate >= 50 ? '#f59e0b' : '#ef4444';
                    return <Cell key={`hr-att-${idx}`} fill={fill} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DomPanelCard>

        <DomPanelCard
          title={t('Cơ Cấu Nhân Sự Theo Phòng Ban')}
          subtitle={t('Phân bổ biên chế nhân sự theo đội nhóm')}
          deferred
          loading={isHrLoading}
        >
          {totalHeadcount === 0 ? (
            <DomEmptyChartState title={t('Chưa có dữ liệu')} minHeight={210} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={175}>
                <PieChart>
                  <Pie data={deptData} cx="50%" cy="50%" innerRadius={48} outerRadius={68} paddingAngle={3} dataKey="value">
                    {deptData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={MYERP_CHART_PALETTE[index % MYERP_CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${formatDomNumber(v)} nhân sự`} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 12px', width: '100%', marginTop: '12px', padding: '0 8px', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                {deptData.map((entry, index) => {
                  const pct = totalHeadcount > 0 ? Math.round((entry.value / totalHeadcount) * 100) : 0;
                  return (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '2px', background: MYERP_CHART_PALETTE[index % MYERP_CHART_PALETTE.length], flexShrink: 0 }} />
                      <span style={{ fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{entry.name}</span>
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem', fontWeight: 700, flexShrink: 0 }}>{entry.value} ({pct}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DomPanelCard>
      </div>
    </div>
  );
});

interface AccountantOrdersAndCashflowSectionProps {
  stats: any;
  loading: boolean;
  poList: any[];
  soList: any[];
  poFilter: 'all' | 'pending' | 'unpaid' | 'paid';
  setPoFilter: (f: 'all' | 'pending' | 'unpaid' | 'paid') => void;
  activeOrderType: 'so' | 'po';
  setActiveOrderType: (t: 'so' | 'po') => void;
  poPage: number;
  setPoPage: (p: number) => void;
  soPage: number;
  setSoPage: (p: number) => void;
  ORDER_PAGE_SIZE: number;
  usersList: any[];
  hrProfiles: any[];
  pendingExpensesCount: number;
  dateFilter: string;
  getComparisonLabel: (filter: string) => string;
  isMobile: boolean;
  user: any;
  renderAdminWelcomeBanner: () => React.ReactNode;
  renderWelcomeBannerForRole: (desc: string, issues: any[]) => React.ReactNode;
  renderHeaderForRole: (title: string, subtitle: string) => React.ReactNode;
  onNavigate: (path: string) => void;
  onSelectExpense: (id: number) => void;
  onSelectDeposit: (deposit: any) => void;
  t: (k: string) => string;
}

const AccountantOrdersAndCashflowSection = React.memo<AccountantOrdersAndCashflowSectionProps>(({
  stats,
  loading,
  poList,
  soList,
  poFilter,
  setPoFilter,
  activeOrderType,
  setActiveOrderType,
  poPage,
  setPoPage,
  soPage,
  setSoPage,
  ORDER_PAGE_SIZE,
  usersList,
  hrProfiles,
  pendingExpensesCount,
  dateFilter,
  getComparisonLabel,
  isMobile,
  user,
  renderAdminWelcomeBanner,
  renderWelcomeBannerForRole,
  renderHeaderForRole,
  onNavigate,
  onSelectExpense,
  onSelectDeposit,
  t,
}) => {
  const safePoList = ensureArray<any>(poList);
  const safeSoList = ensureArray<any>(soList);
  const safeUsers = ensureArray<any>(usersList);
  const safeHrProfiles = ensureArray<any>(hrProfiles);

  const usersMap = useMemo(() => {
    const map = new Map<number, any>();
    safeUsers.forEach((u) => map.set(Number(u.id), u));
    safeHrProfiles.forEach((p) => {
      if (!map.has(Number(p.id))) map.set(Number(p.id), p);
    });
    return map;
  }, [safeUsers, safeHrProfiles]);

  const acct = stats?.accountantStats || {};
  const revenue = Number(acct.revenue ?? 0);
  const approvedExpenses = Number(acct.approved_expenses ?? 0);
  const profit = acct.profit !== undefined ? Number(acct.profit) : (revenue - approvedExpenses);
  const pendingOrdersCount = Number(acct.pending_orders_count ?? 0);
  const pendingExpenses = acct.pending_expenses_count !== undefined ? Number(acct.pending_expenses_count) : pendingExpensesCount;
  const approvedExpensesCount = Number(acct.approved_expenses_count ?? 0);

  const cashFlowTrend = ensureArray<any>(acct.cash_flow_trend);
  const expenseCategories = ensureArray<{ name: string; value: number }>(acct.expense_categories);

  const actIssues: any[] = [];
  if (pendingExpenses > 0) {
    actIssues.push({
      icon: <CreditCard size={14} style={{ color: '#ef4444' }} />,
      text: `${pendingExpenses} ${t('yêu cầu thanh toán chi phí cần duyệt.')}`,
      action: () => onNavigate('/expenses?status=pending'),
    });
  }
  if (pendingOrdersCount > 0) {
    actIssues.push({
      icon: <Receipt size={14} style={{ color: '#fbbf24' }} />,
      text: `${pendingOrdersCount} ${t('đơn hàng / SO cần đối soát.')}`,
      action: () => onNavigate('/deposits'),
    });
  }

  const PO_CATEGORIES = [
    { label: 'Vận Chuyển', icon: Truck, color: '#3b82f6' },
    { label: 'Ăn uống', icon: Coffee, color: '#f59e0b' },
    { label: 'Vận hành', icon: Home, color: '#10b981' },
    { label: 'Marketing', icon: Briefcase, color: '#ef4444' },
    { label: 'Văn phòng phẩm', icon: CreditCard, color: '#BD1D2D' },
    { label: 'Nhân sự', icon: Tag, color: '#06b6d4' },
    { label: 'Khác', icon: Package, color: '#64748b' },
  ];

  const getPoCatInfo = (cat: string) => {
    let normalized = String(cat || '').trim();
    if (normalized === 'Di chuyển' || normalized === 'Vận chuyển') normalized = 'Vận Chuyển';
    if (normalized === 'Công cụ' || normalized === 'công cụ') normalized = 'Văn phòng phẩm';
    const found = PO_CATEGORIES.find((c) => c.label.toLowerCase() === normalized.toLowerCase());
    return found || { label: cat || 'Khác', icon: Package, color: '#64748b' };
  };

  const renderPoWorkflowSteps = (po: any) => {
    interface StepInfo {
      stepIndex: number;
      title: string;
      userId?: number;
      userName?: string;
      userAvatar?: string;
      status: 'approved' | 'rejected' | 'pending' | 'waiting';
    }
    const steps: StepInfo[] = [];
    const overall = String(po.status || 'pending').toLowerCase();
    const isDraft = overall === 'draft' || Boolean(po.is_draft);
    const isPaid = Boolean(po.is_refunded) || overall === 'paid' || overall === 'refunded';

    const s1 = String(po.status_level_1 || (overall === 'level1_approved' || overall === 'approved' || isPaid ? 'approved' : overall === 'rejected' ? 'rejected' : 'pending')).toLowerCase();
    const s2 = String(po.status_level_2 || 'none').toLowerCase();
    const s3 = String(po.status_level_3 || 'none').toLowerCase();

    const app1Id = Number(po.approver_id || 0);
    const u1 = app1Id ? usersMap.get(app1Id) : null;
    const app1Name = po.approver_name || u1?.full_name || u1?.name || '';
    const app1Avatar = po.approver_avatar || u1?.avatar_url || u1?.avatar;
    if (app1Id > 0 || app1Name || po.approver_id_2) {
      let stepStatus: StepInfo['status'] = 'pending';
      if (isDraft) stepStatus = 'waiting';
      else if (s1 === 'approved' || overall === 'approved' || isPaid || overall === 'level1_approved') stepStatus = 'approved';
      else if (s1 === 'rejected' || (overall === 'rejected' && s1 !== 'approved')) stepStatus = 'rejected';
      steps.push({ stepIndex: 1, title: 'Cấp 1', userId: app1Id, userName: app1Name, userAvatar: app1Avatar, status: stepStatus });
    }

    const app2Id = Number(po.approver_id_2 || 0);
    const u2 = app2Id ? usersMap.get(app2Id) : null;
    const app2Name = po.approver_name_2 || u2?.full_name || u2?.name || '';
    const app2Avatar = po.approver_avatar_2 || u2?.avatar_url || u2?.avatar;
    if (app2Id > 0 || (app2Name && app2Name.trim() !== '')) {
      let stepStatus: StepInfo['status'] = 'waiting';
      if (isDraft) stepStatus = 'waiting';
      else if (s2 === 'approved' || (overall === 'approved' && s2 !== 'rejected')) stepStatus = 'approved';
      else if (s2 === 'rejected') stepStatus = 'rejected';
      else if (s1 === 'approved' && s2 !== 'approved' && s2 !== 'rejected') stepStatus = 'pending';
      steps.push({ stepIndex: 2, title: 'Cấp 2', userId: app2Id, userName: app2Name, userAvatar: app2Avatar, status: stepStatus });
    }

    const app3Id = Number(po.approver_id_3 || 0);
    const u3 = app3Id ? usersMap.get(app3Id) : null;
    const app3Name = po.approver_name_3 || u3?.full_name || u3?.name || '';
    const app3Avatar = po.approver_avatar_3 || u3?.avatar_url || u3?.avatar;
    if (app3Id > 0 || (app3Name && app3Name.trim() !== '')) {
      let stepStatus: StepInfo['status'] = 'waiting';
      if (isDraft) stepStatus = 'waiting';
      else if (s3 === 'approved' || (overall === 'approved' && s3 !== 'rejected')) stepStatus = 'approved';
      else if (s3 === 'rejected') stepStatus = 'rejected';
      else if (s1 === 'approved' && (s2 === 'approved' || s2 === 'none') && s3 !== 'approved' && s3 !== 'rejected') stepStatus = 'pending';
      steps.push({ stepIndex: 3, title: 'Cấp 3', userId: app3Id, userName: app3Name, userAvatar: app3Avatar, status: stepStatus });
    }

    if (steps.length === 0) {
      steps.push({
        stepIndex: 1,
        title: 'Duyệt',
        userId: app1Id,
        userName: app1Name || 'Người duyệt',
        userAvatar: app1Avatar,
        status: isDraft ? 'waiting' : overall === 'approved' || isPaid ? 'approved' : overall === 'rejected' ? 'rejected' : 'pending',
      });
    }

    let relIds: number[] = [];
    const rawWatchers = po.related_user_ids || po.related_users;
    if (Array.isArray(rawWatchers)) {
      relIds = rawWatchers.map((id: any) => Number(typeof id === 'object' && id !== null ? id.id || id.user_id : id)).filter((id: number) => id > 0);
    } else if (typeof rawWatchers === 'string') {
      const trimmed = rawWatchers.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            relIds = parsed.map((id: any) => Number(typeof id === 'object' && id !== null ? id.id || id.user_id : id)).filter((id: number) => id > 0);
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
              <React.Fragment key={`po-step-${st.stepIndex}`}>
                {idx > 0 && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: '0 1px' }}>➔</span>}
                <div title={`${st.title}: ${displayName} (${statusText})`} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <div style={{ borderRadius: '50%', padding: '1.5px', border: `2px solid ${borderColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface, #ffffff)', opacity: isDraft ? 0.95 : st.status === 'waiting' ? 0.6 : 1 }}>
                    <Avatar src={avatarUrl} name={displayName} size={24} />
                  </div>
                  <div style={{ position: 'absolute', bottom: '-2px', right: '-2px', width: '12px', height: '12px', borderRadius: '50%', background: isApproved ? '#34C759' : isRejected ? '#BD1D2D' : isPending ? '#FF9500' : isDraft ? '#64748B' : '#8E8E93', border: '1.5px solid #ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ffffff', fontSize: '8px', fontWeight: 800 }}>
                    {isApproved ? '✓' : isRejected ? '✕' : isPending ? '•' : st.stepIndex}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        {relIds.length > 0 && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', marginLeft: '4px', paddingLeft: '6px', borderLeft: '1px solid var(--color-border)' }} title={`Người liên quan (${relIds.length}): ${relIds.map((id) => usersMap.get(id)?.full_name || usersMap.get(id)?.name || id).join(', ')}`}>
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', marginRight: '1px' }}><Eye size={12} /></div>
            {relIds.slice(0, 3).map((id) => {
              const relU = usersMap.get(id);
              return <Avatar key={`rel-${id}`} src={relU?.avatar_url || relU?.avatar} name={relU?.full_name || relU?.name || `ID ${id}`} size={22} />;
            })}
            {relIds.length > 3 && <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>+{relIds.length - 3}</span>}
          </div>
        )}
      </div>
    );
  };

  const renderPoStatusBadge = (po: any) => {
    const overall = String(po.status || 'pending').toLowerCase();
    const isDraft = overall === 'draft' || Boolean(po.is_draft);
    const isPaid = Boolean(po.is_refunded) || overall === 'paid' || overall === 'refunded';
    const s1 = String(po.status_level_1 || 'pending').toLowerCase();
    const s2 = String(po.status_level_2 || 'pending').toLowerCase();
    const s3 = String(po.status_level_3 || 'pending').toLowerCase();
    const hasL2 = Boolean(po.approver_id_2);
    const hasL3 = Boolean(po.approver_id_3);

    if (isDraft) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', background: 'rgba(107, 114, 128, 0.1)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}>Bản nháp</span>;
    }
    if (isPaid) {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}><CheckCircle2 size={10} /> Đã thanh toán</span>;
    }
    if (overall === 'approved') {
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', fontWeight: 700, color: '#d97706', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}><Clock size={10} /> Đã duyệt - Chưa hạch toán</span>;
    }
    if (overall === 'rejected') {
      const rejectText = s3 === 'rejected' ? 'Cấp 3 từ chối' : s2 === 'rejected' ? 'Cấp 2 từ chối' : s1 === 'rejected' ? 'Cấp 1 từ chối' : 'Từ chối';
      return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', fontWeight: 700, color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}><XCircle size={10} /> {rejectText}</span>;
    }
    let pendingText = 'Chờ duyệt';
    if (s1 === 'approved' && s2 === 'approved' && hasL3 && s3 !== 'approved') pendingText = 'Chờ Cấp 3 duyệt';
    else if (s1 === 'approved' && hasL2 && s2 !== 'approved') pendingText = 'Chờ Cấp 2 duyệt';
    else if (hasL2 && s1 !== 'approved') pendingText = 'Chờ Cấp 1 duyệt';
    return <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.68rem', fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px', width: 'fit-content' }}><Clock size={10} /> {pendingText}</span>;
  };

  const { poCounts, filteredPoList } = useMemo(() => {
    let pendingCount = 0;
    let unpaidCount = 0;
    let paidCount = 0;
    const filtered: any[] = [];
    safePoList.forEach((po) => {
      const overall = String(po.status || 'pending').toLowerCase();
      const isPaid = Boolean(po.is_refunded) || overall === 'paid' || overall === 'refunded';
      const isApproved =
        overall === 'approved' ||
        (po.status_level_1 === 'approved' &&
          (!po.approver_id_2 || po.status_level_2 === 'approved') &&
          (!po.approver_id_3 || po.status_level_3 === 'approved'));

      if (isPaid) paidCount++;
      else if (isApproved) unpaidCount++;
      else if (overall !== 'rejected' && overall !== 'cancelled' && overall !== 'draft') pendingCount++;

      if (
        poFilter === 'all' ||
        (poFilter === 'pending' && !isPaid && !isApproved && overall !== 'rejected' && overall !== 'cancelled' && overall !== 'draft') ||
        (poFilter === 'unpaid' && isApproved && !isPaid) ||
        (poFilter === 'paid' && isPaid)
      ) {
        filtered.push(po);
      }
    });
    return {
      poCounts: { all: safePoList.length, pending: pendingCount, unpaid: unpaidCount, paid: paidCount },
      filteredPoList: filtered,
    };
  }, [safePoList, poFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {user?.role === 'admin' || user?.role === 'director' || user?.role === 'superadmin'
        ? renderAdminWelcomeBanner()
        : renderWelcomeBannerForRole(t('Chào mừng trở lại! Báo cáo nhanh tài chính, doanh thu, chi phí & dòng tiền.'), actIssues)}

      {renderHeaderForRole(t('Quản lý tài chính & Kế toán'), t('Theo dõi doanh thu, chi phí, công nợ và dòng tiền doanh nghiệp.'))}

      <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
        <DomKpiTile
          label={t('DOANH THU THỰC NHẬN')}
          value={formatCurrencyVnd(revenue)}
          icon={<DollarSign size={16} />}
          accent="emerald"
          growth={parseDeltaPct(acct.revenue_change)}
          comparisonLabel={getComparisonLabel(dateFilter)}
          onClick={() => onNavigate('/deposits')}
          breakdown={
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', fontSize: '0.73rem', color: 'var(--color-text-secondary)' }}>
              <span>• Thực thu: <strong style={{ color: 'var(--color-text)' }}>{formatCurrencyVnd(revenue)}</strong></span>
              <span>• Đơn SO: <strong style={{ color: 'var(--color-text)' }}>{safeSoList.length}</strong></span>
            </div>
          }
        />

        <DomKpiTile
          label={t('LỢI NHUẬN GỘP')}
          value={formatCurrencyVnd(profit)}
          icon={<TrendingUp size={16} />}
          accent="blue"
          breakdown={
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.73rem', color: 'var(--color-text-secondary)' }}>
              <span>• Doanh thu trừ chi phí đã duyệt</span>
              <span>• Tỷ suất ước tính: <strong style={{ color: 'var(--color-text)' }}>{revenue > 0 ? Math.round((profit / revenue) * 100) : 0}%</strong></span>
            </div>
          }
        />

        <DomKpiTile
          label={t('CHI PHÍ ĐÃ DUYỆT')}
          value={formatCurrencyVnd(approvedExpenses)}
          icon={<CreditCard size={16} />}
          accent="amber"
          growth={parseDeltaPct(acct.approved_expenses_change)}
          comparisonLabel={getComparisonLabel(dateFilter)}
          onClick={() => onNavigate('/expenses')}
          breakdown={
            <span style={{ fontSize: '0.73rem', color: 'var(--color-text-secondary)' }}>
              • Khoản chi: <strong style={{ color: 'var(--color-text)' }}>{approvedExpensesCount}</strong> khoản đã duyệt
            </span>
          }
        />

        <DomKpiTile
          label={t('YÊU CẦU CHI CHỜ DUYỆT')}
          value={`${pendingExpenses} ${t('khoản')}`}
          icon={<Clock size={16} />}
          accent="rose"
          onClick={() => onNavigate('/expenses?status=pending')}
          breakdown={
            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.73rem', color: 'var(--color-text-secondary)' }}>
              <span>• Chờ xử lý: <strong style={{ color: 'var(--color-text)' }}>{pendingExpenses}</strong> khoản chi PO</span>
              <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>Bấm để mở danh sách chờ duyệt →</span>
            </div>
          }
        />
      </div>

      <DomPanelCard
        title={t('Đơn Hàng Gần Đây (PO & SO)')}
        rightSlot={
          <DomSegmentedSwitch<'po' | 'so'>
            size="sm"
            value={activeOrderType}
            onChange={setActiveOrderType}
            options={[
              { value: 'po', label: t('PO gần đây'), badge: safePoList.length },
              { value: 'so', label: t('SO gần đây'), badge: safeSoList.length },
            ]}
          />
        }
      >
        {activeOrderType === 'po' && (
          <div style={{ marginBottom: '12px' }}>
            <DomSegmentedSwitch<'all' | 'pending' | 'unpaid' | 'paid'>
              size="sm"
              value={poFilter}
              onChange={(val) => {
                setPoFilter(val);
                setPoPage(1);
              }}
              options={[
                { value: 'all', label: t('Tất cả'), badge: poCounts.all },
                { value: 'pending', label: t('Chờ duyệt'), badge: poCounts.pending },
                { value: 'unpaid', label: t('Chưa thanh toán'), badge: poCounts.unpaid },
                { value: 'paid', label: t('Đã thanh toán'), badge: poCounts.paid },
              ]}
            />
          </div>
        )}

        <div style={{ overflowX: 'auto', maxHeight: '380px', overflowY: 'auto', border: '1px solid var(--color-border-light)', borderRadius: '12px', background: 'var(--color-surface)' }} className="custom-scrollbar">
          {activeOrderType === 'so' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontWeight: 700, borderBottom: '1px solid var(--color-border-light)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <th style={{ padding: '12px' }}>{t('Mã SO / Mã cọc')}</th>
                  <th style={{ padding: '12px' }}>{t('Khách hàng')}</th>
                  <th style={{ padding: '12px' }}>{t('Chương trình')}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{t('Số tiền / Học phí')}</th>
                  <th style={{ padding: '12px' }}>{t('Sale phụ trách')}</th>
                  <th style={{ padding: '12px' }}>{t('Trạng thái')}</th>
                  <th style={{ padding: '12px' }}>{t('Ngày đặt')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td colSpan={7} style={{ padding: '12px' }}><Skeleton width="100%" height={16} /></td>
                    </tr>
                  ))
                ) : safeSoList.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('Không có đơn hàng bán nào gần đây')}</td>
                  </tr>
                ) : (
                  safeSoList.slice((soPage - 1) * ORDER_PAGE_SIZE, soPage * ORDER_PAGE_SIZE).map((so, idx) => (
                    <tr
                      key={so.id || idx}
                      onClick={() => onSelectDeposit(so)}
                      style={{ borderBottom: '1px solid var(--color-border-light)', height: '48px', cursor: 'pointer' }}
                      className="hover-bg transition-colors"
                      title={t('Bấm để xem chi tiết đơn cọc / SO')}
                    >
                      <td style={{ padding: '12px', fontWeight: 700, color: 'var(--color-primary)' }}>
                        {so.code || so.deposit_code || so.so_number || so.unit_code || `#SO-${so.id}`}
                      </td>
                      <td style={{ padding: '12px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar src={so.avatar || so.avatar_url} name={so.full_name || so.contact_name || ''} size={24} />
                          <span>{so.full_name || so.contact_name || '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>{so.project_name || '—'}</td>
                      <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700 }}>{formatCurrencyVnd(so.price || so.total || so.amount || 0)}</td>
                      <td style={{ padding: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Avatar src={so.creator_avatar || so.assigned_to_avatar} name={so.creator_name || '—'} size={24} />
                          <span>{so.creator_name || '—'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: so.status === 'approved' ? 'rgba(16, 185, 129, 0.08)' : so.status === 'cancelled' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                            color: so.status === 'approved' ? '#10b981' : so.status === 'cancelled' ? '#dc2626' : '#d97706',
                          }}
                        >
                          {so.status === 'approved' ? t('Hoàn tất cọc') : so.status === 'cancelled' ? t('Bể cọc') : so.status === 'pending_admin' ? t('Chờ duyệt') : t('Đang giao dịch')}
                        </span>
                      </td>
                      <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>
                        {so.created_at || so.order_date ? new Date(so.created_at || so.order_date).toLocaleDateString('vi-VN') : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--color-surface)', color: 'var(--color-text-muted)', fontWeight: 700, borderBottom: '1px solid var(--color-border-light)', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                  <th style={{ padding: '12px', minWidth: 260, width: '30%' }}>{t('Tên hóa đơn / Đề xuất PO')}</th>
                  <th style={{ padding: '12px' }}>{t('Người tạo')}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{t('Số tiền')}</th>
                  <th style={{ padding: '12px', minWidth: 180 }}>{t('Các bước & Người liên quan')}</th>
                  <th style={{ padding: '12px' }}>{t('Ngày tạo')}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{t('Thao tác')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td colSpan={6} style={{ padding: '12px' }}><Skeleton width="100%" height={16} /></td>
                    </tr>
                  ))
                ) : filteredPoList.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      {t('Không có Purchase Order nào phù hợp')}
                    </td>
                  </tr>
                ) : (
                  filteredPoList.slice((poPage - 1) * ORDER_PAGE_SIZE, poPage * ORDER_PAGE_SIZE).map((po, idx) => {
                    const catInfo = getPoCatInfo(po.category);
                    const CatIcon = catInfo.icon;
                    return (
                      <tr
                        key={po.id || idx}
                        onClick={() => onSelectExpense(po.id)}
                        style={{ borderBottom: '1px solid var(--color-border-light)', height: '48px', cursor: 'pointer' }}
                        className="hover-bg transition-colors"
                        title={t('Bấm để xem chi tiết Purchase Order')}
                      >
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{po.title || po.description || t('Đề nghị thanh toán')}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '1px 6px', borderRadius: '9999px', background: `${catInfo.color}15`, color: catInfo.color, fontSize: '0.7rem', fontWeight: 600 }}>
                                <CatIcon size={10} color={catInfo.color} /> {po.category || 'Khác'}
                              </span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>#EXP-{po.id}</span>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Avatar src={po.creator_avatar || po.avatar} name={po.creator_name || '—'} size={24} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>{po.creator_name || '—'}</span>
                              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                                {po.created_at ? `${new Date(po.created_at).toLocaleDateString('vi-VN')} ${new Date(po.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : po.order_date || '—'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text)' }}>
                              {po.currency && po.currency !== 'VND'
                                ? po.currency === 'USD'
                                  ? `$${Number(po.original_amount || po.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                                  : `${Number(po.original_amount || po.amount || 0).toLocaleString()} ${po.currency}`
                                : formatCurrencyVnd(po.amount || po.total || 0)}
                            </span>
                            {po.currency && po.currency !== 'VND' && Number(po.exchange_rate || 0) > 1 && (
                              <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                ≈ {formatCurrencyVnd(Number(po.original_amount || po.amount || 0) * Number(po.exchange_rate))}
                              </span>
                            )}
                            {renderPoStatusBadge(po)}
                          </div>
                        </td>
                        <td style={{ padding: '12px' }}>{renderPoWorkflowSteps(po)}</td>
                        <td style={{ padding: '12px', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                          {po.created_at ? new Date(po.created_at).toLocaleDateString('vi-VN') : po.order_date || '—'}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'right' }}>
                          <button
                            className="btn-icon sm"
                            title={t('Xem chi tiết')}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectExpense(po.id);
                            }}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-surface)', color: 'var(--color-primary)', cursor: 'pointer' }}
                          >
                            <ArrowRight size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        {activeOrderType === 'po' && filteredPoList.length > ORDER_PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', padding: '0 4px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              {t('Hiển thị')} {(poPage - 1) * ORDER_PAGE_SIZE + 1} - {Math.min(poPage * ORDER_PAGE_SIZE, filteredPoList.length)} / {filteredPoList.length} {t('đơn PO')}
            </span>
            <Pagination total={filteredPoList.length} page={poPage} pageSize={ORDER_PAGE_SIZE} onChange={(p) => setPoPage(p)} />
          </div>
        )}
        {activeOrderType === 'so' && safeSoList.length > ORDER_PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', padding: '0 4px', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
              {t('Hiển thị')} {(soPage - 1) * ORDER_PAGE_SIZE + 1} - {Math.min(soPage * ORDER_PAGE_SIZE, safeSoList.length)} / {safeSoList.length} {t('đơn SO')}
            </span>
            <Pagination total={safeSoList.length} page={soPage} pageSize={ORDER_PAGE_SIZE} onChange={(p) => setSoPage(p)} />
          </div>
        )}
      </DomPanelCard>

      <div className="responsive-grid-6-4" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '6.5fr 3.5fr', gap: '1.25rem' }}>
        <DomPanelCard title={t('Xu hướng Thu - Chi (Triệu VND)')} deferred>
          {cashFlowTrend.length === 0 ? (
            <DomEmptyChartState title={t('Chưa có dữ liệu thu - chi')} minHeight={240} />
          ) : (
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashFlowTrend} margin={{ left: -10, right: 5, top: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<DomChartTooltip valueFormatter={(val) => `${formatDomNumber(val)} tr`} />} />
                  <Bar dataKey="revenue" name={t('Thu nhập')} fill="#10B981" radius={[4, 4, 0, 0]} barSize={16} />
                  <Bar dataKey="expenses" name={t('Chi phí')} fill="#F59E0B" radius={[4, 4, 0, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DomPanelCard>

        <DomPanelCard title={t('Cơ cấu Chi phí')} deferred>
          {expenseCategories.length === 0 ? (
            <DomEmptyChartState title={t('Chưa có dữ liệu chi phí')} minHeight={240} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={expenseCategories} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={4}>
                    {expenseCategories.map((_, idx) => (
                      <Cell key={`cell-${idx}`} fill={MYERP_CHART_PALETTE[idx % MYERP_CHART_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<DomChartTooltip valueFormatter={(val) => formatCurrencyVnd(val)} />} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 12px', width: '100%', marginTop: '12px', padding: '0 12px', fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                {expenseCategories.map((entry, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: MYERP_CHART_PALETTE[index % MYERP_CHART_PALETTE.length], flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{entry.name}</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 600, flexShrink: 0 }}>({formatCompactNumber(entry.value)})</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DomPanelCard>
      </div>
    </div>
  );
});

const DashboardInner = ({ isActive }: { isActive: boolean }) => {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const isTabContextActive = useTabActive();
  const effectiveActive = isActive && isTabContextActive;
  const dashboardPollMs = Math.max(15000, Number(useTypedSubSetting('ui.shell_tabs_and_polling_ms', 'dashboard_poll_ms', 60000)) || 60000);
  const daysOfWeek = [
    t('Thứ 2'),
    t('Thứ 3'),
    t('Thứ 4'),
    t('Thứ 5'),
    t('Thứ 6'),
    t('Thứ 7'),
    t('Chủ Nhật')
  ];
  const daysOfWeekShort = [
    t('T2'),
    t('T3'),
    t('T4'),
    t('T5'),
    t('T6'),
    t('T7'),
    t('CN')
  ];
  const navigate = useNavigate();
  const initialDateFilter = localStorage.getItem('Ideas_global_date') || getDefaultDateFilter();
  const initialIsSingleDay = initialDateFilter === 'Hôm nay' || initialDateFilter === 'Hôm qua';
  const initialMainKey = `${initialDateFilter}|${initialIsSingleDay ? 'hour' : 'day'}|lead`;
  const initialCachedMain = deckCache.get(initialMainKey);

  const [stats, setStats] = useState<any>(() => initialCachedMain?.stats ?? null);
  const [recentLogs, setRecentLogs] = useState<any[]>(() => initialCachedMain?.recentLogs ?? []);
  const [loading, setLoading] = useState(() => !initialCachedMain);
  const [pendingTicketsCount, setPendingTicketsCount] = useState(0);
  const [heldLeadsCount, setHeldLeadsCount] = useState(0);
  const [pendingCheckInsCount, setPendingCheckInsCount] = useState(0);
  const [pendingCoopsCount, setPendingCoopsCount] = useState(0);
  const [pendingExpensesCount, setPendingExpensesCount] = useState(0);
  const [showWarRoom, setShowWarRoom] = useState(false);
  const [showMobileSubTabMenu, setShowMobileSubTabMenu] = useState(false);
  const mobileSubTabBtnRef = useRef<HTMLButtonElement | null>(null);
  const [mobileSubTabMenuPos, setMobileSubTabMenuPos] = useState<{ top: number; right: number }>({ top: 120, right: 12 });
  const [aiScreenerEnabled, setAiScreenerEnabled] = useState<boolean>(() => {
    const cached = localStorage.getItem('ai_screener_enabled');
    return cached === null ? true : cached === '1';
  });
  const [dateFilter, setDateFilter] = useState(() => initialDateFilter);

  const handleUpdateDateFilter = (val: string) => {
    setDateFilter(val);
    localStorage.setItem('Ideas_global_date', val);
    window.dispatchEvent(new CustomEvent('global-date-change', { detail: val }));
  };

  const [chartMode, setChartMode] = useState<'day' | 'hour' | 'heatmap'>('day');
  const [sourceViewMode, setSourceViewMode] = useState<'connection' | 'lead'>('connection');
  const [settings, setSettings] = useState<any>(() => initialCachedMain?.settings ?? null);
  const [connections, setConnections] = useState<any[]>(() => initialCachedMain?.connections ?? []);
  const [showHealthModal, setShowHealthModal] = useState(false);
  const [healthModalTab, setHealthModalTab] = useState<'stats' | 'connections'>('stats');
  const [healthChartMetric, setHealthChartMetric] = useState<'zalo' | 'email' | 'telegram' | 'token'>('zalo');
  const [modalChartLoading, setModalChartLoading] = useState(false);

  // Accountant Dashboard specific states
  const [poList, setPoList] = useState<any[]>(() => financeDashboardCache?.poList ?? []);
  const [poFilter, setPoFilter] = useState<'all' | 'pending' | 'unpaid' | 'paid'>('all');
  const [soList, setSoList] = useState<any[]>(() => financeDashboardCache?.soList ?? []);
  const [activeOrderType, setActiveOrderType] = useState<'so' | 'po'>('po');
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<any | null>(null);
  const [usersList, setUsersList] = useState<any[]>(() => financeDashboardCache?.usersList ?? []);
  const [poPage, setPoPage] = useState(1);
  const [soPage, setSoPage] = useState(1);
  const ORDER_PAGE_SIZE = 5;

  // Strict Role-Scoped Allowed Dashboard Subtabs
  const allowedSubTabKeys = useMemo(() => {
    if (isExecutive(user)) {
      return ['persona', 'leads', 'sales', 'meta_ads', 'finance', 'hrm'];
    }
    const isAcct = isAccountant(user, false);
    const isHrRole = isHR(user, false);
    const isMktRole = isMarketing(user);
    const roleStr = String(user?.role || '').toLowerCase();

    if (isAcct && isHrRole) {
      return ['finance', 'hrm', 'persona'];
    }
    if (isAcct || roleStr === 'accountant') {
      return ['finance', 'persona'];
    }
    if (isHrRole || roleStr === 'hr') {
      return ['hrm'];
    }
    if (isMktRole || roleStr === 'marketing') {
      return ['meta_ads', 'persona', 'leads', 'sales'];
    }
    if (isManagement(user) || ['manager', 'assistant', 'leader', 'sale_admin', 'saleadmin'].includes(roleStr)) {
      return ['persona', 'leads', 'sales', 'meta_ads'];
    }
    return ['persona', 'leads', 'sales'];
  }, [user]);

  // Subtab and Marketing states
  const location = useLocation();
  const [activeSubTab, setActiveSubTab] = useState<string>(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam) return tabParam;
    if (isExecutive(user)) return 'persona';
    if (isAccountant(user, false) || String(user?.role || '').toLowerCase() === 'accountant') return 'finance';
    if (isHR(user, false) || String(user?.role || '').toLowerCase() === 'hr') return 'hrm';
    if (isMarketing(user) || String(user?.role || '').toLowerCase() === 'marketing') return 'meta_ads';
    return 'persona';
  });

  useEffect(() => {
    const tabParam = new URLSearchParams(location.search).get('tab');
    if (tabParam && allowedSubTabKeys.includes(tabParam)) {
      setActiveSubTab(tabParam);
    }
  }, [location.search, allowedSubTabKeys]);
  const [personaDrawerContact, setPersonaDrawerContact] = useState<any | null>(null);
  const [campaignsList, setCampaignsList] = useState<any[]>([]);
  const [mktFilterType, setMktFilterType] = useState<'close_date' | 'lead_date'>('close_date');
  const [seedingLoading, setSeedingLoading] = useState(false);

  // Ensure activeSubTab stays inside allowedSubTabKeys when user changes
  useEffect(() => {
    if (allowedSubTabKeys.length > 0 && !allowedSubTabKeys.includes(activeSubTab)) {
      setActiveSubTab(allowedSubTabKeys[0]);
    }
  }, [allowedSubTabKeys, activeSubTab]);

  const normalizedSubTab = useMemo(() => {
    let raw = activeSubTab;
    if (raw === 'default') raw = 'leads';
    if (raw === 'sales_performance') raw = 'sales';
    if (raw === 'marketing') raw = 'meta_ads';
    if (raw === 'accountant') raw = 'finance';
    if (raw === 'hr') raw = 'hrm';
    if (allowedSubTabKeys.length > 0 && !allowedSubTabKeys.includes(raw)) {
      return allowedSubTabKeys[0];
    }
    return raw;
  }, [activeSubTab, allowedSubTabKeys]);

  const currentViewRole = useMemo(() => {
    if (normalizedSubTab === 'persona') return 'persona';
    if (normalizedSubTab === 'sales') return 'sales';
    if (normalizedSubTab === 'meta_ads') return 'meta_ads';
    if (normalizedSubTab === 'finance') return 'finance';
    if (normalizedSubTab === 'hrm') return 'hrm';
    if (normalizedSubTab === 'leads') return 'leads';
    return allowedSubTabKeys[0] || 'persona';
  }, [normalizedSubTab, allowedSubTabKeys]);

  // HR Dashboard specific states
  const initialHrMonth = new Date().toISOString().substring(0, 7);
  const initialCachedHr = hrDashboardCache.get(initialHrMonth);
  const [hrProfiles, setHrProfiles] = useState<any[]>(() => initialCachedHr?.hrProfiles ?? []);
  const [hrLeaves, setHrLeaves] = useState<any[]>(() => initialCachedHr?.hrLeaves ?? []);
  const [hrAdvances, setHrAdvances] = useState<any[]>(() => initialCachedHr?.hrAdvances ?? []);
  const [hrTeams, setHrTeams] = useState<any[]>(() => initialCachedHr?.hrTeams ?? []);
  const [hrTodayCheckIns, setHrTodayCheckIns] = useState<any[]>(() => initialCachedHr?.hrTodayCheckIns ?? []);
  const [hrWeeklyCheckIns, setHrWeeklyCheckIns] = useState<any[]>(() => initialCachedHr?.hrWeeklyCheckIns ?? []);
  const [hrMonthCheckIns, setHrMonthCheckIns] = useState<any[]>(() => initialCachedHr?.hrMonthCheckIns ?? []);
  const [hrShifts, setHrShifts] = useState<any[]>(() => initialCachedHr?.hrShifts ?? []);
  const [hrDashboardMonth, setHrDashboardMonth] = useState(initialHrMonth);
  const [hrDashboardPayslips, setHrDashboardPayslips] = useState<any[]>(() => initialCachedHr?.hrDashboardPayslips ?? []);
  const [hrLoading, setHrLoading] = useState(false);

  // AI Pre-screener variables
  const aiPassed = stats?.ai_passed_count ?? 0;
  const aiFailed = stats?.ai_failed_count ?? 0;
  const aiTotal = aiPassed + aiFailed;
  const aiPassedPercent = aiTotal > 0 ? Math.round((aiPassed / aiTotal) * 100) : 0;
  const aiFailedPercent = aiTotal > 0 ? 100 - aiPassedPercent : 0;
  const hasInitializedOrderTypeRef = useRef(false);

  const fetchStatsOnly = async (metricVal: string, modeVal: string, signal?: AbortSignal) => {
    if (loading) return; // Skip if main dashboard loading is in progress
    setModalChartLoading(true);
    try {
      const statsJson = await fetchAPI(`get_dashboard_stats&date=${encodeURIComponent(dateFilter)}&chart_mode=${modeVal}&chart_metric=${metricVal}`, { signal });
      if (signal?.aborted) return;
      if (statsJson.success) {
        setStats(statsJson.data);
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Error fetching stats only:', e);
      }
    } finally {
      if (!signal?.aborted) {
        setModalChartLoading(false);
      }
    }
  };

  const formatNumberCompact = (val: number) => {
    if (val >= 1000000) {
      return (val / 1000000).toFixed(2).replace(/\.00$/, '') + 'M';
    }
    if (val >= 10000) {
      return (val / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    }
    return val.toLocaleString();
  };

  const getCurrentDateVi = () => {
    const days = [
      t('Chủ Nhật'),
      t('Thứ Hai'),
      t('Thứ Ba'),
      t('Thứ Tư'),
      t('Thứ Năm'),
      t('Thứ Sáu'),
      t('Thứ Bảy')
    ];
    const now = new Date();
    const dayName = days[now.getDay()];
    const date = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${dayName}, ngày ${date}/${month}/${year}`;
  };

  const getMetricLabel = (metric: string) => {
    switch (metric) {
      case 'zalo':
        return t('Số tin Zalo');
      case 'email':
        return t('Số Mail');
      case 'telegram':
        return t('Số tin Telegram');
      case 'token':
        return t('Số Token AI');
      default:
        return t('Lưu lượng Lead');
    }
  };

  const getMetricColor = (_metric: string) => {
    return 'var(--color-primary)';
  };

  const isSingleDay = dateFilter === 'Hôm nay' || dateFilter === 'Hôm qua';
  const displayChartMode = isSingleDay ? 'hour' : chartMode;
  const modalChartMode = displayChartMode === 'heatmap' ? 'day' : displayChartMode;

  const [showDateModal, setShowDateModal] = useState(false);
  const [startDate, setStartDate] = useState(() => {
    const m = String(initialDateFilter || '').match(/(\d{4}-\d{2}-\d{2})\D+(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  });
  const [endDate, setEndDate] = useState(() => {
    const m = String(initialDateFilter || '').match(/(\d{4}-\d{2}-\d{2})\D+(\d{4}-\d{2}-\d{2})/);
    return m ? m[2] : '';
  });

  useEffect(() => {
    const m = String(dateFilter || '').match(/(\d{4}-\d{2}-\d{2})\D+(\d{4}-\d{2}-\d{2})/);
    if (m) {
      setStartDate((prev) => (prev === m[1] ? prev : m[1]));
      setEndDate((prev) => (prev === m[2] ? prev : m[2]));
    }
  }, [dateFilter]);

  // Consultant stats state for details modal
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  useEffect(() => {
    if (!statsModalOpen) return;
    return pushOverlay('dashboard-stats-modal', () => setStatsModalOpen(false), 2147483646);
  }, [statsModalOpen]);
  const [statsConsultant, setStatsConsultant] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState<any>(null);
  const [statsDateMode, setStatsDateMode] = useState<string>('this_month');
  const [statsStartDate, setStatsStartDate] = useState<string>('');
  const [statsEndDate, setStatsEndDate] = useState<string>('');

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    const handleThemeChange = () => {
      const nextTheme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setTheme(nextTheme);
    };
    window.addEventListener('theme-change', handleThemeChange);
    return () => window.removeEventListener('theme-change', handleThemeChange);
  }, []);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const getComparisonLabel = (filter: string) => {
    switch (filter) {
      case 'Hôm nay':
        return t('so với hôm qua');
      case 'Hôm qua':
        return t('so với ngày trước đó');
      case 'Tuần này':
        return t('so với tuần trước');
      case 'Tuần trước':
        return t('so với tuần trước nữa');
      case 'Tuần trước nữa':
        return t('so với tuần trước đó');
      case '7 ngày qua':
        return t('so với 7 ngày trước');
      case '30 ngày qua':
        return t('so với 30 ngày trước');
      case 'Tháng này':
        return t('so với tháng trước');
      case 'Tháng trước':
        return t('so với tháng trước nữa');
      default:
        if (filter.includes('đến')) {
          return t('so với kỳ trước');
        }
        return t('so với kỳ trước');
    }
  };

  const getDisplayDateFilterText = (filter: string) => {
    if (filter.includes('đến')) {
      return filter.replace(/\s*đến\s*/i, ` ${t('đến')} `);
    }
    return t(filter);
  };

  const fetchDashboard = async (signal?: AbortSignal, isSilent = false) => {
    const metric = showHealthModal ? healthChartMetric : 'lead';
    const cacheKey = `${dateFilter}|${displayChartMode}|${metric}`;
    const cached = deckCache.get(cacheKey);
    const now = Date.now();

    if (cached) {
      setStats(cached.stats);
      setRecentLogs(cached.recentLogs);
      if (cached.settings) setSettings(cached.settings);
      if (cached.connections) setConnections(cached.connections);
      setLoading(false);
      if (!isSilent && now - cached.timestamp < SWR_TTL_MS) {
        requestAnimationFrame(() => {
          setTimeout(() => {
            if (typeof (window as any).hideSplashScreen === 'function') {
              (window as any).hideSplashScreen();
            }
          }, 50);
        });
        return;
      }
    } else if (!isSilent && !stats) {
      setLoading(true);
    }

    try {
      // BUG-04 fix: Dùng Promise.all để gọi song song, tiết kiệm ~1-2s
      // BUG-06 fix: Xử lý lỗi riêng từng API, không để lỗi một cái 'nuốt' cái kia
      const [statsJson, logsJson, settingsJson, connectionsJson] = await Promise.all([
        fetchAPI(`get_dashboard_stats&date=${encodeURIComponent(dateFilter)}&chart_mode=${displayChartMode}&chart_metric=${metric}`, { signal }).catch(e => ({ success: false, message: e.message })),
        fetchAPI('get_logs&exclude_status=silent&page=1&pageSize=5', { signal }).catch(e => ({ success: false, message: e.message })),
        fetchAPI('get_settings', { signal }).catch(e => ({ success: false, message: e.message })),
        fetchAPI('get_connections', { signal }).catch(e => ({ success: false, message: e.message }))
      ]);

      // Kiểm tra xem request đã bị hủy chưa (user đổi filter trước khi response về)
      if (signal?.aborted) return;

      let nextStats = cached?.stats ?? stats;
      let nextLogs = cached?.recentLogs ?? recentLogs;
      let nextSettings = cached?.settings ?? settings;
      let nextConnections = cached?.connections ?? connections;

      if (statsJson.success) {
        nextStats = statsJson.data;
        setStats(statsJson.data);
        const isEnabled = statsJson.data.ai_screener_enabled === 1 || statsJson.data.ai_screener_enabled === '1' || statsJson.data.ai_screener_enabled === true;
        setAiScreenerEnabled(isEnabled);
        localStorage.setItem('ai_screener_enabled', isEnabled ? '1' : '0');
      } else {
        console.error('Lỗi tải thống kê:', statsJson.message);
      }

      if (logsJson.success) {
        const nonSilentLogs = Array.isArray(logsJson.data)
          ? logsJson.data.filter((log: any) => log.status !== 'silent').slice(0, 5)
          : [];
        nextLogs = nonSilentLogs;
        setRecentLogs(nonSilentLogs);
      } else {
        console.error('Lỗi tải nhật ký:', logsJson.message);
      }

      if (settingsJson.success) {
        nextSettings = settingsJson.data;
        setSettings(settingsJson.data);
      }
      if (connectionsJson.success) {
        nextConnections = connectionsJson.data || [];
        setConnections(nextConnections);
      }

      if (nextStats) {
        deckCache.set(cacheKey, {
          stats: nextStats,
          recentLogs: nextLogs,
          settings: nextSettings,
          connections: nextConnections,
          timestamp: Date.now()
        });
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Dashboard fetch error:', e);
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
      // Wait for real content DOM to paint before dismissing the splash screen
      requestAnimationFrame(() => {
        setTimeout(() => {
          if (typeof (window as any).hideSplashScreen === 'function') {
            (window as any).hideSplashScreen();
          }
        }, 100);
      });
    }
  };

  useEffect(() => {
    if (effectiveActive) {
      let abortController = new AbortController();
      fetchDashboard(abortController.signal, false);

      const intervalId = setInterval(() => {
        if (typeof document !== 'undefined' && document.hidden) return;
        abortController.abort();
        abortController = new AbortController();
        fetchDashboard(abortController.signal, true);
      }, dashboardPollMs);

      return () => {
        abortController.abort();
        clearInterval(intervalId);
      };
    }
  }, [dateFilter, effectiveActive, dashboardPollMs]);

  const fetchBadgeCounts = () => {
    fetchAPI('get_reports&status=pending&date=all&pageSize=1')
      .then(res => { if (res.success) setPendingTicketsCount(res.total_count ?? 0); })
      .catch(e => console.error(e));
      
    fetchAPI('get_held_leads&pageSize=1&date=all')
      .then(res => { if (res.success) setHeldLeadsCount(res.total_count ?? 0); })
      .catch(e => console.error(e));

    fetchAPI('check-ins&status=pending_approval')
      .then(res => { if (res.success && Array.isArray(res.data)) setPendingCheckInsCount(res.data.length); })
      .catch(e => console.error(e));

    fetchAPI('cooperation-slips')
      .then(res => {
        if (res.success && Array.isArray(res.data)) {
          const pending = res.data.filter((c: any) => c.status === 'pending_manager_approval');
          setPendingCoopsCount(pending.length);
        }
      })
      .catch(e => console.error(e));

    fetchAPI('expenses?status=pending&limit=1')
      .then(res => { if (res.success) setPendingExpensesCount(res.data?.total ?? 0); })
      .catch(e => console.error(e));

    if (currentViewRole === 'finance' || currentViewRole === 'accountant' || normalizedSubTab === 'finance' || activeSubTab === 'accountant' || user?.role === 'admin' || user?.role === 'director' || user?.role === 'superadmin' || (user?.role as string) === 'super_admin') {
      if (financeDashboardCache && Date.now() - financeDashboardCache.timestamp < SWR_TTL_MS) {
        setPoList(financeDashboardCache.poList);
        setSoList(financeDashboardCache.soList);
        setUsersList(financeDashboardCache.usersList);
      } else {
        Promise.all([
          api.get('/expenses', { params: { limit: 50 } }).catch(() => ({ data: { data: { items: [] } } })),
          fetchAPI('deposits').catch(() => ({ data: [] })),
          api.get('/users').catch(() => ({ data: { data: [] } }))
        ]).then(([expRes, soRes, usersRes]) => {
          const rawPos = expRes?.data?.data?.items || expRes?.data?.data || [];
          const pos = Array.isArray(rawPos) ? rawPos : [];
          const rawSos = soRes?.data || soRes || [];
          const sos = Array.isArray(rawSos) ? rawSos : (Array.isArray(rawSos?.orders) ? rawSos.orders : []);
          setPoList(pos);
          setSoList(sos);
          const uData = usersRes?.data?.data || usersRes?.data || [];
          const safeUsers = Array.isArray(uData) ? uData : [];
          if (Array.isArray(uData)) setUsersList(uData);
          financeDashboardCache = {
            poList: pos,
            soList: sos,
            usersList: safeUsers,
            timestamp: Date.now()
          };

          if (!hasInitializedOrderTypeRef.current) {
            hasInitializedOrderTypeRef.current = true;
            if (pos.length > 0 && sos.length > 0) {
              setActiveOrderType('po');
            } else if (pos.length > 0) {
              setActiveOrderType('po');
            } else if (sos.length > 0) {
              setActiveOrderType('so');
            } else {
              setActiveOrderType('po');
            }
          }
        }).catch(e => console.error(e));
      }
    }

    if (currentViewRole === 'marketing') {
      fetchAPI('campaigns')
        .then(res => {
          setCampaignsList(Array.isArray(res) ? res : res?.data || []);
        })
        .catch(e => console.error(e));
    }
  };

  useEffect(() => {
    if (effectiveActive) {
      fetchBadgeCounts();

      const intervalId = setInterval(() => {
        if (typeof document === 'undefined' || !document.hidden) {
          fetchBadgeCounts();
        }
      }, dashboardPollMs);
      return () => clearInterval(intervalId);
    }
  }, [effectiveActive, currentViewRole, dashboardPollMs]);

  useEffect(() => {
    if (effectiveActive) {
      const abortController = new AbortController();
      const metric = showHealthModal ? healthChartMetric : 'lead';
      const mode = showHealthModal ? modalChartMode : displayChartMode;
      fetchStatsOnly(metric, mode, abortController.signal);
      return () => abortController.abort();
    }
  }, [chartMode, healthChartMetric, showHealthModal, effectiveActive]);

  useEffect(() => {
    if (isActive) {
      const savedDate = localStorage.getItem('Ideas_global_date');
      if (savedDate && savedDate !== dateFilter) {
        setDateFilter(savedDate);
      }
    }
  }, [isActive]);

  useEffect(() => {
    const handleGlobalDate = (e: any) => {
      const newDate = e.detail;
      if (newDate && newDate !== dateFilter) {
        setDateFilter(newDate);
      }
    };
    window.addEventListener('global-date-change', handleGlobalDate);
    return () => window.removeEventListener('global-date-change', handleGlobalDate);
  }, [dateFilter]);

  useEffect(() => {
    const handleLeadAdded = () => {
      if (isActive) {
        fetchDashboard();
      }
    };
    window.addEventListener('lead-added', handleLeadAdded);
    return () => window.removeEventListener('lead-added', handleLeadAdded);
  }, [dateFilter, chartMode, isActive]);

  useEffect(() => {
    const handleOpenWarRoom = () => {
      setShowWarRoom(true);
    };
    window.addEventListener('open-ai-infinity-view', handleOpenWarRoom);
    return () => window.removeEventListener('open-ai-infinity-view', handleOpenWarRoom);
  }, []);

  const parsedMonthStr = useMemo(() => {
    const match = dateFilter.match(/^(\d{4}-\d{2})$/);
    if (match) {
      return match[1];
    }
    const d = new Date();
    if (dateFilter.includes('trước') || dateFilter === 'last_month' || dateFilter === t('Tháng trước')) {
      d.setMonth(d.getMonth() - 1);
    }
    return d.toISOString().substring(0, 7);
  }, [dateFilter, t]);

  // HR Dashboard specific calculations with 0ms SWR Cache
  useEffect(() => {
    if ((currentViewRole === 'hrm' || currentViewRole === 'hr') && isActive) {
      const cachedHr = hrDashboardCache.get(parsedMonthStr);
      if (cachedHr) {
        setHrProfiles(cachedHr.hrProfiles);
        setHrLeaves(cachedHr.hrLeaves);
        setHrAdvances(cachedHr.hrAdvances);
        setHrTeams(cachedHr.hrTeams);
        setHrTodayCheckIns(cachedHr.hrTodayCheckIns);
        setHrWeeklyCheckIns(cachedHr.hrWeeklyCheckIns);
        setHrMonthCheckIns(cachedHr.hrMonthCheckIns);
        setHrShifts(cachedHr.hrShifts);
        setHrDashboardPayslips(cachedHr.hrDashboardPayslips);
        setHrLoading(false);
        if (Date.now() - cachedHr.timestamp < SWR_TTL_MS) {
          return;
        }
      } else {
        setHrLoading(true);
      }

      const controller = new AbortController();
      const { signal } = controller;
      const now = new Date();
      const todayStr = now.toISOString().substring(0, 10);
      const currentDay = now.getDay();
      const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMonday);
      const saturday = new Date(monday);
      saturday.setDate(monday.getDate() + 5);
      const mondayStr = getLocalDateStr(monday);
      const saturdayStr = getLocalDateStr(saturday);

      const parts = parsedMonthStr.split('-');
      const y = parts[0];
      const m = parts[1];

      Promise.all([
        fetchAPI('hrm/profiles', { signal }).catch(() => ({ data: [] })),
        fetchAPI('hrm/leaves', { signal }).catch(() => ({ data: [] })),
        fetchAPI('hrm/advances', { signal }).catch(() => ({ data: [] })),
        fetchAPI('teams', { signal }).catch(() => ({ data: [] })),
        fetchAPI(`check-ins?date=${todayStr}`, { signal }).catch(() => ({ data: [] })),
        fetchAPI(`check-ins?from=${mondayStr}&to=${saturdayStr}`, { signal }).catch(() => ({ data: [] })),
        fetchAPI(`check-ins?month=${m}&year=${y}&include_shifts=1`, { signal }).catch(() => ({ data: [] })),
        fetchAPI(`hrm/payroll?month_year=${parsedMonthStr}`, { signal }).catch(() => ({ data: [] }))
      ]).then(([profRes, leaveRes, advRes, teamRes, todayCheckRes, weekCheckRes, monthCheckRes, payRes]) => {
        if (signal.aborted) return;
        const nextProfiles = profRes?.data || profRes || [];
        const nextLeaves = leaveRes?.data || leaveRes || [];
        const nextAdvances = advRes?.data || advRes || [];
        const nextTeams = teamRes?.data || teamRes || [];
        const nextTodayCheckIns = Array.isArray(todayCheckRes) ? todayCheckRes : todayCheckRes?.data || [];
        const weeklyRows = weekCheckRes?.data?.check_ins || weekCheckRes?.check_ins || (Array.isArray(weekCheckRes?.data) ? weekCheckRes.data : (Array.isArray(weekCheckRes) ? weekCheckRes : []));
        const checkData = monthCheckRes?.data || monthCheckRes || {};
        const checkInsList = Array.isArray(checkData) ? checkData : (checkData.check_ins || []);
        const shiftsList = checkData.shifts || [];
        const nextPayslips = payRes?.data || payRes || [];

        setHrProfiles(nextProfiles);
        setHrLeaves(nextLeaves);
        setHrAdvances(nextAdvances);
        setHrTeams(nextTeams);
        setHrTodayCheckIns(nextTodayCheckIns);
        setHrWeeklyCheckIns(weeklyRows);
        setHrMonthCheckIns(checkInsList);
        setHrShifts(shiftsList);
        setHrDashboardPayslips(nextPayslips);

        hrDashboardCache.set(parsedMonthStr, {
          hrProfiles: nextProfiles,
          hrLeaves: nextLeaves,
          hrAdvances: nextAdvances,
          hrTeams: nextTeams,
          hrTodayCheckIns: nextTodayCheckIns,
          hrWeeklyCheckIns: weeklyRows,
          hrMonthCheckIns: checkInsList,
          hrShifts: shiftsList,
          hrDashboardPayslips: nextPayslips,
          timestamp: Date.now()
        });
      }).catch(() => {})
      .finally(() => {
        if (!signal.aborted) {
          setHrLoading(false);
        }
      });

      return () => controller.abort();
    }
  }, [currentViewRole, parsedMonthStr, isActive]);

  const syncDateFilterToModal = (filter: string) => {
    let mode = 'this_month';
    let start = '';
    let end = '';

    if (filter === 'Hôm nay') {
      mode = 'today';
    } else if (filter === 'Hôm qua') {
      mode = 'yesterday';
    } else if (filter === '7 ngày qua') {
      mode = '7_days';
    } else if (filter === '30 ngày qua') {
      mode = '30_days';
    } else if (filter === 'Tháng này') {
      mode = 'this_month';
    } else if (filter === 'Tháng trước') {
      mode = 'last_month';
    } else if (filter === 'Tuần này') {
      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + distanceToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      mode = 'custom';
      start = getLocalDateStr(monday);
      end = getLocalDateStr(sunday);
    } else if (filter === 'Tuần trước') {
      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const prevMonday = new Date(now);
      prevMonday.setDate(now.getDate() + distanceToMonday - 7);
      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevMonday.getDate() + 6);

      mode = 'custom';
      start = getLocalDateStr(prevMonday);
      end = getLocalDateStr(prevSunday);
    } else if (filter === 'Tuần trước nữa') {
      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const prev2Monday = new Date(now);
      prev2Monday.setDate(now.getDate() + distanceToMonday - 14);
      const prev2Sunday = new Date(prev2Monday);
      prev2Sunday.setDate(prev2Monday.getDate() + 6);

      mode = 'custom';
      start = getLocalDateStr(prev2Monday);
      end = getLocalDateStr(prev2Sunday);
    } else {
      const match = filter.match(/^(\d{4}-\d{2}-\d{2})\s*(?:đến|đên|den|to|-)\s*(\d{4}-\d{2}-\d{2})$/i);
      if (match) {
        mode = 'custom';
        start = match[1];
        end = match[2];
      }
    }

    setStatsDateMode(mode);
    setStatsStartDate(start);
    setStatsEndDate(end);
  };

  const fetchConsultantStats = async (consId: number, mode: string, start?: string, end?: string) => {
    setStatsLoading(true);
    try {
      let query = `get_consultant_stats&consultant_id=${consId}&date_mode=${mode}`;
      if (mode === 'custom' && start && end) {
        query += `&start_date=${start}&end_date=${end}`;
      }
      const json = await fetchAPI(query);
      if (json.success) {
        setStatsData(json);
      } else {
        toast.error(json.message || 'Lỗi khi tải báo cáo thống kê');
      }
    } catch (e: any) {
      toast.error(t('Lỗi kết nối: ') + e.message);
    }
    setStatsLoading(false);
  };

  useEffect(() => {
    if (statsModalOpen && statsConsultant) {
      if (statsDateMode !== 'custom' || (statsStartDate && statsEndDate)) {
        fetchConsultantStats(statsConsultant.id, statsDateMode, statsStartDate, statsEndDate);
      }
    }
  }, [statsModalOpen, statsConsultant, statsDateMode, statsStartDate, statsEndDate]);

  const kpiCards = [
    {
      id: 'total',
      statusValue: 'all',
      label: t('TỔNG DATA TIẾP NHẬN'),
      value: stats?.total_today?.toLocaleString() || '0',
      icon: GitBranch,
      color: 'var(--color-primary)', // Brand crimson for Total Data
      change: stats?.total_change,
      up: (stats?.total_change || '').startsWith('+')
    },
    {
      id: 'distributed',
      statusValue: 'assigned,compensation,rule_6_month,pending_work_hours,fallback,success,databank_claim',
      label: t('ĐÃ CHIA VÒNG THÀNH CÔNG'),
      value: stats?.distributed_today?.toLocaleString() || '0',
      icon: UserPlus,
      color: '#3b82f6', // Blue for Distributed
      change: stats?.distributed_change,
      up: (stats?.distributed_change || '').startsWith('+')
    },
    {
      id: 'duplicates',
      statusValue: 'reminder,duplicate',
      label: t('BỊ TRÙNG LẶP (< 6 THÁNG)'),
      value: stats?.duplicates?.toLocaleString() || '0',
      icon: AlertTriangle,
      color: '#f59e0b', // Amber/Yellow for Duplicates
      change: stats?.duplicates_change,
      up: !(stats?.duplicates_change || '').startsWith('+')
    },
    {
      id: 'errors',
      statusValue: 'error,blacklisted,rejected,pending_approval,no_consultant',
      label: t('DATA LỖI / Dưới chuẩn'),
      value: stats?.errors?.toLocaleString() || '0',
      icon: Zap,
      color: '#ef4444', // Red for Errors
      change: stats?.errors_change,
      up: !(stats?.errors_change || '').startsWith('+')
    }
  ];


  const dateOptions = [
    { value: 'Tất cả thời gian', label: t('Tất cả thời gian') },
    { value: 'Hôm nay', label: t('Hôm nay') },
    { value: 'Hôm qua', label: t('Hôm qua') },
    { value: 'Tuần này', label: t('Tuần này') },
    { value: 'Tuần trước', label: t('Tuần trước') },
    { value: 'Tuần trước nữa', label: t('Tuần trước nữa') },
    { value: '7 ngày qua', label: t('7 ngày qua') },
    { value: '30 ngày qua', label: t('30 ngày qua') },
    { value: 'Tháng này', label: t('Tháng này') },
    { value: 'Tháng trước', label: t('Tháng trước') },
    { value: 'Năm nay', label: t('Năm nay') }
  ];

  const defaultFilters = ['Tất cả thời gian', 'Hôm nay', 'Hôm qua', 'Tuần này', 'Tuần trước', 'Tuần trước nữa', '7 ngày qua', '30 ngày qua', 'Tháng này', 'Tháng trước', 'Năm nay', 'Tùy chỉnh'];
  if (!defaultFilters.includes(dateFilter)) {
    dateOptions.push({ value: dateFilter, label: getDisplayDateFilterText(dateFilter) });
  }

  dateOptions.push({ value: 'Tùy chỉnh', label: t('Tùy chỉnh...') });

  const handleCustomDateSubmit = () => {
    if (!startDate || !endDate) return toast.error(t("Vui lòng chọn đầy đủ Từ ngày và Đến ngày"));
    if (new Date(startDate) > new Date(endDate)) return toast.error(t("Từ ngày không được lớn hơn Đến ngày"));

    // BUG-HIGH-1 fix: api.php expects format 'YYYY-MM-DD đến YYYY-MM-DD'
    // startDate/endDate from <input type="date"> are already in YYYY-MM-DD format
    const label = `${startDate} đến ${endDate}`;

    handleUpdateDateFilter(label);
    setShowDateModal(false);
  };

  const getRoleLabel = (role: string, targetUser?: any) => {
    const u = targetUser || user;
    return getUserDisplayRoleOrTitle(u, role);
  };

  const getRoleBadgeStyle = (role: string, customTitle?: string) => {
    const r = (role || '').toLowerCase();
    const t = (customTitle || '').toLowerCase();
    if (r === 'superadmin' || r === 'super_admin' || t.includes('điều hành') || t.includes('ceo') || t.includes('founder')) {
      return {
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)'
      };
    }
    if (r === 'director' || t.includes('giám đốc')) {
      return {
        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
        boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)'
      };
    }
    if (r === 'manager' || t.includes('quản lý') || t.includes('trưởng phòng')) {
      return {
        background: 'linear-gradient(135deg, #334155 0%, #0f172a 100%)',
        boxShadow: '0 2px 8px rgba(15, 23, 42, 0.32)'
      };
    }
    if (r === 'hr' || t.includes('nhân sự')) {
      return {
        background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
        boxShadow: '0 2px 8px rgba(59, 130, 246, 0.4)'
      };
    }
    if (r === 'accountant' || t.includes('kế toán')) {
      return {
        background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
      };
    }
    if (r === 'academic' || r === 'hoc_vu' || r === 'tro_giang' || r === 'teacher' || r === 'giang_vien' || t.includes('học vụ') || t.includes('giảng viên')) {
      return {
        background: 'linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%)',
        boxShadow: '0 2px 8px rgba(14, 165, 233, 0.4)'
      };
    }
    if (r === 'marketing' || t.includes('marketing')) {
      return {
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.4)'
      };
    }
    if (r === 'sale_admin' || r === 'saleadmin') {
      return {
        background: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
        boxShadow: '0 2px 8px rgba(51, 65, 85, 0.35)'
      };
    }
    return {
      background: 'linear-gradient(135deg, #BD1D2D 0%, #a31422 100%)',
      boxShadow: '0 2px 8px rgba(189, 29, 45, 0.5)'
    };
  };

  const renderHeaderForRole = (title: string, subtitle: string) => {
    return (
      <>
        {renderSubTabs()}
        <DomDashboardToolbar
          left={
            <div>
              <h1 className="page-title" style={{ margin: 0 }}>{title}</h1>
              <p className="page-subtitle" style={{ marginTop: '4px', marginBottom: 0 }}>{subtitle}</p>
            </div>
          }
          right={
            <>
              <div className="mobile-flex-1" style={{ position: 'relative', zIndex: 85, flex: '1 1 auto', minWidth: isMobile ? '0' : '180px', maxWidth: isMobile ? 'none' : '280px' }}>
                <CustomSelect
                  size="sm"
                  options={dateOptions}
                  value={dateFilter}
                  onChange={(val) => {
                    if (val === 'Tùy chỉnh') {
                      setShowDateModal(true);
                      return;
                    }
                    handleUpdateDateFilter(String(val));
                  }}
                  width="100%"
                />
              </div>
              <DomToolbarButton
                variant="primary"
                className="resource-health-btn"
                onClick={() => setShowHealthModal(true)}
                title={t("Kiểm tra kết nối hệ thống / Tài nguyên sử dụng")}
                aria-label={t("Kiểm tra kết nối hệ thống / Tài nguyên sử dụng")}
                icon={<Server size={15} />}
                style={{ width: 36, minWidth: 36, padding: 0 }}
              />
            </>
          }
        />
      </>
    );
  };

  const renderWelcomeBannerForRole = (desc: string, issuesList: any[]) => {
    return (
      <div className="welcome-banner">
        {/* Left section: Welcome Info */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: isMobile ? '1.25rem' : '1.5rem', 
          flex: isMobile ? '1 1 100%' : '1 1 340px', 
          minWidth: 0,
          borderBottom: isMobile ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
          paddingBottom: isMobile ? '12px' : 0,
          marginBottom: isMobile ? '12px' : 0
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <Avatar 
              name={user?.name || 'User'} 
              src={user?.avatar} 
              size={isMobile ? 58 : 68} 
              style={{ border: '2px solid rgba(189, 29, 45, 0.45)', boxShadow: '0 0 12px rgba(189, 29, 45, 0.25)' }}
            />
            <span style={{
              position: 'absolute',
              bottom: 1,
              right: 1,
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: '#10b981',
              border: '2px solid #181515'
            }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '4px' : '8px' }}>
              <h2 className="welcome-banner-title" style={{ fontSize: isMobile ? '1.05rem' : '1.25rem' }}>
                {t('Xin chào,')} {user?.name || ''}
              </h2>
              {isMobile && (
                <span style={{ 
                  fontSize: '0.625rem', 
                  fontWeight: 700, 
                  color: '#ffffff', 
                  padding: '2px 8px', 
                  borderRadius: '6px', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  ...getRoleBadgeStyle(user?.role || '', getUserJobTitle(user))
                }}>
                  {getRoleLabel(user?.role || '', user)}
                </span>
              )}
            </div>
            
            <p style={{ fontSize: '0.8rem', color: '#cbd5e1', margin: 0 }}>{desc}</p>
            
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 500 }}>
              <Clock size={11} style={{ color: '#ff4d5a' }} />
              {getCurrentDateVi()}
            </span>

            {!isMobile && (
              <div style={{ display: 'flex' }}>
                <span style={{ 
                  fontSize: '0.625rem', 
                  fontWeight: 700, 
                  color: '#ffffff', 
                  padding: '2px 8px', 
                  borderRadius: '6px', 
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  ...getRoleBadgeStyle(user?.role || '', getUserJobTitle(user))
                }}>
                  {getRoleLabel(user?.role || '', user)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Middle section: Issues/Tasks */}
        <div style={{ flex: isMobile ? '1 1 100%' : '2 1 380px', display: 'flex', flexDirection: 'column', gap: '12px', minWidth: isMobile ? '100%' : '280px' }}>
          <h4 style={{ margin: 0, fontSize: '0.72rem', fontWeight: 700, color: '#f4f4f5', textTransform: 'uppercase', letterSpacing: '0.06em', opacity: 0.9 }}>
            {t('Nhiệm vụ & Phê duyệt tồn đọng')}
          </h4>
          {issuesList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {issuesList.map((issue, index) => (
                <div 
                  key={index} 
                  onClick={issue.action}
                  className="welcome-task-row"
                  style={{ padding: isMobile ? '8px 12px' : '12px 16px' }}
                >
                  {issue.icon}
                  <span style={{ flex: 1, fontSize: '0.78rem' }}>{issue.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.15)', borderRadius: '10px' }}>
              <CheckSquare size={14} style={{ color: '#10b981' }} />
              <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{t('Không có nhiệm vụ nào đang chờ xử lý')}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderKpiCardForRole = (label: string, value: string, Icon: any, color: string, className: string, onClick: () => void) => {
    const isBrand = color === '#C6333D' || color === '#BD1D2D' || color === '#a31422' || color === '#ef4444';
    return (
      <DomKpiTile
        label={label}
        value={value}
        icon={<Icon size={16} />}
        accent={isBrand ? 'brand' : 'slate'}
        valueTone={className === 'distributed-card' ? 'brand' : 'default'}
        onClick={onClick}
        className={className}
      />
    );
  };

  const renderSubTabs = () => {
    const isAdmin = isExecutive(user);
    const isMarketingUser = isMarketing(user) || (user?.role === 'marketing');
    const isManagerUser = isManagement(user);
    const isAccountantUser = isAccountant(user, false) || (user?.role === 'accountant');
    const isHrUser = isHR(user, false) || (user?.role === 'hr');

    if (!isAdmin && !isManagerUser && !isMarketingUser && !isAccountantUser && !isHrUser) {
      return null;
    }

    const ALL_TABS = [
      { key: 'persona', label: t('Chân dung Học viên'), icon: GraduationCap },
      { key: 'leads', label: t('Tổng quan Lead'), icon: Zap },
      { key: 'sales', label: t('Hiệu suất Sales'), icon: TrendingUp },
      { key: 'meta_ads', label: t('Meta Ads'), icon: BarChart2 },
      { key: 'finance', label: t('Tài chính'), icon: DollarSign },
      { key: 'hrm', label: t('Nhân sự'), icon: Users }
    ];

    const TABS = ALL_TABS.filter(tab => allowedSubTabKeys.includes(tab.key));
    if (TABS.length <= 1) {
      return null;
    }

    // On Mobile (<= 768px) when there are > 2 tabs, show the first 2 tabs (swapping in active tab if it's in overflow)
    // plus a compact "Khác ▾" dropdown menu so tabs never overflow 100vw or require awkward horizontal scrolling.
    const useMobileOverflow = isMobile && TABS.length > 2;
    let visibleTabs = TABS;
    let overflowTabs: typeof TABS = [];

    if (useMobileOverflow) {
      const activeIdx = TABS.findIndex(tab => tab.key === normalizedSubTab);
      if (activeIdx <= 1) {
        visibleTabs = TABS.slice(0, 2);
        overflowTabs = TABS.slice(2);
      } else {
        visibleTabs = [TABS[0], TABS[activeIdx]];
        overflowTabs = TABS.filter((_, idx) => idx !== 0 && idx !== activeIdx);
      }
    }

    return (
      <div
        className="dashboard-sticky-subtab-header"
        style={{
          position: 'sticky',
          top: isMobile ? -10 : -18,
          zIndex: 96,
          width: '100%',
          padding: '6px 0',
          background: 'rgba(248, 250, 252, 0.96)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          marginTop: 0,
          marginBottom: '2px'
        }}
      >
        {!useMobileOverflow ? (
          <DomSegmentedSwitch
            size="md"
            value={normalizedSubTab}
            onChange={(nextKey) => {
              setActiveSubTab(nextKey);
              setShowMobileSubTabMenu(false);
            }}
            ariaLabel={t('Chuyển đổi phân hệ báo cáo')}
            className="dashboard-subtab-container"
            style={{ width: '100%' }}
            options={TABS.map((tab) => {
              const Icon = tab.icon;
              return {
                value: tab.key,
                label: tab.label,
                icon: <Icon size={14} />,
              };
            })}
          />
        ) : (
        <div
          className="dashboard-subtab-container"
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px',
            borderRadius: '11px',
            background: 'var(--color-border-light, #f1f5f9)',
            border: '1px solid var(--color-border, #e2e8f0)',
            gap: '4px',
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            position: 'relative'
          }}
        >
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isAct = normalizedSubTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveSubTab(tab.key);
                  setShowMobileSubTabMenu(false);
                }}
                style={{
                  flex: '1 1 0%',
                  minWidth: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  height: '34px',
                  padding: isMobile ? '0 8px' : '0 12px',
                  borderRadius: '8px',
                  border: 'none',
                  outline: 'none',
                  background: isAct ? 'var(--color-surface, #ffffff)' : 'transparent',
                  color: isAct ? 'var(--color-primary, #BD1D2D)' : 'var(--color-text-muted, #64748b)',
                  fontSize: isMobile ? '0.74rem' : '0.8rem',
                  fontWeight: isAct ? 700 : 600,
                  cursor: 'pointer',
                  boxShadow: isAct ? '0 1px 3px rgba(15, 23, 42, 0.08)' : 'none',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                <Icon size={14} style={{ color: isAct ? 'var(--color-primary, #BD1D2D)' : 'var(--color-text-muted, #64748b)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tab.label}</span>
              </button>
            );
          })}

          {useMobileOverflow && overflowTabs.length > 0 && (
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <button
                ref={mobileSubTabBtnRef}
                type="button"
                onClick={() => {
                  if (!showMobileSubTabMenu && mobileSubTabBtnRef.current) {
                    const rect = mobileSubTabBtnRef.current.getBoundingClientRect();
                    setMobileSubTabMenuPos({
                      top: Math.min(window.innerHeight - 240, rect.bottom + 6),
                      right: Math.max(12, window.innerWidth - rect.right),
                    });
                  }
                  setShowMobileSubTabMenu(prev => !prev);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  height: '34px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: showMobileSubTabMenu ? '#0f172a' : '#ffffff',
                  color: showMobileSubTabMenu ? '#ffffff' : '#0f172a',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <span>Khác ({overflowTabs.length})</span>
                <ChevronDown size={13} />
              </button>

              {showMobileSubTabMenu && typeof document !== 'undefined' && createPortal(
                <>
                  <div
                    onClick={() => setShowMobileSubTabMenu(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 2147483638, background: 'rgba(15, 23, 42, 0.08)' }}
                  />
                  <div
                    style={{
                      position: 'fixed',
                      top: mobileSubTabMenuPos.top,
                      right: mobileSubTabMenuPos.right,
                      minWidth: 225,
                      maxWidth: 'calc(100vw - 24px)',
                      background: '#ffffff',
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      boxShadow: '0 14px 32px rgba(15, 23, 42, 0.18)',
                      padding: 6,
                      zIndex: 2147483640,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}
                  >
                    {TABS.map((tab) => {
                      const Icon = tab.icon;
                      const isAct = normalizedSubTab === tab.key;
                      return (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => {
                            setActiveSubTab(tab.key);
                            setShowMobileSubTabMenu(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                            padding: '10px 12px',
                            borderRadius: 8,
                            border: 'none',
                            background: isAct ? '#fef2f2' : 'transparent',
                            color: isAct ? '#BD1D2D' : '#0f172a',
                            fontSize: '0.82rem',
                            fontWeight: isAct ? 700 : 600,
                            cursor: 'pointer',
                            textAlign: 'left'
                          }}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <Icon size={15} style={{ color: isAct ? '#BD1D2D' : '#64748b', flexShrink: 0 }} />
                            <span>{tab.label}</span>
                          </span>
                          {isAct && <CheckCircle2 size={14} color="#BD1D2D" />}
                        </button>
                      );
                    })}
                  </div>
                </>,
                document.body
              )}
            </div>
          )}
        </div>
        )}
      </div>
    );
  };

  const renderAdminWelcomeBanner = () => {
    const isAdminOrManager = ['admin', 'superadmin', 'super_admin', 'director', 'manager', 'assistant'].includes(user?.role || '');
    const issues = [];
    if (isAdminOrManager) {
      if (pendingTicketsCount > 0) {
        issues.push({
          type: 'ticket',
          text: pendingTicketsCount + ' ' + t('ticket hỗ trợ đang chờ phản hồi hoặc xử lý.'),
          action: () => navigate('/tickets')
        });
      }
      if (heldLeadsCount > 0) {
        issues.push({
          type: 'gatekeeper',
          text: heldLeadsCount + ' ' + t('lead đang bị tạm giữ tại Gatekeeper.'),
          action: () => navigate('/gatekeeper')
        });
      }
      if (pendingCheckInsCount > 0) {
        issues.push({
          type: 'checkin',
          text: pendingCheckInsCount + ' ' + t('yêu cầu chấm công/đi trễ cần duyệt.'),
          action: () => navigate('/attendance')
        });
      }
      if (pendingCoopsCount > 0) {
        issues.push({
          type: 'coop',
          text: pendingCoopsCount + ' ' + t('yêu cầu hợp tác cần duyệt.'),
          action: () => navigate('/cooperation-slips?status=pending_me')
        });
      }
      if (pendingExpensesCount > 0) {
        issues.push({
          type: 'expense',
          text: pendingExpensesCount + ' ' + t('quy trình & đề xuất cần duyệt.'),
          action: () => navigate('/approvals?tab=pending')
        });
      }
    }

    return (
      <>
        <style>{`
          .welcome-banner {
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, #181515 0%, #381f21 50%, #121010 100%) !important;
            border: 1px solid rgba(189, 29, 45, 0.4) !important;
            border-radius: 16px !important;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.08) inset !important;
            transition: border-color 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1) !important;
            padding: 24px 32px !important;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 24px;
            margin-bottom: 8px;
          }
          .welcome-banner::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -20%;
            width: 350px;
            height: 350px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(189, 29, 45, 0.12) 0%, transparent 70%);
            pointer-events: none;
          }
          .welcome-banner:hover {
            box-shadow: 0 12px 32px rgba(189, 29, 45, 0.2), 0 1px 0 rgba(255, 255, 255, 0.12) inset !important;
            border-color: rgba(189, 29, 45, 0.55) !important;
          }
          .welcome-action-btn {
            transition: background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s cubic-bezier(0.22, 1, 0.36, 1) !important;
            cursor: pointer;
            border-radius: 10px !important;
            padding: 8px 16px !important;
            font-size: 0.8rem !important;
            font-weight: 600 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            text-decoration: none !important;
          }
          .welcome-action-btn.primary-btn {
            background: linear-gradient(135deg, #BD1D2D 0%, #a31422 100%) !important;
            border: none !important;
            color: white !important;
            box-shadow: 0 4px 14px rgba(189, 29, 45, 0.4) !important;
          }
          .welcome-action-btn.primary-btn:hover {
            box-shadow: 0 6px 18px rgba(189, 29, 45, 0.55) !important;
            filter: brightness(1.08);
          }
          .welcome-action-btn.outline-btn {
            background: rgba(255, 255, 255, 0.05) !important;
            border: 1px solid rgba(255, 255, 255, 0.18) !important;
            color: #ffffff !important;
          }
          .welcome-action-btn.outline-btn:hover {
            background: rgba(189, 29, 45, 0.18) !important;
            border-color: rgba(189, 29, 45, 0.5) !important;
            color: #ffffff !important;
          }
          .welcome-task-row {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            border-radius: 10px !important;
            padding: 8px 16px !important;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 0.825rem;
            color: #ffffff !important;
            font-weight: 600 !important;
            transition: background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
            cursor: pointer;
            text-decoration: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
          }
          .welcome-task-row:hover {
            background: rgba(189, 29, 45, 0.15) !important;
            border-color: rgba(189, 29, 45, 0.4) !important;
            color: #ffffff !important;
          }
          .welcome-banner-title {
            font-size: 1.15rem !important;
            font-weight: 600 !important;
            color: #ffffff !important;
            margin: 0 !important;
            letter-spacing: -0.02em !important;
            line-height: 1.3 !important;
          }
          @media (max-width: 768px) {
            .welcome-banner {
              padding: 16px 16px !important;
              gap: 12px !important;
              border-radius: 16px !important;
            }
            .welcome-banner-title {
              font-size: 0.95rem !important;
            }
          }
        `}</style>

        <div className="welcome-banner" style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '20px', minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Avatar
                name={user?.name || 'Admin'}
                src={user?.avatar || user?.avatar_url}
                size={isMobile ? 48 : 64}
                style={{
                  borderRadius: '50%',
                  border: '2px solid rgba(189, 29, 45, 0.6)',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                  fontWeight: 700
                }}
              />
              <div className="ping-dot" style={{ 
                position: 'absolute', 
                bottom: '-2px', 
                right: '-2px', 
                width: '12px', 
                height: '12px', 
                borderRadius: '50%', 
                background: '#10b981', 
                border: '2px solid #1a1313',
                zIndex: 2
              }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 className="welcome-banner-title">
                {t('Xin chào')}, {user?.name || 'Admin'}
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={12} style={{ opacity: 0.8 }} />
                  {new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
                <span style={{ 
                  padding: '2px 8px', 
                  borderRadius: '6px', 
                  fontSize: '0.65rem', 
                  fontWeight: 700, 
                  color: '#ffffff',
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em',
                  ...getRoleBadgeStyle(user?.role || '', getUserJobTitle(user))
                }}>
                  {getRoleLabel(user?.role || '', user)}
                </span>
              </div>
            </div>
          </div>

          <div style={{ flex: '1 1 auto', maxWidth: isMobile ? '100%' : '520px', minWidth: isMobile ? '100%' : '320px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {isAdminOrManager ? t('Nhiệm vụ & Phê duyệt tồn đọng') : t('Không gian làm việc')}
              </div>
              {isAdminOrManager ? (
                issues.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {issues.slice(0, 2).map((issue, index) => (
                      <div key={index} className="welcome-task-row" onClick={issue.action}>
                        {issue.type === 'ticket' && <AlertTriangle size={14} style={{ color: '#fbbf24' }} />}
                        {issue.type === 'gatekeeper' && <Zap size={14} style={{ color: '#60a5fa' }} />}
                        {issue.type === 'checkin' && <Clock size={14} style={{ color: '#ff8a8a' }} />}
                        {issue.type === 'coop' && <Scale size={14} style={{ color: '#f87171' }} />}
                        {issue.type === 'expense' && <DollarSign size={14} style={{ color: '#34d399' }} />}
                        <span style={{ flex: 1, fontSize: '0.78rem' }}>{issue.text}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    padding: isMobile ? '8px 12px' : '12px 16px', 
                    background: 'rgba(255, 255, 255, 0.03)', 
                    border: '1px dashed rgba(255, 255, 255, 0.15)', 
                    borderRadius: '10px', 
                    color: '#cbd5e1',
                    fontSize: '0.75rem'
                  }}>
                    <CheckCircle2 size={15} style={{ color: '#10b981', flexShrink: 0 }} />
                    <span style={{ fontWeight: 500 }}>
                      {t('Không có yêu cầu phê duyệt nào đang chờ xử lý')}
                    </span>
                  </div>
                )
              ) : (
                <div 
                  className="welcome-task-row" 
                  onClick={() => navigate('/workspace')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckSquare size={15} style={{ color: '#10b981' }} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                      {t('Bàn làm việc — Quản lý công việc & lịch trình cá nhân')}
                    </span>
                  </div>
                  <ArrowRight size={14} style={{ opacity: 0.8, color: '#ffffff' }} />
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderDashboardWrapper = (children: React.ReactNode) => {
    return (
      <div style={{ position: 'relative' }}>
        {/* Background loading bar indicator */}
        {loading && stats && (
          <div className="page-loading-bar">
            <div style={{ width: '30%', height: '100%', background: 'var(--color-primary)', borderRadius: 'inherit', animation: 'loadingBar 1.5s infinite ease-in-out' }} />
          </div>
        )}
        <style>{`
          .page-loading-bar {
            position: absolute;
            top: -2rem;
            left: -3rem;
            right: -3rem;
            height: 3px;
            background: var(--color-primary-light);
            z-index: 9999;
            overflow: hidden;
          }
          @media (max-width: 1024px) {
            .page-loading-bar {
              top: -1.5rem;
              left: -1.5rem;
              right: -1.5rem;
            }
          }
          @media (max-width: 768px) {
            .page-loading-bar {
              top: -1rem;
              left: -1rem;
              right: -1rem;
            }
          }
          @keyframes loadingBar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(330%); }
          }
          @keyframes pulse {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }
          .ping-dot {
            animation: pulse 2s infinite;
          }
          .top-consultant-item {
            cursor: pointer;
          }
          .top-consultant-item:hover .consultant-name {
            color: var(--color-primary);
          }
          .top-consultant-item:hover .consultant-chart-icon {
            opacity: 1 !important;
            transform: scale(1.1);
          }
          .consultant-chart-icon {
            transition: all 0.2s ease-in-out;
          }
          .stat-card {
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
          .stat-card.total-card:hover {
            box-shadow: 0 6px 16px rgba(163, 20, 34, 0.15) !important;
            border-color: #a31422 !important;
          }
          .stat-card.distributed-card:hover {
            box-shadow: 0 6px 16px rgba(59, 130, 246, 0.15) !important;
            border-color: #3b82f6 !important;
          }
          .stat-card.duplicates-card:hover {
            box-shadow: 0 6px 16px rgba(245, 158, 11, 0.15) !important;
            border-color: #f59e0b !important;
          }
          .stat-card.errors-card:hover {
            box-shadow: 0 6px 16px rgba(239, 68, 68, 0.15) !important;
            border-color: #ef4444 !important;
          }
          .stat-card.out_of_hours-card:hover {
            box-shadow: 0 6px 16px rgba(245, 158, 11, 0.15) !important;
            border-color: #f59e0b !important;
          }
          .stat-card.fair_share_equity-card:hover {
            box-shadow: 0 6px 16px rgba(16, 185, 129, 0.15) !important;
            border-color: #10b981 !important;
          }
          .dashboard-kpi-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
            margin-bottom: 1.5rem;
          }
          @media (max-width: 1024px) {
            .dashboard-kpi-grid {
              grid-template-columns: repeat(2, 1fr);
            }
          }
          @media (max-width: 640px) {
            .dashboard-kpi-grid {
              grid-template-columns: repeat(2, 1fr);
              gap: 0.75rem;
            }
          }
          .welcome-banner {
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, #181515 0%, #381f21 50%, #121010 100%) !important;
            border: 1px solid rgba(189, 29, 45, 0.4) !important;
            border-radius: 16px !important;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25), 0 1px 0 rgba(255, 255, 255, 0.08) inset !important;
            transition: border-color 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1) !important;
            padding: 24px 32px !important;
            display: flex;
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 24px;
            margin-bottom: 8px;
          }
          .welcome-banner::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -20%;
            width: 350px;
            height: 350px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(189, 29, 45, 0.12) 0%, transparent 70%);
            pointer-events: none;
          }
          .welcome-banner:hover {
            box-shadow: 0 12px 32px rgba(189, 29, 45, 0.2), 0 1px 0 rgba(255, 255, 255, 0.12) inset !important;
            border-color: rgba(189, 29, 45, 0.55) !important;
          }
          .welcome-action-btn {
            transition: background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s cubic-bezier(0.22, 1, 0.36, 1) !important;
            cursor: pointer;
            border-radius: 10px !important;
            padding: 8px 16px !important;
            font-size: 0.8rem !important;
            font-weight: 600 !important;
            display: inline-flex !important;
            align-items: center !important;
            gap: 8px !important;
            height: 38px !important;
          }
          .welcome-action-btn.primary-btn {
            background: linear-gradient(135deg, #BD1D2D 0%, #a31422 100%) !important;
            border: none !important;
            color: white !important;
            box-shadow: 0 4px 14px rgba(189, 29, 45, 0.4) !important;
          }
          .welcome-action-btn.primary-btn:hover {
            box-shadow: 0 6px 18px rgba(189, 29, 45, 0.55) !important;
            filter: brightness(1.08);
          }
          .welcome-action-btn.outline-btn {
            background: rgba(255, 255, 255, 0.05) !important;
            border: 1px solid rgba(255, 255, 255, 0.18) !important;
            color: #ffffff !important;
          }
          .welcome-action-btn.outline-btn:hover {
            background: rgba(189, 29, 45, 0.18) !important;
            border-color: rgba(189, 29, 45, 0.5) !important;
            color: #ffffff !important;
          }
          .welcome-task-row {
            background: rgba(255, 255, 255, 0.04) !important;
            border: 1px solid rgba(255, 255, 255, 0.12) !important;
            border-radius: 10px !important;
            padding: 8px 16px !important;
            display: flex;
            align-items: center;
            gap: 12px;
            font-size: 0.825rem;
            color: #ffffff !important;
            font-weight: 600 !important;
            transition: background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1);
            cursor: pointer;
            text-decoration: none;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15) !important;
          }
          .welcome-task-row:hover {
            background: rgba(189, 29, 45, 0.15) !important;
            border-color: rgba(189, 29, 45, 0.4) !important;
            color: #ffffff !important;
          }
          .welcome-banner-title {
            font-size: 1.15rem !important;
            font-weight: 600 !important;
            color: #ffffff !important;
            margin: 0 !important;
            letter-spacing: -0.02em !important;
            line-height: 1.3 !important;
          }
          @media (max-width: 768px) {
            .welcome-banner {
              padding: 16px 16px !important;
              gap: 12px !important;
              border-radius: 16px !important;
            }
            .welcome-banner-title {
              font-size: 0.95rem !important;
            }
          }
        `}</style>
        {children}

        <React.Suspense fallback={null}>
          {/* Quick View Drawer for Purchase Orders / Expenses */}
          {selectedExpenseId !== null && (
            <ExpenseQuickViewDrawer
              expenseId={selectedExpenseId}
              onClose={() => setSelectedExpenseId(null)}
              user={user}
              onStatusChange={() => {
                api.get('/expenses', { params: { limit: 50 } })
                  .then(expRes => {
                    const rawPos = expRes?.data?.data?.items || expRes?.data?.data || [];
                    if (Array.isArray(rawPos)) setPoList(rawPos);
                  })
                  .catch(console.error);
                fetchDashboard();
                fetchBadgeCounts();
              }}
            />
          )}

          {/* Quick View Drawer for Sales Orders / Deposits */}
          {selectedDeposit && (
            <DepositDetailDrawer
              isOpen={!!selectedDeposit}
              onClose={() => setSelectedDeposit(null)}
              deposit={selectedDeposit}
              onSaveSuccess={() => {
                fetchAPI('deposits')
                  .then(soRes => {
                    const rawSos = soRes?.data || soRes || [];
                    const sos = Array.isArray(rawSos) ? rawSos : (Array.isArray(rawSos?.orders) ? rawSos.orders : []);
                    setSoList(sos);
                  })
                  .catch(console.error);
                fetchDashboard();
                fetchBadgeCounts();
              }}
            />
          )}

          {/* Quick View Customer 360 Drawer when opened from Persona Overview Deck on /dashboard */}
          {personaDrawerContact && (
            <CustomerProfileDrawer
              isOpen={Boolean(personaDrawerContact)}
              contact={personaDrawerContact}
              onClose={() => setPersonaDrawerContact(null)}
              onUpdate={(updated: any) => {
                if (updated && updated.id) {
                  setPersonaDrawerContact(updated);
                }
              }}
            />
          )}
        </React.Suspense>
        <CustomModal isOpen={showDateModal} onClose={() => setShowDateModal(false)} title={t("Tùy chỉnh thời gian")} width="440px">
          {showDateModal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <label className="form-label" style={{ margin: 0 }}>{t('Khoảng thời gian')}</label>
                <DomDateRangePill
                  fromDate={startDate}
                  toDate={endDate}
                  onFromChange={val => setStartDate(val)}
                  onToChange={val => setEndDate(val)}
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <DomToolbarButton variant="outline" onClick={() => setShowDateModal(false)}>{t('Hủy')}</DomToolbarButton>
                <DomToolbarButton variant="primary" onClick={handleCustomDateSubmit}>{t('Áp dụng')}</DomToolbarButton>
              </div>
            </div>
          )}
        </CustomModal>
        {/* Statistics Modal */}
        {statsModalOpen && statsConsultant && typeof document !== 'undefined' && createPortal(
          <div className="overlay-backdrop stats-modal-backdrop" onClick={() => setStatsModalOpen(false)} style={{ zIndex: 2147483646 }}>
            <div
              className="card"
              style={{
                width: '100%',
                maxWidth: 900,
                maxHeight: '92vh',
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideUp 0.2s ease-out'
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="stats-header-container" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <Avatar
                    src={statsConsultant.avatar}
                    name={statsConsultant.name}
                    size={44}
                    style={{
                      filter: (statsConsultant.status === 'inactive' || statsConsultant.status === 'leave' || Number(statsConsultant.vacation_mode) === 1) ? 'grayscale(1)' : 'none',
                      opacity: (statsConsultant.status === 'inactive' || statsConsultant.status === 'leave' || Number(statsConsultant.vacation_mode) === 1) ? 0.5 : 1
                    }}
                  />
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-text)' }}>{t('Báo cáo hiệu suất TVV')}</h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      <strong>{statsConsultant.name}</strong> • ID: {statsConsultant.id} • {statsConsultant.email}
                    </p>
                  </div>
                </div>

                {/* Timeframe Filter Dropdown in Header */}
                <div className="stats-header-filters">
                  <Calendar size={18} color="var(--color-text-light)" style={{ display: 'flex', alignItems: 'center' }} />
                  <div style={{ position: 'relative', zIndex: 100 }}>
                    <CustomSelect
                      options={[
                        { value: 'this_month', label: t('Tháng này') },
                        { value: 'today', label: t('Hôm nay') },
                        { value: 'yesterday', label: t('Hôm qua') },
                        { value: '7_days', label: t('7 ngày qua') },
                        { value: '30_days', label: t('30 ngày qua') },
                        { value: 'last_month', label: t('Tháng trước') },
                        { value: 'all', label: t('Tất cả thời gian') },
                        { value: 'custom', label: t('Tự chọn ngày...') }
                      ]}
                      value={statsDateMode}
                      onChange={val => setStatsDateMode(String(val))}
                      width={180}
                    />
                  </div>

                  {statsDateMode === 'custom' && (
                    <div className="stats-custom-dates" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', animation: 'slideUp 0.15s ease-out', flexShrink: 0 }}>
                      <div style={{ width: 130 }}>
                        <VietnameseDateInput
                          size="sm"
                          value={statsStartDate}
                          onChange={val => setStatsStartDate(val)}
                          inputStyle={{ height: 32, fontSize: '0.8125rem' }}
                        />
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('đến')}</span>
                      <div style={{ width: 130 }}>
                        <VietnameseDateInput
                          size="sm"
                          value={statsEndDate}
                          onChange={val => setStatsEndDate(val)}
                          inputStyle={{ height: 32, fontSize: '0.8125rem' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Content Area */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.25rem 3rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
                {statsLoading && !statsData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                      <KpiCardSkeleton />
                      <KpiCardSkeleton />
                      <KpiCardSkeleton />
                      <KpiCardSkeleton />
                    </div>
                    <ChartSkeleton height={260} />
                  </div>
                ) : !statsData ? (
                  <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
                    {t('Không có dữ liệu thống kê.')}
                  </div>
                ) : (
                  <>
                    {/* Subtle Loading overlay if reloading in background */}
                    {statsLoading && (
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--color-primary-light)', zIndex: 10, overflow: 'hidden' }}>
                        <div style={{ width: '30%', height: '100%', background: 'var(--color-primary)', borderRadius: 'inherit', animation: 'loadingBar 1.5s infinite ease-in-out' }} />
                      </div>
                    )}

                    {/* Visual Breakdown explanation */}
                    <div style={{
                      background: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.6)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: 12,
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.02)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                          {t('Tổng data TVV này tiếp nhận:')} <strong style={{ fontSize: '1.05rem', color: 'var(--color-text)' }}>{statsData.summary.total_received || 0}</strong> lead
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                          * {t('Các nhóm độc lập hoàn toàn, không cộng dồn/chồng chéo')}
                        </span>
                      </div>

                      {/* Stacked Percentage Bar */}
                      <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--color-border-light)', position: 'relative' }}>
                        {((statsData.summary.distributed_count || 0) + (statsData.summary.coop_count || 0)) > 0 && (
                          <div
                            style={{
                              width: `${(((statsData.summary.distributed_count || 0) + (statsData.summary.coop_count || 0)) / Math.max(1, statsData.summary.total_received)) * 100}%`,
                              background: 'linear-gradient(90deg, #3b82f6, #007af5)',
                              transition: 'width 0.3s ease'
                            }}
                            title={`${t('Được chia')}: ${(statsData.summary.distributed_count || 0) + (statsData.summary.coop_count || 0)}`}
                          />
                        )}
                        {(statsData.summary.databank_count || 0) > 0 && (
                          <div
                            style={{
                              width: `${((statsData.summary.databank_count || 0) / Math.max(1, statsData.summary.total_received)) * 100}%`,
                              background: 'linear-gradient(90deg, #34c759, #10b981)',
                              transition: 'width 0.3s ease'
                            }}
                            title={`${t('Từ Databank')}: ${statsData.summary.databank_count}`}
                          />
                        )}
                        {(statsData.summary.self_count || 0) > 0 && (
                          <div
                            style={{
                              width: `${((statsData.summary.self_count || 0) / Math.max(1, statsData.summary.total_received)) * 100}%`,
                              background: 'linear-gradient(90deg, #fcd34d, #f59e0b)',
                              transition: 'width 0.3s ease'
                            }}
                            title={`${t('Tự nhập')}: ${statsData.summary.self_count}`}
                          />
                        )}
                      </div>

                      {/* Legend explaining the numbers */}
                      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#007af5' }} />
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {t('Được chia')}: <strong style={{ color: '#007af5' }}>{(statsData.summary.distributed_count || 0) + (statsData.summary.coop_count || 0)}</strong> ({statsData.summary.total_received > 0 ? Math.round((((statsData.summary.distributed_count || 0) + (statsData.summary.coop_count || 0)) / statsData.summary.total_received) * 100) : 0}%)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#34c759' }} />
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {t('Từ Databank')}: <strong style={{ color: '#34c759' }}>{statsData.summary.databank_count || 0}</strong> ({statsData.summary.total_received > 0 ? Math.round(((statsData.summary.databank_count || 0) / statsData.summary.total_received) * 100) : 0}%)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {t('Tự nhập')}: <strong style={{ color: '#f59e0b' }}>{statsData.summary.self_count || 0}</strong> ({statsData.summary.total_received > 0 ? Math.round(((statsData.summary.self_count || 0) / statsData.summary.total_received) * 100) : 0}%)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginLeft: 'auto', paddingLeft: '1rem', borderLeft: '1px solid var(--color-border)' }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>
                            {t('Nhắc lại')}: <strong style={{ color: 'var(--color-warning)' }}>{statsData.summary.reminder || 0}</strong> | {t('Lỗi/Trùng')}: <strong style={{ color: 'var(--color-danger)' }}>{statsData.summary.error || 0}</strong>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* KPI Cards Row (3 Columns) — DOMATION Brand Red & Slate */}
                    <div className="responsive-grid-3" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '0.75rem' }}>
                      <DomKpiTile
                        label={t('Tổng khách hàng')}
                        value={formatDomNumber(statsData.summary.total_received || 0)}
                        icon={<Users size={16} />}
                        accent="brand"
                        breakdown={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#BD1D2D', display: 'inline-block' }} />
                            {t('Tổng data đang chăm sóc')}: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(statsData.summary.total_received || 0)}</strong>
                          </span>
                        }
                      />
                      <DomKpiTile
                        label={t('Được chia')}
                        value={formatDomNumber((statsData.summary.distributed_count || 0) + (statsData.summary.coop_count || 0))}
                        icon={<Send size={16} />}
                        accent="brand"
                        valueTone="brand"
                        breakdown={
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#334155', display: 'inline-block' }} />
                              {t('Chia tự động')}: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(statsData.summary.distributed_count || 0)}</strong>
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#64748b', display: 'inline-block' }} />
                              {t('Hợp tác (co.op)')}: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(statsData.summary.coop_count || 0)}</strong>
                            </span>
                          </div>
                        }
                      />
                      <DomKpiTile
                        label={t('Tự nhập')}
                        value={formatDomNumber(statsData.summary.self_count || 0)}
                        icon={<UserPlus size={16} />}
                        accent="slate"
                        breakdown={
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#334155', display: 'inline-block' }} />
                            {t('Tự tạo hoặc giới thiệu')}: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(statsData.summary.self_count || 0)}</strong>
                          </span>
                        }
                      />
                    </div>

                    {/* Row 1: Daily trend bar chart (Full Width) */}
                    <DomPanelCard title={t('Lưu lượng nhận Data theo Ngày')}>
                      {Array.isArray(statsData.by_date) && statsData.by_date.length > 0 ? (
                        <div style={{ height: 180, width: '100%' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={statsData.by_date} margin={{ left: -10, right: 5, top: 20, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" vertical={false} />
                              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                              <YAxis domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} width={34} />
                              <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${formatDomNumber(v)} data`} />} />
                              <Bar dataKey="count" fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={30} name={t("Data thành công")}>
                                <LabelList dataKey="count" position="top" style={{ fill: 'var(--color-text)', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} offset={6} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <DomEmptyChartState title={t('Không có dữ liệu phân bổ theo ngày')} minHeight={180} />
                      )}
                    </DomPanelCard>

                    {/* Row 2: Status Ratio (Donut) & Rounds Breakdown */}
                    <div className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                      <DomPanelCard title={t('Tỷ lệ Trạng thái Data')}>
                        {(() => {
                          const statusChartData = [
                            { name: t('Thành công'), value: statsData.summary.successful, color: '#10B981' },
                            { name: t('Nhắc lại'), value: statsData.summary.reminder, color: '#f59e0b' },
                            { name: t('Lỗi'), value: statsData.summary.error, color: '#EF4444' }
                          ].filter(item => item.value > 0);

                          return statsData.summary.total > 0 && statusChartData.length > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', justifyContent: 'center' }}>
                              <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={statusChartData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius={35}
                                      outerRadius={55}
                                      paddingAngle={4}
                                      dataKey="value"
                                    >
                                      {statusChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                      ))}
                                    </Pie>
                                    <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${formatDomNumber(v)} data`} />} />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                                {statusChartData.map((item, idx) => (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                                    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                                      {item.name}: <strong style={{ fontSize: '0.8125rem' }}>{item.value}</strong> ({Math.round(item.value / statsData.summary.total * 100)}%)
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : (
                            <DomEmptyChartState title={t('Không có dữ liệu lưu lượng')} minHeight={140} />
                          );
                        })()}
                      </DomPanelCard>

                      <DomPanelCard title={t('Phân bổ theo Vòng (Round)')}>
                        {Array.isArray(statsData.rounds) && statsData.rounds.length > 0 ? (
                          <div style={{ height: 160, width: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={statsData.rounds} layout="vertical" margin={{ left: -10, right: 10, top: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(148, 163, 184, 0.22)" />
                                <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                                <YAxis dataKey="round_name" type="category" width={92} tick={{ fontSize: 11, fontWeight: 600, fill: 'var(--color-text)' }} axisLine={false} tickLine={false} />
                                <Tooltip content={<DomChartTooltip />} />
                                <Bar dataKey="successful_count" stackId="a" fill="#2563EB" radius={[0, 0, 0, 0]} barSize={12} name={t("Thành công")} />
                                <Bar dataKey="reminder_count" stackId="a" fill="#f59e0b" radius={[0, 0, 0, 0]} barSize={12} name={t("Nhắc lại")} />
                                <Bar dataKey="error_count" stackId="a" fill="#EF4444" radius={[0, 4, 4, 0]} barSize={12} name={t("Lỗi")} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <DomEmptyChartState title={t('Không có dữ liệu chia số theo vòng')} minHeight={140} />
                        )}
                      </DomPanelCard>
                    </div>

                    {/* Row 3: Marketing Sources & Tickets Reports */}
                    <div className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                      <DomPanelCard title={t('Tỷ lệ Nguồn Data (Chi tiết)')}>
                        {Array.isArray(statsData.by_source) && statsData.by_source.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 130, overflowY: 'auto', paddingRight: 4 }}>
                            {statsData.by_source.map((src: any, idx: number) => {
                              const sourcePercent = statsData.summary.successful > 0
                                ? Math.round((src.count / statsData.summary.successful) * 100)
                                : 0;
                              return (
                                <DomRankBarRow
                                  key={idx}
                                  label={t(src.source)}
                                  value={`${formatDomNumber(src.count)} ${t('data')}`}
                                  badge={`${sourcePercent}%`}
                                  badgeTone={idx === 0 ? 'blue' : 'slate'}
                                  percent={sourcePercent}
                                  barColor={MYERP_CHART_PALETTE[idx % MYERP_CHART_PALETTE.length]}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <DomEmptyChartState title={t('Không có dữ liệu nguồn data')} minHeight={110} />
                        )}
                      </DomPanelCard>

                      {/* Tickets Reports statistics */}
                      <div className="card" style={{ padding: '1rem 1.25rem', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)' }}>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--color-text)' }}>{t('Thống kê Ticket báo lỗi Data')}</h4>
                        {statsData.tickets ? (
                          <>
                            <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                              <div style={{ background: 'var(--color-bg)', padding: '6px', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>{t('GỬI ĐI')}</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: 2 }}>{statsData.tickets.total}</div>
                              </div>
                              <div style={{ background: 'var(--color-success-light)', padding: '6px', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-success)', fontWeight: 700 }}>{t('ĐÃ BÙ')}</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-success)', marginTop: 2 }}>{statsData.tickets.approved}</div>
                              </div>
                              <div style={{ background: 'var(--color-warning-light)', padding: '6px', borderRadius: 8, border: '1px solid rgba(245, 158, 11, 0.1)' }}>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-warning)', fontWeight: 700 }}>{t('ĐANG CHỜ')}</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-warning)', marginTop: 2 }}>{statsData.tickets.pending}</div>
                              </div>
                              <div style={{ background: 'var(--color-danger-light)', padding: '6px', borderRadius: 8, border: '1px solid rgba(239, 68, 68, 0.1)' }}>
                                <div style={{ fontSize: '0.6875rem', color: 'var(--color-danger)', fontWeight: 700 }}>{t('TỪ CHỐI')}</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-danger)', marginTop: 2 }}>{statsData.tickets.rejected}</div>
                              </div>
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', fontWeight: 500 }}>
                              {t('Tổng nhận bù:')} <strong style={{ color: 'var(--color-success)' }}>{statsData.tickets.approved + (statsData.active_compensation || 0) + (statsData.blacklist_compensation || 0)}</strong> {t('data')} (Ticket: {statsData.tickets.approved}, Blacklist: {statsData.blacklist_compensation || 0}, {t('Chủ động')}: {statsData.active_compensation || 0})
                            </div>
                            <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                              <button
                                onClick={() => {
                                  setStatsModalOpen(false);
                                  navigate(`/fair-share?open_comp_id=${statsConsultant.id}&date_mode=${statsDateMode}`);
                                }}
                                className="btn outline sm"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', padding: '6px 12px', height: 'auto', borderRadius: 8 }}
                              >
                                <Scale size={13} /> {t('Xem chi tiết data bù')}
                              </button>
                            </div>
                          </>
                        ) : (
                          <div style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.75rem', padding: '1rem 0' }}>
                            {t('Không có dữ liệu ticket')}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
            </div>
          </div>,
          document.body
        )}

        {showHealthModal && (
          <CustomModal
            isOpen={showHealthModal}
            onClose={() => {
              setShowHealthModal(false);
              setHealthChartMetric('zalo');
            }}
            title={t("Thống kê & Kết nối hệ thống")}
            width={isMobile ? "100%" : "1060px"}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>

              {/* Custom Tab Headers */}
              <DomSegmentedSwitch<'stats' | 'connections'>
                size="sm"
                value={healthModalTab}
                onChange={setHealthModalTab}
                ariaLabel={t("Chế độ xem sức khỏe hệ thống")}
                style={{ alignSelf: 'flex-start', marginBottom: '0.25rem' }}
                options={[
                  { value: 'stats', label: t("Thống kê hoạt động") },
                  { value: 'connections', label: t("Trạng thái kết nối") }
                ]}
              />

              {healthModalTab === 'stats' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
                      {t("Báo cáo sản lượng giao tiếp & AI tiêu thụ.")}
                    </p>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--color-primary)',
                      background: 'rgba(163, 20, 34, 0.08)',
                      padding: '3px 8px',
                      borderRadius: 6
                    }}>
                      {getDisplayDateFilterText(dateFilter)}
                    </span>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, 1fr)',
                    gap: '0.875rem',
                    alignItems: 'stretch'
                  }}>
                    {/* Zalo Card */}
                    <div style={{
                      padding: '14px 16px',
                      background: 'var(--color-surface)',
                      borderRadius: 16,
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                      height: '100%'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(15, 23, 42, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <img src="https://stc-zpl.zdn.vn/favicon.ico" style={{ width: 18, height: 18 }} alt="Zalo" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Zalo Bot")}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Phân bổ & thông báo")}</span>
                        </div>
                      </div>
                    
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '4px 0' }}>
                        <span
                          title={(stats?.total_zalo_sent ?? 0).toLocaleString()}
                          style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatNumberCompact(stats?.total_zalo_sent ?? 0)}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>{t("tin")}</span>
                      </div>

                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--color-text-muted)',
                        borderTop: '1px solid var(--color-border-light)',
                        paddingTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontWeight: 500
                      }}>
                        <span>{t("Chi phí:")}</span>
                        <span style={{ color: '#059669', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 4, fontSize: '0.6875rem' }}>
                          {t("Miễn phí")}
                        </span>
                      </div>
                    </div>

                    {/* Telegram Card */}
                    <div style={{
                      padding: '16px',
                      background: 'var(--color-surface)',
                      borderRadius: 16,
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      height: '100%'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(15, 23, 42, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" style={{ width: 18, height: 18 }} alt="Telegram" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Telegram Bot")}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Thông báo & Alert")}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '4px 0' }}>
                        <span
                          title={(stats?.total_telegram_sent ?? 0).toLocaleString()}
                          style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatNumberCompact(stats?.total_telegram_sent ?? 0)}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>{t("tin")}</span>
                      </div>

                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--color-text-muted)',
                        borderTop: '1px solid var(--color-border-light)',
                        paddingTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontWeight: 500
                      }}>
                        <span>{t("Chi phí:")}</span>
                        <span style={{ color: '#059669', fontWeight: 600, background: 'rgba(16, 185, 129, 0.1)', padding: '2px 6px', borderRadius: 4, fontSize: '0.6875rem' }}>
                          {t("Miễn phí")}
                        </span>
                      </div>
                    </div>

                    {/* Email Card */}
                    <div style={{
                      padding: '16px',
                      background: 'var(--color-surface)',
                      borderRadius: 16,
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      height: '100%'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <img src="https://www.gstatic.com/images/branding/product/1x/gmail_2020q4_32dp.png" style={{ width: 18, height: 18 }} alt="Gmail" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Email gửi đi")}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Báo cáo & bàn giao")}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '4px 0' }}>
                        <span
                          title={(stats?.total_emails_sent ?? 0).toLocaleString()}
                          style={{ fontSize: '1.45rem', fontWeight: 800, color: '#BD1D2D', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatNumberCompact(stats?.total_emails_sent ?? 0)}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>{t("mail")}</span>
                      </div>

                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--color-text-muted)',
                        borderTop: '1px solid var(--color-border-light)',
                        paddingTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontWeight: 500
                      }}>
                        <span>{t("Chi phí:")}</span>
                        <span style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: '0.7rem', fontVariantNumeric: 'tabular-nums' }}>
                          {(() => {
                            const sentEmails = stats?.total_emails_sent ?? 0;
                            const costUsd = (sentEmails * 0.10) / 1000;
                            const costVnd = costUsd * 25400;
                            return `~$${costUsd.toFixed(3)} (~${Math.round(costVnd)}đ)`;
                          })()}
                        </span>
                      </div>
                    </div>

                    {/* Tokens Card */}
                    <div style={{
                      padding: '16px',
                      background: 'var(--color-surface)',
                      borderRadius: 16,
                      border: '1px solid var(--color-border)',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: 12,
                      height: '100%'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <img src="https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg" style={{ width: 18, height: 18 }} alt="Gemini" />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Token AI sử dụng")}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t("Gemini pre-screening")}</span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', margin: '4px 0' }}>
                        <span
                          title={(stats?.total_tokens_used ?? 0).toLocaleString()}
                          style={{ fontSize: '1.45rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatNumberCompact(stats?.total_tokens_used ?? 0)}
                        </span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>{t("token")}</span>
                      </div>

                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--color-text-muted)',
                        borderTop: '1px solid var(--color-border-light)',
                        paddingTop: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontWeight: 500
                      }}>
                        <span>{t("Chi phí:")}</span>
                        <span style={{ color: 'var(--color-text)', fontWeight: 600, fontSize: '0.7rem' }}>
                          {(() => {
                            const promptT = stats?.total_prompt_tokens_used ?? 0;
                            const compT = stats?.total_completion_tokens_used ?? 0;
                            let costUsd = 0;
                            if (promptT > 0 || compT > 0) {
                              costUsd = (promptT * 0.10 + compT * 0.40) / 1000000;
                            } else {
                              costUsd = (stats?.total_tokens_used ?? 0) * 0.0000001336;
                            }
                            const costVnd = costUsd * 25400;
                            return `~$${costUsd.toFixed(3)} (~${Math.round(costVnd)}đ)`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Full-width Trend Chart Block */}
                  {stats && (
                    <div
                      className="modal-heatmap-container"
                      style={{
                        padding: '12px 16px 12px 12px',
                        background: 'var(--color-bg)',
                        borderRadius: 12,
                        border: '1px solid var(--color-border-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        position: 'relative',
                        opacity: modalChartLoading ? 0.55 : 1,
                        transition: 'opacity 0.15s ease',
                        pointerEvents: modalChartLoading ? 'none' : 'auto'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '2px',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t("Hiệu suất hoạt động hệ thống")}
                          </span>

                          {/* Metric Switcher Pills (DOMATION Segmented Switch) */}
                          <DomSegmentedSwitch<'zalo' | 'telegram' | 'email' | 'token'>
                            size="sm"
                            value={healthChartMetric}
                            onChange={(val) => setHealthChartMetric(val)}
                            options={[
                              { value: 'zalo', label: t('Zalo Bot'), icon: <img src="https://stc-zpl.zdn.vn/favicon.ico" style={{ width: 13, height: 13, borderRadius: '50%' }} alt="Zalo" /> },
                              { value: 'telegram', label: t('Telegram Bot'), icon: <img src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" style={{ width: 13, height: 13 }} alt="Telegram" /> },
                              { value: 'email', label: t('Email gửi'), icon: <img src="https://www.gstatic.com/images/branding/product/1x/gmail_2020q4_32dp.png" style={{ width: 13, height: 13 }} alt="Gmail" /> },
                              { value: 'token', label: t('Token AI'), icon: <img src="https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg" style={{ width: 13, height: 13 }} alt="Gemini" /> },
                            ]}
                          />
                        </div>

                        {!isSingleDay && (
                          <DomSegmentedSwitch<'day' | 'hour'>
                            size="sm"
                            value={modalChartMode}
                            onChange={(val) => setChartMode(val)}
                            options={[
                              { value: 'day', label: t('Theo ngày') },
                              { value: 'hour', label: t('Theo giờ') },
                            ]}
                          />
                        )}
                      </div>

                      {Array.isArray(stats.chartData) && stats.chartData.length > 0 ? (
                        <div style={{ height: 240, width: '100%' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.chartData} margin={{ left: -15, right: 10, top: 15, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" vertical={false} />
                              <XAxis
                                dataKey="time"
                                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                                axisLine={false}
                                tickLine={false}
                              />
                              <YAxis
                                domain={[0, (max) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                                axisLine={false}
                                tickLine={false}
                                width={healthChartMetric === 'token' ? 48 : 34}
                                tickFormatter={(v) => typeof v === 'number' ? (v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString())) : v}
                              />
                              <Tooltip
                                content={<DomChartTooltip valueFormatter={(v) => formatDomNumber(v)} />}
                              />
                              <Bar dataKey="volume" fill={getMetricColor(healthChartMetric)} name={getMetricLabel(healthChartMetric)} fillOpacity={0.9} radius={[4, 4, 0, 0]} maxBarSize={24}>
                                <LabelList dataKey="volume" position="top" style={{ fill: 'var(--color-text)', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} offset={4} formatter={(v: any) => typeof v === 'number' ? v.toLocaleString() : (v ? String(v) : '')} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <DomEmptyChartState title={t('Chưa có dữ liệu thống kê')} minHeight={240} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {healthModalTab === 'connections' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
                    {t("Kiểm tra trạng thái cấu hình và kết nối thời gian thực của các kênh tích hợp.")}
                  </p>

                  {/* 1. Google Sheets Connection */}
                  <div style={{ padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)', flexShrink: 0 }}>
                        <FileSpreadsheet size={16} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>Google Sheets Script</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t("Webhook nhận dữ liệu từ Sheets")}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {connections && connections.length > 0 ? `${connections.length} ${t('kết nối')}` : t('Chưa kết nối')}
                      </span>
                      <span className="ping-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: connections && connections.length > 0 ? 'var(--color-success)' : 'var(--color-warning)' }} />
                    </div>
                  </div>

                  {/* 2. Zalo Notification Bot */}
                  <div style={{ padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <img src="https://stc-zpl.zdn.vn/favicon.ico" alt="Zalo Bot" style={{ width: 20, height: 20, borderRadius: '50%' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>Zalo Notification Bot</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t("Gửi thông báo phân bổ Lead cho Sale")}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {settings?.zalo_bot_token ? t('Đang hoạt động') : t('Chưa cấu hình')}
                      </span>
                      <span className="ping-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: settings?.zalo_bot_token ? 'var(--color-success)' : 'var(--color-danger)' }} />
                    </div>
                  </div>

                  {/* 3. AI Pre-screener Filter */}
                  <div style={{ padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: (settings?.gemini_api_key && Number(settings?.ai_screener_enabled) === 1) ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: (settings?.gemini_api_key && Number(settings?.ai_screener_enabled) === 1) ? 'var(--color-success)' : 'var(--color-warning)', flexShrink: 0 }}>
                        <Zap size={16} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>AI Pre-screener (Gemini)</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t("Lọc và kiểm tra chất lượng bằng AI")}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {(settings?.gemini_api_key && Number(settings?.ai_screener_enabled) === 1) ? t('Đang hoạt động') : t('Đang tắt')}
                      </span>
                      <span className="ping-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: (settings?.gemini_api_key && Number(settings?.ai_screener_enabled) === 1) ? 'var(--color-success)' : 'var(--color-warning)' }} />
                    </div>
                  </div>

                  {/* 4. Core Distribution System */}
                  <div style={{ padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)', flexShrink: 0 }}>
                        <Database size={16} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>Distribution Engine</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t("Lõi điều tuyến chia số tự động")}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {t('Đang hoạt động')}
                      </span>
                      <span className="ping-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)' }} />
                    </div>
                  </div>

                  {/* 5. Database Schema Status */}
                  <div style={{ padding: '12px 14px', background: 'var(--color-bg)', borderRadius: 12, border: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: stats?.db_needs_migration ? 'rgba(245, 158, 11, 0.1)' : 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: stats?.db_needs_migration ? 'var(--color-warning)' : 'var(--color-success)', flexShrink: 0 }}>
                        <Database size={16} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>Database Schema Status</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {stats?.db_needs_migration ? (
                            <a href="/backend/run_migrations.php" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-warning)', textDecoration: 'underline', fontWeight: 600 }}>
                              {t("Cần cập nhật cấu trúc DB. Click để chạy ngay.")}
                            </a>
                          ) : (
                            t("Cơ sở dữ liệu đã ở phiên bản mới nhất")
                          )}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {stats?.db_needs_migration ? t('Cần cập nhật') : t('Đang hoạt động')}
                      </span>
                      <span className="ping-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: stats?.db_needs_migration ? 'var(--color-warning)' : 'var(--color-success)' }} />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
                <button className="btn primary sm" onClick={() => setShowHealthModal(false)}>{t("Đóng")}</button>
              </div>
            </div>
          </CustomModal>
        )}

        {showWarRoom && (
          <React.Suspense fallback={null}>
            <WarRoomFlightDeck
              isOpen={showWarRoom}
              onClose={() => setShowWarRoom(false)}
              stats={stats}
              recentLogs={recentLogs}
            />
          </React.Suspense>
        )}


      </div>
    );
  };

  if (currentViewRole === 'persona') {
    return renderDashboardWrapper(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {renderAdminWelcomeBanner()}
        {renderHeaderForRole(t("Tổng quan Chân dung Học viên & Tiềm năng"), t("Phân tích chuyên sâu theo trường đào tạo, khóa học (Intake), công ty, chức vụ, ngành nghề và độ đầy đủ dữ liệu."))}
        <React.Suspense fallback={<ChartSkeleton />}>
          <CustomerPersonaOverviewDeck
            defaultSegment="student"
            externalDateFilter={dateFilter}
            onOpenContact={(cid, fallbackContact) => {
              if (fallbackContact) {
                setPersonaDrawerContact({ id: cid, ...fallbackContact });
              } else {
                setPersonaDrawerContact({ id: cid });
              }
              api.get(`/contacts/${cid}`).then((res) => {
                const cData = res.data?.data || res.data;
                if (cData && cData.id) {
                  setPersonaDrawerContact(cData);
                }
              }).catch(() => {});
            }}
          />
        </React.Suspense>
      </div>
    );
  }

  if (currentViewRole === 'sales' || currentViewRole === 'sales_performance') {
    return renderDashboardWrapper(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {renderAdminWelcomeBanner()}
        {renderHeaderForRole(t("Hiệu suất Sales & Phân tích Chất lượng Lead"), t("Đo lường tốc độ xử lý data chia vòng, tỷ lệ kết nối, phễu chuyển đổi và doanh số thực thu của đội ngũ Sales."))}
        <React.Suspense fallback={<ChartSkeleton />}>
          <SalesLeadPerformanceDeck embedInPage="dashboard" externalDateFilter={dateFilter} />
        </React.Suspense>
      </div>
    );
  }

  if (currentViewRole === 'meta_ads') {
    return renderDashboardWrapper(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {renderAdminWelcomeBanner()}
        {renderHeaderForRole(t("Meta Ads Full-Funnel Attribution"), t("Đo lường chi tiết chiến dịch, nhóm quảng cáo, CPL, CAC, ROAS và quy kết doanh thu đa điểm chạm."))}
        <React.Suspense fallback={<ChartSkeleton />}>
          <MetaAdsAttributionDeck
            externalDateFilter={dateFilter}
            customStartDate={startDate}
            customEndDate={endDate}
            onOpenContact={(cid, fallbackContact) => {
              if (fallbackContact) {
                setPersonaDrawerContact({ id: cid, ...fallbackContact });
              } else {
                setPersonaDrawerContact({ id: cid });
              }
              api.get(`/contacts/${cid}`).then((res) => {
                const cData = res.data?.data || res.data;
                if (cData && cData.id) {
                  setPersonaDrawerContact(cData);
                }
              }).catch(() => {});
            }}
          />
        </React.Suspense>
      </div>
    );
  }

  if (currentViewRole === 'hrm' || currentViewRole === 'hr') {
    return renderDashboardWrapper(
      <HrExecutiveOverviewSection
        hrLoading={hrLoading}
        hrProfiles={hrProfiles}
        hrLeaves={hrLeaves}
        hrAdvances={hrAdvances}
        hrTeams={hrTeams}
        hrTodayCheckIns={hrTodayCheckIns}
        hrWeeklyCheckIns={hrWeeklyCheckIns}
        hrMonthCheckIns={hrMonthCheckIns}
        hrShifts={hrShifts}
        hrDashboardPayslips={hrDashboardPayslips}
        isMobile={isMobile}
        user={user}
        renderAdminWelcomeBanner={renderAdminWelcomeBanner}
        renderWelcomeBannerForRole={renderWelcomeBannerForRole}
        renderHeaderForRole={renderHeaderForRole}
        onNavigate={(path) => navigate(path)}
        t={t}
      />
    );
  }

  if (currentViewRole === 'finance' || currentViewRole === 'accountant') {
    return renderDashboardWrapper(
      <AccountantOrdersAndCashflowSection
        stats={stats}
        loading={loading}
        poList={poList}
        soList={soList}
        poFilter={poFilter}
        setPoFilter={setPoFilter}
        activeOrderType={activeOrderType}
        setActiveOrderType={setActiveOrderType}
        poPage={poPage}
        setPoPage={setPoPage}
        soPage={soPage}
        setSoPage={setSoPage}
        ORDER_PAGE_SIZE={ORDER_PAGE_SIZE}
        usersList={usersList}
        hrProfiles={hrProfiles}
        pendingExpensesCount={pendingExpensesCount}
        dateFilter={dateFilter}
        getComparisonLabel={getComparisonLabel}
        isMobile={isMobile}
        user={user}
        renderAdminWelcomeBanner={renderAdminWelcomeBanner}
        renderWelcomeBannerForRole={renderWelcomeBannerForRole}
        renderHeaderForRole={renderHeaderForRole}
        onNavigate={(path) => navigate(path)}
        onSelectExpense={(id) => setSelectedExpenseId(id)}
        onSelectDeposit={(deposit) => setSelectedDeposit(deposit)}
        t={t}
      />
    );
  }

  if (currentViewRole === 'marketing') {
    // Formatter helpers
    const fmtVndCompact = (val: number) => {
      const num = Number(val || 0);
      if (num >= 1e9) {
        return (num / 1e9).toFixed(1).replace(/\.0$/, '') + ' tỷ';
      }
      if (num >= 1e6) {
        return (num / 1e6).toFixed(0) + ' triệu';
      }
      return num.toLocaleString();
    };

    // Read metrics from API response (using 100% REAL DATA from backend)
    const cohortData = (stats?.mktCohortConversion && stats.mktCohortConversion.length > 0) 
      ? stats.mktCohortConversion 
      : [];

    const conversionData = mktFilterType === 'close_date'
      ? ((stats?.mktConversionByCloseMonth && stats.mktConversionByCloseMonth.length > 0) ? stats.mktConversionByCloseMonth : [])
      : ((stats?.mktConversionByLeadMonth && stats.mktConversionByLeadMonth.length > 0) ? stats.mktConversionByLeadMonth : []);

    const revenueData = (stats?.mktRevenueAndProjection && stats.mktRevenueAndProjection.length > 0)
      ? stats.mktRevenueAndProjection
      : [];

    const leadSourceData = (stats?.leadSourceStats && stats.leadSourceStats.length > 0)
      ? stats.leadSourceStats
      : (stats?.sourceStats && stats.sourceStats.length > 0 ? stats.sourceStats : []);

    const totalLeadsSum = cohortData.length > 0
      ? cohortData.reduce((acc: number, c: any) => acc + (c.total_leads || 0), 0)
      : (Number(stats?.total_today || 0) + Number(stats?.distributed_today || 0) || Number(stats?.contacts || 0) || 0);
    const totalWonSum = cohortData.reduce((acc: number, c: any) => acc + (c.converted_3_months || 0), 0);
    const calculatedRate = totalLeadsSum > 0 ? ((totalWonSum / totalLeadsSum) * 100).toFixed(1) : '0.0';

    const mktStats = {
      totalLeads: totalLeadsSum || (stats?.contacts || 0),
      todayLeads: stats?.total_today || 0,
      conversionRate: calculatedRate,
      activeCampaigns: campaignsList.length > 0 ? campaignsList.filter((c: any) => c.status === 'active').length : 0
    };

    const mktIssues = [
      {
        icon: <GitBranch size={14} style={{ color: '#C6333D' }} />,
        text: `${mktStats.activeCampaigns} ${t('chiến dịch Ads đang hoạt động trên hệ thống.')}`,
        action: () => navigate('/contacts')
      }
    ];

    return renderDashboardWrapper(
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        {/* Welcome Banner */}
        {(user?.role === 'admin' || user?.role === 'director' || user?.role === 'superadmin') 
          ? renderAdminWelcomeBanner() 
          : renderWelcomeBannerForRole(t('Chào mừng trở lại! Thống kê nguồn lead, chiến dịch quảng cáo và chuyển đổi Ads.'), mktIssues)}

        {/* Header */}
        {renderHeaderForRole(t("Tổng quan Hiệu suất Chiến dịch Ads & Marketing"), t("Đo lường lượng lead đổ về, chi phí quảng cáo Ads và hiệu quả chuyển đổi đa kênh."))}

        {/* KPIs — Semantic Multi-Accent */}
        <div className="dashboard-kpi-grid">
          {renderKpiCardForRole(t('TỔNG SỐ LEAD'), mktStats.totalLeads.toLocaleString(), Users, '#2563EB', 'total-card', () => navigate('/contacts'))}
          {renderKpiCardForRole(t('LEAD MỚI HÔM NAY'), '+' + mktStats.todayLeads, UserPlus, '#10B981', 'distributed-card', () => navigate('/contacts'))}
          {renderKpiCardForRole(t('TỶ LỆ CHUYỂN ĐỔI'), mktStats.conversionRate + '%', TrendingUp, '#6366F1', 'duplicates-card', () => navigate('/contacts'))}
          {renderKpiCardForRole(t('CHIẾN DỊCH CHẠY'), String(mktStats.activeCampaigns), GitBranch, '#F59E0B', 'fair_share_equity-card', () => navigate('/rules'))}
        </div>

        {/* ROW 1: Cohort Conversion Speed & Customers + Conversion Rate */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem', marginBottom: '0.25rem' }}>
          
          {/* Chart 1: Cohort Conversion Speed */}
          <div className="card" style={{ padding: '1.35rem', border: '1px solid var(--color-border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
                {t('Tốc độ Chuyển đổi Lead theo Nhóm (Cohort)')}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                {t('Số lead chốt thành công trong vòng 1, 2, 3 tháng kể từ ngày tạo')}
              </p>
            </div>
            <div style={{ height: 260 }}>
              {cohortData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={cohortData} margin={{ left: -15, right: 5, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" vertical={false} />
                    <XAxis dataKey="cohort_month" tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DomChartTooltip />} />
                    <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                    <Bar dataKey="converted_1_month" name={t('Trong 1 tháng')} fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={16} />
                    <Bar dataKey="converted_2_months" name={t('Trong 2 tháng')} fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={16} />
                    <Bar dataKey="converted_3_months" name={t('Trong 3 tháng')} fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: 8 }}>
                  <TrendingUp size={28} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: '0.8125rem' }}>{t('Chưa có dữ liệu chuyển đổi deal theo cohort')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Chart 2: Customers & Conversion Rate */}
          <div className="card" style={{ padding: '1.35rem', border: '1px solid var(--color-border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
                  {t('Số lượng Khách hàng & Tỷ lệ Convert')}
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                  {t('Khách hàng mới chốt thành công và tỷ lệ chuyển đổi')}
                </p>
              </div>
              
              {/* Option Selector Toggle */}
              <DomSegmentedSwitch<'close_date' | 'lead_date'>
                size="sm"
                value={mktFilterType}
                onChange={setMktFilterType}
                options={[
                  { value: 'close_date', label: t('Theo ngày chốt') },
                  { value: 'lead_date', label: t('Theo ngày tạo lead') },
                ]}
              />
            </div>

            <div style={{ height: 260 }}>
              {conversionData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={conversionData} margin={{ left: -15, right: -10, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip content={<DomChartTooltip />} />
                    <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                    <Bar yAxisId="left" dataKey="total_leads" name={t('Tổng Lead')} fill="#94A3B8" radius={[4, 4, 0, 0]} maxBarSize={14} />
                    <Bar yAxisId="left" dataKey="customer_count" name={t('Khách hàng chốt')} fill="#2563EB" radius={[4, 4, 0, 0]} maxBarSize={14} />
                    <Line yAxisId="right" type="monotone" dataKey="conversion_rate" name={t('Tỷ lệ Convert (%)')} stroke="#10B981" strokeWidth={2.5} dot={{ r: 3.5, stroke: '#10B981', strokeWidth: 1.5, fill: '#fff' }} activeDot={{ r: 5 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: 8 }}>
                  <Users size={28} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: '0.8125rem' }}>{t('Chưa có dữ liệu khách hàng chốt')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ROW 2: Revenue vs Projection & Lead Sources */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '6fr 4fr', gap: '1.25rem', marginBottom: '0.25rem' }}>
          
          {/* Chart 3: Revenue & Projected Revenue */}
          <div className="card" style={{ padding: '1.35rem', border: '1px solid var(--color-border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
                {t('Doanh thu Thực tế vs Dự kiến')}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                {t('So sánh doanh thu đã thanh toán và dự kiến thu từ Sales Orders')}
              </p>
            </div>
            <div style={{ height: 260 }}>
              {revenueData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={revenueData} margin={{ left: -10, right: 5, top: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.22)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--color-text-muted)', fontWeight: 500 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmtVndCompact} tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip content={<DomChartTooltip valueFormatter={(value) => fmtVndCompact(Number(value))} />} />
                    <Legend verticalAlign="top" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 600 }} />
                    <Area type="monotone" dataKey="realized_revenue" name={t('Doanh thu thực tế')} fill="rgba(16, 185, 129, 0.14)" stroke="#10B981" strokeWidth={2.5} />
                    <Bar dataKey="projected_revenue" name={t('Doanh thu dự kiến')} fill="#6366F1" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: 8 }}>
                  <BarChart2 size={28} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: '0.8125rem' }}>{t('Chưa có dữ liệu hóa đơn hoặc doanh thu thực tế')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Lead Sources */}
          <div className="card" style={{ padding: '1.35rem', border: '1px solid var(--color-border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
                {t('Tỷ trọng Kênh Quảng cáo')}
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                {t('Tỷ trọng lead thu về phân bổ theo các kênh quảng cáo')}
              </p>
            </div>
            <div style={{ height: 260, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {leadSourceData.length > 0 ? (
                <>
                  <div style={{ height: 160 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={leadSourceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={2}>
                          {leadSourceData.map((_entry: any, idx: number) => (
                            <Cell key={`cell-${idx}`} fill={EXECUTIVE_PALETTE[idx % EXECUTIVE_PALETTE.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<DomChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.75rem', marginTop: '12px', padding: '0 8px' }}>
                    {leadSourceData.map((entry: any, idx: number) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '2px', background: EXECUTIVE_PALETTE[idx % EXECUTIVE_PALETTE.length], flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.name}</span>
                        <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>({Number(entry.value).toLocaleString()})</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', gap: 8 }}>
                  <BarChart2 size={28} style={{ opacity: 0.3 }} />
                  <span style={{ fontSize: '0.8125rem' }}>{t('Chưa có dữ liệu nguồn lead')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ROW 3: Active Campaigns list */}
        <div className="card" style={{ padding: '1.35rem', border: '1px solid var(--color-border)', borderRadius: 16, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div>
            <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
              {t('Các Chiến dịch Marketing Đang Hoạt động')}
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
              {t('Danh sách chiến dịch quảng cáo và đồng bộ dữ liệu từ CSDL')}
            </p>
          </div>
          
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', textAlign: 'left', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                  <th style={{ padding: '10px 14px' }}>{t('Tên chiến dịch')}</th>
                  <th style={{ padding: '10px 14px' }}>{t('Dự án liên kết')}</th>
                  <th style={{ padding: '10px 14px' }}>{t('Ngày bắt đầu')}</th>
                  <th style={{ padding: '10px 14px' }}>{t('Ngày kết thúc')}</th>
                  <th style={{ padding: '10px 14px' }}>{t('Trạng thái')}</th>
                </tr>
              </thead>
              <tbody>
                {campaignsList.length > 0 ? (
                  campaignsList.map((camp: any, idx: number) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)', height: '42px' }}>
                      <td style={{ padding: '8px 14px', fontWeight: 700, color: 'var(--color-text)' }}>{camp.name}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>{camp.project_name || camp.project_code || t('Không có')}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--color-text-muted)' }}>{camp.start_date ? new Date(camp.start_date).toLocaleDateString('vi-VN') : '-'}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--color-text-muted)' }}>{camp.end_date ? new Date(camp.end_date).toLocaleDateString('vi-VN') : '-'}</td>
                      <td style={{ padding: '8px 14px' }}>
                        <span className={camp.status === 'active' ? 'dom-tone-emerald' : 'dom-tone-slate'} style={{ padding: '3px 9px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                          {camp.status === 'active' ? t('Đang chạy') : t('Tạm dừng')}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                      {t('Chưa có chiến dịch nào được khởi tạo')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    );
  }

  return renderDashboardWrapper(
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {renderAdminWelcomeBanner()}

      {renderSubTabs()}

      {/* Header */}
      <DomDashboardToolbar
        left={
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>{t("Tổng quan Phân bổ Data")}</h1>
            <p className="page-subtitle" style={{ marginTop: '4px', marginBottom: 0 }}>{t("Phân tích hiệu suất giao data theo thời gian thực — Hệ thống đang hoạt động trơn tru.")}</p>
          </div>
        }
        right={
          <>
            <div className="mobile-flex-1" style={{ position: 'relative', zIndex: 85, flex: '1 1 auto', minWidth: isMobile ? '0' : '180px', maxWidth: isMobile ? 'none' : '280px' }}>
              <CustomSelect
                size="sm"
                options={dateOptions}
                value={dateFilter}
                onChange={(val) => {
                  if (val === 'Tùy chỉnh') {
                    setShowDateModal(true);
                    return;
                  }
                  handleUpdateDateFilter(String(val));
                }}
                width="100%"
              />
            </div>

            <DomToolbarButton
              variant="primary"
              className="resource-health-btn"
              onClick={() => setShowHealthModal(true)}
              title={t("Kiểm tra kết nối hệ thống / Tài nguyên sử dụng")}
              aria-label={t("Kiểm tra kết nối hệ thống / Tài nguyên sử dụng")}
              icon={<Server size={15} />}
              style={{ width: 36, minWidth: 36, padding: 0 }}
            />
          </>
        }
      />

      

      {/* AI Pre-screener evaluation strip */}
      {aiScreenerEnabled && (
        loading && !stats ? (
          <div
            key="ai-screener-skeleton"
            className="card"
            style={{
              padding: '1rem 1.5rem',
              marginBottom: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              background: theme === 'dark' ? 'rgba(163, 20, 34, 0.08)' : 'rgba(163, 20, 34, 0.02)',
              border: theme === 'dark' ? '1px solid rgba(163, 20, 34, 0.15)' : '1px solid rgba(163, 20, 34, 0.08)',
              minHeight: '94px',
              height: 'auto',
              boxSizing: 'border-box',
              animation: 'slideUp 0.4s ease-out both',
              animationDelay: '120ms'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Skeleton width="20px" height="20px" borderRadius="4px" />
                <Skeleton width="220px" height="16px" borderRadius="4px" />
              </div>
              <Skeleton width="120px" height="14px" borderRadius="4px" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <Skeleton width="100%" height="10px" borderRadius="999px" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Skeleton width="160px" height="12px" borderRadius="4px" />
                <Skeleton width="140px" height="12px" borderRadius="4px" />
              </div>
            </div>
          </div>
        ) : (
          stats && (stats.ai_screener_enabled === 1 || stats.ai_screener_enabled === '1' || stats.ai_screener_enabled === true) && (
            <div
              key="ai-screener-loaded"
              className="card hover-lift"
              onClick={() => navigate('/gatekeeper')}
              style={{
                padding: '1rem 1.5rem',
                marginBottom: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                animation: 'slideUp 0.4s ease-out both',
                animationDelay: '120ms',
                background: theme === 'dark' ? 'rgba(255, 69, 58, 0.12)' : 'rgba(189, 29, 45, 0.04)',
                border: theme === 'dark' ? '1px solid rgba(255, 69, 58, 0.25)' : '1px solid rgba(189, 29, 45, 0.12)',
                cursor: 'pointer',
                minHeight: '94px',
                height: 'auto',
                boxSizing: 'border-box',
                opacity: loading ? 0.7 : 1,
                transition: 'opacity 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <img
                    src="/LOGO.jpg"
                    alt="IDEAS AI Logo"
                    style={{ width: '20px', height: '20px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {t('Đánh giá chất lượng từ AI Pre-screener')}
                  </span>
                </div>
                {aiTotal > 0 && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                    {t('Tổng số đánh giá:')} <strong style={{ color: 'var(--color-text)' }}>{aiTotal}</strong>
                  </span>
                )}
              </div>

              {aiTotal > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {/* Progress bar */}
                  <div style={{ width: '100%', height: '10px', background: 'var(--color-border-light)', borderRadius: '999px', display: 'flex', overflow: 'hidden', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)' }}>
                    <div
                      style={{
                        width: `${aiPassedPercent}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, var(--color-primary) 0%, #e05e6b 100%)',
                        transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                      title={`${t('Đạt chuẩn')}: ${aiPassedPercent}%`}
                    />
                    <div
                      style={{
                        width: `${aiFailedPercent}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #f59e0b 0%, var(--color-warning) 100%)',
                        transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)'
                      }}
                      title={`${t('Dưới chuẩn')}: ${aiFailedPercent}%`}
                    />
                  </div>

                  {/* Labels/Stats detail */}
                  <div className="mobile-stack" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', fontWeight: 600, marginTop: '2px', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-primary)' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)' }} />
                      <span>
                        {t('Đạt chuẩn (Passed):')} <strong>{aiPassedPercent}%</strong> ({aiPassed} lead)
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#d97706' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                      <span>
                        {t('Dưới chuẩn:')} <strong>{aiFailedPercent}%</strong> ({aiFailed} lead)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)', opacity: 0.5 }} />
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>
                    {t('Không có dữ liệu đánh giá từ AI Pre-screener trong khoảng thời gian này')}
                  </span>
                </div>
              )}
            </div>
          )
        )
      )}

      {/* KPI Cards — DOMATION Brand Red & Slate */}
      <div className="dashboard-kpi-grid">
        {loading && !stats ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`kpi-skeleton-${i}`}
              style={{
                animation: 'slideUp 0.4s ease-out both',
                animationDelay: '180ms'
              }}
            >
              <KpiCardSkeleton />
            </div>
          ))
        ) : (
          <>
            <DomKpiTile
              label={t('TỔNG DATA TIẾP NHẬN')}
              value={formatDomNumber(stats?.total_today ?? 0)}
              icon={<GitBranch size={16} />}
              accent="blue"
              growth={parseDeltaPct(stats?.total_change)}
              comparisonLabel={getComparisonLabel(dateFilter)}
              onClick={() => navigate('/data?status=all')}
              breakdown={
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <span>• Phân bổ: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(stats?.distributed_today ?? 0)}</strong></span>
                  <span>• Tự do: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(stats?.distributed_self ?? 0)}</strong></span>
                </div>
              }
            />

            <DomKpiTile
              label={t('CHIA THÀNH CÔNG')}
              value={formatDomNumber(stats?.distributed_today ?? 0)}
              icon={<UserPlus size={16} />}
              accent="emerald"
              onClick={() => navigate('/data?status=distributed_valid')}
              breakdown={
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span>• Tỷ lệ chia: <strong style={{ color: 'var(--color-text)' }}>{stats?.total_today > 0 ? Math.round(((stats?.distributed_today ?? 0) / stats.total_today) * 100) : 0}%</strong></span>
                    <span>• Đã nhận: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(stats?.distributed_today ?? 0)}</strong></span>
                  </div>
                  <span>• Theo vòng: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber((stats?.distributed_assigned ?? 0) + (stats?.distributed_compensation ?? 0))}</strong> lead</span>
                </div>
              }
            />

            <DomKpiTile
              label={t('TỶ LỆ XỬ LÝ SLA')}
              value={stats?.fair_share_equity || '100%'}
              icon={<CheckCircle2 size={16} />}
              accent="indigo"
              onClick={() => navigate('/fair-share')}
              breakdown={
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span>• Đúng hạn: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(stats?.processed_on_time ?? stats?.distributed_today ?? 0)}</strong></span>
                    <span>• Trễ hạn: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(stats?.overdue_count ?? 0)}</strong></span>
                  </div>
                  <span>• Độ lệch chuẩn SD: <strong style={{ color: 'var(--color-text)' }}>{stats?.fair_share_sd ?? '0.0'}</strong></span>
                </div>
              }
            />

            <DomKpiTile
              label={t('CẦN CHÚ Ý / NGOÀI GIỜ')}
              value={formatDomNumber((stats?.duplicates ?? 0) + (stats?.errors ?? 0) + (stats?.pending_work_hours_count ?? 0))}
              icon={<AlertTriangle size={16} />}
              accent="amber"
              onClick={() => navigate('/tickets')}
              breakdown={
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <span>• Ngoài giờ: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(stats?.pending_work_hours_count ?? 0)}</strong></span>
                    <span>• Lỗi/Trùng: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber((stats?.duplicates ?? 0) + (stats?.errors ?? 0))}</strong></span>
                  </div>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                    {stats?.ticket_errors ?? 0} ticket &amp; {stats?.pending_work_hours_count ?? 0} lead ngoài giờ →
                  </span>
                </div>
              }
            />
          </>
        )}
      </div>

      {/* Chart + List row */}
      {loading && !stats ? (
        <div key="chart-row-skeleton" className="responsive-grid-6-4" style={{ display: 'grid', gridTemplateColumns: '6fr 4fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <div className="card" style={{ padding: '1.25rem', animation: 'slideUp 0.4s ease-out both', animationDelay: '300ms' }}>
            <Skeleton width={220} height={16} style={{ marginBottom: 8 }} />
            <Skeleton width={300} height={11} style={{ marginBottom: 24 }} />
            <Skeleton width="100%" height={260} borderRadius={12} />
          </div>
          <div className="card" style={{ padding: '1.25rem', animation: 'slideUp 0.4s ease-out both', animationDelay: '300ms' }}>
            <Skeleton width={180} height={16} style={{ marginBottom: 20 }} />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}>
                <Skeleton width={32} height={32} borderRadius="50%" />
                <div style={{ flex: 1 }}>
                  <Skeleton width="60%" height={13} />
                  <Skeleton width="40%" height={10} style={{ marginTop: 6 }} />
                </div>
                <Skeleton width={60} height={22} borderRadius={12} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div key="chart-row-loaded" className="responsive-grid-6-4" style={{ display: 'grid', gridTemplateColumns: '6fr 4fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          <LeadTrafficTrendCard
            chartData={stats?.chartData}
            displayChartMode={displayChartMode}
            chartMode={chartMode}
            setChartMode={setChartMode}
            isSingleDay={isSingleDay}
            isMobile={isMobile}
            dateFilterLabel={getDisplayDateFilterText(dateFilter)}
            isCustomDate={dateFilter === 'Tùy chỉnh'}
            daysOfWeek={daysOfWeek}
            daysOfWeekShort={daysOfWeekShort}
            t={t}
          />

          <div className="card" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, animation: 'slideUp 0.4s ease-out both', animationDelay: '300ms' }}>
            <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', margin: 0 }}>{t('Lịch sử giao Data gần đây')}</h3>
              <span
                style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 700, cursor: 'pointer' }}
                onClick={() => navigate('/data')}
              >{t('Xem tất cả')} →</span>
            </div>
            <div style={{ flex: 1, padding: '0.5rem 0.5rem 1.25rem 0.5rem', overflowY: 'auto', maxHeight: 280 }}>
              {recentLogs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {recentLogs.map((log) => (
                    <div key={log.id} className="hover-lift" style={{
                      padding: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                      borderRadius: 'var(--radius-lg)', cursor: 'pointer', transition: 'background 0.2s',
                      borderBottom: '1px solid var(--color-border-light)'
                    }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => {
                        if (log.status === 'databank' || log.status === 'released_to_kho') {
                          navigate('/databank');
                        } else {
                          navigate(`/data?open_id=${log.id}&auto_open=true`);
                        }
                      }}
                    >
                      <Avatar
                        src={
                          log.status === 'pending_approval'
                            ? '/imgs/warn_icon.png'
                            : (log.status === 'rejected' || log.status === 'pending_work_hours' || !log.assigned_to_name || log.assigned_to_name === '-')
                              ? '/LOGO.jpg'
                              : log.status === 'blacklisted'
                                ? '/imgs/angry_icon.jpg'
                                : (log.assigned_to_avatar || '/LOGO.jpg')
                        }
                        name={
                          log.status === 'pending_approval'
                            ? 'IDEAS AI - Screener'
                            : (log.status === 'pending_work_hours' || !log.assigned_to_name || log.assigned_to_name === '-')
                              ? 'IDEAS Bot'
                              : log.status === 'rejected'
                                ? 'IDEAS AI - Evaluator'
                                : log.status === 'blacklisted'
                                  ? 'IDEAS AI - Angry'
                                  : log.assigned_to_name
                        }
                        size={32}
                      />
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.875rem', color: 'var(--color-text)' }}>
                          {log.status === 'pending_approval'
                            ? 'IDEAS AI - Screener'
                            : (log.status === 'pending_work_hours' || !log.assigned_to_name || log.assigned_to_name === '-')
                              ? 'IDEAS Bot'
                              : log.status === 'rejected'
                                ? 'IDEAS AI - Evaluator'
                                : log.status === 'blacklisted'
                                  ? 'IDEAS AI - Angry'
                                  : log.assigned_to_name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {log.lead_name || t('Khách hàng')} • {parseServerDate(log.created_at).toLocaleString(language === 'en' ? 'en-US' : 'vi-VN')}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        {(() => {
                          const getBadgeConfig = (status: string, roundName?: string, reportStatus?: string, aiScreenerStatus?: string, createdAt?: string) => {
                            if (log.source === 'ca_nhan' || log.source === 'gioi_thieu') {
                              return { bg: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', text: t('Data Self') };
                            }
                            if (status === 'error' && reportStatus === 'approved') {
                              return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', text: 'Ticket' };
                            }
                            if (status === 'pending_approval' && aiScreenerStatus === 'pending') {
                              const now = new Date();
                              const created = createdAt ? parseServerDate(createdAt) : now;
                              const diffMins = (now.getTime() - created.getTime()) / 60000;
                              if (diffMins >= -2 && diffMins < 5) {
                                return { bg: 'rgba(189, 29, 45, 0.12)', color: '#a31422', text: t('Chờ AI đánh giá') };
                              }
                            }
                            switch (status) {
                              case 'assigned':
                                return { bg: 'var(--color-success-light)', color: 'var(--color-success)', text: t(roundName || '') || t('Đã chia') };
                              case 'compensation':
                                return { bg: 'var(--color-primary-light)', color: 'var(--color-primary)', text: t('Data Bù') };
                              case 'pending_work_hours':
                                return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', text: t('Chờ giờ làm') };
                              case 'duplicate':
                                return { bg: 'var(--color-danger-light)', color: 'var(--color-danger)', text: t('Trùng lặp') };
                              case 'pending':
                                return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', text: t('Chờ chia') };
                              case 'error':
                                return { bg: 'var(--color-danger-light)', color: 'var(--color-danger)', text: 'Ticket' };
                              case 'silent':
                                return { bg: 'var(--color-border)', color: 'var(--color-text-muted)', text: t('Chỉ đồng bộ') };
                              case 'pending_approval':
                                return { bg: 'var(--color-warning-light)', color: 'var(--color-warning)', text: t('Tạm giữ') };
                              case 'rejected':
                                return { bg: 'var(--color-danger-light)', color: 'var(--color-danger)', text: t('Dưới chuẩn') };
                              case 'blacklisted':
                                return { bg: 'var(--color-danger-light)', color: 'var(--color-danger)', text: t('Blacklist') };
                              case 'reminder':
                                return {
                                  bg: theme === 'dark' ? 'rgba(245, 158, 11, 0.16)' : '#fef3c7',
                                  color: theme === 'dark' ? '#fbbf24' : '#b45309',
                                  text: t('Nhắc lại')
                                };
                              case 'databank_claim':
                                return { bg: 'rgba(16, 185, 129, 0.12)', color: '#10b981', text: 'Databank Claim' };
                              case 'databank':
                              case 'released_to_kho':
                                return { bg: 'rgba(59, 130, 246, 0.12)', color: '#3b82f6', text: 'Databank' };
                              default:
                                return { bg: 'var(--color-border)', color: 'var(--color-text-muted)', text: status };
                            }
                          };
                          const badge = getBadgeConfig(log.status, log.round_name, log.report_status, log.ai_screener_status, log.created_at);
                          return (
                            <span
                              className="badge recent-log-badge"
                              style={{
                                background: badge.bg,
                                color: badge.color,
                                border: 'none',
                                cursor: (log.status === 'databank' || log.status === 'databank_claim' || log.status === 'released_to_kho') ? 'pointer' : 'default'
                              }}
                              onClick={(e) => {
                                if (log.status === 'databank' || log.status === 'databank_claim' || log.status === 'released_to_kho') {
                                  e.stopPropagation();
                                  navigate('/databank');
                                }
                              }}
                            >
                              {badge.text}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>{t('Không có data mới')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Source Pie + Quality row */}
      {loading && !stats ? (
        <div key="source-quality-skeleton" className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="card" style={{ padding: '1.25rem' }}>
              <Skeleton width={200} height={16} style={{ marginBottom: 20 }} />
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Skeleton width="50%" height={13} />
                    <Skeleton width={40} height={13} />
                  </div>
                  <Skeleton width="100%" height={8} borderRadius={4} />
                </div>
              ))}
            </div>
          ))}
        </div>

      ) : (
        <>
          <div key="source-quality-loaded" className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <TopConsultantsCard
              consultants={stats?.topConsultants}
              onSelectConsultant={(c) => {
                setStatsConsultant(c);
                syncDateFilterToModal(dateFilter);
                setStatsModalOpen(true);
              }}
              t={t}
            />
            <RoundDistributionCard
              roundRatio={stats?.roundRatio}
              isMobile={isMobile}
              t={t}
            />
          </div>

          {/* NEW ROW: Source Stats & Error Stats */}
          <div className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <LeadSourceBreakdownCard
              sourceStats={stats?.sourceStats}
              leadSourceStats={stats?.leadSourceStats}
              sourceViewMode={sourceViewMode}
              setSourceViewMode={setSourceViewMode}
              isMobile={isMobile}
              t={t}
            />

            {/* Error Tickets by TVV (Vertical Column Chart) */}
            <DomPanelCard
              title={t('Thống kê lỗi Ticket')}
              iconAccent="rose"
              deferred
              rightSlot={
                stats?.errorStats && stats.errorStats.length > 0 ? (
                  <span className="dom-tone-rose" style={{ fontSize: '0.75rem', fontWeight: 700, padding: '3px 9px', borderRadius: '8px', fontVariantNumeric: 'tabular-nums' }}>
                    {ensureArray<any>(stats.errorStats).reduce((sum: number, e: any) => sum + (Number(e?.errors) || 0), 0)} {t('lỗi được duyệt')}
                  </span>
                ) : undefined
              }
            >
              <div style={{ minHeight: 260 }}>
                {Array.isArray(stats?.errorStats) && stats.errorStats.length > 0 ? (
                  (() => {
                    const sortedData = [...stats.errorStats]
                      .sort((a: any, b: any) => (b.errors || 0) - (a.errors || 0))
                      .slice(0, 10);
                    return (
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={sortedData} margin={{ top: 20, right: 10, left: -10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(148, 163, 184, 0.22)" />
                          <XAxis
                            dataKey="name"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: isMobile ? 10 : 11, fill: 'var(--color-text-muted)', fontWeight: 500 }}
                            interval={0}
                            angle={isMobile ? -25 : -12}
                            textAnchor="end"
                            height={isMobile ? 50 : 40}
                          />
                          <YAxis
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                          />
                          <Tooltip
                            cursor={{ fill: 'rgba(244, 63, 94, 0.06)' }}
                            content={<DomChartTooltip valueFormatter={(v) => `${formatDomNumber(v)} lỗi`} />}
                          />
                          <Bar dataKey="errors" fill="#F43F5E" radius={[5, 5, 0, 0]} barSize={26} name={t("Số lỗi được duyệt")}>
                            <LabelList dataKey="errors" position="top" style={{ fill: 'var(--color-text)', fontSize: '11px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} offset={6} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()
                ) : (
                  <DomEmptyChartState title={t('Chưa có TVV nào có lỗi được duyệt')} minHeight={240} />
                )}
              </div>
            </DomPanelCard>
          </div>

          {/* New Row: Out-of-Hours Lead Ratio & Rounds Fairness Audit Comparison */}
          <div className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>

            {/* Out-of-Hours Lead Ratio Card */}
            <DomPanelCard
              title={t('Phân tích Data Ngoài Giờ')}
              subtitle={t('Tỷ lệ lead tiếp nhận ngoài khung giờ làm việc')}
              iconAccent="amber"
              deferred
            >
              <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: 165, height: 165, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: t('Ngoài giờ làm việc'), value: stats?.pending_work_hours_count || 0, color: '#F59E0B' },
                          { name: t('Trong giờ làm việc'), value: Math.max(0, (stats?.total_today || 0) - (stats?.pending_work_hours_count || 0)), color: '#2563EB' }
                        ].filter(item => item.value > 0 || (stats?.total_today === 0 && item.color === '#2563EB'))}
                        cx="50%"
                        cy="50%"
                        innerRadius={54}
                        outerRadius={78}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {([
                          { name: t('Ngoài giờ làm việc'), value: stats?.pending_work_hours_count || 0, color: '#F59E0B' },
                          { name: t('Trong giờ làm việc'), value: Math.max(0, (stats?.total_today || 0) - (stats?.pending_work_hours_count || 0)), color: '#2563EB' }
                        ].filter(item => item.value > 0 || (stats?.total_today === 0 && item.color === '#2563EB'))).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${formatDomNumber(v)} lead`} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)' }}>
                      {stats?.out_of_hours_ratio ?? '0%'}
                    </span>
                    <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                      {t('Ngoài giờ')}
                    </span>
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%', fontVariantNumeric: 'tabular-nums' }}>
                  {(() => {
                    const ratioNum = parseFloat(stats?.out_of_hours_ratio || '0');
                    const healthColor = ratioNum > 40 ? '#ef4444' : ratioNum > 20 ? '#f59e0b' : '#10b981';
                    const inWorkRatio = (100 - ratioNum).toFixed(1) + '%';
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--color-bg-secondary)', borderRadius: 8, fontSize: '0.8125rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#F59E0B' }} />
                            {t('Ngoài giờ')}
                          </span>
                          <strong style={{ color: healthColor, fontWeight: 700 }}>
                            {formatDomNumber(stats?.pending_work_hours_count || 0)} lead ({stats?.out_of_hours_ratio ?? '0%'})
                          </strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--color-bg-secondary)', borderRadius: 8, fontSize: '0.8125rem' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2563EB' }} />
                            {t('Trong giờ')}
                          </span>
                          <strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>
                            {formatDomNumber(Math.max(0, (stats?.total_today || 0) - (stats?.pending_work_hours_count || 0)))} lead ({inWorkRatio})
                          </strong>
                        </div>
                      </>
                    );
                  })()}

                  <div style={{ borderTop: '1px dashed var(--color-border)', paddingTop: '0.625rem', marginTop: '0.25rem', fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>{t('Chờ giờ làm (hiện tại)')}:</span>
                      <strong style={{ color: 'var(--color-text)', fontWeight: 700 }}>{formatDomNumber(stats?.pending_work_hours_count || 0)} lead</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{t('Thay đổi so với kỳ trước')}:</span>
                      <span style={{
                        color: (stats?.out_of_hours_change || '').startsWith('-') ? '#10b981' : '#ef4444',
                        background: (stats?.out_of_hours_change || '').startsWith('-') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 2
                      }}>
                        {(stats?.out_of_hours_change || '').startsWith('-') ? '↓' : '↑'} {stats?.out_of_hours_change?.replace(/[+-]/, '') || '0%'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </DomPanelCard>

            {/* Rounds Fairness Audit Card */}
            <DomPanelCard
              title={t('Đối Soát Công Bằng Vòng')}
              subtitle={t('Đánh giá mức độ đồng đều phân bổ giữa các vòng')}
              iconAccent="emerald"
              deferred
              rightSlot={
                <DomToolbarButton variant="outline" onClick={() => navigate('/fair-share')} style={{ height: 30, fontSize: '0.74rem', color: 'var(--color-primary)' }}>
                  {t('Chi tiết đối soát')} →
                </DomToolbarButton>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
                {(() => {
                  const sdVal = parseFloat(stats?.fair_share_sd || '0');
                  const equityVal = parseFloat(stats?.fair_share_equity || '100');
                  const fairnessScore = isNaN(equityVal) ? 100 : equityVal;
                  const isGood = sdVal <= 5 || fairnessScore >= 95;
                  const isFair = (sdVal > 5 && sdVal <= 15) || (fairnessScore >= 90 && fairnessScore < 95);
                  const evalColor = isGood ? '#10b981' : isFair ? '#f59e0b' : '#ef4444';
                  const evalBg = isGood ? 'rgba(16, 185, 129, 0.12)' : isFair ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
                  const evalText = isGood ? t('Rất cân bằng') : isFair ? t('Chấp nhận được') : t('Lệch cao - Cần bù');

                  return (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '8px 12px', borderRadius: 8, fontSize: '0.78rem', gap: '8px', flexWrap: 'wrap', marginBottom: '0.25rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                          {t('Chỉ số Công bằng')}: <strong style={{ color: '#10B981', fontSize: '0.9rem', fontWeight: 800 }}>{stats?.fair_share_equity ?? '100%'}</strong>
                          {stats?.fair_share_equity_change && parseFloat(stats?.fair_share_equity_change) !== 0 && (
                            <span style={{ marginLeft: 4, fontSize: '0.6875rem', color: (stats?.fair_share_equity_change || '').startsWith('-') ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                              ({stats?.fair_share_equity_change})
                            </span>
                          )}
                        </span>
                        <span style={{ width: 1, height: 11, background: 'var(--color-border)', display: 'inline-block' }} />
                        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                          {t('Độ lệch chuẩn (SD)')}: <strong style={{ color: 'var(--color-text)', fontSize: '0.9rem', fontWeight: 800 }}>{stats?.fair_share_sd ?? '0.0'}</strong>
                        </span>
                      </div>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: evalBg, color: evalColor }}>
                        {evalText}
                      </span>
                    </div>
                  );
                })()}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 190, overflowY: 'auto', paddingRight: 4 }}>
                    {Array.isArray(stats?.roundRatio) && stats.roundRatio.length > 0 ? (
                      stats.roundRatio.slice(0, 10).map((r: any, idx: number) => {
                        const individualFairness = r.fairness_score !== undefined
                          ? Math.max(0, Math.min(100, Number(r.fairness_score)))
                          : r.fairness !== undefined
                            ? Math.max(0, Math.min(100, Number(r.fairness)))
                            : Math.max(0, Math.min(100, parseFloat(stats?.fair_share_equity || '0')));

                        const isGood = individualFairness >= 95;
                        const isFair = individualFairness >= 90;
                        const trackColor = isGood ? '#10b981' : isFair ? '#f59e0b' : '#ef4444';
                        const badgeBg = isGood ? 'rgba(16, 185, 129, 0.12)' : isFair ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)';
                        const badgeTextColor = isGood ? '#10b981' : isFair ? '#f59e0b' : '#ef4444';

                        return (
                          <div key={idx} style={{ background: 'var(--color-bg-secondary)', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem' }}>
                              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{t(r.round)}</span>
                              <span style={{ fontSize: '0.72rem', background: badgeBg, color: badgeTextColor, padding: '2px 8px', borderRadius: 6, fontWeight: 700 }}>
                                {individualFairness.toFixed(1)}% {t('Công bằng')}
                              </span>
                            </div>
                            <div style={{ width: '100%', height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${individualFairness}%`, height: '100%', background: trackColor, borderRadius: 3 }} />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <DomEmptyChartState title={t('Chưa có thông tin vòng')} minHeight={120} />
                    )}
                  </div>
                </div>
              </div>
            </DomPanelCard>

          </div>
        </>
      )}{/* end stats ternary */}
    </div>
  );
};

export const Dashboard = withRouterFreezer(DashboardInner, '/');
