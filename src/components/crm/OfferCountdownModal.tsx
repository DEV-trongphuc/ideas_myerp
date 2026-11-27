import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { CustomModal } from '../ui/CustomModal';

export interface OfferCountdownModalProps {
  lead: any | null;
  isOpen: boolean;
  onClose: () => void;
  onAccept: (leadId: number) => Promise<void> | void;
  defaultTimeoutMinutes?: number;
  t: (key: string) => string;
}

const parseServerDateSafe = (dateStr?: string | null): Date => {
  if (!dateStr) return new Date(NaN);
  const trimmed = String(dateStr).trim();
  if (!trimmed) return new Date(NaN);
  if (trimmed.includes('T') || trimmed.includes('+') || trimmed.endsWith('Z')) {
    return new Date(trimmed);
  }
  return new Date(`${trimmed.replace(' ', 'T')}+07:00`);
};

export const OfferCountdownModal: React.FC<OfferCountdownModalProps> = ({
  lead,
  isOpen,
  onClose,
  onAccept,
  defaultTimeoutMinutes = 2,
  t
}) => {
  const leadId = Number(lead?.lead_id || lead?.id || 0);
  const leadRecallMins = Number(lead?.lead_recall_minutes) || defaultTimeoutMinutes || 0;
  const limitMs = leadRecallMins * 60 * 1000;

  const assignedAtMs = useMemo(() => {
    const parsed = parseServerDateSafe(lead?.last_interaction_date || lead?.received_at);
    return parsed.getTime();
  }, [lead?.last_interaction_date, lead?.received_at]);

  const computeRemaining = () => {
    if (!lead || !Number.isFinite(assignedAtMs) || limitMs <= 0) return 0;
    return limitMs - (Date.now() - assignedAtMs);
  };

  const [remainingMs, setRemainingMs] = useState<number>(computeRemaining);
  const [isAccepting, setIsAccepting] = useState(false);
  const acceptInFlightRef = useRef(false);

  useEffect(() => {
    setRemainingMs(computeRemaining());
    setIsAccepting(false);
    acceptInFlightRef.current = false;

    if (!isOpen || !lead || limitMs <= 0 || !Number.isFinite(assignedAtMs)) return;

    const timer = window.setInterval(() => {
      const next = limitMs - (Date.now() - assignedAtMs);
      setRemainingMs(next);
      if (next <= 0) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isOpen, leadId, assignedAtMs, limitMs]);

  if (!isOpen || !lead || leadRecallMins <= 0 || remainingMs <= 0) {
    return null;
  }

  const totalSecs = Math.max(0, Math.floor(remainingMs / 1000));
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(1, Math.max(0, 1 - remainingMs / Math.max(1, limitMs)));
  const strokeDashoffset = circumference * ratio;

  const assignedTimeLabel = (() => {
    const d = parseServerDateSafe(lead.last_interaction_date || lead.received_at);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  })();

  const handleAcceptClick = async () => {
    if (!leadId || acceptInFlightRef.current || isAccepting) return;
    acceptInFlightRef.current = true;
    setIsAccepting(true);
    try {
      await onAccept(leadId);
    } finally {
      acceptInFlightRef.current = false;
      setIsAccepting(false);
    }
  };

  return (
    <CustomModal
      isOpen={true}
      onClose={onClose}
      showCloseIcon={true}
      title={t('CÓ LEAD MỚI ĐƯỢC PHÂN BỔ!')}
      width="460px"
      modalClassName="offer-countdown-modal"
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1rem',
          padding: '0.25rem',
          position: 'relative'
        }}
      >
        {/* Horizontal Split Body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1.75rem',
            width: '100%',
            flexWrap: 'wrap'
          }}
        >
          {/* Left Column: Circular Timer */}
          <div
            style={{
              position: 'relative',
              width: '130px',
              height: '130px',
              flexShrink: 0,
              margin: '0 auto'
            }}
          >
            <svg
              width="130"
              height="130"
              style={{
                transform: 'rotate(-90deg)',
                filter: 'drop-shadow(0px 4px 8px rgba(189, 29, 45, 0.15))'
              }}
            >
              <circle
                cx="65"
                cy="65"
                r={radius}
                stroke="var(--color-border-light)"
                strokeWidth="5"
                fill="transparent"
              />
              <circle
                cx="65"
                cy="65"
                r={radius}
                stroke="#BD1D2D"
                strokeWidth="7"
                fill="transparent"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.1s linear' }}
              />
            </svg>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column'
              }}
            >
              <span
                style={{
                  fontSize: '1.7rem',
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  fontVariantNumeric: 'tabular-nums',
                  color: '#BD1D2D',
                  lineHeight: 1
                }}
              >
                {mins}:{String(secs).padStart(2, '0')}
              </span>
              <span
                style={{
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  color: 'var(--color-text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginTop: '4px'
                }}
              >
                {t('Còn lại')}
              </span>
            </div>
          </div>

          {/* Right Column: Lead Details */}
          <div
            style={{
              flex: 1,
              minWidth: '200px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              textAlign: 'left'
            }}
          >
            <h4
              style={{
                fontSize: '1.3rem',
                fontWeight: 800,
                color: 'var(--color-text)',
                margin: 0,
                lineHeight: 1.2
              }}
            >
              {t('Khách hàng mới')}
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  padding: '3px 8px',
                  borderRadius: '6px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  background: 'rgba(100, 116, 139, 0.08)',
                  color: '#475569',
                  border: '1px solid rgba(100, 116, 139, 0.15)'
                }}
              >
                {t('Nguồn:')} {lead.source || 'Facebook CAPI'}
              </span>
            </div>

            {/* Bottom metadata row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'auto',
                flexWrap: 'wrap',
                gap: '8px',
                borderTop: '1px dashed var(--color-border-light)',
                paddingTop: '8px'
              }}
            >
              <p
                style={{
                  fontSize: '0.75rem',
                  color: '#BD1D2D',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  margin: 0
                }}
              >
                <AlertTriangle size={12} style={{ animation: 'pulse 1s infinite' }} />
                {t('Sẽ bị thu hồi khi hết giờ!')}
              </p>

              {assignedTimeLabel && (
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Clock size={12} /> {t('Được chia lúc:')} {assignedTimeLabel}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Brand Action Button */}
        <button
          type="button"
          disabled={isAccepting}
          onClick={handleAcceptClick}
          className="btn danger"
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '8px',
            fontSize: '1rem',
            fontWeight: 800,
            background: '#BD1D2D',
            color: '#fff',
            border: 'none',
            boxShadow: '0 4px 15px rgba(189, 29, 45, 0.3)',
            cursor: isAccepting ? 'not-allowed' : 'pointer',
            opacity: isAccepting ? 0.7 : 1,
            transition: 'all 0.2s ease',
            marginTop: '0.5rem'
          }}
        >
          {isAccepting ? t('Đang tiếp nhận...') : t('TIẾP NHẬN LEAD NGAY')}
        </button>
      </div>
    </CustomModal>
  );
};
