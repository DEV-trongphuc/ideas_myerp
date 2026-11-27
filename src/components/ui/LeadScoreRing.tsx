import React from 'react';
import { getLeadHeatTier } from '../../utils/leadScoring';

interface LeadScoreRingProps {
  score: number;   // 0-100
  size?: number;
  showLabel?: boolean;
  hotThreshold?: number;
  warmThreshold?: number;
}

export const LeadScoreRing: React.FC<LeadScoreRingProps> = ({
  score,
  size = 52,
  showLabel = true,
  hotThreshold,
  warmThreshold
}) => {
  const numericScore = Number(score);
  const safeScore = Number.isFinite(numericScore) ? Math.min(100, Math.max(0, Math.round(numericScore))) : 0;
  const safeSize = Number.isFinite(Number(size)) && Number(size) >= 20 ? Number(size) : 52;

  const r = (safeSize - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (safeScore / 100) * circ;

  const heat = getLeadHeatTier(safeScore, {
    hot: hotThreshold,
    warm: warmThreshold
  });
  const color = heat.color;
  const label = heat.label;

  return (
    <div
      style={{ position: 'relative', width: safeSize, height: safeSize, flexShrink: 0 }}
      title={`Lead Score: ${safeScore}/100 — ${label}`}
    >
      <svg width={safeSize} height={safeSize} style={{ transform: 'rotate(-90deg)', position: 'relative', zIndex: 1 }}>
        {/* Background ring */}
        <circle
          cx={safeSize / 2}
          cy={safeSize / 2}
          r={r}
          fill="none"
          stroke="var(--color-border-light)"
          strokeWidth={safeSize < 40 ? 3 : 5}
        />
        {/* Score ring */}
        <circle
          cx={safeSize / 2}
          cy={safeSize / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={safeSize < 40 ? 3 : 5}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.25, 0.1, 0.25, 1)' }}
        />
      </svg>
      {showLabel && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            zIndex: 2
          }}
        >
          <span
            style={{
              fontSize: safeSize < 44 ? '0.68rem' : '0.875rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              color
            }}
          >
            {safeScore}
          </span>
        </div>
      )}
    </div>
  );
};
