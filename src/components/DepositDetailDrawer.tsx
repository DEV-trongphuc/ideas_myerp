import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, ChevronLeft, Plus, Trash2, Upload, AlertCircle, Loader2, Clock, Activity,
  CreditCard, Wallet, Edit, Check, Ban, Send, FileText, MessageSquare, Bell, Printer
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUIStore } from '../store/uiStore';
import { CustomSelect } from './ui/CustomSelect';
import { CurrencyInput } from './ui/CurrencyInput';
import { Avatar } from './ui/Avatar';
import { MentionInput } from './ui/MentionInput';
import { CustomModal } from './ui/CustomModal';
import { ConfirmModal } from './ui/ConfirmModal';
import { compressToWebP } from '../utils/imageCompress';
import { fetchAPI } from '../utils/api';
import { useLanguage } from '../contexts/LanguageContext';
import { numberToVietnameseText } from '../utils/numberToText';
import { VietnameseDateInput } from './ui/VietnameseDateInput';
import { formatCommentBody } from '../utils/commentFormatter';
import { pushOverlay } from '../utils/overlayStack';
import { getTenantBrandPrefix, useTenantConfig } from '../contexts/TenantConfigContext';
import { useTypedSetting } from '../contexts/SettingsBootstrapContext';
import { isAccountant, isManagement, isExecutive, isMarketing } from '../utils/roleUtils';
import { getLocalDateStr, formatDateVN } from '../utils/dateUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import { ResponsiveActionGroup } from './ui/MobileResponsiveTabs';
import { sanitizeHtml, escapeHtml } from '../utils/sanitizeHtml';

interface DepositDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  deposit: any;
  onSaveSuccess: () => void;
  zIndex?: number;
}

