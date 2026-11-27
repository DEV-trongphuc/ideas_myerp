import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, Calendar, Mail, Scale, Send, User, Users, X } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import toast from 'react-hot-toast';
import { Avatar } from '../ui/Avatar';
import { CustomSelect } from '../ui/CustomSelect';
import { ChartSkeleton, KpiCardSkeleton } from '../ui/Skeleton';
import { useLanguage } from '../../contexts/LanguageContext';
import { fetchAPI } from '../../utils/api';
import { pushOverlay } from '../../utils/overlayStack';
import { ensureArray } from '../../utils/safeArray';

export interface ConsultantStatsTarget {
  id: number;
  name: string;
  email?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
  status?: string | null;
  vacation_mode?: number | boolean | null;
}

interface ConsultantStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  consultant: ConsultantStatsTarget | null;
  initialDateMode?: string;
  initialStartDate?: string;
  initialEndDate?: string;
}

const MODAL_TRANSITION = { duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as const };

const CARD_STYLE: React.CSSProperties = {
  background: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
};

export const ConsultantStatsModal: React.FC<ConsultantStatsModalProps> = ({
  isOpen,
  onClose,
  consultant,
  initialDateMode = 'this_month',
  initialStartDate = '',
  initialEndDate = ''
}) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  const [dateMode, setDateMode] = useState<string>(initialDateMode || 'this_month');
  const [startDate, setStartDate] = useState<string>(initialStartDate || '');
  const [endDate, setEndDate] = useState<string>(initialEndDate || '');
  const [statsData, setStatsData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );

  const abortRef = useRef<AbortController | null>(null);
  const openPathnameRef = useRef<string>(location.pathname);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (mq.addEventListener) {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  // Sync caller-provided initial timeframe whenever modal opens or consultant changes
  useEffect(() => {
    if (isOpen) {
      setDateMode(initialDateMode || 'this_month');
      setStartDate(initialStartDate || '');
      setEndDate(initialEndDate || '');
      setStatsData(null);
      openPathnameRef.current = location.pathname;
    }
  }, [isOpen, consultant?.id, initialDateMode, initialStartDate, initialEndDate]);

  // RouterFreezer portal guard: close immediately if route path changes while frozen
  useEffect(() => {
    if (isOpen && location.pathname !== openPathnameRef.current) {
      onClose();
    }
  }, [isOpen, location.pathname, onClose]);

  // LIFO Escape stack + scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const unregister = pushOverlay('consultant-stats-modal', onClose, 2147483644);
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

  useEffect(() => {
    if (!isOpen || !consultant?.id) {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      return;
    }
    if (dateMode === 'custom' && (!startDate || !endDate)) {
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const loadStats = async () => {
      setLoading(true);
      try {
        let query = `get_consultant_stats&consultant_id=${Number(consultant.id)}&date_mode=${encodeURIComponent(dateMode)}`;
        if (dateMode === 'custom' && startDate && endDate) {
          query += `&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}`;
        }
        const json = await fetchAPI(query, { signal });
        if (signal.aborted) return;
        if (json?.success) {
          setStatsData(json);
        } else {
          toast.error(json?.message || t('Lỗi khi tải báo cáo thống kê'));
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') {
          return;
        }
        toast.error(t('Lỗi kết nối: ') + (err?.message || 'Unknown error'));
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadStats();
    return () => {
      controller.abort();
    };
  }, [isOpen, consultant?.id, dateMode, startDate, endDate, t]);

  if (typeof document === 'undefined') return null;

  const summary = statsData?.summary || {};
  const totalReceived = Number(summary.total_received) || 0;
  const distributedCount = Number(summary.distributed_count) || 0;
  const coopCount = Number(summary.coop_count) || 0;
  const distributedTotal = distributedCount + coopCount;
  const databankCount = Number(summary.databank_count) || 0;
  const selfCount = Number(summary.self_count) || 0;
  const personalTotal = selfCount + databankCount;
  const reminderCount = Number(summary.reminder) || 0;
  const errorCount = Number(summary.error) || 0;
  const errorTicketCount = Number(summary.error_ticket_count) || 0;
  const successfulCount = Number(summary.successful) || 0;
  const totalLogs = Number(summary.total) || 0;

  const byDateList = ensureArray(statsData?.by_date);
  const roundsList = ensureArray(statsData?.rounds);
  const bySourceList = ensureArray(statsData?.by_source);

  const tickets = statsData?.tickets || null;
  const activeComp = Number(statsData?.active_compensation) || 0;
  const blacklistComp = Number(statsData?.blacklist_compensation) || 0;
  const approvedTickets = Number(tickets?.approved) || 0;
  const totalCompReceived = approvedTickets + activeComp + blacklistComp;

  const statusChartData = [
    { name: t('Thành công'), value: successfulCount, color: '#C6333D' },
    { name: t('Nhắc lại'), value: reminderCount, color: '#64748B' },
    { name: t('Lỗi'), value: errorCount, color: '#334155' }
  ].filter((item) => item.value > 0);

  const isOffShift =
    consultant?.status === 'inactive' ||
    consultant?.status === 'leave' ||
    Number(consultant?.vacation_mode) === 1;

  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 100) : 0;

  return createPortal(
    <AnimatePresence>
      {isOpen && consultant && (
        <motion.div
          key="consultant-stats-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={MODAL_TRANSITION}
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483644,
            background: 'rgba(15, 23, 42, 0.56)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: isMobile ? 'flex-end' : 'center',
            justifyContent: 'center',
            padding: isMobile ? 0 : '1rem'
          }}
        >
          <motion.div
            key="consultant-stats-panel"
            initial={isMobile ? { y: '100%', opacity: 1 } : { opacity: 0, scale: 0.97, y: 8 }}
            animate={isMobile ? { y: 0, opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isMobile ? { y: '100%', opacity: 0 } : { opacity: 0, scale: 0.97, y: 8 }}
            transition={MODAL_TRANSITION}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: isMobile ? '100%' : 940,
              maxHeight: isMobile ? '94vh' : '92vh',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: isMobile ? '16px 16px 0 0' : '16px',
              boxShadow: '0 24px 60px rgba(15, 23, 42, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: isMobile ? 'flex-start' : 'center',
                justifyContent: 'space-between',
                flexDirection: isMobile ? 'column' : 'row',
                gap: '0.75rem',
                background: '#ffffff'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                <Avatar
                  src={consultant.avatar || consultant.avatar_url || undefined}
                  name={consultant.name}
                  size={44}
                  style={{
                    filter: isOffShift ? 'grayscale(1)' : 'none',
                    opacity: isOffShift ? 0.55 : 1,
                    flexShrink: 0
                  }}
                />
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    {t('Báo cáo hiệu suất TVV')}
                  </h3>
                  <div
                    style={{
                      fontSize: '0.76rem',
                      color: '#64748b',
                      marginTop: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <strong style={{ color: '#0f172a' }}>{consultant.name}</strong>
                    <span>• ID: {consultant.id}</span>
                    {consultant.email && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <span>•</span>
                        <Mail size={12} color="#64748b" />
                        <span>{consultant.email}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', width: isMobile ? '100%' : 'auto', justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Calendar size={16} color="#64748b" />
                  <CustomSelect
                    options={[
                      { value: 'this_month', label: t('Tháng này') },
                      { value: 'today', label: t('Hôm nay') },
                      { value: 'yesterday', label: t('Hôm qua') },
                      { value: '7_days', label: t('7 ngày qua') },
                      { value: '30_days', label: t('30 ngày qua') },
                      { value: 'last_month', label: t('Tháng trước') },
                      { value: 'all', label: t('Tất cả thời gian') },
                      { value: 'custom', label: t('Tự chọn ngày...') }
                    ]}
                    value={dateMode}
                    onChange={(val) => setDateMode(String(val))}
                    width={175}
                  />

                  {dateMode === 'custom' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input
                        type="date"
                        className="form-input"
                        style={{ padding: '4px 8px', fontSize: '0.8rem', height: 34, width: 132 }}
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                      />
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t('đến')}</span>
                      <input
                        type="date"
                        className="form-input"
                        style={{ padding: '4px 8px', fontSize: '0.8rem', height: 34, width: 132 }}
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t('Đóng')}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: '1px solid #e2e8f0',
                    background: '#f8fafc',
                    color: '#475569',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Body */}
            <div
              className="custom-scrollbar"
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.25rem',
                background: '#f8fafc',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                position: 'relative'
              }}
            >
              {loading && !statsData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '0.85rem' }}>
                    <KpiCardSkeleton />
                    <KpiCardSkeleton />
                    <KpiCardSkeleton />
                    <KpiCardSkeleton />
                  </div>
                  <ChartSkeleton height={240} />
                </div>
              ) : !statsData ? (
                <div style={{ ...CARD_STYLE, textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                  {t('Không có dữ liệu thống kê.')}
                </div>
              ) : (
                <>
                  {loading && (
                    <div
                      className="animate-pulse"
                      style={{
                        position: 'sticky',
                        top: 0,
                        height: 3,
                        width: '100%',
                        borderRadius: 999,
                        background: '#BD1D2D',
                        zIndex: 5
                      }}
                    />
                  )}

                  {/* Breakdown Bar Card */}
                  <div style={{ ...CARD_STYLE, padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#0f172a' }}>
                        {t('Tổng data TVV này tiếp nhận:')}{' '}
                        <strong style={{ fontSize: '1.05rem', color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                          {totalReceived}
                        </strong>{' '}
                        lead
                      </span>
                      <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                        * {t('Các nhóm độc lập hoàn toàn, không cộng dồn/chồng chéo')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: '#e2e8f0' }}>
                      {distributedTotal > 0 && (
                        <div
                          style={{
                            width: `${(distributedTotal / Math.max(1, totalReceived)) * 100}%`,
                            background: '#C6333D',
                            transition: 'width 0.25s ease'
                          }}
                          title={`${t('Được chia')}: ${distributedTotal}`}
                        />
                      )}
                      {databankCount > 0 && (
                        <div
                          style={{
                            width: `${(databankCount / Math.max(1, totalReceived)) * 100}%`,
                            background: '#334155',
                            transition: 'width 0.25s ease'
                          }}
                          title={`${t('Từ Databank')}: ${databankCount}`}
                        />
                      )}
                      {selfCount > 0 && (
                        <div
                          style={{
                            width: `${(selfCount / Math.max(1, totalReceived)) * 100}%`,
                            background: '#94A3B8',
                            transition: 'width 0.25s ease'
                          }}
                          title={`${t('Tự nhập')}: ${selfCount}`}
                        />
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#C6333D' }} />
                        {t('Được chia')}: <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{distributedTotal}</strong> ({pct(distributedTotal, totalReceived)}%)
                      </span>
                      <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#334155' }} />
                        {t('Từ Databank')}: <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{databankCount}</strong> ({pct(databankCount, totalReceived)}%)
                      </span>
                      <span style={{ color: '#64748b', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#94A3B8' }} />
                        {t('Tự nhập')}: <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{selfCount}</strong> ({pct(selfCount, totalReceived)}%)
                      </span>
                      <span style={{ marginLeft: isMobile ? 0 : 'auto', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                        {t('Nhắc lại')}: <strong style={{ color: '#0f172a' }}>{reminderCount}</strong> | {t('Lỗi/Trùng')}:{' '}
                        <strong style={{ color: '#BD1D2D' }}>{errorTicketCount}</strong>
                      </span>
                    </div>
                  </div>

                  {/* 4 Canonical Ch.V KPI Cards */}
                  <div
                    className="dashboard-kpi-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                      gap: '0.85rem'
                    }}
                  >
                    {/* Card 1 */}
                    <div className="stat-card" style={{ ...CARD_STYLE, padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="stat-label" style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                          {t('Tổng khách hàng')}
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Users size={16} />
                        </div>
                      </div>
                      <div className="stat-value" style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                        {totalReceived}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.72rem', color: '#64748b', marginTop: 'auto' }}>
                        <div>• {t('Thành công')}: <strong style={{ color: '#0f172a' }}>{successfulCount}</strong></div>
                        <div>• {t('Nhắc lại')}: <strong style={{ color: '#0f172a' }}>{reminderCount}</strong></div>
                      </div>
                    </div>

                    {/* Card 2 */}
                    <div className="stat-card" style={{ ...CARD_STYLE, padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="stat-label" style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                          {t('Được chia')}
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Send size={16} />
                        </div>
                      </div>
                      <div className="stat-value" style={{ fontSize: '1.85rem', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                        {distributedTotal}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.72rem', color: '#64748b', marginTop: 'auto' }}>
                        <div>• {t('Chia tự động')}: <strong style={{ color: '#0f172a' }}>{distributedCount}</strong></div>
                        <div>• {t('Hợp tác (co.op)')}: <strong style={{ color: '#0f172a' }}>{coopCount}</strong></div>
                      </div>
                    </div>

                    {/* Card 3 */}
                    <div className="stat-card" style={{ ...CARD_STYLE, padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="stat-label" style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                          {t('Data cá nhân')}
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <User size={16} />
                        </div>
                      </div>
                      <div className="stat-value" style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                        {personalTotal}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.72rem', color: '#64748b', marginTop: 'auto' }}>
                        <div>• {t('Tự nhập')}: <strong style={{ color: '#0f172a' }}>{selfCount}</strong></div>
                        <div>• {t('Từ Databank')}: <strong style={{ color: '#0f172a' }}>{databankCount}</strong></div>
                      </div>
                    </div>

                    {/* Card 4 */}
                    <div className="stat-card" style={{ ...CARD_STYLE, padding: '1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span className="stat-label" style={{ fontSize: '0.73rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#64748b' }}>
                          {t('Data lỗi & Ticket')}
                        </span>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(15, 23, 42, 0.06)', color: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <AlertCircle size={16} />
                        </div>
                      </div>
                      <div className="stat-value" style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                        {errorTicketCount}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.72rem', color: '#64748b', marginTop: 'auto' }}>
                        <div>• {t('Đã nhận bù')}: <strong style={{ color: '#0f172a' }}>{totalCompReceived}</strong></div>
                        <div>• {t('Số Ticket lỗi')}: <strong style={{ color: '#0f172a' }}>{errorCount}</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* Row 1: Daily BarChart */}
                  <div className="card" style={{ ...CARD_STYLE, padding: '1.15rem 1.25rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', gap: 8 }}>
                      <div>
                        <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                          {t('Lưu lượng nhận Data theo Ngày')}
                        </h3>
                        <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0' }}>
                          {t('Thống kê số lượng data thành công theo từng ngày trong kỳ lọc')}
                        </p>
                      </div>
                      <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: '#0f172a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                        {totalReceived} lead
                      </span>
                    </div>
                    {byDateList.length > 0 ? (
                      <div style={{ height: 190, width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={byDateList} margin={{ left: -10, right: 5, top: 22, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={34} />
                            <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', fontSize: '0.76rem', borderRadius: 10, fontVariantNumeric: 'tabular-nums' }} />
                            <Bar dataKey="count" fill="#C6333D" radius={[6, 6, 2, 2]} maxBarSize={30} name={t('Data thành công')}>
                              <LabelList dataKey="count" position="top" style={{ fill: '#0f172a', fontSize: 11, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} offset={6} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.8rem' }}>
                        {t('Không có dữ liệu phân bổ theo ngày')}
                      </div>
                    )}
                  </div>

                  {/* Row 2: Donut + Rounds Stacked Bar */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                    <div className="card" style={{ ...CARD_STYLE, padding: '1.15rem 1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {t('Tỷ lệ Trạng thái Data')}
                          </h3>
                          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0' }}>
                            {t('Tỷ trọng Thành công, Nhắc lại & Lỗi')}
                          </p>
                        </div>
                        <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: '#0f172a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {totalLogs}
                        </span>
                      </div>

                      {totalLogs > 0 && statusChartData.length > 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                          <div style={{ width: 150, height: 150, flexShrink: 0 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie data={statusChartData} cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={4} dataKey="value">
                                  {statusChartData.map((entry, idx) => (
                                    <Cell key={`cell-${idx}`} fill={entry.color} />
                                  ))}
                                </Pie>
                                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', fontSize: '0.76rem', borderRadius: 10 }} />
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.78rem' }}>
                            {statusChartData.map((item, idx) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                                <span style={{ color: '#475569', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                  {item.name}: <strong style={{ color: '#0f172a' }}>{item.value}</strong> ({pct(item.value, totalLogs)}%)
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: '2rem 0' }}>
                          {t('Không có dữ liệu lưu lượng')}
                        </div>
                      )}
                    </div>

                    <div className="card" style={{ ...CARD_STYLE, padding: '1.15rem 1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {t('Phân bổ theo Vòng (Round)')}
                          </h3>
                          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0' }}>
                            {t('Số lượng data chia theo từng vòng')}
                          </p>
                        </div>
                        <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: '#0f172a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {roundsList.length} {t('vòng')}
                        </span>
                      </div>

                      {roundsList.length > 0 ? (
                        <div style={{ height: 170, width: '100%' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={roundsList} layout="vertical" margin={{ left: -8, right: 12, top: 0, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                              <YAxis dataKey="round_name" type="category" width={96} tick={{ fontSize: 11, fontWeight: 600, fill: '#0f172a' }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e2e8f0', fontSize: '0.76rem', borderRadius: 10 }} />
                              <Bar dataKey="successful_count" stackId="a" fill="#C6333D" barSize={12} name={t('Thành công')} />
                              <Bar dataKey="reminder_count" stackId="a" fill="#64748B" barSize={12} name={t('Nhắc lại')} />
                              <Bar dataKey="error_count" stackId="a" fill="#334155" radius={[0, 4, 4, 0]} barSize={12} name={t('Lỗi')} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: '2rem 0' }}>
                          {t('Không có dữ liệu chia số theo vòng')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Row 3: Sources + Error Tickets */}
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                    <div className="card" style={{ ...CARD_STYLE, padding: '1.15rem 1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {t('Tỷ lệ Nguồn Data (Chi tiết)')}
                          </h3>
                          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0' }}>
                            {t('Phân bổ nguồn lead tiếp nhận thành công')}
                          </p>
                        </div>
                        <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: '#0f172a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {bySourceList.length}
                        </span>
                      </div>

                      {bySourceList.length > 0 ? (
                        <div className="custom-scrollbar" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 140, overflowY: 'auto', paddingRight: 4 }}>
                          {bySourceList.map((src: any, idx: number) => {
                            const cnt = Number(src?.count) || 0;
                            const sourcePercent = successfulCount > 0 ? Math.min(100, Math.round((cnt / successfulCount) * 100)) : 0;
                            return (
                              <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.77rem' }}>
                                  <span style={{ fontWeight: 600, color: '#0f172a' }}>{src?.source || t('Không xác định')}</span>
                                  <span style={{ color: '#64748b', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {cnt} {t('data')} ({sourcePercent}%)
                                  </span>
                                </div>
                                <div style={{ width: '100%', height: 5, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                                  <div style={{ width: `${sourcePercent}%`, height: '100%', background: idx < 3 ? '#C6333D' : '#475569', borderRadius: 999 }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: '1.5rem 0' }}>
                          {t('Không có dữ liệu nguồn data')}
                        </div>
                      )}
                    </div>

                    <div className="card" style={{ ...CARD_STYLE, padding: '1.15rem 1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                        <div>
                          <h3 style={{ fontSize: '0.98rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {t('Thống kê Ticket báo lỗi Data')}
                          </h3>
                          <p style={{ fontSize: '0.76rem', color: '#64748b', margin: '2px 0 0' }}>
                            {t('Theo dõi ticket báo lỗi và lịch sử bù số')}
                          </p>
                        </div>
                        <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px', fontSize: '0.75rem', color: '#0f172a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                          {totalCompReceived} {t('bù')}
                        </span>
                      </div>

                      {tickets ? (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: '0.5rem', textAlign: 'center' }}>
                            <div style={{ background: '#f8fafc', padding: '8px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>{t('GỬI ĐI')}</div>
                              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{Number(tickets.total) || 0}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '8px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>{t('ĐÃ BÙ')}</div>
                              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#BD1D2D', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{approvedTickets}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '8px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>{t('ĐANG CHỜ')}</div>
                              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#334155', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{Number(tickets.pending) || 0}</div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '8px', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                              <div style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 700 }}>{t('TỪ CHỐI')}</div>
                              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#64748b', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{Number(tickets.rejected) || 0}</div>
                            </div>
                          </div>

                          <div style={{ marginTop: '10px', fontSize: '0.76rem', color: '#64748b', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                            {t('Tổng nhận bù:')}{' '}
                            <strong style={{ color: '#0f172a' }}>{totalCompReceived}</strong> {t('data')} (Ticket: {approvedTickets}, Blacklist: {blacklistComp}, {t('Chủ động')}: {activeComp})
                          </div>

                          <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                            <button
                              type="button"
                              onClick={() => {
                                onClose();
                                navigate(`/fair-share?open_comp_id=${consultant.id}&date_mode=${encodeURIComponent(dateMode)}`);
                              }}
                              className="btn outline sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', padding: '6px 12px', height: 'auto', borderRadius: 8 }}
                            >
                              <Scale size={13} /> {t('Xem chi tiết data bù')}
                            </button>
                          </div>
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#64748b', fontSize: '0.8rem', padding: '1.5rem 0' }}>
                          {t('Không có dữ liệu ticket')}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '0.85rem 1.25rem',
                background: '#ffffff',
                borderTop: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'flex-end'
              }}
            >
              <button type="button" className="btn primary sm" onClick={onClose}>
                {t('Đóng')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default ConsultantStatsModal;
