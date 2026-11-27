import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Target, Search, RefreshCw, CheckCircle2, Sparkles, Copy, TrendingUp, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { Avatar } from '../ui/Avatar';
import { pushOverlay } from '../../utils/overlayStack';
import { useViewportDevice } from '../../hooks/useViewportDevice';

export interface SalesTargetItem {
  user_id: number;
  full_name: string;
  email?: string;
  avatar_url?: string | null;
  role?: string;
  job_title?: string;
  team_id?: number | null;
  team_name?: string;
  target_amount: number;
  default_kpi_target: number;
  has_month_override?: boolean;
  notes?: string | null;
  so_count: number;
  so_value: number;
  cash_in_count?: number;
  cash_in_approved: number;
  cash_in_pending: number;
  achievement_pct: number;
  so_achievement_pct: number;
  remaining_target: number;
  surplus_amount: number;
}

export interface SalesTargetsPayload {
  month_year: string;
  from_date?: string;
  to_date?: string;
  can_manage_targets: boolean;
  can_view_all?: boolean;
  summary: {
    tvv_count: number;
    achieved_tvv_count: number;
    total_so_count: number;
    total_target: number;
    total_so_value: number;
    total_cash_in_approved: number;
    total_cash_in_pending: number;
    remaining_target: number;
    achievement_pct: number;
    so_achievement_pct: number;
  };
  items: SalesTargetItem[];
}

interface SalesTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMonth?: string;
  focusUserId?: number | null;
  onSaved?: (payload?: SalesTargetsPayload) => void;
}

const TARGET_PRESETS = [
  { label: '50 Tr', value: 50_000_000 },
  { label: '100 Tr', value: 100_000_000 },
  { label: '150 Tr', value: 150_000_000 },
  { label: '200 Tr', value: 200_000_000 },
  { label: '300 Tr', value: 300_000_000 },
  { label: '500 Tr', value: 500_000_000 },
];

const formatDigits = (val: number | string | null | undefined): string => {
  if (val === null || val === undefined || val === '') return '';
  const num = typeof val === 'number' ? Math.round(val) : Number(String(val).replace(/[^0-9]/g, ''));
  if (!Number.isFinite(num) || num < 0) return '';
  if (num === 0) return '0';
  return num.toLocaleString('vi-VN');
};

