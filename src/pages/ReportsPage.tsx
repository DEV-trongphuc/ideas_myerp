import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Briefcase,
  Building2,
  Download,
  Filter,
  MapPin,
  Receipt,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PeriodFilter, getDateRange, type DateRange, type Period } from '../components/ui/PeriodFilter';
import { useUIStore } from '../store/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { isAcademic } from '../utils/roleUtils';
import { getDynamicNonSalesTeamIds } from '../contexts/TenantConfigContext';
import api from '../api/axios';
import { ensureArray, extractArray } from '../utils/safeArray';
import { ChartSkeleton, KpiCardSkeleton, TableSkeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { Pagination } from '../components/ui/Pagination';
import {
  DomChartTooltip,
  DomDashboardToolbar,
  DomEmptyChartState,
  DomFunnelBarList,
  DomHeroStackCard,
  DomKpiTile,
  DomPanelCard,
  DomRankBarRow,
  DomSegmentedSwitch,
  DomToolbarButton,
  MYERP_CHART_PALETTE,
  formatDomMoney,
  formatDomMoneyShort,
  formatDomNumber,
  type DomFunnelStep,
  type DomHeroStat,
} from '../components/Dashboard/DomationDashboardKit';

type ReportsTabKey = 'sales' | 'pipeline' | 'customers' | 'companies' | 'expenses' | 'activities';

const T_LABEL: Record<string, string> = {
  call: 'Cuộc gọi',
  email: 'Email',
  meeting: 'Gặp gỡ',
  task: 'Công việc',
  note: 'Ghi chú',
};

const REPORT_TABS: ReadonlyArray<{
  value: ReportsTabKey;
  label: string;
  icon: React.ReactNode;
}> = [
  { value: 'sales', label: 'Doanh thu', icon: <TrendingUp size={13} /> },
  { value: 'pipeline', label: 'Pipeline', icon: <Filter size={13} /> },
  { value: 'customers', label: 'Khách hàng', icon: <Users size={13} /> },
  { value: 'companies', label: 'Doanh nghiệp', icon: <Building2 size={13} /> },
  { value: 'expenses', label: 'Chi phí', icon: <Receipt size={13} /> },
  { value: 'activities', label: 'Hoạt động', icon: <Activity size={13} /> },
];

const FMT = (n: unknown) => {
  const num = Number(n || 0);
  if (!Number.isFinite(num)) return '0';
  if (Math.abs(num) >= 1e9) return `${(num / 1e9).toFixed(1)}T`;
  if (Math.abs(num) >= 1e6) return `${(num / 1e6).toFixed(0)}M`;
  if (Math.abs(num) >= 1e3) return `${(num / 1e3).toFixed(0)}K`;
  return String(Math.round(num));
};

const FMT_VND = (n: unknown) => {
  const num = Math.round(Number(n || 0));
  if (!Number.isFinite(num)) return '0 đ';
  if (Math.abs(num) >= 1e9) {
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(num / 1e9)} Tỷ đ`;
  }
  if (Math.abs(num) >= 1e6) {
    return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(num / 1e6)} Tr đ`;
  }
  return `${new Intl.NumberFormat('vi-VN').format(num)} đ`;
};

