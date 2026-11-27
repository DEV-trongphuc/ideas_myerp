import React, { useEffect, useMemo, useState, useCallback, useRef, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LabelList
} from 'recharts';
import {
  Megaphone,
  TrendingUp,
  DollarSign,
  Users,
  Target,
  RefreshCw,
  Search,
  X,
  Eye,
  Layers,
  ExternalLink,
  Play,
  MousePointerClick,
  Heart,
  UserPlus,
  MessageCircle,
  BarChart3,
  Globe,
  Smartphone,
  SlidersHorizontal,
  Download,
  Clock
} from 'lucide-react';
import api from '../../api/axios';
import { ensureArray } from '../../utils/safeArray';
import { CustomSelect } from '../ui/CustomSelect';
import { Avatar } from '../ui/Avatar';
import { useAuth } from '../../contexts/AuthContext';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';
import {
  DomHeroStackCard,
  DomKpiTile,
  DomPanelCard,
  DomRankBarRow,
  DomChartTooltip,
  DomDashboardToolbar,
  DomToolbarButton,
  DomSegmentedSwitch,
  DomDateRangePill,
  DomHeatmapGrid,
  DomEmptyChartState,
  MYERP_CHART_PALETTE,
  formatDomNumber
} from './DomationDashboardKit';
import {
  KpiCardSkeleton,
  TableSkeleton,
  ChartSkeleton,
  DonutAndRankedListSkeleton,
  DonutAndBarChartSkeleton,
  InteractionGridSkeleton,
  LeaderboardCardSkeleton,
  CompletenessGridSkeleton
} from '../ui/Skeleton';

const isSafeHttpsUrl = (raw?: string | null): string | undefined => {
  const s = String(raw || '').trim();
  if (/^https:\/\//i.test(s)) return s;
  return undefined;
};

const csvCellSafe = (val: unknown): string => {
  let s = String(val ?? '');
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  return `"${s.replace(/"/g, '""')}"`;
};

export interface MetaAdsAttributionDeckProps {
  externalDateFilter?: string;
  customStartDate?: string;
  customEndDate?: string;
  onOpenContact?: (contactId: number, fallbackContact?: Record<string, any>) => void;
}

const CANONICAL_CHART_PALETTE = MYERP_CHART_PALETTE;

const getCompletenessTone = (pct: number) => {
  if (pct >= 80) {
    return { bar: '#10b981', dot: '#10b981', text: '#059669', bg: '#ecfdf5' };
  }
  if (pct >= 50) {
    return { bar: '#f59e0b', dot: '#f59e0b', text: '#d97706', bg: '#fffbeb' };
  }
  return { bar: '#ef4444', dot: '#ef4444', text: '#dc2626', bg: '#fef2f2' };
};

const formatVND = (v: number | string): string => {
  const num = Math.round(Number(v) || 0);
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
};

const formatShortMoney = (v: number | string): string => {
  const num = Number(v) || 0;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B đ`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M đ`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}K đ`;
  return `${Math.round(num)} đ`;
};

const formatBarMoney = (v: number | string): string => {
  const num = Number(v) || 0;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}Bđ`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}Mđ`;
  if (num >= 1_000) return `${Math.round(num / 1_000)}Kđ`;
  return `${Math.round(num)}đ`;
};

const renderGoalBarLabel = (props: any) => {
  const { x = 0, y = 0, width = 0, value } = props || {};
  if (value === undefined || value === null || value === '') return null;
  const cx = Number(x) + Number(width) / 2;
  const cy = Math.max(12, Number(y) - 7);
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      fill="var(--color-text-secondary)"
      fontSize={11}
      fontWeight={700}
      style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
    >
      {String(value)}
    </text>
  );
};

const formatNumber = (v: number | string): string => {
  const num = Number(v) || 0;
  return num.toLocaleString('vi-VN');
};

const renderPlatformLogo = (platformRaw: string, size: number = 22): React.ReactNode => {
  const key = String(platformRaw || '').trim().toLowerCase();
  const radius = Math.max(6, Math.round(size * 0.28));
  if (key.includes('facebook') || key === 'fb') {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: '#1877F2',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 1px 2px rgba(24, 119, 242, 0.25)'
        }}
        title="Facebook"
      >
        <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="#ffffff">
          <path d="M15.12 5.32H17V2.14A26.11 26.11 0 0 0 14.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.62H6.61v3.56h3.07V22h3.68v-9.12h3.06l.46-3.56h-3.52V6.65c0-1.05.29-1.73 1.76-1.73Z" />
        </svg>
      </span>
    );
  }
  if (key.includes('instagram') || key === 'ig') {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 1px 2px rgba(214, 36, 159, 0.25)'
        }}
        title="Instagram"
      >
        <svg width={Math.round(size * 0.64)} height={Math.round(size * 0.64)} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2.5" y="2.5" width="19" height="19" rx="5" ry="5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.5" cy="6.5" r="1" fill="#ffffff" stroke="none" />
        </svg>
      </span>
    );
  }
  if (key.includes('messenger') || key === 'msg') {
    return (
      <span
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          background: 'linear-gradient(135deg, #00B2FF 0%, #006AFF 50%, #9B37FF 100%)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
        title="Messenger"
      >
        <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="#ffffff">
          <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.13.26.35.27.57l.05 1.78c.04.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2Zm6 7.46-2.93 4.67c-.47.73-1.47.92-2.17.4l-2.33-1.75a.6.6 0 0 0-.72 0l-3.15 2.4c-.42.32-.97-.18-.68-.63l2.93-4.67c.47-.73 1.47-.92 2.17-.4l2.33 1.75a.6.6 0 0 0 .72 0l3.15-2.4c.42-.32.97.18.68.63Z" />
        </svg>
      </span>
    );
  }
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: '#0f172a',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0
      }}
      title={platformRaw || 'Audience Network / Threads'}
    >
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9.5" />
        <path d="M2.5 12h19" />
        <path d="M12 2.5a14.5 14.5 0 0 1 0 19 14.5 14.5 0 0 1 0-19" />
      </svg>
    </span>
  );
};

const parseCustomRangeFromFilter = (
  filter?: string,
  fallbackStart?: string,
  fallbackEnd?: string
): { from: string; to: string } | null => {
  const raw = String(filter || '').trim();
  if (raw) {
    const mIso = raw.match(/(\d{4}-\d{2}-\d{2})\D+(\d{4}-\d{2}-\d{2})/);
    if (mIso) {
      return mIso[1] <= mIso[2] ? { from: mIso[1], to: mIso[2] } : { from: mIso[2], to: mIso[1] };
    }
    const mVn = raw.match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2})\/(\d{2})\/(\d{4})/);
    if (mVn) {
      const d1 = `${mVn[3]}-${mVn[2]}-${mVn[1]}`;
      const d2 = `${mVn[6]}-${mVn[5]}-${mVn[4]}`;
      return d1 <= d2 ? { from: d1, to: d2 } : { from: d2, to: d1 };
    }
  }
  const fStart = String(fallbackStart || '').trim().slice(0, 10);
  const fEnd = String(fallbackEnd || '').trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fStart) && /^\d{4}-\d{2}-\d{2}$/.test(fEnd)) {
    return fStart <= fEnd ? { from: fStart, to: fEnd } : { from: fEnd, to: fStart };
  }
  return null;
};

const mapExternalDateFilterToRange = (
  filter?: string,
  fallbackStart?: string,
  fallbackEnd?: string
): string => {
  const s = String(filter || '').trim().toLowerCase();
  if (!s) return 'this_month';
  if (parseCustomRangeFromFilter(filter)) return 'custom';
  if (s === 'tùy chỉnh' || s === 'tùy chỉnh...' || s === 'custom') {
    return parseCustomRangeFromFilter(filter, fallbackStart, fallbackEnd) ? 'custom' : 'this_month';
  }
  if (s === 'hôm nay' || s === 'today') return 'today';
  if (s === 'hôm qua' || s === 'yesterday') return 'yesterday';
  if (s === 'tuần này' || s === 'this_week') return 'this_week';
  if (s === 'tuần trước' || s === 'last_week') return 'last_week';
  if (s === 'tuần trước nữa' || s === 'two_weeks_ago') return 'two_weeks_ago';
  if (s === '7 ngày qua' || s === 'last_7_days' || s === '7d') return 'last_7_days';
  if (s === '30 ngày qua' || s === 'last_30_days' || s === '30d') return 'last_30_days';
  if (s === 'tháng này' || s === 'this_month') return 'this_month';
  if (s === 'tháng trước' || s === 'last_month') return 'last_month';
  if (s === 'quý này' || s === 'this_quarter') return 'this_quarter';
  if (s === 'năm nay' || s === 'this_year') return 'this_year';
  if (
    s === 'tất cả' ||
    s === 'tất cả thời gian' ||
    s === 'toàn thời gian' ||
    s === 'all_time' ||
    s === 'all'
  ) {
    return 'all_time';
  }
  return 'this_month';
};

const mapRangeKeyToGlobalFilterLabel = (
  rangeKey: string,
  customStart?: string,
  customEnd?: string
): string => {
  switch (rangeKey) {
    case 'today':
      return 'Hôm nay';
    case 'yesterday':
      return 'Hôm qua';
    case 'this_week':
      return 'Tuần này';
    case 'last_week':
      return 'Tuần trước';
    case 'two_weeks_ago':
      return 'Tuần trước nữa';
    case 'last_7_days':
      return '7 ngày qua';
    case 'last_30_days':
      return '30 ngày qua';
    case 'this_month':
      return 'Tháng này';
    case 'last_month':
      return 'Tháng trước';
    case 'this_quarter':
      return 'Quý này';
    case 'this_year':
      return 'Năm nay';
    case 'all_time':
      return 'Tất cả thời gian';
    case 'custom':
      if (customStart && customEnd) {
        return `${customStart} đến ${customEnd}`;
      }
      return 'Tháng này';
    default:
      return 'Tháng này';
  }
};

const CleanSearchBox: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  width?: number | string;
}> = ({ value, onChange, placeholder, width = 200 }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      width,
      height: '32px',
      padding: '0 10px',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      background: 'var(--color-surface)',
      boxSizing: 'border-box'
    }}
  >
    <Search size={13.5} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        border: 'none',
        outline: 'none',
        background: 'transparent',
        width: '100%',
        fontSize: '0.76rem',
        color: 'var(--color-text)',
        padding: 0
      }}
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        style={{
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <X size={12} />
      </button>
    )}
  </div>
);

const deckCache = new Map<string, { data: any; timestamp: number }>();
const adPreviewCache = new Map<string, any>();

const buildMetaAdsCacheKey = (
  scopeKey: string,
  dateRangeVal: string,
  customStart?: string,
  customEnd?: string,
  campaignFilter = 'all',
  ownerFilter = 'all'
) => `${scopeKey}|${dateRangeVal}|${customStart || ''}|${customEnd || ''}|${campaignFilter}|${ownerFilter}`;

const buildMetaDaypartingCells = (
  backendHeatmap: any,
  attributedLeads: any[]
): { cells: Array<{ row: number; col: number; value: number; tooltip?: string }>; isSpendBased: boolean } => {
  if (Array.isArray(backendHeatmap) && backendHeatmap.length > 0) {
    return {
      isSpendBased: true,
      cells: backendHeatmap.map((c: any) => ({
        row: Number(c.row ?? c.day ?? 1),
        col: Number(c.col ?? c.hour ?? 0),
        value: Number(c.value ?? c.spend ?? c.count ?? 0),
        tooltip: c.tooltip ? String(c.tooltip) : undefined
      }))
    };
  }
  const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const counts = new Map<string, number>();
  ensureArray<any>(attributedLeads).forEach((lead) => {
    const raw = String(lead?.created_at || lead?.synced_at || '').trim();
    if (!raw) return;
    const d = new Date(raw.includes('T') ? raw : raw.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return;
    const key = `${d.getDay()}_${d.getHours()}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  const cells: Array<{ row: number; col: number; value: number; tooltip?: string }> = [];
  counts.forEach((value, key) => {
    const [rStr, cStr] = key.split('_');
    const row = Number(rStr);
    const col = Number(cStr);
    cells.push({
      row,
      col,
      value,
      tooltip: `${dayNames[row] || ''} ${String(col).padStart(2, '0')}:00 — ${formatDomNumber(value)} lead đổ về CRM`
    });
  });
  return { cells, isSpendBased: false };
};

const MetaCompactKpiStrip = React.memo<{
  summary: any;
  formatChangeText: (pct: number | null | undefined) => string;
}>(({ summary, formatChangeText }) => (
  <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
    <DomKpiTile
      variant="hero"
      label="TỔNG CHI TIÊU ADS (SPENT)"
      value={formatVND(summary.spend)}
      icon={<DollarSign size={16} />}
      growth={summary.spend_change_pct}
      badge={`${summary.active_campaigns_count}/${summary.campaigns_count} Active`}
      breakdown={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>
            • CPL Meta: <strong>{formatShortMoney(summary.meta_cpl)}</strong> • CPC:{' '}
            <strong>{formatShortMoney(summary.cpc)}</strong>
          </div>
          <div>
            • Chiến dịch chạy:{' '}
            <strong>
              {summary.active_campaigns_count} / {summary.campaigns_count}
            </strong>
          </div>
        </div>
      }
      comparisonLabel={`So với kỳ trước: ${formatChangeText(summary.spend_change_pct)}`}
    />

    <DomKpiTile
      label="LEADS META & ĐỒNG BỘ CRM"
      value={formatNumber(summary.meta_leads)}
      valueTone="violet"
      icon={<Users size={16} />}
      accent="violet"
      growth={summary.leads_change_pct}
      breakdown={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>
            • Lead đồng bộ CRM: <strong style={{ color: 'var(--color-text)' }}>{formatNumber(summary.total_leads)} lead</strong>
          </div>
          <div>
            • Mess. Started:{' '}
            <strong style={{ color: 'var(--color-text)' }}>
              {formatNumber(summary.messages_started)} ({formatChangeText(summary.messages_change_pct)})
            </strong>
          </div>
        </div>
      }
      comparisonLabel={`SĐT hợp lệ: ${summary.valid_phone_pct}% • Khảo sát: ${summary.survey_completed_pct}%`}
    />

    <DomKpiTile
      label="TIẾP CẬN (REACH) & HIỂN THỊ"
      value={formatNumber(summary.reach)}
      icon={<Globe size={16} />}
      accent="blue"
      growth={summary.reach_change_pct}
      breakdown={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>
            • Impressions: <strong style={{ color: 'var(--color-text)' }}>{formatNumber(summary.impressions)}</strong> • Tần suất:{' '}
            <strong style={{ color: 'var(--color-text)' }}>{summary.frequency}</strong>
          </div>
          <div>
            • Link Click: <strong style={{ color: 'var(--color-text)' }}>{formatNumber(summary.clicks)} ({summary.ctr}%)</strong>
          </div>
        </div>
      }
      comparisonLabel={`CPM trung bình: ${formatVND(summary.cpm)}`}
    />

    <DomKpiTile
      label="CHUYỂN ĐỔI CRM & DOANH THU"
      value={`${formatNumber(summary.qualified_3_12_leads)} Qual (${summary.qualified_3_12_pct}%)`}
      icon={<Target size={16} />}
      accent="emerald"
      breakdown={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div>
            • New (1–2): <strong style={{ color: 'var(--color-text)' }}>{summary.new_1_2_leads}</strong> • Win (13–14):{' '}
            <strong style={{ color: '#10B981' }}>{summary.won_leads} ({summary.won_pct}%)</strong>
          </div>
          <div>
            • Doanh thu CRM: <strong style={{ color: 'var(--color-text)' }}>{formatVND(summary.actual_revenue)}</strong>
          </div>
        </div>
      }
      comparisonLabel={`CPQ (3–12): ${formatVND(summary.cpq_3_12 || summary.cpq)}`}
    />
  </div>
));
MetaCompactKpiStrip.displayName = 'MetaCompactKpiStrip';

