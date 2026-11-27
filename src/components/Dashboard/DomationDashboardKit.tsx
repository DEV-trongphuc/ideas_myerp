import React, { memo, useMemo, useState } from 'react';
import {
  BarChart3,
  Calendar,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { VietnameseDateInput } from '../ui/VietnameseDateInput';
import { useLanguage } from '../../contexts/LanguageContext';

// ============================================================================
// Brand Tokens & Shared Formatters (MYERP Multi-Accent Executive Palette)
// ============================================================================
export const DOM_SURFACE_CARD =
  'dom-surface-card rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/75 shadow-[0_4px_20px_rgba(15,23,42,0.03)] dark:shadow-[0_6px_24px_rgba(0,0,0,0.35)]';

export const MYERP_CHART_PALETTE: string[] = [
  '#2563EB', // Royal Blue — primary volume / leads
  '#10B981', // Emerald — revenue / won / positive growth
  '#6366F1', // Indigo — pipeline / qualified / strategy
  '#F59E0B', // Amber — cost / pending / warm attention
  '#0D9488', // Teal — active / retention / attendance
  '#8B5CF6', // Violet — persona / AI / attribution
  '#F43F5E', // Rose — risk / churn / overdue / brand alert
  '#0EA5E9', // Sky — impressions / reach / channels
  '#EA580C', // Orange — escalation / high priority
  '#64748B', // Slate — neutral / baseline / other
];

export type DomAccentTone =
  | 'brand'
  | 'red'
  | 'slate'
  | 'blue'
  | 'indigo'
  | 'teal'
  | 'violet'
  | 'emerald'
  | 'amber'
  | 'rose';

export type DomHeroTone =
  | 'brand'
  | 'blue'
  | 'emerald'
  | 'indigo'
  | 'teal'
  | 'violet'
  | 'slate';

export function formatDomNumber(val: number, locale = 'vi-VN'): string {
  const num = Number.isFinite(val) ? val : 0;
  return Math.round(num).toLocaleString(locale || 'vi-VN');
}

export function formatDomCompactCount(val: number): string {
  const n = Number(val || 0);
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return formatDomNumber(n);
}

export function formatDomMoney(val: number, currency = 'VND'): string {
  const num = Number.isFinite(val) ? val : 0;
  if (currency === 'VND') {
    return `${Math.round(num).toLocaleString('vi-VN')}đ`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'USD' ? 2 : 0,
  }).format(num);
}

export function formatDomMoneyShort(val: number, currency = 'VND'): string {
  const num = Number.isFinite(val) ? val : 0;
  const abs = Math.abs(num);
  const suffix = currency === 'VND' ? 'đ' : '';
  const prefix = currency === 'USD' ? '$' : '';
  if (abs >= 1e9) return `${prefix}${(num / 1e9).toFixed(2)}B${suffix}`;
  if (abs >= 1e6) return `${prefix}${(num / 1e6).toFixed(2)}M${suffix}`;
  if (abs >= 1e3) return `${prefix}${Math.round(num / 1e3)}K${suffix}`;
  return `${prefix}${Math.round(num)}${suffix}`;
}

function resolveToneClass(accent?: DomAccentTone | string): string {
  switch (accent) {
    case 'brand':
    case 'red':
    case 'crimson':
      return 'dom-tone-brand';
    case 'blue':
      return 'dom-tone-blue';
    case 'indigo':
      return 'dom-tone-indigo';
    case 'teal':
      return 'dom-tone-teal';
    case 'violet':
      return 'dom-tone-violet';
    case 'emerald':
      return 'dom-tone-emerald';
    case 'amber':
      return 'dom-tone-amber';
    case 'rose':
      return 'dom-tone-rose';
    case 'slate':
    default:
      return 'dom-tone-slate';
  }
}

const STAT_DOT_COLOR: Record<string, string> = {
  brand: '#BD1D2D',
  red: '#BD1D2D',
  crimson: '#BD1D2D',
  slate: '#475569',
  blue: '#2563EB',
  indigo: '#6366F1',
  teal: '#0D9488',
  violet: '#8B5CF6',
  emerald: '#10B981',
  amber: '#F59E0B',
  rose: '#E11D48',
};

// ============================================================================
// 1. DomDeltaPill
// ============================================================================
export interface DomDeltaPillProps {
  deltaPct?: number | null;
  variant?: 'hero' | 'subtle';
  suffix?: string;
  showZero?: boolean;
  className?: string;
}