function parseOptionalPct(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const cleaned = String(raw).replace(/[%\s+,]/g, '').trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

const OWNER_PAGE_SIZE = 10;

// ============================================================================
// TAB 1: SALES & REVENUE (Memoized)
// ============================================================================
interface ReportsSalesTabProps {
  salesData: any;
  loading: boolean;
  ownerPage: number;
  onOwnerPageChange: (page: number) => void;
}

const ReportsSalesTab = memo<ReportsSalesTabProps>(({
  salesData,
  loading,
  ownerPage,
  onOwnerPageChange,
}) => {
  const summary = salesData?.summary || {};
  const byMonth = useMemo(() => {
    return ensureArray(salesData?.by_month).map((m: any) => ({
      ...m,
      revenue: Number(m?.revenue || 0),
      cost: Number(m?.cost || 0),
      total_invoices: Number(m?.total_invoices || 0),
    }));
  }, [salesData]);

  const ownerRows = useMemo(() => ensureArray(salesData?.by_owner), [salesData]);
  const totalOwnerRev = useMemo(
    () => ownerRows.reduce((s: number, o: any) => s + Number(o?.revenue || 0), 0),
    [ownerRows]
  );
  const paginatedOwners = useMemo(() => {
    const start = (ownerPage - 1) * OWNER_PAGE_SIZE;
    return ownerRows.slice(start, start + OWNER_PAGE_SIZE);
  }, [ownerRows, ownerPage]);

  const heroStats: DomHeroStat[] = useMemo(
    () => [
      {
        label: 'Doanh thu kỳ vọng',
        value: FMT_VND(summary?.expected_revenue || 0),
        sub: `${formatDomNumber(Number(summary?.deals || 0))} cơ hội bán hàng`,
        accent: 'brand',
        deltaPct: parseOptionalPct(summary?.deals_change),
      },
      {
        label: 'Tổng chi phí duyệt',
        value: FMT_VND(summary?.total_expenses || 0),
        sub:
          Number(summary?.inventory_loss || 0) > 0
            ? `Hao hụt kho: ${FMT_VND(summary?.inventory_loss || 0)}`
            : 'Chi phí vận hành kỳ lọc',
        accent: 'slate',
      },
      {
        label: 'Lợi nhuận ròng',
        value: FMT_VND(summary?.net_profit || 0),
        sub:
          Number(summary?.total_revenue || 0) > 0
            ? `Biên LN: ${((Number(summary?.net_profit || 0) / Number(summary?.total_revenue || 1)) * 100).toFixed(1)}%`
            : 'Doanh thu − Chi phí',
        accent: Number(summary?.net_profit || 0) >= 0 ? 'emerald' : 'rose',
      },
      {
        label: 'Khách hàng & Win Rate',
        value: `${formatDomNumber(Number(summary?.contacts || 0))} KH`,
        sub: `Tỷ lệ chốt Deal: ${Number(summary?.win_rate || 0)}%`,
        accent: 'slate',
        deltaPct: parseOptionalPct(summary?.win_rate_change),
      },
    ],
    [summary]
  );

  const revenueMarginPct = useMemo(() => {
    const rev = Number(summary?.total_revenue || 0);
    const exp = Number(summary?.total_expenses || 0);
    if (rev <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round(((rev - exp) / rev) * 100)));
  }, [summary]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <DomHeroStackCard
        eyebrow="EXECUTIVE REVENUE"
        title="Tổng quan doanh thu & hiệu quả kinh doanh"
        subtitle="Tổng hợp hóa đơn đã thanh toán, chi phí vận hành và cơ hội bán hàng"
        headlineLabel="TỔNG DOANH THU THỰC THU"
        headlineValue={FMT_VND(summary?.total_revenue || 0)}
        headlineMeta={`${formatDomNumber(Number(summary?.deals || 0))} cơ hội · Win ${Number(summary?.win_rate || 0)}%`}
        deltaPct={parseOptionalPct(summary?.revenue_change)}
        progressPct={revenueMarginPct}
        stats={heroStats}
        loading={loading && !salesData}
      />

      <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
        <DomKpiTile
          label="TỔNG DOANH THU"
          value={FMT_VND(summary?.total_revenue || 0)}
          icon={<TrendingUp size={16} />}
          accent="brand"
          variant="hero"
          growth={parseOptionalPct(summary?.revenue_change)}
          loading={loading && !salesData}
          breakdown={
            <span>
              Kỳ vọng: <strong>{FMT_VND(summary?.expected_revenue || 0)}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="CƠ HỘI BÁN HÀNG"
          value={formatDomNumber(Number(summary?.deals || 0))}
          icon={<Briefcase size={16} />}
          accent="brand"
          valueTone="brand"
          growth={parseOptionalPct(summary?.deals_change)}
          loading={loading && !salesData}
          breakdown={
            <span>
              Tỷ lệ chốt: <strong style={{ color: '#0f172a' }}>{Number(summary?.win_rate || 0)}%</strong>
            </span>
          }
        />
        <DomKpiTile
          label="KHÁCH HÀNG MỚI"
          value={formatDomNumber(Number(summary?.contacts || 0))}
          icon={<Users size={16} />}
          accent="slate"
          growth={parseOptionalPct(summary?.contacts_change)}
          loading={loading && !salesData}
          breakdown={
            <span>
              Đơn vị phụ trách: <strong style={{ color: '#0f172a' }}>{ownerRows.length} nhân sự</strong>
            </span>
          }
        />
        <DomKpiTile
          label="TỶ LỆ CHỐT DEAL"
          value={`${Number(summary?.win_rate || 0)}%`}
          icon={<BarChart3 size={16} />}
          accent="slate"
          growth={parseOptionalPct(summary?.win_rate_change)}
          loading={loading && !salesData}
          breakdown={
            <span>
              LN ròng: <strong style={{ color: '#0f172a' }}>{FMT_VND(summary?.net_profit || 0)}</strong>
            </span>
          }
        />
      </div>

      <DomPanelCard
        title="Doanh thu vs Chi phí theo tháng"
        subtitle="So sánh doanh thu thực thu từ hóa đơn đã thanh toán với chi phí đã duyệt"
        icon={<TrendingUp size={16} />}
        iconAccent="brand"
        loading={loading && !salesData}
      >
        {byMonth.length === 0 ? (
          <DomEmptyChartState
            title="Chưa có dữ liệu doanh thu hoặc chi phí trong kỳ"
            description="Thử mở rộng khoảng thời gian lọc để xem xu hướng theo tháng."
            minHeight={240}
          />
        ) : (
          <div style={{ width: '100%', height: 270 }}>
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <ComposedChart data={byMonth} margin={{ left: -8, right: 8, top: 20 }}>
                <defs>
                  <linearGradient id="repSalesRevGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#E11D48" />
                    <stop offset="55%" stopColor="#BD1D2D" />
                    <stop offset="100%" stopColor="#991B1B" />
                  </linearGradient>
                  <linearGradient id="repSalesCostGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#475569" />
                    <stop offset="100%" stopColor="#1E293B" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                  tickFormatter={FMT}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={({ active, payload, label }) => (
                    <DomChartTooltip
                      active={active}
                      payload={payload as any}
                      label={label}
                      valueFormatter={(val) => formatDomMoney(val, 'VND')}
                    />
                  )}
                />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '0.75rem', paddingTop: '6px' }} />
                <Bar dataKey="revenue" name="Doanh thu" fill="url(#repSalesRevGrad)" radius={[6, 6, 0, 0]} maxBarSize={22}>
                  <LabelList
                    dataKey="revenue"
                    position="top"
                    style={{ fill: '#334155', fontSize: 10.5, fontWeight: 700 }}
                    offset={6}
                    formatter={FMT}
                  />
                </Bar>
                <Bar dataKey="cost" name="Chi phí" fill="url(#repSalesCostGrad)" radius={[6, 6, 0, 0]} maxBarSize={22}>
                  <LabelList
                    dataKey="cost"
                    position="top"
                    style={{ fill: '#64748B', fontSize: 10.5, fontWeight: 600 }}
                    offset={6}
                    formatter={FMT}
                  />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </DomPanelCard>

      <DomPanelCard
        title="Hiệu suất theo nhân viên"
        subtitle="Xếp hạng doanh thu và mức độ đóng góp theo từng chuyên viên kinh doanh"
        icon={<UserCheck size={16} />}
        iconAccent="slate"
        noPadding
        deferred
        rightSlot={
          <span className="dom-kpi-tile__badge dom-tone-slate">
            {ownerRows.length} nhân sự
          </span>
        }
      >
        {loading && !salesData ? (
          <div style={{ padding: 16 }}>
            <TableSkeleton rows={5} cols={4} />
          </div>
        ) : ownerRows.length === 0 ? (
          <DomEmptyChartState
            title="Chưa có dữ liệu nhân viên trong kỳ"
            minHeight={180}
          />
        ) : (
          <div>
            <div className="table-wrap custom-scrollbar" style={{ maxHeight: '420px', overflowY: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%' }} className="dom-tabular">
                <thead>
                  <tr>
                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)' }}>Nhân viên</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)' }}>Số Deal</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)' }}>Doanh thu</th>
                    <th style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--color-surface)', minWidth: 210 }}>% Đóng góp</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOwners.map((o: any, idx: number) => {
                    const rev = Number(o?.revenue || 0);
                    const pct = totalOwnerRev > 0 ? Math.min(100, Math.round((rev / totalOwnerRev) * 100)) : 0;
                    const rank = (ownerPage - 1) * OWNER_PAGE_SIZE + idx + 1;
                    return (
                      <tr key={o?.id || o?.user_id || o?.name || o?.user_name || idx}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <span
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: '999px',
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: rank === 1 ? '#BD1D2D' : '#f1f5f9',
                                color: rank === 1 ? '#ffffff' : '#475569',
                                flexShrink: 0,
                              }}
                            >
                              {rank}
                            </span>
                            <Avatar name={o?.name || o?.user_name || 'U'} src={o?.avatar_url || o?.avatar} size={28} />
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                                {o?.name || o?.user_name || 'Chưa phân công'}
                              </div>
                              {Number(o?.pipeline_value || 0) > 0 && (
                                <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                  Pipeline: {FMT_VND(o.pipeline_value)}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="dom-kpi-tile__badge dom-tone-slate">
                            {formatDomNumber(Number(o?.deals || o?.total_deals || 0))} deals
                          </span>
                        </td>
                        <td style={{ color: rev > 0 ? '#BD1D2D' : '#64748b', fontWeight: 800 }}>
                          {FMT_VND(rev)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, height: 7, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  background: rank === 1 ? 'linear-gradient(90deg, #991B1B 0%, #BD1D2D 100%)' : '#334155',
                                  borderRadius: 999,
                                }}
                              />
                            </div>
                            <span style={{ minWidth: 38, textAlign: 'right', fontWeight: 700, fontSize: '0.78rem' }}>
                              {pct}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {ownerRows.length > OWNER_PAGE_SIZE && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 18px', borderTop: '1px solid var(--color-border-light)' }}>
                <Pagination
                  total={ownerRows.length}
                  page={ownerPage}
                  pageSize={OWNER_PAGE_SIZE}
                  onChange={onOwnerPageChange}
                />
              </div>
            )}
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});