export const DepositDetailDrawer: React.FC<DepositDetailDrawerProps> = ({
  isOpen,
  onClose,
  deposit,
  onSaveSuccess,
  zIndex
}) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { config, hasPermission } = useTenantConfig();
  const addToast = useUIStore((s) => s.addToast);
  const showConfirm = useUIStore((s) => s.showConfirm);

  const uploadPolicy = useTypedSetting<{ max_mb?: number; forbidden_exts?: string[] }>('core.upload_security_policy', {
    max_mb: 50,
    forbidden_exts: ['svg', 'html', 'htm', 'php', 'exe', 'js']
  });
  const overlayUi = useTypedSetting<{
    drawer_ms?: number;
    z_backdrop?: number;
    z_drawer?: number;
    z_modal_nested?: number;
  }>('ui.overlay_zindex_and_motion_ms', {
    drawer_ms: 220,
    z_backdrop: 2147483620,
    z_drawer: 2147483625,
    z_modal_nested: 2147483646
  });
  const fxConfig = useTypedSetting<{ supported?: string[]; rates_to_vnd?: Record<string, number> }>('finance.currency_and_fx_rates', {
    supported: ['VND', 'USD', 'EUR', 'CHF'],
    rates_to_vnd: { VND: 1, USD: 25400, EUR: 30000, CHF: 32000 }
  });

  const drawerMotionMs = Math.max(120, Number(overlayUi.drawer_ms || 220));
  const drawerMotionSec = drawerMotionMs / 1000;
  const defaultPanelZ = Number(overlayUi.z_drawer || 2147483625);
  const panelZ = Math.min(Math.max(zIndex ?? defaultPanelZ, defaultPanelZ), 2147483644);
  const backdropZ = zIndex ? Math.max(panelZ - 2, 2147483620) : Number(overlayUi.z_backdrop || 2147483620);
  const modalNestedZ = Math.min(Math.max(panelZ + 2, Number(overlayUi.z_modal_nested || 2147483646)), 2147483647);
  const maxUploadMb = Math.max(1, Number(uploadPolicy.max_mb || 50));

  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const [activeDrawerTab, setActiveDrawerTab] = useState<'comments' | 'history'>('comments');
  const [mobileDrawerTab, setMobileDrawerTab] = useState<'info' | 'discussion'>('info');

  const [selectedDepForManage, setSelectedDepForManage] = useState<any>(deposit);
  const [tempMilestones, setTempMilestones] = useState<any[]>(ensureArray(deposit?.milestones));
  const [baselineFingerprint, setBaselineFingerprint] = useState<string>('');
  const [showDirtyCloseConfirm, setShowDirtyCloseConfirm] = useState(false);

  const [isSavingMilestones, setIsSavingMilestones] = useState(false);
  const [actioningMilestoneId, setActioningMilestoneId] = useState<any>(null);
  const [actioningType, setActioningType] = useState<'approve' | 'reject' | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);
  const [previewReminderMilestone, setPreviewReminderMilestone] = useState<any | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const commentEndRef = useRef<HTMLDivElement>(null);
  const commentsContainerRef = useRef<HTMLDivElement>(null);
  const approveInFlightRef = useRef(false);

  const [sharesData, setSharesData] = useState<any[]>([]);
  const [tempExpectedCommission, setTempExpectedCommission] = useState<number>(deposit?.expected_commission || 0);
  const [tempSharesData, setTempSharesData] = useState<any[]>([]);
  const [isEditingCommission, setIsEditingCommission] = useState(false);

  const [autoRemindManage, setAutoRemindManage] = useState(deposit ? Number(deposit.auto_remind) === 1 : false);
  const [remindDaysBeforeManage, setRemindDaysBeforeManage] = useState(deposit ? Number(deposit.remind_days_before) || 3 : 3);
  const [remindAtHourManage, setRemindAtHourManage] = useState(deposit ? Number(deposit.remind_at_hour) || 8 : 8);
  const [remindTargetManage, setRemindTargetManage] = useState(deposit ? Number(deposit.remind_target) || 2 : 2);
  const [manualRemindTarget, setManualRemindTarget] = useState<number>(2);

  // Edit SO modal states (Accountant & Admin)
  const [isEditSOOpen, setIsEditSOOpen] = useState(false);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [editUnitCode, setEditUnitCode] = useState('');
  const [editPrice, setEditPrice] = useState<number>(0);
  const [editCurrency, setEditCurrency] = useState('VND');
  const [editExchangeRate, setEditExchangeRate] = useState<number>(1);
  const [editCreatedBy, setEditCreatedBy] = useState('');
  const [editExpectedCommissionVal, setEditExpectedCommissionVal] = useState<number>(0);
  const [editNotes, setEditNotes] = useState('');
  const [isSavingSOInfo, setIsSavingSOInfo] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<any[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);

  // Related Users (Watchers) states
  const [showAddWatcherDropdown, setShowAddWatcherDropdown] = useState(false);
  const [savingWatchers, setSavingWatchers] = useState(false);
  const [watcherSearch, setWatcherSearch] = useState('');
  const addWatcherDropdownRef = useRef<HTMLDivElement>(null);

  const buildFingerprint = React.useCallback((
    ms: any[],
    comm: number,
    sh: any[],
    autoRem: boolean,
    daysBefore: number,
    atHour: number,
    target: number
  ) => JSON.stringify({
    ms: ensureArray(ms).map(m => ({
      id: m.id || null,
      milestone_name: m.milestone_name || '',
      expected_amount: Number(m.expected_amount) || 0,
      original_amount: m.original_amount ?? null,
      expected_pay_date: m.expected_pay_date ? String(m.expected_pay_date).substring(0, 10) : ''
    })),
    comm: Number(comm) || 0,
    sh: ensureArray(sh).map(s => ({ user_id: s.user_id, percentage: Number(s.percentage) || 0 })),
    autoRem: Boolean(autoRem),
    daysBefore: Number(daysBefore) || 3,
    atHour: Number(atHour) || 8,
    target: Number(target) || 2
  }), []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addWatcherDropdownRef.current && !addWatcherDropdownRef.current.contains(e.target as Node)) {
        setShowAddWatcherDropdown(false);
      }
    };
    if (showAddWatcherDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showAddWatcherDropdown]);

  useEffect(() => {
    if (!isOpen || availableUsers.length > 0) return;
    const controller = new AbortController();
    fetchAPI('users', { signal: controller.signal }).then(res => {
      if (controller.signal.aborted) return;
      const uList = res.data?.users || res.data || (Array.isArray(res) ? res : []);
      if (Array.isArray(uList)) setAvailableUsers(uList);
    }).catch(err => {
      if (err?.name !== 'AbortError' && err?.code !== 'ERR_CANCELED') {
        console.error("Error loading users in DepositDetailDrawer:", err);
      }
    });
    return () => controller.abort();
  }, [isOpen, availableUsers.length]);

  const updateWatchersInFlightRef = useRef(false);
  const handleUpdateWatchers = async (newIds: number[]) => {
    if (!selectedDepForManage?.id) return;
    if (updateWatchersInFlightRef.current) return;
    updateWatchersInFlightRef.current = true;
    setSavingWatchers(true);
    try {
      const res = await fetchAPI('hrm/approvals/update-related-users', {
        method: 'POST',
        body: JSON.stringify({
          type: 'deposit',
          id: selectedDepForManage.id,
          related_user_ids: newIds
        })
      });
      if (res.success || res.status === 'success') {
        setSelectedDepForManage((prev: any) => ({
          ...(prev || {}),
          related_user_ids: newIds
        }));
        addToast(t('Đã cập nhật danh sách người theo dõi'), 'success');
        onSaveSuccess?.();
      } else {
        addToast(res.message || t('Lỗi khi cập nhật người theo dõi'), 'error');
      }
    } catch (err: any) {
      addToast(err?.message || t('Lỗi khi cập nhật người theo dõi'), 'error');
    } finally {
      updateWatchersInFlightRef.current = false;
      setSavingWatchers(false);
    }
  };

  // Cancel transaction states
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const isAdmin = Boolean(user && (isManagement(user) || isAccountant(user, true) || hasPermission('deposits', 'approve')));
  const canApproveMilestone = Boolean(user && (isExecutive(user) || isAccountant(user, true) || hasPermission('deposits', 'approve')));
  const canEditExpectedCommission = Boolean(user && (isManagement(user) || isAccountant(user, true) || hasPermission('deposits', 'approve')));
  const canEditAllSOInfo = Boolean(user && (isManagement(user) || isAccountant(user, true) || hasPermission('deposits', 'approve')));
  const canEditMilestones = Boolean(
    (isAdmin || (selectedDepForManage && (
      String(selectedDepForManage.created_by) === String(user?.id) ||
      String(selectedDepForManage.contact_owner_id) === String(user?.id)
    ))) && hasPermission('deposits', 'write')
  );

  const editSoAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      if (editSoAbortRef.current) editSoAbortRef.current.abort();
    };
  }, []);

  const handleOpenEditSO = async () => {
    if (!selectedDepForManage) return;
    setEditFullName(selectedDepForManage.full_name || selectedDepForManage.client_name || selectedDepForManage.contact_name || '');
    setEditPhone(selectedDepForManage.phone || '');
    setEditEmail(selectedDepForManage.email || '');
    setEditProjectId(String(selectedDepForManage.project_id || ''));
    setEditUnitCode(selectedDepForManage.unit_code || '');
    setEditPrice(Number(selectedDepForManage.price) || 0);
    setEditCurrency(selectedDepForManage.currency || 'VND');
    setEditExchangeRate(Number(selectedDepForManage.exchange_rate) || 1);
    setEditCreatedBy(String(selectedDepForManage.created_by || ''));
    setEditExpectedCommissionVal(Number(selectedDepForManage.expected_commission) || 0);
    setEditNotes(selectedDepForManage.notes || '');

    if (editSoAbortRef.current) editSoAbortRef.current.abort();
    const ctrl = new AbortController();
    editSoAbortRef.current = ctrl;

    if (availableProjects.length === 0) {
      try {
        const pRes = await fetchAPI('projects', { signal: ctrl.signal });
        if (!ctrl.signal.aborted) {
          setAvailableProjects(extractArray(pRes));
        }
      } catch {}
    }
    if (availableUsers.length === 0) {
      try {
        const uRes = await fetchAPI('users', { signal: ctrl.signal });
        if (!ctrl.signal.aborted) {
          setAvailableUsers(extractArray(uRes));
        }
      } catch {}
    }

    if (!ctrl.signal.aborted) {
      setIsEditSOOpen(true);
    }
  };

  const saveSOInfoInFlightRef = useRef(false);
  const handleSaveSOInfo = async () => {
    if (!selectedDepForManage?.id) return;
    if (saveSOInfoInFlightRef.current) return;
    if (!editFullName.trim()) {
      addToast('Tên khách hàng không được để trống.', 'error');
      return;
    }
    if (!editProjectId) {
      addToast('Vui lòng chọn chương trình.', 'error');
      return;
    }
    if (!Number.isFinite(editPrice) || editPrice <= 0) {
      addToast('Tổng doanh thu dự kiến phải lớn hơn 0.', 'error');
      return;
    }
    if (!Number.isFinite(editExpectedCommissionVal) || editExpectedCommissionVal < 0) {
      addToast('Hoa hồng dự kiến không hợp lệ.', 'error');
      return;
    }
    if (editCurrency !== 'VND' && (!Number.isFinite(editExchangeRate) || editExchangeRate <= 0)) {
      addToast('Tỷ giá quy đổi phải lớn hơn 0.', 'error');
      return;
    }

    saveSOInfoInFlightRef.current = true;
    setIsSavingSOInfo(true);
    try {
      const payload = {
        full_name: editFullName.trim(),
        contact_name: editFullName.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
        project_id: Number(editProjectId),
        unit_code: editUnitCode.trim(),
        price: editPrice,
        currency: editCurrency,
        exchange_rate: editCurrency === 'VND' ? 1 : editExchangeRate,
        created_by: editCreatedBy ? Number(editCreatedBy) : selectedDepForManage.created_by,
        expected_commission: editExpectedCommissionVal,
        notes: editNotes.trim()
      };
      const res = await fetchAPI(`deposits/${selectedDepForManage.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (res.success) {
        addToast('Cập nhật thông tin đơn hàng thành công.', 'success');
        const projName = availableProjects.find(p => String(p.id) === String(editProjectId))?.name || selectedDepForManage.project_name;
        const selectedCreator = availableUsers.find(u => String(u.id) === String(editCreatedBy));
        const creatorName = selectedCreator?.full_name || selectedCreator?.name || selectedDepForManage.creator_name;

        setSelectedDepForManage((prev: any) => ({
          ...prev,
          full_name: editFullName.trim(),
          phone: editPhone.trim(),
          email: editEmail.trim(),
          project_id: Number(editProjectId),
          project_name: projName,
          unit_code: editUnitCode.trim(),
          price: editPrice,
          currency: editCurrency,
          exchange_rate: editCurrency === 'VND' ? 1 : editExchangeRate,
          created_by: editCreatedBy ? Number(editCreatedBy) : prev?.created_by,
          creator_name: creatorName,
          expected_commission: editExpectedCommissionVal,
          notes: editNotes.trim()
        }));
        setIsEditSOOpen(false);
        onSaveSuccess();
        loadHistory();
      } else {
        addToast(res.message || 'Lỗi cập nhật thông tin đơn hàng', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Lỗi kết nối', 'error');
    } finally {
      saveSOInfoInFlightRef.current = false;
      setIsSavingSOInfo(false);
    }
  };

  // Initialize and load dependencies when deposit changes
  useEffect(() => {
    if (!deposit) return;
    const controller = new AbortController();
    const { signal } = controller;

    const initialMs = ensureArray(deposit.milestones).map((m: any) => ({ ...m }));
    const initComm = Number(deposit.expected_commission) || 0;
    const initAutoRem = Number(deposit.auto_remind) === 1;
    const initDays = Number(deposit.remind_days_before) || 3;
    const initHour = Number(deposit.remind_at_hour) || 8;
    const initTarget = Number(deposit.remind_target) || 2;

    setSelectedDepForManage(deposit);
    setTempMilestones(initialMs);
    setSharesData([]);
    setTempExpectedCommission(initComm);
    setTempSharesData([]);
    setIsEditingCommission(false);
    setAutoRemindManage(initAutoRem);
    setRemindDaysBeforeManage(initDays);
    setRemindAtHourManage(initHour);
    setRemindTargetManage(initTarget);
    setBaselineFingerprint(buildFingerprint(initialMs, initComm, [], initAutoRem, initDays, initHour, initTarget));
    setComments([]);
    setHistoryLogs([]);
    setNewCommentText('');
    setIsEditSOOpen(false);
    setIsCancelOpen(false);
    setPreviewReminderMilestone(null);
    setShowDirtyCloseConfirm(false);

    // Fetch customer details if email is missing
    if (!deposit.email && deposit.contact_id) {
      fetchAPI(`contacts/${deposit.contact_id}`, { signal })
        .then(res => {
          if (signal.aborted) return;
          const c = res.data || res;
          if (c && c.email) {
            setSelectedDepForManage((prev: any) => prev ? { ...prev, email: c.email } : null);
          }
        })
        .catch(err => {
          if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
          console.error("Error fetching contact email:", err);
        });
    }

    // Load co-op shares
    fetchAPI(`cooperation-slips?contact_id=${deposit.contact_id}`, { signal })
      .then(res => {
        if (signal.aborted) return;
        const slips = extractArray(res);
        if (slips.length > 0) {
          const matchedSlip = slips.find((s: any) => Number(s.deposit_slip_id) === Number(deposit.id));
          const shList = ensureArray(matchedSlip?.shareholders);
          if (shList.length > 0) {
            const mappedSh = shList.map((sh: any) => ({ ...sh }));
            setSharesData(shList);
            setTempSharesData(mappedSh);
            setBaselineFingerprint(buildFingerprint(initialMs, initComm, mappedSh, initAutoRem, initDays, initHour, initTarget));
          }
        }
      })
      .catch(err => {
        if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
        console.error("Error loading cooperation shares:", err);
      });

    return () => {
      controller.abort();
    };
  }, [deposit, buildFingerprint]);

  const commentsAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => {
      if (commentsAbortRef.current) commentsAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
    };
  }, []);

  // Load comments and history when open
  const loadComments = async (isInitial = false) => {
    if (!selectedDepForManage?.id) return;
    if (commentsAbortRef.current) commentsAbortRef.current.abort();
    const controller = new AbortController();
    commentsAbortRef.current = controller;
    const { signal } = controller;

    setLoadingComments(true);
    try {
      const res = await fetchAPI(`deposits/${selectedDepForManage.id}/comments`, { signal });
      if (signal.aborted) return;
      if (res.success) {
        const commentsList = extractArray(res);
        setComments(commentsList);
        const searchParams = new URLSearchParams(window.location.search);
        const highlightCommentId = searchParams.get('highlight_comment_id') || searchParams.get('comment_id');

        if (highlightCommentId) {
          setActiveDrawerTab('comments');
          setMobileDrawerTab('discussion');
          setTimeout(() => {
            const el = document.getElementById(`deposit-comment-${highlightCommentId}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            setTimeout(() => {
              const p = new URLSearchParams(window.location.search);
              if (p.has('highlight_comment_id') || p.has('comment_id')) {
                p.delete('highlight_comment_id');
                p.delete('comment_id');
                const qs = p.toString();
                window.history.replaceState({}, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
              }
            }, 2600);
          }, 350);
        } else if (isInitial) {
          if (commentsList.length === 0) {
            setActiveDrawerTab('history');
          } else {
            setActiveDrawerTab('comments');
          }
        }
        setTimeout(() => {
          if (!highlightCommentId && commentsContainerRef.current) {
            commentsContainerRef.current.scrollTop = 0;
          }
        }, 50);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      console.error("Error loading comments:", err);
    } finally {
      if (!signal.aborted) {
        setLoadingComments(false);
      }
    }
  };

  const deleteCommentInFlightRef = useRef(false);
  const handleDeleteComment = async (commentId: number) => {
    if (!selectedDepForManage?.id) return;
    if (deleteCommentInFlightRef.current) return;
    deleteCommentInFlightRef.current = true;
    try {
      const res = await fetchAPI(`deposits/comments/${commentId}`, { method: 'DELETE' });
      if (res.success) {
        addToast(t('Đã xóa bình luận'), 'success');
        loadComments();
      } else {
        addToast(res.message || t('Không thể xóa bình luận'), 'error');
      }
    } catch (err: any) {
      addToast(t('Lỗi khi xóa bình luận: ') + err.message, 'error');
    } finally {
      deleteCommentInFlightRef.current = false;
    }
  };

  const loadHistory = async () => {
    if (!selectedDepForManage?.id) return;
    if (historyAbortRef.current) historyAbortRef.current.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    const { signal } = controller;

    setLoadingHistory(true);
    try {
      const res = await fetchAPI(`deposits/${selectedDepForManage.id}/history`, { signal });
      if (signal.aborted) return;
      if (res.success) {
        setHistoryLogs(extractArray(res));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      console.error("Error loading history:", err);
    } finally {
      if (!signal.aborted) {
        setLoadingHistory(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen && selectedDepForManage?.id) {
      loadComments(true);
      loadHistory();
    }
  }, [isOpen, selectedDepForManage?.id]);

  const addCommentInFlightRef = useRef(false);
  const handleAddComment = async () => {
    const hasContent = newCommentText.includes('<img') || 
                       newCommentText.includes('comment-attachment-chip') || 
                       newCommentText.includes('<a') ||
                       !!newCommentText.replace(/<[^>]*>/g, '').trim();
    if (!hasContent || !selectedDepForManage?.id || isSubmittingComment || addCommentInFlightRef.current) return;
    addCommentInFlightRef.current = true;
    setIsSubmittingComment(true);
    try {
      const res = await fetchAPI(`deposits/${selectedDepForManage.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: newCommentText })
      });
      if (res.success) {
        setNewCommentText('');
        addToast('Gửi bình luận thành công.', 'success');
        setActiveDrawerTab('comments');
        await Promise.all([loadComments(), loadHistory()]);
      } else {
        addToast(res.message || 'Lỗi gửi bình luận', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Lỗi kết nối', 'error');
    } finally {
      addCommentInFlightRef.current = false;
      setIsSubmittingComment(false);
    }
  };

  const handleTempSharePercentChange = (sIdx: number, val: string) => {
    const updated = [...tempSharesData];
    updated[sIdx].percentage = Math.max(0, Math.min(100, parseFloat(val) || 0));
    setTempSharesData(updated);
  };

  const handleAddMilestoneRow = () => {
    const isForeign = selectedDepForManage && selectedDepForManage.currency !== 'VND';
    setTempMilestones([
      ...tempMilestones,
      {
        tempId: Date.now() + Math.random(),
        milestone_name: `Đợt ${tempMilestones.length + 1}`,
        expected_amount: 0,
        original_amount: isForeign ? 0 : null,
        status: 'pending',
        expected_pay_date: getLocalDateStr()
      }
    ]);
  };

  const handleUpdateMilestoneField = (index: number, field: string, value: any) => {
    const updated = [...tempMilestones];
    updated[index] = { ...updated[index], [field]: value };
    setTempMilestones(updated);
  };

  const handleRemoveMilestoneRow = (index: number) => {
    showConfirm({
      title: 'Xóa đợt thanh toán',
      message: 'Bạn có chắc chắn muốn xóa đợt thanh toán này?',
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      isDanger: true,
      onConfirm: () => {
        const updated = [...tempMilestones];
        updated.splice(index, 1);
        setTempMilestones(updated);
        return Promise.resolve();
      }
    });
  };

  const uploadUncInFlightRef = useRef(false);
  const handleUploadUncFromModal = async (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const inputEl = e.target;
    const m = tempMilestones[index];
    if (!selectedDepForManage || !m.id || !inputEl.files || inputEl.files.length === 0) {
      inputEl.value = '';
      return;
    }
    if (uploadUncInFlightRef.current) return;

    const file = inputEl.files[0];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const forbidden = ensureArray<string>(uploadPolicy.forbidden_exts).map(x => String(x).toLowerCase());
    if (forbidden.includes(ext) || file.type === 'image/svg+xml') {
      addToast('Định dạng tệp không được phép tải lên vì lý do bảo mật.', 'error');
      inputEl.value = '';
      return;
    }
    if (file.size > maxUploadMb * 1024 * 1024) {
      addToast(`Dung lượng tệp vượt quá giới hạn ${maxUploadMb}MB.`, 'error');
      inputEl.value = '';
      return;
    }

    uploadUncInFlightRef.current = true;
    try {
      let fileToUpload: File = file;
      if (file.type.startsWith('image/') && !file.type.includes('svg')) {
        try {
          fileToUpload = await compressToWebP(file);
        } catch {
          fileToUpload = file;
        }
      }
      const formData = new FormData();
      formData.append('file', fileToUpload);

      const res = await fetchAPI(`deposits/${selectedDepForManage.id}/milestones/${m.id}`, {
        method: 'POST',
        body: formData
      });

      if (res.success && res.data?.unc_file_path) {
        addToast('Tải chứng từ UNC thành công.', 'success');
        const updated = [...tempMilestones];
        updated[index] = { ...updated[index], status: 'paid', unc_file_path: res.data.unc_file_path };
        setTempMilestones(updated);
        onSaveSuccess();
      } else {
        addToast(res.message || 'Lỗi tải UNC', 'error');
      }
    } catch (err: any) {
      addToast(err.message || 'Lỗi kết nối', 'error');
    } finally {
      uploadUncInFlightRef.current = false;
      inputEl.value = '';
    }
  };

  const handleApproveFromModal = async (index: number) => {
    const m = tempMilestones[index];
    if (!selectedDepForManage || !m.id) return;
    if (actioningMilestoneId !== null) return;

    const performApproval = async (actualAmt?: number) => {
      if (approveInFlightRef.current) return;
      approveInFlightRef.current = true;
      setActioningMilestoneId(m.id);
      setActioningType('approve');
      try {
        const body = actualAmt !== undefined ? { actual_amount: actualAmt } : {};
        const res = await fetchAPI(`deposits/${selectedDepForManage.id}/milestones/${m.id}/approve`, { 
          method: 'POST',
          body: JSON.stringify(body)
        });
        if (res.success) {
          addToast('Ghi nhận đợt tiền thành công.', 'success');
          const updated = [...tempMilestones];
          updated[index] = { ...updated[index], status: 'approved', actual_amount: actualAmt || m.expected_amount };
          setTempMilestones(updated);
          onSaveSuccess();
        } else {
          addToast(res.message || 'Lỗi ghi nhận', 'error');
        }
      } catch (e: any) {
        addToast(e.message || 'Lỗi kết nối', 'error');
      } finally {
        approveInFlightRef.current = false;
        setActioningMilestoneId(null);
        setActioningType(null);
      }
    };

    const studentName = selectedDepForManage.full_name || selectedDepForManage.client_name || selectedDepForManage.contact_name || 'Khách hàng';
    const payDateFormatted = m.expected_pay_date ? formatDateVN(m.expected_pay_date) : 'Chưa thiết lập';

    if (selectedDepForManage.currency && selectedDepForManage.currency !== 'VND') {
      const expectedVnd = m.expected_amount || 0;
      showConfirm({
        title: 'Ghi nhận thanh toán ngoại tệ',
        message: `Xác nhận ghi nhận cho khách hàng: ${studentName}\n• Nội dung: ${m.milestone_name || 'Đợt thanh toán'}\n• Ngày thanh toán: ${payDateFormatted}\n• Giá trị ngoại tệ: ${formatMoney(m.original_amount || 0, selectedDepForManage.currency)} (Tạm tính: ${formatMoney(expectedVnd, 'VND')})\n\nVui lòng nhập đúng số tiền VND thực tế nhận được từ khách hàng:`,
        confirmText: 'Ghi nhận',
        cancelText: 'Hủy',
        requirePromptInput: true,
        promptPlaceholder: 'Nhập số tiền VND thực nhận (ví dụ: 12500000)...',
        onConfirm: async (val) => {
          const cleanVal = (val || '').replace(/[^0-9]/g, '');
          const numVal = parseFloat(cleanVal);
          if (isNaN(numVal) || numVal <= 0) {
            addToast('Số tiền VND thực nhận không hợp lệ. Vui lòng nhập số tiền lớn hơn 0.', 'error');
            return;
          }
          await performApproval(numVal);
        }
      });
    } else {
      const amountFormatted = formatMoney(m.expected_amount || 0, 'VND');
      showConfirm({
        title: 'Xác nhận ghi nhận thanh toán',
        message: `Bạn có chắc chắn muốn ghi nhận đợt thanh toán này?\n\n• Nội dung: ${m.milestone_name || 'Đợt thanh toán'}\n• Khách hàng: ${studentName}\n• Ngày thanh toán: ${payDateFormatted}\n• Số tiền: ${amountFormatted}`,
        confirmText: 'Xác nhận ghi nhận',
        cancelText: 'Hủy bỏ',
        onConfirm: async () => {
          await performApproval();
        }
      });
    }
  };

  const rejectInFlightRef = useRef(false);
  const handleRejectFromModal = async (index: number) => {
    const m = tempMilestones[index];
    if (!selectedDepForManage || !m.id) return;
    if (actioningMilestoneId !== null || rejectInFlightRef.current) return;
    showConfirm({
      title: 'Từ chối UNC',
      message: 'Vui lòng nhập lý do từ chối bản xác nhận thanh toán này:',
      confirmText: 'Từ chối UNC',
      cancelText: 'Hủy',
      isDanger: true,
      requirePromptInput: true,
      promptPlaceholder: 'Nhập lý do từ chối (bắt buộc)...',
      onConfirm: async (reason) => {
        if (rejectInFlightRef.current) return;
        rejectInFlightRef.current = true;
        setActioningMilestoneId(m.id);
        setActioningType('reject');
        try {
          const res = await fetchAPI(`deposits/${selectedDepForManage.id}/milestones/${m.id}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason || 'UNC không hợp lệ' })
          });
          if (res.success) {
            addToast('Đã từ chối UNC thành công', 'success');
            const updated = [...tempMilestones];
            updated[index] = { ...updated[index], status: 'failed' };
            setTempMilestones(updated);
            onSaveSuccess();
          } else {
            addToast(res.message || 'Lỗi xử lý', 'error');
          }
        } catch (e: any) {
          addToast(e.message || 'Lỗi kết nối', 'error');
        } finally {
          rejectInFlightRef.current = false;
          setActioningMilestoneId(null);
          setActioningType(null);
        }
      }
    });
  };

  const saveMilestonesInFlightRef = useRef(false);
  const handleSaveMilestones = async () => {
    if (!selectedDepForManage) return;
    if (saveMilestonesInFlightRef.current) return;
    if (tempMilestones.length === 0) {
      addToast('Cần có ít nhất 1 đợt thanh toán.', 'error');
      return;
    }
    for (let i = 0; i < tempMilestones.length; i++) {
      const m = tempMilestones[i];
      if (!m.milestone_name || !m.milestone_name.trim()) {
        addToast('Tên đợt không được để trống.', 'error');
        return;
      }
      const amt = selectedDepForManage.currency !== 'VND' 
        ? (m.original_amount !== null && m.original_amount !== undefined ? m.original_amount : m.expected_amount)
        : m.expected_amount;
      if (!amt || parseFloat(String(amt)) <= 0) {
        addToast(`Vui lòng nhập số tiền hợp lệ cho đợt "${m.milestone_name}".`, 'error');
        return;
      }
      if (!m.expected_pay_date) {
        addToast(`Vui lòng chọn ngày thanh toán dự kiến cho đợt "${m.milestone_name}".`, 'error');
        return;
      }
    }

    const totalM = tempMilestones.reduce((acc, m) => acc + (parseFloat(String(m.expected_amount)) || 0), 0);
    const syncPrice = totalM > 0 ? Math.round(totalM) : (parseFloat(String(selectedDepForManage.price)) || 0);

    if (isAdmin && tempSharesData && tempSharesData.length > 0) {
      const totalPct = tempSharesData.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        addToast('Tổng tỷ lệ chia sẻ hoa hồng phải bằng 100%.', 'error');
        return;
      }
    }

    saveMilestonesInFlightRef.current = true;
    try {
      setIsSavingMilestones(true);
      const payload: any = {
        milestones: tempMilestones,
        price: syncPrice,
        auto_remind: autoRemindManage ? 1 : 0,
        remind_days_before: remindDaysBeforeManage,
        remind_at_hour: remindAtHourManage,
        remind_target: remindTargetManage
      };
      if (isAdmin) {
        payload.expected_commission = tempExpectedCommission;
        payload.shares = tempSharesData.map(sh => ({
          user_id: sh.user_id,
          percentage: sh.percentage
        }));
      }
      const res = await fetchAPI(`deposits/${selectedDepForManage.id}/milestones`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      if (res.success) {
        addToast('Cập nhật lịch trình thanh toán thành công.', 'success');
        setBaselineFingerprint(buildFingerprint(tempMilestones, tempExpectedCommission, tempSharesData, autoRemindManage, remindDaysBeforeManage, remindAtHourManage, remindTargetManage));
        forceCloseDrawer();
        onSaveSuccess();
      } else {
        addToast(res.message || 'Lỗi khi lưu lịch trình', 'error');
      }
    } catch (e: any) {
      addToast(e.message || 'Lỗi kết nối', 'error');
    } finally {
      saveMilestonesInFlightRef.current = false;
      setIsSavingMilestones(false);
    }
  };

  const sendManualReminderInFlightRef = useRef(false);
  const handleSendManualReminder = async (milestoneId: number, targetChoice: number = 2) => {
    if (sendingReminderId !== null || sendManualReminderInFlightRef.current) return;
    sendManualReminderInFlightRef.current = true;
    setSendingReminderId(milestoneId);
    try {
      const res = await fetchAPI(`deposits/${selectedDepForManage?.id}/milestones/${milestoneId}/remind`, {
        method: 'POST',
        body: JSON.stringify({ remind_target: targetChoice })
      });
      if (res.success) {
        addToast('Đã gửi thông báo nhắc lịch thanh toán thành công.', 'success');
      } else {
        addToast(res.message || 'Lỗi khi gửi nhắc nhở', 'error');
      }
    } catch (e: any) {
      addToast(e.message || 'Lỗi kết nối', 'error');
    } finally {
      sendManualReminderInFlightRef.current = false;
      setSendingReminderId(null);
    }
  };

  const handleOpenCancel = () => {
    setCancelReason('');
    setIsCancelOpen(true);
  };

  const cancelDepositInFlightRef = useRef(false);
  const handleCancelDeposit = async () => {
    if (!selectedDepForManage) return;
    if (cancelDepositInFlightRef.current) return;
    if (!cancelReason.trim()) {
      addToast('Vui lòng nhập lý do hủy giao dịch.', 'error');
      return;
    }
    cancelDepositInFlightRef.current = true;
    setIsSaving(true);
    try {
      const res = await fetchAPI(`deposits/${selectedDepForManage.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason })
      });
      if (res.success) {
        addToast('Đã báo bể cọc và hủy giao dịch thành công.', 'success');
        setIsCancelOpen(false);
        forceCloseDrawer();
        onSaveSuccess();
      } else {
        addToast(res.message || 'Lỗi hủy giao dịch', 'error');
      }
    } catch (e: any) {
      addToast(e.message || 'Lỗi kết nối', 'error');
    } finally {
      cancelDepositInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const formatMoney = (amount: number | string | undefined, curr = 'VND') => {
    const val = parseFloat(String(amount || 0));
    return (Number.isFinite(val) ? val : 0).toLocaleString('vi-VN') + (curr === 'VND' ? ' ₫' : ` ${curr}`);
  };

  const formatNumberWithCommas = (num: any) => {
    if (num === null || num === undefined) return '';
    let strVal = String(num);
    if (strVal.includes('.')) {
      const parts = strVal.split('.');
      if (parts[1] === '00' || parts[1] === '0') {
        strVal = parts[0];
      } else {
        const parsed = parseFloat(strVal);
        if (!isNaN(parsed)) {
          if (parsed % 1 === 0) {
            strVal = String(parsed);
          } else {
            return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + ',' + parts[1];
          }
        }
      }
    }
    return strVal.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  };

  const handlePrintDepositReceipt = () => {
    if (!selectedDepForManage) return;
    const org = config?.organization;
    const orgName = escapeHtml(org?.name || 'MYERP');
    const orgAddress = escapeHtml(org?.address || '');
    const orgPhone = escapeHtml(org?.support_hotline || '');
    const orgTax = escapeHtml(org?.tax_id || '');
    const custName = escapeHtml(selectedDepForManage.full_name || 'Khách hàng');
    const custPhone = escapeHtml(selectedDepForManage.phone || '—');
    const progName = escapeHtml(selectedDepForManage.project_name || '—');
    const unitCode = escapeHtml(selectedDepForManage.unit_code || '—');
    const totalVal = Number(selectedDepForManage.price || 0);
    const totalApproved = tempMilestones
      .filter(m => m.status === 'approved')
      .reduce((sum, m) => sum + (Number(m.actual_amount ?? m.expected_amount) || 0), 0);

    const rowsHtml = ensureArray(tempMilestones).map((m, idx) => {
      const stLabel = m.status === 'approved' ? 'Đã ghi nhận' : m.status === 'paid' ? 'Chờ đối soát' : m.status === 'failed' ? 'Từ chối' : 'Chờ nộp';
      const amtText = selectedDepForManage.currency && selectedDepForManage.currency !== 'VND'
        ? `${formatMoney(m.original_amount ?? m.expected_amount, selectedDepForManage.currency)} (≈ ${formatMoney(m.expected_amount, 'VND')})`
        : formatMoney(m.expected_amount, 'VND');
      return `<tr>
        <td>${idx + 1}</td>
        <td>${escapeHtml(m.milestone_name || `Đợt ${idx + 1}`)}</td>
        <td>${m.expected_pay_date ? escapeHtml(formatDateVN(m.expected_pay_date)) : '—'}</td>
        <td style="text-align:right;font-weight:700">${escapeHtml(amtText)}</td>
        <td style="text-align:center">${escapeHtml(stLabel)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu xác nhận đặt cọc #${escapeHtml(selectedDepForManage.id)}</title>
      <style>
        body{font-family:system-ui,-apple-system,sans-serif;color:#0F172A;background:#fff;margin:28px;font-size:13px;}
        .hdr{display:flex;justify-content:space-between;border-bottom:2px solid #BD1D2D;padding-bottom:12px;margin-bottom:18px;}
        h1{margin:0 0 6px;font-size:19px;color:#BD1D2D;text-transform:uppercase;}
        .meta{font-size:12px;color:#475569;line-height:1.5;}
        .grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px;margin-bottom:16px;}
        table{width:100%;border-collapse:collapse;margin-top:8px;}
        th,td{border:1px solid #E2E8F0;padding:8px 10px;text-align:left;}
        th{background:#F1F5F9;font-size:11px;text-transform:uppercase;color:#334155;}
        .tot{margin-top:14px;text-align:right;line-height:1.7;}
        @media print{body{background:#fff !important;margin:12mm;}}
      </style></head><body>
      <div class="hdr">
        <div>
          <div style="font-size:16px;font-weight:800;">${orgName}</div>
          <div class="meta">${orgAddress}${orgPhone ? ` • Hotline: ${orgPhone}` : ''}${orgTax ? ` • MST: ${orgTax}` : ''}</div>
        </div>
        <div style="text-align:right">
          <h1>PHIẾU XÁC NHẬN THANH TOÁN</h1>
          <div class="meta">Mã SO: <strong>#${escapeHtml(selectedDepForManage.id)}</strong> • Ngày in: ${escapeHtml(formatDateVN(getLocalDateStr()))}</div>
        </div>
      </div>
      <div class="grid">
        <div><strong>Khách hàng:</strong> ${custName}<br/><strong>SĐT:</strong> ${custPhone}</div>
        <div><strong>Chương trình:</strong> ${progName}<br/><strong>Mã hồ sơ/đơn:</strong> ${unitCode}</div>
      </div>
      <table>
        <thead><tr><th style="width:40px">STT</th><th>Đợt thanh toán</th><th style="width:110px">Hạn dự kiến</th><th style="width:180px;text-align:right">Số tiền</th><th style="width:110px;text-align:center">Trạng thái</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="tot">
        <div>Tổng giá trị đơn hàng: <strong>${escapeHtml(formatMoney(totalVal, 'VND'))}</strong></div>
        <div>Bằng chữ: <em>${escapeHtml(numberToVietnameseText(Math.round(totalVal)))}</em></div>
        <div>Đã đối soát / thực thu: <strong style="color:#BD1D2D">${escapeHtml(formatMoney(totalApproved, 'VND'))}</strong></div>
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`;
    const win = window.open('', '_blank', 'width=880,height=720');
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
    } else {
      addToast('Trình duyệt đang chặn cửa sổ in, vui lòng cho phép pop-up.', 'warning');
    }
  };

  const [isClosing, setIsClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setIsClosing(false);
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [isOpen]);

  const forceCloseDrawer = () => {
    if (isClosing) return;
    setIsClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
      setIsClosing(false);
    }, drawerMotionMs);
  };

  const handleClose = () => {
    if (isClosing) return;
    if (canEditMilestones && baselineFingerprint) {
      const currentFp = buildFingerprint(
        tempMilestones,
        tempExpectedCommission,
        tempSharesData,
        autoRemindManage,
        remindDaysBeforeManage,
        remindAtHourManage,
        remindTargetManage
      );
      if (currentFp !== baselineFingerprint) {
        setShowDirtyCloseConfirm(true);
        return;
      }
    }
    forceCloseDrawer();
  };
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;

  useEffect(() => {
    if (isOpen) {
      return pushOverlay('deposit-detail-drawer', () => {
        if (previewReminderMilestone) {
          setPreviewReminderMilestone(null);
          return;
        }
        if (isEditSOOpen) {
          setIsEditSOOpen(false);
          return;
        }
        if (isCancelOpen) {
          setIsCancelOpen(false);
          return;
        }
        handleCloseRef.current();
      }, 100);
    }
  }, [isOpen, previewReminderMilestone, isEditSOOpen, isCancelOpen]);

  if (!isOpen || !selectedDepForManage) return null;

  const totalApprovedMilestones = tempMilestones
    .filter(m => m.status === 'approved')
    .reduce((sum, m) => {
      const amt = m.actual_amount !== null && m.actual_amount !== undefined ? m.actual_amount : m.expected_amount;
      return sum + (parseFloat(amt) || 0);
    }, 0);

  const totalApprovedMilestonesOriginal = tempMilestones
    .filter(m => m.status === 'approved')
    .reduce((sum, m) => {
      const amt = m.original_amount !== null && m.original_amount !== undefined ? m.original_amount : m.expected_amount;
      return sum + (parseFloat(amt) || 0);
    }, 0);

  const totalCount = tempMilestones.length;
  const approvedCount = tempMilestones.filter(m => m.status === 'approved').length;

  const actualCommission = selectedDepForManage.price > 0
    ? Math.round((tempExpectedCommission || selectedDepForManage.expected_commission || 0) * (totalApprovedMilestones / selectedDepForManage.price))
    : 0;

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && !isClosing && (
          <div style={{ position: 'fixed', inset: 0, zIndex: backdropZ, display: 'flex', justifyContent: 'flex-end' }}>
            {/* Overlay */}
            <motion.div
              className="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: drawerMotionSec, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={handleClose}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                zIndex: backdropZ,
                '--drawer-backdrop-z': backdropZ,
                willChange: 'opacity',
                transform: 'translate3d(0, 0, 0)'
              } as any}
            />
            {/* Drawer panel */}
            <motion.div
              className="drawer-sheet drawer-panel"
              initial={isMobile ? { y: '100%' } : { opacity: 0, x: '250px' }}
              animate={{ y: 0, x: 0, opacity: 1 }}
              exit={isMobile ? { y: '60%', opacity: 0 } : { opacity: 0, x: '60%' }}
              transition={{ duration: drawerMotionSec, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                position: 'fixed',
                top: 0,
                bottom: 0,
                left: isMobile ? 0 : 'var(--sidebar-width, 220px)',
                right: 0,
                backgroundColor: 'var(--color-surface)',
                boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: panelZ, ...({ '--drawer-panel-z': panelZ } as any),
                willChange: 'transform, opacity',
                transform: 'translate3d(0, 0, 0)',
                contain: 'layout style'
              }}
            >
              {/* Header */}
              {(() => {
                const isCreator = String(selectedDepForManage.created_by) === String(user?.id);
                const isOwner = String(selectedDepForManage.contact_owner_id) === String(user?.id);
                const isStaff = Boolean(user && (isManagement(user) || isAccountant(user, true) || isMarketing(user)));
                const canCancelDeposit = selectedDepForManage.status !== 'cancelled' && (isStaff || isCreator || isOwner) && hasPermission('deposits', 'write');

                if (isMobile) {
                  const mobileHeaderActions = [
                    {
                      id: 'print-so',
                      label: 'In phiếu thu',
                      icon: <Printer size={14} />,
                      onClick: handlePrintDepositReceipt,
                    },
                    ...(canEditAllSOInfo
                      ? [{
                          id: 'edit-so',
                          label: 'Sửa thông tin SO',
                          icon: <Edit size={14} />,
                          onClick: handleOpenEditSO,
                        }]
                      : []),
                    ...(canCancelDeposit
                      ? [{
                          id: 'cancel-dep',
                          label: 'Hủy giao dịch',
                          icon: <Ban size={14} />,
                          danger: true,
                          onClick: handleOpenCancel,
                        }]
                      : []),
                    ...(canEditMilestones
                      ? [{
                          id: 'save-milestones',
                          label: isSavingMilestones ? 'Đang lưu...' : 'Lưu lịch trình',
                          icon: isSavingMilestones ? <Loader2 size={14} className="spin" /> : <Check size={14} />,
                          primary: true,
                          disabled: isSavingMilestones,
                          onClick: handleSaveMilestones,
                        }]
                      : []),
                  ];

                  return (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      padding: 'max(10px, env(safe-area-inset-top, 0px)) 12px 10px 12px',
                      borderBottom: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      flexShrink: 0
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                          <button
                            onClick={handleClose}
                            style={{
                              background: 'none',
                              border: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              cursor: 'pointer',
                              padding: '4px',
                              borderRadius: '8px',
                              color: 'var(--color-text-muted)',
                              flexShrink: 0,
                              marginLeft: '-4px'
                            }}
                            title="Quay lại"
                          >
                            <ChevronLeft size={20} />
                          </button>
                          <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                            Chi tiết & Lịch trình thanh toán
                          </h2>
                        </div>
                        <button
                          onClick={handleClose}
                          style={{
                            border: 'none',
                            background: 'var(--color-bg-light, #f1f5f9)',
                            cursor: 'pointer',
                            color: 'var(--color-text-muted)',
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0
                          }}
                          title="Đóng"
                        >
                          <X size={18} />
                        </button>
                      </div>
                      {mobileHeaderActions.length > 0 && (
                        <ResponsiveActionGroup actions={mobileHeaderActions} fullWidthOnMobile moreLabel="Thao tác" />
                      )}
                    </div>
                  );
                }

                return (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-surface)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <button
                        onClick={handleClose}
                        style={{
                          background: 'none',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '8px',
                          color: 'var(--color-text-muted)',
                          transition: 'background 0.2s, color 0.2s',
                          marginLeft: '-4px'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-surface-hover)';
                          e.currentTarget.style.color = 'var(--color-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'none';
                          e.currentTarget.style.color = 'var(--color-text-muted)';
                        }}
                        title="Quay lại"
                      >
                        <ChevronLeft size={22} />
                      </button>
                      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                        Chi tiết & Lịch trình thanh toán
                      </h2>
                    </div>

                    {/* Actions & Close area top right */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        type="button"
                        onClick={handlePrintDepositReceipt}
                        style={{
                          padding: '6px 12px',
                          height: '34px',
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          color: '#334155',
                          borderRadius: '8px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                        title="In phiếu thu giao dịch cọc"
                      >
                        <Printer size={14} />
                        <span>In phiếu thu</span>
                      </button>

                      {canEditAllSOInfo && (
                        <button
                          type="button"
                          onClick={handleOpenEditSO}
                          style={{
                            padding: '6px 12px',
                            height: '34px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            color: '#334155',
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F1F5F9'}
                          onMouseLeave={e => e.currentTarget.style.background = '#F8FAFC'}
                          title="Kế toán / Quản trị viên chỉnh sửa toàn bộ thông tin đơn hàng"
                        >
                          <Edit size={14} />
                          <span>Sửa thông tin SO</span>
                        </button>
                      )}

                      {canCancelDeposit && (
                        <button
                          type="button"
                          onClick={handleOpenCancel}
                          style={{
                            padding: '6px 14px',
                            height: '34px',
                            background: 'rgba(189, 29, 45, 0.08)',
                            border: '1px solid rgba(189, 29, 45, 0.22)',
                            color: '#BD1D2D',
                            borderRadius: '8px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.background = 'rgba(189, 29, 45, 0.14)';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.background = 'rgba(189, 29, 45, 0.08)';
                          }}
                        >
                          <Ban size={14} />
                          <span>Hủy giao dịch</span>
                        </button>
                      )}

                      {canEditMilestones && (
                        <button
                          type="button"
                          className="btn primary"
                          onClick={handleSaveMilestones}
                          style={{ height: '34px', minWidth: 100, fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                          disabled={isSavingMilestones || saveMilestonesInFlightRef.current}
                        >
                          {isSavingMilestones && <Loader2 size={13} className="spin" />}
                          <span>{isSavingMilestones ? 'Đang lưu...' : 'Lưu lịch trình'}</span>
                        </button>
                      )}

                      <button
                        onClick={handleClose}
                        style={{
                          border: 'none',
                          background: 'none',
                          cursor: 'pointer',
                          color: 'var(--color-text-muted)',
                          padding: '8px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'background 0.2s',
                          zIndex: 10
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-hover)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}
                        title="Đóng"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* Mobile Navigation Tabs */}
              {isMobile && (
                <div style={{
                  display: 'flex',
                  background: 'var(--color-bg)',
                  padding: '6px',
                  borderBottom: '1px solid var(--color-border-light)',
                  gap: '4px',
                  flexShrink: 0
                }}>
                  <button
                    type="button"
                    onClick={() => setMobileDrawerTab('info')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: mobileDrawerTab === 'info' ? 'var(--color-surface)' : 'transparent',
                      color: mobileDrawerTab === 'info' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      fontWeight: mobileDrawerTab === 'info' ? 750 : 600,
                      fontSize: '0.8125rem',
                      boxShadow: mobileDrawerTab === 'info' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <FileText size={14} />
                    <span>Thông tin chi tiết</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileDrawerTab('discussion')}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: 'none',
                      background: mobileDrawerTab === 'discussion' ? 'var(--color-surface)' : 'transparent',
                      color: mobileDrawerTab === 'discussion' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      fontWeight: mobileDrawerTab === 'discussion' ? 750 : 600,
                      fontSize: '0.8125rem',
                      boxShadow: mobileDrawerTab === 'discussion' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <MessageSquare size={14} />
                    <span>Thảo luận {comments.length > 0 ? `(${comments.length})` : ''}</span>
                  </button>
                </div>
              )}

              {/* Drawer Body (Dual Pane) */}
              <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', overflow: 'hidden' }}>
                {/* Left Pane (Details & Milestones) */}
                {(!isMobile || mobileDrawerTab === 'info') && (
                <div className="custom-scrollbar" style={{ flex: isMobile ? 1 : 1.3, width: isMobile ? '100%' : 'auto', minWidth: 0, padding: isMobile ? '1rem 1rem 120px 1rem' : '1.5rem 1.5rem 150px 1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    background: 'var(--color-surface)',
                    padding: isMobile ? '14px' : '20px',
                    borderRadius: '16px',
                    border: '1px solid var(--color-border-light)',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {/* Top Row: Customer & SKU */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', gap: isMobile ? '12px' : '20px' }}>
                      {/* Left: Customer Info */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Avatar
                          src={selectedDepForManage.avatar_url}
                          name={selectedDepForManage.full_name || ''}
                          size="lg"
                          style={{ width: '52px', height: '52px', fontSize: '1.2rem' }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-text)' }}>
                            {selectedDepForManage.full_name}
                          </h4>
                          <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                            SĐT: <strong style={{ color: 'var(--color-text)' }}>{selectedDepForManage.phone || '—'}</strong>
                          </span>
                          {selectedDepForManage.email && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                              Email: <strong style={{ color: 'var(--color-text)' }}>{selectedDepForManage.email}</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Program */}
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '4px', background: 'var(--color-bg-light)', padding: '10px 14px', borderRadius: '12px', border: '1px solid var(--color-border-light)' }}>
                        <span style={{ fontSize: '0.675rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Chương trình</span>
                        <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--color-text)', wordBreak: 'break-word' }}>
                          {selectedDepForManage.unit_code && selectedDepForManage.unit_code !== '—' && selectedDepForManage.unit_code !== '-' && selectedDepForManage.unit_code.trim() !== ''
                            ? `${selectedDepForManage.project_name} (${selectedDepForManage.unit_code})`
                            : selectedDepForManage.project_name}
                        </span>
                      </div>
                    </div>

                    <div style={{ height: '1px', background: 'var(--color-border-light)' }} />

                    {/* Bottom Row: Caretaker & Financials */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 2fr', gap: isMobile ? '14px' : '20px', alignItems: 'center' }}>
                      {/* Left: Caretaker info */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <span style={{ fontSize: '0.675rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Nhân sự chăm sóc & hoa hồng
                        </span>
                        {isAdmin && tempSharesData && tempSharesData.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {tempSharesData.map((sh, sIdx) => (
                              <div
                                key={sIdx}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: 'var(--color-bg-light)',
                                  border: '1px solid var(--color-border-light)',
                                  padding: '5px 10px',
                                  borderRadius: '8px',
                                  width: '100%'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <Avatar src={sh.avatar} name={sh.name} size="md" style={{ width: '28px', height: '28px' }} />
                                  <span style={{ fontSize: '0.775rem', fontWeight: 600, color: 'var(--color-text)' }}>{sh.name}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={sh.percentage}
                                    onChange={(e) => handleTempSharePercentChange(sIdx, e.target.value)}
                                    className="form-input"
                                    style={{ width: '55px', height: '24px', textAlign: 'center', padding: '2px', fontSize: '0.75rem', margin: 0 }}
                                  />
                                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>%</span>
                                </div>
                              </div>
                            ))}
                            {(() => {
                              const totalPct = tempSharesData.reduce((sum, s) => sum + (Number(s.percentage) || 0), 0);
                              if (Math.abs(totalPct - 100) > 0.01) {
                                return (
                                  <span style={{ fontSize: '0.7rem', color: '#BD1D2D', fontWeight: 600 }}>
                                    * Tổng tỷ lệ phải bằng 100% (Hiện tại: {Number(totalPct.toFixed(2))}%)
                                  </span>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        ) : sharesData && sharesData.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                            {sharesData.map((sh, sIdx) => (
                              <div
                                key={sIdx}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px'
                                }}
                              >
                                <Avatar src={sh.avatar} name={sh.name} size="md" style={{ width: '28px', height: '28px' }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--color-text)' }}>{sh.name}</span>
                                  <span style={{
                                    fontSize: '0.675rem',
                                    fontWeight: 700,
                                    color: '#BD1D2D'
                                  }}>
                                    Đóng góp: {sh.percentage}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            <Avatar src={selectedDepForManage.owner_avatar || selectedDepForManage.creator_avatar} name={selectedDepForManage.owner_name || selectedDepForManage.creator_name || 'Chưa xác định'} size="md" style={{ width: '28px', height: '28px' }} />
                            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--color-text)' }}>{selectedDepForManage.owner_name || selectedDepForManage.creator_name || 'Chưa xác định'}</span>
                          </div>
                        )}
                      </div>

                      {/* Financial Stat Cards — DOMATION Brand Red & Slate */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', width: '100%' }}>
                        {/* Card 1: Tổng giá trị & Thực thu */}
                        <div className="dom-surface-card dom-kpi-tile" style={{ minHeight: '124px', justifyContent: 'space-between' }}>
                          <div className="dom-kpi-tile__top">
                            <span className="dom-kpi-tile__label">Tổng giá trị</span>
                            <div className="dom-kpi-tile__icon dom-tone-brand">
                              <CreditCard size={16} />
                            </div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div className="dom-kpi-tile__value" style={{ fontSize: '1.22rem' }}>
                              {selectedDepForManage.currency !== 'VND' ? (
                                <div>
                                  <div>{formatMoney(selectedDepForManage.price / (parseFloat(selectedDepForManage.exchange_rate) || 1), selectedDepForManage.currency)}</div>
                                  <div style={{ fontSize: '0.725rem', color: '#64748b', marginTop: '4px', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                                    ≈ {formatMoney(selectedDepForManage.price, 'VND')}
                                  </div>
                                </div>
                              ) : (
                                formatMoney(selectedDepForManage.price, 'VND')
                              )}
                            </div>
                            <div className="dom-kpi-tile__breakdown" style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#BD1D2D', display: 'inline-block' }} />
                                Thực thu: <strong style={{ color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                                  {formatMoney(
                                    selectedDepForManage.currency !== 'VND' ? totalApprovedMilestonesOriginal : totalApprovedMilestones,
                                    selectedDepForManage.currency
                                  )}
                                </strong>{' '}
                                {selectedDepForManage.currency !== 'VND' && (
                                  <span style={{ color: '#64748b', fontWeight: 600 }}>
                                    (≈ {formatMoney(totalApprovedMilestones, 'VND')})
                                  </span>
                                )}{' '}
                                ({approvedCount}/{totalCount} đợt)
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Card 2: Hoa hồng dự kiến & Thực tế */}
                        <div className="dom-surface-card dom-kpi-tile" style={{ minHeight: '124px', justifyContent: 'space-between' }}>
                          <div className="dom-kpi-tile__top">
                            <span className="dom-kpi-tile__label">Hoa hồng dự kiến</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {canEditExpectedCommission && !isEditingCommission && (
                                <button
                                  type="button"
                                  onClick={() => setIsEditingCommission(true)}
                                  style={{
                                    border: 'none',
                                    background: 'none',
                                    padding: '2px',
                                    cursor: 'pointer',
                                    color: '#334155',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '4px',
                                    transition: 'background 0.2s',
                                    position: 'relative',
                                    zIndex: 3
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(15, 23, 42, 0.06)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                                  title="Sửa hoa hồng"
                                >
                                  <Edit size={12} />
                                </button>
                              )}
                              <div className="dom-kpi-tile__icon dom-tone-brand">
                                <Wallet size={16} />
                              </div>
                            </div>
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            {canEditExpectedCommission && isEditingCommission ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginBottom: 2 }}>Số tiền (VND)</span>
                                  <CurrencyInput
                                    value={tempExpectedCommission}
                                    onChange={(val) => setTempExpectedCommission(Math.max(0, val || 0))}
                                    className="form-input"
                                    style={{
                                      height: '28px',
                                      fontSize: '0.85rem',
                                      fontWeight: 800,
                                      color: '#0F172A',
                                      width: '100%',
                                      margin: 0,
                                      padding: '0 6px',
                                      borderRadius: '6px',
                                      background: 'var(--color-surface)',
                                      border: '1px solid #E2E8F0'
                                    }}
                                  />
                                </div>
                                <div style={{ width: '70px', flexShrink: 0 }}>
                                  <span style={{ fontSize: '0.65rem', color: '#64748b', display: 'block', marginBottom: 2 }}>Tỷ lệ %</span>
                                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step="any"
                                      value={selectedDepForManage?.price > 0 ? parseFloat(((tempExpectedCommission / selectedDepForManage.price) * 100).toFixed(4)) : 0}
                                      onChange={(e) => {
                                        const rawPct = parseFloat(e.target.value);
                                        const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 0;
                                        setTempExpectedCommission(Math.round((pct / 100) * (selectedDepForManage?.price || 0)));
                                      }}
                                      style={{
                                        height: '28px',
                                        width: '100%',
                                        fontSize: '0.85rem',
                                        fontWeight: 800,
                                        color: '#0F172A',
                                        padding: '0 16px 0 6px',
                                        borderRadius: '6px',
                                        background: 'var(--color-surface)',
                                        border: '1px solid #E2E8F0'
                                      }}
                                    />
                                    <span style={{ position: 'absolute', right: '6px', fontSize: '0.75rem', fontWeight: 700, color: '#64748b' }}>%</span>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '100%', paddingTop: '14px' }}>
                                  <button
                                    type="button"
                                    onClick={() => setIsEditingCommission(false)}
                                    style={{
                                      border: 'none',
                                      background: '#BD1D2D',
                                      color: 'white',
                                      padding: '4px',
                                      cursor: 'pointer',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '28px',
                                      height: '28px',
                                      boxShadow: 'var(--shadow-sm)'
                                    }}
                                    title="Xong"
                                  >
                                    <Check size={14} />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="dom-kpi-tile__value dom-kpi-tile__value--brand" style={{ fontSize: '1.22rem' }}>
                                {formatMoney(tempExpectedCommission !== undefined ? tempExpectedCommission : selectedDepForManage.expected_commission, 'VND')}
                              </div>
                            )}
                            <div className="dom-kpi-tile__breakdown" style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#334155', display: 'inline-block' }} />
                                Thực tế: <strong style={{ color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(actualCommission, 'VND')}</strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Automated Reminders Config in Drawer */}
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    padding: '16px',
                    background: 'var(--color-surface-hover)',
                    borderRadius: '12px',
                    border: '1px solid var(--color-border-light)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Clock size={16} style={{ color: 'var(--color-primary)' }} />
                        Cài đặt nhắc lịch thanh toán tự động
                      </span>
                      <label style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '40px',
                        height: '22px',
                        cursor: canEditMilestones ? 'pointer' : 'not-allowed'
                      }}>
                        <input
                          type="checkbox"
                          disabled={!canEditMilestones}
                          checked={autoRemindManage}
                          onChange={e => setAutoRemindManage(e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          inset: 0,
                          backgroundColor: autoRemindManage ? '#BD1D2D' : '#cbd5e1',
                          borderRadius: '34px',
                          transition: '0.3s'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '""',
                            height: '16px',
                            width: '16px',
                            left: autoRemindManage ? '20px' : '3px',
                            bottom: '3px',
                            backgroundColor: 'white',
                            borderRadius: '50%',
                            transition: '0.3s'
                          }} />
                        </span>
                      </label>
                    </div>

                    {autoRemindManage && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '4px' }}>
                        {selectedDepForManage && !selectedDepForManage.email && (
                          <div style={{
                            padding: '8px 12px',
                            background: 'rgba(189, 29, 45, 0.06)',
                            border: '1px solid rgba(189, 29, 45, 0.18)',
                            borderRadius: '8px',
                            color: '#BD1D2D',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                            lineHeight: 1.4,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}>
                            <AlertCircle size={14} style={{ flexShrink: 0 }} />
                            <span>Khách hàng này không có email. Email nhắc thanh toán sẽ được gửi cho Sale chăm sóc thay thế.</span>
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Đối tượng nhận nhắc nhở</label>
                            <CustomSelect
                              disabled={!canEditMilestones}
                              options={[
                                { value: '2', label: 'Chỉ gửi nhắc cho Sale chăm sóc (Mặc định)' },
                                { value: '1', label: 'Gửi khách hàng (Fallback về Sale)' }
                              ]}
                              value={String(remindTargetManage)}
                              onChange={val => setRemindTargetManage(Number(val))}
                              placeholder="Chọn đối tượng"
                            />
                          </div>

                          <div style={{ width: '130px', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Nhắc trước (ngày)</label>
                            <input
                              disabled={!canEditMilestones}
                              type="number"
                              min={1}
                              max={30}
                              value={remindDaysBeforeManage}
                              onChange={e => setRemindDaysBeforeManage(Math.min(30, Math.max(1, parseInt(e.target.value) || 3)))}
                              className="form-input"
                              style={{ height: '38px', fontSize: '0.8rem', padding: '0 8px', borderRadius: '8px', textAlign: 'center', margin: 0 }}
                            />
                          </div>

                          <div style={{ width: '125px', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>Giờ gửi nhắc</label>
                            <CustomSelect
                              disabled={!canEditMilestones}
                              options={Array.from({ length: 24 }).map((_, h) => ({
                                value: String(h),
                                label: `${h}:00`
                              }))}
                              value={String(remindAtHourManage)}
                              onChange={val => setRemindAtHourManage(Number(val))}
                              placeholder="Chọn giờ"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Milestones List */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.875rem' }}>Các đợt thanh toán</h4>
                      {canEditMilestones && (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={handleAddMilestoneRow}
                          style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            background: 'rgba(189, 29, 45, 0.08)',
                            color: '#BD1D2D',
                            border: '1px solid rgba(189, 29, 45, 0.22)',
                            fontWeight: 700,
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                        >
                          + Thêm đợt
                        </button>
                      )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {/* Table Header */}
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1.2fr 1.8fr',
                        gap: '12px',
                        alignItems: 'center',
                        padding: '8px 12px',
                        background: 'var(--color-surface-hover)',
                        borderBottom: '2px solid var(--color-border)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: 'var(--color-text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        <div>Tên đợt thanh toán</div>
                        <div>Hạn thanh toán</div>
                        <div>Số tiền ({selectedDepForManage?.currency || 'VND'})</div>
                        <div style={{ textAlign: 'center' }}>Trạng thái</div>
                        <div style={{ textAlign: 'center' }}>Minh chứng</div>
                        <div style={{ textAlign: 'right' }}>Thao tác</div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {ensureArray(tempMilestones).map((m, idx) => {
                          const isLocked = m.status === 'approved' || m.status === 'paid';
                          return (
                            <div
                              key={m.tempId || m.id}
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '2fr 1.2fr 1.2fr 1fr 1.2fr 1.8fr',
                                gap: '12px',
                                alignItems: 'flex-start',
                                padding: '10px 12px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border-light)',
                                borderRadius: '8px',
                                transition: 'all 0.2s',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                              }}
                            >
                              {/* Name input */}
                              <div>
                                <input
                                  type="text"
                                  placeholder="Tên đợt (ví dụ: Đợt 1 - Cọc giữ chỗ)"
                                  value={m.milestone_name}
                                  disabled={!canEditMilestones}
                                  onChange={e => handleUpdateMilestoneField(idx, 'milestone_name', e.target.value)}
                                  className="form-input"
                                  style={{ width: '100%', height: '34px', fontSize: '0.775rem', padding: '0 8px', borderRadius: '6px', fontVariantNumeric: 'tabular-nums' }}
                                />
                              </div>

                              {/* Expected Pay Date */}
                              <div>
                                <VietnameseDateInput
                                  value={m.expected_pay_date ? m.expected_pay_date.substring(0, 10) : ''}
                                  disabled={isLocked || !canEditMilestones}
                                  onChange={val => handleUpdateMilestoneField(idx, 'expected_pay_date', val)}
                                  size="sm"
                                  inputStyle={{ height: '34px', fontSize: '0.725rem', padding: '0 28px 0 8px', borderRadius: '6px' }}
                                />
                              </div>

                              {/* Amount input */}
                              <div>
                                <input
                                  type="text"
                                  placeholder="Số tiền"
                                  value={formatNumberWithCommas(
                                    selectedDepForManage.currency !== 'VND'
                                      ? (m.original_amount !== null && m.original_amount !== undefined ? m.original_amount : m.expected_amount)
                                      : m.expected_amount
                                  )}
                                  disabled={isLocked || !canEditMilestones}
                                  onChange={e => {
                                    const rawVal = e.target.value.replace(/[^0-9]/g, '');
                                    const numericVal = rawVal ? parseInt(rawVal, 10) : 0;
                                    if (selectedDepForManage.currency !== 'VND') {
                                      const rate = parseFloat(selectedDepForManage.exchange_rate) || 1;
                                      const expectedVnd = Math.round(numericVal * rate);
                                      const updated = [...tempMilestones];
                                      updated[idx] = {
                                        ...updated[idx],
                                        original_amount: numericVal,
                                        expected_amount: expectedVnd
                                      };
                                      setTempMilestones(updated);
                                    } else {
                                      handleUpdateMilestoneField(idx, 'expected_amount', numericVal);
                                    }
                                  }}
                                  className="form-input"
                                  style={{ width: '100%', height: '34px', fontSize: '0.775rem', padding: '0 8px', borderRadius: '6px', fontVariantNumeric: 'tabular-nums' }}
                                />

                                {selectedDepForManage.currency !== 'VND' && (
                                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: '2px', paddingLeft: '4px', fontWeight: 600 }}>
                                    ≈ {formatNumberWithCommas(m.expected_amount)} VND
                                  </div>
                                )}
                              </div>

                              {/* Status + dates */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    padding: '4px 8px',
                                    borderRadius: '8px',
                                    background: m.status === 'approved' ? 'rgba(15, 23, 42, 0.08)' : m.status === 'paid' ? 'rgba(15, 23, 42, 0.04)' : m.status === 'failed' ? 'rgba(189, 29, 45, 0.08)' : 'rgba(100, 116, 139, 0.08)',
                                    color: m.status === 'approved' ? '#0F172A' : m.status === 'paid' ? '#475569' : m.status === 'failed' ? '#BD1D2D' : '#64748B',
                                    textAlign: 'center',
                                    display: 'inline-block',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {m.status === 'approved' ? 'Đã ghi nhận' : m.status === 'paid' ? 'Chờ ghi nhận' : m.status === 'failed' ? 'Từ chối' : 'Chờ nộp'}
                                  </span>
                                  {m.approval_date && m.status === 'approved' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                      <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 500, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                        {formatDateVN(m.approval_date)}
                                      </span>
                                      {m.actual_amount !== null && m.actual_amount !== undefined && selectedDepForManage.currency !== 'VND' && (
                                        <span style={{ fontSize: '0.65rem', color: '#0F172A', fontWeight: 700, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                          Thực nhận: {formatNumberWithCommas(m.actual_amount)} VND
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* UNC proof */}
                              <div style={{ display: 'flex', justifyContent: 'center', gap: '4px' }}>
                                {!m.unc_file_path && m.status !== 'approved' && canEditMilestones && (
                                  <label
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '6px',
                                      cursor: actioningMilestoneId !== null ? 'not-allowed' : 'pointer',
                                      border: '1px solid var(--color-border)',
                                      background: 'var(--color-surface)',
                                      color: 'var(--color-text-muted)',
                                      opacity: actioningMilestoneId !== null ? 0.5 : 1,
                                      pointerEvents: actioningMilestoneId !== null ? 'none' : 'auto',
                                      transition: 'all 0.15s'
                                    }}
                                    title="Tải chứng từ / UNC chuyển khoản"
                                  >
                                    <Upload size={13} />
                                    <input
                                      type="file"
                                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv,image/png,image/jpeg,image/webp,image/gif"
                                      style={{ display: 'none' }}
                                      disabled={actioningMilestoneId !== null}
                                      onChange={e => handleUploadUncFromModal(e, idx)}
                                    />
                                  </label>
                                )}

                                {m.unc_file_path && (() => {
                                  const downloadUrl = m.unc_file_path.startsWith('http')
  ? m.unc_file_path
  : m.unc_file_path.startsWith('uploads/') || m.unc_file_path.startsWith('/uploads/')
    ? `${import.meta.env.VITE_API_URL || '/backend'}${m.unc_file_path.startsWith('/') ? '' : '/'}${m.unc_file_path}`
    : `${import.meta.env.VITE_API_URL || '/backend'}/uploads/${m.unc_file_path}`;
                                  const isImg = /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(m.unc_file_path);
                                  return (
                                    <a
                                      href={downloadUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        border: '1px solid var(--color-border-light)',
                                        background: '#ffffff',
                                        boxShadow: 'var(--shadow-sm)',
                                        transition: 'transform 0.15s'
                                      }}
                                      className="hover-scale"
                                      title="Bấm để xem chi tiết minh chứng"
                                    >
                                      {isImg ? (
                                        <img 
                                          src={downloadUrl} 
                                          alt="Minh chứng" 
                                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        />
                                      ) : (
                                        <FileText size={16} color="var(--color-primary)" />
                                      )}
                                    </a>
                                  );
                                })()}
                              </div>

                              {/* Actions (Approve/Reject or Delete) */}
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'flex-end' }}>
                                {m.id && m.status !== 'approved' && (
                                  <button
                                    type="button"
                                    onClick={() => setPreviewReminderMilestone(m)}
                                    disabled={sendingReminderId === m.id}
                                    style={{
                                      background: 'rgba(15, 23, 42, 0.05)',
                                      border: '1px solid #E2E8F0',
                                      color: '#334155',
                                      padding: '0 8px',
                                      height: '30px',
                                      borderRadius: '6px',
                                      cursor: sendingReminderId === m.id ? 'not-allowed' : 'pointer',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      transition: 'all 0.15s ease'
                                    }}
                                    onMouseEnter={e => { if (sendingReminderId !== m.id) e.currentTarget.style.background = '#F1F5F9'; }}
                                    onMouseLeave={e => { if (sendingReminderId !== m.id) e.currentTarget.style.background = 'rgba(15, 23, 42, 0.05)'; }}
                                    title="Gửi nhắc nhở thanh toán ngay"
                                  >
                                    {sendingReminderId === m.id ? (
                                      <Loader2 size={13} className="animate-spin" />
                                    ) : (
                                      <Bell size={13} />
                                    )}
                                  </button>
                                )}
                                {canApproveMilestone && m.status !== 'approved' && (
                                  <button
                                    type="button"
                                    onClick={() => handleApproveFromModal(idx)}
                                    disabled={actioningMilestoneId !== null || approveInFlightRef.current}
                                    style={{
                                      padding: '0 8px',
                                      height: '30px',
                                      background: '#BD1D2D',
                                      color: 'white',
                                      border: 'none',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: actioningMilestoneId !== null ? 'not-allowed' : 'pointer',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      opacity: actioningMilestoneId !== null ? 0.6 : 1
                                    }}
                                    title="Ghi nhận đợt tiền này"
                                  >
                                    {actioningMilestoneId === m.id && actioningType === 'approve' && (
                                      <Loader2 size={13} className="animate-spin" style={{ marginRight: 4 }} />
                                    )}
                                    Ghi nhận
                                  </button>
                                )}


                                {!isLocked && canEditMilestones && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveMilestoneRow(idx)}
                                    style={{
                                      padding: '0 8px',
                                      height: '30px',
                                      color: '#BD1D2D',
                                      border: '1px solid rgba(189, 29, 45, 0.2)',
                                      background: 'transparent',
                                      borderRadius: '6px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      cursor: 'pointer',
                                      transition: 'all 0.15s'
                                    }}
                                    title="Xóa đợt thanh toán"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
                )}

                {/* Right Pane (Thảo luận & Lịch sử) */}
                {(!isMobile || mobileDrawerTab === 'discussion') && (
                <div style={{ flex: isMobile ? 1 : '0 0 420px', width: isMobile ? '100%' : 'auto', minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', borderLeft: isMobile ? 'none' : '1px solid var(--color-border)', background: '#f8f9fa' }}>
                  {/* Related Users (Watchers) Bar */}
                  {(() => {
                    const relIdsRaw = selectedDepForManage?.related_user_ids;
                    let relIds: number[] = [];
                    if (Array.isArray(relIdsRaw)) relIds = relIdsRaw.map(Number);
                    else if (typeof relIdsRaw === 'string' && relIdsRaw.trim()) {
                      try {
                        const parsed = JSON.parse(relIdsRaw);
                        if (Array.isArray(parsed)) relIds = parsed.map(Number);
                        else relIds = relIdsRaw.split(',').map(s => Number(s.trim())).filter(Boolean);
                      } catch {
                        relIds = relIdsRaw.split(',').map(s => Number(s.trim())).filter(Boolean);
                      }
                    }
                    const relUsers = ensureArray(relIds).map(numId => {
                      const found = ensureArray(availableUsers).find((u: any) => Number(u.id) === numId);
                      if (found) return found;
                      return { id: numId, name: `User #${numId}`, full_name: `User #${numId}` };
                    });

                    const availableUsersToAdd = ensureArray(availableUsers).filter((u: any) => 
                      !relIds.includes(Number(u.id)) &&
                      (u.full_name || u.name || '').toLowerCase().includes(watcherSearch.toLowerCase())
                    );

                    return (
                      <div style={{
                        padding: '10px 14px',
                        background: 'var(--color-surface)',
                        borderBottom: '1px solid var(--color-border-light)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                            {t('Người liên quan (Theo dõi)')} ({relUsers.length})
                          </span>

                          <div style={{ position: 'relative' }} ref={addWatcherDropdownRef}>
                            <button
                              type="button"
                              onClick={() => setShowAddWatcherDropdown(!showAddWatcherDropdown)}
                              disabled={savingWatchers}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                border: '1px dashed var(--color-primary)',
                                background: 'rgba(189, 29, 45, 0.04)',
                                color: 'var(--color-primary)',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              <Plus size={12} />
                              <span>{t('Thêm')}</span>
                            </button>

                            {showAddWatcherDropdown && (
                              <div style={{
                                position: 'absolute',
                                right: 0,
                                top: '100%',
                                marginTop: '4px',
                                width: '240px',
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                borderRadius: '10px',
                                boxShadow: 'var(--shadow-lg)',
                                padding: '8px',
                                zIndex: 2147483645,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--color-bg)', borderRadius: '6px', border: '1px solid var(--color-border-light)' }}>
                                  <input
                                    type="text"
                                    placeholder={t('Tìm nhân sự...')}
                                    value={watcherSearch}
                                    onChange={e => setWatcherSearch(e.target.value)}
                                    autoFocus
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.75rem', width: '100%', color: 'var(--color-text)' }}
                                  />
                                </div>
                                <div className="custom-scrollbar" style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {availableUsersToAdd.length === 0 ? (
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '8px' }}>
                                      {t('Không có nhân sự phù hợp')}
                                    </div>
                                  ) : (
                                    availableUsersToAdd.map((u: any) => (
                                      <div
                                        key={u.id}
                                        onClick={() => {
                                          handleUpdateWatchers([...relIds, Number(u.id)]);
                                          setShowAddWatcherDropdown(false);
                                          setWatcherSearch('');
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '8px',
                                          padding: '6px 8px',
                                          borderRadius: '6px',
                                          cursor: 'pointer',
                                          transition: 'background 0.15s ease'
                                        }}
                                        className="hover-bg"
                                      >
                                        <Avatar src={u.avatar_url || u.avatar} name={u.full_name || u.name} size={20} />
                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {u.full_name || u.name}
                                          </span>
                                          {u.role && <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>{u.role}</span>}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {relUsers.map((u: any) => (
                            <div key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 6px 3px 8px', background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '10px' }}>
                              <Avatar src={u.avatar_url || u.avatar} name={u.full_name || u.name} size={18} />
                              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)' }}>{u.full_name || u.name}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateWatchers(relIds.filter(id => id !== Number(u.id)));
                                }}
                                title={t('Xóa người theo dõi')}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: 'var(--color-text-muted)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '1px',
                                  borderRadius: '50%'
                                }}
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                          {relUsers.length === 0 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                              {t('Chưa có người theo dõi. Tag @tên trong bình luận hoặc bấm "+ Thêm".')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Tabs */}
                  <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: '#f8f9fa', padding: '0 8px' }}>
                    <button
                      type="button"
                      onClick={() => setActiveDrawerTab('comments')}
                      style={{
                        flex: 1,
                        padding: '14px 10px',
                        border: 'none',
                        background: 'none',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: activeDrawerTab === 'comments' ? '#BD1D2D' : '#64748B',
                        borderBottom: activeDrawerTab === 'comments' ? '2px solid #BD1D2D' : '2px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <MessageSquare size={14} />
                      Thảo luận ({comments.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDrawerTab('history')}
                      style={{
                        flex: 1,
                        padding: '14px 10px',
                        border: 'none',
                        background: 'none',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: activeDrawerTab === 'history' ? '#BD1D2D' : '#64748B',
                        borderBottom: activeDrawerTab === 'history' ? '2px solid #BD1D2D' : '2px solid transparent',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Activity size={14} />
                      Hoạt động ({historyLogs.length})
                    </button>
                  </div>

                  {/* Tab contents */}
                  <div ref={commentsContainerRef} className="custom-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', background: '#f8f9fa' }}>
                    {activeDrawerTab === 'comments' ? (
                      <>
                        {loadingComments ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0', color: 'var(--color-text-muted)' }}>
                            <Loader2 size={20} className="animate-spin" />
                          </div>
                        ) : ensureArray(comments).length === 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: 'var(--color-text-muted)', gap: '8px' }}>
                            <MessageSquare size={28} style={{ opacity: 0.4 }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Chưa có thảo luận nào cho giao dịch này</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {ensureArray(comments).map((c) => {
                              const isCurrentUserAdmin = Boolean(user && (isExecutive(user) || hasPermission('deposits', 'approve')));
                              const isCommentAuthor = user?.id && String(user.id) === String(c.user_id);
                              const canDeleteComment = isCurrentUserAdmin || isCommentAuthor;
                              const searchParams = new URLSearchParams(window.location.search);
                              const highlightCommentId = searchParams.get('highlight_comment_id') || searchParams.get('comment_id');
                              const isHighlighted = highlightCommentId && String(c.id) === String(highlightCommentId);

                              return (
                                <div 
                                  key={c.id} 
                                  id={`deposit-comment-${c.id}`}
                                  style={{ 
                                    display: 'flex', 
                                    gap: '12px', 
                                    background: isHighlighted ? 'rgba(189, 29, 45, 0.06)' : 'var(--color-surface, #fff)', 
                                    border: isHighlighted ? '2px solid #BD1D2D' : '1px solid var(--color-border-light)', 
                                    padding: '14px 18px', 
                                    borderRadius: '16px',
                                    boxShadow: isHighlighted ? '0 0 12px rgba(189, 29, 45, 0.14)' : '0 2px 8px rgba(0, 0, 0, 0.02)',
                                    boxSizing: 'border-box',
                                    transition: 'all 0.3s ease'
                                  }}
                                >
                                  <Avatar src={c.avatar_url} name={c.user_name} size={32} />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-text)' }}>{c.user_name}</span>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                          {new Date(c.created_at).toLocaleString('vi-VN')}
                                        </span>
                                        {canDeleteComment && (
                                          <button
                                            type="button"
                                            onClick={() => setCommentToDelete(c.id)}
                                            style={{ 
                                              background: 'none', 
                                              border: 'none', 
                                              color: '#BD1D2D', 
                                              cursor: 'pointer', 
                                              display: 'inline-flex', 
                                              alignItems: 'center', 
                                              padding: '4px' 
                                            }}
                                            className="hover-scale"
                                            title={t('Xóa bình luận')}
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <div style={{ marginTop: '6px', textAlign: 'left' }}>
                                      {c.body && (/<[a-z][\s\S]*>/i.test(c.body) || /[📕📄📊📝📦🖼️📎]/.test(c.body)) ? (
                                        <div 
                                          className="rich-comment-content"
                                          dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatCommentBody(c.body)) }}
                                          style={{ fontSize: '0.825rem', color: 'var(--color-text-light)', lineHeight: '1.45', textAlign: 'left' }}
                                        />
                                      ) : (
                                        <div style={{ fontSize: '0.825rem', color: 'var(--color-text-light)', lineHeight: '1.45', whiteSpace: 'pre-wrap', textAlign: 'left', wordBreak: 'break-word' }}>
                                          {c.body}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            <div ref={commentEndRef} />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {loadingHistory ? (
                          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0', color: 'var(--color-text-muted)' }}>
                            <Loader2 size={20} className="animate-spin" />
                          </div>
                        ) : ensureArray(historyLogs).length === 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: 'var(--color-text-muted)', gap: '8px' }}>
                            <Clock size={28} style={{ opacity: 0.4 }} />
                            <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>Chưa ghi nhận lịch sử chỉnh sửa nào</span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', position: 'relative', paddingLeft: '28px' }}>
                            {/* Vertical Line */}
                            <div style={{ position: 'absolute', top: '18px', bottom: '18px', left: '12px', width: '2px', background: 'var(--color-border-light, #e2e8f0)' }} />
                            
                            {ensureArray(historyLogs).map((log) => {
                              let actionLabel = log.action;
                              let actionColor = '#334155';
                              if (log.action === 'CREATE_DEPOSIT') {
                                actionLabel = 'Khởi tạo quy trình thanh toán';
                                actionColor = '#334155';
                              } else if (log.action === 'APPROVE_DEPOSIT_MILESTONE') {
                                actionLabel = 'Duyệt đợt tiền';
                                actionColor = '#0F172A';
                              } else if (log.action === 'REJECT_DEPOSIT_MILESTONE') {
                                actionLabel = 'Từ chối UNC';
                                actionColor = '#BD1D2D';
                              } else if (log.action === 'CANCEL_DEPOSIT') {
                                actionLabel = 'Báo bể cọc (Hủy giao dịch)';
                                actionColor = '#BD1D2D';
                              } else if (log.action === 'UPDATE_COMMISSION') {
                                actionLabel = 'Cập nhật hoa hồng dự kiến';
                                actionColor = '#475569';
                              } else if (log.action === 'UPDATE_SHARES' || log.action === 'ADMIN_UPDATE_COOP_SHARES') {
                                actionLabel = 'Cập nhật hoa hồng co-op';
                                actionColor = '#0F172A';
                              } else if (log.action === 'UPDATE_MILESTONES') {
                                actionLabel = 'Cập nhật các đợt cọc';
                                actionColor = '#475569';
                              } else if (log.action === 'UPLOAD_DEPOSIT_UNC') {
                                actionLabel = 'Tải lên minh chứng (UNC)';
                                actionColor = '#64748B';
                              }
                              
                              return (
                                <div key={log.id} style={{ position: 'relative' }}>
                                  {/* Timeline dot */}
                                  <div style={{
                                    position: 'absolute',
                                    top: '18px',
                                    left: '-21px',
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '50%',
                                    background: '#cbd5e1',
                                    border: '2px solid var(--color-surface, #fff)',
                                    boxShadow: '0 0 0 3px rgba(0, 0, 0, 0.03)',
                                    zIndex: 2
                                  }} />

                                  {/* Compact List Item (Borderless/Backgroundless) */}
                                  <div 
                                    style={{ 
                                      display: 'flex', 
                                      gap: '10px', 
                                      background: 'transparent', 
                                      border: 'none', 
                                      padding: '6px 0', 
                                      borderRadius: '0',
                                      boxShadow: 'none'
                                    }}
                                  >
                                    {/* User Avatar */}
                                    <Avatar src={log.avatar_url} name={log.user_name || 'Hệ thống'} size={24} />
                                    
                                    {/* Log details */}
                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                          {log.user_name || 'Hệ thống'}
                                        </span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>•</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                          {new Date(log.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                                        </span>
                                      </div>
                                      <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', lineHeight: 1.4, textAlign: 'left', wordBreak: 'break-word' }}>
                                        <span style={{ 
                                          color: actionColor, 
                                          fontWeight: 700,
                                          background: `${actionColor}12`,
                                          padding: '1px 6px',
                                          borderRadius: '4px',
                                          fontSize: '0.68rem',
                                          marginRight: '6px',
                                          display: 'inline-block'
                                        }}>
                                          {actionLabel}
                                        </span>
                                        <span>{log.new_data}</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Send Comment Input */}
                  {activeDrawerTab === 'comments' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--color-border)', padding: '12px', background: '#f8f9fa' }}>
                      <div style={{ background: '#ffffff', border: '1px solid var(--color-border-light)', padding: '10px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: 'var(--shadow-sm)' }}>
                        <MentionInput
                          value={newCommentText}
                          onChange={(e: any) => setNewCommentText(e.target.value)}
                          placeholder="Viết bình luận... Gõ @ để nhắc tên"
                          style={{ 
                            width: '100%', 
                            minHeight: '65px', 
                            border: 'none', 
                            borderRadius: 0, 
                            outline: 'none', 
                            background: 'transparent', 
                            color: 'var(--color-text)', 
                            boxSizing: 'border-box'
                          }}
                          disabled={isSubmittingComment}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '6px', borderTop: '1px dashed var(--color-border-light)' }}>
                          {(() => {
                            const hasContent = newCommentText.includes('<img') || 
                                               newCommentText.includes('comment-attachment-chip') || 
                                               newCommentText.includes('<a') ||
                                               !!(newCommentText && newCommentText.replace(/<[^>]*>/g, '').trim());
                            return (
                              <button
                                type="button"
                                disabled={isSubmittingComment || !hasContent || addCommentInFlightRef.current}
                                onClick={handleAddComment}
                                className="btn primary sm"
                                style={{
                                  padding: '6px 18px',
                                  fontSize: '0.78rem',
                                  borderRadius: '20px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  background: '#BD1D2D',
                                  borderColor: '#BD1D2D',
                                  color: '#fff',
                                  cursor: hasContent ? 'pointer' : 'not-allowed',
                                  opacity: hasContent ? 1 : 0.6,
                                  border: 'none'
                                }}
                              >
                                {isSubmittingComment ? (
                                  <>
                                    <Loader2 size={13} className="spin animate-spin" /> Đang gửi...
                                  </>
                                ) : (
                                  <>
                                    <Send size={13} /> <span>Gửi</span>
                                  </>
                                )}
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit SO Modal for Accountant & Admin */}
      <CustomModal
        isOpen={isEditSOOpen}
        onClose={() => setIsEditSOOpen(false)}
        title="Chỉnh sửa thông tin đơn hàng / SO"
        width="650px"
        zIndex={modalNestedZ}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '75vh', overflowY: 'auto', padding: '4px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Họ và tên khách hàng *</label>
              <input
                type="text"
                className="form-input"
                value={editFullName}
                onChange={e => setEditFullName(e.target.value)}
                placeholder="Nhập tên khách hàng..."
                required
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Số điện thoại</label>
              <input
                type="text"
                className="form-input"
                value={editPhone}
                onChange={e => setEditPhone(e.target.value)}
                placeholder="09..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Email khách hàng</label>
              <input
                type="email"
                className="form-input"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Chương trình đào tạo *</label>
              <CustomSelect
                options={ensureArray(availableProjects).map(p => ({ value: String(p.id), label: `${p.name} (${p.code || p.id})` }))}
                value={editProjectId}
                onChange={val => setEditProjectId(val)}
                placeholder="Chọn chương trình..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Mã căn / Lớp / Hồ sơ</label>
              <input
                type="text"
                className="form-input"
                value={editUnitCode}
                onChange={e => setEditUnitCode(e.target.value)}
                placeholder="Mã hồ sơ, lớp..."
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Tư vấn viên (TVV) phụ trách</label>
              <CustomSelect
                options={ensureArray(availableUsers).map(u => ({ value: String(u.id), label: `${u.name || u.full_name} (${u.email || u.role})` }))}
                value={editCreatedBy}
                onChange={val => setEditCreatedBy(val)}
                placeholder="Chọn tư vấn viên..."
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr 1fr', gap: '12px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Tổng doanh thu dự kiến *</label>
              <CurrencyInput
                value={editPrice}
                onChange={val => setEditPrice(val)}
                placeholder="0"
                currency={editCurrency}
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Loại tiền tệ</label>
              <CustomSelect
                options={(ensureArray<string>(fxConfig?.supported).length > 0 ? ensureArray<string>(fxConfig.supported) : ['VND', 'USD', 'EUR', 'AUD', 'GBP', 'SGD']).map(c => ({
                  value: String(c).toUpperCase(),
                  label: String(c).toUpperCase(),
                }))}
                value={editCurrency}
                onChange={val => {
                  const nextCurr = String(val).toUpperCase();
                  setEditCurrency(nextCurr);
                  if (nextCurr === 'VND') {
                    setEditExchangeRate(1);
                  } else if (fxConfig?.rates_to_vnd?.[nextCurr]) {
                    setEditExchangeRate(Number(fxConfig.rates_to_vnd[nextCurr]) || 25000);
                  }
                }}
              />
            </div>

            {editCurrency !== 'VND' ? (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Tỷ giá quy đổi</label>
                <input
                  type="number"
                  min={1}
                  step="any"
                  className="form-input"
                  value={editExchangeRate}
                  onChange={e => setEditExchangeRate(Math.max(1, parseFloat(e.target.value) || 1))}
                  placeholder="25000"
                />
              </div>
            ) : (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Hoa hồng dự kiến</label>
                <CurrencyInput
                  value={editExpectedCommissionVal}
                  onChange={val => setEditExpectedCommissionVal(val)}
                  placeholder="0"
                  currency="VND"
                />
              </div>
            )}
          </div>

          {editCurrency !== 'VND' && (
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Hoa hồng dự kiến (VND)</label>
              <CurrencyInput
                value={editExpectedCommissionVal}
                onChange={val => setEditExpectedCommissionVal(val)}
                placeholder="0"
                currency="VND"
              />
            </div>
          )}

          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: 700, fontSize: '0.8rem' }}>Ghi chú đơn hàng</label>
            <textarea
              className="form-input"
              rows={3}
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Ghi chú thêm về đơn hàng hoặc các lưu ý kế toán..."
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '10px', borderTop: '1px solid var(--color-border-light)' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => setIsEditSOOpen(false)}
              disabled={isSavingSOInfo}
            >
              Hủy
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={handleSaveSOInfo}
              disabled={isSavingSOInfo || saveSOInfoInFlightRef.current}
              style={{ minWidth: '120px' }}
            >
              {isSavingSOInfo ? (
                <>
                  <Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} /> Đang lưu...
                </>
              ) : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      </CustomModal>

      {/* Cancel Transaction Modal */}
      <CustomModal
        isOpen={isCancelOpen}
        onClose={() => setIsCancelOpen(false)}
        title="Yêu cầu hủy giao dịch"
        width="400px"
        zIndex={modalNestedZ}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontWeight: 700 }}>Lý do hủy giao dịch *</label>
            <textarea
              className="form-input"
              rows={4}
              placeholder="Nhập lý do chi tiết hủy giao dịch (khách báo hủy, bể cọc, đổi mã hồ sơ, v.v.)..."
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              required
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button type="button" className="btn secondary" onClick={() => setIsCancelOpen(false)} disabled={isSaving}>Hủy</button>
            <button type="button" className="btn primary" style={{ background: '#BD1D2D', color: 'white', border: 'none' }} onClick={handleCancelDeposit} disabled={isSaving || cancelDepositInFlightRef.current}>
              {isSaving ? 'Đang thực hiện...' : 'Xác nhận hủy'}
            </button>
          </div>
        </div>
      </CustomModal>

      {/* Send manual reminder confirmation modal with compiled HTML preview */}
      <CustomModal
        isOpen={!!previewReminderMilestone}
        onClose={() => setPreviewReminderMilestone(null)}
        title="Xem trước & Gửi nhắc lịch thanh toán"
        width="650px"
        zIndex={modalNestedZ}
      >
        {previewReminderMilestone && (() => {
          const caretakerUser = sharesData && sharesData.length > 0 ? sharesData[0] : null;
          const saleName = caretakerUser?.name || selectedDepForManage.contact_owner_name || selectedDepForManage.creator_name || 'Sale chăm sóc';
          const saleEmail = caretakerUser?.email || selectedDepForManage.contact_owner_email || selectedDepForManage.creator_email || '';
          const custName = (selectedDepForManage.full_name || '').trim();
          const custEmail = (selectedDepForManage.email || '').trim();

          const amountStr = (selectedDepForManage.currency !== 'VND' && previewReminderMilestone.original_amount !== null && previewReminderMilestone.original_amount !== undefined)
            ? `${formatMoney(previewReminderMilestone.original_amount, selectedDepForManage.currency)} (≈ ${formatMoney(previewReminderMilestone.expected_amount, 'VND')})`
            : formatMoney(previewReminderMilestone.expected_amount, 'VND');
          const payDateStr = previewReminderMilestone.expected_pay_date ? formatDateVN(previewReminderMilestone.expected_pay_date) : '—';
          const studentIdStr = selectedDepForManage.student_id || selectedDepForManage.unit_code || '—';

          const isSendSale = manualRemindTarget === 2;
          const isSendCustomer = manualRemindTarget === 1;
          const isSendBoth = manualRemindTarget === 3;

          const subject = isSendCustomer
            ? `${getTenantBrandPrefix()} Nhắc nhở lịch thanh toán: ${previewReminderMilestone.milestone_name}`
            : `${getTenantBrandPrefix()} Nhắc lịch thanh toán của khách hàng: ${custName}`;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Option Selector */}
              <div>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '8px' }}>
                  Chọn đối tượng nhận thông báo
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  <div
                    onClick={() => setManualRemindTarget(2)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: `1.5px solid ${isSendSale ? '#BD1D2D' : 'var(--color-border)'}`,
                      background: isSendSale ? 'rgba(189, 29, 45, 0.05)' : 'var(--color-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="radio" checked={isSendSale} onChange={() => setManualRemindTarget(2)} style={{ accentColor: '#BD1D2D' }} />
                      <span style={{ fontSize: '0.825rem', fontWeight: 700, color: isSendSale ? '#BD1D2D' : 'var(--color-text)' }}>
                        Nhắc cho Sale
                      </span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: 1.25 }}>
                      Mặc định: Gửi email nhắc tư vấn viên liên hệ
                    </span>
                  </div>

                  <div
                    onClick={() => setManualRemindTarget(1)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: `1.5px solid ${isSendCustomer ? '#BD1D2D' : 'var(--color-border)'}`,
                      background: isSendCustomer ? 'rgba(189, 29, 45, 0.05)' : 'var(--color-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="radio" checked={isSendCustomer} onChange={() => setManualRemindTarget(1)} style={{ accentColor: '#BD1D2D' }} />
                      <span style={{ fontSize: '0.825rem', fontWeight: 700, color: isSendCustomer ? '#BD1D2D' : 'var(--color-text)' }}>
                        Gửi Khách hàng
                      </span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: 1.25 }}>
                      Gửi trực tiếp hòm thư của khách hàng
                    </span>
                  </div>

                  <div
                    onClick={() => setManualRemindTarget(3)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: `1.5px solid ${isSendBoth ? '#BD1D2D' : 'var(--color-border)'}`,
                      background: isSendBoth ? 'rgba(189, 29, 45, 0.05)' : 'var(--color-surface)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <input type="radio" checked={isSendBoth} onChange={() => setManualRemindTarget(3)} style={{ accentColor: '#BD1D2D' }} />
                      <span style={{ fontSize: '0.825rem', fontWeight: 700, color: isSendBoth ? '#BD1D2D' : 'var(--color-text)' }}>
                        Gửi cả hai
                      </span>
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', lineHeight: 1.25 }}>
                      Gửi đồng thời cả Sale và Khách hàng
                    </span>
                  </div>
                </div>
              </div>

              {/* Recipient Info Bar */}
              <div style={{ 
                background: 'var(--color-bg-light, #f8fafc)', 
                border: '1px solid var(--color-border)', 
                borderRadius: '8px', 
                padding: '8px 12px',
                fontSize: '0.78rem',
                color: 'var(--color-text)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ fontWeight: 700, color: 'var(--color-text-muted)' }}>Người nhận:</span>
                {isSendSale && (
                  <span><strong>{saleName}</strong> {saleEmail ? `<${saleEmail}>` : '(Email Sale theo tài khoản)'}</span>
                )}
                {isSendCustomer && (
                  <span>
                    <strong>{custName}</strong> {custEmail ? `<${custEmail}>` : <span style={{ color: '#BD1D2D', fontWeight: 600 }}>(Khách hàng chưa có email - sẽ gửi fallback về Sale)</span>}
                  </span>
                )}
                {isSendBoth && (
                  <span>
                    Khách hàng: <strong>{custName}</strong> {custEmail ? `<${custEmail}>` : '(Chưa có email)'} &bull; Sale: <strong>{saleName}</strong> {saleEmail ? `<${saleEmail}>` : ''}
                  </span>
                )}
              </div>

              {/* Subject */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>Tiêu đề Email</span>
                <div style={{ background: 'var(--color-bg-light)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--color-border)', fontSize: '0.82rem', fontWeight: 600 }}>
                  {subject}
                </div>
              </div>

              {/* Compiled HTML Email Preview Box */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                  Xem trước nội dung Email (Compiled HTML)
                </span>
                <div style={{
                  border: '1px solid #cbd5e1',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#f8fafc',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  maxHeight: '340px',
                  overflowY: 'auto'
                }}>
                  {/* Email Header */}
                  <div style={{ background: '#BD1D2D', padding: '16px 20px', textAlign: 'center' }}>
                    <h2 style={{ color: '#ffffff', fontSize: '20px', margin: 0, fontWeight: 700, letterSpacing: '0.08em', fontFamily: 'system-ui, sans-serif' }}>
                      {config?.organization?.short_name || config?.organization?.name || 'MYERP'}
                    </h2>
                    <p style={{ color: 'rgba(255,255,255,0.9)', fontSize: '10.5px', margin: '4px 0 0', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                      THÔNG BÁO NHẮC LỊCH THANH TOÁN
                    </p>
                  </div>

                  {/* Email Body Card */}
                  <div style={{ padding: '20px', background: '#ffffff', margin: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div style={{ background: '#f8fafc', borderLeft: '4px solid #BD1D2D', padding: '14px 16px', borderRadius: '0 6px 6px 0', border: '1px solid #e2e8f0', borderLeftWidth: '4px', marginBottom: '14px' }}>
                      <h4 style={{ color: '#0f172a', margin: '0 0 8px', fontSize: '14px', fontWeight: 700 }}>
                        {isSendCustomer ? 'NHẮC NHỞ THANH TOÁN' : 'NHẮC NHỞ TƯ VẤN VIÊN CHĂM SÓC'}
                      </h4>
                      <p style={{ margin: '0 0 10px', color: '#334155', fontSize: '13px', lineHeight: 1.5 }}>
                        Chào <strong>{isSendCustomer ? custName : saleName}</strong>,<br />
                        {isSendCustomer ? (
                          <>Đây là thông báo nhắc lịch thanh toán theo hợp đồng cho đợt: <strong>{previewReminderMilestone.milestone_name}</strong>.</>
                        ) : (
                          <>Hệ thống gửi thông báo nhắc lịch thanh toán của khách hàng <strong>{custName}</strong> (SĐT: {selectedDepForManage.phone || '—'}). Vui lòng chủ động liên hệ nhắc nhở khách hàng thanh toán đúng tiến độ.</>
                        )}
                      </p>

                      {/* Info Table */}
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '5px 0', color: '#64748b', width: '130px' }}>Họ và tên:</td>
                            <td style={{ padding: '5px 0', fontWeight: 600, color: '#0f172a' }}>{custName}</td>
                          </tr>
                          {studentIdStr && studentIdStr !== '—' && (
                            <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '5px 0', color: '#64748b' }}>Mã hồ sơ:</td>
                              <td style={{ padding: '5px 0', fontWeight: 600, color: '#0f172a' }}>{studentIdStr}</td>
                            </tr>
                          )}
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '5px 0', color: '#64748b' }}>Chương trình:</td>
                            <td style={{ padding: '5px 0', fontWeight: 600, color: '#0f172a' }}>{selectedDepForManage.project_name}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '5px 0', color: '#64748b' }}>Đợt thanh toán:</td>
                            <td style={{ padding: '5px 0', fontWeight: 600, color: '#0f172a' }}>{previewReminderMilestone.milestone_name}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <td style={{ padding: '5px 0', color: '#64748b' }}>Số tiền cần đóng:</td>
                            <td style={{ padding: '5px 0', fontWeight: 800, color: '#BD1D2D', fontSize: '13.5px' }}>{amountStr}</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '5px 0', color: '#64748b' }}>Hạn thanh toán:</td>
                            <td style={{ padding: '5px 0', fontWeight: 600, color: '#0f172a' }}>{payDateStr}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#64748b', lineHeight: 1.5 }}>
                      Vui lòng hoàn tất thanh toán và gửi hình ảnh Ủy nhiệm chi (UNC) cho bộ phận phụ trách hoặc phản hồi email này.
                    </p>

                    {!isSendCustomer && (
                      <div style={{ textAlign: 'center', margin: '14px 0 6px' }}>
                        <span style={{ display: 'inline-block', background: '#BD1D2D', color: '#ffffff', padding: '8px 20px', borderRadius: '6px', fontWeight: 700, fontSize: '11.5px', textTransform: 'uppercase' }}>
                          ĐĂNG NHẬP HỆ THỐNG
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Email Footer */}
                  <div style={{ background: '#f8fafc', padding: '10px 16px', textAlign: 'center', borderTop: '1px solid #e2e8f0', color: '#94a3b8', fontSize: '11px' }}>
                    &copy; {new Date().getFullYear()} {config?.organization?.name || 'MYERP'}. All rights reserved.
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button 
                  type="button" 
                  className="btn secondary" 
                  onClick={() => setPreviewReminderMilestone(null)}
                  disabled={sendingReminderId === previewReminderMilestone.id}
                >
                  Hủy
                </button>
                <button 
                  type="button" 
                  className="btn primary" 
                  disabled={sendingReminderId === previewReminderMilestone.id || sendManualReminderInFlightRef.current}
                  onClick={async () => {
                    const mid = previewReminderMilestone.id;
                    const choice = manualRemindTarget;
                    setPreviewReminderMilestone(null);
                    await handleSendManualReminder(mid, choice);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#BD1D2D', borderColor: '#BD1D2D' }}
                >
                  {sendingReminderId === previewReminderMilestone.id ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                  Xác nhận gửi thông báo
                </button>
              </div>
            </div>
          );
        })()}
      </CustomModal>
      {commentToDelete !== null && (
        <ConfirmModal
          isOpen={commentToDelete !== null}
          onClose={() => setCommentToDelete(null)}
          onConfirm={async () => {
            if (commentToDelete !== null) {
              await handleDeleteComment(commentToDelete);
              setCommentToDelete(null);
            }
          }}
          title="Xác nhận xóa bình luận"
          message="Bạn có chắc chắn muốn xóa bình luận này không? Hành động này không thể hoàn tác."
          zIndex={modalNestedZ}
        />
      )}
      {showDirtyCloseConfirm && (
        <ConfirmModal
          isOpen={showDirtyCloseConfirm}
          onClose={() => setShowDirtyCloseConfirm(false)}
          onConfirm={() => {
            setShowDirtyCloseConfirm(false);
            forceCloseDrawer();
          }}
          title="Thay đổi chưa được lưu"
          message="Bạn đã chỉnh sửa thông tin đợt thanh toán hoặc tỷ lệ hoa hồng nhưng chưa bấm Lưu lịch trình. Bạn có chắc muốn đóng và bỏ qua thay đổi?"
          confirmText="Đóng không lưu"
          cancelText="Ở lại"
          confirmType="danger"
          zIndex={modalNestedZ}
        />
      )}
    </>,
    document.body
  );
};
