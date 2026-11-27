import React, { memo, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  TrendingUp, FileText, CheckCircle2, RefreshCw, Download, ShieldCheck,
  DollarSign, Wallet, Percent, Receipt
} from 'lucide-react';
import {
  Bar, XAxis, YAxis, CartesianGrid, LabelList,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, ComposedChart, Area, Line
} from 'recharts';
import api from '../api/axios';
import { useLanguage } from '../contexts/LanguageContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { PeriodFilter, getDateRange } from '../components/ui/PeriodFilter';
import type { Period, DateRange } from '../components/ui/PeriodFilter';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyCard } from '../components/ui/EmptyCard';
import { formatDateVN, getLocalDateStr } from '../utils/dateUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import {
  DomHeroStackCard,
  DomKpiTile,
  DomPanelCard,
  DomRankBarRow,
  DomChartTooltip,
  DomDashboardToolbar,
  DomToolbarButton,
  DomSegmentedSwitch,
  DomEmptyChartState,
  type DomHeroStat,
} from '../components/Dashboard/DomationDashboardKit';
import toast from 'react-hot-toast';

const FMT_MONEY = (n: any, currency = 'VND') => {
  const num = Math.round(Number(n || 0));
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (currency !== 'VND') {
    return `${sign}${new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(abs)} ${currency}`;
  }
  if (abs >= 1e9) {
    return `${sign}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(abs / 1e9)} Tỷ đ`;
  }
  if (abs >= 1e6) {
    return `${sign}${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(abs / 1e6)} Tr đ`;
  }
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
};

const FMT_COMPACT = (n: any) => {
  const num = Number(n || 0);
  const abs = Math.abs(num);
  const sign = num < 0 ? '-' : '';
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return String(Math.round(num));
};

