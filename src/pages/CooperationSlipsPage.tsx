import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { fetchAPI } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTenantConfig, getTenantOrganizationName, getTenantLogoUrl } from '../contexts/TenantConfigContext';
import { useTypedSetting, useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { isExecutive, isManagement, isAccountant, normalizeRole } from '../utils/roleUtils';
import { hasModuleApprovalAccess } from '../utils/approvalPermissions';
import { formatDateVN, formatDateTimeVN, getLocalDateStr } from '../utils/dateUtils';
import { pushOverlay } from '../utils/overlayStack';
import api from '../api/axios';
import { FileText, Check, X, ShieldAlert, UserPlus, PenTool, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Trash2, Paperclip, ExternalLink, Search, Zap, Edit3, Loader2, Printer, Download } from 'lucide-react';
import { SignaturePadModal } from '../components/ui/SignaturePadModal';
import { PeriodFilter, getDateRange } from '../components/ui/PeriodFilter';
import type { Period, DateRange } from '../components/ui/PeriodFilter';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Avatar } from '../components/ui/Avatar';
import { EmptyCard } from '../components/ui/EmptyCard';
import { useShallow } from 'zustand/react/shallow';
import { useUIStore } from '../store/uiStore';
import { useLocation, useNavigate } from 'react-router-dom';
import { Pagination } from '../components/ui/Pagination';
import { CopyButton } from '../components/ui/CopyButton';
import { CardSkeleton } from '../components/ui/Skeleton';
import { getModulePermissionScope } from '../store/authStore';
import { compressToWebP } from '../utils/imageCompress';
import { CurrencyInput } from '../components/ui/CurrencyInput';
import { ensureArray, extractArray } from '../utils/safeArray';

interface CooperationSlip {
  id: number;
  contact_id: number;
  deposit_slip_id: number;
  version: number;
  total_percentage: number;
  shares_json: string;
  signatures_json: string;
  status: 'pending_signatures' | 'pending_manager_approval' | 'approved' | 'rejected' | 'disputed' | 'approved_pending_signatures';
  dispute_details: string | null;
  attachment_url?: string | null;
  created_at: string;
  created_by: number;
  full_name: string;
  phone: string;
  unit_code: string;
  project_name: string;
  expected_commission: number;
  expected_revenue?: number;
  actual_revenue?: number;
  shareholders: Shareholder[];
  approver?: {
    user_id: number;
    name: string;
    email: string;
    avatar?: string | null;
    approved_at: string;
  } | null;
  adjustment_request?: {
    user_id: number;
    name: string;
    email: string;
    avatar?: string | null;
    reason: string;
    requested_at: string;
    expected_commission?: number;
    shares?: { user_id: number | string; percentage: number }[];
  } | null;
}

interface Shareholder {
  user_id: number;
  name: string;
  email: string;
  percentage: number;
  signed: boolean;
  signature_time: string | null;
  signature_ip: string | null;
}

interface SalesAccount {
  id: number;
  full_name: string;
  email: string;
  team_id?: number | string;
  role?: string;
  avatar?: string;
}

const SAFE_IMAGE_RE = /\.(jpg|jpeg|png|webp|gif|bmp)$/i;
const BLOCKED_UPLOAD_RE = /\.(svg|html?|xhtml|js|mjs|cjs|php|phtml|exe|bat|cmd|sh|ps1)$/i;

function numberToVietnameseWords(num: number): string {
  const units = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  if (num === 0) return 'Không phần trăm';
  if (num === 100) return 'Một trăm phần trăm';

  let words = '';
  const tens = Math.floor(num / 10);
  const ones = num % 10;

  if (tens > 1) {
    words += units[tens] + ' mươi';
    if (ones === 1) {
      words += ' mốt';
    } else if (ones === 5) {
      words += ' lăm';
    } else if (ones > 0) {
      words += ' ' + units[ones];
    }
  } else if (tens === 1) {
    words += 'mười';
    if (ones === 5) {
      words += ' lăm';
    } else if (ones > 0) {
      words += ' ' + units[ones];
    }
  } else {
    words += units[ones];
  }

  const result = words.trim();
  return (result.charAt(0).toUpperCase() + result.slice(1) + ' phần trăm').trim();
}

const resolveFileUrl = (path: string) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('data:')) {
    return path;
  }
  const cleanPath = path.replace(/^\/+/, '');
  if (cleanPath.startsWith('uploads/')) {
    return `${import.meta.env.VITE_API_URL || '/backend'}/${cleanPath}`;
  }
  return `${import.meta.env.VITE_API_URL || '/backend'}/uploads/${cleanPath}`;
};