// ============================================================================
// TAB 2: PIPELINE (Memoized)
// ============================================================================
const ReportsPipelineTab = memo<{ pipelineData: any[]; loading: boolean }>(({
  pipelineData,
  loading,
}) => {
  const safePipeline = useMemo(() => ensureArray(pipelineData), [pipelineData]);

  const stats = useMemo(() => {
    const totalCount = safePipeline.reduce((s, d) => s + Number(d?.count || 0), 0);
    const totalValue = safePipeline.reduce((s, d) => s + Number(d?.total_value || 0), 0);
    const avgValue = totalCount > 0 ? totalValue / totalCount : 0;
    const topStage = [...safePipeline].sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0))[0] || null;
    return { totalCount, totalValue, avgValue, topStage };
  }, [safePipeline]);

  const funnelSteps: DomFunnelStep[] = useMemo(
    () =>
      safePipeline.map((s: any, idx: number) => ({
        key: `${s?.stage || 'stage'}-${idx}`,
        label: String(s?.stage || `Giai đoạn ${idx + 1}`),
        sub: `Giá trị: ${FMT_VND(s?.total_value || 0)}`,
        value: Number(s?.count || 0),
        badge: Number(s?.total_value || 0) > 0 ? formatDomMoneyShort(Number(s.total_value), 'VND') : undefined,
        gradient:
          idx === safePipeline.length - 1
            ? 'linear-gradient(90deg, #991B1B 0%, #BD1D2D 100%)'
            : idx === 0
              ? 'linear-gradient(90deg, #0F172A 0%, #334155 100%)'
              : 'linear-gradient(90deg, #334155 0%, #64748B 100%)',
      })),
    [safePipeline]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="grid grid-3" style={{ gap: '16px' }}>
        <DomKpiTile
          label="TỔNG CƠ HỘI ĐANG MỞ"
          value={formatDomNumber(stats.totalCount)}
          icon={<Briefcase size={16} />}
          accent="brand"
          variant="hero"
          loading={loading && safePipeline.length === 0}
          breakdown={
            <span>
              Số giai đoạn: <strong>{safePipeline.length}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="GIÁ TRỊ TRUNG BÌNH / DEAL"
          value={FMT_VND(stats.avgValue)}
          icon={<TrendingUp size={16} />}
          accent="brand"
          valueTone="brand"
          loading={loading && safePipeline.length === 0}
          breakdown={
            <span>
              Giai đoạn đông nhất:{' '}
              <strong style={{ color: '#0f172a' }}>{stats.topStage?.stage || '—'}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="TỔNG GIÁ TRỊ PIPELINE"
          value={FMT_VND(stats.totalValue)}
          icon={<BarChart3 size={16} />}
          accent="slate"
          loading={loading && safePipeline.length === 0}
          breakdown={
            <span>
              Quy đổi: <strong style={{ color: '#0f172a' }}>{formatDomMoneyShort(stats.totalValue, 'VND')}</strong>
            </span>
          }
        />
      </div>

      <div className="grid grid-2" style={{ gap: '16px' }}>
        <DomPanelCard
          title="Phễu chuyển đổi (Conversion Funnel)"
          subtitle="Tỷ lệ chuyển đổi qua từng bước phễu bán hàng"
          icon={<Filter size={16} />}
          iconAccent="brand"
          loading={loading && safePipeline.length === 0}
        >
          <DomFunnelBarList
            steps={funnelSteps}
            emptyText="Chưa có dữ liệu phễu trong khoảng thời gian này"
          />
        </DomPanelCard>

        <DomPanelCard
          title="Phân bổ theo giai đoạn"
          subtitle="Số lượng hồ sơ & giá trị kỳ vọng trên từng giai đoạn"
          icon={<BarChart3 size={16} />}
          iconAccent="slate"
          loading={loading && safePipeline.length === 0}
        >
          {safePipeline.length === 0 ? (
            <DomEmptyChartState title="Chưa có dữ liệu giai đoạn Pipeline" minHeight={260} />
          ) : (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <ComposedChart data={safePipeline} margin={{ left: -8, right: 8, top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} />
                  <XAxis dataKey="stage" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload;
                      if (!active || !row) return null;
                      return (
                        <DomChartTooltip
                          active={active}
                          label={row.stage}
                          payload={[
                            { name: 'Số lượng', value: Number(row.count || 0), color: '#BD1D2D' },
                            { name: 'Giá trị', value: Number(row.total_value || 0), color: '#334155' },
                          ]}
                          valueFormatter={(val, name) =>
                            name === 'Giá trị' ? formatDomMoney(val, 'VND') : formatDomNumber(val)
                          }
                        />
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Số lượng" radius={[6, 6, 0, 0]} maxBarSize={24}>
                    {safePipeline.map((s: any, i: number) => (
                      <Cell key={`cell-${i}`} fill={s?.color || MYERP_CHART_PALETTE[i % MYERP_CHART_PALETTE.length]} />
                    ))}
                    <LabelList dataKey="count" position="top" style={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} offset={6} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </DomPanelCard>
      </div>
    </div>
  );
});

// ============================================================================
// TAB 3: CUSTOMERS (Memoized)
// ============================================================================
const ReportsCustomersTab = memo<{ customerData: any; loading: boolean }>(({
  customerData,
  loading,
}) => {
  const bySource = useMemo(() => {
    return ensureArray(customerData?.by_source)
      .map((item: any) => ({
        source: String(item?.source || 'Chưa phân loại'),
        count: Number(item?.count || 0),
      }))
      .sort((a, b) => b.count - a.count);
  }, [customerData]);

  const byScore = useMemo(() => ensureArray(customerData?.by_score), [customerData]);
  const trend = useMemo(() => ensureArray(customerData?.trend), [customerData]);
  const byStatus = useMemo(() => ensureArray(customerData?.by_status), [customerData]);

  const totals = useMemo(() => {
    const totalFromSource = bySource.reduce((acc, r) => acc + r.count, 0);
    const totalNewInRange = trend.reduce((acc, r: any) => acc + Number(r?.count || 0), 0);
    const hotCount = byScore
      .filter((b: any) => b?.bucket === '81-100' || b?.bucket === '51-80')
      .reduce((acc, b: any) => acc + Number(b?.count || 0), 0);
    const topSource = bySource[0] || null;
    const customerStatusCount = byStatus
      .filter((s: any) => String(s?.status || '').toLowerCase() === 'customer')
      .reduce((acc, s: any) => acc + Number(s?.count || 0), 0);
    return { totalFromSource, totalNewInRange, hotCount, topSource, customerStatusCount };
  }, [bySource, trend, byScore, byStatus]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
        <DomKpiTile
          label="TỔNG HỒ SƠ KHÁCH HÀNG"
          value={formatDomNumber(totals.totalFromSource)}
          icon={<Users size={16} />}
          accent="brand"
          variant="hero"
          loading={loading && !customerData}
          breakdown={
            <span>
              Học viên / KH chính thức: <strong>{formatDomNumber(totals.customerStatusCount)}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="KHÁCH HÀNG MỚI TRONG KỲ"
          value={formatDomNumber(totals.totalNewInRange)}
          icon={<TrendingUp size={16} />}
          accent="brand"
          valueTone="brand"
          loading={loading && !customerData}
          breakdown={
            <span>
              Số ngày ghi nhận: <strong style={{ color: '#0f172a' }}>{trend.length} ngày</strong>
            </span>
          }
        />
        <DomKpiTile
          label="NGUỒN DẪN ĐẦU"
          value={totals.topSource ? totals.topSource.source : '—'}
          icon={<Filter size={16} />}
          accent="slate"
          loading={loading && !customerData}
          breakdown={
            <span>
              Số lượng: <strong style={{ color: '#0f172a' }}>{formatDomNumber(totals.topSource?.count || 0)}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="NHÓM LEAD SCORE CAO (≥51)"
          value={formatDomNumber(totals.hotCount)}
          icon={<BarChart3 size={16} />}
          accent="slate"
          loading={loading && !customerData}
          breakdown={
            <span>
              Tỷ trọng:{' '}
              <strong style={{ color: '#0f172a' }}>
                {totals.totalFromSource > 0 ? Math.round((totals.hotCount / totals.totalFromSource) * 100) : 0}%
              </strong>
            </span>
          }
        />
      </div>

      <div className="grid grid-2" style={{ gap: '16px' }}>
        <DomPanelCard
          title="Nguồn khách hàng"
          subtitle="Phân bổ hồ sơ theo kênh tiếp nhận"
          icon={<Filter size={16} />}
          iconAccent="brand"
          loading={loading && !customerData}
        >
          {bySource.length === 0 ? (
            <DomEmptyChartState title="Chưa có dữ liệu nguồn khách hàng" minHeight={240} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 280, overflowY: 'auto', paddingRight: 4 }}>
              {bySource.map((src, idx) => {
                const maxVal = Math.max(bySource[0]?.count || 1, 1);
                const pctOfTotal =
                  totals.totalFromSource > 0 ? Math.round((src.count / totals.totalFromSource) * 1000) / 10 : 0;
                return (
                  <DomRankBarRow
                    key={`${src.source}-${idx}`}
                    rank={idx + 1}
                    label={src.source}
                    value={formatDomNumber(src.count)}
                    badge={`${pctOfTotal}%`}
                    badgeTone={idx === 0 ? 'brand' : 'slate'}
                    percent={(src.count / maxVal) * 100}
                    barColor={idx === 0 ? '#BD1D2D' : '#334155'}
                  />
                );
              })}
            </div>
          )}
        </DomPanelCard>

        <DomPanelCard
          title="Tăng trưởng khách hàng mới"
          subtitle="Số lượng hồ sơ tạo mới theo ngày trong kỳ"
          icon={<TrendingUp size={16} />}
          iconAccent="brand"
          loading={loading && !customerData}
        >
          {trend.length === 0 ? (
            <DomEmptyChartState title="Chưa có khách hàng mới trong khoảng thời gian lọc" minHeight={240} />
          ) : (
            <div style={{ height: 270 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <AreaChart data={trend} margin={{ left: -8, right: 8, top: 20 }}>
                  <defs>
                    <linearGradient id="repCustTrendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#BD1D2D" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#BD1D2D" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.7} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => (
                      <DomChartTooltip
                        active={active}
                        payload={payload as any}
                        label={label}
                        valueFormatter={(val) => `${formatDomNumber(val)} KH`}
                      />
                    )}
                  />
                  <Area
                    type="monotone"
                    dataKey="count"
                    name="Khách hàng mới"
                    stroke="#BD1D2D"
                    strokeWidth={2.5}
                    fill="url(#repCustTrendGrad)"
                    activeDot={{ r: 5, fill: '#BD1D2D', stroke: '#ffffff', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </DomPanelCard>
      </div>

      <DomPanelCard
        title="Phân bổ theo Lead Score"
        subtitle="Phân tầng mức độ sẵn sàng của tệp khách hàng"
        icon={<BarChart3 size={16} />}
        iconAccent="slate"
        deferred
        loading={loading && !customerData}
      >
        {byScore.length === 0 ? (
          <DomEmptyChartState title="Chưa có dữ liệu điểm tiềm năng" minHeight={230} />
        ) : (
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <BarChart data={byScore} margin={{ left: -8, right: 8, top: 20 }}>
                <defs>
                  <linearGradient id="repScoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#BD1D2D" />
                    <stop offset="100%" stopColor="#991B1B" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.7} />
                <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={({ active, payload, label }) => (
                    <DomChartTooltip
                      active={active}
                      payload={payload as any}
                      label={`Nhóm điểm ${label}`}
                      valueFormatter={(val) => `${formatDomNumber(val)} hồ sơ`}
                    />
                  )}
                />
                <Bar dataKey="count" name="Số lượng" radius={[6, 6, 0, 0]} maxBarSize={32}>
                  {byScore.map((b: any, idx: number) => (
                    <Cell
                      key={`score-${idx}`}
                      fill={b?.bucket === '81-100' || b?.bucket === '51-80' ? 'url(#repScoreGrad)' : '#334155'}
                    />
                  ))}
                  <LabelList dataKey="count" position="top" style={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} offset={6} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});

// ============================================================================
// TAB 4: COMPANIES (Memoized)
// ============================================================================
const ReportsCompaniesTab = memo<{ companyData: any; loading: boolean }>(({
  companyData,
  loading,
}) => {
  const byIndustry = useMemo(
    () =>
      ensureArray(companyData?.by_industry).map((r: any) => ({
        industry: String(r?.industry || 'Chưa phân ngành'),
        count: Number(r?.count || 0),
      })),
    [companyData]
  );
  const bySize = useMemo(
    () =>
      ensureArray(companyData?.by_size).map((r: any) => ({
        size: String(r?.size || 'Chưa rõ'),
        count: Number(r?.count || 0),
      })),
    [companyData]
  );
  const byCity = useMemo(
    () =>
      ensureArray(companyData?.by_city).map((r: any) => ({
        city: String(r?.city || 'Chưa rõ'),
        count: Number(r?.count || 0),
      })),
    [companyData]
  );

  const totalCompanies = useMemo(
    () => byIndustry.reduce((s, r) => s + r.count, 0),
    [byIndustry]
  );
  const topIndustry = byIndustry[0] || null;
  const topCity = byCity[0] || null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="grid grid-3" style={{ gap: '16px' }}>
        <DomKpiTile
          label="TỔNG DOANH NGHIỆP B2B"
          value={formatDomNumber(totalCompanies)}
          icon={<Building2 size={16} />}
          accent="brand"
          variant="hero"
          loading={loading && !companyData}
          breakdown={
            <span>
              Số ngành nghề: <strong>{byIndustry.length}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="LĨNH VỰC DẪN ĐẦU"
          value={topIndustry ? topIndustry.industry : '—'}
          icon={<Briefcase size={16} />}
          accent="brand"
          valueTone="brand"
          loading={loading && !companyData}
          breakdown={
            <span>
              Doanh nghiệp: <strong style={{ color: '#0f172a' }}>{formatDomNumber(topIndustry?.count || 0)}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="ĐỊA BÀN TRỌNG ĐIỂM"
          value={topCity ? topCity.city : '—'}
          icon={<MapPin size={16} />}
          accent="slate"
          loading={loading && !companyData}
          breakdown={
            <span>
              Quy mô dẫn đầu: <strong style={{ color: '#0f172a' }}>{bySize[0]?.size || '—'}</strong>
            </span>
          }
        />
      </div>

      <div className="grid grid-2" style={{ gap: '16px' }}>
        <DomPanelCard
          title="Phân loại theo lĩnh vực"
          subtitle="Tỷ trọng doanh nghiệp theo ngành nghề hoạt động"
          icon={<Building2 size={16} />}
          iconAccent="brand"
          loading={loading && !companyData}
        >
          {byIndustry.length === 0 ? (
            <DomEmptyChartState title="Chưa có dữ liệu lĩnh vực doanh nghiệp" minHeight={240} />
          ) : (
            <div style={{ height: 265 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <BarChart data={byIndustry.slice(0, 10)} margin={{ left: -8, right: 8, top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} />
                  <XAxis dataKey="industry" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload;
                      if (!active || !row) return null;
                      return (
                        <DomChartTooltip
                          active={active}
                          label={row.industry}
                          payload={[{ name: 'Số doanh nghiệp', value: row.count, color: '#BD1D2D' }]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Số doanh nghiệp" radius={[6, 6, 0, 0]} maxBarSize={24}>
                    {byIndustry.slice(0, 10).map((_: any, index: number) => (
                      <Cell key={`ind-${index}`} fill={MYERP_CHART_PALETTE[index % MYERP_CHART_PALETTE.length]} />
                    ))}
                    <LabelList dataKey="count" position="top" style={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} offset={6} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DomPanelCard>

        <DomPanelCard
          title="Quy mô doanh nghiệp"
          subtitle="Phân bổ theo số lượng nhân sự"
          icon={<Users size={16} />}
          iconAccent="slate"
          loading={loading && !companyData}
        >
          {bySize.length === 0 ? (
            <DomEmptyChartState title="Chưa có dữ liệu quy mô doanh nghiệp" minHeight={240} />
          ) : (
            <div style={{ height: 265 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <BarChart data={bySize} margin={{ left: -8, right: 8, top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} />
                  <XAxis dataKey="size" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload;
                      if (!active || !row) return null;
                      return (
                        <DomChartTooltip
                          active={active}
                          label={`Quy mô: ${row.size}`}
                          payload={[{ name: 'Số doanh nghiệp', value: row.count, color: '#334155' }]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="count" name="Số doanh nghiệp" radius={[6, 6, 0, 0]} maxBarSize={24}>
                    {bySize.map((_: any, index: number) => (
                      <Cell key={`sz-${index}`} fill={MYERP_CHART_PALETTE[index % MYERP_CHART_PALETTE.length]} />
                    ))}
                    <LabelList dataKey="count" position="top" style={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} offset={6} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DomPanelCard>
      </div>

      <DomPanelCard
        title="Top 10 thành phố"
        subtitle="Xếp hạng địa bàn có nhiều doanh nghiệp đối tác nhất"
        icon={<MapPin size={16} />}
        iconAccent="brand"
        deferred
        loading={loading && !companyData}
      >
        {byCity.length === 0 ? (
          <DomEmptyChartState title="Chưa có dữ liệu tỉnh/thành phố" minHeight={200} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {byCity.map((c, idx) => {
              const maxCity = Math.max(byCity[0]?.count || 1, 1);
              const share = totalCompanies > 0 ? Math.round((c.count / totalCompanies) * 1000) / 10 : 0;
              return (
                <DomRankBarRow
                  key={`${c.city}-${idx}`}
                  rank={idx + 1}
                  label={c.city}
                  value={formatDomNumber(c.count)}
                  badge={`${share}%`}
                  badgeTone={idx === 0 ? 'brand' : 'slate'}
                  percent={(c.count / maxCity) * 100}
                  barColor={idx === 0 ? '#BD1D2D' : '#334155'}
                />
              );
            })}
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});

// ============================================================================
// TAB 5: EXPENSES (Memoized)
// ============================================================================
const ReportsExpensesTab = memo<{ expenseData: any; salesData: any; loading: boolean }>(({
  expenseData,
  salesData,
  loading,
}) => {
  const byCategory = useMemo(
    () =>
      ensureArray(expenseData?.by_category)
        .map((c: any) => ({
          category: String(c?.category || 'Khác'),
          total: Number(c?.total || 0),
        }))
        .sort((a, b) => b.total - a.total),
    [expenseData]
  );

  const trend = useMemo(
    () =>
      ensureArray(expenseData?.trend).map((t: any) => ({
        date: String(t?.date || ''),
        total: Number(t?.total || 0),
      })),
    [expenseData]
  );

  const byMonth = useMemo(() => ensureArray(salesData?.by_month), [salesData]);

  const stats = useMemo(() => {
    const totalExpense = byCategory.reduce((s, c) => s + c.total, 0);
    const maxDay = trend.reduce((m, t) => Math.max(m, t.total), 0);
    const avgDay = trend.length > 0 ? totalExpense / trend.length : 0;
    const topCategory = byCategory[0] || null;
    return { totalExpense, maxDay, avgDay, topCategory };
  }, [byCategory, trend]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
        <DomKpiTile
          label="TỔNG CHI PHÍ ĐÃ DUYỆT"
          value={FMT_VND(stats.totalExpense)}
          icon={<Receipt size={16} />}
          accent="brand"
          variant="hero"
          loading={loading && !expenseData}
          breakdown={
            <span>
              Số danh mục: <strong>{byCategory.length}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="DANH MỤC CHI CAO NHẤT"
          value={stats.topCategory ? stats.topCategory.category : '—'}
          icon={<Filter size={16} />}
          accent="brand"
          valueTone="brand"
          loading={loading && !expenseData}
          breakdown={
            <span>
              Chi tiêu: <strong style={{ color: '#0f172a' }}>{FMT_VND(stats.topCategory?.total || 0)}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="TRUNG BÌNH / NGÀY CHI"
          value={FMT_VND(stats.avgDay)}
          icon={<TrendingUp size={16} />}
          accent="slate"
          loading={loading && !expenseData}
          breakdown={
            <span>
              Số ngày phát sinh: <strong style={{ color: '#0f172a' }}>{trend.length} ngày</strong>
            </span>
          }
        />
        <DomKpiTile
          label="ĐỈNH CHI TRONG NGÀY"
          value={FMT_VND(stats.maxDay)}
          icon={<BarChart3 size={16} />}
          accent="slate"
          loading={loading && !expenseData}
          breakdown={
            <span>
              Quy đổi: <strong style={{ color: '#0f172a' }}>{formatDomMoneyShort(stats.maxDay, 'VND')}</strong>
            </span>
          }
        />
      </div>

      <div className="grid grid-2" style={{ gap: '16px' }}>
        <DomPanelCard
          title="Cơ cấu chi phí theo hạng mục"
          subtitle="Xếp hạng các khoản chi đã được duyệt trong kỳ"
          icon={<Receipt size={16} />}
          iconAccent="brand"
          loading={loading && !expenseData}
        >
          {byCategory.length === 0 ? (
            <DomEmptyChartState title="Chưa có chi phí phát sinh trong kỳ" minHeight={240} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 270, overflowY: 'auto', paddingRight: 4 }}>
              {byCategory.map((cat, idx) => {
                const maxCat = Math.max(byCategory[0]?.total || 1, 1);
                const pct = stats.totalExpense > 0 ? Math.round((cat.total / stats.totalExpense) * 1000) / 10 : 0;
                return (
                  <DomRankBarRow
                    key={`${cat.category}-${idx}`}
                    rank={idx + 1}
                    label={cat.category}
                    value={FMT_VND(cat.total)}
                    badge={`${pct}%`}
                    badgeTone={idx === 0 ? 'brand' : 'slate'}
                    percent={(cat.total / maxCat) * 100}
                    barColor={idx === 0 ? '#BD1D2D' : '#334155'}
                  />
                );
              })}
            </div>
          )}
        </DomPanelCard>

        <DomPanelCard
          title="Biến động chi phí theo ngày"
          subtitle="Xu hướng chi tiêu thực tế theo từng ngày"
          icon={<TrendingUp size={16} />}
          iconAccent="slate"
          loading={loading && !expenseData}
        >
          {trend.length === 0 ? (
            <DomEmptyChartState title="Chưa có biến động chi phí theo ngày" minHeight={240} />
          ) : (
            <div style={{ height: 265 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <BarChart data={trend} margin={{ left: -8, right: 8, top: 20 }}>
                  <defs>
                    <linearGradient id="repExpDayGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E11D48" />
                      <stop offset="100%" stopColor="#991B1B" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.7} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                    tickFormatter={FMT}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={44}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    content={({ active, payload, label }) => (
                      <DomChartTooltip
                        active={active}
                        payload={payload as any}
                        label={label}
                        valueFormatter={(val) => formatDomMoney(val, 'VND')}
                      />
                    )}
                  />
                  <Bar dataKey="total" name="Chi phí" fill="url(#repExpDayGrad)" radius={[6, 6, 0, 0]} maxBarSize={24}>
                    <LabelList
                      dataKey="total"
                      position="top"
                      style={{ fill: '#334155', fontSize: 10.5, fontWeight: 700 }}
                      offset={6}
                      formatter={FMT}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DomPanelCard>
      </div>

      <DomPanelCard
        title="Chi phí vs Doanh thu (Kết hợp)"
        subtitle="Đối chiếu chi phí vận hành và doanh thu thực thu theo tháng"
        icon={<BarChart3 size={16} />}
        iconAccent="brand"
        deferred
        loading={loading && byMonth.length === 0 && !salesData}
      >
        {byMonth.length === 0 ? (
          <DomEmptyChartState title="Chưa có dữ liệu đối chiếu Doanh thu vs Chi phí" minHeight={220} />
        ) : (
          <div style={{ height: 265 }}>
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
              <ComposedChart data={byMonth} margin={{ left: -8, right: 8, top: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.7} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis
                  domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                  tickFormatter={FMT}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={({ active, payload, label }) => (
                    <DomChartTooltip
                      active={active}
                      payload={payload as any}
                      label={label}
                      valueFormatter={(val) => formatDomMoney(val, 'VND')}
                    />
                  )}
                />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: '0.75rem', fontWeight: 600 }} />
                <Bar dataKey="revenue" name="Doanh thu" fill="#BD1D2D" radius={[6, 6, 0, 0]} maxBarSize={20}>
                  <LabelList dataKey="revenue" position="top" style={{ fill: '#334155', fontSize: 10.5, fontWeight: 700 }} offset={6} formatter={FMT} />
                </Bar>
                <Bar dataKey="cost" name="Chi phí" fill="#334155" radius={[6, 6, 0, 0]} maxBarSize={20}>
                  <LabelList dataKey="cost" position="top" style={{ fill: '#64748B', fontSize: 10.5, fontWeight: 600 }} offset={6} formatter={FMT} />
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});

// ============================================================================
// TAB 6: ACTIVITIES (Memoized)
// ============================================================================
const ReportsActivitiesTab = memo<{ activityData: any; loading: boolean }>(({
  activityData,
  loading,
}) => {
  const byType = useMemo(
    () =>
      ensureArray(activityData?.by_type).map((item: any) => ({
        type: String(item?.type || 'note'),
        label: T_LABEL[String(item?.type || '')] || String(item?.type || 'Khác'),
        total: Number(item?.total || 0),
      })),
    [activityData]
  );

  const byUserType = useMemo(
    () => ensureArray(activityData?.by_user_type),
    [activityData]
  );

  const { userRows, totalActivities, topType, topUser } = useMemo(() => {
    const grouped: Record<string, { name: string; call: number; email: number; meeting: number; task: number; note: number; total: number }> = {};
    let total = 0;
    for (const a of byUserType) {
      const uname = String(a?.user_name || 'Nhân viên');
      const tp = String(a?.type || 'note');
      const cnt = Number(a?.total || 0);
      total += cnt;
      if (!grouped[uname]) {
        grouped[uname] = { name: uname, call: 0, email: 0, meeting: 0, task: 0, note: 0, total: 0 };
      }
      if (tp === 'call' || tp === 'email' || tp === 'meeting' || tp === 'task' || tp === 'note') {
        grouped[uname][tp] += cnt;
      }
      grouped[uname].total += cnt;
    }
    const rows = Object.values(grouped).sort((a, b) => b.total - a.total);
    const sortedTypes = [...byType].sort((a, b) => b.total - a.total);
    return {
      userRows: rows,
      totalActivities: total || byType.reduce((s, r) => s + r.total, 0),
      topType: sortedTypes[0] || null,
      topUser: rows[0] || null,
    };
  }, [byUserType, byType]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="grid grid-3" style={{ gap: '16px' }}>
        <DomKpiTile
          label="TỔNG HOẠT ĐỘNG CHĂM SÓC"
          value={formatDomNumber(totalActivities)}
          icon={<Activity size={16} />}
          accent="brand"
          variant="hero"
          loading={loading && !activityData}
          breakdown={
            <span>
              Nhân sự tham gia: <strong>{userRows.length} người</strong>
            </span>
          }
        />
        <DomKpiTile
          label="LOẠI HOẠT ĐỘNG CHỦ ĐẠO"
          value={topType ? topType.label : '—'}
          icon={<BarChart3 size={16} />}
          accent="brand"
          valueTone="brand"
          loading={loading && !activityData}
          breakdown={
            <span>
              Số lượt: <strong style={{ color: '#0f172a' }}>{formatDomNumber(topType?.total || 0)}</strong>
            </span>
          }
        />
        <DomKpiTile
          label="NHÂN VIÊN TÍCH CỰC NHẤT"
          value={topUser ? topUser.name : '—'}
          icon={<UserCheck size={16} />}
          accent="slate"
          loading={loading && !activityData}
          breakdown={
            <span>
              Tổng hoạt động: <strong style={{ color: '#0f172a' }}>{formatDomNumber(topUser?.total || 0)}</strong>
            </span>
          }
        />
      </div>

      <div className="grid grid-2" style={{ gap: '16px' }}>
        <DomPanelCard
          title="Phân bổ loại hoạt động"
          subtitle="Thống kê cuộc gọi, email, gặp gỡ, công việc & ghi chú"
          icon={<Activity size={16} />}
          iconAccent="brand"
          loading={loading && !activityData}
        >
          {byType.length === 0 ? (
            <DomEmptyChartState title="Chưa có hoạt động nào trong kỳ" minHeight={240} />
          ) : (
            <div style={{ height: 265 }}>
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <BarChart data={byType} margin={{ left: -8, right: 8, top: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.7} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis
                    domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    content={({ active, payload }) => {
                      const row = payload?.[0]?.payload;
                      if (!active || !row) return null;
                      return (
                        <DomChartTooltip
                          active={active}
                          label={row.label}
                          payload={[{ name: 'Tổng số', value: row.total, color: '#BD1D2D' }]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="total" name="Tổng số" radius={[6, 6, 0, 0]} maxBarSize={28}>
                    {byType.map((_: any, index: number) => (
                      <Cell key={`act-${index}`} fill={MYERP_CHART_PALETTE[index % MYERP_CHART_PALETTE.length]} />
                    ))}
                    <LabelList dataKey="total" position="top" style={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} offset={6} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DomPanelCard>

        <DomPanelCard
          title="Tóm tắt hoạt động nhân viên"
          subtitle="Xếp hạng số lượt chăm sóc khách hàng của từng nhân sự"
          icon={<UserCheck size={16} />}
          iconAccent="slate"
          loading={loading && !activityData}
        >
          {userRows.length === 0 ? (
            <DomEmptyChartState title="Chưa có dữ liệu nhân viên" minHeight={240} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 270, overflowY: 'auto', paddingRight: 4 }}>
              {userRows.map((u, idx) => {
                const maxU = Math.max(userRows[0]?.total || 1, 1);
                const share = totalActivities > 0 ? Math.round((u.total / totalActivities) * 1000) / 10 : 0;
                return (
                  <DomRankBarRow
                    key={`${u.name}-${idx}`}
                    rank={idx + 1}
                    icon={<Avatar name={u.name} size={22} />}
                    label={u.name}
                    sublabel={`${u.call} gọi · ${u.meeting} gặp · ${u.note} ghi chú`}
                    value={formatDomNumber(u.total)}
                    badge={`${share}%`}
                    badgeTone={idx === 0 ? 'brand' : 'slate'}
                    percent={(u.total / maxU) * 100}
                    barColor={idx === 0 ? '#BD1D2D' : '#334155'}
                  />
                );
              })}
            </div>
          )}
        </DomPanelCard>
      </div>

      <DomPanelCard
        title="Chi tiết hoạt động theo loại"
        subtitle="Bảng đối soát đầy đủ từng kênh tương tác theo nhân viên"
        icon={<Users size={16} />}
        iconAccent="slate"
        noPadding
        deferred
      >
        <div className="table-wrap custom-scrollbar" style={{ maxHeight: '320px', overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ minWidth: 700, width: '100%' }} className="dom-tabular">
            <thead>
              <tr>
                <th>Nhân viên</th>
                <th>Cuộc gọi</th>
                <th>Email</th>
                <th>Gặp gỡ</th>
                <th>Task</th>
                <th>Ghi chú</th>
                <th>Tổng</th>
              </tr>
            </thead>
            <tbody>
              {userRows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-muted)' }}>
                    Không có dữ liệu trong khoảng thời gian này
                  </td>
                </tr>
              ) : (
                userRows.map((r) => (
                  <tr key={r.name}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={r.name} size={28} />
                        <span style={{ fontWeight: 700 }}>{r.name}</span>
                      </div>
                    </td>
                    <td><span className="dom-kpi-tile__badge dom-tone-brand">{formatDomNumber(r.call)}</span></td>
                    <td><span className="dom-kpi-tile__badge dom-tone-slate">{formatDomNumber(r.email)}</span></td>
                    <td><span className="dom-kpi-tile__badge dom-tone-amber">{formatDomNumber(r.meeting)}</span></td>
                    <td><span className="dom-kpi-tile__badge dom-tone-emerald">{formatDomNumber(r.task)}</span></td>
                    <td><span className="dom-kpi-tile__badge dom-tone-slate">{formatDomNumber(r.note)}</span></td>
                    <td><span style={{ fontWeight: 800, color: '#0f172a' }}>{formatDomNumber(r.total)}</span></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </DomPanelCard>
    </div>
  );
});

// ============================================================================
// MAIN PAGE COMPONENT
// ============================================================================
export const ReportsPage: React.FC = () => {
  const addToast = useUIStore((s) => s.addToast);
  const { user } = useAuth();

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', sync);
      return () => mq.removeEventListener('change', sync);
    }
    mq.addListener(sync);
    return () => mq.removeListener(sync);
  }, []);

  const [tab, setTab] = useState<ReportsTabKey>('sales');
  const [period, setPeriod] = useState<Period>('this_quarter');
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange('this_quarter'));
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [salesData, setSalesData] = useState<any>(null);
  const [pipelineData, setPipelineData] = useState<any[]>([]);
  const [customerData, setCustomerData] = useState<any>(null);
  const [companyData, setCompanyData] = useState<any>(null);
  const [expenseData, setExpenseData] = useState<any>(null);
  const [activityData, setActivityData] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [ownerPage, setOwnerPage] = useState<number>(1);
  const reportAbortRef = useRef<AbortController | null>(null);

  const userId = user?.id;
  const userRole = user?.role;

  useEffect(() => {
    if (!userRole || !['manager', 'admin', 'superadmin'].includes(userRole)) return;
    const controller = new AbortController();
    Promise.all([
      api.get('/teams', { signal: controller.signal }).then((res) => {
        if (!controller.signal.aborted) setTeams(extractArray(res?.data));
      }).catch(() => {}),
      api.get('/users', { signal: controller.signal }).then((res) => {
        if (!controller.signal.aborted) {
          const d = res?.data?.data;
          setUsers(Array.isArray(d) ? d : ensureArray(d?.items));
        }
      }).catch(() => {}),
    ]);
    return () => controller.abort();
  }, [userId, userRole]);

  // Primitive memoized team_id prevents cascade re-fetching when teams/users resolve to same value
  const effectiveTeamId = useMemo<number | null>(() => {
    const uAny = user as any;
    const isMarketing =
      user?.role === 'marketing' ||
      Number(uAny?.team_id) === 3 ||
      String(uAny?.job_title || '').toLowerCase().includes('marketing') ||
      String(uAny?.team_name || '').toLowerCase().includes('marketing');
    const isAcademicUser = isAcademic(user);
    if (
      isMarketing ||
      isAcademicUser ||
      [
        'admin',
        'superadmin',
        'super_admin',
        'director',
        'sale_admin',
        'saleadmin',
        'accountant',
        'hr',
        'academic',
        'hoc_vu',
        'hoc_thuat',
        'dao_tao',
        'tro_giang',
        'teacher',
        'giang_vien',
        'giao_vien',
        'tutor',
        'viewer',
      ].includes(user?.role || '')
    ) {
      return null;
    }
    const nonSalesTeamIds = getDynamicNonSalesTeamIds();
    const me = users.find((u) => Number(u?.id) === Number(user?.id));
    if (me?.team_id && !nonSalesTeamIds.includes(Number(me.team_id))) return Number(me.team_id);
    if (uAny?.team_id && !nonSalesTeamIds.includes(Number(uAny.team_id))) return Number(uAny.team_id);
    if (user?.role === 'manager') {
      const managedTeam = teams.find((t) => Number(t?.leader_id) === Number(user.id));
      if (managedTeam?.id && !nonSalesTeamIds.includes(Number(managedTeam.id))) {
        return Number(managedTeam.id);
      }
      return null;
    }
    return null;
  }, [user, teams, users]);

  useEffect(() => {
    if (reportAbortRef.current) {
      reportAbortRef.current.abort();
    }
    const controller = new AbortController();
    reportAbortRef.current = controller;

    const from = dateRange.from;
    const to = dateRange.to;
    const paramsBase = { from, to, team_id: effectiveTeamId };

    setLoading(true);

    const run = async () => {
      try {
        if (tab === 'sales') {
          const r = await api.get('/reports/sales', { params: paramsBase, signal: controller.signal });
          if (!controller.signal.aborted) setSalesData(r?.data?.data ?? null);
        } else if (tab === 'pipeline') {
          const r = await api.get('/reports/pipeline', { params: paramsBase, signal: controller.signal });
          if (!controller.signal.aborted) {
            const raw = extractArray(r?.data);
            setPipelineData(
              raw.map((item: any) => ({
                ...item,
                count: Number(item?.count || 0),
                total_value: Number(item?.total_value || 0),
              }))
            );
          }
        } else if (tab === 'customers') {
          const r = await api.get('/reports/customers', { params: paramsBase, signal: controller.signal });
          if (!controller.signal.aborted) {
            const raw = r?.data?.data;
            if (raw) {
              setCustomerData({
                ...raw,
                by_source: ensureArray(raw.by_source).map((item: any) => ({ ...item, count: Number(item?.count || 0) })),
                by_score: ensureArray(raw.by_score).map((item: any) => ({ ...item, count: Number(item?.count || 0) })),
                trend: ensureArray(raw.trend).map((item: any) => ({ ...item, count: Number(item?.count || 0) })),
                by_status: ensureArray(raw.by_status).map((item: any) => ({ ...item, count: Number(item?.count || 0) })),
              });
            } else {
              setCustomerData(null);
            }
          }
        } else if (tab === 'companies') {
          const r = await api.get('/reports/companies', {
            params: { team_id: effectiveTeamId },
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            const raw = r?.data?.data;
            if (raw) {
              setCompanyData({
                ...raw,
                by_industry: ensureArray(raw.by_industry).map((item: any) => ({ ...item, count: Number(item?.count || 0) })),
                by_size: ensureArray(raw.by_size).map((item: any) => ({ ...item, count: Number(item?.count || 0) })),
                by_city: ensureArray(raw.by_city).map((item: any) => ({ ...item, count: Number(item?.count || 0) })),
              });
            } else {
              setCompanyData(null);
            }
          }
        } else if (tab === 'expenses') {
          const [expRes, salesRes] = await Promise.all([
            api.get('/reports/expenses', { params: paramsBase, signal: controller.signal }),
            salesData
              ? Promise.resolve(null)
              : api.get('/reports/sales', { params: paramsBase, signal: controller.signal }).catch(() => null),
          ]);
          if (!controller.signal.aborted) {
            const raw = expRes?.data?.data;
            if (raw) {
              setExpenseData({
                ...raw,
                by_category: ensureArray(raw.by_category).map((item: any) => ({ ...item, total: Number(item?.total || 0) })),
                trend: ensureArray(raw.trend).map((item: any) => ({ ...item, total: Number(item?.total || 0) })),
              });
            } else {
              setExpenseData(null);
            }
            if (salesRes?.data?.data) {
              setSalesData(salesRes.data.data);
            }
          }
        } else if (tab === 'activities') {
          const r = await api.get('/reports/activities', { params: paramsBase, signal: controller.signal });
          if (!controller.signal.aborted) {
            const raw = r?.data?.data;
            if (raw) {
              setActivityData({
                ...raw,
                by_type: ensureArray(raw.by_type).map((item: any) => ({ ...item, total: Number(item?.total || 0) })),
                by_user_type: ensureArray(raw.by_user_type).map((item: any) => ({ ...item, total: Number(item?.total || 0) })),
              });
            } else {
              setActivityData(null);
            }
          }
        }
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError' || controller.signal.aborted) {
          return;
        }
      } finally {
        if (reportAbortRef.current === controller) {
          setLoading(false);
        }
      }
    };

    void run();
    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dateRange.from, dateRange.to, effectiveTeamId, refreshNonce]);

  const handlePeriodChange = useCallback((p: Period, r: DateRange) => {
    setPeriod(p);
    setDateRange(r);
    setOwnerPage(1);
    setSalesData(null);
    setPipelineData([]);
    setCustomerData(null);
    setCompanyData(null);
    setExpenseData(null);
    setActivityData(null);
  }, []);

  const handlePrintPdf = useCallback(() => {
    addToast('Đang tạo báo cáo PDF...', 'info');
    window.setTimeout(() => window.print(), 1000);
  }, [addToast]);

  const handleManualRefresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Báo cáo &amp; Phân tích</h1>
          {(user?.role as any) === 'sale' || (user?.role as any) === 'sales' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
              <span className="page-subtitle" style={{ margin: 0 }}>Dữ liệu của</span>
              <Avatar name={(user as any)?.full_name || 'Sale'} src={(user as any)?.avatar_url} size={22} />
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                {(user as any)?.full_name}
              </span>
            </div>
          ) : (
            <p className="page-subtitle">Dữ liệu tổng hợp toàn hệ thống theo chuẩn Domation Executive</p>
          )}
        </div>
      </div>

      <DomDashboardToolbar
        elevated
        left={
          <DomSegmentedSwitch
            value={tab}
            onChange={(nextTab) => setTab(nextTab)}
            options={REPORT_TABS}
            ariaLabel="Chọn phân hệ báo cáo"
          />
        }
        right={
          <div style={{ width: isMobile ? '100%' : 'auto', minWidth: isMobile ? 0 : 180 }}>
            <PeriodFilter
              value={period}
              customRange={period === 'custom' ? dateRange : undefined}
              onChange={handlePeriodChange}
              style={{ width: isMobile ? '100%' : 'auto' }}
              buttonStyle={{
                height: 36,
                minHeight: 36,
                borderRadius: '10px',
                fontSize: '0.8125rem',
                width: isMobile ? '100%' : undefined,
              }}
            />
          </div>
        }
        actions={
          <>
            <DomToolbarButton
              variant="secondary"
              icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
              onClick={handleManualRefresh}
              disabled={loading}
              title="Làm mới báo cáo"
            >
              {!isMobile && 'Làm mới'}
            </DomToolbarButton>
            <DomToolbarButton
              variant="primary"
              icon={<Download size={14} />}
              onClick={handlePrintPdf}
              title="Xuất báo cáo PDF"
            >
              {isMobile ? 'PDF' : 'Xuất PDF'}
            </DomToolbarButton>
          </>
        }
      />

      {tab === 'sales' && (
        <ReportsSalesTab
          salesData={salesData}
          loading={loading}
          ownerPage={ownerPage}
          onOwnerPageChange={setOwnerPage}
        />
      )}

      {tab === 'pipeline' && (
        <ReportsPipelineTab pipelineData={pipelineData} loading={loading} />
      )}

      {tab === 'customers' && (
        <ReportsCustomersTab customerData={customerData} loading={loading} />
      )}

      {tab === 'companies' && (
        <ReportsCompaniesTab companyData={companyData} loading={loading} />
      )}

      {tab === 'expenses' && (
        <ReportsExpensesTab expenseData={expenseData} salesData={salesData} loading={loading} />
      )}

      {tab === 'activities' && (
        <ReportsActivitiesTab activityData={activityData} loading={loading} />
      )}
    </div>
  );
};
export default ReportsPage;