const csvSafe = (val: any): string => {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const parseMonthFromRange = (range: DateRange): string => {
  const ref = range?.to || range?.from || getLocalDateStr();
  const m = String(ref).match(/^(\d{4}-\d{2})/);
  return m ? m[1] : getLocalDateStr().slice(0, 7);
};

const getPrevMonthYm = (ym: string): string => {
  const parts = ym.split('-').map(Number);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return ym;
  const d = new Date(parts[0], parts[1] - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const pctNumberDelta = (cur: number, prev: number): number | null => {
  if (!Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  if (prev === 0) {
    if (cur === 0) return 0;
    return cur > 0 ? 100 : -100;
  }
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
};

interface CashflowChartPoint {
  name: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface InvoiceStatusItem {
  name: string;
  value: number;
  color: string;
}

interface ArAgingBucket {
  bucket: string;
  count: number;
  amount: number;
}

// ============================================================================
// Memoized Sub-Panels (Recharts + Tables)
// ============================================================================
const FinancialCashflowChartPanel: React.FC<{
  data: CashflowChartPoint[];
  loading: boolean;
  defaultCurrency: string;
  t: (k: string) => string;
}> = memo(({ data, loading, defaultCurrency, t }) => {
  const safeData = Array.isArray(data) ? data : [];

  return (
    <DomPanelCard
      title={t('Dòng tiền thu chi & Lợi nhuận')}
      subtitle={t('Doanh thu thực tế, chi phí vận hành và lợi nhuận ròng')}
      icon={<TrendingUp size={16} strokeWidth={1.85} />}
      iconAccent="brand"
      loading={loading}
      style={{ height: '100%' }}
      rightSlot={
        <div
          style={{
            display: 'flex',
            gap: '12px',
            fontSize: '0.73rem',
            fontWeight: 600,
            color: '#64748b',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#10B981' }} />
            {t('Doanh thu')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#F59E0B' }} />
            {t('Chi phí')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: 10, height: 2, background: '#3B82F6' }} />
            {t('Lợi nhuận ròng')}
          </span>
        </div>
      }
    >
      {safeData.length === 0 ? (
        <DomEmptyChartState
          title={t('Chưa có dữ liệu dòng tiền trong kỳ')}
          description={t('Dữ liệu thu chi và lợi nhuận sẽ hiển thị khi phát sinh hóa đơn hoặc phiếu chi.')}
          minHeight={290}
        />
      ) : (
        <div style={{ width: '100%', height: 296 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={safeData} margin={{ left: -8, right: 8, top: 18, bottom: 2 }}>
              <defs>
                <linearGradient id="finRevAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'var(--color-text-muted, #64748B)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={FMT_COMPACT}
                tick={{ fontSize: 11, fill: 'var(--color-text-muted, #64748B)' }}
                axisLine={false}
                tickLine={false}
                width={46}
              />
              <Tooltip
                content={
                  <DomChartTooltip
                    valueFormatter={(v) => FMT_MONEY(v, defaultCurrency)}
                  />
                }
              />
              <Area
                name={t('Doanh thu')}
                type="monotone"
                dataKey="revenue"
                fill="url(#finRevAreaGrad)"
                stroke="#10B981"
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#10B981' }}
              />
              <Bar
                name={t('Chi phí')}
                dataKey="expenses"
                fill="#F59E0B"
                radius={[4, 4, 0, 0]}
                maxBarSize={22}
              >
                <LabelList
                  dataKey="expenses"
                  position="top"
                  formatter={FMT_COMPACT}
                  style={{ fontSize: 10, fill: 'var(--color-text-secondary, #64748B)', fontWeight: 600 }}
                />
              </Bar>
              <Line
                name={t('Lợi nhuận ròng')}
                type="monotone"
                dataKey="profit"
                stroke="#3B82F6"
                strokeWidth={2.25}
                dot={{ r: 3, fill: '#3B82F6', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#3B82F6' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </DomPanelCard>
  );
});

const FinancialArStatusPanel: React.FC<{
  invoiceStatuses: InvoiceStatusItem[];
  arAgingBuckets: ArAgingBucket[];
  loading: boolean;
  defaultCurrency: string;
  t: (k: string) => string;
}> = memo(({ invoiceStatuses, arAgingBuckets, loading, defaultCurrency, t }) => {
  const safeStatuses = Array.isArray(invoiceStatuses) ? invoiceStatuses : [];
  const safeBuckets = Array.isArray(arAgingBuckets) ? arAgingBuckets : [];

  const totalInvCount = useMemo(
    () => safeStatuses.reduce((acc, s) => acc + Number(s.value || 0), 0),
    [safeStatuses]
  );

  const totalAgingAmt = useMemo(
    () => safeBuckets.reduce((acc, b) => acc + Number(b.amount || 0), 0),
    [safeBuckets]
  );

  return (
    <DomPanelCard
      title={t('Phân bổ hóa đơn & Tuổi nợ AR')}
      subtitle={t('Tỷ trọng trạng thái hóa đơn và phân tầng công nợ quá hạn')}
      icon={<FileText size={16} strokeWidth={1.85} />}
      iconAccent="blue"
      loading={loading}
      style={{ height: '100%' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
        {/* Invoice Status Donut */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
          <div style={{ width: 132, height: 132, flexShrink: 0, position: 'relative' }}>
            {totalInvCount === 0 ? (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  border: '10px solid var(--color-border-light)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: 'var(--color-text-muted)',
                }}
              >
                0 HĐ
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={safeStatuses}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={58}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {safeStatuses.map((entry, index) => (
                      <Cell key={`inv-cell-${index}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    content={
                      <DomChartTooltip
                        valueFormatter={(v) => `${v} ${t('hóa đơn')}`}
                      />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div
            className="dom-tabular"
            style={{
              flex: 1,
              minWidth: 140,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              fontSize: '0.76rem',
            }}
          >
            {safeStatuses.map((entry, idx) => (
              <div
                key={`${entry.name}-${idx}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, flexShrink: 0 }} />
                  {entry.name}
                </span>
                <strong style={{ color: 'var(--color-text)' }}>{entry.value}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* AR Aging Rank Bar Rows */}
        <div
          style={{
            borderTop: '1px solid var(--color-border-light)',
            paddingTop: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)' }}>
            {t('Tuổi nợ Phải thu (AR Aging)')}
          </div>
          {safeBuckets.map((b, idx) => {
            const pct = totalAgingAmt > 0 ? Math.round((Number(b.amount || 0) / totalAgingAmt) * 100) : 0;
            return (
              <DomRankBarRow
                key={b.bucket}
                rank={idx + 1}
                label={b.bucket}
                secondaryValue={`${b.count} ${t('HĐ')}`}
                value={FMT_MONEY(b.amount, defaultCurrency)}
                percent={pct}
                barColor={idx === 2 ? '#EF4444' : idx === 1 ? '#F59E0B' : '#3B82F6'}
                badge={`${pct}%`}
                badgeTone={idx === 2 && b.amount > 0 ? 'rose' : idx === 1 ? 'amber' : 'blue'}
              />
            );
          })}
        </div>
      </div>
    </DomPanelCard>
  );
});

const FinancialTaxReconciliationPanel: React.FC<{
  cashflow: any;
  taxBalance: any;
  pnl: any;
  defaultCurrency: string;
  loading: boolean;
  isMobile: boolean;
  t: (k: string) => string;
}> = memo(({ cashflow, taxBalance, pnl, defaultCurrency, loading, isMobile, t }) => {
  const cashIn = Number(cashflow?.cash_in ?? 0);
  const cashOut = Number(cashflow?.cash_out ?? 0);
  const vatPay = Number(taxBalance?.vat_payable ?? 0);
  const pitCit = Number(taxBalance?.pit_withheld ?? 0) + Number(taxBalance?.cit_estimated ?? 0);
  const depRev = Number(pnl?.deposit_revenue ?? 0);
  const invRev = Number(pnl?.invoice_revenue ?? 0);

  return (
    <DomPanelCard
      deferred
      title={t('Đối soát Quỹ & Nghĩa vụ Thuế')}
      subtitle={t('Tổng hợp dòng tiền thực thu - thực chi và nghĩa vụ thuế GTGT, TNCN, TNDN')}
      icon={<ShieldCheck size={16} strokeWidth={1.85} />}
      iconAccent="indigo"
    >
      <div
        className="dashboard-kpi-grid"
        style={{
          marginBottom: 0,
          gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
        }}
      >
        <DomKpiTile
          label={t('Tổng thực thu quỹ')}
          value={FMT_MONEY(cashIn, defaultCurrency)}
          icon={<Wallet size={16} />}
          accent="emerald"
          loading={loading}
          breakdown={
            <>
              <span>{t('Cọc')}: <strong style={{ color: 'var(--color-text)' }}>{FMT_COMPACT(depRev)}</strong></span>
              <span>{t('HĐ')}: <strong style={{ color: 'var(--color-text)' }}>{FMT_COMPACT(invRev)}</strong></span>
            </>
          }
        />
        <DomKpiTile
          label={t('Tổng thực chi quỹ')}
          value={FMT_MONEY(cashOut, defaultCurrency)}
          icon={<DollarSign size={16} />}
          accent="blue"
          loading={loading}
          breakdown={
            <span>{t('Chênh lệch thu - chi')}: <strong style={{ color: 'var(--color-text)' }}>{FMT_COMPACT(cashIn - cashOut)}</strong></span>
          }
        />
        <DomKpiTile
          label={t('Thuế GTGT phải nộp')}
          value={FMT_MONEY(vatPay, defaultCurrency)}
          icon={<Receipt size={16} />}
          accent="amber"
          loading={loading}
          breakdown={
            <span>{t('Khấu trừ')}: <strong style={{ color: 'var(--color-text)' }}>{FMT_COMPACT(taxBalance?.vat_deductible ?? 0)}</strong></span>
          }
        />
        <DomKpiTile
          label={t('TNCN + TNDN Tạm tính')}
          value={FMT_MONEY(pitCit, defaultCurrency)}
          icon={<Percent size={16} />}
          accent="indigo"
          loading={loading}
          breakdown={
            <>
              <span>PIT: <strong style={{ color: 'var(--color-text)' }}>{FMT_COMPACT(taxBalance?.pit_withheld ?? 0)}</strong></span>
              <span>CIT: <strong style={{ color: 'var(--color-text)' }}>{FMT_COMPACT(taxBalance?.cit_estimated ?? 0)}</strong></span>
            </>
          }
        />
      </div>
    </DomPanelCard>
  );
});

const FinancialOrdersComparisonPanel: React.FC<{
  activeOrderType: 'so' | 'po' | 'deposits';
  onOrderTypeChange: (val: 'so' | 'po' | 'deposits') => void;
  soList: any[];
  poList: any[];
  depositList: any[];
  loading: boolean;
  defaultCurrency: string;
  t: (k: string) => string;
}> = memo(({ activeOrderType, onOrderTypeChange, soList, poList, depositList, loading, defaultCurrency, t }) => {
  const safeSo = Array.isArray(soList) ? soList : [];
  const safePo = Array.isArray(poList) ? poList : [];
  const safeDep = Array.isArray(depositList) ? depositList : [];

  const switchOptions = useMemo(
    () => [
      { value: 'so' as const, label: t('Đơn bán (SO)'), badge: safeSo.length },
      { value: 'po' as const, label: t('Đơn mua (PO)'), badge: safePo.length },
      { value: 'deposits' as const, label: t('Đặt cọc'), badge: safeDep.length },
    ],
    [safeSo.length, safePo.length, safeDep.length, t]
  );

  return (
    <DomPanelCard
      deferred
      title={t('Đơn hàng & Giao dịch gần đây (SO / PO / Đặt cọc)')}
      subtitle={t('Đối chiếu đơn bán hàng, đơn mua hàng và phiếu đặt cọc phát sinh trong kỳ')}
      icon={<FileText size={16} strokeWidth={1.85} />}
      iconAccent="slate"
      rightSlot={
        <DomSegmentedSwitch
          value={activeOrderType}
          onChange={onOrderTypeChange}
          options={switchOptions}
          ariaLabel={t('Chế độ xem đơn hàng')}
        />
      }
    >
      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'var(--color-surface)' }}>
        {activeOrderType === 'so' && (
          <table className="dom-tabular" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                <th style={{ padding: '12px' }}>{t('Số SO')}</th>
                <th style={{ padding: '12px' }}>{t('Khách hàng / Đối tác')}</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>{t('Tổng tiền')}</th>
                <th style={{ padding: '12px' }}>{t('Người tạo')}</th>
                <th style={{ padding: '12px' }}>{t('Trạng thái')}</th>
                <th style={{ padding: '12px' }}>{t('Ngày đặt')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} style={{ padding: '12px' }}><Skeleton width="100%" height={16} /></td></tr>
                ))
              ) : safeSo.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px' }}><EmptyCard icon={<FileText size={28} />} title={t('Không có đơn bán hàng nào trong kỳ')} description={t('Đơn bán hàng SO sẽ hiển thị tại đây khi được tạo.')} /></td></tr>
              ) : safeSo.slice(0, 8).map((so: any) => (
                <tr key={so.id} style={{ borderTop: '1px solid var(--color-border-light)', height: '48px' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: '#2563EB' }}>{so.so_number || `#SO-${so.id}`}</td>
                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--color-text)' }}>{so.contact_name || so.company_name || '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>{FMT_MONEY(so.total || 0, defaultCurrency)}</td>
                  <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{so.creator_name || '—'}</td>
                  <td style={{ padding: '12px' }}>
                    <span className={so.status === 'cancelled' ? 'dom-tone-rose' : 'dom-tone-slate'} style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                      {so.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>{formatDateVN(so.order_date || so.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeOrderType === 'po' && (
          <table className="dom-tabular" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                <th style={{ padding: '12px' }}>{t('Số PO')}</th>
                <th style={{ padding: '12px' }}>{t('Nhà cung cấp')}</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>{t('Tổng tiền')}</th>
                <th style={{ padding: '12px' }}>{t('Người tạo')}</th>
                <th style={{ padding: '12px' }}>{t('Trạng thái')}</th>
                <th style={{ padding: '12px' }}>{t('Ngày đặt')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} style={{ padding: '12px' }}><Skeleton width="100%" height={16} /></td></tr>
                ))
              ) : safePo.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px' }}><EmptyCard icon={<FileText size={28} />} title={t('Không có đơn mua hàng (PO) nào trong kỳ')} description={t('Đơn mua hàng PO sẽ hiển thị tại đây.')} /></td></tr>
              ) : safePo.slice(0, 8).map((po: any) => (
                <tr key={po.id} style={{ borderTop: '1px solid var(--color-border-light)', height: '48px' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: '#6366F1' }}>{po.po_number || `#PO-${po.id}`}</td>
                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--color-text)' }}>{po.supplier_name || po.title || '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>{FMT_MONEY(po.total ?? po.amount ?? 0, defaultCurrency)}</td>
                  <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{po.creator_name || '—'}</td>
                  <td style={{ padding: '12px' }}>
                    <span className={po.status === 'cancelled' || po.status === 'rejected' ? 'dom-tone-rose' : 'dom-tone-slate'} style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                      {po.status}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>{formatDateVN(po.order_date || po.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeOrderType === 'deposits' && (
          <table className="dom-tabular" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                <th style={{ padding: '12px' }}>{t('Mã giao dịch')}</th>
                <th style={{ padding: '12px' }}>{t('Khách hàng / Đối tác')}</th>
                <th style={{ padding: '12px' }}>{t('Chương trình')}</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>{t('Giá trị')}</th>
                <th style={{ padding: '12px' }}>{t('Trạng thái')}</th>
                <th style={{ padding: '12px' }}>{t('Ngày tạo')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}><td colSpan={6} style={{ padding: '12px' }}><Skeleton width="100%" height={16} /></td></tr>
                ))
              ) : safeDep.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '20px' }}><EmptyCard icon={<FileText size={28} />} title={t('Không có giao dịch đặt cọc nào trong kỳ')} description={t('Giao dịch đặt cọc sẽ hiển thị tại đây.')} /></td></tr>
              ) : safeDep.slice(0, 8).map((dep: any) => (
                <tr key={dep.id} style={{ borderTop: '1px solid var(--color-border-light)', height: '48px' }}>
                  <td style={{ padding: '12px', fontWeight: 700, color: '#10B981' }}>{dep.unit_code || `#DEP-${dep.id}`}</td>
                  <td style={{ padding: '12px', fontWeight: 600, color: 'var(--color-text)' }}>{dep.full_name || dep.company_name || dep.supplier_name || '—'}</td>
                  <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{dep.project_name || '—'}</td>
                  <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text)' }}>{FMT_MONEY(dep.price || 0, dep.currency || defaultCurrency)}</td>
                  <td style={{ padding: '12px' }}>
                    <span className={dep.status === 'cancelled' ? 'dom-tone-rose' : dep.status === 'approved' ? 'dom-tone-emerald' : 'dom-tone-amber'} style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                      {dep.status === 'approved' ? t('Hoàn tất cọc') : dep.status === 'cancelled' ? t('Đã hủy') : t('Đang xử lý')}
                    </span>
                  </td>
                  <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>{formatDateVN(dep.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DomPanelCard>
  );
});

const FinancialCancellationsPanel: React.FC<{
  cancellationList: any[];
  loading: boolean;
  defaultCurrency: string;
  t: (k: string) => string;
}> = memo(({ cancellationList, loading, defaultCurrency, t }) => {
  const safeList = Array.isArray(cancellationList) ? cancellationList : [];
  return (
    <DomPanelCard
      deferred
      title={t('Nhật ký đối soát giao dịch hủy cọc / hoàn tiền')}
      subtitle={t('Theo dõi các phiếu đặt cọc đã hủy hoặc hoàn tiền cần kế toán đối soát')}
      icon={<CheckCircle2 size={16} strokeWidth={1.85} />}
      iconAccent="rose"
    >
      <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '12px', background: 'var(--color-surface)' }}>
        <table className="dom-tabular" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-muted)', fontWeight: 600 }}>
              <th style={{ padding: '12px' }}>{t('Mã GD')}</th>
              <th style={{ padding: '12px' }}>{t('Khách hàng / Đối tác')}</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>{t('Giá trị')}</th>
              <th style={{ padding: '12px' }}>{t('Phân loại')}</th>
              <th style={{ padding: '12px' }}>{t('Ghi chú / Lý do')}</th>
              <th style={{ padding: '12px' }}>{t('Ngày ghi nhận')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i}><td colSpan={6} style={{ padding: '12px' }}><Skeleton width="100%" height={16} /></td></tr>
              ))
            ) : safeList.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '20px' }}>
                  <EmptyCard icon={<CheckCircle2 size={28} />} title={t('Không có giao dịch hủy cọc trong kỳ')} description={t('Toàn bộ giao dịch đặt cọc đang vận hành ổn định.')} />
                </td>
              </tr>
            ) : safeList.map((item, idx) => (
              <tr key={`${item.id}-${idx}`} style={{ borderTop: '1px solid var(--color-border-light)', height: '48px' }}>
                <td style={{ padding: '12px', fontWeight: 700, color: 'var(--color-text)' }}>{item.id}</td>
                <td style={{ padding: '12px', fontWeight: 600, color: 'var(--color-text)' }}>{item.client}</td>
                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 700, color: '#EF4444' }}>
                  {item.amount > 0 ? FMT_MONEY(item.amount, defaultCurrency) : '—'}
                </td>
                <td style={{ padding: '12px' }}>
                  <span className="dom-tone-rose" style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700 }}>
                    {item.type}
                  </span>
                </td>
                <td style={{ padding: '12px', color: 'var(--color-text-muted)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.note}>
                  {item.note}
                </td>
                <td style={{ padding: '12px', color: 'var(--color-text-muted)' }}>{item.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DomPanelCard>
  );
});

// ============================================================================
// Main Page Component
// ============================================================================
export const FinancialDashboard: React.FC = () => {
  const { t } = useLanguage();
  const defaultCurrency = useTypedSubSetting<string>('finance.currency_and_fx_rates', 'default', 'VND');

  const [period, setPeriod] = useState<Period>('this_month');
  const [dateRange, setDateRange] = useState<DateRange>(getDateRange('this_month'));
  const [loading, setLoading] = useState(true);

  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>(() => {
    if (typeof window === 'undefined') return 'desktop';
    if (window.innerWidth <= 768) return 'mobile';
    if (window.innerWidth < 1280) return 'tablet';
    return 'desktop';
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mqMob = window.matchMedia('(max-width: 768px)');
    const mqTab = window.matchMedia('(max-width: 1279px)');
    const sync = () => {
      if (mqMob.matches) setViewportMode('mobile');
      else if (mqTab.matches) setViewportMode('tablet');
      else setViewportMode('desktop');
    };
    sync();
    mqMob.addEventListener('change', sync);
    mqTab.addEventListener('change', sync);
    return () => {
      mqMob.removeEventListener('change', sync);
      mqTab.removeEventListener('change', sync);
    };
  }, []);

  const isMobile = viewportMode === 'mobile';

  const [pnl, setPnl] = useState<any>(null);
  const [prevPnl, setPrevPnl] = useState<any>(null);
  const [cashflow, setCashflow] = useState<any>(null);
  const [taxBalance, setTaxBalance] = useState<any>(null);
  const [invSummary, setInvSummary] = useState<any>({ total_rev: 0, paid_amt: 0, pending_amt: 0, overdue_amt: 0, prev_total_rev: 0, prev_paid_amt: 0 });
  const [flowData, setFlowData] = useState<CashflowChartPoint[]>([]);
  const [invoiceStatuses, setInvoiceStatuses] = useState<InvoiceStatusItem[]>([]);
  const [arAgingBuckets, setArAgingBuckets] = useState<ArAgingBucket[]>([]);
  const [cancellationList, setCancellationList] = useState<any[]>([]);
  const [soList, setSoList] = useState<any[]>([]);
  const [poList, setPoList] = useState<any[]>([]);
  const [depositList, setDepositList] = useState<any[]>([]);
  const [activeOrderType, setActiveOrderType] = useState<'so' | 'po' | 'deposits'>('so');

  const fetchAbortRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    setLoading(true);

    const activeYm = parseMonthFromRange(dateRange);
    const prevYm = getPrevMonthYm(activeYm);

    try {
      const [azCurRes, azPrevRes, salesRepRes, invRes, soRes, poRes, depRes] = await Promise.all([
        api.get('/finance/accounting-az/summary', { params: { month: activeYm }, signal: ctrl.signal }).catch((e) => {
          if (e?.name === 'CanceledError' || e?.name === 'AbortError') throw e;
          return { data: { data: null } };
        }),
        api.get('/finance/accounting-az/summary', { params: { month: prevYm }, signal: ctrl.signal }).catch((e) => {
          if (e?.name === 'CanceledError' || e?.name === 'AbortError') throw e;
          return { data: { data: null } };
        }),
        api.get('/reports/sales', { params: { from: dateRange.from, to: dateRange.to }, signal: ctrl.signal }).catch((e) => {
          if (e?.name === 'CanceledError' || e?.name === 'AbortError') throw e;
          return { data: { data: null } };
        }),
        api.get('/invoices', { params: { from: dateRange.from, to: dateRange.to, limit: 200 }, signal: ctrl.signal }).catch((e) => {
          if (e?.name === 'CanceledError' || e?.name === 'AbortError') throw e;
          return { data: { data: { items: [], summary: {} } } };
        }),
        api.get('/sales-orders', { params: { from: dateRange.from, to: dateRange.to, limit: 20 }, signal: ctrl.signal }).catch((e) => {
          if (e?.name === 'CanceledError' || e?.name === 'AbortError') throw e;
          return { data: { data: { items: [] } } };
        }),
        api.get('/purchase-orders', { params: { from: dateRange.from, to: dateRange.to, limit: 20 }, signal: ctrl.signal }).catch((e) => {
          if (e?.name === 'CanceledError' || e?.name === 'AbortError') throw e;
          return { data: { data: { items: [] } } };
        }),
        api.get('/deposits', { params: { from: dateRange.from, to: dateRange.to, limit: 50 }, signal: ctrl.signal }).catch((e) => {
          if (e?.name === 'CanceledError' || e?.name === 'AbortError') throw e;
          return { data: { data: { items: [] } } };
        }),
      ]);

      if (ctrl.signal.aborted) return;

      const curSummary = azCurRes?.data?.data || {};
      const prevSummaryData = azPrevRes?.data?.data || {};
      const salesRep = salesRepRes?.data?.data || {};
      const invPayload = invRes?.data?.data || {};
      const safeInvoices = extractArray(invPayload, 'items');
      const safeSos = extractArray(soRes?.data, 'items');
      const safePos = extractArray(poRes?.data, 'items');
      const safeDeposits = extractArray(depRes?.data, 'items');

      setPnl(curSummary.pnl || null);
      setPrevPnl(prevSummaryData.pnl || null);
      setCashflow(curSummary.cashflow || null);
      setTaxBalance(curSummary.tax_balance || null);
      setInvSummary(invPayload.summary || { total_rev: 0, paid_amt: 0, pending_amt: 0, overdue_amt: 0, prev_total_rev: 0, prev_paid_amt: 0 });
      setSoList(safeSos);
      setPoList(safePos);
      setDepositList(safeDeposits);

      const byMonth = ensureArray(salesRep.by_month || salesRep.monthly_trend);
      if (byMonth.length > 0) {
        setFlowData(byMonth.map((m: any) => {
          const rev = Number(m.revenue ?? m.won_value ?? 0);
          const exp = Number(m.cost ?? m.expenses ?? 0);
          return {
            name: m.month || m.label || m.name || '—',
            revenue: rev,
            expenses: exp,
            profit: rev - exp,
          };
        }));
      } else {
        const rev = Number(curSummary?.pnl?.revenue ?? 0);
        const exp = Number(curSummary?.pnl?.total_expense ?? 0) + Number(curSummary?.pnl?.cogs ?? 0);
        setFlowData([{ name: activeYm, revenue: rev, expenses: exp, profit: Number(curSummary?.pnl?.net_profit ?? (rev - exp)) }]);
      }

      const paidCnt = safeInvoices.filter((i: any) => i.status === 'paid').length;
      const pendingCnt = safeInvoices.filter((i: any) => i.status === 'pending' || i.status === 'sent').length;
      const overdueCnt = safeInvoices.filter((i: any) => i.status === 'overdue').length;
      const cancelledInvCnt = safeInvoices.filter((i: any) => i.status === 'cancelled' || i.status === 'void').length;
      setInvoiceStatuses([
        { name: t('Đã thanh toán'), value: paidCnt, color: '#10B981' },
        { name: t('Chờ thanh toán'), value: pendingCnt, color: '#F59E0B' },
        { name: t('Quá hạn'), value: overdueCnt, color: '#EF4444' },
        { name: t('Đã hủy'), value: cancelledInvCnt, color: '#94A3B8' },
      ].filter(s => s.value > 0 || paidCnt + pendingCnt + overdueCnt + cancelledInvCnt === 0));

      const todayMs = Date.now();
      const aging = {
        b0_30: { count: 0, amount: 0 },
        b31_60: { count: 0, amount: 0 },
        b60_plus: { count: 0, amount: 0 },
      };
      safeInvoices.forEach((inv: any) => {
        if (inv.status !== 'pending' && inv.status !== 'overdue' && inv.status !== 'sent') return;
        const dueStr = inv.due_date || inv.issue_date || inv.created_at;
        const parsedMs = dueStr ? new Date(String(dueStr).includes('T') ? dueStr : String(dueStr).replace(/-/g, '/')).getTime() : NaN;
        const daysPast = Number.isFinite(parsedMs) ? Math.max(0, Math.floor((todayMs - parsedMs) / 86400000)) : 0;
        const amt = Number(inv.total || 0);
        if (daysPast > 60) {
          aging.b60_plus.count += 1;
          aging.b60_plus.amount += amt;
        } else if (daysPast > 30) {
          aging.b31_60.count += 1;
          aging.b31_60.amount += amt;
        } else {
          aging.b0_30.count += 1;
          aging.b0_30.amount += amt;
        }
      });
      setArAgingBuckets([
        { bucket: t('0 – 30 ngày'), count: aging.b0_30.count, amount: aging.b0_30.amount },
        { bucket: t('31 – 60 ngày'), count: aging.b31_60.count, amount: aging.b31_60.amount },
        { bucket: t('Trên 60 ngày'), count: aging.b60_plus.count, amount: aging.b60_plus.amount },
      ]);

      const cancelledDeposits = safeDeposits.filter((d: any) => d.status === 'cancelled' || d.status === 'failed');
      setCancellationList(cancelledDeposits.slice(0, 15).map((d: any) => ({
        id: d.unit_code || `#DEP-${d.id}`,
        client: d.full_name || d.customer_name || d.company_name || d.supplier_name || '—',
        amount: Number(d.price || 0),
        type: t('Hủy / Bể cọc'),
        status: t('Đã hủy'),
        date: formatDateVN(d.updated_at || d.created_at),
        note: d.cancel_reason || d.notes || '—',
      })));
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || ctrl.signal.aborted) return;
      toast.error(t('Lỗi tải dữ liệu kế toán'));
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
      }
    }
  }, [dateRange, t]);

  useEffect(() => {
    fetchData();
    return () => fetchAbortRef.current?.abort();
  }, [fetchData]);

  const activeYm = useMemo(() => parseMonthFromRange(dateRange), [dateRange]);

  const heroData = useMemo(() => {
    const rev = Number(pnl?.revenue ?? invSummary.paid_amt ?? 0);
    const prevRev = Number(prevPnl?.revenue ?? invSummary.prev_paid_amt ?? 0);
    const depRev = Number(pnl?.deposit_revenue ?? 0);
    const invRev = Number(pnl?.invoice_revenue ?? 0);

    const hrmCost = Number(pnl?.hrm_cost ?? 0);
    const opMktCogs = Number(pnl?.operating_expense ?? 0) + Number(pnl?.marketing_expense ?? 0) + Number(pnl?.cogs ?? 0);
    const totalOut = hrmCost + opMktCogs;
    const prevOut = Number(prevPnl?.total_expense ?? 0) + Number(prevPnl?.cogs ?? 0);

    const hrmShare = totalOut > 0 ? Math.round((hrmCost / totalOut) * 100) : 0;
    const opShare = totalOut > 0 ? Math.max(0, 100 - hrmShare) : 0;

    const arTotal = Number(invSummary.pending_amt || 0) + Number(invSummary.overdue_amt || 0);
    const netProfit = Number(pnl?.net_profit ?? (rev - totalOut));
    const prevNet = Number(prevPnl?.net_profit ?? (prevRev - prevOut));
    const grossMargin = Number(pnl?.gross_margin_pct ?? (rev > 0 ? Math.round(((rev - Number(pnl?.cogs ?? 0)) / rev) * 1000) / 10 : 0));
    const netMargin = Number(pnl?.net_margin_pct ?? (rev > 0 ? Math.round((netProfit / rev) * 1000) / 10 : 0));
    const overdueShare = arTotal > 0 ? Math.round((Number(invSummary.overdue_amt || 0) / arTotal) * 100) : 0;

    const revDeltaPct = pctNumberDelta(rev, prevRev);
    const outDeltaPct = pctNumberDelta(totalOut, prevOut);
    const netDeltaPct = pctNumberDelta(netProfit, prevNet);

    const stats: DomHeroStat[] = [
      {
        label: t('Lợi nhuận ròng'),
        value: FMT_MONEY(netProfit, defaultCurrency),
        sub: `${t('Biên ròng')}: ${netMargin}% · ${t('Gộp')}: ${grossMargin}%`,
        deltaPct: netDeltaPct,
        accent: 'emerald',
      },
      {
        label: t('Dòng tiền ròng'),
        value: FMT_MONEY(cashflow?.net_cashflow ?? 0, defaultCurrency),
        sub: `${t('Thu')}: ${FMT_COMPACT(cashflow?.cash_in ?? 0)} · ${t('Chi')}: ${FMT_COMPACT(cashflow?.cash_out ?? 0)}`,
        accent: 'blue',
      },
      {
        label: t('Công nợ AR'),
        value: FMT_MONEY(arTotal, defaultCurrency),
        sub: `${overdueShare}% ${t('quá hạn')} (${FMT_COMPACT(invSummary.overdue_amt || 0)})`,
        accent: 'amber',
      },
      {
        label: t('Chi phí & AP'),
        value: FMT_MONEY(totalOut, defaultCurrency),
        sub: `${t('Lương')} ${hrmShare}% · ${t('VH & PO')} ${opShare}%`,
        deltaPct: outDeltaPct,
        accent: 'rose',
      },
    ];

    return {
      rev,
      depRev,
      invRev,
      netProfit,
      grossMargin,
      revDeltaPct,
      stats,
    };
  }, [pnl, prevPnl, cashflow, invSummary, defaultCurrency, t]);

  const handleExportSummaryCsv = useCallback(() => {
    const headers = ['Chi tieu', 'Gia tri', 'Don vi'];
    const rows = [
      ['Thuc thu (Doanh thu thuc te)', pnl?.revenue ?? 0, defaultCurrency],
      ['Dat coc thuc thu', pnl?.deposit_revenue ?? 0, defaultCurrency],
      ['Hoa don doc lap', pnl?.invoice_revenue ?? 0, defaultCurrency],
      ['Gia von PO (COGS)', pnl?.cogs ?? 0, defaultCurrency],
      ['Chi phi Nhan su & BHXH', pnl?.hrm_cost ?? 0, defaultCurrency],
      ['Chi phi Marketing & Hoa hong', pnl?.marketing_expense ?? 0, defaultCurrency],
      ['Chi phi Van hanh', pnl?.operating_expense ?? 0, defaultCurrency],
      ['Loi nhuan rong sau thue', pnl?.net_profit ?? 0, defaultCurrency],
      ['Dong tien vao', cashflow?.cash_in ?? 0, defaultCurrency],
      ['Dong tien ra', cashflow?.cash_out ?? 0, defaultCurrency],
      ['Dong tien thuan', cashflow?.net_cashflow ?? 0, defaultCurrency],
      ['Cong no AR cho thu', invSummary.pending_amt ?? 0, defaultCurrency],
      ['Cong no AR qua han', invSummary.overdue_amt ?? 0, defaultCurrency],
    ];
    const csv = '\uFEFF' + [headers.map(csvSafe).join(','), ...rows.map(r => r.map(csvSafe).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao_cao_tai_chinh_${activeYm}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    toast.success(t('Đã xuất báo cáo tài chính CSV'));
  }, [pnl, cashflow, invSummary, defaultCurrency, activeYm, t]);

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Page Header + Uniform 36px DomDashboardToolbar */}
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title">{t('Báo cáo Kế toán & Tài chính')}</h1>
          <p className="page-subtitle">{t('Phân tích thực thu, công nợ AR/AP, dòng tiền và biên lợi nhuận thực theo thời gian thực')}</p>
        </div>
      </div>

      <DomDashboardToolbar
        elevated
        left={
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: isMobile ? '100%' : '195px' }}>
              <PeriodFilter
                value={period}
                onChange={(p, range) => {
                  setPeriod(p);
                  setDateRange(range);
                }}
                buttonStyle={{ height: 36, minHeight: 36, borderRadius: 10 }}
              />
            </div>
            <span
              className="dom-tabular"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                height: 36,
                padding: '0 12px',
                borderRadius: 10,
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                fontSize: '0.78rem',
                fontWeight: 700,
                color: 'var(--color-text-secondary)',
              }}
            >
              {t('Kỳ hạch toán')}: {activeYm}
            </span>
          </div>
        }
        actions={
          <>
            <DomToolbarButton
              variant="outline"
              icon={<Download size={14} />}
              onClick={handleExportSummaryCsv}
            >
              {t('Xuất CSV')}
            </DomToolbarButton>
            <DomToolbarButton
              variant="secondary"
              icon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
              onClick={fetchData}
              loading={loading}
              title={t('Làm mới dữ liệu')}
            >
              {t('Làm mới')}
            </DomToolbarButton>
          </>
        }
      />

      {/* DOMATION 3+5+4 Executive Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            viewportMode === 'desktop'
              ? 'minmax(0, 3.2fr) minmax(0, 4.8fr) minmax(0, 4fr)'
              : viewportMode === 'tablet'
                ? 'repeat(2, minmax(0, 1fr))'
                : 'minmax(0, 1fr)',
          gap: '18px',
          alignItems: 'stretch',
        }}
      >
        <div
          style={{
            gridColumn: viewportMode === 'tablet' ? 'span 2 / span 2' : 'auto',
            minWidth: 0,
            display: 'flex',
          }}
        >
          <DomHeroStackCard
            layout="stacked"
            heroTone="emerald"
            eyebrow={t('P&L TÀI CHÍNH')}
            title={t('Thực thu & Biên lợi nhuận')}
            subtitle={`${t('Đặt cọc')}: ${FMT_COMPACT(heroData.depRev)} · ${t('Hóa đơn')}: ${FMT_COMPACT(heroData.invRev)}`}
            headlineLabel={t('Thực thu kỳ này')}
            headlineValue={FMT_MONEY(heroData.rev, defaultCurrency)}
            headlineMeta={`${t('Đơn vị')}: ${defaultCurrency}`}
            deltaPct={heroData.revDeltaPct}
            progressPct={Math.min(100, Math.max(0, heroData.grossMargin))}
            stats={heroData.stats}
            loading={loading}
            style={{ width: '100%' }}
          />
        </div>

        <div style={{ minWidth: 0, display: 'flex' }}>
          <FinancialCashflowChartPanel
            data={flowData}
            loading={loading}
            defaultCurrency={defaultCurrency}
            t={t}
          />
        </div>

        <div style={{ minWidth: 0, display: 'flex' }}>
          <FinancialArStatusPanel
            invoiceStatuses={invoiceStatuses}
            arAgingBuckets={arAgingBuckets}
            loading={loading}
            defaultCurrency={defaultCurrency}
            t={t}
          />
        </div>
      </div>

      {/* Below Fold (content-visibility: auto via dom-cv-card) */}
      <FinancialTaxReconciliationPanel
        cashflow={cashflow}
        taxBalance={taxBalance}
        pnl={pnl}
        defaultCurrency={defaultCurrency}
        loading={loading}
        isMobile={isMobile}
        t={t}
      />

      <FinancialOrdersComparisonPanel
        activeOrderType={activeOrderType}
        onOrderTypeChange={setActiveOrderType}
        soList={soList}
        poList={poList}
        depositList={depositList}
        loading={loading}
        defaultCurrency={defaultCurrency}
        t={t}
      />

      <FinancialCancellationsPanel
        cancellationList={cancellationList}
        loading={loading}
        defaultCurrency={defaultCurrency}
        t={t}
      />
    </div>
  );
};
