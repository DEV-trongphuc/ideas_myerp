import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, XCircle, CheckCircle2, Pencil, Wallet, Clock, Package, MessageSquare, Loader2, Coffee, Trash2, Upload, Send, Info, Copy, Activity, Bell, FileText, Landmark, QrCode, Receipt, Eye } from 'lucide-react';
import api from '../api/axios';
import { Avatar } from './ui/Avatar';
import { useUIStore } from '../store/uiStore';
import { MentionInput } from './ui/MentionInput';
import { ProcessFeed } from './ui/ProcessFeed';
import { compressToWebP } from '../utils/imageCompress';
import { numberToVietnameseText } from '../utils/numberToText';
import { NoteDetailModal, NoteCell, renderLinkifiedText } from './ui/NoteDetailModal';
import { QrImageModal } from './ui/QrImageModal';
import { getVietQrUrl, normalizeVietQrText } from '../utils/vietnamBanks';
import { AttachmentLightboxModal, type AttachmentItem } from './ui/AttachmentLightboxModal';
import { CustomSelect } from './ui/CustomSelect';
import { CustomModal } from './ui/CustomModal';
import { ConfirmModal } from './ui/ConfirmModal';
import { formatWaitDuration } from '../utils/approvalFormatting';
import { DrawerSkeleton } from './ui/Skeleton';
import { pushOverlay } from '../utils/overlayStack';
import { ensureArray, extractArray } from '../utils/safeArray';
import { ResponsiveActionGroup } from './ui/MobileResponsiveTabs';
import { useTypedSetting } from '../contexts/SettingsBootstrapContext';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { getLocalDateStr, formatDateTimeVN } from '../utils/dateUtils';
import { isExecutive, isManagement, isAccountant, isViewer as checkIsViewer } from '../utils/roleUtils';

const FMT = (n: number, currency: string = 'VND') => {
  const safeNum = Number(n);
  if (!Number.isFinite(safeNum)) return '0 đ';
  const rawCurr = (currency || 'VND').toUpperCase().trim();
  const norm = rawCurr === 'EURO' ? 'EUR' : rawCurr;
  if (norm === 'VND') {
    return Math.round(safeNum).toLocaleString('vi-VN') + ' đ';
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: norm
    }).format(safeNum);
  } catch {
    return `${safeNum.toLocaleString('en-US')} ${norm}`;
  }
};

const formatTimestamp = (raw: any) => {
  if (!raw) return '—';
  return formatDateTimeVN(raw) || '—';
};

