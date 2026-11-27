import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Lock,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import {
  AFTERNOON_SLOTS,
  EVENING_SLOTS,
  DAY_KEYS,
} from '../components/academic/LecturerInvitationAnd1on1Modal';
import { API_BASE } from '../config/env';
import { getTenantOrganizationName } from '../contexts/TenantConfigContext';
import { getLocalDateStr } from '../utils/dateUtils';

const API_URL = API_BASE;

function buildPublicAcademicApiUrl(rawUrl: string): string {
  const idx = rawUrl.indexOf('/academic/');
  if (idx === -1) return rawUrl;
  const base = rawUrl.slice(0, idx);
  const rest = rawUrl.slice(idx + 1);
  const [actionPart, qsPart] = rest.split('?');
  return `${base}/api.php?action=${encodeURIComponent(actionPart)}${qsPart ? `&${qsPart}` : ''}`;
}

function sanitizeSafeUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^(https?:\/\/|\/|mailto:|tel:)/i.test(trimmed)) return trimmed;
  return '';
}

function parseLocalYmd(dateStr: string): Date | null {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSlotBounds(slotRange: string): { start: string; end: string } {
  const parts = String(slotRange || '').split('-').map((p) => p.trim().slice(0, 5));
  return { start: parts[0] || '', end: parts[1] || '' };
}

function hmToMinutes(hm: string): number {
  const parts = String(hm || '').slice(0, 5).split(':').map(Number);
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return -1;
  return parts[0] * 60 + parts[1];
}

export const PublicBooking1on1Page: React.FC = () => {
  const { bookingCode } = useParams<{ bookingCode: string }>();

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [config, setConfig] = useState<any>(null);
  const [bookedSlots, setBookedSlots] = useState<any[]>([]);
  const [timeSlots30m, setTimeSlots30m] = useState<string[]>([]);
  const [teachingBusy, setTeachingBusy] = useState<Array<{ date: string; start: string; end: string; label?: string }>>([]);
  const [prefillContactId, setPrefillContactId] = useState<number | null>(null);

  // Selected slot state
  const [selectedCell, setSelectedCell] = useState<{
    dayKey: string;
    dayLabel: string;
    dateStr: string;
    slotRange: string;
  } | null>(null);

  // Student booking form
  const [studentName, setStudentName] = useState<string>('');
  const [studentCode, setStudentCode] = useState<string>('');
  const [studentEmail, setStudentEmail] = useState<string>('');
  const [studentPhone, setStudentPhone] = useState<string>('');
  const [topic, setTopic] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>('');
  const [bookingResult, setBookingResult] = useState<any>(null);

  // Self-service cancel / reschedule states
  const [showCancelPrompt, setShowCancelPrompt] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [canceling, setCanceling] = useState<boolean>(false);
  const [cancelNotice, setCancelNotice] = useState<string>('');

  const fetchAbortRef = useRef<AbortController | null>(null);
  const submitAbortRef = useRef<AbortController | null>(null);
  const bookInFlightRef = useRef<boolean>(false);
  const cancelInFlightRef = useRef<boolean>(false);
  const prefilledOnceRef = useRef<boolean>(false);

  const fetchSchedule = useCallback(async () => {
    if (!bookingCode) return;
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
    }
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    setError('');
    try {
      const forwardQs = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
      const targetUrl = `${API_URL}/academic/public-1on1/${encodeURIComponent(bookingCode)}${forwardQs ? `?${forwardQs}` : ''}`;
      const res = await fetch(buildPublicAcademicApiUrl(targetUrl), { signal: controller.signal });
      const json = await res.json();
      if (controller.signal.aborted) return;

      if (json.success && json.data) {
        setConfig(json.data.config || null);
        setBookedSlots(Array.isArray(json.data.booked_slots) ? json.data.booked_slots : []);
        setTimeSlots30m(Array.isArray(json.data.time_slots_30m) ? json.data.time_slots_30m : []);
        setTeachingBusy(Array.isArray(json.data.teaching_busy) ? json.data.teaching_busy : []);

        const prefill = json.data.student_prefill;
        if (prefill && !prefilledOnceRef.current) {
          prefilledOnceRef.current = true;
          if (prefill.contact_id) setPrefillContactId(Number(prefill.contact_id) || null);
          setStudentName((prev) => prev || String(prefill.student_name || ''));
          setStudentCode((prev) => prev || String(prefill.student_code || ''));
          setStudentEmail((prev) => prev || String(prefill.student_email || ''));
          setStudentPhone((prev) => prev || String(prefill.student_phone || ''));
        }
      } else {
        setError(json.message || 'Không tìm thấy lịch đăng ký hướng dẫn 1:1.');
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setError('Không thể kết nối máy chủ. Vui lòng thử lại sau.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [bookingCode]);

  useEffect(() => {
    fetchSchedule();
    return () => {
      if (fetchAbortRef.current) fetchAbortRef.current.abort();
      if (submitAbortRef.current) submitAbortRef.current.abort();
    };
  }, [fetchSchedule]);

  // Compute exact local date for each day column from week_start_date (avoids GMT+7 UTC -1 day shift)
  const getDayDateInfo = (dayIdx: number): { dateStr: string; shortDisplay: string } => {
    const baseStr = config?.week_start_date;
    if (!baseStr) {
      const now = new Date();
      now.setDate(now.getDate() + dayIdx);
      const iso = getLocalDateStr(now);
      return {
        dateStr: iso,
        shortDisplay: `${String(now.getDate()).padStart(2, '0')}/${String(
          now.getMonth() + 1
        ).padStart(2, '0')}`,
      };
    }
    const d = parseLocalYmd(baseStr);
    if (!d) {
      return { dateStr: String(baseStr), shortDisplay: '' };
    }
    d.setDate(d.getDate() + dayIdx);
    const iso = getLocalDateStr(d);
    return {
      dateStr: iso,
      shortDisplay: `${String(d.getDate()).padStart(2, '0')}/${String(
        d.getMonth() + 1
      ).padStart(2, '0')}`,
    };
  };

  // Match strictly by exact calendar date + slot range (no day_of_week fallback collision across weeks)
  const findBookingForCell = (dateStr: string, slotRange: string) => {
    const { start: targetStart } = parseSlotBounds(slotRange);
    return bookedSlots.find((b) => {
      const bDate = String(b?.booking_date || b?.slot_date || '').slice(0, 10);
      if (bDate !== dateStr) return false;
      if (b?.slot_range === slotRange) return true;
      const bStart = String(b?.slot_time_start || '').slice(0, 5);
      return Boolean(bStart && targetStart && bStart === targetStart);
    });
  };

  // Check collision against lecturer teaching schedule in marketing_campaigns
  const getTeachingBusyLabel = (dateStr: string, slotRange: string): string | null => {
    const { start, end } = parseSlotBounds(slotRange);
    const slotStartMin = hmToMinutes(start);
    const slotEndMin = hmToMinutes(end);
    if (slotStartMin < 0 || slotEndMin < 0) return null;

    for (const busy of teachingBusy) {
      if (String(busy?.date || '').slice(0, 10) !== dateStr) continue;
      const busyStartMin = hmToMinutes(busy.start || '');
      const busyEndMin = hmToMinutes(busy.end || '');
      if (busyStartMin >= 0 && busyEndMin > busyStartMin && slotStartMin < busyEndMin && slotEndMin > busyStartMin) {
        return busy.label || 'Lịch giảng dạy';
      }
    }
    return null;
  };

  // Enforce past slots and min_advance_hours cutoff (local GMT+7 time)
  const getCutoffReason = (dateStr: string, slotRange: string): string | null => {
    const { start } = parseSlotBounds(slotRange);
    const base = parseLocalYmd(dateStr);
    if (!base || !start) return null;
    const [hh, mm] = start.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
    base.setHours(hh, mm, 0, 0);

    const nowMs = Date.now();
    if (base.getTime() <= nowMs) {
      return 'Khung giờ đã qua';
    }
    const minAdvHours = Math.max(0, Number(config?.min_advance_hours || 0));
    if (minAdvHours > 0 && base.getTime() < nowMs + minAdvHours * 3600000) {
      return `Cần đặt trước ít nhất ${minAdvHours} giờ`;
    }
    return null;
  };

  const { afternoonSlots, eveningSlots } = useMemo(() => {
    const dynamicRaw = Array.isArray(timeSlots30m) && timeSlots30m.length > 0
      ? timeSlots30m.filter((s): s is string => typeof s === 'string' && s.includes('-'))
      : [...AFTERNOON_SLOTS, ...EVENING_SLOTS];
    const aft = dynamicRaw.filter((s) => parseSlotBounds(s).start < '18:00');
    const eve = dynamicRaw.filter((s) => parseSlotBounds(s).start >= '18:00');
    return {
      afternoonSlots: aft.length > 0 ? aft : AFTERNOON_SLOTS,
      eveningSlots: eve.length > 0 ? eve : EVENING_SLOTS,
    };
  }, [timeSlots30m]);

  const slotDuration = Number(config?.slot_duration_minutes ?? config?.slot_duration) || 30;

  const handleBookSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bookInFlightRef.current || submitting) return;
    if (!bookingCode) return;

    if (!selectedCell) {
      setSubmitError('Vui lòng bấm chọn 1 khung giờ còn trống trên bảng lịch.');
      return;
    }
    if (!studentName.trim()) {
      setSubmitError('Vui lòng nhập Họ và tên Học viên.');
      return;
    }
    const trimmedEmail = studentEmail.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setSubmitError('Vui lòng nhập địa chỉ Email hợp lệ để nhận lịch.');
      return;
    }

    const cutoff = getCutoffReason(selectedCell.dateStr, selectedCell.slotRange);
    if (cutoff) {
      setSubmitError(cutoff);
      return;
    }

    bookInFlightRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    setCancelNotice('');

    if (submitAbortRef.current) {
      submitAbortRef.current.abort();
    }
    const controller = new AbortController();
    submitAbortRef.current = controller;

    const { start: slotStart, end: slotEnd } = parseSlotBounds(selectedCell.slotRange);

    try {
      const forwardQs = typeof window !== 'undefined' ? window.location.search.replace(/^\?/, '') : '';
      const targetUrl = `${API_URL}/academic/public-1on1/${encodeURIComponent(bookingCode)}/book${forwardQs ? `?${forwardQs}` : ''}`;
      const res = await fetch(buildPublicAcademicApiUrl(targetUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          student_name: studentName.trim(),
          student_code: studentCode.trim(),
          student_email: trimmedEmail,
          student_phone: studentPhone.trim(),
          contact_id: prefillContactId || undefined,
          booking_date: selectedCell.dateStr,
          slot_date: selectedCell.dateStr,
          day_of_week: selectedCell.dayKey,
          slot_range: selectedCell.slotRange,
          slot_time_start: slotStart,
          slot_time_end: slotEnd,
          topic: topic.trim(),
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        setBookingResult(json.data);
        setSelectedCell(null);
        setShowCancelPrompt(false);
        setCancelReason('');
        fetchSchedule();
      } else {
        setSubmitError(
          json.message || 'Khung giờ này hiện không khả dụng hoặc vừa có học viên khác đăng ký. Vui lòng chọn khung giờ khác.'
        );
        fetchSchedule();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setSubmitError('Lỗi kết nối khi gửi đăng ký. Vui lòng thử lại.');
    } finally {
      bookInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSelfCancelBooking = async (rescheduleMode: boolean) => {
    if (!bookingResult || !bookingCode || cancelInFlightRef.current || canceling) return;
    cancelInFlightRef.current = true;
    setCanceling(true);
    setCancelNotice('');
    try {
      const cancelToken = bookingResult.cancel_token || bookingResult.manage_token || bookingResult.token || '';
      const res = await fetch(
        buildPublicAcademicApiUrl(`${API_URL}/academic/public-1on1/${encodeURIComponent(bookingCode)}/cancel`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            booking_id: bookingResult.booking_id || bookingResult.id,
            cancel_token: cancelToken,
            student_email: studentEmail.trim(),
            reason: cancelReason.trim() || (rescheduleMode ? 'Học viên chủ động đổi khung giờ' : 'Học viên chủ động hủy lịch'),
          }),
        }
      );
      const json = await res.json().catch(() => ({ success: false, message: 'Máy chủ chưa hỗ trợ hủy lịch trực tuyến.' }));
      if (res.ok && json.success) {
        setBookingResult(null);
        setShowCancelPrompt(false);
        setCancelReason('');
        setCancelNotice(
          rescheduleMode
            ? 'Đã giải phóng khung giờ cũ. Vui lòng chọn khung giờ mới trên bảng lịch.'
            : 'Đã hủy lịch hẹn 1:1 thành công.'
        );
        fetchSchedule();
      } else {
        setCancelNotice(
          json?.message || 'Để hủy/đổi lịch hẹn này, vui lòng liên hệ trực tiếp Ban Học vụ hoặc dùng link trong email xác nhận.'
        );
      }
    } catch {
      setCancelNotice('Không thể kết nối máy chủ để hủy lịch. Vui lòng thử lại hoặc liên hệ Ban Học vụ.');
    } finally {
      cancelInFlightRef.current = false;
      setCanceling(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div style={{ textAlign: 'center', color: '#334155' }}>
          <Loader2
            size={32}
            className="animate-spin"
            color="#BD1D2D"
            style={{ margin: '0 auto 10px' }}
          />
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            Đang tải Bảng lịch đăng ký Hướng dẫn 1:1...
          </div>
        </div>
      </div>
    );
  }

  if (error || !config) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#f8fafc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            background: '#ffffff',
            padding: '28px',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            textAlign: 'center',
          }}
        >
          <AlertCircle size={40} color="#BD1D2D" style={{ margin: '0 auto 12px' }} />
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
            Không tìm thấy Lịch đăng ký Hướng dẫn 1:1
          </h2>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '16px' }}>
            {error || 'Đường dẫn đăng ký không tồn tại hoặc đã đóng.'}
          </p>
          <button
            type="button"
            onClick={fetchSchedule}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <RefreshCw size={14} /> Thử tải lại lịch
          </button>
        </div>
      </div>
    );
  }

  const availMap =
    config.available_slots && typeof config.available_slots === 'object'
      ? config.available_slots
      : {};

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f1f5f9',
        padding: '24px 16px 60px',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: '1240px', margin: '0 auto' }}>
        {/* Top Institute Branding Bar */}
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #e2e8f0',
            padding: '18px 24px',
            marginBottom: '18px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '14px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '12px',
                background: '#BD1D2D',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
                fontSize: '1.1rem',
              }}
            >
              1:1
            </div>
            <div>
              <div
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#BD1D2D',
                }}
              >
                {getTenantOrganizationName().toUpperCase()} • ACADEMIC AFFAIRS PORTAL
              </div>
              <h1
                style={{
                  fontSize: '1.2rem',
                  fontWeight: 800,
                  color: '#0f172a',
                  margin: '2px 0',
                }}
              >
                {config.title || `${config.week_label} — ${config.subject_name}`}
              </h1>
              <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                Giảng viên hướng dẫn:{' '}
                <strong style={{ color: '#0f172a' }}>{config.lecturer_name}</strong> • Môn học:{' '}
                <strong style={{ color: '#0f172a' }}>{config.subject_name}</strong> • Thời lượng:{' '}
                <strong>{slotDuration} phút / học viên</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.76rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontWeight: 700,
                color: '#0f172a',
              }}
            >
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  background: '#ffffff',
                  border: '2px solid #BD1D2D',
                }}
              />
              Ô Trắng: Khung giờ trống (Bấm chọn)
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                fontWeight: 700,
                color: '#BD1D2D',
              }}
            >
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  background: '#fee2e2',
                  border: '1px solid #BD1D2D',
                }}
              />
              Đã có HV đặt
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 10px',
                borderRadius: '8px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                fontWeight: 700,
                color: '#475569',
              }}
            >
              <span
                style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '3px',
                  background: '#64748b',
                }}
              />
              Bận / Đã qua giờ
            </span>
          </div>
        </div>

        {/* Main 2-Column Layout: Left = Class Schedule 30m Matrix | Right = Instructions & 1-Flow Booking Form */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))',
            gap: '18px',
            alignItems: 'start',
          }}
        >
          {/* LEFT: Weekly 30-Minute Schedule Table (Matching Trâm's exact screenshot) */}
          <div
            style={{
              gridColumn: 'span 1',
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}
          >
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.76rem',
                  textAlign: 'center',
                }}
              >
                <thead>
                  <tr style={{ background: '#BD1D2D', color: '#ffffff' }}>
                    <th
                      colSpan={10}
                      style={{
                        padding: '10px',
                        fontSize: '0.95rem',
                        fontWeight: 800,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {config.week_label || 'Class Schedule'}
                    </th>
                  </tr>
                  <tr style={{ background: '#ffffff', color: '#0f172a', borderBottom: '2px solid #0f172a' }}>
                    <th style={{ padding: '8px 6px', border: '1px solid #cbd5e1', width: '72px' }}>
                      Session
                    </th>
                    <th style={{ padding: '8px 4px', border: '1px solid #cbd5e1', width: '36px' }}>
                      No.
                    </th>
                    <th style={{ padding: '8px 6px', border: '1px solid #cbd5e1', width: '92px' }}>
                      VN Time
                    </th>
                    {DAY_KEYS.map((d, idx) => {
                      const info = getDayDateInfo(idx);
                      return (
                        <th
                          key={d.key}
                          style={{
                            padding: '8px 6px',
                            border: '1px solid #cbd5e1',
                            minWidth: '82px',
                          }}
                        >
                          <div style={{ fontWeight: 800 }}>
                            {d.label}, {info.shortDisplay}
                          </div>
                          <div style={{ fontSize: '0.67rem', color: '#64748b', fontWeight: 600 }}>
                            {d.vnLabel}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* AFTERNOON SLOTS */}
                  {afternoonSlots.map((slot, sIdx) => (
                    <tr key={`pub-aft-${slot}`}>
                      {sIdx === 0 && (
                        <td
                          rowSpan={afternoonSlots.length}
                          style={{
                            border: '1px solid #cbd5e1',
                            fontWeight: 800,
                            color: '#0f172a',
                            background: '#f8fafc',
                          }}
                        >
                          Afternoon
                        </td>
                      )}
                      <td
                        style={{
                          padding: '8px 4px',
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          color: '#475569',
                        }}
                      >
                        {sIdx + 1}
                      </td>
                      <td
                        style={{
                          padding: '8px 6px',
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {slot.replace('-', ' - ')}
                      </td>
                      {DAY_KEYS.map((d, dIdx) => {
                        const info = getDayDateInfo(dIdx);
                        const dayAvail =
                          Array.isArray(availMap[d.key]) && availMap[d.key].includes(slot);
                        const booked = findBookingForCell(info.dateStr, slot);
                        const teachingLabel = getTeachingBusyLabel(info.dateStr, slot);
                        const cutoffReason = getCutoffReason(info.dateStr, slot);
                        const isSelected =
                          selectedCell?.dateStr === info.dateStr && selectedCell?.slotRange === slot;

                        if (!dayAvail || teachingLabel) {
                          return (
                            <td
                              key={`${d.key}-${slot}`}
                              style={{
                                padding: '6px 4px',
                                border: '1px solid #cbd5e1',
                                background: '#64748b',
                                color: '#f1f5f9',
                                fontSize: '0.66rem',
                                fontWeight: 600,
                                cursor: 'not-allowed',
                              }}
                              title={teachingLabel || 'Khung giờ Giảng viên bận'}
                            >
                              {teachingLabel ? 'Giờ dạy' : ''}
                            </td>
                          );
                        }

                        if (booked) {
                          const bookedName = booked.is_masked
                            ? 'Slot đã được đặt'
                            : (booked.student_name || 'Slot đã được đặt');
                          return (
                            <td
                              key={`${d.key}-${slot}`}
                              style={{
                                padding: '6px 4px',
                                border: '1px solid #fca5a5',
                                background: '#fef2f2',
                                color: '#991b1b',
                                fontSize: '0.69rem',
                                fontWeight: 700,
                                cursor: 'not-allowed',
                              }}
                              title={booked.is_masked ? 'Khung giờ đã có học viên đăng ký' : `Đã đăng ký bởi: ${bookedName}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                <Lock size={10} /> Đã đặt
                              </div>
                              <div
                                style={{
                                  fontSize: '0.65rem',
                                  color: '#BD1D2D',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '78px',
                                  margin: '0 auto',
                                }}
                              >
                                {bookedName}
                              </div>
                            </td>
                          );
                        }

                        if (cutoffReason) {
                          return (
                            <td
                              key={`${d.key}-${slot}`}
                              style={{
                                padding: '6px 4px',
                                border: '1px solid #e2e8f0',
                                background: '#e2e8f0',
                                color: '#64748b',
                                fontSize: '0.66rem',
                                fontWeight: 600,
                                cursor: 'not-allowed',
                              }}
                              title={cutoffReason}
                            >
                              Đã đóng
                            </td>
                          );
                        }

                        return (
                          <td
                            key={`${d.key}-${slot}`}
                            onClick={() => {
                              setSelectedCell({
                                dayKey: d.key,
                                dayLabel: `${d.vnLabel} (${info.shortDisplay})`,
                                dateStr: info.dateStr,
                                slotRange: slot,
                              });
                              setBookingResult(null);
                              setSubmitError('');
                              setCancelNotice('');
                            }}
                            style={{
                              padding: '8px 6px',
                              border: isSelected
                                ? '2px solid #BD1D2D'
                                : '1px solid #cbd5e1',
                              background: isSelected ? '#fef2f2' : '#ffffff',
                              color: isSelected ? '#BD1D2D' : '#0f172a',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.12s',
                            }}
                          >
                            {isSelected ? '✓ Đang chọn' : 'Đăng ký'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* RED DIVIDER ROW */}
                  <tr>
                    <td colSpan={10} style={{ height: '14px', background: '#BD1D2D', padding: 0 }} />
                  </tr>

                  {/* EVENING SLOTS */}
                  {eveningSlots.map((slot, sIdx) => (
                    <tr key={`pub-eve-${slot}`}>
                      {sIdx === 0 && (
                        <td
                          rowSpan={eveningSlots.length}
                          style={{
                            border: '1px solid #cbd5e1',
                            fontWeight: 800,
                            color: '#0f172a',
                            background: '#f8fafc',
                          }}
                        >
                          Evening
                        </td>
                      )}
                      <td
                        style={{
                          padding: '8px 4px',
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          color: '#475569',
                        }}
                      >
                        {sIdx + 1}
                      </td>
                      <td
                        style={{
                          padding: '8px 6px',
                          border: '1px solid #cbd5e1',
                          fontWeight: 700,
                          color: '#0f172a',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {slot.replace('-', ' - ')}
                      </td>
                      {DAY_KEYS.map((d, dIdx) => {
                        const info = getDayDateInfo(dIdx);
                        const dayAvail =
                          Array.isArray(availMap[d.key]) && availMap[d.key].includes(slot);
                        const booked = findBookingForCell(info.dateStr, slot);
                        const teachingLabel = getTeachingBusyLabel(info.dateStr, slot);
                        const cutoffReason = getCutoffReason(info.dateStr, slot);
                        const isSelected =
                          selectedCell?.dateStr === info.dateStr && selectedCell?.slotRange === slot;

                        if (!dayAvail || teachingLabel) {
                          return (
                            <td
                              key={`${d.key}-${slot}`}
                              style={{
                                padding: '6px 4px',
                                border: '1px solid #cbd5e1',
                                background: '#64748b',
                                color: '#f1f5f9',
                                fontSize: '0.66rem',
                                fontWeight: 600,
                                cursor: 'not-allowed',
                              }}
                              title={teachingLabel || 'Khung giờ Giảng viên bận'}
                            >
                              {teachingLabel ? 'Giờ dạy' : ''}
                            </td>
                          );
                        }

                        if (booked) {
                          const bookedName = booked.is_masked
                            ? 'Slot đã được đặt'
                            : (booked.student_name || 'Slot đã được đặt');
                          return (
                            <td
                              key={`${d.key}-${slot}`}
                              style={{
                                padding: '6px 4px',
                                border: '1px solid #fca5a5',
                                background: '#fef2f2',
                                color: '#991b1b',
                                fontSize: '0.69rem',
                                fontWeight: 700,
                                cursor: 'not-allowed',
                              }}
                              title={booked.is_masked ? 'Khung giờ đã có học viên đăng ký' : `Đã đăng ký bởi: ${bookedName}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                <Lock size={10} /> Đã đặt
                              </div>
                              <div
                                style={{
                                  fontSize: '0.65rem',
                                  color: '#BD1D2D',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '78px',
                                  margin: '0 auto',
                                }}
                              >
                                {bookedName}
                              </div>
                            </td>
                          );
                        }

                        if (cutoffReason) {
                          return (
                            <td
                              key={`${d.key}-${slot}`}
                              style={{
                                padding: '6px 4px',
                                border: '1px solid #e2e8f0',
                                background: '#e2e8f0',
                                color: '#64748b',
                                fontSize: '0.66rem',
                                fontWeight: 600,
                                cursor: 'not-allowed',
                              }}
                              title={cutoffReason}
                            >
                              Đã đóng
                            </td>
                          );
                        }

                        return (
                          <td
                            key={`${d.key}-${slot}`}
                            onClick={() => {
                              setSelectedCell({
                                dayKey: d.key,
                                dayLabel: `${d.vnLabel} (${info.shortDisplay})`,
                                dateStr: info.dateStr,
                                slotRange: slot,
                              });
                              setBookingResult(null);
                              setSubmitError('');
                              setCancelNotice('');
                            }}
                            style={{
                              padding: '8px 6px',
                              border: isSelected
                                ? '2px solid #BD1D2D'
                                : '1px solid #cbd5e1',
                              background: isSelected ? '#fef2f2' : '#ffffff',
                              color: isSelected ? '#BD1D2D' : '#0f172a',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.12s',
                            }}
                          >
                            {isSelected ? '✓ Đang chọn' : 'Đăng ký'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT: Registration Form + Bilingual Steps + Instant Google Calendar Confirmation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {cancelNotice && (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '12px 16px',
                  fontSize: '0.82rem',
                  color: '#0f172a',
                  fontWeight: 600,
                }}
              >
                {cancelNotice}
              </div>
            )}
            {/* Success Confirmation Card with Google Calendar + .ics + Cancel/Reschedule */}
            {bookingResult ? (
              <div
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '22px',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <CheckCircle2 size={24} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      Đăng Ký Lịch Hướng Dẫn 1:1 Thành Công!
                    </h3>
                    <div style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 600 }}>
                      Lịch đã tự động tạo trên Hệ thống & gửi thông báo đến Giảng viên
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    background: '#f8fafc',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    fontSize: '0.82rem',
                    lineHeight: 1.7,
                    marginBottom: '14px',
                  }}
                >
                  <div>
                    • <strong>Học viên:</strong> {bookingResult.student_name}
                  </div>
                  <div>
                    • <strong>Giảng viên hướng dẫn:</strong> {config.lecturer_name}
                  </div>
                  <div>
                    • <strong>Môn học:</strong> {config.subject_name}
                  </div>
                  <div>
                    • <strong>Khung giờ đã khóa:</strong>{' '}
                    <span style={{ color: '#BD1D2D', fontWeight: 800 }}>
                      {bookingResult.booking_date} | {bookingResult.slot_range} ({slotDuration} phút)
                    </span>
                  </div>
                  {sanitizeSafeUrl(bookingResult.meeting_link) && (
                    <div>
                      • <strong>Link lớp hướng dẫn:</strong>{' '}
                      <a
                        href={sanitizeSafeUrl(bookingResult.meeting_link)}
                        target="_blank"
                        rel="noreferrer"
                        style={{ color: '#BD1D2D', fontWeight: 700 }}
                      >
                        {bookingResult.meeting_link}
                      </a>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {sanitizeSafeUrl(bookingResult.google_calendar_url) && (
                    <a
                      href={sanitizeSafeUrl(bookingResult.google_calendar_url)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        flex: 1,
                        minWidth: '210px',
                        padding: '10px 14px',
                        borderRadius: '9px',
                        background: '#BD1D2D',
                        color: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 800,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Calendar size={15} />
                      Thêm vào Google Calendar
                    </a>
                  )}
                  {bookingResult.ics_data_uri && (
                    <a
                      href={bookingResult.ics_data_uri}
                      download={`Mentoring-1on1-${bookingResult.booking_date}.ics`}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '9px',
                        background: '#0f172a',
                        color: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <Download size={15} />
                      Tải File Lịch (.ics)
                    </a>
                  )}
                </div>

                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      disabled={canceling}
                      onClick={() => handleSelfCancelBooking(true)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: canceling ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <RefreshCw size={13} /> Đổi khung giờ khác
                    </button>
                    <button
                      type="button"
                      disabled={canceling}
                      onClick={() => setShowCancelPrompt((v) => !v)}
                      style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        color: '#BD1D2D',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: canceling ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                    >
                      <XCircle size={13} /> Hủy lịch hẹn này
                    </button>
                  </div>
                  {showCancelPrompt && (
                    <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Lý do hủy lịch (tùy chọn)..."
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.78rem',
                        }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => setShowCancelPrompt(false)}
                          style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                        >
                          Giữ lịch
                        </button>
                        <button
                          type="button"
                          disabled={canceling}
                          onClick={() => handleSelfCancelBooking(false)}
                          style={{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: '#BD1D2D', color: '#ffffff', fontSize: '0.75rem', fontWeight: 700, cursor: canceling ? 'not-allowed' : 'pointer' }}
                        >
                          {canceling ? 'Đang xử lý...' : 'Xác nhận Hủy'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Booking Form Card */
              <form
                onSubmit={handleBookSlot}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  border: '1px solid #e2e8f0',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.92rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Calendar size={17} color="#BD1D2D" />
                  ĐĂNG KÝ KHUNG GIỜ HƯỚNG DẪN 1:1 (30 PHÚT)
                </div>

                {/* Selected Slot Pill */}
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: selectedCell ? '#fef2f2' : '#f8fafc',
                    border: `1.5px solid ${selectedCell ? '#BD1D2D' : '#cbd5e1'}`,
                    marginBottom: '12px',
                  }}
                >
                  {selectedCell ? (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#991b1b' }}>
                        KHUNG GIỜ BẠN ĐANG CHỌN:
                      </div>
                      <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#BD1D2D' }}>
                        {selectedCell.dayLabel} • {selectedCell.slotRange} ({slotDuration} phút)
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.8rem', color: '#475569', fontWeight: 600 }}>
                      Bước 1: Hãy bấm vào một ô <strong>"Đăng ký"</strong> màu trắng trên bảng
                      lịch bên trái để chọn khung giờ 30 phút.
                    </div>
                  )}
                </div>

                {submitError && (
                  <div
                    style={{
                      marginBottom: '12px',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                    }}
                  >
                    {submitError}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: '4px',
                      }}
                    >
                      Họ và tên Học viên (Full Name) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Nguyễn Văn A"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.82rem',
                      }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#334155',
                          marginBottom: '4px',
                        }}
                      >
                        Email nhận Lịch Google Calendar *
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="hocvien@gmail.com"
                        value={studentEmail}
                        onChange={(e) => setStudentEmail(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.82rem',
                        }}
                      />
                    </div>

                    <div>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          color: '#334155',
                          marginBottom: '4px',
                        }}
                      >
                        Số điện thoại / Zalo *
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="09xx xxx xxx"
                        value={studentPhone}
                        onChange={(e) => setStudentPhone(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          border: '1px solid #cbd5e1',
                          fontSize: '0.82rem',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: '4px',
                      }}
                    >
                      Mã học viên / Chương trình học (Student ID)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: MBA-AI-26-0244"
                      value={studentCode}
                      onChange={(e) => setStudentCode(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.82rem',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        color: '#334155',
                        marginBottom: '4px',
                      }}
                    >
                      Nội dung / Đề tài cần Giảng viên hướng dẫn 1:1
                    </label>
                    <textarea
                      rows={2}
                      placeholder="VD: Duyệt đề cương Capstone Project / Sửa chương 2..."
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.82rem',
                        resize: 'vertical',
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting || !selectedCell}
                    style={{
                      marginTop: '4px',
                      width: '100%',
                      padding: '11px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: selectedCell ? '#BD1D2D' : '#94a3b8',
                      color: '#ffffff',
                      fontSize: '0.86rem',
                      fontWeight: 800,
                      cursor: submitting || !selectedCell ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      boxShadow: selectedCell ? '0 4px 12px rgba(189, 29, 45, 0.25)' : 'none',
                    }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Đang khóa lịch & Gửi thông báo cho Giảng viên...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />
                        Xác Nhận Đăng Ký Khung Giờ Này
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Bilingual Registration Steps Card (Exact Match to Screenshot 4) */}
            <div
              style={{
                background: '#ffffff',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                padding: '18px 20px',
                fontSize: '0.78rem',
                lineHeight: 1.6,
                color: '#1e293b',
              }}
            >
              <div
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: '#BD1D2D',
                  textAlign: 'center',
                  marginBottom: '8px',
                }}
              >
                Các bước đăng ký lịch Hướng dẫn 1:1
              </div>
              <div style={{ whiteSpace: 'pre-line', marginBottom: '10px' }}>
                {config.notes_vn}
              </div>
              <div
                style={{
                  padding: '8px 10px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: '0.74rem',
                  marginBottom: '12px',
                }}
              >
                <strong>*Lưu ý:</strong> Hình thức hướng dẫn trực tuyến qua Zoom/Google Meet. Ngay
                sau khi bấm xác nhận, lịch hẹn sẽ tự động gắn vào{' '}
                <strong>Google Calendar</strong> của Học viên và Giảng viên.
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '12px 0' }} />

              <div
                style={{
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  color: '#BD1D2D',
                  textAlign: 'center',
                  marginBottom: '8px',
                }}
              >
                Registration Steps
              </div>
              <div style={{ whiteSpace: 'pre-line' }}>{config.notes_en}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicBooking1on1Page;