const MetaHeroReportRow = React.memo<{
  isMobile: boolean;
  summary: any;
  dailyMetric: 'spend' | 'leads' | 'reach' | 'impressions' | 'messages' | 'clicks';
  onChangeDailyMetric: (m: 'spend' | 'leads' | 'reach' | 'impressions' | 'messages' | 'clicks') => void;
  dailyTrend: any[];
  metaGoalChart: any[];
}>(({ isMobile, summary, dailyMetric, onChangeDailyMetric, dailyTrend, metaGoalChart }) => {
  const metricLabel =
    dailyMetric === 'spend'
      ? 'Chi phí'
      : dailyMetric === 'leads'
      ? 'Leads'
      : dailyMetric === 'reach'
      ? 'Tiếp cận'
      : dailyMetric === 'messages'
      ? 'Tin nhắn'
      : 'Lượt nhấp';

  return (
    <div className="dom-meta-row-1">
      {/* Left 3/12: Meta Ads Executive Violet Hero Stack (Spent + Reach / Leads / Impressions) */}
      <DomHeroStackCard
        layout="stacked"
        heroTone="violet"
        eyebrow={summary.account_name || 'META ADS REPORT'}
        title="Ngân sách & Hiệu quả Meta"
        headlineLabel="TỔNG CHI TIÊU (SPENT)"
        headlineValue={formatVND(summary.spend)}
        headlineMeta={`CPL ${formatShortMoney(summary.meta_cpl)} • CPC ${formatShortMoney(summary.cpc)}`}
        deltaPct={summary.spend_change_pct}
        badge={`${summary.active_campaigns_count}/${summary.campaigns_count} Active`}
        stats={[
          {
            label: 'Leads Meta / CRM',
            value: `${formatNumber(summary.meta_leads)} / ${formatNumber(summary.total_leads)}`,
            sub: `Mess: ${formatNumber(summary.messages_started)} • SĐT ${summary.valid_phone_pct}%`,
            deltaPct: summary.leads_change_pct,
            accent: 'blue'
          },
          {
            label: 'Tiếp cận (Reach)',
            value: formatNumber(summary.reach),
            sub: `CPM ${formatShortMoney(summary.cpm)} • Clicks ${formatNumber(summary.clicks)}`,
            deltaPct: summary.reach_change_pct,
            accent: 'teal'
          },
          {
            label: 'Hiển thị (Impressions)',
            value: formatNumber(summary.impressions),
            sub: `Tần suất: ${summary.frequency} • CTR: ${summary.ctr}%`,
            deltaPct: summary.impressions_change_pct,
            accent: 'indigo'
          },
          {
            label: 'Qualified (3–12) / Win',
            value: `${formatNumber(summary.qualified_3_12_leads)} / ${formatNumber(summary.won_leads)}`,
            sub: `DT: ${formatShortMoney(summary.actual_revenue)} • ROAS ${summary.roas}x`,
            accent: 'emerald'
          }
        ]}
      />

      {/* Middle 5/12: Daily Spent Spline AreaChart */}
      <DomPanelCard
        title="Xu hướng chi tiêu & kết quả theo ngày"
        subtitle="Biến động ngân sách và kết quả quảng cáo theo từng ngày trong kỳ"
        icon={<TrendingUp size={16} />}
        iconAccent="violet"
        rightSlot={
          isMobile ? (
            <div style={{ minWidth: '145px' }}>
              <CustomSelect
                size="sm"
                value={dailyMetric}
                onChange={(val) => onChangeDailyMetric(val as any)}
                options={[
                  { value: 'spend', label: 'Chỉ số: Spent' },
                  { value: 'leads', label: 'Chỉ số: Leads' },
                  { value: 'reach', label: 'Chỉ số: Reach' },
                  { value: 'messages', label: 'Chỉ số: Mess' },
                  { value: 'clicks', label: 'Chỉ số: Clicks' }
                ]}
              />
            </div>
          ) : (
            <DomSegmentedSwitch<'spend' | 'leads' | 'reach' | 'impressions' | 'messages' | 'clicks'>
              size="sm"
              ariaLabel="Chọn chỉ số xu hướng theo ngày"
              value={dailyMetric}
              onChange={onChangeDailyMetric}
              options={[
                { value: 'spend', label: 'Spent' },
                { value: 'leads', label: 'Leads' },
                { value: 'reach', label: 'Reach' },
                { value: 'messages', label: 'Mess' },
                { value: 'clicks', label: 'Clicks' }
              ]}
            />
          )
        }
      >
        <div style={{ width: '100%', height: 270, flex: 1 }}>
          {dailyTrend.length === 0 ? (
            <DomEmptyChartState
              icon={<TrendingUp size={20} />}
              title="Chưa có dữ liệu theo ngày trong kỳ đã chọn"
              minHeight={250}
            />
          ) : (
            <ResponsiveContainer width="100%" height={265}>
              <AreaChart data={dailyTrend} margin={{ top: 18, right: 10, left: -14, bottom: 4 }}>
                <defs>
                  <linearGradient id="metaDailyRedFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7C3AED" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#7C3AED" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)', fontWeight: 500 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(val) =>
                    dailyMetric === 'spend'
                      ? Number(val) >= 1_000_000
                        ? `${Math.round(Number(val) / 1_000_000)}M`
                        : `${Math.round(Number(val) / 1_000)}K`
                      : formatNumber(val)
                  }
                />
                <Tooltip
                  cursor={{ stroke: 'var(--color-border)', strokeWidth: 1, strokeDasharray: '3 3' }}
                  content={
                    <DomChartTooltip
                      valueFormatter={(val) => (dailyMetric === 'spend' ? formatVND(val) : formatNumber(val))}
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey={dailyMetric}
                  name={metricLabel}
                  stroke="#7C3AED"
                  strokeWidth={2.5}
                  fill="url(#metaDailyRedFill)"
                  activeDot={{ r: 5, fill: '#7C3AED', stroke: '#ffffff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </DomPanelCard>

      {/* Right 4/12: Meta Goal Spend Distribution */}
      <DomPanelCard
        title="Meta Goal (Mục tiêu QC)"
        subtitle="Chi tiêu theo mục tiêu tối ưu hóa từng AdSet"
        icon={<Target size={16} />}
        iconAccent="blue"
        rightSlot={
          <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.73rem', fontWeight: 700, color: 'var(--color-text)' }}>
            {metaGoalChart.length} mục tiêu
          </span>
        }
      >
        {metaGoalChart.length === 0 ? (
          <DomEmptyChartState
            icon={<Target size={20} />}
            title="Chưa có dữ liệu Meta Goal trong kỳ đã chọn"
            minHeight={250}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            <div style={{ width: '100%', height: 186 }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={metaGoalChart} margin={{ top: 26, right: 10, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="metaGoalRedBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1D4ED8" />
                      <stop offset="100%" stopColor="#3B82F6" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                  <XAxis dataKey="display_name" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)', fontWeight: 600 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} interval={0} />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
                    content={<DomChartTooltip valueFormatter={(val) => formatVND(val)} />}
                  />
                  <Bar dataKey="spend" name="Chi phí" barSize={32} radius={[6, 6, 0, 0]}>
                    {metaGoalChart.map((_entry: any, idx: number) => (
                      <Cell key={`goal-${idx}`} fill={idx === 0 ? 'url(#metaGoalRedBar)' : '#0D9488'} />
                    ))}
                    <LabelList dataKey="shortSpend" position="top" content={renderGoalBarLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {metaGoalChart.slice(0, 3).map((g: any, idx: number) => (
                <DomRankBarRow
                  key={g.goal || idx}
                  rank={idx + 1}
                  label={`${g.display_name} (${g.adsets_count} nhóm)`}
                  sublabel={`${g.result_label}: ${formatNumber(g.results)} • CPR: ${formatShortMoney(g.cpr)}`}
                  value={formatShortMoney(g.spend)}
                  badge={`${g.pct}%`}
                  badgeTone={idx === 0 ? 'brand' : 'slate'}
                  percent={Math.max(4, Number(g.pct || 0))}
                  barColor={idx === 0 ? '#BD1D2D' : 'var(--color-text-secondary)'}
                />
              ))}
            </div>
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});
MetaHeroReportRow.displayName = 'MetaHeroReportRow';

const MetaEngagementPlatformAgeRow = React.memo<{
  isMobile: boolean;
  summary: any;
  platformSpend: any[];
  placementPositions: any[];
  ageGenderBreakdown: any[];
  ageOnlyMode: boolean;
  onChangeAgeOnlyMode: (ageOnly: boolean) => void;
  onOpenPlacementModal: () => void;
}>(({
  isMobile,
  summary,
  platformSpend,
  placementPositions,
  ageGenderBreakdown,
  ageOnlyMode,
  onChangeAgeOnlyMode,
  onOpenPlacementModal
}) => {
  const interactionItems = [
    { label: 'Video Plays', val: formatNumber(summary.video_plays), icon: <Play size={14} />, sub: 'Lượt phát 3s', accent: 'brand' as const },
    { label: 'ThruPlays', val: formatNumber(summary.thruplays), icon: <Eye size={14} />, sub: 'Hoàn tất / ≥15s', accent: 'brand' as const },
    { label: 'Link Click', val: formatNumber(summary.clicks), icon: <MousePointerClick size={14} />, sub: `CTR ${summary.ctr}% • ${formatShortMoney(summary.cpc)}`, accent: 'slate' as const },
    { label: 'Engagement', val: formatNumber(summary.post_engagement), icon: <Layers size={14} />, sub: 'Tương tác bài', accent: 'slate' as const },
    { label: 'Reactions', val: formatNumber(summary.reactions), icon: <Heart size={14} />, sub: 'Cảm xúc', accent: 'slate' as const },
    { label: 'Follows', val: formatNumber(summary.follows), icon: <UserPlus size={14} />, sub: 'Theo dõi trang', accent: 'slate' as const }
  ];

  return (
    <div className="dom-meta-row-2">
      {/* Card 1: Active Status + 6 DOMATION Interaction Tiles */}
      <DomPanelCard
        title="Trạng thái & Tương tác Quảng cáo"
        subtitle="Tình trạng vận hành và 6 chỉ số tương tác trên bài quảng cáo"
        icon={<Layers size={16} />}
        iconAccent="brand"
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px', marginBottom: '10px' }}>
          {[
            { label: 'Campaigns', active: summary.active_campaigns_count, total: summary.campaigns_count },
            { label: 'AdSets', active: summary.active_adsets_count, total: summary.adsets_count },
            { label: 'Ads', active: summary.active_ads_count, total: summary.ads_count }
          ].map((st) => (
            <div
              key={st.label}
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minWidth: 0
              }}
            >
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.label}</span>
              <span style={{ fontSize: '0.96rem', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.active > 0 ? '#10b981' : 'var(--color-text-muted)', flexShrink: 0 }} />
                {st.active}
                <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>/{st.total}</span>
              </span>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: '8px', marginTop: 'auto', marginBottom: 'auto' }}>
          {interactionItems.map((it) => (
            <div
              key={it.label}
              style={{
                padding: '9px 10px',
                borderRadius: 10,
                border: '1px solid var(--color-border)',
                background: it.accent === 'brand' ? 'rgba(189, 29, 45, 0.03)' : '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                minWidth: 0
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: '0.69rem', fontWeight: 700, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                <span style={{ color: it.accent === 'brand' ? '#BD1D2D' : 'var(--color-text-secondary)', display: 'inline-flex', flexShrink: 0 }}>{it.icon}</span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.val}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</div>
            </div>
          ))}
        </div>
      </DomPanelCard>

      {/* Card 2: Spent Platform + SVG Donut + Details button */}
      <DomPanelCard
        title="Chi tiêu theo nền tảng"
        subtitle="Facebook, Instagram & Audience Network"
        icon={<Globe size={16} />}
        iconAccent="slate"
        rightSlot={
          <DomToolbarButton
            variant="outline"
            icon={<BarChart3 size={13} style={{ color: '#BD1D2D' }} />}
            onClick={onOpenPlacementModal}
            style={{ height: '30px', minHeight: '30px', padding: '0 10px', fontSize: '0.72rem' }}
          >
            Chi tiết ({placementPositions.length})
          </DomToolbarButton>
        }
      >
        {platformSpend.length === 0 ? (
          <DomEmptyChartState icon={<Globe size={20} />} title="Chưa có dữ liệu nền tảng" minHeight={220} />
        ) : (
          <div className="dom-donut-split-wrap" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <div className="dom-donut-split">
              <div className="dom-donut-split__list">
                {platformSpend.map((plat: any, idx: number) => (
                  <DomRankBarRow
                    key={plat.code || idx}
                    icon={renderPlatformLogo(plat.code || plat.name, 20)}
                    label={plat.name}
                    sublabel={`Leads: ${plat.leads} • Mess: ${plat.messages}`}
                    value={formatShortMoney(plat.spend)}
                    badge={`${plat.pct}%`}
                    badgeTone={idx === 0 ? 'brand' : 'slate'}
                    percent={Math.max(3, Number(plat.pct || 0))}
                    barColor={plat.color}
                  />
                ))}
              </div>

              <div className="dom-donut-split__ring">
                <div style={{ position: 'relative', width: 132, height: 132, maxWidth: '100%' }}>
                  <svg width="132" height="132" viewBox="0 0 162 162" style={{ transform: 'rotate(-90deg)', display: 'block', width: '100%', height: '100%' }}>
                    <circle cx="81" cy="81" r="62" fill="transparent" stroke="var(--color-bg-secondary)" strokeWidth="18" />
                    {(() => {
                      const circ = 2 * Math.PI * 62;
                      let acc = 0;
                      return platformSpend.map((it: any) => {
                        const dash = (Number(it.pct || 0) / 100) * circ;
                        const offset = acc;
                        acc += dash;
                        return (
                          <circle
                            key={it.code || it.name}
                            cx="81"
                            cy="81"
                            r="62"
                            fill="transparent"
                            stroke={it.color}
                            strokeWidth="18"
                            strokeDasharray={`${dash} ${circ}`}
                            strokeDashoffset={-offset}
                          />
                        );
                      });
                    })()}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center', padding: '0 14px' }}>
                    <span style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                      {platformSpend[0]?.pct || 0}%
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '3px', fontWeight: 600, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {platformSpend[0]?.name || 'Platform'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DomPanelCard>

      {/* Card 3: Age & Gender */}
      <DomPanelCard
        title="Độ tuổi & Giới tính"
        subtitle="Ngân sách quảng cáo theo nhóm tuổi & Nam / Nữ"
        icon={<Users size={16} />}
        iconAccent="brand"
        rightSlot={
          <DomSegmentedSwitch<'both' | 'age'>
            size="sm"
            ariaLabel="Chế độ xem độ tuổi và giới tính"
            value={ageOnlyMode ? 'age' : 'both'}
            onChange={(m) => onChangeAgeOnlyMode(m === 'age')}
            options={[
              { value: 'both', label: 'Tuổi & giới tính' },
              { value: 'age', label: 'Chỉ độ tuổi' }
            ]}
          />
        }
      >
        <div style={{ width: '100%', height: 240, flex: 1 }}>
          {ageGenderBreakdown.length === 0 ? (
            <DomEmptyChartState icon={<Users size={20} />} title="Chưa có dữ liệu Độ tuổi & Giới tính" minHeight={220} />
          ) : (
            <ResponsiveContainer width="100%" height={235}>
              <BarChart data={ageGenderBreakdown} margin={{ top: 18, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                <XAxis dataKey="age" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)', fontWeight: 500 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={
                    <DomChartTooltip
                      valueFormatter={(val) => formatVND(val)}
                    />
                  }
                />
                {ageOnlyMode ? (
                  <Bar dataKey="total" name="Tổng chi phí" fill="#7C3AED" barSize={26} radius={[5, 5, 0, 0]}>
                    {ageGenderBreakdown.map((entry: any, index: number) => {
                      const maxT = Math.max(...ageGenderBreakdown.map((x: any) => Number(x.total || 0)), 1);
                      return <Cell key={`ag-${index}`} fill={Number(entry.total || 0) >= maxT ? '#7C3AED' : '#0D9488'} />;
                    })}
                  </Bar>
                ) : (
                  <>
                    <Bar dataKey="male" name="Nam" fill="#2563EB" barSize={14} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="female" name="Nữ" fill="#8B5CF6" barSize={14} radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </DomPanelCard>
    </div>
  );
});
MetaEngagementPlatformAgeRow.displayName = 'MetaEngagementPlatformAgeRow';

const MetaDaypartingAndRegionsRow = React.memo<{
  isMobile: boolean;
  daypartingCells: Array<{ row: number; col: number; value: number; tooltip?: string }>;
  isSpendBasedHeatmap: boolean;
  regionBreakdown: any[];
}>(({ isMobile, daypartingCells, isSpendBasedHeatmap, regionBreakdown }) => {
  const maxRegSpend = Math.max(1, ...regionBreakdown.map((r: any) => Number(r.spend || 0)));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr', gap: '1.25rem' }}>
      <DomPanelCard
        deferred
        title={isSpendBasedHeatmap ? 'Phân bổ ngân sách theo Khung giờ & Thứ (Dayparting)' : 'Mật độ Lead Meta theo Khung giờ & Thứ'}
        subtitle={
          isSpendBasedHeatmap
            ? 'Xác định khung giờ vàng chi tiêu quảng cáo hiệu quả trong tuần'
            : 'Phân tích khung giờ Lead Meta đổ về CRM thực tế (24 giờ × 7 ngày)'
        }
        icon={<Clock size={16} />}
        iconAccent="violet"
      >
        <DomHeatmapGrid
          cells={daypartingCells}
          accentColorRgb="124, 58, 237"
          valueFormatter={(v) => (isSpendBasedHeatmap ? formatShortMoney(v) : `${formatDomNumber(v)} lead`)}
          emptyHint="Chưa có dữ liệu khung giờ Lead trong khoảng thời gian đã chọn"
        />
      </DomPanelCard>

      <DomPanelCard
        deferred
        title="Top tỉnh / thành phố chi tiêu cao nhất"
        subtitle="Phân bổ ngân sách & kết quả theo khu vực địa lý thực tế"
        icon={<Globe size={16} />}
        iconAccent="teal"
        rightSlot={
          <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.73rem', fontWeight: 700, color: 'var(--color-text)' }}>
            Top {regionBreakdown.length} khu vực
          </span>
        }
      >
        {regionBreakdown.length === 0 ? (
          <DomEmptyChartState icon={<Globe size={20} />} title="Chưa có dữ liệu vùng miền trong kỳ đã chọn" minHeight={230} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            <div style={{ width: '100%', height: 185 }}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={regionBreakdown.slice(0, 8)} margin={{ top: 14, right: 8, left: -16, bottom: 2 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                  <XAxis
                    dataKey="region"
                    tick={{ fontSize: 11, fill: 'var(--color-text-secondary)', fontWeight: 500 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                    tickFormatter={(v) => (String(v).length > 12 ? String(v).slice(0, 11) + '…' : String(v))}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${Math.round(Number(v) / 1_000_000)}M`}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }}
                    content={<DomChartTooltip valueFormatter={(val) => formatVND(val)} />}
                  />
                  <Bar dataKey="spend" name="Chi phí" barSize={22} radius={[5, 5, 0, 0]}>
                    {regionBreakdown.slice(0, 8).map((_entry: any, index: number) => (
                      <Cell key={`reg-${index}`} fill={index === 0 ? '#0D9488' : '#2563EB'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {regionBreakdown.slice(0, 3).map((reg: any, rIdx: number) => (
                <DomRankBarRow
                  key={reg.region || rIdx}
                  rank={rIdx + 1}
                  label={reg.region}
                  value={formatShortMoney(reg.spend)}
                  percent={Math.max(4, Math.round((Number(reg.spend || 0) / maxRegSpend) * 100))}
                  barColor={rIdx === 0 ? '#BD1D2D' : 'var(--color-text-secondary)'}
                />
              ))}
            </div>
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});
MetaDaypartingAndRegionsRow.displayName = 'MetaDaypartingAndRegionsRow';

const MetaVideoAndDeviceRow = React.memo<{
  isMobile: boolean;
  summary: any;
  videoRetention: any[];
  deviceBreakdown: any[];
}>(({ isMobile, summary, videoRetention, deviceBreakdown }) => {
  if (videoRetention.length === 0 && deviceBreakdown.length === 0) return null;
  const deviceColors = ['#BD1D2D', '#334155', '#E11D48', '#64748B', '#94A3B8', '#CBD5E1'];
  const circ = 2 * Math.PI * 52;
  let devAcc = 0;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
      <DomPanelCard
        deferred
        title="Phễu giữ chân người xem video"
        subtitle="Tỷ lệ xem video từ 3 giây → 25% → 50% → 75% → 95% → ThruPlay → 100%"
        icon={<Play size={16} />}
        iconAccent="brand"
        rightSlot={
          <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.73rem', fontWeight: 700, color: 'var(--color-text)' }}>
            ThruPlay: {formatNumber(summary.thruplays)}
          </span>
        }
      >
        {videoRetention.length === 0 ? (
          <DomEmptyChartState icon={<Play size={20} />} title="Chưa có dữ liệu giữ chân video" minHeight={180} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {videoRetention.map((v: any, idx: number) => (
              <DomRankBarRow
                key={idx}
                label={v.stage}
                value={`${formatNumber(v.count)} lượt`}
                badge={`${v.pct}%`}
                badgeTone={idx === 0 ? 'brand' : 'slate'}
                percent={Math.max(2, Number(v.pct || 0))}
                barColor={idx === 0 ? '#C6333D' : 'var(--color-text-secondary)'}
              />
            ))}
          </div>
        )}
      </DomPanelCard>

      <DomPanelCard
        deferred
        title="Phân bổ chi tiêu theo thiết bị"
        subtitle="Thiết bị người dùng tiếp cận quảng cáo trên Meta"
        icon={<Smartphone size={16} />}
        iconAccent="slate"
      >
        {deviceBreakdown.length === 0 ? (
          <DomEmptyChartState icon={<Smartphone size={20} />} title="Chưa có dữ liệu thiết bị" minHeight={180} />
        ) : (
          <div className="dom-donut-split-wrap">
            <div className="dom-donut-split dom-donut-split--chart-left">
              <div className="dom-donut-split__ring">
                <div style={{ position: 'relative', width: 132, height: 132, maxWidth: '100%' }}>
                  <svg width="132" height="132" viewBox="0 0 136 136" style={{ transform: 'rotate(-90deg)', display: 'block', width: '100%', height: '100%' }}>
                    <circle cx="68" cy="68" r="52" fill="transparent" stroke="var(--color-bg-secondary)" strokeWidth="16" />
                    {deviceBreakdown.slice(0, 6).map((dev: any, idx: number) => {
                      const dash = (Number(dev.pct || 0) / 100) * circ;
                      const offset = devAcc;
                      devAcc += dash;
                      return (
                        <circle
                          key={dev.device || idx}
                          cx="68"
                          cy="68"
                          r="52"
                          fill="transparent"
                          stroke={deviceColors[idx % deviceColors.length]}
                          strokeWidth="16"
                          strokeDasharray={`${dash} ${circ}`}
                          strokeDashoffset={-offset}
                        />
                      );
                    })}
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 12px', pointerEvents: 'none' }}>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                      {deviceBreakdown[0]?.pct || 0}%
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {deviceBreakdown[0]?.device || 'Thiết bị'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="dom-donut-split__list">
                {deviceBreakdown.slice(0, 6).map((dev: any, idx: number) => (
                  <DomRankBarRow
                    key={dev.device || idx}
                    label={dev.device}
                    value={formatShortMoney(dev.spend)}
                    badge={`${dev.pct}%`}
                    badgeTone={idx === 0 ? 'brand' : 'slate'}
                    percent={Math.max(2, Number(dev.pct || 0))}
                    barColor={deviceColors[idx % deviceColors.length]}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});
MetaVideoAndDeviceRow.displayName = 'MetaVideoAndDeviceRow';

export const MetaAdsAttributionDeck: React.FC<MetaAdsAttributionDeckProps> = ({
  externalDateFilter,
  customStartDate,
  customEndDate,
  onOpenContact
}) => {
  const { user } = useAuth();
  const tenantScopeKey = `${(user as any)?.tenant_id ?? 1}:${user?.id ?? 'anon'}`;
  const swrTtlMs = useTypedSubSetting<number>('mkt.meta_capi_and_ads_bi', 'swr_ms', 45_000);

  const [viewMode, setViewMode] = useState<'funnel' | 'campaigns' | 'preview'>('funnel');
  const [matrixTabMode, setMatrixTabMode] = useState<'by_ad' | 'by_lead'>('by_ad');
  const [matrixPipelineFilter, setMatrixPipelineFilter] = useState<string>('all');
  const [matrixOnlyAdsWithLeads, setMatrixOnlyAdsWithLeads] = useState<boolean>(true);
  const [matrixShowAll14Cols, setMatrixShowAll14Cols] = useState<boolean>(false);
  const [matrixSearch, setMatrixSearch] = useState<string>('');
  const deferredMatrixSearch = useDeferredValue(matrixSearch);
  const [matrixSortBy, setMatrixSortBy] = useState<'leads' | 'spend' | 'qualified_pct'>('leads');
  const [expandedMatrixAds, setExpandedMatrixAds] = useState<Record<string, boolean>>({});
  const [matrixAdPageMap, setMatrixAdPageMap] = useState<Record<string, number>>({});
  const [matrixFlatLeadPage, setMatrixFlatLeadPage] = useState<number>(1);
  const [copiedMatrixAdId, setCopiedMatrixAdId] = useState<string | null>(null);
  const [selectedCampaignFilter, setSelectedCampaignFilter] = useState<string>('all');
  const [selectedOwnerFilter, setSelectedOwnerFilter] = useState<string>('all');
  const initialParsedCustom = useMemo(
    () => parseCustomRangeFromFilter(externalDateFilter, customStartDate, customEndDate),
    [externalDateFilter, customStartDate, customEndDate]
  );
  const [dateRange, setDateRange] = useState<string>(() =>
    mapExternalDateFilterToRange(externalDateFilter, customStartDate, customEndDate)
  );
  const [localCustomStart, setLocalCustomStart] = useState<string>(() => initialParsedCustom?.from || customStartDate || '');
  const [localCustomEnd, setLocalCustomEnd] = useState<string>(() => initialParsedCustom?.to || customEndDate || '');
  const [dailyMetric, setDailyMetric] = useState<'spend' | 'leads' | 'reach' | 'impressions' | 'messages' | 'clicks'>('spend');
  const [ageOnlyMode, setAgeOnlyMode] = useState<boolean>(false);
  const [showPlacementModal, setShowPlacementModal] = useState<boolean>(false);
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );

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

  const [tableSearch, setTableSearch] = useState<string>('');
  const [adsetSearch, setAdsetSearch] = useState<string>('');
  const [adPreviewSearch, setAdPreviewSearch] = useState<string>('');
  const deferredTableSearch = useDeferredValue(tableSearch);
  const deferredAdsetSearch = useDeferredValue(adsetSearch);
  const deferredAdPreviewSearch = useDeferredValue(adPreviewSearch);

  const effectiveCustomStart = initialParsedCustom?.from || localCustomStart || customStartDate || '';
  const effectiveCustomEnd = initialParsedCustom?.to || localCustomEnd || customEndDate || '';

  const initialMetaKey = buildMetaAdsCacheKey(
    tenantScopeKey,
    mapExternalDateFilterToRange(externalDateFilter, customStartDate, customEndDate),
    effectiveCustomStart,
    effectiveCustomEnd,
    'all',
    'all'
  );
  const [loading, setLoading] = useState<boolean>(() => !deckCache.has(initialMetaKey));
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [overviewData, setOverviewData] = useState<any>(() => deckCache.get(initialMetaKey)?.data ?? null);
  const abortMetaRef = useRef<AbortController | null>(null);

  // Selected Ad for Inspector Modal
  const [previewAdModal, setPreviewAdModal] = useState<any | null>(null);

  useEffect(() => {
    if (!previewAdModal && !showPlacementModal) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (previewAdModal) setPreviewAdModal(null);
        else if (showPlacementModal) setShowPlacementModal(false);
      }
    };
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [previewAdModal, showPlacementModal]);

  // Sync with top-right Dashboard header dateFilter & customStartDate/customEndDate automatically
  useEffect(() => {
    if (externalDateFilter) {
      const parsed = parseCustomRangeFromFilter(externalDateFilter, customStartDate, customEndDate);
      if (parsed) {
        setLocalCustomStart(parsed.from);
        setLocalCustomEnd(parsed.to);
      }
      const mapped = mapExternalDateFilterToRange(externalDateFilter, customStartDate, customEndDate);
      setDateRange((prev) => (prev === mapped ? prev : mapped));
    }
  }, [externalDateFilter, customStartDate, customEndDate]);

  const handleDateRangeSelectChange = useCallback(
    (val: string) => {
      const nextRange = String(val);
      setDateRange(nextRange);
      const globalLabel = mapRangeKeyToGlobalFilterLabel(nextRange, effectiveCustomStart, effectiveCustomEnd);
      try {
        localStorage.setItem('Ideas_global_date', globalLabel);
        window.dispatchEvent(new CustomEvent('global-date-change', { detail: globalLabel }));
      } catch {
        // ignore storage errors
      }
    },
    [effectiveCustomStart, effectiveCustomEnd]
  );

  // Fetch 100% real backend Meta Graph API + CRM Attribution analytics with tenant+user-scoped SWR Cache
  const fetchMetaAnalytics = useCallback(
    async (isSilent = false) => {
      const cacheKey = buildMetaAdsCacheKey(
        tenantScopeKey,
        dateRange,
        effectiveCustomStart,
        effectiveCustomEnd,
        selectedCampaignFilter,
        selectedOwnerFilter
      );
      const cached = deckCache.get(cacheKey);
      const now = Date.now();

      if (cached) {
        setOverviewData(cached.data);
        setLoading(false);
        setErrorMsg(null);
        if (!isSilent && now - cached.timestamp < swrTtlMs) {
          return;
        }
        setRefreshing(true);
      } else {
        if (!isSilent) setLoading(true);
        else setRefreshing(true);
        setErrorMsg(null);
      }

      if (abortMetaRef.current) {
        abortMetaRef.current.abort();
      }
      const controller = new AbortController();
      abortMetaRef.current = controller;

      try {
        const res = await api.get('/marketing/meta/overview', {
          params: {
            date_range: dateRange,
            from_date: dateRange === 'custom' && effectiveCustomStart ? effectiveCustomStart : undefined,
            to_date: dateRange === 'custom' && effectiveCustomEnd ? effectiveCustomEnd : undefined,
            campaign_id: selectedCampaignFilter !== 'all' ? selectedCampaignFilter : undefined,
            owner_id: selectedOwnerFilter !== 'all' ? selectedOwnerFilter : undefined,
            refresh: isSilent ? 1 : undefined
          },
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        const payload = res?.data?.data ?? res?.data ?? null;
        if (payload) {
          deckCache.set(cacheKey, { data: payload, timestamp: Date.now() });
        }
        setOverviewData(payload);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError' || controller.signal.aborted) return;
        if (!cached) {
          setErrorMsg(err?.response?.data?.message || 'Không thể tải dữ liệu Meta Ads Attribution từ máy chủ');
        }
      } finally {
        if (abortMetaRef.current === controller) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [tenantScopeKey, swrTtlMs, dateRange, effectiveCustomStart, effectiveCustomEnd, selectedCampaignFilter, selectedOwnerFilter]
  );

  useEffect(() => {
    fetchMetaAnalytics(false);
    return () => {
      if (abortMetaRef.current) {
        abortMetaRef.current.abort();
      }
    };
  }, [fetchMetaAnalytics]);

  // Real Summary KPIs from Backend (Graph API + CRM Attribution — zero hardcoded account defaults)
  const summary = useMemo(() => {
    const s = overviewData?.summary || {};
    const totalLeads = Number(s.total_leads || 0);
    const wonLeads = Number(s.won_leads || 0);
    const new12Leads = Number(s.new_1_2_leads ?? s.uncontacted_leads ?? 0);
    const qual312Leads = Number(s.qualified_3_12_leads ?? Math.max(0, Number(s.qualified_leads || 0) - wonLeads));
    const parseDelta = (v: any): number | null => (v === null || v === undefined ? null : Number(v));
    return {
      account_id: String(s.account_id || ''),
      account_name: String(s.account_name || 'Chưa cấu hình Ad Account'),
      since: String(s.since || ''),
      until: String(s.until || ''),
      spend: Number(s.spend || 0),
      attributed_spend: Number(s.attributed_spend || s.spend || 0),
      account_total_spend: Number(s.account_total_spend || s.spend || 0),
      prev_spend: Number(s.prev_spend || 0),
      spend_change_pct: parseDelta(s.spend_change_pct),
      lead_goal_spend: Number(s.lead_goal_spend || 0),
      meta_leads: Number(s.meta_leads || 0),
      account_meta_leads: Number(s.account_meta_leads || 0),
      prev_meta_leads: Number(s.prev_meta_leads || 0),
      leads_change_pct: parseDelta(s.leads_change_pct),
      meta_cpl: Number(s.meta_cpl || 0),
      account_meta_cpl: Number(s.account_meta_cpl || 0),
      cpl: Number(s.cpl || 0),
      crm_cpl: Number(s.crm_cpl || 0),
      cost_per_new_1_2: Number(s.cost_per_new_1_2 || 0),
      cpq_3_12: Number(s.cpq_3_12 || s.cpq || 0),
      cpq: Number(s.cpq || 0),
      cpw: Number(s.cpw || 0),
      impressions: Number(s.impressions || 0),
      prev_impressions: Number(s.prev_impressions || 0),
      impressions_change_pct: parseDelta(s.impressions_change_pct),
      reach: Number(s.reach || 0),
      prev_reach: Number(s.prev_reach || 0),
      reach_change_pct: parseDelta(s.reach_change_pct),
      frequency: Number(s.frequency || 0),
      cpm: Number(s.cpm || 0),
      clicks: Number(s.clicks || 0),
      cpc: Number(s.cpc || 0),
      ctr: Number(s.ctr || 0),
      messages_started: Number(s.messages_started || 0),
      prev_messages_started: Number(s.prev_messages_started || 0),
      messages_change_pct: parseDelta(s.messages_change_pct),
      thruplays: Number(s.thruplays || 0),
      video_plays: Number(s.video_plays || 0),
      post_engagement: Number(s.post_engagement || 0),
      reactions: Number(s.reactions || 0),
      follows: Number(s.follows || 0),
      comments: Number(s.comments || 0),
      shares: Number(s.shares || 0),
      total_leads: totalLeads,
      paid_leads: Number(s.paid_leads || 0),
      organic_leads: Number(s.organic_leads || 0),
      instant_form_leads: Number(s.instant_form_leads || 0),
      new_1_2_leads: new12Leads,
      new_1_2_pct: Number(s.new_1_2_pct ?? (totalLeads > 0 ? Math.round((new12Leads / totalLeads) * 1000) / 10 : 0)),
      stage_1_leads: Number(s.stage_1_leads || 0),
      stage_2_leads: Number(s.stage_2_leads ?? Math.max(0, new12Leads - Number(s.stage_1_leads || 0))),
      uncontacted_leads: Number(s.uncontacted_leads || 0),
      contacted_leads: Number(s.contacted_leads || 0),
      contacted_pct: Number(s.contacted_pct || 0),
      qualified_3_12_leads: qual312Leads,
      qualified_3_12_pct: Number(s.qualified_3_12_pct ?? (totalLeads > 0 ? Math.round((qual312Leads / totalLeads) * 1000) / 10 : 0)),
      qualified_leads: Number(s.qualified_leads || 0),
      qualified_pct: Number(s.qualified_pct || 0),
      won_leads: wonLeads,
      won_pct: Number(s.won_pct || 0),
      stage_13_leads: Number(s.stage_13_leads ?? Math.max(0, wonLeads - Number(s.enrolled_leads || 0))),
      stage_14_leads: Number(s.stage_14_leads ?? s.enrolled_leads ?? 0),
      enrolled_leads: Number(s.enrolled_leads || 0),
      assigned_leads: Number(s.assigned_leads || 0),
      assigned_pct: Number(s.assigned_pct || 0),
      actual_revenue: Number(s.actual_revenue || 0),
      roas: Number(s.roas || 0),
      campaigns_count: Number(s.campaigns_count || 0),
      active_campaigns_count: Number(s.active_campaigns_count || 0),
      adsets_count: Number(s.adsets_count || 0),
      active_adsets_count: Number(s.active_adsets_count || 0),
      ads_count: Number(s.ads_count || 0),
      active_ads_count: Number(s.active_ads_count || 0),
      forms_count: Number(s.forms_count || 0),
      valid_phone_pct: Number(s.valid_phone_pct || 0),
      survey_completed_pct: Number(s.survey_completed_pct || 0)
    };
  }, [overviewData]);

  // Daily Spend / Trend (DOMATION_META/js/charts/dashboard_charts.js)
  const dailyTrend = useMemo(() => {
    return Array.isArray(overviewData?.daily_trend) ? overviewData.daily_trend : [];
  }, [overviewData]);

  // Exact Meta Goal Chart (`QUALITY LEAD`, `REACH`, etc.)
  const metaGoalChart = useMemo(() => {
    const raw = Array.isArray(overviewData?.meta_goal_chart) ? overviewData.meta_goal_chart : [];
    return raw.map((g: any, idx: number) => ({
      ...g,
      color: CANONICAL_CHART_PALETTE[idx % CANONICAL_CHART_PALETTE.length],
      shortSpend: formatBarMoney(g.spend)
    }));
  }, [overviewData]);

  // Spend by Platform (`Facebook`, `Instagram`, `Other Platform`)
  const platformSpend = useMemo(() => {
    const list = Array.isArray(overviewData?.platform_spend) ? overviewData.platform_spend : [];
    return list.map((p: any, idx: number) => ({
      ...p,
      color: idx === 0 ? '#C6333D' : idx === 1 ? '#334155' : 'var(--color-text-muted)'
    }));
  }, [overviewData]);

  // Placement Positions (`Details` modal in DOMATION_META)
  const placementPositions = useMemo(() => {
    return Array.isArray(overviewData?.placement_positions) ? overviewData.placement_positions : [];
  }, [overviewData]);

  // Age & Gender Breakdown (`DOMATION_META/js/charts/render_age_gender.js`)
  const ageGenderBreakdown = useMemo(() => {
    return Array.isArray(overviewData?.age_gender_breakdown) ? overviewData.age_gender_breakdown : [];
  }, [overviewData]);

  // Region Breakdown (`DOMATION_META/js/charts/region_chart.js`)
  const regionBreakdown = useMemo(() => {
    return Array.isArray(overviewData?.region_breakdown) ? overviewData.region_breakdown : [];
  }, [overviewData]);

  // Device Breakdown & Video Retention
  const deviceBreakdown = useMemo(() => {
    return Array.isArray(overviewData?.device_breakdown) ? overviewData.device_breakdown : [];
  }, [overviewData]);

  const videoRetention = useMemo(() => {
    return Array.isArray(overviewData?.video_retention) ? overviewData.video_retention : [];
  }, [overviewData]);

  // Real Campaigns Breakdown
  const campaignBreakdown = useMemo(() => {
    const list = Array.isArray(overviewData?.by_campaign) ? overviewData.by_campaign : [];
    return list.map((c: any, idx: number) => ({
      ...c,
      color: CANONICAL_CHART_PALETTE[idx % CANONICAL_CHART_PALETTE.length]
    }));
  }, [overviewData]);

  // Campaign Filter Options built dynamically from real campaigns
  const campaignOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'Tất cả chiến dịch' }];
    const list = Array.isArray(overviewData?.by_campaign) ? overviewData.by_campaign : [];
    list.forEach((c: any) => {
      const val = String(c.campaign_id || c.name || '');
      if (val && !opts.some((o) => o.value === val)) {
        opts.push({
          value: val,
          label: `${c.name} (${formatShortMoney(c.spend)})`
        });
      }
    });
    return opts;
  }, [overviewData]);

  // Advisor Filter Options built dynamically from real top_advisors
  const advisorOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string; avatar?: string }> = [
      { value: 'all', label: 'Tất cả Tư vấn viên' }
    ];
    const list = Array.isArray(overviewData?.top_advisors) ? overviewData.top_advisors : [];
    list.forEach((adv: any) => {
      const val = String(adv.user_id > 0 ? adv.user_id : adv.id || '');
      if (val && !opts.some((o) => o.value === val)) {
        opts.push({
          value: val,
          label: `${adv.name} (${adv.leads || 0})`,
          avatar: adv.avatar || undefined
        });
      }
    });
    return opts;
  }, [overviewData]);

  const dateOptions = useMemo(() => {
    const opts = [
      { value: 'this_month', label: 'Tháng này' },
      { value: 'today', label: 'Hôm nay' },
      { value: 'yesterday', label: 'Hôm qua' },
      { value: 'this_week', label: 'Tuần này' },
      { value: 'last_week', label: 'Tuần trước' },
      { value: 'two_weeks_ago', label: 'Tuần trước nữa' },
      { value: 'last_7_days', label: '7 ngày qua' },
      { value: 'last_30_days', label: '30 ngày qua' },
      { value: 'last_month', label: 'Tháng trước' },
      { value: 'this_quarter', label: 'Quý này' },
      { value: 'this_year', label: 'Năm nay' },
      { value: 'all_time', label: 'Toàn thời gian' }
    ];
    if (effectiveCustomStart && effectiveCustomEnd) {
      opts.push({
        value: 'custom',
        label: `${effectiveCustomStart} đến ${effectiveCustomEnd}`
      });
    } else if (dateRange === 'custom') {
      opts.push({ value: 'custom', label: 'Khoảng ngày tùy chỉnh' });
    }
    return opts;
  }, [effectiveCustomStart, effectiveCustomEnd, dateRange]);

  // Real Funnel Stages
  const funnelStages = useMemo(() => {
    return Array.isArray(overviewData?.funnel_stages) ? overviewData.funnel_stages : [];
  }, [overviewData]);

  // Real Top Sales Advisors
  const topAdvisors = useMemo(() => {
    return Array.isArray(overviewData?.top_advisors) ? overviewData.top_advisors : [];
  }, [overviewData]);

  // Real AdSets Breakdown
  const adsetList = useMemo(() => {
    const list = Array.isArray(overviewData?.by_adset) ? overviewData.by_adset : [];
    if (!deferredAdsetSearch.trim()) return list;
    const q = deferredAdsetSearch.trim().toLowerCase();
    return list.filter(
      (a: any) =>
        String(a.name || '').toLowerCase().includes(q) ||
        String(a.campaign_name || '').toLowerCase().includes(q)
    );
  }, [overviewData, deferredAdsetSearch]);

  // Real Ads List for Ad Preview Tab
  const adList = useMemo(() => {
    const list = Array.isArray(overviewData?.by_ad) ? overviewData.by_ad : [];
    if (!deferredAdPreviewSearch.trim()) return list;
    const q = deferredAdPreviewSearch.trim().toLowerCase();
    return list.filter(
      (a: any) =>
        String(a.name || '').toLowerCase().includes(q) ||
        String(a.adset_name || '').toLowerCase().includes(q) ||
        String(a.campaign_name || '').toLowerCase().includes(q) ||
        String(a.ad_id || '').toLowerCase().includes(q)
    );
  }, [overviewData, deferredAdPreviewSearch]);

  // Real Forms List
  const formList = useMemo(() => {
    return Array.isArray(overviewData?.by_form) ? overviewData.by_form : [];
  }, [overviewData]);

  // Real Survey Questions Analysis
  const formSurveyQuestions = useMemo(() => {
    return Array.isArray(overviewData?.survey_questions) ? overviewData.survey_questions : [];
  }, [overviewData]);

  // Real Data Quality & SLA Metrics
  const dataQualityMetrics = useMemo(() => {
    return Array.isArray(overviewData?.data_quality_metrics) ? overviewData.data_quality_metrics : [];
  }, [overviewData]);

  // Pipeline Stages Catalog & Attributed Leads for Lead-by-Ad & Pipeline Matrix Table
  const pipelineStagesCatalog = useMemo(() => {
    const raw = Array.isArray(overviewData?.pipeline_stages_catalog) ? overviewData.pipeline_stages_catalog : [];
    if (raw.length > 0) return raw;
    const fallback14 = [
      { key: '1', stage_order: 1, stage_name: '01 – New Lead', bucket: 'new_1_2', count: 0 },
      { key: '2', stage_order: 2, stage_name: '02 – Contact Attempted', bucket: 'new_1_2', count: 0 },
      { key: '3', stage_order: 3, stage_name: '03 – Connected', bucket: 'qualified_3_12', count: 0 },
      { key: '4', stage_order: 4, stage_name: '04 – Needed', bucket: 'qualified_3_12', count: 0 },
      { key: '5', stage_order: 5, stage_name: '05 – Discovery Completed', bucket: 'qualified_3_12', count: 0 },
      { key: '6', stage_order: 6, stage_name: '06 – Program Matched', bucket: 'qualified_3_12', count: 0 },
      { key: '7', stage_order: 7, stage_name: '07 – Proposal Sent', bucket: 'qualified_3_12', count: 0 },
      { key: '8', stage_order: 8, stage_name: '08 – Evaluation / Objection', bucket: 'qualified_3_12', count: 0 },
      { key: '9', stage_order: 9, stage_name: '09 – Application Started', bucket: 'qualified_3_12', count: 0 },
      { key: '10', stage_order: 10, stage_name: '10 – Application Completed', bucket: 'qualified_3_12', count: 0 },
      { key: '11', stage_order: 11, stage_name: '11 – Admission Approved', bucket: 'qualified_3_12', count: 0 },
      { key: '12', stage_order: 12, stage_name: '12 – Offer Accepted', bucket: 'qualified_3_12', count: 0 },
      { key: '13', stage_order: 13, stage_name: '13 – Deposit / Tuition Payment', bucket: 'win_13_14', count: 0 },
      { key: '14', stage_order: 14, stage_name: '14 – Enrolled', bucket: 'win_13_14', count: 0 },
      { key: 'nurture', stage_order: 98, stage_name: 'CS dài hạn (Nurture)', bucket: 'nurture', count: 0 },
      { key: 'lost', stage_order: 99, stage_name: 'Lost / Không tiềm năng', bucket: 'lost', count: 0 }
    ];
    return fallback14;
  }, [overviewData]);

  const visibleMatrixColumns = useMemo(() => {
    if (matrixShowAll14Cols) return pipelineStagesCatalog;
    // Show key stages + any stage that has count > 0 so the matrix fits cleanly while showing all real pipeline stages
    const hasLeadsOrCore = pipelineStagesCatalog.filter((st: any) => {
      const k = String(st.key);
      if (Number(st.count || 0) > 0) return true;
      return ['1', '2', '3', '4', '6', '13', '14', 'nurture', 'lost'].includes(k);
    });
    return hasLeadsOrCore.length > 0 ? hasLeadsOrCore : pipelineStagesCatalog;
  }, [pipelineStagesCatalog, matrixShowAll14Cols]);

  const allAdsForMatrix = useMemo(() => {
    return Array.isArray(overviewData?.by_ad) ? overviewData.by_ad : [];
  }, [overviewData]);

  const adsWithLeadCount = useMemo(() => {
    return allAdsForMatrix.filter((a: any) => Number(a.leads || 0) > 0).length;
  }, [allAdsForMatrix]);

  const matrixAdsList = useMemo(() => {
    const q = deferredMatrixSearch.trim().toLowerCase();
    const filtered = allAdsForMatrix
      .map((ad: any) => {
        const rawLeads: any[] = Array.isArray(ad.attributed_leads) ? ad.attributed_leads : [];
        const stageFilteredLeads =
          matrixPipelineFilter === 'all'
            ? rawLeads
            : rawLeads.filter((l: any) => String(l.stage_key) === matrixPipelineFilter);
        const searchFilteredLeads = !q
          ? stageFilteredLeads
          : stageFilteredLeads.filter(
              (l: any) =>
                String(l.full_name || '').toLowerCase().includes(q) ||
                String(l.phone || '').toLowerCase().includes(q) ||
                String(l.owner_name || '').toLowerCase().includes(q) ||
                String(l.stage_name || '').toLowerCase().includes(q)
            );
        const adNameMatches =
          !q ||
          String(ad.name || '').toLowerCase().includes(q) ||
          String(ad.adset_name || '').toLowerCase().includes(q) ||
          String(ad.campaign_name || '').toLowerCase().includes(q) ||
          String(ad.ad_id || ad.id || '').toLowerCase().includes(q);

        return {
          ...ad,
          filtered_leads: adNameMatches && q && searchFilteredLeads.length === 0 ? stageFilteredLeads : searchFilteredLeads,
          _matchesSearch: adNameMatches || searchFilteredLeads.length > 0
        };
      })
      .filter((ad: any) => {
        if (!ad._matchesSearch) return false;
        if (matrixPipelineFilter !== 'all') {
          const stCnt = Number(ad.stage_counts?.[matrixPipelineFilter] || 0);
          if (stCnt <= 0) return false;
        } else if (matrixOnlyAdsWithLeads && Number(ad.leads || 0) <= 0) {
          return false;
        }
        return true;
      });

    filtered.sort((a: any, b: any) => {
      if (matrixSortBy === 'spend') {
        return Number(b.spend || 0) - Number(a.spend || 0) || Number(b.leads || 0) - Number(a.leads || 0);
      }
      if (matrixSortBy === 'qualified_pct') {
        const pctA = Number(a.leads || 0) > 0 ? Number(a.qualified || 0) / Number(a.leads || 1) : 0;
        const pctB = Number(b.leads || 0) > 0 ? Number(b.qualified || 0) / Number(b.leads || 1) : 0;
        return pctB - pctA || Number(b.leads || 0) - Number(a.leads || 0);
      }
      return Number(b.leads || 0) - Number(a.leads || 0) || Number(b.spend || 0) - Number(a.spend || 0);
    });

    return filtered;
  }, [allAdsForMatrix, deferredMatrixSearch, matrixPipelineFilter, matrixOnlyAdsWithLeads, matrixSortBy]);

  const allAttributedLeads = useMemo(() => {
    return Array.isArray(overviewData?.attributed_leads) ? overviewData.attributed_leads : [];
  }, [overviewData]);

  const filteredMatrixLeads = useMemo(() => {
    const q = deferredMatrixSearch.trim().toLowerCase();
    return allAttributedLeads.filter((l: any) => {
      if (matrixPipelineFilter !== 'all' && String(l.stage_key) !== matrixPipelineFilter) {
        return false;
      }
      if (!q) return true;
      return (
        String(l.full_name || '').toLowerCase().includes(q) ||
        String(l.phone || '').toLowerCase().includes(q) ||
        String(l.email || '').toLowerCase().includes(q) ||
        String(l.ad_name || '').toLowerCase().includes(q) ||
        String(l.ad_id || '').toLowerCase().includes(q) ||
        String(l.owner_name || '').toLowerCase().includes(q) ||
        String(l.stage_name || '').toLowerCase().includes(q)
      );
    });
  }, [allAttributedLeads, deferredMatrixSearch, matrixPipelineFilter]);

  const handleExportMetaCsv = useCallback(() => {
    const rows = matrixTabMode === 'by_lead' && filteredMatrixLeads.length > 0
      ? filteredMatrixLeads
      : allAttributedLeads;
    const headers = ['ID Lead', 'Họ và tên', 'SĐT', 'Email', 'Quảng cáo (Ad)', 'Ad ID', 'Nhóm QC (AdSet)', 'Chiến dịch', 'Trạng thái Pipeline', 'Tư vấn viên', 'Ngày tạo'];
    const lines = [
      headers.map(csvCellSafe).join(','),
      ...rows.map((l: any) => [
        l.contact_id ?? l.id ?? '',
        l.full_name ?? '',
        l.phone ?? '',
        l.email ?? '',
        l.ad_name ?? '',
        l.ad_id ?? '',
        l.adset_name ?? '',
        l.campaign_name ?? '',
        l.stage_name ?? l.stage_key ?? '',
        l.owner_name ?? '',
        l.created_at ?? ''
      ].map(csvCellSafe).join(','))
    ];
    const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta-ads-attribution-${dateRange || 'export'}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [matrixTabMode, filteredMatrixLeads, allAttributedLeads, dateRange]);

  const openMatrixLeadDrawer = useCallback(
    (lead: any) => {
      if (!lead) return;
      const cid = Number(lead.contact_id || 0);
      if (cid > 0) {
        if (onOpenContact) {
          onOpenContact(cid, lead);
        } else {
          window.dispatchEvent(new CustomEvent('open-customer-drawer', { detail: { id: cid, contact: lead } }));
        }
      }
    },
    [onOpenContact]
  );

  const toggleMatrixAdExpand = useCallback((adKey: string) => {
    setExpandedMatrixAds((prev) => ({
      ...prev,
      [adKey]: !prev[adKey]
    }));
  }, []);

  const copyMatrixAdId = useCallback((rawId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!rawId) return;
    navigator.clipboard?.writeText(rawId);
    setCopiedMatrixAdId(rawId);
    setTimeout(() => setCopiedMatrixAdId(null), 1500);
  }, []);

  // Real Hierarchical Campaigns -> AdSets -> Ads
  const filteredHierarchy = useMemo(() => {
    const list = Array.isArray(overviewData?.hierarchy) ? overviewData.hierarchy : [];
    if (!deferredTableSearch.trim()) return list;
    const q = deferredTableSearch.trim().toLowerCase();
    return list.filter(
      (c: any) =>
        String(c.name || '').toLowerCase().includes(q) ||
        (Array.isArray(c.adsets) &&
          c.adsets.some(
            (a: any) =>
              String(a.name || '').toLowerCase().includes(q) ||
              (Array.isArray(a.ads) && a.ads.some((ad: any) => String(ad.name || '').toLowerCase().includes(q)))
          ))
    );
  }, [overviewData, deferredTableSearch]);

  const [adPreviewPayload, setAdPreviewPayload] = useState<any>(null);
  const [loadingAdPreview, setLoadingAdPreview] = useState<boolean>(false);

  useEffect(() => {
    const adId = previewAdModal?.ad_id ? String(previewAdModal.ad_id) : '';
    if (!adId) {
      setAdPreviewPayload(null);
      return;
    }
    const previewKey = `${tenantScopeKey}:${adId}`;
    const cachedPreview = adPreviewCache.get(previewKey);
    if (cachedPreview) {
      setAdPreviewPayload(cachedPreview);
      setLoadingAdPreview(false);
      return;
    }
    const controller = new AbortController();
    setLoadingAdPreview(true);
    api
      .get('/marketing/meta/ad-preview', {
        params: { ad_id: adId, format: 'DESKTOP_FEED_STANDARD' },
        signal: controller.signal
      })
      .then((res) => {
        if (!controller.signal.aborted) {
          const payload = res.data?.data ?? res.data ?? null;
          if (payload) adPreviewCache.set(previewKey, payload);
          setAdPreviewPayload(payload);
        }
      })
      .catch((err) => {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError' || controller.signal.aborted) return;
        setAdPreviewPayload(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingAdPreview(false);
      });
    return () => {
      controller.abort();
    };
  }, [previewAdModal?.ad_id, tenantScopeKey]);

  const formatChangeText = (pct: number | null | undefined) => {
    if (pct === null || pct === undefined || Number.isNaN(pct)) return '—';
    if (!pct) return '0%';
    return `${pct > 0 ? '+' : ''}${pct}%`;
  };

  const daypartingHeatmap = useMemo(
    () => buildMetaDaypartingCells(overviewData?.dayparting_heatmap, allAttributedLeads),
    [overviewData?.dayparting_heatmap, allAttributedLeads]
  );

  const handleOpenPlacementModal = useCallback(() => {
    setShowPlacementModal(true);
  }, []);

  const handleRefreshMeta = useCallback(() => {
    fetchMetaAnalytics(true);
  }, [fetchMetaAnalytics]);

  const handleChangeCustomFrom = useCallback(
    (iso: string) => {
      setLocalCustomStart(iso);
      setDateRange('custom');
      if (iso && (localCustomEnd || effectiveCustomEnd)) {
        const endVal = localCustomEnd || effectiveCustomEnd;
        const globalLabel = `${iso} đến ${endVal}`;
        try {
          localStorage.setItem('Ideas_global_date', globalLabel);
          window.dispatchEvent(new CustomEvent('global-date-change', { detail: globalLabel }));
        } catch {
          // ignore
        }
      }
    },
    [localCustomEnd, effectiveCustomEnd]
  );

  const handleChangeCustomTo = useCallback(
    (iso: string) => {
      setLocalCustomEnd(iso);
      setDateRange('custom');
      if ((localCustomStart || effectiveCustomStart) && iso) {
        const startVal = localCustomStart || effectiveCustomStart;
        const globalLabel = `${startVal} đến ${iso}`;
        try {
          localStorage.setItem('Ideas_global_date', globalLabel);
          window.dispatchEvent(new CustomEvent('global-date-change', { detail: globalLabel }));
        } catch {
          // ignore
        }
      }
    },
    [localCustomStart, effectiveCustomStart]
  );

  const viewTabOptions = useMemo(
    () => [
      { value: 'funnel' as const, label: 'Tổng quan', icon: <TrendingUp size={13} /> },
      { value: 'campaigns' as const, label: isMobile ? 'Chiến dịch' : `Chiến dịch (${summary.campaigns_count})`, icon: <Megaphone size={13} /> },
      { value: 'preview' as const, label: isMobile ? 'Mẫu QC' : `Mẫu QC (${summary.ads_count})`, icon: <Eye size={13} /> }
    ],
    [isMobile, summary.campaigns_count, summary.ads_count]
  );

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem', paddingBottom: '2rem' }}>
      {/* Unified 36px DOMATION Dashboard Toolbar */}
      <DomDashboardToolbar
        elevated
        left={
          <>
            <DomSegmentedSwitch<'funnel' | 'campaigns' | 'preview'>
              size="md"
              ariaLabel="Chế độ xem Meta Ads"
              value={viewMode}
              onChange={setViewMode}
              options={viewTabOptions}
            />

            {!isMobile && (
              <>
                <div style={{ flex: '1 1 170px', minWidth: '160px', maxWidth: '220px' }}>
                  <CustomSelect
                    options={campaignOptions}
                    value={selectedCampaignFilter}
                    onChange={(val) => setSelectedCampaignFilter(String(val))}
                    size="sm"
                    width="100%"
                  />
                </div>

                <div style={{ flex: '1 1 155px', minWidth: '150px', maxWidth: '205px' }}>
                  <CustomSelect
                    options={advisorOptions}
                    value={selectedOwnerFilter}
                    onChange={(val) => setSelectedOwnerFilter(String(val))}
                    size="sm"
                    width="100%"
                    showAvatars={true}
                  />
                </div>

                <div style={{ width: dateRange === 'custom' ? '180px' : '138px', flexShrink: 0 }}>
                  <CustomSelect
                    options={dateOptions}
                    value={dateRange}
                    onChange={(val) => handleDateRangeSelectChange(String(val))}
                    size="sm"
                    width="100%"
                  />
                </div>

                {dateRange === 'custom' && (
                  <DomDateRangePill
                    fromDate={localCustomStart}
                    toDate={localCustomEnd}
                    onFromChange={handleChangeCustomFrom}
                    onToChange={handleChangeCustomTo}
                  />
                )}
              </>
            )}
          </>
        }
        right={
          !isMobile ? (
            <span
              title={`Tài khoản: ${summary.account_name} (${summary.account_id})${summary.since && summary.until ? ` • Kỳ: ${summary.since} → ${summary.until}` : ''}`}
              style={{
                height: '36px',
                padding: '0 12px',
                borderRadius: '10px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--color-text)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                whiteSpace: 'nowrap'
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
              <span>{summary.account_name}</span>
            </span>
          ) : undefined
        }
        actions={
          <>
            {isMobile && (
              <DomToolbarButton
                variant="outline"
                active={selectedCampaignFilter !== 'all' || selectedOwnerFilter !== 'all' || showMobileFilters}
                icon={<SlidersHorizontal size={13} />}
                onClick={() => setShowMobileFilters((prev) => !prev)}
              >
                Lọc
              </DomToolbarButton>
            )}

            {!isMobile && (selectedCampaignFilter !== 'all' || selectedOwnerFilter !== 'all') && (
              <DomToolbarButton
                variant="outline"
                icon={<X size={13} />}
                onClick={() => {
                  setSelectedCampaignFilter('all');
                  setSelectedOwnerFilter('all');
                }}
              >
                Xóa lọc
              </DomToolbarButton>
            )}

            <DomToolbarButton
              variant="outline"
              icon={<Download size={13} />}
              onClick={handleExportMetaCsv}
              title="Xuất danh sách Lead Attribution ra file CSV"
            >
              {!isMobile ? 'Xuất CSV' : undefined}
            </DomToolbarButton>

            <DomToolbarButton
              variant="outline"
              disabled={refreshing || loading}
              icon={<RefreshCw size={13} className={refreshing || loading ? 'animate-spin' : ''} />}
              onClick={handleRefreshMeta}
              title="Làm mới dữ liệu từ Facebook Graph API & MYERP DB"
            >
              {!isMobile ? 'Làm mới' : undefined}
            </DomToolbarButton>
          </>
        }
      />

      {/* Mobile Collapsible Filter Row */}
      {isMobile && showMobileFilters && (
        <div
          className="card"
          style={{
            padding: '10px 12px',
            borderRadius: 14,
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px'
          }}
        >
          <div style={{ gridColumn: '1 / -1' }}>
            <CustomSelect
              options={campaignOptions}
              value={selectedCampaignFilter}
              onChange={(val) => setSelectedCampaignFilter(String(val))}
              size="sm"
              width="100%"
            />
          </div>
          <CustomSelect
            options={advisorOptions}
            value={selectedOwnerFilter}
            onChange={(val) => setSelectedOwnerFilter(String(val))}
            size="sm"
            width="100%"
            showAvatars={true}
          />
          <CustomSelect
            options={dateOptions}
            value={dateRange}
            onChange={(val) => handleDateRangeSelectChange(String(val))}
            size="sm"
            width="100%"
          />
          {dateRange === 'custom' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <DomDateRangePill
                fromDate={localCustomStart}
                toDate={localCustomEnd}
                onFromChange={handleChangeCustomFrom}
                onToChange={handleChangeCustomTo}
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>
      )}

      {/* TOP KPI STRIP FOR CAMPAIGNS & AD LIBRARY TABS */}
      {viewMode !== 'funnel' && (
        loading ? (
          <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </div>
        ) : (
          <MetaCompactKpiStrip summary={summary} formatChangeText={formatChangeText} />
        )
      )}

      {errorMsg && (
        <div
          className="card"
          style={{
            padding: '1rem 1.25rem',
            borderRadius: 12,
            border: '1px solid var(--color-border)',
            background: '#fef2f2',
            color: '#991b1b',
            fontSize: '0.82rem',
            fontWeight: 600
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* ========================================================================
          TAB 1: BÁO CÁO DOMATION METAREPORT & PHỄU CRM (viewMode === 'funnel')
         ======================================================================== */}
      {viewMode === 'funnel' && loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            <InteractionGridSkeleton />
            <ChartSkeleton height={240} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            <DonutAndBarChartSkeleton />
            <DonutAndRankedListSkeleton />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            <LeaderboardCardSkeleton rows={5} />
            <CompletenessGridSkeleton items={6} />
          </div>
        </div>
      )}

      {viewMode === 'funnel' && !loading && (
        <>
          {/* DOMATION METAREPORT HERO ROW: 3-col Spent Stack | 5-col Daily Spent Spline | 4-col Meta Goal */}
          <MetaHeroReportRow
            isMobile={isMobile}
            summary={summary}
            dailyMetric={dailyMetric}
            onChangeDailyMetric={setDailyMetric}
            dailyTrend={dailyTrend}
            metaGoalChart={metaGoalChart}
          />

          {/* DOMATION ROW 2: Active Status + 6 Interaction Tiles | Spent Platform Donut | Age & Gender */}
          <MetaEngagementPlatformAgeRow
            isMobile={isMobile}
            summary={summary}
            platformSpend={platformSpend}
            placementPositions={placementPositions}
            ageGenderBreakdown={ageGenderBreakdown}
            ageOnlyMode={ageOnlyMode}
            onChangeAgeOnlyMode={setAgeOnlyMode}
            onOpenPlacementModal={handleOpenPlacementModal}
          />

          {/* DOMATION ROW 3: Dayparting Heatmap (isolated hover) & Top Regions */}
          <MetaDaypartingAndRegionsRow
            isMobile={isMobile}
            daypartingCells={daypartingHeatmap.cells}
            isSpendBasedHeatmap={daypartingHeatmap.isSpendBased}
            regionBreakdown={regionBreakdown}
          />

          {/* ROW 1: Chiến Dịch & Phễu Chuyển Đổi Pipeline */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            {/* Left Card: Archetype 1 Ranked List + 162x162 SVG Donut */}
            <div className="card dom-cv-card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                    Thống Kê Theo Chiến Dịch Quảng Cáo Meta Thực Tế
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    Đối soát Chi phí (Spend), Optimization Goal, Kết quả Meta &amp; Lượng Lead CRM
                  </p>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontSize: '0.74rem',
                    fontWeight: 700
                  }}
                >
                  {campaignBreakdown.length} chiến dịch
                </span>
              </div>

              {campaignBreakdown.length === 0 ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                  Chưa có dữ liệu chiến dịch trong khoảng thời gian đã chọn.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr', gap: '1.2rem', alignItems: 'center' }}>
                  {/* Left Ranked List */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {campaignBreakdown.slice(0, 6).map((item: any, idx: number) => {
                      const sharePct = Number(item.spend_pct || item.pct || 0);
                      return (
                        <div key={item.id || idx} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                              <span style={{ width: 18, fontSize: '0.76rem', fontWeight: 700, color: idx === 0 ? '#BD1D2D' : 'var(--color-text-muted)' }}>
                                #{idx + 1}
                              </span>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
                              <span
                                style={{
                                  fontSize: '0.82rem',
                                  fontWeight: idx === 0 ? 700 : 600,
                                  color: 'var(--color-text)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                                title={item.name}
                              >
                                {item.name}
                              </span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px', flexShrink: 0 }}>
                              <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-text)' }}>
                                {formatVND(item.spend)}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                ({sharePct}%)
                              </span>
                            </div>
                          </div>
                          <div style={{ marginLeft: 24, display: 'flex', justifyContent: 'space-between', fontSize: '0.69rem', color: 'var(--color-text-muted)' }}>
                            <span>Meta KQ: <strong style={{ color: 'var(--color-text)' }}>{formatNumber(item.results)}</strong> • Lead CRM: <strong style={{ color: '#BD1D2D' }}>{item.leads}</strong></span>
                            <span>Goal: <strong style={{ color: 'var(--color-text-secondary)' }}>{item.goal_label || item.optimization_goal}</strong> • CPR: <strong style={{ color: 'var(--color-text)' }}>{formatVND(item.cpr)}</strong></span>
                          </div>
                          <div style={{ marginLeft: 24, height: 6, borderRadius: 4, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.max(3, sharePct)}%`,
                                background: idx === 0 ? '#C6333D' : item.color,
                                borderRadius: 4,
                                transition: 'width 0.3s ease'
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Right SVG Donut 162x162 */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid var(--color-border-light)', paddingLeft: '0.5rem' }}>
                    <div style={{ position: 'relative', width: 162, height: 162 }}>
                      <svg width="162" height="162" viewBox="0 0 162 162" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="81" cy="81" r="64" fill="transparent" stroke="var(--color-bg-secondary)" strokeWidth="18" />
                        {(() => {
                          const circ = 2 * Math.PI * 64;
                          let acc = 0;
                          return campaignBreakdown.map((it: any) => {
                            const share = Number(it.spend_pct || it.pct || 0);
                            const dash = (share / 100) * circ;
                            const offset = acc;
                            acc += dash;
                            return (
                              <circle
                                key={it.id}
                                cx="81"
                                cy="81"
                                r="64"
                                fill="transparent"
                                stroke={it.color}
                                strokeWidth="18"
                                strokeDasharray={`${dash} ${circ}`}
                                strokeDashoffset={-offset}
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', padding: '0 18px', textAlign: 'center' }}>
                        <span style={{ fontSize: '1.22rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1 }}>
                          {campaignBreakdown[0]?.spend_pct || campaignBreakdown[0]?.pct || 0}%
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '3px', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {campaignBreakdown[0]?.name}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Card: Phễu Chuyển Đổi Pipeline & Video Retention */}
            <div className="card dom-cv-card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                    Phễu chuyển đổi từ Meta Leads đến Pipeline CRM
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    Theo dõi tỷ lệ chuyển đổi từ kết quả Lead trên Meta sang Lead CRM, Qualified &amp; Won
                  </p>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: '#BD1D2D',
                    fontSize: '0.74rem',
                    fontWeight: 700
                  }}
                >
                  Pipeline 1→14
                </span>
              </div>

              <div style={{ width: '100%', height: 225 }}>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={funnelStages} margin={{ top: 18, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                    <XAxis dataKey="stage" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)', fontWeight: 500 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                      contentStyle={{
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        fontSize: '0.75rem',
                        background: 'var(--color-surface)',
                        boxShadow: 'var(--shadow-md)',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                      formatter={(val: any) => [`${val} leads`, 'Số lượng']}
                    />
                    <Bar dataKey="count" barSize={28} radius={[4, 4, 0, 0]}>
                      {funnelStages.map((_entry: any, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === funnelStages.length - 1 ? '#10B981' : index === 0 ? '#2563EB' : '#6366F1'}
                        />
                      ))}
                      <LabelList dataKey="count" position="top" style={{ fontSize: '11px', fontWeight: 600, fill: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* DEDICATED LEAD PIPELINE EFFICIENCY CARDS: New (1-2) • Qualified (3-12) • Win (13-14) */}
          <div className="dom-cv-card" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
              {/* Card 1: Tổng Lead CRM & Hiệu suất Tiếp nhận */}
              <div className="stat-card" style={{ minHeight: '140px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="stat-label" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.73rem' }}>
                    HIỆU SUẤT PIPELINE LEAD CRM
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={16} />
                  </div>
                </div>
                <div className="stat-value" style={{ fontWeight: 800, color: 'var(--color-text)', fontSize: '1.45rem', fontVariantNumeric: 'tabular-nums' }}>
                  {formatNumber(summary.total_leads)}{' '}
                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                    Lead CRM
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', fontSize: '0.74rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#BD1D2D', flexShrink: 0 }} />
                    <span>Đã tương tác: <strong style={{ color: 'var(--color-text)' }}>{formatNumber(summary.contacted_leads)} ({summary.contacted_pct}%)</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-secondary)', flexShrink: 0 }} />
                    <span>Đã chia Sale: <strong style={{ color: 'var(--color-text)' }}>{formatNumber(summary.assigned_leads)} ({summary.assigned_pct}%)</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <span>CPL CRM: <strong style={{ color: 'var(--color-text)' }}>{formatShortMoney(summary.crm_cpl || summary.cpl)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Card 2: New 1 - 2 (Pipeline 1-2) */}
              <div className="stat-card" style={{ minHeight: '140px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="stat-label" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.73rem' }}>
                    NEW / CHƯA TƯƠNG TÁC (1–2)
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15, 23, 42, 0.06)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <MessageCircle size={16} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="stat-value" style={{ fontWeight: 800, color: 'var(--color-text)', fontSize: '1.45rem', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(summary.new_1_2_leads)}
                  </span>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.74rem',
                      fontWeight: 800
                    }}
                  >
                    New 1–2 ({summary.new_1_2_pct}%)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', fontSize: '0.74rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <span>01 - New Lead: <strong style={{ color: 'var(--color-text)' }}>{formatNumber(summary.stage_1_leads)} lead</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-secondary)', flexShrink: 0 }} />
                    <span>02 - Đang gọi (Attempting): <strong style={{ color: 'var(--color-text)' }}>{formatNumber(summary.stage_2_leads)} lead</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <span>Chi phí / New (1–2): <strong style={{ color: 'var(--color-text)' }}>{formatShortMoney(summary.cost_per_new_1_2)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Card 3: Qualified từ 3 - 12 (Pipeline 3-12) */}
              <div className="stat-card" style={{ minHeight: '140px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="stat-label" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.73rem' }}>
                    QUALIFIED (PIPELINE 3–12)
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15, 23, 42, 0.06)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Target size={16} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="stat-value" style={{ fontWeight: 800, color: 'var(--color-text)', fontSize: '1.45rem', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(summary.qualified_3_12_leads)}
                  </span>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-secondary)',
                      fontSize: '0.74rem',
                      fontWeight: 700
                    }}
                  >
                    Qualified ({summary.qualified_3_12_pct}%)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', fontSize: '0.74rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-secondary)', flexShrink: 0 }} />
                    <span>Giai đoạn: <strong style={{ color: 'var(--color-text)' }}>Pipeline 03 → 12 (Đang tư vấn)</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <span>Chi phí / Qualified (CPQ): <strong style={{ color: 'var(--color-text)' }}>{formatShortMoney(summary.cpq_3_12 || summary.cpq)}</strong></span>
                  </div>
                </div>
              </div>

              {/* Card 4: Win 13 - 14 (Pipeline 13-14) — BRAND CRIMSON HIGHLIGHT */}
              <div className="stat-card" style={{ minHeight: '140px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="stat-label" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.73rem' }}>
                    WIN / HỌC VIÊN (PIPELINE 13–14)
                  </span>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={16} />
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="stat-value" style={{ fontWeight: 800, color: '#BD1D2D', fontSize: '1.45rem', fontVariantNumeric: 'tabular-nums' }}>
                    {formatNumber(summary.won_leads)}
                  </span>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: '#fef2f2',
                      color: '#BD1D2D',
                      fontSize: '0.74rem',
                      fontWeight: 700
                    }}
                  >
                    Học viên / Win ({summary.won_pct}%)
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', fontSize: '0.74rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)', flexShrink: 0 }} />
                    <span>13 - Chờ đóng phí: <strong style={{ color: 'var(--color-text)' }}>{formatNumber(summary.stage_13_leads)} lead</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#BD1D2D', flexShrink: 0 }} />
                    <span>14 - Học viên chính thức: <strong style={{ color: '#BD1D2D' }}>{formatNumber(summary.stage_14_leads)} học viên</strong></span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#991B1B', flexShrink: 0 }} />
                    <span>Doanh thu: <strong style={{ color: 'var(--color-text)' }}>{formatShortMoney(summary.actual_revenue)}</strong> • CPW: <strong style={{ color: 'var(--color-text)' }}>{formatShortMoney(summary.cpw)}</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Visual 3-Tier Pipeline Spectrum Bar */}
            {summary.total_leads > 0 && (
              <div
                className="card"
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  flexWrap: 'wrap'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>Tỷ trọng Pipeline Lead:</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-text-muted)' }} />
                    <span>New (1–2):</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                      {summary.new_1_2_leads} ({summary.new_1_2_pct}%)
                    </span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--color-text-secondary)' }} />
                    <span>Qualified (3–12):</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                      {summary.qualified_3_12_leads} ({summary.qualified_3_12_pct}%)
                    </span>
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#BD1D2D' }} />
                    <span>Học viên / Win (13–14):</span>
                    <span style={{ padding: '2px 8px', borderRadius: 6, background: '#fef2f2', color: '#BD1D2D', fontWeight: 700, fontSize: '0.73rem', fontVariantNumeric: 'tabular-nums' }}>
                      {summary.won_leads} ({summary.won_pct}%)
                    </span>
                  </span>
                </div>
                <div style={{ flex: '1 1 260px', maxWidth: 420, height: 8, borderRadius: 999, background: 'var(--color-bg-tertiary)', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ width: `${summary.new_1_2_pct}%`, background: 'var(--color-text-muted)', height: '100%' }} title={`New (1-2): ${summary.new_1_2_leads} (${summary.new_1_2_pct}%)`} />
                  <div style={{ width: `${summary.qualified_3_12_pct}%`, background: 'var(--color-text-secondary)', height: '100%' }} title={`Qualified (3-12): ${summary.qualified_3_12_leads} (${summary.qualified_3_12_pct}%)`} />
                  <div style={{ width: `${summary.won_pct}%`, background: '#BD1D2D', height: '100%' }} title={`Học viên / Win (13-14): ${summary.won_leads} (${summary.won_pct}%)`} />
                </div>
              </div>
            )}
          </div>

          {/* BẢNG ĐỐI CHIẾU CÁC LEAD THEO QUẢNG CÁO & PIPELINE (AD x PIPELINE MATRIX & INLINE EXPANDABLE LEADS) */}
          <div
            className="card dom-cv-card"
            style={{
              padding: '1.25rem 1.35rem',
              borderRadius: 16,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
            }}
          >
            {/* Top Toolbar: Switcher (Theo Bài Quảng Cáo / Đối Chiếu Từng Lead) + Search & Mode Toggles */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <DomSegmentedSwitch<'by_ad' | 'by_lead'>
                size="md"
                ariaLabel="Chế độ xem bảng đối chiếu Ad và Lead"
                value={matrixTabMode}
                onChange={(nextMode) => {
                  setMatrixTabMode(nextMode);
                  if (nextMode === 'by_lead') setMatrixFlatLeadPage(1);
                }}
                options={[
                  { value: 'by_ad', label: `Theo Bài Quảng Cáo (${adsWithLeadCount})`, icon: <Megaphone size={13} /> },
                  { value: 'by_lead', label: `Đối Chiếu Từng Lead (${allAttributedLeads.length})`, icon: <Layers size={13} /> }
                ]}
              />

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <CleanSearchBox
                  value={matrixSearch}
                  onChange={(v) => {
                    setMatrixSearch(v);
                    setMatrixFlatLeadPage(1);
                  }}
                  placeholder="Tìm bài QC, #ID, tên/SĐT lead, Sale..."
                  width={isMobile ? '100%' : 240}
                />

                {matrixTabMode === 'by_ad' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setMatrixOnlyAdsWithLeads((prev) => !prev)}
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        background: matrixOnlyAdsWithLeads ? 'var(--color-surface)' : 'var(--color-bg-secondary)',
                        color: 'var(--color-text)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                      title="Chuyển đổi hiển thị chỉ các bài QC có sinh Lead hoặc toàn bộ bài QC"
                    >
                      <span>{matrixOnlyAdsWithLeads ? `Bài QC có sinh Lead (${adsWithLeadCount})` : `Tất cả bài QC (${allAdsForMatrix.length})`}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMatrixShowAll14Cols((prev) => !prev)}
                      style={{
                        height: '32px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border)',
                        background: matrixShowAll14Cols ? '#fef2f2' : '#f8fafc',
                        color: matrixShowAll14Cols ? '#BD1D2D' : 'var(--color-text-secondary)',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      {matrixShowAll14Cols ? 'Đang hiện đủ 14 bước Pipeline' : 'Mở rộng đủ 14 cột Pipeline'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* PIPELINE Quick Filter Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                padding: '8px 12px',
                borderRadius: '10px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-light)'
              }}
            >
              <span
                style={{
                  fontSize: '0.71rem',
                  fontWeight: 800,
                  color: 'var(--color-text-muted)',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  marginRight: '4px'
                }}
              >
                <SlidersHorizontal size={12} />
                PIPELINE:
              </span>

              <button
                type="button"
                onClick={() => {
                  setMatrixPipelineFilter('all');
                  setMatrixFlatLeadPage(1);
                }}
                style={{
                  height: '27px',
                  padding: '0 11px',
                  borderRadius: '999px',
                  border: matrixPipelineFilter === 'all' ? '1.5px solid #BD1D2D' : '1px solid var(--color-border)',
                  background: matrixPipelineFilter === 'all' ? '#fef2f2' : '#ffffff',
                  color: matrixPipelineFilter === 'all' ? '#BD1D2D' : 'var(--color-text-secondary)',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <span>Tất cả ({allAttributedLeads.length})</span>
              </button>

              {pipelineStagesCatalog.map((st: any) => {
                const stKey = String(st.key);
                const stCnt = Number(st.count || 0);
                const isSelected = matrixPipelineFilter === stKey;
                const shortName = String(st.stage_name || '')
                  .replace(/^0(\d)\s*[–-]\s*/, '$1. ')
                  .replace(/^(\d{2})\s*[–-]\s*/, '$1. ');

                let badgeBg = '#f1f5f9';
                let badgeColor = '#475569';
                if (st.bucket === 'win_13_14') {
                  badgeBg = '#dcfce7';
                  badgeColor = '#15803d';
                } else if (st.bucket === 'qualified_3_12') {
                  badgeBg = Number(st.stage_order) >= 6 ? '#dbeafe' : '#dcfce7';
                  badgeColor = Number(st.stage_order) >= 6 ? '#1d4ed8' : '#15803d';
                } else if (st.bucket === 'nurture') {
                  badgeBg = '#e0f2fe';
                  badgeColor = '#0369a1';
                } else if (st.bucket === 'lost') {
                  badgeBg = '#ffe4e6';
                  badgeColor = '#e11d48';
                }

                return (
                  <button
                    key={stKey}
                    type="button"
                    onClick={() => {
                      setMatrixPipelineFilter(isSelected ? 'all' : stKey);
                      setMatrixFlatLeadPage(1);
                    }}
                    style={{
                      height: '27px',
                      padding: '0 9px',
                      borderRadius: '999px',
                      border: isSelected ? '1.5px solid #BD1D2D' : '1px solid var(--color-border)',
                      background: isSelected ? '#fef2f2' : '#ffffff',
                      color: isSelected ? '#BD1D2D' : 'var(--color-text-secondary)',
                      fontSize: '0.73rem',
                      fontWeight: isSelected ? 800 : 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      opacity: stCnt === 0 && !isSelected ? 0.72 : 1
                    }}
                  >
                    <span>{shortName}</span>
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: '999px',
                        background: badgeBg,
                        color: badgeColor,
                        fontSize: '0.69rem',
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {stCnt}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* MODE 1: THEO BÀI QUẢNG CÁO (MATRIX TABLE + INLINE EXPANDABLE LEADS) */}
            {matrixTabMode === 'by_ad' ? (
              matrixAdsList.length === 0 ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.83rem' }}>
                  Không có bài quảng cáo nào khớp với bộ lọc Pipeline hiện tại.
                </div>
              ) : (
                <div className="custom-scrollbar" style={{ overflowX: 'auto', border: '1px solid var(--color-border-light)', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', minWidth: 980 }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.02em' }}>
                        <th style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 800, minWidth: 245 }}>
                          BÀI QUẢNG CÁO
                        </th>
                        <th
                          onClick={() =>
                            setMatrixSortBy((prev) =>
                              prev === 'leads' ? 'spend' : prev === 'spend' ? 'qualified_pct' : 'leads'
                            )
                          }
                          style={{ padding: '9px 10px', textAlign: 'left', fontWeight: 800, minWidth: 165, cursor: 'pointer', color: '#BD1D2D', userSelect: 'none' }}
                          title="Bấm để đổi sắp xếp theo Số lượng Lead / Chi phí / Tỷ lệ Tiềm năng"
                        >
                          HIỆU SUẤT &amp; CHI PHÍ ▼
                        </th>
                        <th style={{ padding: '9px 6px', textAlign: 'center', fontWeight: 800, minWidth: 48 }}>
                          TỔNG
                        </th>
                        {visibleMatrixColumns.map((col: any) => {
                          const shortHeader = String(col.stage_name || '')
                            .replace(/^0(\d)\s*[–-]\s*/, '$1. ')
                            .replace(/^(\d{2})\s*[–-]\s*/, '$1. ');
                          let headerColor = '#475569';
                          if (col.bucket === 'win_13_14') headerColor = '#be185d';
                          else if (col.bucket === 'qualified_3_12') {
                            headerColor = Number(col.stage_order) >= 6 ? '#1d4ed8' : '#15803d';
                          } else if (col.bucket === 'nurture') headerColor = '#0284c7';
                          else if (col.bucket === 'lost') headerColor = '#e11d48';

                          return (
                            <th
                              key={col.key}
                              style={{
                                padding: '8px 4px',
                                textAlign: 'center',
                                fontWeight: 800,
                                color: headerColor,
                                width: 70,
                                minWidth: 64,
                                maxWidth: 82,
                                fontSize: '0.7rem',
                                lineHeight: 1.2,
                                whiteSpace: 'normal',
                                wordBreak: 'break-word',
                                verticalAlign: 'middle'
                              }}
                              title={col.stage_name}
                            >
                              {shortHeader}
                            </th>
                          );
                        })}
                        <th style={{ padding: '9px 8px', textAlign: 'center', fontWeight: 800, minWidth: 82 }}>
                          CHI TIẾT
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixAdsList.map((ad: any, adIdx: number) => {
                        const adKey = String(ad.id || ad.ad_id || adIdx);
                        const rawAdId = String(ad.ad_id || '').replace(/[^0-9]/g, '');
                        const shortAdId = rawAdId ? rawAdId.slice(-6) : String(adKey).slice(-6);
                        const totalAdLeads = Number(ad.leads || 0);
                        const qualCount = Number(ad.qualified || 0);
                        const qualPct = totalAdLeads > 0 ? Math.round((qualCount / totalAdLeads) * 1000) / 10 : 0;
                        const isExpanded = Boolean(expandedMatrixAds[adKey]);
                        const adLeadsList: any[] = Array.isArray(ad.filtered_leads)
                          ? ad.filtered_leads
                          : Array.isArray(ad.attributed_leads)
                          ? ad.attributed_leads
                          : [];
                        const currentPage = matrixAdPageMap[adKey] || 1;
                        const pageSize = 8;
                        const totalPages = Math.max(1, Math.ceil(adLeadsList.length / pageSize));
                        const safePage = Math.min(currentPage, totalPages);
                        const pageSlice = adLeadsList.slice((safePage - 1) * pageSize, safePage * pageSize);

                        return (
                          <React.Fragment key={adKey}>
                            <tr
                              onClick={() => adLeadsList.length > 0 && toggleMatrixAdExpand(adKey)}
                              style={{
                                borderBottom: '1px solid var(--color-border-light)',
                                background: isExpanded ? 'var(--color-bg-secondary)' : 'var(--color-surface)',
                                cursor: adLeadsList.length > 0 ? 'pointer' : 'default',
                                transition: 'background 0.15s ease'
                              }}
                              title={adLeadsList.length > 0 ? (isExpanded ? 'Bấm để thu gọn danh sách Lead' : 'Bấm vào dòng để xem danh sách Lead') : undefined}
                            >
                              {/* Col 1: BÀI QUẢNG CÁO */}
                              <td style={{ padding: '10px 12px', verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div
                                    onClick={(e) => {
                                      if (!rawAdId) return;
                                      e.stopPropagation();
                                      setPreviewAdModal(ad);
                                    }}
                                    style={{
                                      width: 44,
                                      height: 44,
                                      borderRadius: 9,
                                      overflow: 'hidden',
                                      background: 'var(--color-bg-tertiary)',
                                      border: '1px solid var(--color-border)',
                                      flexShrink: 0,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: rawAdId ? 'pointer' : 'default'
                                    }}
                                  >
                                    {ad.thumbnail_url ? (
                                      <img
                                        src={ad.thumbnail_url}
                                        alt={ad.name}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                      />
                                    ) : (
                                      <Megaphone size={18} style={{ color: '#BD1D2D' }} />
                                    )}
                                  </div>
                                  <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div
                                      style={{
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        color: 'var(--color-text)',
                                        maxWidth: 230,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title={ad.name}
                                    >
                                      {ad.name}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: '0.7rem',
                                        color: 'var(--color-text-muted)',
                                        maxWidth: 230,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                      title={ad.adset_name || ad.campaign_name}
                                    >
                                      {ad.adset_name || ad.campaign_name || 'Meta Lead Ads'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                      {rawAdId && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setPreviewAdModal(ad);
                                          }}
                                          style={{
                                            padding: '2px 7px',
                                            borderRadius: 5,
                                            border: '1px solid #fecdd3',
                                            background: '#fff1f2',
                                            color: '#BD1D2D',
                                            fontSize: '0.7rem',
                                            fontWeight: 800,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '3px'
                                          }}
                                        >
                                          <Eye size={10} />
                                          <span>Iframe QC</span>
                                        </button>
                                      )}
                                      <span
                                        onClick={(e) => copyMatrixAdId(rawAdId || adKey, e)}
                                        style={{
                                          fontSize: '0.7rem',
                                          color: copiedMatrixAdId === (rawAdId || adKey) ? '#16a34a' : 'var(--color-text-muted)',
                                          fontFamily: 'monospace',
                                          cursor: 'pointer'
                                        }}
                                        title={rawAdId ? `Bấm để sao chép Ad ID: ${rawAdId}` : adKey}
                                      >
                                        {copiedMatrixAdId === (rawAdId || adKey) ? 'Đã chép!' : `#${shortAdId}`}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Col 2: HIỆU SUẤT & CHI PHÍ */}
                              <td style={{ padding: '11px 12px', verticalAlign: 'middle' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    {qualCount > 0 ? (
                                      <>
                                        <span
                                          style={{
                                            padding: '2px 7px',
                                            borderRadius: 6,
                                            background: '#dbeafe',
                                            color: '#1d4ed8',
                                            fontSize: '0.7rem',
                                            fontWeight: 800
                                          }}
                                        >
                                          Tiềm năng
                                        </span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                                          {qualPct}% ({qualCount}/{totalAdLeads})
                                        </span>
                                      </>
                                    ) : totalAdLeads > 0 ? (
                                      <>
                                        <span
                                          style={{
                                            padding: '2px 7px',
                                            borderRadius: 6,
                                            background: '#fef3c7',
                                            color: '#b45309',
                                            fontSize: '0.7rem',
                                            fontWeight: 800
                                          }}
                                        >
                                          Chờ đánh giá
                                        </span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#15803d', fontVariantNumeric: 'tabular-nums' }}>
                                          0% (0/{totalAdLeads})
                                        </span>
                                      </>
                                    ) : (
                                      <span
                                        style={{
                                          padding: '2px 7px',
                                          borderRadius: 6,
                                          background: 'var(--color-bg-tertiary)',
                                          color: 'var(--color-text-muted)',
                                          fontSize: '0.7rem',
                                          fontWeight: 700
                                        }}
                                      >
                                        Chưa sinh Lead CRM
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                    Chi: <strong style={{ color: 'var(--color-text)' }}>{formatShortMoney(ad.spend)}</strong> • CPL:{' '}
                                    <strong style={{ color: 'var(--color-text-secondary)' }}>
                                      {Number(ad.cpl || 0) > 0 ? formatShortMoney(ad.cpl) : '—'}
                                    </strong>
                                  </div>
                                </div>
                              </td>

                              {/* Col 3: TỔNG */}
                              <td style={{ padding: '9px 6px', textAlign: 'center', verticalAlign: 'middle' }}>
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: 26,
                                    height: 24,
                                    padding: '0 6px',
                                    borderRadius: 6,
                                    background: totalAdLeads > 0 ? '#fef2f2' : '#f8fafc',
                                    color: totalAdLeads > 0 ? '#BD1D2D' : 'var(--color-text-muted)',
                                    fontWeight: 800,
                                    fontSize: '0.74rem',
                                    fontVariantNumeric: 'tabular-nums'
                                  }}
                                >
                                  {totalAdLeads}
                                </span>
                              </td>

                              {/* Dynamic Pipeline Stage Columns */}
                              {visibleMatrixColumns.map((col: any) => {
                                const cnt = Number(ad.stage_counts?.[col.key] || 0);
                                let cellBg = 'transparent';
                                let cellColor = '#cbd5e1';
                                if (cnt > 0) {
                                  if (col.bucket === 'win_13_14') {
                                    cellBg = 'rgba(236, 72, 153, 0.1)';
                                    cellColor = '#be185d';
                                  } else if (col.bucket === 'qualified_3_12') {
                                    cellBg = 'rgba(22, 163, 74, 0.1)';
                                    cellColor = '#15803d';
                                  } else if (col.bucket === 'lost') {
                                    cellBg = 'rgba(225, 29, 72, 0.08)';
                                    cellColor = '#e11d48';
                                  } else if (col.bucket === 'nurture') {
                                    cellBg = 'rgba(2, 132, 199, 0.1)';
                                    cellColor = '#0369a1';
                                  } else {
                                    cellBg = '#f1f5f9';
                                    cellColor = '#0f172a';
                                  }
                                }
                                return (
                                  <td
                                    key={col.key}
                                    style={{
                                      padding: '9px 4px',
                                      textAlign: 'center',
                                      verticalAlign: 'middle',
                                      fontVariantNumeric: 'tabular-nums'
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: 26,
                                        height: 24,
                                        padding: '0 6px',
                                        borderRadius: 6,
                                        background: cellBg,
                                        color: cellColor,
                                        fontWeight: cnt > 0 ? 800 : 500,
                                        fontSize: '0.74rem'
                                      }}
                                    >
                                      {cnt}
                                    </span>
                                  </td>
                                );
                              })}

                              {/* Sticky Right: CHI TIẾT */}
                              <td style={{ padding: '9px 8px', textAlign: 'center', verticalAlign: 'middle' }}>
                                <button
                                  type="button"
                                  disabled={adLeadsList.length === 0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleMatrixAdExpand(adKey);
                                  }}
                                  style={{
                                    height: '26px',
                                    padding: '0 9px',
                                    borderRadius: 7,
                                    border: isExpanded ? '1px solid #BD1D2D' : '1px solid var(--color-border)',
                                    background: isExpanded ? '#fef2f2' : '#f8fafc',
                                    color: isExpanded ? '#BD1D2D' : adLeadsList.length > 0 ? 'var(--color-text)' : 'var(--color-text-muted)',
                                    fontSize: '0.71rem',
                                    fontWeight: 700,
                                    cursor: adLeadsList.length > 0 ? 'pointer' : 'not-allowed',
                                    whiteSpace: 'nowrap'
                                  }}
                                >
                                  Xem ({adLeadsList.length}) {isExpanded ? '▲' : '▼'}
                                </button>
                              </td>
                            </tr>

                            {/* INLINE EXPANDED SUB-TABLE OF LEADS FOR THIS AD */}
                            {isExpanded && adLeadsList.length > 0 && (
                              <tr className="no-hover">
                                <td
                                  colSpan={4 + visibleMatrixColumns.length}
                                  style={{
                                    padding: 0,
                                    borderBottom: '2px solid #e2e8f0'
                                  }}
                                >
                                  <div style={{ padding: '8px 14px 14px 14px', background: 'var(--color-bg-secondary)' }}>
                                  <div
                                    style={{
                                      borderRadius: 12,
                                      border: '1px solid var(--color-border)',
                                      background: 'var(--color-surface)',
                                      overflow: 'hidden',
                                      boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)'
                                    }}
                                  >
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                                      <tbody>
                                        {pageSlice.map((lead: any, lIdx: number) => {
                                          let pillBg = '#f1f5f9';
                                          let pillColor = '#334155';
                                          let dotColor = '#64748b';
                                          if (lead.stage_bucket === 'win_13_14') {
                                            pillBg = '#fdf2f8';
                                            pillColor = '#be185d';
                                            dotColor = '#ec4899';
                                          } else if (lead.stage_bucket === 'qualified_3_12') {
                                            if (Number(lead.stage_order) >= 5) {
                                              pillBg = '#dcfce7';
                                              pillColor = '#15803d';
                                              dotColor = '#16a34a';
                                            } else {
                                              pillBg = '#fef3c7';
                                              pillColor = '#b45309';
                                              dotColor = '#f59e0b';
                                            }
                                          } else if (lead.stage_bucket === 'lost') {
                                            pillBg = '#ffe4e6';
                                            pillColor = '#e11d48';
                                            dotColor = '#f43f5e';
                                          } else if (lead.stage_bucket === 'nurture') {
                                            pillBg = '#e0f2fe';
                                            pillColor = '#0369a1';
                                            dotColor = '#0284c7';
                                          }

                                          return (
                                            <tr
                                              key={lead.attribution_id || `${adKey}_lead_${lIdx}`}
                                              onClick={() => openMatrixLeadDrawer(lead)}
                                              style={{
                                                borderBottom: '1px solid var(--color-border-light)',
                                                cursor: Number(lead.contact_id || 0) > 0 ? 'pointer' : 'default'
                                              }}
                                            >
                                              {/* Lead Avatar + Name */}
                                              <td style={{ padding: '9px 14px', width: '22%' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                                                  <Avatar name={lead.full_name || 'KH'} size={26} />
                                                  <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.78rem' }}>
                                                    {lead.full_name}
                                                  </span>
                                                </div>
                                              </td>

                                              {/* Phone */}
                                              <td
                                                style={{
                                                  padding: '9px 10px',
                                                  width: '15%',
                                                  fontFamily: 'monospace',
                                                  fontWeight: 700,
                                                  color: 'var(--color-text-secondary)',
                                                  fontSize: '0.76rem',
                                                  fontVariantNumeric: 'tabular-nums'
                                                }}
                                              >
                                                {lead.phone || '—'}
                                              </td>

                                              {/* Consultant (Sale) */}
                                              <td style={{ padding: '9px 10px', width: '18%' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                                                  <Avatar name={lead.owner_name || 'Sale'} src={lead.owner_avatar || undefined} size={24} />
                                                  <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.76rem' }}>
                                                    {lead.owner_name || 'Chưa phân bổ'}
                                                  </span>
                                                </div>
                                              </td>

                                              {/* Pipeline Stage Pill */}
                                              <td style={{ padding: '9px 10px', width: '18%' }}>
                                                <span
                                                  style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    padding: '3px 9px',
                                                    borderRadius: '999px',
                                                    background: pillBg,
                                                    color: pillColor,
                                                    fontSize: '0.71rem',
                                                    fontWeight: 800,
                                                    whiteSpace: 'nowrap'
                                                  }}
                                                >
                                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />
                                                  <span>{lead.stage_name}</span>
                                                </span>
                                              </td>

                                              {/* Note / Program Interest */}
                                              <td
                                                style={{
                                                  padding: '9px 10px',
                                                  color: 'var(--color-text-muted)',
                                                  fontSize: '0.73rem',
                                                  maxWidth: 240,
                                                  overflow: 'hidden',
                                                  textOverflow: 'ellipsis',
                                                  whiteSpace: 'nowrap'
                                                }}
                                                title={lead.note_snippet || lead.program || ''}
                                              >
                                                {lead.note_snippet || (lead.program ? `Quan tâm: ${lead.program}` : '-')}
                                              </td>

                                              {/* Timestamp */}
                                              <td
                                                style={{
                                                  padding: '9px 14px',
                                                  textAlign: 'right',
                                                  color: 'var(--color-text-muted)',
                                                  fontSize: '0.72rem',
                                                  fontFamily: 'monospace',
                                                  whiteSpace: 'nowrap'
                                                }}
                                              >
                                                {lead.created_at || '—'}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>

                                    {/* Sub-table Pagination Footer */}
                                    <div
                                      style={{
                                        padding: '8px 14px',
                                        background: 'var(--color-bg-secondary)',
                                        borderTop: '1px solid var(--color-border-light)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '0.73rem',
                                        color: 'var(--color-text-muted)'
                                      }}
                                    >
                                      <span>
                                        Hiển thị {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, adLeadsList.length)} /{' '}
                                        <strong style={{ color: 'var(--color-text)' }}>{adLeadsList.length} Lead</strong>
                                      </span>
                                      {totalPages > 1 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                                            <button
                                              key={pNum}
                                              type="button"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setMatrixAdPageMap((prev) => ({ ...prev, [adKey]: pNum }));
                                              }}
                                              style={{
                                                minWidth: 26,
                                                height: 26,
                                                padding: '0 6px',
                                                borderRadius: 6,
                                                border: pNum === safePage ? 'none' : '1px solid var(--color-border)',
                                                background: pNum === safePage ? '#BD1D2D' : '#ffffff',
                                                color: pNum === safePage ? '#ffffff' : 'var(--color-text-secondary)',
                                                fontSize: '0.72rem',
                                                fontWeight: 800,
                                                cursor: 'pointer'
                                              }}
                                            >
                                              {pNum}
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              /* MODE 2: ĐỐI CHIẾU TỪNG LEAD (FLAT PAGINATED LEAD ATTRIBUTION TABLE) */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredMatrixLeads.length === 0 ? (
                  <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.83rem' }}>
                    Không có Lead nào khớp với điều kiện tìm kiếm.
                  </div>
                ) : (
                  <>
                    <div className="custom-scrollbar" style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 12 }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', minWidth: 920 }}>
                        <thead>
                          <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontSize: '0.69rem' }}>
                            <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800 }}>KHÁCH HÀNG (LEAD)</th>
                            <th style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 800 }}>SỐ ĐIỆN THOẠI</th>
                            <th style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 800 }}>BÀI QUẢNG CÁO &amp; CHIẾN DỊCH</th>
                            <th style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 800 }}>TƯ VẤN VIÊN</th>
                            <th style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 800 }}>PIPELINE</th>
                            <th style={{ padding: '10px 10px', textAlign: 'left', fontWeight: 800 }}>GHI CHÚ / CHƯƠNG TRÌNH</th>
                            <th style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800 }}>THỜI GIAN</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredMatrixLeads
                            .slice((matrixFlatLeadPage - 1) * 15, matrixFlatLeadPage * 15)
                            .map((lead: any, idx: number) => {
                              let pillBg = '#f1f5f9';
                              let pillColor = '#334155';
                              let dotColor = '#64748b';
                              if (lead.stage_bucket === 'win_13_14') {
                                pillBg = '#fdf2f8';
                                pillColor = '#be185d';
                                dotColor = '#ec4899';
                              } else if (lead.stage_bucket === 'qualified_3_12') {
                                pillBg = '#dcfce7';
                                pillColor = '#15803d';
                                dotColor = '#16a34a';
                              } else if (lead.stage_bucket === 'lost') {
                                pillBg = '#ffe4e6';
                                pillColor = '#e11d48';
                                dotColor = '#f43f5e';
                              }
                              return (
                                <tr
                                  key={lead.attribution_id || idx}
                                  onClick={() => openMatrixLeadDrawer(lead)}
                                  style={{
                                    borderBottom: '1px solid var(--color-border-light)',
                                    cursor: Number(lead.contact_id || 0) > 0 ? 'pointer' : 'default'
                                  }}
                                >
                                  <td style={{ padding: '10px 14px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <Avatar name={lead.full_name || 'KH'} size={26} />
                                      <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{lead.full_name}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '10px 10px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                                    {lead.phone || '—'}
                                  </td>
                                  <td style={{ padding: '10px 10px', maxWidth: 240 }}>
                                    <div style={{ fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.ad_name}>
                                      {lead.ad_name || 'Meta Lead Ads'}
                                    </div>
                                    <div style={{ fontSize: '0.69rem', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {lead.campaign_name}
                                    </div>
                                  </td>
                                  <td style={{ padding: '10px 10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      <Avatar name={lead.owner_name || 'Sale'} src={lead.owner_avatar || undefined} size={22} />
                                      <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{lead.owner_name}</span>
                                    </div>
                                  </td>
                                  <td style={{ padding: '10px 10px' }}>
                                    <span
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '5px',
                                        padding: '3px 9px',
                                        borderRadius: '999px',
                                        background: pillBg,
                                        color: pillColor,
                                        fontSize: '0.71rem',
                                        fontWeight: 800
                                      }}
                                    >
                                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor }} />
                                      <span>{lead.stage_name}</span>
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 10px', color: 'var(--color-text-muted)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {lead.note_snippet || (lead.program ? `Quan tâm: ${lead.program}` : '-')}
                                  </td>
                                  <td style={{ padding: '10px 14px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>
                                    {lead.created_at || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                    {Math.ceil(filteredMatrixLeads.length / 15) > 1 && (() => {
                      const totalPages = Math.ceil(filteredMatrixLeads.length / 15);
                      const pageNums: Array<number | '...'> = [];
                      if (totalPages <= 7) {
                        for (let i = 1; i <= totalPages; i++) pageNums.push(i);
                      } else {
                        pageNums.push(1);
                        if (matrixFlatLeadPage > 3) pageNums.push('...');
                        const start = Math.max(2, matrixFlatLeadPage - 1);
                        const end = Math.min(totalPages - 1, matrixFlatLeadPage + 1);
                        for (let i = start; i <= end; i++) pageNums.push(i);
                        if (matrixFlatLeadPage < totalPages - 2) pageNums.push('...');
                        pageNums.push(totalPages);
                      }
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--color-text-muted)', padding: '4px 4px 0', flexWrap: 'wrap', gap: '8px' }}>
                          <span>
                            Hiển thị {(matrixFlatLeadPage - 1) * 15 + 1}–{Math.min(matrixFlatLeadPage * 15, filteredMatrixLeads.length)} /{' '}
                            <strong style={{ color: 'var(--color-text)' }}>{filteredMatrixLeads.length} Lead</strong>
                          </span>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              type="button"
                              disabled={matrixFlatLeadPage <= 1}
                              onClick={() => setMatrixFlatLeadPage((p) => Math.max(1, p - 1))}
                              style={{
                                minWidth: 28,
                                height: 28,
                                padding: '0 6px',
                                borderRadius: 6,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: matrixFlatLeadPage <= 1 ? 'var(--color-border)' : 'var(--color-text-secondary)',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                cursor: matrixFlatLeadPage <= 1 ? 'not-allowed' : 'pointer'
                              }}
                            >
                              ‹
                            </button>
                            {pageNums.map((pItem, pIdx) =>
                              pItem === '...' ? (
                                <span key={`ellipsis-${pIdx}`} style={{ padding: '0 4px', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                                  …
                                </span>
                              ) : (
                                <button
                                  key={pItem}
                                  type="button"
                                  onClick={() => setMatrixFlatLeadPage(pItem)}
                                  style={{
                                    minWidth: 28,
                                    height: 28,
                                    borderRadius: 6,
                                    border: pItem === matrixFlatLeadPage ? 'none' : '1px solid var(--color-border)',
                                    background: pItem === matrixFlatLeadPage ? '#BD1D2D' : '#ffffff',
                                    color: pItem === matrixFlatLeadPage ? '#ffffff' : 'var(--color-text-secondary)',
                                    fontSize: '0.73rem',
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                >
                                  {pItem}
                                </button>
                              )
                            )}
                            <button
                              type="button"
                              disabled={matrixFlatLeadPage >= totalPages}
                              onClick={() => setMatrixFlatLeadPage((p) => Math.min(totalPages, p + 1))}
                              style={{
                                minWidth: 28,
                                height: 28,
                                padding: '0 6px',
                                borderRadius: 6,
                                border: '1px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                color: matrixFlatLeadPage >= totalPages ? 'var(--color-border)' : 'var(--color-text-secondary)',
                                fontSize: '0.73rem',
                                fontWeight: 700,
                                cursor: matrixFlatLeadPage >= totalPages ? 'not-allowed' : 'pointer'
                              }}
                            >
                              ›
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ROW 2: Top Tư Vấn Viên Tiếp Nhận Lead Meta (Archetype 3) & Lượng Lead Theo AdSet (Archetype 4) */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            {/* Left Card: Archetype 3 Top Tư Vấn Viên (100% Real MYERP Users + Avatar + 3 Pipeline Buckets) */}
            <div className="card dom-cv-card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                    Top Tư Vấn Viên Tiếp Nhận &amp; Chuyển Đổi Lead Meta
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    Chi tiết hiệu suất xử lý Lead theo 3 nhóm Pipeline: New (1–2) • Qualified (3–12) • Học viên / Win (13–14)
                  </p>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap'
                  }}
                >
                  {topAdvisors.length} nhân sự
                </span>
              </div>

              <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 310, overflowY: 'auto', paddingRight: 4 }}>
                {topAdvisors.length === 0 ? (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                    Chưa có dữ liệu phân bổ tư vấn viên.
                  </div>
                ) : (
                  topAdvisors.slice(0, 10).map((emp: any, idx: number) => {
                    const empIdVal = String(emp.user_id > 0 ? emp.user_id : emp.id || '');
                    const isSelectedAdvisor = selectedOwnerFilter !== 'all' && selectedOwnerFilter === empIdVal;
                    const empLeads = Number(emp.leads || 0);
                    const empWon = Number(emp.won || 0);
                    const empQual312 = Number(emp.qualified_3_12 ?? Math.max(0, Number(emp.qualified || 0) - empWon));
                    const empNew12 = Number(emp.new_1_2 ?? Math.max(0, empLeads - empQual312 - empWon));
                    const activeProgressPct = empLeads > 0 ? Math.round(((empQual312 + empWon) / empLeads) * 100) : 0;
                    return (
                      <div
                        key={emp.id || idx}
                        onClick={() => {
                          if (emp.user_id > 0) {
                            setSelectedOwnerFilter(isSelectedAdvisor ? 'all' : String(emp.user_id));
                          }
                        }}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                          padding: '10px 12px',
                          borderRadius: 10,
                          border: isSelectedAdvisor ? '1.5px solid var(--color-text)' : '1px solid var(--color-border)',
                          background: isSelectedAdvisor ? '#f8fafc' : idx === 0 ? 'rgba(189, 29, 45, 0.02)' : '#ffffff',
                          cursor: emp.user_id > 0 ? 'pointer' : 'default'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <span style={{ fontSize: '0.92rem', width: 22, textAlign: 'center', flexShrink: 0, fontWeight: 700, color: 'var(--color-text-secondary)' }}>
                              {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                            </span>
                            <Avatar src={emp.avatar} name={emp.name} size={28} />
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {emp.name}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-text)' }}>
                              {empLeads} lead
                            </span>
                            <span
                              style={{
                                background: 'var(--color-bg-tertiary)',
                                color: 'var(--color-text-secondary)',
                                padding: '2px 7px',
                                borderRadius: '6px',
                                fontSize: '0.7rem',
                                fontWeight: 700
                              }}
                            >
                              {emp.pct}%
                            </span>
                          </div>
                        </div>

                        {/* Pipeline 3-Tier Breakdown Row with Colored Badges */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginLeft: 30, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.71rem', flexWrap: 'wrap' }}>
                            <span style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)' }} />
                              New: {empNew12}
                            </span>
                            <span style={{ padding: '2px 7px', borderRadius: 5, background: '#fef2f2', color: '#BD1D2D', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C6333D' }} />
                              Qualified: {empQual312}
                            </span>
                            <span style={{ padding: '2px 7px', borderRadius: 5, background: '#fdf2f8', color: '#db2777', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ec4899' }} />
                              Học viên: {empWon}
                            </span>
                          </div>
                          <span
                            style={{ fontSize: '0.69rem', fontWeight: 700, color: 'var(--color-text-muted)' }}
                            title="Tỷ lệ Lead đã vượt qua bước Chưa tương tác (Pipeline 1–2) để vào nhóm Qualified (3–12) hoặc Học viên / Win (13–14)"
                          >
                            Tỷ lệ Qualified: <strong style={{ color: 'var(--color-text)' }}>{activeProgressPct}%</strong>
                          </span>
                        </div>

                        <div style={{ marginLeft: 30, height: 5, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.min(100, Math.max(4, emp.pct))}%`,
                              background: idx < 3 ? '#C6333D' : 'var(--color-text-secondary)',
                              borderRadius: 4
                            }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Card: Archetype 4 Lượng Lead Theo Nhóm Quảng Cáo (AdSet) */}
            <div className="card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                    Hiệu quả theo nhóm quảng cáo (AdSet)
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    So sánh hiệu quả thu hút Lead trên từng nhóm đối tượng quảng cáo
                  </p>
                </div>
                <CleanSearchBox value={adsetSearch} onChange={setAdsetSearch} placeholder="Tìm nhóm AdSet..." width={175} />
              </div>

              <div style={{ width: '100%', height: 265 }}>
                {adsetList.length === 0 ? (
                  <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.82rem' }}>
                    Không tìm thấy nhóm quảng cáo phù hợp.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={adsetList.slice(0, 7)} margin={{ top: 18, right: 10, left: -20, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: 'var(--color-text-secondary)', fontWeight: 500 }}
                        axisLine={{ stroke: 'var(--color-border)' }}
                        tickLine={false}
                        tickFormatter={(val) => (String(val).length > 18 ? String(val).slice(0, 18) + '…' : String(val))}
                      />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                        contentStyle={{
                          borderRadius: 8,
                          border: '1px solid var(--color-border)',
                          fontSize: '0.75rem',
                          background: 'var(--color-surface)',
                          boxShadow: 'var(--shadow-md)',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                        formatter={(val: any, _name: any, props: any) => [
                          `${val} leads (Chi phí: ${formatVND(props?.payload?.spend || 0)})`,
                          'Kết quả'
                        ]}
                      />
                      <Bar dataKey="count" fill="#7C3AED" barSize={26} radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="count" position="top" style={{ fontSize: '11px', fontWeight: 600, fill: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          {/* ROW 3: Khảo Sát Form Meta (2 x 2 Grid as requested) & Chất Lượng Data Meta */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            {/* Left Card: Phân Tích Khảo Sát Form Meta (2x2 Grid) */}
            <div className="card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                    Phân tích câu trả lời khảo sát Instant Form
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    Chân dung học viên tổng hợp trực tiếp từ câu trả lời biểu mẫu đăng ký Meta
                  </p>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontSize: '0.74rem',
                    fontWeight: 700
                  }}
                >
                  {formSurveyQuestions.length} nhóm khảo sát
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                {formSurveyQuestions.map((q: any, qIdx: number) => (
                  <div
                    key={qIdx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--color-border-light)',
                      background: 'var(--color-bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: '2px' }}>
                      {q.title}
                    </div>
                    {(Array.isArray(q.options) ? q.options : []).map((opt: any, oIdx: number) => (
                      <div key={oIdx} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: '0.72rem' }}>
                          <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={opt.label}>
                            {opt.label}
                          </span>
                          <strong style={{ color: 'var(--color-text)', flexShrink: 0 }}>
                            {opt.count} ({opt.pct}%)
                          </strong>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: '#e2e8f0', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${Math.max(2, opt.pct)}%`,
                              background: oIdx === 0 ? '#C6333D' : 'var(--color-text-muted)',
                              borderRadius: 2
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            {/* Right Card: Archetype 5 Chất Lượng Data Meta & Tỷ Lệ Chuyển Đổi */}
            <div className="card dom-cv-card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                    Độ Đầy Đủ Dữ Liệu &amp; Tỷ Lệ Chuyển Đổi Thực Tế
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    Phân màu tự động theo tỷ lệ thực tế: Xanh (≥ 80%), Vàng (50–79%), Đỏ (&lt; 50%)
                  </p>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    color: '#BD1D2D',
                    fontSize: '0.74rem',
                    fontWeight: 700
                  }}
                >
                  Data Health
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {dataQualityMetrics.map((metric: any, idx: number) => {
                  const tone = getCompletenessTone(Number(metric.pct || 0));
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 10,
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone.dot }} />
                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>
                            {metric.label}
                          </span>
                        </div>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: tone.bg,
                            color: tone.text,
                            fontSize: '0.72rem',
                            fontWeight: 800
                          }}
                        >
                          {metric.pct}%
                        </span>
                      </div>
                      <div style={{ height: 6, borderRadius: 4, background: '#e2e8f0', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${Math.max(2, metric.pct)}%`,
                            background: tone.bar,
                            borderRadius: 4,
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.69rem', color: 'var(--color-text-muted)' }}>
                        {metric.desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ROW 4: Video Retention Funnel & Device Breakdown */}
          <MetaVideoAndDeviceRow
            isMobile={isMobile}
            summary={summary}
            videoRetention={videoRetention}
            deviceBreakdown={deviceBreakdown}
          />
        </>
      )}

      {/* ========================================================================
          TAB 2: CHIẾN DỊCH & NHÓM QC (viewMode === 'campaigns')
         ======================================================================== */}
      {viewMode === 'campaigns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Instant Form Breakdown Summary Cards */}
          {formList.length > 0 && (
            <div className="card dom-cv-card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text)' }}>
                    Thống kê theo biểu mẫu Instant Form
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                    Số lượng Lead và chuyển đổi thực tế từ từng biểu mẫu quảng cáo Meta
                  </p>
                </div>
                <span style={{ padding: '4px 10px', borderRadius: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text)' }}>
                  {formList.length} biểu mẫu
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                {formList.map((f: any, idx: number) => (
                  <div
                    key={f.name || idx}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-secondary)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                        {f.name}
                      </span>
                      <span style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--color-surface)', border: '1px solid var(--color-border)', fontSize: '0.72rem', fontWeight: 800, color: '#BD1D2D' }}>
                        {f.pct}%
                      </span>
                    </div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatNumber(f.count)} <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>leads</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)' }} />
                        New: {f.new_1_2 ?? Math.max(0, (f.count || 0) - (f.qualified_3_12 ?? f.qualified ?? 0) - (f.won || 0))}
                      </span>
                      <span style={{ padding: '2px 7px', borderRadius: 5, background: '#fef2f2', color: '#BD1D2D', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C6333D' }} />
                        Qualified: {f.qualified_3_12 ?? f.qualified ?? 0}
                      </span>
                      <span style={{ padding: '2px 7px', borderRadius: 5, background: '#fef2f2', color: '#991B1B', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#BD1D2D' }} />
                        Học viên: {f.won || 0}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full-Funnel Hierarchical Table: Chiến Dịch → Nhóm QC → Mẫu Quảng Cáo */}
          <div className="card dom-cv-card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                  Danh sách chiến dịch, nhóm quảng cáo &amp; bài quảng cáo toàn phễu
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                  Kết hợp trực tiếp Chi phí, Kết quả Meta với Phễu CRM 3 tầng: New (1–2) → Qualified (3–12) → Học viên / Win (13–14)
                </p>
              </div>
              <CleanSearchBox value={tableSearch} onChange={setTableSearch} placeholder="Tìm chiến dịch, nhóm QC, bài QC..." width={240} />
            </div>

            {loading ? (
              <TableSkeleton rows={6} cols={10} />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
                      <th style={{ padding: '9px 12px', fontWeight: 700 }}>Chiến Dịch / Nhóm QC / Bài Quảng Cáo</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700 }}>Mục Tiêu</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>Chi Phí Ads</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>KQ Meta</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>CPR Meta</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>Lead CRM</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>New (1–2)</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>Qualified (3–12)</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>Học viên (13–14)</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'center' }}>Xem QC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHierarchy.length === 0 ? (
                      <tr>
                        <td colSpan={10} style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                          Không có chiến dịch nào khớp với bộ lọc hiện tại.
                        </td>
                      </tr>
                    ) : (
                      filteredHierarchy.map((camp: any) => (
                        <React.Fragment key={camp.id}>
                          {/* Campaign Header Row */}
                          <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', fontWeight: 700 }}>
                            <td style={{ padding: '10px 12px', color: 'var(--color-text)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {Array.isArray(camp.fan_thumbnails) && camp.fan_thumbnails[0] ? (
                                  <img
                                    src={camp.fan_thumbnails[0]}
                                    alt={camp.name}
                                    style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--color-border)', flexShrink: 0 }}
                                    referrerPolicy="no-referrer"
                                  />
                                ) : (
                                  <Megaphone size={14} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                                )}
                                <div>
                                  <div>{camp.name}</div>
                                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                    {camp.adsets_count} nhóm QC • {camp.ads_count} mẫu quảng cáo
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '10px 10px', color: 'var(--color-text-secondary)', fontSize: '0.73rem' }}>
                              {camp.goal_label || camp.optimization_goal || '—'}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--color-text)', fontWeight: 800 }}>
                              {formatVND(camp.spend)}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--color-text)' }}>
                              {formatNumber(camp.results || camp.meta_leads || 0)}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                              {formatVND(camp.cpr || 0)}
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right', color: 'var(--color-text)', fontWeight: 800 }}>
                              {formatNumber(camp.leads)} ({camp.pct}%)
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <span style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontWeight: 700, fontSize: '0.72rem' }}>
                                {formatNumber(camp.new_1_2 ?? Math.max(0, (camp.leads || 0) - (camp.qualified_3_12 ?? camp.qualified ?? 0) - (camp.won || 0)))}
                              </span>
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <span style={{ padding: '2px 7px', borderRadius: 5, background: '#fef2f2', color: '#BD1D2D', fontWeight: 800, fontSize: '0.72rem' }}>
                                {formatNumber(camp.qualified_3_12 ?? camp.qualified ?? 0)}
                              </span>
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'right' }}>
                              <span style={{ padding: '2px 7px', borderRadius: 5, background: '#fdf2f8', color: '#db2777', fontWeight: 800, fontSize: '0.72rem' }}>
                                {formatNumber(camp.won)}
                              </span>
                            </td>
                            <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.71rem' }}>
                              {camp.ads_count} bài
                            </td>
                          </tr>

                          {/* Nested AdSets Rows */}
                          {(Array.isArray(camp.adsets) ? camp.adsets : []).map((adset: any) => (
                            <React.Fragment key={adset.id}>
                              <tr style={{ borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-surface)' }}>
                                <td style={{ padding: '8px 12px 8px 30px', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Layers size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                                    <span>{adset.name}</span>
                                  </div>
                                </td>
                                <td style={{ padding: '8px 10px', color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>
                                  {adset.goal_label || adset.optimization_goal || '—'}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: 700 }}>
                                  {formatVND(adset.spend)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                                  {formatNumber(adset.results || adset.meta_leads || 0)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                  {formatVND(adset.cpr || 0)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--color-text)', fontWeight: 700 }}>
                                  {formatNumber(adset.leads)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                                  {formatNumber(adset.new_1_2 ?? Math.max(0, (adset.leads || 0) - (adset.qualified_3_12 ?? adset.qualified ?? 0) - (adset.won || 0)))}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#BD1D2D', fontWeight: 700 }}>
                                  {formatNumber(adset.qualified_3_12 ?? adset.qualified ?? 0)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#db2777', fontWeight: 700 }}>
                                  {formatNumber(adset.won)}
                                </td>
                                <td style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.71rem' }}>
                                  {(adset.ads || []).length} bài
                                </td>
                              </tr>

                              {/* Nested Ad Creatives */}
                              {(Array.isArray(adset.ads) ? adset.ads : []).map((ad: any) => (
                                <tr key={ad.id} style={{ borderBottom: '1px solid #f8fafc', background: 'var(--color-bg-secondary)' }}>
                                  <td style={{ padding: '7px 12px 7px 50px', color: 'var(--color-text-secondary)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {ad.thumbnail_url ? (
                                        <img
                                          src={ad.thumbnail_url}
                                          alt={ad.name}
                                          style={{ width: 26, height: 26, borderRadius: 5, objectFit: 'cover', border: '1px solid var(--color-border)', flexShrink: 0 }}
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <span style={{ color: '#cbd5e1' }}>↳</span>
                                      )}
                                      <div>
                                        <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{ad.name}</div>
                                        {ad.form_name && (
                                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                            Form: {ad.form_name}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding: '7px 10px', color: 'var(--color-text-muted)', fontSize: '0.71rem' }}>
                                    {ad.goal_label || ad.optimization_goal || '—'}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text)', fontWeight: 700 }}>
                                    {formatVND(ad.spend)}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                                    {formatNumber(ad.results || ad.meta_leads || 0)}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                    {formatVND(ad.cpr || 0)}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text)', fontWeight: 700 }}>
                                    {formatNumber(ad.leads)}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: 'var(--color-text-muted)' }}>
                                    {formatNumber(ad.new_1_2 ?? Math.max(0, (ad.leads || 0) - (ad.qualified_3_12 ?? ad.qualified ?? 0) - (ad.won || 0)))}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#BD1D2D', fontWeight: 700 }}>
                                    {formatNumber(ad.qualified_3_12 ?? ad.qualified ?? 0)}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', color: '#db2777', fontWeight: 700 }}>
                                    {formatNumber(ad.won)}
                                  </td>
                                  <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPreviewAdModal({
                                          ...ad,
                                          adset_name: adset.name,
                                          adset_id: adset.adset_id,
                                          campaign_name: camp.name,
                                          campaign_id: camp.campaign_id
                                        })
                                      }
                                      style={{
                                        padding: '4px 9px',
                                        borderRadius: 6,
                                        border: '1px solid var(--color-border)',
                                        background: 'var(--color-surface)',
                                        color: '#BD1D2D',
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      <Eye size={12} />
                                      <span>Xem QC</span>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================
          TAB 3: THƯ VIỆN AD PREVIEW (viewMode === 'preview')
         ======================================================================== */}
      {viewMode === 'preview' && (
        <div className="card dom-cv-card" style={{ padding: '1.35rem', borderRadius: 16, border: '1px solid var(--color-border)', background: 'var(--color-surface)', display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>
                Thư Viện Mẫu Quảng Cáo Meta ({adList.length} mẫu quảng cáo)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                Chi phí thực tế, Kết quả Meta, Hiệu suất Phễu Lead CRM (New 1–2 / Qualified 3–12 / Học viên 13–14) &amp; Xem trực tiếp bài quảng cáo
              </p>
            </div>
            <CleanSearchBox value={adPreviewSearch} onChange={setAdPreviewSearch} placeholder="Tìm tên bài quảng cáo, chiến dịch..." width={260} />
          </div>

          {adList.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.84rem' }}>
              Không tìm thấy mẫu quảng cáo nào khớp với từ khóa.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))', gap: '1rem' }}>
              {adList.map((ad: any, idx: number) => {
                const adNew12 = ad.new_1_2 ?? Math.max(0, (ad.leads || 0) - (ad.qualified_3_12 ?? ad.qualified ?? 0) - (ad.won || 0));
                const adQual312 = ad.qualified_3_12 ?? ad.qualified ?? 0;
                const adWon1314 = ad.won || 0;
                return (
                  <div
                    key={ad.id || idx}
                    style={{
                      borderRadius: 14,
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      padding: '14px 16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)'
                    }}
                  >
                    {/* Top Row: Thumbnail + Title & Campaign/AdSet */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div
                        onClick={() => setPreviewAdModal(ad)}
                        title="Bấm xem trực tiếp bài quảng cáo"
                        style={{
                          width: 76,
                          height: 76,
                          borderRadius: 10,
                          overflow: 'hidden',
                          border: '1px solid var(--color-border)',
                          flexShrink: 0,
                          cursor: 'pointer',
                          position: 'relative',
                          background: 'var(--color-bg-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        {ad.thumbnail_url ? (
                          <img
                            src={ad.thumbnail_url}
                            alt={ad.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Megaphone size={22} style={{ color: 'var(--color-text-muted)' }} />
                        )}
                        <span
                          style={{
                            position: 'absolute',
                            top: 4,
                            left: 4,
                            padding: '1px 6px',
                            borderRadius: 5,
                            background: idx < 3 ? '#BD1D2D' : 'rgba(15, 23, 42, 0.78)',
                            color: '#ffffff',
                            fontSize: '0.7rem',
                            fontWeight: 800
                          }}
                        >
                          #{idx + 1}
                        </span>
                      </div>

                      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div
                          onClick={() => setPreviewAdModal(ad)}
                          style={{
                            fontSize: '0.86rem',
                            fontWeight: 800,
                            color: 'var(--color-text)',
                            lineHeight: 1.35,
                            cursor: 'pointer',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}
                          title={ad.name}
                        >
                          {ad.name}
                        </div>
                        <div
                          style={{
                            fontSize: '0.73rem',
                            color: 'var(--color-text-muted)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={`${ad.campaign_name || ''} • ${ad.adset_name || ''}`}
                        >
                          {ad.adset_name || ad.campaign_name || 'Chiến dịch Meta Ads'}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 1 }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: 5,
                              background: 'var(--color-bg-tertiary)',
                              color: 'var(--color-text-secondary)',
                              fontSize: '0.7rem',
                              fontWeight: 700
                            }}
                          >
                            {ad.goal_label || ad.optimization_goal || 'Leads'}
                          </span>
                          {ad.form_name && ad.form_name !== '—' && (
                            <span
                              style={{
                                padding: '2px 7px',
                                borderRadius: 5,
                                background: '#fef2f2',
                                color: '#BD1D2D',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                maxWidth: 165,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                              title={ad.form_name}
                            >
                              {ad.form_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Middle 3-Column Metric Box */}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1.15fr 0.85fr 1fr',
                        gap: 8,
                        padding: '10px 12px',
                        borderRadius: 10,
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border-light)'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                          Chi phí Ads
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-text)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                          {formatVND(ad.spend)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                          CPR: <strong style={{ color: 'var(--color-text-secondary)' }}>{formatVND(ad.cpr)}</strong>
                        </div>
                      </div>

                      <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 10 }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                          KQ Meta
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--color-text)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumber(ad.meta_leads || ad.results || 0)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                          Tỷ trọng: <strong style={{ color: 'var(--color-text-secondary)' }}>{ad.pct}%</strong>
                        </div>
                      </div>

                      <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 10 }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                          Lead CRM
                        </div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#BD1D2D', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                          {formatNumber(ad.leads)} <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>leads</span>
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 1 }}>
                          CPL: <strong style={{ color: 'var(--color-text)' }}>{ad.leads > 0 ? formatVND(Math.round((ad.spend || 0) / ad.leads)) : '—'}</strong>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Row: Pipeline 3-Tier Summary with Colored Badges + Single-Line Preview Button */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.71rem', flexWrap: 'wrap' }}>
                        <span style={{ padding: '2px 7px', borderRadius: 5, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-muted)' }} />
                          New: {adNew12}
                        </span>
                        <span style={{ padding: '2px 7px', borderRadius: 5, background: '#fef2f2', color: '#BD1D2D', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#C6333D' }} />
                          Qualified: {adQual312}
                        </span>
                        <span style={{ padding: '2px 7px', borderRadius: 5, background: '#fdf2f8', color: '#db2777', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ec4899' }} />
                          Học viên: {adWon1314}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setPreviewAdModal(ad)}
                        style={{
                          height: 30,
                          padding: '0 11px',
                          borderRadius: 7,
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          color: '#BD1D2D',
                          fontSize: '0.73rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          whiteSpace: 'nowrap',
                          flexShrink: 0
                        }}
                      >
                        <Eye size={13} />
                        <span>Xem quảng cáo</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* PLACEMENT POSITIONS DETAILS FULL-SCREEN MODAL (`createPortal` to `document.body`, `zIndex: 2147483647` above Sidebar & Header) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showPlacementModal && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  width: '100vw',
                  height: '100vh',
                  zIndex: 2147483647,
                  background: 'rgba(15, 23, 42, 0.65)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  backdropFilter: 'blur(4px)'
                }}
                onClick={() => setShowPlacementModal(false)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.97, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 12 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 'calc(100vw - 32px)',
                    height: 'calc(100vh - 32px)',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    borderRadius: '18px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {/* Full-Screen Modal Header */}
                  <div
                    style={{
                      padding: '16px 24px',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--color-bg-secondary)',
                      flexShrink: 0
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 10,
                          background: 'rgba(189, 29, 45, 0.08)',
                          color: '#BD1D2D',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <BarChart3 size={20} />
                      </div>
                      <div>
                        <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)', display: 'block' }}>
                          Chi Tiết Vị Trí Hiển Thị Quảng Cáo (Placement Position Breakdown)
                        </span>
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                          Đối soát trực tiếp theo `publisher_platform × platform_position` trên Meta Graph API ({placementPositions.length} vị trí hiển thị)
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPlacementModal(false)}
                      style={{
                        height: 36,
                        padding: '0 14px',
                        borderRadius: 9,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        cursor: 'pointer',
                        color: 'var(--color-text)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <X size={16} />
                      <span>Đóng</span>
                    </button>
                  </div>

                  {/* Platform Summary Strip inside Modal */}
                  <div
                    style={{
                      padding: '14px 24px',
                      borderBottom: '1px solid var(--color-border-light)',
                      background: 'var(--color-surface)',
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: '12px',
                      flexShrink: 0
                    }}
                  >
                    {platformSpend.map((plat: any, pIdx: number) => (
                      <div
                        key={plat.code || pIdx}
                        style={{
                          padding: '12px 16px',
                          borderRadius: 12,
                          border: '1px solid var(--color-border)',
                          background: pIdx === 0 ? 'rgba(189, 29, 45, 0.03)' : '#f8fafc',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {renderPlatformLogo(plat.code || plat.name, 34)}
                          <div>
                            <div style={{ fontSize: '0.86rem', fontWeight: 800, color: 'var(--color-text)' }}>{plat.name}</div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)' }}>
                              Leads: <strong style={{ color: 'var(--color-text)' }}>{plat.leads}</strong> • Mess: <strong style={{ color: 'var(--color-text)' }}>{plat.messages}</strong>
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatVND(plat.spend)}
                          </div>
                          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: pIdx === 0 ? '#BD1D2D' : 'var(--color-text-secondary)' }}>
                            Tỷ trọng: {plat.pct}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Full-Screen Scrollable Table */}
                  <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontSize: '0.74rem', letterSpacing: '0.03em' }}>
                          <th style={{ padding: '12px 14px', width: 54 }}>#</th>
                          <th style={{ padding: '12px 14px' }}>Nền Tảng (Platform)</th>
                          <th style={{ padding: '12px 14px' }}>Vị Trí Hiển Thị (Position)</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right' }}>Chi Tiêu (Spend)</th>
                          <th style={{ padding: '12px 14px', width: 220 }}>Tỷ Trọng Ngân Sách</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right' }}>Hiển Thị (Impressions)</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right' }}>Leads</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right' }}>Tin Nhắn (Mess)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {placementPositions.map((pos: any, idx: number) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)', background: idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg-secondary)' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: idx < 3 ? '#BD1D2D' : 'var(--color-text-muted)' }}>
                              #{idx + 1}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                {renderPlatformLogo(pos.publisher_platform, 26)}
                                <span style={{ fontWeight: 800, color: 'var(--color-text)', fontSize: '0.86rem' }}>
                                  {pos.publisher_platform}
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: 7,
                                  background: 'var(--color-bg-tertiary)',
                                  color: 'var(--color-text)',
                                  fontWeight: 700,
                                  fontSize: '0.8rem'
                                }}
                              >
                                {pos.platform_position}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: 'var(--color-text)', fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
                              {formatVND(pos.spend)}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'var(--color-bg-tertiary)', overflow: 'hidden' }}>
                                  <div
                                    style={{
                                      height: '100%',
                                      width: `${Math.max(2, Number(pos.pct || 0))}%`,
                                      background: idx === 0 ? '#C6333D' : 'var(--color-text-secondary)',
                                      borderRadius: 999
                                    }}
                                  />
                                </div>
                                <span style={{ width: 48, textAlign: 'right', fontWeight: 800, color: '#BD1D2D', fontSize: '0.8rem' }}>
                                  {pos.pct}%
                                </span>
                              </div>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', color: 'var(--color-text-secondary)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                              {formatNumber(pos.impressions)}
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <span style={{ padding: '3px 9px', borderRadius: 6, background: '#fef2f2', color: '#BD1D2D', fontWeight: 800, fontSize: '0.8rem' }}>
                                {formatNumber(pos.leads)}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>
                              {formatNumber(pos.messages || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* REAL AD ATTRIBUTION & LIVE IFRAME PREVIEW MODAL (`createPortal` to `document.body`, `zIndex: 2147483647`) */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {previewAdModal && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  width: '100vw',
                  height: '100vh',
                  zIndex: 2147483647,
                  background: 'rgba(15, 23, 42, 0.65)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px',
                  backdropFilter: 'blur(4px)'
                }}
                onClick={() => setPreviewAdModal(null)}
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 12 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: 'calc(100vw - 32px)',
                    maxWidth: '980px',
                    maxHeight: 'calc(100vh - 32px)',
                    borderRadius: '18px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  {/* Modal Header */}
                  <div
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--color-bg-secondary)',
                      flexShrink: 0
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Megaphone size={17} />
                      </div>
                      <div>
                        <span style={{ fontSize: '0.94rem', fontWeight: 800, color: 'var(--color-text)', display: 'block' }}>
                          Xem Trước Bài Quảng Cáo Meta &amp; Thống Kê Chuyển Đổi
                        </span>
                        <span style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)' }}>
                          {previewAdModal.campaign_name} • {previewAdModal.adset_name}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPreviewAdModal(null)}
                      style={{
                        height: 34,
                        padding: '0 12px',
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-surface)',
                        cursor: 'pointer',
                        color: 'var(--color-text)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5
                      }}
                    >
                      <X size={16} />
                      <span>Đóng</span>
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: '12px',
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)' }}>{previewAdModal.name}</div>
                        <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                          Chi phí Ads: <strong style={{ color: 'var(--color-text)' }}>{formatVND(previewAdModal.spend || 0)}</strong> • CPR Meta: <strong style={{ color: '#BD1D2D' }}>{formatVND(previewAdModal.cpr || 0)}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 7, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', fontSize: '0.76rem', fontWeight: 800 }}>
                          New (1–2): {previewAdModal.new_1_2 ?? Math.max(0, (previewAdModal.leads || 0) - (previewAdModal.qualified_3_12 ?? previewAdModal.qualified ?? 0) - (previewAdModal.won || 0))}
                        </span>
                        <span style={{ padding: '4px 10px', borderRadius: 7, background: '#fef2f2', color: '#BD1D2D', fontSize: '0.76rem', fontWeight: 800 }}>
                          Qualified (3–12): {previewAdModal.qualified_3_12 ?? previewAdModal.qualified ?? 0}
                        </span>
                        <span style={{ padding: '4px 10px', borderRadius: 7, background: '#fdf2f8', color: '#db2777', fontSize: '0.76rem', fontWeight: 800 }}>
                          Học viên (13–14): {previewAdModal.won || 0}
                        </span>
                      </div>
                    </div>

                    {/* Live Meta Graph API Iframe Preview */}
                    <div
                      style={{
                        borderRadius: 12,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-secondary)',
                        overflow: 'hidden',
                        minHeight: 440,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {loadingAdPreview ? (
                        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.84rem' }}>
                          Đang tải bản xem trước trực tiếp từ Facebook Graph API...
                        </div>
                      ) : isSafeHttpsUrl(adPreviewPayload?.iframe_src) ? (
                        <iframe
                          title={`Meta Ad Preview ${previewAdModal.ad_id}`}
                          src={isSafeHttpsUrl(adPreviewPayload?.iframe_src)}
                          sandbox="allow-scripts allow-popups"
                          referrerPolicy="no-referrer"
                          style={{ width: '100%', height: 540, border: 'none', background: '#ffffff' }}
                          scrolling="yes"
                          allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                        />
                      ) : isSafeHttpsUrl(adPreviewPayload?.thumbnail_url || previewAdModal.thumbnail_url) ? (
                        <img
                          src={isSafeHttpsUrl(adPreviewPayload?.thumbnail_url || previewAdModal.thumbnail_url)}
                          alt={previewAdModal.name}
                          style={{ width: '100%', maxHeight: 480, objectFit: 'contain', background: '#0f172a' }}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b', fontSize: '0.84rem' }}>
                          Không tìm thấy bản xem trước cho mã quảng cáo này.
                        </div>
                      )}
                    </div>

                    {isSafeHttpsUrl(adPreviewPayload?.post_url || previewAdModal.post_url || adPreviewPayload?.ad_library_url) && (
                      <a
                        href={isSafeHttpsUrl(adPreviewPayload?.post_url || previewAdModal.post_url || adPreviewPayload?.ad_library_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          padding: '10px 16px',
                          borderRadius: 9,
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          color: 'var(--color-text)',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <ExternalLink size={14} style={{ color: '#BD1D2D' }} />
                        <span>Mở bài quảng cáo gốc trên Facebook / Ads Library</span>
                      </a>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

export default MetaAdsAttributionDeck;
