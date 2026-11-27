import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Phone, X, Check, PhoneOutgoing, PhoneIncoming, CheckCircle, PhoneOff, Voicemail, XCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../../store/uiStore';
import { CustomSelect } from './CustomSelect';
import { pushOverlay } from '../../utils/overlayStack';
import { getLocalDateStr } from '../../utils/dateUtils';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';
import { ensureArray } from '../../utils/safeArray';
import api from '../../api/axios';

interface CallLoggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: { id: number; full_name: string; phone?: string };
  onSave?: (log: CallLog) => void | boolean | Promise<void | boolean>;
  zIndex?: number;
}

export interface CallLog {
  contact_id: number;
  duration_minutes: number;
  outcome: 'reached' | 'no_answer' | 'voicemail' | 'busy' | 'wrong_number';
  direction: 'outbound' | 'inbound';
  note: string;
  next_action: string;
  next_date: string;
}

const OUTCOMES = [
  { value: 'reached', label: 'Đã kết nối', color: '#10b981', icon: <CheckCircle size={16} /> },
  { value: 'no_answer', label: 'Không kết nối được', color: '#f59e0b', icon: <PhoneOff size={16} /> },
  { value: 'voicemail', label: 'Hộp thư thoại', color: '#BD1D2D', icon: <Voicemail size={16} /> },
  { value: 'wrong_number', label: 'Sai số', color: '#64748b', icon: <XCircle size={16} /> }
];

const NEXT_ACTIONS = [
  'Gọi lại sau 2 giờ',
  'Gọi lại ngày mai',
  'Gửi email báo giá',
  'Lên lịch demo',
  'Gửi tài liệu sản phẩm',
  'Chờ khách phản hồi',
  'Đánh dấu quan tâm thấp'
];