const csvSafe = (val: unknown): string => {
  const s = String(val ?? '').replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

const safeSliceDate = (val?: string | null): string => {
  if (!val || String(val).startsWith('0000-00-00')) return '';
  return String(val).slice(0, 10);
};

export default function CooperationSlipsPage() {
  const { addToast, showConfirm, closeConfirm } = useUIStore(useShallow((s) => ({ addToast: s.addToast, showConfirm: s.showConfirm, closeConfirm: s.closeConfirm })));
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const { config } = useTenantConfig();

  const coopPolicy = useTypedSetting<any>('crm.coop_commission_policy', {});
  const maxUploadMbSetting = useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', 50);
  const pageSizeSetting = useTypedSubSetting<number>('finance.ui_pagination_sizes', 'cooperation_slips', 8);
  const zModalNested = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);

  const maxUploadMb = Number(maxUploadMbSetting) > 0 ? Number(maxUploadMbSetting) : 50;
  const ITEMS_PER_PAGE = Number(pageSizeSetting) > 0 ? Number(pageSizeSetting) : 8;

  const [slips, setSlips] = useState<CooperationSlip[]>([]);
  const [salesAccounts, setSalesAccounts] = useState<SalesAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Update Shares State
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [selectedSlipId, setSelectedSlipId] = useState<number | null>(null);
  const [sharesInput, setSharesInput] = useState<{ user_id: string; percentage: string }[]>([]);
  const [updateExpectedCommission, setUpdateExpectedCommission] = useState<number>(0);

  const [expandedSlips, setExpandedSlips] = useState<Record<number, boolean>>({});

  const [period, setPeriod] = useState<Period>('all');
  const [dateRange, setDateRange] = useState<DateRange>(() => getDateRange('all'));
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSale, setFilterSale] = useState('all');
  const location = useLocation();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [changeReason, setChangeReason] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Signature Modal state
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signingSlip, setSigningSlip] = useState<CooperationSlip | null>(null);
  const [modalDocs, setModalDocs] = useState<any[]>([]);
  const [modalDeals, setModalDeals] = useState<any[]>([]);
  const [signatureMethod, setSignatureMethod] = useState<'draw' | 'upload'>('draw');
  const [uploadedSignatureImg, setUploadedSignatureImg] = useState<string | null>(null);
  const [showQuickSignatureModal, setShowQuickSignatureModal] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const [approvalSlip, setApprovalSlip] = useState<CooperationSlip | null>(null);
  const [isApproving, setIsApproving] = useState(false);
  const [printSlip, setPrintSlip] = useState<CooperationSlip | null>(null);

  // Custom Confirm/Prompt Modal state
  const [customConfirm, setCustomConfirm] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const [customPrompt, setCustomPrompt] = useState<{
    isOpen: boolean;
    title: string;
    label: string;
    value: string;
    onConfirm: (val: string) => Promise<void> | void;
  }>({
    isOpen: false,
    title: '',
    label: '',
    value: '',
    onConfirm: () => {}
  });

  const [requestAdjustmentSlip, setRequestAdjustmentSlip] = useState<any>(null);
  const [requestAdjustmentReason, setRequestAdjustmentReason] = useState('');
  const [isSubmittingReq, setIsSubmittingReq] = useState(false);
  const [reqShares, setReqShares] = useState<{ user_id: string; percentage: string }[]>([]);
  const [reqExpectedCommission, setReqExpectedCommission] = useState<number>(0);
  const [selectedSlipForHandleRequest, setSelectedSlipForHandleRequest] = useState<any | null>(null);
  const [showHandleRequestModal, setShowHandleRequestModal] = useState(false);
  const [handleRequestNote, setHandleRequestNote] = useState('');
  const [isHandlingRequest, setIsHandlingRequest] = useState(false);

  const loadAbortRef = useRef<AbortController | null>(null);
  const modalDocsAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawing = useRef(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterSale, dateRange, statusFilter]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const statusParam = searchParams.get('status');
    setStatusFilter(statusParam || 'all');
  }, [location.search]);

  useEffect(() => {
    if (!isSignModalOpen || !signingSlip) return;
    return pushOverlay('coop-sign-modal', () => {
      if (!isSigning) {
        setIsSignModalOpen(false);
        setSigningSlip(null);
      }
    }, zModalNested);
  }, [isSignModalOpen, signingSlip, isSigning, zModalNested]);

  useEffect(() => {
    if (!approvalSlip) return;
    return pushOverlay('coop-approve-modal', () => {
      if (!isApproving) setApprovalSlip(null);
    }, zModalNested);
  }, [approvalSlip, isApproving, zModalNested]);

  useEffect(() => {
    if (!isUpdateOpen) return;
    return pushOverlay('coop-update-shares-modal', () => setIsUpdateOpen(false), zModalNested);
  }, [isUpdateOpen, zModalNested]);

  useEffect(() => {
    if (!requestAdjustmentSlip) return;
    return pushOverlay('coop-req-adjust-modal', () => {
      if (!isSubmittingReq) setRequestAdjustmentSlip(null);
    }, zModalNested);
  }, [requestAdjustmentSlip, isSubmittingReq, zModalNested]);

  useEffect(() => {
    if (!showHandleRequestModal) return;
    return pushOverlay('coop-handle-req-modal', () => {
      if (!isHandlingRequest) setShowHandleRequestModal(false);
    }, zModalNested);
  }, [showHandleRequestModal, isHandlingRequest, zModalNested]);

  useEffect(() => {
    if (!printSlip) return;
    return pushOverlay('coop-print-modal', () => setPrintSlip(null), zModalNested);
  }, [printSlip, zModalNested]);

  useEffect(() => {
    if (!customConfirm.isOpen) return;
    return pushOverlay('coop-custom-confirm', () => setCustomConfirm(prev => ({ ...prev, isOpen: false })), zModalNested + 1);
  }, [customConfirm.isOpen, zModalNested]);

  useEffect(() => {
    if (!customPrompt.isOpen) return;
    return pushOverlay('coop-custom-prompt', () => setCustomPrompt(prev => ({ ...prev, isOpen: false })), zModalNested + 1);
  }, [customPrompt.isOpen, zModalNested]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    isDrawing.current = true;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (e.cancelable) {
      e.preventDefault();
    }

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    isDrawing.current = false;
  };

  const getPos = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();

    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const loadSupportingDocs = useCallback(async (contactId: number) => {
    modalDocsAbortRef.current?.abort();
    const controller = new AbortController();
    modalDocsAbortRef.current = controller;
    setModalDocs([]);
    setModalDeals([]);
    if (!contactId) return;
    try {
      const [resDocs, resDeposits] = await Promise.all([
        api.get(`/cloud-files`, { params: { contact_id: contactId, limit: 200 }, signal: controller.signal }).catch(() => ({ data: { data: { items: [] } } })),
        api.get(`/deposits`, { params: { contact_id: contactId }, signal: controller.signal }).catch(() => ({ data: { data: [] } })),
      ]);
      if (controller.signal.aborted) return;

      const docsData = extractArray<any>(resDocs?.data, 'items');
      const mappedDocs = docsData.map((d: any) => ({
        id: d.id,
        name: d.name,
        category: d.category || d.folder || 'general',
        folder: d.folder || d.category || 'general',
        path: d.file_path,
        isMilestoneAttachment: false
      }));

      const depositsData = extractArray<any>(resDeposits?.data, 'items');
      const depositsList = depositsData.map((d: any) => ({
        id: d.id,
        milestones: ensureArray<any>(d.milestones)
      }));

      setModalDocs(mappedDocs);
      setModalDeals(depositsList);
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
    }
  }, []);

  const handleOpenSignModal = useCallback(async (slip: CooperationSlip) => {
    setSigningSlip(slip);
    setIsSignModalOpen(true);
    await loadSupportingDocs(slip.contact_id);
  }, [loadSupportingDocs]);

  const toggleSlip = (id: number) => {
    setExpandedSlips(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const writeScope = useMemo(() => {
    const s1 = getModulePermissionScope(user, 'cooperation', 'write');
    const s2 = getModulePermissionScope(user, 'cooperations', 'write');
    if (s1 === 'all' || s2 === 'all') return 'all';
    if (s1 === 'team' || s2 === 'team') return 'team';
    if (s1 === 'own' || s2 === 'own') return 'own';
    return 'none';
  }, [user]);

  const readScope = useMemo(() => {
    const s1 = getModulePermissionScope(user, 'cooperation', 'read');
    const s2 = getModulePermissionScope(user, 'cooperations', 'read');
    if (s1 === 'all' || s2 === 'all') return 'all';
    if (s1 === 'team' || s2 === 'team') return 'team';
    if (s1 === 'own' || s2 === 'own') return 'own';
    return 'none';
  }, [user]);

  const isApprover = useMemo(() => {
    if (!user) return false;
    return (
      isExecutive(user) ||
      isManagement(user) ||
      isAccountant(user, false) ||
      hasModuleApprovalAccess(user, 'cooperation') ||
      writeScope === 'all'
    );
  }, [user, writeScope]);

  const isManager = useMemo(() => {
    return isApprover || writeScope === 'team';
  }, [isApprover, writeScope]);

  const teamMemberIds = useMemo(() => {
    const userTeamId = (user as any)?.team_id || (user as any)?.consultant_profile?.team_id;
    if (!userTeamId) return new Set<string>();
    return new Set(
      ensureArray<SalesAccount>(salesAccounts)
        .filter(a => String(a.team_id || '') === String(userTeamId))
        .map(a => String(a.id))
    );
  }, [user, salesAccounts]);

  const matchesScopeAndCommonFilters = useCallback((slip: CooperationSlip) => {
    // 0. Permission Matrix Read Scope
    if (readScope === 'none') return false;
    const shareholders = ensureArray<Shareholder>(slip?.shareholders);
    if (readScope === 'own') {
      const isShareholder = shareholders.some(s => String(s.user_id) === String(user?.id)) || String(slip.created_by) === String(user?.id);
      if (!isShareholder) return false;
    } else if (readScope === 'team') {
      const userTeamId = (user as any)?.team_id || (user as any)?.consultant_profile?.team_id;
      const isShareholder = shareholders.some(s => String(s.user_id) === String(user?.id)) || String(slip.created_by) === String(user?.id);
      const hasSlipTeamMatch = userTeamId && (slip as any).team_id !== undefined && (slip as any).team_id !== null
        ? Number((slip as any).team_id) === Number(userTeamId)
        : false;
      const hasMemberTeamMatch = teamMemberIds.size > 0
        ? (teamMemberIds.has(String(slip.created_by)) || shareholders.some(s => teamMemberIds.has(String(s.user_id))))
        : true; // Trust backend team-scoped GET /cooperation-slips if team_id metadata omitted
      if (!isShareholder && !hasSlipTeamMatch && !hasMemberTeamMatch) return false;
    }

    // 1. Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      const fullName = (slip.full_name || '').toLowerCase();
      const matchCust = fullName.includes(query) || (slip.phone && slip.phone.includes(query));
      const matchUnit = slip.unit_code && slip.unit_code.toLowerCase().includes(query);
      const matchProj = slip.project_name && slip.project_name.toLowerCase().includes(query);
      const matchId = String(slip.id).includes(query);
      if (!matchCust && !matchUnit && !matchProj && !matchId) return false;
    }

    // 2. Filter by Sale
    if (filterSale !== 'all') {
      const matchSale = shareholders.some(sh => String(sh.user_id) === filterSale) || String(slip.created_by) === filterSale;
      if (!matchSale) return false;
    }

    // 3. Filter by Date Range (safe against 0000-00-00)
    const slipDateStr = safeSliceDate(slip.created_at);
    if (slipDateStr && (slipDateStr < dateRange.from || slipDateStr > dateRange.to)) {
      return false;
    }

    return true;
  }, [readScope, user, teamMemberIds, searchQuery, filterSale, dateRange]);

  const filteredSlips = useMemo(() => {
    return ensureArray<CooperationSlip>(slips).filter(slip => {
      if (!matchesScopeAndCommonFilters(slip)) return false;

      if (statusFilter !== 'all') {
        const shareholders = ensureArray<Shareholder>(slip?.shareholders);
        const hasSigned = shareholders.find(s => String(s.user_id) === String(user?.id))?.signed;
        const isShareholder = shareholders.some(s => String(s.user_id) === String(user?.id));
        const allSigned = shareholders.length > 0 && shareholders.every(s => s.signed);
        const isPendingSignatures = (slip.status === 'pending_signatures' || slip.status === 'approved_pending_signatures') && !allSigned;

        if (statusFilter === 'pending_me') {
          const needsMySignature = isShareholder && isPendingSignatures && !hasSigned;
          const needsMyManagerApproval = isApprover && slip.status === 'pending_manager_approval';
          if (!needsMySignature && !needsMyManagerApproval) return false;
        } else if (statusFilter === 'pending_signatures') {
          if (!isPendingSignatures) return false;
        } else if (statusFilter === 'pending_manager') {
          if (slip.status !== 'pending_manager_approval') return false;
        } else if (statusFilter === 'approved') {
          if (slip.status !== 'approved') return false;
        } else if (statusFilter === 'rejected') {
          if (slip.status !== 'rejected') return false;
        }
      }

      return true;
    });
  }, [slips, matchesScopeAndCommonFilters, statusFilter, user?.id, isApprover]);

  const paginatedSlips = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredSlips.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredSlips, currentPage, ITEMS_PER_PAGE]);

  const totalPages = Math.ceil(filteredSlips.length / ITEMS_PER_PAGE);

  const statusCounts = useMemo(() => {
    let pendingMe = 0;
    let pendingSignatures = 0;
    let pendingManager = 0;
    let approved = 0;
    let rejected = 0;

    ensureArray<CooperationSlip>(slips).forEach(slip => {
      if (!matchesScopeAndCommonFilters(slip)) return;

      const shareholders = ensureArray<Shareholder>(slip?.shareholders);
      const hasSigned = shareholders.find(s => String(s.user_id) === String(user?.id))?.signed;
      const isShareholder = shareholders.some(s => String(s.user_id) === String(user?.id));
      const allSigned = shareholders.length > 0 && shareholders.every(s => s.signed);
      const isPendingSignatures = (slip.status === 'pending_signatures' || slip.status === 'approved_pending_signatures') && !allSigned;

      const needsMySignature = isShareholder && isPendingSignatures && !hasSigned;
      const needsMyManagerApproval = isApprover && slip.status === 'pending_manager_approval';

      if (needsMySignature || needsMyManagerApproval) pendingMe++;
      if (isPendingSignatures) pendingSignatures++;
      if (slip.status === 'pending_manager_approval') pendingManager++;
      if (slip.status === 'approved') approved++;
      if (slip.status === 'rejected') rejected++;
    });

    return {
      pending_me: pendingMe,
      pending_signatures: pendingSignatures,
      pending_manager: pendingManager,
      approved,
      rejected
    };
  }, [slips, matchesScopeAndCommonFilters, user?.id, isApprover]);

  const loadData = useCallback(async () => {
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const [resSlips, resUsers] = await Promise.all([
        fetchAPI('cooperation-slips', { signal: controller.signal }),
        fetchAPI('users?all=1', { signal: controller.signal }).catch(() => ({ success: false, data: [] })),
      ]);
      if (controller.signal.aborted) return;

      if (resSlips.success) {
        setSlips(ensureArray<CooperationSlip>(resSlips.data));
      } else {
        setError(resSlips.message || 'Lỗi tải danh sách phiếu hợp tác');
      }

      if (resUsers.success) {
        const allowedRoles = new Set(['sales', 'sale', 'team_lead', 'leader', 'manager', 'sale_admin', 'director']);
        const sales = extractArray<SalesAccount>(resUsers).filter((u: any) => allowedRoles.has(normalizeRole(u.role)));
        setSalesAccounts(sales);
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      setError(e.message || 'Lỗi kết nối');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
    return () => {
      loadAbortRef.current?.abort();
      modalDocsAbortRef.current?.abort();
    };
  }, [loadData]);

  const handleDeleteSlip = (slipId: number) => {
    setCustomConfirm({
      isOpen: true,
      title: 'Xác nhận xóa phiếu',
      message: 'Bạn có chắc chắn muốn xóa mềm phiếu hợp tác này khỏi danh sách đang xử lý không?',
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          const res = await fetchAPI(`cooperation-slips/${slipId}`, { method: 'DELETE' });
          if (res.success) {
            setSuccess('Đã xóa phiếu hợp tác thành công!');
            addToast('Đã xóa phiếu hợp tác thành công!', 'success');
            await loadData();
          } else {
            addToast(res.message || 'Lỗi khi xóa phiếu', 'error');
          }
        } catch (e: any) {
          addToast(e.message || 'Lỗi kết nối', 'error');
        } finally {
          inFlightRef.current = false;
        }
      }
    });
  };

  const handleCoopAttachmentUpload = async (slipId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFile = e.target.files?.[0];
    e.target.value = '';
    if (!rawFile || inFlightRef.current) return;

    if (BLOCKED_UPLOAD_RE.test(rawFile.name) || rawFile.type === 'image/svg+xml') {
      addToast('Định dạng tệp không được phép tải lên vì lý do bảo mật (SVG/HTML/Script).', 'warning');
      return;
    }
    if (rawFile.size > maxUploadMb * 1024 * 1024) {
      addToast(`Dung lượng tệp vượt quá giới hạn tối đa ${maxUploadMb}MB.`, 'warning');
      return;
    }

    inFlightRef.current = true;
    try {
      const file = SAFE_IMAGE_RE.test(rawFile.name) ? await compressToWebP(rawFile) : rawFile;
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetchAPI(`cooperation-slips/${slipId}/upload-attachment`, {
        method: 'POST',
        body: fd
      });
      if (res.success) {
        addToast('Đã tải lên tài liệu hợp tác thành công!', 'success');
        await loadData();
      } else {
        addToast(res.message || 'Lỗi khi tải lên tài liệu', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Lỗi khi tải lên tài liệu', 'error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleRemoveCoopAttachment = (slipId: number, fileUrl: string) => {
    showConfirm({
      title: 'Xóa tài liệu đính kèm',
      message: 'Bạn có chắc chắn muốn xóa tài liệu đính kèm này không?',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          const res = await fetchAPI(`cooperation-slips/${slipId}/delete-attachment`, {
            method: 'POST',
            body: JSON.stringify({ file_url: fileUrl })
          });
          if (res.success) {
            addToast('Đã xóa tài liệu hợp tác thành công!', 'success');
            await loadData();
          } else {
            addToast(res.message || 'Lỗi khi xóa tài liệu', 'error');
          }
        } catch (err: any) {
          addToast(err.message || 'Lỗi khi xóa tài liệu', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  const handleRenameCoopAttachment = (slipId: number, fileUrl: string) => {
    const filename = fileUrl.split('/').pop() || '';
    const cleanName = filename.substring(0, filename.lastIndexOf('.')) || filename;
    showConfirm({
      title: 'Đổi tên tài liệu hợp tác',
      message: 'Nhập tên mới cho tài liệu hợp tác:',
      requirePromptInput: true,
      promptPlaceholder: cleanName,
      confirmText: 'Lưu',
      cancelText: 'Hủy',
      onConfirm: async (newName) => {
        if (!newName || !newName.trim() || inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          const res = await fetchAPI(`cooperation-slips/${slipId}/rename-attachment`, {
            method: 'POST',
            body: JSON.stringify({ file_url: fileUrl, name: newName.trim() })
          });
          if (res.success) {
            addToast('Đã đổi tên tài liệu hợp tác thành công!', 'success');
            await loadData();
          } else {
            addToast(res.message || 'Lỗi khi đổi tên tài liệu', 'error');
          }
        } catch (err: any) {
          addToast(err.message || 'Lỗi khi đổi tên tài liệu', 'error');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const slipIdParam = searchParams.get('id') || searchParams.get('slip_id');
    if (slipIdParam && slips.length > 0) {
      const sid = Number(slipIdParam);
      if (sid) {
        setExpandedSlips(prev => ({ ...prev, [sid]: true }));
        setTimeout(() => {
          const element = document.getElementById(`coop-slip-row-${sid}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.style.boxShadow = '0 0 0 3px rgba(189, 29, 45, 0.2)';
            element.style.transition = 'all 0.5s ease';
            setTimeout(() => {
              element.style.boxShadow = '';
            }, 2500);

            const newParams = new URLSearchParams(location.search);
            newParams.delete('id');
            newParams.delete('slip_id');
            navigate(location.pathname + (newParams.toString() ? '?' + newParams.toString() : ''), { replace: true });
          }
        }, 400);
      }
    }
  }, [location.search, slips, location.pathname, navigate]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const signIdParam = searchParams.get('sign_id');
    if (signIdParam && slips.length > 0) {
      const match = slips.find((s: any) => String(s.id) === String(signIdParam));
      if (match) {
        setExpandedSlips(prev => ({ ...prev, [match.id]: true }));
        void handleOpenSignModal(match);

        const newParams = new URLSearchParams(location.search);
        newParams.delete('sign_id');
        navigate(location.pathname + (newParams.toString() ? '?' + newParams.toString() : ''), { replace: true });
      }
    }
  }, [location.search, slips, navigate, location.pathname, handleOpenSignModal]);

  const handleOpenUpdateShares = (slip: CooperationSlip) => {
    setSelectedSlipId(slip.id);
    const initialShares = ensureArray<Shareholder>(slip.shareholders).map(s => ({
      user_id: String(s.user_id),
      percentage: String(s.percentage)
    }));
    setSharesInput(initialShares);
    setUpdateExpectedCommission(Number(slip.expected_commission) || 0);
    setChangeReason('');
    setIsUpdateOpen(true);
  };

  const handleAddShareholderInput = () => {
    setSharesInput(prev => [...prev, { user_id: '', percentage: '0' }]);
  };

  const handleRemoveShareholderInput = (index: number) => {
    setSharesInput(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveShares = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlipId || inFlightRef.current) return;

    const sharesMap: Record<string, number> = {};
    let sum = 0;
    for (const item of sharesInput) {
      if (!item.user_id || item.percentage === '') {
        addToast('Vui lòng chọn nhân viên và nhập đầy đủ tỷ lệ', 'error');
        return;
      }
      if (sharesMap[item.user_id] !== undefined) {
        addToast('Nhân viên không được bị trùng lặp trong phiếu chia', 'error');
        return;
      }
      const val = parseInt(item.percentage, 10) || 0;
      if (val < 0 || val > 100) {
        addToast('Tỷ lệ mỗi thành viên phải nằm trong khoảng 0 - 100%', 'warning');
        return;
      }
      sharesMap[item.user_id] = val;
      sum += val;
    }

    if (sum !== 100) {
      addToast(`Tổng tỷ lệ chia sẻ hoa hồng phải bằng đúng 100% (Hiện tại là ${sum}%)`, 'error');
      return;
    }

    inFlightRef.current = true;
    try {
      const res = await fetchAPI(`cooperation-slips/${selectedSlipId}/shares`, {
        method: 'PUT',
        body: JSON.stringify({
          shares: sharesMap,
          expected_commission: updateExpectedCommission,
          reason: changeReason
        })
      });

      if (res.success) {
        addToast('Đã cập nhật cấu hình chia hoa hồng thành công!', 'success');
        setIsUpdateOpen(false);
        setChangeReason('');
        await loadData();
      } else {
        addToast(res.message || 'Lỗi cập nhật tỷ lệ', 'error');
      }
    } catch (e: any) {
      addToast(e.message || 'Lỗi kết nối', 'error');
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleSignSlip = async (slipId: number, signatureImg: string) => {
    if (inFlightRef.current || isSigning) return;
    inFlightRef.current = true;
    setIsSigning(true);
    try {
      const res = await fetchAPI(`cooperation-slips/${slipId}/sign`, {
        method: 'POST',
        body: JSON.stringify({ signature_img: signatureImg })
      });
      if (res.success) {
        addToast('Ký xác nhận phiếu hợp tác thành công!', 'success');
        setIsSignModalOpen(false);
        setSigningSlip(null);
        navigate(location.pathname, { replace: true });
        await loadData();
      } else {
        addToast(res.message || 'Lỗi ký xác nhận', 'error');
      }
    } catch (e: any) {
      addToast(e.message || 'Lỗi kết nối', 'error');
    } finally {
      inFlightRef.current = false;
      setIsSigning(false);
    }
  };

  const handleApproveSlip = async (slip: CooperationSlip) => {
    setApprovalSlip(slip);
    await loadSupportingDocs(slip.contact_id);
  };

  const handleRejectSlip = (slipId: number) => {
    setCustomPrompt({
      isOpen: true,
      title: 'Từ chối phiếu hợp tác',
      label: 'Nhập lý do bác bỏ phiếu hợp tác này:',
      value: '',
      onConfirm: async (reason: string) => {
        if (!reason.trim()) {
          addToast('Lý do từ chối không được bỏ trống.', 'warning');
          return;
        }
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          const res = await fetchAPI(`cooperation-slips/${slipId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason.trim() })
          });
          if (res.success) {
            addToast('Đã từ chối phiếu hợp tác và yêu cầu ký lại', 'success');
            setCustomPrompt(prev => ({ ...prev, isOpen: false }));
            await loadData();
            window.dispatchEvent(new Event('refresh-pending-counts'));
          } else {
            addToast(res.message || 'Lỗi từ chối', 'error');
          }
        } catch (e: any) {
          addToast(e.message || 'Lỗi kết nối', 'error');
        } finally {
          inFlightRef.current = false;
        }
      }
    });
  };

  const handleOpenRequestAdjustmentModal = (slip: any) => {
    setRequestAdjustmentSlip(slip);
    setRequestAdjustmentReason('');
    const baseComm = Number(slip.expected_commission) || Number(slip.expected_revenue) || 0;
    setReqExpectedCommission(baseComm);
    const sharesList = ensureArray<Shareholder>(slip.shareholders).map((sh: any) => ({
      user_id: String(sh.user_id),
      percentage: String(sh.percentage)
    }));
    setReqShares(sharesList.length > 0 ? sharesList : [{ user_id: String(user?.id || ''), percentage: '100' }]);
  };

  const handleConfirmRequestAdjustment = async () => {
    if (!requestAdjustmentSlip || inFlightRef.current || isSubmittingReq) return;
    if (!requestAdjustmentReason.trim()) {
      addToast('Vui lòng nhập lý do yêu cầu chỉnh sửa', 'warning');
      return;
    }

    const totalPct = reqShares.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
    if (totalPct !== 100) {
      addToast('Tổng tỷ lệ phân chia đề xuất phải bằng 100%', 'warning');
      return;
    }

    let formattedReason = `Đề xuất điều chỉnh hoa hồng:\n`;
    formattedReason += `- Hoa hồng dự kiến mới: ${reqExpectedCommission.toLocaleString('vi-VN')} VND\n`;
    formattedReason += `- Tỷ lệ phân chia mới đề xuất:\n`;
    reqShares.forEach(sh => {
      const uObj = salesAccounts.find(u => String(u.id) === String(sh.user_id));
      const uName = uObj ? uObj.full_name : `Nhân viên #${sh.user_id}`;
      formattedReason += `  + ${uName}: ${sh.percentage}%\n`;
    });
    formattedReason += `\nLý do yêu cầu: ${requestAdjustmentReason.trim()}`;

    inFlightRef.current = true;
    setIsSubmittingReq(true);
    try {
      const sharesMap: Record<string, number> = {};
      reqShares.forEach(sh => {
        if (sh.user_id) {
          sharesMap[sh.user_id] = Number(sh.percentage) || 0;
        }
      });
      const res = await fetchAPI(`cooperation-slips/${requestAdjustmentSlip.id}/request-adjustment`, {
        method: 'POST',
        body: JSON.stringify({
          reason: formattedReason,
          shares: sharesMap,
          expected_commission: reqExpectedCommission
        })
      });
      if (res.success) {
        addToast('Gửi yêu cầu chỉnh sửa tỷ lệ thành công!', 'success');
        setRequestAdjustmentSlip(null);
        await loadData();
      } else {
        addToast(res.message || 'Lỗi gửi yêu cầu', 'error');
      }
    } catch (e: any) {
      addToast(e.message || 'Lỗi kết nối', 'error');
    } finally {
      inFlightRef.current = false;
      setIsSubmittingReq(false);
    }
  };

  const handleOpenHandleRequestModal = (slip: any) => {
    setSelectedSlipForHandleRequest(slip);
    setHandleRequestNote('');
    setShowHandleRequestModal(true);
  };

  const handleResolveRequest = async (action: 'approve' | 'reject') => {
    if (!selectedSlipForHandleRequest || inFlightRef.current || isHandlingRequest) return;
    inFlightRef.current = true;
    setIsHandlingRequest(true);
    try {
      const res = await fetchAPI(`cooperation-slips/${selectedSlipForHandleRequest.id}/handle-adjustment`, {
        method: 'POST',
        body: JSON.stringify({ action, decision: action, note: handleRequestNote.trim() })
      });
      if (res.success) {
        addToast(action === 'approve' ? 'Đã duyệt yêu cầu chỉnh sửa và cập nhật phiếu!' : 'Đã từ chối yêu cầu chỉnh sửa!', 'success');
        setShowHandleRequestModal(false);
        await loadData();
        window.dispatchEvent(new Event('refresh-pending-counts'));
      } else {
        addToast(res.message || 'Lỗi xử lý yêu cầu', 'error');
      }
    } catch (e: any) {
      addToast(e.message || 'Lỗi kết nối', 'error');
    } finally {
      inFlightRef.current = false;
      setIsHandlingRequest(false);
    }
  };

  const handleExportCsv = () => {
    if (filteredSlips.length === 0) {
      addToast('Không có phiếu hợp tác nào khớp bộ lọc để xuất', 'warning');
      return;
    }
    const headers = ['Mã phiếu', 'Khách hàng', 'SĐT', 'Mã sản phẩm / Căn', 'Dự án / Chương trình', 'Thành viên chia & %', 'Hoa hồng dự kiến (VND)', 'Thực thu (VND)', 'Trạng thái', 'Người duyệt', 'Ngày tạo'];
    const rows = filteredSlips.map(s => {
      const baseComm = Number(s.expected_commission) || Number(s.expected_revenue) || 0;
      const baseActual = Number(s.actual_revenue) || 0;
      const pct = s.total_percentage !== undefined && s.total_percentage !== null ? Number(s.total_percentage) : 100;
      const shSummary = ensureArray<Shareholder>(s.shareholders).map(sh => `${sh.name} (${sh.percentage}%)`).join(' | ');
      return [
        csvSafe(`#${s.id}`),
        csvSafe(s.full_name || ''),
        csvSafe(s.phone || ''),
        csvSafe(s.unit_code || ''),
        csvSafe(s.project_name || ''),
        csvSafe(shSummary),
        csvSafe((baseComm * pct) / 100),
        csvSafe((baseActual * pct) / 100),
        csvSafe(s.status),
        csvSafe(s.approver?.name || '—'),
        csvSafe(formatDateVN(s.created_at) || '—'),
      ].join(',');
    });
    const csvContent = `\uFEFF${headers.map(csvSafe).join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `phieu-hop-tac-${getLocalDateStr()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast(`Đã xuất ${filteredSlips.length} phiếu hợp tác ra CSV`, 'success');
  };

  const org = config?.organization;
  const orgName = getTenantOrganizationName();
  const orgLogo = getTenantLogoUrl();

  return (
    <div className="page-container anim-fade-up" style={{ color: '#0F172A' }}>
      {/* Notifications */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', background: 'rgba(189, 29, 45, 0.08)', border: '1px solid rgba(189, 29, 45, 0.2)', color: '#BD1D2D', borderRadius: '10px', marginBottom: '12px' }}>
          <AlertCircle size={20} />
          <span>{error}</span>
          <button type="button" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setError('')}><X size={16} /></button>
        </div>
      )}
      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '1rem', background: 'rgba(15, 23, 42, 0.05)', border: '1px solid #CBD5E1', color: '#0F172A', borderRadius: '10px', marginBottom: '12px' }}>
          <Check size={20} />
          <span>{success}</span>
          <button type="button" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setSuccess('')}><X size={16} /></button>
        </div>
      )}

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Phiếu Hợp Tác &amp; Chữ Ký Số</h1>
          <p className="page-subtitle">
            Xác nhận tỷ lệ chia sẻ hoa hồng giữa các nhân sự hỗ trợ và ký số điện tử
            {coopPolicy?.default_split_note ? ` • ${coopPolicy.default_split_note}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="btn outline sm"
            onClick={handleExportCsv}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', height: '38px' }}
          >
            <Download size={15} />
            <span>Xuất CSV</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="coop-filter-bar-card">
        <div className="coop-filter-search-wrap">
          <Search size={16} className="coop-filter-search-icon" />
          <input
            type="text"
            placeholder="Tìm theo khách hàng, số điện thoại, mã sản phẩm, dự án..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="coop-filter-search-input"
          />
        </div>

        <div className="coop-filter-group">
          <div className="coop-filter-item">
            <PeriodFilter
              value={period}
              onChange={(p, r) => {
                setPeriod(p);
                setDateRange(r);
              }}
              style={{ width: '100%' }}
              buttonStyle={{ width: '100%', height: '38px', justifyContent: 'space-between', padding: '0 12px', fontSize: '0.8125rem' }}
            />
          </div>

          <div className="coop-filter-item">
            <CustomSelect
              value={statusFilter}
              onChange={val => setStatusFilter(String(val))}
              options={[
                { value: 'all', label: 'Tất cả trạng thái' },
                {
                  value: 'pending_me',
                  label: 'Chờ tôi duyệt / ký',
                  badge: { count: statusCounts.pending_me, color: '#BD1D2D' }
                },
                {
                  value: 'pending_signatures',
                  label: 'Chờ nhân viên ký',
                  badge: { count: statusCounts.pending_signatures, color: '#BD1D2D' }
                },
                isManager && {
                  value: 'pending_manager',
                  label: 'Chờ quản lý duyệt',
                  badge: { count: statusCounts.pending_manager, color: '#BD1D2D' }
                },
                { value: 'approved', label: 'Đã duyệt' },
                { value: 'rejected', label: 'Bác bỏ' }
              ].filter(Boolean) as any[]}
              size="sm"
            />
          </div>

          {isManager && (
            <div className="coop-filter-item coop-filter-item-sale">
              <CustomSelect
                value={filterSale}
                onChange={val => setFilterSale(String(val))}
                options={[
                  { value: 'all', label: 'Tất cả nhân viên' },
                  ...salesAccounts.map(u => ({ value: String(u.id), label: u.full_name, avatar: u.avatar }))
                ]}
                size="sm"
                showAvatars
                searchable
                align="right"
              />
            </div>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <CardSkeleton height={140} />
          <CardSkeleton height={140} />
          <CardSkeleton height={140} />
        </div>
      ) : filteredSlips.length === 0 ? (
        <EmptyCard
          icon={<FileText size={44} />}
          title="Không tìm thấy phiếu hợp tác phù hợp"
          description="Vui lòng thay đổi từ khóa hoặc bộ lọc thời gian/trạng thái để tìm lại."
        />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '620px', overflowY: 'auto', paddingRight: '6px' }}>
            {paginatedSlips.map(slip => {
              const shareholders = ensureArray<Shareholder>(slip.shareholders);
              const hasSigned = shareholders.find(s => String(s.user_id) === String(user?.id))?.signed;
              const isShareholder = shareholders.some(s => String(s.user_id) === String(user?.id));
              const allSigned = shareholders.length > 0 && shareholders.every(s => s.signed);
              const isPendingSignatures = (slip.status === 'pending_signatures' || slip.status === 'approved_pending_signatures') && !allSigned;
              const isExpanded = Boolean(expandedSlips[slip.id]);
              const baseComm = Number(slip.expected_commission) || Number(slip.expected_revenue) || 0;
              const baseActual = Number(slip.actual_revenue) || 0;
              const totalPercentage = slip.total_percentage !== undefined && slip.total_percentage !== null ? Number(slip.total_percentage) : 100;
              const totalComm = (baseComm * totalPercentage) / 100;
              const totalActual = (baseActual * totalPercentage) / 100;

              const statusColor = slip.status === 'approved' ? '#0F172A' : slip.status === 'rejected' ? '#BD1D2D' : '#334155';
              const statusBg = slip.status === 'approved' ? 'rgba(15, 23, 42, 0.06)' : slip.status === 'rejected' ? 'rgba(189, 29, 45, 0.08)' : '#F1F5F9';

              return (
                <div
                  key={slip.id}
                  id={`coop-slip-row-${slip.id}`}
                  className={`card animate-fade coop-slip-card ${slip.status === 'approved' ? 'status-approved' : (slip.status === 'rejected' ? 'status-rejected' : 'status-pending')}`}
                  style={{
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    cursor: 'pointer',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    background: '#FFFFFF',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                    flexShrink: 0
                  }}
                  onClick={() => toggleSlip(slip.id)}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="coop-slip-header-container">
                      <div className="coop-slip-header-left">
                        <div className="coop-slip-card-icon" style={{
                          padding: '10px',
                          background: slip.status === 'rejected' ? 'rgba(189, 29, 45, 0.08)' : 'rgba(15, 23, 42, 0.06)',
                          borderRadius: '10px',
                          color: slip.status === 'rejected' ? '#BD1D2D' : '#0F172A',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <FileText size={18} />
                        </div>

                        <div className="coop-slip-header-info">
                          <div className="coop-slip-header-info-row1">
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              color: '#BD1D2D',
                              background: 'rgba(189, 29, 45, 0.08)',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontFamily: 'monospace'
                            }}>
                              #{slip.id}
                            </span>
                            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <span>Mã: {slip.unit_code || '—'}</span>
                              {slip.unit_code && <CopyButton text={slip.unit_code} />}
                            </h3>
                            <span className="coop-dot" style={{ color: '#94A3B8', fontSize: '0.8rem' }}>•</span>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#475569' }}>
                              {slip.project_name || 'Chương trình khác'}
                            </span>
                          </div>

                          <div className="coop-slip-header-info-row2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '0.75rem', color: '#64748B' }}>Khách:</span>
                              <Avatar name={slip.full_name || ''} size={18} />
                              <span style={{ fontWeight: 700, fontSize: '0.75rem', color: '#0F172A' }}>
                                {slip.full_name}
                              </span>
                            </div>
                            {slip.status === 'approved' && slip.approver && (
                              <>
                                <span className="coop-dot" style={{ color: '#94A3B8', fontSize: '0.8rem' }}>•</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#334155', background: '#F8FAFC', padding: '2px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                  <span style={{ fontWeight: 600, color: '#0F172A' }}>Duyệt bởi:</span>
                                  <Avatar name={slip.approver.name} src={slip.approver.avatar || undefined} size={14} />
                                  <span style={{ fontWeight: 700, color: '#0F172A' }}>{slip.approver.name}</span>
                                  <span className="coop-approver-time">lúc {formatDateTimeVN(slip.approver.approved_at) || '—'}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="coop-slip-header-right" onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span
                            className="badge"
                            style={{
                              background: statusBg,
                              color: statusColor,
                              padding: '4px 10px',
                              borderRadius: '8px',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}
                          >
                            {isPendingSignatures ? 'Chờ ký'
                              : slip.status === 'approved' ? <><Check size={12} /> Đã duyệt</>
                              : slip.status === 'pending_manager_approval' ? 'Chờ quản lý duyệt'
                              : slip.status === 'rejected' ? <><X size={12} /> Bị bác bỏ</>
                              : slip.status}
                          </span>

                          {slip.status === 'approved' && isApprover && slip.adjustment_request && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenHandleRequestModal(slip);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                background: 'rgba(189, 29, 45, 0.08)',
                                color: '#BD1D2D',
                                border: '1px solid rgba(189, 29, 45, 0.25)',
                                padding: '4px 10px',
                                borderRadius: '8px',
                                fontSize: '0.725rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                              title="Click để xem chi tiết và xử lý yêu cầu chỉnh sửa"
                            >
                              <Avatar src={slip.adjustment_request.avatar || undefined} name={slip.adjustment_request.name} size="sm" />
                              <span style={{ whiteSpace: 'nowrap' }}>
                                Yêu cầu chỉnh sửa của {slip.adjustment_request.name} ({formatDateTimeVN(slip.adjustment_request.requested_at) || '—'})
                              </span>
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setPrintSlip(slip); }}
                            className="btn sm outline"
                            style={{ height: '28px', width: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderColor: 'transparent', background: 'transparent', color: '#475569' }}
                            title="Xem / In phiếu hợp tác"
                          >
                            <Printer size={13} />
                          </button>

                          {(isApprover || (String(slip.created_by) === String(user?.id) && (slip.status === 'pending_signatures' || slip.status === 'approved_pending_signatures'))) && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleDeleteSlip(slip.id); }}
                              className="btn sm outline"
                              style={{ height: '28px', width: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, borderColor: 'transparent', background: 'transparent', color: '#BD1D2D' }}
                              title="Xóa phiếu hợp tác"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}

                          <div style={{ color: '#64748B', display: 'flex', alignItems: 'center' }}>
                            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="coop-slip-bottom-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1, minWidth: '280px' }}>
                        <span style={{ fontSize: '0.725rem', color: '#64748B', fontWeight: 600 }}>Tỷ lệ chia:</span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          {shareholders.map((sh) => (
                            <div key={sh.user_id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '3px 10px', borderRadius: '20px', border: '1px solid #E2E8F0' }}>
                              <Avatar src={(sh as any).avatar} name={sh.name} size={16} />
                              <span style={{ fontSize: '0.725rem', fontWeight: 700, color: '#0F172A' }}>{sh.name}</span>
                              <span style={{ fontSize: '0.725rem', fontWeight: 800, color: '#BD1D2D' }}>{sh.percentage}%</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <span style={{ fontSize: '0.62rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>H.Hồng dự kiến</span>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                            {totalComm.toLocaleString('vi-VN')} <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>VND</span>
                          </span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <span style={{ fontSize: '0.62rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>Thực thu</span>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                            {totalActual.toLocaleString('vi-VN')} <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>VND</span>
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                        {(slip.status === 'pending_signatures' || slip.status === 'approved_pending_signatures') && (String(slip.created_by) === String(user?.id) || isApprover) && (
                          <button
                            type="button"
                            onClick={() => handleOpenUpdateShares(slip)}
                            style={{
                              height: '36px',
                              padding: '0 14px',
                              fontSize: '0.82rem',
                              borderRadius: '8px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              border: '1px solid #E2E8F0',
                              background: '#FFFFFF',
                              color: '#0F172A',
                            }}
                          >
                            Cấu hình chia %
                          </button>
                        )}

                        {isShareholder && !hasSigned && (slip.status === 'pending_signatures' || slip.status === 'approved_pending_signatures') && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleOpenSignModal(slip)}
                              style={{
                                height: '36px',
                                padding: '0 16px',
                                fontSize: '0.82rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: 'none',
                                background: '#BD1D2D',
                                color: '#fff',
                              }}
                            >
                              <PenTool size={14} /> Ký
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectSlip(slip.id)}
                              style={{
                                height: '36px',
                                padding: '0 14px',
                                fontSize: '0.82rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: '1px solid #BD1D2D',
                                background: 'transparent',
                                color: '#BD1D2D',
                              }}
                            >
                              Từ chối
                            </button>
                          </div>
                        )}

                        {slip.status === 'approved' && (isApprover || isShareholder || String(slip.created_by) === String(user?.id)) && (
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {isApprover ? (
                              <button
                                type="button"
                                onClick={() => handleOpenUpdateShares(slip)}
                                style={{
                                  height: '36px',
                                  padding: '0 14px',
                                  fontSize: '0.82rem',
                                  borderRadius: '8px',
                                  fontWeight: 600,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  cursor: 'pointer',
                                  border: '1px solid rgba(189, 29, 45, 0.35)',
                                  background: 'rgba(189, 29, 45, 0.06)',
                                  color: '#BD1D2D',
                                }}
                              >
                                Chỉnh sửa trực tiếp
                              </button>
                            ) : (
                              slip.adjustment_request ? (
                                <button
                                  type="button"
                                  disabled
                                  style={{
                                    height: '36px',
                                    padding: '0 14px',
                                    fontSize: '0.82rem',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: '1px dashed #CBD5E1',
                                    background: '#F8FAFC',
                                    color: '#64748B',
                                  }}
                                >
                                  Đang chờ duyệt yêu cầu chỉnh sửa...
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenRequestAdjustmentModal(slip)}
                                  className="coop-btn-request-edit"
                                  title="Gửi yêu cầu chỉnh sửa lại tỷ lệ chia hoa hồng"
                                >
                                  <PenTool size={12} /> Yêu cầu sửa tỷ lệ
                                </button>
                              )
                            )}
                          </div>
                        )}

                        {slip.status === 'pending_manager_approval' && (isApprover || isShareholder || String(slip.created_by) === String(user?.id)) && (
                          <button
                            type="button"
                            onClick={() => handleOpenUpdateShares(slip)}
                            style={{
                              height: '36px',
                              padding: '0 14px',
                              fontSize: '0.82rem',
                              borderRadius: '8px',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              border: '1px solid #E2E8F0',
                              background: '#FFFFFF',
                              color: '#0F172A',
                            }}
                          >
                            {isApprover ? 'Cập nhật tỷ lệ' : 'Yêu cầu thay đổi tỷ lệ'}
                          </button>
                        )}

                        {isApprover && slip.status === 'pending_manager_approval' && (
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => handleApproveSlip(slip)}
                              style={{
                                height: '36px',
                                padding: '0 14px',
                                fontSize: '0.82rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: 'none',
                                background: '#0F172A',
                                color: 'white',
                              }}
                            >
                              <CheckCircle size={14} /> Duyệt
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRejectSlip(slip.id)}
                              style={{
                                height: '36px',
                                padding: '0 14px',
                                fontSize: '0.82rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                borderRadius: '8px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                border: 'none',
                                background: '#BD1D2D',
                                color: 'white',
                              }}
                            >
                              <X size={14} /> Bác bỏ
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #E2E8F0' }}>
                      <div>
                        <h4 style={{ fontWeight: 700, fontSize: '0.825rem', marginBottom: '0.75rem', color: '#0F172A' }}>Tỷ lệ phân chia &amp; Chữ ký số nhân sự:</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                          {shareholders.map(sh => (
                            <div
                              key={sh.user_id}
                              className="card-panel"
                              style={{
                                padding: '0.75rem 1rem',
                                borderRadius: '10px',
                                background: sh.signed ? '#F8FAFC' : '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'space-between',
                                gap: '0.5rem'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <Avatar src={(sh as any).avatar} name={sh.name} size="md" />
                                  <div>
                                    <h5 style={{ fontWeight: 700, fontSize: '0.825rem', color: '#0F172A', margin: 0 }}>{sh.name}</h5>
                                    <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{sh.email}</span>
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#BD1D2D' }}>
                                    {sh.percentage}%
                                  </span>
                                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, marginTop: '2px' }}>
                                    Dự kiến: {((baseComm * sh.percentage) / 100).toLocaleString('vi-VN')} VND
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600, marginTop: '1px' }}>
                                    Thực tế: {((baseActual * sh.percentage) / 100).toLocaleString('vi-VN')} VND
                                  </div>
                                </div>
                              </div>

                              <div style={{ paddingTop: '6px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 700, color: sh.signed ? '#0F172A' : '#BD1D2D', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  {sh.signed ? '✓ Đã ký xác nhận' : '● Chờ ký'}
                                </span>
                                {sh.signed && (
                                  <span style={{ fontSize: '9px', color: '#64748B', textAlign: 'right' }}>
                                    IP: {sh.signature_ip}<br />
                                    Lúc: {formatDateTimeVN(sh.signature_time) || '—'}
                                  </span>
                                )}
                              </div>
                              {sh.signed && (sh as any).signature_img && (
                                <div style={{ marginTop: '8px', borderTop: '1px dashed #E2E8F0', paddingTop: '6px', textAlign: 'center' }}>
                                  <img
                                    src={resolveFileUrl((sh as any).signature_img)}
                                    style={{ height: '40px', objectFit: 'contain', display: 'inline-block' }}
                                    alt="Chữ ký"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Attachment preview */}
                      <div style={{ marginTop: '0.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1rem' }} onClick={e => e.stopPropagation()}>
                        <h4 style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Paperclip size={14} /> Tài liệu đính kèm:
                        </h4>
                        {slip.attachment_url ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {slip.attachment_url.split(',').map((rawUrl, urlIdx) => {
                              const url = rawUrl.trim();
                              if (!url) return null;
                              const fullUrl = resolveFileUrl(url);
                              const isImage = SAFE_IMAGE_RE.test(url);
                              const fileName = url.split('/').pop() || 'Tài liệu đính kèm';

                              if (isImage) {
                                return (
                                  <div key={urlIdx} style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    borderRadius: '12px',
                                    border: '1px solid #E2E8F0',
                                    background: '#FFFFFF',
                                    overflow: 'hidden',
                                    maxWidth: '380px',
                                  }}>
                                    <div style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      padding: '8px 12px',
                                      background: '#F8FAFC',
                                      borderBottom: '1px solid #E2E8F0'
                                    }}>
                                      <a
                                        href={fullUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', display: 'inline-flex', alignItems: 'center', gap: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}
                                        title={fileName}
                                      >
                                        <Paperclip size={13} color="#BD1D2D" />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{fileName}</span>
                                        <ExternalLink size={12} style={{ opacity: 0.6, flexShrink: 0 }} />
                                      </a>

                                      {isApprover && (
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                          <button
                                            type="button"
                                            className="btn sm outline"
                                            style={{ padding: '2px 8px', fontSize: '0.675rem', height: '24px', borderRadius: '4px' }}
                                            onClick={(e) => { e.stopPropagation(); handleRenameCoopAttachment(slip.id, url); }}
                                          >
                                            Đổi tên
                                          </button>
                                          <button
                                            type="button"
                                            className="btn sm outline"
                                            style={{ padding: '2px 8px', fontSize: '0.675rem', height: '24px', borderRadius: '4px', borderColor: '#BD1D2D', color: '#BD1D2D' }}
                                            onClick={(e) => { e.stopPropagation(); handleRemoveCoopAttachment(slip.id, url); }}
                                          >
                                            Xóa
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    <div
                                      onClick={(e) => { e.stopPropagation(); window.open(fullUrl, '_blank', 'noopener,noreferrer'); }}
                                      style={{
                                        padding: '10px',
                                        background: '#F8FAFC',
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        minHeight: '120px',
                                        maxHeight: '260px'
                                      }}
                                      title="Click để mở ảnh kích thước lớn"
                                    >
                                      <img
                                        src={fullUrl}
                                        alt={fileName}
                                        style={{
                                          maxWidth: '100%',
                                          maxHeight: '240px',
                                          objectFit: 'contain',
                                          borderRadius: '8px',
                                          border: '1px solid #E2E8F0',
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div key={urlIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', maxWidth: '500px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                    <FileText size={18} color="#BD1D2D" style={{ flexShrink: 0 }} />
                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                      <a
                                        href={fullUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style={{ fontSize: '0.75rem', fontWeight: 700, color: '#BD1D2D', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                      >
                                        {fileName}
                                      </a>
                                    </div>
                                  </div>
                                  {isApprover && (
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginLeft: '12px' }}>
                                      <button
                                        type="button"
                                        className="btn sm outline"
                                        style={{ padding: '4px 8px', fontSize: '0.7rem', height: '26px', borderRadius: '4px' }}
                                        onClick={(e) => { e.stopPropagation(); handleRenameCoopAttachment(slip.id, url); }}
                                      >
                                        Đổi tên
                                      </button>
                                      <button
                                        type="button"
                                        className="btn sm outline"
                                        style={{ padding: '4px 8px', fontSize: '0.7rem', height: '26px', borderRadius: '4px', borderColor: '#BD1D2D', color: '#BD1D2D' }}
                                        onClick={(e) => { e.stopPropagation(); handleRemoveCoopAttachment(slip.id, url); }}
                                      >
                                        Xóa
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {isApprover && (
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input
                                  type="file"
                                  id={`coop-attachment-upload-${slip.id}`}
                                  style={{ display: 'none' }}
                                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif"
                                  onChange={e => void handleCoopAttachmentUpload(slip.id, e)}
                                />
                                <label
                                  htmlFor={`coop-attachment-upload-${slip.id}`}
                                  className="btn sm outline"
                                  style={{ padding: '6px 12px', fontSize: '0.725rem', height: '30px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                >
                                  Tải lên thêm tài liệu
                                </label>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div>
                            <p style={{ fontSize: '0.75rem', color: '#64748B', marginBottom: '8px' }}>
                              Chưa có tài liệu đính kèm cho phiếu hợp tác này.
                            </p>
                            {isApprover && (
                              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input
                                  type="file"
                                  id={`coop-attachment-upload-${slip.id}`}
                                  style={{ display: 'none' }}
                                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp,.gif"
                                  onChange={e => void handleCoopAttachmentUpload(slip.id, e)}
                                />
                                <label
                                  htmlFor={`coop-attachment-upload-${slip.id}`}
                                  className="btn sm outline"
                                  style={{ padding: '6px 12px', fontSize: '0.725rem', height: '30px', borderRadius: '6px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}
                                >
                                  Tải lên tài liệu mới
                                </label>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {slip.status === 'rejected' && slip.dispute_details && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0.75rem 1rem', background: 'rgba(189, 29, 45, 0.08)', border: '1px solid rgba(189, 29, 45, 0.2)', color: '#BD1D2D', borderRadius: '8px', fontSize: '0.75rem' }}>
                          <ShieldAlert size={16} />
                          <span>Ý kiến phản hồi / Lý do từ chối: <strong>{slip.dispute_details}</strong>. Vui lòng cập nhật lại tỷ lệ chia sẻ và ký xác nhận lại.</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
              <Pagination
                total={filteredSlips.length}
                page={currentPage}
                pageSize={ITEMS_PER_PAGE}
                onChange={setCurrentPage}
              />
            </div>
          )}
        </>
      )}

      {/* Signature Modal */}
      {isSignModalOpen && signingSlip && createPortal(
        <div className="overlay-backdrop" style={{ position: 'fixed', inset: 0, zIndex: zModalNested, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', padding: '1rem' }}>
          <div className="card animate-fade" style={{ maxWidth: '800px', width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: '90vh', overflowY: 'auto', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Đọc tài liệu &amp; Ký xác nhận điện tử</h2>
              <button type="button" onClick={() => { setIsSignModalOpen(false); setSigningSlip(null); navigate(location.pathname, { replace: true }); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center' }}><X size={20} /></button>
            </div>

            <div>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: '#0F172A' }}>1. Đọc tài liệu đính kèm:</h3>
              {(() => {
                const modalAttachmentsList: { name: string; path: string }[] = [];
                const addedPaths = new Set<string>();

                if (signingSlip?.attachment_url) {
                  signingSlip.attachment_url.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((fileUrl: string) => {
                    if (!addedPaths.has(fileUrl)) {
                      addedPaths.add(fileUrl);
                      modalAttachmentsList.push({ name: fileUrl.split('/').pop() || 'Tài liệu hợp tác', path: fileUrl });
                    }
                  });
                }

                ensureArray<any>(modalDocs).forEach((d: any) => {
                  const p = d.path || d.file_path;
                  if (p && !addedPaths.has(p)) {
                    const cat = (d.category || d.folder || '').toLowerCase();
                    const nameLower = (d.name || '').toLowerCase();
                    if (cat.includes('cọc') || cat.includes('unc') || d.isMilestoneAttachment || nameLower.includes('unc') || p.toLowerCase().includes('deposits')) {
                      addedPaths.add(p);
                      modalAttachmentsList.push({ name: d.name || p.split('/').pop() || 'UNC Đặt cọc', path: p });
                    }
                  }
                });

                ensureArray<any>(modalDeals).forEach((dep: any) => {
                  ensureArray<any>(dep.milestones).forEach((m: any) => {
                    const fileUrl = m.unc_file_path || m.attachment_url;
                    if (fileUrl && !addedPaths.has(fileUrl)) {
                      addedPaths.add(fileUrl);
                      const filename = (() => {
                        const base = fileUrl.split('/').pop() || `${m.name || 'Cọc giữ chỗ'} - UNC.${fileUrl.split('.').pop() || 'png'}`;
                        try { return decodeURIComponent(base); } catch (_e) { return base; }
                      })();
                      modalAttachmentsList.push({ name: filename, path: fileUrl });
                    }
                  });
                });

                if (modalAttachmentsList.length > 0) {
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {modalAttachmentsList.map((item, urlIdx) => (
                        <div key={urlIdx} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                          <FileText size={22} style={{ color: '#BD1D2D' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '0.825rem', fontWeight: 700, margin: 0, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.name}
                            </p>
                            <a
                              href={resolveFileUrl(item.path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 600, textDecoration: 'underline', marginTop: '2px', display: 'inline-block' }}
                            >
                              Bấm để mở xem tài liệu ở tab mới ↗
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                }

                return (
                  <div style={{ padding: '1rem', textAlign: 'center', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#64748B', fontSize: '0.8125rem' }}>
                    Phiếu hợp tác này không đính kèm tệp tài liệu bổ sung. Vui lòng kiểm tra tỷ lệ phân chia bên dưới.
                  </div>
                );
              })()}
            </div>

            {/* Shares info recap */}
            <div style={{ padding: '12px 16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>Tỷ lệ phân chia của các thành viên:</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {ensureArray<Shareholder>(signingSlip.shareholders).map(sh => (
                  <div key={sh.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar src={(sh as any).avatar} name={sh.name} size="md" />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.875rem', color: '#0F172A' }}>{sh.name}</span>
                        <span style={{ fontSize: '0.725rem', color: '#64748B', marginTop: '2px' }}>
                          {numberToVietnameseWords(sh.percentage)}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                      {sh.percentage}%
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {user?.signature_url ? (
              <div style={{
                background: 'rgba(189, 29, 45, 0.05)',
                border: '1px solid rgba(189, 29, 45, 0.2)',
                borderRadius: '12px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', minWidth: '240px' }}>
                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '4px 8px', maxHeight: '45px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                    <img src={resolveFileUrl(user.signature_url)} alt="Chữ ký mẫu" style={{ maxHeight: '35px', objectFit: 'contain' }} />
                  </div>
                  <div style={{ flex: '1' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.3 }}>{t('Chữ ký mẫu đã lưu của bạn')}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px', lineHeight: 1.3 }}>{t('Điền chữ ký cá nhân chính chủ chỉ với 1-click')}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleSignSlip(signingSlip.id, user.signature_url!)}
                  disabled={isSigning}
                  style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#BD1D2D', color: 'white', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Zap size={15} />
                  {t('Dùng chữ ký của tôi')}
                </button>
              </div>
            ) : (
              <div style={{
                background: '#F8FAFC',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px'
              }}>
                <span style={{ fontSize: '0.8rem', color: '#64748B' }}>{t('Bạn chưa cài đặt chữ ký mẫu cá nhân.')}</span>
                <button
                  type="button"
                  onClick={() => setShowQuickSignatureModal(true)}
                  style={{ background: 'none', border: 'none', color: '#BD1D2D', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <Edit3 size={13} />
                  {t('Tạo chữ ký mẫu ngay')}
                </button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '10px', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
                <button
                  type="button"
                  className={`btn sm ${signatureMethod === 'draw' ? 'primary' : 'outline'}`}
                  style={{ flex: 1, height: '36px', fontSize: '0.8125rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => setSignatureMethod('draw')}
                >
                  <PenTool size={14} /> Vẽ chữ ký tay
                </button>
                <button
                  type="button"
                  className={`btn sm ${signatureMethod === 'upload' ? 'primary' : 'outline'}`}
                  style={{ flex: 1, height: '36px', fontSize: '0.8125rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  onClick={() => setSignatureMethod('upload')}
                >
                  <Paperclip size={14} /> Tải file ảnh chữ ký
                </button>
              </div>

              {signatureMethod === 'draw' ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>2. Vẽ chữ ký của bạn lên khung dưới đây:</h3>
                    <button type="button" onClick={clearCanvas} style={{ fontSize: '0.75rem', color: '#BD1D2D', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>Xóa vẽ lại</button>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={750}
                    height={220}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{
                      border: '2px dashed #CBD5E1',
                      borderRadius: '8px',
                      background: '#F8FAFC',
                      cursor: 'crosshair',
                      display: 'block',
                      touchAction: 'none',
                      width: '100%',
                      height: '220px'
                    }}
                  />
                </div>
              ) : (
                <div>
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.5rem', color: '#0F172A' }}>2. Chọn file ảnh chữ ký (PNG/JPG/WebP):</h3>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (BLOCKED_UPLOAD_RE.test(file.name) || file.type === 'image/svg+xml') {
                        addToast('Không chấp nhận file SVG/HTML làm ảnh chữ ký', 'warning');
                        e.target.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        setUploadedSignatureImg(event.target?.result as string);
                      };
                      reader.readAsDataURL(file);
                    }}
                    style={{ display: 'block', width: '100%', padding: '10px', border: '1px solid #CBD5E1', borderRadius: '6px', background: '#F8FAFC', fontSize: '0.8125rem', cursor: 'pointer' }}
                  />
                  {uploadedSignatureImg && (
                    <div style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '8px', background: '#FFFFFF', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <img src={uploadedSignatureImg} alt="Preview Chữ ký" style={{ maxHeight: '150px', objectFit: 'contain' }} />
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ position: 'sticky', bottom: 0, background: '#FFFFFF', paddingTop: '12px', paddingBottom: '4px', marginTop: '12px', borderTop: '1px solid #E2E8F0', zIndex: 20 }}>
              <button
                type="button"
                onClick={() => {
                  if (isSigning) return;
                  if (signatureMethod === 'upload') {
                    if (!uploadedSignatureImg) {
                      addToast('Vui lòng tải file ảnh chữ ký của bạn lên trước khi bấm xác nhận.', 'warning');
                      return;
                    }
                    void handleSignSlip(signingSlip.id, uploadedSignatureImg);
                  } else {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) return;
                    const buffer = new Uint32Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
                    const isBlank = !buffer.some(color => color !== 0);
                    if (isBlank) {
                      addToast('Vui lòng vẽ chữ ký của bạn trước khi bấm xác nhận.', 'warning');
                      return;
                    }
                    const signatureImg = canvas.toDataURL('image/png');
                    void handleSignSlip(signingSlip.id, signatureImg);
                  }
                }}
                disabled={isSigning}
                className="btn primary w-full"
                style={{ height: '48px', fontSize: '1rem', fontWeight: 800, opacity: isSigning ? 0.7 : 1, cursor: isSigning ? 'not-allowed' : 'pointer', background: '#BD1D2D', borderColor: '#BD1D2D', borderRadius: '10px', color: '#FFFFFF' }}
              >
                {isSigning ? 'Đang xử lý chữ ký số...' : 'Tôi đồng ý và Ký xác nhận'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Approval Details Modal */}
      {approvalSlip && createPortal(
        <div className="overlay-backdrop" style={{ position: 'fixed', inset: 0, zIndex: zModalNested, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', padding: '1.5rem' }}>
          <div className="card animate-fade" style={{ maxWidth: '640px', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 24px 48px -12px rgba(15, 23, 42, 0.2)', background: '#FFFFFF', position: 'relative' }}>
            <button
              type="button"
              onClick={() => !isApproving && setApprovalSlip(null)}
              style={{ position: 'absolute', top: '20px', right: '20px', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#64748B', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '12px', borderBottom: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D' }}>
                <CheckCircle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Xác nhận duyệt hoa hồng</h3>
                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, display: 'block', marginTop: '2px' }}>PHIẾU HỢP TÁC ID: #{approvalSlip.id}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px 20px', background: '#F8FAFC', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                <div>
                  <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>MÃ SẢN PHẨM / HỒ SƠ</span>
                  <span style={{ fontSize: '0.925rem', fontWeight: 800, color: '#BD1D2D' }}>{approvalSlip.unit_code || '—'}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>DỰ ÁN / CHƯƠNG TRÌNH</span>
                  <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0F172A' }}>{approvalSlip.project_name || 'Chương trình khác'}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>KHÁCH HÀNG</span>
                  <span style={{ fontSize: '0.925rem', fontWeight: 700, color: '#0F172A' }}>{approvalSlip.full_name}</span>
                </div>
                <div>
                  <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>TRẠNG THÁI</span>
                  <span style={{ display: 'inline-block', fontSize: '0.725rem', padding: '4px 10px', borderRadius: '8px', fontWeight: 700, background: '#F1F5F9', color: '#334155', width: 'fit-content' }}>Chờ duyệt</span>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '0.725rem', fontWeight: 700, color: '#64748B', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', borderLeft: '3px solid #BD1D2D', paddingLeft: '8px' }}>
                  Tỷ lệ chia sẻ &amp; Doanh thu hoa hồng
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '14px', padding: '16px 20px' }}>
                    <div>
                      <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', fontWeight: 700, marginBottom: '4px' }}>H.HỒNG DỰ KIẾN ({approvalSlip.total_percentage ?? 100}%)</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                        {((Number(approvalSlip.expected_commission || approvalSlip.expected_revenue || 0) * (approvalSlip.total_percentage ?? 100)) / 100).toLocaleString('vi-VN')} <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B' }}>VND</span>
                      </span>
                    </div>
                    <div style={{ borderLeft: '1px solid #E2E8F0', paddingLeft: '16px' }}>
                      <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', fontWeight: 700, marginBottom: '4px' }}>THỰC THU ({approvalSlip.total_percentage ?? 100}%)</span>
                      <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                        {((Number(approvalSlip.actual_revenue || 0) * (approvalSlip.total_percentage ?? 100)) / 100).toLocaleString('vi-VN')} <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#BD1D2D' }}>VND</span>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ensureArray<Shareholder>(approvalSlip.shareholders).map((sh) => (
                      <div key={sh.user_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FFFFFF', padding: '12px 16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Avatar src={(sh as any).avatar} name={sh.name} size={32} />
                          <div>
                            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0F172A', display: 'block' }}>{sh.name}</span>
                            <span style={{ fontSize: '0.675rem', color: '#64748B', display: 'block' }}>{sh.email}</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          {sh.signed && (sh as any).signature_img && (
                            <img src={resolveFileUrl((sh as any).signature_img)} style={{ height: '32px', objectFit: 'contain', background: '#F8FAFC', padding: '2px 6px', borderRadius: '6px', border: '1px dashed #CBD5E1' }} alt="Chữ ký" />
                          )}

                          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#BD1D2D' }}>{sh.percentage}%</span>
                            {!sh.signed && (
                              <span style={{ fontSize: '0.7rem', color: '#BD1D2D', background: 'rgba(189, 29, 45, 0.08)', padding: '2px 8px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 700, marginTop: '4px' }}>
                                ✗ Chưa ký
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Documents & Files */}
              {(() => {
                const modalAttachmentsList: { name: string; path: string }[] = [];
                const addedPaths = new Set<string>();

                if (approvalSlip?.attachment_url) {
                  approvalSlip.attachment_url.split(',').map((s: string) => s.trim()).filter(Boolean).forEach((fileUrl: string) => {
                    if (!addedPaths.has(fileUrl)) {
                      addedPaths.add(fileUrl);
                      modalAttachmentsList.push({ name: fileUrl.split('/').pop() || 'Tài liệu hợp tác', path: fileUrl });
                    }
                  });
                }
                ensureArray<any>(modalDocs).forEach((d: any) => {
                  const p = d.path || d.file_path;
                  if (p && !addedPaths.has(p)) {
                    const cat = (d.category || d.folder || '').toLowerCase();
                    const nameLower = (d.name || '').toLowerCase();
                    if (cat.includes('cọc') || cat.includes('unc') || d.isMilestoneAttachment || nameLower.includes('unc') || p.toLowerCase().includes('deposits')) {
                      addedPaths.add(p);
                      modalAttachmentsList.push({ name: d.name || p.split('/').pop() || 'UNC Đặt cọc', path: p });
                    }
                  }
                });
                ensureArray<any>(modalDeals).forEach((dep: any) => {
                  ensureArray<any>(dep.milestones).forEach((m: any) => {
                    const fileUrl = m.unc_file_path || m.attachment_url;
                    if (fileUrl && !addedPaths.has(fileUrl)) {
                      addedPaths.add(fileUrl);
                      const filename = (() => {
                        const base = fileUrl.split('/').pop() || `${m.name || 'Cọc'} - UNC.${fileUrl.split('.').pop() || 'png'}`;
                        try { return decodeURIComponent(base); } catch (_e) { return base; }
                      })();
                      modalAttachmentsList.push({ name: filename, path: fileUrl });
                    }
                  });
                });

                return (
                  <div>
                    <h4 style={{ fontSize: '0.725rem', fontWeight: 700, color: '#64748B', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em', borderLeft: '3px solid #BD1D2D', paddingLeft: '8px' }}>
                      Tài liệu đính kèm ({modalAttachmentsList.length})
                    </h4>
                    {modalAttachmentsList.length > 0 ? (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                        {modalAttachmentsList.map((file, index) => {
                          const downloadUrl = resolveFileUrl(file.path);
                          const isImage = SAFE_IMAGE_RE.test(file.path);
                          return (
                            <div
                              key={index}
                              style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', cursor: 'pointer' }}
                              onClick={() => window.open(downloadUrl, '_blank', 'noopener,noreferrer')}
                            >
                              {isImage ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E2E8F0', background: '#ffffff', flexShrink: 0 }}>
                                  <img src={downloadUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                              ) : (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', flexShrink: 0 }}>
                                  <FileText size={18} />
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                                <span style={{ fontSize: '0.675rem', color: '#64748B', marginTop: '2px' }}>Bấm để mở xem tài liệu ↗</span>
                              </div>
                              <ExternalLink size={14} color="#64748B" style={{ flexShrink: 0 }} />
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '20px', border: '1px dashed #CBD5E1', borderRadius: '12px', color: '#64748B', fontSize: '0.75rem', background: '#F8FAFC' }}>
                        Không có tệp đính kèm nào.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '0.5rem', borderTop: '1px solid #E2E8F0', paddingTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setApprovalSlip(null)}
                className="btn outline"
                style={{ flex: 1, height: '44px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                disabled={isApproving}
              >
                <X size={18} /> Hủy bỏ
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (inFlightRef.current || isApproving) return;
                  inFlightRef.current = true;
                  setIsApproving(true);
                  try {
                    const res = await fetchAPI(`cooperation-slips/${approvalSlip.id}/approve`, { method: 'POST' });
                    if (res.success) {
                      addToast('Phê duyệt phiếu hoa hồng thành công!', 'success');
                      setApprovalSlip(null);
                      await loadData();
                      window.dispatchEvent(new Event('refresh-pending-counts'));
                    } else {
                      addToast(res.message || 'Lỗi phê duyệt', 'error');
                    }
                  } catch (e: any) {
                    addToast(e.message || 'Lỗi kết nối', 'error');
                  } finally {
                    inFlightRef.current = false;
                    setIsApproving(false);
                  }
                }}
                className="btn"
                style={{ flex: 2, height: '44px', borderRadius: '10px', fontSize: '0.9rem', fontWeight: 700, background: '#0F172A', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}
                disabled={isApproving}
              >
                {isApproving ? <><Loader2 size={18} className="animate-spin" /> Đang xử lý...</> : <><Check size={18} /> Xác nhận &amp; Phê duyệt</>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom Confirm Modal */}
      {customConfirm.isOpen && createPortal(
        <div className="overlay-backdrop" style={{ position: 'fixed', inset: 0, zIndex: zModalNested + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)', padding: '1rem' }}>
          <div className="card animate-fade" style={{ maxWidth: '400px', width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>{customConfirm.title}</h3>
            <p style={{ fontSize: '0.875rem', color: '#475569', margin: 0 }}>{customConfirm.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button type="button" onClick={() => setCustomConfirm(prev => ({ ...prev, isOpen: false }))} className="btn outline sm" style={{ height: '36px', padding: '0 16px' }}>Hủy bỏ</button>
              <button
                type="button"
                onClick={async () => {
                  await customConfirm.onConfirm();
                  setCustomConfirm(prev => ({ ...prev, isOpen: false }));
                }}
                className="btn primary sm"
                style={{ height: '36px', padding: '0 16px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF' }}
              >
                Đồng ý
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom Prompt Modal */}
      {customPrompt.isOpen && createPortal(
        <div className="overlay-backdrop" style={{ position: 'fixed', inset: 0, zIndex: zModalNested + 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)', padding: '1rem' }}>
          <div className="card animate-fade" style={{ maxWidth: '440px', width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>{customPrompt.title}</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569' }}>{customPrompt.label}</label>
              <textarea
                value={customPrompt.value}
                onChange={e => setCustomPrompt(prev => ({ ...prev, value: e.target.value }))}
                placeholder="Nhập lý do tại đây..."
                rows={3}
                autoFocus
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#F8FAFC', color: '#0F172A', fontSize: '0.875rem' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button type="button" onClick={() => setCustomPrompt(prev => ({ ...prev, isOpen: false }))} className="btn outline sm" style={{ height: '36px', padding: '0 16px' }}>Hủy bỏ</button>
              <button
                type="button"
                onClick={() => void customPrompt.onConfirm(customPrompt.value)}
                className="btn primary sm"
                style={{ height: '36px', padding: '0 16px', background: '#BD1D2D', border: 'none', color: 'white' }}
              >
                Xác nhận từ chối
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Yêu cầu chỉnh sửa tỷ lệ hoa hồng Modal */}
      {requestAdjustmentSlip && createPortal(
        <div className="overlay-backdrop" style={{ position: 'fixed', inset: 0, zIndex: zModalNested, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)', padding: window.innerWidth <= 768 ? '0.75rem 0.75rem 80px 0.75rem' : '1rem' }}>
          <div className="card animate-fade" style={{ maxWidth: '540px', width: '100%', padding: window.innerWidth <= 768 ? '1.25rem' : '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxHeight: window.innerWidth <= 768 ? '72vh' : '88vh', overflowY: 'auto', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0', boxSizing: 'border-box' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Yêu cầu chỉnh sửa tỷ lệ hoa hồng</h3>
              <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '0.375rem', marginBottom: 0, lineHeight: 1.5 }}>
                Đề xuất các thay đổi về số tiền hoa hồng hoặc tỷ lệ phân chia của các thành viên để Ban quản lý phê duyệt.
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoa hồng dự kiến đề xuất (VND)</label>
              {requestAdjustmentSlip.expected_revenue && (
                <div style={{ fontSize: '0.8rem', fontWeight: 500, color: '#64748B', display: 'flex', gap: '4px', marginTop: '-2px', marginBottom: '2px' }}>
                  <span>Doanh thu dự kiến hiện tại:</span>
                  <span style={{ fontWeight: 700, color: '#BD1D2D' }}>{Number(requestAdjustmentSlip.expected_revenue).toLocaleString('vi-VN')} VND</span>
                </div>
              )}
              <CurrencyInput
                value={reqExpectedCommission}
                onChange={(val) => setReqExpectedCommission(val || 0)}
                className="form-input"
                style={{ width: '100%', height: '42px', fontSize: '0.9rem', borderRadius: '10px', fontWeight: 600 }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tỷ lệ phân chia đề xuất</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#F8FAFC', padding: '14px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                {reqShares.map((item, idx) => {
                  const uObj = salesAccounts.find(u => String(u.id) === String(item.user_id));
                  const uName = uObj ? uObj.full_name : `Nhân viên #${item.user_id}`;
                  const uAvatar = uObj?.avatar || null;
                  return (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Avatar src={uAvatar || undefined} name={uName} size="md" />
                        <div>
                          <h5 style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem', color: '#0F172A' }}>{uName}</h5>
                          <span style={{ fontSize: '0.725rem', color: '#64748B' }}>Nhân viên kinh doanh</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={item.percentage}
                          onChange={e => {
                            const val = e.target.value;
                            const numVal = Math.min(100, Math.max(0, parseInt(val, 10) || 0));
                            const oppositeVal = String(100 - numVal);
                            setReqShares(prev => {
                              if (prev.length === 2) {
                                return prev.map((valObj, i) => i === idx ? { ...valObj, percentage: val === '' ? '' : String(numVal) } : { ...valObj, percentage: oppositeVal });
                              }
                              return prev.map((valObj, i) => (i === idx ? { ...valObj, percentage: val } : valObj));
                            });
                          }}
                          className="form-input"
                          style={{ width: '70px', height: '36px', textAlign: 'center', fontWeight: 800, fontSize: '0.9rem', borderRadius: '8px' }}
                        />
                        <span style={{ fontWeight: 800, fontSize: '0.9rem', color: '#64748B' }}>%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(() => {
                const totalPct = reqShares.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
                if (totalPct !== 100) {
                  return (
                    <span style={{ fontSize: '0.75rem', color: '#BD1D2D', fontWeight: 700 }}>
                      * Tổng tỷ lệ phải bằng đúng 100% (Hiện tại: {totalPct}%)
                    </span>
                  );
                }
                return null;
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lý do chỉnh sửa *</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Nhập lý do chi tiết..."
                value={requestAdjustmentReason}
                onChange={(e) => setRequestAdjustmentReason(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', fontSize: '0.875rem', resize: 'none', borderRadius: '10px', lineHeight: 1.5 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '1rem', marginTop: '0.25rem', position: 'sticky', bottom: 0, background: '#FFFFFF', zIndex: 10 }}>
              <button type="button" className="btn outline" onClick={() => setRequestAdjustmentSlip(null)} disabled={isSubmittingReq} style={{ height: '40px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 600, padding: '0 18px' }}>Hủy</button>
              <button type="button" className="btn primary" onClick={handleConfirmRequestAdjustment} disabled={isSubmittingReq} style={{ background: '#BD1D2D', color: 'white', border: 'none', height: '40px', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 700, padding: '0 20px' }}>
                {isSubmittingReq ? 'Đang gửi...' : 'Gửi yêu cầu'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Xử lý yêu cầu chỉnh sửa từ Sale Modal (dành cho Admin/Manager) */}
      {showHandleRequestModal && selectedSlipForHandleRequest && createPortal(
        <div className="overlay-backdrop" style={{ position: 'fixed', inset: 0, zIndex: zModalNested, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)', padding: '1rem' }}>
          <div className="card animate-fade" style={{ maxWidth: '500px', width: '100%', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Xử lý yêu cầu chỉnh sửa tỷ lệ</h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <Avatar src={selectedSlipForHandleRequest.adjustment_request.avatar} name={selectedSlipForHandleRequest.adjustment_request.name} size="md" />
              <div>
                <h5 style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem', color: '#0F172A' }}>{selectedSlipForHandleRequest.adjustment_request.name}</h5>
                <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                  Gửi lúc: {formatDateTimeVN(selectedSlipForHandleRequest.adjustment_request.requested_at) || '—'}
                </span>
              </div>
            </div>

            {selectedSlipForHandleRequest.adjustment_request?.shares && selectedSlipForHandleRequest.adjustment_request.shares.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {selectedSlipForHandleRequest.adjustment_request.expected_commission !== null && selectedSlipForHandleRequest.adjustment_request.expected_commission !== undefined && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.725rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Hoa hồng đề xuất mới:</span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#BD1D2D' }}>
                      {Number(selectedSlipForHandleRequest.adjustment_request.expected_commission).toLocaleString('vi-VN')} VND
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '0.725rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Tỷ lệ phân chia đề xuất:</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: '#F8FAFC', padding: '12px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                    {selectedSlipForHandleRequest.adjustment_request.shares.map((sh: any, idx: number) => {
                      const uObj = salesAccounts.find(u => String(u.id) === String(sh.user_id));
                      const uName = uObj ? uObj.full_name : `Nhân viên #${sh.user_id}`;
                      return (
                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <Avatar src={uObj?.avatar} name={uName} size="sm" />
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0F172A' }}>{uName}</span>
                          </div>
                          <span style={{ fontWeight: 800, fontSize: '0.875rem', color: '#BD1D2D' }}>{sh.percentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '0.725rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Lý do yêu cầu:</span>
                  <div style={{ padding: '10px 14px', background: 'rgba(189, 29, 45, 0.04)', border: '1px dashed rgba(189, 29, 45, 0.2)', borderRadius: '10px', fontSize: '0.85rem', color: '#0F172A', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
                    {(() => {
                      const rawReason = selectedSlipForHandleRequest.adjustment_request.reason || '';
                      const parts = rawReason.split('Lý do yêu cầu:');
                      return parts.length > 1 ? parts[1].trim() : rawReason;
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Nội dung đề xuất &amp; Lý do:</span>
                <div style={{ margin: 0, fontSize: '0.85rem', padding: '12px', background: 'rgba(189, 29, 45, 0.04)', border: '1px dashed rgba(189, 29, 45, 0.2)', borderRadius: '8px', color: '#0F172A', whiteSpace: 'pre-wrap', maxHeight: '180px', overflowY: 'auto' }}>
                  {selectedSlipForHandleRequest.adjustment_request.reason}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Ghi chú phản hồi từ quản lý (Không bắt buộc)</label>
              <textarea
                value={handleRequestNote}
                onChange={e => setHandleRequestNote(e.target.value)}
                placeholder="Nhập ghi chú phản hồi..."
                className="form-input"
                rows={3}
                style={{ resize: 'none', fontSize: '0.85rem', width: '100%', padding: '8px 12px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '1rem', marginTop: '0.25rem' }}>
              <button type="button" className="btn outline" onClick={() => setShowHandleRequestModal(false)} disabled={isHandlingRequest}>Hủy</button>
              <button
                type="button"
                className="btn danger"
                onClick={() => void handleResolveRequest('reject')}
                disabled={isHandlingRequest}
                style={{ background: '#BD1D2D', color: 'white', border: 'none' }}
              >
                {isHandlingRequest ? 'Đang xử lý...' : 'Từ chối'}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => void handleResolveRequest('approve')}
                disabled={isHandlingRequest}
                style={{ background: '#0F172A', color: 'white', border: 'none' }}
              >
                {isHandlingRequest ? 'Đang duyệt...' : 'Duyệt yêu cầu'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Configuration Modal */}
      {isUpdateOpen && createPortal(
        <div className="overlay-backdrop" style={{ position: 'fixed', inset: 0, zIndex: zModalNested, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(4px)', padding: '1rem' }}>
          <div className="card" style={{ maxWidth: '560px', width: '100%', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '92vh', overflowY: 'auto', borderRadius: '16px', background: '#FFFFFF', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #E2E8F0', paddingBottom: '0.75rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>Cấu hình phân chia tỷ lệ (%)</h3>
                <p style={{ fontSize: '0.825rem', color: '#64748B', marginTop: '0.375rem', marginBottom: 0, lineHeight: 1.5 }}>
                  Chỉnh sửa trực tiếp hoa hồng và tỷ lệ. Sau khi lưu, phiếu sẽ được cập nhật và yêu cầu các bên liên quan ký xác nhận lại.
                </p>
              </div>
              <button type="button" onClick={() => setIsUpdateOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', padding: '4px' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleSaveShares} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hoa hồng dự kiến (VND)</label>
                <CurrencyInput
                  value={updateExpectedCommission}
                  onChange={(val) => setUpdateExpectedCommission(val || 0)}
                  className="form-input"
                  style={{ width: '100%', height: '42px', fontSize: '0.9rem', borderRadius: '10px', fontWeight: 600 }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Thành viên &amp; Tỷ lệ (%)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: '#F8FAFC', padding: '16px', borderRadius: '14px', border: '1px solid #E2E8F0' }}>
                  {sharesInput.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', padding: '10px 14px', background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                      <div style={{ flex: 1, pointerEvents: idx === 0 ? 'none' : 'auto', opacity: idx === 0 ? 0.85 : 1 }}>
                        <CustomSelect
                          value={item.user_id}
                          onChange={val =>
                            setSharesInput(prev =>
                              prev.map((valObj, i) => (i === idx ? { ...valObj, user_id: String(val) } : valObj))
                            )
                          }
                          options={[
                            { value: '', label: '-- Chọn nhân viên --' },
                            ...salesAccounts
                              .filter(s => {
                                if (String(s.id) === String(item.user_id)) return true;
                                if (idx === 0) return true;
                                if (String(s.id) === String(user?.id)) return false;
                                const creatorId = sharesInput[0]?.user_id;
                                const creatorObj = salesAccounts.find(u => String(u.id) === String(creatorId));
                                if (creatorObj && creatorObj.team_id && String(s.team_id) === String(creatorObj.team_id)) {
                                  return false;
                                }
                                if (sharesInput.some((other, otherIdx) => otherIdx !== idx && String(other.user_id) === String(s.id))) {
                                  return false;
                                }
                                return true;
                              })
                              .map(s => ({ value: String(s.id), label: s.full_name, avatar: s.avatar }))
                          ]}
                          size="sm"
                          showAvatars
                          searchable
                        />
                      </div>
                      <input
                        type="number"
                        required
                        min="0"
                        max="100"
                        placeholder="%"
                        value={item.percentage}
                        onChange={e => {
                          const parsed = parseInt(e.target.value, 10) || 0;
                          if (sharesInput.length === 2) {
                            const numVal = Math.min(100, Math.max(0, parsed));
                            const oppositeVal = String(100 - numVal);
                            setSharesInput(prev =>
                              prev.map((valObj, i) => i === idx
                                ? { ...valObj, percentage: e.target.value === '' ? '' : String(numVal) }
                                : { ...valObj, percentage: oppositeVal }
                              )
                            );
                            return;
                          }
                          const otherSum = sharesInput.reduce((acc, val, i) => i === idx ? acc : acc + (parseInt(val.percentage, 10) || 0), 0);
                          const maxAllowed = Math.max(0, 100 - otherSum);
                          const finalVal = Math.min(maxAllowed, Math.max(0, parsed));
                          const valStr = e.target.value === '' ? '' : String(finalVal);
                          setSharesInput(prev => prev.map((val, i) => (i === idx ? { ...val, percentage: valStr } : val)));
                        }}
                        className="form-input"
                        style={{ fontSize: '0.9rem', padding: '8px 12px', width: '80px', height: '38px', borderRadius: '8px', textAlign: 'center', fontWeight: 600 }}
                      />
                      {sharesInput.length > 1 && (
                        <button type="button" onClick={() => handleRemoveShareholderInput(idx)} style={{ padding: '6px', background: 'none', border: 'none', color: '#BD1D2D', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid #E2E8F0' }}>
                    <button type="button" onClick={handleAddShareholderInput} style={{ fontSize: '0.8rem', color: '#BD1D2D', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                      <UserPlus size={14} /> Thêm nhân viên hỗ trợ
                    </button>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#475569' }}>
                      Tổng: {sharesInput.reduce((acc, s) => acc + (parseInt(s.percentage, 10) || 0), 0)}% / 100%
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lý do thay đổi / Yêu cầu điều chỉnh</label>
                <textarea
                  placeholder="VD: Điều chỉnh thêm nhân sự hỗ trợ hoặc sửa tỷ lệ..."
                  value={changeReason}
                  onChange={e => setChangeReason(e.target.value)}
                  className="form-input"
                  style={{ width: '100%', padding: '10px 14px', fontSize: '0.875rem', resize: 'none', borderRadius: '10px', lineHeight: 1.5, height: '80px' }}
                  required
                />
              </div>

              <button
                type="submit"
                className="btn primary w-full"
                style={{ background: '#BD1D2D', color: 'white', border: 'none', height: '46px', borderRadius: '12px', fontSize: '0.9rem', fontWeight: 700, padding: '0 20px', cursor: 'pointer', marginTop: '0.25rem' }}
              >
                Lưu và gửi chữ ký lại
              </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Printable Cooperation Slip Summary Modal */}
      {printSlip && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: zModalNested, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={() => setPrintSlip(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '760px', maxHeight: '90vh', background: '#FFFFFF', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 25px 60px rgba(15, 23, 42, 0.25)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            <div className="no-print" style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Printer size={18} style={{ color: '#BD1D2D' }} />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>Bản in Phiếu Hợp Tác — #{printSlip.id}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button type="button" className="btn primary sm" style={{ background: '#BD1D2D', borderColor: '#BD1D2D', color: '#FFFFFF', display: 'inline-flex', alignItems: 'center', gap: '6px' }} onClick={() => window.print()}>
                  <Printer size={14} /> In / Lưu PDF
                </button>
                <button type="button" className="btn-icon sm" onClick={() => setPrintSlip(null)}><X size={18} /></button>
              </div>
            </div>

            <div style={{ padding: '28px 32px', overflowY: 'auto', background: '#FFFFFF', color: '#0F172A' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #BD1D2D', paddingBottom: '16px', marginBottom: '20px', gap: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {orgLogo && <img src={orgLogo} alt={orgName} style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: '8px' }} />}
                  <div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>{orgName}</div>
                    {org?.address && <div style={{ fontSize: '0.75rem', color: '#475569' }}>{org.address}</div>}
                    {org?.tax_id && <div style={{ fontSize: '0.75rem', color: '#475569' }}>MST: {org.tax_id}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#BD1D2D' }}>PHIẾU HỢP TÁC CHIA HOA HỒNG</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, fontFamily: 'monospace' }}>Phiếu #{printSlip.id} • Phiên bản v{printSlip.version || 1}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>Ngày tạo: {formatDateVN(printSlip.created_at) || '—'}</div>
                </div>
              </div>

              <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', marginBottom: '18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.82rem' }}>
                <div><span style={{ color: '#64748B' }}>Khách hàng: </span><strong>{printSlip.full_name}</strong>{printSlip.phone ? ` (${printSlip.phone})` : ''}</div>
                <div><span style={{ color: '#64748B' }}>Mã sản phẩm / Hồ sơ: </span><strong>{printSlip.unit_code || '—'}</strong></div>
                <div><span style={{ color: '#64748B' }}>Dự án / Chương trình: </span><strong>{printSlip.project_name || '—'}</strong></div>
                <div><span style={{ color: '#64748B' }}>Hoa hồng dự kiến: </span><strong style={{ color: '#BD1D2D' }}>{(Number(printSlip.expected_commission || printSlip.expected_revenue || 0) * ((printSlip.total_percentage ?? 100) / 100)).toLocaleString('vi-VN')} đ</strong></div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #CBD5E1' }}>
                    <th style={{ padding: '8px', textAlign: 'left' }}>Thành viên thụ hưởng</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '80px' }}>Tỷ lệ</th>
                    <th style={{ padding: '8px', textAlign: 'right', width: '140px' }}>Dự kiến (VND)</th>
                    <th style={{ padding: '8px', textAlign: 'center', width: '160px' }}>Xác nhận ký số</th>
                  </tr>
                </thead>
                <tbody>
                  {ensureArray<Shareholder>(printSlip.shareholders).map((sh) => {
                    const base = Number(printSlip.expected_commission || printSlip.expected_revenue || 0);
                    return (
                      <tr key={sh.user_id} style={{ borderBottom: '1px solid #E2E8F0' }}>
                        <td style={{ padding: '8px', fontWeight: 600 }}>{sh.name}</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontWeight: 700, color: '#BD1D2D' }}>{sh.percentage}%</td>
                        <td style={{ padding: '8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{((base * sh.percentage) / 100).toLocaleString('vi-VN')} đ</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontSize: '0.75rem' }}>
                          {sh.signed ? (
                            <div>
                              {(sh as any).signature_img && <img src={resolveFileUrl((sh as any).signature_img)} alt="Chữ ký" style={{ height: '32px', objectFit: 'contain', margin: '0 auto 2px' }} />}
                              <div>Đã ký ({formatDateTimeVN(sh.signature_time) || '—'})</div>
                            </div>
                          ) : 'Chờ ký'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {printSlip.approver && (
                <div style={{ borderTop: '1px dashed #CBD5E1', paddingTop: '12px', textAlign: 'right', fontSize: '0.8rem', color: '#475569' }}>
                  Phê duyệt bởi: <strong style={{ color: '#0F172A' }}>{printSlip.approver.name}</strong> ({formatDateTimeVN(printSlip.approver.approved_at) || '—'})
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Single Signature Setup Modal */}
      {showQuickSignatureModal && (
        <SignaturePadModal
          isOpen={showQuickSignatureModal}
          onClose={() => setShowQuickSignatureModal(false)}
          onSave={async (newSigUrl) => {
            const res = await fetchAPI('update_profile', {
              method: 'POST',
              body: JSON.stringify({ signature_url: newSigUrl })
            });
            if (res.success) {
              updateUser({ signature_url: newSigUrl });
              if (signingSlip) {
                await handleSignSlip(signingSlip.id, newSigUrl);
              }
            } else {
              throw new Error(res.message || t('Lỗi lưu chữ ký'));
            }
          }}
          initialSignatureUrl={user?.signature_url}
        />
      )}
    </div>
  );
};