export const DomDeltaPill: React.FC<DomDeltaPillProps> = memo(({
  deltaPct,
  variant = 'subtle',
  suffix = '%',
  showZero = true,
  className = '',
}) => {
  if (deltaPct === null || deltaPct === undefined || !Number.isFinite(deltaPct)) {
    return null;
  }
  if (!showZero && deltaPct === 0) {
    return null;
  }
  const isUp = deltaPct > 0;
  const isDown = deltaPct < 0;
  const formatted = `${isUp ? '+' : ''}${Number(deltaPct).toFixed(1)}${suffix}`;
  const stateCls = isUp ? 'is-up' : isDown ? 'is-down' : 'is-flat';
  const variantCls = variant === 'hero' ? 'dom-delta-pill--hero' : 'dom-delta-pill--subtle';

  return (
    <span className={cn('dom-delta-pill', variantCls, stateCls, className)}>
      {isUp && <TrendingUp size={11} aria-hidden="true" />}
      {isDown && <TrendingDown size={11} aria-hidden="true" />}
      <span>{formatted}</span>
    </span>
  );
});

// ============================================================================
// 2. DomHeroStackCard (Multi-Accent Executive Gradient + Neutral Sub-Tiles)
// ============================================================================
export interface DomHeroStat {
  label: string;
  value: string | number;
  valueTooltip?: string;
  sub?: string;
  accent?: DomAccentTone;
  deltaPct?: number | null;
  onClick?: () => void;
}

