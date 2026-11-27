import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { fetchAPI } from '../utils/api';
import {
  FileText, CheckCircle, ShieldCheck, PenTool,
  Clock, DollarSign, Award, Percent, Download, AlertCircle, Loader2,
  Calendar, Wallet
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { useTenantConfig, useTypedSubSetting } from '../contexts/TenantConfigContext';
import { CustomSelect } from '../components/ui/CustomSelect';
import { VietnameseDateInput } from '../components/ui/VietnameseDateInput';
import { EmptyCard } from '../components/ui/EmptyCard';
import { CustomModal } from '../components/ui/CustomModal';
import { AnimatePresence } from 'framer-motion';
import { ensureArray, extractArray } from '../utils/safeArray';
import { formatDateVN, formatDateTimeVN, getLocalDateStr } from '../utils/dateUtils';

const ApprovalDetailDrawer = lazy(() => import('../components/common/ApprovalDetailDrawer').then(m => ({ default: m.ApprovalDetailDrawer })));

const isAbortErr = (err: any) =>
  err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED';

export default function MyPayslips() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { config: tenantConfig } = useTenantConfig();
  const orgProfile = tenantConfig?.organization;
  const policyGraceMale = Number(useTypedSubSetting<number>('hrm.attendance_and_checkin_policy', 'late_grace_male', 30));
  const policyGraceFemale = Number(useTypedSubSetting<number>('hrm.attendance_and_checkin_policy', 'late_grace_female', 60));
  const policyGraceDefault = Number(useTypedSubSetting<number>('hrm.attendance_and_checkin_policy', 'late_grace_default', 30));
  const policyOtWeekday = Number(useTypedSubSetting<number>('hrm.ot_and_kpi_multipliers', 'ot_weekday', 1.5));
  const [activeSubTab, setActiveSubTab] = useState<'payslip' | 'leaves' | 'advances'>('payslip');

  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [disputeNote, setDisputeNote] = useState('');
  const [sendingDispute, setSendingDispute] = useState(false);

  const getPeriodLabel = (periodStr: string) => {
    const parts = periodStr.split('-');
    if (parts.length < 2) return periodStr;
    const year = parts[0];
    const period = parts[1];
    if (period === '13') return `${t('Lương tháng 13')} - ${t('Năm')} ${year}`;
    if (period === 'MID') return `${t('Thưởng giữa năm')} - ${t('Năm')} ${year}`;
    if (period === 'YEND') return `${t('Thưởng cuối năm')} - ${t('Năm')} ${year}`;
    return `${t('Tháng')} ${period}/${year}`;
  };

  const getTitleLabel = (periodStr: string) => {
    const parts = periodStr.split('-');
    if (parts.length < 2) return t('BẢNG THANH TOÁN TIỀN LƯƠNG');
    const period = parts[1];
    if (period === '13') return t('PHIẾU THANH TOÁN LƯƠNG THÁNG 13');
    if (period === 'MID') return t('PHIẾU THANH TOÁN TIỀN THƯỞNG GIỮA NĂM');
    if (period === 'YEND') return t('PHIẾU THANH TOÁN TIỀN THƯỞNG CUỐI NĂM');
    return t('BẢNG THANH TOÁN TIỀN LƯƠNG & PHỤ CẤP');
  };

  const periodOptions = React.useMemo(() => {
    const currentYear = new Date().getFullYear();
    const years = [currentYear, currentYear - 1];
    const options: { value: string; label: string }[] = [];
    
    years.forEach(yr => {
      // Special periods
      options.push({ value: `${yr}-YEND`, label: `${t('Thưởng cuối năm')} - ${yr}` });
      options.push({ value: `${yr}-13`, label: `${t('Lương tháng 13')} - ${yr}` });
      options.push({ value: `${yr}-MID`, label: `${t('Thưởng giữa năm')} - ${yr}` });
      
      // 12 standard months
      for (let m = 12; m >= 1; m--) {
        const val = `${yr}-${String(m).padStart(2, '0')}`;
        options.push({
          value: val,
          label: `${t('Tháng')} ${String(m).padStart(2, '0')}/${yr}`
        });
      }
    });
    
    return options;
  }, [t]);
  
  // Custom states for multi-level approval & CCs
  const [users, setUsers] = useState<any[]>([]);
  const [leaveApproverId, setLeaveApproverId] = useState<string | number>('');
  const [leaveApproverId2, setLeaveApproverId2] = useState<string | number>('');
  const [leaveRelatedUserIds, setLeaveRelatedUserIds] = useState<any[]>([]);

  const [advanceApproverId, setAdvanceApproverId] = useState<string | number>('');
  const [advanceApproverId2, setAdvanceApproverId2] = useState<string | number>('');
  const [advanceRelatedUserIds, setAdvanceRelatedUserIds] = useState<any[]>([]);

  // Tab 1: Payslip states
  const [selectedMonth, setSelectedMonth] = useState(() => getLocalDateStr().substring(0, 7));
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [allPayslips, setAllPayslips] = useState<any[]>([]);
  const [loadingPayslips, setLoadingPayslips] = useState<boolean>(true);
  const [payslip, setPayslip] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hasSignatureRef = useRef<boolean>(false);
  const [isDrawing, setIsDrawing] = useState(false);

  const confirmInFlightRef = useRef(false);
  const disputeInFlightRef = useRef(false);
  const leaveInFlightRef = useRef(false);
  const advanceInFlightRef = useRef(false);
  const allPayslipsAbortRef = useRef<AbortController | null>(null);
  const payslipAbortRef = useRef<AbortController | null>(null);
  const leavesAbortRef = useRef<AbortController | null>(null);
  const advancesAbortRef = useRef<AbortController | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Company configuration states (seeded from TenantConfig organization, zero hardcoded tenant details)
  const [companyName, setCompanyName] = useState<string>(() => orgProfile?.name || '');
  const [companyAddress, setCompanyAddress] = useState<string>(() => orgProfile?.address || '');
  const [companyPhone, setCompanyPhone] = useState<string>(() => orgProfile?.support_hotline || '');
  const [companyTaxId, setCompanyTaxId] = useState<string>(() => orgProfile?.tax_id || '');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string>(() => orgProfile?.logo_url || '');

  useEffect(() => {
    if (orgProfile) {
      setCompanyName(prev => prev || orgProfile.name || '');
      setCompanyAddress(prev => prev || orgProfile.address || '');
      setCompanyPhone(prev => prev || orgProfile.support_hotline || '');
      setCompanyTaxId(prev => prev || orgProfile.tax_id || '');
      setCompanyLogoUrl(prev => prev || orgProfile.logo_url || '');
    }
  }, [orgProfile]);

  useEffect(() => {
    let active = true;
    fetchAPI('get_settings').then(res => {
      if (!active) return;
      if (res && res.success && res.data) {
        if (res.data.company_name) setCompanyName(res.data.company_name);
        if (res.data.company_address) setCompanyAddress(res.data.company_address);
        if (res.data.company_phone) setCompanyPhone(res.data.company_phone);
        if (res.data.company_tax_id) setCompanyTaxId(res.data.company_tax_id);
        if (res.data.company_logo_url) setCompanyLogoUrl(res.data.company_logo_url);
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  // Tab 2: Leaves states & balance
  const [myBalance, setMyBalance] = useState<any>(null);
  const [leavesList, setLeavesList] = useState<any[]>([]);
  const [loadingLeaves, setLoadingLeaves] = useState(false);
  const [leaveType, setLeaveType] = useState('annual');
  const [leaveStart, setLeaveStart] = useState(() => getLocalDateStr());
  const [leaveEnd, setLeaveEnd] = useState(() => getLocalDateStr());
  const [leaveTotalDays, setLeaveTotalDays] = useState(1.0);
  const [leaveReason, setLeaveReason] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);

  // Tab 3: Advances states
  const [advancesList, setAdvancesList] = useState<any[]>([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [advanceReason, setAdvanceReason] = useState('');
  const [submittingAdvance, setSubmittingAdvance] = useState(false);
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<any | null>(null);

  // Fetch users list
  useEffect(() => {
    const controller = new AbortController();
    fetchAPI('users?all=1', { signal: controller.signal }).then(res => {
      setUsers(extractArray(res));
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  const userOptions = React.useMemo(() => {
    return ensureArray(users).map((u: any) => ({
      value: u.id,
      label: u.full_name || u.username || `User #${u.id}`,
      avatar: u.avatar_url || u.avatar,
      sublabel: u.role ? String(u.role).toUpperCase() : ''
    }));
  }, [users]);

  const approver2Options = React.useMemo(() => {
    return [
      { value: '', label: t('Không có (Chỉ duyệt 1 cấp)') },
      ...userOptions
    ];
  }, [userOptions, t]);

  const loadAllPayslips = useCallback(async () => {
    allPayslipsAbortRef.current?.abort();
    const controller = new AbortController();
    allPayslipsAbortRef.current = controller;
    setLoadingPayslips(true);
    try {
      const uidQs = user?.id ? `&user_id=${user.id}` : '';
      const res = await fetchAPI(`hrm/payroll?month_year=all${uidQs}`, { signal: controller.signal });
      const rows = extractArray(res).filter((p: any) => !user?.id || Number(p?.user_id) === Number(user.id));
      setAllPayslips(rows);
    } catch (err: any) {
      if (isAbortErr(err)) return;
      setAllPayslips([]);
    } finally {
      if (allPayslipsAbortRef.current === controller) {
        setLoadingPayslips(false);
      }
    }
  }, [user?.id]);

  const loadPayslip = useCallback(async () => {
    payslipAbortRef.current?.abort();
    const controller = new AbortController();
    payslipAbortRef.current = controller;
    try {
      const uidQs = user?.id ? `&user_id=${user.id}` : '';
      const res = await fetchAPI(`hrm/payroll?month_year=${encodeURIComponent(selectedMonth)}${uidQs}`, { signal: controller.signal });
      const rows = extractArray(res).filter((p: any) => !user?.id || Number(p?.user_id) === Number(user.id));
      if (rows.length > 0) {
        setPayslip((prev: any) => {
          if (!prev?.id) return rows[0];
          return rows.find((p: any) => p.id === prev.id) || rows[0];
        });
      } else {
        setPayslip(null);
      }
    } catch (err: any) {
      if (isAbortErr(err)) return;
      setPayslip(null);
    }
  }, [selectedMonth, user?.id]);

  const loadLeaves = useCallback(async () => {
    leavesAbortRef.current?.abort();
    const controller = new AbortController();
    leavesAbortRef.current = controller;
    setLoadingLeaves(true);
    try {
      const [resLeaves, resBal] = await Promise.all([
        fetchAPI('hrm/leaves', { signal: controller.signal }),
        fetchAPI('hrm/my-balance', { signal: controller.signal }).catch(() => null),
      ]);
      const rows = extractArray(resLeaves).filter((r: any) => !user?.id || Number(r?.user_id) === Number(user.id));
      setLeavesList(rows);
      if (resBal && resBal.success && resBal.data) {
        setMyBalance(resBal.data);
      } else if (resBal && typeof resBal === 'object' && 'annual_leave_total' in resBal) {
        setMyBalance(resBal);
      }
    } catch (err: any) {
      if (isAbortErr(err)) return;
      setLeavesList([]);
    } finally {
      if (leavesAbortRef.current === controller) {
        setLoadingLeaves(false);
      }
    }
  }, [user?.id]);

  const loadAdvances = useCallback(async () => {
    advancesAbortRef.current?.abort();
    const controller = new AbortController();
    advancesAbortRef.current = controller;
    setLoadingAdvances(true);
    try {
      const res = await fetchAPI('hrm/advances', { signal: controller.signal });
      const rows = extractArray(res).filter((r: any) => !user?.id || Number(r?.user_id) === Number(user.id));
      setAdvancesList(rows);
    } catch (err: any) {
      if (isAbortErr(err)) return;
      setAdvancesList([]);
    } finally {
      if (advancesAbortRef.current === controller) {
        setLoadingAdvances(false);
      }
    }
  }, [user?.id]);

  useEffect(() => {
    loadAllPayslips();
    return () => {
      allPayslipsAbortRef.current?.abort();
      payslipAbortRef.current?.abort();
      leavesAbortRef.current?.abort();
      advancesAbortRef.current?.abort();
    };
  }, [loadAllPayslips]);

  useEffect(() => {
    if (activeSubTab === 'payslip') {
      loadPayslip();
    } else if (activeSubTab === 'leaves') {
      loadLeaves();
    } else if (activeSubTab === 'advances') {
      loadAdvances();
    }
  }, [activeSubTab, selectedMonth, loadPayslip, loadLeaves, loadAdvances]);

  useEffect(() => {
    const safePayslips = ensureArray(allPayslips);
    if (safePayslips.length > 0) {
      const yearPrefix = `${selectedYear}-`;
      const available = safePayslips.filter(p => String(p?.month_year || '').startsWith(yearPrefix));
      if (available.length > 0) {
        const sorted = [...available].sort((a, b) => String(b?.month_year || '').localeCompare(String(a?.month_year || '')));
        if (!available.some(p => p?.month_year === selectedMonth)) {
          setSelectedMonth(sorted[0].month_year);
        }
      } else {
        if (!selectedMonth.startsWith(yearPrefix)) {
          setSelectedMonth(`${selectedYear}-12`);
        }
      }
    }
  }, [allPayslips, selectedYear, selectedMonth]);

  // --- LEAVE SUBMISSION ---
  const handleRequestLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (leaveInFlightRef.current) return;
    if (!leaveStart || !leaveEnd || !leaveReason.trim()) {
      toast.error(t('Vui lòng điền đầy đủ thông tin đăng ký phép!'));
      return;
    }
    if (leaveEnd < leaveStart) {
      toast.error(t('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu!'));
      return;
    }
    if (!leaveTotalDays || leaveTotalDays <= 0) {
      toast.error(t('Số ngày nghỉ phải lớn hơn 0!'));
      return;
    }
    if (!leaveApproverId) {
      toast.error(t('Vui lòng chọn Người duyệt cấp 1!'));
      return;
    }
    leaveInFlightRef.current = true;
    setSubmittingLeave(true);
    try {
      await fetchAPI('hrm/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leave_type: leaveType,
          start_date: leaveStart,
          end_date: leaveEnd,
          total_days: leaveTotalDays,
          reason: leaveReason.trim(),
          approver_id: leaveApproverId,
          approver_id_2: leaveApproverId2 || null,
          related_user_ids: ensureArray(leaveRelatedUserIds)
        })
      });
      toast.success(t('Gửi đơn xin nghỉ phép thành công!'));
      setLeaveReason('');
      setLeaveTotalDays(1.0);
      setLeaveApproverId('');
      setLeaveApproverId2('');
      setLeaveRelatedUserIds([]);
      loadLeaves();
    } catch (err: any) {
      toast.error(err?.message || t('Lỗi gửi đơn nghỉ phép'));
    } finally {
      leaveInFlightRef.current = false;
      setSubmittingLeave(false);
    }
  };

  // --- ADVANCE SUBMISSION ---
  const handleRequestAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (advanceInFlightRef.current) return;
    if (advanceAmount <= 0 || !advanceReason.trim()) {
      toast.error(t('Vui lòng điền số tiền và lý do tạm ứng hợp lệ!'));
      return;
    }
    if (!advanceApproverId) {
      toast.error(t('Vui lòng chọn Người duyệt cấp 1!'));
      return;
    }
    advanceInFlightRef.current = true;
    setSubmittingAdvance(true);
    try {
      await fetchAPI('hrm/advances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: advanceAmount,
          reason: advanceReason.trim(),
          approver_id: advanceApproverId,
          approver_id_2: advanceApproverId2 || null,
          related_user_ids: ensureArray(advanceRelatedUserIds)
        })
      });
      toast.success(t('Gửi đề xuất tạm ứng lương thành công!'));
      setAdvanceAmount(0);
      setAdvanceReason('');
      setAdvanceApproverId('');
      setAdvanceApproverId2('');
      setAdvanceRelatedUserIds([]);
      loadAdvances();
    } catch (err: any) {
      toast.error(err?.message || t('Lỗi gửi yêu cầu tạm ứng'));
    } finally {
      advanceInFlightRef.current = false;
      setSubmittingAdvance(false);
    }
  };

  // --- SIGNATURE DRAWING PAD (HiDPI Retina & Brand Ink) ---
  useEffect(() => {
    if (!isModalOpen || payslip?.status !== 'sent') {
      hasSignatureRef.current = false;
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    const targetW = Math.max(400, Math.round((rect.width || 500) * dpr));
    const targetH = Math.max(120, Math.round((rect.height || 120) * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      hasSignatureRef.current = false;
    }
  }, [isModalOpen, payslip?.id, payslip?.status]);

  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e && e.touches.length > 0 ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const scaleX = canvas.width / (rect.width || 1);
    const scaleY = canvas.height / (rect.height || 1);
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 2.6 * dpr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const { x, y } = getCanvasCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    hasSignatureRef.current = true;
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasSignatureRef.current = false;
  };

  const handleConfirmPayslip = async () => {
    if (confirmInFlightRef.current || !payslip) return;
    const canvas = canvasRef.current;
    if (!canvas || !hasSignatureRef.current) {
      toast.error(t('Vui lòng vẽ chữ ký của bạn trước khi xác nhận!'));
      return;
    }

    confirmInFlightRef.current = true;
    setSubmitting(true);
    const signatureUrl = canvas.toDataURL('image/png');

    try {
      await fetchAPI('hrm/payroll/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payslip.id,
          signature_url: signatureUrl
        })
      });
      toast.success(t('Đã ký nhận và xác nhận phiếu lương thành công!'));
      setPayslip((prev: any) => prev ? { ...prev, status: 'confirmed', signature_url: signatureUrl } : null);
      loadAllPayslips();
      loadPayslip();
    } catch (err: any) {
      toast.error(err?.message || t('Lỗi xác nhận phiếu lương'));
    } finally {
      confirmInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleSendDispute = async () => {
    if (disputeInFlightRef.current) return;
    if (!disputeNote.trim()) {
      toast.error(t('Vui lòng nhập nội dung ghi chú yêu cầu thay đổi!'));
      return;
    }
    if (!payslip) return;

    disputeInFlightRef.current = true;
    setSendingDispute(true);
    try {
      await fetchAPI('hrm/payroll/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: payslip.id,
          action: 'dispute',
          note: disputeNote.trim()
        })
      });
      toast.success(t('Đã gửi yêu cầu thay đổi phiếu lương thành công!'));
      setPayslip((prev: any) => prev ? { ...prev, status: 'disputed', note: disputeNote.trim() } : null);
      setDisputeModalOpen(false);
      setDisputeNote('');
      setIsModalOpen(false);
      loadAllPayslips();
      loadPayslip();
    } catch (err: any) {
      toast.error(err?.message || t('Lỗi khi gửi yêu cầu'));
    } finally {
      disputeInFlightRef.current = false;
      setSendingDispute(false);
    }
  };

  const formatCurrency = (val: number | null | undefined) => {
    const num = Number(val || 0);
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(isNaN(num) ? 0 : num);
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2];

  // Calculate year-to-date payroll stats safely
  const yearPrefix = `${selectedYear}-`;
  const payslipsForSelectedYear = ensureArray(allPayslips).filter((p: any) => String(p?.month_year || '').startsWith(yearPrefix));

  const totalNet = payslipsForSelectedYear.reduce((sum, p) => sum + Number(p?.net_salary || 0), 0);
  const avgNet = payslipsForSelectedYear.length > 0 ? totalNet / payslipsForSelectedYear.length : 0;

  const totalInsurance = payslipsForSelectedYear.reduce((sum, p) =>
    sum + Number(p?.insurance_bhxh || 0) + Number(p?.insurance_bhyt || 0) + Number(p?.insurance_bhtn || 0), 0);

  const totalBonus = payslipsForSelectedYear.reduce((sum, p) =>
    sum + Number(p?.kpi_bonus || 0) + Number(p?.diligence_bonus || 0) + Number(p?.overtime_salary || 0), 0);

  const totalTax = payslipsForSelectedYear.reduce((sum, p) => sum + Number(p?.tax_pit || 0), 0);

  return (
    <div>
      {/* Title + Segmented Sub-Tab Control (Ch. V) */}
      <div className="page-header" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">
            {t('Phiếu lương & Phúc lợi')}
          </h1>
          <p className="page-subtitle">
            {t('Tra cứu phiếu lương, đăng ký lịch nghỉ phép và tạm ứng thu nhập')}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }} className="no-print">
          <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '2px' }}>
            <button
              type="button"
              onClick={() => setActiveSubTab('payslip')}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '7px',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: activeSubTab === 'payslip' ? 700 : 600,
                background: activeSubTab === 'payslip' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'payslip' ? '#BD1D2D' : '#64748b',
                boxShadow: activeSubTab === 'payslip' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer'
              }}
            >
              <FileText size={14} />
              <span>{t('Phiếu lương')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('leaves')}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '7px',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: activeSubTab === 'leaves' ? 700 : 600,
                background: activeSubTab === 'leaves' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'leaves' ? '#BD1D2D' : '#64748b',
                boxShadow: activeSubTab === 'leaves' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer'
              }}
            >
              <Calendar size={14} />
              <span>{t('Nghỉ phép')}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('advances')}
              style={{
                height: '32px',
                padding: '0 14px',
                borderRadius: '7px',
                border: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.8rem',
                fontWeight: activeSubTab === 'advances' ? 700 : 600,
                background: activeSubTab === 'advances' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'advances' ? '#BD1D2D' : '#64748b',
                boxShadow: activeSubTab === 'advances' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                cursor: 'pointer'
              }}
            >
              <Wallet size={14} />
              <span>{t('Tạm ứng')}</span>
            </button>
          </div>

          {activeSubTab === 'payslip' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b', whiteSpace: 'nowrap', display: 'inline-block' }}>{t('Chọn năm')}:</span>
              <div style={{ width: '110px' }}>
                <CustomSelect
                  options={years.map(yr => ({ value: yr, label: yr.toString() }))}
                  value={selectedYear}
                  onChange={val => setSelectedYear(Number(val))}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TAB 1: PAYSLIP */}
      {activeSubTab === 'payslip' && (
        <div>
          {/* 4 KPI Cards (Brand DNA) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
              gap: isMobile ? '8px' : '16px',
              marginBottom: isMobile ? '1rem' : '2rem'
            }}
            className="no-print"
          >
            {/* Stat Card 1: Tổng Thực Nhận */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: isMobile ? '12px 16px' : '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              minHeight: isMobile ? '96px' : '136px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span style={{ fontSize: isMobile ? '0.625rem' : '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('TỔNG THỰC NHẬN')}
                  </span>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <DollarSign size={16} />
                  </div>
                </div>
                <strong style={{ fontSize: isMobile ? '1.15rem' : '1.85rem', fontWeight: 800, color: '#0f172a', display: 'block', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(totalNet)}
                </strong>
              </div>
              <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontVariantNumeric: 'tabular-nums' }}>
                  • {t('TB')}: <strong style={{ color: '#0f172a' }}>{formatCurrency(avgNet)}</strong>{!isMobile && ` / ${t('tháng')}`}
                </span>
              </div>
            </div>

            {/* Stat Card 2: Tổng Bảo Hiểm */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: isMobile ? '12px 16px' : '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              minHeight: isMobile ? '96px' : '136px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span style={{ fontSize: isMobile ? '0.625rem' : '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('BẢO HIỂM')}
                  </span>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <ShieldCheck size={16} />
                  </div>
                </div>
                <strong style={{ fontSize: isMobile ? '1.15rem' : '1.85rem', fontWeight: 800, color: '#BD1D2D', display: 'block', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(totalInsurance)}
                </strong>
              </div>
              <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  • {t('Hạng mục')}: <strong style={{ color: '#0f172a' }}>{t('BHXH, BHYT, BHTN')}</strong>
                </span>
              </div>
            </div>

            {/* Stat Card 3: Tổng Thưởng */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: isMobile ? '12px 16px' : '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              minHeight: isMobile ? '96px' : '136px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span style={{ fontSize: isMobile ? '0.625rem' : '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('TỔNG THƯỞNG')}
                  </span>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.06)',
                    color: '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Award size={16} />
                  </div>
                </div>
                <strong style={{ fontSize: isMobile ? '1.15rem' : '1.85rem', fontWeight: 800, color: '#0f172a', display: 'block', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(totalBonus)}
                </strong>
              </div>
              <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  • {t('Nguồn')}: <strong style={{ color: '#0f172a' }}>{t('KPI, OT & Chuyên cần')}</strong>
                </span>
              </div>
            </div>

            {/* Stat Card 4: Tổng Thuế TNCN */}
            <div style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              padding: isMobile ? '12px 16px' : '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
              minHeight: isMobile ? '96px' : '136px'
            }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <span style={{ fontSize: isMobile ? '0.625rem' : '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {t('THUẾ TNCN')}
                  </span>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.06)',
                    color: '#334155',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    <Percent size={16} />
                  </div>
                </div>
                <strong style={{ fontSize: isMobile ? '1.15rem' : '1.85rem', fontWeight: 800, color: '#0f172a', display: 'block', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(totalTax)}
                </strong>
              </div>
              <div style={{ marginTop: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontVariantNumeric: 'tabular-nums' }}>
                  • {t('Kỳ báo cáo')}: <strong style={{ color: '#0f172a' }}>{t('Năm')} {selectedYear}</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Main container for Month Cards */}
          <div className="card" style={{
            padding: '24px',
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '16px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            marginBottom: '2rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '16px' }} className="no-print">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} style={{ color: '#BD1D2D' }} />
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
                  {t('Danh sách phiếu lương')}
                </h3>
              </div>
              {loadingPayslips && <Loader2 size={15} className="spin" style={{ color: '#64748b' }} />}
            </div>

            {/* 12-Month Cards Layout (6 cards per row) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(6, 1fr)',
                gap: '12px'
              }}
              className="no-print"
            >
              {Array.from({ length: 12 }).map((_, idx) => {
                const m = idx + 1;
                const mStr = `${selectedYear}-${String(m).padStart(2, '0')}`;
                const payslipForMonth = ensureArray(allPayslips).find((p: any) => p?.month_year === mStr);
                const isAvailable = !!payslipForMonth;
                const isSelected = selectedMonth === mStr;
                const st = String(payslipForMonth?.status || 'draft');
                const badgeStyle =
                  st === 'confirmed'
                    ? { label: t('Đã ký'), color: '#059669', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)' }
                    : st === 'locked'
                      ? { label: t('Đã chốt'), color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' }
                      : st === 'disputed'
                        ? { label: t('Khiếu nại'), color: '#BD1D2D', bg: 'rgba(189, 29, 45, 0.08)', border: 'rgba(189, 29, 45, 0.25)' }
                        : st === 'sent'
                          ? { label: t('Chờ ký'), color: '#BD1D2D', bg: 'rgba(189, 29, 45, 0.08)', border: 'rgba(189, 29, 45, 0.25)' }
                          : { label: t('Nháp'), color: '#64748b', bg: '#f8fafc', border: '#e2e8f0' };

                return (
                  <div
                    key={mStr}
                    onClick={() => {
                      if (isAvailable) {
                        setSelectedMonth(mStr);
                        setIsModalOpen(true);
                      }
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      background: isAvailable ? '#ffffff' : '#f8fafc',
                      border: isSelected ? '2px solid #BD1D2D' : isAvailable ? '1px solid #e2e8f0' : '1px solid #f1f5f9',
                      cursor: isAvailable ? 'pointer' : 'default',
                      opacity: isAvailable ? 1 : 0.55,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(189, 29, 45, 0.12)' : isAvailable ? '0 1px 2px rgba(15, 23, 42, 0.04)' : 'none',
                      pointerEvents: isAvailable ? 'auto' : 'none'
                    }}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: isSelected ? '#BD1D2D' : '#64748b' }}>
                      {t('Tháng')} {m}
                    </span>
                    {isAvailable ? (
                      <>
                        <span style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: isSelected ? '#BD1D2D' : '#0f172a',
                          marginTop: '2px',
                          fontVariantNumeric: 'tabular-nums'
                        }}>
                          {formatCurrency(payslipForMonth.net_salary)}
                        </span>
                        <span style={{
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          color: badgeStyle.color,
                          background: badgeStyle.bg,
                          padding: '2px 7px',
                          borderRadius: '6px',
                          marginTop: '2px',
                          border: `1px solid ${badgeStyle.border}`
                        }}>
                          {badgeStyle.label}
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '2px' }}>
                        {t('Chưa có')}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Special Periods */}
              {['MID', '13', 'YEND'].map(suffix => {
                const key = `${selectedYear}-${suffix}`;
                const payslipForPeriod = ensureArray(allPayslips).find((p: any) => p?.month_year === key);
                if (!payslipForPeriod) return null;
                const isSelected = selectedMonth === key;
                const label = suffix === '13' ? t('Lương T13') : suffix === 'MID' ? t('Thưởng Giữa Năm') : t('Thưởng Cuối Năm');
                const st = String(payslipForPeriod?.status || 'draft');
                const badgeStyle =
                  st === 'confirmed'
                    ? { label: t('Đã ký'), color: '#059669', bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.25)' }
                    : st === 'locked'
                      ? { label: t('Đã chốt'), color: '#334155', bg: '#f1f5f9', border: '#cbd5e1' }
                      : st === 'disputed'
                        ? { label: t('Khiếu nại'), color: '#BD1D2D', bg: 'rgba(189, 29, 45, 0.08)', border: 'rgba(189, 29, 45, 0.25)' }
                        : { label: t('Chờ ký'), color: '#BD1D2D', bg: 'rgba(189, 29, 45, 0.08)', border: 'rgba(189, 29, 45, 0.25)' };

                return (
                  <div
                    key={key}
                    onClick={() => {
                      setSelectedMonth(key);
                      setIsModalOpen(true);
                    }}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      background: '#ffffff',
                      border: isSelected ? '2px solid #BD1D2D' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      transition: 'border-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s ease',
                      boxShadow: isSelected ? '0 4px 12px rgba(189, 29, 45, 0.12)' : '0 1px 2px rgba(15, 23, 42, 0.04)'
                    }}
                  >
                    <span style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: isSelected ? '#BD1D2D' : '#64748b',
                      textAlign: 'center'
                    }}>
                      {label}
                    </span>
                    <span style={{
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: isSelected ? '#BD1D2D' : '#0f172a',
                      marginTop: '2px',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {formatCurrency(payslipForPeriod.net_salary)}
                    </span>
                    <span style={{
                      fontSize: '0.625rem',
                      fontWeight: 700,
                      color: badgeStyle.color,
                      background: badgeStyle.bg,
                      padding: '2px 7px',
                      borderRadius: '6px',
                      marginTop: '2px',
                      border: `1px solid ${badgeStyle.border}`
                    }}>
                      {badgeStyle.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LEAVES */}
      {activeSubTab === 'leaves' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px' }}>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '18px 22px' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{t('PHÉP NĂM CÒN LẠI')}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
                {myBalance ? Number(myBalance.remaining_annual_leave ?? 0) : '—'} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>{t('ngày')}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                • {t('Tổng cấp')}: <strong style={{ color: '#0f172a' }}>{myBalance ? Number(myBalance.annual_leave_total ?? 12) : 12}</strong> • {t('Đã dùng')}: <strong style={{ color: '#0f172a' }}>{myBalance ? Number(myBalance.annual_leave_used ?? 0) : 0}</strong>
              </div>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '18px 22px' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{t('NGHỈ BÙ CÒN LẠI')}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#BD1D2D', marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
                {myBalance ? Number(myBalance.remaining_compensatory_leave ?? 0) : '—'} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>{t('ngày')}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                • {t('Tổng tích lũy')}: <strong style={{ color: '#0f172a' }}>{myBalance ? Number(myBalance.compensatory_leave_total ?? 0) : 0}</strong> • {t('Đã dùng')}: <strong style={{ color: '#0f172a' }}>{myBalance ? Number(myBalance.compensatory_leave_used ?? 0) : 0}</strong>
              </div>
            </div>
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '18px 22px' }}>
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{t('LỊCH SỬ ĐƠN PHÉP')}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginTop: '6px', fontVariantNumeric: 'tabular-nums' }}>
                {ensureArray(leavesList).length} <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748b' }}>{t('đơn')}</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '6px' }}>
                • {t('Chờ duyệt')}: <strong style={{ color: '#BD1D2D' }}>{ensureArray(leavesList).filter((l: any) => l?.status === 'pending').length}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr', gap: '16px', alignItems: 'start' }}>
            <form onSubmit={handleRequestLeave} className="card" style={{ padding: '20px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{t('Đăng ký nghỉ phép / Công tác')}</h3>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Loại đơn')}</label>
                <CustomSelect
                  value={leaveType}
                  onChange={val => setLeaveType(String(val || 'annual'))}
                  options={[
                    { value: 'annual', label: t('Nghỉ phép năm') },
                    { value: 'compensatory', label: t('Nghỉ bù') },
                    { value: 'unpaid', label: t('Nghỉ không lương') },
                    { value: 'wfh', label: t('Làm việc từ xa (WFH)') },
                    { value: 'late_early', label: t('Xin đi muộn / Về sớm') },
                    { value: 'overtime', label: t('Đăng ký tăng ca (OT)') },
                    { value: 'special', label: t('Nghỉ chế độ (Hiếu / Hỉ)') },
                  ]}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Từ ngày')}</label>
                  <VietnameseDateInput value={leaveStart} onChange={val => setLeaveStart(val)} />
                </div>
                <div>
                  <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Đến ngày')}</label>
                  <VietnameseDateInput value={leaveEnd} min={leaveStart} onChange={val => setLeaveEnd(val)} />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Số ngày')}</label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={leaveTotalDays}
                  onChange={e => setLeaveTotalDays(Math.max(0.5, Number(e.target.value || 0.5)))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Người duyệt cấp 1')} *</label>
                <CustomSelect searchable value={leaveApproverId} onChange={setLeaveApproverId} options={userOptions} placeholder={t('Chọn người duyệt cấp 1')} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Người duyệt cấp 2')}</label>
                <CustomSelect searchable value={leaveApproverId2} onChange={setLeaveApproverId2} options={approver2Options} placeholder={t('Không bắt buộc')} />
              </div>
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Lý do')} *</label>
                <textarea
                  rows={3}
                  value={leaveReason}
                  onChange={e => setLeaveReason(e.target.value)}
                  placeholder={t('Nhập lý do xin nghỉ...')}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                />
              </div>
              <button
                type="submit"
                disabled={submittingLeave}
                className="btn primary"
                style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {submittingLeave && <Loader2 size={14} className="spin" />}
                <span>{submittingLeave ? t('Đang gửi...') : t('Gửi đơn nghỉ phép')}</span>
              </button>
            </form>

            <div className="card" style={{ padding: '20px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{t('Danh sách đơn phép của tôi')}</h3>
                {loadingLeaves && <Loader2 size={15} className="spin" style={{ color: '#64748b' }} />}
              </div>
              {ensureArray(leavesList).length === 0 ? (
                <EmptyCard icon={<Calendar size={28} />} title={t('Chưa có đơn nghỉ phép nào')} description={t('Các đề xuất nghỉ phép của bạn sẽ hiển thị tại đây.')} />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {ensureArray(leavesList).map((lv: any) => (
                    <div
                      key={lv.id}
                      onClick={() => setSelectedTimelineItem({ id: lv.id, type: 'leave', title: t('Đơn nghỉ phép'), description: lv.reason || '', status: lv.status, created_at: lv.created_at, employee_name: lv.employee_name || user?.full_name })}
                      style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a' }}>
                          {lv.leave_type} • {formatDateVN(lv.start_date)} – {formatDateVN(lv.end_date)} ({lv.total_days ?? 1} {t('ngày')})
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lv.reason || '—'}</div>
                      </div>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        flexShrink: 0,
                        background: lv.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : lv.status === 'rejected' ? 'rgba(189, 29, 45, 0.1)' : '#e2e8f0',
                        color: lv.status === 'approved' ? '#059669' : lv.status === 'rejected' ? '#BD1D2D' : '#334155'
                      }}>
                        {lv.status === 'approved' ? t('Đã duyệt') : lv.status === 'rejected' ? t('Từ chối') : t('Chờ duyệt')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ADVANCES */}
      {activeSubTab === 'advances' && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr', gap: '16px', alignItems: 'start' }}>
          <form onSubmit={handleRequestAdvance} className="card" style={{ padding: '20px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{t('Đề xuất tạm ứng lương')}</h3>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Số tiền đề xuất (VNĐ)')} *</label>
              <input
                type="number"
                min="100000"
                step="100000"
                value={advanceAmount || ''}
                onChange={e => setAdvanceAmount(Math.max(0, Number(e.target.value || 0)))}
                placeholder="2000000"
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Người duyệt cấp 1')} *</label>
              <CustomSelect searchable value={advanceApproverId} onChange={setAdvanceApproverId} options={userOptions} placeholder={t('Chọn người duyệt cấp 1')} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Người duyệt cấp 2')}</label>
              <CustomSelect searchable value={advanceApproverId2} onChange={setAdvanceApproverId2} options={approver2Options} placeholder={t('Không bắt buộc')} />
            </div>
            <div>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>{t('Lý do tạm ứng')} *</label>
              <textarea
                rows={3}
                value={advanceReason}
                onChange={e => setAdvanceReason(e.target.value)}
                placeholder={t('Nhập lý do tạm ứng...')}
                style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
              />
            </div>
            <button
              type="submit"
              disabled={submittingAdvance}
              className="btn primary"
              style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              {submittingAdvance && <Loader2 size={14} className="spin" />}
              <span>{submittingAdvance ? t('Đang gửi...') : t('Gửi đề xuất tạm ứng')}</span>
            </button>
          </form>

          <div className="card" style={{ padding: '20px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0f172a' }}>{t('Lịch sử tạm ứng lương')}</h3>
              {loadingAdvances && <Loader2 size={15} className="spin" style={{ color: '#64748b' }} />}
            </div>
            {ensureArray(advancesList).length === 0 ? (
              <EmptyCard icon={<Wallet size={28} />} title={t('Chưa có đề xuất tạm ứng')} description={t('Các yêu cầu tạm ứng thu nhập của bạn sẽ hiển thị tại đây.')} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {ensureArray(advancesList).map((adv: any) => (
                  <div
                    key={adv.id}
                    onClick={() => setSelectedTimelineItem({ id: adv.id, type: 'advance', title: t('Đề nghị tạm ứng lương'), description: adv.reason || '', status: adv.status, created_at: adv.created_at, employee_name: adv.employee_name || user?.full_name })}
                    style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(adv.amount)} <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>• {formatDateVN(adv.created_at)}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adv.reason || '—'}</div>
                    </div>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      flexShrink: 0,
                      background: adv.status === 'approved' ? 'rgba(16, 185, 129, 0.1)' : adv.status === 'rejected' ? 'rgba(189, 29, 45, 0.1)' : '#e2e8f0',
                      color: adv.status === 'approved' ? '#059669' : adv.status === 'rejected' ? '#BD1D2D' : '#334155'
                    }}>
                      {adv.status === 'approved' ? t('Đã duyệt') : adv.status === 'rejected' ? t('Từ chối') : t('Chờ duyệt')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Payslip Modal */}
      <CustomModal
        isOpen={isModalOpen}
        onClose={() => { if (!submitting && !sendingDispute) setIsModalOpen(false); }}
        title={t("Chi tiết Phiếu lương")}
        width="860px"
        zIndex={2147483640}
      >
        <div style={{ padding: '4px' }}>
          {payslip ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {(() => {
                const st = String(payslip.status || 'draft');
                const bannerCfg =
                  st === 'confirmed'
                    ? { bg: 'rgba(16, 185, 129, 0.08)', border: 'rgba(16, 185, 129, 0.3)', color: '#059669', title: t('Bảng lương đã ký nhận thành công'), sub: `${t('Đã xác nhận lúc')}: ${formatDateTimeVN(payslip.confirmed_at)}` }
                    : st === 'locked'
                      ? { bg: '#f8fafc', border: '#cbd5e1', color: '#0f172a', title: t('Phiếu lương đã chốt & khóa sổ'), sub: payslip.confirmed_at ? `${t('Đã xác nhận lúc')}: ${formatDateTimeVN(payslip.confirmed_at)}` : t('Kỳ lương đã được kế toán khóa sổ chính thức.') }
                      : st === 'disputed'
                        ? { bg: 'rgba(189, 29, 45, 0.06)', border: 'rgba(189, 29, 45, 0.25)', color: '#BD1D2D', title: t('Phiếu lương đang chờ phản hồi khiếu nại'), sub: t('HCNS / Kế toán đang kiểm tra lại số liệu theo ghi chú của bạn.') }
                        : st === 'sent'
                          ? { bg: 'rgba(189, 29, 45, 0.06)', border: 'rgba(189, 29, 45, 0.25)', color: '#BD1D2D', title: t('Phiếu lương đang chờ bạn ký xác nhận'), sub: t('Vui lòng kiểm tra kỹ chi tiết trước khi ký số xác nhận lương Net.') }
                          : { bg: '#f8fafc', border: '#e2e8f0', color: '#475569', title: t('Phiếu lương nháp (chưa công bố)'), sub: t('Phiếu lương đang ở trạng thái dự thảo.') };
                return (
                  <div style={{
                    background: bannerCfg.bg,
                    border: `1px solid ${bannerCfg.border}`,
                    borderRadius: '12px',
                    padding: '1rem 1.25rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    {st === 'confirmed' ? (
                      <ShieldCheck size={20} style={{ color: bannerCfg.color }} />
                    ) : st === 'locked' ? (
                      <CheckCircle size={20} style={{ color: bannerCfg.color }} />
                    ) : st === 'disputed' ? (
                      <AlertCircle size={20} style={{ color: bannerCfg.color }} />
                    ) : (
                      <Clock size={20} style={{ color: bannerCfg.color }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '0.9rem', color: bannerCfg.color }}>{bannerCfg.title}</strong>
                      <p style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{bannerCfg.sub}</p>
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }} className="no-print">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn danger sm"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    background: '#BD1D2D',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(189, 29, 45, 0.2)',
                    transition: 'background-color 0.2s cubic-bezier(0.22, 1, 0.36, 1)'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#991B1B'}
                  onMouseLeave={e => e.currentTarget.style.background = '#BD1D2D'}
                >
                  <Download size={14} /> {t('In / Xuất PDF')}
                </button>
              </div>

              <div id="payslip-print-area" className="card" style={{
                padding: '1.25rem 2rem',
                background: '#ffffff',
                color: '#1e293b',
                border: '1px solid var(--color-border-light)',
                borderRadius: '12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                position: 'relative',
                width: '100%',
                boxSizing: 'border-box'
              }}>
                <style>{`
                  @media print {
                    body * { visibility: hidden !important; }
                    #payslip-print-area, #payslip-print-area * { visibility: visible !important; }
                    #payslip-print-area { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; padding: 20mm !important; }
                  }
                `}</style>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', borderBottom: '2px solid #BD1D2D', paddingBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {companyLogoUrl ? (
                      <img src={companyLogoUrl} alt="Logo" style={{ height: 36, maxWidth: 90, objectFit: 'contain' }} />
                    ) : (
                      <div style={{ background: '#BD1D2D', color: 'white', padding: '6px 10px', borderRadius: '8px', fontWeight: 700, fontSize: '0.85rem' }}>
                        {(companyName || 'ERP').split(' ').filter(Boolean).slice(-2).map(w => w[0]).join('').toUpperCase() || 'ERP'}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <strong style={{ fontSize: '0.825rem', color: '#1e293b', textTransform: 'uppercase' }}>{companyName || t('Đơn vị sử dụng lao động')}</strong>
                      {companyAddress && <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{t('Địa chỉ')}: {companyAddress}</span>}
                      {(companyPhone || companyTaxId) && (
                        <div style={{ display: 'flex', gap: '15px', fontSize: '0.7rem', color: '#64748b', marginTop: 1 }}>
                          {companyPhone && <span>{t('SĐT')}: {companyPhone}</span>}
                          {companyTaxId && <span>{t('MST')}: {companyTaxId}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2, fontSize: '0.7rem', color: '#64748b' }}>
                    <strong>{t('MÃ PHIẾU')}: PL-{payslip.id}-{selectedMonth}</strong>
                    <span>{t('Ngày in')}: {formatDateVN(new Date())}</span>
                  </div>
                </div>

                <div style={{ textAlign: 'center', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', color: '#1e293b' }}>
                    {getTitleLabel(selectedMonth)}
                  </h2>
                  <p style={{ fontSize: '0.825rem', color: '#64748b', marginTop: 4, fontWeight: 600 }}>
                    {t('Kỳ thanh toán')}: {getPeriodLabel(selectedMonth)}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem 1rem', marginTop: '0.75rem', textAlign: 'left', fontSize: '0.825rem', border: '1px solid var(--color-border-light)', borderRadius: '10px', padding: '0.5rem 1rem', background: '#f8fafc' }}>
                    <div>
                      <span style={{ color: '#64748b' }}>{t('Nhân viên')}:</span> <strong>{payslip.employee_name}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>{t('Chức vụ')}:</span> <strong>{payslip.job_title || t('Nhân viên')}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b' }}>{t('Số ngày công làm việc')}:</span> <strong>{payslip.work_days_actual} / {payslip.work_days_required}</strong>
                    </div>
                    <div>
                      {(() => {
                        const gRaw = String(payslip.gender || (user as any)?.gender || '').toLowerCase().trim();
                        const isMale = ['male', 'nam', 'm', '1'].includes(gRaw);
                        const isFemale = ['female', 'nữ', 'nu', 'f', '0'].includes(gRaw);
                        const hasExplicitGrace =
                          payslip.late_grace_minutes !== null &&
                          payslip.late_grace_minutes !== undefined &&
                          payslip.late_grace_minutes !== '' &&
                          Number.isFinite(Number(payslip.late_grace_minutes));
                        const grace = hasExplicitGrace
                          ? Number(payslip.late_grace_minutes)
                          : (isMale ? policyGraceMale : isFemale ? policyGraceFemale : policyGraceDefault);
                        const lateVal = Number(payslip.lateness_minutes || 0);
                        return (
                          <>
                            <span style={{ color: '#64748b' }}>{t('Đi muộn')}:</span>{' '}
                            <strong style={{ color: lateVal > grace ? '#BD1D2D' : (lateVal > 0 ? '#d97706' : 'inherit') }}>
                              {`${lateVal} phút (Định mức cho phép: ${grace} phút/tháng${lateVal > grace ? ` — Vượt ${lateVal - grace} phút` : ' — Trong định mức'})`}
                            </strong>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem', fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border-light)', color: '#1e293b', background: '#f8fafc', fontWeight: 700 }}>
                      <th style={{ padding: '6px 12px', textAlign: 'left' }}>{t('Khoản mục')}</th>
                      <th style={{ padding: '6px 12px', textAlign: 'center' }}>{t('Thông số')}</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right' }}>{t('Cộng (Thu nhập)')}</th>
                      <th style={{ padding: '6px 12px', textAlign: 'right' }}>{t('Trừ (Khấu trừ)')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Lương thực tế theo ngày công')}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>{payslip.work_days_actual} / {payslip.work_days_required} {t('ngày công')}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(payslip.salary_basic_calculated)}</td>
                      <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                    </tr>
                    {Number(payslip.kpi_bonus || 0) > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Lương thưởng doanh số KPI')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{formatCurrency(payslip.kpi_bonus)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                      </tr>
                    )}
                    {Number(payslip.overtime_salary || 0) > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Lương tăng ca')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>{payslip.overtime_days || 0} {t('ngày')} (x{payslip.ot_multiplier ?? policyOtWeekday})</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{formatCurrency(payslip.overtime_salary)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                      </tr>
                    )}
                    {Number(payslip.diligence_bonus || 0) > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Thưởng chuyên cần')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600, color: '#059669' }}>{formatCurrency(payslip.diligence_bonus)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                      </tr>
                    )}
                    {Number(payslip.allowance_total || 0) > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Phụ cấp (Ăn trưa, Xăng xe, Điện thoại)')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(payslip.allowance_total)}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                      </tr>
                    )}
                    {(Number(payslip.insurance_bhxh || 0) + Number(payslip.insurance_bhyt || 0) + Number(payslip.insurance_bhtn || 0)) > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Khấu trừ Bảo hiểm (BHXH, BHYT, BHTN)')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>{payslip.has_insurance === 1 ? t('Có tham gia') : t('Không')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#BD1D2D', fontWeight: 600 }}>-{formatCurrency(Number(payslip.insurance_bhxh || 0) + Number(payslip.insurance_bhyt || 0) + Number(payslip.insurance_bhtn || 0))}</td>
                      </tr>
                    )}
                    {Number(payslip.lateness_penalty || 0) > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Khấu trừ đi trễ')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>{payslip.lateness_minutes} {t('phút')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#BD1D2D', fontWeight: 600 }}>-{formatCurrency(payslip.lateness_penalty)}</td>
                      </tr>
                    )}
                    {Number(payslip.tax_pit || 0) > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Thuế Thu nhập Cá nhân (PIT)')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#BD1D2D', fontWeight: 600 }}>-{formatCurrency(payslip.tax_pit)}</td>
                      </tr>
                    )}
                    {Number(payslip.advance_deduction || 0) > 0 && (
                      <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '6px 12px', fontWeight: 600 }}>{t('Khấu trừ tạm ứng')}</td>
                        <td style={{ padding: '6px 12px', textAlign: 'center', color: '#64748b' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                        <td style={{ padding: '6px 12px', textAlign: 'right', color: '#BD1D2D', fontWeight: 600 }}>-{formatCurrency(payslip.advance_deduction)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div style={{ marginTop: '1rem', borderTop: '2px double #cbd5e1', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase' }}>{t('THỰC LĨNH CHUYỂN KHOẢN (NET PAY)')}</strong>
                  <strong style={{ fontSize: '1.25rem', color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(payslip.net_salary)}</strong>
                </div>
                {(payslip.status === 'confirmed' || payslip.status === 'locked') && payslip.signature_url && (
                  <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 4 }}>{t('Đã xác nhận & ký nhận online')}</span>
                    <img src={payslip.signature_url} alt="Signature" style={{ width: '120px', height: '48px', objectFit: 'contain', borderBottom: '1px solid #64748b' }} />
                    <strong style={{ fontSize: '0.78rem', marginTop: 4 }}>{payslip.employee_name}</strong>
                  </div>
                )}
                {payslip.status === 'disputed' && payslip.note && (
                  <div style={{ marginTop: '1rem', padding: '8px 12px', borderRadius: '10px', background: 'rgba(189, 29, 45, 0.06)', border: '1px solid rgba(189, 29, 45, 0.2)', color: '#BD1D2D', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={14} style={{ flexShrink: 0 }} />
                    <span><strong>{t('Đã gửi yêu cầu thay đổi:')}</strong> {payslip.note}</span>
                  </div>
                )}
              </div>
              {payslip.status === 'sent' && (
                <div className="card" style={{ padding: '1rem', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
                    <PenTool size={15} style={{ color: '#BD1D2D' }} />
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{t('Ký nhận Phiếu Lương trực tuyến')}</h4>
                  </div>
                  <div style={{ border: '1px dashed #cbd5e1', borderRadius: 8, background: '#f8fafc', overflow: 'hidden', position: 'relative', height: 120 }}>
                    <canvas
                      ref={canvasRef}
                      width={500}
                      height={120}
                      style={{ width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none', backgroundColor: 'white', backgroundImage: 'radial-gradient(#e2e8f0 1.2px, transparent 1.2px)', backgroundSize: '20px 20px' }}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: '0.75rem' }}>
                    <button type="button" onClick={clearCanvas} disabled={submitting} className="btn secondary" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>{t('Vẽ lại')}</button>
                    <button
                      type="button"
                      onClick={() => setDisputeModalOpen(true)}
                      disabled={submitting}
                      className="btn outline"
                      style={{ padding: '6px 14px', fontSize: '0.78rem', color: '#BD1D2D', borderColor: 'rgba(189, 29, 45, 0.35)' }}
                    >
                      <AlertCircle size={13} />
                      {t('Yêu cầu thay đổi')}
                    </button>
                    <button type="button" onClick={handleConfirmPayslip} disabled={submitting} className="btn primary" style={{ padding: '6px 18px', fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {submitting ? <Loader2 size={13} className="spin" /> : <CheckCircle size={13} />}
                      {submitting ? t('Đang ký...') : t('Ký xác nhận lương')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </CustomModal>

      {/* Dispute Modal lifted above Payslip Detail Modal */}
      <CustomModal
        isOpen={disputeModalOpen}
        onClose={() => { if (!sendingDispute) setDisputeModalOpen(false); }}
        title={t("Yêu cầu thay đổi / Khiếu nại")}
        width="500px"
        zIndex={2147483647}
        disableClose={sendingDispute}
        preventCloseOnBackdrop={sendingDispute}
      >
        <div style={{ padding: '10px' }}>
          <textarea
            value={disputeNote}
            onChange={(e) => setDisputeNote(e.target.value)}
            placeholder={t('Vui lòng nhập lý do yêu cầu thay đổi...')}
            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-border)' }}
            rows={4}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '1rem' }}>
            <button type="button" onClick={() => setDisputeModalOpen(false)} disabled={sendingDispute} className="btn secondary">{t('Hủy')}</button>
            <button type="button" onClick={handleSendDispute} disabled={sendingDispute} className="btn primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {sendingDispute && <Loader2 size={14} className="spin" />}
              <span>{sendingDispute ? t('Đang gửi...') : t('Gửi yêu cầu')}</span>
            </button>
          </div>
        </div>
      </CustomModal>

      {/* Progress Timeline Drawer */}
      <AnimatePresence>
        {selectedTimelineItem && (
          <Suspense fallback={null}>
            <ApprovalDetailDrawer
              item={selectedTimelineItem}
              onClose={() => setSelectedTimelineItem(null)}
              users={users}
              t={t}
              onApprove={async () => {}}
              onReject={() => {}}
              isAdmin={false}
            />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}