const getAvatarStatusRingStyle = (border?: string): React.CSSProperties => {
  const b = (border || '#f59e0b').toLowerCase();
  let ringColor = 'rgba(245, 158, 11, 0.28)';
  let borderColor = '#f59e0b';

  if (b.includes('0f172a') || b.includes('10b981') || b.includes('34c759') || b.includes('green') || b === 'approved') {
    borderColor = '#10b981';
    ringColor = 'rgba(16, 185, 129, 0.28)';
  } else if (b.includes('bd1d2d') || b.includes('ef4444') || b.includes('red') || b === 'rejected') {
    borderColor = '#ef4444';
    ringColor = 'rgba(239, 68, 68, 0.28)';
  } else if (b.includes('cbd5e1') || b.includes('gray') || b.includes('slate') || b === 'not_reached') {
    borderColor = '#cbd5e1';
    ringColor = 'rgba(203, 213, 225, 0.4)';
  }

  return {
    borderRadius: '50%',
    padding: '1.5px',
    margin: '2px 4px 2px 2px',
    border: `2px solid ${borderColor}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: `0 0 0 2px ${ringColor}`,
    transition: 'border-color 0.2s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
  };
};

interface ExpenseQuickViewDrawerProps {
  expenseId: number | null;
  initialItem?: any;
  onClose: () => void;
  user: any;
  onStatusChange?: () => void;
  onEditClick?: (item: any) => void;
  zIndex?: number;
}

export const ExpenseQuickViewDrawer: React.FC<ExpenseQuickViewDrawerProps> = ({
  expenseId,
  initialItem,
  onClose,
  user,
  onStatusChange,
  onEditClick,
  zIndex
}) => {
  const { hasPermission } = useTenantConfig();
  const overlayUi = useTypedSetting<{ z_backdrop?: number; z_drawer?: number; z_modal_nested?: number; motion_ms?: number }>('ui.overlay_zindex_and_motion_ms', {
    z_backdrop: 2147483620,
    z_drawer: 2147483625,
    z_modal_nested: 2147483646,
    motion_ms: 220,
  });
  const fxConfig = useTypedSetting<{ rates_to_vnd?: Record<string, number> }>('finance.currency_and_fx_rates', {
    rates_to_vnd: { VND: 1, USD: 25400, EUR: 27500, GBP: 32000, JPY: 170, SGD: 18900, AUD: 16500, CAD: 18500, CHF: 28500 },
  });
  const vatPolicy = useTypedSetting<{ vat_rates?: number[] }>('finance.vat_and_cit_policy', { vat_rates: [0, 5, 8, 10] });
  const vietQrConfig = useTypedSetting<{ template?: string; memo_prefix?: string }>('finance.vietqr_config', {
    template: 'compact2',
    memo_prefix: 'Thanh toan',
  });
  const uploadPolicy = useTypedSetting<{ max_mb?: number; forbidden_exts?: string[] }>('core.upload_security_policy', {
    max_mb: 50,
    forbidden_exts: ['php', 'phtml', 'php3', 'php4', 'php5', 'phar', 'exe', 'bat', 'cmd', 'sh', 'js', 'mjs', 'cjs', 'html', 'htm', 'svg', 'asp', 'aspx', 'jsp', 'py', 'rb', 'pl', 'cgi', 'htaccess'],
  });

  const defaultPanelZ = Number(overlayUi.z_drawer || 2147483625);
  const panelZ = Math.min(Math.max(zIndex ?? defaultPanelZ, defaultPanelZ), 2147483644);
  const backdropZ = zIndex ? Math.max(panelZ - 2, 2147483620) : Number(overlayUi.z_backdrop || 2147483620);
  const modalNestedZ = Math.min(Math.max(panelZ + 2, Number(overlayUi.z_modal_nested || 2147483646)), 2147483647);
  const motionMs = Math.max(150, Math.min(400, Number(overlayUi.motion_ms || 220)));
  const motionSec = motionMs / 1000;
  const maxUploadMb = Math.max(1, Number(uploadPolicy.max_mb || 50));
  const forbiddenUploadExts = useMemo(
    () => ensureArray<string>(uploadPolicy.forbidden_exts).map(x => String(x).toLowerCase()),
    [uploadPolicy.forbidden_exts]
  );
  const vatRates = useMemo(() => {
    const rates = ensureArray<number>(vatPolicy?.vat_rates).map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 100);
    return rates.length > 0 ? rates : [0, 5, 8, 10];
  }, [vatPolicy]);

  const addToast = useUIStore((s) => s.addToast);
  const [viewItem, setViewItem] = useState<any>(initialItem || null);
  const [activeNoteModal, setActiveNoteModal] = useState<{ notes: string; itemName?: string; title?: string } | null>(null);
  const [previewQrModalUrl, setPreviewQrModalUrl] = useState<string | null>(null);
  const [lightboxState, setLightboxState] = useState<{ isOpen: boolean; items: AttachmentItem[]; initialIndex: number }>({
    isOpen: false,
    items: [],
    initialIndex: 0
  });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [rightPaneTab, setRightPaneTab] = useState<'discussion' | 'timeline'>('discussion');

  // Refund & Approval confirmation states
  const [refundImgUrl, setRefundImgUrl] = useState('');
  const [disbursementNote, setDisbursementNote] = useState('');
  const [uploadingRefund, setUploadingRefund] = useState(false);
  const [submittingRefund, setSubmittingRefund] = useState(false);
  const [isDraggingRefund, setIsDraggingRefund] = useState(false);
  const [isProcessingApproval, setIsProcessingApproval] = useState<'approve' | 'reject' | null>(null);
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

  const [users, setUsers] = useState<any[]>([]);
  const [reminderTargetUser, setReminderTargetUser] = useState<any>(null);
  const [reminderMessage, setReminderMessage] = useState('');
  const [sendingReminder, setSendingReminder] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : false
  );
  const [mobileDrawerTab, setMobileDrawerTab] = useState<'info' | 'discussion'>('info');

  // Related Users (Watchers) states
  const [showAddWatcherDropdown, setShowAddWatcherDropdown] = useState(false);
  const [savingWatchers, setSavingWatchers] = useState(false);
  const [watcherSearch, setWatcherSearch] = useState('');
  const addWatcherDropdownRef = React.useRef<HTMLDivElement>(null);

  // Inline expense date edit states
  const [isEditingDate, setIsEditingDate] = useState(false);
  const [tempExpenseDate, setTempExpenseDate] = useState('');
  const [savingExpenseDate, setSavingExpenseDate] = useState(false);

  const detectedDeadline = useMemo(() => {
    if (!viewItem?.notes) return null;
    const match = viewItem.notes.match(/(?:deadline|hạn)\s*(?:thanh\s*toán|chi)?\s*[:\s-]*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
    if (match) {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3];
      return {
        dateStr: `${year}-${month}-${day}`,
        displayStr: `${day}/${month}/${year}`
      };
    }
    return null;
  }, [viewItem?.notes]);

  const updateExpenseDateInFlightRef = useRef(false);
  const refundConfirmInFlightRef = useRef(false);
  const refundUploadInFlightRef = useRef(false);

  const handleUpdateExpenseDate = async (newDateStr: string) => {
    if (!viewItem?.id || !newDateStr || savingExpenseDate || updateExpenseDateInFlightRef.current) return;
    updateExpenseDateInFlightRef.current = true;
    setSavingExpenseDate(true);
    try {
      const res = await api.patch(`/expenses/${viewItem.id}`, { date: newDateStr });
      if (res.data?.success || res.status === 200) {
        setViewItem((prev: any) => ({ ...prev, date: newDateStr }));
        setIsEditingDate(false);
        addToast('Đã cập nhật ngày chi thành công', 'success');
        onStatusChange?.();
      } else {
        addToast(res.data?.message || 'Không thể cập nhật ngày chi', 'error');
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || err?.message || 'Lỗi khi cập nhật ngày chi', 'error');
    } finally {
      updateExpenseDateInFlightRef.current = false;
      setSavingExpenseDate(false);
    }
  };

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

  const updateWatchersInFlightRef = useRef(false);
  const handleUpdateWatchers = async (newIds: number[]) => {
    if (!viewItem) return;
    if (updateWatchersInFlightRef.current) return;
    updateWatchersInFlightRef.current = true;
    setSavingWatchers(true);
    try {
      const res = await api.post('/hrm/approvals/update-related-users', {
        type: 'expense',
        id: viewItem.id,
        related_user_ids: newIds
      });
      if (res.data?.success) {
        setViewItem((prev: any) => ({
          ...(prev || {}),
          related_user_ids: newIds
        }));
        addToast('Đã cập nhật danh sách người theo dõi', 'success');
      } else {
        addToast(res.data?.message || 'Lỗi khi cập nhật người theo dõi', 'error');
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi cập nhật người theo dõi', 'error');
    } finally {
      updateWatchersInFlightRef.current = false;
      setSavingWatchers(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  const detailsAbortRef = useRef<AbortController | null>(null);
  const commentsAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const usersAbortRef = useRef<AbortController | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (detailsAbortRef.current) detailsAbortRef.current.abort();
      if (commentsAbortRef.current) commentsAbortRef.current.abort();
      if (historyAbortRef.current) historyAbortRef.current.abort();
      if (usersAbortRef.current) usersAbortRef.current.abort();
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  const fetchExpenseDetails = useCallback(async (id: number) => {
    if (detailsAbortRef.current) detailsAbortRef.current.abort();
    const controller = new AbortController();
    detailsAbortRef.current = controller;
    const { signal } = controller;

    setLoading(true);
    try {
      const r = await api.get(`/expenses/${id}`, { signal });
      if (signal.aborted) return;
      if (r.data?.success && r.data.data) {
        setViewItem(r.data.data);
        return;
      }
    } catch (e: any) {
      if (e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED') return;
      // Fallback for Purchase Orders opened via unified Approval table
      try {
        const poRes = await api.get(`/purchase-orders/${id}`, { signal });
        if (signal.aborted) return;
        const poData = poRes.data?.data || poRes.data;
        if (poData && (poData.id || poData.po_number)) {
          setViewItem({
            ...poData,
            id: poData.id,
            isPurchaseOrder: true,
            po_number: poData.po_number,
            title: poData.po_number ? `Đơn mua hàng ${poData.po_number}` : (poData.notes || `Đơn hàng PO #${poData.id}`),
            amount: Number(poData.total || poData.subtotal || 0),
            currency: 'VND',
            status: poData.status === 'pending_approval' ? 'pending' : (poData.status || 'pending'),
            date: poData.order_date || poData.created_at,
            creator_name: poData.creator_name,
            vendor_name: poData.supplier_name,
            notes: poData.notes,
            items: Array.isArray(poData.items) ? poData.items.map((it: any) => ({
              id: it.id,
              content: it.name || it.product_name,
              quantity: it.quantity,
              price: it.unit_cost,
              vat: 0
            })) : [],
            approver_name: poData.approver_name_1,
            approver_name_2: poData.approver_name_2,
            approver_name_3: poData.approver_name_3,
            status_level_1: poData.status_level_1,
            status_level_2: poData.status_level_2,
            status_level_3: poData.status_level_3
          });
          return;
        }
      } catch (errPo: any) {
        if (errPo?.name === 'AbortError' || errPo?.name === 'CanceledError' || errPo?.code === 'ERR_CANCELED') return;
      }
      if (!signal.aborted) {
        addToast('Không thể tải chi tiết chi phí: ' + (e?.response?.data?.message || e.message), 'error');
      }
    } finally {
      if (!signal.aborted) {
        setLoading(false);
      }
    }
  }, [addToast]);

  const fetchComments = useCallback(async (id: number) => {
    if (commentsAbortRef.current) commentsAbortRef.current.abort();
    const controller = new AbortController();
    commentsAbortRef.current = controller;
    const { signal } = controller;

    setLoadingComments(true);
    try {
      const res = await api.get(`/expenses/${id}/comments`, { signal });
      if (signal.aborted) return;
      setComments(ensureArray(res.data?.data));
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setComments([]);
    } finally {
      if (!signal.aborted) {
        setLoadingComments(false);
      }
    }
  }, []);

  const fetchHistory = useCallback(async (id: number) => {
    if (historyAbortRef.current) historyAbortRef.current.abort();
    const controller = new AbortController();
    historyAbortRef.current = controller;
    const { signal } = controller;

    setLoadingHistory(true);
    try {
      const res = await api.get(`/expenses/${id}/history`, { signal });
      if (signal.aborted) return;
      setHistoryLogs(ensureArray(res.data?.data));
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      setHistoryLogs([]);
    } finally {
      if (!signal.aborted) {
        setLoadingHistory(false);
      }
    }
  }, []);

  const feedContainerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRefundImgUrl('');
    setDisbursementNote('');
    setUploadingRefund(false);
    setSubmittingRefund(false);
    setShowApproveConfirm(false);
    setShowRejectModal(false);
    setRejectReasonInput('');
    setComments([]);
    setHistoryLogs([]);
    setReminderTargetUser(null);
    if (expenseId) {
      if (initialItem && Number(initialItem.id) === Number(expenseId)) {
        setViewItem(initialItem);
      }
      fetchExpenseDetails(expenseId);
      const params = new URLSearchParams(window.location.search);
      const hcId = params.get('highlight_comment_id') || params.get('comment_id');
      setActiveTab('comments');
      setRightPaneTab('discussion');
      setMobileDrawerTab(hcId ? 'discussion' : 'info');
      fetchComments(expenseId);
      fetchHistory(expenseId);
      usersAbortRef.current?.abort();
      const uCtrl = new AbortController();
      usersAbortRef.current = uCtrl;
      api.get('/users', { signal: uCtrl.signal }).then(res => {
        if (!uCtrl.signal.aborted) {
          setUsers(extractArray(res?.data));
        }
      }).catch(() => {});
    } else {
      setViewItem(null);
    }
  }, [expenseId, initialItem, fetchExpenseDetails, fetchComments, fetchHistory]);

  useEffect(() => {
    if (!expenseId || comments.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const hcId = params.get('highlight_comment_id') || params.get('comment_id');
    if (!hcId) return;
    setRightPaneTab('discussion');
    setMobileDrawerTab('discussion');
    const timer = setTimeout(() => {
      const rootComments: any[] = [];
      const repliesMap = new Map<string, any[]>();
      comments.forEach((item: any) => {
        const pId = item.parent_id;
        if (pId && comments.some((c: any) => String(c.id) === String(pId))) {
          const key = String(pId);
          const list = repliesMap.get(key) || [];
          list.push(item);
          repliesMap.set(key, list);
        } else {
          rootComments.push(item);
        }
      });
      repliesMap.forEach((replies) => {
        replies.sort((a, b) => (a.created_at ? new Date(a.created_at).getTime() : 0) - (b.created_at ? new Date(b.created_at).getTime() : 0));
      });
      const ordered: any[] = [];
      rootComments.forEach(r => {
        ordered.push(r);
        const reps = repliesMap.get(String(r.id)) || [];
        ordered.push(...reps);
      });
      const idx = ordered.findIndex(c => String(c.id) === String(hcId));
      if (idx >= 0 && feedContainerRef.current) {
        const cards = feedContainerRef.current.querySelectorAll('.custom-scrollbar div[style*="position: relative"]');
        const targetEl = cards[idx] as HTMLElement | undefined;
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const origBorder = targetEl.style.border;
          const origBg = targetEl.style.background;
          const origShadow = targetEl.style.boxShadow;
          targetEl.style.border = '2px solid var(--color-primary, #a31422)';
          targetEl.style.background = 'rgba(163, 20, 34, 0.08)';
          targetEl.style.boxShadow = '0 0 16px rgba(163, 20, 34, 0.25)';
          setTimeout(() => {
            targetEl.style.border = origBorder;
            targetEl.style.background = origBg;
            targetEl.style.boxShadow = origShadow;
          }, 2600);
        }
      }
      params.delete('highlight_comment_id');
      params.delete('comment_id');
      const nextSearch = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`);
    }, 350);
    return () => clearTimeout(timer);
  }, [comments, expenseId]);

  const handleAddComment = async () => {
    if (!commentText.trim() || !viewItem) return;
    setSubmittingComment(true);
    try {
      await api.post(`/expenses/${viewItem.id}/comments`, {
        body: commentText.trim()
      });
      setCommentText('');
      addToast('Thêm bình luận thành công', 'success');
      fetchComments(viewItem.id);
    } catch (err) {
      console.error('Error adding comment:', err);
      addToast('Lỗi khi thêm bình luận', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!viewItem) return;
    try {
      await api.delete(`/expenses/comments/${commentId}`);
      addToast('Đã xóa bình luận', 'success');
      fetchComments(viewItem.id);
    } catch (err) {
      console.error('Error deleting comment:', err);
      addToast('Không thể xóa bình luận', 'error');
    }
  };

  const combinedFeed = useMemo(() => {
    const feedItems: any[] = [];
    if (Array.isArray(comments)) {
      comments.forEach(c => {
        feedItems.push({
          id: `comment-${c.id}`,
          type: 'comment',
          created_at: c.created_at,
          data: c
        });
      });
    }
    if (Array.isArray(historyLogs)) {
      historyLogs.forEach(h => {
        feedItems.push({
          id: `history-${h.id}`,
          type: 'history',
          created_at: h.created_at,
          data: h
        });
      });
    }
    return feedItems.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [comments, historyLogs]);

  const isMyTurnToApprove = (item: any) => {
    if (!item) return false;
    const overall = String(item.status || 'pending').toLowerCase();
    if (overall !== 'pending' && overall !== 'pending_approval') return false;

    const role = String(user?.role || '').toLowerCase();
    const userId = Number(user?.id || 0);
    const userName = (user?.name || (user as any)?.full_name || '').toLowerCase().trim();
    const isSuperAdmin = ['superadmin', 'super_admin', 'admin', 'director'].includes(role);

    const isUserMatch = (appId: any, appName: any) => {
      const numId = Number(appId || 0);
      if (numId > 0 && numId === userId) return true;
      if (appName) {
        const cleanName = String(appName).toLowerCase().trim();
        if (cleanName && userName && (cleanName === userName || userName.includes(cleanName) || cleanName.includes(userName))) return true;
      }
      return false;
    };

    const s1 = String(item.status_level_1 || 'pending').toLowerCase();
    const s2 = String(item.status_level_2 || 'pending').toLowerCase();
    const s3 = String(item.status_level_3 || 'pending').toLowerCase();

    const app1 = Number(item.approver_id || 0);
    const app2 = Number(item.approver_id_2 || 0);
    const app3 = Number(item.approver_id_3 || 0);
    const appName1 = item.approver_name;
    const appName2 = item.approver_name_2;
    const appName3 = item.approver_name_3;

    let currentLevel = 1;
    if (s1 === 'approved' && (app2 > 0 || appName2) && s2 === 'pending') {
      currentLevel = 2;
    } else if (s1 === 'approved' && s2 === 'approved' && (app3 > 0 || appName3) && s3 === 'pending') {
      currentLevel = 3;
    } else if (s1 !== 'pending') {
      return false;
    }

    const isCreator = Number(item.created_by || (item as any)?.user_id) === userId;
    const isAssignedCurrentLevel = 
      (currentLevel === 1 && isUserMatch(app1, appName1)) ||
      (currentLevel === 2 && isUserMatch(app2, appName2)) ||
      (currentLevel === 3 && isUserMatch(app3, appName3));

    if (isCreator && !isSuperAdmin && !isAssignedCurrentLevel) {
      return false; // Creator cannot approve their own expense unless executive or specifically assigned
    }

    if (currentLevel === 1) {
      if (app1 > 0 || appName1) {
        return isUserMatch(app1, appName1);
      }
      // Only fallback if no specific approver was assigned at all
      return isSuperAdmin || role === 'manager';
    }

    if (currentLevel === 2) {
      if (app2 > 0 || appName2) {
        return isUserMatch(app2, appName2);
      }
      return isSuperAdmin;
    }

    if (currentLevel === 3) {
      if (app3 > 0 || appName3) {
        return isUserMatch(app3, appName3);
      }
      return isSuperAdmin;
    }

    return false;
  };

  const renderTimeline = () => {
    if (!viewItem) return null;

    const formatApprovalTime = (raw: any) => {
      if (!raw) return '';
      const str = String(raw).trim();
      const d = new Date(str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str);
      return !isNaN(d.getTime()) ? d.toLocaleString('vi-VN') : '';
    };

    const rawNotes = viewItem.notes || viewItem.description || '';
    const approvalStepsMatch = rawNotes.match(/\[APPROVAL_STEPS\]:\s*(\[[\s\S]*?\])(?=\n\n|\n\[|$)/i);
    let misaSteps: any[] | null = null;
    if (viewItem.approval_steps && Array.isArray(viewItem.approval_steps)) {
      misaSteps = viewItem.approval_steps;
    } else if (approvalStepsMatch) {
      try {
        misaSteps = JSON.parse(approvalStepsMatch[1]);
      } catch (e) {}
    }

    const steps: Array<{
      stepNumber: number;
      title: string;
      roleTitle: string;
      user: any;
      status: 'approved' | 'rejected' | 'pending' | 'not_reached';
      approvedAt?: string;
      waitingSince?: any;
      showBell?: boolean;
      notes?: string;
      customNotReachedText?: string;
      isPayment?: boolean;
    }> = [];

    if (misaSteps && Array.isArray(misaSteps) && misaSteps.length > 0) {
      misaSteps.forEach((st: any, idx: number) => {
        const uName = st.user_name || st.actor || '';
        const uCode = st.user_code || '';
        const matchedUser = users.find((u: any) => 
          (st.user_id && Number(u.id) === Number(st.user_id)) ||
          (uCode && String((u as any).code || '').toLowerCase() === uCode.toLowerCase()) ||
          (uName && u.full_name && (u.full_name.toLowerCase().includes(uName.toLowerCase()) || uName.toLowerCase().includes(u.full_name.toLowerCase())))
        );

        const stepUser = matchedUser || {
          id: st.user_id || `misa-${idx}`,
          full_name: uName || 'Nhân sự thực hiện',
          avatar: null,
          avatar_url: null
        };

        const rawStatus = (st.status || '').toLowerCase();
        let stepStatus: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'pending';
        if (['approved', 'done', 'completed', 'đã duyệt', 'đã thực hiện'].includes(rawStatus)) {
          stepStatus = 'approved';
        } else if (['rejected', 'từ chối'].includes(rawStatus)) {
          stepStatus = 'rejected';
        } else if (['not_reached', 'chưa đến'].includes(rawStatus)) {
          stepStatus = 'not_reached';
        } else {
          stepStatus = 'pending';
        }

        const stepRole = st.role || (matchedUser as any)?.role_title || (matchedUser as any)?.department || (matchedUser as any)?.role || (idx === 0 ? 'Người lập đề xuất' : 'Người phê duyệt');
        const stepTitle = st.title || st.step_name || (idx === 0 ? 'Lập đề xuất & gửi' : `Phê duyệt (Cấp ${idx})`);
        const prevStepTime = idx > 0 ? (misaSteps[idx - 1]?.time || misaSteps[idx - 1]?.action_time || viewItem?.created_at) : viewItem?.created_at;

        steps.push({
          stepNumber: idx + 1,
          title: `Bước ${idx + 1}: ${stepTitle}`,
          roleTitle: stepRole,
          user: stepUser,
          status: stepStatus,
          approvedAt: (stepStatus === 'approved' || stepStatus === 'rejected') && (st.time || st.action_time) ? formatApprovalTime(st.time || st.action_time) : '',
          waitingSince: stepStatus === 'pending' ? prevStepTime : null,
          showBell: stepStatus === 'pending',
          notes: st.notes || st.comment || ''
        });
      });
    } else {
      const overall = (viewItem.status || 'pending').toLowerCase();
      const isDraft = overall === 'draft';
      const s1 = (viewItem.status_level_1 || 'pending').toLowerCase();
      const s2 = (viewItem.status_level_2 || 'pending').toLowerCase();
      const s3 = (viewItem.status_level_3 || 'pending').toLowerCase();
      const isRefunded = !!viewItem.is_refunded;
      const hasL2 = !!viewItem.approver_id_2;
      const hasL3 = !!viewItem.approver_id_3;
      const isStationery = rawNotes.includes('DANH SÁCH VĂN PHÒNG PHẨM') || rawNotes.includes('Đồ vật đề xuất:') || String(viewItem.title || '').toLowerCase().includes('văn phòng phẩm');
      const isZeroCost = Number(viewItem.amount || 0) === 0 || isStationery || rawNotes.includes('Quy trình: In, đóng dấu và gửi hồ sơ') || Boolean(viewItem.isLeaveRequest);

      // Step 1: Creator / Proposer
      const creatorUser = users.find((u: any) => 
        (viewItem.created_by && Number(u.id) === Number(viewItem.created_by)) ||
        (viewItem.user_id && Number(u.id) === Number(viewItem.user_id)) ||
        (viewItem.creator_name && (u.full_name === viewItem.creator_name || u.name === viewItem.creator_name))
      ) || {
        id: viewItem.created_by || viewItem.user_id || 'creator',
        full_name: viewItem.creator_name || 'Người lập',
        avatar: viewItem.creator_avatar,
        avatar_url: viewItem.creator_avatar
      };

      const step1CreatedTime = viewItem.created_at || viewItem.expense_date;

      steps.push({
        stepNumber: 1,
        title: isDraft ? 'Bước 1: Đang lưu bản nháp' : 'Bước 1: Lập đề xuất & gửi',
        roleTitle: 'Người lập đề xuất',
        user: creatorUser,
        status: 'approved',
        approvedAt: formatApprovalTime(step1CreatedTime)
      });

      // Step 2: Level 1 Approver
      let s1Status: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'pending';
      if (isDraft) {
        s1Status = 'not_reached';
      } else if (overall === 'approved' || overall === 'refunded' || isRefunded || s1 === 'approved') {
        s1Status = 'approved';
      } else if (overall === 'rejected' || s1 === 'rejected') {
        s1Status = 'rejected';
      } else {
        s1Status = 'pending';
      }

      const s1ApprovedTime = s1Status === 'approved' || s1Status === 'rejected' ? (viewItem.approved_at || viewItem.updated_at) : null;

      const approverUser1 = users.find((u: any) => 
        (viewItem.approver_id && Number(u.id) === Number(viewItem.approver_id)) ||
        (viewItem.approver_name && (u.full_name === viewItem.approver_name || u.name === viewItem.approver_name))
      ) || {
        id: viewItem.approver_id || 'approver1',
        full_name: viewItem.approver_name || 'Người duyệt Cấp 1',
        avatar: viewItem.approver_avatar,
        avatar_url: viewItem.approver_avatar,
        role: 'Người duyệt Cấp 1'
      };

      steps.push({
        stepNumber: 2,
        title: 'Bước 2: Phê duyệt (Cấp 1)',
        roleTitle: approverUser1.role || 'Người duyệt Cấp 1',
        user: approverUser1,
        status: s1Status,
        approvedAt: s1Status === 'approved' || s1Status === 'rejected' ? formatApprovalTime(s1ApprovedTime) : '',
        waitingSince: s1Status === 'pending' ? step1CreatedTime : null,
        showBell: s1Status === 'pending',
        customNotReachedText: isDraft ? 'Sẽ thực hiện sau khi gửi duyệt' : undefined
      });

      // Step 3: Level 2 Approver (Optional)
      let s2ApprovedTime: any = null;
      let s2Status: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'not_reached';
      if (hasL2) {
        if (isDraft) s2Status = 'not_reached';
        else if (s2 === 'approved' || isRefunded) s2Status = 'approved';
        else if (s2 === 'rejected') s2Status = 'rejected';
        else if (overall === 'rejected' || s1 === 'rejected') s2Status = 'not_reached';
        else if (s1Status === 'approved') s2Status = 'pending';
        else s2Status = 'not_reached';

        s2ApprovedTime = s2Status === 'approved' || s2Status === 'rejected' ? (viewItem.approved_at_2 || (s2 === 'approved' ? viewItem.updated_at : null)) : null;

        const approverUser2 = users.find((u: any) => 
          (viewItem.approver_id_2 && Number(u.id) === Number(viewItem.approver_id_2)) ||
          (viewItem.approver_name_2 && (u.full_name === viewItem.approver_name_2 || u.name === viewItem.approver_name_2))
        ) || {
          id: viewItem.approver_id_2 || 'approver2',
          full_name: viewItem.approver_name_2 || 'Người duyệt Cấp 2',
          avatar: viewItem.approver_avatar_2,
          avatar_url: viewItem.approver_avatar_2,
          role: 'Người duyệt Cấp 2'
        };

        steps.push({
          stepNumber: steps.length + 1,
          title: `Bước ${steps.length + 1}: Phê duyệt (Cấp 2)`,
          roleTitle: approverUser2.role || 'Người duyệt Cấp 2',
          user: approverUser2,
          status: s2Status,
          approvedAt: s2Status === 'approved' || s2Status === 'rejected' ? formatApprovalTime(s2ApprovedTime) : '',
          waitingSince: s2Status === 'pending' ? (s1ApprovedTime || step1CreatedTime) : null,
          showBell: s2Status === 'pending',
          customNotReachedText: isDraft ? 'Sẽ thực hiện sau khi gửi duyệt' : 'Sẽ thực hiện sau khi Cấp 1 duyệt'
        });
      }

      // Step 4: Level 3 Approver (Optional)
      let s3ApprovedTime: any = null;
      let s3Status: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'not_reached';
      if (hasL3) {
        if (isDraft) s3Status = 'not_reached';
        else if (s3 === 'approved' || isRefunded) s3Status = 'approved';
        else if (s3 === 'rejected') s3Status = 'rejected';
        else if (overall === 'rejected' || s1 === 'rejected' || s2 === 'rejected') s3Status = 'not_reached';
        else if (hasL2 ? s2Status === 'approved' : s1Status === 'approved') s3Status = 'pending';
        else s3Status = 'not_reached';

        s3ApprovedTime = s3Status === 'approved' || s3Status === 'rejected' ? (viewItem.approved_at_3 || (s3 === 'approved' ? viewItem.updated_at : null)) : null;

        const approverUser3 = users.find((u: any) => 
          (viewItem.approver_id_3 && Number(u.id) === Number(viewItem.approver_id_3)) ||
          (viewItem.approver_name_3 && (u.full_name === viewItem.approver_name_3 || u.name === viewItem.approver_name_3))
        ) || {
          id: viewItem.approver_id_3 || 'approver3',
          full_name: viewItem.approver_name_3 || 'Người duyệt Cấp 3',
          avatar: viewItem.approver_avatar_3,
          avatar_url: viewItem.approver_avatar_3,
          role: 'Người duyệt Cấp 3'
        };

        steps.push({
          stepNumber: steps.length + 1,
          title: `Bước ${steps.length + 1}: Phê duyệt (Cấp 3)`,
          roleTitle: approverUser3.role || 'Người duyệt Cấp 3',
          user: approverUser3,
          status: s3Status,
          approvedAt: s3Status === 'approved' || s3Status === 'rejected' ? formatApprovalTime(s3ApprovedTime) : '',
          waitingSince: s3Status === 'pending' ? (s2ApprovedTime || s1ApprovedTime || step1CreatedTime) : null,
          showBell: s3Status === 'pending',
          customNotReachedText: isDraft ? 'Sẽ thực hiện sau khi gửi duyệt' : 'Sẽ thực hiện sau khi Cấp 2 duyệt'
        });
      }

      // Step Payment: Hạch toán thanh toán thực tế (Only for monetary expenses/POs)
      if (!isZeroCost) {
        const lastApprovalTime = (hasL3 ? s3ApprovedTime : hasL2 ? s2ApprovedTime : s1ApprovedTime) || viewItem.approved_at || viewItem.updated_at;
        let isPreApproved = false;
        if (hasL3) {
          isPreApproved = s3Status === 'approved' || overall === 'approved' || isRefunded;
        } else if (hasL2) {
          isPreApproved = s2Status === 'approved' || overall === 'approved' || isRefunded;
        } else {
          isPreApproved = s1Status === 'approved' || overall === 'approved' || isRefunded;
        }

        let paymentStatus: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'not_reached';
        if (isRefunded) {
          paymentStatus = 'approved';
        } else if (isPreApproved && !isDraft) {
          paymentStatus = 'pending';
        } else {
          paymentStatus = 'not_reached';
        }

        const defaultAccountant = users.find((u: any) => String(u.role).toLowerCase() === 'accountant') || users.find((u: any) => ['admin', 'superadmin'].includes(String(u.role).toLowerCase())) || {
          id: 1001,
          full_name: 'Kế toán / Thủ quỹ',
          avatar: undefined,
          avatar_url: undefined,
          role: 'Thủ quỹ'
        };

        const refunderUser = isRefunded ? (users.find((u: any) => Number(u.id) === Number(viewItem.refunder_id)) || {
          id: viewItem.refunder_id,
          full_name: viewItem.refunder_name || 'Kế toán / Thủ quỹ',
          avatar: viewItem.refunder_avatar,
          avatar_url: viewItem.refunder_avatar,
          role: 'Kế toán chi'
        }) : defaultAccountant;

        steps.push({
          stepNumber: steps.length + 1,
          title: `Bước ${steps.length + 1}: Hạch toán thanh toán thực tế`,
          roleTitle: refunderUser.role || (isRefunded ? 'Kế toán chi' : 'Thủ quỹ'),
          user: refunderUser,
          status: paymentStatus,
          approvedAt: isRefunded && viewItem.refunded_at ? formatApprovalTime(viewItem.refunded_at) : '',
          waitingSince: paymentStatus === 'pending' ? (lastApprovalTime || step1CreatedTime) : null,
          showBell: paymentStatus === 'pending',
          customNotReachedText: 'Sẽ thực hiện sau khi đề xuất được duyệt',
          isPayment: true
        });
      }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '12px', position: 'relative', paddingLeft: '30px', textAlign: 'left' }}>
        <div style={{ position: 'absolute', left: '10px', top: '10px', bottom: '10px', width: '2px', background: 'var(--color-border-light)' }} />

        {steps.map((st) => {
          let bg = '#f59e0b';
          let textCol = '#ffffff';
          let iconContent: React.ReactNode = String(st.stepNumber);
          let avatarBorderColor = '#f59e0b';

          if (st.status === 'approved') {
            bg = '#10b981';
            iconContent = '✓';
            avatarBorderColor = '#10b981';
          } else if (st.status === 'rejected') {
            bg = '#ef4444';
            iconContent = '✗';
            avatarBorderColor = '#ef4444';
          } else if (st.status === 'not_reached') {
            bg = 'var(--color-border-light)';
            textCol = 'var(--color-text-muted)';
            avatarBorderColor = '#cbd5e1';
          }

          return (
            <div key={st.stepNumber} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div style={{
                position: 'absolute',
                left: '-30px',
                top: '0px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: bg,
                color: textCol,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: 800,
                zIndex: 2
              }}>
                {iconContent}
              </div>
              <div style={{ width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '0.8rem', color: 'var(--color-text)' }}>{st.title}</strong>
                  {st.showBell && st.user && (
                    <button 
                      type="button"
                      onClick={() => { setReminderTargetUser(st.user); setReminderMessage(''); }}
                      style={{ background: 'transparent', border: 'none', color: '#BD1D2D', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                      title="Gửi nhắc nhở"
                    >
                      <Bell size={18} fill="#BD1D2D" />
                    </button>
                  )}
                </div>
                <CustomSelect
                  options={[
                    ...(st.user && !users.some(u => String(u.id) === String(st.user.id)) ? [{
                      value: String(st.user.id),
                      label: st.user.full_name || st.user.name,
                      avatar: st.user.avatar || st.user.avatar_url,
                      avatarBorder: avatarBorderColor
                    }] : []),
                    ...users.map((u: any) => ({
                      value: String(u.id),
                      label: u.full_name || u.name,
                      avatar: u.avatar || u.avatar_url,
                      avatarBorder: String(u.id) === String(st.user?.id) ? avatarBorderColor : undefined
                    }))
                  ]}
                  value={st.user ? String(st.user.id) : ''}
                  onChange={() => {}}
                  disabled
                  showAvatars
                  width="100%"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                  <span style={{ fontWeight: 600 }}>{st.roleTitle}</span>
                  {st.approvedAt && <span>{st.approvedAt}</span>}
                </div>
                {st.status === 'approved' && (
                  <span style={{ fontSize: '0.725rem', color: '#10b981', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                    {st.stepNumber === 1
                      ? ((viewItem.status || '').toLowerCase() === 'draft'
                        ? 'Bản nháp (Chưa gửi duyệt)'
                        : `Đã gửi lúc ${st.approvedAt || formatDateTimeVN(new Date())}`)
                      : st.isPayment
                        ? `✓ Đã chi ${st.approvedAt ? `lúc ${st.approvedAt}` : ''}`
                        : `✓ Đã duyệt ${st.approvedAt ? `lúc ${st.approvedAt}` : ''}`}
                  </span>
                )}
                {st.status === 'rejected' && (
                  <span style={{ fontSize: '0.725rem', color: '#BD1D2D', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                    ✗ Bị từ chối {st.approvedAt ? `lúc ${st.approvedAt}` : ''}
                  </span>
                )}
                {st.status === 'pending' && (
                  <span style={{ 
                    fontSize: '0.72rem', 
                    color: '#d97706', 
                    marginTop: '4px', 
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontWeight: 700,
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.28)',
                  }}>
                    <Clock size={12} strokeWidth={2.5} />
                    <span>{st.stepNumber === 1 ? 'Đang thực hiện' : (st.isPayment ? 'Chờ thanh toán' : 'Chờ phê duyệt')}</span>
                    {st.waitingSince && (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        color: '#64748B',
                        marginLeft: '3px',
                        paddingLeft: '6px',
                        borderLeft: '1px solid #CBD5E1'
                      }}>
                        Đã chờ {formatWaitDuration(st.waitingSince)}
                      </span>
                    )}
                  </span>
                )}
                {st.status === 'not_reached' && (
                  <span style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                    {st.customNotReachedText || 'Sẽ thực hiện sau khi đề xuất được duyệt'}
                  </span>
                )}
                {st.notes && (
                  <div style={{ marginTop: '6px', padding: '6px 10px', background: 'var(--color-bg-secondary)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--color-text)', borderLeft: '3px solid #BD1D2D' }}>
                    "{st.notes}"
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const approveRejectInFlightRef = useRef(false);
  const executeApprove = async () => {
    if (!viewItem || isProcessingApproval || approveRejectInFlightRef.current) return;
    if (!viewItem.isPurchaseOrder && Number(viewItem.created_by || viewItem.user_id) === Number(user?.id) && !isExecutive(user)) {
      addToast('Người tạo phiếu không thể tự phê duyệt khoản chi của chính mình.', 'error');
      return;
    }
    approveRejectInFlightRef.current = true;
    setIsProcessingApproval('approve');
    try {
      if (viewItem.isPurchaseOrder) {
        await api.post(`/purchase-orders/${viewItem.id}/approve`, { status: 'approved' });
        addToast('Đã phê duyệt đơn hàng PO thành công', 'success');
      } else {
        await api.patch(`/expenses/${viewItem.id}`, { status: 'approved' });
        addToast('Đã phê duyệt chi phí', 'success');
      }
      fetchExpenseDetails(viewItem.id);
      if (onStatusChange) onStatusChange();
      window.dispatchEvent(new Event('refresh-pending-counts'));
    } catch (e: any) {
      addToast(e?.response?.data?.message || e?.message || 'Lỗi khi phê duyệt chi phí', 'error');
    } finally {
      approveRejectInFlightRef.current = false;
      setIsProcessingApproval(null);
    }
  };

  const executeReject = async (reasonText: string) => {
    if (!viewItem || isProcessingApproval || approveRejectInFlightRef.current) return;
    const cleanReason = reasonText.trim();
    if (!cleanReason) {
      addToast('Vui lòng nhập lý do từ chối phiếu', 'error');
      return;
    }
    approveRejectInFlightRef.current = true;
    setIsProcessingApproval('reject');
    try {
      if (viewItem.isPurchaseOrder) {
        await api.post(`/purchase-orders/${viewItem.id}/approve`, {
          status: 'rejected',
          reject_reason: cleanReason,
          reason: cleanReason,
        });
        addToast('Đã từ chối đơn hàng PO', 'success');
      } else {
        await api.patch(`/expenses/${viewItem.id}`, {
          status: 'rejected',
          reject_reason: cleanReason,
          reason: cleanReason,
        });
        addToast('Đã từ chối chi phí', 'success');
      }
      setShowRejectModal(false);
      setRejectReasonInput('');
      fetchExpenseDetails(viewItem.id);
      if (onStatusChange) onStatusChange();
      window.dispatchEvent(new Event('refresh-pending-counts'));
    } catch (e: any) {
      addToast(e?.response?.data?.message || e?.message || 'Lỗi khi từ chối chi phí', 'error');
    } finally {
      approveRejectInFlightRef.current = false;
      setIsProcessingApproval(null);
    }
  };

  const handleApprove = () => {
    if (!viewItem || isProcessingApproval || approveRejectInFlightRef.current) return;
    setShowApproveConfirm(true);
  };

  const handleReject = () => {
    if (!viewItem || isProcessingApproval || approveRejectInFlightRef.current) return;
    setRejectReasonInput('');
    setShowRejectModal(true);
  };

  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (expenseId) {
      setIsClosing(false);
    }
  }, [expenseId]);

  const handleClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
      setIsClosing(false);
    }, motionMs);
  };
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;
  const reminderTargetUserRef = useRef(reminderTargetUser);
  reminderTargetUserRef.current = reminderTargetUser;
  const showApproveConfirmRef = useRef(showApproveConfirm);
  showApproveConfirmRef.current = showApproveConfirm;
  const showRejectModalRef = useRef(showRejectModal);
  showRejectModalRef.current = showRejectModal;
  const addCommentInFlightRef = useRef(false);
  const deleteCommentInFlightRef = useRef(false);
  const sendReminderInFlightRef = useRef(false);

  useEffect(() => {
    if (!expenseId) return;
    return pushOverlay('expense-quick-view-drawer', () => {
      if (showRejectModalRef.current) {
        setShowRejectModal(false);
        return;
      }
      if (showApproveConfirmRef.current) {
        setShowApproveConfirm(false);
        return;
      }
      if (reminderTargetUserRef.current) {
        setReminderTargetUser(null);
        return;
      }
      handleCloseRef.current();
    }, 100);
  }, [expenseId]);

  const memoizedExpenseItems = useMemo(() => {
    if (!viewItem) return null;
    const normalizeExpenseItems = (items: any[]) => {
      if (!Array.isArray(items)) return [];
      return items
        .filter(it => it && typeof it === 'object')
        .map((it: any) => {
          const rawContent = it.content || it.name || it.description || it.item_name || it.title || it.noi_dung || 'Chi phí';
          return {
            ...it,
            content: rawContent,
            name: rawContent,
            description: it.description || rawContent
          };
        });
    };

    const directItems = viewItem.items;
    if (Array.isArray(directItems) && directItems.length > 0) return normalizeExpenseItems(directItems);
    if (typeof directItems === 'string' && directItems.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(directItems);
        if (Array.isArray(parsed) && parsed.length > 0) return normalizeExpenseItems(parsed);
      } catch {}
    }
    const text = viewItem.notes || viewItem.description || '';
    if (!text) return null;
    const jsonMatch = text.match(/\[JSON_ITEMS\]:\s*(\[[\s\S]*?\])(?=\n\n|\n\[|$)/i);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed) && parsed.length > 0) return normalizeExpenseItems(parsed);
      } catch {}
    }
    const blockMatch = text.match(/\[Bảng chi tiết thanh toán\]:\s*([\s\S]*?)(?=\n\n\[|\n\[|$)/i);
    if (blockMatch) {
      const lines = blockMatch[1].split('\n').map((l: string) => l.trim()).filter(Boolean);
      const parsedItems: any[] = [];
      for (const line of lines) {
        if (/^Tổng cộng/i.test(line)) continue;
        const m = line.match(/^(\d+)[\.\)]\s*(.*?)(?:\s*\(SL:\s*([\d\.,]+)\s*x\s*([\d\.,]+)\s*đ\s*=\s*([\d\.,]+)\s*đ\))?$/i);
        if (m) {
          const stt = parseInt(m[1]);
          const name = m[2].trim();
          const qty = m[3] ? parseFloat(m[3].replace(/\./g, '').replace(',', '.')) : 1;
          const price = m[4] ? parseFloat(m[4].replace(/\./g, '').replace(',', '.')) : 0;
          const amt = m[5] ? parseFloat(m[5].replace(/\./g, '').replace(',', '.')) : 0;
          parsedItems.push({ stt, name, content: name, quantity: qty, unit_price: price, amount: amt, total: amt });
        }
      }
      if (parsedItems.length > 0) return normalizeExpenseItems(parsedItems);
    }
    return null;
  }, [viewItem?.notes, viewItem?.description, viewItem?.items]);

  const memoizedBankInfo = useMemo(() => {
    if (!viewItem) return null;
    const rawText = viewItem.notes || viewItem.description || '';
    const bankMatch = rawText.match(/\[Thông tin chuyển khoản\]:\s*([^\n]+)/i);
    let bankName = viewItem.bank_name || '';
    let bankNum = viewItem.bank_account_number || viewItem.bank_account || '';
    let bankOwner = viewItem.bank_account_name || viewItem.vendor_name || '';
    let bankBranch = '';

    if (bankMatch) {
      const fullBankStr = bankMatch[1].trim();
      const stkMatch = fullBankStr.match(/STK:\s*([0-9A-Za-z\-_]+)/i);
      const holderMatch = fullBankStr.match(/Chủ\s*TK:\s*([^-\n]+)/i);
      const branchMatch = fullBankStr.match(/Chi\s*nhánh:\s*([^-\n]+)/i);
      const bankNamePart = fullBankStr.split(/-\s*STK:/i)[0].replace(/^Ngân\s*hàng:\s*/i, '').trim();

      if (bankNamePart) bankName = bankNamePart;
      if (stkMatch) bankNum = stkMatch[1].trim();
      if (holderMatch) bankOwner = holderMatch[1].trim();
      if (branchMatch) bankBranch = branchMatch[1].trim();
    }

    if (!bankNum && !bankName) return null;
    const vietQrUrl = bankNum
      ? getVietQrUrl({
          bankBinOrCode: bankName || 'VCB',
          accountNumber: bankNum,
          accountName: bankOwner,
          amount: viewItem.amount,
          memo: normalizeVietQrText(viewItem.title || vietQrConfig.memo_prefix || 'Thanh toan'),
          template: (vietQrConfig.template || 'compact2') as 'compact2' | 'compact' | 'qr_only' | 'print'
        })
      : '';
    return { bankName, bankNum, bankOwner, bankBranch, vietQrUrl };
  }, [viewItem?.notes, viewItem?.description, viewItem?.bank_name, viewItem?.bank_account_number, viewItem?.bank_account, viewItem?.bank_account_name, viewItem?.vendor_name, viewItem?.amount, viewItem?.title, vietQrConfig]);

  if (!expenseId) return null;

  if (!viewItem) {
    return createPortal(
      <AnimatePresence>
        {!isClosing && (
          <div style={{ position: 'fixed', inset: 0, zIndex: backdropZ, display: 'flex', justifyContent: 'flex-end' }}>
            <motion.div
              className="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] as any }}
              onClick={handleClose}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: backdropZ,
                '--drawer-backdrop-z': backdropZ,
                background: 'rgba(0, 0, 0, 0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                willChange: 'opacity',
                transform: 'translate3d(0, 0, 0)'
              } as any}
            />
            <motion.div
              className="drawer-sheet drawer-panel"
              initial={isMobile ? { y: '100%' } : { opacity: 0, x: '250px' }}
              animate={{ y: 0, x: 0, opacity: 1 }}
              exit={isMobile ? { y: '60%', opacity: 0 } : { opacity: 0, x: '60%' }}
              transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] as any }}
              onClick={e => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: 0,
                bottom: 0,
                left: isMobile ? 0 : 'var(--sidebar-width, 220px)',
                right: 0,
                width: isMobile ? '100vw' : 'auto',
                height: isMobile ? '100dvh' : '100vh',
                backgroundColor: 'var(--color-surface)',
                boxShadow: isMobile ? 'none' : '-10px 0 30px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                zIndex: panelZ, ...({ '--drawer-panel-z': panelZ } as any),
                overflow: 'hidden'
              }}
            >
              <DrawerSkeleton />
            </motion.div>
          </div>
        )}
      </AnimatePresence>,
      document.body
    );
  }

  return createPortal(
    <AnimatePresence>
      {!isClosing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: backdropZ, display: 'flex', justifyContent: 'flex-end' }}>
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] as any }}
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: backdropZ,
              '--drawer-backdrop-z': backdropZ,
              background: 'rgba(0, 0, 0, 0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              willChange: 'opacity',
              transform: 'translate3d(0, 0, 0)'
            } as any}
          />

          {/* Drawer Sheet Panel */}
          <motion.div
            className="drawer-sheet drawer-panel"
            initial={isMobile ? { y: '100%' } : { opacity: 0, x: '250px' }}
            animate={{ y: 0, x: 0, opacity: 1 }}
            exit={isMobile ? { y: '60%', opacity: 0 } : { opacity: 0, x: '60%' }}
            transition={{ duration: motionSec, ease: [0.25, 0.1, 0.25, 1] as any }}
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: 0,
              bottom: 0,
              left: isMobile ? 0 : 'var(--sidebar-width, 220px)',
              right: 0,
              width: isMobile ? '100vw' : 'auto',
              height: isMobile ? '100dvh' : '100vh',
              backgroundColor: 'var(--color-surface)',
              boxShadow: isMobile ? 'none' : '-10px 0 30px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: panelZ, ...({ '--drawer-panel-z': panelZ } as any),
              overflow: 'hidden',
              willChange: 'transform, opacity',
              transform: 'translate3d(0, 0, 0)',
              contain: 'layout style'
            }}
          >
            {/* Header */}
            {(() => {
              const drawerTitle = viewItem.isPurchaseOrder
                ? `Chi tiết đơn mua hàng #${viewItem.po_number || viewItem.id}`
                : Number(viewItem.amount || 0) === 0 || String(viewItem.title).toLowerCase().includes('văn phòng phẩm') || (viewItem.notes || '').includes('DANH SÁCH VĂN PHÒNG PHẨM')
                  ? `Chi tiết đề xuất #EXP-${viewItem.id}`
                  : `Chi tiết phiếu chi #EXP-${viewItem.id}`;

              const canWriteExpense = !checkIsViewer(user) && hasPermission('expenses', 'write');
              const canEditExpense = Boolean(
                canWriteExpense &&
                viewItem.status !== 'approved' &&
                onEditClick &&
                (Number(user?.id) === Number(viewItem.created_by || viewItem.user_id) ||
                  isManagement(user) || isAccountant(user, true))
              );
              const canCloneExpense = Boolean(canWriteExpense && onEditClick);
              const myTurn = isMyTurnToApprove(viewItem) && !(
                !viewItem.isPurchaseOrder &&
                Number(viewItem.created_by || viewItem.user_id) === Number(user?.id) &&
                !isExecutive(user)
              );

              const isL1 = viewItem.status_level_1 === 'approved';
              const hasL2 = !!viewItem.approver_id_2;
              const isL2 = viewItem.status_level_2 === 'approved';
              const hasL3 = !!viewItem.approver_id_3;

              let badgeClass = 'secondary';
              let badgeText = 'Chờ duyệt';

              if (viewItem.status === 'draft') {
                badgeClass = 'secondary';
                badgeText = 'Bản nháp';
              } else if (viewItem.status === 'approved') {
                badgeClass = viewItem.is_refunded ? 'info' : 'success';
                badgeText = viewItem.is_refunded ? 'Đã thanh toán' : 'Đã duyệt';
              } else if (viewItem.status === 'rejected') {
                badgeClass = 'danger';
                badgeText = 'Từ chối';
              } else if (isL1 && hasL2 && !isL2) {
                badgeClass = 'warning';
                badgeText = 'Chờ duyệt Cấp 2';
              } else if (isL1 && isL2 && hasL3) {
                badgeClass = 'warning';
                badgeText = 'Chờ duyệt Cấp 3';
              } else if (hasL2) {
                badgeClass = 'warning';
                badgeText = 'Chờ duyệt Cấp 1';
              }

              const handleCloneExpense = () => {
                if (!canCloneExpense || !onEditClick) return;
                const cloned = {
                  ...viewItem,
                  id: undefined,
                  isClone: true,
                  status: 'pending',
                  status_level_1: 'pending',
                  status_level_2: 'pending',
                  status_level_3: 'pending',
                  approved_at: null,
                  approved_at_2: null,
                  approved_at_3: null,
                  is_refunded: 0,
                  refunded_at: null,
                  refund_image_url: null,
                  refunder_id: null,
                  date: getLocalDateStr(),
                };
                onClose();
                onEditClick(cloned);
              };

              if (isMobile) {
                const utilityActions = [
                  ...(canEditExpense && onEditClick
                    ? [{ id: 'edit', label: 'Chỉnh sửa phiếu', icon: <Pencil size={14} />, onClick: () => onEditClick(viewItem) }]
                    : []),
                  ...(canCloneExpense
                    ? [{ id: 'clone', label: 'Nhân bản phiếu', icon: <Copy size={14} />, onClick: handleCloneExpense }]
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
                          type="button"
                          onClick={handleClose}
                          style={{
                            background: 'var(--color-bg-light, #f1f5f9)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            width: '32px',
                            height: '32px',
                            borderRadius: '8px',
                            color: 'var(--color-text-muted)',
                            flexShrink: 0
                          }}
                          title="Đóng"
                        >
                          <X size={18} />
                        </button>
                        <h2 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                          {drawerTitle}
                        </h2>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                        <span className={`badge ${badgeClass}`} style={{ padding: '4px 8px', fontSize: '0.68rem', borderRadius: '6px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {badgeText}
                        </span>
                        {utilityActions.length > 0 && (
                          <ResponsiveActionGroup actions={utilityActions} menuOnlyOnMobile moreLabel="Tùy chọn phiếu" />
                        )}
                      </div>
                    </div>

                    {myTurn && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', width: '100%' }}>
                        <button
                          type="button"
                          className="btn danger sm"
                          disabled={isProcessingApproval !== null}
                          style={{ background: '#BD1D2D', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700, height: '36px', fontSize: '0.8125rem', padding: '0 10px', borderRadius: '8px', cursor: isProcessingApproval !== null ? 'not-allowed' : 'pointer', opacity: isProcessingApproval !== null ? 0.6 : 1 }}
                          onClick={handleReject}
                        >
                          {isProcessingApproval === 'reject' ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                          <span>{isProcessingApproval === 'reject' ? 'Đang từ chối...' : 'Từ chối'}</span>
                        </button>
                        <button
                          type="button"
                          className="btn primary sm"
                          disabled={isProcessingApproval !== null}
                          style={{ background: '#0F172A', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 700, height: '36px', fontSize: '0.8125rem', padding: '0 10px', borderRadius: '8px', cursor: isProcessingApproval !== null ? 'not-allowed' : 'pointer', opacity: isProcessingApproval !== null ? 0.6 : 1 }}
                          onClick={handleApprove}
                        >
                          {isProcessingApproval === 'approve' ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                          <span>{isProcessingApproval === 'approve' ? 'Đang duyệt...' : 'Phê duyệt'}</span>
                        </button>
                      </div>
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
                  background: 'var(--color-surface)',
                  flexShrink: 0
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                      type="button"
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
                    >
                      <X size={20} />
                    </button>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-text)' }}>
                      {drawerTitle}
                    </h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {myTurn ? (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 12px',
                        borderRadius: '8px',
                        background: 'rgba(189, 29, 45, 0.08)',
                        border: '1px solid rgba(189, 29, 45, 0.22)',
                        color: '#BD1D2D',
                        fontSize: '0.74rem',
                        fontWeight: 700
                      }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#BD1D2D', display: 'inline-block' }} />
                        Đến lượt bạn duyệt
                      </div>
                    ) : (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '5px 12px',
                        borderRadius: '8px',
                        background: '#F1F5F9',
                        border: '1px solid #E2E8F0',
                        color: '#64748B',
                        fontSize: '0.74rem',
                        fontWeight: 600
                      }}>
                        <Eye size={13} />
                        Chế độ chỉ xem
                      </div>
                    )}

                    {myTurn && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                          type="button"
                          className="btn danger sm" 
                          disabled={isProcessingApproval !== null}
                          style={{ background: '#BD1D2D', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, height: '32px', fontSize: '0.8rem', padding: '0 12px', borderRadius: '8px', cursor: isProcessingApproval !== null ? 'not-allowed' : 'pointer', opacity: isProcessingApproval !== null ? 0.6 : 1, transition: 'opacity 0.16s cubic-bezier(0.22, 1, 0.36, 1)' }} 
                          onClick={handleReject}
                        >
                          {isProcessingApproval === 'reject' ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                          <span>{isProcessingApproval === 'reject' ? 'Đang từ chối...' : 'Từ chối'}</span>
                        </button>
                        <button 
                          type="button"
                          className="btn primary sm" 
                          disabled={isProcessingApproval !== null}
                          style={{ background: '#0F172A', color: 'white', border: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, height: '32px', fontSize: '0.8rem', padding: '0 12px', borderRadius: '8px', cursor: isProcessingApproval !== null ? 'not-allowed' : 'pointer', opacity: isProcessingApproval !== null ? 0.6 : 1, transition: 'opacity 0.16s cubic-bezier(0.22, 1, 0.36, 1)' }} 
                          onClick={handleApprove}
                        >
                          {isProcessingApproval === 'approve' ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                          <span>{isProcessingApproval === 'approve' ? 'Đang duyệt...' : 'Phê duyệt'}</span>
                        </button>
                      </div>
                    )}
                    {canEditExpense && onEditClick && (
                      <button 
                        type="button"
                        className="btn secondary sm" 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          background: 'var(--color-bg)', 
                          border: '1px solid var(--color-border)', 
                          color: 'var(--color-text-muted)', 
                          borderRadius: '6px', 
                          height: '32px', 
                          width: '32px', 
                          padding: 0,
                          cursor: 'pointer' 
                        }} 
                        title="Chỉnh sửa" 
                        onClick={() => onEditClick(viewItem)}
                      >
                        <Pencil size={14} style={{ color: 'var(--color-text-muted)' }} />
                      </button>
                    )}
                    {canCloneExpense && (
                      <button 
                        type="button"
                        className="btn secondary sm" 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center', 
                          background: 'var(--color-bg)', 
                          border: '1px solid var(--color-border)', 
                          color: 'var(--color-text-muted)', 
                          borderRadius: '6px', 
                          height: '32px', 
                          width: '32px', 
                          padding: 0,
                          cursor: 'pointer' 
                        }} 
                        title="Nhân bản phiếu chi" 
                        onClick={handleCloneExpense}
                      >
                        <Copy size={14} style={{ color: 'var(--color-text-muted)' }} />
                      </button>
                    )}
                    <span className={`badge ${badgeClass}`} style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: '8px', fontWeight: 700 }}>
                      {badgeText}
                    </span>
                  </div>
                </div>
              );
            })()}

          {/* Mobile Drawer Top Tabs */}
          {isMobile && (
            <div style={{
              display: 'flex',
              background: 'var(--color-bg)',
              padding: '6px 10px',
              borderBottom: '1px solid var(--color-border-light)',
              gap: '6px',
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

          {/* Two-pane layout body */}
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
            
            {/* Left Pane: Info & Action panel */}
            {(!isMobile || mobileDrawerTab === 'info') && (
              <div style={{
                flex: 3,
                overflowY: 'auto',
                padding: isMobile ? '1rem 1rem 3rem' : '1.5rem 2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
                borderRight: isMobile ? 'none' : '1px solid var(--color-border)',
                background: 'var(--color-bg-secondary)',
                width: isMobile ? '100%' : 'auto',
                minWidth: 0,
                boxSizing: 'border-box'
              }}>
              
              {/* Amount Banner Card or Administrative Proposal Banner */}
              {(() => {
                const rawNotes = viewItem.notes || viewItem.description || '';
                const isStationery = rawNotes.includes('DANH SÁCH VĂN PHÒNG PHẨM') || rawNotes.includes('Đồ vật đề xuất:') || String(viewItem.title).toLowerCase().includes('văn phòng phẩm');
                const isZeroCost = Number(viewItem.amount || 0) === 0 || isStationery || rawNotes.includes('Quy trình: In, đóng dấu và gửi hồ sơ');

                if (isZeroCost) {
                  return (
                    <div className="dom-surface-card" style={{
                      padding: '18px 22px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '16px',
                      flexShrink: 0
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className="dom-kpi-tile__label">
                          Quy trình đề xuất hành chính
                        </span>
                        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                          {viewItem.title}
                        </h3>
                        <p style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748b', margin: 0, marginTop: '2px' }}>
                          Đề xuất trang thiết bị / vật phẩm (không giải ngân tiền mặt trực tiếp)
                        </p>
                      </div>
                      <div className="dom-kpi-tile__icon dom-tone-slate" style={{ width: 42, height: 42, borderRadius: 10 }}>
                        <Package size={20} />
                      </div>
                    </div>
                  );
                }

                const expAmount = Number(viewItem.amount || 0);
                const vAmt = Number(viewItem.vat_amount || 0);
                let vatRate = 0;
                let vatLabel = '';
                let amountBeforeVat = 0;
                let vatAmount = 0;

                if (vAmt > 0 && expAmount > vAmt) {
                  const netAmt = expAmount - vAmt;
                  vatRate = Math.round((vAmt / netAmt) * 100);
                  vatLabel = `${vatRate}%`;
                  amountBeforeVat = netAmt;
                  vatAmount = vAmt;
                } else {
                  const sortedVatRates = [...vatRates].filter(r => r > 0).sort((a, b) => b - a);
                  const matchedRate = sortedVatRates.find(r => rawNotes.includes(`VAT ${r}%`) || rawNotes.includes(`vat_${r}`));
                  if (matchedRate !== undefined) {
                    vatRate = matchedRate;
                    vatLabel = `${matchedRate}%`;
                    amountBeforeVat = Math.round(expAmount / (1 + matchedRate / 100));
                    vatAmount = expAmount - amountBeforeVat;
                  } else if (vAmt > 0) {
                    const fallbackRate = vatRates.find(r => r > 0) ?? 10;
                    vatRate = fallbackRate;
                    vatLabel = `${fallbackRate}%`;
                    amountBeforeVat = Math.max(0, expAmount - vAmt);
                    vatAmount = vAmt;
                  }
                }

                let docLabel = vatRate > 0 ? 'Hóa đơn điện tử VAT' : 'Không có hóa đơn';
                if (rawNotes.includes('Hóa đơn bán lẻ')) {
                  docLabel = 'Hóa đơn bán lẻ / Biên lai thu tiền';
                } else if (rawNotes.includes('Không có hóa đơn')) {
                  docLabel = 'Không có hóa đơn (Giải trình nội bộ)';
                } else if (vatRate > 0) {
                  docLabel = 'Hóa đơn điện tử VAT';
                }

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flexShrink: 0 }}>
                    <div className="dom-surface-card dom-kpi-tile" style={{
                      padding: '1.25rem 1.5rem',
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '1rem',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="dom-kpi-tile__label" style={{ color: '#BD1D2D' }}>
                            Tổng số tiền chi
                          </span>
                          {vatRate > 0 && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '8px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', border: '1px solid #E2E8F0', fontVariantNumeric: 'tabular-nums' }}>
                              ✓ Đã gồm VAT ({vatLabel})
                            </span>
                          )}
                        </div>
                        <h1 className="dom-kpi-tile__value dom-kpi-tile__value--brand" style={{ fontSize: '1.75rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          {FMT(viewItem.amount, viewItem.currency)}
                          {viewItem.currency && viewItem.currency !== 'VND' && (
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', border: '1px solid #E2E8F0' }}>
                              {viewItem.currency}
                            </span>
                          )}
                        </h1>
                        <p style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B', margin: 0, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                          Bằng chữ: {numberToVietnameseText(Number(viewItem.amount), viewItem.currency)}
                          {(() => {
                            const currCode = String(viewItem.currency || 'VND').toUpperCase();
                            if (!currCode || currCode === 'VND') return null;
                            const fxRate = Number(fxConfig?.rates_to_vnd?.[currCode] || 0);
                            if (fxRate <= 0) return null;
                            return (
                              <span style={{ marginLeft: '8px', fontStyle: 'normal', color: '#BD1D2D', fontWeight: 700 }}>
                                (≈ {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(viewItem.amount) * fxRate)} — Tỷ giá quy đổi: {new Intl.NumberFormat('vi-VN').format(fxRate)} đ/{currCode})
                              </span>
                            );
                          })()}
                        </p>
                      </div>
                      <div className="dom-kpi-tile__icon dom-tone-brand" style={{ width: 44, height: 44, borderRadius: 12 }}>
                        <Wallet size={22} />
                      </div>
                    </div>

                    {vatRate > 0 && (
                      <div className="dom-surface-card" style={{
                        padding: '12px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span className="dom-kpi-tile__label" style={{ color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Receipt size={14} color="#BD1D2D" /> Chi tiết thuế VAT
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B' }}>
                            Chứng từ: {docLabel}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', paddingTop: '2px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: '#f8fafc', padding: '8px 10px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Tiền trước VAT</span>
                            <strong style={{ fontSize: '0.88rem', color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>{FMT(amountBeforeVat, viewItem.currency)}</strong>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: '#f8fafc', padding: '8px 10px', borderRadius: '10px', border: '1px solid #f1f5f9' }}>
                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>Tiền thuế VAT</span>
                            <strong style={{ fontSize: '0.88rem', color: '#334155', fontVariantNumeric: 'tabular-nums' }}>{FMT(vatAmount, viewItem.currency)}</strong>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', background: 'rgba(189, 29, 45, 0.04)', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(189, 29, 45, 0.14)' }}>
                            <span style={{ fontSize: '0.68rem', color: '#BD1D2D', fontWeight: 700 }}>Tổng thanh toán</span>
                            <strong style={{ fontSize: '0.92rem', color: '#BD1D2D', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{FMT(expAmount, viewItem.currency)}</strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Bảng kê chi tiết chi phí (nếu có các dòng chi phí con) */}
              {(() => {
                const expenseItems = memoizedExpenseItems;
                if (!expenseItems || expenseItems.length === 0) return null;

                return (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                    padding: '1.25rem',
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    {(() => {
                      const parseItemQty = (it: any) => {
                        const rawQ = it.quantity ?? it.qty;
                        return rawQ !== undefined && rawQ !== null && rawQ !== '' && Number.isFinite(Number(rawQ))
                          ? Math.max(0, Number(rawQ))
                          : 1;
                      };
                      const hasAnyVat = expenseItems.some((it: any) => Number(it.vat) > 0 || Number(it.vat_amount) > 0);
                      const curr = viewItem.currency || 'VND';
                      const totalPreTax = expenseItems.reduce((sum: number, it: any) => {
                        const qty = parseItemQty(it);
                        const price = Number(it.unit_price ?? it.price ?? 0);
                        const amt = Number(it.amount);
                        return sum + (amt > 0 ? amt : (qty * price));
                      }, 0);
                      const totalVat = expenseItems.reduce((sum: number, it: any) => {
                        const qty = parseItemQty(it);
                        const price = Number(it.unit_price ?? it.price ?? 0);
                        const preVat = Number(it.amount) > 0 ? Number(it.amount) : (qty * price);
                        const vatPct = Number(it.vat || 0);
                        const vatVal = Number(it.vat_amount) > 0 ? Number(it.vat_amount) : (vatPct > 0 ? Math.round(preVat * vatPct / 100) : 0);
                        return sum + vatVal;
                      }, 0);
                      const totalPostTax = expenseItems.reduce((sum: number, it: any) => {
                        const qty = parseItemQty(it);
                        const price = Number(it.unit_price ?? it.price ?? 0);
                        const preVat = Number(it.amount) > 0 ? Number(it.amount) : (qty * price);
                        const vatPct = Number(it.vat || 0);
                        const vatVal = Number(it.vat_amount) > 0 ? Number(it.vat_amount) : (vatPct > 0 ? Math.round(preVat * vatPct / 100) : 0);
                        const tot = Number(it.total);
                        return sum + (tot > 0 ? tot : (preVat + vatVal));
                      }, 0);
                      const finalSum = hasAnyVat ? totalPostTax : totalPreTax;

                      return (
                        <>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Receipt size={16} style={{ color: '#BD1D2D' }} />
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Bảng kê chi tiết chi phí ({expenseItems.length} dòng)
                              </span>
                              {hasAnyVat && (
                                <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', border: '1px solid #E2E8F0', fontWeight: 700 }}>
                                  ✓ VAT
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: '0.78rem', color: '#BD1D2D', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                              Tổng thanh toán: {FMT(finalSum, curr)}
                            </span>
                          </div>
                          <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                              <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                                  <th style={{ padding: '8px 10px', width: '35px', textAlign: 'center', fontWeight: 700, color: '#64748B', fontSize: '0.7rem' }}>#</th>
                                  <th style={{ padding: '8px 10px', fontWeight: 700, color: '#64748B', fontSize: '0.7rem' }}>Nội dung chi phí</th>
                                  <th style={{ padding: '8px 10px', width: '60px', textAlign: 'center', fontWeight: 700, color: '#64748B', fontSize: '0.7rem' }}>SL</th>
                                  <th style={{ padding: '8px 10px', width: '90px', textAlign: 'right', fontWeight: 700, color: '#64748B', fontSize: '0.7rem' }}>Đơn giá</th>
                                  <th style={{ padding: '8px 10px', width: '100px', textAlign: 'right', fontWeight: 700, color: '#64748B', fontSize: '0.7rem' }}>{hasAnyVat ? 'Trước thuế' : 'Thành tiền'}</th>
                                  {hasAnyVat && (
                                    <>
                                      <th style={{ padding: '8px 10px', width: '65px', textAlign: 'center', fontWeight: 700, color: '#64748B', fontSize: '0.7rem' }}>% VAT</th>
                                      <th style={{ padding: '8px 10px', width: '90px', textAlign: 'right', fontWeight: 700, color: '#64748B', fontSize: '0.7rem' }}>Tiền VAT</th>
                                      <th style={{ padding: '8px 10px', width: '105px', textAlign: 'right', fontWeight: 700, color: '#64748B', fontSize: '0.7rem' }}>Sau thuế</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody>
                                {expenseItems.map((it: any, idx: number) => {
                                  const qty = parseItemQty(it);
                                  const unitPrice = Number(it.unit_price ?? it.price ?? 0);
                                  const preVat = Number(it.amount) > 0 ? Number(it.amount) : (qty * unitPrice);
                                  const vatPct = Number(it.vat || 0);
                                  const vatVal = Number(it.vat_amount) > 0 ? Number(it.vat_amount) : (vatPct > 0 ? Math.round(preVat * vatPct / 100) : 0);
                                  const postVat = Number(it.total) > 0 ? Number(it.total) : (preVat + vatVal);
                                  const invNum = it.invoice_number || it.inv_num;
                                  const invCode = it.invoice_code || it.inv_code;
                                  const invDate = it.invoice_date || it.inv_date;

                                  return (
                                    <tr key={idx} style={{ borderBottom: idx < expenseItems.length - 1 ? '1px solid #E2E8F0' : 'none', background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAFC' }}>
                                      <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700, color: '#64748B', fontSize: '0.72rem' }}>
                                        {it.stt || (idx + 1)}
                                      </td>
                                      <td style={{ padding: '8px 10px', fontWeight: 650, color: '#0F172A' }}>
                                        <div>{it.content || it.name || it.description || it.item_name || it.title || it.noi_dung || 'Chi phí'}</div>
                                        {(invNum || invCode || invDate) && (
                                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                                            {invNum && (
                                              <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(15, 23, 42, 0.06)', color: '#334155', fontWeight: 600 }}>
                                                HĐ: {invNum}
                                              </span>
                                            )}
                                            {invCode && (
                                              <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(100, 116, 139, 0.1)', color: '#475569', fontWeight: 600 }}>
                                                Ký hiệu: {invCode}
                                              </span>
                                            )}
                                            {invDate && (
                                              <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(100, 116, 139, 0.1)', color: '#475569', fontWeight: 600 }}>
                                                {String(invDate).split(' ')[0]}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </td>
                                      <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                        <span style={{ padding: '2px 6px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.06)', color: '#0F172A', fontWeight: 700, fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }}>
                                          {qty}
                                        </span>
                                      </td>
                                      <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                        {FMT(unitPrice, curr)}
                                      </td>
                                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: hasAnyVat ? 650 : 800, color: hasAnyVat ? '#0F172A' : '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                                        {FMT(preVat, curr)}
                                      </td>
                                      {hasAnyVat && (
                                        <>
                                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                            {vatPct > 0 ? (
                                              <span style={{ padding: '1px 5px', borderRadius: '4px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', fontWeight: 700, fontSize: '0.7rem' }}>
                                                {vatPct}%
                                              </span>
                                            ) : (
                                              <span style={{ color: '#64748B', fontSize: '0.72rem' }}>0%</span>
                                            )}
                                          </td>
                                          <td style={{ padding: '8px 10px', textAlign: 'right', color: vatVal > 0 ? '#475569' : '#64748B', fontWeight: 650, fontVariantNumeric: 'tabular-nums' }}>
                                            {FMT(vatVal, curr)}
                                          </td>
                                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 800, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                                            {FMT(postVat, curr)}
                                          </td>
                                        </>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                              {hasAnyVat && (
                                <tfoot>
                                  <tr style={{ background: '#F8FAFC', borderTop: '2px solid #E2E8F0' }}>
                                    <td colSpan={4} style={{ padding: '8px 10px', fontWeight: 700, textAlign: 'right', color: '#64748B', fontSize: '0.72rem' }}>
                                      Tổng trước thuế:
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                                      {FMT(totalPreTax, curr)}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'center', color: '#64748B', fontSize: '0.7rem' }}>—</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                                      {FMT(totalVat, curr)}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                                      {FMT(totalPostTax, curr)}
                                    </td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                );
              })()}

              {/* Action Buttons 50/50 below money banner */}
              {isMyTurnToApprove(viewItem) && !(!viewItem.isPurchaseOrder && Number(viewItem.created_by || viewItem.user_id) === Number(user?.id) && !isExecutive(user)) ? (
                <div style={{ display: 'flex', gap: '12px', width: '100%', flexShrink: 0 }}>
                  <button 
                    className="btn danger" 
                    disabled={isProcessingApproval !== null}
                    style={{ flex: 1, background: '#BD1D2D', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, height: '40px', fontSize: '0.875rem', borderRadius: '8px', cursor: isProcessingApproval !== null ? 'not-allowed' : 'pointer', opacity: isProcessingApproval !== null ? 0.6 : 1, transition: 'opacity 0.16s cubic-bezier(0.22, 1, 0.36, 1)' }} 
                    onClick={handleReject}
                  >
                    {isProcessingApproval === 'reject' ? <Loader2 size={16} className="spin" /> : <XCircle size={16} />}
                    <span>{isProcessingApproval === 'reject' ? 'Đang từ chối...' : 'Từ chối'}</span>
                  </button>
                  <button 
                    className="btn success" 
                    disabled={isProcessingApproval !== null}
                    style={{ flex: 1, background: '#0F172A', color: 'white', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 600, height: '40px', fontSize: '0.875rem', borderRadius: '8px', cursor: isProcessingApproval !== null ? 'not-allowed' : 'pointer', opacity: isProcessingApproval !== null ? 0.6 : 1, transition: 'opacity 0.16s cubic-bezier(0.22, 1, 0.36, 1)' }} 
                    onClick={handleApprove}
                  >
                    {isProcessingApproval === 'approve' ? <Loader2 size={16} className="spin" /> : <CheckCircle2 size={16} />}
                    <span>{isProcessingApproval === 'approve' ? 'Đang duyệt...' : 'Phê duyệt'}</span>
                  </button>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  width: '100%',
                  padding: '9px 14px',
                  background: 'var(--color-bg-light, #f8fafc)',
                  border: '1px solid var(--color-border-light, #e2e8f0)',
                  borderRadius: '12px',
                  color: 'var(--color-text-muted, #64748b)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  boxSizing: 'border-box'
                }}>
                  <Eye size={14} />
                  <span>Chế độ xem thông tin (Chỉ người có thẩm quyền mới được duyệt)</span>
                </div>
              )}

              {/* Details Info Card */}
              <div className="card" style={{ 
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '16px',
                padding: '1.5rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                  Thông tin chi tiết phiếu chi
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.25rem 1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Nội dung chi</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>{viewItem.title}</span>
                  </div>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Danh mục chi</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>{viewItem.category}</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Ngày tạo phiếu</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                      {viewItem.created_at ? new Date(viewItem.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Ngày chi</span>
                      {!isEditingDate && !viewItem.isPurchaseOrder && (
                        <button
                          type="button"
                          onClick={() => {
                            setTempExpenseDate(viewItem.date ? viewItem.date.split('T')[0] : '');
                            setIsEditingDate(true);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--color-primary)',
                            padding: '0 4px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.7rem',
                            fontWeight: 600
                          }}
                          title="Chỉnh sửa ngày chi"
                        >
                          <Pencil size={11} />
                          <span>Đổi ngày</span>
                        </button>
                      )}
                    </div>
                    {isEditingDate ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <input
                          type="date"
                          value={tempExpenseDate}
                          onChange={(e) => setTempExpenseDate(e.target.value)}
                          style={{
                            padding: '2px 6px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            fontSize: '0.78rem',
                            background: 'var(--color-bg-surface)',
                            color: 'var(--color-text)',
                            height: '28px'
                          }}
                        />
                        <button
                          type="button"
                          disabled={savingExpenseDate || !tempExpenseDate}
                          onClick={() => handleUpdateExpenseDate(tempExpenseDate)}
                          style={{
                            padding: '0 8px',
                            height: '28px',
                            borderRadius: '6px',
                            border: 'none',
                            background: 'var(--color-primary)',
                            color: '#fff',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {savingExpenseDate ? '...' : 'Lưu'}
                        </button>
                        <button
                          type="button"
                          disabled={savingExpenseDate}
                          onClick={() => setIsEditingDate(false)}
                          style={{
                            padding: '0 6px',
                            height: '28px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-border)',
                            background: 'transparent',
                            color: 'var(--color-text-muted)',
                            fontSize: '0.72rem',
                            cursor: 'pointer'
                          }}
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                          {viewItem.date && !isNaN(Date.parse(viewItem.date)) ? new Date(viewItem.date).toLocaleDateString('vi-VN') : '—'}
                        </span>
                        {detectedDeadline && viewItem.date?.split('T')[0] !== detectedDeadline.dateStr && (
                          <button
                            type="button"
                            onClick={() => handleUpdateExpenseDate(detectedDeadline.dateStr)}
                            disabled={savingExpenseDate}
                            style={{
                              marginTop: '2px',
                              background: 'rgba(245, 158, 11, 0.12)',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              borderRadius: '6px',
                              padding: '2px 6px',
                              color: '#d97706',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              textAlign: 'left'
                            }}
                            title={`Khớp với deadline ${detectedDeadline.displayStr} trong ghi chú`}
                          >
                            <span>Khớp deadline: {detectedDeadline.displayStr}</span>
                            <span style={{ textDecoration: 'underline' }}>[Áp dụng]</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Người tạo</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={getAvatarStatusRingStyle('approved')}>
                        <Avatar src={viewItem.creator_avatar} name={viewItem.creator_name} size={18} />
                      </div>
                      {viewItem.creator_name}
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Người duyệt</span>
                    {(() => {
                      const isL1Approved = viewItem.status_level_1 === 'approved';
                      const hasL2 = !!viewItem.approver_id_2;
                      const isL2Approved = viewItem.status_level_2 === 'approved';
                      const hasL3 = !!viewItem.approver_id_3;
                      const isL3Approved = viewItem.status_level_3 === 'approved';
                      const overall = (viewItem.status || 'pending').toLowerCase();

                      if (overall === 'approved') {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={getAvatarStatusRingStyle('approved')}>
                                <Avatar src={viewItem.approver_avatar} name={viewItem.approver_name} size={18} />
                              </div>
                              {viewItem.approver_name}
                              {hasL2 && <span style={{ fontSize: '0.7rem', color: 'var(--color-success)', fontWeight: 600 }}>(Đã duyệt)</span>}
                            </span>
                            {hasL2 && (
                              <span style={{ fontSize: '0.72rem', color: '#10b981', fontWeight: 500 }}>
                                ✓ Đã duyệt qua các cấp
                              </span>
                            )}
                          </div>
                        );
                      }

                      if (overall === 'rejected') {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={getAvatarStatusRingStyle('rejected')}>
                                <Avatar src={viewItem.approver_avatar} name={viewItem.approver_name} size={18} />
                              </div>
                              {viewItem.approver_name}
                              <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>(Từ chối)</span>
                            </span>
                          </div>
                        );
                      }

                      if (isL1Approved && hasL2 && !isL2Approved) {
                        const approver2 = viewItem.approver_name_2 
                          ? { full_name: viewItem.approver_name_2, avatar_url: viewItem.approver_avatar_2 }
                          : users.find(u => Number(u.id) === Number(viewItem.approver_id_2));
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={getAvatarStatusRingStyle('pending')}>
                                <Avatar src={approver2?.avatar_url} name={approver2?.full_name || 'Người duyệt Cấp 2'} size={18} />
                              </div>
                              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                {approver2?.full_name || 'Người duyệt Cấp 2'}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)', fontWeight: 600 }}>(Chờ Cấp 2)</span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                              ✓ Cấp 1: {viewItem.approver_name || 'Quản lý'} đã duyệt
                            </span>
                          </div>
                        );
                      }

                      if (isL1Approved && isL2Approved && hasL3 && !isL3Approved) {
                        const approver3 = viewItem.approver_name_3 
                          ? { full_name: viewItem.approver_name_3, avatar_url: viewItem.approver_avatar_3 }
                          : users.find(u => Number(u.id) === Number(viewItem.approver_id_3));
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={getAvatarStatusRingStyle('pending')}>
                                <Avatar src={approver3?.avatar_url} name={approver3?.full_name || 'Người duyệt Cấp 3'} size={18} />
                              </div>
                              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                {approver3?.full_name || 'Người duyệt Cấp 3'}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)', fontWeight: 600 }}>(Chờ Cấp 3)</span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px', fontWeight: 600 }}>
                              ✓ Cấp 1 & 2 đã duyệt
                            </span>
                          </div>
                        );
                      }

                      if (viewItem.approver_name) {
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={getAvatarStatusRingStyle('pending')}>
                              <Avatar src={viewItem.approver_avatar} name={viewItem.approver_name} size={18} />
                            </div>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                              {viewItem.approver_name}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-warning)', fontWeight: 600 }}>
                              {hasL2 ? '(Chờ Cấp 1)' : '(Chờ duyệt)'}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-muted)' }}>Chưa phân công</span>
                      );
                    })()}
                  </div>

                  {/* Chi tiết đề xuất (thay thế Áp dụng cho đối tượng & Người liên quan) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', gridColumn: 'span 2', borderTop: '1px dotted var(--color-border-light)', paddingTop: '10px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>Chi tiết đề xuất</span>
                    {(() => {
                      const rawNotes = viewItem.notes || viewItem.description || '';
                      
                      const extractMetaField = (text: string, label: string) => {
                        const reg = new RegExp(`(?:^|\\n)\\s*${label}:\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:Vị trí:|Phòng ban:|Nội dung đề xuất:|Lý do:|DANH SÁCH|\\[Tài liệu|\\[Lặp lại|\\[Thanh toán|\\[Thông tin|\\[Hồ sơ chi phí|Đối tượng:|Thụ hưởng|Hình thức:|Thời hạn thanh toán:|Chi tiết:))|$)`, 'i');
                        const m = text.match(reg);
                        return m ? m[1].trim() : '';
                      };

                      const contentVal = extractMetaField(rawNotes, 'Nội dung đề xuất');
                      const reasonVal = extractMetaField(rawNotes, 'Lý do');
                      const detailsMatch = rawNotes.match(/(?:^|\n)\s*Chi tiết:\s*([\s\S]*?)(?=(?:\n\s*(?:\[Tài liệu|\[Lặp lại|\[Thanh toán|\[Thông tin|\[Hồ sơ chi phí|Phòng ban:|Đối tượng:|Thụ hưởng|Hình thức:|Thời hạn thanh toán:))|$)/i);
                      const detailText = detailsMatch ? detailsMatch[1].trim() : '';

                      let cleanNotes = rawNotes
                        .replace(/\[Thông tin chuyển khoản\]:[^\n]*/gi, '')
                        .replace(/\[Thanh toán theo đợt\]:[^\n]*/gi, '')
                        .replace(/\[Lặp lại định kỳ\]:[^\n]*/gi, '')
                        .replace(/\[Hồ sơ chi phí\]:[^\n]*/gi, '')
                        .replace(/Phòng ban:[^\n]*/gi, '')
                        .replace(/Vị trí:[^\n]*/gi, '')
                        .replace(/Đối tượng:[^\n]*/gi, '')
                        .replace(/Thụ hưởng[^:]*:[^\n]*/gi, '')
                        .replace(/Hình thức:[^\n]*/gi, '')
                        .replace(/DANH SÁCH VĂN PHÒNG PHẨM[\s\S]*?(?=\n\n|$)/gi, '')
                        .replace(/\[Bảng chi tiết thanh toán\]:[\s\S]*?(?=\n\n\[|\n\[|$)/gi, '')
                        .replace(/\[JSON_ITEMS\]:[^\n]*/gi, '')
                        .replace(/\[APPROVAL_STEPS\]:[^\n]*/gi, '')
                        .replace(/\[Từ MISA AMIS #[^\]]*\]:[^\n]*/gi, '')
                        .replace(/Quy trình:\s*[^\n]+/gi, '')
                        .replace(/\[Tài liệu đính kèm[^\]]*\]:[\s\S]*?(?=\n\n|$)/gi, '')
                        .replace(/^Số tiền:\s*0\s*đ\.\s*Ghi chú:\s*"?/i, '')
                        .replace(/"$/, '')
                        .trim();

                      if (contentVal || reasonVal) {
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {contentVal && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Nội dung / Giải trình:</span>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text)', background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', padding: '8px 12px', borderRadius: '8px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                                  {contentVal}
                                </div>
                              </div>
                            )}
                            {reasonVal && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Lý do đề xuất:</span>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text)', background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', padding: '8px 12px', borderRadius: '8px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                                  {reasonVal}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      }

                      if (detailText) {
                        return (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text)', background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', padding: '8px 12px', borderRadius: '8px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {detailText}
                          </div>
                        );
                      }

                      if (cleanNotes) {
                        return (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text)', background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', padding: '8px 12px', borderRadius: '8px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {cleanNotes}
                          </div>
                        );
                      }

                      if (viewItem.description) {
                        return (
                          <div style={{ fontSize: '0.8125rem', color: 'var(--color-text)', background: 'var(--color-bg)', border: '1px solid var(--color-border-light)', padding: '8px 12px', borderRadius: '8px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {viewItem.description}
                          </div>
                        );
                      }

                      return (
                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Chưa có chi tiết đề xuất</span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Refund confirmation for Accountant/Executive if approved but not yet refunded - Placed right above Bank Card */}
              {(() => {
                const rawNotes = viewItem.notes || viewItem.description || '';
                const isStationery = rawNotes.includes('DANH SÁCH VĂN PHÒNG PHẨM') || rawNotes.includes('Đồ vật đề xuất:') || String(viewItem.title || '').toLowerCase().includes('văn phòng phẩm');
                const isZeroCost = Number(viewItem.amount || 0) === 0 || isStationery || rawNotes.includes('Quy trình: In, đóng dấu và gửi hồ sơ') || Boolean(viewItem.isLeaveRequest);
                const canDisburse = Boolean(user && (isAccountant(user, true) || isExecutive(user)));
                if (isZeroCost || viewItem.status !== 'approved' || viewItem.is_refunded) return null;
                if (!canDisburse) {
                  return (
                    <div style={{ background: '#ffffff', padding: '1rem 1.25rem', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Clock size={18} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: '0.825rem', fontWeight: 700, color: '#0F172A' }}>Khoản chi đã được phê duyệt</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748B' }}>Đang chờ Bộ phận Kế toán / Ban Giám Đốc hạch toán giải ngân và đối soát UNC.</div>
                      </div>
                    </div>
                  );
                }

                const handleRefundFileUpload = async (file: File) => {
                  if (refundUploadInFlightRef.current) return;
                  const ext = (file.name.split('.').pop() || '').toLowerCase();
                  if (ext === 'svg' || forbiddenUploadExts.includes(ext) || file.type === 'image/svg+xml') {
                    addToast(`Định dạng tệp "${file.name}" không được phép tải lên vì lý do bảo mật.`, 'error');
                    return;
                  }
                  if (file.size > maxUploadMb * 1024 * 1024) {
                    addToast(`Tệp "${file.name}" vượt quá giới hạn ${maxUploadMb}MB.`, 'error');
                    return;
                  }
                  refundUploadInFlightRef.current = true;
                  setUploadingRefund(true);
                  try {
                    let fileToUpload: File = file;
                    if (file.type.startsWith('image/') && !file.type.includes('svg')) {
                      try {
                        const webpBlob = await compressToWebP(file);
                        fileToUpload = new File([webpBlob], 'refund_proof.webp', { type: 'image/webp' });
                      } catch {
                        fileToUpload = file;
                      }
                    }
                    const fd = new FormData();
                    fd.append('file', fileToUpload);
                    const res = await api.post('/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
                    if (res.data && res.data.data?.url) {
                      setRefundImgUrl(res.data.data.url);
                      addToast('Tải chứng từ UNC thành công', 'success');
                    } else {
                      addToast('Lỗi tải tệp', 'error');
                    }
                  } catch (err: any) {
                    addToast('Lỗi tải tệp: ' + (err?.response?.data?.message || err?.message || 'Không xác định'), 'error');
                  } finally {
                    refundUploadInFlightRef.current = false;
                    setUploadingRefund(false);
                  }
                };

                return (
                  <div style={{ background: '#ffffff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Wallet size={16} style={{ color: '#BD1D2D' }} /> Hạch toán thanh toán khoản chi
                    </h4>
                  <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>Khoản chi đã được duyệt. Tải lên ảnh UNC hoặc Biên lai thanh toán để hoàn tất hạch toán thực chi.</p>
                  
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: '#F8FAFC', padding: '12px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                    <div 
                      onClick={() => document.getElementById('refund-image-upload-drawer')?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isDraggingRefund) setIsDraggingRefund(true);
                      }}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!isDraggingRefund) setIsDraggingRefund(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingRefund(false);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDraggingRefund(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) void handleRefundFileUpload(file);
                      }}
                      style={{
                        width: '120px',
                        height: '120px',
                        border: isDraggingRefund ? '2px dashed #BD1D2D' : '2px dashed #CBD5E1',
                        borderRadius: '12px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: isDraggingRefund ? 'rgba(189, 29, 45, 0.08)' : '#ffffff',
                        overflow: 'hidden',
                        position: 'relative',
                        flexShrink: 0,
                        transition: 'all 0.2s ease',
                        transform: isDraggingRefund ? 'scale(1.02)' : 'none'
                      }}
                    >
                      {uploadingRefund ? (
                        <div className="flex flex-col items-center gap-1 text-center" style={{ padding: '6px' }}>
                          <Loader2 size={24} className="spin text-primary" />
                          <span style={{ fontSize: '0.65rem', color: '#64748B', fontWeight: 600 }}>Đang tải lên...</span>
                        </div>
                      ) : isDraggingRefund ? (
                        <div className="flex flex-col items-center gap-1 text-center" style={{ padding: '6px' }}>
                          <Upload size={24} style={{ color: '#BD1D2D' }} />
                          <span style={{ fontSize: '0.72rem', color: '#BD1D2D', fontWeight: 700 }}>Thả file vào đây</span>
                        </div>
                      ) : refundImgUrl ? (
                        <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(refundImgUrl) ? (
                            <img 
                              src={refundImgUrl.startsWith('http') ? refundImgUrl : `${(import.meta.env.VITE_API_URL || '/backend').replace(/\/$/, '')}/${refundImgUrl.replace(/^\/?(backend\/)?/, '')}`} 
                              alt="Refund proof" 
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                            />
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '4px' }}>
                              <FileText size={22} style={{ color: '#BD1D2D' }} />
                              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: '#0F172A', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {refundImgUrl.split('/').pop()}
                              </span>
                            </div>
                          )}
                          <button 
                            style={{
                              position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setRefundImgUrl('');
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1 text-center" style={{ padding: '6px' }}>
                          <Upload size={22} style={{ color: '#64748B', marginBottom: '4px' }} />
                          <span style={{ fontSize: '0.725rem', color: '#475569', fontWeight: 700 }}>Tải tệp / UNC</span>
                          <span style={{ fontSize: '0.65rem', color: '#64748B' }}>hoặc kéo thả vào</span>
                        </div>
                      )}
                      <input 
                        type="file" 
                        id="refund-image-upload-drawer" 
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar,.csv,image/png,image/jpeg,image/webp,image/gif" 
                        style={{ display: 'none' }} 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) void handleRefundFileUpload(file);
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                      <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 600 }}>
                        {refundImgUrl ? 'Đã nhận chứng từ thành công.' : 'Vui lòng kéo thả hoặc chọn chứng từ chuyển khoản để xác thực.'}
                      </span>
                      <input
                        type="text"
                        className="form-input"
                        value={disbursementNote}
                        onChange={(e) => setDisbursementNote(e.target.value)}
                        placeholder="Mã giao dịch ngân hàng / Ghi chú giải ngân (tùy chọn)"
                        style={{ padding: '6px 10px', fontSize: '0.75rem', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#0F172A' }}
                      />
                      <button 
                        className="btn success" 
                        disabled={submittingRefund || !refundImgUrl}
                        onClick={async () => {
                          if (submittingRefund || refundConfirmInFlightRef.current) return;
                          refundConfirmInFlightRef.current = true;
                          setSubmittingRefund(true);
                          try {
                            const trimmedNote = disbursementNote.trim();
                            await api.put(`/expenses/${viewItem.id}`, { 
                              is_refunded: 1, 
                              refund_image_url: refundImgUrl,
                              ...(trimmedNote ? { notes: `${viewItem.notes ? `${viewItem.notes}\n` : ''}[Ghi chú giải ngân]: ${trimmedNote}` } : {})
                            });
                            addToast('Đã xác nhận thanh toán', 'success');
                            setDisbursementNote('');
                            fetchExpenseDetails(viewItem.id);
                            if (onStatusChange) onStatusChange();
                          } catch (e: any) {
                            addToast('Lỗi khi cập nhật thanh toán: ' + (e.response?.data?.message || e.message), 'error');
                          } finally {
                            refundConfirmInFlightRef.current = false;
                            setSubmittingRefund(false);
                          }
                        }}
                        style={{ 
                          background: refundImgUrl ? '#BD1D2D' : '#94A3B8', 
                          opacity: refundImgUrl ? 1 : 0.65, 
                          color: 'white', 
                          border: 'none', 
                          height: '36px', 
                          fontWeight: 700, 
                          padding: '0 16px', 
                          borderRadius: '8px', 
                          cursor: refundImgUrl ? 'pointer' : 'not-allowed',
                          width: 'fit-content',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {submittingRefund ? 'Đang cập nhật...' : 'Xác nhận đã thanh toán'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

              {/* Bank Transfer Info parsed from notes or description */}
              {(() => {
                if (!memoizedBankInfo) return null;
                const { bankName, bankNum, bankOwner, bankBranch, vietQrUrl } = memoizedBankInfo;

                if (!bankNum) {
                  return (
                    <div style={{
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                      borderRadius: '12px',
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Landmark size={18} style={{ color: '#d97706' }} />
                        <span style={{ fontSize: '0.825rem', fontWeight: 700, color: '#b45309' }}>
                          {bankName || 'Chuyển khoản'}: Chưa cập nhật số tài khoản nhận tiền
                        </span>
                      </div>
                      {bankOwner && (
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#92400e' }}>
                          Người nhận: {bankOwner}
                        </span>
                      )}
                    </div>
                  );
                }

                return (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 155px',
                    gap: '12px',
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
                            <Landmark size={14} style={{ color: 'var(--color-primary, #dc2626)' }} />
                          </div>
                          <span style={{ fontWeight: 750, fontSize: '0.8rem', letterSpacing: '0.01em', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={bankName || 'Chuyển khoản Ngân hàng'}>
                            {bankName || 'Chuyển khoản Ngân hàng'}
                          </span>
                        </div>
                        <span style={{
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '2px 6px',
                          borderRadius: '5px',
                          background: 'rgba(220, 38, 38, 0.06)',
                          color: '#dc2626',
                          border: '1px solid rgba(220, 38, 38, 0.15)',
                          flexShrink: 0
                        }}>
                          Chuyển khoản 24/7
                        </span>
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: '#f8fafc',
                        padding: '7px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
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
                            {bankNum || '—'}
                          </span>
                        </div>
                        {bankNum && (
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(bankNum);
                              addToast('Đã sao chép số tài khoản.', 'success');
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '4px 8px',
                              borderRadius: '6px',
                              background: '#BD1D2D',
                              color: '#ffffff',
                              border: 'none',
                              cursor: 'pointer',
                              fontWeight: 600,
                              fontSize: '0.7rem',
                              transition: 'background-color 0.16s cubic-bezier(0.22, 1, 0.36, 1)',
                              flexShrink: 0
                            }}
                          >
                            <Copy size={12} />
                            <span>Sao chép</span>
                          </button>
                        )}
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '4px' }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                            Tên người thụ hưởng
                          </span>
                          <div style={{ fontSize: '0.78rem', fontWeight: 750, letterSpacing: '0.01em', color: '#0f172a', marginTop: '1px', textTransform: 'uppercase', lineHeight: 1.25 }}>
                            {bankOwner || '—'}
                          </div>
                        </div>
                        {bankBranch && (
                          <div style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'right', flexShrink: 0 }}>
                            Chi nhánh: <span style={{ color: '#1e293b', fontWeight: 600 }}>{bankBranch}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* VietQR Card: Bigger QR, No title, No subtitle, Click to zoom */}
                    {vietQrUrl && (
                      <div
                        onClick={() => setPreviewQrModalUrl(vietQrUrl)}
                        title="Bấm để phóng to mã QR"
                        style={{
                          background: '#ffffff',
                          border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                          borderRadius: '14px',
                          padding: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
                          cursor: 'pointer',
                          transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'scale(1.02)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(220, 38, 38, 0.15)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 4px 16px rgba(220, 38, 38, 0.04), 0 1px 3px rgba(0, 0, 0, 0.02)';
                        }}
                      >
                        <img
                          src={vietQrUrl}
                          alt="VietQR Chuyển khoản"
                          style={{
                            width: '100%',
                            maxWidth: '140px',
                            maxHeight: '140px',
                            objectFit: 'contain'
                          }}
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Stationery Items Table & Structured Content Card */}
              {(() => {
                const rawNotes = viewItem.notes || viewItem.description || '';
                const isStationery = rawNotes.includes('DANH SÁCH VĂN PHÒNG PHẨM') || rawNotes.includes('Đồ vật đề xuất:') || String(viewItem.title).toLowerCase().includes('văn phòng phẩm');
                
                interface ParsedStationeryItem {
                  index: number;
                  name: string;
                  quantity: string | number;
                  unit: string;
                  notes: string;
                }
                let parsedStationeryItems: ParsedStationeryItem[] = [];
                if (isStationery) {
                  const itemMatches = rawNotes.matchAll(/[•\-*]?\s*\[?(\d+)\]?\s*([^\-\n]+?)\s*-\s*Số lượng:\s*(\d+(?:\.\d+)?)\s*([^\(\n]*?)(?:\s*\(Ghi chú:\s*([^\)]*)\))?(?=\n|$)/gi);
                  for (const m of itemMatches) {
                    parsedStationeryItems.push({
                      index: Number(m[1]),
                      name: m[2].trim(),
                      quantity: m[3].trim(),
                      unit: m[4].trim() || 'Cái',
                      notes: (m[5] || '').trim()
                    });
                  }
                  if (parsedStationeryItems.length === 0) {
                    const legacyItem = rawNotes.match(/Đồ vật đề xuất:\s*([^\n]+)/i);
                    const legacyQty = rawNotes.match(/Số lượng:\s*([^\n]+)/i);
                    if (legacyItem) {
                      parsedStationeryItems.push({
                        index: 1,
                        name: legacyItem[1].trim(),
                        quantity: legacyQty ? legacyQty[1].trim() : '1',
                        unit: 'Cái',
                        notes: ''
                      });
                    }
                  }
                }

                const extractMetaField = (text: string, label: string) => {
                  const reg = new RegExp(`(?:^|\\n)\\s*${label}:\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:Vị trí:|Phòng ban:|Nội dung đề xuất:|Lý do:|DANH SÁCH|\\[Tài liệu|\\[Lặp lại|\\[Thanh toán|\\[Thông tin|\\[Hồ sơ chi phí|Đối tượng:|Thụ hưởng|Hình thức:|Thời hạn thanh toán:|Chi tiết:))|$)`, 'i');
                  const m = text.match(reg);
                  return m ? m[1].trim() : '';
                };

                const positionVal = extractMetaField(rawNotes, 'Vị trí');
                const departmentVal = extractMetaField(rawNotes, 'Phòng ban');
                const contentVal = extractMetaField(rawNotes, 'Nội dung đề xuất');
                const reasonVal = extractMetaField(rawNotes, 'Lý do');

                if (isStationery) {
                  return (
                    <div className="card" style={{ 
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: '16px',
                      padding: '1.5rem',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Package size={15} /> Danh sách văn phòng phẩm đề xuất ({parsedStationeryItems.length} loại)
                      </div>

                      {parsedStationeryItems.length > 0 ? (
                        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--color-border-light)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)', textAlign: 'left' }}>
                                <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>#</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Tên văn phòng phẩm / Vật phẩm</th>
                                <th style={{ padding: '10px 12px', width: '130px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Số lượng</th>
                                <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Ghi chú / Mục đích sử dụng</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parsedStationeryItems.map((st, idx) => (
                                <tr key={idx} style={{ borderBottom: idx < parsedStationeryItems.length - 1 ? '1px solid var(--color-border-light)' : 'none', background: idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg-secondary)' }}>
                                  <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                    {st.index || (idx + 1)}
                                  </td>
                                  <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text)' }}>
                                    {st.name}
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <span style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      padding: '3px 8px',
                                      borderRadius: '6px',
                                      background: 'rgba(59, 130, 246, 0.1)',
                                      color: '#2563eb',
                                      fontWeight: 700,
                                      fontSize: '0.78rem'
                                    }}>
                                      {st.quantity} {st.unit}
                                    </span>
                                  </td>
                                  <td style={{ padding: '10px 12px' }}>
                                    <NoteCell
                                      notes={st.notes}
                                      itemName={st.name}
                                      onOpenModal={(data) => setActiveNoteModal({ ...data, title: 'Ghi chú / Mục đích sử dụng' })}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}

                      {(contentVal || reasonVal) && (
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (contentVal && reasonVal ? 'repeat(2, 1fr)' : '1fr'), gap: '1rem', marginTop: '4px', paddingTop: '10px', borderTop: '1px solid var(--color-border-light)' }}>
                          {contentVal && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                Nội dung đề xuất / Giải trình
                              </span>
                              <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: '8px', lineHeight: 1.45 }}>
                                {renderLinkifiedText(contentVal)}
                              </div>
                            </div>
                          )}
                          {reasonVal && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                                Lý do & Ý kiến đề xuất
                              </span>
                              <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: '8px', lineHeight: 1.45 }}>
                                {renderLinkifiedText(reasonVal)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                }

                interface ParsedExpenseRow {
                  index: number;
                  name: string;
                  quantity: string | number;
                  price: number;
                  vat: number;
                  subtotal: number;
                }
                let parsedExpenseRows: ParsedExpenseRow[] = [];
                if (Array.isArray(viewItem.items) && viewItem.items.length > 0) {
                  parsedExpenseRows = viewItem.items.map((it: any, idx: number) => {
                    const q = Number(it.quantity) || 1;
                    const p = Number(it.price) || 0;
                    return {
                      index: idx + 1,
                      name: it.content || it.name || '',
                      quantity: q,
                      price: p,
                      vat: Number(it.vat !== undefined ? it.vat : 10),
                      subtotal: q * p
                    };
                  });
                } else if (rawNotes.includes('[Chi tiết các khoản chi]')) {
                  const itemMatches = Array.from(rawNotes.matchAll(/[•\-*]?\s*\[?(\d+)\]?\s*([^\-\n]+?)\s*-\s*SL:\s*(\d+(?:\.\d+)?)\s*-\s*Đơn giá:\s*([0-9.,]+)[^\-]*-\s*VAT:\s*(\d+)%/gi));
                  parsedExpenseRows = itemMatches.map((m: any) => {
                    const q = Number(m[3]) || 1;
                    const p = Number(m[4].replace(/\D/g, '')) || 0;
                    return {
                      index: Number(m[1]),
                      name: m[2].trim(),
                      quantity: q,
                      price: p,
                      vat: Number(m[5]) || 0,
                      subtotal: q * p
                    };
                  });
                }

                if (parsedExpenseRows.length > 0) {
                  return (
                    <div className="card" style={{ 
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: '16px',
                      padding: '1.5rem',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px'
                    }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Receipt size={15} /> Chi tiết các khoản chi ({parsedExpenseRows.length} hạng mục)
                      </div>

                      <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--color-border-light)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                          <thead>
                            <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)', textAlign: 'left' }}>
                              <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>#</th>
                              <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Nội dung chi / Hạng mục</th>
                              <th style={{ padding: '10px 12px', width: '80px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Số lượng</th>
                              <th style={{ padding: '10px 12px', width: '130px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Đơn giá</th>
                              <th style={{ padding: '10px 12px', width: '80px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>VAT</th>
                              <th style={{ padding: '10px 12px', width: '130px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Thành tiền</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parsedExpenseRows.map((it, idx) => (
                              <tr key={idx} style={{ borderBottom: idx < parsedExpenseRows.length - 1 ? '1px solid var(--color-border-light)' : 'none', background: idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg-secondary)' }}>
                                <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                  {it.index || (idx + 1)}
                                </td>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text)' }}>
                                  {it.name}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                  <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: 'rgba(59, 130, 246, 0.1)',
                                    color: '#2563eb',
                                    fontWeight: 700,
                                    fontSize: '0.78rem'
                                  }}>
                                    {it.quantity}
                                  </span>
                                </td>
                                <td style={{ padding: '10px 12px', fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                                  {Number(it.price).toLocaleString('vi-VN')} {viewItem.currency || 'VND'}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                  {it.vat}%
                                </td>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                  {Number(it.subtotal).toLocaleString('vi-VN')} {viewItem.currency || 'VND'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }

                let cleanNotes = viewItem.notes || '';
                const bankRegex = /\[Thông tin chuyển khoản\]:[^\n]*/;
                const installmentRegex = /\[Thanh toán theo đợt\]:[^\n]*/;
                const recurringRegex = /\[Lặp lại định kỳ\]:[^\n]*/;
                cleanNotes = cleanNotes.replace(bankRegex, '').replace(installmentRegex, '').replace(recurringRegex, '').trim();
                cleanNotes = cleanNotes.replace(/\[Chi tiết các khoản chi\]:[^\n]*(\n[•\-*][^\n]*)*\s*/gi, '').trim();
                cleanNotes = cleanNotes.replace(/^Số tiền:\s*0\s*đ\.\s*Ghi chú:\s*"?/i, '').replace(/"$/, '').trim();

                if (contentVal || reasonVal) {
                  return (
                    <div className="card" style={{ 
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: '16px',
                      padding: '1.5rem',
                      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px'
                    }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px' }}>
                        Lý do / Nội dung chi tiết
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (contentVal && reasonVal ? 'repeat(2, 1fr)' : '1fr'), gap: '1rem' }}>
                        {contentVal && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                              Nội dung đề xuất / Giải trình
                            </span>
                            <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: '8px', lineHeight: 1.45 }}>
                              {contentVal}
                            </div>
                          </div>
                        )}
                        {reasonVal && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                              Lý do & Ý kiến đề xuất
                            </span>
                            <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: '8px', lineHeight: 1.45 }}>
                              {reasonVal}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                if (cleanNotes) {
                  const profileMatch = cleanNotes.match(/\[Hồ sơ chi phí\]:\s*([^\n]+)/i);
                  const deptMatch = cleanNotes.match(/Phòng ban:\s*([^\n]+)/i);
                  const targetMatch = cleanNotes.match(/Đối tượng:\s*([^\n]+)/i);
                  const beneficiaryMatch = cleanNotes.match(/Thụ hưởng[^:]*:\s*([^\n]+)/i);
                  const methodMatch = cleanNotes.match(/Hình thức:\s*([^\n]+)/i);
                  const detailsMatch = cleanNotes.match(/Chi tiết:\s*([\s\S]+?)(?=\n\n|\n\[|$)/i);

                  const hasStructuredFields = !!(profileMatch || deptMatch || targetMatch || beneficiaryMatch || methodMatch || detailsMatch);

                  let remainingNotes = cleanNotes
                    .replace(/\[Hồ sơ chi phí\]:[^\n]*/gi, '')
                    .replace(/Phòng ban:[^\n]*/gi, '')
                    .replace(/Đối tượng:[^\n]*/gi, '')
                    .replace(/Thụ hưởng[^:]*:[^\n]*/gi, '')
                    .replace(/Hình thức:[^\n]*/gi, '')
                    .replace(/Chi tiết:[\s\S]+?(?=\n\n|\n\[|$)/gi, '')
                    .replace(/\[Tài liệu đính kèm[^\]]*\]:[\s\S]*?(?=\n\n|$)/gi, '')
                    .trim();

                  if (hasStructuredFields) {
                    return (
                      <div className="card" style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border-light)',
                        borderRadius: '16px',
                        padding: '1.5rem',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px'
                      }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--color-border-light)', paddingBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>{profileMatch ? profileMatch[1].trim() : 'Thông tin hồ sơ chi phí'}</span>
                          {methodMatch && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--color-primary)', fontWeight: 700, background: 'var(--color-bg-secondary)', padding: '2px 8px', borderRadius: '6px' }}>
                              {methodMatch[1].trim()}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '12px' }}>
                          {deptMatch && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Phòng ban</span>
                              <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--color-text)' }}>{deptMatch[1].trim()}</div>
                            </div>
                          )}
                          {targetMatch && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Đối tượng thanh toán</span>
                              <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--color-text)' }}>{targetMatch[1].trim()}</div>
                            </div>
                          )}
                          {beneficiaryMatch && (
                            <div style={{ gridColumn: isMobile ? '1' : 'span 2', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Đối tượng thụ hưởng</span>
                              <div style={{ fontSize: '0.825rem', fontWeight: 700, color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '6px 10px', borderRadius: '6px' }}>{beneficiaryMatch[1].trim()}</div>
                            </div>
                          )}
                          {detailsMatch && (
                            <div style={{ gridColumn: isMobile ? '1' : 'span 2', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>Chi tiết đề xuất</span>
                              <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '8px 12px', borderRadius: '8px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{detailsMatch[1].trim()}</div>
                            </div>
                          )}
                        </div>

                        {remainingNotes && (
                          <div style={{ marginTop: '6px', paddingTop: '8px', borderTop: '1px dashed var(--color-border-light)', fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap' }}>
                            <span style={{ fontWeight: 700, display: 'block', marginBottom: '2px', fontSize: '0.7rem', textTransform: 'uppercase' }}>Ghi chú thêm:</span>
                            {remainingNotes}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div style={{ 
                      padding: '1.25rem', 
                      background: 'rgba(245, 158, 11, 0.05)', 
                      border: '1px solid rgba(245, 158, 11, 0.15)',
                      borderLeft: '4px solid #f59e0b', 
                      borderRadius: '8px', 
                      fontSize: '0.825rem', 
                      color: 'var(--color-text)',
                      lineHeight: 1.45
                    }}>
                      <span style={{ fontWeight: 800, display: 'block', marginBottom: '4px', fontSize: '0.72rem', letterSpacing: '0.05em', textTransform: 'uppercase', color: '#b45309' }}>Ghi chú / Thông tin thêm</span>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{renderLinkifiedText(cleanNotes)}</div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Advanced Configuration (Installments & Recurring) */}
              {(() => {
                const rawNotes = viewItem.notes || '';
                const hasInstallments = rawNotes.includes('[Thanh toán theo đợt]');
                const hasRecurring = rawNotes.includes('[Lặp lại định kỳ]');
                
                let installmentText = '';
                if (hasInstallments) {
                  const match = rawNotes.match(/\[Thanh toán theo đợt\]:\s*(.*)/);
                  if (match) installmentText = match[1];
                }

                let recurringText = '';
                if (hasRecurring) {
                  const match = rawNotes.match(/\[Lặp lại định kỳ\]:\s*(.*)/);
                  if (match) recurringText = match[1];
                }

                if (!hasInstallments && !hasRecurring) return null;

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Cấu hình nâng cao
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {hasInstallments && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0F172A' }}></div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>Thanh toán chia nhiều đợt (Installment/Phased Payment)</span>
                          </div>
                          {installmentText && (
                            <div style={{ marginTop: '4px', padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '12px', background: '#F8FAFC', fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                              {installmentText}
                            </div>
                          )}
                        </div>
                      )}

                      {hasRecurring && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#0F172A' }}></div>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>Thiết lập lặp lại tự động (Recurring Proposal)</span>
                          </div>
                          {recurringText && (
                            <div style={{ marginTop: '4px', padding: '1rem', border: '1px solid #E2E8F0', borderRadius: '12px', background: '#F8FAFC', fontSize: '0.8rem', color: '#475569', lineHeight: 1.4 }}>
                              {recurringText}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Attachments Section */}
              {(() => {
                const formatImgUrl = (rawUrl: string) => {
                  if (!rawUrl) return '';
                  const trimmed = String(rawUrl).trim();
                  if (/^(javascript|vbscript):/i.test(trimmed) || /^data:text\/html/i.test(trimmed) || /^data:image\/svg/i.test(trimmed)) return '';
                  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
                  const baseUrl = (import.meta.env.VITE_API_URL || '/backend').replace(/\/$/, '');
                  const cleanPath = trimmed.replace(/^\/?(backend\/)?/, '');
                  return `${baseUrl}/${cleanPath}`;
                };
                const isPdfAttachment = (rawUrl: string) => /\.pdf($|\?)/i.test(rawUrl);
                const isImageAttachment = (rawUrl: string) =>
                  /\.(jpg|jpeg|png|webp|gif|bmp|avif)($|\?)/i.test(rawUrl) ||
                  /^data:image\/(png|jpeg|jpg|webp|gif|bmp);base64,/i.test(rawUrl);

                const normalizeImgPath = (raw: string) => {
                  if (!raw) return '';
                  return raw.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/?(backend\/)?/, '').split('?')[0].toLowerCase().trim();
                };

                const extractedImgs: string[] = [];
                const isImgDuplicate = (candidate: string) => {
                  const candNorm = normalizeImgPath(candidate);
                  return extractedImgs.some(existing => normalizeImgPath(existing) === candNorm);
                };

                if (viewItem.image_url) {
                  extractedImgs.push(viewItem.image_url);
                }
                if (viewItem.notes) {
                  const matches = viewItem.notes.matchAll(/([^\n\r(•]+)\s*\((https?:\/\/[^\r\n)]+|\/backend\/[^\r\n)]+|uploads\/[^\r\n)]+)\)/gi);
                  for (const m of matches) {
                    const url = m[2].trim();
                    if (url && !isImgDuplicate(url)) {
                      extractedImgs.push(url);
                    }
                  }
                }

                if (extractedImgs.length === 0 && !viewItem.refund_image_url) return null;

                const allGalleryItems: AttachmentItem[] = [];
                const extractedGalleryIndexMap = new Map<number, number>();
                extractedImgs.forEach((imgSrc, i) => {
                  const safeUrl = formatImgUrl(imgSrc);
                  if (!safeUrl) return;
                  const isPdf = isPdfAttachment(imgSrc);
                  const isRasterImg = isImageAttachment(imgSrc);
                  if (isPdf || isRasterImg) {
                    extractedGalleryIndexMap.set(i, allGalleryItems.length);
                    allGalleryItems.push({
                      url: safeUrl,
                      name: imgSrc.split('/').pop()?.split('?')[0] || `Chứng từ #${i + 1}`,
                      type: (isPdf ? 'pdf' : 'image') as 'pdf' | 'image'
                    });
                  }
                });

                let refundGalleryIndex = -1;
                if (viewItem.refund_image_url) {
                  const safeRefundUrl = formatImgUrl(viewItem.refund_image_url);
                  const refundIsPdf = isPdfAttachment(viewItem.refund_image_url);
                  const refundIsRaster = isImageAttachment(viewItem.refund_image_url);
                  if (safeRefundUrl && (refundIsPdf || refundIsRaster)) {
                    refundGalleryIndex = allGalleryItems.length;
                    allGalleryItems.push({
                      url: safeRefundUrl,
                      name: viewItem.refund_image_url.split('/').pop()?.split('?')[0] || 'Ủy nhiệm chi / Chuyển khoản',
                      type: (refundIsPdf ? 'pdf' : 'image') as 'pdf' | 'image'
                    });
                  }
                }

                return (
                  <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '12px', 
                    background: '#ffffff', 
                    padding: '1.5rem', 
                    borderRadius: '16px', 
                    border: '1px solid #E2E8F0',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0', paddingBottom: '8px', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>Tài liệu đính kèm</span>
                      {extractedImgs.length > 0 && (
                        <span style={{ color: '#BD1D2D', fontWeight: 700, fontSize: '0.72rem' }}>
                          {extractedImgs.length} hóa đơn/chứng từ
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
                      {extractedImgs.map((imgSrc, idx) => {
                        const fullImg = formatImgUrl(imgSrc);
                        const isPdf = isPdfAttachment(imgSrc);
                        const isRasterImg = isImageAttachment(imgSrc);
                        const fileName = imgSrc.split('/').pop()?.split('?')[0] || `Chứng từ #${idx + 1}`;
                        const galleryIdx = extractedGalleryIndexMap.get(idx);

                        return (
                          <div key={`exp-img-${idx}`} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>
                              {isPdf ? 'Tệp PDF đính kèm:' : isRasterImg ? `Ảnh hóa đơn ${extractedImgs.length > 1 ? `#${idx + 1}` : 'đề xuất'}:` : 'Tài liệu đính kèm:'}
                            </span>
                            {isPdf && galleryIdx !== undefined ? (
                              <div
                                onClick={() => setLightboxState({
                                  isOpen: true,
                                  items: allGalleryItems,
                                  initialIndex: galleryIdx
                                })}
                                style={{
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  height: '140px',
                                  background: '#F8FAFC',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                  textAlign: 'center'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = '0.92';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.borderColor = '#BD1D2D';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = '1';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.borderColor = '#E2E8F0';
                                }}
                              >
                                <div style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '10px',
                                  background: 'rgba(189, 29, 45, 0.1)',
                                  color: '#BD1D2D',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  <FileText size={22} />
                                </div>
                                <div style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  color: '#0F172A',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  padding: '0 4px'
                                }} title={fileName}>
                                  {fileName}
                                </div>
                                <span style={{
                                  fontSize: '0.68rem',
                                  color: '#BD1D2D',
                                  fontWeight: 600
                                }}>
                                  Nhấn để xem PDF ↗
                                </span>
                              </div>
                            ) : isRasterImg && fullImg && galleryIdx !== undefined ? (
                              <div 
                                onClick={() => setLightboxState({
                                  isOpen: true,
                                  items: allGalleryItems,
                                  initialIndex: galleryIdx
                                })}
                                title="Nhấp để mở xem ảnh kích thước đầy đủ"
                                style={{ 
                                  border: '1px solid #E2E8F0', 
                                  borderRadius: '12px', 
                                  overflow: 'hidden', 
                                  height: '140px', 
                                  background: '#f8fafc', 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center', 
                                  cursor: 'pointer', 
                                  transition: 'all 0.2s ease', 
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                  position: 'relative'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'scale(1.02)';
                                  e.currentTarget.style.borderColor = '#BD1D2D';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'none';
                                  e.currentTarget.style.borderColor = '#E2E8F0';
                                }}
                              >
                                <img 
                                  src={fullImg} 
                                  alt={`Hóa đơn ${idx + 1}`} 
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                                  onError={(e) => {
                                    // Fallback direct relative path if needed
                                    const target = e.currentTarget;
                                    if (!target.dataset.tried) {
                                      target.dataset.tried = '1';
                                      target.src = `/backend/${imgSrc.replace(/^\/?(backend\/)?/, '')}`;
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <a
                                href={fullImg || '#'}
                                target={fullImg ? '_blank' : undefined}
                                rel={fullImg ? 'noopener noreferrer' : undefined}
                                onClick={(e) => { if (!fullImg) e.preventDefault(); }}
                                style={{
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  height: '140px',
                                  background: '#F8FAFC',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  textDecoration: 'none',
                                  textAlign: 'center',
                                  cursor: fullImg ? 'pointer' : 'not-allowed'
                                }}
                              >
                                <div style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '10px',
                                  background: 'rgba(15, 23, 42, 0.06)',
                                  color: '#334155',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  <FileText size={22} />
                                </div>
                                <div style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  color: '#0F172A',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  padding: '0 4px'
                                }} title={fileName}>
                                  {fileName}
                                </div>
                                <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 600 }}>
                                  {fullImg ? 'Mở / Tải tệp ↗' : 'Liên kết không hợp lệ'}
                                </span>
                              </a>
                            )}
                          </div>
                        );
                      })}

                      {viewItem.refund_image_url && (() => {
                        const safeRefundUrl = formatImgUrl(viewItem.refund_image_url);
                        const refundIsPdf = isPdfAttachment(viewItem.refund_image_url);
                        const refundIsRaster = isImageAttachment(viewItem.refund_image_url);
                        const refundFileName = viewItem.refund_image_url.split('/').pop()?.split('?')[0] || 'Ủy nhiệm chi / Chuyển khoản';
                        const openRefundLightbox = () => {
                          if (refundGalleryIndex < 0) return;
                          setLightboxState({
                            isOpen: true,
                            items: allGalleryItems,
                            initialIndex: refundGalleryIndex
                          });
                        };
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>Ủy nhiệm chi / Chuyển khoản:</span>
                            {refundIsPdf && refundGalleryIndex >= 0 ? (
                              <div
                                onClick={openRefundLightbox}
                                style={{
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  height: '140px',
                                  background: '#F8FAFC',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s ease',
                                  boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                  textAlign: 'center'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.opacity = '0.92';
                                  e.currentTarget.style.transform = 'translateY(-2px)';
                                  e.currentTarget.style.borderColor = '#BD1D2D';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.opacity = '1';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                  e.currentTarget.style.borderColor = '#E2E8F0';
                                }}
                              >
                                <div style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '10px',
                                  background: 'rgba(189, 29, 45, 0.1)',
                                  color: '#BD1D2D',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  <FileText size={22} />
                                </div>
                                <div style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  color: '#0F172A',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  padding: '0 4px'
                                }} title={refundFileName}>
                                  {refundFileName}
                                </div>
                                <span style={{
                                  fontSize: '0.68rem',
                                  color: '#BD1D2D',
                                  fontWeight: 600
                                }}>
                                  Nhấn để xem PDF ↗
                                </span>
                              </div>
                            ) : refundIsRaster && safeRefundUrl && refundGalleryIndex >= 0 ? (
                              <div 
                                onClick={openRefundLightbox}
                                title="Nhấp để mở xem ảnh ủy nhiệm chi"
                                style={{ border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', height: '140px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)' }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.transform = 'scale(1.02)';
                                  e.currentTarget.style.borderColor = '#BD1D2D';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.transform = 'none';
                                  e.currentTarget.style.borderColor = '#E2E8F0';
                                }}
                              >
                                <img 
                                  src={safeRefundUrl} 
                                  alt="UNC" 
                                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                                  onError={(e) => {
                                    const target = e.currentTarget;
                                    if (!target.dataset.tried) {
                                      target.dataset.tried = '1';
                                      target.src = `/backend/${viewItem.refund_image_url.replace(/^\/?(backend\/)?/, '')}`;
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <a
                                href={safeRefundUrl || '#'}
                                target={safeRefundUrl ? '_blank' : undefined}
                                rel={safeRefundUrl ? 'noopener noreferrer' : undefined}
                                onClick={(e) => { if (!safeRefundUrl) e.preventDefault(); }}
                                style={{
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  height: '140px',
                                  background: '#F8FAFC',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '8px',
                                  textDecoration: 'none',
                                  textAlign: 'center',
                                  cursor: safeRefundUrl ? 'pointer' : 'not-allowed'
                                }}
                              >
                                <div style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '10px',
                                  background: 'rgba(15, 23, 42, 0.06)',
                                  color: '#334155',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}>
                                  <FileText size={22} />
                                </div>
                                <div style={{
                                  fontSize: '0.75rem',
                                  fontWeight: 700,
                                  color: '#0F172A',
                                  maxWidth: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  padding: '0 4px'
                                }} title={refundFileName}>
                                  {refundFileName}
                                </div>
                                <span style={{ fontSize: '0.68rem', color: '#475569', fontWeight: 600 }}>
                                  {safeRefundUrl ? 'Mở / Tải tệp ↗' : 'Liên kết không hợp lệ'}
                                </span>
                              </a>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}

            </div>
            )}

            {/* Right Pane: Discussion & Activity */}
            {(!isMobile || mobileDrawerTab === 'discussion') && (
              <div style={{
                flex: isMobile ? 1 : '0 0 460px',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                background: 'var(--color-surface)',
                borderLeft: isMobile ? 'none' : '1px solid var(--color-border-light)',
                boxSizing: 'border-box',
                width: isMobile ? '100%' : 'auto',
                minWidth: 0
              }}>
              {/* Right Pane Navigation Tabs */}
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
                  onClick={() => setRightPaneTab('discussion')}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: rightPaneTab === 'discussion' ? 'var(--color-surface)' : 'transparent',
                    color: rightPaneTab === 'discussion' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    fontWeight: rightPaneTab === 'discussion' ? 700 : 600,
                    fontSize: '0.8125rem',
                    boxShadow: rightPaneTab === 'discussion' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s'
                  }}
                >
                  <MessageSquare size={14} />
                  Thảo luận ({comments.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRightPaneTab('timeline')}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: rightPaneTab === 'timeline' ? 'var(--color-surface)' : 'transparent',
                    color: rightPaneTab === 'timeline' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    fontWeight: rightPaneTab === 'timeline' ? 700 : 600,
                    fontSize: '0.8125rem',
                    boxShadow: rightPaneTab === 'timeline' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    transition: 'all 0.15s'
                  }}
                >
                  <Activity size={14} />
                  Tiến trình duyệt
                </button>
              </div>

              {/* View 1: Discussion Feed (Full Height) */}
              {rightPaneTab === 'discussion' && (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0.75rem 1rem 1rem 1rem' }}>
                  {/* Status Banner Shortcut */}
                  <div 
                    onClick={() => setRightPaneTab('timeline')}
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      marginBottom: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      color: 'var(--color-text-muted)',
                      flexShrink: 0
                    }}
                    title="Bấm để xem chi tiết tiến trình phê duyệt"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: viewItem?.status === 'approved' ? '#10b981' : viewItem?.status === 'rejected' ? '#ef4444' : '#f59e0b' }} />
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>
                        {viewItem?.status === 'approved' ? (viewItem?.is_refunded ? 'Đã chi tiền' : 'Đã duyệt • Chờ kế toán chi') : viewItem?.status === 'rejected' ? 'Đã từ chối' : 'Đang chờ phê duyệt'}
                      </span>
                    </div>
                    <span style={{ color: '#BD1D2D', fontWeight: 600 }}>Xem tiến trình →</span>
                  </div>

                  <div ref={feedContainerRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                    <ProcessFeed
                      comments={comments}
                      historyLogs={historyLogs}
                      loadingComments={loadingComments}
                      loadingHistory={loadingHistory}
                      currentUser={user}
                      onAddComment={async (text, fileAttachments, parentId) => {
                        if ((!text.trim() && (!fileAttachments || fileAttachments.length === 0)) || !viewItem) return;
                        if (addCommentInFlightRef.current) return;
                        addCommentInFlightRef.current = true;
                        try {
                          await api.post(`/expenses/${viewItem.id}/comments`, {
                            body: text.trim(),
                            attachments: fileAttachments || [],
                            parent_id: parentId || null
                          });
                          addToast('Thêm bình luận thành công', 'success');
                          fetchComments(viewItem.id);
                        } finally {
                          addCommentInFlightRef.current = false;
                        }
                      }}
                      onDeleteComment={async (commentId) => {
                        if (!viewItem || deleteCommentInFlightRef.current) return;
                        deleteCommentInFlightRef.current = true;
                        try {
                          await api.delete(`/expenses/comments/${commentId}`);
                          addToast('Đã xóa bình luận', 'success');
                          fetchComments(viewItem.id);
                        } finally {
                          deleteCommentInFlightRef.current = false;
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              {/* View 2: Timeline Steps (Full Height) */}
              {rightPaneTab === 'timeline' && (
                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                    Các bước thực hiện
                  </h3>
                  {renderTimeline()}

                  {/* Related Persons in View Drawer */}
                  {(() => {
                    const safeUsers = ensureArray<any>(users);
                    const relIdsRaw = viewItem?.related_user_ids;
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
                    const relUsers = relIds.map(numId => {
                      const found = safeUsers.find((u: any) => Number(u.id) === numId);
                      if (found) return found;
                      return { id: numId, full_name: `User #${numId}`, name: `User #${numId}` };
                    });

                    const availableUsersToAdd = safeUsers.filter((u: any) => 
                      !relIds.includes(Number(u.id)) &&
                      (u.full_name || u.name || '').toLowerCase().includes(watcherSearch.toLowerCase())
                    );

                    return (
                      <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: '#64748B', letterSpacing: '0.05em' }}>
                            NGƯỜI LIÊN QUAN (THEO DÕI) ({relUsers.length})
                          </div>
                          
                          {/* Add Watcher Button & Dropdown */}
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
                                border: '1px dashed #BD1D2D',
                                background: 'rgba(189, 29, 45, 0.04)',
                                color: '#BD1D2D',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              <span>+ Thêm</span>
                            </button>

                            {showAddWatcherDropdown && (
                              <div style={{
                                position: 'absolute',
                                right: 0,
                                top: '100%',
                                marginTop: '4px',
                                width: '240px',
                                background: '#ffffff',
                                border: '1px solid #E2E8F0',
                                borderRadius: '10px',
                                boxShadow: 'var(--shadow-lg)',
                                padding: '8px',
                                zIndex: 2147483645,
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#F8FAFC', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                  <input
                                    type="text"
                                    placeholder="Tìm nhân sự..."
                                    value={watcherSearch}
                                    onChange={e => setWatcherSearch(e.target.value)}
                                    autoFocus
                                    style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.75rem', width: '100%', color: '#0F172A' }}
                                  />
                                </div>
                                <div className="custom-scrollbar" style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {availableUsersToAdd.length === 0 ? (
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', textAlign: 'center', padding: '8px' }}>
                                      Không có nhân sự phù hợp
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
                                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {u.full_name || u.name}
                                          </span>
                                          {u.role && <span style={{ fontSize: '0.65rem', color: '#64748B' }}>{u.role}</span>}
                                        </div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {relUsers.map((u: any) => (
                            <div key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px 4px 10px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px' }}>
                              <Avatar src={u.avatar_url || u.avatar} name={u.full_name || u.name} size={20} />
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>{u.full_name || u.name}</span>
                                {u.role && <span style={{ fontSize: '0.68rem', color: '#64748B' }}>{u.role}</span>}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateWatchers(relIds.filter(id => id !== Number(u.id)));
                                }}
                                title="Xóa người theo dõi"
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: '#64748B',
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '2px',
                                  borderRadius: '50%',
                                  marginLeft: '2px'
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                          {relUsers.length === 0 && (
                            <div style={{ fontSize: '0.75rem', color: '#64748B' }}>
                              Chưa có người theo dõi nào. Tag @tên trong bình luận hoặc bấm "+ Thêm" để thêm.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
            )}
          </div>
        </motion.div>
      </div>
      )}
      {reminderTargetUser && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15, 23, 42, 0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: modalNestedZ
        }} onClick={() => setReminderTargetUser(null)}>
          <div style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid #E2E8F0',
            padding: '1.5rem',
            width: '400px',
            maxWidth: '90%',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            boxShadow: 'var(--shadow-lg)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', color: '#0F172A' }}>
                Gửi nhắc nhở phê duyệt
              </span>
              <button 
                onClick={() => setReminderTargetUser(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: '#F8FAFC', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
              <Avatar src={reminderTargetUser.avatar || reminderTargetUser.avatar_url} name={reminderTargetUser.full_name || reminderTargetUser.name} size={28} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>{reminderTargetUser.full_name || reminderTargetUser.name}</span>
                <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{reminderTargetUser.role || 'Người duyệt'}</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B' }}>
                Nội dung nhắc nhở
              </span>
              <textarea
                style={{ width: '100%', minHeight: '80px', borderRadius: '8px', border: '1px solid #CBD5E1', padding: '8px', fontSize: '0.8rem', outline: 'none', background: '#FFFFFF', color: '#0F172A', boxSizing: 'border-box' }}
                value={reminderMessage}
                onChange={e => setReminderMessage(e.target.value)}
                placeholder="Nhập lời nhắn nhắc nhở người duyệt. Ví dụ: Đề xuất này đang cần gấp, vui lòng xem xét duyệt."
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
              <button
                className="btn secondary sm"
                onClick={() => setReminderTargetUser(null)}
                style={{ padding: '6px 14px', fontSize: '0.78rem' }}
              >
                Hủy
              </button>
              <button
                className="btn primary sm"
                disabled={sendingReminder || !reminderMessage.trim()}
                onClick={async () => {
                  if (!reminderMessage.trim()) {
                    addToast('Vui lòng nhập nội dung nhắc nhở.', 'error');
                    return;
                  }
                  if (sendReminderInFlightRef.current || sendingReminder) return;
                  sendReminderInFlightRef.current = true;
                  setSendingReminder(true);
                  const targetName = reminderTargetUser.full_name || reminderTargetUser.name || '';
                  try {
                    await api.post('/notifications/reminder', {
                      target_user_id: reminderTargetUser.id,
                      message: reminderMessage.trim(),
                      workflow_id: viewItem.id
                    });
                    addToast(`Đã gửi nhắc nhở thành công đến ${targetName}.`, 'success');
                    setReminderTargetUser(null);
                    setReminderMessage('');
                  } catch (err: any) {
                    addToast(err?.response?.data?.message || err?.message || 'Lỗi gửi nhắc nhở', 'error');
                  } finally {
                    sendReminderInFlightRef.current = false;
                    setSendingReminder(false);
                  }
                }}
                style={{ padding: '6px 18px', fontSize: '0.78rem', background: reminderMessage.trim() ? '#BD1D2D' : '#94A3B8', border: 'none', color: '#fff', borderRadius: '6px', cursor: sendingReminder || !reminderMessage.trim() ? 'not-allowed' : 'pointer' }}
              >
                {sendingReminder ? 'Đang gửi...' : 'Gửi'}
              </button>
            </div>
          </div>
        </div>
      )}

      <NoteDetailModal
        isOpen={!!activeNoteModal}
        onClose={() => setActiveNoteModal(null)}
        title={activeNoteModal?.title || 'Ghi chú / Mục đích sử dụng'}
        itemName={activeNoteModal?.itemName}
        notes={activeNoteModal?.notes || ''}
        zIndex={modalNestedZ}
      />

      <QrImageModal
        isOpen={!!previewQrModalUrl}
        qrUrl={previewQrModalUrl}
        onClose={() => setPreviewQrModalUrl(null)}
        zIndex={modalNestedZ}
      />

      <AttachmentLightboxModal
        isOpen={lightboxState.isOpen}
        onClose={() => setLightboxState(prev => ({ ...prev, isOpen: false }))}
        items={lightboxState.items}
        initialIndex={lightboxState.initialIndex}
        zIndex={modalNestedZ}
      />

      <ConfirmModal
        isOpen={showApproveConfirm}
        onClose={() => setShowApproveConfirm(false)}
        onConfirm={() => {
          setShowApproveConfirm(false);
          void executeApprove();
        }}
        title="Xác nhận phê duyệt"
        message={
          viewItem
            ? `Bạn có chắc chắn muốn phê duyệt đề xuất "${viewItem.title || 'Khoản chi'}" với số tiền ${FMT(viewItem.amount, viewItem.currency)} không?`
            : 'Bạn có chắc chắn muốn phê duyệt đề xuất này không?'
        }
        confirmText="Phê duyệt"
        cancelText="Hủy"
        confirmType="primary"
        zIndex={modalNestedZ}
      />

      <CustomModal
        isOpen={showRejectModal}
        onClose={() => setShowRejectModal(false)}
        title="Từ chối đề xuất"
        width="440px"
        zIndex={modalNestedZ}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '0.82rem', color: '#475569', lineHeight: 1.45 }}>
            Vui lòng nhập lý do từ chối {viewItem?.title ? <strong style={{ color: '#0F172A' }}>"{viewItem.title}"</strong> : 'đề xuất này'} để người tạo nắm rõ thông tin điều chỉnh.
          </div>
          <textarea
            value={rejectReasonInput}
            onChange={(e) => setRejectReasonInput(e.target.value)}
            placeholder="Nhập lý do từ chối chi tiết..."
            rows={4}
            autoFocus
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: '10px',
              border: '1px solid #CBD5E1',
              fontSize: '0.84rem',
              color: '#0F172A',
              background: '#FFFFFF',
              outline: 'none',
              resize: 'vertical',
              boxSizing: 'border-box'
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              onClick={() => setShowRejectModal(false)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#F8FAFC',
                color: '#475569',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={isProcessingApproval !== null || !rejectReasonInput.trim()}
              onClick={() => {
                void executeReject(rejectReasonInput);
              }}
              style={{
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: rejectReasonInput.trim() ? '#BD1D2D' : '#94A3B8',
                color: '#FFFFFF',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: isProcessingApproval !== null || !rejectReasonInput.trim() ? 'not-allowed' : 'pointer',
                opacity: isProcessingApproval !== null ? 0.65 : 1
              }}
            >
              {isProcessingApproval === 'reject' ? 'Đang xử lý...' : 'Xác nhận từ chối'}
            </button>
          </div>
        </div>
      </CustomModal>
    </AnimatePresence>,
    document.body
  );
};