export interface DomHeroStackCardProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  headlineLabel: string;
  headlineValue: string | number;
  headlineTooltip?: string;
  headlineMeta?: string;
  heroTone?: DomHeroTone;
  deltaPct?: number | null;
  progressPct?: number;
  progressColor?: string;
  badge?: React.ReactNode;
  rightAction?: React.ReactNode;
  stats?: DomHeroStat[];
  layout?: 'split' | 'stacked';
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DomHeroStackCard: React.FC<DomHeroStackCardProps> = memo(({
  eyebrow,
  title,
  subtitle,
  headlineLabel,
  headlineValue,
  headlineTooltip,
  headlineMeta,
  heroTone = 'brand',
  deltaPct,
  progressPct,
  progressColor = '#FFFFFF',
  badge,
  rightAction,
  stats = [],
  layout = 'split',
  loading = false,
  className = '',
  style,
}) => {
  const safeStats = Array.isArray(stats) ? stats : [];
  const isStacked = layout === 'stacked' || safeStats.length === 0;

  return (
    <div
      className={cn(DOM_SURFACE_CARD, 'dom-hero-stack dom-tabular', className)}
      style={style}
    >
      <div
        className={cn(
          'dom-hero-stack__grid',
          isStacked && 'dom-hero-stack__grid--stacked'
        )}
      >
        {/* Multi-Accent Executive Hero Tile */}
        <div
          className={cn('dom-hero-stack__banner', `dom-hero-stack__banner--${heroTone}`)}
          style={safeStats.length === 0 ? { gridColumn: 'span 12 / span 12' } : undefined}
        >
          <div className="dom-hero-stack__top">
            <span className="dom-hero-stack__eyebrow">{eyebrow}</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {deltaPct !== undefined && deltaPct !== null && (
                <DomDeltaPill deltaPct={deltaPct} variant="hero" />
              )}
              {badge}
            </div>
          </div>

          <div>
            <h3 className="dom-hero-stack__title" title={title}>
              {title}
            </h3>
            {subtitle && (
              <p className="dom-hero-stack__subtitle" title={subtitle}>
                {subtitle}
              </p>
            )}
          </div>

          <div className="dom-hero-stack__headline-wrap">
            <div className="dom-hero-stack__headline-row">
              <div style={{ minWidth: 0 }}>
                <p className="dom-hero-stack__headline-label">{headlineLabel}</p>
                {loading ? (
                  <span
                    className="dom-skeleton dom-skeleton--hero"
                    style={{ width: 132, height: 28, marginTop: 6 }}
                  />
                ) : (
                  <div className="dom-hero-stack__headline-val-row">
                    <span className="dom-hero-stack__headline-value" title={headlineTooltip || String(headlineValue)}>
                      {headlineValue}
                    </span>
                    {headlineMeta && (
                      <span className="dom-hero-stack__headline-meta">
                        {headlineMeta}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {rightAction && <div style={{ flexShrink: 0 }}>{rightAction}</div>}
            </div>

            {typeof progressPct === 'number' && Number.isFinite(progressPct) && (
              <div className="dom-hero-stack__progress">
                <div
                  className="dom-hero-stack__progress-fill"
                  style={{
                    width: `${Math.min(100, Math.max(0, progressPct))}%`,
                    background:
                      progressColor === '#FFFFFF'
                        ? 'linear-gradient(90deg, #FFFFFF 0%, rgba(255,255,255,0.85) 100%)'
                        : progressColor,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Crisp Neutral KPI Sub-Tiles */}
        {safeStats.length > 0 && (
          <div className="dom-hero-stack__stats">
            {safeStats.map((st, idx) => (
              <div
                key={`${st.label}-${idx}`}
                onClick={st.onClick}
                className={cn(
                  'dom-hero-stack__stat-tile',
                  st.onClick && 'is-clickable'
                )}
              >
                <div className="dom-hero-stack__stat-head">
                  <div className="dom-hero-stack__stat-label">
                    <span
                      className="dom-hero-stack__stat-dot"
                      style={{
                        backgroundColor:
                          STAT_DOT_COLOR[st.accent || 'blue'] || '#2563EB',
                      }}
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {st.label}
                    </span>
                  </div>
                  {st.deltaPct !== undefined && st.deltaPct !== null && (
                    <DomDeltaPill deltaPct={st.deltaPct} variant="subtle" />
                  )}
                </div>

                {loading ? (
                  <span
                    className="dom-skeleton"
                    style={{ width: '65%', height: 22, marginTop: 8 }}
                  />
                ) : (
                  <div className="dom-hero-stack__stat-value" title={st.valueTooltip || String(st.value)}>
                    {st.value}
                  </div>
                )}

                {st.sub && (
                  <div className="dom-hero-stack__stat-sub" title={st.sub}>
                    {st.sub}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

// ============================================================================
// 3. DomKpiTile (Default Surface + Semantic Value Tones + Skeleton)
// ============================================================================
export interface DomKpiTileProps {
  label: string;
  value: string | number;
  valueTooltip?: string;
  icon?: React.ReactNode;
  accent?: DomAccentTone;
  variant?: 'default' | 'hero';
  valueTone?: 'default' | 'brand' | 'blue' | 'emerald' | 'teal' | 'violet' | 'indigo' | 'amber' | 'rose';
  growth?: number | null;
  comparisonLabel?: string;
  breakdown?: React.ReactNode;
  badge?: string;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const DomKpiTile: React.FC<DomKpiTileProps> = memo(({
  label,
  value,
  valueTooltip,
  icon,
  accent = 'blue',
  variant = 'default',
  valueTone,
  growth,
  comparisonLabel,
  breakdown,
  badge,
  loading = false,
  onClick,
  className = '',
  style,
}) => {
  const { t } = useLanguage();
  const isHero = variant === 'hero';
  const hasGrowth = growth !== undefined && growth !== null && Number.isFinite(growth);
  const resolvedValueTone =
    valueTone ?? (accent === 'brand' || accent === 'red' ? 'brand' : 'default');
  const toneCls = isHero ? 'dom-tone-hero-pill' : resolveToneClass(accent);

  if (loading) {
    return (
      <div
        aria-busy="true"
        className={cn(
          isHero ? 'dom-kpi-tile--hero' : DOM_SURFACE_CARD,
          'dom-kpi-tile dom-tabular',
          className
        )}
        style={style}
      >
        <div className="dom-kpi-tile__top">
          <span
            className={cn('dom-skeleton', isHero && 'dom-skeleton--hero')}
            style={{ width: '56%', height: 11 }}
          />
          <span
            className={cn('dom-skeleton', isHero && 'dom-skeleton--hero')}
            style={{ width: 32, height: 32, borderRadius: 8 }}
          />
        </div>
        <span
          className={cn('dom-skeleton', isHero && 'dom-skeleton--hero')}
          style={{ width: '48%', height: 26, marginTop: 10 }}
        />
        <span
          className={cn('dom-skeleton', isHero && 'dom-skeleton--hero')}
          style={{ width: '74%', height: 11, marginTop: 12 }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={style}
      className={cn(
        isHero ? 'dom-kpi-tile--hero' : DOM_SURFACE_CARD,
        'dom-kpi-tile dom-tabular',
        resolvedValueTone !== 'default' && !isHero && `dom-kpi-tile--${resolvedValueTone}-val`,
        onClick && 'dom-kpi-tile--clickable',
        className
      )}
    >
      <div className="dom-kpi-tile__top">
        <span className="dom-kpi-tile__label" title={label}>
          {label}
        </span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {badge && (
            <span className={cn('dom-kpi-tile__badge', toneCls)}>
              {badge}
            </span>
          )}
          {icon && (
            <div className={cn('dom-kpi-tile__icon', toneCls)}>
              {icon}
            </div>
          )}
        </div>
      </div>

      <div className="dom-kpi-tile__value-row">
        <span className="dom-kpi-tile__value" title={valueTooltip || String(value)}>
          {value}
        </span>
      </div>

      {breakdown && (
        <div className="dom-kpi-tile__breakdown">{breakdown}</div>
      )}

      {hasGrowth && (
        <div className="dom-kpi-tile__growth">
          <DomDeltaPill
            deltaPct={growth}
            variant={isHero ? 'hero' : 'subtle'}
          />
          <span className="dom-kpi-tile__comp">
            {comparisonLabel || t('so với kỳ trước')}
          </span>
        </div>
      )}
    </div>
  );
});

// ============================================================================
// 4. DomPanelCard (Surface Container + Optional Deferred content-visibility)
// ============================================================================
export interface DomPanelCardProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  iconAccent?: DomAccentTone;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
  deferred?: boolean;
  loading?: boolean;
  className?: string;
  bodyClassName?: string;
  style?: React.CSSProperties;
}

export const DomPanelCard: React.FC<DomPanelCardProps> = memo(({
  title,
  subtitle,
  icon,
  iconAccent = 'brand',
  rightSlot,
  children,
  noPadding = false,
  deferred = false,
  loading = false,
  className = '',
  bodyClassName = '',
  style,
}) => {
  const hasHeader = Boolean(title || subtitle || icon || rightSlot);
  const toneCls = resolveToneClass(iconAccent);

  return (
    <div
      style={style}
      className={cn(
        DOM_SURFACE_CARD,
        'dom-panel-card',
        deferred && 'dom-cv-card',
        className
      )}
    >
      {hasHeader && (
        <div className="dom-panel-card__header">
          <div className="dom-panel-card__title-wrap">
            {icon && (
              <div className={cn('dom-kpi-tile__icon', toneCls)}>
                {icon}
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              {title && (
                <h3 className="dom-panel-card__title" title={title}>
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="dom-panel-card__subtitle" title={subtitle}>
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {rightSlot && (
            <div className="dom-panel-card__right">{rightSlot}</div>
          )}
        </div>
      )}

      <div
        className={cn(
          'dom-panel-card__body',
          noPadding && 'dom-panel-card__body--flush',
          bodyClassName
        )}
      >
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="dom-skeleton" style={{ width: '42%', height: 14 }} />
            <span className="dom-skeleton" style={{ width: '100%', height: 150 }} />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
});

// ============================================================================
// 5. DomRankBarRow
// ============================================================================
export interface DomRankBarRowProps {
  rank?: number;
  icon?: React.ReactNode;
  label: string;
  sublabel?: string;
  value: string | number;
  secondaryValue?: string;
  badge?: string;
  badgeTone?: DomAccentTone;
  percent: number;
  barColor?: string;
  onClick?: () => void;
  className?: string;
}

export const DomRankBarRow: React.FC<DomRankBarRowProps> = memo(({
  rank,
  icon,
  label,
  sublabel,
  value,
  secondaryValue,
  badge,
  badgeTone = 'slate',
  percent,
  barColor = '#2563EB',
  onClick,
  className = '',
}) => {
  const safePct = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  const fillBg =
    barColor === '#BD1D2D' || barColor === '#C6333D'
      ? 'linear-gradient(90deg, #991B1B 0%, #BD1D2D 55%, #E11D48 100%)'
      : barColor === '#2563EB'
        ? 'linear-gradient(90deg, #1D4ED8 0%, #2563EB 55%, #0EA5E9 100%)'
        : barColor === '#10B981'
          ? 'linear-gradient(90deg, #059669 0%, #10B981 100%)'
          : barColor === '#6366F1'
            ? 'linear-gradient(90deg, #4F46E5 0%, #8B5CF6 100%)'
            : barColor;

  return (
    <div
      onClick={onClick}
      className={cn(
        'dom-rank-row dom-tabular',
        onClick && 'dom-rank-row--clickable',
        className
      )}
    >
      <div className="dom-rank-row__top">
        <div className="dom-rank-row__left">
          {rank !== undefined && (
            <span
              className={cn(
                'dom-rank-row__rank',
                rank === 1 && 'dom-rank-row__rank--top1'
              )}
            >
              {rank}
            </span>
          )}
          {icon && (
            <div style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
              {icon}
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="dom-rank-row__label" title={label}>
              {label}
            </div>
            {sublabel && (
              <div className="dom-rank-row__sublabel" title={sublabel}>
                {sublabel}
              </div>
            )}
          </div>
        </div>

        <div className="dom-rank-row__right">
          {badge && (
            <span className={cn('dom-kpi-tile__badge', resolveToneClass(badgeTone))}>
              {badge}
            </span>
          )}
          {secondaryValue && (
            <span className="dom-rank-row__secondary">{secondaryValue}</span>
          )}
          <span className="dom-rank-row__value">{value}</span>
        </div>
      </div>

      <div className="dom-rank-row__track">
        <div
          className="dom-rank-row__fill"
          style={{ width: `${safePct}%`, background: fillBg }}
        />
      </div>
    </div>
  );
});

// ============================================================================
// 6. DomChartTooltip (Recharts-Safe Array Payload Guard)
// ============================================================================
export interface DomChartTooltipEntry {
  name?: string;
  dataKey?: string | number;
  value?: number | string | null;
  color?: string;
  stroke?: string;
  fill?: string;
  payload?: Record<string, unknown>;
}

export interface DomChartTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<DomChartTooltipEntry>;
  label?: string | number;
  labelFormatter?: (label: string, payload?: ReadonlyArray<DomChartTooltipEntry>) => React.ReactNode;
  valueFormatter?: (value: number, name?: string, entry?: DomChartTooltipEntry) => string;
  className?: string;
}

export const DomChartTooltip: React.FC<DomChartTooltipProps> = memo(({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
  className = '',
}) => {
  const safePayload = Array.isArray(payload) ? payload : [];
  if (!active || safePayload.length === 0) return null;

  const labelStr = label !== undefined && label !== null ? String(label) : '';

  return (
    <div className={cn('dom-chart-tooltip dom-tabular', className)}>
      {labelStr && (
        <div className="dom-chart-tooltip__label">
          {labelFormatter ? labelFormatter(labelStr, safePayload) : labelStr}
        </div>
      )}
      <div className="dom-chart-tooltip__rows">
        {safePayload.map((entry, idx) => {
          const numVal = Number(entry?.value ?? 0);
          const safeVal = Number.isFinite(numVal) ? numVal : 0;
          const entryName = entry?.name !== undefined ? String(entry.name) : String(entry?.dataKey ?? `#${idx + 1}`);
          const dotColor = entry?.stroke || entry?.color || entry?.fill || '#BD1D2D';

          return (
            <div key={`${entryName}-${idx}`} className="dom-chart-tooltip__row">
              <span className="dom-chart-tooltip__name">
                <span
                  className="dom-chart-tooltip__dot"
                  style={{ backgroundColor: dotColor }}
                />
                <span>{entryName}</span>
              </span>
              <strong className="dom-chart-tooltip__val">
                {valueFormatter
                  ? valueFormatter(safeVal, entryName, entry)
                  : formatDomNumber(safeVal)}
              </strong>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ============================================================================
// 7. DomDashboardToolbar, DomToolbarButton, DomSegmentedSwitch, DomDateRangePill
// ============================================================================
export interface DomDashboardToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  actions?: React.ReactNode;
  sticky?: boolean;
  elevated?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DomDashboardToolbar: React.FC<DomDashboardToolbarProps> = memo(({
  left,
  right,
  actions,
  sticky = false,
  elevated = false,
  className = '',
  style,
}) => {
  return (
    <div
      style={style}
      className={cn(
        'dom-toolbar-bar',
        elevated && 'dom-toolbar-bar--elevated',
        sticky && 'dom-toolbar-bar--sticky',
        className
      )}
    >
      {left && <div className="dom-toolbar-left">{left}</div>}
      {(right || actions) && (
        <div className="dom-toolbar-right">
          {right}
          {actions && <div className="dom-toolbar-actions">{actions}</div>}
        </div>
      )}
    </div>
  );
});

export interface DomToolbarButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  icon?: React.ReactNode;
  loading?: boolean;
  active?: boolean;
  badge?: string | number;
}

export const DomToolbarButton: React.FC<DomToolbarButtonProps> = memo(({
  variant = 'secondary',
  icon,
  loading = false,
  active = false,
  badge,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        'dom-toolbar-btn dom-tabular',
        `dom-toolbar-btn--${variant}`,
        active && 'is-active',
        className
      )}
      {...rest}
    >
      {icon && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            flexShrink: 0,
            opacity: loading ? 0.65 : 1,
          }}
        >
          {icon}
        </span>
      )}
      {children}
      {badge !== undefined && badge !== null && badge !== '' && (
        <span className="dom-segmented__badge">{badge}</span>
      )}
    </button>
  );
});

export interface DomSegmentedOption<T extends string = string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  disabled?: boolean;
  title?: string;
}

export interface DomSegmentedSwitchProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<DomSegmentedOption<T>>;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

function DomSegmentedSwitchInner<T extends string = string>({
  value,
  onChange,
  options,
  size = 'md',
  ariaLabel,
  className = '',
  style,
}: DomSegmentedSwitchProps<T>) {
  const safeOptions = Array.isArray(options) ? options : [];
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      style={style}
      className={cn(
        'dom-segmented dom-tabular',
        size === 'sm' && 'dom-segmented--sm',
        className
      )}
    >
      {safeOptions.map((opt) => {
        const isActive = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={opt.disabled}
            title={opt.title || opt.label}
            onClick={() => {
              if (!opt.disabled && opt.value !== value) {
                onChange(opt.value);
              }
            }}
            className={cn('dom-segmented__btn', isActive && 'is-active')}
          >
            {opt.icon && (
              <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                {opt.icon}
              </span>
            )}
            <span>{opt.label}</span>
            {opt.badge !== undefined && opt.badge !== null && opt.badge !== '' && (
              <span className="dom-segmented__badge">{opt.badge}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const DomSegmentedSwitch = memo(
  DomSegmentedSwitchInner
) as typeof DomSegmentedSwitchInner;

export interface DomDateRangePillProps {
  fromDate: string;
  toDate: string;
  onFromChange: (isoDate: string) => void;
  onToChange: (isoDate: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  showIcon?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const DomDateRangePill: React.FC<DomDateRangePillProps> = memo(({
  fromDate,
  toDate,
  onFromChange,
  onToChange,
  min,
  max,
  disabled = false,
  fromPlaceholder = 'Từ ngày',
  toPlaceholder = 'Đến ngày',
  showIcon = true,
  className = '',
  style,
}) => {
  return (
    <div
      style={style}
      className={cn('dom-date-range-pill dom-tabular', className)}
    >
      {showIcon && (
        <span className="dom-date-range-pill__icon" aria-hidden="true">
          <Calendar size={14} />
        </span>
      )}
      <div className="dom-date-range-pill__field">
        <VietnameseDateInput
          value={fromDate}
          onChange={onFromChange}
          min={min}
          max={toDate || max}
          disabled={disabled}
          placeholder={fromPlaceholder}
          size="sm"
        />
      </div>
      <span className="dom-date-range-pill__sep" aria-hidden="true">
        →
      </span>
      <div className="dom-date-range-pill__field">
        <VietnameseDateInput
          value={toDate}
          onChange={onToChange}
          min={fromDate || min}
          max={max}
          disabled={disabled}
          placeholder={toPlaceholder}
          size="sm"
        />
      </div>
    </div>
  );
});

// ============================================================================
// 8. DomHeatmapGrid (Isolated hoveredCell Local State + React.memo = 60fps)
// ============================================================================
export interface DomHeatmapAxisItem {
  key: number | string;
  label: string;
  shortLabel?: string;
}

export interface DomHeatmapCell {
  row: number | string;
  col: number | string;
  value: number;
  tooltip?: string;
}

export interface DomHeatmapGridProps {
  cells: ReadonlyArray<DomHeatmapCell>;
  rows?: ReadonlyArray<DomHeatmapAxisItem>;
  cols?: ReadonlyArray<DomHeatmapAxisItem>;
  valueFormatter?: (value: number) => string;
  accentColorRgb?: string;
  emptyHint?: string;
  legendLessLabel?: string;
  legendMoreLabel?: string;
  showTopSlots?: boolean;
  onCellClick?: (cell: DomHeatmapCell) => void;
  className?: string;
}

const DEFAULT_HEATMAP_ROWS: DomHeatmapAxisItem[] = [
  { key: 1, label: 'Thứ 2', shortLabel: 'T2' },
  { key: 2, label: 'Thứ 3', shortLabel: 'T3' },
  { key: 3, label: 'Thứ 4', shortLabel: 'T4' },
  { key: 4, label: 'Thứ 5', shortLabel: 'T5' },
  { key: 5, label: 'Thứ 6', shortLabel: 'T6' },
  { key: 6, label: 'Thứ 7', shortLabel: 'T7' },
  { key: 0, label: 'CN', shortLabel: 'CN' },
];

const DEFAULT_HEATMAP_COLS: DomHeatmapAxisItem[] = Array.from({ length: 24 }, (_, h) => ({
  key: h,
  label: String(h),
  shortLabel: String(h).padStart(2, '0') + 'h',
}));

export const DomHeatmapGrid: React.FC<DomHeatmapGridProps> = memo(({
  cells,
  rows = DEFAULT_HEATMAP_ROWS,
  cols = DEFAULT_HEATMAP_COLS,
  valueFormatter,
  accentColorRgb = '37, 99, 235',
  emptyHint,
  legendLessLabel,
  legendMoreLabel,
  showTopSlots = true,
  onCellClick,
  className = '',
}) => {
  const { t } = useLanguage();
  // Isolated local hover state guarantees hovering 168 cells never re-renders parent dashboards
  const [hoveredCell, setHoveredCell] = useState<{
    rowLabel: string;
    colLabel: string;
    value: number;
    tooltip?: string;
  } | null>(null);

  const safeCells = Array.isArray(cells) ? cells : [];
  const safeRows = Array.isArray(rows) ? rows : DEFAULT_HEATMAP_ROWS;
  const safeCols = Array.isArray(cols) ? cols : DEFAULT_HEATMAP_COLS;

  const { cellMap, maxVal, topSlots } = useMemo(() => {
    const map = new Map<string, DomHeatmapCell>();
    let maxV = 0;
    const candidates: Array<{ rowLabel: string; colLabel: string; value: number }> = [];

    for (const c of safeCells) {
      const val = Number.isFinite(Number(c.value)) ? Math.max(0, Number(c.value)) : 0;
      const key = `${String(c.row)}_${String(c.col)}`;
      map.set(key, { ...c, value: val });
      if (val > maxV) maxV = val;
      if (val > 0) {
        const rItem = safeRows.find((r) => String(r.key) === String(c.row));
        const cItem = safeCols.find((col) => String(col.key) === String(c.col));
        candidates.push({
          rowLabel: rItem?.label || String(c.row),
          colLabel: cItem?.shortLabel || cItem?.label || String(c.col),
          value: val,
        });
      }
    }

    candidates.sort((a, b) => b.value - a.value);
    return {
      cellMap: map,
      maxVal: Math.max(maxV, 1),
      topSlots: candidates.slice(0, 3),
    };
  }, [safeCells, safeRows, safeCols]);

  const fmt = (val: number) =>
    valueFormatter ? valueFormatter(val) : formatDomNumber(val);

  const getCellBg = (val: number) => {
    if (val <= 0) return 'rgba(148, 163, 184, 0.16)';
    const intensity = Math.min(1, 0.18 + (val / maxVal) * 0.82);
    return `rgba(${accentColorRgb}, ${intensity.toFixed(2)})`;
  };

  return (
    <div className={cn('dom-heatmap dom-tabular', className)}>
      <div className="dom-heatmap__bar">
        {hoveredCell ? (
          <span className="dom-heatmap__tip">
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: '#60A5FA',
                flexShrink: 0,
              }}
            />
            <span>
              {hoveredCell.tooltip ||
                `${hoveredCell.rowLabel} · ${hoveredCell.colLabel} — ${fmt(hoveredCell.value)}`}
            </span>
          </span>
        ) : (
          <span className="dom-heatmap__hint">
            {emptyHint || t('Di chuột hoặc nhấn vào từng ô để xem chi tiết mật độ')}
          </span>
        )}
      </div>

      <div className="dom-heatmap__scroll">
        <div className="dom-heatmap__matrix">
          <div className="dom-heatmap__cols-head">
            {safeCols.map((col) => (
              <div key={String(col.key)} className="dom-heatmap__col-lbl">
                {col.label}
              </div>
            ))}
          </div>

          {safeRows.map((row) => (
            <div key={String(row.key)} className="dom-heatmap__row">
              <div className="dom-heatmap__row-lbl">{row.label}</div>
              {safeCols.map((col) => {
                const cell = cellMap.get(`${String(row.key)}_${String(col.key)}`);
                const val = cell?.value ?? 0;
                const colLbl = col.shortLabel || col.label;
                const tip =
                  cell?.tooltip || `${row.label} · ${colLbl}: ${fmt(val)}`;
                return (
                  <button
                    key={String(col.key)}
                    type="button"
                    aria-label={tip}
                    title={tip}
                    onMouseEnter={() =>
                      setHoveredCell({
                        rowLabel: row.label,
                        colLabel: colLbl,
                        value: val,
                        tooltip: cell?.tooltip,
                      })
                    }
                    onMouseLeave={() => setHoveredCell(null)}
                    onFocus={() =>
                      setHoveredCell({
                        rowLabel: row.label,
                        colLabel: colLbl,
                        value: val,
                        tooltip: cell?.tooltip,
                      })
                    }
                    onBlur={() => setHoveredCell(null)}
                    onClick={() => {
                      setHoveredCell({
                        rowLabel: row.label,
                        colLabel: colLbl,
                        value: val,
                        tooltip: cell?.tooltip,
                      });
                      onCellClick?.(
                        cell || { row: row.key, col: col.key, value: val }
                      );
                    }}
                    className="dom-heatmap__cell"
                    style={{ backgroundColor: getCellBg(val) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="dom-heatmap__footer">
        {showTopSlots && (
          <div className="dom-heatmap__slots">
            {topSlots.length > 0 ? (
              topSlots.map((slot, idx) => (
                <span
                  key={`${slot.rowLabel}-${slot.colLabel}-${idx}`}
                  className="dom-heatmap__slot"
                >
                  <span className="dom-heatmap__slot-rank">#{idx + 1}</span>
                  <span>
                    {slot.rowLabel} {slot.colLabel}
                  </span>
                  <span style={{ opacity: 0.65 }}>·</span>
                  <span>{fmt(slot.value)}</span>
                </span>
              ))
            ) : (
              <span style={{ color: '#94a3b8' }}>
                {t('Chưa đủ dữ liệu xác định khung giờ nổi bật')}
              </span>
            )}
          </div>
        )}

        <div className="dom-heatmap__legend">
          <span>{legendLessLabel || t('Ít')}</span>
          {[0, 0.28, 0.52, 0.76, 1].map((lv) => (
            <span
              key={lv}
              className="dom-heatmap__legend-swatch"
              style={{
                backgroundColor:
                  lv === 0
                    ? 'rgba(148, 163, 184, 0.16)'
                    : `rgba(${accentColorRgb}, ${lv})`,
              }}
            />
          ))}
          <span>{legendMoreLabel || t('Cao')}</span>
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// 9. DomFunnelBarList (Truthful Proportional Funnel + Drop-off %)
// ============================================================================
export interface DomFunnelStep {
  key: string;
  label: string;
  sub?: string;
  value: number;
  badge?: string;
  gradient?: string;
  onClick?: () => void;
}

export interface DomFunnelBarListProps {
  steps: ReadonlyArray<DomFunnelStep>;
  emptyText?: string;
  onStepClick?: (step: DomFunnelStep) => void;
  className?: string;
}

const DEFAULT_FUNNEL_GRADIENTS = [
  'linear-gradient(90deg, #1D4ED8 0%, #2563EB 100%)',
  'linear-gradient(90deg, #4F46E5 0%, #6366F1 100%)',
  'linear-gradient(90deg, #0D9488 0%, #14B8A6 100%)',
  'linear-gradient(90deg, #D97706 0%, #F59E0B 100%)',
  'linear-gradient(90deg, #059669 0%, #10B981 100%)',
];

export const DomFunnelBarList: React.FC<DomFunnelBarListProps> = memo(({
  steps,
  emptyText,
  onStepClick,
  className = '',
}) => {
  const { t } = useLanguage();
  const safeSteps = Array.isArray(steps) ? steps : [];

  const computedSteps = useMemo(() => {
    const maxVal = Math.max(
      ...safeSteps.map((s) => (Number.isFinite(Number(s.value)) ? Math.max(0, Number(s.value)) : 0)),
      1
    );
    return safeSteps.map((st, idx) => {
      const val = Number.isFinite(Number(st.value)) ? Math.max(0, Number(st.value)) : 0;
      const widthPct =
        val > 0 ? Math.max(3, Math.min(100, Math.round((val / maxVal) * 1000) / 10)) : 0;
      if (idx === 0) {
        return {
          ...st,
          value: val,
          widthPct,
          convLabel: null as string | null,
          dropOffLabel: null as string | null,
        };
      }
      const prevVal = Number.isFinite(Number(safeSteps[idx - 1]?.value))
        ? Math.max(0, Number(safeSteps[idx - 1].value))
        : 0;
      let convLabel: string | null = null;
      let dropOffLabel: string | null = null;

      if (prevVal > 0) {
        const stepConv = Math.round((val / prevVal) * 1000) / 10;
        convLabel = `${stepConv}%`;
        if (val < prevVal) {
          const dropPct = Math.round(((prevVal - val) / prevVal) * 1000) / 10;
          if (dropPct > 0) dropOffLabel = `-${dropPct}%`;
        }
      } else if (val > 0 && maxVal > 0) {
        convLabel = `${Math.min(100, Math.round((val / maxVal) * 1000) / 10)}%`;
      }

      return { ...st, value: val, widthPct, convLabel, dropOffLabel };
    });
  }, [safeSteps]);

  if (computedSteps.length === 0) {
    return (
      <DomEmptyChartState
        title={emptyText || t('Chưa có dữ liệu phễu chuyển đổi')}
        minHeight={180}
      />
    );
  }

  return (
    <div className={cn('dom-funnel dom-tabular', className)}>
      {computedSteps.map((step, idx) => {
        const clickable = Boolean(step.onClick || onStepClick);
        return (
          <div
            key={step.key}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onClick={() => {
              step.onClick?.();
              onStepClick?.(step);
            }}
            onKeyDown={
              clickable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      step.onClick?.();
                      onStepClick?.(step);
                    }
                  }
                : undefined
            }
            className={cn(
              'dom-funnel__step',
              clickable && 'dom-funnel__step--clickable'
            )}
          >
            <div className="dom-funnel__head">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="dom-funnel__title-row">
                  <span className="dom-funnel__label">{step.label}</span>
                  {step.convLabel && (
                    <span className="dom-kpi-tile__badge dom-tone-emerald">
                      {step.convLabel}
                    </span>
                  )}
                  {step.dropOffLabel && (
                    <span className="dom-kpi-tile__badge dom-tone-rose">
                      {t('Rơi')} {step.dropOffLabel}
                    </span>
                  )}
                </div>
                {step.sub && <div className="dom-funnel__sub">{step.sub}</div>}
              </div>
              <div className="dom-funnel__val-row">
                {step.badge && <span className="dom-funnel__badge">{step.badge}</span>}
                <strong className="dom-funnel__val">
                  {formatDomNumber(step.value)}
                </strong>
              </div>
            </div>

            <div className="dom-funnel__track">
              <div
                className="dom-funnel__fill"
                style={{
                  width: `${step.widthPct}%`,
                  background:
                    step.gradient ||
                    DEFAULT_FUNNEL_GRADIENTS[idx % DEFAULT_FUNNEL_GRADIENTS.length],
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ============================================================================
// 10. DomEmptyChartState
// ============================================================================
export interface DomEmptyChartStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  minHeight?: number | string;
  className?: string;
}

export const DomEmptyChartState: React.FC<DomEmptyChartStateProps> = memo(({
  icon,
  title,
  description,
  action,
  minHeight = 200,
  className = '',
}) => {
  const { t } = useLanguage();
  return (
    <div
      style={{ minHeight }}
      className={cn('dom-empty-state', className)}
    >
      <div className="dom-empty-state__icon">
        {icon || <BarChart3 size={20} strokeWidth={1.6} />}
      </div>
      <p className="dom-empty-state__title">
        {title || t('Chưa có dữ liệu trong khoảng thời gian lọc')}
      </p>
      {description && <p className="dom-empty-state__desc">{description}</p>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
});
