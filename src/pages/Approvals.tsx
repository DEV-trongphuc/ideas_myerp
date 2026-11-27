import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { fetchAPI } from '../utils/api';
import { isItemAtMyStepToApprove as checkItemAtMyStepToApprove, isMyRequestPendingApproval } from '../utils/approvalPermissions';
import api from '../api/axios';
import { 
  FileText, Calendar, CheckCircle2, XCircle, Clock,
  ShieldCheck, User, Clipboard, DollarSign, Activity, FileSpreadsheet, Plus,
  Search, Trash2, Paperclip, Send, AlertTriangle, Users, CreditCard, ShoppingCart, Award,
  HelpCircle, HardDrive, FileSignature, Receipt, Briefcase, ChevronRight, CheckSquare, Server, Home,
  FileCheck, Settings, ArrowLeft, X, Save, GitBranch, Clock3, Copy, Edit, RefreshCw, Eye, MessageSquare, Info, Loader2,
  UserPlus, Check, MoreHorizontal, Filter, Zap, Download, Image as ImageIcon, Building2, Truck,
  GraduationCap, Utensils, Mail, AlertCircle, Bookmark, Edit3,
  Landmark, Wallet, Coffee, Tag, Globe, Layers
} from 'lucide-react';
import toast from 'react-hot-toast';
import { DraftExitConfirmModal } from '../components/ui/DraftExitConfirmModal';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { EmptyCard } from '../components/ui/EmptyCard';
import { TableSkeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { CustomSelect, getAvatarRingStyle, type SelectOption } from '../components/ui/CustomSelect';
import { MentionInput } from '../components/ui/MentionInput';
import { motion, AnimatePresence } from 'framer-motion';
import { isExecutive, isHR, isManagement } from '../utils/roleUtils';
import { resolveHrRepresentativeUser } from '../utils/teamLeader';
import { VIETNAM_BANKS, getVietQrUrl, findBank, standardizeBankName, isForeignOrCustomBank, normalizeVietQrText } from '../utils/vietnamBanks';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { BankSelect } from '../components/ui/BankSelect';
import { Pagination } from '../components/ui/Pagination';
import { useUIStore } from '../store/uiStore';
import { QrImageModal } from '../components/ui/QrImageModal';
import { PeriodFilter, getDateRange } from '../components/ui/PeriodFilter';
import type { Period, DateRange } from '../components/ui/PeriodFilter';
import { numberToVietnameseText } from '../utils/numberToText';
import { VietnameseDateInput } from '../components/ui/VietnameseDateInput';
import { getSystemTitle } from '../config/env';
import { pushOverlay } from '../utils/overlayStack';
import { ensureArray, extractArray } from '../utils/safeArray';
import { AppIcon } from '../components/common/AppIcons';
import { ResponsiveSegmentedTabs } from '../components/ui/MobileResponsiveTabs';
import { useTenantConfig, useTypedSetting } from '../contexts/TenantConfigContext';
import { useSettingsBootstrap } from '../contexts/SettingsBootstrapContext';
import { formatDateVN, getLocalDateStr } from '../utils/dateUtils';
import { csvSafe } from '../components/HRM/accountingAzEngine';
import { ApprovalDetailDrawer } from '../components/common/ApprovalDetailDrawer';
import {
  resolveLateEarlySubType,
  cleanLeaveReasonText,
  formatApprovalCurrency,
  parseMoneyVn,
  parseExpenseLineItems,
  type ApprovalItem
} from '../utils/approvalFormatting';

function combineUniqueReason(titleSuffix?: string, detailReason?: string): string {
  const s = cleanLeaveReasonText(titleSuffix, false);
  const r = cleanLeaveReasonText(detailReason, false);
  if (!s) return r;
  if (!r) return s;
  const sLower = s.toLowerCase();
  const rLower = r.toLowerCase();
  if (sLower === rLower || rLower.includes(sLower)) return r;
  if (sLower.includes(rLower)) return s;
  return `${s} - ${r}`;
}

const workflowList = [
  { id: 'payment', name: 'Đề nghị thanh toán', description: 'Đề xuất thanh toán nhà cung cấp, chi phí vận hành, đối tác.', category: 'finance', icon: FileSignature, bg: 'rgba(16, 185, 129, 0.08)', color: '#10b981' },
  { id: 'advance_money', name: 'Đề nghị tạm ứng', description: 'Đề xuất tạm ứng chi phí công tác, mua hàng hoặc ứng lương.', category: 'finance', icon: DollarSign, bg: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' },
  { id: 'expense_claim', name: 'Đề xuất chi phí', description: 'Yêu cầu hoàn trả chi phí tiếp khách, đi lại, văn phòng phẩm.', category: 'finance', icon: Receipt, bg: 'rgba(6, 182, 212, 0.08)', color: '#06b6d4' },
  { id: 'client_meeting', name: 'Đề xuất tiếp khách', description: 'Chi phí tiếp đãi khách hàng, đối tác quan trọng.', category: 'finance', icon: Briefcase, bg: 'rgba(236, 72, 153, 0.08)', color: '#ec4899' },
  { id: 'phased_payment', name: 'Thanh toán theo đợt', description: 'Đề xuất thanh toán chia nhiều đợt theo tiến độ hợp đồng.', category: 'finance', icon: GitBranch, bg: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6' },
  { id: 'recurring_payment', name: 'Thanh toán định kỳ', description: 'Đề xuất thanh toán định kỳ hàng tháng/quý (tiền nhà, internet, phí dịch vụ).', category: 'finance', icon: Clock3, bg: 'rgba(217, 70, 239, 0.08)', color: '#d946ef' },
  { id: 'commission_payout', name: 'Đề xuất chi trả hoa hồng', description: 'Chi trả hoa hồng nhiều nhân sự, tự động trích xuất STK và xác nhận UNC theo từng người.', category: 'finance', icon: Award, bg: 'rgba(245, 158, 11, 0.08)', color: '#f59e0b' },

  { id: 'leave_late', name: 'Đơn xin nghỉ', description: 'Đề xuất nghỉ phép năm, nghỉ việc riêng, nghỉ thai sản, nghỉ ốm.', category: 'hr', icon: Calendar, bg: 'rgba(239, 68, 68, 0.08)', color: '#ef4444' },
  { id: 'late_early', name: 'Đăng ký đi muộn, về sớm', description: 'Đăng ký đi muộn hoặc về sớm vì việc cá nhân lý do chính đáng.', category: 'hr', icon: Clock, bg: 'rgba(234, 179, 8, 0.08)', color: '#eab308' },
  { id: 'overtime', name: 'Đăng ký làm thêm', description: 'Đề xuất làm thêm giờ (OT), tăng ca ngoài giờ làm việc hành chính.', category: 'hr', icon: Plus, bg: 'rgba(20, 184, 166, 0.08)', color: '#14b8a6' },
  { id: 'remote_work', name: 'Đăng ký làm việc từ xa', description: 'Đề xuất làm việc tại nhà (WFH) hoặc làm việc từ xa.', category: 'hr', icon: Home, bg: 'rgba(14, 165, 233, 0.08)', color: '#0ea5e9' },
  { id: 'attendance_bulk', name: 'Đề nghị cập nhật công', description: 'Giải trình và cập nhật bổ sung công bị thiếu do quên chấm công.', category: 'hr', icon: CheckSquare, bg: 'rgba(139, 92, 246, 0.08)', color: '#8b5cf6' },
  { id: 'recruitment', name: 'Đề xuất tuyển dụng', description: 'Đề xuất tuyển dụng nhân sự mới, tuyển thay thế hoặc mở rộng quy mô bộ phận/chi nhánh.', category: 'hr', icon: UserPlus, bg: 'rgba(99, 102, 241, 0.08)', color: '#6366f1' },

  { id: 'purchase_request', name: 'Mua sắm trang thiết bị', description: 'Đề xuất mua sắm công cụ dụng cụ, thiết bị văn phòng.', category: 'admin', icon: ShoppingCart, bg: 'rgba(168, 85, 247, 0.08)', color: '#a855f7' },
  { id: 'it_request', name: 'Cấp thiết bị IT', description: 'Yêu cầu cấp phát laptop, màn hình, tài khoản phần mềm.', category: 'admin', icon: Server, bg: 'rgba(6, 182, 212, 0.08)', color: '#06b6d4' },
  { id: 'meeting_room', name: 'Sử dụng phòng họp', description: 'Đăng ký phòng họp lớn, họp trực tuyến.', category: 'admin', icon: Users, bg: 'rgba(16, 185, 129, 0.08)', color: '#10b981' },
  { id: 'stationery', name: 'Đề xuất văn phòng phẩm', description: 'Yêu cầu cung cấp giấy in, bút, tài liệu văn phòng.', category: 'admin', icon: FileText, bg: 'rgba(249, 115, 22, 0.08)', color: '#f97316' },
  { id: 'document_approval', name: 'Phê duyệt văn bản', description: 'Đề xuất duyệt hợp đồng, quy chế, quyết định hoặc tài liệu nội bộ.', category: 'admin', icon: FileCheck, bg: 'rgba(79, 70, 229, 0.08)', color: '#4f46e5' },
  { id: 'print_stamp_send', name: 'In, đóng dấu và gửi hồ sơ', description: 'Quy trình in, đóng dấu tài liệu và gửi đi cho đối tác/khách hàng.', category: 'admin', icon: FileText, bg: 'rgba(225, 29, 72, 0.08)', color: '#e11d48' }
];

const getWorkflowColor = (colorHex: string) => {
  const lowercase = String(colorHex).toLowerCase();

  if (lowercase === '#10b981') {
    return { bg: 'linear-gradient(135deg, #34d399, #059669)', color: '#ffffff', shadow: '0 4px 12px rgba(5, 150, 105, 0.3)', hoverBg: 'rgba(5, 150, 105, 0.08)' };
  }
  if (lowercase === '#3b82f6') {
    return { bg: 'linear-gradient(135deg, #60a5fa, #1d4ed8)', color: '#ffffff', shadow: '0 4px 12px rgba(29, 78, 216, 0.3)', hoverBg: 'rgba(29, 78, 216, 0.08)' };
  }
  if (lowercase === '#06b6d4') {
    return { bg: 'linear-gradient(135deg, #22d3ee, #0891b2)', color: '#ffffff', shadow: '0 4px 12px rgba(8, 145, 178, 0.3)', hoverBg: 'rgba(8, 145, 178, 0.08)' };
  }
  if (lowercase === '#ec4899') {
    return { bg: 'linear-gradient(135deg, #f472b6, #db2777)', color: '#ffffff', shadow: '0 4px 12px rgba(219, 39, 119, 0.3)', hoverBg: 'rgba(219, 39, 119, 0.08)' };
  }
  if (lowercase === '#f59e0b' || lowercase === '#f97316') {
    return { bg: 'linear-gradient(135deg, #fb923c, #d97706)', color: '#ffffff', shadow: '0 4px 12px rgba(217, 119, 6, 0.3)', hoverBg: 'rgba(217, 119, 6, 0.08)' };
  }
  if (lowercase === '#8b5cf6') {
    return { bg: 'linear-gradient(135deg, #a78bfa, #6d28d9)', color: '#ffffff', shadow: '0 4px 12px rgba(109, 40, 217, 0.3)', hoverBg: 'rgba(109, 40, 217, 0.08)' };
  }
  if (lowercase === '#d946ef') {
    return { bg: 'linear-gradient(135deg, #f0abfc, #a21caf)', color: '#ffffff', shadow: '0 4px 12px rgba(162, 28, 175, 0.3)', hoverBg: 'rgba(162, 28, 175, 0.08)' };
  }
  if (lowercase === '#ef4444' || lowercase === '#e11d48') {
    return { bg: 'linear-gradient(135deg, #f87171, #dc2626)', color: '#ffffff', shadow: '0 4px 12px rgba(220, 38, 38, 0.3)', hoverBg: 'rgba(220, 38, 38, 0.08)' };
  }
  if (lowercase === '#eab308') {
    return { bg: 'linear-gradient(135deg, #fde047, #ca8a04)', color: '#ffffff', shadow: '0 4px 12px rgba(202, 138, 4, 0.3)', hoverBg: 'rgba(202, 138, 4, 0.08)' };
  }
  if (lowercase === '#14b8a6') {
    return { bg: 'linear-gradient(135deg, #2dd4bf, #0d9488)', color: '#ffffff', shadow: '0 4px 12px rgba(13, 148, 136, 0.3)', hoverBg: 'rgba(13, 148, 136, 0.08)' };
  }
  if (lowercase === '#0ea5e9') {
    return { bg: 'linear-gradient(135deg, #38bdf8, #0284c7)', color: '#ffffff', shadow: '0 4px 12px rgba(2, 132, 199, 0.3)', hoverBg: 'rgba(2, 132, 199, 0.08)' };
  }
  if (lowercase === '#6366f1' || lowercase === '#4f46e5') {
    return { bg: 'linear-gradient(135deg, #818cf8, #4f46e5)', color: '#ffffff', shadow: '0 4px 12px rgba(79, 70, 229, 0.3)', hoverBg: 'rgba(79, 70, 229, 0.08)' };
  }
  if (lowercase === '#a855f7') {
    return { bg: 'linear-gradient(135deg, #c084fc, #7c3aed)', color: '#ffffff', shadow: '0 4px 12px rgba(124, 58, 237, 0.3)', hoverBg: 'rgba(124, 58, 237, 0.08)' };
  }

  return {
    bg: `linear-gradient(135deg, ${colorHex}, ${colorHex})`,
    color: '#ffffff',
    shadow: '0 4px 12px rgba(0,0,0,0.1)',
    hoverBg: 'rgba(0, 0, 0, 0.03)'
  };
};

const calculateWorkingDays = (fromStr: string, toStr: string, session: string) => {
  if (!fromStr) return 0;
  if (session === 'morning' || session === 'afternoon') {
    return 0.5;
  }
  if (session === 'full') {
    return 1.0;
  }
  if (!toStr) return 0;
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return 0;

  let count = 0;
  const curDate = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const endDate = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  
  while (curDate <= endDate) {
    const dayOfWeek = curDate.getDay();
    // Exclude Sunday (0)
    if (dayOfWeek !== 0) {
      count += 1;
    }
    curDate.setDate(curDate.getDate() + 1);
  }
  return count;
};

const diffHours = (start: string, end: string) => {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const diffMin = (eh * 60 + em) - (sh * 60 + sm);
  return diffMin > 0 ? Number((diffMin / 60).toFixed(1)) : 0;
};

export interface ApprovalDraft {
  id: string;
  userId: number | string;
  workflowDefId: string;
  workflowDefName: string;
  formType: string;
  title: string;
  amount: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
  formData: any;
}

const getApprovalDraftsStorageKey = (userId?: number | string, tenantId?: number | string) =>
  `myerp_approval_drafts_t${tenantId || 'default'}_u${userId || 'anon'}`;

const getPendingBadgeStorageKey = (userId?: number | string, tenantId?: number | string) =>
  `pending_approvals_count_t${tenantId || 'default'}_u${userId || 'anon'}`;

const getStoredApprovalDrafts = (userId?: number | string, tenantId?: number | string): ApprovalDraft[] => {
  if (typeof window === 'undefined') return [];
  try {
    const key = getApprovalDraftsStorageKey(userId, tenantId);
    let raw = localStorage.getItem(key);
    if (!raw && tenantId && userId) {
      // One-time read migration from legacy global key, scoped strictly to matching userId
      const legacy = localStorage.getItem('myerp_approval_drafts');
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy)) {
          const own = parsedLegacy.filter((d: any) => String(d?.userId) === String(userId));
          if (own.length > 0) {
            localStorage.setItem(key, JSON.stringify(own));
            return own;
          }
        }
      }
    }
    if (!raw) return [];
    const all = JSON.parse(raw);
    if (!Array.isArray(all)) return [];
    if (!userId) return all;
    return all.filter((d: any) => String(d.userId) === String(userId));
  } catch (e) {
    return [];
  }
};

const persistApprovalDrafts = (drafts: ApprovalDraft[], userId?: number | string, tenantId?: number | string) => {
  if (typeof window === 'undefined') return;
  try {
    const key = getApprovalDraftsStorageKey(userId, tenantId);
    const raw = localStorage.getItem(key);
    let all: ApprovalDraft[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) all = parsed;
    }
    if (userId) {
      all = all.filter(d => String(d.userId) !== String(userId));
      all = [...drafts, ...all];
    } else {
      all = drafts;
    }
    localStorage.setItem(key, JSON.stringify(all));
  } catch (e) {}
};

const parseMoneyInput = (raw: string, currency: string = 'VND'): string => {
  if (currency === 'VND') return raw.replace(/\D/g, '');
  let cleaned = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '').slice(0, 2);
  }
  return cleaned;
};

const formatNumberWithDots = (val: string | number, currency: string = 'VND') => {
  if (val === undefined || val === null || val === '') return '';
  if (currency !== 'VND') {
    if (typeof val === 'string') {
      const cleaned = parseMoneyInput(val, currency);
      if (!cleaned) return '';
      if (cleaned.endsWith('.')) {
        const intPart = cleaned.slice(0, -1);
        return (intPart ? new Intl.NumberFormat('en-US').format(Number(intPart)) : '0') + '.';
      }
      const [intPart, decPart] = cleaned.split('.');
      const formattedInt = intPart ? new Intl.NumberFormat('en-US').format(Number(intPart)) : '0';
      return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
    }
    const n = Number(val);
    return Number.isFinite(n) ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n) : '';
  }
  const num = parseMoneyVn(val, 'VND');
  return new Intl.NumberFormat('vi-VN').format(num);
};

const normalizeFileUrl = (u: string) => {
  if (!u) return '';
  return u.replace(/^https?:\/\/[^\/]+/i, '')
          .replace(/^\/?backend\/?/i, '')
          .replace(/^\/+/, '')
          .split('?')[0];
};

const getFileNameFromUrl = (u: string) => {
  return normalizeFileUrl(u).split('/').pop() || '';
};

const approvalsCache: {
  scopeKey: string;
  pendingList: ApprovalItem[];
  myRequestsList: ApprovalItem[];
  followingList: ApprovalItem[];
  allList: ApprovalItem[];
  users: any[];
  teams: any[];
  suppliers: any[];
  companies: any[];
  contacts: any[];
  timestamp: number;
} = {
  scopeKey: '',
  pendingList: [],
  myRequestsList: [],
  followingList: [],
  allList: [],
  users: [],
  teams: [],
  suppliers: [],
  companies: [],
  contacts: [],
  timestamp: 0
};
const APPROVALS_SWR_TTL_MS = 45_000;

export default function Approvals() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { config } = useTenantConfig();
  const { tenantId } = useSettingsBootstrap();
  const showConfirm = useUIStore(s => s.showConfirm);
  const closeConfirm = useUIStore(s => s.closeConfirm);
  const location = useLocation();
  const navigate = useNavigate();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 1024 : false);

  const approvalPolicy = useTypedSetting('finance.approval_policy', {
    po_three_level_vnd: 5000000,
    tiers_above: 3,
    mobile_swipe_require_confirm: true,
    swipe_threshold_px: 80,
    recent_limit: 6,
    query_cap: 500
  });
  const fxRates = useTypedSetting('finance.currency_and_fx_rates', {
    default: 'VND',
    rates_to_vnd: { USD: 25400, EUR: 30000, CHF: 32000 } as Record<string, number>
  });
  const vatPolicy = useTypedSetting('finance.vat_and_cit_policy', {
    vat_rates: [0, 5, 8, 10],
    quote_default_vat: 10
  });
  const vietqrConfig = useTypedSetting('finance.vietqr_config', {
    template: 'compact2',
    default_bank: 'VCB',
    memo_prefix: 'Thanh toan',
    memo_max_len: 50
  });
  const leavePolicy = useTypedSetting('hrm.leave_and_wfh_policy', {
    annual_quota_days: 12,
    max_request_days: 365,
    wfh_paid_days: 2,
    wfh_excess_rate_pct: 50
  });
  const uploadPolicy = useTypedSetting('core.upload_security_policy', { max_mb: 50 });
  const uiMotion = useTypedSetting('ui.overlay_zindex_and_motion_ms', {
    drawer_ms: 220,
    bezier: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    z_drawer: 2147483625,
    z_modal_nested: 2147483646
  });

  const threeLevelThresholdVnd = Math.max(0, Number(approvalPolicy?.po_three_level_vnd ?? 5000000));
  const maxUploadBytes = Math.max(1, Number(uploadPolicy?.max_mb ?? 50)) * 1024 * 1024;
  const recentLimit = Math.max(1, Number(approvalPolicy?.recent_limit ?? 6));
  const queryCap = Math.max(50, Math.min(1000, Number(approvalPolicy?.query_cap ?? 500)));

  const toVndAmount = useCallback((amount: number | string, currency?: string): number => {
    const n = Number(amount || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const rawCur = String(currency || 'VND').toUpperCase().trim();
    if (rawCur === 'VND') return n;
    const key = rawCur === 'EURO' ? 'EUR' : rawCur;
    const rates = (fxRates?.rates_to_vnd || {}) as Record<string, number>;
    const rate = Number(rates[key] ?? rates[rawCur] ?? (key === 'USD' ? 25400 : key === 'EUR' ? 30000 : key === 'CHF' ? 32000 : 1));
    return n * (Number.isFinite(rate) && rate > 0 ? rate : 1);
  }, [fxRates]);

  const cacheScopeKey = `t${tenantId || 'default'}_u${user?.id || 'anon'}`;

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const isAdmin = isManagement(user) || isHR(user);
  const isStrictAdmin = ['admin', 'superadmin', 'super_admin', 'director'].includes(String(user?.role || '').toLowerCase());
  const [activeTab, setActiveTab] = useState<'pending' | 'my_requests' | 'following' | 'all'>('pending');
  const hasAutoSwitchedTabRef = useRef(false);
  const handleTabChange = useCallback((tab: 'pending' | 'my_requests' | 'following' | 'all') => {
    hasAutoSwitchedTabRef.current = true;
    setActiveTab(tab);
  }, []);

  useEffect(() => {
    hasAutoSwitchedTabRef.current = false;
  }, [location.key]);

  const pendingOpenRef = useRef<{ id: number; type?: string; status?: string } | null>(null);
  const clearApprovalUrlParams = useCallback(() => {
    const params = new URLSearchParams(location.search || window.location.search);
    let changed = false;
    ['id', 'open_id', 'open_type', 'type', 'open_status', 'auto_open', 'open_first'].forEach(k => {
      if (params.has(k)) {
        params.delete(k);
        changed = true;
      }
    });
    if (changed) {
      const nextSearch = params.toString();
      navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : '' }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const [period, setPeriod] = useState<Period>('all');
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange('all'));
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  const [pendingList, setPendingList] = useState<ApprovalItem[]>(() =>
    approvalsCache.scopeKey === cacheScopeKey ? approvalsCache.pendingList : []
  );
  const [myRequestsList, setMyRequestsList] = useState<ApprovalItem[]>(() =>
    approvalsCache.scopeKey === cacheScopeKey ? approvalsCache.myRequestsList : []
  );
  const [followingList, setFollowingList] = useState<ApprovalItem[]>(() =>
    approvalsCache.scopeKey === cacheScopeKey ? approvalsCache.followingList : []
  );
  const [allList, setAllList] = useState<ApprovalItem[]>(() =>
    approvalsCache.scopeKey === cacheScopeKey ? approvalsCache.allList : []
  );
  const [loading, setLoading] = useState(false);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | number | null>(null);
  const [selectedItem, setSelectedItem] = useState<ApprovalItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [itemToApprove, setItemToApprove] = useState<ApprovalItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchRejectModalOpen, setBatchRejectModalOpen] = useState(false);
  const [batchRejectReason, setBatchRejectReason] = useState('');
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  
  // Custom states for timeline details and user listings
  const [users, setUsers] = useState<any[]>(() =>
    approvalsCache.scopeKey === cacheScopeKey ? approvalsCache.users : []
  );
  const [selectedTimelineItem, setSelectedTimelineItem] = useState<ApprovalItem | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);

  useEffect(() => {
    if (approvalsCache.scopeKey !== cacheScopeKey) {
      approvalsCache.scopeKey = cacheScopeKey;
      approvalsCache.pendingList = [];
      approvalsCache.myRequestsList = [];
      approvalsCache.followingList = [];
      approvalsCache.allList = [];
      approvalsCache.users = [];
      approvalsCache.teams = [];
      approvalsCache.suppliers = [];
      approvalsCache.companies = [];
      approvalsCache.contacts = [];
      approvalsCache.timestamp = 0;
      setPendingList([]);
      setMyRequestsList([]);
      setFollowingList([]);
      setAllList([]);
      setSelectedIds(new Set());
    }
  }, [cacheScopeKey]);

  // Auto-open requested approval from URL parameters or global custom event
  useEffect(() => {
    if (!location.pathname.startsWith('/approvals')) return;
    const params = new URLSearchParams(location.search || window.location.search);
    const hcId = params.get('highlight_comment_id') || params.get('comment_id');
    if (hcId) {
      setHighlightedCommentId(hcId);
    }
    const openId = params.get('open_id') || params.get('id');
    const tabParam = (params.get('tab') || '').toLowerCase();
    const tabTypeMap: Record<string, string> = {
      leave: 'leave',
      overtime: 'leave',
      advance: 'advance',
      advances: 'advance',
      attendance: 'attendance_bulk',
      kpi: 'kpi',
      expenses: 'expense',
      expense: 'expense',
      po: 'po',
      so: 'so',
      sales_order: 'sales_order',
      deposit: 'deposit',
      quote: 'quote'
    };
    const rawOpenType = params.get('open_type') || params.get('type') || tabTypeMap[tabParam] || null;
    const openType = rawOpenType === 'overtime' ? 'leave' : rawOpenType;
    const openStatus = params.get('open_status');
    const actionParam = params.get('action');

    if (tabParam === 'my_requests' && !hasAutoSwitchedTabRef.current) {
      setActiveTab('my_requests');
      hasAutoSwitchedTabRef.current = true;
    }

    const controller = new AbortController();
    let cancelled = false;

    if (openId && !isNaN(Number(openId)) && Number(openId) > 0) {
      useUIStore.getState().closeApprovalDrawer();
      const numId = Number(openId);
      pendingOpenRef.current = { id: numId, type: openType || undefined, status: openStatus || undefined };

      const combined = [...pendingList, ...myRequestsList, ...followingList, ...allList];
      const found = combined.find(it => it.id === numId && (!openType || it.type === openType)) || combined.find(it => it.id === numId);
      if (found) {
        if (actionParam === 'edit' || actionParam === 'duplicate') {
          handleEditRequest(found, actionParam === 'duplicate');
        } else {
          setSelectedTimelineItem(found);
        }
        pendingOpenRef.current = null;
        clearApprovalUrlParams();
      } else {
        // Direct fetch single item if not in list; clear URL params only after resolution
        if (openType === 'po' || openType === 'purchase_order') {
          api.get(`/purchase-orders/${numId}`, { signal: controller.signal }).then(poRes => {
            if (cancelled) return;
            const po = poRes.data?.data || poRes.data;
            if (po && (po.id || po.po_number)) {
              setSelectedTimelineItem({
                id: po.id,
                type: 'po',
                title: po.po_number ? `Đơn mua hàng ${po.po_number}` : (po.notes || `Đơn hàng PO #${po.id}`),
                description: po.notes || '',
                amount: Number(po.total || po.subtotal || 0),
                currency: 'VND',
                status: po.status === 'pending_approval' ? 'pending' : (po.status || 'pending'),
                created_at: po.created_at || new Date().toISOString(),
                created_by: po.created_by,
                user_id: po.created_by,
                employee_name: po.creator_name || ''
              } as any);
              pendingOpenRef.current = null;
            }
          }).catch(() => {}).finally(() => { if (!cancelled) clearApprovalUrlParams(); });
        } else if (openType === 'so' || openType === 'sales_order') {
          api.get(`/sales-orders/${numId}`, { signal: controller.signal }).then(soRes => {
            if (cancelled) return;
            const so = soRes.data?.data || soRes.data;
            if (so && (so.id || so.so_number)) {
              setSelectedTimelineItem({
                id: so.id,
                type: 'so',
                title: so.so_number ? `Đơn bán hàng ${so.so_number}` : (so.notes || `Đơn hàng SO #${so.id}`),
                description: so.notes || '',
                amount: Number(so.total_amount || so.total || 0),
                currency: so.currency || 'VND',
                status: so.status === 'pending_approval' ? 'pending' : (so.status || 'pending'),
                created_at: so.created_at || new Date().toISOString(),
                created_by: so.created_by || so.user_id,
                user_id: so.user_id || so.created_by,
                employee_name: so.creator_name || so.sales_name || ''
              } as any);
              pendingOpenRef.current = null;
            }
          }).catch(() => {}).finally(() => { if (!cancelled) clearApprovalUrlParams(); });
        } else if (openType === 'deposit') {
          api.get(`/deposits/${numId}`, { signal: controller.signal }).then(depRes => {
            if (cancelled) return;
            const dep = depRes.data?.data || depRes.data;
            if (dep && dep.id) {
              setSelectedTimelineItem({
                id: dep.id,
                type: 'deposit',
                title: dep.deposit_code ? `Đặt cọc ${dep.deposit_code}` : `Đề nghị đặt cọc #${dep.id}`,
                description: dep.notes || dep.description || '',
                amount: Number(dep.amount || dep.deposit_amount || 0),
                currency: dep.currency || 'VND',
                status: dep.status || 'pending',
                created_at: dep.created_at || new Date().toISOString(),
                created_by: dep.created_by,
                user_id: dep.created_by,
                employee_name: dep.creator_name || ''
              } as any);
              pendingOpenRef.current = null;
            }
          }).catch(() => {}).finally(() => { if (!cancelled) clearApprovalUrlParams(); });
        } else if (openType === 'expense' || !openType) {
          api.get(`/expenses/${numId}`, { signal: controller.signal }).then(res => {
            if (cancelled) return;
            const d = res.data?.data || res.data;
            if (d && d.id) {
              const itemObj = {
                ...d,
                id: d.id,
                type: 'expense',
                title: d.title || 'Đề xuất chi phí',
                description: d.notes || d.description || '',
                amount: Number(d.amount) || 0,
                currency: d.currency || 'VND',
                status: d.status || 'pending',
                created_at: d.created_at || new Date().toISOString(),
                created_by: d.created_by || d.user_id,
                user_id: d.user_id || d.created_by,
                employee_name: d.employee_name || d.user_name || ''
              } as any;
              if (actionParam === 'edit' || actionParam === 'duplicate') {
                handleEditRequest(itemObj, actionParam === 'duplicate');
              } else {
                setSelectedTimelineItem(itemObj);
              }
              pendingOpenRef.current = null;
            }
            clearApprovalUrlParams();
          }).catch(() => {
            if (cancelled) return;
            // Intelligent fallback: check /purchase-orders/:id if not an expense
            api.get(`/purchase-orders/${numId}`, { signal: controller.signal }).then(poRes => {
              if (cancelled) return;
              const po = poRes.data?.data || poRes.data;
              if (po && (po.id || po.po_number)) {
                setSelectedTimelineItem({
                  id: po.id,
                  type: 'po',
                  title: po.po_number ? `Đơn mua hàng ${po.po_number}` : (po.notes || `Đơn hàng PO #${po.id}`),
                  description: po.notes || '',
                  amount: Number(po.total || po.subtotal || 0),
                  currency: 'VND',
                  status: po.status === 'pending_approval' ? 'pending' : (po.status || 'pending'),
                  created_at: po.created_at || new Date().toISOString(),
                  created_by: po.created_by,
                  user_id: po.created_by,
                  employee_name: po.creator_name || ''
                } as any);
                pendingOpenRef.current = null;
              }
            }).catch(() => {}).finally(() => { if (!cancelled) clearApprovalUrlParams(); });
          });
        } else if (openType === 'leave') {
          fetchAPI('hrm/leaves', { signal: controller.signal }).then(res => {
            if (cancelled) return;
            const leaves = res?.data || [];
            const foundLv = Array.isArray(leaves) ? leaves.find((l: any) => Number(l.id) === numId) : null;
            if (foundLv) {
              setSelectedTimelineItem({
                ...foundLv,
                id: foundLv.id,
                type: 'leave',
                title: 'Đơn nghỉ phép / Đi muộn',
                description: foundLv.reason || '',
                status: foundLv.status || 'pending',
                total_days: foundLv.total_days,
                created_at: foundLv.created_at || new Date().toISOString(),
                user_id: foundLv.user_id,
                employee_name: foundLv.employee_name || ''
              } as any);
              pendingOpenRef.current = null;
            }
          }).catch(() => {}).finally(() => { if (!cancelled) clearApprovalUrlParams(); });
        } else if (openType === 'advance') {
          fetchAPI('hrm/advances', { signal: controller.signal }).then(res => {
            if (cancelled) return;
            const advances = res?.data || [];
            const foundAdv = Array.isArray(advances) ? advances.find((a: any) => Number(a.id) === numId) : null;
            if (foundAdv) {
              setSelectedTimelineItem({
                ...foundAdv,
                id: foundAdv.id,
                type: 'advance',
                title: 'Đề nghị tạm ứng',
                description: foundAdv.reason || '',
                amount: Number(foundAdv.amount) || 0,
                status: foundAdv.status || 'pending',
                created_at: foundAdv.created_at || new Date().toISOString(),
                user_id: foundAdv.user_id,
                employee_name: foundAdv.employee_name || ''
              } as any);
              pendingOpenRef.current = null;
            }
          }).catch(() => {}).finally(() => { if (!cancelled) clearApprovalUrlParams(); });
        } else if (openType === 'attendance_bulk' || openType === 'checkin') {
          const endpoint = openType === 'attendance_bulk' ? `/check-ins/bulk-requests/${numId}` : `/check-ins/${numId}`;
          api.get(endpoint, { signal: controller.signal }).then(res => {
            if (cancelled) return;
            const d = res.data?.data || res.data;
            if (d && (d.id || d.details)) {
              setSelectedTimelineItem({
                ...d,
                id: d.id || numId,
                type: openType as any,
                title: openType === 'attendance_bulk' ? 'Đề xuất bổ sung công hàng loạt' : 'Đề xuất chấm công',
                description: d.reason || d.notes || '',
                status: d.status || 'pending',
                created_at: d.created_at || new Date().toISOString(),
                user_id: d.user_id,
                employee_name: d.employee_name || d.full_name || ''
              } as any);
              pendingOpenRef.current = null;
            }
          }).catch(() => {}).finally(() => { if (!cancelled) clearApprovalUrlParams(); });
        } else {
          clearApprovalUrlParams();
        }
      }
    }

    const handleCustomOpen = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        useUIStore.getState().closeApprovalDrawer();
        const { id, type, raw, mode, status } = customEvent.detail;
        const normalizedType = type === 'overtime' ? 'leave' : type;
        if (raw && (mode === 'edit' || mode === 'duplicate')) {
          handleEditRequest(raw, mode === 'duplicate');
          pendingOpenRef.current = null;
        } else if (raw) {
          setSelectedTimelineItem(raw);
          pendingOpenRef.current = null;
        } else if (id) {
          const numId = Number(id);
          const combined = [...pendingList, ...myRequestsList, ...followingList, ...allList];
          const matchedItem = combined.find(it => it.id === numId && (!normalizedType || it.type === normalizedType)) || combined.find(it => it.id === numId);
          if (matchedItem) {
            setSelectedTimelineItem(matchedItem);
            pendingOpenRef.current = null;
          } else {
            pendingOpenRef.current = { id: numId, type: normalizedType || undefined, status: status || undefined };
            setSelectedTimelineItem({
              id: numId,
              type: (normalizedType || 'expense') as any,
              title: '',
              description: '',
              status: status || 'pending',
              created_at: new Date().toISOString()
            });
            loadDataRef.current?.(true);
          }
        } else if (normalizedType) {
          pendingOpenRef.current = { id: 0, type: normalizedType, status: status || undefined };
          const combined = [...pendingList, ...myRequestsList, ...followingList, ...allList];
          const matched = combined.find(it => it.type === normalizedType);
          if (matched) {
            setSelectedTimelineItem(matched);
            pendingOpenRef.current = null;
          }
        }
      }
    };

    window.addEventListener('open-approval-item', handleCustomOpen);
    window.addEventListener('open-approval-drawer', handleCustomOpen);
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener('open-approval-item', handleCustomOpen);
      window.removeEventListener('open-approval-drawer', handleCustomOpen);
    };
  }, [location.search, location.pathname, pendingList.length, myRequestsList.length, followingList.length, allList.length, clearApprovalUrlParams]);

  // Fast O(1) user lookup maps for optimal table and drawer rendering
  const usersMap = useMemo(() => {
    const map = new Map<number, any>();
    if (user?.id) {
      map.set(Number(user.id), {
        ...user,
        full_name: (user as any).full_name || user.name,
        avatar_url: (user as any).avatar_url || user.avatar,
        avatar: user.avatar || (user as any).avatar_url,
      });
    }
    users.forEach(u => {
      if (u.id) map.set(Number(u.id), u);
    });
    return map;
  }, [users, user]);

  const usersByNameMap = useMemo(() => {
    const map = new Map<string, any>();
    if (user) {
      const selfEntry = {
        ...user,
        full_name: (user as any).full_name || user.name,
        avatar_url: (user as any).avatar_url || user.avatar,
        avatar: user.avatar || (user as any).avatar_url,
      };
      if ((user as any).full_name) map.set(String((user as any).full_name).toLowerCase().trim(), selfEntry);
      if (user.name) map.set(String(user.name).toLowerCase().trim(), selfEntry);
      if ((user as any).username) map.set(String((user as any).username).toLowerCase().trim(), selfEntry);
    }
    users.forEach(u => {
      if (u.full_name) map.set(String(u.full_name).toLowerCase().trim(), u);
      if (u.name) map.set(String(u.name).toLowerCase().trim(), u);
      if (u.username) map.set(String(u.username).toLowerCase().trim(), u);
    });
    return map;
  }, [users, user]);

  // Creation workflow states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedWorkflowDef, setSelectedWorkflowDef] = useState<any>(null);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('all');
  const [directorySearch, setDirectorySearch] = useState('');
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const editingItemIdRef = useRef<number | null>(null);
  const isHydratingEditOrDraftRef = useRef<boolean>(false);
  const [editingItemType, setEditingItemType] = useState<string | null>(null);

  // Drafts & Exit Confirmation States
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [exitTargetAction, setExitTargetAction] = useState<'back' | 'close' | null>(null);
  const [draftsList, setDraftsList] = useState<ApprovalDraft[]>(() => getStoredApprovalDrafts(user?.id, tenantId));

  useEffect(() => {
    if (user?.id) {
      setDraftsList(getStoredApprovalDrafts(user.id, tenantId));
    }
  }, [user?.id, tenantId]);

  const lastSavedSnapshotRef = useRef<string | null>(null);

  const handleDeleteDraft = (draftId: string, silent = false) => {
    const updated = draftsList.filter(d => d.id !== draftId);
    setDraftsList(updated);
    persistApprovalDrafts(updated, user?.id, tenantId);
    if (currentDraftId === draftId) setCurrentDraftId(null);
    if (!silent) toast.success(t('Đã xóa bản nháp!'));
  };

  const [recentWorkflows, setRecentWorkflows] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const localKey = `recent_workflows_t${tenantId || 'default'}_u${user.id}`;
    let saved: any[] = [];
    try {
      const stored = localStorage.getItem(localKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) saved = parsed;
      }
    } catch (e) {}

    // If local storage is empty, initialize it from myRequestsList
    if (saved.length === 0 && myRequestsList.length > 0) {
      const derivedIds: string[] = [];
      myRequestsList.forEach(item => {
        const found = workflowList.find(w => {
          if (item.type === 'leave' && w.id === 'leave_late') return true;
          if (item.type === 'advance' && w.id === 'advance_money') return true;
          if (item.type === 'checkin' && w.id === 'checkin_explain') return true;
          if (item.type === 'expense') {
            const cleanTitle = (item.title || '').replace('Yêu cầu chi phí: ', '').toLowerCase().trim();
            return w.name.toLowerCase().trim() === cleanTitle;
          }
          return false;
        });
        if (found && !derivedIds.includes(found.id)) {
          derivedIds.push(found.id);
        }
      });
      saved = derivedIds.slice(0, recentLimit);
      if (saved.length > 0) {
        localStorage.setItem(localKey, JSON.stringify(saved));
      }
    }

    const matched = (Array.isArray(saved) ? saved : [])
      .map(id => workflowList.find(w => w.id === id))
      .filter(Boolean);
    setRecentWorkflows(matched);
  }, [myRequestsList, user, tenantId, recentLimit]);

  const handleSelectWorkflow = (workflowId: string) => {
    userPickedApprover1Ref.current = false;
    userPickedApprover2Ref.current = false;
    userPickedApprover3Ref.current = false;
    if (!user) return;
    const localKey = `recent_workflows_t${tenantId || 'default'}_u${user.id}`;
    let saved: any[] = [];
    try {
      const stored = localStorage.getItem(localKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) saved = parsed;
      }
    } catch (e) {}

    const newSaved = [workflowId, ...saved.filter(id => id !== workflowId)].slice(0, recentLimit);
    localStorage.setItem(localKey, JSON.stringify(newSaved));

    const matched = newSaved
      .map(id => workflowList.find(w => w.id === id))
      .filter(Boolean);
    setRecentWorkflows(matched);
  };

  // Form field states
  const [proposerUser, setProposerUser] = useState<any>(null);
  const [formType, setFormType] = useState<'leave' | 'advance' | 'expense' | 'general' | 'attendance_bulk' | 'late_early' | 'overtime' | 'remote_work' | 'recruitment'>('expense');

  // Recruitment proposal states
  const [recruitmentJobTitle, setRecruitmentJobTitle] = useState('');
  const [recruitmentHeadcount, setRecruitmentHeadcount] = useState<number | string>(1);
  const [recruitmentDepartment, setRecruitmentDepartment] = useState('');
  const [recruitmentJobType, setRecruitmentJobType] = useState('full_time');
  const [recruitmentReason, setRecruitmentReason] = useState('expansion');
  const [recruitmentReplacementWho, setRecruitmentReplacementWho] = useState('');
  const [recruitmentSalaryMin, setRecruitmentSalaryMin] = useState<number | string>('');
  const [recruitmentSalaryMax, setRecruitmentSalaryMax] = useState<number | string>('');
  const [recruitmentSalaryNegotiable, setRecruitmentSalaryNegotiable] = useState(false);
  const [recruitmentExpectedDate, setRecruitmentExpectedDate] = useState(getLocalDateStr());
  const [recruitmentRequirements, setRecruitmentRequirements] = useState('');
  const [recruitmentDescription, setRecruitmentDescription] = useState('');
  const [leaveSession, setLeaveSession] = useState<'full' | 'morning' | 'afternoon' | 'range' | 'intermittent'>('full');
  const [lateEarlyType, setLateEarlyType] = useState<'late' | 'early'>('late');
  const [lateEarlyMinutes, setLateEarlyMinutes] = useState(30);
  const [isCustomMinutesMode, setIsCustomMinutesMode] = useState(false);
  const [otDate, setOtDate] = useState(getLocalDateStr());
  const [otStart, setOtStart] = useState('17:00');
  const [otEnd, setOtEnd] = useState('21:30');
  const [otType, setOtType] = useState<'compensatory' | 'salary'>('compensatory');
  const [otRate, setOtRate] = useState<number>(1.5);
  const [wfhSalaryRate, setWfhSalaryRate] = useState<number>(Number(leavePolicy?.wfh_excess_rate_pct ?? 50));
  const [expenseTitle, setExpenseTitle] = useState('');
  const [workflowTitleSuffix, setWorkflowTitleSuffix] = useState('');

  const getFullWorkflowTitle = useCallback((def?: any, suffix?: string): string => {
    const prefix = def?.name || selectedWorkflowDef?.name || 'Đề xuất';
    const s = (suffix !== undefined ? suffix : workflowTitleSuffix).trim();
    return s ? `${prefix} - ${s}` : prefix;
  }, [selectedWorkflowDef, workflowTitleSuffix]);

  const extractTitleSuffix = useCallback((title: string, defName?: string): string => {
    if (!title) return '';
    let cleanTitle = title.replace(/(?:\s*-\s*Cấp\s*\d+(?:\s*\([^)]*\))?)+$/gi, '').trim();
    if (/^(?:\[(?:Nghỉ phép|Đăng ký làm việc từ xa|Tăng ca|Đi muộn\/Về sớm)\]|Đăng ký (?:WFH|OT|đi muộn\/về sớm|đi trễ\s*\/\s*về sớm|đi muộn|đi trễ|về sớm|công tác)|Đơn xin nghỉ phép|Đề xuất tạm ứng lương)/i.test(cleanTitle)) {
      return cleanLeaveReasonText(cleanTitle, false);
    }
    const prefix = defName || selectedWorkflowDef?.name || '';
    if (prefix) {
      const lowerTitle = cleanTitle.toLowerCase();
      const lowerPrefix = prefix.toLowerCase();
      if (lowerTitle.startsWith((lowerPrefix + ' - ').toLowerCase())) {
        return cleanLeaveReasonText(cleanTitle.substring(prefix.length + 3).trim(), false);
      }
      if (lowerTitle.startsWith((lowerPrefix + ' — ').toLowerCase())) {
        return cleanLeaveReasonText(cleanTitle.substring(prefix.length + 3).trim(), false);
      }
      if (lowerTitle.startsWith((lowerPrefix + ': ').toLowerCase())) {
        return cleanLeaveReasonText(cleanTitle.substring(prefix.length + 2).trim(), false);
      }
      if (lowerTitle.startsWith(lowerPrefix)) {
        const rest = cleanTitle.substring(prefix.length).trim();
        return cleanLeaveReasonText(rest.replace(/^[\s\-–—:]+/, '').trim(), false);
      }
    }
    return cleanLeaveReasonText(cleanTitle.trim(), false);
  }, [selectedWorkflowDef]);
  const [jobPosition, setJobPosition] = useState('');
  const [departmentName, setDepartmentName] = useState('');
  const [teams, setTeams] = useState<any[]>(() => approvalsCache.teams);
  const [previewQrModalUrl, setPreviewQrModalUrl] = useState<string | null>(null);

  const getUserPrimaryDepartment = useCallback(() => {
    if (!user) return '';
    const fullUser = users.find(u => Number(u.id) === Number(user.id)) || user;
    
    // 1. Direct department/team name from user object
    if (fullUser.department && typeof fullUser.department === 'string') {
      const match = teams.find(t => t.name.toLowerCase() === fullUser.department.toLowerCase() || t.name.toLowerCase().includes(fullUser.department.toLowerCase()));
      if (match) return match.name;
      return fullUser.department;
    }
    if (fullUser.department_name) {
      return fullUser.department_name;
    }
    if (fullUser.team_name) {
      return fullUser.team_name;
    }
    if (fullUser.team_id) {
      const match = teams.find(t => Number(t.id) === Number(fullUser.team_id));
      if (match) return match.name;
    }
    if (Array.isArray(fullUser.teams) && fullUser.teams.length > 0) {
      const firstTeam = fullUser.teams[0];
      return typeof firstTeam === 'string' ? firstTeam : (firstTeam.name || '');
    }

    // 2. Role / Job Title match
    const roleLower = String(fullUser.role || '').toLowerCase();
    const titleLower = String(fullUser.job_title || '').toLowerCase();

    if (roleLower.includes('academic') || titleLower.includes('học vụ') || titleLower.includes('học thuật') || titleLower.includes('giảng viên') || titleLower.includes('giáo viên')) {
      const match = teams.find(t => t.name.toLowerCase().includes('học vụ') || t.name.toLowerCase().includes('học thuật'));
      if (match) return match.name;
    }
    if (roleLower === 'hr' || titleLower.includes('nhân sự') || titleLower.includes('hành chính')) {
      const match = teams.find(t => t.name.toLowerCase().includes('hành chính') || t.name.toLowerCase().includes('nhân sự'));
      if (match) return match.name;
    }
    if (roleLower === 'accountant' || titleLower.includes('kế toán')) {
      const match = teams.find(t => t.name.toLowerCase().includes('kế toán'));
      if (match) return match.name;
    }
    if (roleLower === 'marketing' || titleLower.includes('marketing')) {
      const match = teams.find(t => t.name.toLowerCase().includes('marketing'));
      if (match) return match.name;
    }
    if (roleLower === 'sale' || titleLower.includes('tuyển sinh') || titleLower.includes('kinh doanh')) {
      const match = teams.find(t => t.name.toLowerCase().includes('tuyển sinh') || t.name.toLowerCase().includes('kinh doanh'));
      if (match) return match.name;
    }

    // 3. Default to first department in teams list
    if (teams.length > 0) {
      return teams[0].name;
    }
    return '';
  }, [user, users, teams]);

  useEffect(() => {
    if (approvalsCache.teams.length > 0 && Date.now() - approvalsCache.timestamp < APPROVALS_SWR_TTL_MS) {
      setTeams(approvalsCache.teams);
      return;
    }
    fetchAPI('teams').then(res => {
      if (res && res.success && Array.isArray(res.data)) {
        setTeams(res.data);
        approvalsCache.teams = res.data;
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editingItemId && !departmentName) {
      const initDept = getUserPrimaryDepartment();
      if (initDept) {
        setDepartmentName(initDept);
      }
    }
  }, [teams, users, user, departmentName, editingItemId, getUserPrimaryDepartment]);
  const getTodayDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };


  const [paymentTarget, setPaymentTarget] = useState('Nội bộ');
  const [paymentEmployeeId, setPaymentEmployeeId] = useState('');
  const [paymentSupplierId, setPaymentSupplierId] = useState('');
  const [paymentLecturerId, setPaymentLecturerId] = useState('');
  const [paymentContactId, setPaymentContactId] = useState('');
  const [paymentBeneficiaryName, setPaymentBeneficiaryName] = useState('');
  const [paymentBankName, setPaymentBankName] = useState('');
  const [paymentBankAccount, setPaymentBankAccount] = useState('');
  const [paymentAccountName, setPaymentAccountName] = useState('');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [paymentTaxCode, setPaymentTaxCode] = useState('');
  const [paymentDueDate, setPaymentDueDate] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>(() => approvalsCache.suppliers);
  const [companies, setCompanies] = useState<any[]>(() => approvalsCache.companies);
  const [contacts, setContacts] = useState<any[]>(() => approvalsCache.contacts);

  // Meeting / Tiếp khách states
  const [meetingTargetType, setMeetingTargetType] = useState<'company' | 'lecturer' | 'contact' | 'gov' | 'other'>('company');
  const [meetingSelectedEntityId, setMeetingSelectedEntityId] = useState('');
  const [meetingClientName, setMeetingClientName] = useState('');
  const [meetingContactPerson, setMeetingContactPerson] = useState('');
  const [meetingContactPhone, setMeetingContactPhone] = useState('');
  const [meetingLocation, setMeetingLocation] = useState('');
  const [meetingDate, setMeetingDate] = useState(getTodayDateString());
  const [meetingTime, setMeetingTime] = useState('11:30');
  const [meetingClientCount, setMeetingClientCount] = useState('2');
  const [meetingInternalCount, setMeetingInternalCount] = useState('2');
  const [meetingPurpose, setMeetingPurpose] = useState('Gặp gỡ trao đổi & xúc tiến hợp tác kinh doanh');
  const [meetingInternalAttendees, setMeetingInternalAttendees] = useState<string[]>([]);
  const [meetingReimbursementMethod, setMeetingReimbursementMethod] = useState<'host_claim' | 'direct_partner' | 'corporate_card' | 'cash_advance'>('host_claim');
  const [meetingInvoiceType, setMeetingInvoiceType] = useState<'vat' | 'retail' | 'receipt' | 'pending'>('vat');

  // Recurring proposal additional states
  const [recurringStartDate, setRecurringStartDate] = useState(getTodayDateString());
  const [recurringPayDay, setRecurringPayDay] = useState('1');
  const [recurringUnlimited, setRecurringUnlimited] = useState(true);
  const [recurringContractNumber, setRecurringContractNumber] = useState('');

  // Additional payment & beneficiary states
  const [paymentGovAgencyType, setPaymentGovAgencyType] = useState<'tax' | 'social_insurance' | 'treasury' | 'other'>('tax');
  const [paymentGovDecisionNumber, setPaymentGovDecisionNumber] = useState('');
  const [paymentWalletType, setPaymentWalletType] = useState<'momo' | 'zalopay' | 'viettel_money'>('momo');
  const [paymentWalletPhone, setPaymentWalletPhone] = useState('');
  const [paymentCorporateCard, setPaymentCorporateCard] = useState('');
  const [paymentBankBranch, setPaymentBankBranch] = useState('');

  // Advance / Tạm ứng states
  const [advanceType, setAdvanceType] = useState('business_trip');
  const [advanceSettlementDate, setAdvanceSettlementDate] = useState('');

  // Expense claim / Phân loại chi phí states
  const [expenseCategory, setExpenseCategory] = useState('general');
  const [invoiceType, setInvoiceType] = useState<'vat_10' | 'vat_8' | 'vat_5' | 'vat_0' | 'retail' | 'none'>('vat_10');

  const [paymentMethod, setPaymentMethod] = useState('Chuyển khoản');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [paymentDestination, setPaymentDestination] = useState('');
  const [currencyType, setCurrencyType] = useState('VND');
  const [leaveType, setLeaveType] = useState('annual');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveFrom, setLeaveFrom] = useState(getTodayDateString());
  const [leaveTo, setLeaveTo] = useState(getTodayDateString());
  interface StationeryItem {
    id: number;
    name: string;
    quantity: number | string;
    unit: string;
    price?: number | string;
    vat?: number;
    vatType?: 'kct' | '0' | '5' | '8' | '10' | 'custom';
    notes?: string;
  }
  const [stationeryItems, setStationeryItems] = useState<StationeryItem[]>([
    { id: Date.now(), name: '', quantity: 1, unit: 'Cái', notes: '' }
  ]);
  const [intermittentDates, setIntermittentDates] = useState<{ date: string; session: 'full' | 'morning' | 'afternoon' }[]>([{ date: getTodayDateString(), session: 'full' }]);

  // Form fields for "In, đóng dấu và gửi hồ sơ" (print_stamp_send)
  const [pssReqEmployeeId, setPssReqEmployeeId] = useState<string>('');
  const [pssReqDate, setPssReqDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [pssExecutorId, setPssExecutorId] = useState<string>('');
  const [pssSendMethod, setPssSendMethod] = useState<string>('Chuyển phát nhanh');
  const [pssSendTimeFrame, setPssSendTimeFrame] = useState<string>('Sáng (08:00 - 12:00)');
  const [pssRecipientName, setPssRecipientName] = useState<string>('');
  const [pssRecipientAddress, setPssRecipientAddress] = useState<string>('');
  const [pssRecipientPhone, setPssRecipientPhone] = useState<string>('');
  const [pssRequiredSendDate, setPssRequiredSendDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  const [myBalance, setMyBalance] = useState<{
    annual_leave_total: number;
    annual_leave_used: number;
    compensatory_leave_total: number;
    compensatory_leave_used: number;
  } | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const resetPssStates = () => {
    setPssReqEmployeeId(user ? String(user.id) : '');
    setPssReqDate(new Date().toISOString().split('T')[0]);
    if (users && users.length > 0) {
      const anyHr = users.find(u => u.role?.toLowerCase() === 'hr' || u.job_title?.toLowerCase()?.includes('hành chính') || u.job_title?.toLowerCase()?.includes('nhân sự'));
      setPssExecutorId(anyHr ? String(anyHr.id) : '');
    } else {
      setPssExecutorId('');
    }
    setPssSendMethod('Chuyển phát nhanh');
    setPssSendTimeFrame('Sáng (08:00 - 12:00)');
    setPssRecipientName('');
    setPssRecipientAddress('');
    setPssRecipientPhone('');
    setPssRequiredSendDate(new Date().toISOString().split('T')[0]);
    setAttachments([]);
  };

  useEffect(() => {
    if (editingItemId || editingItemIdRef.current || currentDraftId || isHydratingEditOrDraftRef.current) return;
    if (selectedWorkflowDef?.id === 'print_stamp_send') {
      resetPssStates();
    }
  }, [selectedWorkflowDef, editingItemId, currentDraftId]);

  useEffect(() => {
    if (user && !pssReqEmployeeId) {
      setPssReqEmployeeId(String(user.id));
    }
  }, [user]);

  useEffect(() => {
    if (users && users.length > 0 && !pssExecutorId) {
      const anyHr = users.find(u => u.role?.toLowerCase() === 'hr' || u.job_title?.toLowerCase()?.includes('hành chính') || u.job_title?.toLowerCase()?.includes('nhân sự'));
      if (anyHr) setPssExecutorId(String(anyHr.id));
    }
  }, [users]);

  const fetchMyBalance = async () => {
    try {
      setLoadingBalance(true);
      const res = await api.get('/hrm/my-balance');
      if (res.data && res.data.success && res.data.data) {
        setMyBalance(res.data.data);
      }
    } catch (e) {
      console.error('Error fetching leave balance:', e);
    } finally {
      setLoadingBalance(false);
    }
  };

  useEffect(() => {
    if (showCreateModal && formType === 'leave') {
      fetchMyBalance();
    }
  }, [showCreateModal, formType]);
  // Table item state
  const [expenseItems, setExpenseItems] = useState<any[]>([
    { id: Date.now(), content: '', quantity: 1, price: 0, vat: 10 }
  ]);

  // Comment states for Creation Drawer
  const [createComments, setCreateComments] = useState<any[]>([]);
  const [newCreateComment, setNewCreateComment] = useState('');
  const [createCommentAttachments, setCreateCommentAttachments] = useState<any[]>([]);
  const [createUploadingFile, setCreateUploadingFile] = useState(false);

  // Phased payment states
  const [isPhasedPayment, setIsPhasedPayment] = useState(false);
  const [installments, setInstallments] = useState<any[]>([
    { id: Date.now(), title: 'Đợt 1', amount: 0, dueDate: '' }
  ]);

  // Recurring proposal states
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState('monthly');
  const [recurringEndDate, setRecurringEndDate] = useState('');

  // Commission payout states (Multi-recipient)
  const [purchaseOrdersList, setPurchaseOrdersList] = useState<any[]>([]);
  const [commissionItems, setCommissionItems] = useState<any[]>([
    {
      id: Date.now(),
      recipient_type: 'employee',
      user_id: '',
      user_name: '',
      avatar: '',
      role: '',
      company_id: '',
      supplier_id: '',
      contact_id: '',
      other_id: '',
      other_type: '',
      po_number: '',
      po_id: '',
      bank_name: '',
      bank_account: '',
      bank_owner: '',
      amount: 0,
      note: ''
    }
  ]);

  // Load purchase orders for commission payout when needed
  useEffect(() => {
    if (selectedWorkflowDef?.id === 'commission_payout' && purchaseOrdersList.length === 0) {
      api.get('/purchase-orders').then(res => {
        setPurchaseOrdersList(extractArray(res?.data));
      }).catch(() => setPurchaseOrdersList([]));
    }
  }, [selectedWorkflowDef?.id, purchaseOrdersList.length]);


  const onSelectWorkflowItem = (item: any) => {
    setSelectedWorkflowDef(item);
    setExpenseTitle(item.name);
    setWorkflowTitleSuffix('');
    lastSavedSnapshotRef.current = null;
    setCurrentDraftId(null);
    handleSelectWorkflow(item.id);
    if (item.id === 'commission_payout') {
      setFormType('expense');
      setIsRecurring(false);
      setIsPhasedPayment(false);
      setPaymentTarget('Nội bộ');
      setInvoiceType('none');
      // Cho phép người tạo tự duyệt bước của mình nếu là Manager/Leader hoặc người dùng hiện tại
      const isManagerOrLeader = ['manager', 'director', 'admin', 'superadmin', 'super_admin', 'leader', 'truongphong', 'head_of_department'].includes(String(user?.role).toLowerCase()) || Boolean((user as any)?.is_team_leader);
      if (user) {
        setCustomApprover1(user);
      }
    } else if (item.id === 'advance_money') {
      setFormType('expense');
      setIsRecurring(false);
      setIsPhasedPayment(false);
      setPaymentTarget('Nội bộ');
      setAdvanceType('business_trip');
    } else if (item.id === 'recurring_payment') {
      setFormType('expense');
      setIsRecurring(true);
      setIsPhasedPayment(false);
      setPaymentTarget('Đối tác');
    } else if (item.id === 'phased_payment') {
      setFormType('expense');
      setIsPhasedPayment(true);
      setIsRecurring(false);
      setPaymentTarget('Đối tác');
    } else if (item.id === 'client_meeting') {
      setFormType('expense');
      setIsRecurring(false);
      setIsPhasedPayment(false);
      setPaymentTarget('Nội bộ');
      setMeetingReimbursementMethod('host_claim');
    } else if (item.id === 'expense_claim') {
      setFormType('expense');
      setIsRecurring(false);
      setIsPhasedPayment(false);
      setPaymentTarget('Nội bộ');
    } else if (item.id === 'payment') {
      setFormType('expense');
      setIsRecurring(false);
      setIsPhasedPayment(false);
      setPaymentTarget('Nội bộ');
    } else {
      const isGeneral = ['stationery', 'purchase_request', 'it_request', 'print_stamp_send', 'document_approval', 'meeting_room'].includes(item.id);
      setFormType(isGeneral ? 'general' : item.category === 'hr' ? 'leave' : 'expense');
      setIsRecurring(false);
      setIsPhasedPayment(false);
    }
  };

  // Attendance bulk states & helpers
  // Quy tắc: Trước hoặc ngày 5 tây (<= 5) mặc định quét tháng trước, sau ngày 5 tây (> 5) quét tháng này
  const getDefaultBulkMonth = () => {
    const now = new Date();
    const day = now.getDate();
    if (day <= 5) {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${d.getFullYear()}-${mm}`;
    } else {
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      return `${now.getFullYear()}-${mm}`;
    }
  };

  const getDayOfWeek = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return days[date.getDay()];
  };

  const [bulkMonth, setBulkMonth] = useState<string>(getDefaultBulkMonth());
  const [suggestedDays, setSuggestedDays] = useState<any[]>([]);
  const [suggestedLoading, setSuggestedLoading] = useState<boolean>(false);

  const formatTimeHHmm = (tStr: any, defaultVal = '08:30') => {
    if (!tStr) return defaultVal;
    const s = String(tStr).trim();
    if (s.includes(' ')) {
      const timePart = s.split(' ')[1] || '';
      return timePart.length >= 5 ? timePart.substring(0, 5) : defaultVal;
    }
    return s.length >= 5 ? s.substring(0, 5) : defaultVal;
  };

  const handleScanMissingDays = async (monthStr: string) => {
    setSuggestedLoading(true);
    try {
      const res = await api.get(`/check-ins/suggest-bulk-dates?month=${monthStr}`);
      if (res.data?.success) {
        const userDefaultIn = (user as any)?.work_start_time ? String((user as any).work_start_time).substring(0, 5) : '08:00';
        const userDefaultOut = (user as any)?.work_end_time ? String((user as any).work_end_time).substring(0, 5) : '17:00';
        const list = (res.data.data || []).map((item: any) => ({
          ...item,
          check_in: formatTimeHHmm(item.check_in || item.check_in_time, userDefaultIn),
          check_out: formatTimeHHmm(item.check_out || item.check_out_time, userDefaultOut),
          has_check_in: Boolean(item.has_check_in),
          has_check_out: Boolean(item.has_check_out),
          is_on_leave: Boolean(item.is_on_leave),
          leave_type: item.leave_type || '',
          leave_reason: item.leave_reason || '',
          disabled: Boolean(item.disabled || item.is_on_leave),
          reason: item.reason || ''
        }));
        setSuggestedDays(list);
        if (list.length === 0) {
          toast.success(t('Không có ngày thiếu công nào trong tháng chọn.'));
        }
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || t('Lỗi quét ngày thiếu công'));
    } finally {
      setSuggestedLoading(false);
    }
  };

  // Main list filters
  const [listSearchText, setListSearchText] = useState('');
  const [listCategoryFilter, setListCategoryFilter] = useState('all');
  const [listStatusFilter, setListStatusFilter] = useState('all');
  const [listCreatorFilter, setListCreatorFilter] = useState('all');



  // Pagination states
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    setPage(1);
  }, [activeTab, listSearchText, listCategoryFilter, listStatusFilter, listCreatorFilter]);

  // CC list / related users state
  const [relatedUsers, setRelatedUsers] = useState<string[]>([]);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isDraggingAttachments, setIsDraggingAttachments] = useState(false);
  const [uploadingAttachments, setUploadingAttachments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlightSubmitRef = useRef(false);

  const handleUploadFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;
    setUploadingAttachments(true);
    const toastId = toast.loading(`${t('Đang tải lên')} ${files.length} ${t('tệp tài liệu...')}`);
    try {
      const uploaded: any[] = [];
      for (const file of files) {
        if (file.size > maxUploadBytes) {
          toast.error(`${t('Tệp')} ${file.name} ${t('vượt quá kích thước')} ${uploadPolicy?.max_mb || 50}MB ${t('cho phép')}`);
          continue;
        }
        const fd = new FormData();
        fd.append('file', file, file.name || 'image.png');
        const res = await api.post('/upload', fd);
        if (res.data && res.data.success && res.data.data?.url) {
          uploaded.push({
            name: file.name || 'image.png',
            size: file.size,
            type: file.type,
            url: res.data.data.url
          });
        } else {
          throw new Error(res.data?.message || t('Tải lên thất bại'));
        }
      }
      if (uploaded.length > 0) {
        setAttachments(prev => [...prev, ...uploaded]);
        toast.success(`${t('Đã thêm')} ${uploaded.length} ${t('tệp đính kèm thành công!')}`, { id: toastId });
      } else {
        toast.dismiss(toastId);
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || t('Lỗi kết nối máy chủ');
      toast.error(t('Lỗi tải tệp lên: ') + errMsg, { id: toastId });
    } finally {
      setUploadingAttachments(false);
    }
  };

  // Global / Modal-level paste listener for attachments (Ctrl + V)
  useEffect(() => {
    if (!showCreateModal || !selectedWorkflowDef) return;

    const handlePaste = async (e: ClipboardEvent) => {
      if (uploadingAttachments) return;

      // If user is inside MentionInput (comment box), let MentionInput handle comment attachments
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.closest('.mention-input') || activeEl.getAttribute('contenteditable') === 'true' || activeEl.classList.contains('mention-input-textarea'))) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      const pastedFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type && item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            const ext = item.type.split('/')[1] || 'png';
            const namedFile = new File([file], file.name && file.name !== 'image.png' ? file.name : `ChungTu_${timestamp}_${i + 1}.${ext}`, { type: file.type });
            pastedFiles.push(namedFile);
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        await handleUploadFiles(pastedFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [showCreateModal, selectedWorkflowDef, uploadingAttachments]);

  // Draft and exit confirmation logic relocated below approver state declarations


  const sanitizeSubmittedBracketSpoof = (text: string) =>
    String(text || '').replace(/\[(APPROVAL_STEPS|Từ chối|Khấu trừ thực tế|Đã duyệt WFH|Đã tự động cộng)\b/gi, '($1');

  const handleCreateSubmit = async () => {
    if (inFlightSubmitRef.current || submitting) return;
    inFlightSubmitRef.current = true;
    setSubmitting(true);
    try {
      const defaultOrgApproverId = Number(
        config?.teams?.find((tm: any) => Number(tm.id) === Number((user as any)?.team_id))?.default_approver_id ||
        config?.teams?.[0]?.default_approver_id ||
        0
      ) || undefined;
      const fallbackProposerOrOrgId = Number(proposerUser?.id || user?.id || defaultOrgApproverId || 0) || undefined;
      let createdRecordId: number | null = editingItemId ? Number(editingItemId) : null;
      let createdRecordEndpointType: string = formType;

      // Resolve multi-level approver chain:
      // - Dưới ngưỡng 3 cấp: Tạo -> Leader -> Kế toán
      // - Từ ngưỡng 3 cấp trở lên: Tạo -> Leader -> Giám đốc -> Kế toán
      const managerId = showStepManager ? (customApprover1?.id || defaultApp1?.id || null) : null;
      const accountantId = showStepAccountant ? (customApprover2?.id || defaultAccountant?.id || null) : null;
      const directorId = showStepDirector ? (customApprover3?.id || defaultDirector?.id || null) : null;

      const activeApproverChain: number[] = [];
      if (showStepManager && managerId) activeApproverChain.push(Number(managerId));
      if (showStepDirector && directorId) activeApproverChain.push(Number(directorId));
      if (showStepAccountant && accountantId) activeApproverChain.push(Number(accountantId));

      const appVal1 = activeApproverChain[0] || fallbackProposerOrOrgId;
      const appVal2 = activeApproverChain[1] || null;
      const appVal3 = activeApproverChain[2] || null;

      let finalApproverId = activeApproverChain.length > 0 ? activeApproverChain[activeApproverChain.length - 1] : fallbackProposerOrOrgId;
      
      // Đối với quy trình In, đóng dấu và gửi hồ sơ:
      // Người duyệt duy nhất (Xác nhận hoàn thành) là Người thực hiện
      let effectiveAppVal1 = appVal1;
      let effectiveAppVal2 = appVal2;
      let effectiveAppVal3 = appVal3;

      if (selectedWorkflowDef?.id === 'print_stamp_send') {
        effectiveAppVal1 = Number(pssExecutorId) || Number(user?.id) || defaultOrgApproverId;
        effectiveAppVal2 = null;
        effectiveAppVal3 = null;
        finalApproverId = effectiveAppVal1;
      }

      // Giữ nguyên 100% danh sách Người theo dõi (relatedUserIds) mà người dùng đã chọn trên form, tuyệt đối không push thêm khi bấm Gửi
      const finalRelatedUserIds = [...relatedUserIds];

      if (selectedWorkflowDef?.id === 'print_stamp_send') {
        if (!pssReqEmployeeId) {
          toast.error(t('Vui lòng chọn nhân viên yêu cầu.'));
          setSubmitting(false);
          return;
        }
        if (!pssExecutorId) {
          toast.error(t('Vui lòng chọn người thực hiện.'));
          setSubmitting(false);
          return;
        }
        if (!pssRecipientName.trim()) {
          toast.error(t('Vui lòng nhập tên người nhận.'));
          setSubmitting(false);
          return;
        }
        if (!pssRecipientAddress.trim()) {
          toast.error(t('Vui lòng nhập địa chỉ người nhận.'));
          setSubmitting(false);
          return;
        }
        if (!pssRecipientPhone.trim()) {
          toast.error(t('Vui lòng nhập số điện thoại người nhận.'));
          setSubmitting(false);
          return;
        }
        if (attachments.length === 0) {
          toast.error(t('Vui lòng đính kèm hồ sơ cần đóng dấu.'));
          setSubmitting(false);
          return;
        }
      }

      if (formType === 'attendance_bulk') {
        createdRecordEndpointType = 'attendance_bulk';
        const validDays = suggestedDays.filter(d => !d.is_on_leave && !d.disabled);
        if (validDays.length === 0) {
          toast.error(t('Không có ngày thiếu công hợp lệ nào cần bổ sung (các ngày quét được đều đã có đơn nghỉ phép hoặc đã đủ công).'));
          setSubmitting(false);
          return;
        }
        if (editingItemId) {
          try {
            const upRes = await api.put(`/check-ins/bulk-requests/${editingItemId}`, {
              id: editingItemId,
              month_period: bulkMonth,
              details: validDays,
              approver_id: appVal1 || finalApproverId,
              related_user_ids: finalRelatedUserIds,
              status: 'pending'
            });
            createdRecordId = Number(upRes?.data?.data?.id || upRes?.data?.id || editingItemId);
          } catch {
            const cRes = await api.post('/check-ins/bulk-request', {
              id: editingItemId,
              month_period: bulkMonth,
              details: validDays,
              approver_id: appVal1 || finalApproverId,
              related_user_ids: finalRelatedUserIds
            });
            createdRecordId = Number(cRes?.data?.data?.id || cRes?.data?.id || editingItemId);
          }
        } else {
          const cRes = await api.post('/check-ins/bulk-request', {
            month_period: bulkMonth,
            details: validDays,
            approver_id: appVal1 || finalApproverId,
            related_user_ids: finalRelatedUserIds
          });
          createdRecordId = Number(cRes?.data?.data?.id || cRes?.data?.id || 0) || null;
        }
      } else if (formType === 'leave') {
        createdRecordEndpointType = 'leave';
        let fromVal = leaveFrom;
        let toVal = leaveTo;
        let daysVal = 1.0;

        if (leaveSession === 'full') {
          const d = leaveFrom ? leaveFrom.split('T')[0] : new Date().toISOString().split('T')[0];
          fromVal = `${d}T08:00`;
          toVal = `${d}T17:00`;
          daysVal = 1.0;
        } else if (leaveSession === 'morning') {
          const d = leaveFrom ? leaveFrom.split('T')[0] : new Date().toISOString().split('T')[0];
          fromVal = `${d}T08:00`;
          toVal = `${d}T12:00`;
          daysVal = 0.5;
        } else if (leaveSession === 'afternoon') {
          const d = leaveFrom ? leaveFrom.split('T')[0] : new Date().toISOString().split('T')[0];
          fromVal = `${d}T13:30`;
          toVal = `${d}T17:00`;
          daysVal = 0.5;
        } else if (leaveSession === 'intermittent') {
          const validDates = intermittentDates.filter(item => item.date);
          if (validDates.length === 0) {
            toast.error(t('Vui lòng chọn ít nhất 1 ngày xin nghỉ.'));
            setSubmitting(false);
            return;
          }
          
          const sortedDates = [...validDates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          const firstDate = sortedDates[0].date;
          const lastDate = sortedDates[sortedDates.length - 1].date;
          
          fromVal = `${firstDate}T08:00`;
          toVal = `${lastDate}T17:00`;
          
          daysVal = validDates.reduce((acc, item) => acc + (item.session === 'full' ? 1.0 : 0.5), 0);
        } else {
          if (leaveFrom && leaveTo && new Date(leaveTo) < new Date(leaveFrom)) {
            toast.error(t('Ngày kết thúc không được nhỏ hơn ngày bắt đầu.'));
            setSubmitting(false);
            return;
          }
          daysVal = calculateWorkingDays(leaveFrom, leaveTo, 'range');
        }

        const effectiveReason = sanitizeSubmittedBracketSpoof(combineUniqueReason(workflowTitleSuffix, leaveReason));
        if (!effectiveReason) {
          toast.error(t('Vui lòng nhập lý do xin nghỉ phép!'));
          setSubmitting(false);
          return;
        }

        let leaveReasonStr = effectiveReason;
        if (leaveSession === 'intermittent') {
          const datesLog = intermittentDates
            .filter(item => item.date)
            .map(item => `${item.date} (${item.session === 'full' ? t('Cả ngày') : item.session === 'morning' ? t('Sáng') : t('Chiều')})`)
            .join(', ');
          leaveReasonStr += ` [Ngày nghỉ chi tiết: ${datesLog}]`;
        }

        if (isRecurring) {
          leaveReasonStr += ` [Lặp lại định kỳ: ${recurringFrequency} - Hạn: ${recurringEndDate || 'Vô thời hạn'}]`;
        }
        const leavePayload = {
          leave_type: leaveType,
          reason: leaveReasonStr,
          from_date: fromVal,
          to_date: toVal,
          total_days: daysVal,
          approver_id: appVal1 || finalApproverId,
          approver_id_2: appVal2,
          related_user_ids: finalRelatedUserIds,
          status: 'pending'
        };
        if (editingItemId) {
          await api.put(`/hrm/leaves/${editingItemId}`, leavePayload);
          createdRecordId = Number(editingItemId);
        } else {
          const cRes = await fetchAPI('hrm/leaves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leavePayload)
          });
          createdRecordId = Number(cRes?.data?.id || cRes?.id || 0) || null;
        }
      } else if (formType === 'late_early') {
        createdRecordEndpointType = 'leave';
        if (lateEarlyMinutes > 180) {
          toast.error(t('Thời gian đi muộn/về sớm không được quá 3 tiếng (180 phút). Vui lòng đăng ký nghỉ phép 1 buổi.'));
          setSubmitting(false);
          return;
        }
        const effectiveReason = sanitizeSubmittedBracketSpoof(combineUniqueReason(workflowTitleSuffix, leaveReason));
        if (!effectiveReason) {
          toast.error(t('Vui lòng nhập lý do đi muộn/về sớm!'));
          setSubmitting(false);
          return;
        }
        const d = leaveFrom ? leaveFrom.split('T')[0] : new Date().toISOString().split('T')[0];
        const timeVal = otStart || (lateEarlyType === 'early' ? '16:30' : '08:30');
        const [sh, sm] = timeVal.split(':').map(Number);
        const startH = isNaN(sh) ? (lateEarlyType === 'early' ? 16 : 8) : sh;
        const startM = isNaN(sm) ? 30 : sm;
        const totalStartMin = startH * 60 + startM;
        const totalEndMin = totalStartMin + (lateEarlyMinutes || 30);
        const endH = Math.floor(totalEndMin / 60) % 24;
        const endM = totalEndMin % 60;
        const endHStr = String(endH).padStart(2, '0');
        const endMStr = String(endM).padStart(2, '0');
        const startHStr = String(startH).padStart(2, '0');
        const startMStr = String(startM).padStart(2, '0');

        const formattedFrom = `${d} ${startHStr}:${startMStr}:00`;
        const formattedTo = `${d} ${endHStr}:${endMStr}:00`;

        const lateEarlyPayload = {
          leave_type: 'late_early',
          late_early_type: lateEarlyType,
          ot_type: lateEarlyType,
          reason: effectiveReason,
          from_date: formattedFrom,
          to_date: formattedTo,
          total_days: 0.0,
          approver_id: appVal1 || finalApproverId,
          related_user_ids: finalRelatedUserIds,
          status: 'pending'
        };
        if (editingItemId) {
          await api.put(`/hrm/leaves/${editingItemId}`, lateEarlyPayload);
          createdRecordId = Number(editingItemId);
        } else {
          const cRes = await fetchAPI('hrm/leaves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lateEarlyPayload)
          });
          createdRecordId = Number(cRes?.data?.id || cRes?.id || 0) || null;
        }
      } else if (formType === 'overtime') {
        createdRecordEndpointType = 'leave';
        const effectiveReason = sanitizeSubmittedBracketSpoof(combineUniqueReason(workflowTitleSuffix, leaveReason));
        if (!effectiveReason) {
          toast.error(t('Vui lòng nhập lý do tăng ca!'));
          setSubmitting(false);
          return;
        }
        const fromStr = `${otDate}T${otStart}`;
        const toStr = `${otDate}T${otEnd}`;
        const hours = diffHours(otStart, otEnd);
        const daysVal = Number((hours / 8).toFixed(2));

        const otPayload = {
          leave_type: 'overtime',
          ot_type: otType,
          ot_rate: otRate,
          reason: effectiveReason,
          from_date: fromStr,
          to_date: toStr,
          total_days: daysVal,
          approver_id: appVal1 || finalApproverId,
          approver_id_2: appVal2,
          related_user_ids: finalRelatedUserIds,
          status: 'pending'
        };
        if (editingItemId) {
          await api.put(`/hrm/leaves/${editingItemId}`, otPayload);
          createdRecordId = Number(editingItemId);
        } else {
          const cRes = await fetchAPI('hrm/leaves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(otPayload)
          });
          createdRecordId = Number(cRes?.data?.id || cRes?.id || 0) || null;
        }
      } else if (formType === 'remote_work') {
        createdRecordEndpointType = 'leave';
        let fromVal = leaveFrom;
        let toVal = leaveTo;
        let daysVal = 1.0;

        if (leaveSession === 'full') {
          const d = leaveFrom ? leaveFrom.split('T')[0] : new Date().toISOString().split('T')[0];
          fromVal = `${d}T08:00`;
          toVal = `${d}T17:00`;
          daysVal = 1.0;
        } else if (leaveSession === 'morning') {
          const d = leaveFrom ? leaveFrom.split('T')[0] : new Date().toISOString().split('T')[0];
          fromVal = `${d}T08:00`;
          toVal = `${d}T12:00`;
          daysVal = 0.5;
        } else if (leaveSession === 'afternoon') {
          const d = leaveFrom ? leaveFrom.split('T')[0] : new Date().toISOString().split('T')[0];
          fromVal = `${d}T13:30`;
          toVal = `${d}T17:00`;
          daysVal = 0.5;
        } else {
          daysVal = calculateWorkingDays(leaveFrom, leaveTo, 'range');
        }

        const safeSalaryRate = Number(wfhSalaryRate);
        if (isNaN(safeSalaryRate) || safeSalaryRate < 0 || safeSalaryRate > 100) {
          toast.error(t('Tỷ lệ hưởng lương làm việc từ xa phải từ 0% đến 100% (không được vượt quá 100%)!'));
          setSubmitting(false);
          return;
        }

        const effectiveReason = sanitizeSubmittedBracketSpoof(combineUniqueReason(workflowTitleSuffix, leaveReason));
        if (!effectiveReason) {
          toast.error(t('Vui lòng nhập lý do / kế hoạch làm việc từ xa!'));
          setSubmitting(false);
          return;
        }

        const wfhPayload = {
          leave_type: 'remote_work',
          salary_rate: safeSalaryRate,
          reason: effectiveReason,
          from_date: fromVal,
          to_date: toVal,
          total_days: daysVal,
          approver_id: appVal1 || finalApproverId,
          related_user_ids: finalRelatedUserIds,
          status: 'pending'
        };
        if (editingItemId) {
          await api.put(`/hrm/leaves/${editingItemId}`, wfhPayload);
          createdRecordId = Number(editingItemId);
        } else {
          const cRes = await fetchAPI('hrm/leaves', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(wfhPayload)
          });
          createdRecordId = Number(cRes?.data?.id || cRes?.id || 0) || null;
        }
      } else if (formType === 'advance') {
        createdRecordEndpointType = 'advance';
        const effectiveAdvReason = sanitizeSubmittedBracketSpoof(combineUniqueReason(workflowTitleSuffix, leaveReason) || 'Tạm ứng');
        const advTypeMap: Record<string, string> = {
          business_trip: 'Tạm ứng công tác phí (Vé máy bay, khách sạn, di chuyển)',
          procurement: 'Tạm ứng mua sắm vật tư / trang thiết bị',
          event: 'Tạm ứng tổ chức sự kiện / hội thảo đào tạo',
          lecturer: 'Tạm ứng thù lao giảng viên / chuyên gia',
          salary: 'Ứng trước lương / Chi phí cá nhân',
          other: 'Tạm ứng nghiệp vụ khác'
        };
        let advReasonStr = effectiveAdvReason;
        if (advanceType) {
          advReasonStr += `\n[Đề nghị tạm ứng]:\n• Mục đích tạm ứng: ${advTypeMap[advanceType] || advanceType}${advanceSettlementDate ? `\n• Hạn hoàn ứng / quyết toán chứng từ: ${advanceSettlementDate}` : ''}`;
        }
        if (isRecurring) {
          advReasonStr += ` [Lặp lại định kỳ: ${recurringFrequency} - Hạn: ${recurringEndDate || 'Vô thời hạn'}]`;
        }
        if (paymentDestination) {
          advReasonStr += `\n[Thông tin chuyển khoản]: ${paymentDestination}`;
        }
        if (attachments.length > 0) {
          const baseUrl = import.meta.env.VITE_API_URL || '/backend';
          const attsStr = attachments.map(a => `• ${a.name} (${baseUrl}/${a.url})`).join('\n');
          advReasonStr += `\n[Tài liệu đính kèm (${attachments.length} tệp)]:\n${attsStr}`;
        }
        const advAmount = parseMoneyVn(paymentDetails, currencyType);
        const advPayload = {
          amount: advAmount,
          reason: advReasonStr,
          advance_type: advanceType,
          settlement_date: advanceSettlementDate || null,
          approver_id: appVal1 || finalApproverId,
          approver_id_2: appVal2,
          approver_id_3: toVndAmount(advAmount, currencyType) >= threeLevelThresholdVnd ? appVal3 : null,
          related_user_ids: relatedUserIds,
          currency: currencyType,
          status: 'pending'
        };
        if (editingItemId) {
          await api.put(`/hrm/advances/${editingItemId}`, advPayload);
          createdRecordId = Number(editingItemId);
        } else {
          const cRes = await fetchAPI('hrm/advances', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(advPayload)
          });
          createdRecordId = Number(cRes?.data?.id || cRes?.id || 0) || null;
        }
      } else if (formType === 'recruitment' || selectedWorkflowDef?.id === 'recruitment') {
        const safeTitle = recruitmentJobTitle.trim();
        if (!safeTitle) {
          toast.error(t('Vui lòng nhập vị trí / chức danh cần tuyển dụng!'));
          setSubmitting(false);
          return;
        }
        const safeHeadcount = Number(recruitmentHeadcount);
        if (isNaN(safeHeadcount) || safeHeadcount <= 0) {
          toast.error(t('Số lượng cần tuyển phải lớn hơn hoặc bằng 1 người!'));
          setSubmitting(false);
          return;
        }
        if (safeHeadcount > 999) {
          toast.error(t('Số lượng tuyển dụng vượt quá giới hạn hợp lệ (tối đa 999 người)!'));
          setSubmitting(false);
          return;
        }

        const safeSalaryMin = Number(recruitmentSalaryMin);
        const safeSalaryMax = Number(recruitmentSalaryMax);
        if (!recruitmentSalaryNegotiable && safeSalaryMin > 0 && safeSalaryMax > 0 && safeSalaryMin > safeSalaryMax) {
          toast.error(t('Mức lương tối thiểu không được lớn hơn mức lương tối đa!'));
          setSubmitting(false);
          return;
        }

        if (!appVal1 && !finalApproverId) {
          toast.error(t('Đề xuất tuyển dụng bắt buộc phải chọn người duyệt (Trưởng bộ phận / Quản lý).'));
          setSubmitting(false);
          return;
        }

        const jobTypeLabels: Record<string, string> = {
          full_time: 'Toàn thời gian (Full-time)',
          part_time: 'Bán thời gian (Part-time)',
          intern: 'Thực tập sinh (Intern)',
          probation: 'Thử việc',
          contractor: 'Cộng tác viên / Thời vụ'
        };

        const reasonLabels: Record<string, string> = {
          expansion: 'Tuyển mới mở rộng quy mô bộ phận / dự án mới',
          replacement: 'Tuyển thay thế nhân sự',
          project: 'Phục vụ dự án ngắn hạn / cao điểm',
          other: 'Nhu cầu nhân sự khác'
        };

        let salaryDisplay = 'Thỏa thuận theo năng lực';
        if (!recruitmentSalaryNegotiable) {
          if (safeSalaryMin > 0 && safeSalaryMax > 0) {
            salaryDisplay = `${formatApprovalCurrency(safeSalaryMin, 'VND')} - ${formatApprovalCurrency(safeSalaryMax, 'VND')}`;
          } else if (safeSalaryMin > 0) {
            salaryDisplay = `Từ ${formatApprovalCurrency(safeSalaryMin, 'VND')}`;
          } else if (safeSalaryMax > 0) {
            salaryDisplay = `Tối đa ${formatApprovalCurrency(safeSalaryMax, 'VND')}`;
          }
        }

        const recruitmentNotes = [
          `[Đề xuất tuyển dụng]:`,
          `• Vị trí cần tuyển: ${safeTitle}`,
          `• Số lượng cần tuyển: ${safeHeadcount} người`,
          `• Hình thức làm việc: ${jobTypeLabels[recruitmentJobType] || recruitmentJobType}`,
          recruitmentDepartment.trim() ? `• Phòng ban / Bộ phận tiếp nhận: ${recruitmentDepartment.trim()}` : '',
          `• Lý do tuyển dụng: ${reasonLabels[recruitmentReason] || recruitmentReason}${recruitmentReason === 'replacement' && recruitmentReplacementWho.trim() ? ` (Thay thế cho: ${recruitmentReplacementWho.trim()})` : ''}`,
          `• Mức lương dự kiến: ${salaryDisplay}`,
          recruitmentExpectedDate ? `• Ngày dự kiến nhận việc: ${recruitmentExpectedDate}` : '',
          recruitmentRequirements.trim() ? `• Tiêu chuẩn / Yêu cầu ứng viên: ${recruitmentRequirements.trim()}` : '',
          recruitmentDescription.trim() ? `• Mô tả công việc tóm tắt: ${recruitmentDescription.trim()}` : '',
          attachments.length > 0 ? `\n[Tài liệu đính kèm (${attachments.length} tệp)]:\n` + attachments.map(a => {
            const baseUrl = (import.meta.env.VITE_API_URL || '/backend').replace(/\/+$/, '');
            const norm = normalizeFileUrl(a.url);
            return `• ${a.name || 'Tài liệu'} (${baseUrl}/${norm})`;
          }).join('\n') : ''
        ].filter(Boolean).join('\n');

        const requestTitle = `Đề xuất tuyển dụng: ${safeTitle} (${safeHeadcount} người)`;
        const recPayload = {
          title: requestTitle,
          description: recruitmentNotes,
          notes: recruitmentNotes,
          amount: 0,
          category: 'hr',
          status: 'pending',
          approver_id: effectiveAppVal1 || finalApproverId,
          approver_id_2: effectiveAppVal2,
          approver_id_3: effectiveAppVal3,
          related_user_ids: finalRelatedUserIds,
          image_url: attachments[0]?.url || null
        };

        createdRecordEndpointType = 'expense';
        if (editingItemId) {
          await api.put(`/expenses/${editingItemId}`, recPayload);
          createdRecordId = Number(editingItemId);
        } else {
          const cRes = await api.post('/expenses', recPayload);
          createdRecordId = Number(cRes?.data?.data?.id || cRes?.data?.id || 0) || null;
        }
      } else if (formType === 'general') {
        createdRecordEndpointType = 'expense';
        let generalDesc = '';
        const validStationery = stationeryItems.filter(it => it.name.trim());
        const effectiveGenReason = sanitizeSubmittedBracketSpoof(combineUniqueReason(workflowTitleSuffix, leaveReason));
        let totalStationeryCost = 0;
        let totalStationeryVat = 0;
        if (selectedWorkflowDef?.id === 'stationery' || selectedWorkflowDef?.id === 'purchase_request' || selectedWorkflowDef?.id === 'it_request') {
          const validItems = stationeryItems.filter(it => it.name.trim());
          if (validItems.length === 0) {
            toast.error(t('Vui lòng nhập ít nhất 1 loại văn phòng phẩm cần đề xuất.'));
            setSubmitting(false);
            return;
          }
          const subtotal = validItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.price) || 0)), 0);
          totalStationeryVat = validItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.price) || 0) * (Number(it.vat !== undefined ? it.vat : vatPolicy?.quote_default_vat ?? 10) / 100)), 0);
          totalStationeryCost = subtotal + totalStationeryVat;

          const itemTypeName = selectedWorkflowDef?.id === 'purchase_request' 
            ? 'TRANG THIẾT BỊ ĐỀ XUẤT MUA SẮM' 
            : selectedWorkflowDef?.id === 'it_request' 
              ? 'THIẾT BỊ IT & PHẦN MỀM ĐỀ NGHỊ CẤP PHÁT' 
              : 'VĂN PHÒNG PHẨM ĐỀ XUẤT';

          const itemsText = validItems
            .map((it, idx) => {
              const qty = Number(it.quantity) || 1;
              const price = Number(it.price) || 0;
              const vatP = Number(it.vat !== undefined ? it.vat : vatPolicy?.quote_default_vat ?? 10);
              const lineTotal = (qty * price) * (1 + vatP / 100);
              const vatLabel = it.vatType === 'kct' ? 'Không chịu thuế' : `${vatP}%`;
              const priceStr = price > 0 ? ` - Đơn giá: ${formatApprovalCurrency(price, currencyType)} (VAT: ${vatLabel}, Thành tiền: ${formatApprovalCurrency(lineTotal, currencyType)})` : '';
              return `• [${idx + 1}] ${it.name.trim()} - Số lượng: ${it.quantity} ${it.unit || ''}${priceStr}${it.notes?.trim() ? ` (Ghi chú: ${it.notes.trim()})` : ''}`;
            })
            .join('\n');
          generalDesc = `DANH SÁCH ${itemTypeName} (${validItems.length} mục):\n${itemsText}\n\n`;
          if (totalStationeryCost > 0) {
            generalDesc += `[Tổng thanh toán]: Tiền hàng: ${formatApprovalCurrency(subtotal, currencyType)} | Tiền VAT: ${formatApprovalCurrency(totalStationeryVat, currencyType)} | Tổng cộng (có VAT): ${formatApprovalCurrency(totalStationeryCost, currencyType)}\n`;
          }
        } else if (selectedWorkflowDef?.id === 'print_stamp_send') {
          const reqEmployee = users.find(u => String(u.id) === String(pssReqEmployeeId))?.full_name || pssReqEmployeeId;
          const executor = users.find(u => String(u.id) === String(pssExecutorId))?.full_name || pssExecutorId;
          const baseUrl = import.meta.env.VITE_API_URL || '/backend';
          const attsStr = attachments.map(a => `${a.name} (${baseUrl}/${a.url})`).join(', ');
          generalDesc = `Quy trình: In, đóng dấu và gửi hồ sơ\n` +
            `Nhân viên yêu cầu: ${reqEmployee}\n` +
            `Ngày yêu cầu: ${pssReqDate}\n` +
            `Người thực hiện: ${executor}\n` +
            `Hình thức gửi: ${pssSendMethod}\n` +
            `Khung giờ gửi: ${pssSendTimeFrame}\n` +
            `Tên người nhận: ${pssRecipientName}\n` +
            `Địa chỉ người nhận: ${pssRecipientAddress}\n` +
            `SĐT người nhận: ${pssRecipientPhone}\n` +
            `Ngày cần gửi hồ sơ: ${pssRequiredSendDate}\n` +
            `Hồ sơ đính kèm: ${attsStr}`;
        }
        
        if (selectedWorkflowDef?.id !== 'print_stamp_send') {
          const effectiveGeneralReason = sanitizeSubmittedBracketSpoof(combineUniqueReason(workflowTitleSuffix, leaveReason));
          generalDesc += `Vị trí: ${jobPosition}\nPhòng ban: ${departmentName}\nNội dung đề xuất: ${sanitizeSubmittedBracketSpoof(paymentDetails || workflowTitleSuffix || '')}\nLý do: ${effectiveGeneralReason}`;
          if (isRecurring) {
            generalDesc += `\n[Lặp lại định kỳ]: Tần suất ${recurringFrequency} (Kết thúc: ${recurringEndDate || 'Vô thời hạn'})`;
          }
          if (attachments.length > 0) {
            const baseUrl = import.meta.env.VITE_API_URL || '/backend';
            const attsStr = attachments.map(a => `• ${a.name} (${baseUrl}/${a.url})`).join('\n');
            generalDesc += `\n[Tài liệu đính kèm (${attachments.length} tệp)]:\n${attsStr}`;
          }
        }

        if (editingItemId && (editingItemType === 'expense' || formType === 'general')) {
          await api.put(`/expenses/${editingItemId}`, {
            title: getFullWorkflowTitle(),
            description: generalDesc,
            notes: generalDesc,
            items: {
              stationery_items: validStationery,
              job_position: jobPosition,
              department_name: departmentName,
              payment_details: paymentDetails,
              leave_reason: effectiveGenReason
            },
            amount: totalStationeryCost,
            vat_amount: totalStationeryVat || 0,
            status: 'pending',
            approver_id: effectiveAppVal1 || finalApproverId,
            approver_id_2: effectiveAppVal2,
            approver_id_3: effectiveAppVal3,
            related_user_ids: finalRelatedUserIds,
            currency: currencyType,
            image_url: attachments[0]?.url || null,
            bank_name: paymentBankName || null,
            bank_account_number: paymentBankAccount || null,
            bank_account_name: paymentAccountName || null,
            bank_branch: paymentBankBranch || null,
            vendor_name: paymentBeneficiaryName || null
          });
          createdRecordId = Number(editingItemId);
        } else {
          const cRes = await api.post('/expenses', {
            title: getFullWorkflowTitle(),
            description: generalDesc,
            notes: generalDesc,
            items: {
              stationery_items: validStationery,
              job_position: jobPosition,
              department_name: departmentName,
              payment_details: paymentDetails,
              leave_reason: effectiveGenReason
            },
            amount: totalStationeryCost,
            vat_amount: totalStationeryVat || 0,
            status: 'pending',
            approver_id: effectiveAppVal1 || finalApproverId,
            approver_id_2: effectiveAppVal2,
            approver_id_3: effectiveAppVal3,
            related_user_ids: finalRelatedUserIds,
            currency: currencyType,
            image_url: attachments[0]?.url || null,
            bank_name: paymentBankName || null,
            bank_account_number: paymentBankAccount || null,
            bank_account_name: paymentAccountName || null,
            bank_branch: paymentBankBranch || null,
            vendor_name: paymentBeneficiaryName || null
          });
          createdRecordId = Number(cRes?.data?.data?.id || cRes?.data?.id || 0) || null;
        }
      } else {
        createdRecordEndpointType = 'expense';
        const isCommissionWfCheck = selectedWorkflowDef?.id === 'commission_payout';
        const totalAmt = isCommissionWfCheck
          ? commissionItems.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
          : expenseItems.reduce((acc, it) => acc + (it.quantity * it.price) * (1 + it.vat / 100), 0);
        if (!appVal1 && !finalApproverId) {
          toast.error(t('Chi phí yêu cầu duyệt bắt buộc phải chọn người duyệt Cấp 1 (Trưởng nhóm / Quản lý).'));
          setSubmitting(false);
          return;
        }
        if (!appVal2) {
          toast.error(t('Chi phí yêu cầu duyệt bắt buộc phải chọn người duyệt Cấp 2 (Kế toán).'));
          setSubmitting(false);
          return;
        }
        if (toVndAmount(totalAmt, currencyType) >= threeLevelThresholdVnd && !appVal3) {
          toast.error(t(`Chi phí từ ${formatApprovalCurrency(threeLevelThresholdVnd, 'VND')} trở lên bắt buộc phê duyệt đủ ${approvalPolicy?.tiers_above || 3} cấp: Leader -> Giám đốc -> Kế toán.`));
          setSubmitting(false);
          return;
        }

        let meetingStr = '';
        if (selectedWorkflowDef?.id === 'client_meeting') {
          const attendeesNames = meetingInternalAttendees.map(id => {
            const u = users.find(x => String(x.id) === String(id));
            return u ? (u.full_name || u.name) : id;
          }).filter(Boolean).join(', ');
          const targetTypeLabels: Record<string, string> = {
            company: 'Doanh nghiệp / Đối tác B2B',
            lecturer: 'Giảng viên / Chuyên gia cao cấp',
            contact: 'Khách hàng VIP / Học viên CRM',
            gov: 'Cơ quan Nhà nước / Ban ngành',
            other: 'Cá nhân ngoài / Khách vãng lai'
          };
          const reimbLabels: Record<string, string> = {
            host_claim: 'Hoàn ứng cho Cán bộ tiếp khách (Chi trước nhận lại sau)',
            direct_partner: 'Thanh toán trực tiếp cho Nhà hàng / Địa điểm tiếp đón',
            corporate_card: 'Thanh toán bằng Thẻ tín dụng doanh nghiệp',
            cash_advance: 'Tạm ứng kinh phí tiếp khách (Tiền mặt)'
          };
          meetingStr = [
            `[Thông tin tiếp khách]:`,
            `• Phân loại đối tượng: ${targetTypeLabels[meetingTargetType] || meetingTargetType}`,
            `• Đơn vị / Khách mời: ${meetingClientName || 'Chưa rõ'}`,
            meetingContactPerson ? `• Người đại diện: ${meetingContactPerson}${meetingContactPhone ? ` (SĐT: ${meetingContactPhone})` : ''}` : '',
            `• Địa điểm: ${meetingLocation || 'Chưa xác định'}`,
            `• Thời gian: ${meetingDate || getTodayDateString()}${meetingTime ? ` lúc ${meetingTime}` : ''}`,
            `• Quy mô tham gia: Khách mời (${meetingClientCount || 1} người) - Công ty (${meetingInternalCount || 1} người)`,
            attendeesNames ? `• Cán bộ tham gia cùng: ${attendeesNames}` : '',
            meetingPurpose ? `• Kế hoạch / Mục đích tiếp đón: ${meetingPurpose}` : '',
            `• Phương thức thanh toán: ${reimbLabels[meetingReimbursementMethod] || meetingReimbursementMethod}`
          ].filter(Boolean).join('\n');
        }

        let recurringStr = '';
        if (isRecurring || selectedWorkflowDef?.id === 'recurring_payment') {
          const freqLabels: Record<string, string> = {
            weekly: 'Hàng tuần',
            biweekly: 'Hàng 2 tuần',
            monthly: 'Hàng tháng',
            quarterly: 'Hàng quý (3 tháng/lần)',
            semiannually: 'Hàng nửa năm (6 tháng/lần)',
            yearly: 'Hàng năm'
          };
          const payDayLabels: Record<string, string> = {
            '1': 'Ngày 01 đầu tháng',
            '5': 'Ngày 05 hàng tháng',
            '10': 'Ngày 10 hàng tháng',
            '15': 'Ngày 15 hàng tháng',
            '20': 'Ngày 20 hàng tháng',
            '25': 'Ngày 25 hàng tháng',
            'last_day': 'Ngày làm việc cuối tháng'
          };
          recurringStr = [
            `[Thiết lập định kỳ]:`,
            `• Chu kỳ thanh toán: ${freqLabels[recurringFrequency] || recurringFrequency}`,
            `• Ngày giải ngân cố định: ${payDayLabels[recurringPayDay] || (recurringPayDay ? `Ngày ${recurringPayDay} hàng tháng` : 'Đầu kỳ')}`,
            `• Thời hạn hiệu lực: ${recurringUnlimited ? 'Vô thời hạn (Hiệu lực cho đến khi có thông báo hủy)' : `Từ ${recurringStartDate || getTodayDateString()} đến ${recurringEndDate || 'Không xác định'}`}`,
            recurringContractNumber ? `• Căn cứ Hợp đồng / Thỏa thuận: ${recurringContractNumber}` : ''
          ].filter(Boolean).join('\n');
        }

        let phasedStr = '';
        if (isPhasedPayment || selectedWorkflowDef?.id === 'phased_payment') {
          phasedStr = [
            `[Kế hoạch thanh toán theo đợt (${installments.length} đợt)]:`,
            ...installments.map((inst, idx) => 
              `• ${inst.title || `Đợt ${idx + 1}`}: ${formatApprovalCurrency(inst.amount, currencyType)}${inst.dueDate ? ` (Hạn: ${inst.dueDate})` : ''}`
            )
          ].join('\n');
        }

        let advanceStr = '';
        if (selectedWorkflowDef?.id === 'advance_money' || (formType as string) === 'advance') {
          const advMap: Record<string, string> = {
            business_trip: 'Tạm ứng công tác phí (Vé máy bay, khách sạn, di chuyển)',
            procurement: 'Tạm ứng mua sắm vật tư / trang thiết bị',
            event: 'Tạm ứng tổ chức sự kiện / hội thảo đào tạo',
            lecturer: 'Tạm ứng thù lao giảng viên / chuyên gia',
            salary: 'Ứng trước lương / Chi phí cá nhân',
            other: 'Tạm ứng nghiệp vụ khác'
          };
          advanceStr = [
            `[Đề nghị tạm ứng]:`,
            `• Mục đích tạm ứng: ${advMap[advanceType] || advanceType}`,
            advanceSettlementDate ? `• Hạn hoàn ứng / quyết toán chứng từ: ${advanceSettlementDate}` : ''
          ].filter(Boolean).join('\n');
        }

        let invoiceStr = '';
        if (selectedWorkflowDef?.id === 'expense_claim' || invoiceType || formType === 'expense') {
          const totalNetPrice = expenseItems.reduce((acc, it) => acc + (it.quantity * it.price), 0);
          const totalVatAmt = expenseItems.reduce((acc, it) => acc + (it.quantity * it.price) * (it.vat / 100), 0);
          let dynamicVatLabel = '';
          if (totalNetPrice > 0 && totalVatAmt > 0) {
            const effRate = Math.round((totalVatAmt / totalNetPrice) * 100);
            dynamicVatLabel = `Hóa đơn điện tử VAT ${effRate}%`;
          } else if (invoiceType === 'vat_0' || (totalNetPrice > 0 && totalVatAmt === 0)) {
            dynamicVatLabel = 'Hóa đơn điện tử VAT 0% / Không chịu thuế';
          }

          const invMap: Record<string, string> = {
            vat_10: 'Hóa đơn điện tử VAT 10%',
            vat_8: 'Hóa đơn điện tử VAT 8%',
            vat_5: 'Hóa đơn điện tử VAT 5%',
            vat_0: 'Hóa đơn điện tử VAT 0% / Không chịu thuế',
            retail: 'Hóa đơn bán lẻ / Biên lai thu tiền',
            none: 'Không có hóa đơn (Giải trình nội bộ)'
          };
          const catMap: Record<string, string> = {
            client_meeting: 'Chi phí tiếp khách / Ngoại giao',
            travel: 'Công tác phí / Vé xe / Đi lại',
            stationery: 'Văn phòng phẩm & Mua sắm vặt',
            marketing: 'Tiếp thị / Sự kiện / Quảng cáo',
            general: 'Chi phí nghiệp vụ khác'
          };
          const chosenDocLabel = (invoiceType === 'retail' || invoiceType === 'none')
            ? invMap[invoiceType]
            : (dynamicVatLabel || invMap[invoiceType] || 'Hóa đơn điện tử VAT 10%');

          const parts = [
            catMap[expenseCategory] ? `Danh mục: ${catMap[expenseCategory]}` : '',
            chosenDocLabel ? `Chứng từ: ${chosenDocLabel}` : '',
            paymentDueDate ? `Thời hạn thanh toán: ${paymentDueDate}` : ''
          ].filter(Boolean);
          if (parts.length > 0) {
            invoiceStr = `[Hồ sơ chi phí]: ${parts.join(' - ')}`;
          }
        }

        let beneficiaryStr = '';
        if (paymentTarget === 'Nội bộ') {
          const emp = users.find(u => String(u.id) === String(paymentEmployeeId));
          const empName = emp ? (emp.full_name || emp.name || '') : paymentBeneficiaryName;
          if (empName) beneficiaryStr = `Thụ hưởng (Nhân viên nội bộ): ${empName}`;
        } else if (paymentTarget === 'Giảng viên') {
          beneficiaryStr = `Thụ hưởng (Giảng viên / Chuyên gia): ${paymentBeneficiaryName}`;
        } else if (paymentTarget === 'Đối tác') {
          beneficiaryStr = `Thụ hưởng (Đối tác / Vendor): ${paymentBeneficiaryName}${paymentTaxCode ? ` (MST: ${paymentTaxCode})` : ''}`;
        } else if (paymentTarget === 'Khách hàng') {
          beneficiaryStr = `Thụ hưởng (Khách hàng / Học viên): ${paymentBeneficiaryName}`;
        } else if (paymentTarget === 'Cộng tác viên') {
          beneficiaryStr = `Thụ hưởng (Cộng tác viên / CTV): ${paymentBeneficiaryName}`;
        } else if (paymentTarget === 'Cơ quan Nhà nước') {
          beneficiaryStr = `Thụ hưởng (Cơ quan Nhà nước / Ngân sách): ${paymentBeneficiaryName}${paymentGovDecisionNumber ? ` (Số QĐ/Mã: ${paymentGovDecisionNumber})` : ''}`;
        } else if (paymentBeneficiaryName) {
          beneficiaryStr = `Thụ hưởng (${paymentTarget}): ${paymentBeneficiaryName}`;
        }
        if (paymentPhone) {
          beneficiaryStr += ` - SĐT: ${paymentPhone}`;
        }

        let bankInfoStr = '';
        if (paymentMethod === 'Chuyển khoản') {
          if (paymentBankName || paymentBankAccount || paymentAccountName) {
            bankInfoStr = `[Thông tin chuyển khoản]: ${paymentBankName || ''} - STK: ${paymentBankAccount || ''} - Chủ TK: ${paymentAccountName || ''}${paymentBankBranch ? ` - Chi nhánh: ${paymentBankBranch}` : ''}`;
          } else if (paymentDestination) {
            bankInfoStr = `[Thông tin chuyển khoản]: ${paymentDestination}`;
          }
        } else if (paymentMethod === 'Ví điện tử') {
          bankInfoStr = `[Hình thức]: Ví điện tử ${paymentWalletType.toUpperCase()} - SĐT ví: ${paymentWalletPhone || paymentPhone} - Chủ ví: ${paymentBeneficiaryName}`;
        } else if (paymentMethod === 'Thẻ tín dụng') {
          bankInfoStr = `[Hình thức]: Thẻ tín dụng doanh nghiệp (4 số cuối: ${paymentCorporateCard || 'N/A'})`;
        } else {
          bankInfoStr = `[Hình thức]: Tiền mặt${paymentBeneficiaryName ? ` - Người nhận: ${paymentBeneficiaryName}` : ''}${paymentDestination ? ` - Địa điểm bàn giao: ${paymentDestination}` : ''}`;
        }

        const infoParts = [
          meetingStr,
          recurringStr,
          phasedStr,
          advanceStr,
          invoiceStr,
          `Phòng ban: ${departmentName}`,
          `Đối tượng: ${paymentTarget}`,
          beneficiaryStr,
          `Hình thức: ${paymentMethod}`,
          bankInfoStr,
          paymentDetails ? `Chi tiết: ${sanitizeSubmittedBracketSpoof(paymentDetails)}` : ''
        ].filter(Boolean);

        let finalDesc = infoParts.join('\n\n');
        if (attachments.length > 0) {
          // Deduplicate attachments
          const uniqueAtts: any[] = [];
          for (const a of attachments) {
            if (!a || !a.url) continue;
            const norm = normalizeFileUrl(a.url);
            const name = a.name || getFileNameFromUrl(a.url);
            const already = uniqueAtts.some(u => normalizeFileUrl(u.url) === norm || (u.name && u.name === name));
            if (!already) {
              uniqueAtts.push(a);
            }
          }

          const baseUrl = (import.meta.env.VITE_API_URL || '/backend').replace(/\/+$/, '');
          const attsStr = uniqueAtts.map(a => {
            const norm = normalizeFileUrl(a.url);
            const fileName = a.name || getFileNameFromUrl(a.url) || 'Tài liệu';
            return `• ${fileName} (${baseUrl}/${norm})`;
          }).join('\n');
          finalDesc += `\n\n[Tài liệu đính kèm (${uniqueAtts.length} tệp)]:\n${attsStr}`;
        }

        const isCommissionWf = selectedWorkflowDef?.id === 'commission_payout';
        let payloadItems: any[] = expenseItems;
        let calcTotalAmt = 0;
        let calcVatAmt = 0;
        let effectiveRelatedUserIds = [...relatedUserIds];

        if (isCommissionWf) {
          const validCommission = commissionItems.filter(c => (c.user_id || c.user_name) && (Number(c.amount) > 0 || c.amount));
          if (validCommission.length === 0) {
            toast.error(t('Vui lòng thêm ít nhất một người nhận hoa hồng với số tiền hợp lệ.'));
            setSubmitting(false);
            return;
          }
          calcTotalAmt = validCommission.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
          calcVatAmt = 0;
          payloadItems = validCommission.map((c, idx) => ({
            stt: idx + 1,
            recipient_type: c.recipient_type || (c.user_id ? 'employee' : 'other'),
            user_id: c.user_id ? Number(c.user_id) : null,
            user_name: c.user_name || '',
            avatar: c.avatar || '',
            role: c.role || '',
            company_id: c.company_id || null,
            supplier_id: c.supplier_id || null,
            contact_id: c.contact_id || null,
            other_id: c.other_id || null,
            other_type: c.other_type || null,
            po_number: c.po_number || null,
            po_id: c.po_id || null,
            bank_name: c.bank_name || '',
            bank_account: c.bank_account || '',
            bank_account_no: c.bank_account || '',
            bank_owner: c.bank_owner || '',
            bank_account_name: c.bank_owner || '',
            amount: Number(c.amount) || 0,
            note: c.note || '',
            name: `Hoa hồng: ${c.user_name || ''}${c.po_number ? ` [PO: ${c.po_number}]` : ''}${c.note ? ` - ${c.note}` : ''}`,
            quantity: 1,
            unit_price: Number(c.amount) || 0,
            price: Number(c.amount) || 0,
            vat: 0,
            vat_amount: 0,
            total: Number(c.amount) || 0,
            is_paid: c.is_paid ? 1 : 0,
            unc_file_url: c.unc_file_url || null,
            paid_at: c.paid_at || null,
            paid_by: c.paid_by || null
          }));


          const commListStr = validCommission.map((c, idx) => {
            const isEmp = !c.recipient_type || c.recipient_type === 'employee';
            const typeTag = isEmp ? '[Nhân viên]' : '[Đối tác/Khác]';
            const poStr = c.po_number ? ` (Mã PO: ${c.po_number})` : '';
            return `• [${idx + 1}] ${typeTag} ${c.user_name}${poStr} (STK: ${c.bank_name || ''} ${c.bank_account || ''}) - Số tiền: ${formatApprovalCurrency(c.amount, currencyType)}${c.note ? ` (Ghi chú: ${c.note})` : ''}`;
          }).join('\n');
          finalDesc = `[Đề xuất chi trả hoa hồng - ${validCommission.length} đối tượng thụ hưởng]:\n${commListStr}\n\n[Tổng tiền chi trả]: ${formatApprovalCurrency(calcTotalAmt, currencyType)}\n\n` + finalDesc;
        } else {
          calcTotalAmt = expenseItems.reduce((acc, it) => {
            const lineBase = (Number(it.quantity) || 1) * (Number(it.price) || 0);
            const lineVat = currencyType === 'VND' 
              ? Math.round(lineBase * (Number(it.vat) || 0) / 100) 
              : (lineBase * (Number(it.vat) || 0) / 100);
            return acc + lineBase + lineVat;
          }, 0);
          calcVatAmt = expenseItems.reduce((acc, it) => {
            const lineBase = (Number(it.quantity) || 1) * (Number(it.price) || 0);
            return acc + (currencyType === 'VND' ? Math.round(lineBase * (Number(it.vat) || 0) / 100) : (lineBase * (Number(it.vat) || 0) / 100));
          }, 0);
          payloadItems = expenseItems;
        }

        if (editingItemId && (editingItemType === 'expense' || formType === 'expense')) {
          await api.put(`/expenses/${editingItemId}`, {
            title: getFullWorkflowTitle(),
            description: finalDesc,
            notes: finalDesc,
            category: isCommissionWf ? 'commission' : 'Khác',
            amount: calcTotalAmt,
            vat_amount: calcVatAmt,
            items: payloadItems,
            status: 'pending',
            approver_id: appVal1 || finalApproverId,
            approver_id_2: appVal2,
            approver_id_3: appVal3,
            related_user_ids: effectiveRelatedUserIds,
            currency: currencyType,
            image_url: attachments.length > 0 ? normalizeFileUrl(attachments[0].url) : null,
            bank_name: paymentBankName || null,
            bank_account_number: paymentBankAccount || null,
            bank_account_name: paymentAccountName || null,
            bank_branch: paymentBankBranch || null,
            vendor_name: paymentBeneficiaryName || null,
            due_date: paymentDueDate || null
          });
          createdRecordId = Number(editingItemId);
        } else {
          const cRes = await api.post('/expenses', {
            title: getFullWorkflowTitle(),
            description: finalDesc,
            notes: finalDesc,
            category: isCommissionWf ? 'commission' : 'Khác',
            amount: calcTotalAmt,
            vat_amount: calcVatAmt,
            items: payloadItems,
            status: 'pending',
            approver_id: appVal1 || finalApproverId,
            approver_id_2: appVal2,
            approver_id_3: appVal3,
            related_user_ids: effectiveRelatedUserIds,
            currency: currencyType,
            image_url: attachments.length > 0 ? normalizeFileUrl(attachments[0].url) : null,
            bank_name: paymentBankName || null,
            bank_account_number: paymentBankAccount || null,
            bank_account_name: paymentAccountName || null,
            bank_branch: paymentBankBranch || null,
            vendor_name: paymentBeneficiaryName || null,
            due_date: paymentDueDate || null
          });
          createdRecordId = Number(cRes?.data?.data?.id || cRes?.data?.id || 0) || null;
        }
      }
      if (createdRecordId && Array.isArray(createComments) && createComments.length > 0) {
        const syncCommentUrl =
          createdRecordEndpointType === 'leave' ? `/hrm/leaves/${createdRecordId}/comments`
          : createdRecordEndpointType === 'advance' ? `/hrm/advances/${createdRecordId}/comments`
          : createdRecordEndpointType === 'attendance_bulk' ? `/check-ins/bulk-requests/${createdRecordId}/comments`
          : `/expenses/${createdRecordId}/comments`;
        await Promise.allSettled(
          createComments.map(c =>
            api.post(syncCommentUrl, {
              body: c.text || '',
              attachments: Array.isArray(c.attachments) ? c.attachments : []
            })
          )
        );
      }
      toast.success(editingItemId ? t('Cập nhật đề xuất thành công!') : t('Gửi đề xuất thành công!'));
      if (currentDraftId) {
        handleDeleteDraft(currentDraftId, true);
        setCurrentDraftId(null);
      }
      setCreateComments([]);
      setNewCreateComment('');
      setCreateCommentAttachments([]);
      window.dispatchEvent(new CustomEvent('checkin-status-changed'));
      window.dispatchEvent(new CustomEvent('approval-updated'));
      window.dispatchEvent(new CustomEvent('refresh-approvals'));
      setShowCreateModal(false);
      setSelectedWorkflowDef(null);
      editingItemIdRef.current = null;
      setEditingItemId(null);
      setEditingItemType(null);
      setRelatedUserIds([]);
      setCustomApprover1(null);
      setCustomApprover2(null);
      setCustomApprover3(null);
      userPickedApprover1Ref.current = false;
      userPickedApprover2Ref.current = false;
      userPickedApprover3Ref.current = false;
      setPaymentEmployeeId('');
      setPaymentSupplierId('');
      setPaymentLecturerId('');
      setPaymentContactId('');
      setPaymentBeneficiaryName('');
      setPaymentBankName('');
      setPaymentBankAccount('');
      setPaymentAccountName('');
      setPaymentPhone('');
      setPaymentTaxCode('');
      setPaymentDestination('');
      setPaymentDetails('');
      setPaymentTarget('Nội bộ');
      setPaymentMethod('Chuyển khoản');
      setMeetingSelectedEntityId('');
      setMeetingClientName('');
      setMeetingLocation('');
      setMeetingDate(getTodayDateString());
      setMeetingClientCount('2');
      setMeetingInternalCount('2');
      setMeetingPurpose('Trao đổi hợp tác kinh doanh');
      setMeetingInternalAttendees([]);
      setAdvanceType('business_trip');
      setAdvanceSettlementDate('');
      setPaymentDueDate('');
      setExpenseCategory('general');
      setInvoiceType('vat_10');
      handleTabChange('my_requests');
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || t('Lỗi gửi đề xuất'));
    } finally {
      inFlightSubmitRef.current = false;
      setSubmitting(false);
    }
  };

  // Approval step visibility overrides (can be deleted/excluded by user)
  const [showStepManager, setShowStepManager] = useState(true);
  const [showStepAccountant, setShowStepAccountant] = useState(true);
  const [showStepDirector, setShowStepDirector] = useState(false);

  // Timeline custom approver overrides
  const [customApprover1, setCustomApprover1] = useState<any>(null);
  const [customApprover2, setCustomApprover2] = useState<any>(null);
  const [customApprover3, setCustomApprover3] = useState<any>(null);
  const userPickedApprover1Ref = useRef(false);
  const userPickedApprover2Ref = useRef(false);
  const userPickedApprover3Ref = useRef(false);
  const [activeSelectorStep, setActiveSelectorStep] = useState<string | null>(null);
  const [timelineSearchQuery, setTimelineSearchQuery] = useState('');

  useEffect(() => {
    if (!showCreateModal) {
      userPickedApprover1Ref.current = false;
      userPickedApprover2Ref.current = false;
      userPickedApprover3Ref.current = false;
    }
  }, [showCreateModal]);

  // Related persons (followers / watchers) states
  const [relatedUserIds, setRelatedUserIds] = useState<number[]>([]);
  const [showRelatedDropdown, setShowRelatedDropdown] = useState(false);
  const [relatedSearch, setRelatedSearch] = useState('');
  const relatedDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showRelatedDropdown && relatedDropdownRef.current && !relatedDropdownRef.current.contains(target)) {
        setShowRelatedDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showRelatedDropdown]);

  const getDefaultHrLeader = () => {
    if (!users || users.length === 0) return null;
    const dynamicHr = resolveHrRepresentativeUser(users, teams);
    if (dynamicHr) return dynamicHr;

    const hrRoleUser = users.find(u => String(u.role || '').toLowerCase() === 'hr');
    if (hrRoleUser) return hrRoleUser;

    // 2. User thuộc bộ phận Nhân sự có chức danh HR (loại trừ Ban Giám đốc 'director')
    const hrLeaderByTitle = users.find(u => {
      const jt = String(u.job_title || '').toLowerCase();
      const r = String(u.role || '').toLowerCase();
      if (r === 'director' || r === 'superadmin' || r === 'super_admin') return false;
      const isHrDept = jt.includes('nhân sự') || jt.includes('hr') || jt.includes('hcns');
      const isLead = jt.includes('trưởng') || jt.includes('lead') || jt.includes('manager') || jt.includes('quản lý') || r === 'manager';
      return isHrDept && isLead;
    });
    if (hrLeaderByTitle) return hrLeaderByTitle;

    // 3. Check HR team leader (chỉ lấy nếu leader không phải là Director kiêm nhiệm)
    const hrTeam = teams.find(t => {
      const name = String(t.name || '').toLowerCase();
      return name.includes('nhân sự') || name.includes('hr') || name.includes('hành chính nhân sự') || name.includes('hcns') || name.includes('human resources');
    });
    if (hrTeam && hrTeam.leader_id) {
      const leader = users.find(u => Number(u.id) === Number(hrTeam.leader_id) && String(u.role || '').toLowerCase() !== 'director');
      if (leader) return leader;
    }

    if (hrTeam) {
      const anyHrTeamMember = users.find(u => Number(u.team_id) === Number(hrTeam.id) && String(u.role || '').toLowerCase() !== 'director');
      if (anyHrTeamMember) return anyHrTeamMember;
    }

    return null;
  };

  const isExcludedSystemApprover = useCallback((u: any) => {
    const roleLower = String(u?.role || '').toLowerCase();
    if (['superadmin', 'super_admin'].includes(roleLower)) return true;
    if (u?.is_hidden_approver) return true;
    const excludedEmails = Array.isArray(config?.organization?.excluded_system_emails)
      ? config.organization.excluded_system_emails.map((e: string) => String(e).toLowerCase().trim())
      : [];
    const userEmail = String(u?.email || '').toLowerCase().trim();
    return Boolean(userEmail && excludedEmails.includes(userEmail));
  }, [config?.organization?.excluded_system_emails]);

  // Helper to find default manager / team leader / approver for proposer
  const getDefaultManagerApprover = (proposer?: any, workflowDef?: any) => {
    const p = proposer || proposerUser || user;
    if (!p || !users || users.length === 0) return null;

    // Filter out superadmin/excluded technical accounts from default business approvers
    const businessUsers = users.filter(u => !isExcludedSystemApprover(u));

    const currentUserId = p?.id || (user as any)?.id;
    const proposerInUsers = users.find(u => Number(u.id) === Number(currentUserId) || (p?.email && u.email === p.email) || (p?.username && u.username === p.username));

    // Ngoại lệ: Với quy trình chấm công (attendance_bulk) hoặc Quy trình hoa hồng (commission_payout):
    // Cho phép tự tạo và tự phê duyệt (Bước duyệt mặc định có thể là chính người tạo)
    const isAttendance = workflowDef?.id === 'attendance_bulk' || formType === 'attendance_bulk';
    const isCommissionWf = workflowDef?.id === 'commission_payout' || selectedWorkflowDef?.id === 'commission_payout';
    const isExpenseOrPayment = workflowDef?.id === 'expense_claim' || workflowDef?.id === 'payment' || formType === 'expense' || selectedWorkflowDef?.id === 'expense_claim' || selectedWorkflowDef?.id === 'payment';
    const isProposerManagerOrLeader = ['manager', 'director', 'admin', 'superadmin', 'super_admin', 'leader', 'truongphong', 'head_of_department', 'accountant', 'ketoan'].includes(String(p?.role || user?.role).toLowerCase()) || Boolean(p?.is_team_leader || (user as any)?.is_team_leader);
    if ((isAttendance && isProposerManagerOrLeader) || isCommissionWf || (isExpenseOrPayment && isProposerManagerOrLeader)) {
      return proposerInUsers || p;
    }

    // 0. Per-user explicit default_approver_id override (takes precedence over team/director fallback)
    const explicitDefaultApproverId = Number(proposerInUsers?.default_approver_id || p?.default_approver_id || 0);
    if (explicitDefaultApproverId > 0 && explicitDefaultApproverId !== Number(p.id)) {
      const explicitApprover = businessUsers.find(u => Number(u.id) === explicitDefaultApproverId);
      if (explicitApprover) return explicitApprover;
    }

    const teamId = p.team_id || proposerInUsers?.team_id || (user as any)?.team_id;
    const myTeam = teams.find(t => Number(t.id) === Number(teamId));

    // 1. First priority: Team Leader / Trưởng phòng of the proposer's team (cannot be proposer)
    if (myTeam && myTeam.leader_id && Number(myTeam.leader_id) !== Number(p.id)) {
      const leader = businessUsers.find(u => Number(u.id) === Number(myTeam.leader_id));
      if (leader) return leader;
    }

    // Also check if any user in the same team has manager / leader / truongphong role (and is not the proposer)
    if (teamId) {
      const teamLead = businessUsers.find(u => 
        Number(u.team_id) === Number(teamId) && 
        ['manager', 'truongphong', 'quanly', 'head_of_department', 'leader'].includes(String(u.role).toLowerCase()) && 
        Number(u.id) !== Number(p.id)
      );
      if (teamLead) return teamLead;
    }

    // 1b. Team's configured default_approver_id (if set and not proposer)
    if (myTeam && myTeam.default_approver_id && Number(myTeam.default_approver_id) !== Number(p.id)) {
      const teamDefaultApp = businessUsers.find(u => Number(u.id) === Number(myTeam.default_approver_id));
      if (teamDefaultApp) return teamDefaultApp;
    }

    // 2. Second priority (if no team leader or proposer is leader): Director
    const director = businessUsers.find(u => ['director'].includes(String(u.role).toLowerCase()) && Number(u.id) !== Number(p.id));
    if (director) return director;

    // Admin (excluding superadmin and excluding proposer)
    const admin = businessUsers.find(u => ['admin'].includes(String(u.role).toLowerCase()) && Number(u.id) !== Number(p.id));
    if (admin) return admin;

    // 3. Fallback: HR Leader
    const hrLead = getDefaultHrLeader();
    if (hrLead && Number(hrLead.id) !== Number(p.id)) return hrLead;

    // 4. Any manager in company
    const manager = businessUsers.find(u => ['manager', 'truongphong', 'quanly', 'head_of_department', 'leader'].includes(String(u.role).toLowerCase()) && Number(u.id) !== Number(p.id));
    if (manager) return manager;

    return businessUsers.find(u => Number(u.id) !== Number(p.id)) || null;
  };

  const defaultApp1 = useMemo(() => getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef), [teams, users, proposerUser, user, selectedWorkflowDef]);
  
  const defaultAccountant = useMemo(() => {
    const isHrWf = selectedWorkflowDef?.category === 'hr' || ['leave', 'late_early', 'remote_work'].includes(formType) || (formType === 'overtime' && otType === 'compensatory');
    if (isHrWf) {
      const hrLead = getDefaultHrLeader();
      if (hrLead && Number(hrLead.id) !== Number(defaultApp1?.id)) return hrLead;
    }
    const businessUsers = users.filter(u => !isExcludedSystemApprover(u));
    return businessUsers.find(u => ['accountant', 'ke_toan', 'ketoan'].includes(String(u.role).toLowerCase()))
      || businessUsers.find(u => String(u.job_title || '').toLowerCase().includes('kế toán'))
      || getDefaultHrLeader()
      || businessUsers[0]
      || null;
  }, [users, selectedWorkflowDef, formType, otType, defaultApp1, isExcludedSystemApprover]);

  const defaultDirector = useMemo(() => {
    const businessUsers = users.filter(u => !isExcludedSystemApprover(u));
    return businessUsers.find(u => ['director', 'ceo'].includes(String(u.role).toLowerCase()))
      || businessUsers.find(u => String(u.job_title || '').toLowerCase().includes('giám đốc'))
      || businessUsers.find(u => String(u.role).toLowerCase() === 'admin')
      || businessUsers[0]
      || null;
  }, [users, isExcludedSystemApprover]);

  const app1User = customApprover1 || defaultApp1;
  const accountantUser = customApprover2 || defaultAccountant;
  const directorUser = customApprover3 || defaultDirector;

  // List of active business users (excluding technical superadmin / hidden accounts) for approver select dropdowns
  const approverUserOptions = useMemo(() => {
    return users
      .filter(u => !isExcludedSystemApprover(u))
      .map(u => ({
        value: String(u.id),
        label: u.full_name || u.name,
        avatar: u.avatar || u.avatar_url,
        avatarBorder: '#f59e0b',
        searchKeywords: [u.email, u.job_title, u.department, u.role].filter(Boolean).join(' ')
      }));
  }, [users, isExcludedSystemApprover]);

  // Auto-fill manager approver whenever proposer, workflow or teams change (CHỈ ÁP DỤNG KHI TẠO MỚI)
  useEffect(() => {
    if (editingItemId || editingItemIdRef.current || currentDraftId || isHydratingEditOrDraftRef.current) return;
    if (userPickedApprover1Ref.current) return;
    if (users.length > 0) {
      const leader = getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef);
      if (leader) {
        setCustomApprover1(leader);
      }
    }
  }, [users, teams, proposerUser, selectedWorkflowDef, editingItemId, currentDraftId]);

  // Initialize proposer user as current logged in user (CHỈ ÁP DỤNG KHI TẠO MỚI)
  useEffect(() => {
    if (editingItemId || editingItemIdRef.current || currentDraftId || isHydratingEditOrDraftRef.current) return;
    if (user && users.length > 0) {
      const found = users.find(u => Number(u.id) === Number(user.id));
      if (found) {
        setProposerUser(found);
        if (found.role) setJobPosition(found.role);
      }
    }
  }, [user, users, editingItemId, currentDraftId]);

  // Set default steps whenever the form type changes
  useEffect(() => {
    if (editingItemId || editingItemIdRef.current || currentDraftId || isHydratingEditOrDraftRef.current) return;
    if (selectedWorkflowDef?.id === 'print_stamp_send') {
      setShowStepManager(false);
      setShowStepAccountant(false);
      setShowStepDirector(false);
      if (!userPickedApprover1Ref.current) setCustomApprover1(null);
      if (!userPickedApprover2Ref.current) setCustomApprover2(null);
      if (!userPickedApprover3Ref.current) setCustomApprover3(null);
    } else if (selectedWorkflowDef?.id === 'stationery') {
      setShowStepManager(true);
      setShowStepAccountant(false);
      setShowStepDirector(false);
      setStationeryItems([
        { id: Date.now(), name: '', quantity: 1, unit: 'Cái', notes: '' }
      ]);
      const hrLead = getDefaultHrLeader();
      if (hrLead && !userPickedApprover1Ref.current) setCustomApprover1(hrLead);
    } else if (formType === 'overtime') {
      // Đăng ký tăng ca: 2 cấp duyệt tuần tự
      // Cấp 1: Trưởng phòng / Quản lý trực tiếp
      // Cấp 2: Nếu lấy OT bù -> Nhân sự (Duy Phương / HR); Nếu lấy lương -> Kế toán / Giám đốc
      setShowStepManager(true);
      setShowStepAccountant(true);
      setShowStepDirector(false);
      const defaultApprover = getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef);
      if (defaultApprover && !userPickedApprover1Ref.current) setCustomApprover1(defaultApprover);
      if (!userPickedApprover2Ref.current) {
        if (otType === 'compensatory') {
          const hrLead = getDefaultHrLeader();
          if (hrLead) setCustomApprover2(hrLead);
        } else {
          if (defaultAccountant) setCustomApprover2(defaultAccountant);
        }
      }
    } else if (formType === 'recruitment' || selectedWorkflowDef?.id === 'recruitment') {
      // Đề xuất tuyển dụng: Cấp 1 (Trưởng bộ phận/Quản lý), Cấp 2 (Ban Giám đốc)
      setShowStepManager(true);
      setShowStepAccountant(false);
      setShowStepDirector(true);
      const defaultApprover = getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef);
      if (defaultApprover && !userPickedApprover1Ref.current) setCustomApprover1(defaultApprover);
      if (defaultDirector && !userPickedApprover3Ref.current) setCustomApprover3(defaultDirector);
      if (!userPickedApprover2Ref.current) setCustomApprover2(null);
    } else if (formType === 'leave' || formType === 'late_early' || formType === 'remote_work' || formType === 'attendance_bulk') {
      // Đề xuất nghỉ phép / đi muộn về sớm / WFH / giải trình chấm công: 1 cấp duyệt (Trưởng nhóm / Quản lý trực tiếp), HR Duy Phương tự động theo dõi bên dưới
      setShowStepManager(true);
      setShowStepAccountant(false);
      setShowStepDirector(false);
      const defaultApprover = getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef);
      if (defaultApprover && !userPickedApprover1Ref.current) setCustomApprover1(defaultApprover);
      if (!userPickedApprover2Ref.current) setCustomApprover2(null);
    } else if (formType === 'advance' || formType === 'general') {
      setShowStepManager(true);
      setShowStepAccountant(true);
      setShowStepDirector(false);
      const defaultApprover = getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef);
      if (defaultApprover && !userPickedApprover1Ref.current) setCustomApprover1(defaultApprover);
      if (defaultAccountant && !userPickedApprover2Ref.current) setCustomApprover2(defaultAccountant);
    } else {
      // expense
      setShowStepManager(true);
      setShowStepAccountant(true);
      const totalAmt = selectedWorkflowDef?.id === 'commission_payout'
        ? commissionItems.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
        : expenseItems.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.price) || 0) * (1 + (Number(it.vat) || 0) / 100), 0);
      setShowStepDirector(toVndAmount(totalAmt, currencyType) >= threeLevelThresholdVnd);
      const defaultApprover = getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef);
      if (defaultApprover && !userPickedApprover1Ref.current) setCustomApprover1(defaultApprover);
      if (defaultAccountant && !userPickedApprover2Ref.current) setCustomApprover2(defaultAccountant);
      if (defaultDirector && !userPickedApprover3Ref.current) setCustomApprover3(defaultDirector);
    }
  }, [formType, selectedWorkflowDef, users, teams, editingItemId, currentDraftId, currencyType, toVndAmount, threeLevelThresholdVnd]);

  // Dynamic VND-converted threshold rule across all monetary workflows (from finance.approval_policy & finance.currency_and_fx_rates)
  const currentExpenseTotal = useMemo(() => {
    if (selectedWorkflowDef?.id === 'commission_payout') {
      return commissionItems.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    }
    if (selectedWorkflowDef?.id === 'stationery' || selectedWorkflowDef?.id === 'purchase_request' || selectedWorkflowDef?.id === 'it_request' || formType === 'general') {
      return stationeryItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.price) || 0)) * (1 + (Number(it.vat !== undefined ? it.vat : vatPolicy?.quote_default_vat ?? 10) / 100)), 0);
    }
    if (formType === 'advance') {
      return parseMoneyVn(paymentDetails, currencyType);
    }
    return expenseItems.reduce((acc, it) => acc + (Number(it.quantity) || 0) * (Number(it.price) || 0) * (1 + (Number(it.vat) || 0) / 100), 0);
  }, [expenseItems, commissionItems, stationeryItems, paymentDetails, selectedWorkflowDef?.id, formType, currencyType, vatPolicy?.quote_default_vat]);

  useEffect(() => {
    if (editingItemId || editingItemIdRef.current || currentDraftId || isHydratingEditOrDraftRef.current) return;
    if (selectedWorkflowDef?.id === 'print_stamp_send' || formType === 'recruitment' || selectedWorkflowDef?.id === 'recruitment') return;
    if (formType === 'expense' || formType === 'general' || formType === 'advance') {
      if (toVndAmount(currentExpenseTotal, currencyType) >= threeLevelThresholdVnd) {
        setShowStepDirector(true);
        setShowStepAccountant(true);
        if (!customApprover2 && defaultAccountant) {
          setCustomApprover2(defaultAccountant);
        }
        if (!customApprover3 && defaultDirector) {
          setCustomApprover3(defaultDirector);
        }
      } else {
        setShowStepDirector(false);
        if (selectedWorkflowDef?.id === 'stationery' && currentExpenseTotal === 0) {
          setShowStepAccountant(false);
        } else if (currentExpenseTotal > 0) {
          setShowStepAccountant(true);
          if (!customApprover2 && defaultAccountant) {
            setCustomApprover2(defaultAccountant);
          }
        }
      }
    }
  }, [currentExpenseTotal, formType, selectedWorkflowDef, defaultDirector, defaultAccountant, editingItemId, currentDraftId, currencyType, toVndAmount, threeLevelThresholdVnd]);

  // Tự động điều chỉnh Người duyệt Cấp 2 khi người dùng chuyển đổi loại OT (Lấy bù -> Nhân sự, Lấy lương -> Kế toán)
  useEffect(() => {
    if (editingItemId || editingItemIdRef.current || currentDraftId || isHydratingEditOrDraftRef.current) return;
    if (formType === 'overtime') {
      if (otType === 'compensatory') {
        const hrLead = getDefaultHrLeader();
        if (hrLead) setCustomApprover2(hrLead);
      } else {
        if (defaultAccountant) setCustomApprover2(defaultAccountant);
      }
    }
  }, [otType, formType, users, editingItemId, currentDraftId]);

  // Chỉ tự động fill mặc định Người theo dõi (HR) 1 lần khi mở/chuyển loại quy trình. Sau đó người dùng chọn/xóa như thế nào thì giữ nguyên 100%, không push thêm.
  useEffect(() => {
    if (editingItemId || editingItemIdRef.current || currentDraftId || isHydratingEditOrDraftRef.current) return;
    if (!showCreateModal) return;
    const isHrWf = selectedWorkflowDef?.category === 'hr' || ['leave', 'late_early', 'overtime', 'remote_work', 'attendance_bulk', 'recruitment'].includes(formType);
    const isProposerManagerOrLeader = ['manager', 'director', 'admin', 'superadmin', 'super_admin', 'leader', 'truongphong', 'head_of_department'].includes(String(proposerUser?.role || user?.role).toLowerCase()) || Boolean(proposerUser?.is_team_leader || (user as any)?.is_team_leader);

    if (isHrWf && users.length > 0 && !(formType === 'attendance_bulk' && isProposerManagerOrLeader)) {
      const hrLeader = getDefaultHrLeader();
      const defaultApprover = getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef);
      if (hrLeader && (!defaultApprover || Number(defaultApprover.id) !== Number(hrLeader.id))) {
        setRelatedUserIds([Number(hrLeader.id)]);
      } else {
        setRelatedUserIds([]);
      }
    } else {
      setRelatedUserIds([]);
    }
  }, [showCreateModal, formType, selectedWorkflowDef?.id, editingItemId, currentDraftId]);

  // --- DRAFT & EXIT CONFIRMATION HELPERS ---
  const getFormSnapshot = () => {
    return JSON.stringify({
      workflowDefId: selectedWorkflowDef?.id || '',
      formType: formType || 'expense',
      expenseTitle: expenseTitle || '',
      workflowTitleSuffix: workflowTitleSuffix || '',
      expenseItems: (expenseItems || []).map(it => ({
        content: it.content || it.name || '',
        quantity: Number(it.quantity) || 0,
        price: Number(it.price) || 0,
        vat: Number(it.vat) || 0,
        note: it.note || ''
      })),
      stationeryItems: (stationeryItems || []).map(it => ({
        name: it.name || '',
        quantity: Number(it.quantity) || 0,
        unit: it.unit || '',
        notes: it.notes || ''
      })),
      commissionItems: (commissionItems || []).map(it => ({ ...it })),
      attachmentsCount: (attachments || []).length,
      attachmentsUrls: (attachments || []).map(a => a.url || a.name),
      relatedUserIds: [...(relatedUserIds || [])].sort(),
      jobPosition: jobPosition || '',
      departmentName: departmentName || '',
      paymentTarget: paymentTarget || '',
      paymentMethod: paymentMethod || '',
      paymentEmployeeId: paymentEmployeeId || '',
      paymentSupplierId: paymentSupplierId || '',
      paymentLecturerId: paymentLecturerId || '',
      paymentContactId: paymentContactId || '',
      paymentBeneficiaryName: paymentBeneficiaryName || '',
      paymentBankName: paymentBankName || '',
      paymentBankAccount: paymentBankAccount || '',
      paymentAccountName: paymentAccountName || '',
      paymentBankBranch: paymentBankBranch || '',
      paymentPhone: paymentPhone || '',
      paymentTaxCode: paymentTaxCode || '',
      paymentDestination: paymentDestination || '',
      paymentWalletType: paymentWalletType || '',
      paymentWalletPhone: paymentWalletPhone || '',
      paymentCorporateCard: paymentCorporateCard || '',
      paymentDetails: paymentDetails || '',
      currencyType: currencyType || 'VND',
      leaveType: leaveType || '',
      leaveReason: leaveReason || '',
      leaveFrom: leaveFrom || '',
      leaveTo: leaveTo || '',
      leaveSession: leaveSession || '',
      intermittentDates: intermittentDates || [],
      lateEarlyType: lateEarlyType || '',
      lateEarlyMinutes: lateEarlyMinutes || 0,
      otType: otType || '',
      otRate: otRate || 1.5,
      wfhSalaryRate: wfhSalaryRate ?? 50,
      otDate: otDate || '',
      otStart: otStart || '',
      otEnd: otEnd || '',
      isRecurring: isRecurring || false,
      meetingClientName: meetingClientName || '',
      meetingPurpose: meetingPurpose || '',
      pssRecipientName: pssRecipientName || '',
      pssRecipientAddress: pssRecipientAddress || '',
      pssRecipientPhone: pssRecipientPhone || '',
      advanceType: advanceType || '',
      advanceSettlementDate: advanceSettlementDate || '',
      paymentDueDate: paymentDueDate || '',
      expenseCategory: expenseCategory || '',
      invoiceType: invoiceType || '',
      customApprover1Id: customApprover1?.id || defaultApp1?.id || null,
      customApprover2Id: customApprover2?.id || defaultAccountant?.id || null,
      customApprover3Id: customApprover3?.id || defaultDirector?.id || null,
      recruitmentJobTitle: recruitmentJobTitle || '',
      recruitmentHeadcount: recruitmentHeadcount || 1,
      recruitmentDepartment: recruitmentDepartment || '',
      recruitmentJobType: recruitmentJobType || 'full_time',
      recruitmentReason: recruitmentReason || 'expansion',
      recruitmentReplacementWho: recruitmentReplacementWho || '',
      recruitmentSalaryMin: recruitmentSalaryMin || '',
      recruitmentSalaryMax: recruitmentSalaryMax || '',
      recruitmentSalaryNegotiable: recruitmentSalaryNegotiable || false,
      recruitmentExpectedDate: recruitmentExpectedDate || '',
      recruitmentRequirements: recruitmentRequirements || '',
      recruitmentDescription: recruitmentDescription || '',
      showStepManager,
      showStepAccountant,
      showStepDirector,
    });
  };

  // Track baseline snapshot when editing an existing item so closing without edits doesn't warn
  useEffect(() => {
    if (showCreateModal && editingItemId) {
      const timer = setTimeout(() => {
        lastSavedSnapshotRef.current = getFormSnapshot();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [showCreateModal, editingItemId]);

  const isFormDirty = () => {
    if (!selectedWorkflowDef) return false;

    // In edit mode for an existing approval item:
    if (editingItemId !== null) {
      if (lastSavedSnapshotRef.current !== null) {
        return getFormSnapshot() !== lastSavedSnapshotRef.current;
      }
      // If baseline snapshot has not been captured yet, no user edits occurred
      return false;
    }

    // If draft was saved or loaded in this session, compare with saved snapshot
    if (lastSavedSnapshotRef.current !== null) {
      return getFormSnapshot() !== lastSavedSnapshotRef.current;
    }

    // Otherwise, check if user entered any meaningful data
    if (workflowTitleSuffix && workflowTitleSuffix.trim() !== '') return true;
    if (expenseTitle && expenseTitle.trim() !== '' && expenseTitle.trim() !== selectedWorkflowDef?.name) return true;
    if (leaveReason && leaveReason.trim() !== '') return true;
    if (paymentDetails && paymentDetails.trim() !== '') return true;
    if (paymentBeneficiaryName && paymentBeneficiaryName.trim() !== '') return true;
    if (paymentBankAccount && paymentBankAccount.trim() !== '') return true;
    if (paymentAccountName && paymentAccountName.trim() !== '') return true;
    if (paymentDestination && paymentDestination.trim() !== '') return true;
    if (meetingClientName && meetingClientName.trim() !== '') return true;
    if (pssRecipientName && pssRecipientName.trim() !== '') return true;
    if (pssRecipientAddress && pssRecipientAddress.trim() !== '') return true;
    if (pssRecipientPhone && pssRecipientPhone.trim() !== '') return true;
    if (attachments && attachments.length > 0) return true;
    if (stationeryItems && stationeryItems.some(i => (i.name && i.name.trim() !== '') || (i.price && Number(i.price) > 0))) return true;
    if (expenseItems && expenseItems.some(i => (i.content && i.content.trim() !== '') || (i.name && i.name.trim() !== '') || (i.price && Number(i.price) > 0))) return true;
    if (recruitmentJobTitle && recruitmentJobTitle.trim() !== '') return true;
    if (recruitmentRequirements && recruitmentRequirements.trim() !== '') return true;
    if (recruitmentDescription && recruitmentDescription.trim() !== '') return true;
    if (relatedUserIds && relatedUserIds.length > 0) return true;
    return false;
  };

  const handleSaveCurrentDraft = (andExit = false) => {
    if (!selectedWorkflowDef) return;
    const draftId = currentDraftId || `draft_${Date.now()}`;
    
    let calcAmount = 0;
    if (selectedWorkflowDef.id === 'commission_payout' && commissionItems && commissionItems.length > 0) {
      calcAmount = commissionItems.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
    } else if (formType === 'general' || formType === 'expense') {
      if (stationeryItems && stationeryItems.length > 0) {
        calcAmount = stationeryItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.price) || 0)) * (1 + (Number(it.vat !== undefined ? it.vat : vatPolicy?.quote_default_vat ?? 10) / 100)), 0);
      }
      if (calcAmount === 0 && expenseItems && expenseItems.length > 0) {
        calcAmount = expenseItems.reduce((acc, it) => acc + (it.quantity * it.price) * (1 + it.vat / 100), 0);
      }
    } else if (formType === 'advance') {
      calcAmount = parseMoneyVn(paymentDetails, currencyType);
    }

    const fullDraftTitle = getFullWorkflowTitle();
    const resolvedApp1 = customApprover1 || defaultApp1;
    const resolvedApp2 = customApprover2 || defaultAccountant;
    const resolvedApp3 = customApprover3 || defaultDirector;

    const newDraft: ApprovalDraft = {
      id: draftId,
      userId: user?.id || 0,
      workflowDefId: selectedWorkflowDef.id,
      workflowDefName: selectedWorkflowDef.name,
      formType,
      title: fullDraftTitle,
      amount: calcAmount,
      currency: currencyType || 'VND',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      formData: {
        selectedWorkflowDef: {
          id: selectedWorkflowDef.id,
          name: selectedWorkflowDef.name,
          description: selectedWorkflowDef.description,
          category: selectedWorkflowDef.category,
          bg: selectedWorkflowDef.bg,
          color: selectedWorkflowDef.color
        },
        expenseTitle: fullDraftTitle,
        workflowTitleSuffix,
        expenseItems,
        stationeryItems,
        commissionItems,
        attachments,
        relatedUserIds,
        jobPosition,
        departmentName,
        paymentTarget,
        paymentMethod,
        paymentEmployeeId,
        paymentSupplierId,
        paymentLecturerId,
        paymentContactId,
        paymentGovAgencyType,
        paymentGovDecisionNumber,
        paymentBeneficiaryName,
        paymentBankName,
        paymentBankAccount,
        paymentAccountName,
        paymentBankBranch,
        paymentPhone,
        paymentTaxCode,
        paymentDestination,
        paymentWalletType,
        paymentWalletPhone,
        paymentCorporateCard,
        recruitmentJobTitle,
        recruitmentHeadcount,
        recruitmentDepartment,
        recruitmentJobType,
        recruitmentReason,
        recruitmentReplacementWho,
        recruitmentSalaryMin,
        recruitmentSalaryMax,
        recruitmentSalaryNegotiable,
        recruitmentExpectedDate,
        recruitmentRequirements,
        recruitmentDescription,
        paymentDetails,
        currencyType,
        formType,
        leaveType,
        leaveReason,
        leaveFrom,
        leaveTo,
        leaveSession,
        intermittentDates,
        lateEarlyType,
        lateEarlyMinutes,
        otType,
        otRate,
        wfhSalaryRate,
        otDate,
        otStart,
        otEnd,
        bulkMonth,
        suggestedDays,
        isPhasedPayment,
        installments,
        isRecurring,
        recurringFrequency,
        recurringStartDate,
        recurringEndDate,
        recurringPayDay,
        recurringUnlimited,
        recurringContractNumber,
        meetingTargetType,
        meetingSelectedEntityId,
        meetingClientName,
        meetingContactPerson,
        meetingContactPhone,
        meetingLocation,
        meetingDate,
        meetingTime,
        meetingClientCount,
        meetingInternalCount,
        meetingPurpose,
        meetingInternalAttendees,
        meetingReimbursementMethod,
        meetingInvoiceType,
        pssReqEmployeeId,
        pssReqDate,
        pssExecutorId,
        pssSendMethod,
        pssSendTimeFrame,
        pssRecipientName,
        pssRecipientAddress,
        pssRecipientPhone,
        pssRequiredSendDate,
        advanceType,
        advanceSettlementDate,
        paymentDueDate,
        expenseCategory,
        invoiceType,
        customApprover1: resolvedApp1,
        customApprover2: resolvedApp2,
        customApprover3: resolvedApp3,
        showStepManager,
        showStepAccountant,
        showStepDirector,
        editingItemId,
        editingItemType
      }
    };

    const updatedDrafts = [newDraft, ...draftsList.filter(d => d.id !== draftId)];
    setDraftsList(updatedDrafts);
    persistApprovalDrafts(updatedDrafts, user?.id, tenantId);
    setCurrentDraftId(draftId);
    lastSavedSnapshotRef.current = getFormSnapshot();
    toast.success(t('Đã lưu bản nháp thành công!'));

    if (andExit) {
      setShowExitConfirmModal(false);
      lastSavedSnapshotRef.current = null;
      if (exitTargetAction === 'back') {
        setSelectedWorkflowDef(null);
        setCurrentDraftId(null);
      } else {
        setShowCreateModal(false);
        setSelectedWorkflowDef(null);
        editingItemIdRef.current = null;
        setEditingItemId(null);
        setEditingItemType(null);
        setCurrentDraftId(null);
      }
      setExitTargetAction(null);
    }
  };

  const handleDiscardExit = () => {
    setShowExitConfirmModal(false);
    lastSavedSnapshotRef.current = null;
    if (exitTargetAction === 'back') {
      setSelectedWorkflowDef(null);
      setCurrentDraftId(null);
      editingItemIdRef.current = null;
      setEditingItemId(null);
      setEditingItemType(null);
    } else {
      setShowCreateModal(false);
      setSelectedWorkflowDef(null);
      editingItemIdRef.current = null;
      setEditingItemId(null);
      setEditingItemType(null);
      setCurrentDraftId(null);
    }
    setExitTargetAction(null);
  };

  const handleRequestExit = (target: 'back' | 'close') => {
    if (isFormDirty()) {
      setExitTargetAction(target);
      setShowExitConfirmModal(true);
    } else {
      lastSavedSnapshotRef.current = null;
      if (target === 'back') {
        setSelectedWorkflowDef(null);
        setCurrentDraftId(null);
        editingItemIdRef.current = null;
        setEditingItemId(null);
        setEditingItemType(null);
      } else {
        setShowCreateModal(false);
        setSelectedWorkflowDef(null);
        editingItemIdRef.current = null;
        setEditingItemId(null);
        setEditingItemType(null);
        setCurrentDraftId(null);
      }
    }
  };

  const handleRequestExitRef = useRef(handleRequestExit);
  handleRequestExitRef.current = handleRequestExit;

  useEffect(() => {
    if (!showCreateModal) return;
    return pushOverlay('approval-create-drawer', () => {
      handleRequestExitRef.current('close');
    }, uiMotion?.z_drawer || 2147483625);
  }, [showCreateModal, uiMotion?.z_drawer]);

  const handleResumeDraft = (draft: ApprovalDraft) => {
    const fd = draft.formData;
    if (!fd) return;
    isHydratingEditOrDraftRef.current = true;
    setCurrentDraftId(draft.id);
    const wfId = draft.workflowDefId || fd.selectedWorkflowDef?.id;
    const baseDef = workflowList.find(w => w.id === wfId) || workflowList[0];
    const curDef = {
      ...baseDef,
      ...(fd.selectedWorkflowDef || {}),
      icon: baseDef.icon,
      bg: baseDef.bg,
      color: baseDef.color
    };
    setSelectedWorkflowDef(curDef);
    if (fd.workflowTitleSuffix !== undefined) {
      setWorkflowTitleSuffix(fd.workflowTitleSuffix);
      setExpenseTitle(getFullWorkflowTitle(curDef, fd.workflowTitleSuffix));
    } else if (fd.expenseTitle) {
      const s = extractTitleSuffix(fd.expenseTitle, curDef?.name);
      setWorkflowTitleSuffix(s);
      setExpenseTitle(fd.expenseTitle);
    } else {
      setWorkflowTitleSuffix('');
      setExpenseTitle(curDef.name);
    }
    if (fd.expenseItems) setExpenseItems(fd.expenseItems);
    if (fd.stationeryItems) setStationeryItems(fd.stationeryItems);
    if (fd.attachments) setAttachments(fd.attachments);
    if (fd.relatedUserIds) setRelatedUserIds(fd.relatedUserIds);
    if (fd.jobPosition) setJobPosition(fd.jobPosition);
    if (fd.departmentName) setDepartmentName(fd.departmentName);
    if (fd.paymentTarget) setPaymentTarget(fd.paymentTarget);
    if (fd.paymentMethod) setPaymentMethod(fd.paymentMethod);
    if (fd.paymentEmployeeId) setPaymentEmployeeId(fd.paymentEmployeeId);
    if (fd.paymentSupplierId) setPaymentSupplierId(fd.paymentSupplierId);
    if (fd.paymentLecturerId) setPaymentLecturerId(fd.paymentLecturerId);
    if (fd.paymentContactId) setPaymentContactId(fd.paymentContactId);
    if (fd.paymentGovAgencyType) setPaymentGovAgencyType(fd.paymentGovAgencyType);
    if (fd.paymentGovDecisionNumber !== undefined) setPaymentGovDecisionNumber(fd.paymentGovDecisionNumber);
    if (fd.paymentBeneficiaryName) setPaymentBeneficiaryName(fd.paymentBeneficiaryName);
    if (fd.paymentBankName) setPaymentBankName(fd.paymentBankName);
    if (fd.paymentBankAccount) setPaymentBankAccount(fd.paymentBankAccount);
    if (fd.paymentAccountName) setPaymentAccountName(fd.paymentAccountName);
    if (fd.paymentBankBranch) setPaymentBankBranch(fd.paymentBankBranch);
    if (fd.paymentPhone) setPaymentPhone(fd.paymentPhone);
    if (fd.paymentTaxCode) setPaymentTaxCode(fd.paymentTaxCode);
    if (fd.paymentDestination) setPaymentDestination(fd.paymentDestination);
    if (fd.paymentWalletType) setPaymentWalletType(fd.paymentWalletType);
    if (fd.paymentWalletPhone) setPaymentWalletPhone(fd.paymentWalletPhone);
    if (fd.paymentCorporateCard) setPaymentCorporateCard(fd.paymentCorporateCard);
    if (fd.paymentDetails) setPaymentDetails(fd.paymentDetails);
    if (fd.currencyType) setCurrencyType(fd.currencyType);
    if (fd.formType) setFormType(fd.formType);
    if (fd.leaveType) setLeaveType(fd.leaveType);
    if (fd.leaveReason) setLeaveReason(fd.leaveReason);
    if (fd.leaveFrom) setLeaveFrom(fd.leaveFrom);
    if (fd.leaveTo) setLeaveTo(fd.leaveTo);
    if (fd.leaveSession) setLeaveSession(fd.leaveSession);
    if (fd.intermittentDates) setIntermittentDates(fd.intermittentDates);
    if (fd.lateEarlyType) setLateEarlyType(fd.lateEarlyType);
    if (fd.lateEarlyMinutes) setLateEarlyMinutes(fd.lateEarlyMinutes);
    if (fd.otType) setOtType(fd.otType);
    if (fd.otRate) setOtRate(fd.otRate);
    if (fd.wfhSalaryRate !== undefined) setWfhSalaryRate(Number(fd.wfhSalaryRate));
    if (fd.otDate) setOtDate(fd.otDate);
    if (fd.otStart) setOtStart(fd.otStart);
    if (fd.otEnd) setOtEnd(fd.otEnd);
    if (fd.bulkMonth) setBulkMonth(fd.bulkMonth);
    if (Array.isArray(fd.suggestedDays)) setSuggestedDays(fd.suggestedDays);
    if (fd.isPhasedPayment !== undefined) setIsPhasedPayment(fd.isPhasedPayment);
    if (Array.isArray(fd.installments)) setInstallments(fd.installments);
    if (fd.isRecurring !== undefined) setIsRecurring(fd.isRecurring);
    if (fd.recurringFrequency) setRecurringFrequency(fd.recurringFrequency);
    if (fd.recurringStartDate) setRecurringStartDate(fd.recurringStartDate);
    if (fd.recurringEndDate) setRecurringEndDate(fd.recurringEndDate);
    if (fd.recurringPayDay) setRecurringPayDay(fd.recurringPayDay);
    if (fd.recurringUnlimited !== undefined) setRecurringUnlimited(fd.recurringUnlimited);
    if (fd.recurringContractNumber !== undefined) setRecurringContractNumber(fd.recurringContractNumber);
    if (fd.meetingTargetType) setMeetingTargetType(fd.meetingTargetType);
    if (fd.meetingSelectedEntityId) setMeetingSelectedEntityId(fd.meetingSelectedEntityId);
    if (fd.meetingClientName) setMeetingClientName(fd.meetingClientName);
    if (fd.meetingContactPerson) setMeetingContactPerson(fd.meetingContactPerson);
    if (fd.meetingContactPhone) setMeetingContactPhone(fd.meetingContactPhone);
    if (fd.meetingLocation) setMeetingLocation(fd.meetingLocation);
    if (fd.meetingDate) setMeetingDate(fd.meetingDate);
    if (fd.meetingTime) setMeetingTime(fd.meetingTime);
    if (fd.meetingClientCount) setMeetingClientCount(fd.meetingClientCount);
    if (fd.meetingInternalCount) setMeetingInternalCount(fd.meetingInternalCount);
    if (fd.meetingPurpose) setMeetingPurpose(fd.meetingPurpose);
    if (fd.meetingInternalAttendees) setMeetingInternalAttendees(fd.meetingInternalAttendees);
    if (fd.meetingReimbursementMethod) setMeetingReimbursementMethod(fd.meetingReimbursementMethod);
    if (fd.meetingInvoiceType) setMeetingInvoiceType(fd.meetingInvoiceType);
    if (fd.pssReqEmployeeId) setPssReqEmployeeId(fd.pssReqEmployeeId);
    if (fd.pssReqDate) setPssReqDate(fd.pssReqDate);
    if (fd.pssExecutorId) setPssExecutorId(fd.pssExecutorId);
    if (fd.pssSendMethod) setPssSendMethod(fd.pssSendMethod);
    if (fd.pssSendTimeFrame) setPssSendTimeFrame(fd.pssSendTimeFrame);
    if (fd.pssRecipientName) setPssRecipientName(fd.pssRecipientName);
    if (fd.pssRecipientAddress) setPssRecipientAddress(fd.pssRecipientAddress);
    if (fd.pssRecipientPhone) setPssRecipientPhone(fd.pssRecipientPhone);
    if (fd.pssRequiredSendDate) setPssRequiredSendDate(fd.pssRequiredSendDate);
    if (fd.advanceType) setAdvanceType(fd.advanceType);
    if (fd.advanceSettlementDate) setAdvanceSettlementDate(fd.advanceSettlementDate);
    if (fd.paymentDueDate) setPaymentDueDate(fd.paymentDueDate);
    if (fd.expenseCategory) setExpenseCategory(fd.expenseCategory);
    if (fd.invoiceType) setInvoiceType(fd.invoiceType);
    if (fd.recruitmentJobTitle !== undefined) setRecruitmentJobTitle(fd.recruitmentJobTitle);
    if (fd.recruitmentHeadcount !== undefined) setRecruitmentHeadcount(fd.recruitmentHeadcount);
    if (fd.recruitmentDepartment !== undefined) setRecruitmentDepartment(fd.recruitmentDepartment);
    if (fd.recruitmentJobType !== undefined) setRecruitmentJobType(fd.recruitmentJobType);
    if (fd.recruitmentReason !== undefined) setRecruitmentReason(fd.recruitmentReason);
    if (fd.recruitmentReplacementWho !== undefined) setRecruitmentReplacementWho(fd.recruitmentReplacementWho);
    if (fd.recruitmentSalaryMin !== undefined) setRecruitmentSalaryMin(fd.recruitmentSalaryMin);
    if (fd.recruitmentSalaryMax !== undefined) setRecruitmentSalaryMax(fd.recruitmentSalaryMax);
    if (fd.recruitmentSalaryNegotiable !== undefined) setRecruitmentSalaryNegotiable(fd.recruitmentSalaryNegotiable);
    if (fd.recruitmentExpectedDate !== undefined) setRecruitmentExpectedDate(fd.recruitmentExpectedDate);
    if (fd.recruitmentRequirements !== undefined) setRecruitmentRequirements(fd.recruitmentRequirements);
    if (fd.recruitmentDescription !== undefined) setRecruitmentDescription(fd.recruitmentDescription);
    if (fd.customApprover1) {
      userPickedApprover1Ref.current = true;
      setCustomApprover1(fd.customApprover1);
    }
    if (fd.customApprover2) {
      userPickedApprover2Ref.current = true;
      setCustomApprover2(fd.customApprover2);
    }
    if (fd.customApprover3) {
      userPickedApprover3Ref.current = true;
      setCustomApprover3(fd.customApprover3);
    }
    if (fd.showStepManager !== undefined) setShowStepManager(fd.showStepManager);
    if (fd.showStepAccountant !== undefined) setShowStepAccountant(fd.showStepAccountant);
    if (fd.showStepDirector !== undefined) setShowStepDirector(fd.showStepDirector);
    if (fd.editingItemId !== undefined) setEditingItemId(fd.editingItemId);
    if (fd.editingItemType !== undefined) setEditingItemType(fd.editingItemType);
    if (Array.isArray(fd.commissionItems) && fd.commissionItems.length > 0) {
      setCommissionItems(fd.commissionItems);
    }

    // Record snapshot of loaded draft so closing immediately without edits will not prompt
    lastSavedSnapshotRef.current = JSON.stringify({
      workflowDefId: curDef?.id || '',
      formType: fd.formType || 'expense',
      expenseTitle: fd.expenseTitle || curDef?.name || '',
      workflowTitleSuffix: fd.workflowTitleSuffix !== undefined ? fd.workflowTitleSuffix : (fd.expenseTitle ? extractTitleSuffix(fd.expenseTitle, curDef?.name) : ''),
      expenseItems: (fd.expenseItems || []).map((it: any) => ({
        name: it.name || '',
        quantity: Number(it.quantity) || 0,
        price: Number(it.price) || 0,
        vat: Number(it.vat) || 0,
        note: it.note || ''
      })),
      stationeryItems: (fd.stationeryItems || []).map((it: any) => ({
        name: it.name || '',
        quantity: Number(it.quantity) || 0,
        unit: it.unit || '',
        notes: it.notes || ''
      })),
      commissionItems: (fd.commissionItems || []).map((it: any) => ({ ...it })),
      attachmentsCount: (fd.attachments || []).length,
      attachmentsUrls: (fd.attachments || []).map((a: any) => a.url || a.name),
      relatedUserIds: [...(fd.relatedUserIds || [])].sort(),
      jobPosition: fd.jobPosition || '',
      departmentName: fd.departmentName || '',
      paymentTarget: fd.paymentTarget || '',
      paymentMethod: fd.paymentMethod || '',
      paymentEmployeeId: fd.paymentEmployeeId || '',
      paymentSupplierId: fd.paymentSupplierId || '',
      paymentLecturerId: fd.paymentLecturerId || '',
      paymentContactId: fd.paymentContactId || '',
      paymentBeneficiaryName: fd.paymentBeneficiaryName || '',
      paymentBankName: fd.paymentBankName || '',
      paymentBankAccount: fd.paymentBankAccount || '',
      paymentAccountName: fd.paymentAccountName || '',
      paymentBankBranch: fd.paymentBankBranch || '',
      paymentPhone: fd.paymentPhone || '',
      paymentTaxCode: fd.paymentTaxCode || '',
      paymentDestination: fd.paymentDestination || '',
      paymentWalletType: fd.paymentWalletType || '',
      paymentWalletPhone: fd.paymentWalletPhone || '',
      paymentCorporateCard: fd.paymentCorporateCard || '',
      paymentDetails: fd.paymentDetails || '',
      currencyType: fd.currencyType || 'VND',
      leaveType: fd.leaveType || '',
      leaveReason: fd.leaveReason || '',
      leaveFrom: fd.leaveFrom || leaveFrom || '',
      leaveTo: fd.leaveTo || leaveTo || '',
      leaveSession: fd.leaveSession || leaveSession || '',
      intermittentDates: fd.intermittentDates || intermittentDates || [],
      lateEarlyType: fd.lateEarlyType || lateEarlyType || '',
      lateEarlyMinutes: fd.lateEarlyMinutes || lateEarlyMinutes || 0,
      otType: fd.otType || otType || '',
      otRate: fd.otRate || otRate || 1.5,
      wfhSalaryRate: fd.wfhSalaryRate ?? wfhSalaryRate ?? 50,
      otDate: fd.otDate || otDate || '',
      otStart: fd.otStart || otStart || '',
      otEnd: fd.otEnd || otEnd || '',
      isRecurring: fd.isRecurring ?? isRecurring ?? false,
      meetingClientName: fd.meetingClientName || meetingClientName || '',
      meetingPurpose: fd.meetingPurpose || meetingPurpose || '',
      pssRecipientName: fd.pssRecipientName || pssRecipientName || '',
      pssRecipientAddress: fd.pssRecipientAddress || pssRecipientAddress || '',
      pssRecipientPhone: fd.pssRecipientPhone || pssRecipientPhone || '',
      advanceType: fd.advanceType || advanceType || '',
      advanceSettlementDate: fd.advanceSettlementDate || advanceSettlementDate || '',
      paymentDueDate: fd.paymentDueDate || paymentDueDate || '',
      expenseCategory: fd.expenseCategory || expenseCategory || '',
      invoiceType: fd.invoiceType || invoiceType || '',
      customApprover1Id: fd.customApprover1?.id || defaultApp1?.id || null,
      customApprover2Id: fd.customApprover2?.id || defaultAccountant?.id || null,
      customApprover3Id: fd.customApprover3?.id || defaultDirector?.id || null,
      recruitmentJobTitle: fd.recruitmentJobTitle || '',
      recruitmentHeadcount: fd.recruitmentHeadcount || 1,
      recruitmentDepartment: fd.recruitmentDepartment || '',
      recruitmentJobType: fd.recruitmentJobType || 'full_time',
      recruitmentReason: fd.recruitmentReason || 'expansion',
      recruitmentReplacementWho: fd.recruitmentReplacementWho || '',
      recruitmentSalaryMin: fd.recruitmentSalaryMin || '',
      recruitmentSalaryMax: fd.recruitmentSalaryMax || '',
      recruitmentSalaryNegotiable: fd.recruitmentSalaryNegotiable || false,
      recruitmentExpectedDate: fd.recruitmentExpectedDate || '',
      recruitmentRequirements: fd.recruitmentRequirements || '',
      recruitmentDescription: fd.recruitmentDescription || '',
      showStepManager: fd.showStepManager !== false,
      showStepAccountant: fd.showStepAccountant !== false,
      showStepDirector: Boolean(fd.showStepDirector),
    });

    setShowCreateModal(true);
    setTimeout(() => { isHydratingEditOrDraftRef.current = false; }, 150);
    toast.success(t('Đã mở bản nháp để tiếp tục!'));
  };

  const draftApprovalItems: ApprovalItem[] = useMemo(() => {
    return draftsList.map(d => {
      const fd = d.formData || {};
      const wfDef = workflowList.find(w => w.id === d.workflowDefId) || (fd.selectedWorkflowDef ? workflowList.find(w => w.id === fd.selectedWorkflowDef.id) : null) || workflowList[0];

      // 1. Resolve Approver 1 (Direct Manager / Leader / HR)
      let app1 = fd.customApprover1;
      if (!app1) {
        if (d.workflowDefId === 'stationery') {
          app1 = getDefaultHrLeader();
        } else {
          app1 = getDefaultManagerApprover(user, wfDef);
        }
      }

      // 2. Resolve Approver 2 (Accountant or HR)
      let app2 = fd.customApprover2;
      const isHrWf = wfDef?.category === 'hr' || ['leave', 'late_early', 'remote_work'].includes(d.formType) || (d.formType === 'overtime' && fd.otType === 'compensatory');
      if (!app2 && (['expense', 'advance', 'general'].includes(d.formType) || isHrWf)) {
        if (d.formType === 'overtime' && fd.otType === 'compensatory') {
          app2 = getDefaultHrLeader();
        } else if (['expense', 'advance', 'general'].includes(d.formType)) {
          app2 = defaultAccountant;
        }
      }

      // 3. Resolve Approver 3 (Director)
      let app3 = fd.customApprover3;
      const vndDraftAmt = toVndAmount(d.amount, d.currency);
      if (!app3 && d.formType === 'expense' && (vndDraftAmt >= threeLevelThresholdVnd || fd.showStepDirector)) {
        app3 = defaultDirector;
      }

      const showStep1 = fd.showStepManager !== false;
      const showStep2 = fd.showStepAccountant !== false && (['expense', 'advance', 'general'].includes(d.formType) || (d.formType === 'overtime' && fd.otType === 'compensatory'));
      const showStep3 = Boolean(fd.showStepDirector || (d.formType === 'expense' && vndDraftAmt >= threeLevelThresholdVnd));

      return {
        id: -Math.abs(d.id.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0) || 9999),
        type: (d.formType === 'leave' || d.formType === 'advance' || d.formType === 'checkin' || d.formType === 'attendance_bulk') ? d.formType : 'expense',
        user_id: Number(user?.id) || 0,
        created_by: Number(user?.id) || 0,
        employee_name: (user as any)?.full_name || (user as any)?.name || t('Tôi'),
        title: d.title || d.workflowDefName,
        description: `[Bản nháp] ${d.workflowDefName}${d.amount > 0 ? ` • ${new Intl.NumberFormat('vi-VN').format(d.amount)} ${d.currency || 'đ'}` : ''}`,
        status: 'draft',
        created_at: d.createdAt,
        updated_at: d.updatedAt,
        currency: d.currency || 'VND',
        amount: d.amount,
        is_draft: true,
        draft_id: d.id,
        approver_id: showStep1 && app1 ? Number(app1.id) : undefined,
        approver_name: showStep1 && app1 ? (app1.full_name || app1.name) : undefined,
        approver_id_2: showStep2 && app2 ? Number(app2.id) : undefined,
        approver_name_2: showStep2 && app2 ? (app2.full_name || app2.name) : undefined,
        approver_id_3: showStep3 && app3 ? Number(app3.id) : undefined,
        approver_name_3: showStep3 && app3 ? (app3.full_name || app3.name) : undefined,
        status_level_1: 'draft',
        status_level_2: showStep2 ? 'draft' : 'none',
        status_level_3: showStep3 ? 'draft' : 'none',
        related_user_ids: fd.relatedUserIds || [],
      };
    });
  }, [draftsList, user, t, workflowList, users, teams, defaultAccountant, defaultDirector, toVndAmount, threeLevelThresholdVnd]);

  const activeDraftForWf = useMemo(() => {
    if (!selectedWorkflowDef) return null;
    return draftsList.find(d => d.workflowDefId === selectedWorkflowDef.id && d.id !== currentDraftId);
  }, [selectedWorkflowDef, draftsList, currentDraftId]);

  const auxFetchedRef = useRef<{ scope: string; fetched: boolean }>({ scope: '', fetched: false });

  useEffect(() => {
    const controller = new AbortController();
    if (approvalsCache.scopeKey !== cacheScopeKey || approvalsCache.users.length === 0 || Date.now() - approvalsCache.timestamp >= APPROVALS_SWR_TTL_MS) {
      fetchAPI('users?all=1', { signal: controller.signal }).then(res => {
        if (controller.signal.aborted) return;
        const d = res?.data ?? res;
        const list = Array.isArray(d) ? d : (d?.items || []);
        setUsers(list);
        approvalsCache.users = list;
      }).catch(() => {
        if (!controller.signal.aborted && approvalsCache.users.length === 0) setUsers([]);
      });
    }
    return () => controller.abort();
  }, [cacheScopeKey]);

  // Lazy-load auxiliary directories (suppliers, companies, contacts) ONLY when Create/Edit workflow modal opens
  useEffect(() => {
    if (!showCreateModal && !selectedWorkflowDef) return;
    if (auxFetchedRef.current.scope === cacheScopeKey && auxFetchedRef.current.fetched) return;
    auxFetchedRef.current = { scope: cacheScopeKey, fetched: true };
    const controller = new AbortController();

    if (approvalsCache.companies.length === 0) {
      api.get(`/companies?limit=${queryCap}`, { signal: controller.signal }).then(res => {
        if (controller.signal.aborted) return;
        const d = res.data?.data ?? res.data;
        const list = Array.isArray(d) ? d : (d?.items || []);
        setCompanies(list);
        approvalsCache.companies = list;
      }).catch(() => {
        if (!controller.signal.aborted) setCompanies([]);
      });
    } else {
      setCompanies(approvalsCache.companies);
    }

    if (approvalsCache.contacts.length === 0) {
      api.get(`/contacts?limit=${queryCap}`, { signal: controller.signal }).then(res => {
        if (controller.signal.aborted) return;
        const d = res.data?.data ?? res.data;
        const list = Array.isArray(d) ? d : (d?.items || []);
        setContacts(list);
        approvalsCache.contacts = list;
      }).catch(() => {
        if (!controller.signal.aborted) setContacts([]);
      });
    } else {
      setContacts(approvalsCache.contacts);
    }

    if (approvalsCache.suppliers.length === 0) {
      fetchAPI(`suppliers?limit=${queryCap}`, { signal: controller.signal }).then(res => {
        if (controller.signal.aborted) return;
        const d = res?.data ?? res;
        const list = Array.isArray(d) ? d : (d?.items || d?.suppliers || []);
        setSuppliers(list);
        approvalsCache.suppliers = list;
      }).catch(() => {
        if (controller.signal.aborted) return;
        api.get(`/suppliers?limit=${queryCap}`, { signal: controller.signal }).then(res => {
          if (controller.signal.aborted) return;
          const d = res.data?.data ?? res.data;
          const list = Array.isArray(d) ? d : (d?.items || d?.suppliers || []);
          setSuppliers(list);
          approvalsCache.suppliers = list;
        }).catch(() => {
          if (!controller.signal.aborted) setSuppliers([]);
        });
      });
    } else {
      setSuppliers(approvalsCache.suppliers);
    }

    return () => controller.abort();
  }, [showCreateModal, selectedWorkflowDef, cacheScopeKey, queryCap]);

  // Lecturers: aggregated from companies (tier f1/f2/lecturer) + users (teacher/giang_vien/tro_giang)
  const lecturerOptions = useMemo(() => {
    const list: any[] = [];
    const seenNames = new Set<string>();
    const safeCompanies = Array.isArray(companies) ? companies : ((companies as any)?.items || []);
    const safeUsers = Array.isArray(users) ? users : ((users as any)?.items || []);

    // 1. From companies (partner / external lecturers)
    safeCompanies.forEach((co: any) => {
      const tier = String(co.tier || '').toLowerCase();
      const type = String(co.type || '').toLowerCase();
      const isLec = ['f1', 'f2', 'giang_vien', 'chuyen_gia'].includes(tier) || type === 'lecturer' || type === 'instructor';
      if (isLec && co.name) {
        seenNames.add(co.name.toLowerCase());
        list.push({
          value: `company_${co.id}`,
          label: co.name,
          source: 'company',
          raw: co,
          bank_name: co.bank_name || '',
          bank_account: co.bank_account_number || co.bank_account || '',
          bank_account_name: co.bank_account_name || co.name || '',
          phone: co.phone || '',
          sublabel: `Giảng viên đối tác • ${co.phone || 'Chưa có SĐT'}${co.bank_name ? ` • ${co.bank_name}` : ''}`
        });
      }
    });

    // 2. From users (internal lecturers / academic staff)
    safeUsers.forEach((u: any) => {
      const role = String(u.role || '').toLowerCase();
      const job = String(u.job_title || '').toLowerCase();
      const isLec = role.includes('teacher') || role.includes('giang_vien') || role.includes('tro_giang') ||
                    job.includes('giảng viên') || job.includes('học thuật');
      const uName = u.full_name || u.name || '';
      if (isLec && uName && !seenNames.has(uName.toLowerCase())) {
        list.push({
          value: `user_${u.id}`,
          label: uName,
          source: 'user',
          raw: u,
          avatar: u.avatar_url || u.avatar,
          bank_name: u.bank_name || '',
          bank_account: u.bank_account || '',
          bank_account_name: uName,
          phone: u.phone || '',
          sublabel: `Giảng viên nội bộ • ${u.bank_name ? `${u.bank_name}: ${u.bank_account}` : 'Chưa có STK'}`
        });
      }
    });

    return list;
  }, [companies, users]);

  // Partners: unified suppliers + companies
  const partnerOptions = useMemo(() => {
    const list: any[] = [];
    const seenNames = new Set<string>();
    const safeSuppliers = Array.isArray(suppliers) ? suppliers : ((suppliers as any)?.items || (suppliers as any)?.suppliers || []);
    const safeCompanies = Array.isArray(companies) ? companies : ((companies as any)?.items || []);

    // 1. Suppliers
    safeSuppliers.forEach((s: any) => {
      if (s.name) {
        seenNames.add(s.name.toLowerCase());
        list.push({
          value: `sup_${s.id}`,
          label: s.name,
          source: 'supplier',
          raw: s,
          bank_name: s.bank_name || '',
          bank_account: s.bank_account || '',
          bank_account_name: s.bank_account_name || s.name || '',
          tax_code: s.tax_code || '',
          phone: s.phone || '',
          sublabel: `Nhà cung cấp • MST: ${s.tax_code || 'N/A'}${s.bank_name ? ` • ${s.bank_name}` : ''}`
        });
      }
    });

    // 2. Companies (B2B Partners)
    safeCompanies.forEach((co: any) => {
      const name = co.name || '';
      if (name && !seenNames.has(name.toLowerCase())) {
        const tier = String(co.tier || '').toUpperCase();
        list.push({
          value: `company_${co.id}`,
          label: name,
          source: 'company',
          raw: co,
          bank_name: co.bank_name || '',
          bank_account: co.bank_account_number || co.bank_account || '',
          bank_account_name: co.bank_account_name || name,
          tax_code: co.tax_id || '',
          phone: co.phone || '',
          sublabel: `Đối tác ${tier || 'B2B'}${co.tax_id ? ` • MST: ${co.tax_id}` : ''}${co.bank_name ? ` • ${co.bank_name}` : ''}`
        });
      }
    });

    return list;
  }, [suppliers, companies]);

  // Contacts (Clients / Students)
  const contactOptions = useMemo<any[]>(() => {
    const safeContacts: any[] = Array.isArray(contacts) ? contacts : ((contacts as any)?.items || []);
    return safeContacts.map((c: any) => {
      const name = c.full_name || c.name || `Khách hàng #${c.id}`;
      return {
        value: String(c.id),
        label: name,
        raw: c,
        avatar: c.avatar_url || c.avatar,
        phone: c.phone || '',
        email: c.email || '',
        bank_name: c.bank_name || '',
        bank_account: c.bank_account || '',
        bank_account_name: c.bank_account_name || name,
        sublabel: [c.phone, c.email].filter(Boolean).join(' • ')
      };
    });
  }, [contacts]);

  // Unified Other Beneficiary Options for Commission Payout (Đối tác, Nhà cung cấp, Người giới thiệu, Khách hàng, Giảng viên)
  const commissionRecipientOtherOptions = useMemo(() => {
    const list: any[] = [];
    const seenValues = new Set<string>();

    // 1. Đối tác (Companies)
    const safeCompanies = Array.isArray(companies) ? companies : ((companies as any)?.items || []);
    safeCompanies.forEach((co: any) => {
      const val = `co_${co.id}`;
      if (!seenValues.has(val) && co.name) {
        seenValues.add(val);
        const tier = String(co.tier || '').toUpperCase();
        list.push({
          value: val,
          rawId: co.id,
          category: 'company',
          typeLabel: `Đối tác ${tier || 'B2B'}`,
          label: co.name,
          avatar: co.logo_url,
          bank_name: co.bank_name || '',
          bank_account: co.bank_account_number || co.bank_account || '',
          bank_owner: co.bank_account_name || co.name || '',
          phone: co.phone || '',
          tax_code: co.tax_id || '',
          sublabel: [
            `Đối tác ${tier || 'B2B'}`,
            co.tax_id ? `MST: ${co.tax_id}` : '',
            co.bank_name ? `${co.bank_name}: ${co.bank_account_number || co.bank_account}` : 'Chưa có STK'
          ].filter(Boolean).join(' • ')
        });
      }
    });

    // 2. Nhà cung cấp (Suppliers)
    const safeSuppliers = Array.isArray(suppliers) ? suppliers : ((suppliers as any)?.items || (suppliers as any)?.suppliers || []);
    safeSuppliers.forEach((s: any) => {
      const val = `sup_${s.id}`;
      if (!seenValues.has(val) && s.name) {
        seenValues.add(val);
        list.push({
          value: val,
          rawId: s.id,
          category: 'supplier',
          typeLabel: 'Nhà cung cấp',
          label: s.name,
          bank_name: s.bank_name || '',
          bank_account: s.bank_account || '',
          bank_owner: s.bank_account_name || s.name || '',
          phone: s.phone || '',
          tax_code: s.tax_code || '',
          sublabel: [
            'Nhà cung cấp',
            s.tax_code ? `MST: ${s.tax_code}` : '',
            s.bank_name ? `${s.bank_name}: ${s.bank_account}` : 'Chưa có STK'
          ].filter(Boolean).join(' • ')
        });
      }
    });

    // 3. Người giới thiệu / Khách hàng (Contacts)
    const safeContacts = Array.isArray(contacts) ? contacts : ((contacts as any)?.items || []);
    safeContacts.forEach((c: any) => {
      const val = `contact_${c.id}`;
      const cName = c.full_name || c.name;
      if (!seenValues.has(val) && cName) {
        seenValues.add(val);
        list.push({
          value: val,
          rawId: c.id,
          category: 'contact',
          typeLabel: 'Người giới thiệu',
          label: cName,
          avatar: c.avatar_url || c.avatar,
          bank_name: c.bank_name || '',
          bank_account: c.bank_account || c.bank_account_number || '',
          bank_owner: c.bank_account_name || cName,
          phone: c.phone || '',
          email: c.email || '',
          sublabel: [
            'Người giới thiệu / Liên hệ',
            c.phone || '',
            c.bank_name ? `${c.bank_name}: ${c.bank_account || c.bank_account_number}` : 'Chưa có STK'
          ].filter(Boolean).join(' • ')
        });
      }
    });

    // 4. Giảng viên / Chuyên gia
    lecturerOptions.forEach((lec: any) => {
      const val = `lec_${lec.value}`;
      if (!seenValues.has(val) && lec.label) {
        seenValues.add(val);
        list.push({
          value: val,
          rawId: lec.raw?.id || lec.value,
          category: 'lecturer',
          typeLabel: 'Giảng viên / Chuyên gia',
          label: lec.label,
          avatar: lec.avatar,
          bank_name: lec.bank_name || '',
          bank_account: lec.bank_account || '',
          bank_owner: lec.bank_account_name || lec.label,
          phone: lec.phone || '',
          sublabel: lec.sublabel || `Giảng viên • ${lec.phone || ''}`
        });
      }
    });

    return list;
  }, [companies, suppliers, contacts, lecturerOptions]);

  // Auto-fill bank information for current user when opening payment request
  useEffect(() => {
    if (editingItemId || editingItemIdRef.current || currentDraftId || isHydratingEditOrDraftRef.current) return;
    if (showCreateModal && (formType === 'expense' || formType === 'advance' || selectedWorkflowDef?.category === 'finance') && user && !paymentEmployeeId && paymentTarget === 'Nội bộ') {
      const currentEmp = users.find(u => Number(u.id) === Number(user.id)) || user;
      if (currentEmp) {
        setPaymentEmployeeId(String(currentEmp.id));
        setPaymentBeneficiaryName(currentEmp.full_name || currentEmp.name || '');
        if (currentEmp.bank_name) setPaymentBankName(currentEmp.bank_name);
        if (currentEmp.bank_account) setPaymentBankAccount(currentEmp.bank_account);
        const accName = currentEmp.full_name || currentEmp.name || '';
        if (accName) setPaymentAccountName(accName.toUpperCase());
        if (currentEmp.phone) setPaymentPhone(currentEmp.phone);
      }
    }
  }, [showCreateModal, formType, selectedWorkflowDef, user, users, paymentEmployeeId, paymentTarget, editingItemId, currentDraftId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search || window.location.search);
    const tabParam = params.get('tab');
    if (tabParam === 'my_requests' || tabParam === 'following' || tabParam === 'all') {
      setActiveTab(tabParam);
      hasAutoSwitchedTabRef.current = true;
    } else if (tabParam === 'pending') {
      setActiveTab('pending');
      // Không khóa hasAutoSwitchedTabRef để cho phép loadData tự động fallback nếu pendingList rỗng
    }
    const openId = params.get('open_id') || params.get('id');
    const openType = params.get('open_type');
    const openStatus = params.get('open_status');
    const createType = params.get('create');
    if (createType === 'attendance_bulk') {
      const def = workflowList.find(w => w.id === 'attendance_bulk');
      if (def) {
        setSelectedWorkflowDef(def);
        setFormType('attendance_bulk');
        setExpenseTitle(def.name);
        const isManager = ['manager', 'director', 'admin', 'superadmin', 'super_admin', 'leader', 'truongphong', 'head_of_department'].includes(String(user?.role).toLowerCase()) || Boolean((user as any)?.is_team_leader);
        if (isManager) {
          setRelatedUserIds([]);
          setCustomApprover1(user);
        }
        const reqDate = params.get('date');
        const shouldScan = params.get('scan') === '1';
        const initMonth = reqDate ? reqDate.substring(0, 7) : getDefaultBulkMonth();
        setBulkMonth(initMonth);
        if (shouldScan) {
          handleScanMissingDays(initMonth);
        } else {
          const targetDate = reqDate || getTodayDateString();
          const userDefaultIn = (user as any)?.work_start_time ? String((user as any).work_start_time).substring(0, 5) : '08:00';
          const userDefaultOut = (user as any)?.work_end_time ? String((user as any).work_end_time).substring(0, 5) : '17:00';
          setSuggestedDays([{
            date: targetDate,
            check_in: userDefaultIn,
            check_out: userDefaultOut,
            has_check_in: false,
            has_check_out: false,
            is_on_leave: false,
            disabled: false,
            reason: '',
            is_manual: true
          }]);
        }
        setShowCreateModal(true);
      }
      navigate(location.pathname + (tabParam ? `?tab=${tabParam}` : ''), { replace: true });
    } else if (!openId && (openType || (location.state as any)?.openDrawer)) {
      const targetType = openType || (location.state as any)?.openType;
      const combined = [...pendingList, ...myRequestsList, ...allList];
      const matched = combined.find(it => targetType ? it.type === targetType : true);
      if (matched) {
        setSelectedTimelineItem(matched);
        pendingOpenRef.current = null;
        clearApprovalUrlParams();
      } else {
        pendingOpenRef.current = { id: 0, type: targetType, status: openStatus || undefined };
      }
    } else if (!openId) {
      const autoOpen = params.get('auto_open') === '1' || params.get('open_first') === '1';
      if (autoOpen && pendingList.length === 1 && !selectedTimelineItem) {
        setSelectedTimelineItem(pendingList[0]);
        pendingOpenRef.current = null;
        clearApprovalUrlParams();
      }
    }
  }, [location.search, location.state, location.pathname, pendingList.length, myRequestsList.length, allList.length, clearApprovalUrlParams]);

  const isItemAtMyStepToApprove = useCallback((item: any): boolean => {
    return checkItemAtMyStepToApprove(item, user, usersByNameMap);
  }, [user, usersByNameMap]);

  const getApprovalDisplayTitle = useCallback((it: ApprovalItem): string => {
    let t = (it.title || '').trim();
    t = t.replace(/^Yêu cầu chi phí(?:\s*-\s*Cấp \d+)?:\s*/i, '')
      .replace(/\s*\(\d+%\s*lương\)/gi, '')
      .replace(/\s*-\s*\[(?:Đăng ký làm việc từ xa|Tăng ca|Đi muộn\/Về sớm|Nghỉ phép)\].*$/i, '')
      .replace(/\s*-\s*\[Tỷ lệ hưởng lương:[^\]]+\]\s*(?:Lý do:.*)?$/i, '')
      .replace(/\s*-\s*\[Hình thức:[^\]]+\]\s*(?:Thời gian:.*)?$/i, '')
      .replace(/\s*Lý do:\s*.*$/i, '')
      .trim();

    const genericNames = [
      'đề nghị thanh toán',
      'yêu cầu thanh toán',
      'tạm ứng chi phí',
      'đề nghị tạm ứng',
      'thanh toán chi phí',
      'quy trình phê duyệt',
      'đề xuất chi phí',
      'chi phí nghiệp vụ khác',
      'chi phí',
      'yêu cầu chi phí'
    ];
    const isGeneric = !t || genericNames.some(g => t.toLowerCase() === g || t.toLowerCase().startsWith(g + ' #'));

    const misaMatch = t.match(/^(\[MISA #\d+\]\s*)?Đề nghị (?:thanh toán|tạm ứng) của [^,]+,\s*ngày [^,]+,\s*(?:về việc\s*)?(.*)$/i);
    if (misaMatch) {
      const prefix = misaMatch[1] || '';
      const purpose = misaMatch[2]?.trim() || '';
      if (purpose) {
        t = `${prefix}${purpose}`;
      }
    }

    const rawNotes = (it as any).notes || it.description || '';
    if (rawNotes) {
      const recMatch = rawNotes.match(/STK:\s*[0-9A-Za-z\-_]+\s*-\s*([^(\n]+)/i);
      if (recMatch && recMatch[1]) {
        const recipient = recMatch[1].trim();
        if (recipient && !t.toLowerCase().includes(recipient.toLowerCase())) {
          t = `${t} - ${recipient}`;
        }
      }
    }

    // Deduplicate any repeated segments in leave/HRM titles
    const hrmHeaderMatch = t.match(/^((?:\[Nghỉ phép\][^:]*|Đăng ký (?:WFH|OT|đi muộn\/về sớm|đi muộn|đi trễ|về sớm|công tác))\s*(?::\s*\d{1,2}\/\d{1,2}\/\d{4}(?:\s*-\s*\d{1,2}\/\d{1,2}\/\d{4})?)?\s*(?:\([\d.,]+\s*ngày\))?)\s*-\s*(.+)$/i);
    if (hrmHeaderMatch) {
      const headerPart = hrmHeaderMatch[1].trim();
      const rawTail = hrmHeaderMatch[2].trim();
      const levelMatch = rawTail.match(/(\s*-\s*Cấp\s*\d+(?:\s*\([^)]*\))?)$/i);
      const levelSuffix = levelMatch ? levelMatch[1] : '';
      const cleanTail = cleanLeaveReasonText(rawTail, false);
      t = cleanTail ? `${headerPart} - ${cleanTail}${levelSuffix}` : `${headerPart}${levelSuffix}`;
    }

    return t || `Quy trình #${it.id}`;
  }, []);

  const getApprovalCardSubtitle = useCallback((it: ApprovalItem): string => {
    const desc = (it.description || '').trim();
    if (!desc) return '';
    if (it.type === 'leave') {
      // Title already displays leave type, date range, days, and reason.
      // Only show bracket status badges (e.g. [Khấu trừ thực tế:...], [Đã duyệt WFH:...], [Đã tự động cộng...]) if present.
      const tags = desc.match(/\[(?:Khấu trừ thực tế|Đã duyệt WFH|Đã tự động cộng|Từ chối)[^\]]*\]/gi);
      return tags && tags.length > 0 ? Array.from(new Set(tags)).join(' • ') : '';
    }
    return desc;
  }, []);

  const inFlightOpsRef = useRef<Record<string, boolean>>({});
  const deleteInFlightRef = useRef(false);

  const loadData = useCallback(async (isSilent = false, abortSignal?: AbortSignal) => {
    const hasCachedData =
      approvalsCache.scopeKey === cacheScopeKey &&
      (approvalsCache.allList.length > 0 ||
        approvalsCache.pendingList.length > 0 ||
        approvalsCache.myRequestsList.length > 0);
    if (!isSilent && !hasCachedData) {
      setLoading(true);
    }
    try {
      let pList: ApprovalItem[] = [];
      let mList: ApprovalItem[] = [];
      let fList: ApprovalItem[] = [];
      let aList: ApprovalItem[] = [];

      const bustQs = isSilent ? `?_t=${Date.now()}` : '';
      try {
        const overviewRes = await fetchAPI(`hrm/approvals/overview${bustQs}`, { signal: abortSignal });
        if (abortSignal?.aborted) return;
        if (overviewRes && overviewRes.success && overviewRes.data) {
          pList = Array.isArray(overviewRes.data.pending) ? overviewRes.data.pending : [];
          mList = Array.isArray(overviewRes.data.my_requests) ? overviewRes.data.my_requests : [];
          fList = Array.isArray(overviewRes.data.following) ? overviewRes.data.following : [];
          aList = Array.isArray(overviewRes.data.all) ? overviewRes.data.all : [];
        } else {
          throw new Error('Fallback to parallel');
        }
      } catch (subErr: any) {
        if (abortSignal?.aborted || subErr?.name === 'AbortError' || subErr?.name === 'CanceledError') return;
        const [pendingRes, myRequestsRes, followingRes, allRes] = await Promise.all([
          fetchAPI(`hrm/approvals/pending${bustQs}`, { signal: abortSignal }).catch(() => ({ data: [] })),
          fetchAPI(`hrm/approvals/my-requests${bustQs}`, { signal: abortSignal }).catch(() => ({ data: [] })),
          fetchAPI(`hrm/approvals/following${bustQs}`, { signal: abortSignal }).catch(() => ({ data: [] })),
          fetchAPI(`hrm/approvals/all${bustQs}`, { signal: abortSignal }).catch(() => ({ data: [] }))
        ]);
        if (abortSignal?.aborted) return;
        pList = Array.isArray(pendingRes?.data) ? pendingRes.data : [];
        mList = Array.isArray(myRequestsRes?.data) ? myRequestsRes.data : [];
        fList = Array.isArray(followingRes?.data) ? followingRes.data : [];
        aList = Array.isArray(allRes?.data) ? allRes.data : [];
      }

      if (abortSignal?.aborted) return;

      const currentUid = Number(user?.id || 0);
      const currentUserName = (user?.name || (user as any)?.full_name || '').toLowerCase().trim();

      // 1. Đồng bộ yêu cầu của người tạo từ aList vào mList để đảm bảo người tạo luôn thấy yêu cầu của mình
      aList.forEach((it: any) => {
        const itemUid = Number(it.user_id || it.created_by || 0);
        const itEmpName = (it.employee_name || '').toLowerCase().trim();
        const isMine = (currentUid > 0 && itemUid === currentUid) || (currentUserName && itEmpName === currentUserName);
        if (isMine && !mList.some((m: any) => m.id === it.id && m.type === it.type)) {
          mList.unshift(it);
        }
      });

      // 2. Lọc danh sách "Chờ tôi duyệt": CHỈ gồm các yêu cầu ĐANG TỚI LƯỢT người đăng nhập duyệt
      // Hợp nhất pList và aList để không bao giờ bỏ sót bất kỳ yêu cầu nào đang chờ cấp của user
      const candidateMap = new Map<string, ApprovalItem>();
      [...aList, ...pList].forEach(it => {
        const key = `${it.type}-${it.id}`;
        if (!candidateMap.has(key)) candidateMap.set(key, it);
      });
      pList = Array.from(candidateMap.values()).filter(isItemAtMyStepToApprove);

      setPendingList(pList);
      setMyRequestsList(mList);
      setFollowingList(fList);
      setAllList(aList);
      approvalsCache.scopeKey = cacheScopeKey;
      approvalsCache.pendingList = pList;
      approvalsCache.myRequestsList = mList;
      approvalsCache.followingList = fList;
      approvalsCache.allList = aList;
      approvalsCache.timestamp = Date.now();

      // Đếm badge ở sidebar: gồm các đề xuất chờ tôi duyệt + các đề xuất của tôi đang chờ duyệt
      const badgeKeys = new Set<string>();
      pList.forEach(it => badgeKeys.add(`${it.type}-${it.id}`));
      mList.filter(it => isMyRequestPendingApproval(it, user, true)).forEach(it => badgeKeys.add(`${it.type}-${it.id}`));
      const totalBadgeCount = badgeKeys.size;

      window.dispatchEvent(new CustomEvent('approval-badge-updated', { detail: { count: totalBadgeCount } }));
      if (typeof window !== 'undefined') {
        const badgeStorageKey = getPendingBadgeStorageKey(user?.id, tenantId);
        sessionStorage.setItem(badgeStorageKey, String(totalBadgeCount));
        localStorage.setItem(badgeStorageKey, String(totalBadgeCount));
      }

      // Tự động chuyển tab thông minh: Nếu tab 'pending' (Chờ tôi duyệt) không có quy trình nào:
      // 1. Tự động chuyển sang 'my_requests' (Yêu cầu của tôi) nếu người dùng có đề xuất
      // 2. Nếu tab 'my_requests' cũng không có đề xuất nào -> Chuyển sang 'all' (Tất cả đề xuất)
      if (!hasAutoSwitchedTabRef.current) {
        const params = new URLSearchParams(location.search || window.location.search);
        const specifiedTab = params.get('tab');
        if ((!specifiedTab || specifiedTab === 'pending') && pList.length === 0) {
          const hasMyRequests = (mList.length + (draftsList?.length || 0)) > 0;
          if (hasMyRequests) {
            setActiveTab('my_requests');
          } else {
            setActiveTab('all');
          }
        }
        hasAutoSwitchedTabRef.current = true;
      }

      // Đồng bộ thông tin đầy đủ cho item được mở qua link thông báo
      const targetOpenId = pendingOpenRef.current?.id || (selectedTimelineItem?.title === '' ? selectedTimelineItem.id : null);
      const targetType = pendingOpenRef.current?.type || selectedTimelineItem?.type;
      const combined = [...pList, ...mList, ...fList, ...aList];
      if (targetOpenId && targetOpenId > 0) {
        const matchedItem = combined.find(it => it.id === targetOpenId && (targetType ? it.type === targetType : true)) || combined.find(it => it.id === targetOpenId);
        if (matchedItem) {
          setSelectedTimelineItem(matchedItem);
          pendingOpenRef.current = null;
        }
      } else if (targetType && !selectedTimelineItem) {
        const matchedItem = (pList.length > 0 ? pList : combined).find(it => it.type === targetType);
        if (matchedItem) {
          setSelectedTimelineItem(matchedItem);
          pendingOpenRef.current = null;
        }
      }

      const params = new URLSearchParams(location.search || window.location.search);
      const autoOpen = params.get('auto_open') === '1' || params.get('open_first') === '1';
      if (autoOpen && !selectedTimelineItem) {
        if (pList.length === 1) {
          setSelectedTimelineItem(pList[0]);
        } else if (pList.length === 0 && mList.length === 1) {
          setSelectedTimelineItem(mList[0]);
        }
        pendingOpenRef.current = null;
        clearApprovalUrlParams();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError') return;
      console.error('Lỗi tải dữ liệu quy trình:', err);
    } finally {
      if (!isSilent && !abortSignal?.aborted) {
        setLoading(false);
      }
    }
  }, [location.search, selectedTimelineItem, isItemAtMyStepToApprove, user, draftsList, cacheScopeKey, tenantId, clearApprovalUrlParams]);

  const loadDataRef = useRef(loadData);
  loadDataRef.current = loadData;
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadDataRef.current(false, controller.signal);
    const handleRefresh = () => {
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(() => {
        loadDataRef.current(true);
      }, 60);
    };
    window.addEventListener('approval-updated', handleRefresh);
    window.addEventListener('refresh-approvals', handleRefresh);
    window.addEventListener('new-notification-received', handleRefresh);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      controller.abort();
      if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current);
      window.removeEventListener('approval-updated', handleRefresh);
      window.removeEventListener('refresh-approvals', handleRefresh);
      window.removeEventListener('new-notification-received', handleRefresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const captureListsSnapshot = useCallback(() => ({
    pendingList: approvalsCache.pendingList,
    myRequestsList: approvalsCache.myRequestsList,
    followingList: approvalsCache.followingList,
    allList: approvalsCache.allList
  }), []);

  const restoreListsSnapshot = useCallback((snap: {
    pendingList: ApprovalItem[];
    myRequestsList: ApprovalItem[];
    followingList: ApprovalItem[];
    allList: ApprovalItem[];
  }) => {
    approvalsCache.pendingList = snap.pendingList;
    approvalsCache.myRequestsList = snap.myRequestsList;
    approvalsCache.followingList = snap.followingList;
    approvalsCache.allList = snap.allList;
    setPendingList(snap.pendingList);
    setMyRequestsList(snap.myRequestsList);
    setFollowingList(snap.followingList);
    setAllList(snap.allList);
  }, []);

  const applyOptimisticStatusUpdate = useCallback((target: ApprovalItem, nextStatus: 'approved' | 'rejected') => {
    const isSame = (x: ApprovalItem) => Number(x.id) === Number(target.id) && x.type === target.type;
    const patchItem = (x: ApprovalItem): ApprovalItem => {
      if (!isSame(x)) return x;
      if (nextStatus === 'rejected') {
        return {
          ...x,
          status: 'rejected',
          status_level_1: x.status_level_1 === 'pending' ? 'rejected' : x.status_level_1,
          status_level_2: x.status_level_1 === 'approved' && x.status_level_2 === 'pending' ? 'rejected' : x.status_level_2
        };
      }
      const hasL2 = Boolean((x as any).approver_id_2) && x.status_level_2 !== 'none';
      const hasL3 = Boolean((x as any).approver_id_3) && (x as any).status_level_3 !== 'none';
      if (x.status_level_1 === 'pending' && hasL2) {
        return { ...x, status_level_1: 'approved', status: 'pending' };
      }
      if (x.status_level_2 === 'pending' && hasL3) {
        return { ...x, status_level_1: 'approved', status_level_2: 'approved', status: 'pending' };
      }
      return {
        ...x,
        status: 'approved',
        status_level_1: 'approved',
        status_level_2: hasL2 ? 'approved' : x.status_level_2,
        ...(hasL3 ? { status_level_3: 'approved' } : {})
      } as ApprovalItem;
    };

    setPendingList(prev => {
      const next = prev.filter(x => !isSame(x));
      approvalsCache.pendingList = next;
      return next;
    });
    setMyRequestsList(prev => {
      const next = prev.map(patchItem);
      approvalsCache.myRequestsList = next;
      return next;
    });
    setFollowingList(prev => {
      const next = prev.map(patchItem);
      approvalsCache.followingList = next;
      return next;
    });
    setAllList(prev => {
      const next = prev.map(patchItem);
      approvalsCache.allList = next;
      return next;
    });
  }, []);

  const dispatchApprovalDecision = async (item: ApprovalItem, decision: 'approved' | 'rejected', reason = '') => {
    const itemType = String(item.type || '').toLowerCase();
    if (itemType === 'leave') {
      await fetchAPI('hrm/leaves', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'rejected' ? { id: item.id, status: 'rejected', reason } : { id: item.id, status: 'approved' })
      });
    } else if (itemType === 'advance') {
      await fetchAPI('hrm/advances', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'rejected' ? { id: item.id, status: 'rejected', reason } : { id: item.id, status: 'approved' })
      });
    } else if (itemType === 'expense') {
      await api.patch(`/expenses/${item.id}`, decision === 'rejected' ? { status: 'rejected', reject_reason: reason } : { status: 'approved' });
    } else if (itemType === 'po' || itemType === 'purchase_order') {
      await api.post(`/purchase-orders/${item.id}/approve`, decision === 'rejected' ? { status: 'rejected', reject_reason: reason } : { status: 'approved' });
    } else if (itemType === 'so' || itemType === 'sales_order') {
      if (decision === 'rejected') {
        await api.post(`/sales-orders/${item.id}/reject`, { reason, reject_reason: reason });
      } else {
        await api.post(`/sales-orders/${item.id}/approve`, { status: 'approved' });
      }
    } else if (itemType === 'deposit') {
      if (decision === 'rejected') {
        await api.post(`/deposits/${item.id}/cancel`, { reason, cancel_reason: reason });
      } else {
        await api.post(`/deposits/${item.id}/confirm-payment`, { status: 'approved' });
      }
    } else if (itemType === 'quote') {
      await api.put(`/quotes/${item.id}`, decision === 'rejected' ? { status: 'rejected', reject_reason: reason } : { status: 'approved' });
    } else if (itemType === 'checkin') {
      await api.put(`/check-ins/${item.id}`, decision === 'rejected' ? { status: 'rejected', reason } : { status: 'approved' });
    } else if (itemType === 'attendance_bulk') {
      await api.post(`/check-ins/${item.id}/bulk-approve`, decision === 'rejected' ? { status: 'rejected', admin_note: reason } : { status: 'approved' });
    } else {
      throw new Error(t('Loại đề xuất này chưa được hỗ trợ xử lý tự động. Vui lòng mở chi tiết để xử lý.'));
    }
  };

  const handleApprove = async (item: ApprovalItem) => {
    const lockKey = `${item.type}_${item.id}`;
    if (inFlightOpsRef.current[lockKey] || actionLoadingId === lockKey) return;
    inFlightOpsRef.current[lockKey] = true;
    setActionLoadingId(lockKey);
    const snapshot = captureListsSnapshot();
    applyOptimisticStatusUpdate(item, 'approved');
    try {
      await dispatchApprovalDecision(item, 'approved');
      toast.success(t('Đã phê duyệt yêu cầu thành công!'));
      setSelectedIds(prev => {
        if (!prev.has(lockKey)) return prev;
        const next = new Set(prev);
        next.delete(lockKey);
        return next;
      });
      window.dispatchEvent(new CustomEvent('approval-updated'));
    } catch (err: any) {
      restoreListsSnapshot(snapshot);
      toast.error(err?.response?.data?.message || err?.message || t('Lỗi khi phê duyệt'));
      loadData(true);
    } finally {
      delete inFlightOpsRef.current[lockKey];
      setActionLoadingId(null);
    }
  };

  const openRejectModal = (item: ApprovalItem) => {
    setSelectedItem(item);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem || isSubmittingReject) return;
    const lockKey = `${selectedItem.type}_${selectedItem.id}`;
    if (inFlightOpsRef.current[lockKey]) return;
    if (!rejectReason.trim()) {
      toast.error(t('Vui lòng nhập lý do từ chối!'));
      return;
    }

    const targetItem = selectedItem;
    const snapshot = captureListsSnapshot();
    applyOptimisticStatusUpdate(targetItem, 'rejected');

    try {
      inFlightOpsRef.current[lockKey] = true;
      setActionLoadingId(lockKey);
      setIsSubmittingReject(true);
      await dispatchApprovalDecision(targetItem, 'rejected', rejectReason.trim());
      toast.success(t('Đã từ chối yêu cầu thành công!'));
      setSelectedIds(prev => {
        if (!prev.has(lockKey)) return prev;
        const next = new Set(prev);
        next.delete(lockKey);
        return next;
      });
      window.dispatchEvent(new CustomEvent('approval-updated'));
      setRejectModalOpen(false);
      setSelectedItem(null);
      setSelectedTimelineItem(null);
      pendingOpenRef.current = null;
      clearApprovalUrlParams();
    } catch (err: any) {
      restoreListsSnapshot(snapshot);
      toast.error(err?.response?.data?.message || err?.message || t('Lỗi khi từ chối'));
      loadData(true);
    } finally {
      delete inFlightOpsRef.current[lockKey];
      setActionLoadingId(null);
      setIsSubmittingReject(false);
    }
  };

  const handleDeleteRequest = (item: any, onDeleted?: () => void) => {
    const isApproved = item.status === 'approved' || item.status === 'completed';
    if (isApproved && !isStrictAdmin) {
      toast.error(t('Đơn/đề xuất này đã được duyệt đủ cấp, không thể xóa!'));
      return;
    }
    showConfirm({
      title: isApproved ? t('Xác nhận Admin xóa quy trình đã duyệt') : t('Xác nhận xóa / thu hồi yêu cầu'),
      message: isApproved
        ? t('Cảnh báo: Quy trình này đã được duyệt. Bạn có chắc chắn muốn xóa vĩnh viễn không? Hành động này không thể hoàn tác.')
        : t('Bạn có chắc chắn muốn xóa hoặc thu hồi yêu cầu này không? Hành động này không thể hoàn tác.'),
      confirmText: t('Xóa yêu cầu'),
      isDanger: true,
      onConfirm: async () => {
        if (deleteInFlightRef.current) return;
        deleteInFlightRef.current = true;
        const snapshot = captureListsSnapshot();
        const isSame = (x: ApprovalItem) => Number(x.id) === Number(item.id) && x.type === item.type;
        setPendingList(prev => {
          const next = prev.filter(x => !isSame(x));
          approvalsCache.pendingList = next;
          return next;
        });
        setMyRequestsList(prev => {
          const next = prev.filter(x => !isSame(x));
          approvalsCache.myRequestsList = next;
          return next;
        });
        setFollowingList(prev => {
          const next = prev.filter(x => !isSame(x));
          approvalsCache.followingList = next;
          return next;
        });
        setAllList(prev => {
          const next = prev.filter(x => !isSame(x));
          approvalsCache.allList = next;
          return next;
        });
        try {
          const itemType = String(item.type || '').toLowerCase();
          if (itemType === 'expense') {
            await api.delete(`/expenses/${item.id}`);
          } else if (itemType === 'po' || itemType === 'purchase_order') {
            await api.delete(`/purchase-orders/${item.id}`);
          } else if (itemType === 'so' || itemType === 'sales_order') {
            await api.delete(`/sales-orders/${item.id}`);
          } else if (itemType === 'deposit') {
            await api.post(`/deposits/${item.id}/cancel`, { reason: t('Thu hồi đề xuất') });
          } else if (itemType === 'quote') {
            await api.delete(`/quotes/${item.id}`);
          } else if (itemType === 'checkin') {
            await api.delete(`/check-ins/${item.id}`);
          } else if (itemType === 'leave') {
            await fetchAPI(`hrm/leaves/${item.id}`, { method: 'DELETE' });
          } else if (itemType === 'advance') {
            await fetchAPI(`hrm/advances/${item.id}`, { method: 'DELETE' });
          } else if (itemType === 'attendance_bulk') {
            await api.delete(`/check-ins/bulk-requests/${item.id}`);
          } else {
            restoreListsSnapshot(snapshot);
            toast.error(t('Không hỗ trợ xóa loại yêu cầu này'));
            loadData(true);
            return;
          }
          toast.success(t('Đã xóa yêu cầu thành công'));
          window.dispatchEvent(new CustomEvent('approval-updated'));
          if (selectedTimelineItem && isSame(selectedTimelineItem)) {
            setSelectedTimelineItem(null);
            clearApprovalUrlParams();
          }
          if (selectedItem && isSame(selectedItem)) {
            setSelectedItem(null);
            clearApprovalUrlParams();
          }
          onDeleted?.();
          await loadData(true);
        } catch (err: any) {
          restoreListsSnapshot(snapshot);
          toast.error(err.response?.data?.message || err.message || t('Lỗi khi xóa yêu cầu'));
          loadData(true);
        } finally {
          deleteInFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  const getWorkflowDefFromItem = (item: ApprovalItem | any) => {
    if (!item) return workflowList[0];
    if (item.type === 'leave') {
      return workflowList.find(w => w.id === 'leave_late') || workflowList[0];
    }
    if (item.type === 'advance') {
      return workflowList.find(w => w.id === 'advance_money') || workflowList[0];
    }
    if (item.type === 'attendance_bulk' || item.type === 'checkin') {
      return workflowList.find(w => w.id === 'attendance_bulk') || workflowList[0];
    }
    if (item.type === 'expense') {
      const rawTitle = (item.title || '').replace('Yêu cầu chi phí: ', '').toLowerCase().trim();
      const foundByTitle = workflowList.find(w => w.name.toLowerCase().trim() === rawTitle || rawTitle.includes(w.name.toLowerCase().trim()));
      if (foundByTitle) return foundByTitle;
      return workflowList.find(w => w.id === 'expense_claim') || workflowList.find(w => w.id === 'payment') || workflowList[0];
    }
    return workflowList.find(w => w.id === item.type) || workflowList[0];
  };

  const handleEditRequest = async (item: ApprovalItem, isDuplicate = false) => {
    const isCreator = Number(user?.id) === Number(item.created_by || item.user_id);
    if (!isDuplicate && !isCreator) {
      toast.error(t('Chỉ người tạo đề xuất mới có quyền chỉnh sửa'));
      return;
    }
    setSelectedTimelineItem(null);
    setSelectedItem(null);
    pendingOpenRef.current = null;
    clearApprovalUrlParams();
    lastSavedSnapshotRef.current = null;
    isHydratingEditOrDraftRef.current = true;

    const finishHydration = () => {
      setShowCreateModal(true);
      setTimeout(() => {
        isHydratingEditOrDraftRef.current = false;
      }, 150);
    };

    if (isDuplicate) {
      editingItemIdRef.current = null;
      setEditingItemId(null);
      setEditingItemType(null);
      setCurrentDraftId(null);
      if (user) {
        const myUser = users.find(u => Number(u.id) === Number(user.id)) || user;
        setProposerUser(myUser);
      }
    } else {
      editingItemIdRef.current = item.id;
      setEditingItemId(item.id);
      setEditingItemType(item.type);
      setCurrentDraftId(null);
      const creatorId = Number(item.created_by || item.user_id);
      const creator = users.find(u => Number(u.id) === creatorId);
      if (creator) {
        setProposerUser(creator);
      }
    }

    const parseMultiAttachmentsFromText = (rawText: string, singleImageUrl?: string) => {
      const parsedAtts: any[] = [];
      const isDuplicateAtt = (candidateUrl: string, candidateName?: string) => {
        const norm = normalizeFileUrl(candidateUrl);
        const name = candidateName || getFileNameFromUrl(candidateUrl);
        return parsedAtts.some(a => {
          const aNorm = normalizeFileUrl(a.url);
          const aName = a.name || getFileNameFromUrl(a.url);
          return (norm && aNorm && norm === aNorm) || (name && aName && name === aName);
        });
      };

      if (rawText) {
        const attMatches = rawText.matchAll(/(?:•|-|\*)?\s*([^\n\r(]+?)\s*\((https?:\/\/[^\s)]+|\/backend\/[^\s)]+|uploads\/[^\s)]+)\)/gi);
        for (const m of attMatches) {
          const aName = m[1].replace(/^Hồ sơ đính kèm:\s*/i, '').trim();
          const aUrl = m[2].trim();
          if (aName && aUrl && !isDuplicateAtt(aUrl, aName)) {
            parsedAtts.push({ name: aName, url: aUrl });
          }
        }
      }
      if (singleImageUrl && !isDuplicateAtt(singleImageUrl)) {
        parsedAtts.push({
          name: getFileNameFromUrl(singleImageUrl) || 'Tài liệu',
          url: singleImageUrl
        });
      }
      setAttachments(parsedAtts);
    };

    const restoreApproversAndRelated = (data: any) => {
      const app1Id = data.approver_id ? Number(data.approver_id) : (data.manager_id ? Number(data.manager_id) : (item.approver_id ? Number(item.approver_id) : null));
      const app2Id = data.approver_id_2 ? Number(data.approver_id_2) : (data.hr_id ? Number(data.hr_id) : (item.approver_id_2 ? Number(item.approver_id_2) : null));
      const app3Id = data.approver_id_3 ? Number(data.approver_id_3) : (item.approver_id_3 ? Number(item.approver_id_3) : null);

      if (app1Id) {
        const u = users.find(x => Number(x.id) === app1Id);
        userPickedApprover1Ref.current = true;
        setCustomApprover1(u || (data.approver_name ? { id: app1Id, full_name: data.approver_name, avatar_url: data.approver_avatar } : { id: app1Id, full_name: `User #${app1Id}` }));
      } else {
        userPickedApprover1Ref.current = false;
        setCustomApprover1(null);
      }

      if (app2Id) {
        const u = users.find(x => Number(x.id) === app2Id);
        userPickedApprover2Ref.current = true;
        setCustomApprover2(u || (data.approver_name_2 ? { id: app2Id, full_name: data.approver_name_2, avatar_url: data.approver_avatar_2 } : { id: app2Id, full_name: `User #${app2Id}` }));
      } else {
        userPickedApprover2Ref.current = false;
        setCustomApprover2(null);
      }

      if (app3Id) {
        const u = users.find(x => Number(x.id) === app3Id);
        userPickedApprover3Ref.current = true;
        setCustomApprover3(u || (data.approver_name_3 ? { id: app3Id, full_name: data.approver_name_3, avatar_url: data.approver_avatar_3 } : { id: app3Id, full_name: `User #${app3Id}` }));
      } else {
        userPickedApprover3Ref.current = false;
        setCustomApprover3(null);
      }

      setShowStepManager(!!app1Id);
      setShowStepAccountant(!!app2Id);
      setShowStepDirector(!!app3Id);

      const rawRelated = data.related_user_ids !== undefined ? data.related_user_ids : item.related_user_ids;
      if (rawRelated) {
        try {
          const rIds = typeof rawRelated === 'string'
            ? JSON.parse(rawRelated)
            : rawRelated;
          if (Array.isArray(rIds)) setRelatedUserIds(rIds.map(Number));
          else setRelatedUserIds([]);
        } catch {
          setRelatedUserIds([]);
        }
      } else {
        setRelatedUserIds([]);
      }
    };

    const matchingDef = getWorkflowDefFromItem(item);

    // 1. HR Leave & Specialized HR Requests: leave, late_early, overtime, remote_work
    if (item.type === 'leave') {
      try {
        let found: any = null;
        try {
          const singleRes = await api.get(`/hrm/leaves/${item.id}`);
          found = singleRes?.data?.data || singleRes?.data;
        } catch {
          const res = await fetchAPI('hrm/leaves');
          found = res?.data?.find((l: any) => Number(l.id) === Number(item.id));
        }
        if (!found) {
          found = item;
        }
        if (found) {
          const lType = found.leave_type || (item as any).leave_type || (matchingDef?.id === 'late_early' ? 'late_early' : matchingDef?.id === 'overtime' ? 'overtime' : matchingDef?.id === 'remote_work' ? 'remote_work' : 'annual');
          const r = String(found.raw_reason || (item as any).raw_reason || found.reason || item.description || '');
          const cleanR = r.replace(/\[Tài liệu đính kèm[^\]]*\]:[\s\S]*$/i, '').trim();

          const parseIntermittentDates = (text: string, defaultSession: 'full' | 'morning' | 'afternoon' = 'full') => {
            const detailBracket = text.match(/\[(?:Ngày nghỉ chi tiết|Ngày nghỉ lẻ|Ngày WFH lẻ):\s*([^\]]+)\]/i);
            if (!detailBracket) return [];
            const rawParts = detailBracket[1].split(',').map(s => s.trim()).filter(Boolean);
            const parsed: Array<{ date: string; session: 'full' | 'morning' | 'afternoon' }> = [];
            for (const part of rawParts) {
              const dm = part.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})/);
              if (dm) {
                const isoDate = dm[4]
                  ? `${dm[4]}-${dm[5]}-${dm[6]}`
                  : `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`;
                let sess: 'full' | 'morning' | 'afternoon' = defaultSession;
                if (part.toLowerCase().includes('sáng')) sess = 'morning';
                else if (part.toLowerCase().includes('chiều')) sess = 'afternoon';
                parsed.push({ date: isoDate, session: sess });
              }
            }
            return parsed;
          };

          if (lType === 'late_early') {
            const def = workflowList.find(w => w.id === 'late_early') || matchingDef;
            setSelectedWorkflowDef(def);
            setFormType('late_early');
            const resolvedSubType = resolveLateEarlySubType(found, cleanR);
            setLateEarlyType(resolvedSubType);
            let resolvedMin = 0;
            const minMatch = cleanR.match(/(\d+)\s*phút/i);
            if (minMatch) {
              resolvedMin = Number(minMatch[1]);
            } else if ((found.start_date || found.from_date) && (found.end_date || found.to_date)) {
              const sTs = new Date(String(found.start_date || found.from_date).replace(' ', 'T')).getTime();
              const eTs = new Date(String(found.end_date || found.to_date).replace(' ', 'T')).getTime();
              if (!isNaN(sTs) && !isNaN(eTs) && eTs > sTs) {
                resolvedMin = Math.round((eTs - sTs) / 60000);
              }
            }
            if (resolvedMin > 0) {
              setLateEarlyMinutes(resolvedMin);
              setIsCustomMinutesMode(![30, 60, 90, 120, 150, 180].includes(resolvedMin));
            }
            const timeMatch = cleanR.match(/Thời gian:\s*(\d{1,2}:\d{2})/i);
            const rawStartStr = String(found.from_date || found.start_date || '');
            const startClockMatch = rawStartStr.match(/(?:T|\s)(\d{2}:\d{2})/);
            if (timeMatch) {
              setOtStart(timeMatch[1]);
            } else if (startClockMatch) {
              setOtStart(startClockMatch[1]);
            }
            const startD = rawStartStr.split(/[T ]/)[0] || getTodayDateString();
            setLeaveFrom(startD);
            setLeaveTo(startD);
            const baseReasonMatch = cleanR.match(/Lý do:\s*([\s\S]*)$/i);
            const cleanReasonVal = cleanLeaveReasonText(baseReasonMatch ? baseReasonMatch[1].trim() : cleanR, false);
            setLeaveReason(cleanReasonVal);
            setWorkflowTitleSuffix(cleanReasonVal);
            setExpenseTitle(getFullWorkflowTitle(def, cleanReasonVal));
          } else if (lType === 'overtime') {
            const def = workflowList.find(w => w.id === 'overtime') || matchingDef;
            setSelectedWorkflowDef(def);
            setFormType('overtime');
            setOtType(found.ot_type || (cleanR.includes('Lấy OT bù') || cleanR.includes('Nghỉ bù') ? 'compensatory' : 'salary'));
            setOtRate(Number(found.ot_rate) || 1.5);
            const d = String(found.from_date || found.start_date || '').split(/[T ]/)[0] || getTodayDateString();
            setOtDate(d);
            const timeRangeMatch = cleanR.match(/Thời gian:\s*(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/i);
            if (timeRangeMatch) {
              setOtStart(timeRangeMatch[1]);
              setOtEnd(timeRangeMatch[2]);
            } else {
              if (found.from_date?.includes('T')) setOtStart(found.from_date.split('T')[1].substring(0, 5));
              if (found.to_date?.includes('T')) setOtEnd(found.to_date.split('T')[1].substring(0, 5));
            }
            const baseReasonMatch = cleanR.match(/Lý do:\s*([\s\S]*)$/i);
            const cleanReasonVal = cleanLeaveReasonText(baseReasonMatch ? baseReasonMatch[1].trim() : cleanR, false);
            setLeaveReason(cleanReasonVal);
            setWorkflowTitleSuffix(cleanReasonVal);
            setExpenseTitle(getFullWorkflowTitle(def, cleanReasonVal));
          } else if (lType === 'remote_work') {
            const def = workflowList.find(w => w.id === 'remote_work') || matchingDef;
            setSelectedWorkflowDef(def);
            setFormType('remote_work');
            const startD = String(found.start_date || found.from_date || '').split(/[T ]/)[0] || getTodayDateString();
            const endD = String(found.end_date || found.to_date || startD).split(/[T ]/)[0] || startD;
            setLeaveFrom(startD);
            setLeaveTo(endD);

            const parsedDates = parseIntermittentDates(cleanR, 'full');
            if (parsedDates.length > 0 && cleanR.includes('Ngày WFH lẻ')) {
              setLeaveSession('intermittent');
              setIntermittentDates(parsedDates);
            } else if (cleanR.includes('[Làm việc từ xa: Buổi sáng]')) {
              setLeaveSession('morning');
            } else if (cleanR.includes('[Làm việc từ xa: Buổi chiều]')) {
              setLeaveSession('afternoon');
            } else if (startD !== endD) {
              setLeaveSession('range');
            } else {
              setLeaveSession('full');
            }

            if (found.salary_rate !== undefined && found.salary_rate !== null) {
              setWfhSalaryRate(Number(found.salary_rate));
            } else {
              const rateMatch = cleanR.match(/(?:Tỷ lệ hưởng lương|Hưởng\s*)(\d+(?:\.\d+)?)%/i);
              if (rateMatch) setWfhSalaryRate(Number(rateMatch[1]));
              else setWfhSalaryRate(Number(leavePolicy?.wfh_excess_rate_pct ?? 50));
            }

            const strippedReason = cleanLeaveReasonText(
              cleanR
                .replace(/^\[Làm việc từ xa[^\]]*\]\s*/i, '')
                .replace(/\[Ngày WFH lẻ:[^\]]*\]\s*/gi, '')
                .replace(/^Lý do:\s*/i, '')
                .trim(),
              false
            );
            setLeaveReason(strippedReason);
            setWorkflowTitleSuffix(strippedReason);
            setExpenseTitle(getFullWorkflowTitle(def, strippedReason));
          } else {
            const def = workflowList.find(w => w.id === 'leave_late') || matchingDef;
            setSelectedWorkflowDef(def);
            setFormType('leave');
            setLeaveType(found.leave_type || (item as any).leave_type || 'annual');
            const startD = String(found.start_date || found.from_date || '').split(/[T ]/)[0] || getTodayDateString();
            const endD = String(found.end_date || found.to_date || startD).split(/[T ]/)[0] || startD;
            setLeaveFrom(startD);
            setLeaveTo(endD);

            const parsedDates = parseIntermittentDates(cleanR, 'full');
            if (parsedDates.length > 0 && (cleanR.includes('Nghỉ ngắt quãng') || cleanR.includes('Ngày nghỉ lẻ'))) {
              setLeaveSession('intermittent');
              setIntermittentDates(parsedDates);
            } else if (cleanR.includes('Nghỉ buổi sáng')) {
              setLeaveSession('morning');
              if (parsedDates.length > 0) setIntermittentDates(parsedDates);
            } else if (cleanR.includes('Nghỉ buổi chiều')) {
              setLeaveSession('afternoon');
              if (parsedDates.length > 0) setIntermittentDates(parsedDates);
            } else if (startD !== endD || cleanR.includes('Nghỉ nhiều ngày')) {
              setLeaveSession('range');
              if (parsedDates.length > 0) setIntermittentDates(parsedDates);
            } else {
              setLeaveSession('full');
              if (parsedDates.length > 0) setIntermittentDates(parsedDates);
            }

            const strippedReason = cleanLeaveReasonText(
              cleanR
                .replace(/^\[(?:Nghỉ buổi sáng|Nghỉ buổi chiều|Nghỉ cả ngày|Nghỉ nhiều ngày|Nghỉ ngắt quãng)[^\]]*\]\s*/i, '')
                .replace(/\[(?:Ngày nghỉ chi tiết|Ngày nghỉ lẻ):[^\]]*\]\s*/gi, '')
                .trim(),
              false
            );
            setLeaveReason(strippedReason);
            setWorkflowTitleSuffix(strippedReason);
            setExpenseTitle(getFullWorkflowTitle(def, strippedReason));
          }
          parseMultiAttachmentsFromText(r, found.attachment_url || found.image_url);
          restoreApproversAndRelated(found);
          finishHydration();
          return;
        }
      } catch (e) {
        console.error('Error fetching leave for edit:', e);
      }
    }

    // 2. Attendance bulk / check-in
    if (item.type === 'attendance_bulk' || item.type === 'checkin') {
      const def = workflowList.find(w => w.id === 'attendance_bulk') || matchingDef;
      setSelectedWorkflowDef(def);
      setFormType('attendance_bulk');
      setExpenseTitle(item.title || def.name);
      setWorkflowTitleSuffix(extractTitleSuffix(item.title || '', def?.name));
      try {
        if (item.type === 'attendance_bulk') {
          const bulkRes = await api.get(`/check-ins/bulk-requests/${item.id}`);
          const bulkData = bulkRes?.data?.data || bulkRes?.data;
          if (bulkData) {
            setBulkMonth(bulkData.month_period || getDefaultBulkMonth());
            let detailsArr = bulkData.details;
            if (typeof detailsArr === 'string') {
              try { detailsArr = JSON.parse(detailsArr); } catch { detailsArr = []; }
            }
            if (Array.isArray(detailsArr) && detailsArr.length > 0) {
              setSuggestedDays(detailsArr.map((d: any) => ({
                ...d,
                date: String(d.date || d.work_date || '').split(/[T ]/)[0],
                check_in: String(d.check_in || '08:00').slice(0, 5),
                check_out: String(d.check_out || '17:30').slice(0, 5),
                session: d.session || 'full_day',
                reason: d.reason || d.notes || '',
                selected: true
              })));
            }
            parseMultiAttachmentsFromText(String(bulkData.notes || item.description || ''), bulkData.attachment_url);
            restoreApproversAndRelated(bulkData);
          }
        } else {
          // Single check-in request
          const singleDate = String((item as any).work_date || (item as any).date || item.created_at || '').split(/[T ]/)[0] || getTodayDateString();
          setBulkMonth(singleDate.slice(0, 7));
          setSuggestedDays([{
            date: singleDate,
            status_label: 'Giải trình chấm công',
            check_in: String((item as any).check_in_time || (item as any).check_in || '08:00').slice(0, 5),
            check_out: String((item as any).check_out_time || (item as any).check_out || '17:30').slice(0, 5),
            session: (item as any).session || 'full_day',
            reason: item.description || '',
            selected: true
          }]);
          restoreApproversAndRelated(item);
        }
      } catch (e) {
        console.error('Error fetching bulk attendance for edit:', e);
      }
      finishHydration();
      return;
    }

    // 3. Advance Request (hrm/advances)
    if (item.type === 'advance') {
      const def = workflowList.find(w => w.id === 'advance_money') || matchingDef;
      setSelectedWorkflowDef(def);
      setFormType('advance');
      setExpenseTitle(item.title || def.name);
      setWorkflowTitleSuffix(extractTitleSuffix(item.title || '', def?.name));
      try {
        let found: any = null;
        try {
          const singleRes = await api.get(`/hrm/advances?id=${item.id}`);
          const listData = singleRes?.data?.data || singleRes?.data;
          found = Array.isArray(listData) ? listData.find((a: any) => Number(a.id) === Number(item.id)) : listData;
        } catch {
          const res = await fetchAPI('hrm/advances');
          found = res?.data?.find((a: any) => Number(a.id) === Number(item.id));
        }
        if (!found) found = item;
        if (found) {
          setPaymentDetails(String(found.amount || item.amount || ''));
          setCurrencyType(found.currency || 'VND');
          const r = String(found.reason || item.description || '');
          const bMatch = r.match(/\[Thông tin chuyển khoản\]:\s*([^\n]+)/i);
          if (bMatch) setPaymentDestination(bMatch[1].trim());
          if (found.advance_type) {
            setAdvanceType(found.advance_type);
          } else {
            const advTypeMatch = r.match(/Mục đích tạm ứng:\s*([^\n]+)/i);
            if (advTypeMatch) {
              const rawAdvType = advTypeMatch[1].trim().toLowerCase();
              if (rawAdvType.includes('công tác')) setAdvanceType('business_trip');
              else if (rawAdvType.includes('mua sắm')) setAdvanceType('procurement');
              else if (rawAdvType.includes('sự kiện') || rawAdvType.includes('tiếp khách')) setAdvanceType('event');
              else if (rawAdvType.includes('giảng viên') || rawAdvType.includes('đối tác')) setAdvanceType('lecturer');
              else if (rawAdvType.includes('lương')) setAdvanceType('salary');
              else setAdvanceType('other');
            }
          }
          if (found.settlement_date) {
            setAdvanceSettlementDate(String(found.settlement_date).split(/[T ]/)[0]);
          } else {
            const settleMatch = r.match(/Hạn hoàn ứng[^:]*:\s*([^\n]+)/i);
            if (settleMatch) setAdvanceSettlementDate(settleMatch[1].trim());
          }
          if (r.includes('[Lặp lại định kỳ:')) {
            setIsRecurring(true);
            if (r.includes('Hàng tuần')) setRecurringFrequency('weekly');
            else if (r.includes('Hàng quý')) setRecurringFrequency('quarterly');
            else if (r.includes('Hàng năm')) setRecurringFrequency('yearly');
            else setRecurringFrequency('monthly');
            const endRecMatch = r.match(/đến\s*([0-9\-/]+)/i);
            if (endRecMatch) setRecurringEndDate(endRecMatch[1].trim());
          }
          const cleanReason = cleanLeaveReasonText(
            r.replace(/\[Thông tin chuyển khoản[^\]]*\]:[^\n]*/gi, '')
             .replace(/\[Tài liệu đính kèm[^\]]*\]:[\s\S]*$/gi, '')
             .replace(/\[Đề nghị tạm ứng[^\]]*\]:[^\n]*(\n•[^\n]*)*\s*/gi, '')
             .replace(/\[Lặp lại định kỳ[^\]]*\]\s*/gi, '')
             .trim(),
            false
          );
          setLeaveReason(cleanReason);
          setWorkflowTitleSuffix(cleanReason);
          setExpenseTitle(getFullWorkflowTitle(def, cleanReason));
          parseMultiAttachmentsFromText(r, found.image_url);
          restoreApproversAndRelated(found);
        }
      } catch (e) {
        console.error('Error fetching advance for edit:', e);
      }
      finishHydration();
      return;
    }

    // 4. Expenses and Admin / Finance workflows
    if (item.type === 'expense') {
      try {
        const res = await api.get(`/expenses/${item.id}`);
        const expData = res.data?.data || res.data || item;
        const notes = String(expData?.notes || expData?.description || item.description || '');
        const lowerTitle = String(expData?.title || item.title || '').toLowerCase();

        // 4.1 Specialized: In, đóng dấu và gửi hồ sơ (print_stamp_send)
        if (lowerTitle.includes('in, đóng dấu') || notes.includes('In, đóng dấu và gửi hồ sơ')) {
          const def = workflowList.find(w => w.id === 'print_stamp_send') || matchingDef;
          setSelectedWorkflowDef(def);
          setFormType('general');
          setExpenseTitle(expData.title || def.name);
          setWorkflowTitleSuffix(extractTitleSuffix(expData.title || '', def?.name));

          const extractLine = (prefix: string) => {
            const m = notes.match(new RegExp(`${prefix}:\\s*([^\\n]+)`, 'i'));
            return m ? m[1].trim() : '';
          };

          const reqEmp = extractLine('Nhân viên yêu cầu');
          if (reqEmp) {
            const u = users.find(x => x.full_name?.toLowerCase() === reqEmp.toLowerCase() || x.name?.toLowerCase() === reqEmp.toLowerCase());
            if (u) setPssReqEmployeeId(String(u.id));
          }
          const reqDate = extractLine('Ngày yêu cầu');
          if (reqDate) setPssReqDate(reqDate);

          const exec = extractLine('Người thực hiện');
          if (exec) {
            const u = users.find(x => x.full_name?.toLowerCase() === exec.toLowerCase() || x.name?.toLowerCase() === exec.toLowerCase());
            if (u) setPssExecutorId(String(u.id));
          } else if (expData.approver_id) {
            setPssExecutorId(String(expData.approver_id));
          }

          const sendMethod = extractLine('Hình thức gửi');
          if (sendMethod) setPssSendMethod(sendMethod);

          const timeFrame = extractLine('Khung giờ gửi');
          if (timeFrame) setPssSendTimeFrame(timeFrame);

          const recName = extractLine('Tên người nhận');
          if (recName) setPssRecipientName(recName);

          const recAddr = extractLine('Địa chỉ người nhận');
          if (recAddr) setPssRecipientAddress(recAddr);

          const recPhone = extractLine('SĐT người nhận');
          if (recPhone) setPssRecipientPhone(recPhone);

          const sendDate = extractLine('Ngày cần gửi hồ sơ');
          if (sendDate) setPssRequiredSendDate(sendDate);

          parseMultiAttachmentsFromText(notes, expData.image_url);
          restoreApproversAndRelated(expData);

          finishHydration();
          return;
        }

        // 4.15 Specialized: Đề xuất tuyển dụng (recruitment)
        if (lowerTitle.includes('tuyển dụng') || notes.includes('[Đề xuất tuyển dụng]')) {
          const def = workflowList.find(w => w.id === 'recruitment') || matchingDef;
          setSelectedWorkflowDef(def);
          setFormType('recruitment');
          setExpenseTitle(expData.title || def.name);
          setWorkflowTitleSuffix(extractTitleSuffix(expData.title || '', def?.name));

          const extractBullet = (label: string) => {
            const m = notes.match(new RegExp(`•\\s*${label}:\\s*([^\\n]+)`, 'i'));
            return m ? m[1].trim() : '';
          };

          const rawJob = extractBullet('Vị trí cần tuyển') || extractBullet('Vị trí');
          if (rawJob) setRecruitmentJobTitle(rawJob);

          const rawQty = extractBullet('Số lượng cần tuyển') || extractBullet('Số lượng');
          if (rawQty) {
            const num = parseInt(rawQty);
            if (!isNaN(num)) setRecruitmentHeadcount(num);
          }

          const rawDept = extractBullet('Phòng ban / Bộ phận tiếp nhận') || extractBullet('Phòng ban');
          if (rawDept) setRecruitmentDepartment(rawDept);

          const rawType = extractBullet('Hình thức làm việc');
          if (rawType.includes('Bán thời gian') || rawType.includes('Part-time')) setRecruitmentJobType('part_time');
          else if (rawType.includes('Thực tập') || rawType.includes('Intern')) setRecruitmentJobType('intern');
          else if (rawType.includes('Thử việc')) setRecruitmentJobType('probation');
          else if (rawType.includes('Cộng tác') || rawType.includes('Thời vụ')) setRecruitmentJobType('contractor');
          else setRecruitmentJobType('full_time');

          const rawReason = extractBullet('Lý do tuyển dụng');
          if (rawReason.includes('thay thế') || rawReason.includes('Thay thế')) {
            setRecruitmentReason('replacement');
            const repMatch = rawReason.match(/Thay thế cho:\s*([^\)]+)/i);
            if (repMatch) setRecruitmentReplacementWho(repMatch[1].trim());
          } else if (rawReason.includes('dự án') || rawReason.includes('cao điểm')) {
            setRecruitmentReason('project');
          } else if (rawReason.includes('khác')) {
            setRecruitmentReason('other');
          } else {
            setRecruitmentReason('expansion');
          }

          const rawSalary = extractBullet('Mức lương dự kiến');
          if (rawSalary.includes('Thỏa thuận') || rawSalary.includes('thỏa thuận')) {
            setRecruitmentSalaryNegotiable(true);
          } else {
            setRecruitmentSalaryNegotiable(false);
            const salNumbers = rawSalary.match(/\d[\d.,]*/g);
            if (salNumbers && salNumbers.length >= 2) {
              setRecruitmentSalaryMin(salNumbers[0].replace(/\D/g, ''));
              setRecruitmentSalaryMax(salNumbers[1].replace(/\D/g, ''));
            } else if (salNumbers && salNumbers.length === 1) {
              setRecruitmentSalaryMin(salNumbers[0].replace(/\D/g, ''));
            }
          }

          const rawDate = extractBullet('Ngày dự kiến nhận việc');
          if (rawDate) setRecruitmentExpectedDate(rawDate);

          const extractMultilineBullet = (label: string) => {
            const m = notes.match(new RegExp(`•\\s*${label}:\\s*([\\s\\S]*?)(?=\\n\\s*•|\\n\\n\\[|$)`, 'i'));
            return m ? m[1].trim() : '';
          };

          const rawReq = extractMultilineBullet('Tiêu chuẩn / Yêu cầu ứng viên') || extractMultilineBullet('Yêu cầu ứng viên');
          if (rawReq) setRecruitmentRequirements(rawReq);

          const rawDesc = extractMultilineBullet('Mô tả công việc tóm tắt') || extractMultilineBullet('Mô tả công việc');
          if (rawDesc) setRecruitmentDescription(rawDesc);

          restoreApproversAndRelated(expData);
          if (expData.approver_id_2 || (item as any)?.approver_id_2) {
            const dirId = Number(expData.approver_id_2 || (item as any)?.approver_id_2);
            const dirUser = users.find(x => Number(x.id) === dirId);
            setCustomApprover3(dirUser || (expData.approver_name_2 ? { id: dirId, full_name: expData.approver_name_2, avatar_url: expData.approver_avatar_2 } : { id: dirId, full_name: `User #${dirId}` }));
            setShowStepDirector(true);
          } else {
            setShowStepDirector(false);
            setCustomApprover3(null);
          }
          setShowStepAccountant(false);
          setCustomApprover2(null);

          parseMultiAttachmentsFromText(notes, expData.image_url);

          finishHydration();
          return;
        }

        // 4.2 - 4.4 Specialized Expense Sub-workflows (hydrate specific fields then flow into 4.6 for common payment/bank/items/attachments)
        let specializedWfDef: any = null;

        // 4.2 Specialized: Đề xuất tiếp khách (client_meeting)
        if (lowerTitle.includes('tiếp khách') || notes.includes('[Thông tin tiếp khách]')) {
          specializedWfDef = workflowList.find(w => w.id === 'client_meeting') || matchingDef;

          const extractBullet = (label: string) => {
            const m = notes.match(new RegExp(`•\\s*${label}:\\s*([^\\n]+)`, 'i'));
            return m ? m[1].trim() : '';
          };

          const targetTypeStr = extractBullet('Phân loại đối tượng');
          if (targetTypeStr.includes('Doanh nghiệp')) setMeetingTargetType('company');
          else if (targetTypeStr.includes('Giảng viên')) setMeetingTargetType('lecturer');
          else if (targetTypeStr.includes('Khách hàng')) setMeetingTargetType('contact');
          else if (targetTypeStr.includes('Nhà nước')) setMeetingTargetType('gov');
          else if (targetTypeStr) setMeetingTargetType('other');

          const clientName = extractBullet('Đơn vị / Khách mời');
          if (clientName) setMeetingClientName(clientName);

          const repMatch = notes.match(/•\s*Người đại diện:\s*([^\n(]+)(?:\(SĐT:\s*([^\)]+)\))?/i);
          if (repMatch) {
            setMeetingContactPerson(repMatch[1].trim());
            if (repMatch[2]) setMeetingContactPhone(repMatch[2].trim());
          }

          const loc = extractBullet('Địa điểm');
          if (loc) setMeetingLocation(loc);

          const timeMatch = notes.match(/•\s*Thời gian:\s*([0-9\-\/]+)(?:\s*lúc\s*([0-9:]+))?/i);
          if (timeMatch) {
            setMeetingDate(timeMatch[1].trim());
            if (timeMatch[2]) setMeetingTime(timeMatch[2].trim());
          }

          const scaleMatch = notes.match(/Quy mô tham gia:\s*Khách mời\s*\((\d+)\s*người\)\s*-\s*Công ty\s*\((\d+)\s*người\)(?:\s*\(([^\)]+)\))?/i);
          if (scaleMatch) {
            setMeetingClientCount(scaleMatch[1]);
            setMeetingInternalCount(scaleMatch[2]);
            if (scaleMatch[3]) setMeetingInternalAttendees(scaleMatch[3].split(',').map(s => s.trim()).filter(Boolean));
          }
          const attendeesBullet = extractBullet('Cán bộ tham gia cùng');
          if (attendeesBullet) {
            const mappedIds = attendeesBullet.split(',').map(nameStr => {
              const clean = nameStr.trim().toLowerCase();
              const matched = users.find(u =>
                String(u.id) === clean ||
                String(u.full_name || '').toLowerCase().trim() === clean ||
                String(u.name || '').toLowerCase().trim() === clean
              );
              return matched ? String(matched.id) : nameStr.trim();
            }).filter(Boolean);
            if (mappedIds.length > 0) setMeetingInternalAttendees(mappedIds);
          }

          const purpose = extractBullet('Kế hoạch / Mục đích tiếp đón');
          if (purpose) setMeetingPurpose(purpose);

          const reimbStr = extractBullet('Phương thức thanh toán');
          if (reimbStr.includes('Hoàn ứng')) setMeetingReimbursementMethod('host_claim');
          else if (reimbStr.includes('trực tiếp')) setMeetingReimbursementMethod('direct_partner');
          else if (reimbStr.includes('tín dụng')) setMeetingReimbursementMethod('corporate_card');
          else if (reimbStr.includes('Tạm ứng')) setMeetingReimbursementMethod('cash_advance');

          const invStr = extractBullet('Loại chứng từ');
          if (invStr.includes('Bảng kê') || invStr.includes('bán lẻ')) setMeetingInvoiceType('retail');
          else if (invStr.includes('Biên lai') || invStr.includes('Hợp đồng')) setMeetingInvoiceType('receipt');
          else if (invStr.includes('Không có') || invStr.includes('Chưa có')) setMeetingInvoiceType('pending');
          else setMeetingInvoiceType('vat');
        }

        // 4.3 Specialized: Thanh toán theo đợt (phased_payment)
        if (notes.includes('[Kế hoạch thanh toán theo đợt') || notes.includes('[Thanh toán theo đợt]') || lowerTitle.includes('theo đợt')) {
          if (!specializedWfDef) {
            specializedWfDef = workflowList.find(w => w.id === 'phased_payment') || matchingDef;
          }
          setIsPhasedPayment(true);

          const instSection = notes.match(/\[Kế hoạch thanh toán theo đợt[^\]]*\]:([\s\S]*?)(?=\n\[|$)/i);
          const instSource = instSection ? instSection[1] : notes;
          const instMatches = [...instSource.matchAll(/•\s*([^:]+):\s*([0-9.,]+)[^(\n]*(?:\(Hạn:\s*([^\)]+)\))?/gi)];
          if (instMatches.length > 0) {
            const parsedInst = instMatches.map((m, idx) => ({
              id: Date.now() + idx,
              title: m[1].trim(),
              amount: parseMoneyVn(m[2], expData?.currency || 'VND'),
              dueDate: m[3] ? m[3].trim() : ''
            }));
            setInstallments(parsedInst);
          }
        }

        // 4.4 Specialized: Thanh toán định kỳ (recurring_payment)
        if (notes.includes('[Thiết lập định kỳ]:') || notes.includes('[Lặp lại định kỳ') || lowerTitle.includes('định kỳ')) {
          if (!specializedWfDef) {
            specializedWfDef = workflowList.find(w => w.id === 'recurring_payment') || matchingDef;
          }
          setIsRecurring(true);

          if (notes.includes('Hàng tuần')) setRecurringFrequency('weekly');
          else if (notes.includes('2 tuần')) setRecurringFrequency('biweekly');
          else if (notes.includes('Hàng quý')) setRecurringFrequency('quarterly');
          else if (notes.includes('nửa năm')) setRecurringFrequency('semiannually');
          else if (notes.includes('Hàng năm')) setRecurringFrequency('yearly');
          else setRecurringFrequency('monthly');

          const payDayMatch = notes.match(/Ngày\s*(\d{1,2})\s*hàng/i);
          if (payDayMatch) setRecurringPayDay(payDayMatch[1]);
          else if (notes.includes('cuối tháng')) setRecurringPayDay('last_day');

          const startMatch = notes.match(/(?:Thời hạn hiệu lực:\s*Từ|Áp dụng từ:)\s*([0-9\-/]+)/i);
          if (startMatch) setRecurringStartDate(startMatch[1].trim());

          const endMatch = notes.match(/đến\s*([0-9\-/]+)/i);
          if (endMatch) {
            setRecurringUnlimited(false);
            setRecurringEndDate(endMatch[1].trim());
          } else if (notes.includes('Vô thời hạn')) {
            setRecurringUnlimited(true);
          }

          const contractMatch = notes.match(/Căn cứ Hợp đồng[^:]*:\s*([^\n]+)/i);
          if (contractMatch) setRecurringContractNumber(contractMatch[1].trim());
        }

        // 4.5 Specialized: Văn phòng phẩm, Mua sắm trang thiết bị, Cấp thiết bị IT
        const isItemized = !specializedWfDef && (
          notes.includes('DANH SÁCH VĂN PHÒNG PHẨM') ||
          notes.includes('DANH SÁCH MUA SẮM') ||
          notes.includes('DANH SÁCH THIẾT BỊ') ||
          notes.includes('Đồ vật đề xuất:') ||
          lowerTitle.startsWith('đề xuất văn phòng phẩm') ||
          lowerTitle.startsWith('mua sắm trang thiết bị') ||
          lowerTitle.startsWith('đề xuất mua sắm') ||
          lowerTitle.startsWith('cấp thiết bị it') ||
          lowerTitle.startsWith('đề xuất trang thiết bị it')
        );

        if (isItemized) {
          let itemDef = workflowList.find(w => w.id === 'stationery') || matchingDef;
          if (lowerTitle.includes('it') || lowerTitle.includes('phần mềm') || notes.includes('THIẾT BỊ IT')) {
            itemDef = workflowList.find(w => w.id === 'it_request') || itemDef;
          } else if (lowerTitle.includes('mua sắm') || lowerTitle.includes('trang thiết bị') || notes.includes('MUA SẮM')) {
            itemDef = workflowList.find(w => w.id === 'purchase_request') || itemDef;
          }
          setSelectedWorkflowDef(itemDef);
          setFormType('general');
          setExpenseTitle(expData.title || itemDef.name);
          setWorkflowTitleSuffix(extractTitleSuffix(expData.title || '', itemDef?.name));
          setCurrencyType(expData.currency || 'VND');

          const lines = notes.split('\n');
          let parsedItems: any[] = [];
          for (const line of lines) {
            const lineTrim = line.trim();
            if (!lineTrim.startsWith('•') && !lineTrim.match(/^\[?\d+\]/)) continue;
            const mainMatch = lineTrim.match(/^[•\-*]?\s*\[?(\d+)\]?\s*([^\-\n]+?)\s*-\s*Số lượng:\s*(\d+(?:\.\d+)?)\s*([^\(\n]*)/i);
            if (mainMatch) {
              const name = mainMatch[2].trim();
              const quantity = Number(mainMatch[3].trim()) || 1;
              const unit = mainMatch[4].trim() || 'Cái';

              let price: any = '';
              let vat = 10;
              let vatType: any = '10';
              let itemNotes = '';

              const priceMatch = lineTrim.match(/Đơn giá:\s*([0-9.,]+)/i);
              if (priceMatch) {
                price = Number(priceMatch[1].replace(/\D/g, '')) || '';
              } else {
                const oldPriceMatch = lineTrim.match(/\(Giá:\s*([0-9.,]+)/i);
                if (oldPriceMatch) price = Number(oldPriceMatch[1].replace(/\D/g, '')) || '';
              }

              const kctMatch = lineTrim.match(/VAT:\s*Không chịu thuế/i);
              if (kctMatch) {
                vat = 0;
                vatType = 'kct';
              } else {
                const vatMatch = lineTrim.match(/VAT:\s*(\d+)%/i);
                if (vatMatch) {
                  vat = Number(vatMatch[1]) || 0;
                  vatType = [0, 5, 8, 10].includes(vat) ? String(vat) : 'custom';
                }
              }

              const noteMatch = lineTrim.match(/Ghi chú:\s*([^\)]+)/i);
              if (noteMatch) itemNotes = noteMatch[1].trim();

              parsedItems.push({
                id: Date.now() + Math.random(),
                name,
                quantity,
                unit,
                price,
                vat,
                vatType,
                notes: itemNotes
              });
            }
          }
          if (parsedItems.length > 0) {
            setStationeryItems(parsedItems);
          } else {
            setStationeryItems([{ id: Date.now(), name: '', quantity: 1, unit: 'Cái', notes: '', price: '', vat: 10, vatType: '10' }]);
          }

          const extractMetaField = (text: string, label: string) => {
            const reg = new RegExp(`(?:^|\\n)\\s*${label}:\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:Vị trí:|Phòng ban:|Nội dung đề xuất:|Lý do:|DANH SÁCH|\\[Tài liệu|\\[Lặp lại|\\[Thanh toán|\\[Thông tin|\\[Hồ sơ chi phí|Đối tượng:|Thụ hưởng|Hình thức:|Thời hạn thanh toán:|Chi tiết:))|$)`, 'i');
            const m = text.match(reg);
            return m ? m[1].trim() : '';
          };

          const pos = extractMetaField(notes, 'Vị trí');
          const dept = extractMetaField(notes, 'Phòng ban');
          const content = extractMetaField(notes, 'Nội dung đề xuất');
          const reason = extractMetaField(notes, 'Lý do');

          if (pos) setJobPosition(pos);
          if (dept) setDepartmentName(dept);
          let itemsMeta: any = null;
          try {
            if (typeof expData.items === 'string') itemsMeta = JSON.parse(expData.items);
            else if (typeof expData.items === 'object') itemsMeta = expData.items;
          } catch (e) {}
          const effectiveContent = itemsMeta?.payment_details || itemsMeta?.content || content;
          if (effectiveContent) setPaymentDetails(effectiveContent);
          if (reason) setLeaveReason(reason);

          if (expData.vendor_name) setPaymentBeneficiaryName(expData.vendor_name);
          if (expData.bank_name) setPaymentBankName(expData.bank_name);
          if (expData.bank_account_number) setPaymentBankAccount(expData.bank_account_number);
          if (expData.bank_account_name) setPaymentAccountName(expData.bank_account_name);
          if (expData.bank_branch) setPaymentBankBranch(expData.bank_branch);

          parseMultiAttachmentsFromText(notes, expData.image_url);
          restoreApproversAndRelated(expData);

          finishHydration();
          return;
        }

        // 4.6 Standard Finance, PO, Expense Claim, Payment Proposals (and common hydration for 4.2-4.4):
        let def = specializedWfDef || (matchingDef?.id && matchingDef.id !== 'general' 
          ? matchingDef 
          : workflowList.find(w => w.id === 'payment') || workflowList[0]);

        if (!specializedWfDef) {
          if (lowerTitle.includes('hoa hồng') || notes.includes('DANH SÁCH CHI HOA HỒNG') || notes.includes('[Đề xuất chi trả hoa hồng') || expData.category === 'commission') {
            def = workflowList.find(w => w.id === 'commission_payout') || def;
          } else if (lowerTitle.includes('tạm ứng') || notes.includes('[Đề nghị tạm ứng]')) {
            def = workflowList.find(w => w.id === 'advance_money') || def;
          } else if (lowerTitle.includes('hoàn ứng') || notes.includes('hoàn ứng')) {
            def = workflowList.find(w => w.id === 'expense_claim') || def;
          } else if (lowerTitle.includes('định kỳ') || notes.includes('định kỳ')) {
            def = workflowList.find(w => w.id === 'recurring_payment') || def;
          } else if (lowerTitle.includes('theo đợt') || notes.includes('theo đợt')) {
            def = workflowList.find(w => w.id === 'phased_payment') || def;
          }
        }

        setSelectedWorkflowDef(def);
        setFormType('expense');
        setEditingItemId(isDuplicate ? null : item.id);
        setEditingItemType(isDuplicate ? null : 'expense');
        setCurrencyType(expData.currency || 'VND');
        setExpenseCategory(expData.category || 'general');

        const fullTitle = expData.title || item.title || def.name;
        setExpenseTitle(fullTitle);

        let cleanSuffix = extractTitleSuffix(fullTitle, def.name);
        if (!cleanSuffix) {
          const detailMatch = notes.match(/Chi tiết:\s*([^\n]+)/i);
          if (detailMatch) cleanSuffix = detailMatch[1].trim();
        }
        setWorkflowTitleSuffix(cleanSuffix);

        const extractField = (label: string) => {
          const m = notes.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));
          return m ? m[1].trim() : '';
        };

        // 1. Department
        const dept = extractField('Phòng ban');
        if (dept) setDepartmentName(dept);

        // 2. Target / Đối tượng
        const targetStr = extractField('Đối tượng');
        if (targetStr) {
          if (targetStr.includes('Nội bộ')) setPaymentTarget('Nội bộ');
          else if (targetStr.includes('Đối tác')) setPaymentTarget('Đối tác');
          else if (targetStr.includes('Giảng viên')) setPaymentTarget('Giảng viên');
          else if (targetStr.includes('Khách hàng')) setPaymentTarget('Khách hàng');
          else if (targetStr.includes('Cộng tác viên')) setPaymentTarget('Cộng tác viên');
          else if (targetStr.includes('Nhà nước')) setPaymentTarget('Cơ quan Nhà nước');
          else setPaymentTarget(targetStr);
        } else {
          setPaymentTarget(expData.vendor_name ? 'Đối tác' : 'Nội bộ');
        }

        // 3. Beneficiary name & employee / entity matching
        const benRaw = extractField('Thụ hưởng[^:]*');
        const benName = benRaw
          ? benRaw.replace(/\(MST:[^\)]+\)/i, '').replace(/\(SĐT:[^\)]+\)/i, '').trim()
          : (expData.vendor_name || '');
        if (benName) setPaymentBeneficiaryName(benName);

        const mstMatch = notes.match(/MST:\s*([0-9A-Za-z\-]+)/i);
        if (mstMatch) setPaymentTaxCode(mstMatch[1].trim());

        const phoneMatch = notes.match(/SĐT:\s*([0-9+\-\s]+)/i);
        if (phoneMatch) setPaymentPhone(phoneMatch[1].trim());

        const govAgencyMatch = notes.match(/Cơ quan thu:\s*([^\n(]+)(?:\(Số QĐ\/TB:\s*([^\)]+)\))?/i);
        if (govAgencyMatch) {
          const rawGov = govAgencyMatch[1].trim().toLowerCase();
          if (rawGov.includes('thuế')) setPaymentGovAgencyType('tax');
          else if (rawGov.includes('bảo hiểm')) setPaymentGovAgencyType('social_insurance');
          else if (rawGov.includes('kho bạc')) setPaymentGovAgencyType('treasury');
          else setPaymentGovAgencyType('other');
          if (govAgencyMatch[2]) setPaymentGovDecisionNumber(govAgencyMatch[2].trim());
        }

        const matchedEmp = users.find(u => 
          (u.full_name && benName && u.full_name.toLowerCase() === benName.toLowerCase()) ||
          (u.name && benName && u.name.toLowerCase() === benName.toLowerCase())
        );
        if (matchedEmp) {
          setPaymentEmployeeId(String(matchedEmp.id));
        }
        if (expData.supplier_id) setPaymentSupplierId(String(expData.supplier_id));
        if (expData.lecturer_id) setPaymentLecturerId(String(expData.lecturer_id));
        if (expData.contact_id) setPaymentContactId(String(expData.contact_id));

        // 4. Method & Banking / Wallet / Card
        const methodStr = extractField('Hình thức');
        if (methodStr) {
          if (methodStr.includes('Chuyển khoản')) setPaymentMethod('Chuyển khoản');
          else if (methodStr.includes('Tiền mặt')) setPaymentMethod('Tiền mặt');
          else if (methodStr.includes('Ví điện tử')) setPaymentMethod('Ví điện tử');
          else if (methodStr.includes('Thẻ tín dụng')) setPaymentMethod('Thẻ tín dụng');
        } else {
          setPaymentMethod('Chuyển khoản');
        }

        const bankRegex = /\[Thông tin chuyển khoản\]:\s*([^\-]+)\s*-\s*STK:\s*([^\-]+)\s*-\s*Chủ TK:\s*([^\n-]+)(?:\s*-\s*Chi nhánh:\s*([^\n]+))?/i;
        const bankMatch = notes.match(bankRegex);
        if (bankMatch) {
          setPaymentBankName(bankMatch[1].trim());
          setPaymentBankAccount(bankMatch[2].trim());
          setPaymentAccountName(bankMatch[3].trim());
          if (bankMatch[4]) setPaymentBankBranch(bankMatch[4].trim());
        } else {
          if (expData.bank_name) setPaymentBankName(expData.bank_name);
          if (expData.bank_account_number) setPaymentBankAccount(expData.bank_account_number);
          if (expData.bank_account_name) setPaymentAccountName(expData.bank_account_name);
          if (expData.bank_branch) setPaymentBankBranch(expData.bank_branch);
        }

        const walletMatch = notes.match(/(?:\[Hình thức\]:\s*Ví điện tử|\[Ví điện tử\]:)\s*([^\-]+?)\s*-\s*(?:SĐT ví|SĐT\/TK):\s*([^\-\n]+?)(?:\s*-\s*Chủ ví:\s*([^\n]+))?(?=\n|$)/i);
        if (walletMatch) {
          const rawWal = walletMatch[1].trim().toLowerCase();
          if (rawWal.includes('zalo')) setPaymentWalletType('zalopay');
          else if (rawWal.includes('viettel')) setPaymentWalletType('viettel_money');
          else setPaymentWalletType('momo');
          setPaymentWalletPhone(walletMatch[2].trim());
          if (walletMatch[3]) setPaymentAccountName(walletMatch[3].trim());
        }

        const cardMatch = notes.match(/(?:\[Hình thức\]:\s*Thẻ tín dụng doanh nghiệp\s*\(4 số cuối:\s*([^)]+)\)|\[Thẻ doanh nghiệp\]:\s*([^\n]+))/i);
        if (cardMatch) {
          const matchedCard = (cardMatch[1] || cardMatch[2] || '').trim();
          if (matchedCard && matchedCard !== 'N/A') setPaymentCorporateCard(matchedCard);
        }

        // 5. Payment details (Chi tiết)
        const multilineDetailsMatch = notes.match(/(?:^|\n)\s*Chi tiết:\s*([\s\S]*?)(?=(?:\n\s*(?:\[Tài liệu|\[Lặp lại|\[Thanh toán|\[Thông tin|\[Hồ sơ chi phí|Phòng ban:|Đối tượng:|Thụ hưởng|Hình thức:|Thời hạn thanh toán:))|$)/i);
        const details = multilineDetailsMatch ? multilineDetailsMatch[1].trim() : extractField('Chi tiết');
        if (details) {
          setPaymentDetails(details);
        } else {
          const cleanDesc = notes
            .replace(/\[Hồ sơ chi phí[^\]]*\]:[^\n]*/gi, '')
            .replace(/Phòng ban:[^\n]*/gi, '')
            .replace(/Đối tượng:[^\n]*/gi, '')
            .replace(/Thụ hưởng[^\n]*/gi, '')
            .replace(/Hình thức:[^\n]*/gi, '')
            .replace(/\[Thông tin chuyển khoản[^\]]*\]:[^\n]*/gi, '')
            .replace(/\[Tài liệu đính kèm[^\]]*\]:[\s\S]*$/gi, '')
            .trim();
          setPaymentDetails(cleanDesc || cleanSuffix || fullTitle);
        }

        // 6. Expense Category & Invoice Type
        const rawAmt = Number(expData.amount) || 0;
        const rawVatAmt = Number(expData.vat_amount) || 0;
        const calcVatPct = (rawAmt > rawVatAmt && rawVatAmt > 0) ? Math.round((rawVatAmt / (rawAmt - rawVatAmt)) * 100) : 0;

        if (notes.includes('Hóa đơn điện tử VAT 8%') || calcVatPct === 8) setInvoiceType('vat_8');
        else if (notes.includes('Hóa đơn điện tử VAT 5%') || calcVatPct === 5) setInvoiceType('vat_5');
        else if (notes.includes('Hóa đơn điện tử VAT 0%') || notes.includes('Không chịu thuế')) setInvoiceType('vat_0');
        else if (notes.includes('Hóa đơn bán lẻ')) setInvoiceType('retail');
        else if (notes.includes('Không có hóa đơn')) setInvoiceType('none');
        else setInvoiceType('vat_10');

        if (expData.due_date) {
          setPaymentDueDate(String(expData.due_date).split(/[T ]/)[0]);
        } else {
          const dueMatch = notes.match(/Thời hạn thanh toán:\s*([0-9\/\-]+)/i);
          if (dueMatch) setPaymentDueDate(dueMatch[1].trim());
          else setPaymentDueDate('');
        }

        // 7. BẢNG CHI TIẾT THANH TOÁN (expenseItems)
        const parsedItemsFromNotes = parseExpenseLineItems(notes, expData.items);
        if (Array.isArray(parsedItemsFromNotes) && parsedItemsFromNotes.length > 0) {
          setExpenseItems(parsedItemsFromNotes.map((it: any, i: number) => ({
            id: it.id || Date.now() + i,
            content: it.content || it.name || cleanSuffix || 'Nội dung chi tiêu',
            quantity: Number(it.quantity) || 1,
            price: parseMoneyVn(it.unit_price !== undefined ? it.unit_price : it.price, expData.currency || 'VND'),
            vat: it.vat !== undefined ? Number(it.vat) : 10,
            vatType: it.vat === 0 ? '0' : [5, 8, 10].includes(Number(it.vat)) ? String(it.vat) : '10'
          })));
        } else {
          const isVnd = (expData.currency || 'VND') === 'VND';
          const amt = isVnd ? Math.round(Number(expData.amount) || 0) : (Number(expData.amount) || 0);
          const vatAmt = isVnd ? Math.round(Number(expData.vat_amount) || 0) : (Number(expData.vat_amount) || 0);
          let vatPct = 10;
          let netPrice = amt;
          if (vatAmt > 0 && amt > 0) {
            netPrice = isVnd ? Math.round(amt - vatAmt) : (amt - vatAmt);
            const calcPct = Math.round((vatAmt / netPrice) * 100);
            vatPct = [0, 5, 8, 10].includes(calcPct) ? calcPct : Math.round((vatAmt / amt) * 100);
            if (![0, 5, 8, 10].includes(vatPct)) vatPct = 8;
          } else if (vatAmt === 0) {
            vatPct = 0;
          }
          const itemContent = cleanSuffix || details || fullTitle || 'Nội dung chi tiêu';
          setExpenseItems([
            {
              id: Date.now(),
              content: itemContent,
              quantity: 1,
              price: Math.round(netPrice > 0 ? netPrice : amt),
              vat: vatPct,
              vatType: String(vatPct) as any
            }
          ]);
        }

        // 7.1 Commission Payout items restoration
        if (def?.id === 'commission_payout' && Array.isArray(expData.items) && expData.items.length > 0) {
          setCommissionItems(expData.items.map((it: any, i: number) => ({
            id: it.id || Date.now() + i,
            recipient_type: it.recipient_type || (it.user_id ? 'employee' : 'other'),
            user_id: it.user_id ? String(it.user_id) : '',
            user_name: it.user_name || '',
            avatar: it.avatar || '',
            role: it.role || '',
            company_id: it.company_id ? String(it.company_id) : '',
            supplier_id: it.supplier_id ? String(it.supplier_id) : '',
            contact_id: it.contact_id ? String(it.contact_id) : '',
            other_id: it.other_id || '',
            other_type: it.other_type || '',
            po_number: it.po_number || '',
            po_id: it.po_id ? String(it.po_id) : '',
            bank_name: it.bank_name || '',
            bank_account: it.bank_account || it.bank_account_no || '',
            bank_owner: it.bank_owner || it.bank_account_name || '',
            amount: Number(it.amount || it.price || 0),
            note: it.note || '',
            is_paid: isDuplicate ? false : it.is_paid,
            unc_file_url: isDuplicate ? undefined : it.unc_file_url,
            paid_at: isDuplicate ? undefined : it.paid_at,
            paid_by: isDuplicate ? undefined : it.paid_by
          })));
        }

        // 8. Approvers & Related users
        restoreApproversAndRelated(expData);

        // 9. Attachments
        parseMultiAttachmentsFromText(notes, expData.image_url);

        finishHydration();
        return;
      } catch (e) {
        console.error('Error fetching expense for edit:', e);
      }
    }

    // Default Fallback
    setSelectedWorkflowDef(matchingDef);
    setFormType('general');
    setExpenseTitle(item.title);
    setWorkflowTitleSuffix(extractTitleSuffix(item.title || '', matchingDef?.name));
    setPaymentDetails(item.description || '');
    restoreApproversAndRelated(item);
    finishHydration();
  };

  const handleDuplicate = async (item: ApprovalItem) => {
    await handleEditRequest(item, true);
    toast.success(t('Đã nhân bản đầy đủ thông tin đề xuất! Vui lòng kiểm tra và gửi.'));
  };

  const formatBadge = (status: string, it?: any) => {
    const s = status ? status.toLowerCase() : 'pending';
    const isPaid = it ? (Boolean(it.is_refunded) || s === 'paid' || s === 'refunded') : false;
    const isMonetary = (it?.type === 'expense' || it?.type === 'po' || it?.type === 'purchase_order' || it?.type === 'advance') &&
      Number(it?.amount || 0) > 0 &&
      !String(it?.title || '').toLowerCase().includes('tuyển dụng');

    if (s === 'draft') {
      return (
        <span className="badge" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px', background: 'rgba(148, 163, 184, 0.16)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
          <Bookmark size={10} /> {t('Bản nháp')}
        </span>
      );
    }
    if (s === 'approved' || s === 'confirmed') {
      if (isMonetary) {
        if (!isPaid) {
          return (
            <span className="badge warning" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px', color: '#d97706', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.25)' }}>
              <Clock size={10} /> {t('Đã duyệt đủ cấp - Chưa hạch toán')}
            </span>
          );
        }
        return (
          <span className="badge success" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px' }}>
            <CheckCircle2 size={10} /> {t('Đã hoàn tất')}
          </span>
        );
      }
      return (
        <span className="badge success" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px' }}>
          <CheckCircle2 size={10} /> {t('Đã duyệt')}
        </span>
      );
    }
    if (s === 'level1_approved') {
      return (
        <span className="badge warning" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px' }}>
          <Clock size={10} /> {t('Chờ duyệt Cấp 2')}
        </span>
      );
    }
    if (s === 'rejected' || s === 'failed') {
      return (
        <span className="badge danger" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px' }}>
          <XCircle size={10} /> {t('Từ chối')}
        </span>
      );
    }
    return (
      <span className="badge warning" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px' }}>
        <Clock size={10} /> {t('Chờ duyệt')}
      </span>
    );
  };

  const getTypeIcon = (type: string, itemTitle?: string) => {
    if (type === 'recruitment' || (itemTitle && itemTitle.toLowerCase().includes('tuyển dụng'))) {
      return <UserPlus size={16} style={{ color: '#0f766e' }} />;
    }
    switch (type) {
      case 'leave': return <Calendar size={16} style={{ color: '#ef4444' }} />;
      case 'advance': return <DollarSign size={16} style={{ color: '#3b82f6' }} />;
      case 'expense': return <Receipt size={16} style={{ color: '#06b6d4' }} />;
      case 'checkin': return <Clock size={16} style={{ color: '#eab308' }} />;
      case 'attendance_bulk': return <CheckSquare size={16} style={{ color: '#2563eb' }} />;
      default: return <Clipboard size={16} style={{ color: 'var(--color-primary)' }} />;
    }
  };

  const isGenericApproverLabel = useCallback((name?: string | null) => {
    if (!name) return true;
    const clean = String(name).toLowerCase().trim();
    if (!clean) return true;
    return [
      'quản lý trực tiếp',
      'ban giám đốc',
      'duyệt',
      'người duyệt',
      'chờ phân công',
      'cấp 1',
      'cấp 2',
      'cấp 3',
      'thực hiện',
      'người duyệt cấp 1',
      'người duyệt cấp 2',
      'người duyệt cấp 3'
    ].includes(clean);
  }, []);

  const findApproverUserInMaps = useCallback((id?: number | string | null, name?: string | null) => {
    const numId = Number(id || 0);
    if (numId > 0) {
      const byId = usersMap.get(numId);
      if (byId) return byId;
    }
    if (name && !isGenericApproverLabel(name)) {
      const cleanName = String(name).toLowerCase().trim();
      const byExact = usersByNameMap.get(cleanName);
      if (byExact) return byExact;
      const byFuzzy = Array.from(usersMap.values()).find(u => {
        const ufn = String(u.full_name || u.name || '').toLowerCase().trim();
        return ufn && (ufn === cleanName || cleanName.includes(ufn) || ufn.includes(cleanName));
      });
      if (byFuzzy) return byFuzzy;
    }
    return null;
  }, [usersMap, usersByNameMap, isGenericApproverLabel]);

  const resolveFallbackApproverForItem = useCallback((item: ApprovalItem) => {
    const rawNotes = String((item as any).notes || (item as any).description || item.description || '');
    const isPrintStampSend = item.type === 'expense' && rawNotes.includes('Quy trình: In, đóng dấu và gửi hồ sơ');

    if (isPrintStampSend) {
      const mExec = rawNotes.match(/Người thực hiện:\s*([^\n]+)/i);
      const parsedExecName = mExec ? mExec[1].trim() : '';
      const matchedExec = findApproverUserInMaps(0, parsedExecName);
      if (matchedExec) return matchedExec;
      const hrExec = resolveHrRepresentativeUser(Array.from(usersMap.values()), teams);
      if (hrExec) return hrExec;
    }

    // 1. Check explicit step 1 / approver / manager / approved_by fields
    const explicitUser =
      findApproverUserInMaps((item as any).approver_id, (item as any).approver_name) ||
      findApproverUserInMaps((item as any).manager_id, (item as any).manager_name) ||
      findApproverUserInMaps((item as any).approved_by, (item as any).approved_by_name) ||
      findApproverUserInMaps((item as any).hr_id, null);
    if (explicitUser) return explicitUser;

    // 2. Check creator's direct team leader / manager
    const creatorId = Number(item.user_id || item.created_by || 0);
    const creator = creatorId > 0 ? usersMap.get(creatorId) : null;
    if (creator?.manager_id && Number(creator.manager_id) !== creatorId) {
      const mgrById = usersMap.get(Number(creator.manager_id));
      if (mgrById) return mgrById;
    }
    if (creator?.team_id) {
      const directMgr = Array.from(usersMap.values()).find(u =>
        Number(u.team_id) === Number(creator.team_id) &&
        ['manager', 'leader', 'truongphong', 'head_of_department', 'sale_director', 'director'].includes(String(u.role || '').toLowerCase()) &&
        Number(u.id) !== creatorId
      );
      if (directMgr) return directMgr;
    }

    // 3. Domain-specific fallback (HR / Check-in / Leave / Stationery vs Director / General Director)
    const hrFallbackUser = resolveHrRepresentativeUser(Array.from(usersMap.values()), teams);

    const directorUser =
      Array.from(usersMap.values()).find(u =>
        ['director', 'general_director'].includes(String(u.role || '').toLowerCase()) &&
        Number(u.id) !== creatorId
      ) ||
      Array.from(usersMap.values()).find(u =>
        ['director', 'general_director', 'admin', 'superadmin', 'super_admin'].includes(String(u.role || '').toLowerCase()) &&
        Number(u.id) !== creatorId
      ) ||
      Array.from(usersMap.values()).find(u =>
        ['director', 'general_director', 'admin', 'superadmin', 'super_admin', 'manager'].includes(String(u.role || '').toLowerCase())
      );

    const lowerTitle = String(item.title || '').toLowerCase();
    const isHrOrStationery =
      item.type === 'checkin' ||
      item.type === 'attendance_bulk' ||
      item.type === 'leave' ||
      lowerTitle.includes('văn phòng phẩm');

    if (isHrOrStationery) {
      if (hrFallbackUser && Number(hrFallbackUser.id) !== creatorId) return hrFallbackUser;
      return directorUser || hrFallbackUser || creator || null;
    }

    return directorUser || hrFallbackUser || creator || null;
  }, [usersMap, usersByNameMap, findApproverUserInMaps]);

  const renderCurrentApprover = useCallback((item: ApprovalItem) => {
    let approverUser: any = null;
    let stepLabel = '';
    let badgeClass = 'badge warning';
    let icon = <Clock size={10} />;

    const overallStatus = (item.status || 'pending').toLowerCase();
    const status1 = String((item as any).status_level_1 || (overallStatus === 'level1_approved' ? 'approved' : 'pending')).toLowerCase();
    const status2 = String((item as any).status_level_2 || 'none').toLowerCase();
    const status3 = String((item as any).status_level_3 || 'none').toLowerCase();

    // 00. If draft:
    if (overallStatus === 'draft') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="badge" style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(148, 163, 184, 0.12)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Bookmark size={10} />
            <span>{t('Chưa gửi duyệt')}</span>
          </span>
        </div>
      );
    }

    // 0. If overall status is rejected:
    if (overallStatus === 'rejected') {
      const rejectorNameRaw = (item as any).rejected_by_name || (item as any).approved_by_name || (item as any).approver_name || (item as any).manager_name;
      const rejectorIdRaw = (item as any).rejected_by || (item as any).approved_by || (item as any).approver_id || (item as any).manager_id;
      const userObj = findApproverUserInMaps(rejectorIdRaw, rejectorNameRaw) || resolveFallbackApproverForItem(item);
      const cleanRejectorName = !isGenericApproverLabel(rejectorNameRaw) ? rejectorNameRaw : '';
      const displayName = userObj?.full_name || userObj?.name || cleanRejectorName || t('Người duyệt');
      const avatarUrl = userObj?.avatar_url || userObj?.avatar || (item as any).approved_by_avatar || (item as any).approver_avatar;
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={getAvatarRingStyle('#ef4444')}>
            <Avatar src={avatarUrl} name={displayName} size={24} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {displayName}
            </span>
            <span className="badge danger" style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px', marginTop: '2px', width: 'fit-content' }}>
              <XCircle size={10} />
              <span>{t('Đã từ chối')}</span>
            </span>
          </div>
        </div>
      );
    }

    const hasLevel2 = Boolean((item as any).approver_id_2 || ((item as any).approver_name_2 && String((item as any).approver_name_2).trim() !== ''));
    const hasLevel3 = Boolean((item as any).approver_id_3 || ((item as any).approver_name_3 && String((item as any).approver_name_3).trim() !== ''));

    const isFullyApproved = overallStatus === 'approved' || overallStatus === 'confirmed' ||
      (status1 === 'approved' && (!hasLevel2 || status2 === 'approved') && (!hasLevel3 || status3 === 'approved'));

    // 1. If overall status is approved or all reached levels are approved:
    if (isFullyApproved) {
      let finalUser: any = null;
      let finalApproverId = 0;
      if (Number((item as any).approved_by) > 0) {
        finalApproverId = Number((item as any).approved_by);
      } else if (Number((item as any).approver_id_3) > 0) {
        finalApproverId = Number((item as any).approver_id_3);
      } else if (Number((item as any).approver_id_2) > 0) {
        finalApproverId = Number((item as any).approver_id_2);
      } else if (Number((item as any).hr_id) > 0) {
        finalApproverId = Number((item as any).hr_id);
      } else if (Number((item as any).approver_id) > 0) {
        finalApproverId = Number((item as any).approver_id);
      } else if (Number((item as any).manager_id) > 0) {
        finalApproverId = Number((item as any).manager_id);
      }

      let finalApproverName = '';
      if ((item as any).approved_by_name && !isGenericApproverLabel((item as any).approved_by_name)) {
        finalApproverName = (item as any).approved_by_name;
      } else if ((item as any).approver_name_3 && !isGenericApproverLabel((item as any).approver_name_3)) {
        finalApproverName = (item as any).approver_name_3;
      } else if ((item as any).approver_name_2 && !isGenericApproverLabel((item as any).approver_name_2)) {
        finalApproverName = (item as any).approver_name_2;
      } else if ((item as any).approver_name && !isGenericApproverLabel((item as any).approver_name)) {
        finalApproverName = (item as any).approver_name;
      } else if ((item as any).manager_name && !isGenericApproverLabel((item as any).manager_name)) {
        finalApproverName = (item as any).manager_name;
      }

      finalUser = findApproverUserInMaps(finalApproverId, finalApproverName) || resolveFallbackApproverForItem(item);

      const displayName = finalUser?.full_name || finalUser?.name || finalApproverName || t('Ban Giám đốc');
      const avatarUrl = finalUser?.avatar_url || finalUser?.avatar || (item as any).approved_by_avatar || (item as any).approver_avatar;

      const isPaid = Boolean((item as any).is_refunded) || item.status === 'paid' || item.status === 'refunded';
      const isMonetary = (item.type === 'expense' || item.type === 'po' || item.type === 'purchase_order' || item.type === 'advance') &&
        Number(item.amount || 0) > 0 &&
        !String(item.title || '').toLowerCase().includes('tuyển dụng');
      
      let badgeRingColor = '#10b981';
      let badgeClass = 'badge success';
      let badgeLabel = t('Đã duyệt đủ cấp');
      let badgeIcon = <CheckCircle2 size={10} />;
      let badgeCustomStyle: React.CSSProperties = {};

      if (isMonetary) {
        if (isPaid) {
          badgeLabel = t('Đã hoàn tất');
        } else {
          badgeRingColor = '#f59e0b';
          badgeClass = 'badge warning';
          badgeLabel = t('Đã duyệt đủ cấp - Chưa hạch toán');
          badgeIcon = <Clock size={10} />;
          badgeCustomStyle = {
            color: '#d97706',
            background: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.25)'
          };
        }
      }

      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={getAvatarRingStyle(badgeRingColor)}>
            <Avatar src={avatarUrl} name={displayName} size={24} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
              {displayName}
            </span>
            <span className={badgeClass} style={{ 
              fontSize: '0.65rem', 
              padding: '2px 6px', 
              display: 'inline-flex', 
              alignItems: 'center', 
              gap: '3px', 
              height: 'auto', 
              borderRadius: '6px', 
              marginTop: '2px', 
              width: 'fit-content',
              ...badgeCustomStyle
            }}>
              {badgeIcon}
              <span>{badgeLabel}</span>
            </span>
          </div>
        </div>
      );
    }

    // 2. Identify current pending level
    let targetApproverId = 0;
    let targetApproverName = '';

    const rawNotesForApprover = String((item as any).notes || (item as any).description || item.description || '');
    const isPrintStampSendRow = item.type === 'expense' && rawNotesForApprover.includes('Quy trình: In, đóng dấu và gửi hồ sơ');

    if (status1 === 'approved' && hasLevel2 && !isPrintStampSendRow && status2 !== 'approved' && status2 !== 'rejected') {
      targetApproverId = Number((item as any).approver_id_2 || 0);
      targetApproverName = !isGenericApproverLabel((item as any).approver_name_2) ? ((item as any).approver_name_2 || '') : '';
      stepLabel = t('Chờ duyệt Cấp 2');
      badgeClass = 'badge warning';
      icon = <Clock size={10} />;
    } else if (status1 === 'approved' && (!hasLevel2 || status2 === 'approved') && hasLevel3 && !isPrintStampSendRow && status3 !== 'approved' && status3 !== 'rejected') {
      targetApproverId = Number((item as any).approver_id_3 || 0);
      targetApproverName = !isGenericApproverLabel((item as any).approver_name_3) ? ((item as any).approver_name_3 || '') : '';
      stepLabel = t('Chờ duyệt Cấp 3');
      badgeClass = 'badge warning';
      icon = <Clock size={10} />;
    } else if (status1 === 'pending' || overallStatus === 'pending') {
      targetApproverId = Number((item as any).approver_id || (item as any).manager_id || 0);
      const rawName1 = (item as any).approver_name || (item as any).manager_name || '';
      targetApproverName = !isGenericApproverLabel(rawName1) ? rawName1 : '';
      stepLabel = isPrintStampSendRow ? t('Chờ xác nhận') : (hasLevel2 ? t('Chờ duyệt Cấp 1') : t('Chờ duyệt'));
      badgeClass = 'badge warning';
      icon = <Clock size={10} />;
    } else {
      targetApproverId = Number((item as any).approver_id || (item as any).manager_id || 0);
      const rawName1 = (item as any).approver_name || (item as any).manager_name || '';
      targetApproverName = !isGenericApproverLabel(rawName1) ? rawName1 : '';
      stepLabel = isPrintStampSendRow ? t('Chờ xác nhận') : t('Chờ duyệt');
      badgeClass = 'badge warning';
      icon = <Clock size={10} />;
    }

    if (isPrintStampSendRow) {
      approverUser = resolveFallbackApproverForItem(item);
      if (approverUser) {
        targetApproverId = Number(approverUser.id);
        targetApproverName = approverUser.full_name || approverUser.name;
      }
    } else {
      approverUser = findApproverUserInMaps(targetApproverId, targetApproverName);
    }

    if (!approverUser) {
      approverUser = resolveFallbackApproverForItem(item);
    }

    const displayName = approverUser?.full_name || approverUser?.name || targetApproverName || t('Chờ phân công');
    const avatarUrl = approverUser?.avatar_url || approverUser?.avatar || (item as any).approver_avatar;

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={getAvatarRingStyle('#f59e0b')}>
          <Avatar src={avatarUrl} name={displayName} size={24} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
            {displayName}
          </span>
          {stepLabel && (
            <span className={badgeClass} style={{ fontSize: '0.65rem', padding: '2px 6px', display: 'inline-flex', alignItems: 'center', gap: '3px', height: 'auto', borderRadius: '6px', marginTop: '2px', width: 'fit-content' }}>
              {icon}
              <span>{stepLabel}</span>
            </span>
          )}
        </div>
      </div>
    );
  }, [usersMap, usersByNameMap, findApproverUserInMaps, resolveFallbackApproverForItem, isGenericApproverLabel, t]);

  const renderWorkflowStepsAndWatchers = useCallback((item: ApprovalItem) => {
    interface StepInfo {
      stepIndex: number;
      title: string;
      userId?: number;
      userName?: string;
      status: 'approved' | 'rejected' | 'pending' | 'waiting';
    }

    const steps: StepInfo[] = [];
    const overall = (item.status || 'pending').toLowerCase();
    const isDraft = overall === 'draft' || Boolean(item.is_draft);
    const s1 = String((item as any).status_level_1 || (overall === 'level1_approved' || overall === 'approved' ? 'approved' : overall === 'rejected' ? 'rejected' : 'pending')).toLowerCase();
    const s2 = String((item as any).status_level_2 || 'none').toLowerCase();
    const s3 = String((item as any).status_level_3 || 'none').toLowerCase();

    const rawRowNotes = String((item as any).notes || (item as any).description || item.description || '');
    const isPrintStampSendItem = item.type === 'expense' && rawRowNotes.includes('Quy trình: In, đóng dấu và gửi hồ sơ');

    // Step 1
    let app1Id = Number((item as any).approver_id || (item as any).manager_id || (item as any).approved_by || 0);
    const rawApp1Name = (item as any).approver_name || (item as any).manager_name || (item as any).approved_by_name || '';
    let app1Name = !isGenericApproverLabel(rawApp1Name) ? rawApp1Name : '';

    if (isPrintStampSendItem || (!app1Id && !app1Name)) {
      const fallbackStep1User = resolveFallbackApproverForItem(item);
      if (fallbackStep1User) {
        app1Id = Number(fallbackStep1User.id || 0);
        app1Name = fallbackStep1User.full_name || fallbackStep1User.name || '';
      }
    }

    if (app1Id > 0 || app1Name || (item as any).approver_id_2) {
      let stepStatus: StepInfo['status'] = 'pending';
      if (isDraft) stepStatus = 'waiting';
      else if (s1 === 'approved' || overall === 'approved' || overall === 'level1_approved') stepStatus = 'approved';
      else if (s1 === 'rejected' || (overall === 'rejected' && s1 !== 'approved')) stepStatus = 'rejected';
      else stepStatus = 'pending';

      steps.push({
        stepIndex: 1,
        title: isPrintStampSendItem ? 'Thực hiện' : 'Cấp 1',
        userId: app1Id,
        userName: app1Name,
        status: stepStatus
      });
    }

    // Step 2
    const app2Id = !isPrintStampSendItem ? Number((item as any).approver_id_2 || 0) : 0;
    const rawApp2Name = !isPrintStampSendItem ? ((item as any).approver_name_2 || '') : '';
    const app2Name = !isGenericApproverLabel(rawApp2Name) ? rawApp2Name : '';
    if (app2Id > 0 || (app2Name && app2Name.trim() !== '')) {
      let stepStatus: StepInfo['status'] = 'waiting';
      if (isDraft) stepStatus = 'waiting';
      else if (s2 === 'approved') stepStatus = 'approved';
      else if (s2 === 'rejected') stepStatus = 'rejected';
      else if (s1 === 'approved' && s2 !== 'approved' && s2 !== 'rejected') stepStatus = 'pending';
      else stepStatus = 'waiting';

      steps.push({
        stepIndex: 2,
        title: 'Cấp 2',
        userId: app2Id,
        userName: app2Name,
        status: stepStatus
      });
    }

    // Step 3
    const app3Id = !isPrintStampSendItem ? Number((item as any).approver_id_3 || 0) : 0;
    const rawApp3Name = !isPrintStampSendItem ? ((item as any).approver_name_3 || '') : '';
    const app3Name = !isGenericApproverLabel(rawApp3Name) ? rawApp3Name : '';
    if (app3Id > 0 || (app3Name && app3Name.trim() !== '')) {
      let stepStatus: StepInfo['status'] = 'waiting';
      if (isDraft) stepStatus = 'waiting';
      else if (s3 === 'approved') stepStatus = 'approved';
      else if (s3 === 'rejected') stepStatus = 'rejected';
      else if (s1 === 'approved' && (s2 === 'approved' || s2 === 'none') && s3 !== 'approved' && s3 !== 'rejected') stepStatus = 'pending';
      else stepStatus = 'waiting';

      steps.push({
        stepIndex: 3,
        title: 'Cấp 3',
        userId: app3Id,
        userName: app3Name,
        status: stepStatus
      });
    }

    if (steps.length === 0) {
      const fallbackUser = resolveFallbackApproverForItem(item);
      steps.push({
        stepIndex: 1,
        title: 'Cấp 1',
        userId: Number(fallbackUser?.id || (item as any).approver_id || 0),
        userName: fallbackUser?.full_name || fallbackUser?.name || (!isGenericApproverLabel((item as any).approver_name) ? (item as any).approver_name : '') || '',
        status: isDraft ? 'waiting' : (overall === 'approved' ? 'approved' : overall === 'rejected' ? 'rejected' : 'pending')
      });
    }

    // Related Watchers
    let relIds: number[] = [];
    const rawWatchers = (item as any).related_user_ids || (item as any).related_users;
    if (Array.isArray(rawWatchers)) {
      relIds = rawWatchers.map((id: any) => Number(typeof id === 'object' && id !== null ? (id.id || id.user_id) : id)).filter((id: number) => id > 0);
    } else if (typeof rawWatchers === 'string') {
      const trimmed = rawWatchers.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            relIds = parsed.map((id: any) => Number(typeof id === 'object' && id !== null ? (id.id || id.user_id) : id)).filter((id: number) => id > 0);
          }
        } catch {
          relIds = trimmed.slice(1, -1).split(',').map((id: string) => Number(id.trim().replace(/^['"]|['"]$/g, ''))).filter((id: number) => id > 0);
        }
      } else {
        relIds = trimmed.split(',').map((id: string) => Number(id.trim())).filter((id: number) => id > 0);
      }
    }



    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        {/* Step Approvers Chain */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {steps.map((st, idx) => {
            let uObj = findApproverUserInMaps(st.userId, st.userName);
            if (!uObj && idx === 0) {
              uObj = resolveFallbackApproverForItem(item);
            }
            const displayName = uObj?.full_name || uObj?.name || (!isGenericApproverLabel(st.userName) ? st.userName : '') || st.title;
            const avatarUrl = uObj?.avatar_url || uObj?.avatar || (idx === 0 ? ((item as any).approver_avatar || (item as any).approved_by_avatar) : undefined);

            const isApproved = !isDraft && st.status === 'approved';
            const isRejected = !isDraft && st.status === 'rejected';
            const isPending = !isDraft && st.status === 'pending';

            const borderColor = isApproved ? '#10b981' : isRejected ? '#ef4444' : isPending ? '#f59e0b' : '#cbd5e1';
            const statusText = isApproved ? 'Đã duyệt' : isRejected ? 'Từ chối' : isPending ? 'Đang chờ duyệt' : isDraft ? 'Dự kiến duyệt (Bản nháp)' : 'Chưa đến lượt';

            return (
              <React.Fragment key={`step-${st.stepIndex}`}>
                {idx > 0 && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: '0 1px' }}>➔</span>
                )}
                <div 
                  title={`${st.title}: ${displayName} (${statusText})`}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={getAvatarRingStyle(borderColor)}>
                    <Avatar src={avatarUrl} name={displayName} size={24} />
                  </div>
                  <div style={{
                    position: 'absolute',
                    bottom: '-2px',
                    right: '-2px',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: isApproved ? '#10b981' : isRejected ? '#ef4444' : isPending ? '#f59e0b' : isDraft ? '#64748B' : '#94a3b8',
                    border: '1.5px solid #ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '8px',
                    fontWeight: 800
                  }}>
                    {isApproved ? '✓' : isRejected ? '✕' : isPending ? '•' : st.stepIndex}
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* Related Watchers Avatars */}
        {relIds.length > 0 && (
          <div 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              marginLeft: '4px',
              paddingLeft: '6px',
              borderLeft: '1px solid var(--color-border)'
            }}
            title={`Người liên quan (${relIds.length}): ${relIds.map(id => usersMap.get(id)?.name || id).join(', ')}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', marginRight: '1px' }}>
              <Eye size={12} />
            </div>
            {relIds.slice(0, 3).map(id => {
              const relU = usersMap.get(id);
              return (
                <Avatar
                  key={`rel-${id}`}
                  src={relU?.avatar_url || relU?.avatar}
                  name={relU?.full_name || relU?.name || `ID ${id}`}
                  size={22}
                />
              );
            })}
            {relIds.length > 3 && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                +{relIds.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }, [usersMap, usersByNameMap]);

  // Filter logic for main lists (memoized)
  const currentRawList = useMemo(() => {
    switch (activeTab) {
      case 'pending': return pendingList;
      case 'my_requests': return [...draftApprovalItems, ...myRequestsList];
      case 'following': return followingList;
      case 'all': return [...draftApprovalItems, ...allList];
      default: return pendingList;
    }
  }, [activeTab, pendingList, myRequestsList, followingList, allList, draftApprovalItems]);

  const unpaidCount = useMemo(() => {
    return currentRawList.filter(item => {
      const rawStatus = (item.status || 'pending').toLowerCase();
      const isItemDraft = rawStatus === 'draft' || !!item.is_draft;
      if (isItemDraft) return false;
      const isItemApproved = ['approved', 'confirmed'].includes(rawStatus);
      const isPaid = Boolean((item as any).is_refunded) || rawStatus === 'paid' || rawStatus === 'refunded';
      const isFinancial = Number(item.amount || 0) > 0 && !String(item.title).toLowerCase().includes('tuyển dụng');
      return isItemApproved && !isPaid && isFinancial;
    }).length;
  }, [currentRawList]);

  const creatorOptions = useMemo(() => {
    const list: SelectOption[] = [
      { 
        value: 'all', 
        label: t('Tất cả người tạo'),
        icon: <Users size={15} style={{ color: 'var(--color-primary)' }} />
      }
    ];
    const sortedUsers = [...(users || [])].sort((a, b) => 
      String(a.full_name || a.name || '').localeCompare(String(b.full_name || b.name || ''), 'vi')
    );
    sortedUsers.forEach(u => {
      list.push({
        value: String(u.id),
        label: u.full_name || u.name || `User #${u.id}`,
        avatar: u.avatar_url || u.avatar || '',
        sublabel: u.role || u.department || ''
      });
    });
    return list;
  }, [users, t]);

  const isMonetaryPoItem = useCallback((item: ApprovalItem) => {
    const lowerTitle = String(item.title || '').toLowerCase();
    const rawDesc = String(item.description || (item as any).notes || '');
    const isZeroWf = lowerTitle.includes('tuyển dụng') || rawDesc.includes('Quy trình: In, đóng dấu và gửi hồ sơ');
    if (isZeroWf) return false;
    if (item.type === 'po' || item.type === 'purchase_order' || item.type === 'advance') return true;
    return Number(item.amount || 0) > 0;
  }, []);

  const categoryCounts = useMemo(() => {
    let poFinancial = 0;
    let nonFinancial = 0;
    for (const it of currentRawList) {
      if (isMonetaryPoItem(it)) poFinancial++;
      else nonFinancial++;
    }
    return {
      all: currentRawList.length,
      po_financial: poFinancial,
      workflow_non_financial: nonFinancial
    };
  }, [currentRawList, isMonetaryPoItem]);

  const currentList = useMemo(() => {
    return currentRawList.filter(item => {
      if (listCategoryFilter === 'po_financial' && !isMonetaryPoItem(item)) return false;
      if (listCategoryFilter === 'workflow_non_financial' && isMonetaryPoItem(item)) return false;

      const searchLower = listSearchText.toLowerCase().trim();
      const displayTitle = getApprovalDisplayTitle(item).toLowerCase();
      const creatorName = String(item.employee_name || (item as any).user_name || (item as any).creator_name || usersMap.get(Number(item.user_id))?.full_name || '').toLowerCase();
      const poNum = String((item as any).po_number || (item as any).so_number || (item as any).code || (item as any).ref_no || '').toLowerCase();
      const itemIdStr = String(item.id || '');
      const cleanSearchNum = searchLower.replace(/[^0-9]/g, '');

      const matchesSearch = searchLower === '' ||
        (item.title && item.title.toLowerCase().includes(searchLower)) ||
        (item.description && item.description.toLowerCase().includes(searchLower)) ||
        displayTitle.includes(searchLower) ||
        creatorName.includes(searchLower) ||
        (Boolean(poNum) && poNum.includes(searchLower)) ||
        (cleanSearchNum !== '' && itemIdStr === cleanSearchNum) ||
        itemIdStr.includes(searchLower);
      
      const rawStatus = (item.status || 'pending').toLowerCase();
      const isItemDraft = rawStatus === 'draft' || !!item.is_draft;
      const isItemPending = !isItemDraft && ['pending', 'pending_manager', 'pending_hr', 'pending_approval', 'level1_approved'].includes(rawStatus);
      const isItemApproved = ['approved', 'confirmed'].includes(rawStatus);
      const isItemRejected = ['rejected', 'failed'].includes(rawStatus);
      const isPaid = Boolean((item as any).is_refunded) || rawStatus === 'paid' || rawStatus === 'refunded';
      const isFinancial = isMonetaryPoItem(item);
      const isUnpaid = isItemApproved && !isPaid && isFinancial;

      let matchesStatus = listStatusFilter === 'all';
      if (!matchesStatus) {
        if (listStatusFilter === 'draft') matchesStatus = isItemDraft;
        else if (listStatusFilter === 'pending') matchesStatus = isItemPending;
        else if (listStatusFilter === 'approved') matchesStatus = isItemApproved;
        else if (listStatusFilter === 'unpaid') matchesStatus = isUnpaid;
        else if (listStatusFilter === 'paid') matchesStatus = isPaid;
        else if (listStatusFilter === 'rejected') matchesStatus = isItemRejected;
        else matchesStatus = rawStatus === listStatusFilter.toLowerCase();
      }
      
      let matchesDate = true;
      if (item.created_at) {
        const dateStr = item.created_at.substring(0, 10);
        if (dateRange.from && dateStr < dateRange.from) matchesDate = false;
        if (dateRange.to && dateStr > dateRange.to) matchesDate = false;
      }

      let matchesCreator = true;
      if (listCreatorFilter !== 'all') {
        const targetUserId = Number(listCreatorFilter);
        const itemUserId = Number(item.user_id || 0);
        const creatorUser = item.user_id ? usersMap.get(Number(item.user_id)) : null;
        const creatorName = String(item.employee_name || creatorUser?.full_name || creatorUser?.name || '').toLowerCase().trim();
        const targetUser = usersMap.get(targetUserId);
        const targetName = String(targetUser?.full_name || targetUser?.name || '').toLowerCase().trim();
        
        matchesCreator = (itemUserId === targetUserId) || (Boolean(targetName) && Boolean(creatorName) && (creatorName.includes(targetName) || targetName.includes(creatorName)));
      }

      return matchesSearch && matchesStatus && matchesDate && matchesCreator;
    });
  }, [currentRawList, listCategoryFilter, isMonetaryPoItem, listSearchText, listStatusFilter, listCreatorFilter, dateRange, usersMap, getApprovalDisplayTitle]);

  const mobileFiltersBtnRef = useRef<HTMLButtonElement>(null);

  const paginatedList = useMemo(() => {
    return currentList.slice((page - 1) * pageSize, page * pageSize);
  }, [currentList, page, pageSize]);

  const selectedItems = useMemo(() => {
    if (activeTab !== 'pending' || selectedIds.size === 0) return [];
    return currentList.filter(it => selectedIds.has(`${it.type}_${it.id}`) && isItemAtMyStepToApprove(it));
  }, [activeTab, currentList, selectedIds, isItemAtMyStepToApprove]);

  const pageSelectableKeys = useMemo(() => {
    if (activeTab !== 'pending') return [];
    return paginatedList.filter(it => isItemAtMyStepToApprove(it)).map(it => `${it.type}_${it.id}`);
  }, [activeTab, paginatedList, isItemAtMyStepToApprove]);

  const allPageSelected = pageSelectableKeys.length > 0 && pageSelectableKeys.every(k => selectedIds.has(k));

  const toggleSelectItem = useCallback((item: ApprovalItem) => {
    const key = `${item.type}_${item.id}`;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAllPage = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allPageSelected) {
        pageSelectableKeys.forEach(k => next.delete(k));
      } else {
        pageSelectableKeys.forEach(k => next.add(k));
      }
      return next;
    });
  }, [allPageSelected, pageSelectableKeys]);

  const handleBatchApprove = () => {
    if (selectedItems.length === 0 || batchSubmitting) return;
    const targets = [...selectedItems];
    showConfirm({
      title: t('Phê duyệt hàng loạt'),
      message: `${t('Xác nhận phê duyệt')} ${targets.length} ${t('đề xuất đã chọn?')}`,
      confirmText: `${t('Duyệt')} (${targets.length})`,
      isDanger: false,
      onConfirm: async () => {
        if (batchSubmitting) return;
        setBatchSubmitting(true);
        let ok = 0;
        let fail = 0;
        const snapshot = captureListsSnapshot();
        try {
          const results = await Promise.allSettled(
            targets.map(async it => {
              const lockKey = `${it.type}_${it.id}`;
              if (inFlightOpsRef.current[lockKey]) throw new Error('in_flight');
              inFlightOpsRef.current[lockKey] = true;
              try {
                await dispatchApprovalDecision(it, 'approved');
                applyOptimisticStatusUpdate(it, 'approved');
              } finally {
                delete inFlightOpsRef.current[lockKey];
              }
            })
          );
          results.forEach(r => {
            if (r.status === 'fulfilled') ok++;
            else fail++;
          });
          setSelectedIds(new Set());
          if (ok > 0 && fail === 0) {
            toast.success(`${t('Đã phê duyệt thành công')} ${ok} ${t('đề xuất!')}`);
          } else if (ok > 0) {
            toast.error(`${t('Đã duyệt')} ${ok}, ${t('thất bại')} ${fail} ${t('đề xuất.')}`);
            restoreListsSnapshot(snapshot);
          } else {
            restoreListsSnapshot(snapshot);
            toast.error(t('Không thể phê duyệt các đề xuất đã chọn.'));
          }
          window.dispatchEvent(new CustomEvent('approval-updated'));
          loadData(true);
        } finally {
          setBatchSubmitting(false);
          closeConfirm();
        }
      }
    });
  };

  const handleBatchRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedItems.length === 0 || batchSubmitting) return;
    if (!batchRejectReason.trim()) {
      toast.error(t('Vui lòng nhập lý do từ chối hàng loạt!'));
      return;
    }
    const reasonText = batchRejectReason.trim();
    const targets = [...selectedItems];
    setBatchSubmitting(true);
    let ok = 0;
    let fail = 0;
    const snapshot = captureListsSnapshot();
    try {
      const results = await Promise.allSettled(
        targets.map(async it => {
          const lockKey = `${it.type}_${it.id}`;
          if (inFlightOpsRef.current[lockKey]) throw new Error('in_flight');
          inFlightOpsRef.current[lockKey] = true;
          try {
            await dispatchApprovalDecision(it, 'rejected', reasonText);
            applyOptimisticStatusUpdate(it, 'rejected');
          } finally {
            delete inFlightOpsRef.current[lockKey];
          }
        })
      );
      results.forEach(r => {
        if (r.status === 'fulfilled') ok++;
        else fail++;
      });
      setSelectedIds(new Set());
      setBatchRejectModalOpen(false);
      setBatchRejectReason('');
      if (ok > 0 && fail === 0) {
        toast.success(`${t('Đã từ chối')} ${ok} ${t('đề xuất!')}`);
      } else if (ok > 0) {
        toast.error(`${t('Đã từ chối')} ${ok}, ${t('thất bại')} ${fail} ${t('đề xuất.')}`);
        restoreListsSnapshot(snapshot);
      } else {
        restoreListsSnapshot(snapshot);
        toast.error(t('Không thể từ chối các đề xuất đã chọn.'));
      }
      window.dispatchEvent(new CustomEvent('approval-updated'));
      loadData(true);
    } finally {
      setBatchSubmitting(false);
    }
  };

  const handleExportApprovalsCsv = () => {
    if (currentList.length === 0) {
      toast.error(t('Không có dữ liệu để xuất CSV!'));
      return;
    }
    const headers = ['ID', 'Loại quy trình', 'Tiêu đề', 'Người tạo', 'Số tiền', 'Tiền tệ', 'Quy đổi VND', 'Trạng thái', 'Ngày tạo'];
    const rows = currentList.map(it => {
      const creatorName = String(it.employee_name || (it as any).user_name || (it as any).creator_name || usersMap.get(Number(it.user_id))?.full_name || '');
      const amt = Number(it.amount || 0);
      const cur = it.currency || 'VND';
      const vnd = amt > 0 ? Math.round(toVndAmount(amt, cur)) : 0;
      const createdFmt = it.created_at ? (formatDateVN(it.created_at) || it.created_at.substring(0, 10)) : '';
      return [
        csvSafe(it.id),
        csvSafe(it.type),
        csvSafe(getApprovalDisplayTitle(it)),
        csvSafe(creatorName),
        csvSafe(amt),
        csvSafe(cur),
        csvSafe(vnd),
        csvSafe(it.status || 'pending'),
        csvSafe(createdFmt)
      ].join(',');
    });
    const csvContent = '\uFEFF' + [headers.map(h => csvSafe(h)).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Quy_trinh_${activeTab}_${getLocalDateStr()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`${t('Đã xuất')} ${currentList.length} ${t('dòng ra file CSV!')}`);
  };

  return (
    <div>

      
      {/* Header */}
      <div style={{ 
        marginBottom: isMobile ? '0.75rem' : '1.5rem',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? '8px' : '16px'
      }}>
        <div style={{ width: isMobile ? '100%' : 'auto', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <h1 className="page-title" style={{ margin: 0, fontSize: isMobile ? '1.125rem' : '1.5rem', fontWeight: 800 }}>
              {t('Quy trình hệ thống')}
            </h1>
            {isMobile && (
              <button
                type="button"
                data-icon-only="true"
                onClick={() => loadData()}
                disabled={loading}
                title={t('Tải lại danh sách')}
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flexShrink: 0
                }}
              >
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
          <p className="page-subtitle" style={{ margin: '2px 0 0 0', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>
            {t('Quản lý tập trung các quy trình đề xuất nghỉ phép, tạm ứng lương, chi phí hành chính và giải trình đi trễ.')}
          </p>
        </div>
        
        {/* Top Action Bar (Strictly <= 2 buttons horizontally on Mobile) */}
        <div style={{ display: isMobile ? 'grid' : 'flex', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : undefined, alignItems: 'center', gap: '8px', width: isMobile ? '100%' : 'auto' }}>
          {!isMobile && (
            <>
              <button
                type="button"
                className="btn secondary"
                onClick={handleExportApprovalsCsv}
                disabled={loading || currentList.length === 0}
                title={t('Xuất danh sách CSV')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  height: '40px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                <Download size={15} />
                {t('Xuất CSV')}
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => loadData()}
                disabled={loading}
                title={t('Tải lại danh sách')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  height: '40px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  fontSize: '0.85rem',
                  fontWeight: 600
                }}
              >
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                {t('Làm mới')}
              </button>
            </>
          )}
          <div style={{ minWidth: 0 }}>
            <PeriodFilter
              value={period}
              onChange={(p, r) => {
                setPeriod(p);
                setDateRange(r);
              }}
            />
          </div>
          <button
            type="button"
            className="btn primary"
            onClick={() => setShowCreateModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontWeight: 700,
              fontSize: isMobile ? '0.8rem' : '0.875rem',
              padding: isMobile ? '0 12px' : '0.625rem 1.25rem',
              height: isMobile ? '36px' : '40px',
              borderRadius: '10px',
              width: isMobile ? '100%' : 'auto',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)'
            }}
          >
            <Plus size={16} />
            {t('Tạo đề xuất')}
          </button>
        </div>
      </div>

      {/* Search and Filters Bar with Integrated Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: isMobile ? '8px' : '10px',
        background: 'var(--color-surface, #ffffff)',
        border: '1px solid var(--color-border)',
        borderRadius: '12px',
        padding: isMobile ? '8px 10px' : '6px 10px',
        marginBottom: '0.65rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
        position: 'relative',
        flexWrap: 'wrap',
        overflow: 'visible'
      }}>
        {/* Left: View Mode Tabs (Auto '...' overflow on Mobile) */}
        <ResponsiveSegmentedTabs
          tabs={[
            {
              id: 'all',
              label: t('Tất cả đề xuất'),
              shortLabel: t('Tất cả'),
              icon: <FileText size={13} />,
              badge: allList.length || undefined,
            },
            {
              id: 'pending',
              label: t('Chờ tôi duyệt'),
              shortLabel: t('Chờ duyệt'),
              icon: <Activity size={13} />,
              badge: pendingList.length || undefined,
              badgeBg: '#C6333D',
              badgeColor: '#ffffff',
            },
            {
              id: 'my_requests',
              label: t('Yêu cầu của tôi'),
              shortLabel: t('Của tôi'),
              icon: <User size={13} />,
              badge: (myRequestsList.length + draftApprovalItems.length) || undefined,
            },
            {
              id: 'following',
              label: t('Được gắn theo dõi'),
              shortLabel: t('Theo dõi'),
              icon: <Eye size={13} />,
              badge: followingList.length || undefined,
              badgeBg: '#475569',
              badgeColor: '#ffffff',
            },
          ]}
          activeId={activeTab}
          onChange={(nextId) => handleTabChange(nextId as any)}
          mobileMaxVisible={2}
          tabletMaxVisible={4}
          desktopMaxVisible={4}
        />

        {/* Right: Search Field & Status Filter */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flex: isMobile ? '1 1 100%' : '1 1 auto',
          justifyContent: isMobile ? 'stretch' : 'flex-end',
          width: isMobile ? '100%' : 'auto',
          flexWrap: 'wrap',
          flexShrink: 0
        }}>
          {/* Search Field */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--color-bg-secondary, #f1f5f9)',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '0 8px',
            height: '32px',
            flex: isMobile ? 1 : 'none',
            width: isMobile ? 'auto' : '180px',
            minWidth: 0
          }}>
            <Search size={13} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
            <input
              type="text"
              placeholder={t('Tìm kiếm đề xuất...')}
              value={listSearchText}
              onChange={e => setListSearchText(e.target.value)}
              style={{ border: 'none', background: 'transparent', width: '100%', fontSize: isMobile ? '0.82rem' : '0.8rem', outline: 'none', color: 'var(--color-text)', minWidth: 0 }}
            />
            {listSearchText && (
              <button onClick={() => setListSearchText('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
                <X size={13} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            )}
          </div>

          {/* Quick Filter Pill: Chưa thanh toán */}
          {!isMobile && (
            <button
              type="button"
              onClick={() => setListStatusFilter(listStatusFilter === 'unpaid' ? 'all' : 'unpaid')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                height: '32px',
                padding: '0 9px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: listStatusFilter === 'unpaid' ? 700 : 550,
                border: listStatusFilter === 'unpaid' ? '1.5px solid #d97706' : '1px solid rgba(245, 158, 11, 0.35)',
                background: listStatusFilter === 'unpaid' ? 'rgba(245, 158, 11, 0.16)' : 'rgba(245, 158, 11, 0.05)',
                color: '#d97706',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              title={t('Lọc các đề xuất đã duyệt đủ cấp nhưng chưa thanh toán / hạch toán')}
            >
              <Clock size={13} />
              <span>{t('Chưa thanh toán')}</span>
              {unpaidCount > 0 && (
                <span style={{
                  fontSize: '0.66rem',
                  background: '#d97706',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: 99,
                  fontWeight: 700,
                  lineHeight: 1.2
                }}>
                  {unpaidCount}
                </span>
              )}
            </button>
          )}

          {/* Desktop Status Dropdown */}
          {!isMobile && (
            <div style={{ width: '135px', flexShrink: 0 }}>
              <CustomSelect
                value={listStatusFilter}
                onChange={val => setListStatusFilter(val)}
                options={[
                  { value: 'all', label: t('Trạng thái: Tất cả') },
                  { value: 'unpaid', label: t('Chưa thanh toán') },
                  { value: 'paid', label: t('Đã thanh toán') },
                  { value: 'pending', label: t('Đang chờ duyệt') },
                  { value: 'approved', label: t('Đã duyệt') },
                  { value: 'draft', label: t('Bản nháp') },
                  { value: 'rejected', label: t('Từ chối') }
                ]}
                size="sm"
                width="100%"
              />
            </div>
          )}

          {/* Desktop Creator Dropdown */}
          {!isMobile && (
            <div style={{ width: '170px', flexShrink: 0 }}>
              <CustomSelect
                value={listCreatorFilter}
                onChange={val => setListCreatorFilter(val)}
                options={creatorOptions}
                size="sm"
                width="100%"
                searchable={true}
                showAvatars={true}
                align="right"
                placeholder={t('Tìm người tạo...')}
              />
            </div>
          )}

          {/* Mobile [...] Filter & Actions Button */}
          {isMobile && (
            <div style={{ position: 'relative' }}>
              <button
                ref={mobileFiltersBtnRef}
                type="button"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                style={{
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  background: showMobileFilters ? 'var(--color-border-light)' : 'var(--color-surface)',
                  color: (listStatusFilter !== 'all' || listCategoryFilter !== 'all') ? 'var(--color-primary)' : 'var(--color-text)',
                  outline: 'none',
                  boxShadow: 'var(--shadow-sm)',
                  flexShrink: 0,
                  position: 'relative'
                }}
                title={t('Bộ lọc & Tùy chọn')}
              >
                <MoreHorizontal size={18} />
                {(listStatusFilter !== 'all' || listCategoryFilter !== 'all') && (
                  <span style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: 'var(--color-primary)'
                  }} />
                )}
              </button>

              {/* Mobile Filters Dropdown Popover (Portaled to prevent container overflow clipping) */}
              {showMobileFilters && createPortal((() => {
                const rect = mobileFiltersBtnRef.current?.getBoundingClientRect();
                const popZ = uiMotion?.z_modal_nested || 2147483646;
                const topPx = rect ? Math.min(rect.bottom + 6, Math.max(12, window.innerHeight - 360)) : 80;
                const rightPx = rect ? Math.max(12, window.innerWidth - rect.right) : 12;
                return (
                  <AnimatePresence>
                    <div
                      key="mobile-filter-backdrop"
                      onClick={() => setShowMobileFilters(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: popZ - 1, background: 'rgba(15, 23, 42, 0.25)' }}
                    />
                    <motion.div
                      key="mobile-filter-popover"
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      style={{
                        position: 'fixed',
                        right: `${rightPx}px`,
                        top: `${topPx}px`,
                        width: '264px',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        background: 'var(--color-surface, #ffffff)',
                        border: '1px solid #e2e8f0',
                        borderRadius: '14px',
                        boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
                        padding: '12px',
                        zIndex: popZ,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          {t('Chế độ xem')}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                          <button
                            type="button"
                            onClick={() => { handleTabChange('all'); setShowMobileFilters(false); }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '7px',
                              border: 'none',
                              background: activeTab === 'all' ? '#BD1D2D' : '#f1f5f9',
                              color: activeTab === 'all' ? '#ffffff' : '#334155',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {t('Tất cả')} ({allList.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => { handleTabChange('pending'); setShowMobileFilters(false); }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '7px',
                              border: 'none',
                              background: activeTab === 'pending' ? '#BD1D2D' : '#f1f5f9',
                              color: activeTab === 'pending' ? '#ffffff' : '#334155',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {t('Chờ tôi duyệt')} ({pendingList.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => { handleTabChange('my_requests'); setShowMobileFilters(false); }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '7px',
                              border: 'none',
                              background: activeTab === 'my_requests' ? '#BD1D2D' : '#f1f5f9',
                              color: activeTab === 'my_requests' ? '#ffffff' : '#334155',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {t('Của tôi')} ({myRequestsList.length + draftApprovalItems.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => { handleTabChange('following'); setShowMobileFilters(false); }}
                            style={{
                              padding: '6px 8px',
                              borderRadius: '7px',
                              border: 'none',
                              background: activeTab === 'following' ? '#BD1D2D' : '#f1f5f9',
                              color: activeTab === 'following' ? '#ffffff' : '#334155',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            {t('Theo dõi')} ({followingList.length})
                          </button>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '6px', marginBottom: '2px' }}>
                        <button
                          type="button"
                          onClick={() => { setListStatusFilter(listStatusFilter === 'unpaid' ? 'all' : 'unpaid'); setShowMobileFilters(false); }}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: '7px',
                            fontSize: '0.75rem',
                            fontWeight: listStatusFilter === 'unpaid' ? 700 : 600,
                            border: listStatusFilter === 'unpaid' ? '1px solid #BD1D2D' : '1px solid #e2e8f0',
                            background: listStatusFilter === 'unpaid' ? 'rgba(189, 29, 45, 0.08)' : '#f8fafc',
                            color: listStatusFilter === 'unpaid' ? '#BD1D2D' : '#334155',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '5px'
                          }}
                        >
                          <Clock size={12} />
                          <span>{t('Chưa thanh toán')}</span>
                          {unpaidCount > 0 && (
                            <span style={{ fontSize: '0.68rem', background: '#BD1D2D', color: '#fff', padding: '0 5px', borderRadius: 6, fontWeight: 700 }}>
                              {unpaidCount}
                            </span>
                          )}
                        </button>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          {t('Trạng thái')}
                        </label>
                        <CustomSelect
                          value={listStatusFilter}
                          onChange={val => { setListStatusFilter(val); setShowMobileFilters(false); }}
                          options={[
                            { value: 'all', label: t('Tất cả trạng thái') },
                            { value: 'unpaid', label: t('Chưa thanh toán') },
                            { value: 'paid', label: t('Đã thanh toán') },
                            { value: 'pending', label: t('Đang chờ duyệt') },
                            { value: 'approved', label: t('Đã duyệt') },
                            { value: 'draft', label: t('Bản nháp') },
                            { value: 'rejected', label: t('Từ chối') }
                          ]}
                          size="xs"
                          width="100%"
                        />
                      </div>

                      <div>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: '4px', display: 'block' }}>
                          {t('Người tạo')}
                        </label>
                        <CustomSelect
                          value={listCreatorFilter}
                          onChange={val => { setListCreatorFilter(val); setShowMobileFilters(false); }}
                          options={creatorOptions}
                          size="xs"
                          width="100%"
                          searchable={true}
                          showAvatars={true}
                          placeholder={t('Tìm người tạo...')}
                        />
                      </div>

                      <button
                        type="button"
                        onClick={() => { handleExportApprovalsCsv(); setShowMobileFilters(false); }}
                        disabled={currentList.length === 0}
                        style={{
                          padding: '7px 10px',
                          borderRadius: '7px',
                          border: '1px solid #e2e8f0',
                          background: '#f8fafc',
                          color: '#0f172a',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: currentList.length === 0 ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px'
                        }}
                      >
                        <Download size={13} />
                        <span>{t('Xuất danh sách CSV')}</span>
                      </button>

                      {(listStatusFilter !== 'all' || listCreatorFilter !== 'all' || listCategoryFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => { setListStatusFilter('all'); setListCreatorFilter('all'); setListCategoryFilter('all'); setShowMobileFilters(false); }}
                          style={{
                            marginTop: '2px',
                            padding: '6px',
                            borderRadius: '7px',
                            border: 'none',
                            background: 'rgba(189, 29, 45, 0.08)',
                            color: '#BD1D2D',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textAlign: 'center'
                          }}
                        >
                          {t('Đặt lại bộ lọc')}
                        </button>
                      )}
                    </motion.div>
                  </AnimatePresence>
                );
              })(), document.body)}
            </div>
          )}
        </div>
      </div>

      {/* Category Segmented Control Tray (Ch. V Standardized) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        marginBottom: isMobile ? '0.75rem' : '1rem',
        flexWrap: 'wrap'
      }}>
        <div style={{
          display: 'inline-flex',
          padding: '3px',
          borderRadius: '10px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          gap: '2px',
          flexWrap: 'wrap'
        }}>
          {[
            { id: 'all', label: t('Tất cả phân loại'), count: categoryCounts.all, icon: Layers },
            { id: 'po_financial', label: t('PO / Quy trình có tiền'), count: categoryCounts.po_financial, icon: DollarSign },
            { id: 'workflow_non_financial', label: t('Quy trình hành chính & Nhân sự (0đ)'), count: categoryCounts.workflow_non_financial, icon: Clipboard }
          ].map(cat => {
            const isSelected = listCategoryFilter === cat.id;
            const CatIcon = cat.icon;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setListCategoryFilter(cat.id as any);
                  setPage(1);
                }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  height: '32px',
                  padding: isMobile ? '0 10px' : '0 14px',
                  borderRadius: '7px',
                  border: 'none',
                  fontSize: isMobile ? '0.74rem' : '0.78rem',
                  fontWeight: isSelected ? 700 : 600,
                  background: isSelected ? '#ffffff' : 'transparent',
                  color: isSelected ? '#BD1D2D' : '#64748b',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  boxShadow: isSelected ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                <CatIcon size={13} />
                <span>{cat.label}</span>
                <span style={{
                  fontSize: '0.68rem',
                  padding: '1px 6px',
                  borderRadius: '6px',
                  fontWeight: 700,
                  background: isSelected ? 'rgba(189, 29, 45, 0.1)' : 'rgba(15, 23, 42, 0.06)',
                  color: isSelected ? '#BD1D2D' : '#475569'
                }}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Batch Approve / Reject Bar */}
        {activeTab === 'pending' && selectedItems.length > 0 && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '5px 10px',
            borderRadius: '10px',
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.06)'
          }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0f172a' }}>
              {t('Đã chọn')} {selectedItems.length}
            </span>
            <button
              type="button"
              onClick={handleBatchApprove}
              disabled={batchSubmitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                height: '30px',
                padding: '0 12px',
                borderRadius: '7px',
                border: 'none',
                background: '#BD1D2D',
                color: '#ffffff',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: batchSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              <CheckCircle2 size={13} />
              <span>{t('Duyệt hàng loạt')}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setBatchRejectReason('');
                setBatchRejectModalOpen(true);
              }}
              disabled={batchSubmitting}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                height: '30px',
                padding: '0 12px',
                borderRadius: '7px',
                border: '1px solid #e2e8f0',
                background: '#ffffff',
                color: '#334155',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: batchSubmitting ? 'not-allowed' : 'pointer'
              }}
            >
              <XCircle size={13} />
              <span>{t('Từ chối')}</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#64748b',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                padding: '0 4px'
              }}
            >
              {t('Bỏ chọn')}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ background: 'var(--color-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--color-border)', padding: '1.5rem' }}>
          <TableSkeleton rows={5} cols={4} />
        </div>
      ) : (() => {

        if (currentList.length === 0) {
          const emptyIcon = activeTab === 'pending' ? <ShieldCheck /> : activeTab === 'following' ? <Eye /> : <Clipboard />;
          const emptyTitle = activeTab === 'pending' 
            ? t('Không có yêu cầu phê duyệt') 
            : activeTab === 'my_requests' 
            ? t('Không tìm thấy yêu cầu') 
            : activeTab === 'following'
            ? t('Chưa có đề xuất được gắn theo dõi')
            : t('Không có đề xuất');
          const emptyDesc = activeTab === 'pending'
            ? t('Không có yêu cầu phê duyệt nào đang chờ xử lý.')
            : activeTab === 'my_requests'
            ? t('Bạn chưa gửi yêu cầu quy trình nào.')
            : activeTab === 'following'
            ? t('Bạn chưa được gắn làm Người liên quan trong đề xuất nào.')
            : t('Không có dữ liệu quy trình phù hợp với bộ lọc.');

          return <EmptyCard icon={emptyIcon} title={emptyTitle} description={emptyDesc} />;
        }

        if (isMobile) {
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {paginatedList.map(item => {
                const role = (user?.role || '').toLowerCase();
                const userId = Number(user?.id || 0);
                const isSuperAdmin = isExecutive(user);
                
                const creatorId = Number(item.user_id || (item as any)?.created_by || 0);
                const isCreator = creatorId > 0 && creatorId === userId;
                const isPrivilegedUser = isSuperAdmin || ['admin', 'superadmin', 'super_admin', 'director', 'manager', 'hr'].includes(String(user?.role || '').toLowerCase());
                const canEditItem = (isCreator && ['pending', 'pending_approval', 'pending_manager', 'pending_hr', 'rejected', 'draft'].includes(String(item.status || 'pending').toLowerCase())) ||
                  (isPrivilegedUser && ['pending', 'pending_approval', 'pending_manager', 'pending_hr', 'rejected', 'draft'].includes(String(item.status || 'pending').toLowerCase()));

                const isPendingAction = activeTab === 'pending' && isItemAtMyStepToApprove(item);
                const itemLockKey = `${item.type}_${item.id}`;
                const isSelectedRow = selectedIds.has(itemLockKey);
                const creatorKey = String(item.employee_name || user?.name || '').toLowerCase().trim();
                const creatorUser = (item.user_id ? usersMap.get(Number(item.user_id)) : null) || usersByNameMap.get(creatorKey);
                const avatarUrl = creatorUser?.avatar_url || creatorUser?.avatar || (item as any).employee_avatar || (item as any).avatar_url || (item as any).avatar;

                return (
                  <div
                    key={`${item.type}-${item.id}`}
                    style={{
                      position: 'relative',
                      borderRadius: '14px',
                      overflow: 'hidden',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}
                  >
                    {/* Background swipe action reveal indicators */}
                    {isPendingAction && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          left: 0,
                          right: 0,
                          borderRadius: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0 16px',
                          background: 'linear-gradient(90deg, rgba(189, 29, 45, 0.14) 0%, rgba(241, 245, 249, 0.5) 50%, rgba(71, 85, 105, 0.14) 100%)',
                          border: '1px solid var(--color-border-light)',
                          pointerEvents: 'none',
                          zIndex: 1
                        }}
                      >
                        {/* Left reveal: Swipe Right -> Duyệt */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#BD1D2D', fontWeight: 750, fontSize: '0.82rem' }}>
                          <CheckCircle2 size={18} />
                          <span>Duyệt nhanh</span>
                        </div>
                        {/* Right reveal: Swipe Left -> Từ chối */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#334155', fontWeight: 750, fontSize: '0.82rem' }}>
                          <span>Từ chối</span>
                          <XCircle size={18} />
                        </div>
                      </div>
                    )}

                    <motion.div
                      drag={isPendingAction ? "x" : false}
                      dragConstraints={{ left: 0, right: 0 }}
                      dragElastic={0.45}
                      onDragEnd={(_, info) => {
                        if (!isPendingAction) return;
                        const threshold = Number(approvalPolicy?.swipe_threshold_px || 80);
                        if (info.offset.x > threshold) {
                          if (approvalPolicy?.mobile_swipe_require_confirm !== false) {
                            setItemToApprove(item);
                            setApproveConfirmOpen(true);
                          } else {
                            handleApprove(item);
                          }
                        } else if (info.offset.x < -threshold) {
                          openRejectModal(item);
                        }
                      }}
                      onClick={() => {
                        if (item.is_draft || item.status === 'draft') {
                          const d = draftsList.find(x => x.id === item.draft_id || String(x.id) === String(item.id));
                          if (d) { handleResumeDraft(d); return; }
                        }
                        setSelectedTimelineItem(item);
                      }}
                      style={{
                        background: 'var(--color-surface)',
                        borderRadius: '14px',
                        border: isSelectedRow ? '1.5px solid #BD1D2D' : '1px solid var(--color-border-light)',
                        padding: '12px 14px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        cursor: 'pointer',
                        WebkitTextSizeAdjust: '100%',
                        position: 'relative',
                        zIndex: 2,
                        touchAction: isPendingAction ? 'pan-y' : 'auto'
                      }}
                    >
                      {/* Swipe gesture hint badge for actionable cards */}
                      {isPendingAction && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.675rem',
                          background: '#f8fafc',
                          color: '#475569',
                          border: '1px dashed #cbd5e1',
                          borderRadius: '8px',
                          padding: '3px 8px',
                          margin: '-2px 0 2px 0',
                          userSelect: 'none'
                        }}>
                          <span style={{ color: '#BD1D2D', fontWeight: 600 }}>👉 Vuốt Phải: Duyệt</span>
                          <span style={{ color: '#334155', fontWeight: 600 }}>Vuốt Trái: Từ chối 👈</span>
                        </div>
                      )}

                      {/* Header: Icon + Creator name + Status Badge */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          {isPendingAction && (
                            <input
                              type="checkbox"
                              checked={isSelectedRow}
                              onClick={e => e.stopPropagation()}
                              onChange={() => toggleSelectItem(item)}
                              aria-label={t('Chọn đề xuất')}
                              style={{ width: '16px', height: '16px', accentColor: '#BD1D2D', cursor: 'pointer', flexShrink: 0 }}
                            />
                          )}
                          <div style={{
                            width: '30px', height: '30px', borderRadius: '8px',
                            background: 'var(--color-bg-secondary)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            {getTypeIcon(item.type, item.title)}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <Avatar src={avatarUrl} name={item.employee_name || user?.name} size={22} />
                            <span style={{ fontSize: '0.8125rem', fontWeight: 650, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.employee_name || user?.name}
                            </span>
                          </div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {formatBadge(item.status || 'pending', item)}
                        </div>
                      </div>

                      {/* Title & Description with explicit font sizes */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          color: 'var(--color-text)',
                          lineHeight: 1.35,
                          WebkitTextSizeAdjust: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '6px'
                        }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '1px 6px',
                            borderRadius: '5px',
                            background: 'var(--color-bg-secondary, #f1f5f9)',
                            border: '1px solid var(--color-border)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'var(--color-text-muted)',
                            lineHeight: '1.2'
                          }}>
                            #{item.id}
                          </span>
                          <span>{getApprovalDisplayTitle(item)}</span>
                        </div>
                        {getApprovalCardSubtitle(item) && (
                          <div style={{
                            fontSize: '0.75rem',
                            color: 'var(--color-text-muted)',
                            lineHeight: 1.4,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            WebkitTextSizeAdjust: '100%'
                          }}>
                            {getApprovalCardSubtitle(item)}
                          </div>
                        )}
                      </div>

                      {/* Steps & Watchers in mobile card */}
                      <div style={{ paddingTop: '4px' }}>
                        {renderWorkflowStepsAndWatchers(item)}
                      </div>

                      {/* Footer: Date, Approver, and Actions */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: '8px',
                        borderTop: '1px solid var(--color-border-light)',
                        fontSize: '0.72rem',
                        color: 'var(--color-text-muted)',
                        gap: '8px',
                        flexWrap: 'wrap'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span>{new Date(item.created_at).toLocaleDateString('vi-VN')} {new Date(item.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                          <span>•</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            {renderCurrentApprover(item)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                          {item.is_draft ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const d = draftsList.find(x => x.id === item.draft_id);
                                  if (d) handleResumeDraft(d);
                                }}
                                className="btn primary"
                                style={{ height: '26px', padding: '0 8px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 600 }}
                                title={t('Tiếp tục')}
                              >
                                <Edit3 size={11} />
                                <span>{t('Tiếp tục')}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (item.draft_id) handleDeleteDraft(item.draft_id);
                                }}
                                className="btn secondary"
                                style={{ height: '26px', width: '26px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'var(--color-danger)' }}
                                title={t('Xóa')}
                              >
                                <Trash2 size={12} />
                              </button>
                            </>
                          ) : (
                            <>
                              {isPendingAction && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openRejectModal(item);
                                    }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '3px',
                                      background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1',
                                      borderRadius: '6px', padding: '4px 8px', fontSize: '0.72rem',
                                      fontWeight: 700, cursor: 'pointer'
                                    }}
                                  >
                                    <XCircle size={12} />
                                    {t('Từ chối')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setItemToApprove(item);
                                      setApproveConfirmOpen(true);
                                    }}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: '3px',
                                      background: '#BD1D2D', color: 'white', border: 'none',
                                      borderRadius: '6px', padding: '4px 8px', fontSize: '0.72rem',
                                      fontWeight: 700, cursor: 'pointer'
                                    }}
                                  >
                                    <CheckCircle2 size={12} />
                                    {t('Duyệt')}
                                  </button>
                                </>
                              )}
                              {canEditItem && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleEditRequest(item);
                                  }}
                                  className="btn secondary"
                                  style={{ height: '26px', width: '26px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'var(--color-primary)' }}
                                  title={t('Chỉnh sửa')}
                                >
                                  <Edit size={12} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDuplicate(item);
                                }}
                                className="btn secondary"
                                style={{ height: '26px', width: '26px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
                                title={t('Nhân bản')}
                              >
                                <Copy size={12} />
                              </button>
                              {(isStrictAdmin || ((isCreator || isManagement(user) || isHR(user)) && item.status !== 'approved' && item.status !== 'completed')) && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRequest(item);
                                  }}
                                  className="btn secondary"
                                  style={{ height: '26px', width: '26px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'var(--color-danger)' }}
                                  title={t('Xóa')}
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="responsive-table-wrap" style={{
              background: 'var(--color-surface)',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              overflowX: 'auto',
              maxHeight: 'calc(100vh - 365px)',
              overflowY: 'auto',
              WebkitTextSizeAdjust: '100%',
              boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem', textAlign: 'left', WebkitTextSizeAdjust: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 15, background: '#ffffff' }}>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                    {activeTab === 'pending' && (
                      <th style={{ padding: '14px 8px 14px 16px', width: '36px', background: '#f8fafc', position: 'sticky', top: 0 }}>
                        <input
                          type="checkbox"
                          checked={allPageSelected}
                          onChange={toggleSelectAllPage}
                          disabled={pageSelectableKeys.length === 0}
                          aria-label={t('Chọn tất cả trang này')}
                          style={{ width: '15px', height: '15px', accentColor: '#BD1D2D', cursor: pageSelectableKeys.length > 0 ? 'pointer' : 'not-allowed' }}
                        />
                      </th>
                    )}
                    <th style={{ padding: '14px 16px', fontSize: '0.8125rem', minWidth: '380px', background: '#f8fafc', position: 'sticky', top: 0 }}>{t('Yêu cầu & Nội dung')}</th>
                    <th style={{ padding: '14px 16px', fontSize: '0.8125rem', minWidth: '190px', background: '#f8fafc', position: 'sticky', top: 0 }}>{t('Người tạo & Thời gian')}</th>
                    <th style={{ padding: '14px 16px', fontSize: '0.8125rem', minWidth: '220px', background: '#f8fafc', position: 'sticky', top: 0 }}>{t('Các bước & Người liên quan')}</th>
                    <th style={{ padding: '14px 16px', fontSize: '0.8125rem', minWidth: '170px', background: '#f8fafc', position: 'sticky', top: 0 }}>{t('Người duyệt')}</th>
                    <th style={{ padding: '14px 16px', fontSize: '0.8125rem', textAlign: 'right', minWidth: '110px', background: '#f8fafc', position: 'sticky', top: 0 }}>{t('Thao tác')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedList.map(item => {
                    const role = (user?.role || '').toLowerCase();
                    const userId = Number(user?.id || 0);
                    const isSuperAdmin = isExecutive(user);
                    
                    const creatorId = Number(item.user_id || (item as any)?.created_by || 0);
                    const isCreator = creatorId > 0 && creatorId === userId;
                    const isPrivilegedUser = isSuperAdmin || ['admin', 'superadmin', 'super_admin', 'director', 'manager', 'hr'].includes(String(user?.role || '').toLowerCase());
                    const canEditItem = (isCreator && ['pending', 'pending_approval', 'pending_manager', 'pending_hr', 'rejected', 'draft'].includes(String(item.status || 'pending').toLowerCase())) ||
                      (isPrivilegedUser && ['pending', 'pending_approval', 'pending_manager', 'pending_hr', 'rejected', 'draft'].includes(String(item.status || 'pending').toLowerCase()));

                    const isPendingAction = activeTab === 'pending' && isItemAtMyStepToApprove(item);
                    const rowLockKey = `${item.type}_${item.id}`;
                    const isSelectedRow = selectedIds.has(rowLockKey);

                    return (
                      <tr 
                        key={`${item.type}-${item.id}`} 
                        onClick={() => {
                          if (item.is_draft || item.status === 'draft') {
                            const d = draftsList.find(x => x.id === item.draft_id || String(x.id) === String(item.id));
                            if (d) {
                              handleResumeDraft(d);
                              return;
                            }
                          }
                          setSelectedTimelineItem(item);
                        }}
                        style={{ borderBottom: '1px solid var(--color-border-light)', cursor: 'pointer', transition: 'background 0.2s', background: isSelectedRow ? 'rgba(189, 29, 45, 0.04)' : 'transparent' }}
                        onMouseEnter={e => e.currentTarget.style.background = isSelectedRow ? 'rgba(189, 29, 45, 0.06)' : 'var(--color-bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = isSelectedRow ? 'rgba(189, 29, 45, 0.04)' : 'transparent'}
                      >
                        {activeTab === 'pending' && (
                          <td style={{ padding: '14px 8px 14px 16px' }} onClick={e => e.stopPropagation()}>
                            {isPendingAction && (
                              <input
                                type="checkbox"
                                checked={isSelectedRow}
                                onChange={() => toggleSelectItem(item)}
                                aria-label={t('Chọn đề xuất')}
                                style={{ width: '15px', height: '15px', accentColor: '#BD1D2D', cursor: 'pointer' }}
                              />
                            )}
                          </td>
                        )}
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <div style={{
                              width: '32px', height: '32px', borderRadius: '8px',
                              background: 'var(--color-bg-secondary)', display: 'flex',
                              alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              {getTypeIcon(item.type, item.title)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text)', WebkitTextSizeAdjust: '100%', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  padding: '1px 6px',
                                  borderRadius: '5px',
                                  background: 'var(--color-bg-secondary, #f1f5f9)',
                                  border: '1px solid var(--color-border)',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  color: 'var(--color-text-muted)',
                                  lineHeight: '1.2'
                                }}>
                                  #{item.id}
                                </span>
                                <span>{getApprovalDisplayTitle(item)}</span>
                              </div>
                              {getApprovalCardSubtitle(item) && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '2px', WebkitTextSizeAdjust: '100%' }}>{getApprovalCardSubtitle(item)}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {(() => {
                            const creatorKey = String(item.employee_name || user?.name || '').toLowerCase().trim();
                            const creatorUser = (item.user_id ? usersMap.get(Number(item.user_id)) : null) || usersByNameMap.get(creatorKey);
                            const avatarUrl = creatorUser?.avatar_url || creatorUser?.avatar || (item as any).employee_avatar || (item as any).avatar_url || (item as any).avatar;
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Avatar src={avatarUrl} name={item.employee_name || user?.name} size={28} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 600 }}>{item.employee_name || user?.name}</span>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                    {new Date(item.created_at).toLocaleString('vi-VN')}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          {renderWorkflowStepsAndWatchers(item)}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                            {renderCurrentApprover(item)}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            {item.is_draft ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const d = draftsList.find(x => x.id === item.draft_id);
                                    if (d) handleResumeDraft(d);
                                  }}
                                  className="btn primary"
                                  style={{ height: '28px', padding: '0 10px', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}
                                  title={t('Tiếp tục chỉnh sửa')}
                                >
                                  <Edit3 size={12} />
                                  <span>{t('Tiếp tục')}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.draft_id) handleDeleteDraft(item.draft_id);
                                  }}
                                  className="btn secondary"
                                  style={{ height: '28px', width: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'var(--color-danger)' }}
                                  title={t('Xóa bản nháp')}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {isPendingAction && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openRejectModal(item);
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          background: '#f1f5f9',
                                          color: '#334155',
                                          border: '1px solid #cbd5e1',
                                          borderRadius: '6px',
                                          padding: '5px 10px',
                                          fontSize: '0.75rem',
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <XCircle size={12} />
                                        {t('Từ chối')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setItemToApprove(item);
                                          setApproveConfirmOpen(true);
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          background: '#BD1D2D',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '6px',
                                          padding: '5px 10px',
                                          fontSize: '0.75rem',
                                          fontWeight: 700,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <CheckCircle2 size={12} />
                                        {t('Duyệt')}
                                      </button>
                                    </>
                                  )}
                                  {canEditItem && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditRequest(item);
                                      }}
                                      className="btn secondary"
                                      style={{ height: '28px', width: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'var(--color-primary)' }}
                                      title={t('Chỉnh sửa')}
                                    >
                                      <Edit size={12} />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDuplicate(item);
                                    }}
                                    className="btn secondary"
                                    style={{ height: '28px', width: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
                                    title={t('Nhân bản')}
                                  >
                                    <Copy size={12} />
                                  </button>
                                  {(isStrictAdmin || ((isCreator || isManagement(user) || isHR(user)) && item.status !== 'approved' && item.status !== 'completed')) && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteRequest(item);
                                      }}
                                      className="btn secondary"
                                      style={{ height: '28px', width: '28px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', color: 'var(--color-danger)' }}
                                      title={t('Xóa đơn/đề xuất')}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <Pagination 
                total={currentList.length}
                page={page}
                pageSize={pageSize}
                onChange={(p) => setPage(p)}
              />
            </div>
          );
        })()}

      {/* Reject Modal */}
      {rejectModalOpen && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: uiMotion?.z_modal_nested || 2147483646
        }}>
          <div className="card" style={{ width: '450px', maxWidth: '92vw', padding: '1.5rem', background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem', color: '#BD1D2D' }}>
              {t('Từ chối Yêu cầu')}
            </h3>
            <form onSubmit={handleRejectSubmit}>
              <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
                {t('Vui lòng cung cấp lý do từ chối cho nhân viên:')}
              </p>
              <textarea
                className="form-input"
                style={{ height: 100, resize: 'none', marginBottom: '1.5rem' }}
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder={t('Ví dụ: Không hợp lệ hoặc thiếu chứng từ...')}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setRejectModalOpen(false)} disabled={isSubmittingReject} className="btn secondary">
                  {t('Hủy')}
                </button>
                <button type="submit" disabled={isSubmittingReject} className="btn primary" style={{ background: '#BD1D2D', borderColor: '#BD1D2D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {isSubmittingReject && <RefreshCw size={14} className="spin" />}
                  {isSubmittingReject ? t('Đang từ chối...') : t('Xác nhận từ chối')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Batch Reject Modal */}
      {batchRejectModalOpen && createPortal(
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.55)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: uiMotion?.z_modal_nested || 2147483646
        }}>
          <div className="card" style={{ width: '450px', maxWidth: '92vw', padding: '1.5rem', background: 'var(--color-surface)', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.75rem', color: '#BD1D2D' }}>
              {t('Từ chối hàng loạt')} ({selectedItems.length} {t('đề xuất')})
            </h3>
            <form onSubmit={handleBatchRejectSubmit}>
              <p style={{ fontSize: '0.85rem', marginBottom: '0.85rem', color: '#64748b' }}>
                {t('Lý do từ chối chung sẽ được gửi tới các đề xuất đã chọn:')}
              </p>
              <textarea
                className="form-input"
                style={{ height: 100, resize: 'none', marginBottom: '1.25rem' }}
                value={batchRejectReason}
                onChange={e => setBatchRejectReason(e.target.value)}
                placeholder={t('Nhập lý do từ chối...')}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" onClick={() => setBatchRejectModalOpen(false)} disabled={batchSubmitting} className="btn secondary">
                  {t('Hủy')}
                </button>
                <button type="submit" disabled={batchSubmitting} className="btn primary" style={{ background: '#BD1D2D', borderColor: '#BD1D2D', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {batchSubmitting && <RefreshCw size={14} className="spin" />}
                  {batchSubmitting ? t('Đang xử lý...') : `${t('Xác nhận từ chối')} (${selectedItems.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Custom Approve Confirmation Modal */}
      {approveConfirmOpen && itemToApprove && createPortal((() => {
        const creatorUser = (itemToApprove.user_id ? usersMap.get(Number(itemToApprove.user_id)) : null)
          || usersByNameMap.get(String(itemToApprove.employee_name || '').toLowerCase().trim())
          || users.find(u => String(u.full_name) === String(itemToApprove.employee_name) || String(u.name) === String(itemToApprove.employee_name));
        const avatarUrl = creatorUser?.avatar_url || creatorUser?.avatar || (itemToApprove as any).employee_avatar || (itemToApprove as any).avatar_url || (itemToApprove as any).avatar;
        const displayRole = creatorUser?.role ? (creatorUser.role === 'sales' ? 'Phòng Kinh doanh' : creatorUser.role === 'accountant' ? 'Phòng Kế toán' : creatorUser.role) : 'Nhân viên';
        
        const formatApprovalDescription = (desc: string) => {
          if (!desc) return <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>—</span>;

          const timeMatch = desc.match(/Thời gian:\s*([0-9\-\:\s]+)\s*->\s*([0-9\-\:\s]+)(?:\s*\(([^)]+)\))?/i);
          const otCalcMatch = desc.match(/\(([^)]*(?:giờ|công|OT)[^)]*)\)/i);
          const otCalcInfo = otCalcMatch ? otCalcMatch[1] : null;

          let cleanReason = '';
          const lastReasonIdx = desc.lastIndexOf('Lý do:');
          if (lastReasonIdx !== -1) {
            cleanReason = desc.substring(lastReasonIdx + 6).trim().replace(/^["'\s]+|["'\s]+$/g, '');
          }

          if (timeMatch) {
            const fromTime = timeMatch[1].trim();
            const toTime = timeMatch[2].trim();
            const duration = timeMatch[3] || '';

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'rgba(59, 130, 246, 0.08)',
                    color: '#2563eb',
                    fontWeight: 700,
                    fontSize: '0.78rem'
                  }}>
                    <Clock size={12} /> {fromTime} → {toTime}
                  </span>
                  {(otCalcInfo || duration) && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      background: 'rgba(2, 132, 199, 0.1)',
                      color: '#0284c7',
                      fontWeight: 700,
                      fontSize: '0.78rem'
                    }}>
                      <Zap size={12} /> {otCalcInfo || duration}
                    </span>
                  )}
                </div>
                {cleanReason && (
                  <div style={{
                    marginTop: '2px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border-light)',
                    fontSize: '0.825rem',
                    color: 'var(--color-text)',
                    lineHeight: 1.45
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', marginRight: '6px' }}>
                      {t('Lý do')}:
                    </span>
                    {cleanReason}
                  </div>
                )}
              </div>
            );
          }

          const cleanedText = desc.replace(/Lý do:\s*"?\[.*?\]\s*/i, 'Lý do: ').replace(/^"/, '').replace(/"$/, '');
          return (
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text)', lineHeight: 1.5, fontWeight: 500 }}>
              {cleanedText}
            </span>
          );
        };

        return (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2147483646,
              padding: isMobile ? '12px' : '1.5rem'
            }}
            onClick={() => setApproveConfirmOpen(false)}
          >
            <div 
              style={{
                background: 'var(--color-surface)',
                width: '100%',
                maxWidth: '480px',
                borderRadius: '20px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--color-border-light)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                maxHeight: isMobile ? '90vh' : '85vh'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button 
                onClick={() => setApproveConfirmOpen(false)}
                style={{
                  position: 'absolute',
                  top: '18px',
                  right: '18px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease',
                  zIndex: 10
                }}
              >
                <X size={18} />
              </button>

              {/* Modal Body */}
              <div style={{ padding: isMobile ? '1.25rem 1.25rem 1rem 1.25rem' : '2rem', overflowY: 'auto' }}>
                <h3 style={{
                  fontSize: isMobile ? '1.05rem' : '1.2rem',
                  fontWeight: 800,
                  color: 'var(--color-text)',
                  marginBottom: isMobile ? '1rem' : '1.5rem',
                  lineHeight: 1.3
                }}>
                  {t('Chi tiết & Xác nhận phê duyệt')}
                </h3>

                {/* Creator Avatar & Info Block */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  background: 'var(--color-bg)',
                  padding: '12px 16px',
                  borderRadius: '14px',
                  border: '1px solid var(--color-border-light)',
                  marginBottom: isMobile ? '1rem' : '1.25rem'
                }}>
                  <Avatar src={avatarUrl} name={itemToApprove.employee_name} size={44} />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.92rem' }}>
                      {itemToApprove.employee_name}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      {displayRole} • {new Date(itemToApprove.created_at).toLocaleString('vi-VN')}
                    </span>
                  </div>
                </div>

                {/* Details Section */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {t('Tên đề xuất')}
                    </label>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--color-text)', marginTop: '3px' }}>
                      {itemToApprove.title}
                    </div>
                  </div>

                  <div style={{
                    background: 'rgba(16, 185, 129, 0.04)',
                    border: '1px solid rgba(16, 185, 129, 0.12)',
                    padding: '14px',
                    borderRadius: '12px',
                    marginTop: '4px'
                  }}>
                    <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>
                      {t('Chi tiết yêu cầu')}
                    </label>
                    {formatApprovalDescription(itemToApprove.description || '')}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{
                background: 'var(--color-bg)',
                padding: isMobile ? '1rem 1.25rem calc(env(safe-area-inset-bottom, 20px) + 20px) 1.25rem' : '1.25rem 2rem',
                borderTop: '1px solid var(--color-border-light)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '12px',
                flexShrink: 0
              }}>
                <button 
                  onClick={() => {
                    setApproveConfirmOpen(false);
                    setSelectedTimelineItem(itemToApprove);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    padding: '8px 16px',
                    fontSize: '0.825rem',
                    borderRadius: '10px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Eye size={14} />
                  {t('Xem chi tiết')}
                </button>

                <button 
                  onClick={async () => {
                    await handleApprove(itemToApprove);
                    setApproveConfirmOpen(false);
                  }}
                  disabled={actionLoadingId === `${itemToApprove.type}_${itemToApprove.id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    background: '#BD1D2D',
                    border: 'none',
                    color: '#ffffff',
                    padding: '10px 24px',
                    fontSize: '0.875rem',
                    borderRadius: '10px',
                    fontWeight: 700,
                    cursor: actionLoadingId === `${itemToApprove.type}_${itemToApprove.id}` ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: '0 4px 12px rgba(189, 29, 45, 0.25)',
                    opacity: actionLoadingId === `${itemToApprove.type}_${itemToApprove.id}` ? 0.7 : 1
                  }}
                >
                  {actionLoadingId === `${itemToApprove.type}_${itemToApprove.id}` ? <RefreshCw size={16} className="spin" /> : <CheckCircle2 size={16} />}
                  {actionLoadingId === `${itemToApprove.type}_${itemToApprove.id}` ? t('Đang duyệt...') : t('Phê duyệt')}
                </button>
              </div>
            </div>
          </div>
        );
      })(), document.body)}

      {/* Progress Timeline Drawer */}
      {selectedTimelineItem && (
        <ApprovalDetailDrawer
          item={selectedTimelineItem}
          onClose={() => {
            setSelectedTimelineItem(null);
            setHighlightedCommentId(null);
            pendingOpenRef.current = null;
            clearApprovalUrlParams();
          }}
          users={users}
          t={t}
          onApprove={handleApprove}
          onReject={openRejectModal}
          isAdmin={isAdmin && activeTab === 'pending'}
          onDuplicate={handleDuplicate}
          onEdit={handleEditRequest}
          onDelete={handleDeleteRequest}
          zIndex={uiMotion?.z_drawer || 2147483625}
          highlightCommentId={highlightedCommentId}
        />
      )}

      {/* Creation and Directory Portals */}
      {showCreateModal && createPortal((() => {
        const filteredWorkflows = workflowList.filter(wf => {
          const matchesSearch = wf.name.toLowerCase().includes(directorySearch.toLowerCase()) || 
                                wf.description.toLowerCase().includes(directorySearch.toLowerCase());
          const matchesCategory = selectedCategoryFilter === 'all' || wf.category === selectedCategoryFilter;
          return matchesSearch && matchesCategory;
        });

        // Dynamic table calculations
        const itemsTotalBeforeTax = expenseItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.price) || 0)), 0);
        const itemsTotalVat = expenseItems.reduce((acc, it) => {
          const lineBase = (Number(it.quantity) || 1) * (Number(it.price) || 0);
          const lineVat = currencyType === 'VND' 
            ? Math.round(lineBase * (Number(it.vat) || 0) / 100) 
            : (lineBase * (Number(it.vat) || 0) / 100);
          return acc + lineVat;
        }, 0);
        const itemsGrandTotal = itemsTotalBeforeTax + itemsTotalVat;

        // Custom template selection default timeline mapping
        const selectedTemplate = 'standard';
        
        let defaultApp1 = null;
        if (selectedWorkflowDef?.id === 'stationery') {
          defaultApp1 = getDefaultHrLeader();
        } else {
          defaultApp1 = getDefaultManagerApprover(proposerUser || user, selectedWorkflowDef);
        }
        const app1User = customApprover1 || defaultApp1;
        const app1Name = app1User?.full_name || app1User?.name || t('Phê duyệt');
        const app1Avatar = app1User?.avatar_url || app1User?.avatar;

        const accountantUser = customApprover2 || defaultAccountant;
        const accountantName = accountantUser?.full_name || accountantUser?.name || t('Phê duyệt');
        const accountantAvatar = accountantUser?.avatar_url || accountantUser?.avatar;

        const directorUser = customApprover3 || defaultDirector;
        const directorName = directorUser?.full_name || directorUser?.name || t('Phê duyệt');
        const directorAvatar = directorUser?.avatar_url || directorUser?.avatar;

        return (
          <>
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
              }
              @keyframes slideIn {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
              }
              @keyframes zoomIn {
                from { opacity: 0; transform: scale(0.95); }
                to { opacity: 1; transform: scale(1); }
              }
            `}</style>
            {!selectedWorkflowDef ? (
              /* 1. POPUP MODE (Workflow template directory list - styled exactly like Menu điều hướng nhanh) */
              <div style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 2147483645,
                animation: 'fadeIn 0.2s ease-out',
                padding: isMobile ? '0.75rem' : '1rem'
              }} onClick={() => {
                setShowCreateModal(false);
                setSelectedWorkflowDef(null);
              }}>
                <div style={{
                  width: isMobile ? '96%' : '1160px',
                  maxWidth: '100%',
                  maxHeight: isMobile ? '85vh' : '90vh',
                  background: 'var(--color-surface)',
                  boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: isMobile ? '14px' : '16px',
                  overflow: 'hidden',
                  border: '1px solid var(--color-border)',
                  animation: 'zoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                  position: 'relative'
                }} onClick={e => e.stopPropagation()}>
                  
                  {/* Modal Header */}
                  <div style={{
                    padding: isMobile ? '12px 16px' : '1.25rem 1.5rem',
                    borderBottom: '1px solid var(--color-border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    background: 'var(--color-surface)'
                  }}>
                    <h3 style={{ margin: 0, fontSize: isMobile ? '0.9rem' : '1.1rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                      {t('Quy trình & Đề xuất')}
                    </h3>



                    <button className="hover-lift" onClick={() => {
                      setShowCreateModal(false);
                      setSelectedWorkflowDef(null);
                    }} style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      padding: isMobile ? '4px' : '6px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      color: 'var(--color-text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: isMobile ? '28px' : '32px',
                      width: isMobile ? '28px' : '32px'
                    }}>
                      <X size={isMobile ? 14 : 16} />
                    </button>
                  </div>

                  {/* Body - Grouped list like Menu điều hướng nhanh */}
                  <div className="custom-scrollbar" style={{
                    flex: 1,
                    padding: isMobile ? '16px 16px 24px 16px' : '1.5rem 2rem 2.5rem 2rem',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: isMobile ? '1.5rem' : '2rem',
                    background: 'var(--color-surface)'
                  }}>

                    {/* If search query entered, show search results */}
                    {directorySearch.trim() && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
                            {t('Kết quả tìm kiếm')} ({filteredWorkflows.length})
                          </span>
                          <button
                            type="button"
                            onClick={() => setDirectorySearch('')}
                            style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', fontSize: '0.72rem', cursor: 'pointer' }}
                          >
                            {t('Xóa tìm kiếm')}
                          </button>
                        </div>
                        {filteredWorkflows.length === 0 ? (
                          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                            {t('Không tìm thấy quy trình phù hợp với')} "{directorySearch}"
                          </div>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                            {filteredWorkflows.map(item => {
                              const colors = getWorkflowColor(item.color);
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => onSelectWorkflowItem(item)}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '12px',
                                    padding: '10px 14px',
                                    borderRadius: '12px',
                                    cursor: 'pointer',
                                    border: '1px solid var(--color-border-light)',
                                    background: 'var(--color-bg)',
                                    transition: 'all 0.15s ease'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border-light)'}
                                >
                                  <div style={{
                                    width: '36px',
                                    height: '36px',
                                    borderRadius: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    filter: 'drop-shadow(0 3px 6px rgba(15, 23, 42, 0.14))',
                                    flexShrink: 0
                                  }}>
                                    <AppIcon name={`wf_${item.id}`} size={36} />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>{item.name}</span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        <div style={{ height: '1px', background: 'var(--color-border-light)', margin: '1.5rem 0' }} />
                      </div>
                    )}

                    {/* Category: TÀI CHÍNH & KẾ TOÁN */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: isMobile ? '10px' : '1.25rem', paddingLeft: '4px' }}>
                        <div style={{ width: '4px', height: '14px', background: 'var(--color-primary, #a31422)', borderRadius: '2px' }} />
                        <span style={{ fontSize: isMobile ? '0.75rem' : '0.75rem', fontWeight: 800, color: 'var(--color-text, #111827)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                          {t('Tài chính & Kế toán')}
                        </span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--color-border-light)' }} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: isMobile ? '8px' : '12px 24px' }}>
                        {workflowList.filter(w => w.category === 'finance').map(item => {
                          const colors = getWorkflowColor(item.color);
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                onSelectWorkflowItem(item);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: isMobile ? '12px' : '12px',
                                padding: isMobile ? '10px 12px' : '8px 12px',
                                borderRadius: isMobile ? '10px' : '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                border: 'none',
                                background: 'transparent'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = colors.hoverBg || 'rgba(0, 0, 0, 0.03)';
                                const iconEl = e.currentTarget.querySelector('.workflow-icon-circle') as HTMLElement;
                                if (iconEl) {
                                  iconEl.style.transform = 'scale(1.08)';
                                  iconEl.style.filter = 'drop-shadow(0 6px 14px rgba(15, 23, 42, 0.24))';
                                }
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                                const iconEl = e.currentTarget.querySelector('.workflow-icon-circle') as HTMLElement;
                                if (iconEl) {
                                  iconEl.style.transform = 'scale(1)';
                                  iconEl.style.filter = 'drop-shadow(0 3px 7px rgba(15, 23, 42, 0.14))';
                                }
                              }}
                            >
                              <div 
                                className="workflow-icon-circle"
                                style={{
                                  width: isMobile ? '36px' : '38px',
                                  height: isMobile ? '36px' : '38px',
                                  borderRadius: '11px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  filter: 'drop-shadow(0 3px 7px rgba(15, 23, 42, 0.14))',
                                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                              >
                                <AppIcon name={`wf_${item.id}`} size={isMobile ? 36 : 38} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: isMobile ? '0.875rem' : '0.85rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                                {!isMobile && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</span>
                                )}
                              </div>
                              {isMobile && (
                                <ChevronRight size={15} color="var(--color-text-muted)" style={{ opacity: 0.45, marginLeft: 'auto', flexShrink: 0 }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category: NHÂN SỰ & QUY TRÌNH */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: isMobile ? '10px' : '1.25rem', paddingLeft: '4px' }}>
                        <div style={{ width: '4px', height: '14px', background: 'var(--color-primary, #a31422)', borderRadius: '2px' }} />
                        <span style={{ fontSize: isMobile ? '0.75rem' : '0.75rem', fontWeight: 800, color: 'var(--color-text, #111827)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                          {t('Nhân sự & Quy trình')}
                        </span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--color-border-light)' }} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: isMobile ? '8px' : '12px 24px' }}>
                        {workflowList.filter(w => w.category === 'hr').map(item => {
                          const colors = getWorkflowColor(item.color);
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                const today = getTodayDateString();
                                setLeaveFrom(today);
                                setLeaveTo(today);
                                setOtDate(today);
                                setIntermittentDates([{ date: today, session: 'full' }]);
                                setSelectedWorkflowDef(item);
                                if (item.id === 'leave_late') {
                                  setFormType('leave');
                                } else if (item.id === 'attendance_bulk') {
                                  setFormType('attendance_bulk');
                                  const isManager = ['manager', 'director', 'admin', 'superadmin', 'super_admin', 'leader', 'truongphong', 'head_of_department'].includes(String(user?.role).toLowerCase()) || Boolean((user as any)?.is_team_leader);
                                  if (isManager) {
                                    setRelatedUserIds([]);
                                    setCustomApprover1(user);
                                  }
                                  const initMonth = getDefaultBulkMonth();
                                  setBulkMonth(initMonth);
                                  const userDefaultIn = (user as any)?.work_start_time ? String((user as any).work_start_time).substring(0, 5) : '08:00';
                                  const userDefaultOut = (user as any)?.work_end_time ? String((user as any).work_end_time).substring(0, 5) : '17:00';
                                  setSuggestedDays([{
                                    date: today,
                                    check_in: userDefaultIn,
                                    check_out: userDefaultOut,
                                    has_check_in: false,
                                    has_check_out: false,
                                    is_on_leave: false,
                                    disabled: false,
                                    reason: '',
                                    is_manual: true
                                  }]);
                                } else if (item.id === 'late_early') {
                                  setFormType('late_early');
                                  setLateEarlyType('late');
                                  setLateEarlyMinutes(30);
                                  const userDefaultIn = (user as any)?.work_start_time ? String((user as any).work_start_time).substring(0, 5) : '08:00';
                                  setOtStart(userDefaultIn);
                                } else if (item.id === 'overtime') {
                                  setFormType('overtime');
                                } else if (item.id === 'remote_work') {
                                  setFormType('remote_work');
                                  setWfhSalaryRate(50);
                                } else if (item.id === 'recruitment') {
                                  setFormType('recruitment');
                                  setRecruitmentJobTitle('');
                                  setRecruitmentHeadcount(1);
                                  setRecruitmentDepartment(departmentName || (user as any)?.department || (user as any)?.team_name || '');
                                  setRecruitmentJobType('full_time');
                                  setRecruitmentReason('expansion');
                                  setRecruitmentReplacementWho('');
                                  setRecruitmentSalaryMin('');
                                  setRecruitmentSalaryMax('');
                                  setRecruitmentSalaryNegotiable(false);
                                  setRecruitmentExpectedDate(getTodayDateString());
                                  setRecruitmentRequirements('');
                                  setRecruitmentDescription('');
                                  setShowStepManager(true);
                                  setShowStepAccountant(false);
                                  setShowStepDirector(true);
                                  const defaultApprover = getDefaultManagerApprover(proposerUser || user, item);
                                  if (defaultApprover) setCustomApprover1(defaultApprover);
                                  if (defaultDirector) setCustomApprover3(defaultDirector);
                                  setCustomApprover2(null);
                                } else {
                                  setFormType('general');
                                }
                                setExpenseTitle(item.name);
                                handleSelectWorkflow(item.id);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: isMobile ? '12px' : '12px',
                                padding: isMobile ? '10px 12px' : '8px 12px',
                                borderRadius: isMobile ? '10px' : '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                border: 'none',
                                background: 'transparent'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = colors.hoverBg || 'rgba(0, 0, 0, 0.03)';
                                const iconEl = e.currentTarget.querySelector('.workflow-icon-circle') as HTMLElement;
                                if (iconEl) {
                                  iconEl.style.transform = 'scale(1.08)';
                                  iconEl.style.filter = 'drop-shadow(0 6px 14px rgba(15, 23, 42, 0.24))';
                                }
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                                const iconEl = e.currentTarget.querySelector('.workflow-icon-circle') as HTMLElement;
                                if (iconEl) {
                                  iconEl.style.transform = 'scale(1)';
                                  iconEl.style.filter = 'drop-shadow(0 3px 7px rgba(15, 23, 42, 0.14))';
                                }
                              }}
                            >
                              <div 
                                className="workflow-icon-circle"
                                style={{
                                  width: isMobile ? '36px' : '38px',
                                  height: isMobile ? '36px' : '38px',
                                  borderRadius: '11px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  filter: 'drop-shadow(0 3px 7px rgba(15, 23, 42, 0.14))',
                                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                              >
                                <AppIcon name={`wf_${item.id}`} size={isMobile ? 36 : 38} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: isMobile ? '0.875rem' : '0.85rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                                {!isMobile && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</span>
                                )}
                              </div>
                              {isMobile && (
                                <ChevronRight size={15} color="var(--color-text-muted)" style={{ opacity: 0.45, marginLeft: 'auto', flexShrink: 0 }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category: HÀNH CHÍNH & TÀI SẢN */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: isMobile ? '10px' : '1.25rem', paddingLeft: '4px' }}>
                        <div style={{ width: '4px', height: '14px', background: 'var(--color-primary, #a31422)', borderRadius: '2px' }} />
                        <span style={{ fontSize: isMobile ? '0.75rem' : '0.75rem', fontWeight: 800, color: 'var(--color-text, #111827)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                          {t('Hành chính & Thiết bị')}
                        </span>
                        <div style={{ flex: 1, height: '1px', background: 'var(--color-border-light)' }} />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(300px, 1fr))', gap: isMobile ? '8px' : '12px 24px' }}>
                        {workflowList.filter(w => w.category === 'admin').map(item => {
                          const colors = getWorkflowColor(item.color);
                          return (
                            <div
                              key={item.id}
                              onClick={() => {
                                  setSelectedWorkflowDef(item);
                                  setFormType('general');
                                  setExpenseTitle(item.name);
                                  handleSelectWorkflow(item.id);
                              }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: isMobile ? '12px' : '12px',
                                padding: isMobile ? '10px 12px' : '8px 12px',
                                borderRadius: isMobile ? '10px' : '12px',
                                cursor: 'pointer',
                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                border: 'none',
                                background: 'transparent'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = colors.hoverBg || 'rgba(0, 0, 0, 0.03)';
                                const iconEl = e.currentTarget.querySelector('.workflow-icon-circle') as HTMLElement;
                                if (iconEl) {
                                  iconEl.style.transform = 'scale(1.08)';
                                  iconEl.style.filter = 'drop-shadow(0 6px 14px rgba(15, 23, 42, 0.24))';
                                }
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'transparent';
                                const iconEl = e.currentTarget.querySelector('.workflow-icon-circle') as HTMLElement;
                                if (iconEl) {
                                  iconEl.style.transform = 'scale(1)';
                                  iconEl.style.filter = 'drop-shadow(0 3px 7px rgba(15, 23, 42, 0.14))';
                                }
                              }}
                            >
                              <div 
                                className="workflow-icon-circle"
                                style={{
                                  width: isMobile ? '36px' : '38px',
                                  height: isMobile ? '36px' : '38px',
                                  borderRadius: '11px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0,
                                  filter: 'drop-shadow(0 3px 7px rgba(15, 23, 42, 0.14))',
                                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
                                }}
                              >
                                <AppIcon name={`wf_${item.id}`} size={isMobile ? 36 : 38} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: isMobile ? '0.875rem' : '0.85rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                                {!isMobile && (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</span>
                                )}
                              </div>
                              {isMobile && (
                                <ChevronRight size={15} color="var(--color-text-muted)" style={{ opacity: 0.45, marginLeft: 'auto', flexShrink: 0 }} />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                </div>
              </div>
            ) : (
              /* 2. DETAILED CREATION DRAWER MODE (Workspace Form edit mode) - aligned next to sidebar exactly like WorkspaceTaskDrawer */
              <>
                <motion.div
                  className="drawer-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: (uiMotion?.drawer_ms || 220) / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                  onClick={() => {
                    handleRequestExit('close');
                  }}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: (uiMotion?.z_drawer || 2147483625) - 5,
                    '--drawer-backdrop-z': (uiMotion?.z_drawer || 2147483625) - 5,
                    background: 'rgba(0, 0, 0, 0.45)',
                    backdropFilter: 'blur(8px)',
                    WebkitBackdropFilter: 'blur(8px)'
                  } as React.CSSProperties}
                />

                <motion.div
                  className="drawer-sheet drawer-panel"
                  initial={isMobile ? { y: '100%' } : { opacity: 0, x: '250px' }}
                  animate={{ y: 0, x: 0, opacity: 1 }}
                  exit={isMobile ? { y: '100%' } : { opacity: 0, x: '250px' }}
                  transition={{ duration: (uiMotion?.drawer_ms || 220) / 1000, ease: [0.25, 0.1, 0.25, 1] }}
                  style={{
                    position: 'fixed',
                    top: 0,
                    bottom: 0,
                    left: isMobile ? 0 : 'var(--sidebar-width, 220px)',
                    right: 0,
                    background: 'linear-gradient(180deg, var(--color-bg) 0%, var(--color-border-light) 100%)',
                    boxShadow: '-10px 0 30px rgba(0,0,0,0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    boxSizing: 'border-box',
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    overflow: 'hidden',
                    zIndex: 2147483625,
                    '--drawer-panel-z': 2147483625
                  } as React.CSSProperties}
                >
                  
                  {/* Drawer Header styled EXACTLY like WorkspaceTaskDrawer */}
                  <div style={{
                    padding: isMobile ? '10px 14px' : '1.25rem 1.5rem',
                    borderBottom: '1px solid var(--color-border-light)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--color-surface)',
                    zIndex: 1000,
                    position: 'sticky',
                    top: 0,
                    flexShrink: 0
                  }}>
                    <div style={{ display: 'flex', gap: isMobile ? '8px' : '12px', alignItems: 'center', minWidth: 0, flex: 1 }}>
                      {isMobile && (
                        <button
                          type="button"
                          onClick={() => handleRequestExit('back')}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '6px',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                        >
                          <ArrowLeft size={18} />
                        </button>
                      )}
                      <div style={{
                        width: isMobile ? '34px' : '40px',
                        height: isMobile ? '34px' : '40px',
                        borderRadius: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'rgba(163, 20, 34, 0.08)',
                        color: 'var(--color-primary)',
                        flexShrink: 0
                      }}>
                        <FileSignature size={isMobile ? 18 : 20} />
                      </div>
                      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0 }}>
                          <span style={{ fontSize: isMobile ? '0.95rem' : '1.1rem', fontWeight: 800, color: 'var(--color-text)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {selectedWorkflowDef.name}
                          </span>
                          <span style={{ color: 'var(--color-text-muted)', fontWeight: 400, flexShrink: 0 }}>—</span>
                          
                          {/* Directly editable title suffix in Header */}
                          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', flex: 1, minWidth: isMobile ? '160px' : '260px', maxWidth: '520px' }}>
                            <input
                              type="text"
                              value={workflowTitleSuffix}
                              onChange={e => {
                                setWorkflowTitleSuffix(e.target.value);
                                setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, e.target.value));
                              }}
                              placeholder={
                                formType === 'leave' ? t('Nhập nội dung xin nghỉ (VD: Nghỉ việc gia đình, Nghỉ khám bệnh...)') :
                                formType === 'late_early' ? t('Nhập lý do đi trễ / về sớm...') :
                                formType === 'overtime' ? t('Nhập nội dung tăng ca...') :
                                formType === 'remote_work' ? t('Nhập lý do làm việc từ xa...') :
                                formType === 'advance' ? t('Nhập mục đích tạm ứng...') :
                                t('Nhập nội dung đề xuất (VD: In ấn, thi công Lễ tốt nghiệp...)')
                              }
                              style={{
                                width: '100%',
                                height: '34px',
                                padding: '2px 12px',
                                fontSize: isMobile ? '0.85rem' : '0.92rem',
                                fontWeight: 700,
                                color: 'var(--color-text, #0f172a)',
                                background: 'var(--color-bg-secondary, #f8fafc)',
                                border: '1.5px solid var(--color-border)',
                                borderRadius: '8px',
                                outline: 'none',
                                transition: 'all 0.15s ease'
                              }}
                              onFocus={e => {
                                e.currentTarget.style.borderColor = 'var(--color-primary)';
                                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(163, 20, 34, 0.12)';
                              }}
                              onBlur={e => {
                                e.currentTarget.style.borderColor = 'var(--color-border)';
                                e.currentTarget.style.boxShadow = 'none';
                              }}
                            />
                          </div>

                          <span className={editingItemId ? "badge info" : "badge warning"} style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: '6px', textTransform: 'uppercase', flexShrink: 0 }}>
                            {editingItemId ? t('CHỈNH SỬA') : t('MỚI')}
                          </span>
                        </div>
                      </div>
                    </div>

                    {!isMobile ? (
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                        <button 
                          type="button" 
                          onClick={() => handleSaveCurrentDraft(false)}
                          className="hover-lift"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            height: '36px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            boxShadow: 'var(--shadow-sm)',
                            color: 'var(--color-text)',
                            flexShrink: 0
                          }}
                          title={t('Lưu lại bản nháp hiện tại để làm việc tiếp sau')}
                        >
                          <FileText size={15} style={{ flexShrink: 0 }} />
                          <span>{t('Lưu nháp')}</span>
                        </button>

                        <button 
                          type="button" 
                          onClick={handleCreateSubmit}
                          disabled={submitting}
                          className="btn primary"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '8px 18px',
                            borderRadius: '8px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            height: '36px',
                            background: 'var(--color-primary)',
                            borderColor: 'var(--color-primary)',
                            color: 'white',
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)',
                            transition: 'all 0.2s'
                          }}
                        >
                          <Save size={16} />
                          <span>{submitting ? (editingItemId ? t('Đang lưu...') : t('Đang gửi...')) : (editingItemId ? t('Cập nhật đề xuất') : t('Gửi đề xuất'))}</span>
                        </button>

                        <button 
                          onClick={() => handleRequestExit('close')} 
                          className="hover-lift"
                          style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            padding: '8px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '36px',
                            width: '36px'
                          }}
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleRequestExit('close')} 
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: '6px',
                          cursor: 'pointer',
                          color: 'var(--color-text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <X size={20} />
                      </button>
                    )}
                  </div>

                  {/* Drawer Content */}
                  <div className="custom-scrollbar" style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: isMobile ? '12px 10px 140px 10px' : '1.5rem 1.5rem 180px 1.5rem',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: isMobile ? '1rem' : '1.5rem'
                  }}>
                    
                    {/* LEFT COLUMN: Form Elements (70%) */}
                    <div style={{ flex: isMobile ? 'none' : 7, display: 'flex', flexDirection: 'column', gap: isMobile ? '1rem' : '1.25rem', minWidth: 0, width: '100%' }}>
                      
                      {/* Active Draft Banner if exists for this workflow */}
                      {activeDraftForWf && (
                        <div style={{
                          background: 'rgba(59, 130, 246, 0.08)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          borderRadius: '12px',
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          flexWrap: 'wrap'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.84rem', color: '#1d4ed8', fontWeight: 600 }}>
                            <Bookmark size={17} />
                            <span>{t('Bạn có một bản nháp chưa gửi của quy trình này.')}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                              type="button"
                              onClick={() => handleResumeDraft(activeDraftForWf)}
                              className="btn primary sm"
                              style={{ fontSize: '0.78rem', padding: '5px 12px', height: 'auto', fontWeight: 700 }}
                            >
                              {t('Mở bản nháp')}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteDraft(activeDraftForWf.id)}
                              className="btn outline sm"
                              style={{ fontSize: '0.78rem', padding: '5px 10px', height: 'auto', color: 'var(--color-danger)' }}
                            >
                              {t('Bỏ qua')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Card 2: Specialized fields details based on workflow type */}
                      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                          {t('Thông tin chi tiết đề xuất')}
                        </div>
                        
                        {formType === 'attendance_bulk' ? (
                          /* BULK ATTENDANCE FORM FIELDS */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                  {t('Kỳ công / Tháng')}
                                </label>
                                <input
                                  type="month"
                                  value={bulkMonth}
                                  onChange={(e) => setBulkMonth(e.target.value)}
                                  className="form-input"
                                  style={{ height: '36px', fontSize: '0.8rem', fontWeight: 600 }}
                                />
                              </div>

                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const today = getTodayDateString();
                                    const userDefaultIn = (user as any)?.work_start_time ? String((user as any).work_start_time).substring(0, 5) : '08:00';
                                    const userDefaultOut = (user as any)?.work_end_time ? String((user as any).work_end_time).substring(0, 5) : '17:00';
                                    let nextDate = today;
                                    let offset = 0;
                                    while (suggestedDays.some(d => d.date === nextDate) && offset < 31) {
                                      offset++;
                                      const d = new Date();
                                      d.setDate(d.getDate() - offset);
                                      const year = d.getFullYear();
                                      const month = String(d.getMonth() + 1).padStart(2, '0');
                                      const day = String(d.getDate()).padStart(2, '0');
                                      nextDate = `${year}-${month}-${day}`;
                                    }
                                    setSuggestedDays(prev => [
                                      ...prev,
                                      {
                                        date: nextDate,
                                        check_in: userDefaultIn,
                                        check_out: userDefaultOut,
                                        has_check_in: false,
                                        has_check_out: false,
                                        is_on_leave: false,
                                        disabled: false,
                                        reason: '',
                                        is_manual: true
                                      }
                                    ]);
                                  }}
                                  className="btn primary"
                                  style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}
                                >
                                  <Plus size={14} />
                                  {t('Thêm ngày')}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleScanMissingDays(bulkMonth)}
                                  disabled={suggestedLoading}
                                  className="btn outline"
                                  style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb', borderColor: 'rgba(37, 99, 235, 0.4)', background: 'rgba(37, 99, 235, 0.06)' }}
                                  title={t('Tự động quét và liệt kê toàn bộ các ngày thiếu công trong tháng đã chọn')}
                                >
                                  <RefreshCw size={14} className={suggestedLoading ? 'spin' : ''} />
                                  {suggestedLoading ? t('Đang quét...') : t('Quét ngày thiếu công cả tháng')}
                                </button>
                              </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-text)' }}>
                                {t('DANH SÁCH NGÀY ĐỀ NGHỊ CẬP NHẬT CÔNG')} ({suggestedDays.length} {t('ngày')})
                              </span>
                            </div>

                            {suggestedLoading ? (
                              <div style={{
                                padding: '2.5rem 1.5rem',
                                textAlign: 'center',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '12px',
                                background: 'var(--color-bg-secondary)',
                                border: '1px dashed var(--color-border)',
                                borderRadius: '12px'
                              }}>
                                <Loader2 size={32} className="spin" style={{ color: 'var(--color-primary)' }} />
                                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                  {t('Đang quét và tính toán dữ liệu ngày thiếu công...')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                  {t('Hệ thống đang tự động đối soát dữ liệu chấm công trong tháng')}
                                </div>
                              </div>
                            ) : suggestedDays.length > 0 ? (
                              <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '10px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--color-bg-light)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                                      <th style={{ padding: '8px 10px', width: '140px' }}>{t('Ngày')}</th>
                                      <th style={{ padding: '8px 10px', width: '80px' }}>{t('Thứ')}</th>
                                      <th style={{ padding: '8px 10px', width: '85px' }}>{t('Vào')}</th>
                                      <th style={{ padding: '8px 10px', width: '85px' }}>{t('Ra')}</th>
                                      <th style={{ padding: '8px 10px' }}>{t('Lý do giải trình')}</th>
                                      <th style={{ padding: '8px 10px', width: '40px', textAlign: 'center' }}></th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {suggestedDays.map((day, idx) => {
                                      const isInactive = Boolean(day.is_on_leave || day.disabled);
                                      return (
                                        <tr 
                                          key={`${day.date}-${idx}`} 
                                          style={{ 
                                            borderBottom: '1px solid var(--color-border)',
                                            background: isInactive ? 'var(--color-bg-light, rgba(0,0,0,0.02))' : 'transparent',
                                            opacity: isInactive ? 0.7 : 1
                                          }}
                                        >
                                          <td style={{ padding: '6px 10px', fontWeight: 650 }}>
                                            <VietnameseDateInput
                                              value={day.date}
                                              max={getTodayDateString()}
                                              onChange={(val) => {
                                                const newDays = [...suggestedDays];
                                                newDays[idx].date = val;
                                                setSuggestedDays(newDays);
                                              }}
                                              size="sm"
                                              inputStyle={{
                                                padding: '4px 6px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--color-border)',
                                                fontSize: '0.75rem',
                                                fontWeight: 650,
                                                background: 'var(--color-surface)',
                                                color: 'var(--color-text)'
                                              }}
                                            />
                                            {day.is_on_leave && (
                                              <span style={{ 
                                                display: 'inline-flex', 
                                                alignItems: 'center', 
                                                gap: '3px',
                                                fontSize: '0.65rem', 
                                                color: 'var(--color-primary)', 
                                                fontWeight: 700,
                                                marginTop: '2px',
                                                background: 'rgba(163, 20, 34, 0.08)',
                                                padding: '2px 6px',
                                                borderRadius: '4px'
                                              }}>
                                                <Calendar size={10} /> {day.leave_type || t('Đã có đơn nghỉ')}
                                              </span>
                                            )}
                                          </td>
                                          <td style={{ padding: '8px 10px', color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>{getDayOfWeek(day.date)}</td>
                                          <td style={{ padding: '4px 8px' }}>
                                            <input
                                              type="time"
                                              value={day.check_in}
                                              onChange={(e) => {
                                                const newDays = [...suggestedDays];
                                                newDays[idx].check_in = e.target.value;
                                                setSuggestedDays(newDays);
                                              }}
                                              disabled={day.has_check_in || isInactive}
                                              style={{
                                                width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.75rem',
                                                background: (day.has_check_in || isInactive) ? 'var(--color-bg-light)' : 'var(--color-surface)',
                                                color: (day.has_check_in || isInactive) ? 'var(--color-text-muted)' : 'var(--color-text)',
                                                cursor: (day.has_check_in || isInactive) ? 'not-allowed' : 'auto'
                                              }}
                                            />
                                          </td>
                                          <td style={{ padding: '4px 8px' }}>
                                            <input
                                              type="time"
                                              value={day.check_out}
                                              onChange={(e) => {
                                                const newDays = [...suggestedDays];
                                                newDays[idx].check_out = e.target.value;
                                                setSuggestedDays(newDays);
                                              }}
                                              disabled={day.has_check_out || isInactive}
                                              style={{
                                                width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.75rem',
                                                background: (day.has_check_out || isInactive) ? 'var(--color-bg-light)' : 'var(--color-surface)',
                                                color: (day.has_check_out || isInactive) ? 'var(--color-text-muted)' : 'var(--color-text)',
                                                cursor: (day.has_check_out || isInactive) ? 'not-allowed' : 'auto'
                                              }}
                                            />
                                          </td>
                                          <td style={{ padding: '4px 8px' }}>
                                            {day.is_on_leave ? (
                                              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                                {day.leave_reason || t('Nghỉ theo đơn xin phép (Không áp dụng bù công)')}
                                              </span>
                                            ) : (
                                              <input
                                                type="text"
                                                value={day.reason}
                                                placeholder={t('Lý do giải trình...')}
                                                onChange={(e) => {
                                                  const newDays = [...suggestedDays];
                                                  newDays[idx].reason = e.target.value;
                                                  setSuggestedDays(newDays);
                                                }}
                                                style={{
                                                  width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.75rem'
                                                }}
                                              />
                                            )}
                                          </td>
                                          <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => setSuggestedDays(suggestedDays.filter((_, i) => i !== idx))}
                                              style={{ border: 'none', background: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                                              title={t('Bỏ ngày này')}
                                            >
                                              <X size={14} />
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem', border: '1px dashed var(--color-border)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                                <span>{t('Chưa có ngày nào trong danh sách đề nghị cập nhật công.')}</span>
                                <span style={{ fontSize: '0.75rem' }}>{t('Bấm "+ Thêm ngày" để thêm ngày bất kỳ, hoặc bấm "Quét ngày thiếu công cả tháng" để hệ thống tự động tìm các ngày thiếu công trong tháng.')}</span>
                              </div>
                            )}
                          </div>
                        ) : formType === 'leave' ? (
                          /* LEAVE FORM FIELDS */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Ô nhập tiêu đề ở dưới - Tự động 2 chiều đồng bộ với tiêu đề ở trên */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                {t('Tiêu đề / Nội dung đề xuất')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: 'var(--color-bg-secondary, #f8fafc)',
                                border: '1.5px solid var(--color-border)',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                transition: 'all 0.15s ease'
                              }}>
                                <div style={{
                                  padding: '0 12px',
                                  background: 'rgba(0, 0, 0, 0.03)',
                                  borderRight: '1.5px solid var(--color-border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                  color: 'var(--color-text)',
                                  whiteSpace: 'nowrap',
                                  userSelect: 'none',
                                  flexShrink: 0
                                }}>
                                  <span style={{ color: selectedWorkflowDef?.color || 'var(--color-primary)' }}>●</span>
                                  <span>{selectedWorkflowDef?.name || t('Đơn xin nghỉ')}</span>
                                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>—</span>
                                </div>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={workflowTitleSuffix}
                                  onChange={e => {
                                    setWorkflowTitleSuffix(e.target.value);
                                    setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, e.target.value));
                                  }}
                                  placeholder={t('Nhập nội dung đề xuất (VD: Nghỉ phép năm việc gia đình, Nghỉ khám bệnh...)')}
                                  style={{
                                    flex: 1,
                                    border: 'none',
                                    borderRadius: 0,
                                    height: '38px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    background: 'transparent',
                                    padding: '0 12px',
                                    outline: 'none'
                                  }}
                                  required
                                />
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Loại nghỉ phép')}</label>
                                <CustomSelect
                                  value={leaveType}
                                  onChange={val => setLeaveType(val)}
                                  options={[
                                    { value: 'annual', label: t('Nghỉ phép năm') },
                                    { value: 'compensatory', label: t('Nghỉ bù') },
                                    { value: 'special_paid', label: t('Nghỉ chế độ Hiếu / Hỉ (100% lương theo Luật)') },
                                    { value: 'sick', label: t('Nghỉ ốm / thai sản') },
                                    { value: 'unpaid', label: t('Nghỉ việc riêng (không lương)') }
                                  ]}
                                  width="100%"
                                />
                                {myBalance && (
                                  <div style={{ fontSize: '0.72rem', marginTop: '6px', fontWeight: 600, display: 'flex', flexWrap: 'wrap', gap: '8px 12px' }}>
                                    <span style={{ color: 'var(--color-primary)' }}>
                                      {t('Còn lại phép năm:')} {Number((myBalance.annual_leave_total - myBalance.annual_leave_used).toFixed(2))} {t('ngày')}
                                    </span>
                                    <span style={{ color: '#d97706' }}>
                                      {t('Còn lại phép bù:')} {Number((myBalance.compensatory_leave_total - myBalance.compensatory_leave_used).toFixed(2))} {t('ngày')}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Thời gian nghỉ')}</label>
                                <CustomSelect
                                  value={leaveSession}
                                  onChange={(val: any) => setLeaveSession(val)}
                                  options={[
                                    { value: 'full', label: t('Cả ngày (1 ngày)') },
                                    { value: 'morning', label: t('Buổi sáng (0.5 ngày)') },
                                    { value: 'afternoon', label: t('Buổi chiều (0.5 ngày)') },
                                    { value: 'range', label: t('Nhiều ngày liên tiếp (Chọn khoảng)') },
                                    { value: 'intermittent', label: t('Nhiều ngày ngắt quãng (Chọn từng ngày)') }
                                  ]}
                                  width="100%"
                                />
                              </div>
                            </div>

                            {leaveSession === 'intermittent' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Chọn các ngày xin nghỉ & Buổi nghỉ')}</label>
                                {intermittentDates.map((item, idx) => (
                                  <div key={idx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <div style={{ flex: 2 }}>
                                      <VietnameseDateInput
                                        value={item.date}
                                        onChange={val => {
                                          const newDates = [...intermittentDates];
                                          newDates[idx] = { ...newDates[idx], date: val };
                                          setIntermittentDates(newDates);
                                        }}
                                        inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                        required
                                      />
                                    </div>
                                    <div style={{ flex: 1.5 }}>
                                      <CustomSelect
                                        value={item.session}
                                        onChange={(val: any) => {
                                          const newDates = [...intermittentDates];
                                          newDates[idx] = { ...newDates[idx], session: val };
                                          setIntermittentDates(newDates);
                                        }}
                                        options={[
                                          { value: 'full', label: t('Cả ngày') },
                                          { value: 'morning', label: t('Sáng (0.5)') },
                                          { value: 'afternoon', label: t('Chiều (0.5)') }
                                        ]}
                                        width="100%"
                                      />
                                    </div>
                                    {intermittentDates.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newDates = intermittentDates.filter((_, i) => i !== idx);
                                          setIntermittentDates(newDates);
                                        }}
                                        style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                                        title={t('Xóa ngày này')}
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setIntermittentDates([...intermittentDates, { date: '', session: 'full' }])}
                                  style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(59, 130, 246, 0.08)', color: 'var(--color-primary)', border: '1px dashed var(--color-primary)', borderRadius: '6px', padding: '4px 10px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  <Plus size={12} />
                                  <span>{t('Thêm ngày nghỉ')}</span>
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {leaveSession === 'range' ? t('Từ ngày') : t('Ngày xin nghỉ')}
                                  </label>
                                  <VietnameseDateInput
                                    value={leaveFrom ? leaveFrom.split('T')[0] : ''}
                                    onChange={val => {
                                      setLeaveFrom(val);
                                      if (leaveSession !== 'range') setLeaveTo(val);
                                    }}
                                    inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                    required
                                  />
                                </div>
                                {leaveSession === 'range' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Đến ngày')}</label>
                                    <VietnameseDateInput
                                      value={leaveTo ? leaveTo.split('T')[0] : ''}
                                      onChange={val => setLeaveTo(val)}
                                      inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                      required
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Lý do xin nghỉ')}</label>
                              <textarea
                                className="form-input"
                                rows={4}
                                value={leaveReason}
                                onChange={e => {
                                  const val = e.target.value;
                                  setLeaveReason(val);
                                  if (!workflowTitleSuffix || workflowTitleSuffix === leaveReason) {
                                    setWorkflowTitleSuffix(val);
                                    setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, val));
                                  }
                                }}
                                placeholder={t('Nhập chi tiết lý do xin nghỉ phép, phương án bàn giao / hỗ trợ công việc...')}
                                style={{ minHeight: '110px', fontSize: '0.85rem', padding: '10px 12px', lineHeight: 1.5, resize: 'vertical' }}
                                required
                              />
                            </div>

                            {(() => {
                              const requestedDays = leaveSession === 'intermittent'
                                ? intermittentDates.filter(item => item.date).reduce((acc, item) => acc + (item.session === 'full' ? 1.0 : 0.5), 0)
                                : calculateWorkingDays(leaveFrom, leaveTo, leaveSession);
                                
                              let isInsufficient = false;
                              let errorMsg = '';
                              let deductComp = 0;
                              let deductAnnual = 0;
                              let deductUnpaid = 0;
                              
                              if (leaveSession === 'range' && leaveFrom && leaveTo && new Date(leaveTo) < new Date(leaveFrom)) {
                                isInsufficient = true;
                                errorMsg = t('Ngày kết thúc không được nhỏ hơn ngày bắt đầu.');
                              } else if (myBalance) {
                                const remComp = Math.max(0, myBalance.compensatory_leave_total - myBalance.compensatory_leave_used);
                                const remAnnual = Math.max(0, myBalance.annual_leave_total - myBalance.annual_leave_used);
                                
                                if (leaveType === 'annual' || leaveType === 'compensatory') {
                                  deductComp = Math.min(requestedDays, remComp);
                                  deductAnnual = Math.min(Math.max(0, requestedDays - deductComp), remAnnual);
                                  deductUnpaid = Math.max(0, requestedDays - (deductComp + deductAnnual));
                                } else if (leaveType === 'special_paid') {
                                  const statutoryLimit = 3.0;
                                  const overQuota = Math.max(0, requestedDays - statutoryLimit);
                                  if (overQuota > 0) {
                                    deductComp = Math.min(overQuota, remComp);
                                    deductAnnual = Math.min(Math.max(0, overQuota - deductComp), remAnnual);
                                    deductUnpaid = Math.max(0, overQuota - (deductComp + deductAnnual));
                                  }
                                }
                              }

                              return (
                                <>
                                  {/* Duration preview alert */}
                                  <div className="card-panel" style={{ 
                                    padding: '10px 14px', 
                                    background: 'rgba(59, 130, 246, 0.06)', 
                                    border: '1px solid rgba(59, 130, 246, 0.15)', 
                                    borderRadius: '8px', 
                                    fontSize: '0.8rem', 
                                    display: 'flex', 
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    color: 'var(--color-text)'
                                  }}>
                                    <span><strong>{t('Khấu trừ dự kiến:')}</strong></span>
                                    <strong style={{ color: 'var(--color-primary)' }}>
                                      {(() => {
                                        if (leaveType === 'unpaid') {
                                          return t('Nghỉ không lương (Không khấu trừ phép)');
                                        }
                                        if (leaveType === 'sick') {
                                          return t('Nghỉ ốm / thai sản (Không khấu trừ phép)');
                                        }
                                        if (leaveType === 'special_paid') {
                                          const statutoryLimit = Math.min(requestedDays, 3.0);
                                          const overParts = [
                                            deductComp > 0 ? `-${Number(deductComp.toFixed(2))} ${t('phép bù')}` : null,
                                            deductAnnual > 0 ? `-${Number(deductAnnual.toFixed(2))} ${t('phép năm')}` : null,
                                            deductUnpaid > 0 ? `-${Number(deductUnpaid.toFixed(2))} ${t('không lương')}` : null
                                          ].filter(Boolean);
                                          return `${statutoryLimit} ngày chế độ luật (100% lương)${overParts.length > 0 ? ' + ' + overParts.join(', ') : ''}`;
                                        }
                                        if (isInsufficient) {
                                          return errorMsg;
                                        }
                                        
                                        const parts = [
                                          deductComp > 0 ? `-${Number(deductComp.toFixed(2))} ${t('phép bù')}` : null,
                                          deductAnnual > 0 ? `-${Number(deductAnnual.toFixed(2))} ${t('phép năm')}` : null,
                                          deductUnpaid > 0 ? `-${Number(deductUnpaid.toFixed(2))} ${t('không lương')}` : null
                                        ].filter(Boolean);
                                        
                                        return parts.join(', ') || t('0 ngày');
                                      })()}
                                    </strong>
                                  </div>

                                  {isInsufficient && (
                                    <div className="card-panel" style={{ 
                                      padding: '10px 14px', 
                                      background: 'rgba(239, 68, 68, 0.08)', 
                                      border: '1px solid rgba(239, 68, 68, 0.25)', 
                                      borderRadius: '8px', 
                                      fontSize: '0.78rem', 
                                      color: 'var(--color-danger)',
                                      fontWeight: 600,
                                      lineHeight: '1.4'
                                    }}>
                                      {errorMsg}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        ) : formType === 'late_early' ? (
                          /* LATE / EARLY REGISTRATION FORM WITH SMART SHIFT TIME AUTO-DETECTION */
                          (() => {
                            const userDefaultIn = (user as any)?.work_start_time ? String((user as any).work_start_time).substring(0, 5) : '08:00';
                            const userDefaultOut = (user as any)?.work_end_time ? String((user as any).work_end_time).substring(0, 5) : '17:00';

                            // Compute smart preview times
                            const [sh, sm] = (otStart || (lateEarlyType === 'early' ? '16:30' : userDefaultIn)).split(':').map(Number);
                            const startH = isNaN(sh) ? 8 : sh;
                            const startM = isNaN(sm) ? 0 : sm;
                            const totalStartMin = startH * 60 + startM;
                            const totalEndMin = totalStartMin + (lateEarlyMinutes || 30);
                            const endHStr = String(Math.floor(totalEndMin / 60) % 24).padStart(2, '0');
                            const endMStr = String(totalEndMin % 60).padStart(2, '0');
                            const computedEndTime = `${endHStr}:${endMStr}`;

                            const handleMinutesChange = (newMin: number) => {
                              setLateEarlyMinutes(newMin);
                              if (lateEarlyType === 'early') {
                                const [eh, em] = userDefaultOut.split(':').map(Number);
                                const totalOutMin = (isNaN(eh) ? 17 : eh) * 60 + (isNaN(em) ? 0 : em);
                                const earlyStartMin = Math.max(0, totalOutMin - newMin);
                                const ehStr = String(Math.floor(earlyStartMin / 60) % 24).padStart(2, '0');
                                const emStr = String(earlyStartMin % 60).padStart(2, '0');
                                setOtStart(`${ehStr}:${emStr}`);
                              }
                            };

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                {/* Ô nhập tiêu đề ở dưới - Tự động 2 chiều đồng bộ với tiêu đề ở trên */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Tiêu đề / Nội dung đề xuất')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    background: 'var(--color-bg-secondary, #f8fafc)',
                                    border: '1.5px solid var(--color-border)',
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    transition: 'all 0.15s ease'
                                  }}>
                                    <div style={{
                                      padding: '0 12px',
                                      background: 'rgba(0, 0, 0, 0.03)',
                                      borderRight: '1.5px solid var(--color-border)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '0.82rem',
                                      fontWeight: 700,
                                      color: 'var(--color-text)',
                                      whiteSpace: 'nowrap',
                                      userSelect: 'none',
                                      flexShrink: 0
                                    }}>
                                      <span style={{ color: selectedWorkflowDef?.color || 'var(--color-primary)' }}>●</span>
                                      <span>{selectedWorkflowDef?.name || t('Đi trễ / Về sớm')}</span>
                                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>—</span>
                                    </div>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={workflowTitleSuffix}
                                      onChange={e => {
                                        setWorkflowTitleSuffix(e.target.value);
                                        setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, e.target.value));
                                      }}
                                      placeholder={t('Nhập lý do đi trễ / về sớm...')}
                                      style={{
                                        flex: 1,
                                        border: 'none',
                                        borderRadius: 0,
                                        height: '38px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        background: 'transparent',
                                        padding: '0 12px',
                                        outline: 'none'
                                      }}
                                      required
                                    />
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Loại đăng ký')}</label>
                                    <CustomSelect
                                      value={lateEarlyType}
                                      onChange={(val: any) => {
                                        setLateEarlyType(val);
                                        if (val === 'late') {
                                          setOtStart(userDefaultIn);
                                        } else if (val === 'early') {
                                          const [eh, em] = userDefaultOut.split(':').map(Number);
                                          const totalOutMin = (isNaN(eh) ? 17 : eh) * 60 + (isNaN(em) ? 0 : em);
                                          const earlyStartMin = Math.max(0, totalOutMin - (lateEarlyMinutes || 30));
                                          const ehStr = String(Math.floor(earlyStartMin / 60) % 24).padStart(2, '0');
                                          const emStr = String(earlyStartMin % 60).padStart(2, '0');
                                          setOtStart(`${ehStr}:${emStr}`);
                                        }
                                      }}
                                      options={[
                                        { value: 'late', label: `🚶‍♂️ ${t('Đi muộn')} (${t('Ca sáng')})` },
                                        { value: 'early', label: `🏃‍♂️ ${t('Về sớm')} (${t('Ca chiều')})` }
                                      ]}
                                      width="100%"
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Số phút đăng ký')}</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                      <CustomSelect
                                        value={isCustomMinutesMode ? 'custom' : String(lateEarlyMinutes)}
                                        onChange={(val: any) => {
                                          if (val === 'custom') {
                                            setIsCustomMinutesMode(true);
                                          } else {
                                            setIsCustomMinutesMode(false);
                                            handleMinutesChange(Number(val));
                                          }
                                        }}
                                        options={[
                                          { value: '30', label: t('30 phút') },
                                          { value: '60', label: t('60 phút (1 giờ)') },
                                          { value: '90', label: t('90 phút') },
                                          { value: '120', label: t('120 phút (2 giờ)') },
                                          { value: '150', label: t('150 phút (2.5 giờ)') },
                                          { value: '180', label: t('180 phút (3 giờ)') },
                                          { value: 'custom', label: t('Tùy chọn khác (Tự nhập số phút)...') }
                                        ]}
                                        width="100%"
                                      />
                                      {isCustomMinutesMode && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                                          <input
                                            type="number"
                                            className="form-input"
                                            value={lateEarlyMinutes || ''}
                                            onChange={e => {
                                              const val = Number(e.target.value);
                                              handleMinutesChange(val);
                                            }}
                                            placeholder={t('Nhập số phút đi muộn / về sớm...')}
                                            style={{ height: '36px', fontSize: '0.8rem' }}
                                            min="1"
                                          />
                                          {lateEarlyMinutes > 180 && (
                                            <span style={{ fontSize: '0.7rem', color: 'var(--color-danger, #ef4444)', fontWeight: 600, marginTop: '2px' }}>
                                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} strokeWidth={1.75} style={{ flexShrink: 0 }} /> {t('Không được đi muộn/về sớm quá 3 tiếng (180 phút). Vui lòng đăng ký nghỉ phép 1 buổi.')}</span>
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Ngày đăng ký')}</label>
                                    <VietnameseDateInput
                                      value={leaveFrom ? leaveFrom.split('T')[0] : ''}
                                      onChange={val => {
                                        setLeaveFrom(val);
                                        setLeaveTo(val);
                                      }}
                                      inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                      required
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {lateEarlyType === 'late' 
                                        ? `${t('Giờ bắt đầu vào ca')} (${t('Quy định')}: ${userDefaultIn})` 
                                        : `${t('Giờ dự kiến rời công ty')} (${t('Tan ca')}: ${userDefaultOut})`}
                                    </label>
                                    <input
                                      type="time"
                                      className="form-input"
                                      value={otStart}
                                      onChange={e => setOtStart(e.target.value)}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                      required
                                    />
                                  </div>
                                </div>

                                {/* Smart Real-time Auto Time Helper Preview Banner */}
                                <div style={{
                                  padding: '10px 14px',
                                  borderRadius: '10px',
                                  background: lateEarlyType === 'late' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                  border: lateEarlyType === 'late' ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid rgba(245, 158, 11, 0.25)',
                                  color: lateEarlyType === 'late' ? '#1d4ed8' : '#b45309',
                                  fontSize: '0.8125rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}>
                                  <Clock size={16} />
                                  <span>
                                    {lateEarlyType === 'late'
                                      ? `Ca làm việc bắt đầu lúc ${userDefaultIn}. Đăng ký đi muộn ${lateEarlyMinutes || 30} phút ➔ Dự kiến có mặt tại công ty lúc ${computedEndTime}.`
                                      : `Ca làm việc kết thúc lúc ${userDefaultOut}. Đăng ký về sớm ${lateEarlyMinutes || 30} phút ➔ Dự kiến rời công ty lúc ${otStart} (kết thúc sớm hơn giờ tan ca ${userDefaultOut}).`}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Lý do đi muộn / về sớm')}</label>
                                  <textarea
                                    className="form-input"
                                    rows={3}
                                    value={leaveReason}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setLeaveReason(val);
                                      if (!workflowTitleSuffix || workflowTitleSuffix === leaveReason) {
                                        setWorkflowTitleSuffix(val);
                                        setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, val));
                                      }
                                    }}
                                    placeholder={t('Ví dụ: Đi khám bệnh, kẹt xe, giải quyết việc cá nhân...')}
                                    style={{ minHeight: '90px', fontSize: '0.85rem', padding: '10px 12px', lineHeight: 1.5, resize: 'vertical' }}
                                    required
                                  />
                                </div>
                              </div>
                            );
                          })()
                        ) : formType === 'overtime' ? (
                          /* OVERTIME REGISTRATION FORM */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Ô nhập tiêu đề ở dưới - Tự động 2 chiều đồng bộ với tiêu đề ở trên */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                {t('Tiêu đề / Nội dung đề xuất')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: 'var(--color-bg-secondary, #f8fafc)',
                                border: '1.5px solid var(--color-border)',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                transition: 'all 0.15s ease'
                              }}>
                                <div style={{
                                  padding: '0 12px',
                                  background: 'rgba(0, 0, 0, 0.03)',
                                  borderRight: '1.5px solid var(--color-border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                  color: 'var(--color-text)',
                                  whiteSpace: 'nowrap',
                                  userSelect: 'none',
                                  flexShrink: 0
                                }}>
                                  <span style={{ color: selectedWorkflowDef?.color || 'var(--color-primary)' }}>●</span>
                                  <span>{selectedWorkflowDef?.name || t('Đăng ký tăng ca')}</span>
                                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>—</span>
                                </div>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={workflowTitleSuffix}
                                  onChange={e => {
                                    setWorkflowTitleSuffix(e.target.value);
                                    setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, e.target.value));
                                  }}
                                  placeholder={t('Nhập nội dung tăng ca (VD: Hoàn thành báo cáo quý, Trực tuyển sinh...)')}
                                  style={{
                                    flex: 1,
                                    border: 'none',
                                    borderRadius: 0,
                                    height: '38px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    background: 'transparent',
                                    padding: '0 12px',
                                    outline: 'none'
                                  }}
                                  required
                                />
                              </div>
                            </div>

                            {/* Hình thức nhận OT & Hệ số tính OT (Loại 1 hoặc x1.5) */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 0.8fr', gap: '1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                    {t('Hình thức nhận OT')} <span style={{ color: '#ef4444' }}>*</span>
                                  </label>
                                  <span style={{ fontSize: '0.72rem', color: otType === 'compensatory' ? 'var(--color-primary)' : '#10b981', fontWeight: 700, whiteSpace: 'normal' }}>
                                    {otType === 'compensatory' ? t('Cộng quỹ nghỉ bù') : t('Chi trả vào bảng lương')}
                                  </span>
                                </div>
                                <CustomSelect
                                  value={otType}
                                  onChange={(val: any) => setOtType(val)}
                                  options={[
                                    { 
                                      value: 'compensatory', 
                                      label: t('Lấy OT bù (Nghỉ bù) - Quy đổi thành ngày nghỉ bù') 
                                    },
                                    { 
                                      value: 'salary', 
                                      label: t('Lấy lương OT (Tính vào lương) - Chi trả tiền tăng ca') 
                                    }
                                  ]}
                                  width="100%"
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                                  {t('Hệ số tính OT')} <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <CustomSelect
                                  value={String(otRate)}
                                  onChange={(val: any) => setOtRate(Number(val) || 1.5)}
                                  options={[
                                    { value: '1', label: t('Loại 1.0 (Hệ số 1.0x - Quy đổi 1:1)') },
                                    { value: '1.5', label: t('Loại 1.5 (Hệ số 1.5x - Ngày thường)') },
                                    { value: '2', label: t('Loại 2.0 (Hệ số 2.0x - Cuối tuần)') },
                                    { value: '3', label: t('Loại 3.0 (Hệ số 3.0x - Lễ, Tết)') }
                                  ]}
                                  width="100%"
                                />
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Ngày tăng ca')}</label>
                                <VietnameseDateInput
                                  value={otDate}
                                  onChange={val => setOtDate(val)}
                                  inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                  required
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Giờ bắt đầu')}</label>
                                <input
                                  type="time"
                                  className="form-input"
                                  value={otStart}
                                  onChange={e => setOtStart(e.target.value)}
                                  style={{ height: '36px', fontSize: '0.8rem' }}
                                  required
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Giờ kết thúc')}</label>
                                <input
                                  type="time"
                                  className="form-input"
                                  value={otEnd}
                                  onChange={e => setOtEnd(e.target.value)}
                                  style={{ height: '36px', fontSize: '0.8rem' }}
                                  required
                                />
                              </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Nội dung công việc tăng ca')}</label>
                              <textarea
                                className="form-input"
                                rows={3}
                                value={leaveReason}
                                onChange={e => {
                                  const val = e.target.value;
                                  setLeaveReason(val);
                                  if (!workflowTitleSuffix || workflowTitleSuffix === leaveReason) {
                                    setWorkflowTitleSuffix(val);
                                    setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, val));
                                  }
                                }}
                                placeholder={t('Chi tiết công việc cần tăng ca...')}
                                style={{ minHeight: '90px', fontSize: '0.85rem', padding: '10px 12px', lineHeight: 1.5, resize: 'vertical' }}
                                required
                              />
                            </div>

                            {/* Overtime calculation preview alert */}
                            <div className="card-panel" style={{ 
                              padding: '12px 14px', 
                              background: otType === 'compensatory' ? 'rgba(59, 130, 246, 0.07)' : 'rgba(16, 185, 129, 0.07)', 
                              border: `1px solid ${otType === 'compensatory' ? 'rgba(59, 130, 246, 0.25)' : 'rgba(16, 185, 129, 0.25)'}`, 
                              borderRadius: '10px', 
                              fontSize: '0.8rem', 
                              display: 'flex', 
                              flexDirection: isMobile ? 'column' : 'row',
                              alignItems: isMobile ? 'flex-start' : 'center', 
                              justifyContent: 'space-between',
                              gap: '8px',
                              color: 'var(--color-text)'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {otType === 'compensatory' ? <Calendar size={18} strokeWidth={1.75} style={{ color: '#0284c7', flexShrink: 0 }} /> : <Zap size={18} strokeWidth={1.75} style={{ color: '#059669', flexShrink: 0 }} />}
                                <div>
                                  <div style={{ fontWeight: 700 }}>
                                    {otType === 'compensatory' ? t('Quy đổi sang Ngày nghỉ bù:') : t('Quy đổi sang Tiền tăng ca:')}
                                  </div>
                                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                    {otType === 'compensatory'
                                      ? t('Cộng tự động vào quỹ phép bù cá nhân sau khi hoàn tất duyệt cấp 2 (Không tính vào lương)')
                                      : t('Tính tự động vào cột Lương tăng ca trong bảng lương tháng')}
                                  </div>
                                </div>
                              </div>
                              <strong style={{ color: otType === 'compensatory' ? '#2563eb' : '#10b981', fontSize: '0.875rem', wordBreak: 'break-word', lineHeight: 1.4 }}>
                                {diffHours(otStart, otEnd)} {t('giờ')} ({Number((diffHours(otStart, otEnd) / 8).toFixed(2))} công gốc) × {otRate}x = {(Number((diffHours(otStart, otEnd) / 8).toFixed(2)) * otRate).toFixed(2)} {otType === 'compensatory' ? t('ngày nghỉ bù') : t('ngày công tính lương')}
                              </strong>
                            </div>
                          </div>
                        ) : formType === 'remote_work' ? (
                          /* REMOTE WORK / WFH FORM */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Ô nhập tiêu đề ở dưới - Tự động 2 chiều đồng bộ với tiêu đề ở trên */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                {t('Tiêu đề / Nội dung đề xuất')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                              </label>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                background: 'var(--color-bg-secondary, #f8fafc)',
                                border: '1.5px solid var(--color-border)',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                transition: 'all 0.15s ease'
                              }}>
                                <div style={{
                                  padding: '0 12px',
                                  background: 'rgba(0, 0, 0, 0.03)',
                                  borderRight: '1.5px solid var(--color-border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontSize: '0.82rem',
                                  fontWeight: 700,
                                  color: 'var(--color-text)',
                                  whiteSpace: 'nowrap',
                                  userSelect: 'none',
                                  flexShrink: 0
                                }}>
                                  <span style={{ color: selectedWorkflowDef?.color || 'var(--color-primary)' }}>●</span>
                                  <span>{selectedWorkflowDef?.name || t('Làm việc từ xa')}</span>
                                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>—</span>
                                </div>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={workflowTitleSuffix}
                                  onChange={e => {
                                    setWorkflowTitleSuffix(e.target.value);
                                    setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, e.target.value));
                                  }}
                                  placeholder={t('Nhập lý do làm việc từ xa...')}
                                  style={{
                                    flex: 1,
                                    border: 'none',
                                    borderRadius: 0,
                                    height: '38px',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    background: 'transparent',
                                    padding: '0 12px',
                                    outline: 'none'
                                  }}
                                  required
                                />
                              </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Buổi đăng ký')}</label>
                                <CustomSelect
                                  value={leaveSession}
                                  onChange={(val: any) => setLeaveSession(val)}
                                  options={[
                                    { value: 'full', label: t('Cả ngày (1 ngày)') },
                                    { value: 'morning', label: t('Buổi sáng (0.5 ngày)') },
                                    { value: 'afternoon', label: t('Buổi chiều (0.5 ngày)') },
                                    { value: 'range', label: t('Nhiều ngày (Chọn khoảng ngày)') }
                                  ]}
                                  width="100%"
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {leaveSession === 'range' ? t('Từ ngày') : t('Ngày đăng ký')}
                                </label>
                                <VietnameseDateInput
                                  value={leaveFrom ? leaveFrom.split('T')[0] : ''}
                                  onChange={val => {
                                    setLeaveFrom(val);
                                    if (leaveSession !== 'range') setLeaveTo(val);
                                  }}
                                  inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                  required
                                />
                              </div>
                            </div>

                            {leaveSession === 'range' && (
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Đến ngày')}</label>
                                  <VietnameseDateInput
                                    value={leaveTo ? leaveTo.split('T')[0] : ''}
                                    onChange={val => setLeaveTo(val)}
                                    inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                    required
                                  />
                                </div>
                                <div />
                              </div>
                            )}

                            {/* Tỷ lệ hưởng lương (%) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {t('Tỷ lệ hưởng lương (%)')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                  {t('Mặc định 50%, tối đa 100%')}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', width: isMobile ? '100%' : '180px' }}>
                                  <input
                                    type="number"
                                    className="form-input"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={wfhSalaryRate}
                                    onChange={e => {
                                      const val = e.target.value === '' ? '' : Number(e.target.value);
                                      setWfhSalaryRate(val as any);
                                    }}
                                    onBlur={() => {
                                      if (wfhSalaryRate === '' as any || isNaN(Number(wfhSalaryRate))) {
                                        setWfhSalaryRate(50);
                                      } else if (Number(wfhSalaryRate) > 100) {
                                        setWfhSalaryRate(100);
                                      } else if (Number(wfhSalaryRate) < 0) {
                                        setWfhSalaryRate(0);
                                      }
                                    }}
                                    style={{
                                      height: '36px',
                                      fontSize: '0.85rem',
                                      fontWeight: 700,
                                      paddingRight: '30px',
                                      borderColor: Number(wfhSalaryRate) > 100 ? 'var(--color-danger)' : undefined
                                    }}
                                    required
                                  />
                                  <span style={{
                                    position: 'absolute',
                                    right: '10px',
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    color: 'var(--color-text-muted)',
                                    pointerEvents: 'none'
                                  }}>%</span>
                                </div>

                                {/* Quick selection presets */}
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {[
                                    { label: '50% (Mặc định)', val: 50 },
                                    { label: '70%', val: 70 },
                                    { label: '100% (Đủ lương)', val: 100 }
                                  ].map(p => (
                                    <button
                                      key={p.val}
                                      type="button"
                                      onClick={() => setWfhSalaryRate(p.val)}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '0.72rem',
                                        fontWeight: Number(wfhSalaryRate) === p.val ? 700 : 500,
                                        border: Number(wfhSalaryRate) === p.val ? '1px solid #0284c7' : '1px solid var(--color-border)',
                                        background: Number(wfhSalaryRate) === p.val ? 'rgba(14, 165, 233, 0.12)' : 'var(--color-bg-secondary)',
                                        color: Number(wfhSalaryRate) === p.val ? '#0284c7' : 'var(--color-text)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      {p.label}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {Number(wfhSalaryRate) > 100 && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--color-danger)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <AlertTriangle size={13} strokeWidth={1.75} style={{ flexShrink: 0 }} /> {t('Tỷ lệ hưởng lương không được vượt quá 100%')}
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Kế hoạch công việc từ xa')}</label>
                              <textarea
                                className="form-input"
                                rows={4}
                                value={leaveReason}
                                onChange={e => {
                                  const val = e.target.value;
                                  setLeaveReason(val);
                                  if (!workflowTitleSuffix || workflowTitleSuffix === leaveReason) {
                                    setWorkflowTitleSuffix(val);
                                    setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, val));
                                  }
                                }}
                                placeholder={t('Chi tiết các đầu việc thực hiện từ xa...')}
                                style={{ minHeight: '110px', fontSize: '0.85rem', padding: '10px 12px', lineHeight: 1.5, resize: 'vertical' }}
                                required
                              />
                            </div>

                            {/* Duration & Salary rate preview alert */}
                            {(() => {
                              const calcDays = calculateWorkingDays(leaveFrom, leaveTo, leaveSession);
                              const rawRate = Number(wfhSalaryRate ?? leavePolicy?.wfh_excess_rate_pct ?? 50);
                              const effRate = Math.max(0, Math.min(100, Number.isFinite(rawRate) ? rawRate : Number(leavePolicy?.wfh_excess_rate_pct ?? 50)));
                              const paidDaysEquiv = Number((calcDays * (effRate / 100)).toFixed(2));
                              return (
                                <div className="card-panel" style={{ 
                                  padding: '10px 14px', 
                                  background: 'rgba(14, 165, 233, 0.06)', 
                                  border: '1px solid rgba(14, 165, 233, 0.2)', 
                                  borderRadius: '8px', 
                                  fontSize: '0.8rem', 
                                  display: 'flex', 
                                  flexDirection: isMobile ? 'column' : 'row',
                                  alignItems: isMobile ? 'flex-start' : 'center', 
                                  justifyContent: 'space-between',
                                  gap: '8px',
                                  color: 'var(--color-text)'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1.1rem' }}>🏠</span>
                                    <span>
                                      <strong>{t('Thời gian WFH quy đổi:')}</strong> <strong style={{ color: '#0284c7' }}>{calcDays} {t('ngày')}</strong>
                                      {' • '}
                                      <strong>{t('Tỷ lệ:')}</strong> <strong style={{ color: '#0284c7' }}>{effRate}%</strong>
                                    </span>
                                  </div>
                                  <div style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    color: '#059669',
                                    fontWeight: 700,
                                    fontSize: '0.8rem'
                                  }}>
                                    ➔ {t('Tương đương:')} <strong>{paidDaysEquiv} {t('công hưởng lương')}</strong>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : formType === 'advance' ? (
                          /* SALARY ADVANCE FORM FIELDS */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Tiêu đề quy trình / Nội dung chi (Fix cứng khúc đầu, cho sửa khúc sau) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>{t('Tiêu đề đề xuất / Nội dung tạm ứng')}</span>
                                  <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                              </div>
                              
                              <div style={{
                                display: 'flex',
                                alignItems: 'stretch',
                                borderRadius: '10px',
                                border: '1.5px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                overflow: 'hidden',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                              }}>
                                <div style={{
                                  padding: '0 14px',
                                  background: 'var(--color-bg-secondary, #f1f5f9)',
                                  borderRight: '1.5px solid var(--color-border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  color: 'var(--color-text)',
                                  whiteSpace: 'nowrap',
                                  userSelect: 'none',
                                  flexShrink: 0
                                }}>
                                  <span style={{ color: '#3b82f6', fontSize: '0.9rem' }}>●</span>
                                  <span>{selectedWorkflowDef?.name || t('Đề nghị tạm ứng')}</span>
                                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>—</span>
                                </div>

                                <input
                                  type="text"
                                  className="form-input"
                                  value={workflowTitleSuffix}
                                  onChange={e => {
                                    setWorkflowTitleSuffix(e.target.value);
                                    setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, e.target.value));
                                  }}
                                  placeholder={t('Nhập mục đích tạm ứng (VD: Công tác Hà Nội 3 ngày, Mua vật tư khẩn cấp...) *')}
                                  style={{
                                    flex: 1,
                                    border: 'none',
                                    borderRadius: 0,
                                    height: '40px',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                    background: 'transparent',
                                    padding: '0 14px'
                                  }}
                                  required
                                />
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Số tiền tạm ứng')}</label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={formatNumberWithDots(paymentDetails, currencyType)}
                                  onChange={e => {
                                    const rawVal = parseMoneyInput(e.target.value, currencyType);
                                    setPaymentDetails(rawVal);
                                  }}
                                  placeholder={currencyType === 'VND' ? t('Ví dụ: 5.000.000') : t('Ví dụ: 1,250.50')}
                                  style={{ height: '36px', fontSize: '0.8rem' }}
                                  required
                                />
                                {parseMoneyVn(paymentDetails, currencyType) > 0 && (
                                  <div style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 600, marginTop: '4px' }}>
                                    {numberToVietnameseText(parseMoneyVn(paymentDetails, currencyType), currencyType)}
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Loại tiền tệ')}</label>
                                <CustomSelect
                                  value={currencyType}
                                  onChange={val => setCurrencyType(val)}
                                  options={[
                                    { value: 'VND', label: 'VND' },
                                    { value: 'USD', label: 'USD' },
                                    { value: 'EURO', label: 'EURO' },
                                    { value: 'CHF', label: 'CHF' }
                                  ]}
                                  width="100%"
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Phân loại tạm ứng')}</label>
                                <CustomSelect
                                  value={advanceType}
                                  onChange={val => setAdvanceType(val as any)}
                                  options={[
                                    { value: 'business_trip', label: t('Công tác phí (Vé, khách sạn, di chuyển)') },
                                    { value: 'procurement', label: t('Mua sắm vật tư / trang thiết bị') },
                                    { value: 'event', label: t('Tổ chức sự kiện / hội thảo') },
                                    { value: 'lecturer', label: t('Thù lao giảng viên / chuyên gia') },
                                    { value: 'salary', label: t('Ứng trước lương / Chi phí cá nhân') },
                                    { value: 'other', label: t('Tạm ứng nghiệp vụ khác') }
                                  ]}
                                  width="100%"
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Hạn hoàn ứng / Quyết toán')}</label>
                                <VietnameseDateInput
                                  value={advanceSettlementDate}
                                  onChange={val => setAdvanceSettlementDate(val)}
                                  placeholder="dd/mm/yyyy"
                                  inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                />
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Lý do tạm ứng')}</label>
                              <input
                                type="text"
                                className="form-input"
                                value={leaveReason}
                                onChange={e => setLeaveReason(e.target.value)}
                                placeholder={t('Mục đích tạm ứng chi tiết...')}
                                style={{ height: '36px', fontSize: '0.8rem' }}
                                required
                              />
                            </div>
                            <div style={{
                              background: 'rgba(245, 158, 11, 0.04)',
                              border: '1px solid rgba(245, 158, 11, 0.15)',
                              padding: '12px 14px',
                              borderRadius: '10px',
                              fontSize: '0.78rem',
                              color: '#b45309',
                              fontWeight: 600,
                              lineHeight: 1.4,
                              display: 'flex',
                              gap: '8px',
                              alignItems: 'flex-start',
                              marginTop: '4px'
                            }}>
                              <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                              <span>{t('Lưu ý: Khoản tạm ứng này sẽ tự động trừ vào lương thực lãnh của tháng sau khi được duyệt đầy đủ các bước.')}</span>
                            </div>
                          </div>
                        ) : formType === 'recruitment' ? (
                          /* RECRUITMENT REQUISITION FORM */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Workflow Banner Highlight */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 16px',
                              borderRadius: '12px',
                              background: 'rgba(15, 118, 110, 0.05)',
                              border: '1px solid rgba(15, 118, 110, 0.2)'
                            }}>
                              <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: '#0f766e',
                                color: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                boxShadow: '0 2px 6px rgba(15, 118, 110, 0.2)',
                                flexShrink: 0
                              }}>
                                <UserPlus size={18} />
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f766e' }}>
                                  {t('TỜ TRÌNH ĐỀ XUẤT TUYỂN DỤNG NHÂN SỰ')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                  {t('Lập kế hoạch nhân sự, số lượng cần tuyển, hình thức làm việc và dải lương dự kiến trình Ban Giám đốc.')}
                                </div>
                              </div>
                            </div>

                            {/* Section 1: Vị trí & Số lượng */}
                            <div style={{
                              background: 'var(--color-surface, #ffffff)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '14px',
                              padding: isMobile ? '1rem' : '1.25rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '14px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0f766e' }}>
                                <Briefcase size={16} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  {t('1. Thông tin vị trí & nhu cầu nhân sự')}
                                </span>
                              </div>

                              {/* Quick selection chips for common job titles */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                  {t('Gợi ý chức danh phổ biến')}
                                </label>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                  {[
                                    'Chuyên viên Tuyển sinh',
                                    'Nhân viên Kinh doanh (Sales)',
                                    'Giảng viên / Trợ giảng',
                                    'Chuyên viên Marketing',
                                    'Kế toán viên',
                                    'Lập trình viên / IT',
                                    'Chăm sóc khách hàng (CSKH)',
                                    'Hành chính Nhân sự'
                                  ].map(title => (
                                    <button
                                      key={title}
                                      type="button"
                                      onClick={() => {
                                        setRecruitmentJobTitle(title);
                                        setWorkflowTitleSuffix(title);
                                        setExpenseTitle(`Đề xuất tuyển dụng: ${title}`);
                                      }}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 'var(--radius-full, 9999px)',
                                        border: recruitmentJobTitle === title ? '1.5px solid #0f766e' : '1px solid var(--color-border)',
                                        background: recruitmentJobTitle === title ? 'rgba(15, 118, 110, 0.1)' : 'var(--color-bg-secondary, #f8fafc)',
                                        color: recruitmentJobTitle === title ? '#0f766e' : 'var(--color-text)',
                                        fontSize: '0.75rem',
                                        fontWeight: recruitmentJobTitle === title ? 750 : 550,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      + {title}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                    {t('Vị trí / Chức danh cần tuyển')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={recruitmentJobTitle}
                                    onChange={e => {
                                      setRecruitmentJobTitle(e.target.value);
                                      setWorkflowTitleSuffix(e.target.value);
                                      setExpenseTitle(`Đề xuất tuyển dụng: ${e.target.value}`);
                                    }}
                                    placeholder={t('Ví dụ: Chuyên viên Tư vấn Tuyển sinh BBA...')}
                                    style={{ height: '38px', fontSize: '0.85rem', fontWeight: 650 }}
                                    required
                                  />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                    {t('Số lượng cần tuyển (Người)')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <input
                                    type="number"
                                    className="form-input"
                                    min="1"
                                    max="999"
                                    step="1"
                                    value={recruitmentHeadcount}
                                    onChange={e => setRecruitmentHeadcount(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                                    style={{ height: '38px', fontSize: '0.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#0f766e' }}
                                    required
                                  />
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 1fr', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                    {t('Phòng ban / Bộ phận tiếp nhận')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <CustomSelect
                                    value={recruitmentDepartment}
                                    onChange={val => setRecruitmentDepartment(val)}
                                    options={teams.length > 0 ? teams.map(tm => ({
                                      value: tm.name,
                                      label: tm.name
                                    })) : [
                                      { value: 'Phòng Kinh doanh', label: 'Phòng Kinh doanh (Sales)' },
                                      { value: 'Phòng Tuyển sinh', label: 'Phòng Tuyển sinh' },
                                      { value: 'Phòng Đào tạo', label: 'Phòng Đào tạo / Học vụ' },
                                      { value: 'Phòng Marketing', label: 'Phòng Marketing' },
                                      { value: 'Phòng Kỹ thuật & IT', label: 'Phòng Kỹ thuật & IT' },
                                      { value: 'Phòng Kế toán', label: 'Phòng Kế toán - Tài chính' },
                                      { value: 'Phòng Nhân sự', label: 'Phòng Hành chính - Nhân sự' }
                                    ]}
                                    placeholder={t('Chọn phòng ban...')}
                                    width="100%"
                                  />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                    {t('Hình thức làm việc')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <CustomSelect
                                    value={recruitmentJobType}
                                    onChange={val => setRecruitmentJobType(val)}
                                    options={[
                                      { value: 'full_time', label: t('Toàn thời gian (Full-time)') },
                                      { value: 'part_time', label: t('Bán thời gian (Part-time)') },
                                      { value: 'intern', label: t('Thực tập sinh (Intern)') },
                                      { value: 'probation', label: t('Thử việc') },
                                      { value: 'contractor', label: t('Cộng tác viên / Thời vụ') }
                                    ]}
                                    width="100%"
                                  />
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                    {t('Ngày dự kiến nhận việc')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <VietnameseDateInput
                                    value={recruitmentExpectedDate}
                                    onChange={val => setRecruitmentExpectedDate(val)}
                                    inputStyle={{ height: '36px', fontSize: '0.82rem' }}
                                    required
                                  />
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (recruitmentReason === 'replacement' ? '1.2fr 1fr' : '1fr'), gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                    {t('Lý do tuyển dụng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <CustomSelect
                                    value={recruitmentReason}
                                    onChange={val => setRecruitmentReason(val)}
                                    options={[
                                      { value: 'expansion', label: t('Tuyển mới mở rộng quy mô bộ phận / dự án mới') },
                                      { value: 'replacement', label: t('Tuyển thay thế nhân sự nghỉ việc / chuyển công tác') },
                                      { value: 'project', label: t('Phục vụ dự án ngắn hạn / mùa cao điểm tuyển sinh') },
                                      { value: 'other', label: t('Nhu cầu bổ sung nhân sự khác') }
                                    ]}
                                    width="100%"
                                  />
                                </div>

                                {recruitmentReason === 'replacement' && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#dc2626' }}>
                                      {t('Thay thế cho nhân sự nào?')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={recruitmentReplacementWho}
                                      onChange={e => setRecruitmentReplacementWho(e.target.value)}
                                      placeholder={t('Họ tên nhân viên cũ hoặc sắp nghỉ...')}
                                      style={{ height: '38px', fontSize: '0.85rem', borderColor: 'rgba(220, 38, 38, 0.4)' }}
                                      required
                                    />
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Section 2: Mức lương dự kiến */}
                            <div style={{
                              background: 'var(--color-surface, #ffffff)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '14px',
                              padding: isMobile ? '1rem' : '1.25rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669' }}>
                                  <DollarSign size={16} />
                                  <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {t('2. Chế độ lương & ngân sách dự kiến')}
                                  </span>
                                </div>

                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 650, color: 'var(--color-text)' }}>
                                  <input
                                    type="checkbox"
                                    checked={recruitmentSalaryNegotiable}
                                    onChange={e => setRecruitmentSalaryNegotiable(e.target.checked)}
                                    style={{ width: '16px', height: '16px', accentColor: '#059669', cursor: 'pointer' }}
                                  />
                                  <span>{t('Lương thỏa thuận theo năng lực ứng viên')}</span>
                                </label>
                              </div>

                              {!recruitmentSalaryNegotiable && (
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem', marginTop: '4px' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Mức lương tối thiểu (VNĐ)')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={recruitmentSalaryMin ? Number(recruitmentSalaryMin).toLocaleString('vi-VN') : ''}
                                      onChange={e => {
                                        const raw = e.target.value.replace(/\D/g, '');
                                        setRecruitmentSalaryMin(raw ? Number(raw) : '');
                                      }}
                                      placeholder={t('Ví dụ: 8.000.000')}
                                      style={{ height: '38px', fontSize: '0.85rem', fontWeight: 700 }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Mức lương tối đa (VNĐ)')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={recruitmentSalaryMax ? Number(recruitmentSalaryMax).toLocaleString('vi-VN') : ''}
                                      onChange={e => {
                                        const raw = e.target.value.replace(/\D/g, '');
                                        setRecruitmentSalaryMax(raw ? Number(raw) : '');
                                      }}
                                      placeholder={t('Ví dụ: 15.000.000')}
                                      style={{ height: '38px', fontSize: '0.85rem', fontWeight: 700 }}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Section 3: Yêu cầu & Mô tả công việc JD */}
                            <div style={{
                              background: 'var(--color-surface, #ffffff)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '14px',
                              padding: isMobile ? '1rem' : '1.25rem',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '12px'
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text)' }}>
                                <FileText size={16} style={{ color: 'var(--color-primary)' }} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  {t('3. Tiêu chuẩn ứng viên & Bản mô tả công việc (JD)')}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {t('Tiêu chuẩn / Yêu cầu ứng viên')}
                                </label>
                                <textarea
                                  className="form-input"
                                  value={recruitmentRequirements}
                                  onChange={e => setRecruitmentRequirements(e.target.value)}
                                  placeholder={t('Ví dụ: Tốt nghiệp Đại học chuyên ngành liên quan, tối thiểu 1 năm kinh nghiệm, giao tiếp tự tin, có khả năng làm việc theo nhóm...')}
                                  style={{ minHeight: '80px', fontSize: '0.8rem', padding: '10px', resize: 'vertical' }}
                                />
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {t('Mô tả tóm tắt nhiệm vụ chính')}
                                </label>
                                <textarea
                                  className="form-input"
                                  value={recruitmentDescription}
                                  onChange={e => setRecruitmentDescription(e.target.value)}
                                  placeholder={t('Ví dụ: Tìm kiếm và tư vấn học viên tiềm năng cho các chương trình đào tạo BBA, chăm sóc data khách hàng, báo cáo KPI định kỳ...')}
                                  style={{ minHeight: '80px', fontSize: '0.8rem', padding: '10px', resize: 'vertical' }}
                                />
                              </div>

                              {/* Tải lên file JD đính kèm */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {t('Đính kèm bản mô tả công việc (File JD - PDF/Word/Ảnh)')}
                                </label>
                                <div
                                  tabIndex={0}
                                  onClick={() => {
                                    const el = document.getElementById('recruitment-jd-file-upload');
                                    if (el) el.click();
                                  }}
                                  style={{
                                    border: '2px dashed var(--color-border)',
                                    borderRadius: '12px',
                                    padding: '1.25rem',
                                    textAlign: 'center',
                                    background: 'var(--color-bg-secondary)',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease'
                                  }}
                                >
                                  <input
                                    id="recruitment-jd-file-upload"
                                    type="file"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      const files = Array.from(e.target.files || []);
                                      if (files.length === 0) return;
                                      await handleUploadFiles(files);
                                      e.target.value = '';
                                    }}
                                  />
                                  <Paperclip size={20} style={{ color: 'var(--color-primary)', marginBottom: '6px' }} />
                                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text)', margin: '0 0 2px 0', fontWeight: 650 }}>
                                    {t('Nhấn để chọn tệp JD hoặc kéo thả file vào đây')}
                                  </p>
                                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                    {t('Hỗ trợ .pdf, .docx, .doc, .png, .jpg (Tối đa 20MB)')}
                                  </span>
                                </div>

                                {attachments.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                                    {attachments.map((att, aIdx) => (
                                      <div key={aIdx} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '8px 12px',
                                        background: 'var(--color-bg-secondary)',
                                        borderRadius: '8px',
                                        border: '1px solid var(--color-border-light)'
                                      }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                          <Paperclip size={14} style={{ color: 'var(--color-primary)' }} />
                                          <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {att.name}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setAttachments(prev => prev.filter((_, i) => i !== aIdx))}
                                          style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600 }}
                                        >
                                          {t('Xóa')}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ) : formType === 'general' ? (
                          /* GENERAL / OPERATIONAL FORM FIELDS */
                          selectedWorkflowDef?.id === 'print_stamp_send' ? (
                            /* PRINT STAMP SEND CUSTOM FORM FIELDS */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Nhân viên yêu cầu')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <CustomSelect
                                    value={pssReqEmployeeId}
                                    onChange={val => setPssReqEmployeeId(val)}
                                    options={users.map(u => ({ 
                                      value: String(u.id), 
                                      label: u.full_name || u.name,
                                      avatar: u.avatar || u.avatar_url
                                    }))}
                                    placeholder={t('Chọn nhân viên...')}
                                    searchable
                                    showAvatars
                                    width="100%"
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Ngày yêu cầu')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <VietnameseDateInput
                                    value={pssReqDate}
                                    onChange={val => setPssReqDate(val)}
                                    inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                    required
                                  />
                                </div>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {t('Hồ sơ cần đóng dấu và gửi đi')} <span style={{ color: 'red' }}>*</span>
                                </label>
                                <div 
                                  tabIndex={0}
                                  onPaste={async (e) => {
                                    const items = e.clipboardData?.items;
                                    if (!items) return;
                                    const pastedFiles: File[] = [];
                                    for (let i = 0; i < items.length; i++) {
                                      if (items[i].type?.startsWith('image/')) {
                                        const f = items[i].getAsFile();
                                        if (f) {
                                          const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
                                          const ext = items[i].type.split('/')[1] || 'png';
                                          pastedFiles.push(new File([f], `ChungTu_${timestamp}_${i + 1}.${ext}`, { type: f.type }));
                                        }
                                      }
                                    }
                                    if (pastedFiles.length > 0) {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      await handleUploadFiles(pastedFiles);
                                    }
                                  }}
                                  style={{
                                    border: '2px dashed var(--color-border)',
                                    borderRadius: '12px',
                                    padding: '1.5rem',
                                    textAlign: 'center',
                                    background: 'var(--color-bg-secondary)',
                                    cursor: 'pointer',
                                    outline: 'none'
                                  }} 
                                  onClick={() => {
                                    const fileEl = document.getElementById('print-stamp-send-file-upload');
                                    if (fileEl) fileEl.click();
                                  }}
                                >
                                  <input
                                    id="print-stamp-send-file-upload"
                                    type="file"
                                    multiple
                                    style={{ display: 'none' }}
                                    onChange={async (e) => {
                                      const files = Array.from(e.target.files || []);
                                      if (files.length === 0) return;
                                      await handleUploadFiles(files);
                                      e.target.value = '';
                                    }}
                                  />
                                  <Paperclip size={24} style={{ color: 'var(--color-primary)', marginBottom: '8px' }} />
                                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text)', margin: '0 0 4px 0', fontWeight: 650 }}>
                                    {t('Nhấn để tải tài liệu lên, kéo thả hoặc nhấn Ctrl+V để dán ảnh')}
                                  </p>
                                </div>
                                {attachments.length > 0 && (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                                    {attachments.map((att, index) => (
                                      <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 12px', background: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border-light)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                          <Paperclip size={14} style={{ color: 'var(--color-text-muted)' }} />
                                          <span style={{ fontSize: '0.78rem', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {att.name}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                                          style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.85rem' }}
                                        >
                                          {t('Xóa')}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Người thực hiện')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <CustomSelect
                                    value={pssExecutorId}
                                    onChange={val => setPssExecutorId(val)}
                                    options={users.map(u => ({ 
                                      value: String(u.id), 
                                      label: u.full_name || u.name,
                                      avatar: u.avatar || u.avatar_url
                                    }))}
                                    placeholder={t('Chọn người thực hiện...')}
                                    searchable
                                    showAvatars
                                    width="100%"
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Hình thức gửi')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <CustomSelect
                                    value={pssSendMethod}
                                    onChange={val => setPssSendMethod(val)}
                                    options={[
                                      { value: 'Chuyển phát nhanh', label: t('Chuyển phát nhanh') },
                                      { value: 'Giao hàng trực tiếp', label: t('Giao hàng trực tiếp') },
                                      { value: 'Gửi EMS', label: t('Gửi EMS') },
                                      { value: 'Gửi Grab/Ahamove', label: t('Gửi Grab/Ahamove') },
                                      { value: 'Hình thức khác', label: t('Hình thức khác') }
                                    ]}
                                    width="100%"
                                  />
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Khung giờ gửi')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <CustomSelect
                                    value={pssSendTimeFrame}
                                    onChange={val => setPssSendTimeFrame(val)}
                                    options={[
                                      { value: 'Sáng (08:00 - 12:00)', label: t('Sáng (08:00 - 12:00)') },
                                      { value: 'Chiều (13:00 - 17:00)', label: t('Chiều (13:00 - 17:00)') }
                                    ]}
                                    width="100%"
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Tên người nhận')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={pssRecipientName}
                                    onChange={e => setPssRecipientName(e.target.value)}
                                    placeholder={t('Nhập tên người nhận...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                    required
                                  />
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Địa chỉ người nhận')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={pssRecipientAddress}
                                    onChange={e => setPssRecipientAddress(e.target.value)}
                                    placeholder={t('Nhập địa chỉ nhận hồ sơ...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                    required
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('SĐT người nhận')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={pssRecipientPhone}
                                    onChange={e => setPssRecipientPhone(e.target.value)}
                                    placeholder={t('Nhập số điện thoại người nhận...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                    required
                                  />
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Ngày cần gửi hồ sơ')} <span style={{ color: 'red' }}>*</span>
                                  </label>
                                  <VietnameseDateInput
                                    value={pssRequiredSendDate}
                                    onChange={val => setPssRequiredSendDate(val)}
                                    inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                    required
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span>{selectedWorkflowDef?.id === 'document_approval' ? t('Tên văn bản / Quyết định') : t('Tiêu đề đề xuất')}</span>
                                      <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                  </div>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'stretch',
                                    borderRadius: '10px',
                                    border: '1.5px solid var(--color-border)',
                                    background: 'var(--color-surface)',
                                    overflow: 'hidden',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                                  }}>
                                    <div style={{
                                      padding: '0 12px',
                                      background: 'var(--color-bg-secondary, #f1f5f9)',
                                      borderRight: '1.5px solid var(--color-border)',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      fontSize: '0.82rem',
                                      fontWeight: 700,
                                      color: 'var(--color-text)',
                                      whiteSpace: 'nowrap',
                                      userSelect: 'none',
                                      flexShrink: 0
                                    }}>
                                      <span style={{ color: selectedWorkflowDef?.color || 'var(--color-primary)' }}>●</span>
                                      <span>{selectedWorkflowDef?.name || t('Đề xuất')}</span>
                                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>—</span>
                                    </div>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={workflowTitleSuffix}
                                      onChange={e => {
                                        setWorkflowTitleSuffix(e.target.value);
                                        setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, e.target.value));
                                      }}
                                      placeholder={selectedWorkflowDef?.id === 'document_approval' ? t('Ví dụ: Quy chế hoạt động phòng kinh doanh...') : t('Ví dụ: Mua văn phòng phẩm tháng 9...')}
                                      style={{
                                        flex: 1,
                                        border: 'none',
                                        borderRadius: 0,
                                        height: '36px',
                                        fontSize: '0.85rem',
                                        fontWeight: 600,
                                        background: 'transparent',
                                        padding: '0 10px'
                                      }}
                                      required
                                    />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Bộ phận / Phòng ban')}</label>
                                  <CustomSelect
                                    value={departmentName}
                                    onChange={val => setDepartmentName(val)}
                                    options={teams.length > 0 ? teams.map(t => ({
                                      value: t.name,
                                      label: t.name
                                    })) : [
                                      { value: 'Ban Giám đốc', label: t('Ban Giám đốc') },
                                      { value: 'Phòng Kinh doanh', label: t('Phòng Kinh doanh (Sales)') },
                                      { value: 'Phòng Marketing', label: t('Phòng Marketing') },
                                      { value: 'Phòng Kế toán', label: t('Phòng Kế toán - Tài chính') },
                                      { value: 'Phòng Nhân sự', label: t('Phòng Nhân sự (HR)') },
                                      { value: 'Phòng IT', label: t('Phòng IT / Kỹ thuật') },
                                      { value: 'Bộ phận Vận hành', label: t('Bộ phận Vận hành') }
                                    ]}
                                    placeholder={t('Chọn phòng ban / bộ phận...')}
                                    width="100%"
                                  />
                                </div>
                              </div>

                              {(selectedWorkflowDef?.id === 'stationery' || selectedWorkflowDef?.id === 'purchase_request' || selectedWorkflowDef?.id === 'it_request') && (
                                <div style={{
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '12px',
                                  background: 'var(--color-bg-secondary, rgba(0,0,0,0.02))',
                                  padding: isMobile ? '12px' : '16px',
                                  borderRadius: '12px',
                                  border: '1px solid var(--color-border)'
                                }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                        {selectedWorkflowDef?.id === 'purchase_request' ? t('Danh sách trang thiết bị / công cụ cần mua sắm') : selectedWorkflowDef?.id === 'it_request' ? t('Danh sách thiết bị IT & phần mềm yêu cầu cấp phát') : t('Danh sách văn phòng phẩm')} ({stationeryItems.length})
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setStationeryItems(prev => [
                                        ...prev,
                                        { id: Date.now(), name: '', quantity: 1, unit: 'Cái', notes: '' }
                                      ])}
                                      className="btn outline hover-lift"
                                      style={{
                                        height: '30px',
                                        padding: '0 10px',
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        borderColor: 'var(--color-primary)',
                                        color: 'var(--color-primary)',
                                        borderRadius: '6px'
                                      }}
                                    >
                                      <Plus size={14} />
                                      {t('Thêm loại')}
                                    </button>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {stationeryItems.map((item, idx) => {
                                      const qty = Number(item.quantity) || 1;
                                      const unitPrice = Number(item.price) || 0;
                                      const vatPercent = Number(item.vat !== undefined ? item.vat : 10);
                                      const lineSubtotal = qty * unitPrice;
                                      const lineVat = lineSubtotal * (vatPercent / 100);
                                      const lineTotal = lineSubtotal + lineVat;

                                      return (
                                        <div
                                          key={item.id}
                                          style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '8px',
                                            padding: '12px 14px',
                                            background: 'var(--color-surface)',
                                            borderRadius: '10px',
                                            border: '1px solid var(--color-border)',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
                                          }}
                                        >
                                          {/* Row 1: Item Basic Info */}
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
                                            <div style={{
                                              width: '24px',
                                              height: '24px',
                                              borderRadius: '6px',
                                              background: 'var(--color-bg-secondary, #f1f5f9)',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              fontSize: '0.75rem',
                                              fontWeight: 850,
                                              color: 'var(--color-text-muted)',
                                              flexShrink: 0
                                            }}>
                                              {idx + 1}
                                            </div>

                                            <div style={{ flex: isMobile ? '1 1 100%' : '3', minWidth: isMobile ? '100%' : '200px' }}>
                                              <input
                                                type="text"
                                                value={item.name}
                                                onChange={e => {
                                                  const next = [...stationeryItems];
                                                  next[idx].name = e.target.value;
                                                  setStationeryItems(next);
                                                }}
                                                placeholder={selectedWorkflowDef?.id === 'purchase_request' ? t('Vd: Laptop Dell XPS 15, Màn hình LG 27 inch, Bàn làm việc... *') : selectedWorkflowDef?.id === 'it_request' ? t('Vd: Laptop ThinkPad T14, Màn hình rời, License phần mềm... *') : t('Tên văn phòng phẩm / vật phẩm... *')}
                                                className="form-input"
                                                style={{ height: '34px', fontSize: '0.8rem', width: '100%', fontWeight: 600 }}
                                                required
                                              />
                                            </div>

                                            <div style={{ width: isMobile ? '80px' : '90px', flexShrink: 0 }}>
                                              <input
                                                type="number"
                                                min="1"
                                                value={item.quantity}
                                                onChange={e => {
                                                  const next = [...stationeryItems];
                                                  next[idx].quantity = e.target.value;
                                                  setStationeryItems(next);
                                                }}
                                                placeholder="SL *"
                                                title={t('Số lượng')}
                                                className="form-input"
                                                style={{ height: '34px', fontSize: '0.8rem', width: '100%', textAlign: 'center' }}
                                                required
                                              />
                                            </div>

                                            <div style={{ width: isMobile ? '95px' : '110px', flexShrink: 0 }}>
                                              <input
                                                type="text"
                                                list={`unit-suggestions-${item.id}`}
                                                value={item.unit}
                                                onChange={e => {
                                                  const next = [...stationeryItems];
                                                  next[idx].unit = e.target.value;
                                                  setStationeryItems(next);
                                                }}
                                                placeholder={t('ĐVT (Cái...)')}
                                                className="form-input"
                                                style={{ height: '34px', fontSize: '0.8rem', width: '100%' }}
                                              />
                                              <datalist id={`unit-suggestions-${item.id}`}>
                                                <option value="Cái" />
                                                <option value="Bộ" />
                                                <option value="Chiếc" />
                                                <option value="Máy" />
                                                <option value="Màn hình" />
                                                <option value="Dàn" />
                                                <option value="Gói" />
                                                <option value="Account" />
                                                <option value="License" />
                                                <option value="Cây" />
                                                <option value="Ram" />
                                                <option value="Hộp" />
                                                <option value="Thùng" />
                                              </datalist>
                                            </div>

                                            <div style={{ flex: isMobile ? '1 1 100%' : '2', minWidth: isMobile ? '100%' : '140px' }}>
                                              <input
                                                type="text"
                                                value={item.notes || ''}
                                                onChange={e => {
                                                  const next = [...stationeryItems];
                                                  next[idx].notes = e.target.value;
                                                  setStationeryItems(next);
                                                }}
                                                placeholder={t('Ghi chú nếu có...')}
                                                className="form-input"
                                                style={{ height: '34px', fontSize: '0.8rem', width: '100%' }}
                                              />
                                            </div>

                                            {stationeryItems.length > 1 && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setStationeryItems(stationeryItems.filter(it => it.id !== item.id));
                                                }}
                                                style={{
                                                  border: 'none',
                                                  background: 'rgba(239, 68, 68, 0.08)',
                                                  color: '#ef4444',
                                                  cursor: 'pointer',
                                                  padding: '6px',
                                                  borderRadius: '6px',
                                                  display: 'flex',
                                                  alignItems: 'center',
                                                  justifyContent: 'center',
                                                  flexShrink: 0
                                                }}
                                                title={t('Xóa dòng này')}
                                              >
                                                <Trash2 size={15} />
                                              </button>
                                            )}
                                          </div>

                                          {/* Row 2: Price, VAT %, and Total calculation (Xuống dòng riêng biệt, không bị chật) */}
                                          <div style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '8px 12px',
                                            background: lineTotal > 0 ? 'rgba(37, 99, 235, 0.04)' : 'var(--color-bg-light, #f8fafc)',
                                            borderRadius: '8px',
                                            border: lineTotal > 0 ? '1px dashed rgba(37, 99, 235, 0.25)' : '1px dashed var(--color-border-light)',
                                            flexWrap: 'wrap'
                                          }}>
                                            {/* Price input */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '200px', flex: isMobile ? '1 1 100%' : 'none' }}>
                                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                                {t('Đơn giá dự kiến:')}
                                              </span>
                                              <input
                                                type="text"
                                                value={item.price !== '' && item.price !== undefined ? formatNumberWithDots(String(item.price), currencyType) : ''}
                                                onChange={e => {
                                                  const rawPrice = parseMoneyInput(e.target.value, currencyType);
                                                  const next = [...stationeryItems];
                                                  next[idx].price = rawPrice === '' ? '' : (rawPrice.endsWith('.') ? rawPrice : Number(rawPrice));
                                                  setStationeryItems(next);
                                                }}
                                                placeholder={t('0 đ (nếu có)')}
                                                className="form-input"
                                                style={{ height: '30px', fontSize: '0.78rem', width: '130px', fontWeight: 600 }}
                                              />
                                            </div>

                                            {/* VAT Select & Custom Input */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                                {t('Thuế VAT:')}
                                              </span>
                                              <select
                                                value={
                                                  item.vatType === 'kct'
                                                    ? 'kct'
                                                    : [0, 5, 8, 10].includes(Number(item.vat)) && item.vatType !== 'custom'
                                                      ? String(item.vat)
                                                      : 'custom'
                                                }
                                                onChange={e => {
                                                  const val = e.target.value;
                                                  const next = [...stationeryItems];
                                                  if (val === 'kct') {
                                                    next[idx].vat = 0;
                                                    next[idx].vatType = 'kct';
                                                  } else if (val === 'custom') {
                                                    next[idx].vatType = 'custom';
                                                    if (next[idx].vat === undefined) next[idx].vat = 10;
                                                  } else {
                                                    next[idx].vat = Number(val);
                                                    next[idx].vatType = val as any;
                                                  }
                                                  setStationeryItems(next);
                                                }}
                                                className="form-input"
                                                style={{
                                                  height: '30px',
                                                  fontSize: '0.78rem',
                                                  width: '142px',
                                                  padding: '2px 8px',
                                                  cursor: 'pointer',
                                                  borderRadius: '6px',
                                                  fontWeight: 600,
                                                  background: 'var(--color-surface)',
                                                  color: 'var(--color-text)'
                                                }}
                                              >
                                                <option value="kct">{t('Không chịu thuế')}</option>
                                                <option value="0">0%</option>
                                                <option value="5">5%</option>
                                                <option value="8">8%</option>
                                                <option value="10">10%</option>
                                                <option value="custom">{t('Tự nhập % khác...')}</option>
                                              </select>

                                              {(item.vatType === 'custom' || (![0, 5, 8, 10].includes(Number(item.vat)) && item.vatType !== 'kct')) && (
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                  <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    value={item.vat !== undefined ? item.vat : 10}
                                                    onChange={e => {
                                                      const next = [...stationeryItems];
                                                      next[idx].vat = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                                      next[idx].vatType = 'custom';
                                                      setStationeryItems(next);
                                                    }}
                                                    className="form-input"
                                                    style={{ height: '30px', width: '56px', fontSize: '0.78rem', textAlign: 'center', fontWeight: 700 }}
                                                    placeholder="%"
                                                  />
                                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>%</span>
                                                </div>
                                              )}
                                            </div>

                                            {/* Line Total */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: isMobile ? '0' : 'auto' }}>
                                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                                {t('Thành tiền (có VAT):')}
                                              </span>
                                              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: lineTotal > 0 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                                                {lineTotal > 0 ? formatApprovalCurrency(lineTotal, currencyType) : '0 đ'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {(() => {
                                    const statSubtotal = stationeryItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.price) || 0)), 0);
                                    const statVatTotal = stationeryItems.reduce((acc, it) => acc + ((Number(it.quantity) || 1) * (Number(it.price) || 0) * (Number(it.vat !== undefined ? it.vat : 10) / 100)), 0);
                                    const statGrandTotal = statSubtotal + statVatTotal;

                                    return (
                                      <div style={{
                                        display: 'flex',
                                        flexDirection: isMobile ? 'column' : 'row',
                                        justifyContent: 'space-between',
                                        alignItems: isMobile ? 'stretch' : 'flex-end',
                                        gap: '1.25rem',
                                        padding: '1rem 1.25rem',
                                        background: statGrandTotal > 0 ? 'rgba(37, 99, 235, 0.03)' : 'var(--color-surface)',
                                        borderRadius: '12px',
                                        border: `1px solid ${statGrandTotal > 0 ? 'rgba(37, 99, 235, 0.18)' : 'var(--color-border-light)'}`,
                                        marginTop: '4px'
                                      }}>
                                        {/* Left description / PO Notice */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                                          {statGrandTotal > 0 ? (
                                            <>
                                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontWeight: 800, fontSize: '0.8rem' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Zap size={13} strokeWidth={2} /> {t('Đề xuất có kinh phí')}</span>
                                                <span>•</span>
                                                <span style={{ background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.7rem' }}>
                                                  {t('Tự động cấu thành PO (Purchase Order)')}
                                                </span>
                                              </div>
                                              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', lineHeight: 1.45 }}>
                                                {t('Sau khi duyệt hoàn tất, hệ thống sẽ tự động chuyển khoản chi này vào danh sách Purchase Order để Phòng Kế toán thực hiện thanh toán chi trả.')}
                                              </div>
                                            </>
                                          ) : (
                                            <div style={{ fontSize: '0.75rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                              <Info size={14} strokeWidth={1.75} style={{ flexShrink: 0 }} />
                                              <span><strong>{t('Đề xuất phi tài chính (0 đ)')}</strong>: {t('Chỉ duyệt quy trình hành chính nội bộ, không tạo Purchase Order.')}</span>
                                            </div>
                                          )}
                                        </div>

                                        {/* Right Multi-row Price Breakdown */}
                                        {statGrandTotal > 0 && (
                                          <div style={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '6px',
                                            minWidth: isMobile ? '100%' : '320px',
                                            fontSize: '0.8rem',
                                            background: 'var(--color-surface)',
                                            padding: '12px 16px',
                                            borderRadius: '10px',
                                            border: '1px solid var(--color-border)',
                                            boxShadow: 'var(--shadow-sm)'
                                          }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ color: 'var(--color-text-muted)' }}>{t('Tiền hàng (chưa thuế):')}</span>
                                              <strong style={{ color: 'var(--color-text)', fontSize: '0.85rem' }}>{formatApprovalCurrency(statSubtotal, currencyType)}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                              <span style={{ color: 'var(--color-text-muted)' }}>{t('Tiền thuế VAT:')}</span>
                                              <strong style={{ color: 'var(--color-text)', fontSize: '0.85rem' }}>{formatApprovalCurrency(statVatTotal, currencyType)}</strong>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: '8px', marginTop: '2px' }}>
                                              <span style={{ fontWeight: 800, color: 'var(--color-text)', fontSize: '0.875rem' }}>{t('Tổng thanh toán (có VAT):')}</span>
                                              <strong style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--color-primary)', fontSize: '1.05rem' }}>{formatApprovalCurrency(statGrandTotal, currencyType)}</strong>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 600, textAlign: 'right', marginTop: '2px' }}>
                                              ({numberToVietnameseText(statGrandTotal, currencyType)})
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  <button
                                    type="button"
                                    onClick={() => setStationeryItems(prev => [
                                      ...prev,
                                      { id: Date.now(), name: '', quantity: 1, unit: 'Cái', notes: '', price: '', vat: 10 }
                                    ])}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '6px',
                                      width: '100%',
                                      padding: '8px',
                                      borderRadius: '8px',
                                      border: '1px dashed var(--color-border)',
                                      background: 'transparent',
                                      color: 'var(--color-primary)',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      cursor: 'pointer',
                                      marginTop: '2px',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-bg-light)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                  >
                                    <Plus size={14} />
                                    {selectedWorkflowDef?.id === 'purchase_request' ? t('Thêm trang thiết bị khác') : selectedWorkflowDef?.id === 'it_request' ? t('Thêm thiết bị IT khác') : t('Thêm loại văn phòng phẩm khác')}
                                  </button>
                                </div>
                              )}
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {selectedWorkflowDef?.id === 'document_approval' ? t('Nội dung tóm tắt văn bản') : t('Nội dung đề xuất / Giải trình chi tiết')}
                                </label>
                                <textarea
                                  className="form-input"
                                  value={paymentDetails}
                                  onChange={e => setPaymentDetails(e.target.value)}
                                  placeholder={selectedWorkflowDef?.id === 'document_approval' ? t('Tóm tắt các điểm chính hoặc nội dung cần phê duyệt của văn bản...') : t('Nhập nội dung giải trình hoặc đề xuất chi tiết...')}
                                  style={{ minHeight: '100px', fontSize: '0.8rem', padding: '8px', resize: 'vertical' }}
                                  required
                                />
                              </div>
                              
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {selectedWorkflowDef?.id === 'document_approval' ? t('Lý do trình ký / Căn cứ phê duyệt') : t('Lý do & Ý kiến đề xuất')}
                                </label>
                                <input
                                  type="text"
                                  className="form-input"
                                  value={leaveReason}
                                  onChange={e => setLeaveReason(e.target.value)}
                                  placeholder={selectedWorkflowDef?.id === 'document_approval' ? t('Ví dụ: Theo nghị quyết Đại hội đồng cổ đông...') : t('Lý do đề xuất (nếu có)...')}
                                  style={{ height: '36px', fontSize: '0.8rem' }}
                                />
                              </div>
                            </div>
                          )
                        ) : (
                          /* EXPENSE AND PAYMENT FORM FIELDS */
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            {/* Workflow Banner Highlight */}
                            {selectedWorkflowDef && (
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '10px 14px',
                                borderRadius: '12px',
                                background: selectedWorkflowDef.id === 'client_meeting' 
                                  ? 'rgba(236, 72, 153, 0.08)' 
                                  : selectedWorkflowDef.id === 'recurring_payment'
                                  ? 'rgba(217, 70, 239, 0.08)'
                                  : selectedWorkflowDef.id === 'phased_payment'
                                  ? 'rgba(139, 92, 246, 0.08)'
                                  : selectedWorkflowDef.id === 'advance_money'
                                  ? 'rgba(59, 130, 246, 0.08)'
                                  : selectedWorkflowDef.id === 'expense_claim'
                                  ? 'rgba(6, 182, 212, 0.08)'
                                  : 'rgba(16, 185, 129, 0.08)',
                                border: `1px solid ${
                                  selectedWorkflowDef.id === 'client_meeting' 
                                    ? 'rgba(236, 72, 153, 0.25)' 
                                    : selectedWorkflowDef.id === 'recurring_payment'
                                    ? 'rgba(217, 70, 239, 0.25)'
                                    : selectedWorkflowDef.id === 'phased_payment'
                                    ? 'rgba(139, 92, 246, 0.25)'
                                    : selectedWorkflowDef.id === 'advance_money'
                                    ? 'rgba(59, 130, 246, 0.25)'
                                    : selectedWorkflowDef.id === 'expense_claim'
                                    ? 'rgba(6, 182, 212, 0.25)'
                                    : 'rgba(16, 185, 129, 0.25)'
                                }`
                              }}>
                                <div style={{
                                  width: '36px',
                                  height: '36px',
                                  borderRadius: '10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  filter: 'drop-shadow(0 3px 6px rgba(15, 23, 42, 0.14))',
                                  flexShrink: 0
                                }}>
                                  <AppIcon name={`wf_${selectedWorkflowDef.id}`} size={36} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>{selectedWorkflowDef.name}</span>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{selectedWorkflowDef.description}</span>
                                </div>
                              </div>
                            )}

                            {/* Tiêu đề quy trình / Nội dung chi (Fix cứng khúc đầu, cho sửa khúc sau) */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span>{t('Tiêu đề đề xuất / Nội dung chi')}</span>
                                  <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                              </div>
                              
                              <div style={{
                                display: 'flex',
                                alignItems: 'stretch',
                                borderRadius: '10px',
                                border: '1.5px solid var(--color-border)',
                                background: 'var(--color-surface)',
                                overflow: 'hidden',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                              }}>
                                {/* Fixed Prefix Box (Cố định tên loại quy trình) */}
                                <div style={{
                                  padding: '0 14px',
                                  background: 'var(--color-bg-secondary, #f1f5f9)',
                                  borderRight: '1.5px solid var(--color-border)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  color: 'var(--color-text)',
                                  whiteSpace: 'nowrap',
                                  userSelect: 'none',
                                  flexShrink: 0
                                }}>
                                  <span style={{ color: selectedWorkflowDef?.color || '#10b981', fontSize: '0.9rem' }}>●</span>
                                  <span>{selectedWorkflowDef?.name || t('Đề nghị thanh toán')}</span>
                                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>—</span>
                                </div>

                                {/* Suffix Input (Cho phép sửa / nhập nội dung chi tiết) */}
                                <input
                                  type="text"
                                  className="form-input"
                                  value={workflowTitleSuffix}
                                  onChange={e => {
                                    setWorkflowTitleSuffix(e.target.value);
                                    setExpenseTitle(getFullWorkflowTitle(selectedWorkflowDef, e.target.value));
                                  }}
                                  placeholder={
                                    selectedWorkflowDef?.id === 'payment'
                                      ? t('Nhập nội dung chi cụ thể (VD: In ấn, thi công Lễ tốt nghiệp, Tiền điện nước tháng 9...) *')
                                      : selectedWorkflowDef?.id === 'client_meeting'
                                      ? t('Nhập tên sự kiện / đối tác tiếp khách (VD: Tiếp đoàn đối tác FPT Software...) *')
                                      : selectedWorkflowDef?.id === 'recurring_payment'
                                      ? t('Nhập chi phí định kỳ cụ thể (VD: Tiền thuê văn phòng Tân Bình...) *')
                                      : selectedWorkflowDef?.id === 'phased_payment'
                                      ? t('Nhập dự án / hợp đồng thanh toán theo đợt (VD: Thiết kế website MYERP...) *')
                                      : selectedWorkflowDef?.id === 'advance_money'
                                      ? t('Nhập mục đích tạm ứng (VD: Công tác Hà Nội 3 ngày...) *')
                                      : t('Nhập nội dung / mục đích cụ thể của khoản chi... *')
                                  }
                                  style={{
                                    flex: 1,
                                    border: 'none',
                                    borderRadius: 0,
                                    height: '40px',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
                                    background: 'transparent',
                                    padding: '0 14px'
                                  }}
                                  required
                                />
                              </div>
                            </div>

                            {/* DEDICATED BLOCK 1: ĐỀ XUẤT TIẾP KHÁCH (client_meeting) */}
                            {selectedWorkflowDef?.id === 'client_meeting' && (
                              <div style={{
                                background: 'linear-gradient(135deg, rgba(236, 72, 153, 0.05), rgba(219, 39, 119, 0.02))',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: '14px',
                                padding: '1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '14px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#BD1D2D' }}>
                                    <Utensils size={18} />
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                      {t('Thông tin buổi tiếp đãi khách hàng & đối tác VIP')}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.72rem', color: '#BD1D2D', fontWeight: 600 }}>
                                    {t('Chuẩn hóa quy trình ngoại giao doanh nghiệp')}
                                  </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1.4fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Phân loại đối tượng tiếp đón')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <CustomSelect
                                      value={meetingTargetType}
                                      onChange={val => {
                                        setMeetingTargetType(val as any);
                                        setMeetingSelectedEntityId('');
                                      }}
                                      options={[
                                        { value: 'company', label: t('Doanh nghiệp / Đối tác B2B') },
                                        { value: 'lecturer', label: t('Giảng viên / Chuyên gia cao cấp') },
                                        { value: 'contact', label: t('Khách hàng VIP / Học viên CRM') },
                                        { value: 'gov', label: t('Cơ quan Nhà nước / Ban ngành / Đoàn thể') },
                                        { value: 'other', label: t('Cá nhân ngoài / Khách mời vãng lai') }
                                      ]}
                                      width="100%"
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Đơn vị / Khách mời tiếp đón')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    {meetingTargetType === 'company' && (
                                      <CustomSelect
                                        options={[
                                          { value: '', label: t('-- Chọn đối tác trong danh bạ (hoặc nhập bên dưới) --') },
                                          ...partnerOptions
                                        ]}
                                        value={meetingSelectedEntityId}
                                        onChange={val => {
                                          setMeetingSelectedEntityId(val);
                                          const found = partnerOptions.find(p => p.value === val);
                                          if (found) setMeetingClientName(found.label);
                                        }}
                                        placeholder={t('-- Tìm đối tác doanh nghiệp --')}
                                        searchable
                                        width="100%"
                                      />
                                    )}
                                    {meetingTargetType === 'lecturer' && (
                                      <CustomSelect
                                        options={[
                                          { value: '', label: t('-- Chọn giảng viên trong hệ thống --') },
                                          ...lecturerOptions
                                        ]}
                                        value={meetingSelectedEntityId}
                                        onChange={val => {
                                          setMeetingSelectedEntityId(val);
                                          const found = lecturerOptions.find(l => l.value === val);
                                          if (found) setMeetingClientName(found.label);
                                        }}
                                        placeholder={t('-- Tìm giảng viên / chuyên gia --')}
                                        searchable
                                        width="100%"
                                      />
                                    )}
                                    {meetingTargetType === 'contact' && (
                                      <CustomSelect
                                        options={[
                                          { value: '', label: t('-- Chọn khách hàng / học viên CRM --') },
                                          ...contactOptions
                                        ]}
                                        value={meetingSelectedEntityId}
                                        onChange={val => {
                                          setMeetingSelectedEntityId(val);
                                          const found = contactOptions.find(c => c.value === val);
                                          if (found) setMeetingClientName(found.label);
                                        }}
                                        placeholder={t('-- Tìm khách hàng CRM --')}
                                        searchable
                                        width="100%"
                                      />
                                    )}
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={meetingClientName}
                                      onChange={e => setMeetingClientName(e.target.value)}
                                      placeholder={t('Họ và tên khách mời / Tên cơ quan, doanh nghiệp...')}
                                      style={{ height: '36px', fontSize: '0.8rem', marginTop: meetingTargetType !== 'other' && meetingTargetType !== 'gov' ? '4px' : '0' }}
                                      required
                                    />
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Người đại diện khách & Chức vụ (nếu có)')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={meetingContactPerson}
                                      onChange={e => setMeetingContactPerson(e.target.value)}
                                      placeholder={t('Ví dụ: Ông Nguyễn Văn A - Tổng Giám Đốc...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Số điện thoại liên hệ đại diện khách')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={meetingContactPhone}
                                      onChange={e => setMeetingContactPhone(e.target.value)}
                                      placeholder={t('Ví dụ: 0901234567...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 0.9fr 0.7fr 0.7fr 0.7fr', gap: '0.75rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Địa điểm tiếp khách')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      list="datalist-meeting-locations"
                                      className="form-input"
                                      value={meetingLocation}
                                      onChange={e => setMeetingLocation(e.target.value)}
                                      placeholder={t('Tên nhà hàng, quán cafe, địa chỉ...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                      required
                                    />
                                    <datalist id="datalist-meeting-locations">
                                      <option value="Nhà hàng (Ăn trưa trao đổi công việc)" />
                                      <option value="Nhà hàng (Tiệc tối tiếp đón trang trọng)" />
                                      <option value="Quán Cafe / Phòng trà (Gặp gỡ thân mật)" />
                                      <option value="Phòng tiếp khách VIP tại trụ sở công ty" />
                                      <option value="Khách sạn / Trung tâm hội nghị / Sự kiện" />
                                      <option value="Sân Golf / Giao lưu thể thao ngoại giao" />
                                      <option value="Văn phòng / Địa điểm của đối tác" />
                                    </datalist>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Ngày tiếp')}
                                    </label>
                                    <VietnameseDateInput
                                      value={meetingDate}
                                      onChange={val => setMeetingDate(val)}
                                      inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Giờ tiếp')}
                                    </label>
                                    <input
                                      type="time"
                                      className="form-input"
                                      value={meetingTime}
                                      onChange={e => setMeetingTime(e.target.value)}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Số khách')}
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      className="form-input"
                                      value={meetingClientCount}
                                      onChange={e => setMeetingClientCount(e.target.value)}
                                      style={{ height: '36px', fontSize: '0.8rem', textAlign: 'center' }}
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Số nội bộ')}
                                    </label>
                                    <input
                                      type="number"
                                      min="1"
                                      className="form-input"
                                      value={meetingInternalCount}
                                      onChange={e => setMeetingInternalCount(e.target.value)}
                                      style={{ height: '36px', fontSize: '0.8rem', textAlign: 'center' }}
                                    />
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Kế hoạch / Mục đích buổi tiếp đón')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      list="datalist-meeting-purposes"
                                      className="form-input"
                                      value={meetingPurpose}
                                      onChange={e => setMeetingPurpose(e.target.value)}
                                      placeholder={t('Gặp gỡ trao đổi, xúc tiến hợp tác...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                      required
                                    />
                                    <datalist id="datalist-meeting-purposes">
                                      <option value="Gặp gỡ trao đổi & xúc tiến cơ hội hợp tác kinh doanh" />
                                      <option value="Đàm phán & Thương thảo điều khoản hợp đồng đào tạo / dịch vụ" />
                                      <option value="Ký kết thỏa thuận hợp tác đối tác chiến lược" />
                                      <option value="Chăm sóc quan hệ khách hàng VIP / Thân thiết" />
                                      <option value="Tri ân & Chiêu đãi giảng viên sau khóa học / chuyên đề" />
                                      <option value="Tổng kết dự án & Liên hoan nghiệm thu với đối tác" />
                                      <option value="Tiếp đón đoàn làm việc / Đại biểu ban ngành cơ quan" />
                                      <option value="Trao đổi định hướng phát triển sản phẩm / chương trình mới" />
                                    </datalist>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Cán bộ nhân sự tham gia cùng (Nội bộ)')}
                                    </label>
                                    <CustomSelect
                                      options={users.map((u: any) => ({
                                        value: String(u.id),
                                        label: u.full_name || u.name || `User #${u.id}`,
                                        avatar: u.avatar_url || u.avatar,
                                        sublabel: u.role || ''
                                      }))}
                                      value={meetingInternalAttendees[0] || ''}
                                      onChange={val => {
                                        const uid = String(val);
                                        if (uid && !meetingInternalAttendees.includes(uid)) {
                                          setMeetingInternalAttendees([...meetingInternalAttendees, uid]);
                                        }
                                      }}
                                      placeholder={t('+ Thêm cán bộ đi cùng...')}
                                      searchable
                                      showAvatars
                                      width="100%"
                                    />
                                    {meetingInternalAttendees.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                                        {meetingInternalAttendees.map(id => {
                                          const emp = users.find(u => String(u.id) === String(id));
                                          return (
                                            <span key={id} style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              padding: '2px 8px',
                                              borderRadius: '6px',
                                              background: 'rgba(189, 29, 45, 0.08)',
                                              color: '#BD1D2D',
                                              fontSize: '0.72rem',
                                              fontWeight: 650
                                            }}>
                                              {emp ? (emp.full_name || emp.name) : id}
                                              <X
                                                size={12}
                                                style={{ cursor: 'pointer' }}
                                                onClick={() => setMeetingInternalAttendees(meetingInternalAttendees.filter(x => x !== id))}
                                              />
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Phương thức thanh toán / Hoàn trả chi phí tiếp khách')}
                                    </label>
                                    <CustomSelect
                                      value={meetingReimbursementMethod}
                                      onChange={val => {
                                        const method = val as any;
                                        setMeetingReimbursementMethod(method);
                                        if (method === 'host_claim') {
                                          setPaymentTarget('Nội bộ');
                                          const currentEmp = users.find(u => Number(u.id) === Number(user?.id)) || user;
                                          if (currentEmp) {
                                            setPaymentEmployeeId(String(currentEmp.id));
                                            setPaymentBeneficiaryName(currentEmp.full_name || currentEmp.name || '');
                                            if (currentEmp.bank_name) setPaymentBankName(currentEmp.bank_name);
                                            if (currentEmp.bank_account) setPaymentBankAccount(currentEmp.bank_account);
                                            const accName = currentEmp.full_name || currentEmp.name || '';
                                            if (accName) setPaymentAccountName(accName.toUpperCase());
                                            if (currentEmp.phone) setPaymentPhone(currentEmp.phone);
                                          }
                                        } else if (method === 'direct_partner') {
                                          setPaymentTarget('Đối tác');
                                        } else if (method === 'corporate_card') {
                                          setPaymentMethod('Thẻ tín dụng');
                                        } else if (method === 'cash_advance') {
                                          setPaymentMethod('Tiền mặt');
                                        }
                                      }}
                                      options={[
                                        { value: 'host_claim', label: t('Hoàn ứng cho Cán bộ tiếp khách (Chi trước nhận lại sau)') },
                                        { value: 'direct_partner', label: t('Thanh toán trực tiếp cho Nhà hàng / Địa điểm tiếp đón') },
                                        { value: 'corporate_card', label: t('Thanh toán bằng Thẻ tín dụng doanh nghiệp (Corporate Card)') },
                                        { value: 'cash_advance', label: t('Tạm ứng kinh phí tiếp khách (Tiền mặt tại Thủ quỹ)') }
                                      ]}
                                      width="100%"
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Hóa đơn & Chứng từ tiếp đón')}
                                    </label>
                                    <CustomSelect
                                      value={meetingInvoiceType}
                                      onChange={val => setMeetingInvoiceType(val as any)}
                                      options={[
                                        { value: 'vat', label: t('Hóa đơn điện tử VAT (Xuất hóa đơn tên công ty)') },
                                        { value: 'retail', label: t('Hóa đơn bán lẻ / Bill POS quẹt thẻ') },
                                        { value: 'receipt', label: t('Giấy biên nhận / Phiếu tạm thu') },
                                        { value: 'pending', label: t('Chưa có hóa đơn (Bổ sung chứng từ sau khi tiếp đón)') }
                                      ]}
                                      width="100%"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* DEDICATED BLOCK 2: THANH TOÁN ĐỊNH KỲ (recurring_payment or isRecurring) */}
                            {(selectedWorkflowDef?.id === 'recurring_payment' || isRecurring) && (
                              <div style={{
                                background: 'linear-gradient(135deg, rgba(217, 70, 239, 0.05), rgba(192, 38, 211, 0.02))',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: '14px',
                                padding: '1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#334155' }}>
                                    <Clock3 size={18} />
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                      {t('Thiết lập chu kỳ & lịch giải ngân thanh toán tự động')}
                                    </span>
                                  </div>
                                  <span style={{ fontSize: '0.72rem', color: '#334155', fontWeight: 600 }}>
                                    {t('Tự động sinh đề xuất theo kỳ')}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Chu kỳ / Tần suất lặp lại')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <CustomSelect
                                      value={recurringFrequency}
                                      onChange={val => setRecurringFrequency(val)}
                                      options={[
                                        { value: 'monthly', label: t('Hàng tháng (Monthly) - Tiền thuê nhà, internet, dịch vụ') },
                                        { value: 'quarterly', label: t('Hàng quý (Quarterly - 3 tháng/lần) - Mặt bằng, bảo trì') },
                                        { value: 'semiannually', label: t('Hàng nửa năm (Semi-annually - 6 tháng/lần) - Bảo hiểm, SaaS') },
                                        { value: 'yearly', label: t('Hàng năm (Yearly) - Tên miền, hosting, bản quyền PM') },
                                        { value: 'biweekly', label: t('Hàng 2 tuần (Bi-weekly) - Chi phí vật tư định kỳ') },
                                        { value: 'weekly', label: t('Hàng tuần (Weekly) - Thực phẩm, tạp vụ, vệ sinh') }
                                      ]}
                                      width="100%"
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Ngày giải ngân cố định trong kỳ')}
                                    </label>
                                    <CustomSelect
                                      value={recurringPayDay}
                                      onChange={val => setRecurringPayDay(val)}
                                      options={[
                                        { value: '1', label: t('Ngày 01 đầu tháng') },
                                        { value: '5', label: t('Ngày 05 hàng tháng') },
                                        { value: '10', label: t('Ngày 10 hàng tháng') },
                                        { value: '15', label: t('Ngày 15 giữa tháng') },
                                        { value: '20', label: t('Ngày 20 hàng tháng') },
                                        { value: '25', label: t('Ngày 25 hàng tháng') },
                                        { value: 'last_day', label: t('Ngày làm việc cuối cùng trong tháng') }
                                      ]}
                                      width="100%"
                                    />
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.1fr 1.4fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Thời hạn hiệu lực của chu kỳ')}
                                    </label>
                                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', height: '36px' }}>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                        <input
                                          type="radio"
                                          name="recurring_duration"
                                          checked={recurringUnlimited}
                                          onChange={() => setRecurringUnlimited(true)}
                                        />
                                        <span>{t('Vô thời hạn (Đến khi hủy)')}</span>
                                      </label>
                                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', cursor: 'pointer' }}>
                                        <input
                                          type="radio"
                                          name="recurring_duration"
                                          checked={!recurringUnlimited}
                                          onChange={() => setRecurringUnlimited(false)}
                                        />
                                        <span>{t('Có ngày kết thúc')}</span>
                                      </label>
                                    </div>
                                  </div>

                                  <div style={{ display: 'grid', gridTemplateColumns: recurringUnlimited ? '1fr' : '1fr 1fr', gap: '10px' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                        {t('Ngày bắt đầu kỳ')}
                                      </label>
                                      <VietnameseDateInput
                                        value={recurringStartDate}
                                        onChange={val => setRecurringStartDate(val)}
                                        inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                      />
                                    </div>
                                    {!recurringUnlimited && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                          {t('Ngày kết thúc chu kỳ')}
                                        </label>
                                        <VietnameseDateInput
                                          value={recurringEndDate}
                                          onChange={val => setRecurringEndDate(val)}
                                          inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                    {t('Căn cứ Hợp đồng / Thỏa thuận pháp lý (nếu có)')}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={recurringContractNumber}
                                    onChange={e => setRecurringContractNumber(e.target.value)}
                                    placeholder={t('Ví dụ: HĐ thuê văn phòng số 12/2026/HĐMB, Thỏa thuận dịch vụ IT...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* DEDICATED BLOCK 3: THANH TOÁN THEO ĐỢT (phased_payment or isPhasedPayment) */}
                            {(selectedWorkflowDef?.id === 'phased_payment' || isPhasedPayment) && (
                              <div style={{
                                background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.05), rgba(124, 58, 237, 0.02))',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: '14px',
                                padding: '1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7' }}>
                                    <GitBranch size={18} />
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                      {t('Kế hoạch thanh toán theo các đợt (Installments / Milestones)')}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => setInstallments([...installments, { id: Date.now(), title: `Đợt ${installments.length + 1}`, amount: 0, dueDate: '' }])}
                                    className="btn secondary"
                                    style={{ height: '28px', padding: '0 10px', fontSize: '0.72rem', color: '#0284c7', borderColor: '#0284c7' }}
                                  >
                                    + {t('Thêm đợt thanh toán')}
                                  </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                  {installments.map((inst, index) => (
                                    <div key={inst.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1.3fr 1.3fr auto', gap: '10px', alignItems: 'center' }}>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={inst.title}
                                        onChange={e => {
                                          const list = [...installments];
                                          list[index].title = e.target.value;
                                          setInstallments(list);
                                        }}
                                        placeholder={t('Tên đợt (VD: Đợt 1 - Tạm ứng 30%)')}
                                        style={{ height: '34px', fontSize: '0.78rem' }}
                                      />
                                      <div>
                                        <input
                                          type="text"
                                          className="form-input"
                                          value={formatNumberWithDots(inst.amount, currencyType)}
                                          onChange={e => {
                                            const rawVal = parseMoneyInput(e.target.value, currencyType);
                                            const list = [...installments];
                                            list[index].amount = rawVal.endsWith('.') ? (rawVal as any) : Number(rawVal);
                                            setInstallments(list);
                                          }}
                                          placeholder={t('Số tiền')}
                                          style={{ height: '34px', fontSize: '0.78rem', fontWeight: 700 }}
                                        />
                                        {Number(inst.amount) > 0 && (
                                          <div style={{ fontSize: '0.675rem', color: '#0284c7', fontWeight: 600, marginTop: '2px' }}>
                                            {numberToVietnameseText(Number(inst.amount), currencyType)}
                                          </div>
                                        )}
                                      </div>
                                      <VietnameseDateInput
                                        value={inst.dueDate}
                                        onChange={val => {
                                          const list = [...installments];
                                          list[index].dueDate = val;
                                          setInstallments(list);
                                        }}
                                        size="sm"
                                        inputStyle={{ height: '34px', fontSize: '0.78rem' }}
                                      />
                                      {installments.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => setInstallments(installments.filter(x => x.id !== inst.id))}
                                          style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.78rem', padding: '4px' }}
                                        >
                                          <Trash2 size={15} />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                <div style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  padding: '8px 12px',
                                  borderRadius: '8px',
                                  background: 'rgba(2, 132, 199, 0.1)',
                                  fontSize: '0.75rem'
                                }}>
                                  <span style={{ color: '#0284c7', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                    {t('Tổng cộng các đợt')}: {formatApprovalCurrency(installments.reduce((sum, i) => sum + (Number(i.amount) || 0), 0), currencyType)}
                                  </span>
                                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>
                                    {installments.length} {t('đợt giải ngân')}
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* DEDICATED BLOCK 4: ĐỀ NGHỊ TẠM ỨNG (advance_money) */}
                            {selectedWorkflowDef?.id === 'advance_money' && (
                              <div style={{
                                background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05), rgba(37, 99, 235, 0.02))',
                                border: '1px solid rgba(59, 130, 246, 0.25)',
                                borderRadius: '14px',
                                padding: '1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#2563eb' }}>
                                  <DollarSign size={18} />
                                  <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {t('Thông tin kế hoạch tạm ứng & thời hạn hoàn ứng')}
                                  </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Mục đích tạm ứng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <CustomSelect
                                      value={advanceType}
                                      onChange={val => setAdvanceType(val)}
                                      options={[
                                        { value: 'business_trip', label: t('Tạm ứng công tác phí (Vé máy bay, khách sạn, di chuyển)') },
                                        { value: 'procurement', label: t('Tạm ứng mua sắm vật tư / trang thiết bị khẩn cấp') },
                                        { value: 'event', label: t('Tạm ứng tổ chức sự kiện / hội thảo đào tạo') },
                                        { value: 'lecturer', label: t('Tạm ứng thù lao giảng viên / chuyên gia') },
                                        { value: 'salary', label: t('Ứng trước lương / Chi phí cá nhân theo chính sách') },
                                        { value: 'other', label: t('Tạm ứng nghiệp vụ khác') }
                                      ]}
                                      width="100%"
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Hạn hoàn ứng / quyết toán chứng từ')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <VietnameseDateInput
                                      value={advanceSettlementDate}
                                      onChange={val => setAdvanceSettlementDate(val)}
                                      inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>

                                <div style={{
                                  background: 'rgba(59, 130, 246, 0.08)',
                                  border: '1px solid rgba(59, 130, 246, 0.2)',
                                  padding: '10px 14px',
                                  borderRadius: '10px',
                                  fontSize: '0.75rem',
                                  color: '#1d4ed8',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}>
                                  <AlertCircle size={15} />
                                  <span>{t('Lưu ý: Nhân viên cam kết hoàn ứng chứng từ đầy đủ theo đúng thời hạn quy định của công ty.')}</span>
                                </div>
                              </div>
                            )}

                            {/* DEDICATED BLOCK 5: ĐỀ XUẤT CHI PHÍ / HOÀN ỨNG / THANH TOÁN */}
                            {(selectedWorkflowDef?.id === 'expense_claim' || selectedWorkflowDef?.id === 'payment' || formType === 'expense') && selectedWorkflowDef?.id !== 'commission_payout' && (
                              <div style={{
                                background: 'var(--color-card, #ffffff)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '14px',
                                padding: '1.25rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text)' }}>
                                  <Receipt size={18} style={{ color: 'var(--color-primary)' }} />
                                  <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    {t('Hồ sơ chi phí & Chứng từ hóa đơn')}
                                  </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  {/* Tạm thời ẩn phân loại chi phí theo yêu cầu */}
                                  {false && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                        {t('Phân loại chi phí')}
                                      </label>
                                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '2px' }}>
                                        {[
                                          { value: 'travel', label: 'Vận Chuyển', icon: Truck, color: '#3b82f6' },
                                          { value: 'client_meeting', label: 'Ăn uống', icon: Coffee, color: '#f59e0b' },
                                          { value: 'general', label: 'Vận hành', icon: Home, color: '#10b981' },
                                          { value: 'marketing', label: 'Marketing', icon: Briefcase, color: '#ef4444' },
                                          { value: 'stationery', label: 'Văn phòng phẩm', icon: CreditCard, color: '#BD1D2D' },
                                          { value: 'hr', label: 'Nhân sự', icon: Tag, color: '#06b6d4' }
                                        ].map(c => {
                                          const Icon = c.icon;
                                          const isSelected = expenseCategory === c.value || (c.value === 'general' && !expenseCategory);
                                          return (
                                            <button
                                              key={c.value}
                                              type="button"
                                              onClick={() => setExpenseCategory(c.value)}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                padding: '5px 12px',
                                                borderRadius: 'var(--radius-full)',
                                                border: `1.5px solid ${isSelected ? c.color : 'var(--color-border)'}`,
                                                background: isSelected ? `${c.color}18` : 'transparent',
                                                color: isSelected ? c.color : 'var(--color-text-light)',
                                                fontSize: '0.78rem',
                                                fontWeight: isSelected ? 750 : 600,
                                                cursor: 'pointer',
                                                transition: 'all 0.18s ease'
                                              }}
                                            >
                                              <Icon size={13} />
                                              <span>{t(c.label)}</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                        {t('Loại chứng từ hóa đơn')}
                                      </label>
                                      <CustomSelect
                                        value={invoiceType}
                                        onChange={val => {
                                          setInvoiceType(val as any);
                                          const vatNum = val === 'vat_10' ? 10 : val === 'vat_8' ? 8 : val === 'vat_5' ? 5 : val === 'vat_0' ? 0 : null;
                                          if (vatNum !== null) {
                                            setExpenseItems(prev => prev.map(it => ({ ...it, vat: vatNum })));
                                          }
                                        }}
                                        options={[
                                          { value: 'vat_10', label: t('Hóa đơn điện tử VAT 10%') },
                                          { value: 'vat_8', label: t('Hóa đơn điện tử VAT 8%') },
                                          { value: 'vat_5', label: t('Hóa đơn điện tử VAT 5%') },
                                          { value: 'vat_0', label: t('Hóa đơn điện tử VAT 0% / Không chịu thuế') },
                                          { value: 'retail', label: t('Hóa đơn bán lẻ / Biên lai thu tiền') },
                                          { value: 'none', label: t('Không có hóa đơn (Giải trình nội bộ)') }
                                        ]}
                                        width="100%"
                                      />
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                        {t('Thời hạn thanh toán')}
                                      </label>
                                      <VietnameseDateInput
                                        value={paymentDueDate}
                                        onChange={val => setPaymentDueDate(val)}
                                        placeholder={t('Chọn thời hạn thanh toán')}
                                        inputStyle={{ height: '36px', fontSize: '0.8rem' }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* PAYMENT METHOD & TARGET ROW (Ẩn khi là quy trình chi hoa hồng vì đã quản lý danh sách chi tiết bên dưới) */}
                            {selectedWorkflowDef?.id !== 'commission_payout' && (
                              <>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr 0.8fr', gap: '1rem' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                  {t('Đối tượng thụ hưởng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                </label>
                                <CustomSelect
                                  value={paymentTarget}
                                  onChange={val => {
                                    setPaymentTarget(val);
                                    if (val === 'Nội bộ') {
                                      const currentEmp = users.find(u => Number(u.id) === Number(user?.id)) || user;
                                      if (currentEmp) {
                                        setPaymentEmployeeId(String(currentEmp.id));
                                        setPaymentBeneficiaryName(currentEmp.full_name || currentEmp.name || '');
                                        if (currentEmp.bank_name) setPaymentBankName(currentEmp.bank_name);
                                        if (currentEmp.bank_account) setPaymentBankAccount(currentEmp.bank_account);
                                        const accName = currentEmp.full_name || currentEmp.name || '';
                                        if (accName) setPaymentAccountName(accName.toUpperCase());
                                        if (currentEmp.phone) setPaymentPhone(currentEmp.phone);
                                      }
                                    } else {
                                      setPaymentEmployeeId('');
                                      setPaymentSupplierId('');
                                      setPaymentLecturerId('');
                                      setPaymentContactId('');
                                      setPaymentBeneficiaryName('');
                                      setPaymentBankName('');
                                      setPaymentBankAccount('');
                                      setPaymentAccountName('');
                                      setPaymentPhone('');
                                      setPaymentTaxCode('');
                                    }
                                  }}
                                  options={[
                                    { value: 'Nội bộ', label: t('Nội bộ (Cán bộ nhân viên)') },
                                    { value: 'Giảng viên', label: t('Giảng viên / Chuyên gia') },
                                    { value: 'Đối tác', label: t('Đối tác / Vendor / Nhà cung cấp') },
                                    { value: 'Khách hàng', label: t('Khách hàng / Học viên CRM') },
                                    { value: 'Cộng tác viên', label: t('Cộng tác viên (CTV Tuyển sinh / Marketing)') },
                                    { value: 'Cơ quan Nhà nước', label: t('Cơ quan Nhà nước / Thuế / BHXH / Kho bạc') },
                                    { value: 'Cá nhân khác', label: t('Cá nhân khác / Khách vãng lai') }
                                  ]}
                                  width="100%"
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Hình thức nhận tiền')}</label>
                                <CustomSelect
                                  value={paymentMethod}
                                  onChange={val => setPaymentMethod(val)}
                                  options={[
                                    { value: 'Chuyển khoản', label: t('Chuyển khoản (Ngân hàng)') },
                                    { value: 'Tiền mặt', label: t('Tiền mặt (Thủ quỹ bàn giao)') },
                                    { value: 'Ví điện tử', label: t('Ví điện tử (MoMo / ZaloPay / Viettel Money)') },
                                    { value: 'Thẻ tín dụng', label: t('Thẻ tín dụng doanh nghiệp (Corporate Card)') }
                                  ]}
                                  width="100%"
                                />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Loại tiền tệ')}</label>
                                <CustomSelect
                                  value={currencyType}
                                  onChange={val => setCurrencyType(val)}
                                  options={[
                                    { value: 'VND', label: 'VND (₫)' },
                                    { value: 'USD', label: 'USD ($)' },
                                    { value: 'EURO', label: 'EUR (€)' },
                                    { value: 'GBP', label: 'GBP (£)' },
                                    { value: 'JPY', label: 'JPY (¥)' },
                                    { value: 'SGD', label: 'SGD (S$)' },
                                    { value: 'AUD', label: 'AUD (A$)' },
                                    { value: 'CAD', label: 'CAD (C$)' },
                                    { value: 'CHF', label: 'CHF (Fr)' }
                                  ]}
                                  width="100%"
                                />
                              </div>
                            </div>

                            {/* BENEFICIARY DYNAMIC SELECTORS */}
                            {selectedWorkflowDef?.id === 'commission_payout' ? (
                              <div style={{
                                background: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '10px',
                                padding: '10px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px'
                              }}>
                                <Award size={18} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                                  <strong style={{ color: 'var(--color-text)' }}>{t('Chi trả hoa hồng nhiều nhân sự & đối tác:')}</strong> {t('Danh sách người nhận tiền, thông tin STK ngân hàng và số tiền được quản lý chi tiết tại Bảng phân bổ hoa hồng bên dưới.')}
                                </div>
                              </div>
                            ) : paymentTarget === 'Nội bộ' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Nhân viên thụ hưởng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                    {t('(Tự động trích xuất STK ngân hàng từ hồ sơ nhân sự)')}
                                  </span>
                                </div>
                                <CustomSelect
                                  options={users.map((u: any) => ({
                                    value: String(u.id),
                                    label: u.full_name || u.name || u.username || `Nhân viên #${u.id}`,
                                    avatar: u.avatar_url || u.avatar,
                                    sublabel: [
                                      u.role || '',
                                      u.bank_name ? `${u.bank_name}: ${u.bank_account}` : t('Chưa có STK')
                                    ].filter(Boolean).join(' • ')
                                  }))}
                                  value={paymentEmployeeId}
                                  onChange={val => {
                                    const empId = String(val);
                                    setPaymentEmployeeId(empId);
                                    const emp = users.find((u: any) => String(u.id) === empId);
                                    if (emp) {
                                      const empName = emp.full_name || emp.name || emp.username || '';
                                      setPaymentBeneficiaryName(empName);
                                      if (emp.bank_name) setPaymentBankName(emp.bank_name);
                                      if (emp.bank_account) setPaymentBankAccount(emp.bank_account);
                                      if (empName) setPaymentAccountName(empName.toUpperCase());
                                      if (emp.phone) setPaymentPhone(emp.phone);
                                      if (emp.bank_account) {
                                        toast.success(t(`Đã trích xuất STK ngân hàng của ${empName}`));
                                      } else {
                                        toast(t(`Nhân viên ${empName} chưa lưu STK trong hồ sơ. Vui lòng nhập STK bên dưới.`), { icon: <Info size={16} color="#0284c7" /> });
                                      }
                                    }
                                  }}
                                  placeholder={t('-- Chọn nhân viên nhận thanh toán --')}
                                  searchable
                                  showAvatars
                                  width="100%"
                                />
                                {paymentEmployeeId && (() => {
                                  const emp = users.find((u: any) => String(u.id) === paymentEmployeeId);
                                  if (!emp) return null;
                                  return (
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 12px',
                                      borderRadius: '10px',
                                      background: emp.bank_account ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                      border: `1px solid ${emp.bank_account ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                                      fontSize: '0.78rem'
                                    }}>
                                      <span style={{ color: emp.bank_account ? '#059669' : '#d97706', fontWeight: 650 }}>
                                        {emp.bank_account 
                                          ? `✓ ${t('Số tài khoản đồng bộ')} ${getSystemTitle()}: ${emp.bank_name || 'Ngân hàng'} - ${emp.bank_account} (Chủ TK: ${(emp.full_name || emp.name || '').toUpperCase()})` 
                                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} strokeWidth={1.75} style={{ flexShrink: 0 }} /> {t('Nhân viên chưa cập nhật STK trong hồ sơ cá nhân. Vui lòng nhập STK bên dưới.')}</span>}
                                      </span>
                                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                                        {emp.role || t('Nhân viên')}
                                      </span>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {paymentTarget === 'Giảng viên' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {t('Chọn giảng viên / chuyên gia trong hệ thống')}
                                    </label>
                                    <CustomSelect
                                      options={[
                                        { value: '', label: t('-- Chọn giảng viên đã có (hoặc nhập mới bên cạnh) --') },
                                        ...lecturerOptions
                                      ]}
                                      value={paymentLecturerId}
                                      onChange={val => {
                                        const lecId = String(val);
                                        setPaymentLecturerId(lecId);
                                        const lec = lecturerOptions.find(l => l.value === lecId);
                                        if (lec) {
                                          setPaymentBeneficiaryName(lec.label);
                                          if (lec.bank_name) setPaymentBankName(lec.bank_name);
                                          if (lec.bank_account) setPaymentBankAccount(lec.bank_account);
                                          if (lec.bank_account_name || lec.label) setPaymentAccountName((lec.bank_account_name || lec.label).toUpperCase());
                                          if (lec.phone) setPaymentPhone(lec.phone);
                                          if (lec.bank_account) {
                                            toast.success(t(`Đã trích xuất STK của giảng viên: ${lec.label}`));
                                          } else {
                                            toast(t(`Giảng viên ${lec.label} chưa lưu STK. Vui lòng nhập thông tin bên dưới.`), { icon: <Info size={16} color="#0284c7" /> });
                                          }
                                        }
                                      }}
                                      placeholder={t('-- Tìm kiếm giảng viên / chuyên gia --')}
                                      searchable
                                      width="100%"
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {t('Họ và tên giảng viên')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentBeneficiaryName}
                                      onChange={e => {
                                        setPaymentBeneficiaryName(e.target.value);
                                        if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                                      }}
                                      placeholder={t('Họ và tên giảng viên nhận thù lao...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>
                                {paymentBeneficiaryName && (
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    background: paymentBankAccount ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                    border: `1px solid ${paymentBankAccount ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                                    fontSize: '0.78rem'
                                  }}>
                                    <span style={{ color: paymentBankAccount ? '#059669' : '#d97706', fontWeight: 650 }}>
                                      {paymentBankAccount 
                                        ? `✓ STK Giảng viên: ${paymentBankName || 'Ngân hàng'} - ${paymentBankAccount} (Chủ TK: ${paymentAccountName})` 
                                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Info size={12} strokeWidth={1.75} style={{ flexShrink: 0 }} /> {t('Giảng viên chưa có STK trong hệ thống. Vui lòng nhập số tài khoản ở bên dưới.')}</span>}
                                    </span>
                                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                                      {t('Giảng viên / Chuyên gia')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {paymentTarget === 'Đối tác' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {t('Chọn đối tác / nhà cung cấp đã lưu')}
                                    </label>
                                    <CustomSelect
                                      options={[
                                        { value: '', label: t('-- Chọn đối tác trong danh bạ (hoặc nhập tay) --') },
                                        ...partnerOptions
                                      ]}
                                      value={paymentSupplierId}
                                      onChange={val => {
                                        const sId = String(val);
                                        setPaymentSupplierId(sId);
                                        const sup = partnerOptions.find(s => s.value === sId);
                                        if (sup) {
                                          setPaymentBeneficiaryName(sup.label);
                                          if (sup.bank_name) setPaymentBankName(sup.bank_name);
                                          if (sup.bank_account) setPaymentBankAccount(sup.bank_account);
                                          if (sup.bank_account_name || sup.label) setPaymentAccountName((sup.bank_account_name || sup.label).toUpperCase());
                                          if (sup.tax_code) setPaymentTaxCode(sup.tax_code);
                                          if (sup.phone) setPaymentPhone(sup.phone);
                                          if (sup.bank_account) {
                                            toast.success(t(`Đã trích xuất STK của đối tác: ${sup.label}`));
                                          } else {
                                            toast(t(`Đối tác ${sup.label} chưa lưu STK. Vui lòng điền thông tin bên dưới.`), { icon: <Info size={16} color="#0284c7" /> });
                                          }
                                        }
                                      }}
                                      placeholder={t('-- Tìm đối tác / nhà cung cấp --')}
                                      searchable
                                      width="100%"
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {t('Tên đơn vị thụ hưởng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentBeneficiaryName}
                                      onChange={e => {
                                        setPaymentBeneficiaryName(e.target.value);
                                        if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                                      }}
                                      placeholder={t('Tên công ty / nhà cung cấp nhận tiền...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {t('Mã số thuế (MST)')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentTaxCode}
                                      onChange={e => setPaymentTaxCode(e.target.value)}
                                      placeholder={t('Mã số thuế doanh nghiệp...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>
                                {paymentBeneficiaryName && (
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    borderRadius: '10px',
                                    background: paymentBankAccount ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                    border: `1px solid ${paymentBankAccount ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                                    fontSize: '0.78rem'
                                  }}>
                                    <span style={{ color: paymentBankAccount ? '#059669' : '#d97706', fontWeight: 650 }}>
                                      {paymentBankAccount 
                                        ? `✓ STK Đối tác: ${paymentBankName || 'Ngân hàng'} - ${paymentBankAccount} (Chủ TK: ${paymentAccountName})` 
                                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Info size={12} strokeWidth={1.75} style={{ flexShrink: 0 }} /> {t('Đối tác chưa lưu STK trong danh bạ. Vui lòng nhập số tài khoản ở ô bên dưới.')}</span>}
                                    </span>
                                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', fontWeight: 600 }}>
                                      {paymentTaxCode ? `MST: ${paymentTaxCode}` : t('Đối tác / Vendor')}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {paymentTarget === 'Khách hàng' && (
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr 1fr', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Chọn khách hàng / học viên (CRM)')}
                                  </label>
                                  <CustomSelect
                                    options={[
                                      { value: '', label: t('-- Chọn khách hàng trong CRM (hoặc nhập bên cạnh) --') },
                                      ...contactOptions
                                    ]}
                                    value={paymentContactId}
                                    onChange={val => {
                                      const cId = String(val);
                                      setPaymentContactId(cId);
                                      const con = contactOptions.find(c => c.value === cId);
                                      if (con) {
                                        setPaymentBeneficiaryName(con.label);
                                        if (con.bank_name) setPaymentBankName(con.bank_name);
                                        if (con.bank_account) setPaymentBankAccount(con.bank_account);
                                        if (con.bank_account_name || con.label) setPaymentAccountName((con.bank_account_name || con.label).toUpperCase());
                                        if (con.phone) setPaymentPhone(con.phone);
                                        if (con.bank_account) {
                                          toast.success(t(`Đã trích xuất STK khách hàng: ${con.label}`));
                                        }
                                      }
                                    }}
                                    placeholder={t('-- Tìm khách hàng / học viên --')}
                                    searchable
                                    width="100%"
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Tên khách hàng thụ hưởng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={paymentBeneficiaryName}
                                    onChange={e => {
                                      setPaymentBeneficiaryName(e.target.value);
                                      if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                                    }}
                                    placeholder={t('Họ và tên khách hàng hoặc mã hồ sơ...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Số điện thoại liên hệ')}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={paymentPhone}
                                    onChange={e => setPaymentPhone(e.target.value)}
                                    placeholder={t('Ví dụ: 0912345678...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                  />
                                </div>
                              </div>
                            )}

                            {paymentTarget === 'Cộng tác viên' && (
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Họ và tên Cộng tác viên')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={paymentBeneficiaryName}
                                    onChange={e => {
                                      setPaymentBeneficiaryName(e.target.value);
                                      if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                                    }}
                                    placeholder={t('Họ và tên CTV tuyển sinh / Marketing...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                    required
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Số điện thoại / CCCD của CTV')}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={paymentPhone}
                                    onChange={e => setPaymentPhone(e.target.value)}
                                    placeholder={t('Số điện thoại hoặc số CCCD...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                  />
                                </div>
                              </div>
                            )}

                            {paymentTarget === 'Cơ quan Nhà nước' && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.4fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {t('Loại cơ quan / Ngân sách')}
                                    </label>
                                    <CustomSelect
                                      value={paymentGovAgencyType}
                                      onChange={val => setPaymentGovAgencyType(val as any)}
                                      options={[
                                        { value: 'tax', label: t('Cơ quan Thuế (GTGT, TNDN, Môn bài)') },
                                        { value: 'social_insurance', label: t('Cơ quan Bảo hiểm Xã hội (BHXH)') },
                                        { value: 'treasury', label: t('Kho bạc Nhà nước (Ngân sách / Lệ phí)') },
                                        { value: 'other', label: t('Sở Ban ngành / Cơ quan hành chính') }
                                      ]}
                                      width="100%"
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {t('Tên cơ quan thụ hưởng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentBeneficiaryName}
                                      onChange={e => {
                                        setPaymentBeneficiaryName(e.target.value);
                                        if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                                      }}
                                      placeholder={t('VD: Chi cục Thuế Quận 1, Kho bạc Nhà nước...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                      {t('Số QĐ / Mã chương tiểu mục')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentGovDecisionNumber}
                                      onChange={e => setPaymentGovDecisionNumber(e.target.value)}
                                      placeholder={t('Số thông báo nộp thuế...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {paymentTarget === 'Cá nhân khác' && (
                              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.5fr 1fr', gap: '1rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Họ và tên người nhận')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={paymentBeneficiaryName}
                                    onChange={e => {
                                      setPaymentBeneficiaryName(e.target.value);
                                      if (!paymentAccountName) setPaymentAccountName(e.target.value.toUpperCase());
                                    }}
                                    placeholder={t('Họ và tên người nhận thanh toán vãng lai...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                                    {t('Số điện thoại / CCCD')}
                                  </label>
                                  <input
                                    type="text"
                                    className="form-input"
                                    value={paymentPhone}
                                    onChange={e => setPaymentPhone(e.target.value)}
                                    placeholder={t('Số điện thoại hoặc CCCD/CMND...')}
                                    style={{ height: '36px', fontSize: '0.8rem' }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* BANK TRANSFER DETAILS */}
                            {paymentMethod === 'Chuyển khoản' && (
                              <div style={{
                                background: 'var(--color-bg-secondary, #f8fafc)',
                                padding: '1.25rem',
                                borderRadius: '14px',
                                border: '1px solid var(--color-border-light)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '12px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <CreditCard size={17} style={{ color: 'var(--color-primary)' }} />
                                    <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text)', letterSpacing: '0.03em' }}>
                                      {t('Thông tin tài khoản ngân hàng nhận chuyển khoản')}
                                    </span>
                                  </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1.2fr 1.4fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Tên ngân hàng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <BankSelect
                                      value={paymentBankName}
                                      onChange={val => setPaymentBankName(val)}
                                      placeholder={t('Chọn ngân hàng...')}
                                      size="sm"
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Số tài khoản (STK)')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentBankAccount}
                                      onChange={e => setPaymentBankAccount(e.target.value.replace(/\s+/g, ''))}
                                      placeholder={t('Số tài khoản')}
                                      style={{ height: '36px', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.5px' }}
                                      required
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Tên chủ tài khoản')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentAccountName}
                                      onChange={e => setPaymentAccountName(e.target.value.toUpperCase())}
                                      placeholder={t('TÊN CHỦ TÀI KHOẢN (IN HOA)...')}
                                      style={{ height: '36px', fontSize: '0.8rem', fontWeight: 700 }}
                                      required
                                    />
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Chi nhánh')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentBankBranch}
                                      onChange={e => setPaymentBankBranch(e.target.value)}
                                      placeholder={t('VD: CN Hội sở, Ba Đình...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>

                                {paymentBankAccount && paymentBankName && (() => {
                                  const vndQrAmount = itemsGrandTotal > 0 ? Math.round(toVndAmount(itemsGrandTotal, currencyType)) : undefined;
                                  const vietQrUrl = getVietQrUrl({
                                    bankBinOrCode: paymentBankName,
                                    accountNumber: paymentBankAccount,
                                    accountName: paymentAccountName,
                                    amount: vndQrAmount,
                                    memo: normalizeVietQrText(expenseTitle || selectedWorkflowDef?.name || vietqrConfig?.memo_prefix || 'Thanh toan', Number(vietqrConfig?.memo_max_len || 50)),
                                    memoMaxLen: Number(vietqrConfig?.memo_max_len || 50),
                                    template: (vietqrConfig?.template as any) || 'compact2'
                                  });

                                  return (
                                    <div style={{
                                      display: 'grid',
                                      gridTemplateColumns: isMobile ? '1fr' : (vietQrUrl || isForeignOrCustomBank(paymentBankName) ? 'minmax(0, 1fr) 155px' : '1fr'),
                                      gap: '12px',
                                      marginTop: '6px',
                                      alignItems: 'stretch'
                                    }}>
                                      {/* Executive Brand Light Bank Card */}
                                      <div style={{
                                        background: '#ffffff',
                                        border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                                        borderRadius: '14px',
                                        padding: '12px 14px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        gap: '10px',
                                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                                        position: 'relative',
                                        overflow: 'hidden'
                                      }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                                            <div style={{
                                              width: '26px',
                                              height: '26px',
                                              borderRadius: '6px',
                                              background: 'var(--color-bg-subtle, #f8fafc)',
                                              border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              flexShrink: 0
                                            }}>
                                              {findBank(paymentBankName)?.logo ? (
                                                <img
                                                  src={findBank(paymentBankName)!.logo}
                                                  alt=""
                                                  style={{ width: '18px', height: '18px', objectFit: 'contain' }}
                                                />
                                              ) : (
                                                <Landmark size={14} style={{ color: '#dc2626' }} />
                                              )}
                                            </div>
                                            <span style={{ fontWeight: 750, fontSize: '0.8rem', letterSpacing: '0.01em', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={paymentBankName}>
                                              {paymentBankName}
                                            </span>
                                          </div>
                                          <span style={{
                                            fontSize: '0.6rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.04em',
                                            padding: '2px 6px',
                                            borderRadius: '5px',
                                            background: '#ffffff',
                                            color: '#dc2626',
                                            border: '1px solid #fecaca',
                                            flexShrink: 0
                                          }}>
                                            Napas 247
                                          </span>
                                        </div>

                                        <div style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          background: '#ffffff',
                                          padding: '7px 10px',
                                          borderRadius: '8px',
                                          border: '1px solid #fecaca',
                                          boxShadow: '0 1px 3px rgba(220, 38, 38, 0.03)'
                                        }}>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                            <span style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                                              Số tài khoản (STK)
                                            </span>
                                            <span style={{
                                              fontSize: '1.05rem',
                                              fontWeight: 800,
                                              fontFamily: 'monospace',
                                              letterSpacing: '0.06em',
                                              color: '#dc2626'
                                            }}>
                                              {paymentBankAccount}
                                            </span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              navigator.clipboard.writeText(paymentBankAccount);
                                              toast.success(t('Đã sao chép số tài khoản!'));
                                            }}
                                            style={{
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              padding: '5px 9px',
                                              borderRadius: '6px',
                                              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                              color: '#ffffff',
                                              border: 'none',
                                              cursor: 'pointer',
                                              fontWeight: 700,
                                              fontSize: '0.7rem',
                                              boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                                              flexShrink: 0
                                            }}
                                          >
                                            <Copy size={12} />
                                            <span>Sao chép</span>
                                          </button>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '4px' }}>
                                          <div style={{ minWidth: 0, flex: 1 }}>
                                            <span style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                                              Chủ tài khoản
                                            </span>
                                            <div style={{ fontSize: '0.78rem', fontWeight: 750, letterSpacing: '0.01em', color: '#0f172a', marginTop: '1px', textTransform: 'uppercase', lineHeight: 1.25 }}>
                                              {paymentAccountName || 'CHƯA ĐIỀN'}
                                            </div>
                                          </div>
                                          {paymentBankBranch && (
                                            <div style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'right', flexShrink: 0 }}>
                                              CN: <span style={{ color: '#1e293b', fontWeight: 600 }}>{paymentBankBranch}</span>
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* VietQR Card: Click to zoom in */}
                                      <div
                                        onClick={() => vietQrUrl && setPreviewQrModalUrl(vietQrUrl)}
                                        title={vietQrUrl ? t('Bấm để phóng to mã QR') : undefined}
                                        style={{
                                          background: '#ffffff',
                                          border: '1px solid #fecaca',
                                          borderRadius: '14px',
                                          padding: '8px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          boxShadow: '0 4px 16px rgba(220, 38, 38, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)',
                                          cursor: vietQrUrl ? 'pointer' : 'default',
                                          transition: 'all 0.2s ease'
                                        }}
                                        onMouseEnter={(e) => {
                                          if (vietQrUrl) {
                                            e.currentTarget.style.transform = 'translateY(-1px)';
                                            e.currentTarget.style.boxShadow = '0 6px 20px rgba(220, 38, 38, 0.12)';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (vietQrUrl) {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(220, 38, 38, 0.04)';
                                          }
                                        }}
                                      >
                                        {vietQrUrl ? (
                                          <img
                                            src={vietQrUrl}
                                            alt="Mã VietQR"
                                            style={{
                                              width: '100%',
                                              maxWidth: '140px',
                                              maxHeight: '140px',
                                              objectFit: 'contain'
                                            }}
                                          />
                                        ) : isForeignOrCustomBank(paymentBankName) ? (
                                          <div style={{ textAlign: 'center', padding: '6px' }}>
                                            <Globe size={24} color="#dc2626" style={{ margin: '0 auto 6px' }} />
                                            <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#dc2626', lineHeight: 1.3 }}>
                                              {t('Chuyển khoản quốc tế')}
                                            </div>
                                            <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '2px', lineHeight: 1.2 }}>
                                              {t('Không hỗ trợ VietQR')}
                                            </div>
                                          </div>
                                        ) : (
                                          <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Chưa có mã QR</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {/* CASH DETAILS */}
                            {paymentMethod === 'Tiền mặt' && (
                              <div style={{
                                background: 'var(--color-bg-secondary, #f8fafc)',
                                padding: '1rem 1.25rem',
                                borderRadius: '14px',
                                border: '1px solid var(--color-border-light)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#16a34a', fontWeight: 750, fontSize: '0.8rem' }}>
                                  <DollarSign size={16} />
                                  <span>{t('Hình thức nhận: Tiền mặt (Bàn giao trực tiếp tại quầy / thủ quỹ)')}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Người nhận tiền mặt')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentBeneficiaryName}
                                      onChange={e => setPaymentBeneficiaryName(e.target.value)}
                                      placeholder={t('Họ và tên người nhận tiền...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Địa điểm / Quầy bàn giao tiền')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentDestination}
                                      onChange={e => setPaymentDestination(e.target.value)}
                                      placeholder={t('Ví dụ: Quầy Thủ quỹ Hội sở / Phòng Kế toán / Chi nhánh...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* WALLET DETAILS */}
                            {paymentMethod === 'Ví điện tử' && (
                              <div style={{
                                background: 'var(--color-bg-secondary, #f8fafc)',
                                padding: '1rem 1.25rem',
                                borderRadius: '14px',
                                border: '1px solid var(--color-border-light)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#BD1D2D', fontWeight: 700, fontSize: '0.8rem' }}>
                                  <Wallet size={16} />
                                  <span>{t('Hình thức nhận: Ví điện tử di động')}</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.2fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Loại ví điện tử')}
                                    </label>
                                    <CustomSelect
                                      value={paymentWalletType}
                                      onChange={val => setPaymentWalletType(val as any)}
                                      options={[
                                        { value: 'momo', label: 'MoMo' },
                                        { value: 'zalopay', label: 'ZaloPay' },
                                        { value: 'viettel_money', label: 'Viettel Money' }
                                      ]}
                                      width="100%"
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Số điện thoại liên kết ví')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentWalletPhone || paymentPhone}
                                      onChange={e => setPaymentWalletPhone(e.target.value)}
                                      placeholder={t('Nhập SĐT đăng ký ví...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Tên chủ ví')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentBeneficiaryName}
                                      onChange={e => setPaymentBeneficiaryName(e.target.value)}
                                      placeholder={t('Họ và tên chủ ví...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* CORPORATE CARD DETAILS */}
                            {paymentMethod === 'Thẻ tín dụng' && (
                              <div style={{
                                background: 'var(--color-bg-secondary, #f8fafc)',
                                padding: '1rem 1.25rem',
                                borderRadius: '14px',
                                border: '1px solid var(--color-border-light)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1d4ed8', fontWeight: 750, fontSize: '0.8rem' }}>
                                  <CreditCard size={16} />
                                  <span>{t('Hình thức nhận: Thẻ tín dụng doanh nghiệp (Corporate Card)')}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('4 số cuối thẻ tín dụng')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentCorporateCard}
                                      onChange={e => setPaymentCorporateCard(e.target.value)}
                                      placeholder={t('Ví dụ: 8899')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                      {t('Cán bộ phụ trách giữ thẻ / Quẹt thẻ')}
                                    </label>
                                    <input
                                      type="text"
                                      className="form-input"
                                      value={paymentBeneficiaryName}
                                      onChange={e => setPaymentBeneficiaryName(e.target.value)}
                                      placeholder={t('Họ và tên người quẹt thẻ...')}
                                      style={{ height: '36px', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                </div>
                              </div>
                            )}
                            </>
                          )}

                          </div>
                        )}
                      </div>

                      {/* Card: Bảng chi tiết thanh toán & Mục đích thanh toán (only for expense/payment) */}
                      {formType === 'expense' && (selectedWorkflowDef?.id === 'commission_payout' ? (
                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 2px 12px rgba(0, 0, 0, 0.03)', overflow: 'visible' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Award size={18} color="#dc2626" />
                              <div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                  {t('BẢNG PHÂN BỔ HOA HỒNG (NHÂN SỰ & ĐỐI TÁC)')}
                                </span>
                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                                  {t('Không giới hạn số lượng. Hỗ trợ nhân viên nội bộ và đối tác, người giới thiệu. STK được tự động trích xuất và đối soát mã PO chi tiết.')}
                                </div>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setCommissionItems(prev => [
                                  {
                                    id: Date.now() + Math.random(),
                                    recipient_type: 'employee',
                                    user_id: '',
                                    user_name: '',
                                    avatar: '',
                                    role: '',
                                    company_id: '',
                                    supplier_id: '',
                                    contact_id: '',
                                    other_id: '',
                                    other_type: '',
                                    po_number: '',
                                    po_id: '',
                                    bank_name: '',
                                    bank_account: '',
                                    bank_owner: '',
                                    amount: 0,
                                    note: ''
                                  },
                                  ...prev
                                ]);
                              }}
                              className="btn"
                              style={{
                                height: '32px',
                                padding: '0 14px',
                                fontSize: '0.75rem',
                                background: '#dc2626',
                                color: '#ffffff',
                                fontWeight: 700,
                                borderRadius: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)'
                              }}
                              title={t('Thêm người nhận hoa hồng vào đầu danh sách')}
                            >
                              <Plus size={15} /> {t('Thêm người nhận hoa hồng')}
                            </button>
                          </div>

                          {/* DANH SÁCH NGƯỜI NHẬN HOA HỒNG (CARD 2 HÀNG RỘNG RÃI, OVERFLOW VISIBLE) */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', overflow: 'visible' }}>
                            {commissionItems.map((cItem, idx) => {
                              const isOther = cItem.recipient_type === 'other';

                              return (
                                <div
                                  key={cItem.id}
                                  style={{
                                    border: '1px solid var(--color-border)',
                                    borderRadius: '12px',
                                    background: 'var(--color-surface)',
                                    padding: '14px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '12px',
                                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.03)',
                                    position: 'relative',
                                    overflow: 'visible'
                                  }}
                                >
                                  {/* HÀNG 1: THÔNG TIN THỤ HƯỞNG & PO & SỐ TIỀN HOA HỒNG & NÚT XÓA */}
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMobile
                                      ? '1fr'
                                      : (isOther ? '1.3fr 1.15fr 1fr auto' : '1.5fr 1fr auto'),
                                    gap: '14px',
                                    alignItems: 'flex-start',
                                    overflow: 'visible'
                                  }}>
                                    {/* Cột 1: Người thụ hưởng + 2 Tabs Switcher */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'visible' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            minWidth: '22px',
                                            height: '22px',
                                            padding: '0 6px',
                                            borderRadius: '6px',
                                            background: 'var(--color-bg-secondary)',
                                            color: 'var(--color-text)',
                                            fontSize: '0.72rem',
                                            fontWeight: 700,
                                            border: '1px solid var(--color-border-light)'
                                          }}>
                                            #{idx + 1}
                                          </span>
                                          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                            {t('Người thụ hưởng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                          </label>
                                        </div>

                                        {/* 2 Tabs: [👤 Nhân viên] | [🏢 Khác: Đối tác, Giới thiệu] */}
                                        <div style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          background: 'var(--color-bg-secondary, #f1f5f9)',
                                          padding: '2px',
                                          borderRadius: '8px',
                                          border: '1px solid var(--color-border-light)'
                                        }}>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCommissionItems(prev => {
                                                const copy = [...prev];
                                                copy[idx] = {
                                                  ...copy[idx],
                                                  recipient_type: 'employee',
                                                  other_id: '',
                                                  other_type: ''
                                                };
                                                return copy;
                                              });
                                            }}
                                            style={{
                                              border: 'none',
                                              cursor: 'pointer',
                                              padding: '3px 8px',
                                              borderRadius: '6px',
                                              fontSize: '0.7rem',
                                              fontWeight: (!cItem.recipient_type || cItem.recipient_type === 'employee') ? 700 : 500,
                                              background: (!cItem.recipient_type || cItem.recipient_type === 'employee') ? 'var(--color-surface, #ffffff)' : 'transparent',
                                              color: (!cItem.recipient_type || cItem.recipient_type === 'employee') ? 'var(--color-text)' : 'var(--color-text-muted)',
                                              boxShadow: (!cItem.recipient_type || cItem.recipient_type === 'employee') ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              transition: 'all 0.15s ease'
                                            }}
                                          >
                                            <User size={12} />
                                            <span>{t('Nhân viên')}</span>
                                          </button>

                                          <button
                                            type="button"
                                            onClick={() => {
                                              setCommissionItems(prev => {
                                                const copy = [...prev];
                                                copy[idx] = {
                                                  ...copy[idx],
                                                  recipient_type: 'other',
                                                  user_id: ''
                                                };
                                                return copy;
                                              });
                                            }}
                                            style={{
                                              border: 'none',
                                              cursor: 'pointer',
                                              padding: '3px 8px',
                                              borderRadius: '6px',
                                              fontSize: '0.7rem',
                                              fontWeight: cItem.recipient_type === 'other' ? 700 : 500,
                                              background: cItem.recipient_type === 'other' ? 'var(--color-surface, #ffffff)' : 'transparent',
                                              color: cItem.recipient_type === 'other' ? 'var(--color-text)' : 'var(--color-text-muted)',
                                              boxShadow: cItem.recipient_type === 'other' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: '4px',
                                              transition: 'all 0.15s ease'
                                            }}
                                          >
                                            <Building2 size={12} />
                                            <span>{t('Khác (Đối tác / Giới thiệu)')}</span>
                                          </button>
                                        </div>
                                      </div>

                                      {/* TAB 1: NHÂN VIÊN */}
                                      {(!cItem.recipient_type || cItem.recipient_type === 'employee') ? (
                                        <>
                                          <CustomSelect
                                            options={users.map((u: any) => ({
                                              value: String(u.id),
                                              label: u.full_name || u.name || u.username || `Nhân viên #${u.id}`,
                                              avatar: u.avatar_url || u.avatar,
                                              sublabel: [
                                                u.role || '',
                                                u.bank_name ? `${u.bank_name}: ${u.bank_account}` : t('Chưa có STK')
                                              ].filter(Boolean).join(' • ')
                                            }))}
                                            value={cItem.user_id ? String(cItem.user_id) : ''}
                                            onChange={val => {
                                              const empId = String(val);
                                              const emp = users.find((u: any) => String(u.id) === empId);
                                              setCommissionItems(prev => {
                                                const copy = [...prev];
                                                if (emp) {
                                                  const empName = emp.full_name || emp.name || emp.username || '';
                                                  copy[idx] = {
                                                    ...copy[idx],
                                                    recipient_type: 'employee',
                                                    user_id: empId,
                                                    user_name: empName,
                                                    avatar: emp.avatar_url || emp.avatar || '',
                                                    role: emp.role || '',
                                                    bank_name: emp.bank_name || copy[idx].bank_name || '',
                                                    bank_account: emp.bank_account || copy[idx].bank_account || '',
                                                    bank_owner: (empName || '').toUpperCase()
                                                  };
                                                } else {
                                                  copy[idx] = {
                                                    ...copy[idx],
                                                    user_id: '',
                                                    user_name: '',
                                                    avatar: '',
                                                    role: ''
                                                  };
                                                }
                                                return copy;
                                              });
                                            }}
                                            placeholder={t('-- Tìm & chọn nhân viên nhận hoa hồng --')}
                                            searchable
                                            showAvatars
                                            width="100%"
                                          />
                                          {cItem.user_id && !cItem.bank_account && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 500 }}>
                                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} strokeWidth={1.75} style={{ flexShrink: 0, color: '#d97706' }} /> {t('Nhân viên này chưa cập nhật STK trong hồ sơ. Vui lòng nhập STK ở Hàng 2 bên dưới.')}</span>
                                            </div>
                                          )}
                                          {cItem.user_id && cItem.bank_account && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 500 }}>
                                              ✓ {t('Đã tự động liên kết STK ngân hàng từ hồ sơ nhân sự.')}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        /* TAB 2: KHÁC (ĐỐI TÁC / GIỚI THIỆU / NHÀ CUNG CẤP / CTV) */
                                        <>
                                          <CustomSelect
                                            options={commissionRecipientOtherOptions}
                                            value={cItem.other_id || ''}
                                            onChange={val => {
                                              const selectedKey = String(val);
                                              const found = commissionRecipientOtherOptions.find(o => o.value === selectedKey);
                                              setCommissionItems(prev => {
                                                const copy = [...prev];
                                                if (found) {
                                                  copy[idx] = {
                                                    ...copy[idx],
                                                    recipient_type: 'other',
                                                    other_id: selectedKey,
                                                    user_id: '',
                                                    user_name: found.label,
                                                    avatar: found.avatar || '',
                                                    role: found.typeLabel || 'Đối tác',
                                                    other_type: found.category || 'partner',
                                                    company_id: found.category === 'company' ? found.rawId : '',
                                                    supplier_id: found.category === 'supplier' ? found.rawId : '',
                                                    contact_id: found.category === 'contact' ? found.rawId : '',
                                                    bank_name: found.bank_name || copy[idx].bank_name || '',
                                                    bank_account: found.bank_account || copy[idx].bank_account || '',
                                                    bank_owner: found.bank_owner ? found.bank_owner.toUpperCase() : (copy[idx].bank_owner || found.label.toUpperCase())
                                                  };
                                                } else {
                                                  copy[idx] = {
                                                    ...copy[idx],
                                                    other_id: '',
                                                    user_name: ''
                                                  };
                                                }
                                                return copy;
                                              });
                                            }}
                                            placeholder={t('-- Tìm kiếm Đối tác, Giới thiệu, NCC, Giảng viên --')}
                                            searchable
                                            width="100%"
                                          />
                                          {cItem.other_id && !cItem.bank_account && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 500 }}>
                                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} strokeWidth={1.75} style={{ flexShrink: 0, color: '#d97706' }} /> {t('Đối tượng này chưa lưu STK trong danh bạ. Vui lòng nhập thông tin ngân hàng ở Hàng 2 bên dưới.')}</span>
                                            </div>
                                          )}
                                          {cItem.other_id && cItem.bank_account && (
                                            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px', fontWeight: 500 }}>
                                              ✓ {t('Đã tự động trích xuất STK ngân hàng từ danh bạ hệ thống.')}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>

                                    {/* Cột 2 (Nếu là Khác/Đối tác): MÃ PO THỤ HƯỞNG */}
                                    {isOther && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                          <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <FileText size={14} />
                                            {t('Mã PO thụ hưởng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                          </label>
                                          <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                                            {t('(Chọn hoặc gõ PO)')}
                                          </span>
                                        </div>
                                        <input
                                          type="text"
                                          list={`po-datalist-${cItem.id}`}
                                          className="form-input"
                                          value={cItem.po_number || ''}
                                          onChange={e => {
                                            const val = e.target.value;
                                            const matchedPo = purchaseOrdersList.find(p => p.po_number === val || `PO #${p.id}` === val);
                                            setCommissionItems(prev => {
                                              const copy = [...prev];
                                              copy[idx] = {
                                                ...copy[idx],
                                                po_number: val,
                                                po_id: matchedPo ? matchedPo.id : (copy[idx].po_id || '')
                                              };
                                              return copy;
                                            });
                                          }}
                                          placeholder={t('Nhập hoặc chọn mã PO...')}
                                          style={{
                                            height: '38px',
                                            fontSize: '0.82rem',
                                            fontWeight: 600
                                          }}
                                        />
                                        <datalist id={`po-datalist-${cItem.id}`}>
                                          {purchaseOrdersList.map(po => (
                                            <option key={po.id} value={po.po_number || `PO #${po.id}`}>
                                              {`${po.po_number || `PO #${po.id}`} • ${formatApprovalCurrency(po.total || 0, currencyType)}${po.notes ? ` • ${po.notes}` : ''}`}
                                            </option>
                                          ))}
                                        </datalist>
                                        {cItem.po_number ? (
                                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                            <Check size={11} /> {t('PO liên kết:')} <strong>{cItem.po_number}</strong>
                                          </div>
                                        ) : (
                                          <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                                            {t('Vui lòng ghi nhận mã PO thụ hưởng của đối tác')}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Cột Số tiền hoa hồng */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                      <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                        {t('Số tiền hoa hồng (₫)')} <span style={{ color: 'var(--color-danger)' }}>*</span>
                                      </label>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={formatNumberWithDots(cItem.amount || '', currencyType)}
                                        onChange={e => {
                                          const rawVal = parseMoneyInput(e.target.value, currencyType);
                                          setCommissionItems(prev => {
                                            const copy = [...prev];
                                            copy[idx] = { ...copy[idx], amount: rawVal.endsWith('.') ? rawVal : Number(rawVal) };
                                            return copy;
                                          });
                                        }}
                                        placeholder="0"
                                        style={{ height: '38px', fontSize: '0.95rem', fontWeight: 800, color: '#0f172a', textAlign: 'right' }}
                                      />
                                      {Number(cItem.amount) > 0 && (
                                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textAlign: 'right', fontWeight: 500, wordBreak: 'break-word' }}>
                                          {numberToVietnameseText(Number(cItem.amount), currencyType)}
                                        </div>
                                      )}
                                    </div>

                                    {/* Cột Nút xóa dòng */}
                                    <div style={{ display: 'flex', alignItems: 'center', paddingTop: '26px' }}>
                                      {commissionItems.length > 1 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setCommissionItems(prev => prev.filter(x => x.id !== cItem.id));
                                          }}
                                          style={{
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            background: 'rgba(239, 68, 68, 0.06)',
                                            color: 'var(--color-danger)',
                                            cursor: 'pointer',
                                            padding: '8px',
                                            borderRadius: '8px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            transition: 'all 0.15s'
                                          }}
                                          title={t('Xóa dòng này khỏi danh sách')}
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      )}
                                    </div>
                                  </div>

                                  {/* HÀNG 2: THÔNG TIN TÀI KHOẢN NGÂN HÀNG & NỘI DUNG/DEAL */}
                                  <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1.4fr',
                                    gap: '10px',
                                    background: 'var(--color-bg-secondary, #f8fafc)',
                                    padding: '10px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-border-light)'
                                  }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <label style={{ fontSize: '0.7rem', fontWeight: 650, color: 'var(--color-text-muted)' }}>
                                        {t('Số tài khoản (STK)')}
                                      </label>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={cItem.bank_account || ''}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setCommissionItems(prev => {
                                            const copy = [...prev];
                                            copy[idx] = { ...copy[idx], bank_account: v };
                                            return copy;
                                          });
                                        }}
                                        placeholder={t('Nhập số tài khoản...')}
                                        style={{ height: '32px', fontSize: '0.8rem', fontWeight: 650 }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <label style={{ fontSize: '0.7rem', fontWeight: 650, color: 'var(--color-text-muted)' }}>
                                        {t('Tên Ngân hàng')}
                                      </label>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={cItem.bank_name || ''}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setCommissionItems(prev => {
                                            const copy = [...prev];
                                            copy[idx] = { ...copy[idx], bank_name: v };
                                            return copy;
                                          });
                                        }}
                                        placeholder={t('VD: Vietcombank, MB...')}
                                        style={{ height: '32px', fontSize: '0.8rem' }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <label style={{ fontSize: '0.7rem', fontWeight: 650, color: 'var(--color-text-muted)' }}>
                                        {t('Chủ tài khoản')}
                                      </label>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={cItem.bank_owner || ''}
                                        onChange={e => {
                                          const v = e.target.value.toUpperCase();
                                          setCommissionItems(prev => {
                                            const copy = [...prev];
                                            copy[idx] = { ...copy[idx], bank_owner: v };
                                            return copy;
                                          });
                                        }}
                                        placeholder={t('Tự động in hoa...')}
                                        style={{ height: '32px', fontSize: '0.8rem', textTransform: 'uppercase', fontWeight: 600 }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                      <label style={{ fontSize: '0.7rem', fontWeight: 650, color: 'var(--color-text-muted)' }}>
                                        {t('Nội dung / Deal / Lý do chi trả')}
                                      </label>
                                      <input
                                        type="text"
                                        className="form-input"
                                        value={cItem.note || ''}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setCommissionItems(prev => {
                                            const copy = [...prev];
                                            copy[idx] = { ...copy[idx], note: v };
                                            return copy;
                                          });
                                        }}
                                        placeholder={isOther ? t('VD: Hoa hồng đối tác dự án X theo PO...') : t('Ví dụ: Hoa hồng chốt hợp đồng dự án ABC...')}
                                        style={{ height: '32px', fontSize: '0.8rem' }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* NÚT THÊM Ở DƯỚI HÀNG (THÊM VÀO CUỐI HÀNG) */}
                          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                            <button
                              type="button"
                              onClick={() => {
                                setCommissionItems(prev => [
                                  ...prev,
                                  {
                                    id: Date.now() + Math.random(),
                                    recipient_type: 'employee',
                                    user_id: '',
                                    user_name: '',
                                    avatar: '',
                                    role: '',
                                    company_id: '',
                                    supplier_id: '',
                                    contact_id: '',
                                    other_id: '',
                                    other_type: '',
                                    po_number: '',
                                    po_id: '',
                                    bank_name: '',
                                    bank_account: '',
                                    bank_owner: '',
                                    amount: 0,
                                    note: ''
                                  }
                                ]);
                              }}
                              className="btn"
                              style={{
                                height: '32px',
                                padding: '0 14px',
                                fontSize: '0.75rem',
                                background: '#dc2626',
                                color: '#ffffff',
                                fontWeight: 700,
                                borderRadius: '8px',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                border: 'none',
                                cursor: 'pointer',
                                boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)'
                              }}
                              title={t('Thêm người nhận hoa hồng vào cuối danh sách')}
                            >
                              <Plus size={15} /> {t('Thêm người nhận hoa hồng')}
                            </button>
                          </div>

                          {/* Totals Summary */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-bg-secondary)', padding: '12px 18px', borderRadius: '12px', border: '1px solid var(--color-border-light)', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <span>{t('Tổng số người nhận hoa hồng:')} <strong style={{ color: 'var(--color-text)' }}>{commissionItems.filter(c => c.user_id || c.user_name).length}</strong></span>
                              {commissionItems.some(c => c.recipient_type === 'other') && (
                                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                  ({commissionItems.filter(c => !c.recipient_type || c.recipient_type === 'employee').filter(c => c.user_id).length} {t('nhân viên')} • {commissionItems.filter(c => c.recipient_type === 'other').filter(c => c.user_name).length} {t('đối tác/khác')})
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('TỔNG TIỀN HOA HỒNG')}:</span>
                              <span style={{ fontSize: '1.15rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#059669', fontFamily: 'monospace' }}>
                                {formatApprovalCurrency(commissionItems.reduce((s, c) => s + (Number(c.amount) || 0), 0), currencyType)}
                              </span>
                            </div>
                          </div>

                          {/* PURPOSE & DETAILS */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-light)' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                              {t('Ghi chú / Căn cứ chi trả hoa hồng chung')}
                            </label>
                            <textarea
                              className="form-input"
                              value={paymentDetails}
                              onChange={e => setPaymentDetails(e.target.value)}
                              placeholder={t('Giải trình chi tiết mục đích hoặc căn cứ tính hoa hồng (nếu có)...')}
                              style={{ height: '64px', resize: 'vertical', fontSize: '0.8rem', padding: '8px' }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {t('Bảng chi tiết thanh toán')}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setExpenseItems([
                                  ...expenseItems,
                                  { id: Date.now(), content: '', quantity: 1, price: 0, vat: 10 }
                                ]);
                              }}
                              className="btn secondary"
                              style={{ height: '28px', padding: '0 10px', fontSize: '0.75rem', color: 'var(--color-primary)' }}
                            >
                              + {t('Thêm dòng')}
                            </button>
                          </div>

                          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                            <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                                  <th style={{ padding: '8px', width: '45px', minWidth: '45px', textAlign: 'center', fontWeight: 700 }}>STT</th>
                                  <th style={{ padding: '8px', minWidth: '200px', fontWeight: 700 }}>{t('Nội dung chi')}</th>
                                  <th style={{ padding: '8px', width: '95px', minWidth: '95px', textAlign: 'center', fontWeight: 700 }}>{t('SL')}</th>
                                  <th style={{ padding: '8px', width: '160px', minWidth: '160px', fontWeight: 700 }}>{t('Đơn giá')}</th>
                                  <th style={{ padding: '8px', width: '120px', minWidth: '120px', fontWeight: 700 }}>{t('Thành tiền')}</th>
                                  <th style={{ padding: '8px', width: '95px', minWidth: '95px', fontWeight: 700 }}>VAT (%)</th>
                                  <th style={{ padding: '8px', width: '36px', minWidth: '36px' }} />
                                </tr>
                              </thead>
                              <tbody>
                                {expenseItems.map((item, idx) => {
                                  const lineTotal = (Number(item.quantity) || 0) * (Number(item.price) || 0);
                                  return (
                                    <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                      <td style={{ padding: '8px', textAlign: 'center', width: '45px', minWidth: '45px', verticalAlign: 'top', lineHeight: '28px' }}>{idx + 1}</td>
                                      <td style={{ padding: '8px', minWidth: '200px', verticalAlign: 'top' }}>
                                        <input
                                          type="text"
                                          className="form-input"
                                          value={item.content}
                                          onChange={e => {
                                            const updated = [...expenseItems];
                                            updated[idx].content = e.target.value;
                                            setExpenseItems(updated);
                                          }}
                                          placeholder={t('Nội dung chi tiêu')}
                                          style={{ padding: '4px 8px', height: '28px', fontSize: '0.8rem', width: '100%' }}
                                          required
                                        />
                                      </td>
                                      <td style={{ padding: '8px', width: '95px', minWidth: '95px', verticalAlign: 'top' }}>
                                        <input
                                          type="number"
                                          className="form-input"
                                          value={item.quantity}
                                          onChange={e => {
                                            const updated = [...expenseItems];
                                            updated[idx].quantity = e.target.value === '' ? '' : Number(e.target.value);
                                            setExpenseItems(updated);
                                          }}
                                          style={{ padding: '4px 6px', height: '28px', fontSize: '0.825rem', width: '100%', minWidth: '70px', textAlign: 'center', fontWeight: 600 }}
                                          min="1"
                                          required
                                        />
                                      </td>
                                      <td style={{ padding: '8px', width: '160px', minWidth: '160px', verticalAlign: 'top' }}>
                                        <input
                                          type="text"
                                          className="form-input"
                                          value={formatNumberWithDots(item.price, currencyType)}
                                          onChange={e => {
                                            const rawVal = parseMoneyInput(e.target.value, currencyType);
                                            const updated = [...expenseItems];
                                            updated[idx].price = rawVal.endsWith('.') ? rawVal : Number(rawVal);
                                            setExpenseItems(updated);
                                          }}
                                          style={{ padding: '4px 8px', height: '28px', fontSize: '0.8rem', width: '100%' }}
                                          placeholder="0"
                                          required
                                        />
                                        {Number(item.price) > 0 && (
                                          <div 
                                            style={{ 
                                              fontSize: '0.68rem', 
                                              color: 'var(--color-primary)', 
                                              fontWeight: 600, 
                                              marginTop: '4px', 
                                              whiteSpace: 'normal', 
                                              wordBreak: 'break-word', 
                                              lineHeight: 1.25 
                                            }} 
                                            title={numberToVietnameseText(Number(item.price), currencyType)}
                                          >
                                            {numberToVietnameseText(Number(item.price), currencyType)}
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: '8px', fontWeight: 600, width: '120px', minWidth: '120px', verticalAlign: 'top', lineHeight: '28px' }}>{formatApprovalCurrency(lineTotal, currencyType)}</td>
                                      <td style={{ padding: '8px', width: '95px', minWidth: '95px', verticalAlign: 'top' }}>
                                        <select
                                          className="form-input"
                                          value={item.vat}
                                          onChange={e => {
                                            const updated = [...expenseItems];
                                            updated[idx].vat = Number(e.target.value);
                                            setExpenseItems(updated);
                                          }}
                                          style={{
                                            padding: '4px 8px',
                                            height: '28px',
                                            fontSize: '0.8rem',
                                            width: '85px',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            background: 'var(--color-bg-primary, #ffffff)',
                                            color: 'var(--color-text-primary, #1e293b)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '6px'
                                          }}
                                        >
                                          {(Array.isArray(vatPolicy?.vat_rates) && vatPolicy.vat_rates.length > 0 ? vatPolicy.vat_rates : [0, 5, 8, 10]).map((rate: number) => (
                                            <option key={rate} value={rate}>{rate}%</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td style={{ padding: '8px', textAlign: 'center', width: '36px', minWidth: '36px', verticalAlign: 'top', lineHeight: '28px' }}>
                                        {expenseItems.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setExpenseItems(expenseItems.filter(x => x.id !== item.id));
                                            }}
                                            style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '1.1rem', height: '28px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                                          >
                                            &times;
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Totals Summary */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignSelf: 'flex-end', width: '280px', marginTop: '4px', fontSize: '0.8rem' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--color-text-muted)' }}>{t('Tổng tiền chưa thuế:')}</span>
                              <strong style={{ color: 'var(--color-text)' }}>{formatApprovalCurrency(itemsTotalBeforeTax, currencyType)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--color-text-muted)' }}>{t('Tiền thuế VAT:')}</span>
                              <strong style={{ color: 'var(--color-text)' }}>{formatApprovalCurrency(itemsTotalVat, currencyType)}</strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '6px', fontSize: '0.9rem' }}>
                              <span style={{ color: 'var(--color-text)', fontWeight: 700 }}>{t('Tổng thanh toán:')}</span>
                              <strong style={{ color: 'var(--color-primary)' }}>{formatApprovalCurrency(itemsGrandTotal, currencyType)}</strong>
                            </div>
                            {itemsGrandTotal > 0 && (
                              <div style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 600, textAlign: 'right', marginTop: '2px', lineHeight: 1.35 }}>
                                ({numberToVietnameseText(itemsGrandTotal, currencyType)})
                              </div>
                            )}
                          </div>

                          {/* PURPOSE & DETAILS (Đem xuống dưới bảng chi tiết thanh toán, không require, không có dấu *) */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-light)' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                              {t('Mục đích & Nội dung thanh toán')}
                            </label>

                            <textarea
                              className="form-input"
                              value={paymentDetails}
                              onChange={e => setPaymentDetails(e.target.value)}
                              placeholder={t('Giải trình chi tiết mục đích chi tiêu và căn cứ đề xuất (nếu có)...')}
                              style={{ height: '76px', resize: 'vertical', fontSize: '0.8rem', padding: '8px' }}
                            />
                          </div>
                        </div>
                      ))}


                      {/* Card 4: Document Attachments dropzone */}
                      {selectedWorkflowDef?.id !== 'print_stamp_send' && (
                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>{t('Tài liệu chứng từ đính kèm')}</span>
                            {attachments.length > 0 && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                                {attachments.length} {t('tệp đã đính kèm')}
                              </span>
                            )}
                          </div>
                          <div
                            tabIndex={0}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsDraggingAttachments(true);
                            }}
                            onDragEnter={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsDraggingAttachments(true);
                            }}
                            onDragLeave={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsDraggingAttachments(false);
                            }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setIsDraggingAttachments(false);
                              const files = Array.from(e.dataTransfer.files || []);
                              if (files.length > 0) {
                                await handleUploadFiles(files);
                              }
                            }}
                            onPaste={async (e) => {
                              const items = e.clipboardData?.items;
                              if (!items) return;
                              const pastedFiles: File[] = [];
                              for (let i = 0; i < items.length; i++) {
                                if (items[i].type?.startsWith('image/')) {
                                  const f = items[i].getAsFile();
                                  if (f) {
                                    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
                                    const ext = items[i].type.split('/')[1] || 'png';
                                    pastedFiles.push(new File([f], `ChungTu_${timestamp}_${i + 1}.${ext}`, { type: f.type }));
                                  }
                                }
                              }
                              if (pastedFiles.length > 0) {
                                e.preventDefault();
                                e.stopPropagation();
                                await handleUploadFiles(pastedFiles);
                              }
                            }}
                            style={{
                              border: isDraggingAttachments ? '2px dashed var(--color-primary)' : '2px dashed var(--color-border)',
                              borderRadius: '12px',
                              padding: '1.5rem',
                              textAlign: 'center',
                              background: isDraggingAttachments ? 'rgba(163, 20, 34, 0.06)' : 'var(--color-bg-secondary)',
                              cursor: uploadingAttachments ? 'wait' : 'pointer',
                              transition: 'all 0.2s ease',
                              outline: 'none'
                            }}
                            onClick={() => {
                              if (uploadingAttachments) return;
                              const fileEl = document.getElementById('drawer-file-upload');
                              if (fileEl) fileEl.click();
                            }}
                          >
                            <input
                              id="drawer-file-upload"
                              type="file"
                              multiple
                              style={{ display: 'none' }}
                              onChange={async (e) => {
                                const files = Array.from(e.target.files || []);
                                if (files.length > 0) {
                                  await handleUploadFiles(files);
                                }
                                e.target.value = '';
                              }}
                            />
                            {uploadingAttachments ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <Loader2 size={24} className="spin" style={{ color: 'var(--color-primary)' }} />
                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text)', margin: 0, fontWeight: 650 }}>
                                  {t('Đang tải tệp lên hệ thống...')}
                                </p>
                              </div>
                            ) : (
                              <>
                                <Paperclip size={24} style={{ color: 'var(--color-primary)', marginBottom: '8px' }} />
                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text)', margin: '0 0 4px 0', fontWeight: 650 }}>
                                  {t('Nhấn để tải nhiều tệp lên, kéo thả hoặc nhấn Ctrl+V để dán ảnh')}
                                </p>
                                <span style={{ fontSize: '0.675rem', color: 'var(--color-text-muted)' }}>
                                  {t('Hỗ trợ gửi nhiều file cùng lúc: PDF, PNG, JPG, XLSX, DOCX (tối đa 25MB/tệp) • Dán ảnh trực tiếp từ Clipboard (Ctrl+V)')}
                                </span>
                              </>
                            )}
                          </div>

                          {/* List of uploaded files */}
                          {attachments.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                              {attachments.map((att, index) => {
                                const baseUrl = import.meta.env.VITE_API_URL || '/backend';
                                const isImg = att.type?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|svg|bmp)$/i.test(att.name || att.url || '');
                                const fileUrl = att.url ? (att.url.startsWith('http') || att.url.startsWith('blob:') ? att.url : `${baseUrl}/${att.url.replace(/^\/?(backend\/)?/, '')}`) : '';
                                return (
                                  <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--color-bg-secondary)', borderRadius: '8px', border: '1px solid var(--color-border-light)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                      {isImg && fileUrl ? (
                                        <img src={fileUrl} alt={att.name} style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, border: '1px solid var(--color-border)' }} />
                                      ) : (
                                        <Paperclip size={14} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                                      )}
                                      {fileUrl ? (
                                        <a href={fileUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.78rem', color: 'var(--color-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'underline' }}>
                                          {att.name}
                                        </a>
                                      ) : (
                                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {att.name}
                                        </span>
                                      )}
                                      {att.size && (
                                        <span style={{ fontSize: '0.675rem', color: 'var(--color-text-muted)', flexShrink: 0 }}>
                                          ({(att.size / (1024 * 1024)).toFixed(2)} MB)
                                        </span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                                      style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: '2px 6px', flexShrink: 0 }}
                                    >
                                      {t('Xóa')}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Card 5: Thảo luận & Hoạt động (Bình luận như bên workspace) - Only when editing existing request */}
                      {editingItemId && (
                        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)', marginTop: '1.25rem' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t('Thảo luận & Hoạt động')}
                          </div>

                          {/* List of comments */}
                          <div 
                            style={{ 
                              display: 'flex', 
                              flexDirection: 'column', 
                              gap: '10px',
                              maxHeight: '240px',
                              overflowY: 'auto',
                              paddingRight: '6px'
                            }}
                            className="custom-scrollbar"
                          >
                            {createComments.length === 0 ? (
                              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                                {t('Chưa có bình luận nào.')}
                              </span>
                            ) : (
                              createComments.map((c: any) => (
                                <div key={c.id} style={{
                                  display: 'flex',
                                  gap: '12px',
                                  padding: '12px 16px',
                                  background: 'var(--color-bg)',
                                  borderRadius: '14px',
                                  border: '1px solid var(--color-border-light)',
                                  boxShadow: '0 2px 6px rgba(0,0,0,0.01)'
                                }}>
                                            <Avatar name={c.author} size={28} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                                      <strong style={{ fontSize: '0.8rem', color: 'var(--color-text)', fontWeight: 700 }}>{c.author}</strong>
                                      <span style={{ fontSize: '0.675rem', color: 'var(--color-text-muted)' }}>{c.time}</span>
                                    </div>
                                    <p 
                                      style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-light)', lineHeight: '1.45', whiteSpace: 'pre-wrap' }}
                                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.text) }}
                                    />
                                    
                                    {c.attachments && c.attachments.length > 0 && (
                                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                                        {c.attachments.map((att: any, idx: number) => (
                                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', padding: '3px 8px', borderRadius: '8px', fontSize: '0.72rem', color: 'var(--color-text)' }}>
                                            <Paperclip size={11} style={{ color: 'var(--color-text-muted)' }} />
                                            <span>{att.name}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </div>

                          {/* Comment input box */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                            <div style={{ position: 'relative' }}>
                              <MentionInput
                                value={newCreateComment}
                                onChange={e => setNewCreateComment(e.target.value)}
                                placeholder={t('Viết bình luận... Gõ @ để nhắc tên')}
                                style={{ minHeight: '65px', fontSize: '0.8rem', paddingRight: '40px' }}
                                users={users}
                                disabled={createUploadingFile}
                              />
                              <label style={{ position: 'absolute', right: '10px', bottom: '10px', cursor: createUploadingFile ? 'not-allowed' : 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('Đính kèm file')}>
                                <input 
                                  type="file" 
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    if (!file) return;
                                    setCreateUploadingFile(true);
                                    try {
                                      const fd = new FormData();
                                      fd.append('file', file);
                                      const res = await api.post('/upload', fd, {
                                        headers: { 'Content-Type': 'multipart/form-data' }
                                      });
                                      if (res.data && res.data.success && res.data.data?.url) {
                                        setCreateCommentAttachments([...createCommentAttachments, { name: file.name, url: res.data.data.url }]);
                                        toast.success(t('Đã đính kèm tệp!'));
                                      } else {
                                        throw new Error(res.data?.message || t('Tải lên thất bại'));
                                      }
                                    } catch (err: any) {
                                      toast.error(t('Lỗi tải tệp: ') + (err.message || ''));
                                    } finally {
                                      setCreateUploadingFile(false);
                                    }
                                  }} 
                                  style={{ display: 'none' }} 
                                  disabled={createUploadingFile} 
                                />
                                {createUploadingFile ? <Clock className="spin" size={16} /> : <Paperclip size={16} />}
                              </label>
                            </div>

                            {/* Uploaded comment attachments list */}
                            {createCommentAttachments.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                {createCommentAttachments.map((file, idx) => (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '3px 8px', borderRadius: '12px', fontSize: '0.72rem', color: 'var(--color-primary)' }}>
                                    <Paperclip size={11} />
                                    <span>{file.name}</span>
                                    <button type="button" onClick={() => setCreateCommentAttachments(createCommentAttachments.filter((_, i) => i !== idx))} style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', paddingLeft: '4px', fontWeight: 700 }}>&times;</button>
                                  </div>
                                ))}
                              </div>
                            )}


                            <button
                              type="button"
                              onClick={() => {
                                if (!newCreateComment.trim() && createCommentAttachments.length === 0) return;
                                const commentObj = {
                                  id: Date.now(),
                                  author: t('Tôi'),
                                  time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                                  text: newCreateComment,
                                  attachments: createCommentAttachments
                                };
                                setCreateComments([...createComments, commentObj]);
                                setNewCreateComment('');
                                setCreateCommentAttachments([]);
                                toast.success(t('Đã thêm bình luận!'));
                              }}
                              className="btn primary"
                              style={{ alignSelf: 'flex-end', height: '30px', padding: '0 14px', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                              <Send size={12} />
                              <span>{t('Gửi')}</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Spacer at the bottom to prevent sticking to edge */}
                      <div style={{ height: '80px', flexShrink: 0 }} />

                    </div>

                    {/* RIGHT COLUMN: Approval flow steps details (30%) - sticky styled */}
                    <div style={{
                      flex: isMobile ? 'none' : 3,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: isMobile ? '1rem' : '1.25rem',
                      minWidth: 0,
                      width: '100%',
                      position: isMobile ? 'static' : 'sticky',
                      top: '1.5rem',
                      height: 'fit-content'
                    }}>
                      
                      {/* Card 1: Workflow Steps */}
                      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {t('Các bước duyệt áp dụng')}
                        </div>

                        {(() => {
                          if (selectedWorkflowDef?.id === 'print_stamp_send') {
                            const reqUser = users.find(u => String(u.id) === String(pssReqEmployeeId)) || proposerUser;
                            const execUser = users.find(u => String(u.id) === String(pssExecutorId));
                            
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '12px', position: 'relative', paddingLeft: '30px' }}>
                                <div style={{ position: 'absolute', left: '10px', top: '10px', bottom: '10px', width: '2px', background: 'var(--color-border-light)' }} />
                                
                                {/* Step 1: Submitter */}
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                  <div style={{
                                    position: 'absolute',
                                    left: '-30px',
                                    top: '0px',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: 'var(--color-primary)',
                                    color: '#ffffff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    zIndex: 2
                                  }}>
                                    1
                                  </div>
                                  <div>
                                    <strong style={{ fontSize: '0.8rem', color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>{t('Thông tin hồ sơ')}</strong>
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '8px', 
                                      padding: '6px 12px', 
                                      background: 'var(--color-bg-light)', 
                                      border: '1px solid var(--color-border-light)', 
                                      borderRadius: '8px',
                                      height: '38px'
                                    }}>
                                      <div style={getAvatarRingStyle('#10b981')}>
                                        <Avatar 
                                          src={reqUser?.avatar_url || reqUser?.avatar} 
                                          name={reqUser?.full_name || reqUser?.name || 'User'} 
                                          size={20} 
                                        />
                                      </div>
                                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                        {reqUser?.full_name || reqUser?.name || t('Người lập')}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                {/* Step 2: Executor */}
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                  <div style={{
                                    position: 'absolute',
                                    left: '-30px',
                                    top: '0px',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: execUser ? 'var(--color-primary)' : 'var(--color-surface)',
                                    border: `2px solid ${execUser ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                    color: execUser ? '#ffffff' : 'var(--color-text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    zIndex: 2
                                  }}>
                                    2
                                  </div>
                                  <div>
                                    <strong style={{ fontSize: '0.8rem', color: execUser ? 'var(--color-text)' : 'var(--color-text-muted)', display: 'block', marginBottom: '6px' }}>{t('Xác nhận hoàn thành')}</strong>
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '8px', 
                                      padding: '6px 12px', 
                                      background: execUser ? 'var(--color-bg-light)' : 'var(--color-surface)', 
                                      border: '1px solid var(--color-border-light)', 
                                      borderRadius: '8px',
                                      height: '38px'
                                    }}>
                                      {execUser ? (
                                        <>
                                          <div style={getAvatarRingStyle(execUser ? '#10b981' : '#cbd5e1')}>
                                            <Avatar 
                                              src={execUser?.avatar_url || execUser?.avatar} 
                                              name={execUser?.full_name || execUser?.name || 'User'} 
                                              size={20} 
                                            />
                                          </div>
                                          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                            {execUser?.full_name || execUser?.name}
                                          </span>
                                        </>
                                      ) : (
                                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                                          {t('Chưa chọn người thực hiện')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          let currentStepIndex = 1;
                          const stepIndex1 = currentStepIndex++;
                          const stepIndex2 = showStepManager ? currentStepIndex++ : null;
                          const stepIndex3 = showStepDirector ? currentStepIndex++ : null;
                          const stepIndex4 = showStepAccountant ? currentStepIndex++ : null;

                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '12px', position: 'relative', paddingLeft: '30px' }}>
                              <div style={{ position: 'absolute', left: '10px', top: '10px', bottom: '10px', width: '2px', background: 'var(--color-border-light)' }} />
                              
                              {/* Step 1: Submitter */}
                              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                <div style={{
                                  position: 'absolute',
                                  left: '-30px',
                                  top: '0px',
                                  width: '22px',
                                  height: '22px',
                                  borderRadius: '50%',
                                  background: 'var(--color-primary)',
                                  color: '#ffffff',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  zIndex: 2
                                }}>
                                  {stepIndex1}
                                </div>
                                <div>
                                  <strong style={{ fontSize: '0.8rem', color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>{t('Lập đề xuất & gửi')}</strong>
                                  <div style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    gap: '8px', 
                                    padding: '6px 12px', 
                                    background: 'var(--color-bg-light)', 
                                    border: '1px solid var(--color-border-light)', 
                                    borderRadius: '8px',
                                    height: '38px'
                                  }}>
                                    <div style={getAvatarRingStyle('#10b981')}>
                                      <Avatar 
                                        src={proposerUser?.avatar_url || proposerUser?.avatar} 
                                        name={proposerUser?.full_name || proposerUser?.name || 'User'} 
                                        size={20} 
                                      />
                                    </div>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                      {proposerUser?.full_name || proposerUser?.name || t('Người lập')}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Step 2: Department Manager */}
                              {showStepManager && (
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                  <div style={{
                                    position: 'absolute',
                                    left: '-30px',
                                    top: '0px',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: app1User ? 'var(--color-primary)' : 'var(--color-surface)',
                                    border: `2px solid ${app1User ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                    color: app1User ? '#ffffff' : 'var(--color-text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    zIndex: 2
                                  }}>
                                    {stepIndex2}
                                  </div>
                                  <div style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                      <strong style={{ fontSize: '0.8rem', color: app1User ? 'var(--color-text)' : 'var(--color-text-muted)' }}>{t(`Bước ${stepIndex2 || 2}: Phê duyệt (Cấp 1)`)}</strong>
                                      <button
                                        type="button"
                                        onClick={() => setShowStepManager(false)}
                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: '0 4px', display: 'flex', alignItems: 'center' }}
                                        title={t('Xóa bước')}
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                    <div style={{ marginTop: '4px' }}>
                                      <CustomSelect
                                        options={approverUserOptions}
                                        value={app1User ? String(app1User.id) : ''}
                                        onChange={val => {
                                          const u = users.find(x => String(x.id) === String(val));
                                          if (u) {
                                            userPickedApprover1Ref.current = true;
                                            setCustomApprover1(u);
                                          }
                                        }}
                                        placeholder={t('Chọn người phê duyệt...')}
                                        searchable
                                        showAvatars
                                        width="100%"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Step 3: Director (Chỉ hiển thị khi chi phí >= 5tr hoặc được bật) */}
                              {showStepDirector && (
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                  <div style={{
                                    position: 'absolute',
                                    left: '-30px',
                                    top: '0px',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: directorUser ? 'var(--color-primary)' : 'var(--color-surface)',
                                    border: `2px solid ${directorUser ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                    color: directorUser ? '#ffffff' : 'var(--color-text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    zIndex: 2
                                  }}>
                                    {stepIndex3}
                                  </div>
                                  <div style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                      <strong style={{ fontSize: '0.8rem', color: directorUser ? 'var(--color-text)' : 'var(--color-text-muted)' }}>{t(`Bước ${stepIndex3 || 3}: Phê duyệt (Cấp 2)`)}</strong>
                                      <button
                                        type="button"
                                        onClick={() => setShowStepDirector(false)}
                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: '0 4px', display: 'flex', alignItems: 'center' }}
                                        title={t('Xóa bước')}
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                    <div style={{ marginTop: '4px' }}>
                                      <CustomSelect
                                        options={approverUserOptions}
                                        value={directorUser ? String(directorUser.id) : ''}
                                        onChange={val => {
                                          const u = users.find(x => String(x.id) === String(val));
                                          if (u) {
                                            userPickedApprover3Ref.current = true;
                                            setCustomApprover3(u);
                                          }
                                        }}
                                        placeholder={t('Chọn người phê duyệt...')}
                                        searchable
                                        showAvatars
                                        width="100%"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Step 4: Accountant (hoặc Step 3 nếu không có Director) */}
                              {showStepAccountant && (
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                  <div style={{
                                    position: 'absolute',
                                    left: '-30px',
                                    top: '0px',
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '50%',
                                    background: accountantUser ? 'var(--color-primary)' : 'var(--color-surface)',
                                    border: `2px solid ${accountantUser ? 'var(--color-primary)' : 'var(--color-border)'}`,
                                    color: accountantUser ? '#ffffff' : 'var(--color-text-muted)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    zIndex: 2
                                  }}>
                                    {stepIndex4}
                                  </div>
                                  <div style={{ width: '100%' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                      <strong style={{ fontSize: '0.8rem', color: accountantUser ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                                        {t(`Bước ${stepIndex4 || 4}: Phê duyệt (Cấp ${stepIndex4 ? stepIndex4 - 1 : 3})`)}
                                      </strong>
                                      <button
                                        type="button"
                                        onClick={() => setShowStepAccountant(false)}
                                        style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '0.75rem', padding: '0 4px', display: 'flex', alignItems: 'center' }}
                                        title={t('Xóa bước')}
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                    <div style={{ marginTop: '4px' }}>
                                      <CustomSelect
                                        options={approverUserOptions}
                                        value={accountantUser ? String(accountantUser.id) : ''}
                                        onChange={val => {
                                          const u = users.find(x => String(x.id) === String(val));
                                          if (u) {
                                            userPickedApprover2Ref.current = true;
                                            setCustomApprover2(u);
                                          }
                                        }}
                                        placeholder={t('Chọn người phê duyệt...')}
                                        searchable
                                        showAvatars
                                        width="100%"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {selectedWorkflowDef?.id !== 'print_stamp_send' && (!showStepManager || !showStepAccountant || !showStepDirector) && (
                          <div style={{ 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '8px', 
                            marginTop: '1rem', 
                            padding: '12px',
                            border: '1px dashed var(--color-border)',
                            borderRadius: '12px',
                            background: 'var(--color-bg)'
                          }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                              {t('Khôi phục bước duyệt đã xóa')}
                            </span>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                              {!showStepManager && (
                                <button
                                  type="button"
                                  className="btn outline sm"
                                  onClick={() => setShowStepManager(true)}
                                  style={{ fontSize: '0.675rem', padding: '4px 10px', height: 'auto', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Plus size={12} /> {t('Phê duyệt (Cấp 1)')}
                                </button>
                              )}
                              {!showStepDirector && (
                                <button
                                  type="button"
                                  className="btn outline sm"
                                  onClick={() => setShowStepDirector(true)}
                                  style={{ fontSize: '0.675rem', padding: '4px 10px', height: 'auto', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Plus size={12} /> {t('Phê duyệt (Cấp 2)')}
                                </button>
                              )}
                              {!showStepAccountant && (
                                <button
                                  type="button"
                                  className="btn outline sm"
                                  onClick={() => setShowStepAccountant(true)}
                                  style={{ fontSize: '0.675rem', padding: '4px 10px', height: 'auto', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}
                                >
                                  <Plus size={12} /> {t('Phê duyệt (Cấp 3)')}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {formType === 'expense' && toVndAmount(currentExpenseTotal, currencyType) >= threeLevelThresholdVnd && (
                          <div style={{
                            marginTop: '0.75rem',
                            padding: '10px',
                            background: 'rgba(245, 158, 11, 0.06)',
                            border: '1px solid rgba(245, 158, 11, 0.15)',
                            borderRadius: '8px',
                            fontSize: '0.72rem',
                            color: 'var(--color-text-muted)',
                            lineHeight: '1.4'
                          }}>
                            <strong>{t('Lưu ý:')}</strong> {t(`Chi phí từ ${formatApprovalCurrency(threeLevelThresholdVnd, 'VND')} trở lên hệ thống tự động bổ sung phê duyệt của Giám đốc (Tạo -> Leader -> Giám đốc -> Kế toán). Bạn có thể thay đổi người phụ trách ở mỗi bước.`)}
                          </div>
                        )}
                      </div>

                      {/* Card 2: Người liên quan (Theo dõi) */}
                      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            {t('Người liên quan (Theo dõi)')} ({relatedUserIds.length})
                          </div>
                        </div>

                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                          {/* Selected avatars */}
                          {relatedUserIds.length > 0 && (
                            <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                              {relatedUserIds.map((uid, idx) => {
                                const u = users.find(x => Number(x.id) === Number(uid));
                                if (!u) return null;
                                return (
                                  <div
                                    key={u.id}
                                    style={{
                                      marginLeft: idx === 0 ? 0 : -8,
                                      border: '1.5px solid var(--color-surface)',
                                      borderRadius: '50%',
                                      overflow: 'hidden',
                                      zIndex: 10 - idx,
                                      boxShadow: 'var(--shadow-sm)',
                                      display: 'flex'
                                    }}
                                    title={u.full_name || u.name}
                                  >
                                    <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={28} />
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Plus button */}
                          <button
                            type="button"
                            onClick={() => setShowRelatedDropdown(!showRelatedDropdown)}
                            style={{
                              border: '1px dashed var(--color-primary)',
                              background: 'rgba(163, 20, 34, 0.04)',
                              width: '28px',
                              height: '28px',
                              borderRadius: '50%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: 0,
                              transition: 'all 0.15s ease'
                            }}
                            className="hover-btn-subtle"
                            title={t('Thêm người liên quan')}
                          >
                            <UserPlus size={14} color="var(--color-primary)" />
                          </button>

                          {/* Dropdown with SEARCH */}
                          {showRelatedDropdown && (
                            <div 
                              ref={relatedDropdownRef}
                              style={{
                                position: 'absolute',
                                top: (typeof window !== 'undefined' && window.innerWidth <= 768) ? 'auto' : '100%',
                                bottom: (typeof window !== 'undefined' && window.innerWidth <= 768) ? 'calc(100% + 6px)' : 'auto',
                                left: 0,
                                marginTop: (typeof window !== 'undefined' && window.innerWidth <= 768) ? 0 : '6px',
                                marginBottom: (typeof window !== 'undefined' && window.innerWidth <= 768) ? '6px' : 0,
                                zIndex: 9999,
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: '12px',
                                boxShadow: (typeof window !== 'undefined' && window.innerWidth <= 768) ? '0 -10px 25px rgba(0, 0, 0, 0.18)' : '0 10px 25px rgba(0, 0, 0, 0.18)',
                                minWidth: '240px',
                                maxWidth: (typeof window !== 'undefined' && window.innerWidth <= 768) ? 'calc(100vw - 32px)' : '320px',
                                maxHeight: (typeof window !== 'undefined' && window.innerWidth <= 768) ? '250px' : '280px',
                                overflowY: 'auto',
                                padding: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                              }}
                            >
                              <div style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 10, paddingBottom: '4px' }}>
                                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                  <input
                                    type="text"
                                    placeholder={t('Tìm người liên quan...')}
                                    value={relatedSearch}
                                    onChange={(e) => setRelatedSearch(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      width: '100%',
                                      padding: '6px 28px 6px 10px',
                                      fontSize: '0.75rem',
                                      borderRadius: '6px',
                                      border: '1px solid var(--color-border)',
                                      background: 'var(--color-bg)',
                                      color: 'var(--color-text)',
                                      outline: 'none',
                                      boxSizing: 'border-box'
                                    }}
                                    autoFocus
                                  />
                                  <Search size={13} style={{ position: 'absolute', right: '8px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                                </div>
                              </div>
                              {users
                                .filter((u: any) => {
                                  if (!relatedSearch.trim()) return true;
                                  const query = relatedSearch.toLowerCase();
                                  return (
                                    (u.full_name || u.name || '').toLowerCase().includes(query) ||
                                    (u.email || '').toLowerCase().includes(query) ||
                                    (u.role || '').toLowerCase().includes(query)
                                  );
                                })
                                .map((u: any) => {
                                  const isSelected = relatedUserIds.includes(Number(u.id));
                                  return (
                                    <div
                                      key={u.id}
                                      onClick={() => {
                                        const uid = Number(u.id);
                                        if (isSelected) {
                                          setRelatedUserIds(relatedUserIds.filter(id => id !== uid));
                                        } else {
                                          setRelatedUserIds([...relatedUserIds, uid]);
                                        }
                                      }}
                                      style={{
                                        padding: '6px 8px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        fontSize: '0.75rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: isSelected ? 'var(--color-primary-light)' : 'transparent',
                                        color: isSelected ? 'var(--color-primary)' : 'var(--color-text)',
                                        fontWeight: isSelected ? 600 : 400
                                      }}
                                      className="hover-bg-alt"
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                                        <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={20} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name || u.name}</span>
                                      </div>
                                      {isSelected && <Check size={12} color="var(--color-primary)" strokeWidth={3} style={{ flexShrink: 0, marginLeft: '4px' }} />}
                                    </div>
                                  );
                                })}
                              {users.filter((u: any) => {
                                if (!relatedSearch.trim()) return true;
                                const query = relatedSearch.toLowerCase();
                                return (
                                  (u.full_name || u.name || '').toLowerCase().includes(query) ||
                                  (u.email || '').toLowerCase().includes(query) ||
                                  (u.role || '').toLowerCase().includes(query)
                                );
                              }).length === 0 && (
                                <div style={{ textAlign: 'center', padding: '10px 4px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                  {t('Không tìm thấy kết quả')}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Selected chips */}
                        {relatedUserIds.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                            {relatedUserIds.map(uid => {
                              const u = users.find(x => Number(x.id) === Number(uid));
                              if (!u) return null;
                              return (
                                <span
                                  key={u.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '3px 8px',
                                    background: 'rgba(107, 114, 128, 0.08)',
                                    color: 'var(--color-text)',
                                    fontSize: '0.72rem',
                                    fontWeight: 600,
                                    borderRadius: '12px',
                                    border: '1px solid rgba(107, 114, 128, 0.16)'
                                  }}
                                >
                                  <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={16} />
                                  <span>{u.full_name || u.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => setRelatedUserIds(relatedUserIds.filter(id => id !== Number(u.id)))}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--color-danger)',
                                      cursor: 'pointer',
                                      padding: 0,
                                      fontSize: '0.8rem',
                                      lineHeight: 1
                                    }}
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                    </div>

                  </div>

                  {/* Sticky Mobile Action Bar */}
                  {isMobile && (
                    <div style={{
                      position: 'sticky',
                      bottom: 0,
                      padding: '12px 16px',
                      background: 'var(--color-surface)',
                      borderTop: '1px solid var(--color-border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      zIndex: 100,
                      boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.08)'
                    }}>
                      {!editingItemId && (
                        <button 
                          type="button" 
                          onClick={() => handleRequestExit('back')}
                          style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-border)',
                            padding: '0 14px',
                            borderRadius: '10px',
                            cursor: 'pointer',
                            color: 'var(--color-text)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            height: '42px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            flexShrink: 0
                          }}
                        >
                          <ArrowLeft size={16} />
                          <span>{t('Quay lại')}</span>
                        </button>
                      )}

                      <button 
                        type="button" 
                        onClick={() => handleSaveCurrentDraft(false)}
                        disabled={submitting}
                        className="hover-lift"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '0 14px',
                          borderRadius: '10px',
                          fontSize: '0.85rem',
                          fontWeight: 700,
                          height: '42px',
                          background: 'var(--color-bg)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text)',
                          cursor: 'pointer',
                          boxShadow: 'var(--shadow-sm)',
                          flexShrink: 0
                        }}
                      >
                        <FileText size={16} style={{ flexShrink: 0 }} />
                        <span>{t('Lưu nháp')}</span>
                      </button>

                      <button 
                        type="button" 
                        onClick={handleCreateSubmit}
                        disabled={submitting}
                        className="btn primary"
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          borderRadius: '10px',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          height: '42px',
                          background: 'var(--color-primary)',
                          borderColor: 'var(--color-primary)',
                          color: 'white',
                          cursor: 'pointer',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        <Save size={16} />
                        <span>{submitting ? (editingItemId ? t('Đang lưu...') : t('Đang gửi...')) : (editingItemId ? t('Cập nhật đề xuất') : t('Gửi đề xuất'))}</span>
                      </button>
                    </div>
                  )}

                </motion.div>
              </>
            )}

            <DraftExitConfirmModal
              isOpen={showExitConfirmModal}
              onSaveDraft={() => handleSaveCurrentDraft(true)}
              onDiscard={handleDiscardExit}
              onContinue={() => setShowExitConfirmModal(false)}
              zIndex={2147483647}
            />
          </>
        );
      })(), document.body)}

      <QrImageModal
        isOpen={!!previewQrModalUrl}
        qrUrl={previewQrModalUrl}
        onClose={() => setPreviewQrModalUrl(null)}
        zIndex={uiMotion?.z_modal_nested || 2147483646}
      />
    </div>
  );
}