const parseDigits = (raw: string): number => {
  const cleaned = String(raw || '').replace(/[^0-9]/g, '');
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const getTargetProgressTone = (pct: number): string => {
  if (pct >= 80) return '#10b981';
  if (pct >= 50) return '#f59e0b';
  return '#ef4444';
};

export const SalesTargetModal: React.FC<SalesTargetModalProps> = ({
  isOpen,
  onClose,
  initialMonth,
  focusUserId = null,
  onSaved,
}) => {
  const { isMobile } = useViewportDevice();

  const currentYm = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const [monthYear, setMonthYear] = useState<string>(() =>
    initialMonth && /^\d{4}-\d{2}$/.test(initialMonth) ? initialMonth : currentYm
  );
  const [items, setItems] = useState<SalesTargetItem[]>([]);
  const [draftTargets, setDraftTargets] = useState<Record<number, string>>({});
  const [draftNotes, setDraftNotes] = useState<Record<number, string>>({});
  const [bulkAmountInput, setBulkAmountInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [syncDefault, setSyncDefault] = useState<boolean>(true);
  const [canManageTargets, setCanManageTargets] = useState<boolean>(false);
  const [adjustmentReason, setAdjustmentReason] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copyingPrev, setCopyingPrev] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  const inFlightSaveRef = useRef<boolean>(false);
  const inFlightCopyRef = useRef<boolean>(false);
  const abortRef = useRef<AbortController | null>(null);
  const copyAbortRef = useRef<AbortController | null>(null);
  const currentMonthRef = useRef<string>(monthYear);
  const focusInputRef = useRef<HTMLInputElement | null>(null);
  const reasonInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    currentMonthRef.current = monthYear;
    if (copyAbortRef.current) {
      copyAbortRef.current.abort();
      copyAbortRef.current = null;
      inFlightCopyRef.current = false;
      setCopyingPrev(false);
    }
  }, [monthYear]);

  useEffect(() => {
    if (isOpen && initialMonth && /^\d{4}-\d{2}$/.test(initialMonth)) {
      setMonthYear(initialMonth);
    }
    if (isOpen) {
      setAdjustmentReason('');
    }
  }, [isOpen, initialMonth]);

  useEffect(() => {
    if (!isOpen) return;
    const unregister = pushOverlay('sales-target-modal', () => {
      if (!inFlightSaveRef.current) onClose();
    }, 2147483646);
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      unregister();
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow || 'unset';
      }
    };
  }, [isOpen, onClose]);

  const fetchTargetsForMonth = useCallback(async (ym: string) => {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    try {
      const res = await api.get('/dashboard/sales-targets', {
        params: { month: ym, _t: Date.now() },
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted) return;
      const payload: SalesTargetsPayload | undefined = res.data?.data;
      setCanManageTargets(payload?.can_manage_targets === true);
      const list = Array.isArray(payload?.items) ? payload!.items : [];
      setItems(list);
      const nextDrafts: Record<number, string> = {};
      const nextNotes: Record<number, string> = {};
      list.forEach((it) => {
        nextDrafts[it.user_id] = formatDigits(it.target_amount);
        nextNotes[it.user_id] = String(it.notes || '');
      });
      setDraftTargets(nextDrafts);
      setDraftNotes(nextNotes);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setCanManageTargets(false);
      toast.error(err?.response?.data?.message || 'Không thể tải danh sách Target TVV');
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      if (copyAbortRef.current) {
        copyAbortRef.current.abort();
        copyAbortRef.current = null;
      }
      return;
    }
    fetchTargetsForMonth(monthYear);
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (copyAbortRef.current) copyAbortRef.current.abort();
    };
  }, [isOpen, monthYear, fetchTargetsForMonth]);

  useEffect(() => {
    if (isOpen && !loading && focusUserId && focusInputRef.current) {
      const timer = setTimeout(() => {
        focusInputRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        focusInputRef.current?.focus();
        focusInputRef.current?.select();
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [isOpen, loading, focusUserId]);

  const filteredItems = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    const kw = searchTerm.trim().toLowerCase();
    if (!kw) return safeItems;
    return safeItems.filter(
      (it) =>
        (it.full_name || '').toLowerCase().includes(kw) ||
        (it.team_name || '').toLowerCase().includes(kw) ||
        (it.email || '').toLowerCase().includes(kw)
    );
  }, [items, searchTerm]);

  const liveTotals = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    let totalTarget = 0;
    let totalCashIn = 0;
    let totalPending = 0;
    let totalSoVal = 0;
    let achievedCount = 0;
    let configuredCount = 0;

    safeItems.forEach((it) => {
      const tAmt = parseDigits(draftTargets[it.user_id] ?? String(it.target_amount || 0));
      const cAmt = Number(it.cash_in_approved || 0);
      totalTarget += tAmt;
      totalCashIn += cAmt;
      totalPending += Number(it.cash_in_pending || 0);
      totalSoVal += Number(it.so_value || 0);
      if (tAmt > 0) {
        configuredCount++;
        if (cAmt >= tAmt) achievedCount++;
      }
    });

    const pct = totalTarget > 0 ? Math.round((totalCashIn / totalTarget) * 1000) / 10 : 0;
    const remaining = Math.max(0, totalTarget - totalCashIn);
    return {
      totalTarget,
      totalCashIn,
      totalPending,
      totalSoVal,
      remaining,
      pct,
      achievedCount,
      configuredCount,
      totalCount: safeItems.length,
    };
  }, [items, draftTargets]);

  const targetDiffSummary = useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    const changedUsers: Array<{ user_id: number; full_name: string; prevAmt: number; nextAmt: number; delta: number }> = [];
    let deltaTotal = 0;
    safeItems.forEach((it) => {
      const prevAmt = Math.round(Number(it.target_amount || 0));
      const nextAmt = parseDigits(draftTargets[it.user_id] ?? String(prevAmt));
      if (nextAmt !== prevAmt) {
        const delta = nextAmt - prevAmt;
        changedUsers.push({ user_id: it.user_id, full_name: it.full_name, prevAmt, nextAmt, delta });
        deltaTotal += delta;
      }
    });
    return {
      changedCount: changedUsers.length,
      deltaTotal,
      changedUsers
    };
  }, [items, draftTargets]);

  const applyAmountToFiltered = (amt: number, customMsg?: string) => {
    if (!canManageTargets) return;
    const formatted = formatDigits(amt);
    setDraftTargets((prev) => {
      const next = { ...prev };
      filteredItems.forEach((it) => {
        next[it.user_id] = formatted;
      });
      return next;
    });
    toast.success(customMsg || `Đã điền nhanh ${formatted || '0'} ₫ cho ${filteredItems.length} TVV`);
  };

  const handleApplyBulk = () => {
    if (!canManageTargets) return;
    const amt = parseDigits(bulkAmountInput);
    applyAmountToFiltered(amt);
  };

  const handleScaleFiltered = (factor: number) => {
    if (!canManageTargets) return;
    let changed = 0;
    setDraftTargets((prev) => {
      const next = { ...prev };
      filteredItems.forEach((it) => {
        const cur = parseDigits(prev[it.user_id] ?? String(it.target_amount || 0));
        if (cur > 0) {
          const scaled = Math.round((cur * factor) / 100_000) * 100_000;
          next[it.user_id] = formatDigits(Math.max(0, scaled));
          changed++;
        }
      });
      return next;
    });
    if (changed > 0) {
      const pctLabel = factor > 1 ? `+${Math.round((factor - 1) * 100)}%` : `${Math.round((factor - 1) * 100)}%`;
      toast.success(`Đã điều chỉnh ${pctLabel} cho ${changed} TVV đang hiển thị`);
    } else {
      toast('Chưa có TVV nào có mức Target > 0 để tăng/giảm theo %');
    }
  };

  const handleCopyPreviousMonth = async () => {
    if (!canManageTargets || copyingPrev || inFlightCopyRef.current) return;
    const targetMonthAtCall = monthYear;
    const [yStr, mStr] = targetMonthAtCall.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return;
    const prevDate = new Date(y, m - 2, 1);
    const prevYm = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    if (copyAbortRef.current) {
      copyAbortRef.current.abort();
    }
    const ctrl = new AbortController();
    copyAbortRef.current = ctrl;
    inFlightCopyRef.current = true;
    setCopyingPrev(true);
    try {
      const res = await api.get('/dashboard/sales-targets', {
        params: { month: prevYm, _t: Date.now() },
        signal: ctrl.signal,
      });
      if (ctrl.signal.aborted || currentMonthRef.current !== targetMonthAtCall) return;
      const prevItems: SalesTargetItem[] = Array.isArray(res.data?.data?.items) ? res.data.data.items : [];
      const prevMap = new Map<number, SalesTargetItem>();
      prevItems.forEach((p) => prevMap.set(Number(p.user_id), p));

      let copied = 0;
      setDraftTargets((prev) => {
        const next = { ...prev };
        items.forEach((it) => {
          const match = prevMap.get(Number(it.user_id));
          if (match && Number(match.target_amount || 0) > 0) {
            next[it.user_id] = formatDigits(match.target_amount);
            copied++;
          }
        });
        return next;
      });
      setDraftNotes((prev) => {
        const next = { ...prev };
        items.forEach((it) => {
          const match = prevMap.get(Number(it.user_id));
          if (match && match.notes) {
            next[it.user_id] = String(match.notes);
          }
        });
        return next;
      });

      if (copied > 0) {
        setAdjustmentReason((prev) => prev.trim() || `Sao chép Target từ tháng ${prevYm}`);
        toast.success(`Đã sao chép Target tháng ${prevYm} cho ${copied} TVV (bấm Lưu để áp dụng)`);
      } else {
        toast(`Tháng ${prevYm} chưa có mức Target nào được thiết lập`);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      toast.error(`Không thể lấy dữ liệu Target từ tháng ${prevYm}`);
    } finally {
      if (!ctrl.signal.aborted) {
        inFlightCopyRef.current = false;
        setCopyingPrev(false);
      }
    }
  };

  const shiftMonth = (delta: number) => {
    const [yStr, mStr] = monthYear.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    if (!y || !m) return;
    const d = new Date(y, m - 1 + delta, 1);
    setMonthYear(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageTargets) {
      toast.error('Bạn chỉ có quyền xem, không có quyền chỉnh sửa Target doanh thu');
      return;
    }
    if (saving || inFlightSaveRef.current) return;
    const safeItems = Array.isArray(items) ? items : [];
    if (safeItems.length === 0) {
      toast.error('Không có nhân sự TVV nào để lưu Target');
      return;
    }

    const trimmedReason = adjustmentReason.trim();
    if (targetDiffSummary.changedCount > 0 && !trimmedReason) {
      const missingRowNotes = targetDiffSummary.changedUsers.some(
        (cu) => !(draftNotes[cu.user_id] || '').trim()
      );
      if (missingRowNotes) {
        toast.error('Vui lòng nhập Lý do điều chỉnh Target (hoặc ghi chú cho từng TVV có thay đổi)');
        reasonInputRef.current?.focus();
        return;
      }
    }

    inFlightSaveRef.current = true;
    setSaving(true);
    try {
      const targetsPayload = safeItems.map((it) => {
        const prevAmt = Math.round(Number(it.target_amount || 0));
        const nextAmt = parseDigits(draftTargets[it.user_id] ?? '0');
        const rowNote = (draftNotes[it.user_id] ?? '').trim();
        let mergedNote: string | null = rowNote || null;
        if (nextAmt !== prevAmt && trimmedReason) {
          mergedNote = rowNote && !rowNote.includes(trimmedReason)
            ? `${rowNote} | ${trimmedReason}`
            : (rowNote || trimmedReason);
        }
        return {
          user_id: it.user_id,
          target_amount: nextAmt,
          notes: mergedNote,
        };
      });

      const res = await api.post('/dashboard/sales-targets', {
        month_year: monthYear,
        sync_default: syncDefault,
        adjustment_reason: trimmedReason || undefined,
        targets: targetsPayload,
      });

      const updatedData: SalesTargetsPayload | undefined = res.data?.data;
      toast.success(res.data?.message || `Đã lưu Target doanh thu tháng ${monthYear}`);
      window.dispatchEvent(new CustomEvent('sales-targets-updated', { detail: { month: monthYear } }));
      if (onSaved) {
        onSaved(updatedData);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Lỗi khi lưu Target doanh thu TVV');
    } finally {
      inFlightSaveRef.current = false;
      setSaving(false);
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        background: 'rgba(15, 23, 42, 0.48)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: isMobile ? 'flex-end' : 'center',
        justifyContent: 'center',
        padding: isMobile ? '0' : '16px',
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: isMobile ? '100%' : '1020px',
          maxHeight: isMobile ? '94dvh' : '92vh',
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: isMobile ? '18px 18px 0 0' : '16px',
          boxShadow: '0 20px 50px rgba(15, 23, 42, 0.18)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? '12px 16px' : '16px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Target size={18} />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: isMobile ? '0.95rem' : '1.05rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                Thiết lập Target Doanh Thu Tháng — Đội ngũ TVV
              </h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                Tự động đối chiếu với tiền lên đơn SO, đợt thu đã duyệt, tỷ lệ Co-op &amp; thưởng KPI HRM
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          {/* Controls & Live Summary Bar */}
          <div
            style={{
              padding: isMobile ? '12px 16px' : '14px 20px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            {/* Row 1: Period Selector + Copy Previous Month */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Kỳ áp dụng:
                </span>
                <button
                  type="button"
                  onClick={() => shiftMonth(-1)}
                  style={{
                    height: '32px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  Tháng trước
                </button>
                <input
                  type="month"
                  value={monthYear}
                  onChange={(e) => {
                    if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                      setMonthYear(e.target.value);
                    }
                  }}
                  style={{
                    height: '32px',
                    width: '146px',
                    margin: 0,
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                    color: '#0f172a',
                    background: '#ffffff',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => setMonthYear(currentYm)}
                  style={{
                    height: '32px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: monthYear === currentYm ? '#0f172a' : '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: monthYear === currentYm ? '#ffffff' : '#334155',
                    cursor: 'pointer',
                  }}
                >
                  Tháng này
                </button>
                <button
                  type="button"
                  onClick={() => shiftMonth(1)}
                  style={{
                    height: '32px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#334155',
                    cursor: 'pointer',
                  }}
                >
                  Tháng tới
                </button>
              </div>

              <button
                type="button"
                onClick={handleCopyPreviousMonth}
                disabled={!canManageTargets || copyingPrev || loading}
                style={{
                  height: '32px',
                  padding: '0 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#0f172a',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  opacity: !canManageTargets ? 0.55 : 1,
                  cursor: (!canManageTargets || copyingPrev) ? 'not-allowed' : 'pointer',
                }}
              >
                {copyingPrev ? <RefreshCw size={13} className="animate-spin" /> : <Copy size={13} style={{ color: '#BD1D2D' }} />}
                <span>Sao chép Target tháng trước</span>
              </button>
            </div>

            {!loading && !canManageTargets && (
              <div style={{ padding: '7px 10px', borderRadius: 8, background: '#ffffff', border: '1px solid #e2e8f0', fontSize: '0.76rem', color: '#475569' }}>
                Chế độ chỉ xem: Bạn không có quyền chỉnh sửa hạn mức Target doanh thu.
              </div>
            )}

            {/* Row 2: Quick Bulk Fill + Preset Pills + Search (ALL INPUT ICONS ON THE RIGHT) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', opacity: canManageTargets ? 1 : 0.65 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', flex: '1 1 auto' }}>
                {/* Bulk input with ₫ suffix on RIGHT */}
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    width: isMobile ? '100%' : '225px',
                    height: '34px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    boxSizing: 'border-box',
                  }}
                >
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={!canManageTargets}
                    placeholder="Điền mức chung (VD: 150.000.000)"
                    value={bulkAmountInput}
                    onChange={(e) => setBulkAmountInput(formatDigits(e.target.value))}
                    style={{
                      border: 'none',
                      outline: 'none',
                      background: 'transparent',
                      width: '100%',
                      height: '100%',
                      margin: 0,
                      padding: 0,
                      textAlign: 'right',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: '#0f172a',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#64748b', flexShrink: 0 }}>₫</span>
                </div>

                <button
                  type="button"
                  disabled={!canManageTargets}
                  onClick={handleApplyBulk}
                  style={{
                    height: '34px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    cursor: canManageTargets ? 'pointer' : 'not-allowed',
                  }}
                >
                  <Sparkles size={13} style={{ color: '#BD1D2D' }} />
                  Áp dụng
                </button>

                {/* Presets & % Scale */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                  {TARGET_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      disabled={!canManageTargets}
                      onClick={() => {
                        setBulkAmountInput(formatDigits(p.value));
                        applyAmountToFiltered(p.value);
                      }}
                      style={{
                        height: '28px',
                        padding: '0 8px',
                        borderRadius: '6px',
                        border: '1px solid #e2e8f0',
                        background: parseDigits(bulkAmountInput) === p.value ? '#0f172a' : '#ffffff',
                        color: parseDigits(bulkAmountInput) === p.value ? '#ffffff' : '#475569',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: canManageTargets ? 'pointer' : 'not-allowed',
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={!canManageTargets}
                    onClick={() => handleScaleFiltered(1.1)}
                    title="Tăng thêm 10% KPI cho các TVV đang hiển thị"
                    style={{
                      height: '28px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #fecdd3',
                      background: '#fff1f2',
                      color: '#BD1D2D',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: canManageTargets ? 'pointer' : 'not-allowed',
                    }}
                  >
                    +10%
                  </button>
                  <button
                    type="button"
                    disabled={!canManageTargets}
                    onClick={() => handleScaleFiltered(0.9)}
                    title="Giảm 10% KPI cho các TVV đang hiển thị"
                    style={{
                      height: '28px',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: '1px solid #e2e8f0',
                      background: '#ffffff',
                      color: '#475569',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: canManageTargets ? 'pointer' : 'not-allowed',
                    }}
                  >
                    -10%
                  </button>
                </div>
              </div>

              {/* Search Input: Icon ALWAYS on the RIGHT */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  flex: isMobile ? '1 1 100%' : '0 1 260px',
                  width: isMobile ? '100%' : '260px',
                  height: '34px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  boxSizing: 'border-box',
                }}
              >
                <input
                  type="text"
                  placeholder="Tìm nhanh TVV hoặc phòng/nhóm..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    border: 'none',
                    outline: 'none',
                    background: 'transparent',
                    width: '100%',
                    height: '100%',
                    margin: 0,
                    padding: 0,
                    fontSize: '0.8rem',
                    color: '#0f172a',
                  }}
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    aria-label="Xóa từ khóa"
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#94a3b8',
                      padding: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
                <Search size={14} style={{ color: '#64748b', flexShrink: 0 }} />
              </div>
            </div>

            {/* Row 3: 4 Executive KPI Summary Strip (Chương V: Cards 1,3,4 #0f172a, Card 2 #BD1D2D) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
                gap: '8px',
              }}
            >
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Tổng Target Đội Ngũ
                </div>
                <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                  {Math.round(liveTotals.totalTarget).toLocaleString('vi-VN')} ₫
                </div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Thực Thu SO Đã Duyệt
                </div>
                <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                  {Math.round(liveTotals.totalCashIn).toLocaleString('vi-VN')} ₫
                </div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Còn Thiếu Đạt Target
                </div>
                <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', marginTop: '2px' }}>
                  {Math.round(liveTotals.remaining).toLocaleString('vi-VN')} ₫
                </div>
              </div>
              <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                  Tỷ Lệ Đạt ({liveTotals.achievedCount}/{liveTotals.totalCount} TVV)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                    {liveTotals.pct}%
                  </span>
                  {liveTotals.totalPending > 0 && (
                    <span style={{ fontSize: '0.68rem', color: '#64748b' }}>
                      (Chờ thu: {Math.round(liveTotals.totalPending).toLocaleString('vi-VN')} ₫)
                    </span>
                  )}
                </div>
              </div>
            </div>

            {canManageTargets && targetDiffSummary.changedCount > 0 && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div style={{ fontSize: '0.76rem', color: '#0f172a', fontWeight: 600 }}>
                  Thay đổi dự kiến:{' '}
                  <strong style={{ color: '#BD1D2D' }}>{targetDiffSummary.changedCount} TVV</strong>{' '}
                  • Chênh lệch tổng:{' '}
                  <strong style={{ color: targetDiffSummary.deltaTotal >= 0 ? '#0f172a' : '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                    {targetDiffSummary.deltaTotal >= 0 ? '+' : ''}
                    {Math.round(targetDiffSummary.deltaTotal).toLocaleString('vi-VN')} ₫
                  </strong>
                </div>
                <input
                  ref={reasonInputRef}
                  type="text"
                  placeholder="Nhập lý do điều chỉnh KPI (bắt buộc khi thay đổi Target)..."
                  value={adjustmentReason}
                  onChange={(e) => setAdjustmentReason(e.target.value)}
                  style={{
                    flex: isMobile ? '1 1 100%' : '1 1 280px',
                    height: '32px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    fontSize: '0.76rem',
                    color: '#0f172a',
                    outline: 'none',
                  }}
                />
              </div>
            )}
          </div>

          {/* TVV Table / Mobile Card Body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px 16px' : '0 20px' }}>
            {loading ? (
              <div style={{ padding: '20px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[1, 2, 3].map((idx) => (
                  <div
                    key={idx}
                    className="animate-pulse"
                    style={{ height: '56px', borderRadius: '10px', background: '#f1f5f9' }}
                  />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
                Không tìm thấy Tư vấn viên (Sale) phù hợp trong danh sách.
              </div>
            ) : isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredItems.map((it) => {
                  const draftVal = draftTargets[it.user_id] ?? formatDigits(it.target_amount);
                  const numericTarget = parseDigits(draftVal);
                  const cashIn = Number(it.cash_in_approved || 0);
                  const pct = numericTarget > 0 ? Math.round((cashIn / numericTarget) * 1000) / 10 : 0;
                  const tone = getTargetProgressTone(pct);
                  const diff = numericTarget > 0 ? cashIn - numericTarget : 0;
                  const isFocused = focusUserId !== null && Number(focusUserId) === Number(it.user_id);

                  return (
                    <div
                      key={it.user_id}
                      style={{
                        border: isFocused ? '1.5px solid #BD1D2D' : '1px solid #e2e8f0',
                        borderRadius: '12px',
                        padding: '12px',
                        background: '#ffffff',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <Avatar name={it.full_name} src={it.avatar_url || undefined} size={34} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '0.85rem' }}>{it.full_name}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                              {it.team_name ? `${it.team_name} • ` : ''}
                              {it.job_title || 'Chuyên viên Tư vấn'}
                            </div>
                          </div>
                        </div>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: numericTarget > 0 ? tone : '#94a3b8' }}>
                          {numericTarget > 0 ? `${pct}%` : 'Chưa đặt'}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.74rem', background: '#f8fafc', padding: '8px 10px', borderRadius: '8px' }}>
                        <div>
                          <div style={{ color: '#64748b' }}>Lên SO ({it.so_count || 0} đơn)</div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(it.so_value || 0).toLocaleString('vi-VN')} ₫
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: '#64748b' }}>Thực thu đã duyệt</div>
                          <div style={{ fontWeight: 800, color: cashIn > 0 ? '#BD1D2D' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(cashIn).toLocaleString('vi-VN')} ₫
                          </div>
                        </div>
                      </div>

                      {/* Target input with ₫ on RIGHT */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          width: '100%',
                          height: '38px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          background: '#ffffff',
                          boxSizing: 'border-box',
                        }}
                      >
                        <input
                          ref={isFocused ? focusInputRef : undefined}
                          type="text"
                          inputMode="numeric"
                          disabled={!canManageTargets}
                          placeholder="0"
                          value={draftVal}
                          onChange={(e) => {
                            const formatted = formatDigits(e.target.value);
                            setDraftTargets((prev) => ({ ...prev, [it.user_id]: formatted }));
                          }}
                          style={{
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            width: '100%',
                            height: '100%',
                            margin: 0,
                            padding: 0,
                            textAlign: 'right',
                            fontWeight: 800,
                            fontSize: '0.88rem',
                            color: '#0f172a',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', flexShrink: 0 }}>₫</span>
                      </div>

                      {numericTarget > 0 && (
                        <div style={{ fontSize: '0.72rem', color: diff >= 0 ? '#10b981' : '#d97706', fontWeight: 600 }}>
                          {diff >= 0
                            ? `Vượt KPI +${Math.round(diff).toLocaleString('vi-VN')} ₫`
                            : `Còn thiếu ${Math.round(Math.abs(diff)).toLocaleString('vi-VN')} ₫ để đạt 100%`}
                        </div>
                      )}

                      {/* Notes input with icon on RIGHT */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          width: '100%',
                          height: '32px',
                          padding: '0 10px',
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          boxSizing: 'border-box',
                        }}
                      >
                        <input
                          type="text"
                          disabled={!canManageTargets}
                          placeholder="Ghi chú KPI (VD: Thử việc 50%, Hỗ trợ dự án...)"
                          value={draftNotes[it.user_id] ?? ''}
                          onChange={(e) => setDraftNotes((prev) => ({ ...prev, [it.user_id]: e.target.value }))}
                          style={{
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            width: '100%',
                            height: '100%',
                            margin: 0,
                            padding: 0,
                            fontSize: '0.75rem',
                            color: '#334155',
                          }}
                        />
                        <FileText size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e2e8f0', background: '#ffffff', position: 'sticky', top: 0, zIndex: 2 }}>
                    <th style={{ padding: '12px 8px', textAlign: 'left', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                      Tư vấn viên &amp; Ghi chú KPI
                    </th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                      Lên SO kỳ này
                    </th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase' }}>
                      Thực thu đã duyệt
                    </th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: '215px' }}>
                      Target Tháng ({monthYear})
                    </th>
                    <th style={{ padding: '12px 8px', textAlign: 'right', color: '#64748b', fontWeight: 700, fontSize: '0.72rem', textTransform: 'uppercase', width: '145px' }}>
                      % Đạt / Còn thiếu
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((it) => {
                    const draftVal = draftTargets[it.user_id] ?? formatDigits(it.target_amount);
                    const numericTarget = parseDigits(draftVal);
                    const cashIn = Number(it.cash_in_approved || 0);
                    const pendingAmt = Number(it.cash_in_pending || 0);
                    const pct = numericTarget > 0 ? Math.round((cashIn / numericTarget) * 1000) / 10 : 0;
                    const projectedPct = numericTarget > 0 ? Math.round(((cashIn + pendingAmt) / numericTarget) * 1000) / 10 : 0;
                    const diff = numericTarget > 0 ? cashIn - numericTarget : 0;
                    const tone = getTargetProgressTone(pct);
                    const isFocused = focusUserId !== null && Number(focusUserId) === Number(it.user_id);

                    return (
                      <tr
                        key={it.user_id}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: isFocused ? 'rgba(189, 29, 45, 0.04)' : 'transparent',
                        }}
                      >
                        <td style={{ padding: '10px 8px' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                            <Avatar name={it.full_name} src={it.avatar_url || undefined} size={34} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: '#0f172a' }}>{it.full_name}</div>
                              <div style={{ fontSize: '0.71rem', color: '#64748b', marginBottom: '5px' }}>
                                {it.team_name ? `${it.team_name} • ` : ''}
                                {it.job_title || 'Chuyên viên Tư vấn'}
                              </div>
                              {/* Inline Note input with icon on RIGHT */}
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  maxWidth: '280px',
                                  height: '28px',
                                  padding: '0 8px',
                                  borderRadius: '6px',
                                  border: '1px solid #e2e8f0',
                                  background: '#f8fafc',
                                  boxSizing: 'border-box',
                                }}
                              >
                                <input
                                  type="text"
                                  disabled={!canManageTargets}
                                  placeholder="Ghi chú KPI tháng (tùy chọn)..."
                                  value={draftNotes[it.user_id] ?? ''}
                                  onChange={(e) => setDraftNotes((prev) => ({ ...prev, [it.user_id]: e.target.value }))}
                                  style={{
                                    border: 'none',
                                    outline: 'none',
                                    background: 'transparent',
                                    width: '100%',
                                    height: '100%',
                                    margin: 0,
                                    padding: 0,
                                    fontSize: '0.72rem',
                                    color: '#334155',
                                  }}
                                />
                                <FileText size={12} style={{ color: '#94a3b8', flexShrink: 0 }} />
                              </div>
                            </div>
                          </div>
                        </td>

                        <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <div style={{ fontWeight: 700, color: it.so_value > 0 ? '#0f172a' : '#94a3b8' }}>
                            {Math.round(it.so_value || 0).toLocaleString('vi-VN')} ₫
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{it.so_count || 0} đơn SO</div>
                        </td>

                        <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          <div style={{ fontWeight: 800, color: cashIn > 0 ? '#BD1D2D' : '#94a3b8' }}>
                            {Math.round(cashIn).toLocaleString('vi-VN')} ₫
                          </div>
                          {pendingAmt > 0 && (
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                              Chờ thu: {Math.round(pendingAmt).toLocaleString('vi-VN')} ₫
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                          {/* Target input with ₫ suffix strictly on RIGHT */}
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              width: '100%',
                              height: '36px',
                              padding: '0 10px',
                              borderRadius: '8px',
                              border: '1px solid #cbd5e1',
                              background: '#ffffff',
                              boxSizing: 'border-box',
                            }}
                          >
                            <input
                              ref={isFocused ? focusInputRef : undefined}
                              type="text"
                              inputMode="numeric"
                              disabled={!canManageTargets}
                              placeholder="0"
                              value={draftVal}
                              onChange={(e) => {
                                const formatted = formatDigits(e.target.value);
                                setDraftTargets((prev) => ({
                                  ...prev,
                                  [it.user_id]: formatted,
                                }));
                              }}
                              style={{
                                border: 'none',
                                outline: 'none',
                                background: 'transparent',
                                width: '100%',
                                height: '100%',
                                margin: 0,
                                padding: 0,
                                textAlign: 'right',
                                fontWeight: 800,
                                fontSize: '0.84rem',
                                color: '#0f172a',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            />
                            <span
                              style={{
                                fontSize: '0.78rem',
                                fontWeight: 700,
                                color: '#64748b',
                                flexShrink: 0,
                                userSelect: 'none',
                              }}
                            >
                              ₫
                            </span>
                          </div>
                        </td>

                        <td style={{ padding: '10px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {numericTarget > 0 ? (
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                                <span style={{ fontWeight: 800, color: tone, fontSize: '0.82rem' }}>{pct}%</span>
                                {pendingAmt > 0 && projectedPct > pct && (
                                  <span title="Tỷ lệ dự kiến nếu thu hết phần SO đang chờ thu" style={{ fontSize: '0.67rem', color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                                    <TrendingUp size={10} /> {projectedPct}%
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  width: '100%',
                                  height: '5px',
                                  borderRadius: '4px',
                                  background: '#f1f5f9',
                                  overflow: 'hidden',
                                  marginTop: '4px',
                                }}
                              >
                                <div
                                  style={{
                                    width: `${Math.min(100, pct)}%`,
                                    height: '100%',
                                    background: tone,
                                    borderRadius: '4px',
                                  }}
                                />
                              </div>
                              <div style={{ fontSize: '0.68rem', color: diff >= 0 ? '#10b981' : '#64748b', marginTop: '3px', fontWeight: diff >= 0 ? 700 : 500 }}>
                                {diff >= 0
                                  ? `Vượt +${Math.round(diff).toLocaleString('vi-VN')} ₫`
                                  : `Thiếu ${Math.round(Math.abs(diff)).toLocaleString('vi-VN')} ₫`}
                              </div>
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.73rem', color: '#94a3b8' }}>Chưa đặt</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: isMobile ? '12px 16px' : '14px 20px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '0.76rem',
                color: '#334155',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                disabled={!canManageTargets}
                checked={syncDefault}
                onChange={(e) => setSyncDefault(e.target.checked)}
                style={{ width: '15px', height: '15px', accentColor: '#BD1D2D', cursor: canManageTargets ? 'pointer' : 'not-allowed' }}
              />
              <span>Đồng bộ làm hạn mức KPI mặc định cho các tháng tiếp theo &amp; Bảng lương HRM</span>
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
              <button
                type="button"
                disabled={saving}
                onClick={onClose}
                className="btn outline"
                style={{ height: '36px', padding: '0 14px', borderRadius: '8px', fontWeight: 600, flex: isMobile ? 1 : undefined }}
              >
                Đóng
              </button>
              {canManageTargets && (
                <button
                  type="submit"
                  disabled={saving || loading}
                  className="btn primary"
                  style={{
                    height: '36px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    fontWeight: 700,
                    background: '#BD1D2D',
                    borderColor: '#BD1D2D',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    flex: isMobile ? 1 : undefined,
                  }}
                >
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  <span>{saving ? 'Đang lưu...' : 'Lưu Target Tháng'}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
};
