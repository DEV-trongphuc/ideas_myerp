// src/components/chat/ProactiveInsightCard.tsx
// Proactive Early Warning & Operational Opportunity Insight Card for SI IDEAS Copilot
// Absolute Optimization: Dismissible state, Smooth micro-interactions, High-contrast tags

import React, { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, TrendingUp, Info, ShieldAlert, ArrowRight, X } from 'lucide-react';
import type { ProactiveInsightData } from './chatTagParsers';
import { getCurrentSessionUserId } from '../../utils/streamTicket';

interface ProactiveInsightCardProps {
  insight: ProactiveInsightData;
  messageId?: number | string;
  onAction?: (actionPrompt: string) => void;
}

const DISMISSED_INSIGHTS_KEY_PREFIX = 'myerp_dismissed_insights_';

function hashInsightKey(insight: ProactiveInsightData, messageId?: number | string): string {
  const src = `${messageId ?? ''}|${insight?.type || ''}|${insight?.title || ''}|${insight?.description || ''}`;
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function getDismissedInsightsSet(): Set<string> {
  try {
    const uid = getCurrentSessionUserId();
    const raw = sessionStorage.getItem(`${DISMISSED_INSIGHTS_KEY_PREFIX}${uid}`);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

export const ProactiveInsightCard: React.FC<ProactiveInsightCardProps> = ({ insight, messageId, onAction }) => {
  const insightHash = useMemo(() => hashInsightKey(insight, messageId), [insight, messageId]);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => getDismissedInsightsSet().has(insightHash));

  useEffect(() => {
    setIsDismissed(getDismissedInsightsSet().has(insightHash));
  }, [insightHash]);

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      const uid = getCurrentSessionUserId();
      const set = getDismissedInsightsSet();
      set.add(insightHash);
      const arr = Array.from(set).slice(-100);
      sessionStorage.setItem(`${DISMISSED_INSIGHTS_KEY_PREFIX}${uid}`, JSON.stringify(arr));
    } catch {}
  };

  if (!insight || (!insight.title && !insight.description) || isDismissed) return null;

  const type = insight.type || 'warning';

  const typeConfig = {
    warning: {
      borderColor: '#E2E8F0',
      bgGradient: '#FFFFFF',
      badgeBg: 'rgba(217, 119, 6, 0.1)',
      badgeText: '#B45309',
      iconColor: '#D97706',
      badgeLabel: 'CẢNH BÁO VẬN HÀNH',
      Icon: AlertTriangle,
    },
    urgent: {
      borderColor: '#E2E8F0',
      bgGradient: '#FFFFFF',
      badgeBg: 'rgba(189, 29, 45, 0.08)',
      badgeText: '#BD1D2D',
      iconColor: '#BD1D2D',
      badgeLabel: 'KHẨN CẤP / QUÁ HẠN',
      Icon: ShieldAlert,
    },
    opportunity: {
      borderColor: '#E2E8F0',
      bgGradient: '#FFFFFF',
      badgeBg: 'rgba(189, 29, 45, 0.08)',
      badgeText: '#BD1D2D',
      iconColor: '#BD1D2D',
      badgeLabel: 'CƠ HỘI CHĂM SÓC',
      Icon: TrendingUp,
    },
    info: {
      borderColor: '#E2E8F0',
      bgGradient: '#FFFFFF',
      badgeBg: '#F1F5F9',
      badgeText: '#334155',
      iconColor: '#334155',
      badgeLabel: 'THÔNG TIN CHỦ ĐỘNG',
      Icon: Info,
    },
  }[type] || {
    borderColor: '#E2E8F0',
    bgGradient: '#FFFFFF',
    badgeBg: 'rgba(217, 119, 6, 0.1)',
    badgeText: '#B45309',
    iconColor: '#D97706',
    badgeLabel: 'CẢNH BÁO VẬN HÀNH',
    Icon: AlertTriangle,
  };

  const { Icon } = typeConfig;

  return (
    <div
      style={{
        marginTop: '8px',
        marginBottom: '8px',
        borderRadius: '12px',
        border: `1px solid ${typeConfig.borderColor}`,
        background: typeConfig.bgGradient,
        padding: '12px',
        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
        position: 'relative',
        transition: 'border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      className="dark:!bg-slate-900/90 dark:!border-slate-700"
    >
      {/* Dismiss Button */}
      <button
        onClick={handleDismiss}
        title="Đóng thông báo này"
        type="button"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'transparent',
          border: 'none',
          color: '#94A3B8',
          cursor: 'pointer',
          padding: '4px',
          borderRadius: '4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        className="hover:!text-slate-700 dark:hover:!text-slate-200"
      >
        <X size={14} strokeWidth={1.75} />
      </button>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', paddingRight: '16px' }}>
        <div
          style={{
            marginTop: '2px',
            color: typeConfig.iconColor,
            flexShrink: 0,
          }}
        >
          <Icon size={18} strokeWidth={1.75} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 600,
                letterSpacing: '0.04em',
                padding: '2px 6px',
                borderRadius: '4px',
                background: typeConfig.badgeBg,
                color: typeConfig.badgeText,
                border: 'none',
              }}
              className="dark:!bg-slate-800 dark:!text-slate-200"
            >
              {typeConfig.badgeLabel}
            </span>
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: '#0F172A',
              }}
              className="dark:!text-slate-100"
            >
              {insight.title}
            </span>
          </div>

          <p
            style={{
              fontSize: '12px',
              color: '#475569',
              margin: '4px 0 0 0',
              lineHeight: '1.45',
            }}
            className="dark:!text-slate-300"
          >
            {insight.description}
          </p>

          {insight.actionPrompt && onAction && (
            <div style={{ marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => onAction(insight.actionPrompt!)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 12px',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  color: typeConfig.badgeText,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                className="hover:!shadow hover:!brightness-95 dark:!bg-slate-800 dark:!text-slate-200"
              >
                <span>{insight.actionLabel || 'Xử lý ngay'}</span>
                <ArrowRight size={11} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
