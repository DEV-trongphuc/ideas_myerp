import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, RotateCcw, X, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface AutoSaveDraftOptions<T> {
  key: string;
  data: T;
  enabled?: boolean;
  debounceMs?: number;
  isDataEmpty?: (data: T) => boolean;
}

export function useAutoSaveDraft<T>({
  key,
  data,
  enabled = true,
  debounceMs = 500,
  isDataEmpty
}: AutoSaveDraftOptions<T>) {
  const [savedDraft, setSavedDraft] = useState<{ data: T; timestamp: number } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const isInitialMount = useRef(true);
  const isDataEmptyRef = useRef(isDataEmpty);
  isDataEmptyRef.current = isDataEmpty;

  const storageKey = `myerp_autosave_${key}`;

  // Check for existing draft on initial load or key change
  useEffect(() => {
    isInitialMount.current = true;
    setIsDismissed(false);
    setSavedDraft(null);
    if (!enabled) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.data && parsed.timestamp) {
          const isEmpty = isDataEmptyRef.current ? isDataEmptyRef.current(parsed.data) : false;
          if (!isEmpty) {
            setSavedDraft(parsed);
          } else {
            localStorage.removeItem(storageKey);
          }
        }
      }
    } catch (e) {
      console.error('Failed to read draft from localStorage:', e);
    }
  }, [storageKey, enabled]);

  // Debounced auto-save
  useEffect(() => {
    if (!enabled || isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(() => {
      try {
        const isEmpty = isDataEmptyRef.current ? isDataEmptyRef.current(data) : false;
        if (isEmpty) {
          localStorage.removeItem(storageKey);
          setSavedDraft(null);
        } else {
          const payload = {
            data,
            timestamp: Date.now()
          };
          localStorage.setItem(storageKey, JSON.stringify(payload));
        }
      } catch (e) {
        console.error('Failed to save draft to localStorage:', e);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [data, storageKey, enabled, debounceMs]);

  const clearDraft = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
      setSavedDraft(null);
      setIsDismissed(true);
    } catch (e) {
      console.error('Failed to clear draft:', e);
    }
  }, [storageKey]);

  const formatDraftTime = (ts?: number) => {
    if (!ts) return '';
    const date = new Date(ts);
    if (!Number.isFinite(date.getTime())) return '';
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    return isToday ? `${timeStr} hôm nay` : `${timeStr} ngày ${date.toLocaleDateString('vi-VN')}`;
  };

  const DraftRecoveryBanner: React.FC<{ onRestore: (restoredData: T) => void; className?: string }> = ({
    onRestore,
    className
  }) => {
    if (!savedDraft || isDismissed) return null;

    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          background: 'rgba(189, 29, 45, 0.05)',
          border: '1px solid rgba(189, 29, 45, 0.2)',
          borderRadius: '12px',
          padding: '8px 12px',
          margin: '0 0 12px 0',
          fontSize: '0.8rem',
          color: '#0F172A',
          animation: 'undoToastIn 0.2s ease forwards'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <Sparkles size={16} style={{ color: '#BD1D2D', flexShrink: 0 }} />
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span style={{ fontWeight: 700, color: '#0F172A' }}>Phát hiện bản nháp tự lưu</span>
            {formatDraftTime(savedDraft.timestamp) && (
              <span style={{ color: '#64748B', marginLeft: '4px' }}>
                ({formatDraftTime(savedDraft.timestamp)})
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => {
              onRestore(savedDraft.data);
              setIsDismissed(true);
              toast.success('Đã khôi phục bản nháp!');
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              borderRadius: '7px',
              background: '#BD1D2D',
              color: '#ffffff',
              border: 'none',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={12} />
            <span>Khôi phục</span>
          </button>

          <button
            type="button"
            onClick={() => {
              clearDraft();
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              padding: '4px 8px',
              borderRadius: '7px',
              background: '#ffffff',
              color: '#64748B',
              border: '1px solid #E2E8F0',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
            title="Bỏ qua bản nháp này"
          >
            <X size={12} />
            <span>Bỏ qua</span>
          </button>
        </div>
      </div>
    );
  };

  return {
    savedDraft: isDismissed ? null : savedDraft,
    hasDraft: Boolean(savedDraft && !isDismissed),
    clearDraft,
    DraftRecoveryBanner
  };
}