export const CallLoggerModal: React.FC<CallLoggerModalProps> = ({ isOpen, onClose, contact, onSave, zIndex }) => {
  const addToast = useUIStore((s) => s.addToast);
  const defaultDurationMin = Number(useTypedSubSetting('crm.calls_and_meetings_policy', 'default_duration_min', 5)) || 5;
  const maxDurationMin = Number(useTypedSubSetting('crm.calls_and_meetings_policy', 'max_duration_min', 120)) || 120;
  const rawPresets = ensureArray<number>(useTypedSubSetting('crm.calls_and_meetings_policy', 'duration_presets', [3, 5, 10, 20]));
  const durationPresets = rawPresets.length > 0 ? rawPresets : [3, 5, 10, 20];
  const rawQuickActions = ensureArray<string>(useTypedSubSetting('crm.calls_and_meetings_policy', 'quick_next_actions', NEXT_ACTIONS));
  const quickActions = rawQuickActions.length > 0 ? rawQuickActions : NEXT_ACTIONS;

  const [outcome, setOutcome] = useState<CallLog['outcome']>('reached');
  const [direction, setDirection] = useState<'outbound' | 'inbound'>('outbound');
  const [duration, setDuration] = useState(defaultDurationMin);
  const [note, setNote] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);
  const inFlightRef = useRef(false);

  const effectiveZIndex = Math.min(Math.max(zIndex || 2147483646, 2147483640), 2147483646);

  useEffect(() => {
    if (isOpen) {
      setOutcome('reached');
      setDirection('outbound');
      setDuration(defaultDurationMin);
      setNote('');
      setNextAction('');
      setNextDate('');
      setSaving(false);
      inFlightRef.current = false;
    }
  }, [isOpen, contact?.id, defaultDurationMin]);

  useEffect(() => {
    if (!isOpen) return;
    return pushOverlay('call-logger-modal', () => {
      if (!inFlightRef.current) onClose();
    }, effectiveZIndex);
  }, [isOpen, onClose, effectiveZIndex]);

  const handleSave = async () => {
    if (inFlightRef.current || saving) return;
    inFlightRef.current = true;
    setSaving(true);

    const safeDuration = Math.min(480, Math.max(1, Number(duration) || 5));
    const trimmedNote = note.trim();
    const log: CallLog = {
      contact_id: Number(contact?.id || 0),
      duration_minutes: safeDuration,
      outcome,
      direction,
      note: trimmedNote,
      next_action: nextAction,
      next_date: nextDate
    };

    try {
      if (onSave) {
        const result = await onSave(log);
        if (result === false) {
          return;
        }
      } else if (log.contact_id > 0) {
        const directionLabel = direction === 'outbound' ? 'đi' : 'đến';
        const outcomeLabel =
          outcome === 'reached'
            ? 'Đã kết nối'
            : outcome === 'no_answer' || outcome === 'busy'
              ? 'Không kết nối được'
              : outcome === 'voicemail'
                ? 'Hộp thư thoại'
                : 'Sai số';
        const nowStr = `${getLocalDateStr()} ${new Date().toTimeString().slice(0, 8)}`;
        const durationPrefix = outcome === 'reached' ? `[Thời lượng: ${safeDuration} phút]` : '';
        const combinedBody = [durationPrefix, trimmedNote].filter(Boolean).join('\n') || null;

        await api.post('/activities', {
          type: 'call',
          subject: `Cuộc gọi ${directionLabel}: ${outcomeLabel}`,
          body: combinedBody,
          status: 'done',
          related_type: 'contact',
          related_id: log.contact_id,
          contact_id: log.contact_id,
          due_date: nowStr,
          done_at: nowStr,
          tags: outcome === 'no_answer' || outcome === 'busy' ? 'no_connect' : null
        });

        if (nextAction && nextDate) {
          await api.post('/activities', {
            type: 'task',
            subject: nextAction,
            body: trimmedNote ? `Theo dõi sau cuộc gọi: ${trimmedNote}` : 'Nhiệm vụ theo dõi sau cuộc gọi',
            status: 'planned',
            priority: 'medium',
            related_type: 'contact',
            related_id: log.contact_id,
            contact_id: log.contact_id,
            due_date: `${nextDate} 09:00:00`
          });
        }
        addToast(`Đã ghi nhận cuộc gọi với ${contact?.full_name || 'khách hàng'}`, 'success');
      }
      onClose();
    } catch (err: any) {
      addToast(err?.response?.data?.message || err?.message || 'Lỗi khi lưu nhật ký cuộc gọi', 'error');
    } finally {
      inFlightRef.current = false;
      setSaving(false);
    }
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="overlay-backdrop modal-above-drawer"
          style={{
            zIndex: effectiveZIndex,
            ...({ '--modal-z': effectiveZIndex } as React.CSSProperties),
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          onClick={() => { if (!inFlightRef.current) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 520,
              maxWidth: 'calc(100vw - 2rem)',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              background: 'var(--color-surface, #FFFFFF)',
              borderRadius: '16px',
              boxShadow: '0 20px 48px rgba(15, 23, 42, 0.25)',
              border: '1px solid var(--color-border, #E2E8F0)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border, #E2E8F0)', display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Phone size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ fontWeight: 800, fontSize: '1rem', margin: 0, color: 'var(--color-text, #0F172A)' }}>Ghi nhận cuộc gọi</h3>
                <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #64748B)', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {contact?.full_name || 'Khách hàng'} {contact?.phone && `· ${contact.phone}`}
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                disabled={saving}
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', padding: 4, borderRadius: 6, opacity: saving ? 0.5 : 1 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
              {/* Direction */}
              <div>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-muted)' }}>Loại cuộc gọi</p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {[
                    { v: 'outbound', l: 'Gọi đi', i: <PhoneOutgoing size={15} /> },
                    { v: 'inbound', l: 'Gọi đến', i: <PhoneIncoming size={15} /> }
                  ].map(({ v, l, i }) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setDirection(v as any)}
                      style={{
                        flex: 1,
                        padding: '0.625rem',
                        borderRadius: '10px',
                        border: `1px solid ${direction === v ? '#BD1D2D' : 'var(--color-border, #E2E8F0)'}`,
                        background: direction === v ? 'rgba(189, 29, 45, 0.06)' : 'var(--color-surface)',
                        fontWeight: 600,
                        fontSize: '0.875rem',
                        cursor: 'pointer',
                        color: direction === v ? '#BD1D2D' : 'var(--color-text)',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem'
                      }}
                    >
                      {i} {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Outcome */}
              <div>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--color-text-muted)' }}>Kết quả cuộc gọi</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setOutcome(o.value as any)}
                      style={{
                        padding: '0.625rem 0.75rem',
                        borderRadius: '10px',
                        border: `1px solid ${outcome === o.value ? o.color : 'var(--color-border, #E2E8F0)'}`,
                        background: outcome === o.value ? `${o.color}0d` : 'var(--color-surface)',
                        fontWeight: outcome === o.value ? 700 : 500,
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                        color: outcome === o.value ? o.color : 'var(--color-text)',
                        transition: 'all 0.15s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        justifyContent: 'center'
                      }}
                    >
                      <span style={{ color: outcome === o.value ? o.color : 'var(--color-text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>{o.icon}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>{o.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-muted)', margin: 0 }}>
                    Thời lượng <span style={{ color: '#BD1D2D', fontWeight: 700 }}>{duration} phút</span>
                  </p>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {durationPresets.map((m) => (
                      <button
                        key={m}
                        onClick={() => setDuration(m)}
                        type="button"
                        style={{
                          padding: '2px 8px',
                          fontSize: '0.7rem',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontWeight: 600,
                          transition: 'all 0.15s',
                          border: duration === m ? '1px solid #BD1D2D' : '1px solid var(--color-border, #E2E8F0)',
                          background: duration === m ? 'rgba(189, 29, 45, 0.08)' : 'var(--color-surface)',
                          color: duration === m ? '#BD1D2D' : 'var(--color-text-muted)'
                        }}
                      >
                        {m}p
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={maxDurationMin}
                  value={Math.min(maxDurationMin, duration)}
                  onChange={(e) => setDuration(+e.target.value)}
                  style={{ width: '100%', accentColor: '#BD1D2D' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                  <span>1 phút</span>
                  <span>{Math.round(maxDurationMin * 0.25)} phút</span>
                  <span>{Math.round(maxDurationMin * 0.5)} phút</span>
                  <span>{maxDurationMin} phút</span>
                </div>
              </div>

              {/* Note */}
              <div className="form-group">
                <label className="form-label">Ghi chú cuộc gọi</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Tóm tắt nội dung trao đổi..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  style={{ resize: 'vertical', minHeight: 72 }}
                />
              </div>

              {/* Next action */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Hành động tiếp theo</label>
                  <CustomSelect
                    options={quickActions.map((a) => ({ value: a, label: a }))}
                    value={nextAction}
                    onChange={(v) => setNextAction(String(v))}
                    placeholder="-- Chọn --"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Ngày nhắc nhở</label>
                  <input
                    className="form-input"
                    type="date"
                    value={nextDate}
                    onChange={(e) => setNextDate(e.target.value)}
                    min={getLocalDateStr()}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border, #E2E8F0)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', background: 'var(--color-bg, #F8FAFC)' }}>
              <button type="button" className="btn outline" onClick={onClose} disabled={saving}>
                Hủy
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={handleSave}
                disabled={saving}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                {saving ? (
                  <>
                    <RefreshCw size={14} className="spin" />
                    <span>Đang lưu...</span>
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    <span>Lưu ghi nhận</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
