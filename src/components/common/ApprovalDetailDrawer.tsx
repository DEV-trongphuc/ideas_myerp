import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { fetchAPI } from '../../utils/api';
import { isItemAtMyStepToApprove as checkItemAtMyStepToApprove } from '../../utils/approvalPermissions';
import api from '../../api/axios';
import {
  FileText, Calendar, CheckCircle2, XCircle, Clock,
  ArrowRight, ShieldCheck, User, DollarSign, Plus,
  Search, Trash2, Paperclip, Users, CreditCard, Award,
  Receipt, Package, Briefcase, FileCheck, X, GitBranch,
  Clock3, Copy, Bell, Pencil, RefreshCw, Eye, Loader2,
  UserPlus, Check, Upload, Building2, Truck, Phone,
  MapPin, Landmark, Wallet, BarChart2, Palmtree, QrCode, ExternalLink
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { ProcessFeed } from '../../components/ui/ProcessFeed';
import { Avatar } from '../../components/ui/Avatar';
import { CustomSelect, getAvatarRingStyle } from '../../components/ui/CustomSelect';
import { motion, AnimatePresence } from 'framer-motion';
import { isExecutive, isAccountant, hasDynamicModulePermission } from '../../utils/roleUtils';
import { resolveHrRepresentativeUser } from '../../utils/teamLeader';
import { getVietQrUrl, normalizeVietQrText } from '../../utils/vietnamBanks';
import { BankLogo } from '../../components/ui/BankLogo';
import { NoteDetailModal, NoteCell, renderLinkifiedText } from '../../components/ui/NoteDetailModal';
import { QrImageModal } from '../../components/ui/QrImageModal';
import { numberToVietnameseText } from '../../utils/numberToText';
import { AttachmentLightboxModal, type AttachmentItem } from '../../components/ui/AttachmentLightboxModal';
import { pushOverlay } from '../../utils/overlayStack';
import { useTenantConfig, useTypedSetting } from '../../contexts/TenantConfigContext';
import {
  resolveLateEarlySubType,
  cleanLeaveReasonText,
  formatWaitDuration,
  formatApprovalCurrency,
  parseExpenseLineItems,
  type ApprovalItem
} from '../../utils/approvalFormatting';

export type { ApprovalItem } from '../../utils/approvalFormatting';

const GreenToggle = ({ checked, onChange, disabled, label, id }: { checked: boolean, onChange?: (val: boolean) => void, disabled?: boolean, label: string, id: string }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '12px' }}>
      <label htmlFor={id} style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)', cursor: disabled ? 'default' : 'pointer' }}>
        {label}
      </label>
      <label style={{
        position: 'relative',
        display: 'inline-block',
        width: '38px',
        height: '20px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0
      }}>
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={e => !disabled && onChange && onChange(e.target.checked)}
          style={{ opacity: 0, width: 0, height: 0 }}
          disabled={disabled}
        />
        <span style={{
          position: 'absolute',
          cursor: disabled ? 'not-allowed' : 'pointer',
          top: 0, left: 0, right: 0, bottom: 0,
          background: checked ? '#BD1D2D' : '#cbd5e1',
          transition: '0.22s cubic-bezier(0.25, 0.1, 0.25, 1)',
          borderRadius: '20px',
          opacity: disabled ? 0.7 : 1
        }}>
          <span style={{
            position: 'absolute',
            content: '""',
            height: '14px',
            width: '14px',
            left: checked ? '20px' : '3px',
            bottom: '3px',
            background: 'white',
            transition: '0.22s cubic-bezier(0.25, 0.1, 0.25, 1)',
            borderRadius: '50%',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
          }} />
        </span>
      </label>
    </div>
  );
};

const parseServerDate = (raw: any): Date | null => {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') : s;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
};

// Side-Drawer Component detailing step-by-step progress
export function ApprovalDetailDrawer({ item, onClose, users, t, onApprove, onReject, isAdmin, onDuplicate, onEdit, onDelete, zIndex, highlightCommentId }: {
  item: ApprovalItem;
  onClose: () => void;
  users: any[];
  t: any;
  onApprove: (item: ApprovalItem) => Promise<void>;
  onReject: (item: ApprovalItem) => void;
  isAdmin: boolean;
  onDuplicate?: (item: ApprovalItem) => void;
  onEdit?: (item: ApprovalItem) => void;
  onDelete?: (item: ApprovalItem, onDeleted?: () => void) => void;
  zIndex?: number;
  highlightCommentId?: string | null;
}) {
  const { config: detailOrgConfig } = useTenantConfig();
  const detailFxRates = useTypedSetting('finance.currency_and_fx_rates', {
    default: 'VND',
    rates_to_vnd: { USD: 25400, EUR: 30000, CHF: 32000 } as Record<string, number>
  });
  const detailVietQrCfg = useTypedSetting('finance.vietqr_config', {
    template: 'compact2',
    default_bank: 'VCB',
    memo_prefix: 'Thanh toan',
    memo_max_len: 50
  });
  const detailUiMotion = useTypedSetting('ui.overlay_zindex_and_motion_ms', {
    drawer_ms: 220,
    bezier: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
    z_drawer: 2147483625,
    z_modal_nested: 2147483646
  });
  const ideasLogoUrl = detailOrgConfig?.organization?.logo_url || '/cropped-logofavicon-1.webp';

  const toVndDetailAmount = useCallback((amount: number | string, currency?: string): number => {
    const n = Number(amount || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    const rawCur = String(currency || 'VND').toUpperCase().trim();
    if (rawCur === 'VND') return n;
    const key = rawCur === 'EURO' ? 'EUR' : rawCur;
    const rates = (detailFxRates?.rates_to_vnd || {}) as Record<string, number>;
    const rate = Number(rates[key] ?? rates[rawCur] ?? (key === 'USD' ? 25400 : key === 'EUR' ? 30000 : key === 'CHF' ? 32000 : 1));
    return n * (Number.isFinite(rate) && rate > 0 ? rate : 1);
  }, [detailFxRates]);

  const [detail, setDetail] = useState<any>(item || null);
  const [senderLeaveBalance, setSenderLeaveBalance] = useState<any>(null);
  const [loading, setLoading] = useState(!item);
  const [isClosing, setIsClosing] = useState(false);
  const [internalUsers, setInternalUsers] = useState<any[]>(users && users.length > 0 ? users : []);

  useEffect(() => {
    if (users && users.length > 0) {
      setInternalUsers(users);
    } else {
      const controller = new AbortController();
      let isSubscribed = true;
      api.get('/users', { signal: controller.signal }).then(res => {
        const uList = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        if (isSubscribed && uList.length > 0) {
          setInternalUsers(uList);
        }
      }).catch(() => {});
      return () => {
        isSubscribed = false;
        controller.abort();
      };
    }
  }, [users]);

  const effectiveUsers = useMemo(() => {
    return (users && users.length > 0) ? users : internalUsers;
  }, [users, internalUsers]);

  const [lightboxState, setLightboxState] = useState<{ isOpen: boolean; items: AttachmentItem[]; initialIndex: number }>({
    isOpen: false,
    items: [],
    initialIndex: 0
  });
  const [activeNoteModal, setActiveNoteModal] = useState<{ notes: string; itemName?: string; title?: string } | null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 1024 : false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [previewQrModalUrl, setPreviewQrModalUrl] = useState<string | null>(null);
  const [payingItemIndex, setPayingItemIndex] = useState<number | null>(null);
  const [uploadingUncIndex, setUploadingUncIndex] = useState<number | null>(null);
  const uncFileInputRef = useRef<HTMLInputElement>(null);
  const [targetUploadIndex, setTargetUploadIndex] = useState<number | null>(null);

  // Related Users (Watchers) states
  const [showAddWatcherDropdown, setShowAddWatcherDropdown] = useState(false);
  const [savingWatchers, setSavingWatchers] = useState(false);
  const [watcherSearch, setWatcherSearch] = useState('');
  const addWatcherDropdownRef = useRef<HTMLDivElement>(null);

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
  const executePayItemInFlightRef = useRef(false);
  const reminderSendInFlightRef = useRef(false);
  const addCommentInFlightRef = useRef(false);
  const deleteCommentInFlightRef = useRef(false);

  const handleUpdateWatchers = async (newIds: number[]) => {
    if (savingWatchers || updateWatchersInFlightRef.current) return;
    updateWatchersInFlightRef.current = true;
    setSavingWatchers(true);
    try {
      const targetType = ((item as any)?.type === 'commission_payout' || !item.type) ? 'expense' : item.type;
      const res = await api.post('/hrm/approvals/update-related-users', {
        type: targetType,
        id: item.id,
        related_user_ids: newIds
      });
      if (res.data?.success) {
        if (item) {
          (item as any).related_user_ids = newIds;
          if (Array.isArray((item as any).related_users)) {
            (item as any).related_users = (item as any).related_users.filter((u: any) => newIds.includes(Number(u.id || u.user_id)));
          }
        }
        setDetail((prev: any) => ({
          ...(prev || {}),
          related_user_ids: newIds,
          related_users: Array.isArray(prev?.related_users)
            ? prev.related_users.filter((u: any) => newIds.includes(Number(u.id || u.user_id)))
            : prev?.related_users
        }));
        toast.success(t('Đã cập nhật danh sách người theo dõi'));
        window.dispatchEvent(new CustomEvent('approval-updated'));
        window.dispatchEvent(new CustomEvent('refresh-approvals'));
      } else {
        toast.error(res.data?.message || t('Lỗi khi cập nhật người theo dõi'));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || t('Lỗi khi cập nhật người theo dõi'));
    } finally {
      updateWatchersInFlightRef.current = false;
      setSavingWatchers(false);
    }
  };

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    const closeDelay = Math.max(150, Number(detailUiMotion?.drawer_ms || 220));
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, closeDelay);
  }, [isClosing, onClose, detailUiMotion?.drawer_ms]);

  useEffect(() => {
    setIsClosing(false);
    if (item) {
      setDetail((prev: any) => (prev?.id === item.id && prev?.type === item.type ? prev : item));
    }
  }, [item?.id, item?.type]);

  useEffect(() => {
    return pushOverlay('approval-detail-drawer', () => {
      handleClose();
    }, zIndex || detailUiMotion?.z_drawer || 2147483625);
  }, [handleClose, zIndex, detailUiMotion?.z_drawer]);

  const handleCopyText = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`${t('Đã sao chép')} ${label}: ${text}`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const resolveFileUrl = (url?: string | null) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseUrl = import.meta.env.VITE_API_URL || '/backend';
    const clean = url.replace(/^\/?(backend\/)?/, '');
    return `${baseUrl}/${clean}`;
  };

  const handleViewUnc = (url: string) => {
    const resolved = resolveFileUrl(url);
    const isImg = /\.(jpg|jpeg|png|webp|gif|svg|bmp)(\?.*)?$/i.test(resolved);
    if (isImg) {
      setLightboxState({
        isOpen: true,
        items: [{ url: resolved, name: 'Ủy nhiệm chi (UNC)', type: 'image' }],
        initialIndex: 0
      });
    } else {
      window.open(resolved, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCommissionFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || targetUploadIndex === null) return;
    const idx = targetUploadIndex;
    setUploadingUncIndex(idx);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const fileUrl = uploadRes.data?.data?.url || uploadRes.data?.url || uploadRes.data?.file_url;
      if (!fileUrl) {
        toast.error(t('Không nhận được đường dẫn tệp sau khi tải lên'));
        return;
      }
      await handleExecutePayItem(idx, fileUrl);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || t('Lỗi tải tệp UNC'));
    } finally {
      setUploadingUncIndex(null);
      setTargetUploadIndex(null);
      if (e.target) e.target.value = '';
    }
  };

  const handleExecutePayItem = async (itemIdx: number, uncUrl?: string) => {
    if (executePayItemInFlightRef.current || payingItemIndex !== null) return;
    const rawItems = detail?.items || (item as any)?.items || [];
    const targetItem = Array.isArray(rawItems) ? rawItems[itemIdx] : null;
    if (!targetItem) return;
    executePayItemInFlightRef.current = true;
    setPayingItemIndex(itemIdx);
    try {
      const res = await api.post(`/expenses/${detail?.id || item.id}/pay-item`, {
        item_index: itemIdx,
        user_id: targetItem.user_id,
        unc_file_url: uncUrl || targetItem.unc_file_url || null
      });
      if (res.data?.success) {
        toast.success(t('Đã xác nhận chi và gửi thông báo riêng cho nhân sự!'));
        setDetail((prev: any) => {
          if (!prev) return prev;
          const currentItems = Array.isArray(prev.items) ? [...prev.items] : [];
          if (currentItems[itemIdx]) {
            currentItems[itemIdx] = {
              ...currentItems[itemIdx],
              is_paid: 1,
              paid_at: new Date().toISOString(),
              paid_by: user?.id,
              paid_by_name: user?.name || (user as any)?.full_name || 'Kế toán',
              ...(uncUrl ? { unc_file_url: uncUrl } : {})
            };
          }
          const allPaid = currentItems.length > 0 && currentItems.every((it: any) => it.is_paid == 1 || it.is_paid === true);
          return {
            ...prev,
            items: currentItems,
            is_refunded: allPaid ? 1 : prev.is_refunded
          };
        });
        window.dispatchEvent(new CustomEvent('approval-updated'));
      } else {
        toast.error(res.data?.message || t('Có lỗi xảy ra khi xác nhận'));
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || t('Không thể xác nhận chi trả'));
    } finally {
      executePayItemInFlightRef.current = false;
      setPayingItemIndex(null);
    }
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const { user } = useAuth();

  const isMyTurnToApprove = () => {
    if (loading) return false;
    const mergedItem = detail ? { ...item, ...detail } : item;
    const overallStatus = String(mergedItem?.status || 'pending').toLowerCase();
    const isPending = ['pending', 'pending_approval', 'pending_manager', 'pending_hr', 'level1_approved'].includes(overallStatus);
    if (!isPending) return false;

    const usersNameMap = new Map<string, any>();
    effectiveUsers.forEach((u: any) => {
      if (u?.full_name) usersNameMap.set(String(u.full_name).toLowerCase().trim(), u);
      if (u?.name) usersNameMap.set(String(u.name).toLowerCase().trim(), u);
      if (u?.username) usersNameMap.set(String(u.username).toLowerCase().trim(), u);
    });

    if (checkItemAtMyStepToApprove(mergedItem, user, usersNameMap)) return true;

    const role = (user?.role || '').toLowerCase();
    const isSuperAdmin = isExecutive(user);
    const itemTypeLower = String(item.type || '').toLowerCase();
    if (['po', 'purchase_order', 'so', 'sales_order', 'deposit', 'quote'].includes(itemTypeLower)) {
      return isSuperAdmin || role === 'manager' || isAccountant(user);
    }
    return false;
  };

  const [reminderTargetUser, setReminderTargetUser] = useState<any>(null);
  const [reminderMessage, setReminderMessage] = useState('');

  // Reminders states
  const [editingReminderStepIdx, setEditingReminderStepIdx] = useState<number | null>(null);
  const [reminderDateTime, setReminderDateTime] = useState('');
  const [stepReminders, setStepReminders] = useState<Record<number, string>>({});

  const [localComments, setLocalComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [detailTab, setDetailTab] = useState<'comments' | 'history'>('comments');

  const getCommentsEndpoint = (type: string, id: number) => {
    switch (String(type || '').toLowerCase()) {
      case 'expense':
        return `/expenses/${id}/comments`;
      case 'leave':
      case 'wfh':
      case 'ot':
      case 'late_early':
      case 'remote_work':
      case 'overtime':
        return `/hrm/leaves/${id}/comments`;
      case 'advance':
        return `/hrm/advances/${id}/comments`;
      case 'checkin':
        return `/check-ins/${id}/comments`;
      case 'attendance_bulk':
        return `/check-ins/bulk-requests/${id}/comments`;
      case 'deposit':
        return `/deposits/${id}/comments`;
      default:
        return null;
    }
  };

  const getDeleteCommentEndpoint = (type: string, commentId: number) => {
    switch (String(type || '').toLowerCase()) {
      case 'expense':
        return `/expenses/comments/${commentId}`;
      case 'leave':
      case 'wfh':
      case 'ot':
      case 'late_early':
      case 'remote_work':
      case 'overtime':
      case 'advance':
        return `/hrm/comments/${commentId}`;
      case 'checkin':
        return `/check-ins/comments/${commentId}`;
      case 'attendance_bulk':
        return `/attendance/bulk-requests/comments/${commentId}`;
      case 'deposit':
        return `/deposits/comments/${commentId}`;
      default:
        return null;
    }
  };

  const fetchComments = async (abortSignal?: AbortSignal) => {
    const endpoint = getCommentsEndpoint(item.type, item.id);
    if (!endpoint) return;
    setLoadingComments(true);
    try {
      const res = await api.get(endpoint, abortSignal ? { signal: abortSignal } : undefined);
      if (abortSignal?.aborted) return;
      const rawData = res.data?.data ?? res.data;
      const dbComments = Array.isArray(rawData) ? rawData : [];
      const mapped = dbComments.map((c: any) => {
        const parsedCreated = parseServerDate(c.created_at) || new Date();
        return {
          id: c.id,
          author: c.user_name || t('Tôi'),
          user_name: c.user_name || t('Tôi'),
          avatar: c.avatar_url || c.avatar || c.user_avatar || c.user_avatar_url,
          avatar_url: c.avatar_url || c.avatar || c.user_avatar || c.user_avatar_url,
          user_id: c.user_id,
          parent_id: c.parent_id ? Number(c.parent_id) : null,
          created_at: c.created_at,
          time: parsedCreated.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          text: c.body || '',
          body: c.body || '',
          attachments: Array.isArray(c.attachments) ? c.attachments : [],
          timestamp: parsedCreated.getTime()
        };
      });

      // Sort user comments descending (newest first)
      mapped.sort((a: any, b: any) => b.timestamp - a.timestamp);

      // Build birth system log (ALWAYS at the bottom)
      const createdAtVal = detail?.created_at || item.created_at;
      const parsedBirth = parseServerDate(createdAtVal) || new Date();
      const sys1 = { 
        id: 'sys-1', 
        author: t('Hệ thống quy trình IDEAS'), 
        avatar: ideasLogoUrl,
        avatar_url: ideasLogoUrl,
        time: parsedBirth.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }), 
        text: `${t('Đã tiếp nhận yêu cầu phê duyệt và bắt đầu quy trình lúc')} ${parsedBirth.toLocaleString('vi-VN')}.`, 
        attachments: []
      };

      const combined: any[] = [];
      const overall = (item.status || detail?.status || 'pending').toLowerCase();
      if (overall === 'approved') {
        const approvedAtVal = detail?.approved_at || detail?.updated_at || (item as any).updated_at || new Date().toISOString();
        const parsedApp = parseServerDate(approvedAtVal) || new Date();
        combined.push({
          id: 'sys-2',
          author: t('Hệ thống quy trình IDEAS'),
          avatar: ideasLogoUrl,
          avatar_url: ideasLogoUrl,
          time: parsedApp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          text: `✅ ${t('Yêu cầu đã được phê duyệt thành công lúc')} ${parsedApp.toLocaleString('vi-VN')}.`,
          attachments: []
        });
      } else if (overall === 'rejected') {
        const rejectedAtVal = detail?.updated_at || (item as any).updated_at || new Date().toISOString();
        const parsedRej = parseServerDate(rejectedAtVal) || new Date();
        const reasonStr = detail?.reason || detail?.reject_reason || '';
        combined.push({
          id: 'sys-2',
          author: t('Hệ thống quy trình IDEAS'),
          avatar: ideasLogoUrl,
          avatar_url: ideasLogoUrl,
          time: parsedRej.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          text: `❌ ${t('Yêu cầu bị từ chối lúc')} ${parsedRej.toLocaleString('vi-VN')}.${reasonStr ? ` Lý do: ${reasonStr}` : ''}`,
          attachments: []
        });
      }

      // Add user comments (newest first)
      combined.push(...mapped);

      // Place birth system log at the very end
      combined.push(sys1);

      setLocalComments(combined);
    } catch (e) {
      console.error('Error fetching comments:', e);
    } finally {
      setLoadingComments(false);
    }
  };
  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<any[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);

  const handleCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data && res.data.success && res.data.data?.url) {
        setCommentAttachments([...commentAttachments, { name: file.name, url: res.data.data.url }]);
        toast.success(t('Đã đính kèm tệp!'));
      } else {
        throw new Error(res.data?.message || t('Tải lên thất bại'));
      }
    } catch (err: any) {
      toast.error(t('Lỗi tải tệp: ') + (err.message || ''));
    } finally {
      setUploadingFile(false);
    }
  };

  const commentInFlightRef = useRef(false);
  const handleAddComment = async () => {
    if (!newComment.trim() && commentAttachments.length === 0) return;
    if (commentInFlightRef.current) return;
    commentInFlightRef.current = true;
    const endpoint = getCommentsEndpoint(item.type, item.id);
    if (!endpoint) {
      // Fallback local only if type not supported
      const commentObj = {
        id: Date.now(),
        author: t('Tôi'),
        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        text: newComment,
        attachments: commentAttachments
      };
      setLocalComments([...localComments, commentObj]);
      setNewComment('');
      setCommentAttachments([]);
      toast.success(t('Đăng bình luận thành công!'));
      commentInFlightRef.current = false;
      return;
    }

    try {
      const res = await api.post(endpoint, {
        body: newComment,
        attachments: commentAttachments
      });
      if (res.data?.success || res.data?.id) {
        toast.success(t('Đăng bình luận thành công!'));
        setNewComment('');
        setCommentAttachments([]);
        fetchComments();
      }
    } catch (e: any) {
      console.error('Error adding comment:', e);
      if (e.response && e.response.data && e.response.data.message) {
        toast.error(e.response.data.message);
      } else {
        toast.error(t('Lỗi khi đăng bình luận.'));
      }
    } finally {
      commentInFlightRef.current = false;
    }
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const fetchDetail = async () => {
      if (!item || !item.id || item.id <= 0) {
        setLoading(false);
        return;
      }
      if (!detail) {
        setLoading(true);
      }
      try {
        const itemTypeLower = String(item.type || '').toLowerCase();
        if (['leave', 'wfh', 'ot', 'late_early', 'remote_work', 'overtime'].includes(itemTypeLower)) {
          let foundObj: any = null;
          try {
            const res = await api.get(`/hrm/leaves/${item.id}`, { signal: controller.signal });
            const found = res?.data?.data || res?.data;
            if (found && found.id) {
              foundObj = found;
            }
          } catch (err) {}
          if (!foundObj && !controller.signal.aborted) {
            try {
              const res = await api.get(`/hrm/leaves?id=${item.id}`, { signal: controller.signal });
              const found = res?.data?.data || res?.data;
              if (found && found.id) {
                foundObj = found;
              }
            } catch (err) {}
          }
          if (!foundObj && !controller.signal.aborted) {
            const listRes = await fetchAPI('hrm/leaves', { signal: controller.signal });
            const list = Array.isArray(listRes?.data) ? listRes.data : (listRes?.data?.items || []);
            const foundInList = Array.isArray(list) ? list.find((l: any) => l.id === item.id) : null;
            if (foundInList) foundObj = foundInList;
          }
          if (active && foundObj) setDetail((prev: any) => ({ ...(prev || {}), ...foundObj }));

          // Fetch sender leave balance
          const targetUid = foundObj?.user_id || item?.user_id;
          if (targetUid && !controller.signal.aborted) {
            try {
              const balRes = await api.get(`/hrm/user-balance?user_id=${targetUid}`, { signal: controller.signal });
              const b = balRes?.data?.data || balRes?.data;
              if (active && b) {
                setSenderLeaveBalance(b);
              }
            } catch (err) {}
          }
        } else if (itemTypeLower === 'advance') {
          try {
            const res = await api.get(`/hrm/advances?id=${item.id}`, { signal: controller.signal });
            const found = res?.data?.data || res?.data;
            if (active && found && found.id) {
              setDetail((prev: any) => ({ ...(prev || {}), ...found }));
              return;
            }
          } catch (err) {}
          if (!controller.signal.aborted) {
            const listRes = await fetchAPI('hrm/advances', { signal: controller.signal });
            const list = Array.isArray(listRes?.data) ? listRes.data : (listRes?.data?.items || []);
            const foundInList = Array.isArray(list) ? list.find((a: any) => a.id === item.id) : null;
            if (active && foundInList) setDetail((prev: any) => ({ ...(prev || {}), ...foundInList }));
          }
        } else if (itemTypeLower === 'expense') {
          const res = await api.get(`/expenses/${item.id}`, { signal: controller.signal });
          const found = res?.data?.data || res?.data;
          if (active && found) setDetail((prev: any) => ({ ...(prev || {}), ...found }));
        } else if (itemTypeLower === 'po' || itemTypeLower === 'purchase_order') {
          try {
            const res = await api.get(`/purchase-orders/${item.id}`, { signal: controller.signal });
            const found = res?.data?.data || res?.data;
            if (active && found && found.id) {
              setDetail((prev: any) => ({ ...(prev || {}), ...found }));
            }
          } catch (err) {}
        } else if (itemTypeLower === 'so' || itemTypeLower === 'sales_order') {
          try {
            const res = await api.get(`/sales-orders/${item.id}`, { signal: controller.signal });
            const found = res?.data?.data || res?.data;
            if (active && found && found.id) {
              setDetail((prev: any) => ({ ...(prev || {}), ...found }));
            }
          } catch (err) {}
        } else if (itemTypeLower === 'deposit') {
          try {
            const res = await api.get(`/deposits/${item.id}`, { signal: controller.signal });
            const found = res?.data?.data || res?.data;
            if (active && found && found.id) {
              setDetail((prev: any) => ({ ...(prev || {}), ...found }));
            }
          } catch (err) {}
        } else if (itemTypeLower === 'quote') {
          try {
            const res = await api.get(`/quotes/${item.id}`, { signal: controller.signal });
            const found = res?.data?.data || res?.data;
            if (active && found && found.id) {
              setDetail((prev: any) => ({ ...(prev || {}), ...found }));
            }
          } catch (err) {}
        } else if (itemTypeLower === 'checkin' || itemTypeLower === 'attendance_bulk') {
          if (itemTypeLower === 'attendance_bulk') {
            try {
              const res = await api.get(`/check-ins/bulk-requests/${item.id}`, { signal: controller.signal });
              const bulkData = res?.data?.data || res?.data;
              if (active && bulkData && (bulkData.id || bulkData.details)) {
                setDetail((prev: any) => ({ ...(prev || {}), ...bulkData }));
                return;
              }
            } catch (err) {}
          } else {
            try {
              const res = await api.get(`/check-ins/${item.id}`, { signal: controller.signal });
              const found = res?.data?.data || res?.data;
              if (active && found && found.id) {
                setDetail((prev: any) => ({ ...(prev || {}), ...found }));
                return;
              }
            } catch (err) {}
          }
          // Secondary fallback for cross-type requests
          if (!controller.signal.aborted) {
            try {
              const bulkRes = await api.get(`/check-ins/bulk-requests/${item.id}`, { signal: controller.signal });
              const bulkData = bulkRes?.data?.data || bulkRes?.data;
              if (active && bulkData && (bulkData.id || bulkData.details)) {
                setDetail((prev: any) => ({ ...(prev || {}), ...bulkData }));
                return;
              }
            } catch (err) {}
          }
          if (!controller.signal.aborted) {
            try {
              const listRes = await api.get('/check-ins', { signal: controller.signal });
              const list = Array.isArray(listRes?.data?.data) ? listRes.data.data : (listRes?.data?.data?.items || listRes?.data?.items || listRes?.data || []);
              const foundInList = Array.isArray(list) ? list.find((c: any) => c.id === item.id) : null;
              if (active && foundInList) setDetail((prev: any) => ({ ...(prev || {}), ...foundInList }));
            } catch (err) {}
          }
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError' && e?.name !== 'CanceledError') {
          console.error(e);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchDetail();
    const handleRefreshDetail = () => {
      if (active) fetchDetail();
    };
    window.addEventListener('approval-updated', handleRefreshDetail);
    window.addEventListener('refresh-approvals', handleRefreshDetail);
    return () => {
      active = false;
      controller.abort();
      window.removeEventListener('approval-updated', handleRefreshDetail);
      window.removeEventListener('refresh-approvals', handleRefreshDetail);
    };
  }, [item?.id, item?.type]);

  useEffect(() => {
    if (!item?.id) return;
    const controller = new AbortController();
    fetchComments(controller.signal);
    return () => controller.abort();
  }, [item?.id, item?.type]);

  const feedContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const targetCommentId = highlightCommentId || searchParams.get('highlight_comment_id') || searchParams.get('comment_id');
    const regularComments = localComments.filter((c: any) => !String(c.id).startsWith('sys-'));
    if (!targetCommentId || regularComments.length === 0) return;

    const timer = setTimeout(() => {
      const container = feedContainerRef.current;
      if (!container) return;

      const targetComment = regularComments.find((c: any) => String(c.id) === String(targetCommentId));
      const allCommentCards = Array.from(container.querySelectorAll('.custom-scrollbar div[style*="position: relative"]')) as HTMLElement[];
      let targetEl: HTMLElement | null = document.getElementById(`approval-comment-${targetCommentId}`) || document.getElementById(`comment-${targetCommentId}`);

      if (!targetEl && targetComment) {
        const snippet = String(targetComment.text || targetComment.body || targetComment.content || '').replace(/<[^>]*>/g, '').trim().slice(0, 40);
        if (snippet) {
          targetEl = allCommentCards.find(el => (el.textContent || '').includes(snippet)) || null;
        }
      }
      if (!targetEl && allCommentCards.length > 0) {
        const idx = regularComments.findIndex((c: any) => String(c.id) === String(targetCommentId));
        if (idx >= 0 && allCommentCards[idx]) {
          targetEl = allCommentCards[idx];
        }
      }

      const scrollTarget = targetEl || container;
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });

      if (targetEl) {
        const bubble = (targetEl.querySelector('div[style*="border-radius"]') as HTMLElement) || targetEl;
        const origTransition = bubble.style.transition;
        const origBoxShadow = bubble.style.boxShadow;
        const origBg = bubble.style.backgroundColor;
        bubble.style.transition = 'all 0.4s ease';
        bubble.style.boxShadow = '0 0 0 2px #f59e0b, 0 4px 12px rgba(245, 158, 11, 0.25)';
        bubble.style.backgroundColor = 'rgba(254, 243, 199, 0.65)';
        setTimeout(() => {
          bubble.style.boxShadow = origBoxShadow;
          bubble.style.backgroundColor = origBg;
          setTimeout(() => { bubble.style.transition = origTransition; }, 400);
        }, 2800);
      }

      if (searchParams.has('highlight_comment_id') || searchParams.has('comment_id')) {
        searchParams.delete('highlight_comment_id');
        searchParams.delete('comment_id');
        const qs = searchParams.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [highlightCommentId, localComments]);

  const creatorUser = useMemo(() => {
    const creatorId = detail?.user_id || detail?.created_by || (item as any)?.user_id || (item as any)?.created_by;
    const empName = detail?.employee_name || detail?.full_name || (item as any)?.employee_name || (item as any)?.full_name || (detail?.user as any)?.name;
    const isSelf = (creatorId && user?.id && Number(creatorId) === Number(user.id)) ||
      (empName && user && String(empName).trim().toLowerCase() === String((user as any).full_name || user.name || '').trim().toLowerCase());
    const selfAvatar = isSelf ? ((user as any)?.avatar_url || user?.avatar) : undefined;
    const empAvatar = detail?.employee_avatar || detail?.avatar_url || (item as any)?.avatar_url || (item as any)?.employee_avatar || (detail?.user as any)?.avatar || selfAvatar;

    if (creatorId) {
      const foundById = effectiveUsers.find(u => Number(u.id) === Number(creatorId));
      if (foundById) return { ...foundById, avatar_url: foundById.avatar_url || empAvatar };
    }
    if (empName && typeof empName === 'string' && empName.trim()) {
      const cleanEmpName = empName.trim().toLowerCase();
      const foundByName = effectiveUsers.find(u => {
        const fn = (u.full_name || u.name || '').toLowerCase().trim();
        return fn === cleanEmpName || fn.includes(cleanEmpName) || cleanEmpName.includes(fn);
      });
      if (foundByName) return { ...foundByName, avatar_url: foundByName.avatar_url || empAvatar };
      return {
        id: creatorId || 0,
        full_name: empName,
        name: empName,
        avatar_url: empAvatar
      };
    }
    if (creatorId) {
      return {
        id: creatorId,
        full_name: `User #${creatorId}`,
        name: `User #${creatorId}`,
        avatar_url: empAvatar
      };
    }
    return user || null;
  }, [effectiveUsers, detail, item, user]);

  const getEmployeeName = () => {
    if (detail?.employee_name) return detail.employee_name;
    if (detail?.full_name) return detail.full_name;
    if (item.employee_name) return item.employee_name;
    if (creatorUser?.full_name || creatorUser?.name) return (creatorUser.full_name || creatorUser.name);
    return t('Nhân viên');
  };

  const getEmployeeAvatar = () => {
    return creatorUser?.avatar_url || creatorUser?.avatar;
  };

  const renderTimeline = () => {
    if (loading && !detail && !item) {
      return (
        <div style={{ position: 'relative', paddingLeft: '2.5rem', marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2.5rem' }}>
          <style>{`
            @keyframes skeleton-pulse {
              0% { opacity: 0.6; }
              50% { opacity: 0.35; }
              100% { opacity: 0.6; }
            }
            .skeleton-box {
              background: var(--color-border-light);
              animation: skeleton-pulse 1.5s ease-in-out infinite;
              border-radius: 6px;
            }
          `}</style>
          
          <div style={{
            position: 'absolute',
            left: '9px',
            top: '16px',
            bottom: '16px',
            width: '2px',
            background: 'var(--color-border-light)'
          }} />

          {[1, 2, 3].map(i => (
            <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <div className="skeleton-box" style={{
                position: 'absolute',
                left: '-2.5rem',
                top: '12px',
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                boxShadow: '0 0 0 4px var(--color-surface)',
                zIndex: 10
              }} />

              <div style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '12px',
                padding: '1.25rem',
                position: 'relative'
              }}>
                <div style={{
                  position: 'absolute',
                  left: '-8px',
                  top: '16px',
                  width: 0,
                  height: 0,
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                  borderRight: '8px solid var(--color-border-light)',
                  zIndex: 1
                }} />
                <div style={{
                  position: 'absolute',
                  left: '-7px',
                  top: '16px',
                  width: 0,
                  height: 0,
                  borderTop: '6px solid transparent',
                  borderBottom: '6px solid transparent',
                  borderRight: '8px solid var(--color-surface)',
                  zIndex: 2
                }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="skeleton-box" style={{ width: '45%', height: '14px' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="skeleton-box" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                    <div className="skeleton-box" style={{ width: '30%', height: '12px' }} />
                  </div>
                  <div className="skeleton-box" style={{ width: '70%', height: '12px', marginTop: '4px' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    const rawDesc = detail?.notes || detail?.description || detail?.reason || item.description || '';
    const isPrintStampSend = item.type === 'expense' && rawDesc.includes('Quy trình: In, đóng dấu và gửi hồ sơ');

    // Determine actual approver user IDs configured for this proposal
    const app1Id = detail?.approver_id || detail?.manager_id || (item as any)?.approver_id || (item as any)?.manager_id || detail?.approved_by || (item as any)?.approved_by;
    const app2Id = detail?.approver_id_2 || (item as any)?.approver_id_2;
    const app3Id = detail?.director_id || detail?.approver_id_3 || (item as any)?.approver_id_3;

    const app1Name = detail?.approver_name || (item as any)?.approver_name || detail?.manager_name || (item as any)?.manager_name || detail?.approved_by_name || (item as any)?.approved_by_name;
    const app2Name = detail?.approver_name_2 || (item as any)?.approver_name_2 || detail?.approved_by_name_2 || (item as any)?.approved_by_name_2;
    const app3Name = detail?.approver_name_3 || (item as any)?.approver_name_3 || detail?.approved_by_name_3 || (item as any)?.approved_by_name_3;

    const app1Avatar = detail?.approver_avatar || (item as any)?.approver_avatar || detail?.approved_by_avatar || (item as any)?.approved_by_avatar;
    const app2Avatar = detail?.approver_avatar_2 || (item as any)?.approver_avatar_2 || detail?.approved_by_avatar_2 || (item as any)?.approved_by_avatar_2;
    const app3Avatar = detail?.approver_avatar_3 || (item as any)?.approver_avatar_3 || detail?.approved_by_avatar_3 || (item as any)?.approved_by_avatar_3;

    // Is it an HR workflow (leave, remote_work, late_early, overtime, attendance_bulk, checkin)?
    const isHrItem = item.type === 'leave' || item.type === 'checkin' || item.type === 'attendance_bulk' || rawDesc.includes('[Đăng ký làm việc từ xa]') || rawDesc.includes('[Đi muộn/Về sớm]') || rawDesc.includes('[Tăng ca]') || rawDesc.includes('[Nghỉ phép]');

    const isGenericLabel = (n: any) => {
      if (!n || typeof n !== 'string') return true;
      const cl = n.toLowerCase().trim();
      return !cl || ['quản lý trực tiếp', 'ban giám đốc', 'duyệt', 'người duyệt', 'chờ phân công', 'cấp 1', 'cấp 2', 'cấp 3', 'thực hiện'].includes(cl);
    };

    const findUserByIdOrName = (id: any, name: any, fallbackRoleTitle?: string, fallbackAvatar?: string) => {
      if (id) {
        const byId = effectiveUsers.find(u => Number(u.id) === Number(id));
        if (byId) return { ...byId, avatar_url: byId.avatar_url || fallbackAvatar };
      }
      if (name && typeof name === 'string' && name.trim() && !isGenericLabel(name)) {
        const cleanName = name.trim().toLowerCase();
        const byName = effectiveUsers.find(u => {
          const fn = (u.full_name || u.name || '').toLowerCase().trim();
          return fn === cleanName || fn.includes(cleanName) || cleanName.includes(fn);
        });
        if (byName) return { ...byName, avatar_url: byName.avatar_url || fallbackAvatar };
        return {
          id: id ? (Number(id) || id) : `approver-${name}`,
          full_name: name,
          name: name,
          avatar_url: fallbackAvatar,
          role_title: fallbackRoleTitle || ''
        };
      }
      if (id) {
        return {
          id: Number(id) || id,
          full_name: (!isGenericLabel(name) ? name : '') || `Người duyệt #${id}`,
          name: (!isGenericLabel(name) ? name : '') || `Người duyệt #${id}`,
          avatar_url: fallbackAvatar,
          role_title: fallbackRoleTitle || ''
        };
      }
      return null;
    };

    const defaultHrLeader = resolveHrRepresentativeUser(effectiveUsers);

    // Direct team leader of creator (if exists, belongs to same team, and different from creator)
    const directTeamLeader = creatorUser?.team_id ? effectiveUsers.find(u => 
      Number(u.team_id) === Number(creatorUser.team_id) && 
      ['manager', 'leader', 'truongphong'].includes(String(u.role).toLowerCase()) && 
      Number(u.id) !== Number(creatorUser.id)
    ) : null;

    const managerUser = findUserByIdOrName(app1Id, app1Name, t('Người duyệt Cấp 1'), app1Avatar)
      || directTeamLeader
      || (isHrItem ? defaultHrLeader : null)
      || (!isHrItem ? effectiveUsers.find(u => ['manager', 'director', 'admin'].includes(String(u.role).toLowerCase())) : null)
      || defaultHrLeader
      || (app1Name || app1Id ? { id: app1Id || 1, full_name: app1Name || (app1Id ? `Người duyệt #${app1Id}` : 'Người duyệt Cấp 1'), name: app1Name || (app1Id ? `Người duyệt #${app1Id}` : 'Người duyệt Cấp 1'), avatar_url: app1Avatar } : null);

    const accountantUser = findUserByIdOrName(app2Id, app2Name, t('Người duyệt Cấp 2'), app2Avatar)
      || effectiveUsers.find(u => String(u.role).toLowerCase() === 'accountant')
      || (app2Name || app2Id ? { id: app2Id || 2, full_name: app2Name || (app2Id ? `Người duyệt #${app2Id}` : 'Người duyệt Cấp 2'), name: app2Name || (app2Id ? `Người duyệt #${app2Id}` : 'Người duyệt Cấp 2'), avatar_url: app2Avatar } : null);

    const directorUser = findUserByIdOrName(app3Id, app3Name, t('Người duyệt Cấp 3'), app3Avatar)
      || effectiveUsers.find(u => ['director', 'admin', 'superadmin'].includes(String(u.role).toLowerCase()))
      || (app3Name || app3Id ? { id: app3Id || 3, full_name: app3Name || (app3Id ? `Người duyệt #${app3Id}` : 'Người duyệt Cấp 3'), name: app3Name || (app3Id ? `Người duyệt #${app3Id}` : 'Người duyệt Cấp 3'), avatar_url: app3Avatar } : null);

    // Multi-level conditions: Only show Level 2 if app2Id exists or it's multi-level finance
    const hasLevel2 = !isPrintStampSend && (Boolean(app2Id) || (!isHrItem && (item.type === 'advance' || (item.type === 'expense' && Boolean(detail?.approver_id_2)))));
    const hasLevel3 = !isPrintStampSend && !isHrItem && (Boolean(app3Id) || (item.type === 'expense' && Boolean(detail?.approver_id_3)));

    const overallStatus = (item.status || 'pending').toLowerCase();
    const s1 = (detail?.status_level_1 || (item as any)?.status_level_1 || overallStatus).toLowerCase();
    const s2 = (detail?.status_level_2 || (item as any)?.status_level_2 || 'pending').toLowerCase();

    // Helper to format approval time
    const formatApprovalTime = (rawDate: any) => {
      const d = parseServerDate(rawDate);
      return d ? d.toLocaleString('vi-VN') : '';
    };

    // Construct array of actual steps
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
    }> = [];

    // Check if there are MISA dynamic approval steps from structured field or genuine MISA sync record
    const isGenuineMisaRecord = Boolean((detail?.title || item?.title || '').match(/^\[MISA #\d+\]/i) && !detail?.approver_id);
    const approvalStepsMatch = isGenuineMisaRecord ? rawDesc.match(/\[APPROVAL_STEPS\]:\s*(\[[\s\S]*?\])(?=\n\n|\n\[|$)/i) : null;
    let misaSteps: any[] | null = null;
    if (detail?.approval_steps) {
      if (Array.isArray(detail.approval_steps)) {
        misaSteps = detail.approval_steps;
      } else if (typeof detail.approval_steps === 'string') {
        try {
          misaSteps = JSON.parse(detail.approval_steps);
        } catch (e) {}
      }
    } else if (approvalStepsMatch) {
      try {
        const parsed = JSON.parse(approvalStepsMatch[1]);
        if (Array.isArray(parsed)) misaSteps = parsed;
      } catch (e) {}
    }

    if (misaSteps && Array.isArray(misaSteps) && misaSteps.length > 0) {
      misaSteps.forEach((st: any, idx: number) => {
        const uName = st.user_name || st.actor || '';
        const uCode = st.user_code || '';
        const cleanUName = (uName || '').toLowerCase().trim();
        const matchedUser = effectiveUsers.find(u => 
          (st.user_id && Number(u.id) === Number(st.user_id)) ||
          (uCode && String((u as any).code || '').toLowerCase() === uCode.toLowerCase()) ||
          (cleanUName && (u.full_name || u.name) && (
            (u.full_name || u.name).toLowerCase().trim() === cleanUName ||
            (u.full_name || u.name).toLowerCase().includes(cleanUName) ||
            cleanUName.includes((u.full_name || u.name).toLowerCase().trim())
          ))
        );

        const stepUser = matchedUser || {
          id: st.user_id || `misa-${idx}`,
          full_name: uName || 'Nhân sự thực hiện',
          avatar: st.avatar || st.avatar_url || st.user_avatar || null,
          avatar_url: st.avatar || st.avatar_url || st.user_avatar || null
        };

        const rawStatus = (st.status || '').toLowerCase();
        let stepStatus: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'pending';
        if (rawStatus === 'approved' || rawStatus === 'done' || rawStatus === 'completed' || rawStatus === 'đã duyệt' || rawStatus === 'đã thực hiện') {
          stepStatus = 'approved';
        } else if (rawStatus === 'rejected' || rawStatus === 'từ chối') {
          stepStatus = 'rejected';
        } else if (rawStatus === 'not_reached' || rawStatus === 'chưa đến') {
          stepStatus = 'not_reached';
        } else {
          stepStatus = 'pending';
        }

        const stepRole = st.role || (matchedUser as any)?.role_title || (matchedUser as any)?.department || (matchedUser as any)?.role || (idx === 0 ? t('Người lập đề xuất') : t('Người phê duyệt'));
        const stepTitle = st.title || st.step_name || (idx === 0 ? t('Lập đề xuất & gửi') : `Phê duyệt (Cấp ${idx})`);
        const prevStepTime = idx > 0 ? (misaSteps[idx - 1]?.time || detail?.created_at || item.created_at) : (detail?.created_at || item.created_at);

        steps.push({
          stepNumber: idx + 1,
          title: `Bước ${idx + 1}: ${stepTitle}`,
          roleTitle: stepRole,
          user: stepUser,
          status: stepStatus,
          approvedAt: (stepStatus === 'approved' || stepStatus === 'rejected') && st.time ? formatApprovalTime(st.time) : '',
          waitingSince: stepStatus === 'pending' ? prevStepTime : null,
          showBell: stepStatus === 'pending',
          notes: st.notes || st.comment || ''
        });
      });
    } else {
      // Step 1: Submitter
      const step1CreatedTime = detail?.created_at || item.created_at;
      steps.push({
        stepNumber: 1,
        title: isPrintStampSend ? t('Bước 1: Thông tin hồ sơ') : t('Bước 1: Lập đề xuất & gửi'),
        roleTitle: t('Người lập đề xuất'),
        user: creatorUser,
        status: 'approved',
        approvedAt: formatApprovalTime(step1CreatedTime)
      });

      // Step 2: Level 1 Approver
      let s1Status: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'pending';
      if (s1 === 'approved' || overallStatus === 'approved') s1Status = 'approved';
      else if (s1 === 'rejected' || overallStatus === 'rejected') s1Status = 'rejected';

      const s1ApprovedTime = detail?.approved_at || null;

      let printStampSendExecUser = null;
      if (isPrintStampSend) {
        const mExec = rawDesc.match(/Người thực hiện:\s*([^\n]+)/i);
        const parsedExecName = mExec ? mExec[1].trim() : '';
        if (parsedExecName) {
          printStampSendExecUser = effectiveUsers.find(u => 
            u.full_name?.toLowerCase() === parsedExecName.toLowerCase() || 
            u.name?.toLowerCase() === parsedExecName.toLowerCase() ||
            u.full_name?.toLowerCase().includes(parsedExecName.toLowerCase())
          );
        }
        if (!printStampSendExecUser) {
          printStampSendExecUser = resolveHrRepresentativeUser(effectiveUsers);
        }
      }

      steps.push({
        stepNumber: steps.length + 1,
        title: isPrintStampSend ? t('Bước 2: Xác nhận hoàn thành') : t('Bước 2: Phê duyệt (Cấp 1)'),
        roleTitle: isPrintStampSend ? t('Người thực hiện') : t('Người duyệt Cấp 1'),
        user: isPrintStampSend ? (printStampSendExecUser || effectiveUsers.find(u => Number(u.id) === Number(app1Id)) || managerUser) : managerUser,
        status: s1Status,
        approvedAt: s1Status === 'approved' || s1Status === 'rejected' ? formatApprovalTime(s1ApprovedTime) : '',
        waitingSince: s1Status === 'pending' ? step1CreatedTime : null,
        showBell: s1Status === 'pending'
      });

      // Step 3: Level 2 Approver if exists
      let s2ApprovedTime: any = null;
      if (hasLevel2) {
        let s2Status: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'pending';
        if (s2 === 'approved' || overallStatus === 'approved') s2Status = 'approved';
        else if (s1 !== 'approved' && overallStatus !== 'approved') s2Status = 'not_reached';
        else if (s2 === 'rejected' || overallStatus === 'rejected') s2Status = 'rejected';

        s2ApprovedTime = detail?.approved_at_2 || null;

        steps.push({
          stepNumber: steps.length + 1,
          title: t('Bước 3: Phê duyệt (Cấp 2)'),
          roleTitle: t('Người duyệt Cấp 2'),
          user: accountantUser,
          status: s2Status,
          approvedAt: s2Status === 'approved' || s2Status === 'rejected' ? formatApprovalTime(s2ApprovedTime) : '',
          waitingSince: s2Status === 'pending' ? (s1ApprovedTime || step1CreatedTime) : null,
          showBell: s2Status === 'pending'
        });
      }

      // Step 4: Level 3 Approver if exists
      if (hasLevel3) {
        let s3Status: 'approved' | 'rejected' | 'pending' | 'not_reached' = 'pending';
        if (overallStatus === 'approved') s3Status = 'approved';
        else if (s2 !== 'approved' && overallStatus !== 'approved') s3Status = 'not_reached';
        else if (overallStatus === 'rejected') s3Status = 'rejected';

        const s3ApprovedTime = detail?.approved_at_3 || null;

        steps.push({
          stepNumber: steps.length + 1,
          title: t('Bước 4: Phê duyệt (Cấp 3)'),
          roleTitle: t('Người duyệt Cấp 3'),
          user: directorUser,
          status: s3Status,
          approvedAt: s3Status === 'approved' || s3Status === 'rejected' ? formatApprovalTime(s3ApprovedTime) : '',
          waitingSince: s3Status === 'pending' ? (s2ApprovedTime || s1ApprovedTime || step1CreatedTime) : null,
          showBell: s3Status === 'pending'
        });
      }
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginTop: '12px', position: 'relative', paddingLeft: '30px', textAlign: 'left' }}>
        <div style={{ position: 'absolute', left: '10px', top: '10px', bottom: '10px', width: '2px', background: 'var(--color-border-light)' }} />
        
        {steps.map((st) => {
          let bg = 'var(--color-primary)';
          let textCol = '#ffffff';
          let iconContent: React.ReactNode = String(st.stepNumber);
          let avatarBorderColor = '#f59e0b'; // Cam chờ duyệt

          if (st.status === 'approved') {
            bg = '#10b981';
            iconContent = '✓';
            avatarBorderColor = '#10b981'; // Xanh lá đã duyệt
          } else if (st.status === 'rejected') {
            bg = '#ef4444';
            iconContent = '✗';
            avatarBorderColor = '#ef4444'; // Đỏ từ chối
          } else if (st.status === 'not_reached') {
            bg = 'var(--color-border-light)';
            textCol = 'var(--color-text-muted)';
            avatarBorderColor = '#cbd5e1'; // Xám chưa tới lượt
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
                      onClick={() => { setReminderTargetUser(st.user); setReminderMessage(''); }}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                      title={t('Gửi nhắc nhở')}
                    >
                      <Bell size={18} fill="#ef4444" />
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
                    ...users.map(u => ({
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
                    {st.stepNumber === 1 ? `${t('Đã gửi lúc')} ${st.approvedAt || new Date().toLocaleString('vi-VN')}` : `✓ ${t('Đã duyệt')} ${st.approvedAt ? `${t('lúc')} ${st.approvedAt}` : ''}`}
                  </span>
                )}
                {st.status === 'rejected' && (
                  <span style={{ fontSize: '0.725rem', color: '#ef4444', marginTop: '4px', display: 'block', fontWeight: 600 }}>
                    ✗ {t('Đã từ chối')} {st.approvedAt ? `${t('lúc')} ${st.approvedAt}` : ''}
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
                    borderRadius: '12px',
                    background: 'rgba(217, 119, 6, 0.1)',
                    border: '1px solid rgba(217, 119, 6, 0.25)',
                    boxShadow: '0 1px 3px rgba(217, 119, 6, 0.08)'
                  }}>
                    <Clock size={12} strokeWidth={2.5} />
                    <span>{st.stepNumber === 1 ? t('Đang thực hiện') : t('Chờ phê duyệt')}</span>
                    {st.waitingSince && (
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 600,
                        color: '#b45309',
                        marginLeft: '3px',
                        paddingLeft: '6px',
                        borderLeft: '1px solid rgba(217, 119, 6, 0.3)'
                      }}>
                        {t('Đã chờ')} {formatWaitDuration(st.waitingSince)}
                      </span>
                    )}
                  </span>
                )}
                {st.notes && (
                  <div style={{ marginTop: '6px', padding: '6px 10px', background: 'var(--color-bg-secondary)', borderRadius: '6px', fontSize: '0.75rem', color: 'var(--color-text)', borderLeft: '3px solid var(--color-primary)', fontStyle: 'italic' }}>
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

  const renderDetailFields = () => {
    if (loading && !detail && !item) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
          <style>{`
            @keyframes skeleton-pulse {
              0% { opacity: 0.6; }
              50% { opacity: 0.35; }
              100% { opacity: 0.6; }
            }
            .skeleton-box {
              background: var(--color-border-light);
              animation: skeleton-pulse 1.5s ease-in-out infinite;
              border-radius: 6px;
            }
          `}</style>
          
          {/* Header Title Skeleton */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0.25rem' }}>
            <div className="skeleton-box" style={{ width: '70%', height: '24px' }} />
            <div style={{ display: 'flex', gap: '12px' }}>
              <div className="skeleton-box" style={{ width: '120px', height: '14px' }} />
              <div className="skeleton-box" style={{ width: '60px', height: '14px' }} />
            </div>
          </div>
          
          {/* Employee Card Skeleton */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '1rem', background: 'var(--color-bg)', borderRadius: '12px' }}>
            <div className="skeleton-box" style={{ width: '40px', height: '40px', borderRadius: '50%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
              <div className="skeleton-box" style={{ width: '40%', height: '14px' }} />
              <div className="skeleton-box" style={{ width: '25%', height: '12px' }} />
            </div>
          </div>
          
          {/* Grid Fields Table Skeleton */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', border: '1px solid var(--color-border-light)', borderRadius: '12px' }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="skeleton-box" style={{ width: '25%', height: '14px' }} />
                <div className="skeleton-box" style={{ width: '35%', height: '14px' }} />
              </div>
            ))}
          </div>

          {/* Description Block Skeleton */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
            <div className="skeleton-box" style={{ width: '20%', height: '12px' }} />
            <div className="skeleton-box" style={{ width: '100%', height: '14px' }} />
            <div className="skeleton-box" style={{ width: '85%', height: '14px' }} />
          </div>
        </div>
      );
    }

    const creatorUser = users.find(u => String(u.full_name) === String(getEmployeeName()) || String(u.name) === String(getEmployeeName()) || String(u.id) === String(detail?.user_id || detail?.created_by));

    const rawDesc = detail?.notes || detail?.description || detail?.reason || item.description || '';
    const hasInstallments = rawDesc.includes('[Thanh toán theo đợt]');
    const hasRecurring = rawDesc.includes('[Lặp lại định kỳ]');
    const isPrintStampSend = item.type === 'expense' && rawDesc.includes('Quy trình: In, đóng dấu và gửi hồ sơ');
    const lowerItemTitle = String(detail?.title || item.title || '').toLowerCase();
    const isStationery = (
      rawDesc.includes('DANH SÁCH VĂN PHÒNG PHẨM') ||
      rawDesc.includes('DANH SÁCH MUA SẮM') ||
      rawDesc.includes('DANH SÁCH THIẾT BỊ') ||
      rawDesc.includes('Đồ vật đề xuất:') ||
      lowerItemTitle.startsWith('đề xuất văn phòng phẩm') ||
      lowerItemTitle.startsWith('mua sắm trang thiết bị') ||
      lowerItemTitle.startsWith('đề xuất mua sắm') ||
      lowerItemTitle.startsWith('cấp thiết bị it') ||
      lowerItemTitle.startsWith('đề xuất trang thiết bị it')
    );
    const isZeroCostWorkflow = (
      item.type === 'expense' &&
      (Number(detail?.amount || item?.amount || 0) === 0 || isPrintStampSend || lowerItemTitle.includes('tuyển dụng'))
    );

    let printStampSendFields: Record<string, string> = {};
    if (isPrintStampSend) {
      const lines = rawDesc.split('\n');
      lines.forEach((line: string) => {
        const parts = line.split(': ');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const val = parts.slice(1).join(': ').trim();
          if (key && key !== 'Quy trình') {
            printStampSendFields[key] = val;
          }
        }
      });
    }

    interface ParsedStationeryItem {
      index: number;
      name: string;
      quantity: string | number;
      unit: string;
      price?: number;
      vat?: number;
      lineTotal?: number;
      notes: string;
    }
    let parsedStationeryItems: ParsedStationeryItem[] = [];
    if (isStationery) {
      const lines = rawDesc.split('\n');
      for (const line of lines) {
        const lineTrim = line.trim();
        if (!lineTrim.startsWith('•') && !lineTrim.match(/^\[?\d+\]/)) continue;

        const mainMatch = lineTrim.match(/^[•\-*]?\s*\[?(\d+)\]?\s*([^\-\n]+?)\s*-\s*Số lượng:\s*(\d+(?:\.\d+)?)\s*([^\(\n]*)/i);
        if (mainMatch) {
          const idx = Number(mainMatch[1]);
          const name = mainMatch[2].trim();
          const quantity = mainMatch[3].trim();
          const unit = mainMatch[4].trim() || 'Cái';
          
          let price = 0;
          let vat = 10;
          let lineTotal = 0;
          let notes = '';

          const priceMatch = lineTrim.match(/Đơn giá:\s*([0-9.,]+)/i);
          if (priceMatch) {
            price = Number(priceMatch[1].replace(/\D/g, '')) || 0;
          } else {
            const oldPriceMatch = lineTrim.match(/\(Giá:\s*([0-9.,]+)/i);
            if (oldPriceMatch) price = Number(oldPriceMatch[1].replace(/\D/g, '')) || 0;
          }

          const kctMatch = lineTrim.match(/VAT:\s*Không chịu thuế/i);
          if (kctMatch) {
            vat = 0;
          } else {
            const vatMatch = lineTrim.match(/VAT:\s*(\d+)%/i);
            if (vatMatch) {
              vat = Number(vatMatch[1]) || 0;
            }
          }

          const totalMatch = lineTrim.match(/Thành tiền:\s*([0-9.,]+)/i);
          if (totalMatch) {
            lineTotal = Number(totalMatch[1].replace(/\D/g, '')) || 0;
          } else if (price > 0) {
            lineTotal = (Number(quantity) || 1) * price * (1 + vat / 100);
          }

          const noteMatch = lineTrim.match(/Ghi chú:\s*([^\)]+)/i);
          if (noteMatch) {
            notes = noteMatch[1].trim();
          }

          parsedStationeryItems.push({
            index: idx,
            name,
            quantity,
            unit,
            price,
            vat,
            lineTotal,
            notes
          });
        }
      }

      if (parsedStationeryItems.length === 0) {
        const itemMatches = rawDesc.matchAll(/[•\-*]?\s*\[?(\d+)\]?\s*([^\-\n]+?)\s*-\s*Số lượng:\s*(\d+(?:\.\d+)?)\s*([^\(\n]*?)(?:\s*\(Ghi chú:\s*([^\)]*)\))?(?=\n|$)/gi);
        for (const m of itemMatches) {
          parsedStationeryItems.push({
            index: Number(m[1]),
            name: m[2].trim(),
            quantity: m[3].trim(),
            unit: m[4].trim() || 'Cái',
            notes: (m[5] || '').trim()
          });
        }
      }
      if (parsedStationeryItems.length === 0) {
        const legacyItem = rawDesc.match(/Đồ vật đề xuất:\s*([^\n]+)/i);
        const legacyQty = rawDesc.match(/Số lượng:\s*([^\n]+)/i);
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
      if (!text) return '';
      const reg = new RegExp(`(?:^|\\n)\\s*${label}:\\s*([\\s\\S]*?)(?=(?:\\n\\s*(?:Vị trí:|Phòng ban:|Nội dung đề xuất:|Lý do:|DANH SÁCH|\\[Tài liệu|\\[Lặp lại|\\[Thanh toán|\\[Thông tin|\\[Hồ sơ chi phí|Đối tượng:|Thụ hưởng|Hình thức:|Thời hạn thanh toán:|Chi tiết:))|$)`, 'i');
      const m = text.match(reg);
      return m ? m[1].trim() : '';
    };

    const positionVal = extractMetaField(rawDesc, 'Vị trí') || detail?.position || '';
    const departmentVal = extractMetaField(rawDesc, 'Phòng ban') || detail?.department || '';
    const contentVal = extractMetaField(rawDesc, 'Nội dung đề xuất') || extractMetaField(rawDesc, 'Nội dung') || detail?.content || '';
    
    const cleanRawReason = (str?: string) => {
      return cleanLeaveReasonText(str, false);
    };

    let reasonVal = cleanRawReason(extractMetaField(rawDesc, 'Lý do'));
    if (!reasonVal && detail?.reason) {
      const extracted = extractMetaField(detail.reason, 'Lý do');
      reasonVal = cleanRawReason(extracted || detail.reason);
    }
    if (!reasonVal && detail?.notes && !contentVal) {
      reasonVal = cleanRawReason(detail.notes);
    }

    const parseMeetingInfo = (text: string) => {
      if (!text || !text.includes('[Thông tin tiếp khách]')) return null;
      const blockMatch = text.match(/\[Thông tin tiếp khách\]:([\s\S]*?)(?=\n\n\[|$)/i);
      const block = blockMatch ? blockMatch[1] : '';
      
      const getField = (prefix: string) => {
        const m = block.match(new RegExp(`[•\\-*]?\\s*${prefix}:\\s*([^\\n]+)`, 'i'));
        return m ? m[1].trim() : '';
      };

      const targetType = getField('Phân loại đối tượng');
      const clientName = getField('Đơn vị / Khách mời');
      const representative = getField('Người đại diện');
      const location = getField('Địa điểm');
      const time = getField('Thời gian');
      const headcount = getField('Quy mô tham gia');
      const attendees = getField('Cán bộ tham gia cùng');
      const purpose = getField('Kế hoạch / Mục đích tiếp đón');
      const paymentMethod = getField('Phương thức thanh toán');

      if (!clientName && !location && !purpose) return null;
      return { targetType, clientName, representative, location, time, headcount, attendees, purpose, paymentMethod };
    };

    const parseRecurringInfo = (text: string) => {
      if (!text || (!text.includes('[Thiết lập định kỳ]') && !text.includes('[Lặp lại định kỳ]'))) return null;
      const blockMatch = text.match(/\[(?:Thiết lập|Lặp lại) định kỳ\]:([\s\S]*?)(?=\n\n\[|$)/i);
      const block = blockMatch ? blockMatch[1] : '';
      
      const getField = (prefix: string) => {
        const m = block.match(new RegExp(`[•\\-*]?\\s*${prefix}:\\s*([^\\n]+)`, 'i'));
        return m ? m[1].trim() : '';
      };

      const frequency = getField('Chu kỳ thanh toán');
      const payDay = getField('Ngày giải ngân cố định') || getField('Ngày thanh toán');
      const duration = getField('Thời hạn hiệu lực');
      const contract = getField('Căn cứ Hợp đồng / Thỏa thuận') || getField('Số hợp đồng');

      if (!frequency && !payDay && !duration) return null;
      return { frequency, payDay, duration, contract };
    };

    const parsePhasedInfo = (text: string) => {
      if (!text || (!text.toLowerCase().includes('thanh toán theo đợt') && !text.includes('[Kế hoạch thanh toán theo đợt'))) return null;
      const blockMatch = text.match(/\[(?:Kế hoạch thanh toán theo đợt|Thanh toán theo đợt)[^\]]*\]:([\s\S]*?)(?=\n\n\[|$)/i);
      const block = blockMatch ? blockMatch[1] : '';
      
      const lines = block.split('\n').map(l => l.trim()).filter(l => l.startsWith('•') || l.startsWith('-') || l.startsWith('*') || /^\d+[\.\)]/.test(l));
      if (lines.length === 0) return null;
      return lines.map(line => line.replace(/^[•\-*\d.)]+\s*/, ''));
    };

    const parseAdvanceInfo = (text: string) => {
      if (!text || !text.includes('[Đề nghị tạm ứng]')) return null;
      const blockMatch = text.match(/\[Đề nghị tạm ứng\]:([\s\S]*?)(?=\n\n\[|$)/i);
      const block = blockMatch ? blockMatch[1] : '';
      
      const getField = (prefix: string) => {
        const m = block.match(new RegExp(`[•\\-*]?\\s*${prefix}:\\s*([^\\n]+)`, 'i'));
        return m ? m[1].trim() : '';
      };

      const purpose = getField('Mục đích tạm ứng');
      const settlementDate = getField('Hạn hoàn ứng / quyết toán chứng từ') || getField('Hạn quyết toán');

      if (!purpose && !settlementDate) return null;
      return { purpose, settlementDate };
    };

    const parsePaymentBeneficiaryInfo = (text: string) => {
      if (!text) return null;
      const benMatch = text.match(/Thụ hưởng\s*(?:\(([^)]+)\))?:\s*([^\n-]+)(?:\s*-\s*SĐT:\s*([^\n]+))?/i);
      let beneficiaryTarget = benMatch ? (benMatch[1] || '') : '';
      let beneficiaryName = benMatch ? benMatch[2].trim() : '';
      let beneficiaryPhone = benMatch ? (benMatch[3] || '').trim() : '';
      let taxCode = '';
      if (beneficiaryName) {
        const mstMatch = beneficiaryName.match(/\(MST:\s*([^)]+)\)/i);
        if (mstMatch) {
          taxCode = mstMatch[1].trim();
          beneficiaryName = beneficiaryName.replace(/\(MST:\s*[^)]+\)/i, '').trim();
        }
      }

      let bankInfo: any = null;
      const bankMatch = text.match(/\[Thông tin chuyển khoản\]:\s*([^\n]+)/i);
      if (bankMatch) {
        const fullBankStr = bankMatch[1].trim();
        const stkMatch = fullBankStr.match(/STK:\s*([0-9A-Za-z\-_]+)/i);
        const holderMatch = fullBankStr.match(/Chủ\s*TK:\s*([^-\n]+)/i);
        const branchMatch = fullBankStr.match(/Chi\s*nhánh:\s*([^-\n]+)/i);
        const bankNamePart = fullBankStr.split(/-\s*STK:/i)[0].replace(/^Ngân\s*hàng:\s*/i, '').trim();

        bankInfo = {
          type: 'bank',
          bankName: bankNamePart || fullBankStr,
          accountNumber: stkMatch ? stkMatch[1].trim() : '',
          accountName: holderMatch ? holderMatch[1].trim() : '',
          branch: branchMatch ? branchMatch[1].trim() : '',
          raw: fullBankStr
        };
      }

      let otherMethodInfo: any = null;
      const methodMatch = text.match(/\[Hình thức\]:\s*([^\n]+)/i);
      if (methodMatch) {
        const methodStr = methodMatch[1].trim();
        if (methodStr.toLowerCase().includes('ví điện tử')) {
          const walletMatch = methodStr.match(/Ví điện tử\s*([A-Za-z0-9]+)?/i);
          const phoneMatch = methodStr.match(/SĐT\s*ví:\s*([0-9]+)/i);
          const holderMatch = methodStr.match(/Chủ\s*ví:\s*([^-\n]+)/i);
          otherMethodInfo = {
            type: 'wallet',
            walletType: walletMatch ? walletMatch[1] : 'Ví điện tử',
            phone: phoneMatch ? phoneMatch[1] : '',
            holder: holderMatch ? holderMatch[1].trim() : '',
            raw: methodStr
          };
        } else if (methodStr.toLowerCase().includes('thẻ tín dụng')) {
          const cardMatch = methodStr.match(/4 số cuối:\s*([0-9X]+)/i);
          otherMethodInfo = {
            type: 'card',
            last4: cardMatch ? cardMatch[1] : '',
            raw: methodStr
          };
        } else if (methodStr.toLowerCase().includes('tiền mặt')) {
          const receiverMatch = methodStr.match(/Người nhận:\s*([^-\n]+)/i);
          const locMatch = methodStr.match(/Địa điểm bàn giao:\s*([^-\n]+)/i);
          otherMethodInfo = {
            type: 'cash',
            receiver: receiverMatch ? receiverMatch[1].trim() : '',
            location: locMatch ? locMatch[1].trim() : '',
            raw: methodStr
          };
        }
      }
      const deptMatch = text.match(/Phòng ban:\s*([^\n]+)/i);
      const profileMatch = text.match(/\[Hồ sơ chi phí\]:\s*([^\n]+)/i);
      const detailsMatch = text.match(/(?:^|\n)\s*Chi tiết:\s*([\s\S]*?)(?=(?:\n\s*(?:\[Tài liệu|\[Lặp lại|\[Thanh toán|\[Thông tin|\[Hồ sơ chi phí|Phòng ban:|Đối tượng:|Thụ hưởng|Hình thức:|Thời hạn thanh toán:))|$)/i);
      const dept = deptMatch ? deptMatch[1].trim() : '';
      const profileInfo = profileMatch ? profileMatch[1].trim() : '';
      const paymentDetails = detailsMatch ? detailsMatch[1].trim() : '';

      const dueMatch = text.match(/Thời hạn thanh toán:\s*([0-9\/\-]+)/i);
      const dueDate = dueMatch ? dueMatch[1].trim() : '';

      if (!beneficiaryName && !bankInfo && !otherMethodInfo && !dept && !profileInfo && !dueDate) return null;
      return { beneficiaryTarget, beneficiaryName, beneficiaryPhone, taxCode, dept, profileInfo, paymentDetails, bankInfo, otherMethodInfo, dueDate };
    };

    const parseRecruitmentInfo = (text: string) => {
      if (!text || (!text.includes('[Đề xuất tuyển dụng]') && !text.toLowerCase().includes('tuyển dụng'))) return null;
      const blockMatch = text.match(/\[Đề xuất tuyển dụng\]:([\s\S]*?)(?=\n\n\[|$)/i);
      const block = blockMatch ? blockMatch[1] : text;
      
      const getField = (prefix: string) => {
        const m = block.match(new RegExp(`[•\\-*]?\\s*${prefix}:\\s*([^\\n]+)`, 'i'));
        return m ? m[1].trim() : '';
      };

      const getMultilineField = (prefix: string) => {
        const m = block.match(new RegExp(`[•\\-*]?\\s*${prefix}:\\s*([\\s\\S]*?)(?=\\n\\s*[•\\-*]|\\n\\n\\[|$)`, 'i'));
        return m ? m[1].trim() : '';
      };

      const jobTitle = getField('Vị trí cần tuyển') || getField('Vị trí');
      const headcount = getField('Số lượng cần tuyển') || getField('Số lượng');
      const jobType = getField('Hình thức làm việc') || getField('Hình thức');
      const department = getField('Phòng ban / Bộ phận tiếp nhận') || getField('Phòng ban');
      const reason = getField('Lý do tuyển dụng') || getField('Lý do');
      const salary = getField('Mức lương dự kiến') || getField('Mức lương');
      const expectedDate = getField('Ngày dự kiến nhận việc') || getField('Ngày đi làm');
      const requirements = getMultilineField('Tiêu chuẩn / Yêu cầu ứng viên') || getMultilineField('Yêu cầu ứng viên');
      const description = getMultilineField('Mô tả công việc tóm tắt') || getMultilineField('Mô tả công việc');

      if (!jobTitle && !headcount && !reason) return null;
      return { jobTitle, headcount, jobType, department, reason, salary, expectedDate, requirements, description };
    };

    const cleanResidualText = (text: string) => {
      if (!text) return '';
      return text
        .replace(/\[Đề xuất tuyển dụng\]:[\s\S]*?(?=\n\n\[|$)/gi, '')
        .replace(/\[Thông tin tiếp khách\]:[\s\S]*?(?=\n\n\[|$)/gi, '')
        .replace(/\[(?:Thiết lập|Lặp lại) định kỳ\]:[\s\S]*?(?=\n\n\[|$)/gi, '')
        .replace(/\[(?:Kế hoạch thanh toán theo đợt|Thanh toán theo đợt)[^\]]*\]:[\s\S]*?(?=\n\n\[|$)/gi, '')
        .replace(/\[Đề nghị tạm ứng\]:[\s\S]*?(?=\n\n\[|$)/gi, '')
        .replace(/\[Hồ sơ chi phí\]:\s*[^\n]+/gi, '')
        .replace(/\[Thông tin chuyển khoản\]:\s*[^\n]+/gi, '')
        .replace(/\[Hình thức\]:\s*[^\n]+/gi, '')
        .replace(/^\[(?:Đăng ký làm việc từ xa|Tăng ca|Đi muộn\/Về sớm|Nghỉ phép)\]\s*(?:\[[^\]]+\]\s*)*/gim, '')
        .replace(/^\[(?:Tỷ lệ hưởng lương|Hình thức):[^\]]+\]\s*/gim, '')
        .replace(/^Thời gian:\s*[^.]+\.\s*/gim, '')
        .replace(/^Lý do:\s*/gim, '')
        .replace(/Thụ hưởng[^:\n]*:\s*[^\n]+/gi, '')
        .replace(/^Phòng ban:\s*[^\n]+/gim, '')
        .replace(/^Đối tượng:\s*[^\n]+/gim, '')
        .replace(/^Hình thức:\s*[^\n]+/gim, '')
        .replace(/^Chi tiết:\s*/gim, '')
        .replace(/\[Bảng chi tiết thanh toán\]:[\s\S]*?(?=\n\n\[|\n\[|$)/gi, '')
        .replace(/\[JSON_ITEMS\]:[^\n]*/gi, '')
        .replace(/\[APPROVAL_STEPS\]:[^\n]*/gi, '')
        .replace(/\[Từ MISA AMIS #[^\]]*\]:[^\n]*/gi, '')
        .replace(/Quy trình:\s*[^\n]+/gi, '')
        .replace(/\[Tài liệu đính kèm[^\]]*\]:[\s\S]*$/gi, '')
        .trim();
    };



    const meetingData = parseMeetingInfo(rawDesc);
    const recurringData = parseRecurringInfo(rawDesc);
    const phasedData = parsePhasedInfo(rawDesc);
    const advanceData = parseAdvanceInfo(rawDesc);
    const recruitmentData = parseRecruitmentInfo(rawDesc);
    const paymentData = parsePaymentBeneficiaryInfo(rawDesc);
    const expenseItems = parseExpenseLineItems(rawDesc, detail?.items || (item as any)?.items);

    let installmentText = '';
    if (hasInstallments) {
      const match = rawDesc.match(/\[(?:Kế hoạch thanh toán theo đợt|Thanh toán theo đợt)[^\]]*\]:\s*(.*)/);
      if (match) installmentText = match[1];
    }

    let recurringText = '';
    if (hasRecurring) {
      const match = rawDesc.match(/\[(?:Thiết lập|Lặp lại) định kỳ\]:\s*(.*)/);
      if (match) recurringText = match[1];
    }

    const getLeaveTitle = (type?: string, reason?: string) => {
      switch (type) {
        case 'annual': return t('Đề xuất nghỉ phép năm');
        case 'sick': return t('Đề xuất nghỉ ốm / thai sản');
        case 'compensatory': return t('Đề xuất nghỉ bù');
        case 'special_paid': return t('Đề xuất nghỉ chế độ (Hiếu/Hỉ)');
        case 'late_early': {
          const r = reason || detail?.reason || item?.description || '';
          const sub = resolveLateEarlySubType(detail || item, r);
          return sub === 'early' ? t('Đăng ký về sớm') : t('Đăng ký đi muộn');
        }
        case 'unpaid': return t('Đề xuất nghỉ việc riêng');
        case 'overtime': return t('Đăng ký tăng ca (OT)');
        case 'remote_work': return t('Đăng ký làm việc từ xa (WFH)');
        case 'business_trip': return t('Đăng ký đi công tác');
        default: return t('Đề xuất nghỉ phép');
      }
    };

    const isSingleBulkDay = item.type === 'attendance_bulk' && (detail?.details?.length === 1 || (item as any)?.days_count === 1);
    const singleBulkDateStr = isSingleBulkDay ? (detail?.details?.[0]?.check_in_date ? new Date(detail.details[0].check_in_date).toLocaleDateString('vi-VN') : ((item as any)?.single_date ? new Date((item as any).single_date).toLocaleDateString('vi-VN') : '')) : '';

    const rawTitle = (
      (item.type === 'attendance_bulk' ? (
        isSingleBulkDay && singleBulkDateStr
          ? `Phiếu giải trình cập nhật công ngày ${singleBulkDateStr}`
          : (detail?.title && !detail.title.includes('công gộp') ? detail.title : (item.title && !item.title.includes('công gộp') ? item.title : `Phiếu cập nhật công tháng ${detail?.month_period || (item as any)?.month_period || ''}`.trim()))
      ) : '') ||
      detail?.title ||
      item.title ||
      (item.type === 'leave' ? getLeaveTitle(detail?.leave_type || (item as any).leave_type, detail?.reason || item.description) : '') ||
      (item.type === 'advance' ? t('Đề nghị tạm ứng lương') : '') ||
      (item.type === 'checkin' ? t('Giải trình quên chấm công') : '') ||
      (detail?.expense_title || detail?.name || '')
    );

    let cleanHeaderTitle = (rawTitle || `IDEAS - ${t('Quy trình')} #${item.id}`)
      .replace(/^Yêu cầu chi phí(?:\s*-\s*Cấp \d+)?:\s*/i, '')
      .replace(/\s*\(\d+%\s*lương\)/gi, '')
      .replace(/\s*-\s*\[(?:Đăng ký làm việc từ xa|Tăng ca|Đi muộn\/Về sớm|Nghỉ phép)\].*$/i, '')
      .replace(/\s*-\s*\[Tỷ lệ hưởng lương:[^\]]+\]\s*(?:Lý do:.*)?$/i, '')
      .replace(/\s*-\s*\[Hình thức:[^\]]+\]\s*(?:Thời gian:.*)?$/i, '')
      .replace(/\s*-\s*Lý do:\s*$/i, '')
      .replace(/\s*Lý do:\s*$/i, '')
      .replace(/\s*-\s*$/, '')
      .trim();

    // Nếu tiêu đề bị cắt lửng bởi dấu ... ở cuối nhưng có lý do chi tiết thì hiển thị trọn vẹn
    if (cleanHeaderTitle.endsWith('...')) {
      const fullReason = cleanRawReason(detail?.reason || (item as any)?.reason || detail?.description || item?.description || '');
      if (fullReason) {
        const lastDashIndex = cleanHeaderTitle.lastIndexOf(' - ');
        if (lastDashIndex !== -1) {
          cleanHeaderTitle = cleanHeaderTitle.substring(0, lastDashIndex) + ' - ' + fullReason;
        }
      }
    }

    const hrmDrawerHeaderMatch = cleanHeaderTitle.match(/^((?:\[Nghỉ phép\][^:]*|Đăng ký (?:WFH|OT|đi muộn\/về sớm|đi muộn|đi trễ|về sớm|công tác))\s*(?::\s*\d{1,2}\/\d{1,2}\/\d{4}(?:\s*-\s*\d{1,2}\/\d{1,2}\/\d{4})?)?\s*(?:\([\d.,]+\s*ngày\))?)\s*-\s*(.+)$/i);
    if (hrmDrawerHeaderMatch) {
      const hPart = hrmDrawerHeaderMatch[1].trim();
      const tPart = cleanLeaveReasonText(hrmDrawerHeaderMatch[2].trim(), false);
      cleanHeaderTitle = tPart ? `${hPart} - ${tPart}` : hPart;
    }

    const cleanNoteText = cleanRawReason(detail?.reason || detail?.notes || detail?.description || rawDesc || '')
      .replace(/^\[.*?\]\s*Thời gian:.*?\.\s*Lý do:\s*/i, '')
      .replace(/^Số tiền:\s*[\d.,]+\s*đ\.\s*Ghi chú:\s*"?/i, '')
      .replace(/^Số tiền:\s*[\d.,]+\s*đ\s*"?/i, '')
      .replace(/^Ghi chú:\s*"?/i, '')
      .replace(/"$/, '')
      .trim();

    const residualNote = cleanResidualText(contentVal || reasonVal || cleanNoteText || '');

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '1rem' : '1.25rem', textAlign: 'left' }}>
        
        {/* Proposal Title Header */}
        <div style={{ padding: isMobile ? '0.25rem 0' : '0.5rem 0.25rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h2 style={{
            fontSize: isMobile ? '0.95rem' : '1.15rem',
            fontWeight: 800,
            margin: 0,
            color: 'var(--color-text)',
            lineHeight: isMobile ? 1.4 : 1.35,
            wordBreak: 'break-word',
            whiteSpace: 'normal',
            overflow: 'visible'
          }}>
            {cleanHeaderTitle}
          </h2>
          <div style={{ display: 'flex', gap: isMobile ? '8px' : '12px', alignItems: 'center', fontSize: isMobile ? '0.725rem' : '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
            <span>
              {t('Ngày lập đề xuất')}: <strong style={{ color: 'var(--color-text)' }}>{new Date(detail?.created_at || item.created_at).toLocaleString('vi-VN')}</strong>
            </span>
            <span style={{ color: 'var(--color-border-light)' }}>|</span>
            <span>
              {t('Mã')}: <strong style={{ color: 'var(--color-text)' }}>#{item.id}</strong>
            </span>
            {(detail?.due_date || (item as any)?.due_date || (paymentData as any)?.dueDate) && (
              <>
                <span style={{ color: 'var(--color-border-light)' }}>|</span>
                <span style={{ color: '#b91c1c', fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={13} style={{ color: '#ef4444' }} />
                  {t('Hạn thanh toán')}: <strong>{new Date(detail?.due_date || (item as any)?.due_date || (paymentData as any)?.dueDate).toLocaleDateString('vi-VN')}</strong>
                </span>
              </>
            )}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '12px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: isMobile ? '12px' : '16px', padding: isMobile ? '1rem' : '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
          <div style={{ fontSize: isMobile ? '0.68rem' : '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
            {t('Thông tin chi tiết đề xuất')}
          </div>

          {item.type === 'leave' && (() => {
            const lType = detail?.leave_type || '';
            const isWFH = lType === 'remote_work';
            const isOT = lType === 'overtime';
            const isLateEarly = lType === 'late_early';
            const isBusinessTrip = lType === 'business_trip';

            const formatDateTimeVi = (dtStr?: string) => {
              if (!dtStr) return '—';
              const d = new Date(String(dtStr).replace(' ', 'T'));
              if (isNaN(d.getTime())) return dtStr;
              const hh = String(d.getHours()).padStart(2, '0');
              const mm = String(d.getMinutes()).padStart(2, '0');
              const day = String(d.getDate()).padStart(2, '0');
              const month = String(d.getMonth() + 1).padStart(2, '0');
              const year = d.getFullYear();
              return `${hh}:${mm} (${day}/${month}/${year})`;
            };

            const senderUser = users.find(u => Number(u.id) === Number(detail?.user_id || item.user_id));
            const senderName = detail?.employee_name || item.employee_name || senderUser?.full_name || t('Nhân sự');

            const annTotal = Number(senderLeaveBalance?.annual_leave_total ?? detail?.annual_leave_total ?? 12);
            const annUsed = Number(senderLeaveBalance?.annual_leave_used ?? detail?.annual_leave_used ?? 0);
            const annRemaining = Number(
              senderLeaveBalance?.remaining_annual_leave ?? 
              detail?.remaining_annual_leave ?? 
              Math.max(0, annTotal - annUsed)
            );

            const compTotal = Number(senderLeaveBalance?.compensatory_leave_total ?? detail?.compensatory_leave_total ?? 0);
            const compUsed = Number(senderLeaveBalance?.compensatory_leave_used ?? detail?.compensatory_leave_used ?? 0);
            const compRemaining = Number(
              senderLeaveBalance?.remaining_compensatory_leave ?? 
              detail?.remaining_compensatory_leave ?? 
              Math.max(0, compTotal - compUsed)
            );

            const renderLeaveBalanceCard = () => (
              <div style={{
                gridColumn: '1 / -1',
                marginTop: '4px',
                padding: isMobile ? '12px' : '12px 14px',
                borderRadius: '12px',
                background: 'var(--color-bg-secondary, rgba(248, 250, 252, 0.85))',
                border: '1px solid var(--color-border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '100%',
                boxSizing: 'border-box'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: isMobile ? 'flex-start' : 'center',
                  justifyContent: 'space-between',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: isMobile ? '4px' : '6px'
                }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <BarChart2 size={15} style={{ color: 'var(--color-primary, #2563eb)', flexShrink: 0 }} />
                    <span>{t('Quỹ phép của người gửi')}:</span>
                    <span style={{ color: 'var(--color-primary, #2563eb)' }}>{senderName}</span>
                  </div>
                  <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                    {t('Thông tin số ngày phép khả dụng để duyệt đơn')}
                  </span>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                  gap: isMobile ? '8px' : '12px',
                  width: '100%'
                }}>
                  {/* Phép công / Phép năm */}
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minWidth: 0
                  }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: annRemaining > 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: annRemaining > 0 ? '#10b981' : '#ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Calendar size={18} strokeWidth={2.2} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                        {t('Phép công (Phép năm) còn lại')}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '1.1rem',
                          fontWeight: 800,
                          color: annRemaining > 0 ? '#10b981' : '#ef4444'
                        }}>
                          {annRemaining} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{t('ngày')}</span>
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                          ({t('Đã dùng')}: {annUsed} / {annTotal} {t('ngày')})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Phép bù / Nghỉ bù */}
                  <div style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    minWidth: 0
                  }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: compRemaining > 0 ? 'rgba(59, 130, 246, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                      color: compRemaining > 0 ? '#2563eb' : '#f59e0b',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <Palmtree size={18} strokeWidth={2.2} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                        {t('Phép bù (Nghỉ bù) còn lại')}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{
                          fontSize: '1.1rem',
                          fontWeight: 800,
                          color: compRemaining > 0 ? '#2563eb' : '#f59e0b'
                        }}>
                          {compRemaining} <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{t('ngày')}</span>
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                          ({t('Đã dùng')}: {compUsed} / {compTotal} {t('ngày')})
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );

            if (isLateEarly) {
              const reasonStr = detail?.reason || item.description || '';
              const isEarly = resolveLateEarlySubType(detail || item, reasonStr) === 'early';
              const minMatch = reasonStr.match(/\((\d+)\s*phút\)/i);
              
              let diffMin = 0;
              if (detail?.start_date && detail?.end_date) {
                const sTs = new Date(String(detail.start_date).replace(' ', 'T')).getTime();
                const eTs = new Date(String(detail.end_date).replace(' ', 'T')).getTime();
                if (!isNaN(sTs) && !isNaN(eTs) && eTs > sTs) {
                  diffMin = Math.round((eTs - sTs) / 60000);
                }
              }
              const displayMinutes = minMatch ? `${minMatch[1]} phút` : (diffMin > 0 ? `${diffMin} phút` : '30 phút');

              return (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? '0.75rem' : '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Loại đăng ký')}</label>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: isEarly ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)',
                      color: isEarly ? '#b45309' : '#1d4ed8',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.8125rem' : '0.875rem'
                    }}>
                      <span>{isEarly ? '🏃‍♂️ ' + t('Đăng ký Về sớm') : '🚶‍♂️ ' + t('Đăng ký Đi muộn')}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Thời lượng đăng ký')}</label>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'var(--color-bg-secondary)',
                      color: 'var(--color-text)',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.8125rem' : '0.875rem'
                    }}>
                      <Clock size={16} color="var(--color-primary)" />
                      <span>{displayMinutes}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Khung giờ áp dụng')}</label>
                    <div style={{ display: 'flex', gap: isMobile ? '6px' : '10px', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={formatDateTimeVi(detail?.start_date)}
                        disabled
                        style={{ flex: 1, fontSize: isMobile ? '0.8125rem' : '0.875rem', fontWeight: 600 }}
                      />
                      <span style={{ color: 'var(--color-text-muted)', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>➔</span>
                      <input
                        type="text"
                        className="form-input"
                        value={formatDateTimeVi(detail?.end_date)}
                        disabled
                        style={{ flex: 1, fontSize: isMobile ? '0.8125rem' : '0.875rem', fontWeight: 600 }}
                      />
                    </div>
                  </div>
                  {renderLeaveBalanceCard()}
                </div>
              );
            }

            const typeLabel = isWFH ? t('Hình thức làm việc') : (isOT ? t('Loại tăng ca') : (isBusinessTrip ? t('Loại công tác') : t('Loại nghỉ phép')));
            const durationLabel = isWFH ? t('Thời lượng làm việc') : (isOT ? t('Số ngày công quy đổi') : (isBusinessTrip ? t('Số ngày công tác') : t('Số ngày nghỉ')));
            const periodLabel = isWFH ? t('Thời gian làm việc từ xa') : (isOT ? t('Thời gian tăng ca') : (isBusinessTrip ? t('Thời gian công tác') : t('Thời gian nghỉ')));

            const leaveTypeMap: Record<string, string> = {
              annual: t('Nghỉ phép năm'),
              sick: t('Nghỉ ốm / thai sản'),
              compensatory: t('Nghỉ bù'),
              special_paid: t('Nghỉ chế độ (Hiếu/Hỉ theo luật)'),
              unpaid: t('Nghỉ việc riêng (không lương)'),
              overtime: t('Đăng ký tăng ca (OT)'),
              remote_work: t('Làm việc từ xa (WFH)'),
              business_trip: t('Đi công tác')
            };
            const currentLeaveType = detail?.leave_type || (item as any)?.leave_type || 'annual';
            const leaveTypeDisplayText = leaveTypeMap[currentLeaveType] || (isWFH ? t('Làm việc từ xa (WFH)') : (isOT ? t('Đăng ký tăng ca (OT)') : (isBusinessTrip ? t('Đi công tác') : t('Nghỉ phép năm'))));

            return (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? '0.75rem' : '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{typeLabel}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={leaveTypeDisplayText}
                    disabled
                    style={{
                      width: '100%',
                      fontSize: isMobile ? '0.8125rem' : '0.875rem',
                      fontWeight: 700,
                      color: 'var(--color-text)'
                    }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{durationLabel}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={isOT ? `${Number(((detail?.total_days ?? (item as any)?.total_days ?? 0) * 8).toFixed(1))} giờ (${detail?.total_days ?? (item as any)?.total_days ?? 0} ngày công OT)` : `${detail?.total_days ?? (item as any)?.total_days ?? 1} ngày`}
                    disabled
                    style={{ width: '100%', fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                  />
                </div>
                {isOT && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                      {t('Hình thức nhận OT')}
                    </label>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: (detail?.ot_type === 'compensatory' || rawDesc.includes('Lấy OT bù')) ? 'rgba(59, 130, 246, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                      color: (detail?.ot_type === 'compensatory' || rawDesc.includes('Lấy OT bù')) ? '#2563eb' : '#15803d',
                      fontWeight: 700,
                      fontSize: isMobile ? '0.8125rem' : '0.875rem'
                    }}>
                      <span>
                        {(detail?.ot_type === 'compensatory' || rawDesc.includes('Lấy OT bù')) ? t('Lấy OT bù (Nghỉ bù)') : t('Lấy lương OT (Tính lương)')}
                        {' • '}
                        <strong>{t('Hệ số')} {detail?.ot_rate ? `${Number(detail.ot_rate)}x` : (rawDesc.includes('1.0x') ? '1.0x (1:1)' : '1.5x')}</strong>
                      </span>
                    </div>
                  </div>
                )}
                {isWFH && (() => {
                  let effSalaryRate = detail?.salary_rate ?? (item as any)?.salary_rate;
                  if (effSalaryRate === undefined || effSalaryRate === null) {
                    const match = String(rawDesc || '').match(/Tỷ lệ hưởng lương:\s*(\d+(\.\d+)?)%/i);
                    effSalaryRate = match ? Number(match[1]) : 50;
                  }
                  effSalaryRate = Number(effSalaryRate);
                  const totalDaysVal = Number(detail?.total_days ?? (item as any)?.total_days ?? 1);
                  const paidWorkDays = Number((totalDaysVal * (effSalaryRate / 100)).toFixed(2));
                  const unpaidWorkDays = Number(Math.max(0, totalDaysVal - paidWorkDays).toFixed(2));

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
                      <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                        {t('Tỷ lệ hưởng lương làm việc từ xa (WFH)')}
                      </label>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '8px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: 'rgba(14, 165, 233, 0.08)',
                        border: '1px solid rgba(14, 165, 233, 0.25)',
                        color: '#0369a1',
                        fontSize: isMobile ? '0.8125rem' : '0.875rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.1rem' }}>🏠</span>
                          <span>
                            <strong>{t('Tỷ lệ hưởng lương:')}</strong> <span style={{ color: '#0284c7', fontSize: '1rem', fontWeight: 800 }}>{effSalaryRate}%</span>
                          </span>
                        </div>
                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>
                          {t('Quy đổi công hưởng lương:')} <strong style={{ color: '#059669' }}>{paidWorkDays} {t('công')}</strong> {effSalaryRate < 100 && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}> ({unpaidWorkDays} công không lương)</span>}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: '1 / -1' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{periodLabel}</label>
                  <div style={{ display: 'flex', gap: isMobile ? '6px' : '10px', alignItems: 'center' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={detail?.start_date ? (isOT ? formatDateTimeVi(detail.start_date) : new Date(detail.start_date).toLocaleDateString('vi-VN')) : (item as any)?.start_date ? (isOT ? formatDateTimeVi((item as any).start_date) : new Date((item as any).start_date).toLocaleDateString('vi-VN')) : ''}
                      disabled
                      style={{ flex: 1, fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                    />
                    <span style={{ color: 'var(--color-text-muted)', fontSize: isMobile ? '0.75rem' : '0.875rem' }}>➔</span>
                    <input
                      type="text"
                      className="form-input"
                      value={detail?.end_date ? (isOT ? formatDateTimeVi(detail.end_date) : new Date(detail.end_date).toLocaleDateString('vi-VN')) : (item as any)?.end_date ? (isOT ? formatDateTimeVi((item as any).end_date) : new Date((item as any).end_date).toLocaleDateString('vi-VN')) : ''}
                      disabled
                      style={{ flex: 1, fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                    />
                  </div>
                </div>
                {renderLeaveBalanceCard()}
              </div>
            );
          })()}

          {item.type === 'advance' && (() => {
            const advAmount = Number(detail?.amount || 0);
            const advCurr = detail?.currency || item?.currency || 'VND';
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.75rem' : '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Số tiền tạm ứng')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formatApprovalCurrency(advAmount, advCurr)}
                    disabled
                    style={{ 
                      fontSize: isMobile ? '0.95rem' : '1.05rem', 
                      fontWeight: 800, 
                      color: 'var(--color-primary, #2563eb)',
                      background: 'rgba(37, 99, 235, 0.04)',
                      borderColor: 'rgba(37, 99, 235, 0.2)'
                    }}
                  />
                  {advAmount > 0 && (
                    <div style={{ 
                      fontSize: isMobile ? '0.75rem' : '0.825rem', 
                      lineHeight: 1.35,
                      color: 'var(--color-primary, #2563eb)', 
                      fontWeight: 650, 
                      marginTop: '4px',
                      paddingLeft: '2px' 
                    }}>
                      {t('Bằng chữ:')} {numberToVietnameseText(advAmount, advCurr)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Ngày đề nghị')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={detail?.request_date ? new Date(detail.request_date).toLocaleDateString('vi-VN') : ''}
                    disabled
                    style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                  />
                </div>
              </div>
            );
          })()}

          {item.type === 'expense' && (
            isZeroCostWorkflow ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: isMobile ? '0.75rem' : '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Loại đề xuất')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={cleanHeaderTitle || t('Đề xuất hành chính')}
                    disabled
                    style={{ fontWeight: 700, color: 'var(--color-primary)', fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Bộ phận / Phòng ban')}</label>
                  <input
                    type="text"
                    className="form-input"
                    value={recruitmentData?.department || departmentVal || detail?.department || creatorUser?.department || '—'}
                    disabled
                    style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                  />
                </div>
                {positionVal && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                    <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Vị trí người tạo')}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={positionVal}
                      disabled
                      style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                    />
                  </div>
                )}
              </div>
            ) : (() => {
              const expAmount = Number(detail?.amount ?? (item as any)?.amount ?? 0);
              const expCurr = detail?.currency || (item as any)?.currency || 'VND';
              const rawNotes = String(detail?.notes || detail?.description || (item as any)?.notes || item.description || '');

              const vAmt = Number(detail?.vat_amount || (item as any)?.vat_amount || 0);
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
              } else if (rawNotes.includes('VAT 8%') || rawNotes.includes('vat_8')) {
                vatRate = 8;
                vatLabel = '8%';
                amountBeforeVat = Math.round(expAmount / 1.08);
                vatAmount = expAmount - amountBeforeVat;
              } else if (rawNotes.includes('VAT 5%') || rawNotes.includes('vat_5')) {
                vatRate = 5;
                vatLabel = '5%';
                amountBeforeVat = Math.round(expAmount / 1.05);
                vatAmount = expAmount - amountBeforeVat;
              } else if (rawNotes.includes('VAT 10%') || rawNotes.includes('vat_10')) {
                vatRate = 10;
                vatLabel = '10%';
                amountBeforeVat = Math.round(expAmount / 1.10);
                vatAmount = expAmount - amountBeforeVat;
              } else if (vAmt > 0) {
                vatRate = 10;
                vatLabel = '10%';
                amountBeforeVat = Math.max(0, expAmount - vAmt);
                vatAmount = vAmt;
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: isMobile ? '0.75rem' : '1rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Số tiền đề xuất')}</label>
                      {vatRate > 0 && (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 8px', borderRadius: '12px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
                          ✓ {t('Đã gồm VAT')}
                        </span>
                      )}
                    </div>
                    <input
                      type="text"
                      className="form-input"
                      value={formatApprovalCurrency(expAmount, expCurr)}
                      disabled
                      style={{ 
                        fontSize: isMobile ? '0.95rem' : '1.05rem', 
                        fontWeight: 800, 
                        color: 'var(--color-primary, #2563eb)',
                        background: 'rgba(37, 99, 235, 0.04)',
                        borderColor: 'rgba(37, 99, 235, 0.2)'
                      }}
                    />
                    {expAmount > 0 && (
                      <div style={{ 
                        fontSize: isMobile ? '0.75rem' : '0.825rem', 
                        lineHeight: 1.35,
                        color: 'var(--color-primary, #2563eb)', 
                        fontWeight: 650, 
                        marginTop: '4px',
                        paddingLeft: '2px' 
                      }}>
                        {t('Bằng chữ:')} {numberToVietnameseText(expAmount, expCurr)}
                      </div>
                    )}

                    {vatRate > 0 && (
                      <div style={{
                        marginTop: '6px',
                        padding: '10px 14px',
                        background: '#ffffff',
                        border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                        borderRadius: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text, #1e293b)', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Receipt size={14} color="var(--color-text, #1e293b)" /> {t('Chi tiết thuế VAT')}
                          </span>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                            {t('Chứng từ')}: {docLabel}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '8px', paddingTop: '4px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t('Tiền trước VAT (Tiền hàng)')}:</span>
                            <strong style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>{formatApprovalCurrency(amountBeforeVat, expCurr)}</strong>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t('Tiền thuế VAT')}:</span>
                            <strong style={{ fontSize: '0.85rem', color: '#2563eb' }}>{formatApprovalCurrency(vatAmount, expCurr)}</strong>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t('Tổng thanh toán (sau VAT)')}:</span>
                            <strong style={{ fontSize: '0.9rem', color: '#10b981', fontWeight: 800 }}>{formatApprovalCurrency(expAmount, expCurr)}</strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Danh mục chi')}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={detail?.category || (item as any)?.category || 'Vận hành'}
                      disabled
                      style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Ngày chứng từ')}</label>
                    <input
                      type="text"
                      className="form-input"
                      value={detail?.date ? new Date(detail.date).toLocaleDateString('vi-VN') : ((item as any)?.date ? new Date((item as any).date).toLocaleDateString('vi-VN') : new Date(detail?.created_at || item.created_at).toLocaleDateString('vi-VN'))}
                      disabled
                      style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                    />
                  </div>
                </div>
              );
            })()
          )}

          {item.type === 'checkin' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: isMobile ? '0.75rem' : '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Ngày chấm công / giải trình')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={detail?.check_in_date || ''}
                  disabled
                  style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>{t('Giờ ghi nhận')}</label>
                <input
                  type="text"
                  className="form-input"
                  value={detail?.check_in_time || ''}
                  disabled
                  style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', gridColumn: 'span 2' }}>
                <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                  {Number(detail?.late_minutes) > 0 ? t('Thời gian đi trễ (phút)') : t('Hình thức / Trạng thái')}
                </label>
                <input
                  type="text"
                  className="form-input"
                  value={Number(detail?.late_minutes) > 0 ? `${detail?.late_minutes} phút` : `Bổ sung chấm công đúng giờ (${detail?.check_in_time || '08:30:00'})`}
                  disabled
                  style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                />
              </div>
            </div>
          )}

          {item.type === 'attendance_bulk' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '0.75rem' : '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: isMobile ? '0.75rem' : '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                    {detail?.details?.length === 1 ? t('Ngày giải trình') : t('Chu kỳ tháng')}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={detail?.details?.length === 1 && detail.details[0].check_in_date ? new Date(detail.details[0].check_in_date).toLocaleDateString('vi-VN') : (detail?.month_period || '—')}
                    disabled
                    style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label style={{ fontSize: isMobile ? '0.7rem' : '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                    {detail?.details?.length === 1 ? t('Hình thức') : t('Tổng số ngày bổ sung')}
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={detail?.details?.length === 1 ? t('Giải trình 1 ngày') : `${detail?.details?.length || 0} ${t('ngày')}`}
                    disabled
                    style={{ fontSize: isMobile ? '0.8125rem' : '0.875rem' }}
                  />
                </div>
              </div>

              {Array.isArray(detail?.details) && detail.details.length > 0 && (
                <div style={{ marginTop: '4px', border: '1px solid var(--color-border-light)', borderRadius: '10px', overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '0.725rem' : '0.8rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)', textAlign: 'left' }}>
                        <th style={{ padding: isMobile ? '6px 8px' : '8px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: isMobile ? '0.68rem' : '0.75rem', whiteSpace: 'nowrap' }}>{t('Ngày')}</th>
                        <th style={{ padding: isMobile ? '6px 8px' : '8px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: isMobile ? '0.68rem' : '0.75rem', whiteSpace: 'nowrap' }}>{t('Giờ vào đề xuất')}</th>
                        <th style={{ padding: isMobile ? '6px 8px' : '8px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: isMobile ? '0.68rem' : '0.75rem', whiteSpace: 'nowrap' }}>{t('Giờ ra đề xuất')}</th>
                        <th style={{ padding: isMobile ? '6px 8px' : '8px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: isMobile ? '0.68rem' : '0.75rem' }}>{t('Lý do')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.details.map((d: any, dIdx: number) => (
                        <tr key={d.id || dIdx} style={{ borderBottom: dIdx === detail.details.length - 1 ? 'none' : '1px solid var(--color-border-light)', background: dIdx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg-secondary)' }}>
                          <td style={{ padding: isMobile ? '6px 8px' : '8px 12px', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap' }}>
                            {(parseServerDate(d.check_in_date)?.toLocaleDateString('vi-VN')) || '—'}
                          </td>
                          <td style={{ padding: isMobile ? '6px 8px' : '8px 12px', color: '#059669', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {d.suggested_check_in ? String(d.suggested_check_in).substring(0, 5) : '08:30'}
                          </td>
                          <td style={{ padding: isMobile ? '6px 8px' : '8px 12px', color: '#2563eb', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {d.suggested_check_out ? String(d.suggested_check_out).substring(0, 5) : '17:00'}
                          </td>
                          <td style={{ padding: isMobile ? '6px 8px' : '8px 12px', color: 'var(--color-text-muted)' }}>
                            {d.reason || t('Bổ sung công')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card: Bảng kê chi tiết chi phí hoặc Bảng phân bổ chi trả hoa hồng */}
        {expenseItems && expenseItems.length > 0 && (() => {
          const isCommissionProposal = 
            detail?.category === 'commission' || 
            (item as any)?.category === 'commission' || 
            detail?.type === 'commission_payout' || 
            (item as any)?.type === 'commission_payout' || 
            (detail?.title && detail.title.toLowerCase().includes('hoa hồng')) || 
            (item?.title && item.title.toLowerCase().includes('hoa hồng')) || 
            (detail?.notes && detail.notes.includes('[Đề xuất chi trả hoa hồng]')) ||
            (detail?.notes && detail.notes.includes('[BẢNG PHÂN BỔ HOA HỒNG NHÂN SỰ]')) ||
            (rawDesc && rawDesc.includes('[Đề xuất chi trả hoa hồng]')) ||
            (rawDesc && rawDesc.includes('[BẢNG PHÂN BỔ HOA HỒNG NHÂN SỰ]')) ||
            (Array.isArray(expenseItems) && expenseItems.length > 0 && expenseItems.some((it: any) => it.bank_account_no || (it.user_id && it.user_name)));

          const curr = detail?.currency || (item as any)?.currency || 'VND';

          if (isCommissionProposal) {
            const totalCommission = expenseItems.reduce((sum: number, it: any) => sum + Number(it.amount || it.price || 0), 0);
            const paidCount = expenseItems.filter((it: any) => it.is_paid == 1 || it.is_paid === true).length;
            const totalCount = expenseItems.length;
            const isAllPaid = totalCount > 0 && paidCount === totalCount;
            const canManagePayment =
              isExecutive(user) ||
              isAccountant(user) ||
              hasDynamicModulePermission(user, 'finance', 'approve') ||
              ['accountant', 'admin', 'super_admin', 'superadmin', 'director'].includes(String(user?.role || '').toLowerCase()) ||
              String((user as any)?.department || '').toLowerCase().includes('kế toán') ||
              String((user as any)?.department || '').toLowerCase().includes('tài chính');

            return (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-surface)', border: '1.5px solid rgba(245, 158, 11, 0.3)', borderRadius: '16px', padding: isMobile ? '1.1rem' : '1.5rem', boxShadow: '0 4px 24px rgba(245, 158, 11, 0.05)' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #f59e0b, #d97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 2px 8px rgba(245, 158, 11, 0.25)', flexShrink: 0 }}>
                      <Award size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span>{t('BẢNG PHÂN BỔ & CHI TRẢ HOA HỒNG')}</span>
                        <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', fontWeight: 700 }}>
                          {totalCount} {t('đối tượng thụ hưởng')}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                        {t('Giải ngân độc lập từng đối tượng • Tự động gửi thông báo riêng biệt')}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t('Tiến độ giải ngân')}</div>
                      <div style={{ fontSize: '0.8rem', fontWeight: 800, color: isAllPaid ? '#10b981' : '#f59e0b' }}>
                        {paidCount}/{totalCount} {t('đã chi')} ({Math.round((paidCount / Math.max(1, totalCount)) * 100)}%)
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', paddingLeft: '12px', borderLeft: '1px solid var(--color-border-light)' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{t('Tổng tiền hoa hồng')}</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#059669', fontFamily: 'monospace' }}>
                        {formatApprovalCurrency(totalCommission, curr)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Security Notice Banner */}
                <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.15)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  <ShieldCheck size={16} style={{ color: '#3b82f6', flexShrink: 0 }} />
                  <span>
                    <strong style={{ color: '#2563eb' }}>{t('Cơ chế bảo mật thông báo riêng biệt')}:</strong> {t('Kế toán xác nhận hoặc upload UNC cho người nào thì chỉ gửi thông báo và email thanh toán đến đúng người đó (nếu là nhân sự nội bộ).')}
                  </span>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto', borderRadius: '12px', border: '1px solid var(--color-border-light)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: isMobile ? '0.725rem' : '0.8125rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px', width: '38px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>#</th>
                        <th style={{ padding: '10px 12px', minWidth: '160px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Đối tượng thụ hưởng')}</th>
                        <th style={{ padding: '10px 12px', minWidth: '200px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Thông tin tài khoản nhận')}</th>
                        <th style={{ padding: '10px 12px', width: '130px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Số tiền chi')}</th>
                        <th style={{ padding: '10px 12px', minWidth: '150px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Nội dung / Mã PO')}</th>
                        <th style={{ padding: '10px 12px', minWidth: '140px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Trạng thái & UNC')}</th>
                        {canManagePayment && (
                          <th style={{ padding: '10px 12px', minWidth: '150px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Thao tác kế toán')}</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {expenseItems.map((it: any, idx: number) => {
                        const u = users.find((usr: any) => Number(usr.id) === Number(it.user_id));
                        const isCurrentUser = Number(user?.id) === Number(it.user_id);
                        const isRowPaid = Boolean(it.is_paid == 1 || it.is_paid === true);
                        const isUploading = uploadingUncIndex === idx;
                        const isPaying = payingItemIndex === idx;
                        const isOther = it.recipient_type === 'other' || !it.user_id;
                        const rowAmt = Number(it.amount || it.price || 0);
                        const rowVndAmt = Math.round(toVndDetailAmount(rowAmt, curr));
                        const rawMemo = it.po_number ? `PO ${it.po_number} ${it.note || 'Hoa hong'}` : (it.note || detailVietQrCfg?.memo_prefix || 'Hoa hong');
                        const qrUrl = (it.bank_name && (it.bank_account_no || it.bank_account) && rowVndAmt > 0)
                          ? getVietQrUrl({
                              bankBinOrCode: it.bank_name,
                              accountNumber: it.bank_account_no || it.bank_account,
                              amount: rowVndAmt,
                              memo: normalizeVietQrText(rawMemo, Number(detailVietQrCfg?.memo_max_len || 50)),
                              memoMaxLen: Number(detailVietQrCfg?.memo_max_len || 50),
                              template: (detailVietQrCfg?.template as any) || 'compact2'
                            })
                          : null;

                        return (
                          <tr key={idx} style={{
                            borderBottom: idx < expenseItems.length - 1 ? '1px solid var(--color-border-light)' : 'none',
                            background: isCurrentUser ? 'rgba(245, 158, 11, 0.04)' : (idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg-secondary)'),
                            transition: 'background 0.2s ease'
                          }}>
                            {/* # */}
                            <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                              {idx + 1}
                            </td>

                            {/* Beneficiary Info */}
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <div style={{ position: 'relative' }}>
                                  {isOther ? (
                                    <div style={{
                                      width: '32px',
                                      height: '32px',
                                      borderRadius: '8px',
                                      background: 'rgba(217, 119, 6, 0.12)',
                                      color: '#d97706',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      fontWeight: 800,
                                      fontSize: '0.8rem'
                                    }}>
                                      {it.other_type === 'company' || it.company_id ? <Building2 size={16} /> : (it.other_type === 'supplier' || it.supplier_id ? <Building2 size={16} /> : <User size={16} />)}
                                    </div>
                                  ) : (
                                    <Avatar
                                      src={u?.avatar_url || u?.avatar || it.avatar}
                                      name={it.user_name || u?.full_name || 'N'}
                                      size="sm"
                                    />
                                  )}
                                  {isRowPaid && (
                                    <div style={{ position: 'absolute', bottom: -2, right: -2, width: '12px', height: '12px', borderRadius: '50%', background: '#10b981', border: '2px solid var(--color-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                      <Check size={8} color="#fff" strokeWidth={3} />
                                    </div>
                                  )}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 750, color: 'var(--color-text)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span>{it.user_name || u?.full_name || u?.name || t('Thụ hưởng')}</span>
                                    {isCurrentUser && (
                                      <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: '#f59e0b', color: '#fff', fontWeight: 800 }}>
                                        {t('Bạn')}
                                      </span>
                                    )}
                                    {isOther && (
                                      <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(217, 119, 6, 0.12)', color: '#b45309', fontWeight: 750 }}>
                                        {it.role || t('Đối tác / Khác')}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                      {u?.email || u?.phone || (it.user_id ? `#${it.user_id}` : (it.tax_code ? `MST: ${it.tax_code}` : ''))}
                                    </span>
                                    {it.po_number && (
                                      <span style={{
                                        fontSize: '0.68rem',
                                        padding: '1px 7px',
                                        borderRadius: '5px',
                                        background: 'rgba(37, 99, 235, 0.1)',
                                        color: '#1d4ed8',
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px'
                                      }}>
                                        <FileText size={10} />
                                        PO: {it.po_number}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Bank Info */}
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>
                                    {it.bank_name || '—'}
                                  </span>
                                  {qrUrl && (
                                    <button
                                      type="button"
                                      onClick={() => setPreviewQrModalUrl(qrUrl)}
                                      title={t('Xem mã VietQR để quét thanh toán')}
                                      style={{
                                        background: 'rgba(59, 130, 246, 0.08)',
                                        border: '1px solid rgba(59, 130, 246, 0.2)',
                                        borderRadius: '4px',
                                        padding: '2px 5px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '3px',
                                        cursor: 'pointer',
                                        color: '#2563eb',
                                        fontSize: '0.68rem',
                                        fontWeight: 700
                                      }}
                                    >
                                      <QrCode size={11} />
                                      <span>QR</span>
                                    </button>
                                  )}
                                </div>

                                {(it.bank_account_no || it.bank_account) ? (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '0.85rem', color: '#2563eb', letterSpacing: '0.02em' }}>
                                      {it.bank_account_no || it.bank_account}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(it.bank_account_no || it.bank_account, `STK (${it.user_name || 'Thụ hưởng'})`)}
                                      title={t('Sao chép số tài khoản')}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '2px 4px',
                                        cursor: 'pointer',
                                        color: copiedField?.includes(it.bank_account_no || it.bank_account) ? '#10b981' : 'var(--color-text-muted)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        borderRadius: '4px'
                                      }}
                                    >
                                      <Copy size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                                    {t('Chưa có STK')}
                                  </span>
                                )}

                                {(it.bank_account_name || it.bank_owner) && (
                                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                    {it.bank_account_name || it.bank_owner}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Amount */}
                            <td style={{ padding: '12px', textAlign: 'right' }}>
                              <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#059669', fontSize: '0.9rem', fontFamily: 'monospace' }}>
                                {formatApprovalCurrency(rowAmt, curr)}
                              </div>
                            </td>

                            {/* Note & PO */}
                            <td style={{ padding: '12px' }}>
                              <div style={{ color: 'var(--color-text)', fontWeight: 500, fontSize: '0.78rem', maxWidth: '220px', wordBreak: 'break-word' }}>
                                {it.note || it.name || 'Chi trả hoa hồng'}
                              </div>
                              {it.po_number && (
                                <div style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: 700, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <FileText size={11} />
                                  <span>{t('PO liên kết:')} {it.po_number}</span>
                                </div>
                              )}
                            </td>

                            {/* Status & UNC */}
                            <td style={{ padding: '12px' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                {isRowPaid ? (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 750,
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: 'rgba(16, 185, 129, 0.1)',
                                    color: '#059669',
                                    border: '1px solid rgba(16, 185, 129, 0.25)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    width: 'fit-content'
                                  }}>
                                    <CheckCircle2 size={11} />
                                    {t('Đã chi trả')}
                                  </span>
                                ) : (
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 750,
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: 'rgba(245, 158, 11, 0.1)',
                                    color: '#d97706',
                                    border: '1px solid rgba(245, 158, 11, 0.25)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    width: 'fit-content'
                                  }}>
                                    <Clock size={11} />
                                    {t('Chờ chi')}
                                  </span>
                                )}

                                {/* UNC file */}
                                {it.unc_file_url ? (
                                  <button
                                    type="button"
                                    onClick={() => handleViewUnc(it.unc_file_url)}
                                    style={{
                                      background: 'rgba(59, 130, 246, 0.08)',
                                      border: '1px solid rgba(59, 130, 246, 0.2)',
                                      borderRadius: '6px',
                                      padding: '3px 8px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '5px',
                                      cursor: 'pointer',
                                      color: '#2563eb',
                                      fontSize: '0.7rem',
                                      fontWeight: 700,
                                      width: 'fit-content'
                                    }}
                                  >
                                    <Eye size={12} />
                                    <span>{t('Xem UNC')}</span>
                                  </button>
                                ) : (
                                  isRowPaid && (
                                    <span style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>
                                      {t('Chưa đính kèm UNC')}
                                    </span>
                                  )
                                )}

                                {it.paid_by_name && (
                                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                    {it.paid_by_name} • {it.paid_at ? new Date(it.paid_at).toLocaleDateString('vi-VN') : ''}
                                  </div>
                                )}
                              </div>
                            </td>

                            {/* Actions for Accountant */}
                            {canManagePayment && (
                              <td style={{ padding: '12px', textAlign: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center' }}>
                                  {!isRowPaid ? (
                                    <>
                                      {/* Upload UNC & Pay */}
                                      <button
                                        type="button"
                                        disabled={isUploading || isPaying}
                                        onClick={() => {
                                          setTargetUploadIndex(idx);
                                          uncFileInputRef.current?.click();
                                        }}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '5px',
                                          padding: '5px 10px',
                                          borderRadius: '7px',
                                          background: 'linear-gradient(135deg, #10b981, #059669)',
                                          color: '#fff',
                                          border: 'none',
                                          fontWeight: 700,
                                          fontSize: '0.72rem',
                                          cursor: (isUploading || isPaying) ? 'not-allowed' : 'pointer',
                                          boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {isUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                        <span>{t('Tải UNC & Chi')}</span>
                                      </button>

                                      {/* Direct Confirm Pay */}
                                      <button
                                        type="button"
                                        disabled={isUploading || isPaying}
                                        onClick={() => handleExecutePayItem(idx)}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          padding: '4px 8px',
                                          borderRadius: '6px',
                                          background: 'rgba(59, 130, 246, 0.08)',
                                          color: '#2563eb',
                                          border: '1px solid rgba(59, 130, 246, 0.2)',
                                          fontWeight: 650,
                                          fontSize: '0.7rem',
                                          cursor: (isUploading || isPaying) ? 'not-allowed' : 'pointer',
                                          whiteSpace: 'nowrap'
                                        }}
                                      >
                                        {isPaying ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                                        <span>{t('Xác nhận đã chi')}</span>
                                      </button>
                                    </>
                                  ) : (
                                    /* Already paid: Allow updating UNC if needed */
                                    <button
                                      type="button"
                                      disabled={isUploading}
                                      onClick={() => {
                                        setTargetUploadIndex(idx);
                                        uncFileInputRef.current?.click();
                                      }}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        background: 'var(--color-bg-secondary)',
                                        color: 'var(--color-text-muted)',
                                        border: '1px solid var(--color-border-light)',
                                        fontWeight: 600,
                                        fontSize: '0.68rem',
                                        cursor: isUploading ? 'not-allowed' : 'pointer',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {isUploading ? <Loader2 size={10} className="animate-spin" /> : <Upload size={10} />}
                                      <span>{it.unc_file_url ? t('Đổi tệp UNC') : t('+ Đính UNC')}</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }

          const hasAnyVat = expenseItems.some((it: any) => Number(it.vat) > 0 || Number(it.vat_amount) > 0);
          const totalPreTax = expenseItems.reduce((sum: number, it: any) => {
            const qty = Number(it.quantity || it.qty || 1);
            const price = Number(it.unit_price || it.price || 0);
            const amt = Number(it.amount);
            return sum + (amt > 0 ? amt : (qty * price));
          }, 0);
          const totalVat = expenseItems.reduce((sum: number, it: any) => {
            const qty = Number(it.quantity || it.qty || 1);
            const price = Number(it.unit_price || it.price || 0);
            const preVat = Number(it.amount) > 0 ? Number(it.amount) : (qty * price);
            const vatPct = Number(it.vat || 0);
            const vatVal = Number(it.vat_amount) > 0 ? Number(it.vat_amount) : (vatPct > 0 ? Math.round(preVat * vatPct / 100) : 0);
            return sum + vatVal;
          }, 0);
          const totalPostTax = expenseItems.reduce((sum: number, it: any) => {
            const qty = Number(it.quantity || it.qty || 1);
            const price = Number(it.unit_price || it.price || 0);
            const preVat = Number(it.amount) > 0 ? Number(it.amount) : (qty * price);
            const vatPct = Number(it.vat || 0);
            const vatVal = Number(it.vat_amount) > 0 ? Number(it.vat_amount) : (vatPct > 0 ? Math.round(preVat * vatPct / 100) : 0);
            const tot = Number(it.total);
            return sum + (tot > 0 ? tot : (preVat + vatVal));
          }, 0);
          const finalSum = hasAnyVat ? totalPostTax : totalPreTax;

          return (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: isMobile ? '1rem' : '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: isMobile ? '6px' : '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <Receipt size={15} />
                  <span>{t('Bảng kê chi tiết chi phí')} ({expenseItems.length} {t('dòng chi phí')})</span>
                  {hasAnyVat && (
                    <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.1)', color: '#059669', border: '1px solid rgba(16, 185, 129, 0.2)', textTransform: 'none', fontWeight: 700 }}>
                      ✓ {t('Có hóa đơn & Thuế GTGT')}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: isMobile ? '0.88rem' : '0.82rem', color: '#10b981', fontWeight: 800 }}>
                  {t('Tổng thanh toán')}: {formatApprovalCurrency(finalSum, curr)}
                </span>
              </div>

              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: '10px', border: '1px solid var(--color-border-light)' }}>
                <table style={{ width: '100%', minWidth: isMobile ? (hasAnyVat ? '660px' : '460px') : '100%', borderCollapse: 'collapse', fontSize: isMobile ? '0.725rem' : '0.8125rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px', width: '38px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>#</th>
                      <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Nội dung chi phí')}</th>
                      <th style={{ padding: '10px 12px', width: '70px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Số lượng')}</th>
                      <th style={{ padding: '10px 12px', width: '110px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Đơn giá')}</th>
                      <th style={{ padding: '10px 12px', width: '115px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{hasAnyVat ? t('Trước thuế') : t('Thành tiền')}</th>
                      {hasAnyVat && (
                        <>
                          <th style={{ padding: '10px 12px', width: '75px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>% VAT</th>
                          <th style={{ padding: '10px 12px', width: '105px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Tiền VAT')}</th>
                          <th style={{ padding: '10px 12px', width: '125px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>{t('Sau thuế')}</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {expenseItems.map((it: any, idx: number) => {
                      const qty = Number(it.quantity || it.qty || 1);
                      const unitPrice = Number(it.unit_price || it.price || 0);
                      const preVat = Number(it.amount) > 0 ? Number(it.amount) : (qty * unitPrice);
                      const vatPct = Number(it.vat || 0);
                      const vatVal = Number(it.vat_amount) > 0 ? Number(it.vat_amount) : (vatPct > 0 ? Math.round(preVat * vatPct / 100) : 0);
                      const postVat = Number(it.total) > 0 ? Number(it.total) : (preVat + vatVal);
                      const invNum = it.invoice_number || it.inv_num;
                      const invCode = it.invoice_code || it.inv_code;
                      const invDate = it.invoice_date || it.inv_date;

                      return (
                        <tr key={idx} style={{ borderBottom: idx < expenseItems.length - 1 ? '1px solid var(--color-border-light)' : 'none', background: idx % 2 === 0 ? 'var(--color-surface)' : 'var(--color-bg-secondary)' }}>
                          <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                            {it.stt || (idx + 1)}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 650, color: 'var(--color-text)' }}>
                            <div>{it.content || it.name || it.description || it.item_name || it.title || it.noi_dung || t('Chi phí')}</div>
                            {(invNum || invCode || invDate) && (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                {invNum && (
                                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.08)', color: '#2563eb', fontWeight: 600 }}>
                                    Số HĐ: {invNum}
                                  </span>
                                )}
                                {invCode && (
                                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(107, 114, 128, 0.1)', color: '#4b5563', fontWeight: 600 }}>
                                    Ký hiệu: {invCode}
                                  </span>
                                )}
                                {invDate && (
                                  <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(107, 114, 128, 0.1)', color: '#4b5563', fontWeight: 600 }}>
                                    Ngày: {String(invDate).split(' ')[0]}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                            <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.08)', color: '#2563eb', fontWeight: 700, fontSize: '0.75rem' }}>
                              {qty}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-text-muted)', fontWeight: 600, fontFamily: 'monospace' }}>
                            {formatApprovalCurrency(unitPrice, curr)}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: hasAnyVat ? 650 : 800, color: hasAnyVat ? 'var(--color-text)' : '#059669', fontFamily: 'monospace' }}>
                            {formatApprovalCurrency(preVat, curr)}
                          </td>
                          {hasAnyVat && (
                            <>
                              <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                {vatPct > 0 ? (
                                  <span style={{ padding: '2px 6px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', fontWeight: 700, fontSize: '0.72rem' }}>
                                    {vatPct}%
                                  </span>
                                ) : (
                                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>0%</span>
                                )}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', color: vatVal > 0 ? '#d97706' : 'var(--color-text-muted)', fontWeight: 650, fontFamily: 'monospace' }}>
                                {formatApprovalCurrency(vatVal, curr)}
                              </td>
                              <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
                                {formatApprovalCurrency(postVat, curr)}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  {hasAnyVat && (
                    <tfoot>
                      <tr style={{ background: 'var(--color-bg-secondary)', borderTop: '2px solid var(--color-border-light)' }}>
                        <td colSpan={4} style={{ padding: '10px 12px', fontWeight: 700, textAlign: 'right', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                          {t('Tổng cộng trước thuế')}:
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text)', fontFamily: 'monospace' }}>
                          {formatApprovalCurrency(totalPreTax, curr)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>—</td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#d97706', fontFamily: 'monospace' }}>
                          {formatApprovalCurrency(totalVat, curr)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: '#059669', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                          {formatApprovalCurrency(totalPostTax, curr)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          );
        })()}

        {isPrintStampSend ? (() => {
          const reqEmpName = printStampSendFields['Nhân viên yêu cầu'] || getEmployeeName();
          const reqEmpUser = users.find(u => u.full_name?.toLowerCase() === reqEmpName.toLowerCase() || u.name?.toLowerCase() === reqEmpName.toLowerCase()) || creatorUser;
          
          const execName = printStampSendFields['Người thực hiện'] || '';
          const execUser = users.find(u => u.full_name?.toLowerCase() === execName.toLowerCase() || u.name?.toLowerCase() === execName.toLowerCase()) || (detail?.approver_id ? users.find(u => Number(u.id) === Number(detail.approver_id)) : null);

          const reqDate = printStampSendFields['Ngày yêu cầu'] || '';
          const sendMethod = printStampSendFields['Hình thức gửi'] || 'Chuyển phát nhanh';
          const sendTime = printStampSendFields['Khung giờ gửi'] || '';
          const recName = printStampSendFields['Tên người nhận'] || '';
          const recPhone = printStampSendFields['SĐT người nhận'] || '';
          const recAddress = printStampSendFields['Địa chỉ người nhận'] || '';
          const needSendDate = printStampSendFields['Ngày cần gửi hồ sơ'] || '';
          const rawAttach = printStampSendFields['Hồ sơ đính kèm'] || '';

          // Parse attachments if any
          const parsedAttachments: Array<{ name: string; url: string }> = [];
          if (rawAttach) {
            const matches = rawAttach.matchAll(/([^,\(]+)\s*\((https?:\/\/[^\)]+)\)/g);
            for (const m of matches) {
              parsedAttachments.push({ name: m[1].trim(), url: m[2].trim() });
            }
          }
          if (parsedAttachments.length === 0 && (detail?.image_url || (item as any)?.image_url)) {
            const u = detail?.image_url || (item as any)?.image_url;
            parsedAttachments.push({ name: u.split('/').pop() || 'Tài liệu đính kèm', url: u });
          }

          return (
            <div className="card" style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '16px',
              padding: isMobile ? '1.1rem' : '1.5rem',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)'
            }}>
              {/* Header Title */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#d97706',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <FileText size={18} />
                  </div>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {t('Quy trình: In, đóng dấu và gửi hồ sơ')}
                    </span>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                      {t('Chi tiết hồ sơ phát hành & người nhận')}
                    </div>
                  </div>
                </div>
              </div>

              {/* Block 1: Nhân sự thực hiện & Yêu cầu */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                gap: '12px'
              }}>
                {/* Người yêu cầu */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-light)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                    {t('Nhân viên yêu cầu')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Avatar
                      src={reqEmpUser?.avatar_url || reqEmpUser?.avatar}
                      name={reqEmpName}
                      size="sm"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>
                        {reqEmpName}
                      </strong>
                      {reqDate && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                          {t('Ngày yêu cầu')}: {reqDate}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Người thực hiện */}
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(37, 99, 235, 0.03)',
                  border: '1px solid rgba(37, 99, 235, 0.15)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>
                    {t('Người thực hiện (Xác nhận)')}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={getAvatarRingStyle('#10b981')}>
                      <Avatar
                        src={execUser?.avatar_url || execUser?.avatar}
                        name={execName || 'Chưa phân công'}
                        size="sm"
                      />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ fontSize: '0.85rem', color: '#1e40af' }}>
                        {execName || t('Chưa chọn')}
                      </strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                        {t('Bộ phận Hành chính / Nhân sự')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Block 2: Thông tin chuyển phát */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Truck size={14} style={{ color: 'var(--color-primary)' }} /> {t('Phương thức & Thời gian gửi')}
                </span>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t('Hình thức gửi')}</span>
                    <strong style={{ fontSize: '0.825rem', color: 'var(--color-text)' }}>{sendMethod}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t('Khung giờ gửi')}</span>
                    <strong style={{ fontSize: '0.825rem', color: 'var(--color-text)' }}>{sendTime || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t('Ngày cần gửi hồ sơ')}</span>
                    <strong style={{ fontSize: '0.825rem', color: '#d97706' }}>{needSendDate || '—'}</strong>
                  </div>
                </div>
              </div>

              {/* Block 3: Thông tin người nhận & Địa chỉ (Full width) */}
              <div style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-light)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
              }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} style={{ color: '#059669' }} /> {t('Thông tin người nhận')}
                </span>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t('Tên người nhận')}</span>
                    <strong style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>{recName || '—'}</strong>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>{t('Số điện thoại người nhận')}</span>
                    <strong style={{ fontSize: '0.85rem', color: '#2563eb', fontFamily: 'monospace' }}>{recPhone || '—'}</strong>
                  </div>
                </div>

                {/* Địa chỉ người nhận full width */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  marginTop: '4px',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--color-border-light)'
                }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <MapPin size={12} style={{ color: '#ef4444' }} /> {t('Địa chỉ giao / gửi hồ sơ')}
                  </span>
                  <div style={{
                    fontSize: '0.85rem',
                    fontWeight: 650,
                    color: 'var(--color-text)',
                    lineHeight: 1.5,
                    whiteSpace: 'normal',
                    wordBreak: 'break-word',
                    background: 'var(--color-surface)',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border-light)'
                  }}>
                    {recAddress || '—'}
                  </div>
                </div>
              </div>

              {/* Block 4: Hồ sơ đính kèm */}
              {parsedAttachments.length > 0 && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Paperclip size={14} style={{ color: 'var(--color-primary)' }} /> {t('Hồ sơ cần in, đóng dấu & gửi')} ({parsedAttachments.length})
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {parsedAttachments.map((att, aIdx) => (
                      <a
                        key={aIdx}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          background: 'rgba(59, 130, 246, 0.08)',
                          border: '1px solid rgba(59, 130, 246, 0.25)',
                          borderRadius: '8px',
                          color: '#2563eb',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          textDecoration: 'none'
                        }}
                      >
                        <FileText size={14} />
                        <span>{att.name}</span>
                        <ExternalLink size={12} style={{ opacity: 0.7 }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })() : isStationery ? (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Package size={15} />
              <span>{t('Danh sách vật phẩm / trang thiết bị đề xuất')} ({parsedStationeryItems.length} {t('loại')})</span>
            </div>

            {parsedStationeryItems.length > 0 ? (() => {
              const hasMonetaryStationery = parsedStationeryItems.some(st => Number(st.price || 0) > 0);
              return (
                <div style={{ overflowX: 'auto', borderRadius: '10px', border: '1px solid var(--color-border-light)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)', textAlign: 'left' }}>
                        <th style={{ padding: '10px 12px', width: '40px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>#</th>
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('Tên văn phòng phẩm / Vật phẩm')}</th>
                        <th style={{ padding: '10px 12px', width: '120px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('Số lượng')}</th>
                        {hasMonetaryStationery && (
                          <>
                            <th style={{ padding: '10px 12px', width: '120px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('Đơn giá')}</th>
                            <th style={{ padding: '10px 12px', width: '80px', textAlign: 'center', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>VAT</th>
                            <th style={{ padding: '10px 12px', width: '130px', textAlign: 'right', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('Thành tiền')}</th>
                          </>
                        )}
                        <th style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('Ghi chú / Mục đích sử dụng')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedStationeryItems.map((st, idx) => {
                        const unitPrice = Number(st.price || 0);
                        const qty = Number(st.quantity || 1);
                        const vatPct = Number(st.vat || 0);
                        const calcTotal = st.lineTotal || Math.round(unitPrice * qty * (1 + vatPct / 100));
                        return (
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
                            {hasMonetaryStationery && (
                              <>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text)' }}>
                                  {unitPrice > 0 ? `${unitPrice.toLocaleString('vi-VN')}đ` : '—'}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>
                                  {unitPrice > 0 ? `${vatPct}%` : '—'}
                                </td>
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#059669' }}>
                                  {calcTotal > 0 ? `${calcTotal.toLocaleString('vi-VN')}đ` : '—'}
                                </td>
                              </>
                            )}
                            <td style={{ padding: '10px 12px' }}>
                              <NoteCell
                                notes={st.notes}
                                itemName={st.name}
                                onOpenModal={(data) => setActiveNoteModal({ ...data, title: t('Ghi chú / Mục đích sử dụng') })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })() : (
              <div style={{ padding: '12px', background: 'var(--color-bg-secondary)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--color-text)' }}>
                {renderLinkifiedText(cleanNoteText)}
              </div>
            )}

            {(contentVal || reasonVal) && (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : (contentVal && reasonVal ? 'repeat(2, 1fr)' : '1fr'), gap: '1rem', marginTop: '6px', paddingTop: '12px', borderTop: '1px solid var(--color-border-light)' }}>
                {contentVal && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Nội dung đề xuất / Giải trình')}
                    </span>
                    <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: '8px', lineHeight: 1.45 }}>
                      {renderLinkifiedText(contentVal)}
                    </div>
                  </div>
                )}
                {reasonVal && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Lý do & Ý kiến đề xuất')}
                    </span>
                    <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '10px 12px', borderRadius: '8px', lineHeight: 1.45 }}>
                      {renderLinkifiedText(reasonVal)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* VIP Card: Kế hoạch tiếp đón đối tác & khách mời */}
            {meetingData && (
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '16px',
                padding: isMobile ? '1.1rem' : '1.5rem',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'rgba(189, 29, 45, 0.08)',
                      color: '#BD1D2D',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Briefcase size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#BD1D2D', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('Kế hoạch tiếp đón đối tác & khách mời')}
                      </span>
                      {meetingData.targetType && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          {t('Phân loại')}: {meetingData.targetType}
                        </div>
                      )}
                    </div>
                  </div>
                  {meetingData.headcount && (
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      background: 'rgba(189, 29, 45, 0.08)',
                      color: '#BD1D2D',
                      fontWeight: 700
                    }}>
                      <Users size={12} strokeWidth={1.75} style={{ marginRight: 4, verticalAlign: '-1px' }} />{meetingData.headcount}
                    </span>
                  )}
                </div>

                {/* Entity & Representative */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '10px' }}>
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Đơn vị / Khách mời tiếp đón')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Building2 size={15} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                      <strong style={{ fontSize: '0.85rem', color: 'var(--color-text)' }}>
                        {meetingData.clientName || '—'}
                      </strong>
                    </div>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Người đại diện & Liên hệ')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {meetingData.representative || 'Chưa cập nhật'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Location & Time */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '10px' }}>
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Địa điểm tiếp đón')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <MapPin size={15} style={{ color: '#ef4444', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 650, color: 'var(--color-text)' }}>
                        {meetingData.location || 'Chưa xác định'}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Thời gian tổ chức')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={15} style={{ color: '#0ea5e9', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 650, color: 'var(--color-text)' }}>
                        {meetingData.time || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Purpose */}
                {meetingData.purpose && (
                  <div style={{
                    padding: '12px 14px',
                    background: 'rgba(189, 29, 45, 0.04)',
                    borderRadius: '10px',
                    border: '1px solid rgba(189, 29, 45, 0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#BD1D2D', textTransform: 'uppercase' }}>
                      {t('Mục đích & Nội dung tiếp đón')}
                    </span>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text)', lineHeight: 1.45, fontWeight: 500 }}>
                      {meetingData.purpose}
                    </div>
                  </div>
                )}

                {/* Internal Attendees */}
                {meetingData.attendees && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{t('Nhân sự tham gia cùng')}:</span>
                    <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{meetingData.attendees}</span>
                  </div>
                )}

                {/* Payment Method badge */}
                {meetingData.paymentMethod && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{t('Phương thức thanh toán')}:</span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border-light)',
                      fontWeight: 650,
                      color: 'var(--color-text)'
                    }}>
                      {meetingData.paymentMethod}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* VIP Card: Thiết lập lịch thanh toán định kỳ */}
            {recurringData && (
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '16px',
                padding: isMobile ? '1.1rem' : '1.5rem',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'rgba(51, 65, 85, 0.08)',
                      color: '#334155',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Clock3 size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('Thiết lập lịch thanh toán định kỳ')}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        {t('Tự động hóa chu kỳ giải ngân chi phí')}
                      </div>
                    </div>
                  </div>
                  {recurringData.frequency && (
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '4px 10px',
                      borderRadius: '8px',
                      background: 'rgba(51, 65, 85, 0.08)',
                      color: '#334155',
                      fontWeight: 700
                    }}>
                      <RefreshCw size={12} strokeWidth={1.75} style={{ marginRight: 4, verticalAlign: '-1px' }} />{recurringData.frequency}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '10px' }}>
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Ngày giải ngân cố định')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={15} style={{ color: '#334155', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {recurringData.payDay || '—'}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Thời hạn hiệu lực')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={15} style={{ color: '#0ea5e9', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 650, color: 'var(--color-text)' }}>
                        {recurringData.duration || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {recurringData.contract && (
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <FileCheck size={16} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text)' }}>
                      <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>{t('Căn cứ HĐ / Thỏa thuận')}: </span>
                      <strong>{recurringData.contract}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VIP Card: Kế hoạch thanh toán theo các đợt */}
            {phasedData && phasedData.length > 0 && (
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '16px',
                padding: isMobile ? '1.1rem' : '1.5rem',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'rgba(2, 132, 199, 0.1)',
                      color: '#0284c7',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <GitBranch size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('Kế hoạch thanh toán theo các đợt')}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        {t('Tiến độ giải ngân theo từng mốc nghiệm thu')}
                      </div>
                    </div>
                  </div>
                  <span style={{
                    fontSize: '0.75rem',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: 'rgba(2, 132, 199, 0.08)',
                    color: '#0284c7',
                    fontWeight: 700
                  }}>
                    {phasedData.length} {t('đợt thanh toán')}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {phasedData.map((itemStr, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border-light)'
                      }}
                    >
                      <div style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'rgba(2, 132, 199, 0.12)',
                        color: '#0284c7',
                        fontWeight: 800,
                        fontSize: '0.75rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {idx + 1}
                      </div>
                      <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)' }}>
                        {itemStr}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VIP Card: Hồ sơ đề xuất tuyển dụng nhân sự */}
            {recruitmentData && (
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '16px',
                padding: isMobile ? '1.1rem' : '1.5rem',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '10px',
                      background: 'rgba(15, 118, 110, 0.1)',
                      color: '#0f766e',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      <UserPlus size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('Hồ sơ đề xuất tuyển dụng nhân sự')}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        {t('Thông tin vị trí, số lượng, dải lương và yêu cầu tuyển dụng')}
                      </div>
                    </div>
                  </div>
                  {recruitmentData.headcount && (
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '4px 12px',
                      borderRadius: '8px',
                      background: 'rgba(15, 118, 110, 0.1)',
                      color: '#0f766e',
                      fontWeight: 800,
                      border: '1px solid rgba(15, 118, 110, 0.25)'
                    }}>
                      <Users size={12} strokeWidth={1.75} style={{ marginRight: 4, verticalAlign: '-1px' }} />{t('Số lượng:')} {recruitmentData.headcount}
                    </span>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '10px' }}>
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Vị trí cần tuyển')}
                    </span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--color-text)' }}>
                      {recruitmentData.jobTitle || '—'}
                    </span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Hình thức làm việc')}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f766e' }}>
                      {recruitmentData.jobType || '—'}
                    </span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Phòng ban / Bộ phận tiếp nhận')}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                      {recruitmentData.department || '—'}
                    </span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Mức lương dự kiến')}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 750, color: '#059669' }}>
                      {recruitmentData.salary || t('Thỏa thuận')}
                    </span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Lý do tuyển dụng')}
                    </span>
                    <span style={{ fontSize: '0.825rem', fontWeight: 650, color: 'var(--color-text)' }}>
                      {recruitmentData.reason || '—'}
                    </span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Ngày dự kiến nhận việc')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} style={{ color: '#0f766e' }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {(() => {
                          const rawD = recruitmentData.expectedDate;
                          if (!rawD) return '—';
                          if (/^\d{4}-\d{2}-\d{2}$/.test(rawD)) {
                            const [y, m, d] = rawD.split('-');
                            return `${d}/${m}/${y}`;
                          }
                          return rawD;
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {recruitmentData.requirements && (
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Tiêu chuẩn / Yêu cầu ứng viên')}
                    </span>
                    <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                      {recruitmentData.requirements}
                    </div>
                  </div>
                )}

                {recruitmentData.description && (
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Mô tả công việc tóm tắt')}
                    </span>
                    <div style={{ fontSize: '0.825rem', color: 'var(--color-text)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>
                      {recruitmentData.description}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VIP Card: Hồ sơ đề nghị tạm ứng kinh phí */}
            {advanceData && (
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                background: 'linear-gradient(145deg, var(--color-surface) 0%, rgba(239, 246, 255, 0.5) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '16px',
                padding: isMobile ? '1.1rem' : '1.5rem',
                boxShadow: '0 4px 20px rgba(59, 130, 246, 0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'rgba(59, 130, 246, 0.12)',
                      color: '#2563eb',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <DollarSign size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('Hồ sơ đề nghị tạm ứng kinh phí')}
                      </span>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        {t('Mục đích tạm ứng & Hạn hoàn ứng chứng từ')}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '10px' }}>
                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Mục đích tạm ứng')}
                    </span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                      {advanceData.purpose || '—'}
                    </span>
                  </div>

                  <div style={{
                    padding: '10px 12px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
                      {t('Hạn hoàn ứng / quyết toán')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={15} style={{ color: '#ea580c', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#ea580c' }}>
                        {advanceData.settlementDate || '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIP Card: Thông tin thụ hưởng & Thanh toán (Bank Transfer, Cash, Wallet, Card) */}
            {paymentData && (paymentData.bankInfo || paymentData.beneficiaryName || paymentData.otherMethodInfo) && (
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                background: '#ffffff',
                border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                borderRadius: '16px',
                padding: isMobile ? '1.1rem' : '1.5rem',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.02)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                      width: '34px',
                      height: '34px',
                      borderRadius: '10px',
                      background: 'rgba(37, 99, 235, 0.12)',
                      color: 'var(--color-primary, #2563eb)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {paymentData.bankInfo ? <Landmark size={18} /> : (paymentData.otherMethodInfo?.type === 'wallet' ? <Wallet size={18} /> : <CreditCard size={18} />)}
                    </div>
                    <div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-primary, #2563eb)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {t('Thông tin thụ hưởng & Thanh toán')}
                      </span>
                      {paymentData.beneficiaryTarget && (
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                          {t('Đối tượng')}: {paymentData.beneficiaryTarget}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {paymentData.dept && (
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        color: '#2563eb',
                        fontWeight: 700
                      }}>
                        Phòng ban: {paymentData.dept}
                      </span>
                    )}
                    {paymentData.taxCode && (
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: 'rgba(37, 99, 235, 0.08)',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        fontFamily: 'monospace'
                      }}>
                        MST: {paymentData.taxCode}
                      </span>
                    )}
                    {(detail?.due_date || (item as any)?.due_date || paymentData.dueDate) && (
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.2)',
                        color: '#b91c1c',
                        fontWeight: 750,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}>
                        <Calendar size={13} style={{ color: '#ef4444' }} />
                        {t('Hạn thanh toán')}: {new Date(detail?.due_date || (item as any)?.due_date || paymentData.dueDate).toLocaleDateString('vi-VN')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Profile info or Payment Details */}
                {(paymentData.profileInfo || paymentData.paymentDetails) && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '10px 14px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)'
                  }}>
                    {paymentData.profileInfo && (
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)' }}>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', marginRight: '6px' }}>Hồ sơ:</span>
                        {paymentData.profileInfo}
                      </div>
                    )}
                    {paymentData.paymentDetails && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text)', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem', textTransform: 'uppercase', marginRight: '6px' }}>Chi tiết:</span>
                        {paymentData.paymentDetails}
                      </div>
                    )}
                  </div>
                )}

                {/* Beneficiary Name & Phone */}
                {paymentData.beneficiaryName && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '8px',
                    padding: '10px 14px',
                    background: 'var(--color-bg-secondary)',
                    borderRadius: '10px',
                    border: '1px solid var(--color-border-light)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <User size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {paymentData.beneficiaryName}
                      </span>
                    </div>
                    {paymentData.beneficiaryPhone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                        <Phone size={13} style={{ flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>{paymentData.beneficiaryPhone}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Modern Bank Transfer Box with VietQR Code & 1-Click Copy */}
                {paymentData.bankInfo && (() => {
                  const bInfo = paymentData.bankInfo;
                  if (!bInfo.accountNumber) {
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
                            {bInfo.bankName || t('Chuyển khoản')}: {t('Chưa cập nhật số tài khoản nhận tiền')}
                          </span>
                        </div>
                        {(bInfo.accountName || paymentData.beneficiaryName) && (
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#92400e' }}>
                            {t('Người nhận')}: {bInfo.accountName || paymentData.beneficiaryName}
                          </span>
                        )}
                      </div>
                    );
                  }

                  const qrAmount = Number(detail?.amount || (item as any)?.amount || 0);
                  const qrCurr = detail?.currency || (item as any)?.currency || 'VND';
                  const qrVndAmount = qrAmount > 0 ? Math.round(toVndDetailAmount(qrAmount, qrCurr)) : 0;
                  const rawQrMemo = detail?.expense_code || (item as any)?.code || (item.title ? String(item.title).slice(0, 40) : detailVietQrCfg?.memo_prefix || 'Thanh toan');
                  const vietQrUrl = getVietQrUrl({
                    bankBinOrCode: bInfo.bankName || detailVietQrCfg?.default_bank || 'VCB',
                    accountNumber: bInfo.accountNumber,
                    accountName: bInfo.accountName || paymentData.beneficiaryName,
                    amount: qrVndAmount > 0 ? qrVndAmount : undefined,
                    memo: normalizeVietQrText(rawQrMemo, Number(detailVietQrCfg?.memo_max_len || 50)),
                    memoMaxLen: Number(detailVietQrCfg?.memo_max_len || 50),
                    template: (detailVietQrCfg?.template as any) || 'compact2'
                  });

                  return (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile || !vietQrUrl ? '1fr' : 'minmax(0, 1fr) 155px',
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
                            <BankLogo
                              bank={bInfo.bankName}
                              width={38}
                              height={26}
                              style={{ borderRadius: '6px', border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))', background: '#ffffff', padding: '2px 4px' }}
                            />
                            <span style={{ fontWeight: 750, fontSize: '0.8rem', letterSpacing: '0.01em', color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={bInfo.bankName || t('Chuyển khoản Ngân hàng')}>
                              {bInfo.bankName || t('Chuyển khoản Ngân hàng')}
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
                            {t('Chuyển khoản 24/7')}
                          </span>
                        </div>

                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '6px',
                          background: '#f8fafc',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border-light, rgba(0, 0, 0, 0.08))',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                        }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                            <span style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                              {t('Số tài khoản')}
                            </span>
                            <span style={{
                              fontSize: '1.05rem',
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              letterSpacing: '0.06em',
                              color: '#dc2626'
                            }}>
                              {bInfo.accountNumber || '—'}
                            </span>
                          </div>
                          {bInfo.accountNumber && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(bInfo.accountNumber, t('Số tài khoản'))}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '5px 9px',
                                borderRadius: '6px',
                                background: copiedField === t('Số tài khoản') ? '#059669' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                color: '#ffffff',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontSize: '0.7rem',
                                boxShadow: '0 2px 6px rgba(220, 38, 38, 0.25)',
                                transition: 'all 0.2s ease',
                                flexShrink: 0
                              }}
                            >
                              {copiedField === t('Số tài khoản') ? <Check size={12} /> : <Copy size={12} />}
                              <span>{copiedField === t('Số tài khoản') ? t('Đã chép') : t('Sao chép')}</span>
                            </button>
                          )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '4px' }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: '0.58rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
                              {t('Chủ tài khoản')}
                            </span>
                            <div style={{ fontSize: '0.78rem', fontWeight: 750, letterSpacing: '0.01em', color: '#0f172a', marginTop: '1px', textTransform: 'uppercase', lineHeight: 1.25 }}>
                              {bInfo.accountName || paymentData.beneficiaryName || '—'}
                            </div>
                          </div>
                          {bInfo.branch && (
                            <div style={{ fontSize: '0.65rem', color: '#64748b', textAlign: 'right', flexShrink: 0 }}>
                              {t('Chi nhánh')}: <span style={{ color: '#1e293b', fontWeight: 600 }}>{bInfo.branch}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* VietQR Card: Bigger QR, No title, No subtitle, Click to zoom */}
                      {vietQrUrl && (
                        <div
                          onClick={() => setPreviewQrModalUrl(vietQrUrl)}
                          title={t('Bấm để phóng to mã QR')}
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

                {/* Other Payment Methods (Cash, Wallet, Card) */}
                {paymentData.otherMethodInfo && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border-light)'
                  }}>
                    {paymentData.otherMethodInfo.type === 'cash' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Wallet size={16} style={{ color: '#059669', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#059669' }}>
                            {t('Thanh toán tiền mặt trực tiếp')}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {paymentData.otherMethodInfo.receiver && <span>{t('Người nhận')}: <strong>{paymentData.otherMethodInfo.receiver}</strong></span>}
                            {paymentData.otherMethodInfo.location && <span> • {t('Bàn giao tại')}: <strong>{paymentData.otherMethodInfo.location}</strong></span>}
                          </div>
                        </div>
                      </div>
                    )}
                    {paymentData.otherMethodInfo.type === 'wallet' && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Wallet size={16} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#BD1D2D' }}>
                              {t('Ví điện tử')} {paymentData.otherMethodInfo.walletType}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                              {paymentData.otherMethodInfo.holder && <span>{t('Chủ ví')}: <strong>{paymentData.otherMethodInfo.holder}</strong></span>}
                              {paymentData.otherMethodInfo.phone && <span> • {t('SĐT ví')}: <strong style={{ fontFamily: 'monospace' }}>{paymentData.otherMethodInfo.phone}</strong></span>}
                            </div>
                          </div>
                        </div>
                        {paymentData.otherMethodInfo.phone && (
                          <button
                            type="button"
                            onClick={() => handleCopyText(paymentData.otherMethodInfo.phone, t('SĐT ví'))}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              background: 'var(--color-surface)',
                              border: '1px solid var(--color-border)',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}
                          >
                            <Copy size={12} /> {t('Chép SĐT')}
                          </button>
                        )}
                      </div>
                    )}
                    {paymentData.otherMethodInfo.type === 'card' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CreditCard size={16} style={{ color: '#0284c7', flexShrink: 0 }} />
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0284c7' }}>
                            {t('Thẻ tín dụng doanh nghiệp')}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                            {t('4 số cuối thẻ')}: <strong style={{ fontFamily: 'monospace' }}>{paymentData.otherMethodInfo.last4 || 'N/A'}</strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* General Description / Reason / Additional Notes */}
            {residualNote ? (
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '16px',
                padding: isMobile ? '1.1rem' : '1.5rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)'
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {contentVal && !reasonVal ? t('Nội dung đề xuất / Giải trình') : (!contentVal && reasonVal ? t('Lý do đề xuất') : t('Lý do & Nội dung chi tiết'))}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text)', background: 'var(--color-bg-secondary)', padding: '12px 14px', borderRadius: '10px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {renderLinkifiedText(residualNote)}
                </div>
              </div>
            ) : (!meetingData && !recurringData && !phasedData && !advanceData && !paymentData) ? (
              <div className="card" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '16px',
                padding: isMobile ? '1.1rem' : '1.5rem',
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)'
              }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {t('Nội dung đề xuất')}
                </div>
                <div style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', padding: '10px 12px', background: 'var(--color-bg-secondary)', borderRadius: '8px' }}>
                  {t('Không có mô tả chi tiết')}
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* Card: Tài liệu chứng từ đính kèm trong chi tiết */}
        {(() => {
          const rawText = detail?.notes || detail?.description || item.description || '';
          const baseUrl = (import.meta.env.VITE_API_URL || '/backend').replace(/\/+$/, '');
          const extractedFiles: { name: string; url: string }[] = [];

          const normalizeUrl = (raw: string) => {
            if (!raw) return '';
            return decodeURIComponent(raw.replace(/^https?:\/\/[^\/]+/, '').replace(/^\/?(backend\/)?/, '').split('?')[0]).toLowerCase().trim();
          };

          const isServerHashedName = (name: string) => {
            if (!name) return false;
            const clean = name.trim().toLowerCase();
            return /^(img_|file_|expense_proof_)[a-f0-9_.]+/i.test(clean);
          };

          const beautifyFileName = (name: string, url?: string) => {
            const raw = (name || '').trim();
            if (!raw || isServerHashedName(raw)) {
              const fullRef = url || raw;
              const ext = fullRef.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
              const cleanExt = ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext) ? ` (.${ext})` : '';
              return `Chứng từ đính kèm${cleanExt}`;
            }
            return raw;
          };

          const addOrUpdateFile = (candidateUrl: string, candidateName?: string) => {
            if (!candidateUrl) return;
            const candNorm = normalizeUrl(candidateUrl);
            const resolvedUrl = candidateUrl.startsWith('http') ? candidateUrl : `${baseUrl}/${candidateUrl.replace(/^\/?(backend\/)?/, '')}`;
            const cleanCandidateName = (candidateName || '').replace(/^[•\-\s]+/, '').trim();
            const isCandHashed = isServerHashedName(cleanCandidateName);

            const existing = extractedFiles.find(e => normalizeUrl(e.url) === candNorm);
            if (existing) {
              // If existing has a server-hashed or generic name, and candidate is a real original name, UPDATE it!
              if ((isServerHashedName(existing.name) || existing.name === 'Tài liệu' || existing.name === 'Tệp đính kèm') && cleanCandidateName && !isCandHashed) {
                existing.name = cleanCandidateName;
              }
            } else {
              let finalName = cleanCandidateName;
              if (!finalName || isCandHashed) {
                finalName = beautifyFileName(finalName, candidateUrl);
              }
              extractedFiles.push({
                name: finalName,
                url: resolvedUrl
              });
            }
          };

          // 1. Scan raw text notes first to capture original user-defined filenames
          const matches = rawText.matchAll(/([^\n\r(•]+)\s*\((https?:\/\/[^\r\n)]+|\/backend\/[^\r\n)]+|uploads\/[^\r\n)]+)\)/gi);
          for (const m of matches) {
            const rawName = m[1].replace(/^[•\-\s]+/, '').trim();
            const url = m[2].trim();
            addOrUpdateFile(url, rawName);
          }

          // 2. Scan structured attachments array if available
          if (Array.isArray(detail?.attachments)) {
            detail.attachments.forEach((a: any) => {
              const aUrl = typeof a === 'string' ? a : (a.url || a.path || '');
              const aName = typeof a === 'object' ? (a.name || a.filename || '') : '';
              addOrUpdateFile(aUrl, aName);
            });
          }

          // 3. Fallback to image_url (main proof/thumbnail) & refund_image_url (UNC)
          if (detail?.image_url) {
            addOrUpdateFile(detail.image_url, '');
          }
          if (detail?.refund_image_url) {
            addOrUpdateFile(detail.refund_image_url, 'Ủy nhiệm chi / Chuyển khoản');
          }

          // 4. Final sanitization pass to make sure no hashed names leak into UI
          extractedFiles.forEach(f => {
            if (isServerHashedName(f.name)) {
              f.name = beautifyFileName(f.name, f.url);
            }
          });

          if (extractedFiles.length === 0) return null;

          const isImageFile = (f: { name: string; url: string }) => {
            return /\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)(\?.*)?$/i.test(f.url) || /\.(jpg|jpeg|png|webp|gif|svg|bmp|avif)$/i.test(f.name);
          };

          const isPdfFile = (f: { name: string; url: string }) => {
            return /\.pdf(\?.*)?$/i.test(f.url) || /\.pdf$/i.test(f.name);
          };

          const allAttachmentItems: AttachmentItem[] = extractedFiles.map((f) => ({
            url: f.url,
            name: f.name,
            type: isPdfFile(f) ? 'pdf' : isImageFile(f) ? 'image' : 'other'
          }));

          const imageFiles = extractedFiles.filter(isImageFile);
          const docFiles = extractedFiles.filter(f => !isImageFile(f));

          return (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Paperclip size={14} style={{ color: 'var(--color-primary)' }} />
                  {t('Tài liệu chứng từ đính kèm')} ({extractedFiles.length})
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                  {imageFiles.length > 0 ? `${imageFiles.length} ${t('hình ảnh')}` : ''}
                  {docFiles.length > 0 ? `${imageFiles.length > 0 ? ' • ' : ''}${docFiles.length} ${t('tài liệu')}` : ''}
                </span>
              </div>

              {/* RENDER IMAGES DIRECTLY ("ảnh thì hiện ra luôn") */}
              {imageFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: imageFiles.length === 1 ? '1fr' : 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '12px'
                  }}>
                    {imageFiles.map((file, fIdx) => {
                      const globalIdx = extractedFiles.findIndex(f => f.url === file.url);
                      return (
                        <div
                          key={`img-${fIdx}`}
                          className="hover-lift group"
                          onClick={() => setLightboxState({
                            isOpen: true,
                            items: allAttachmentItems,
                            initialIndex: globalIdx >= 0 ? globalIdx : fIdx
                          })}
                          style={{
                            position: 'relative',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            border: '1.5px solid var(--color-border-light)',
                            background: 'var(--color-bg)',
                            cursor: 'pointer',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
                            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                            display: 'flex',
                            flexDirection: 'column'
                          }}
                        >
                          <div style={{
                            position: 'relative',
                            height: imageFiles.length === 1 ? '320px' : '160px',
                            background: 'rgba(0, 0, 0, 0.02)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden'
                          }}>
                            <img
                              src={file.url}
                              alt={file.name}
                              loading="lazy"
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: imageFiles.length === 1 ? 'contain' : 'cover',
                                transition: 'transform 0.3s ease'
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                top: '8px',
                                right: '8px',
                                background: 'rgba(0,0,0,0.68)',
                                backdropFilter: 'blur(6px)',
                                color: '#ffffff',
                                borderRadius: '6px',
                                padding: '4px 8px',
                                fontSize: '0.675rem',
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Eye size={12} />
                              <span>{t('Phóng to')}</span>
                            </div>
                          </div>
                          <div style={{
                            padding: '8px 12px',
                            background: 'var(--color-surface)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            borderTop: '1px solid var(--color-border-light)'
                          }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '82%' }} title={file.name}>
                              {file.name}
                            </span>
                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              style={{ color: 'var(--color-primary)', display: 'flex', alignItems: 'center' }}
                              title={t('Mở trong tab mới')}
                            >
                              <ArrowRight size={13} style={{ transform: 'rotate(-45deg)' }} />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* NON-IMAGE DOCUMENTS */}
              {docFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {docFiles.map((file, fIdx) => {
                    const isPdf = isPdfFile(file);
                    const globalIdx = extractedFiles.findIndex(f => f.url === file.url);

                    return (
                      <div
                        key={`doc-${fIdx}`}
                        onClick={() => {
                          if (isPdf) {
                            setLightboxState({
                              isOpen: true,
                              items: allAttachmentItems,
                              initialIndex: globalIdx >= 0 ? globalIdx : fIdx
                            });
                          } else {
                            window.open(resolveFileUrl(file.url), '_blank', 'noopener,noreferrer');
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 14px',
                          background: 'var(--color-bg-secondary)',
                          borderRadius: '10px',
                          border: '1px solid var(--color-border-light)',
                          cursor: 'pointer',
                          color: 'var(--color-text)',
                          transition: 'all 0.2s ease'
                        }}
                        className="hover-lift"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <FileText size={16} style={{ color: isPdf ? '#ef4444' : 'var(--color-primary)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.8125rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.name}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                            {isPdf ? t('Xem PDF') : t('Mở xem')} ↗
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Card 4: Cấu hình nâng cao (Chỉ hiện khi có thiết lập được bật) */}
        {((item.type === 'expense' && hasInstallments) || hasRecurring) && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--color-surface)', border: '1px solid var(--color-border-light)', borderRadius: '16px', padding: '1.5rem', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.02)' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('Cấu hình nâng cao')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {item.type === 'expense' && hasInstallments && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <GreenToggle
                    id="view_isPhasedPayment"
                    checked={true}
                    disabled
                    label={t('Thanh toán chia nhiều đợt (Installment/Phased Payment)')}
                  />
                  {installmentText && (
                    <div style={{ marginTop: '8px', padding: '1rem', border: '1px solid var(--color-border-light)', borderRadius: '12px', background: 'var(--color-bg-secondary)', fontSize: '0.8rem', color: 'var(--color-text-light)', lineHeight: 1.4 }}>
                      {installmentText}
                    </div>
                  )}
                </div>
              )}

              {hasRecurring && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <GreenToggle
                    id="view_isRecurring"
                    checked={true}
                    disabled
                    label={t('Thiết lập lặp lại tự động (Recurring Proposal)')}
                  />
                  {recurringText && (
                    <div style={{ marginTop: '8px', padding: '1rem', border: '1px solid var(--color-border-light)', borderRadius: '12px', background: 'var(--color-bg-secondary)', fontSize: '0.8rem', color: 'var(--color-text-light)', lineHeight: 1.4 }}>
                      {recurringText}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    );
  };

  return createPortal(
    <>
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      {reminderTargetUser && createPortal(
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2147483646,
          padding: '1rem'
        }} onClick={() => setReminderTargetUser(null)}>
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: '16px',
            border: '1px solid var(--color-border-light)',
            boxShadow: 'var(--shadow-lg)',
            width: '100%',
            maxWidth: '420px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            textAlign: 'left'
          }} onClick={e => e.stopPropagation()}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={18} style={{ color: 'var(--color-primary)' }} />
                {t('Gửi nhắc nhở phê duyệt')}
              </h3>
              <button 
                onClick={() => setReminderTargetUser(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'var(--color-bg-secondary)', borderRadius: '10px' }}>
              <Avatar src={reminderTargetUser.avatar || reminderTargetUser.avatar_url} name={reminderTargetUser.full_name || reminderTargetUser.name} size={28} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{reminderTargetUser.full_name || reminderTargetUser.name}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                {t('Nội dung nhắc nhở')}
              </label>
              <textarea
                className="form-input"
                rows={4}
                value={reminderMessage}
                onChange={e => setReminderMessage(e.target.value)}
                placeholder={t('Nhập lời nhắn nhắc nhở người duyệt... Ví dụ: Đề xuất này đang cần gấp, duyệt hộ mình với nhé!')}
                style={{ width: '100%', resize: 'none', padding: '10px', fontSize: '0.8rem' }}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setReminderTargetUser(null)}
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
              >
                {t('Hủy')}
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  if (!reminderMessage.trim()) {
                    toast.error(t('Vui lòng nhập nội dung nhắc nhở trước khi gửi!'));
                    return;
                  }
                  if (reminderSendInFlightRef.current) return;
                  reminderSendInFlightRef.current = true;
                  const targetName = reminderTargetUser.full_name || reminderTargetUser.name || '';
                  try {
                    await api.post('/notifications/reminder', {
                      target_user_id: reminderTargetUser.id,
                      message: reminderMessage.trim(),
                      item_title: detail?.title || item?.title || t('Đơn đề xuất'),
                      item_type: item?.type || 'expense',
                      item_id: item?.id || 0
                    });
                    toast.success(`${t('Đã gửi nhắc nhở thành công đến')} ${targetName}!`);
                    setReminderTargetUser(null);
                    setReminderMessage('');
                  } catch (err: any) {
                    toast.error(err?.response?.data?.message || err?.message || t('Lỗi gửi nhắc nhở'));
                  } finally {
                    reminderSendInFlightRef.current = false;
                  }
                }}
                style={{ padding: '6px 16px', fontSize: '0.8rem', background: '#BD1D2D', borderColor: '#BD1D2D', color: 'white' }}
              >
                {t('Gửi đi')}
              </button>
            </div>

          </div>
        </div>
      , document.body)}

      <AnimatePresence>
        {!isClosing && (
          <>
            {/* Backdrop overlay utilizing the CSS-based backdrop classes */}
            <motion.div 
              className="drawer-backdrop" 
              onClick={handleClose}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: (detailUiMotion?.drawer_ms || 220) / 1000, ease: [0.25, 0.1, 0.25, 1] as any }}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                zIndex: (zIndex ? Math.min(Math.max(zIndex, 2147483625), 2147483638) : 2147483625) - 5,
                '--drawer-backdrop-z': (zIndex ? Math.min(Math.max(zIndex, 2147483625), 2147483638) : 2147483625) - 5
              } as React.CSSProperties}
            />

            {/* Drawer Sheet Container */}
            <motion.div 
              className="drawer-sheet drawer-panel"
              initial={isMobile ? { y: '100%', opacity: 0 } : { opacity: 0, x: '100%' }}
              animate={isMobile ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
              exit={isMobile ? { y: '60%', opacity: 0 } : { opacity: 0, x: '60%' }}
              transition={{ duration: (detailUiMotion?.drawer_ms || 220) / 1000, ease: [0.25, 0.1, 0.25, 1] as any }}
              style={{
                position: 'fixed',
                top: 0,
                left: isMobile ? 0 : 'var(--sidebar-width, 220px)',
                right: 0,
                bottom: 0,
                background: 'linear-gradient(180deg, var(--color-bg) 0%, var(--color-border-light) 100%)',
                boxShadow: '-10px 0 30px rgba(0,0,0,0.15)',
                display: 'flex',
                flexDirection: 'column',
                boxSizing: 'border-box',
                zIndex: (zIndex ? Math.min(Math.max(zIndex, 2147483625), 2147483638) : 2147483625),
                '--drawer-panel-z': (zIndex ? Math.min(Math.max(zIndex, 2147483625), 2147483638) : 2147483625),
                overflow: 'hidden'
              } as React.CSSProperties} 
              onClick={e => e.stopPropagation()}
            >
        
        {/* Drawer Header */}
        <div style={{
          padding: isMobile ? '0.75rem 1rem' : '1.25rem 1.5rem',
          borderBottom: '1px solid var(--color-border-light)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--color-surface)',
          zIndex: 100,
          position: 'sticky',
          top: 0,
          flexShrink: 0,
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '6px' : '10px', minWidth: 0, flex: 1 }}>
            <img 
              src={ideasLogoUrl}
              alt={detailOrgConfig?.organization?.name || 'IDEAS LOGO'}
              style={{ 
                height: isMobile ? '24px' : '32px', 
                width: isMobile ? '24px' : '32px', 
                borderRadius: '6px', 
                border: '1px solid var(--color-border-light)',
                objectFit: 'cover',
                flexShrink: 0
              }} 
            />
            <h3 style={{ 
              margin: 0, 
              fontSize: isMobile ? '0.8rem' : '1.1rem', 
              fontWeight: 800, 
              textTransform: 'uppercase', 
              color: 'var(--color-text)', 
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {detailOrgConfig?.organization?.name || 'IDEAS'} - {t('Quy trình')} <span style={{ color: 'var(--color-primary)' }}>#{item.id}</span>
            </h3>
          </div>
          <div style={{ display: 'flex', gap: isMobile ? '6px' : '8px', alignItems: 'center', flexShrink: 0 }}>
            {isMyTurnToApprove() && (
              <>
                 <button
                  onClick={() => onReject(item)}
                  style={{
                    height: isMobile ? '32px' : '36px',
                    width: isMobile ? '32px' : 'auto',
                    padding: isMobile ? 0 : '0 16px',
                    fontSize: isMobile ? '0.725rem' : '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    borderRadius: '8px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#334155',
                    fontWeight: 750,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out'
                  }}
                  title={t('Từ chối')}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#e2e8f0';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#f1f5f9';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <XCircle size={isMobile ? 16 : 14} />
                  {!isMobile && <span>{t('Từ chối')}</span>}
                </button>
                <button
                  onClick={async () => {
                    await onApprove(item);
                    handleClose();
                  }}
                  style={{
                    height: isMobile ? '32px' : '36px',
                    width: isMobile ? '32px' : 'auto',
                    padding: isMobile ? 0 : '0 18px',
                    fontSize: isMobile ? '0.725rem' : '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px',
                    borderRadius: '8px',
                    background: '#BD1D2D',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 750,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out'
                  }}
                  title={t('Phê duyệt')}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = '#991b1b';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(189, 29, 45, 0.25)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = '#BD1D2D';
                    e.currentTarget.style.transform = 'none';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <CheckCircle2 size={isMobile ? 16 : 14} />
                  {!isMobile && <span>{t('Phê duyệt')}</span>}
                </button>
              </>
            )}

            {onEdit && (() => {
              const isCreator = Number(user?.id) === Number(item.created_by || item.user_id || detail?.created_by || detail?.user_id);
              const isPrivilegedUser = isExecutive(user) || ['admin', 'superadmin', 'super_admin', 'director', 'manager', 'hr'].includes(String(user?.role || '').toLowerCase());
              const canEditThis = (isCreator && ['pending', 'pending_approval', 'pending_manager', 'pending_hr', 'rejected', 'draft'].includes(String(item.status || 'pending').toLowerCase())) ||
                (isPrivilegedUser && ['pending', 'pending_approval', 'pending_manager', 'pending_hr', 'rejected', 'draft'].includes(String(item.status || 'pending').toLowerCase()));
              return canEditThis ? (
              <button
                onClick={() => {
                  onEdit(item);
                }}
                className="btn secondary hover-lift"
                style={{
                  height: isMobile ? '32px' : '36px',
                  width: isMobile ? '32px' : 'auto',
                  padding: isMobile ? 0 : '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  borderRadius: '8px',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-primary)',
                  fontWeight: 700,
                  fontSize: isMobile ? '0.725rem' : '0.8rem',
                  cursor: 'pointer'
                }}
                title={t('Chỉnh sửa đề xuất')}
              >
                <Pencil size={isMobile ? 15 : 14} />
                {!isMobile && <span>{t('Sửa')}</span>}
              </button>
              ) : null;
            })()}

            {onDuplicate && (
              <button
                onClick={() => {
                  onDuplicate(item);
                }}
                className="btn secondary hover-lift"
                style={{
                  height: isMobile ? '32px' : '36px',
                  width: isMobile ? '32px' : '36px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '8px'
                }}
                title={t('Nhân bản đề xuất')}
              >
                <Copy size={isMobile ? 15 : 16} />
              </button>
            )}
            {onDelete && (['admin', 'superadmin', 'super_admin', 'director'].includes(String(user?.role || '').toLowerCase()) || (item.status !== 'approved' && item.status !== 'completed' && (Number(item.user_id) === Number(user?.id) || Number(item.created_by) === Number(user?.id) || ['manager', 'hr'].includes(String(user?.role).toLowerCase())))) && (
              <button
                onClick={() => {
                  onDelete(item, handleClose);
                }}
                className="btn secondary hover-lift"
                style={{
                  height: isMobile ? '32px' : '36px',
                  width: isMobile ? '32px' : 'auto',
                  padding: isMobile ? 0 : '0 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                  borderRadius: '8px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  fontWeight: 700,
                  fontSize: isMobile ? '0.725rem' : '0.8rem',
                  cursor: 'pointer'
                }}
                title={t('Xóa đề xuất')}
              >
                <Trash2 size={isMobile ? 15 : 14} />
                {!isMobile && <span>{t('Xóa')}</span>}
              </button>
            )}
            <button 
              onClick={handleClose} 
              className="hover-lift"
              style={{
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                padding: 0,
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--color-text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: isMobile ? '32px' : '36px',
                width: isMobile ? '32px' : '36px'
              }}
              title={t('Đóng')}
            >
              <X size={isMobile ? 16 : 18} />
            </button>
          </div>
        </div>

        {/* Drawer Body (Split layout) */}
        <div className="custom-scrollbar" style={{
          flex: 1,
          overflowY: 'auto',
          padding: isMobile ? '1rem 1rem calc(80px + env(safe-area-inset-bottom, 0px)) 1rem' : '1.5rem',
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1.3fr 1fr',
          gap: isMobile ? '1rem' : '1.5rem',
          background: 'var(--color-bg-light, #f8fafc)'
        }}>
          {/* Left Column: Detailed Proposal Fields */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            {renderDetailFields()}
          </div>

          {/* Right Column: Timeline & Comments */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            background: 'var(--color-surface)',
            padding: '1.25rem',
            borderRadius: '16px',
            border: '1px solid var(--color-border-light)',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.8125rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                {t('CÁC BƯỚC THỰC HIỆN')}
              </h3>
              {renderTimeline()}

              {/* Related Persons in View Drawer */}
              {(() => {
                const relIdsRaw = detail?.related_user_ids !== undefined ? detail.related_user_ids : ((item as any)?.related_user_ids || (detail as any)?.related_users || (item as any)?.related_users);
                let rawList: any[] = [];
                if (Array.isArray(relIdsRaw)) {
                  rawList = relIdsRaw;
                } else if (typeof relIdsRaw === 'string' && relIdsRaw.trim()) {
                  const trimmed = relIdsRaw.trim();
                  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                    try {
                      const parsed = JSON.parse(trimmed);
                      if (Array.isArray(parsed)) rawList = parsed;
                      else rawList = [parsed];
                    } catch {
                      rawList = trimmed.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
                    }
                  } else {
                    rawList = trimmed.split(',').map(s => s.trim()).filter(Boolean);
                  }
                }
                const relIds: number[] = rawList.map((entry: any) => {
                  if (!entry) return 0;
                  const entryId = typeof entry === 'object' ? (entry.id || entry.user_id) : entry;
                  return Number(entryId) || 0;
                }).filter(id => id > 0);

                const relUsers = rawList.map((entry: any) => {
                  const numId = typeof entry === 'object' ? Number(entry.id || entry.user_id || 0) : Number(entry || 0);
                  const found = effectiveUsers.find((u: any) => Number(u.id) === numId);
                  if (found) return found;
                  if (typeof entry === 'object' && (entry.full_name || entry.name)) {
                    return {
                      id: numId || entry.id,
                      full_name: entry.full_name || entry.name,
                      name: entry.full_name || entry.name,
                      avatar_url: entry.avatar_url || entry.avatar,
                      role_title: entry.job_title || entry.role
                    };
                  }
                  return { id: numId, full_name: `User #${numId}`, name: `User #${numId}` };
                });

                const availableUsersToAdd = effectiveUsers.filter((u: any) => 
                  !relIds.includes(Number(u.id)) &&
                  (u.full_name || u.name || '').toLowerCase().includes(watcherSearch.toLowerCase())
                );

                return (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--color-text-muted)', letterSpacing: '0.05em' }}>
                        {t('NGƯỜI LIÊN QUAN (THEO DÕI)')} ({relUsers.length})
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
                            zIndex: 1000,
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: 'var(--color-bg)', borderRadius: '6px', border: '1px solid var(--color-border-light)' }}>
                              <Search size={12} style={{ color: 'var(--color-text-muted)' }} />
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
                                    <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={20} />
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

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {relUsers.map((u: any) => (
                        <div key={u.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 8px 4px 10px', background: 'var(--color-bg-light)', border: '1px solid var(--color-border-light)', borderRadius: '12px' }}>
                          <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={20} />
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)' }}>{u.full_name || u.name}</span>
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
                              padding: '2px',
                              borderRadius: '50%'
                            }}
                            className="hover-danger"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      {relUsers.length === 0 && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {t('Chưa có người theo dõi nào. Gắn tag @tên trong bình luận hoặc bấm "+ Thêm" để thêm.')}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Unified Discussion & Activity Feed */}
            <div ref={feedContainerRef} style={{ marginTop: '0.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflow: 'hidden' }}>
              <ProcessFeed
                comments={localComments.filter((c: any) => !String(c.id).startsWith('sys-'))}
                historyLogs={localComments.filter((c: any) => String(c.id).startsWith('sys-'))}
                loadingComments={loadingComments}
                loadingHistory={loadingComments}
                currentUser={user}
                users={effectiveUsers || users}
                showAttachments={true}
                onAddComment={async (text, fileAttachments, parentId) => {
                  if (addCommentInFlightRef.current) return;
                  addCommentInFlightRef.current = true;
                  try {
                    const endpoint = getCommentsEndpoint(item.type, item.id);
                    if (!endpoint) {
                      const commentObj = {
                        id: Date.now(),
                        author: t('Tôi'),
                        user_name: t('Tôi'),
                        time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
                        text: text,
                        body: text,
                        attachments: fileAttachments || [],
                        parent_id: parentId || null,
                        created_at: new Date().toISOString()
                      };
                      setLocalComments([...localComments, commentObj]);
                      toast.success(t('Đăng bình luận thành công!'));
                      return;
                    }
                    await api.post(endpoint, {
                      body: text,
                      attachments: fileAttachments || [],
                      parent_id: parentId || null
                    });
                    toast.success(t('Thêm bình luận thành công'));
                    fetchComments();
                  } finally {
                    addCommentInFlightRef.current = false;
                  }
                }}
                onDeleteComment={async (commentId) => {
                  if (deleteCommentInFlightRef.current) return;
                  deleteCommentInFlightRef.current = true;
                  try {
                    const endpoint = getDeleteCommentEndpoint(item.type, Number(commentId));
                    if (!endpoint) {
                      setLocalComments(localComments.filter((c: any) => c.id !== commentId));
                      toast.success(t('Đã xóa bình luận'));
                      return;
                    }
                    await api.delete(endpoint);
                    toast.success(t('Đã xóa bình luận'));
                    fetchComments();
                  } catch (err: any) {
                    toast.error(err?.response?.data?.message || t('Lỗi khi xóa bình luận'));
                  } finally {
                    deleteCommentInFlightRef.current = false;
                  }
                }}
              />
            </div>
          </div>
        </div>


      {/* Lightbox Modal for attachments (images & PDF) */}
      <AttachmentLightboxModal
        isOpen={lightboxState.isOpen}
        onClose={() => setLightboxState(prev => ({ ...prev, isOpen: false }))}
        items={lightboxState.items}
        initialIndex={lightboxState.initialIndex}
        zIndex={2147483646}
      />

      <NoteDetailModal
        isOpen={!!activeNoteModal}
        onClose={() => setActiveNoteModal(null)}
        title={activeNoteModal?.title || t('Ghi chú / Mục đích sử dụng')}
        itemName={activeNoteModal?.itemName}
        notes={activeNoteModal?.notes || ''}
        zIndex={2147483646}
      />

      <QrImageModal
        isOpen={!!previewQrModalUrl}
        qrUrl={previewQrModalUrl}
        onClose={() => setPreviewQrModalUrl(null)}
        zIndex={2147483646}
      />

      <input 
        type="file" 
        ref={uncFileInputRef} 
        onChange={handleCommissionFileUpload} 
        accept="image/*,application/pdf" 
        style={{ display: 'none' }} 
      />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>,
    document.body
  );
}

