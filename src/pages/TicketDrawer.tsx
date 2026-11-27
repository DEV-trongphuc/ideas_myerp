import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, MessageSquare, Clock, AlertCircle, User, Paperclip, CheckCircle2,
  XCircle, Inbox, Image as ImageIcon, FileText, ExternalLink, Loader2, Lock,
  Trash2, Download, File, RotateCcw, ShieldAlert
} from 'lucide-react';
import { Avatar } from '../components/ui/Avatar';
import { useUIStore } from '../store/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { useTabActive } from '../contexts/TabActiveContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTenantConfig } from '../contexts/TenantConfigContext';
import { useTypedSetting } from '../contexts/SettingsBootstrapContext';
import api from '../api/axios';
import { createPortal } from 'react-dom';
import { StatRowSkeleton } from '../components/ui/Skeleton';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { CustomModal } from '../components/ui/CustomModal';
import { MentionInput } from '../components/ui/MentionInput';
import styles from './EntityDrawer.module.css';
import { pushOverlay } from '../utils/overlayStack';
import { ensureArray, extractArray } from '../utils/safeArray';
import { formatDateTimeVN, formatDateVN } from '../utils/dateUtils';
import { sanitizeHtml } from '../utils/sanitizeHtml';
import { isViewer, isManagement, isSystemAdmin } from '../utils/roleUtils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ticket: any;
  onUpdate?: (data: any) => void;
  onDelete?: (ticketId: number) => void;
  contacts?: any[];
  users?: any[];
  onOpenContact?: (contact: any) => void;
  zIndex?: number;
}

const PRIORITIES = [
  { id: 'low', label: 'Thấp', color: '#64748b', bg: '#f1f5f9' },
  { id: 'medium', label: 'Trung bình', color: '#334155', bg: '#f1f5f9' },
  { id: 'high', label: 'Cao', color: '#b45309', bg: '#fffbeb' },
  { id: 'urgent', label: 'Khẩn cấp', color: '#BD1D2D', bg: '#fef2f2' },
];

const STATUS_LABELS: Record<string, string> = {
  open: 'Mới tạo',
  in_progress: 'Đang xử lý',
  waiting: 'Chờ phản hồi',
  resolved: 'Đã xử lý',
  closed: 'Đã đóng',
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const FORBIDDEN_UPLOAD_EXT = /\.(php|phtml|phar|exe|bat|cmd|sh|ps1|msi|vbs|js|mjs|jsx|ts|tsx|html?|svg)$/i;
const SAFE_COMMENT_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z';

const DEFAULT_SLA_HOURS: Record<string, number> = {
  urgent: 4,
  high: 8,
  medium: 24,
  low: 48,
};

const DEFAULT_TICKET_SLA_SETTING = {
  sla_hours_by_priority: DEFAULT_SLA_HOURS,
};

function normalizeTicketStatus(status: unknown): 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed' {
  const s = String(status || 'open').trim().toLowerCase();
  if (!s || s === 'new') return 'open';
  if (s === 'in_progress' || s === 'waiting' || s === 'resolved' || s === 'closed') return s;
  return 'open';
}

function parseSafeDate(val: unknown): Date | null {
  if (val === null || val === undefined || val === '') return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  const trimmed = String(val).trim();
  if (!trimmed || trimmed === '0000-00-00' || trimmed === '0000-00-00 00:00:00') return null;
  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(/-/g, '/');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeMediaUrl(rawUrl: unknown): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^(javascript|vbscript):/i.test(trimmed)) return '';
  if (trimmed.toLowerCase().startsWith('data:')) {
    return /^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(trimmed) ? trimmed : '';
  }
  if (/\.svg(\?.*)?$/i.test(trimmed)) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:')) {
    return trimmed;
  }
  const apiBase = import.meta.env.VITE_API_URL || '/backend';
  let path = trimmed.replace(/^\/+/, '');
  if (path.startsWith('backend/')) {
    return `/${path}`;
  }
  if (path.startsWith('storage/uploads/')) {
    path = path.replace('storage/uploads/', 'uploads/');
  }
  return `${apiBase}/${path}`;
}

function cleanTicketBodyText(raw: unknown): string {
  return String(raw || '')
    .replace(/&amp;nbsp;/gi, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/(?:https?:\/\/[^\s<"'\)]+)?\/?uploads\/[^\s<"'\)]+/gi, '')
    .trim();
}

function hasMeaningfulCommentText(val: string): boolean {
  const plain = String(val || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
    .trim();
  return plain.length > 0;
}

function formatDurationCompact(msAbs: number): string {
  const totalMinutes = Math.max(1, Math.floor(msAbs / 60000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days} ngày ${hours} giờ`;
  if (hours > 0) return `${hours} giờ ${mins} phút`;
  return `${mins} phút`;
}

export const TicketDrawer: React.FC<Props> = ({
  isOpen,
  onClose,
  ticket,
  onUpdate,
  onDelete,
  contacts = [],
  users = [],
  onOpenContact,
  zIndex,
}) => {
  const effectivePanelZ = zIndex ?? 2147483625;
  const effectiveBackdropZ = effectivePanelZ - 5;
  const nestedOverlayZ = Math.min(2147483647, Math.max(2147483646, effectivePanelZ + 10));
  const isTabActive = useTabActive();

  const [isMobile, setIsMobile] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setIsClosing(false);
  }, [isOpen]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const addToast = useUIStore((s) => s.addToast);
  const { t } = useLanguage();
  const { user: currentUser } = useAuth();
  const { hasPermission } = useTenantConfig();
  const typedSlaSetting = useTypedSetting<any>('hrm.tickets_sla_and_routing', DEFAULT_TICKET_SLA_SETTING);

  const isUserViewer = isViewer(currentUser);
  const canManageRole =
    !isUserViewer &&
    (isSystemAdmin(currentUser) ||
      isManagement(currentUser) ||
      ['admin', 'superadmin', 'super_admin', 'manager', 'director'].includes(
        String(currentUser?.role || '').toLowerCase()
      ));

  const [formData, setFormData] = useState<any>({});
  const [comments, setComments] = useState<any[]>([]);

  const closeTimerRef = useRef<number | null>(null);
  const highlightTimersRef = useRef<number[]>([]);
  const prevBodyOverflowRef = useRef<string | null>(null);

  const clearHighlightTimers = useCallback(() => {
    highlightTimersRef.current.forEach((id) => window.clearTimeout(id));
    highlightTimersRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
      clearHighlightTimers();
    };
  }, [clearHighlightTimers]);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    clearHighlightTimers();
    const params = new URLSearchParams(window.location.search);
    if (params.has('highlight_comment_id') || params.has('comment_id')) {
      params.delete('highlight_comment_id');
      params.delete('comment_id');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
      );
    }
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
      setIsClosing(false);
    }, 220);
  }, [isClosing, onClose, clearHighlightTimers]);

  const [newComment, setNewComment] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<
    { name: string; url: string; size?: number; type?: string }[]
  >([]);
  const [uploadingCommentFile, setUploadingCommentFile] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement | null>(null);

  const [replyTo, setReplyTo] = useState<{ id: number; userName: string } | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resolvedContact, setResolvedContact] = useState<any>(null);
  const currentTicketIdRef = useRef<number | null>(null);

  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const commentsAbortRef = useRef<AbortController | null>(null);
  const contactAbortRef = useRef<AbortController | null>(null);
  const deleteCommentInFlightRef = useRef(false);
  const uploadCommentInFlightRef = useRef(false);
  const sendCommentInFlightRef = useRef(false);
  const ticketActionInFlightRef = useRef(false);
  const deleteTicketInFlightRef = useRef(false);

  const normalizedStatus = normalizeTicketStatus(formData?.status);

  useEffect(() => {
    if (!isTabActive || !isOpen || !ticket?.id || ['closed', 'resolved'].includes(normalizedStatus)) return;
    setNowMs(Date.now());
    const timer = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        setNowMs(Date.now());
      }
    }, 60000);
    return () => window.clearInterval(timer);
  }, [isTabActive, isOpen, ticket?.id, normalizedStatus]);

  const escapeHandlerRef = useRef<() => void>(() => {});
  escapeHandlerRef.current = () => {
    if (previewImage) {
      setPreviewImage(null);
      return;
    }
    if (commentToDelete !== null) {
      setCommentToDelete(null);
      return;
    }
    if (showRejectModal) {
      setShowRejectModal(false);
      setRejectReason('');
      return;
    }
    if (showDeleteModal) {
      setShowDeleteModal(false);
      return;
    }
    handleClose();
  };

  useEffect(() => {
    if (isOpen) {
      const unregister = pushOverlay(
        'ticket-drawer',
        () => escapeHandlerRef.current(),
        Math.max(2147483640, effectivePanelZ + 5)
      );
      return () => unregister();
    }
  }, [isOpen, effectivePanelZ]);

  const fetchComments = useCallback(async (targetId?: number) => {
    const tid = targetId ?? currentTicketIdRef.current ?? formData?.id ?? ticket?.id;
    if (!tid) return;
    if (commentsAbortRef.current) commentsAbortRef.current.abort();
    const controller = new AbortController();
    commentsAbortRef.current = controller;
    setLoading(true);
    try {
      const r = await api.get(`/tickets/${tid}/comments`, { signal: controller.signal });
      if (!controller.signal.aborted && currentTicketIdRef.current === tid) {
        setComments(ensureArray(r.data?.data));
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || err?.name === 'CanceledError' || err?.code === 'ERR_CANCELED') return;
      console.error('Failed to fetch ticket comments', err);
      if (currentTicketIdRef.current === tid) {
        setComments([]);
      }
    } finally {
      if (!controller.signal.aborted && currentTicketIdRef.current === tid) {
        setLoading(false);
      }
    }
  }, [formData?.id, ticket?.id]);

  useEffect(() => {
    if (!isOpen || comments.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const hcId = params.get('highlight_comment_id') || params.get('comment_id');
    if (!hcId) return;

    clearHighlightTimers();
    const timer1 = window.setTimeout(() => {
      const el = document.getElementById(`ticket-comment-${hcId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const bubble = (el.querySelector('[data-comment-bubble="1"]') as HTMLElement) || el;
        const origTransition = bubble.style.transition;
        const origBoxShadow = bubble.style.boxShadow;
        const origBg = bubble.style.backgroundColor;
        bubble.style.transition = 'all 0.4s ease';
        bubble.style.boxShadow = '0 0 0 2px #BD1D2D, 0 4px 12px rgba(189, 29, 45, 0.22)';
        bubble.style.backgroundColor = 'rgba(254, 242, 242, 0.9)';
        const timer2 = window.setTimeout(() => {
          bubble.style.boxShadow = origBoxShadow;
          bubble.style.backgroundColor = origBg;
          const timer3 = window.setTimeout(() => {
            bubble.style.transition = origTransition;
          }, 400);
          highlightTimersRef.current.push(timer3);
        }, 2800);
        highlightTimersRef.current.push(timer2);
      }
      params.delete('highlight_comment_id');
      params.delete('comment_id');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
      );
    }, 320);
    highlightTimersRef.current.push(timer1);

    return () => clearHighlightTimers();
  }, [isOpen, comments, clearHighlightTimers]);

  const handleDeleteComment = async (commentId: number) => {
    const tid = formData?.id || ticket?.id;
    if (!tid || isUserViewer || deleteCommentInFlightRef.current) return;
    deleteCommentInFlightRef.current = true;
    try {
      await api.delete(`/tickets/${tid}/comments/${commentId}`);
      addToast(t('Đã xóa bình luận'), 'success');
      fetchComments(tid);
    } catch (err: any) {
      addToast(t('Lỗi khi xóa bình luận: ') + (err?.response?.data?.message || err?.message || 'Unknown error'), 'error');
    } finally {
      deleteCommentInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (contactAbortRef.current) contactAbortRef.current.abort();
    if (isOpen && ticket?.id) {
      const controller = new AbortController();
      contactAbortRef.current = controller;
      currentTicketIdRef.current = ticket.id;
      setFormData(ticket);
      setComments([]);
      setNewComment('');
      setCommentAttachments([]);
      setReplyTo(null);
      setResolvedContact(null);
      setShowRejectModal(false);
      setRejectReason('');
      setShowDeleteModal(false);
      setPreviewImage(null);
      setCommentToDelete(null);
      fetchComments(ticket.id);

      const relContacts = ensureArray(ticket.related_contacts);
      const cid = ticket.contact_id || ticket.customer_id || (relContacts.length > 0 ? relContacts[0] : null);
      if (cid) {
        api.get(`/contacts/${cid}`, { signal: controller.signal }).then((res) => {
          if (!controller.signal.aborted && res.data?.success && res.data?.data && currentTicketIdRef.current === ticket.id) {
            setResolvedContact(res.data.data);
          }
        }).catch(() => {});
      } else if (ticket.customer_name && !String(ticket.customer_name).trim().toLowerCase().startsWith('hệ thống')) {
        api.get('/contacts', { params: { search: ticket.customer_name, limit: 5 }, signal: controller.signal }).then((res) => {
          if (controller.signal.aborted) return;
          const list = extractArray(res?.data);
          const matched = list.find((x: any) => {
            const fullName = String(x.full_name || '').trim().toLowerCase();
            const cName = x.name ? String(x.name).trim().toLowerCase() : '';
            const target = String(ticket.customer_name || '').trim().toLowerCase();
            return target && (fullName === target || cName === target);
          });
          if (matched && currentTicketIdRef.current === ticket.id) {
            setResolvedContact(matched);
          }
        }).catch(() => {});
      }
    } else if (!isOpen) {
      if (commentsAbortRef.current) commentsAbortRef.current.abort();
      clearHighlightTimers();
      currentTicketIdRef.current = null;
      setFormData({});
      setComments([]);
      setNewComment('');
      setCommentAttachments([]);
      setReplyTo(null);
      setResolvedContact(null);
      setShowRejectModal(false);
      setRejectReason('');
      setShowDeleteModal(false);
      setPreviewImage(null);
      setCommentToDelete(null);
    }
    return () => {
      if (contactAbortRef.current) contactAbortRef.current.abort();
      if (commentsAbortRef.current) commentsAbortRef.current.abort();
    };
  }, [isOpen, ticket?.id, fetchComments, clearHighlightTimers]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isOpen) {
      if (document.body.style.overflow !== 'hidden') {
        prevBodyOverflowRef.current = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
      } else {
        prevBodyOverflowRef.current = null;
      }
    } else if (prevBodyOverflowRef.current !== null) {
      document.body.style.overflow = prevBodyOverflowRef.current;
      prevBodyOverflowRef.current = null;
    }
    return () => {
      if (prevBodyOverflowRef.current !== null) {
        document.body.style.overflow = prevBodyOverflowRef.current;
        prevBodyOverflowRef.current = null;
      }
    };
  }, [isOpen]);

  const handleUploadCommentFiles = async (files: FileList | File[]) => {
    if (isUserViewer || !files || files.length === 0 || uploadCommentInFlightRef.current) return;
    const targetTicketId = currentTicketIdRef.current;
    if (!targetTicketId) return;

    const fileList = Array.from(files);
    const validFiles: File[] = [];
    for (const file of fileList) {
      if (FORBIDDEN_UPLOAD_EXT.test(file.name)) {
        addToast(`Định dạng tệp "${file.name}" bị chặn vì lý do bảo mật`, 'error');
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        addToast(`Tệp "${file.name}" vượt quá giới hạn 50MB`, 'error');
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) {
      if (commentFileInputRef.current) commentFileInputRef.current.value = '';
      return;
    }

    uploadCommentInFlightRef.current = true;
    setUploadingCommentFile(true);
    let failedCount = 0;
    try {
      for (const file of validFiles) {
        if (currentTicketIdRef.current !== targetTicketId) break;
        try {
          const fd = new FormData();
          fd.append('file', file);
          const res = await api.post('/upload', fd);
          if (currentTicketIdRef.current !== targetTicketId) break;
          const rawUrl = res.data?.data?.url || res.data?.url;
          const safeUrl = normalizeMediaUrl(rawUrl);
          if (safeUrl) {
            setCommentAttachments((prev) => [
              ...prev,
              {
                name: file.name,
                url: safeUrl,
                size: file.size,
                type: file.type,
              },
            ]);
          } else {
            failedCount++;
          }
        } catch {
          failedCount++;
        }
      }
      if (failedCount > 0 && currentTicketIdRef.current === targetTicketId) {
        addToast(`Không thể tải lên ${failedCount} tệp đính kèm`, 'error');
      }
    } finally {
      uploadCommentInFlightRef.current = false;
      setUploadingCommentFile(false);
      if (commentFileInputRef.current) commentFileInputRef.current.value = '';
    }
  };

  const handleCommentPaste = (e: React.ClipboardEvent) => {
    if (isUserViewer) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    const filesToUpload: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) filesToUpload.push(file);
      }
    }
    if (filesToUpload.length > 0) {
      e.preventDefault();
      handleUploadCommentFiles(filesToUpload);
    }
  };

  const handleSend = async () => {
    const tid = formData?.id || ticket?.id;
    if (
      isUserViewer ||
      !tid ||
      (!hasMeaningfulCommentText(newComment) && commentAttachments.length === 0) ||
      isSubmitting ||
      sendCommentInFlightRef.current
    ) {
      return;
    }
    sendCommentInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const r = await api.post(`/tickets/${tid}/comments`, {
        body: hasMeaningfulCommentText(newComment) ? newComment.trim() : 'Đã gửi tệp đính kèm',
        parent_id: replyTo ? replyTo.id : null,
        attachments: commentAttachments,
      });
      if (currentTicketIdRef.current === tid) {
        setComments(ensureArray(r.data?.data));
        setNewComment('');
        setCommentAttachments([]);
        setReplyTo(null);
      }
      addToast('Đã thêm ghi chú', 'success');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi lưu ghi chú', 'error');
    } finally {
      sendCommentInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleUpdateField = async (patch: Record<string, any>, successMsg: string) => {
    const tid = formData?.id || ticket?.id;
    if (!tid || isUserViewer || isSubmitting || ticketActionInFlightRef.current) return;
    ticketActionInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const res = await api.put(`/tickets/${tid}`, patch);
      const serverRow = res.data?.data && typeof res.data.data === 'object' ? res.data.data : {};
      const updated = { ...formData, ...patch, ...serverRow };
      if (currentTicketIdRef.current === tid) {
        setFormData(updated);
      }
      onUpdate?.(updated);
      window.dispatchEvent(new CustomEvent('ticket-updated', { detail: { id: tid, patch: updated } }));
      addToast(successMsg, 'success');
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Không thể cập nhật ticket', 'error');
    } finally {
      ticketActionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleAcceptTicket = () => handleUpdateField({ status: 'in_progress' }, 'Đã tiếp nhận ticket và gửi thông báo cho người tạo');

  const handleResolveTicket = () =>
    handleUpdateField({ status: 'closed', resolution_status: 'resolved' }, 'Đã hoàn thành và đóng ticket');

  const handleReopenTicket = () =>
    handleUpdateField(
      { status: 'in_progress', resolution_status: null, rejection_reason: null },
      'Đã mở lại ticket'
    );

  const handleDeleteTicket = async () => {
    const tid = formData?.id || ticket?.id;
    if (!tid || isUserViewer || isDeleting || deleteTicketInFlightRef.current) return;
    deleteTicketInFlightRef.current = true;
    setIsDeleting(true);
    try {
      await api.delete(`/tickets/${tid}`);
      addToast('Đã xóa ticket thành công', 'success');
      window.dispatchEvent(new CustomEvent('ticket-updated', { detail: { id: tid, deleted: true } }));
      setShowDeleteModal(false);
      onDelete?.(tid);
      onClose();
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi xóa ticket', 'error');
    } finally {
      deleteTicketInFlightRef.current = false;
      setIsDeleting(false);
    }
  };

  const handleRejectTicket = async () => {
    const tid = formData?.id || ticket?.id;
    const reason = rejectReason.trim();
    if (!reason || isUserViewer || isSubmitting || !tid || ticketActionInFlightRef.current) return;
    ticketActionInFlightRef.current = true;
    setIsSubmitting(true);
    try {
      const payload = { status: 'closed', resolution_status: 'rejected', rejection_reason: reason };
      const res = await api.put(`/tickets/${tid}`, payload);
      const serverRow = res.data?.data && typeof res.data.data === 'object' ? res.data.data : {};
      const updated = { ...formData, ...payload, ...serverRow };

      if (currentTicketIdRef.current === tid) {
        setFormData(updated);
      }
      onUpdate?.(updated);
      window.dispatchEvent(new CustomEvent('ticket-updated', { detail: { id: tid, patch: updated } }));
      setShowRejectModal(false);
      setRejectReason('');
      addToast('Đã từ chối và đóng ticket', 'success');

      try {
        await api.post(`/tickets/${tid}/comments`, {
          body: `[Từ chối Hỗ trợ]: ${reason}`,
        });
        if (currentTicketIdRef.current === tid) {
          fetchComments(tid);
        }
      } catch {
        // Bỏ qua lỗi ghi bình luận log để không báo lỗi giả sau khi đóng ticket thành công
      }
    } catch (err: any) {
      addToast(err?.response?.data?.message || 'Lỗi khi từ chối ticket', 'error');
    } finally {
      ticketActionInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  const parseAttachments = useCallback((data: any) => {
    const images: { label: string; url: string; size?: number; type?: string }[] = [];
    const files: { label: string; url: string; size?: number; type?: string }[] = [];
    if (!data) return { images, files };

    const addMediaItem = (rawUrl: unknown, rawLabel?: string, size?: number, type?: string) => {
      const url = normalizeMediaUrl(rawUrl);
      if (!url) return;
      const label = rawLabel || url.split('/').pop() || 'Tệp đính kèm';
      const isImg =
        /\.(jpeg|jpg|png|gif|webp)(\?.*)?$/i.test(url) ||
        /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(url) ||
        (type && /^image\/(png|jpeg|jpg|gif|webp)$/i.test(String(type))) ||
        url.includes('/uploads/img_') ||
        (url.includes('/uploads/tenant_') && /\.(jpeg|jpg|png|gif|webp)/i.test(url));

      if (isImg) {
        if (!images.some((i) => i.url === url)) {
          images.push({ label, url, size, type });
        }
      } else if (!files.some((f) => f.url === url)) {
        files.push({ label, url, size, type });
      }
    };

    let rawAtt = data.attachments;
    if (typeof rawAtt === 'string') {
      try {
        if (rawAtt.trim().startsWith('[') || rawAtt.trim().startsWith('{')) {
          rawAtt = JSON.parse(rawAtt);
        }
      } catch {
        rawAtt = [];
      }
    }
    if (Array.isArray(rawAtt)) {
      rawAtt.forEach((item: any) => {
        const url = item?.url || (typeof item === 'string' ? item : '');
        const label = item?.name || item?.label;
        addMediaItem(url, label, item?.size, item?.type);
      });
    }

    const text = String(data.description || data.body || '');
    const mdImgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = mdImgRegex.exec(text)) !== null) {
      addMediaItem(m[2], m[1] || 'Ảnh đính kèm');
    }

    const mdLinkRegex = /(!)?\[([^\]]*)\]\(([^)]+)\)/g;
    while ((m = mdLinkRegex.exec(text)) !== null) {
      if (m[1] === '!') continue;
      addMediaItem(m[3], m[2] || 'Tệp đính kèm');
    }

    const rawUrlRegex = /(?:https?:\/\/[^\s<"'\)]+)?\/?uploads\/[^\s<"'\)]+/gi;
    while ((m = rawUrlRegex.exec(text)) !== null) {
      addMediaItem(m[0]);
    }

    return { images, files };
  }, []);

  const slaHoursMap = useMemo(() => {
    const sla = typedSlaSetting?.sla_hours_by_priority || typedSlaSetting?.sla_hours || typedSlaSetting || {};
    return {
      urgent: Number(sla?.urgent ?? sla?.urgent_hours ?? DEFAULT_SLA_HOURS.urgent) || DEFAULT_SLA_HOURS.urgent,
      high: Number(sla?.high ?? sla?.high_hours ?? DEFAULT_SLA_HOURS.high) || DEFAULT_SLA_HOURS.high,
      medium: Number(sla?.medium ?? sla?.medium_hours ?? DEFAULT_SLA_HOURS.medium) || DEFAULT_SLA_HOURS.medium,
      low: Number(sla?.low ?? sla?.low_hours ?? DEFAULT_SLA_HOURS.low) || DEFAULT_SLA_HOURS.low,
    };
  }, [typedSlaSetting]);

  const slaMeta = useMemo(() => {
    const dueDate = parseSafeDate(formData?.due_date);
    if (!dueDate) {
      return {
        dateLabel: 'Không giới hạn',
        statusText: 'Chưa thiết lập SLA',
        toneColor: '#64748b',
        toneBg: '#f8fafc',
      };
    }
    const dateLabel = formatDateVN(dueDate);
    if (normalizedStatus === 'closed' || normalizedStatus === 'resolved') {
      const resolvedDate = parseSafeDate(formData?.resolved_at);
      const late = resolvedDate ? resolvedDate.getTime() > dueDate.getTime() : false;
      return {
        dateLabel: formatDateTimeVN(dueDate),
        statusText: late ? 'Đã hoàn tất (trễ SLA)' : 'Đã hoàn tất đúng hạn SLA',
        toneColor: late ? '#b45309' : '#059669',
        toneBg: late ? '#fffbeb' : '#ecfdf5',
      };
    }
    const diffMs = dueDate.getTime() - nowMs;
    if (diffMs < 0) {
      return {
        dateLabel: formatDateTimeVN(dueDate),
        statusText: `Quá hạn ${formatDurationCompact(Math.abs(diffMs))}`,
        toneColor: '#BD1D2D',
        toneBg: '#fef2f2',
      };
    }
    if (diffMs <= 4 * 3600 * 1000) {
      return {
        dateLabel: formatDateTimeVN(dueDate),
        statusText: `Sắp đến hạn · còn ${formatDurationCompact(diffMs)}`,
        toneColor: '#b45309',
        toneBg: '#fffbeb',
      };
    }
    return {
      dateLabel: formatDateTimeVN(dueDate),
      statusText: `Còn ${formatDurationCompact(diffMs)}`,
      toneColor: '#0f172a',
      toneBg: '#f8fafc',
    };
  }, [formData?.due_date, formData?.resolved_at, normalizedStatus, nowMs]);

  if (typeof document === 'undefined') return null;

  const attachedMedia = parseAttachments(formData);
  const cleanDescription = cleanTicketBodyText(formData.description);

  const isCreator = Boolean(
    currentUser && formData?.created_by && Number(formData.created_by) === Number(currentUser.id)
  );
  const isAssignee = Boolean(
    currentUser && formData?.assignee_id && Number(formData.assignee_id) === Number(currentUser.id)
  );
  const canManageTicket = !isUserViewer && (canManageRole || isCreator || isAssignee);
  const canEditMeta =
    !isUserViewer &&
    (canManageRole || (hasPermission('tickets', 'write') && (isCreator || isAssignee)));
  const canAcceptTicket = !isUserViewer && canManageRole && normalizedStatus === 'open';
  const canResolveTicket =
    canManageTicket && normalizedStatus !== 'closed' && normalizedStatus !== 'resolved';
  const canRejectTicket =
    !isUserViewer &&
    canManageRole &&
    ['open', 'in_progress', 'waiting'].includes(normalizedStatus);
  const canReopenTicket =
    !isUserViewer &&
    ['closed', 'resolved'].includes(normalizedStatus) &&
    (formData.resolution_status === 'rejected' ? canManageRole : canManageTicket);
  const canDeleteTicket =
    !isUserViewer && (canManageRole || (isCreator && hasPermission('tickets', 'delete')));
  const canComment = !isUserViewer && normalizedStatus !== 'closed';

  const safeUsers = ensureArray(users);
  const safeContacts = ensureArray(contacts);
  const safeRelatedContacts = ensureArray(formData.related_contacts);

  const matchedAssignee = safeUsers.find((u: any) => Number(u.id) === Number(formData.assignee_id));
  const assigneeName = formData.assignee_name || matchedAssignee?.full_name || 'Chưa phân công';
  const assigneeAvatar = formData.assignee_avatar || matchedAssignee?.avatar_url;

  const primaryContactId =
    formData.contact_id ||
    formData.customer_id ||
    (safeRelatedContacts.length > 0 ? safeRelatedContacts[0] : null);
  const trimmedCustomerName = String(formData.customer_name || '').trim();
  const isSystemTicket =
    !primaryContactId &&
    !resolvedContact &&
    (!trimmedCustomerName || trimmedCustomerName.toLowerCase().startsWith('hệ thống'));

  const currentPriorityObj =
    PRIORITIES.find((p) => p.id === (formData.priority || 'medium')) || PRIORITIES[1];

  const cardSurfaceStyle: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '14px',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
  };

  const renderStatusBadge = () => {
    if (normalizedStatus === 'open') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.7rem',
            background: '#fef2f2',
            color: '#BD1D2D',
            border: '1px solid rgba(189, 29, 45, 0.16)',
          }}
        >
          <Inbox size={11} /> Mới tạo
        </span>
      );
    }
    if (normalizedStatus === 'in_progress') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.7rem',
            background: '#fffbeb',
            color: '#b45309',
            border: '1px solid rgba(217, 119, 6, 0.2)',
          }}
        >
          <Clock size={11} /> Đang xử lý
        </span>
      );
    }
    if (normalizedStatus === 'waiting') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.7rem',
            background: '#f1f5f9',
            color: '#334155',
            border: '1px solid #cbd5e1',
          }}
        >
          <Clock size={11} /> Chờ phản hồi
        </span>
      );
    }
    if (formData.resolution_status === 'rejected') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            borderRadius: '6px',
            fontWeight: 700,
            fontSize: '0.7rem',
            background: '#fef2f2',
            color: '#dc2626',
            border: '1px solid rgba(220, 38, 38, 0.2)',
          }}
        >
          <XCircle size={11} /> Từ chối
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          borderRadius: '6px',
          fontWeight: 700,
          fontSize: '0.7rem',
          background: '#ecfdf5',
          color: '#059669',
          border: '1px solid rgba(16, 185, 129, 0.2)',
        }}
      >
        <CheckCircle2 size={11} /> {normalizedStatus === 'resolved' ? 'Đã xử lý' : 'Đã đóng'}
      </span>
    );
  };

  const renderCommentText = (cleanText: string) => {
    if (!cleanText) return null;
    if (/<(span|br|p|div|b|strong|i|em|u|ul|ol|li|a)\b/i.test(cleanText)) {
      return (
        <div
          className="ticket-comment-html"
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(cleanText) }}
        />
      );
    }
    return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{cleanText}</div>;
  };

  const safePreviewImage = previewImage ? normalizeMediaUrl(previewImage) : '';

  return createPortal(
    <AnimatePresence>
      {isOpen && !isClosing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: effectiveBackdropZ, display: 'flex', justifyContent: 'flex-end' }}>
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as any }}
            onClick={handleClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: effectiveBackdropZ,
              '--drawer-backdrop-z': effectiveBackdropZ,
              background: 'rgba(15, 23, 42, 0.45)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            } as any}
          />

          <motion.div
            className="drawer-sheet drawer-panel"
            initial={isMobile ? { y: '100%' } : { opacity: 0, x: '250px' }}
            animate={{ y: 0, x: 0, opacity: 1 }}
            exit={isMobile ? { y: '60%', opacity: 0 } : { x: '60%', opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] as any }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: 0,
              bottom: 0,
              left: isMobile ? 0 : 'var(--sidebar-width, 220px)',
              right: 0,
              backgroundColor: '#f8fafc',
              boxShadow: '-10px 0 30px rgba(15, 23, 42, 0.14)',
              display: 'flex',
              flexDirection: 'column',
              zIndex: effectivePanelZ,
              '--drawer-panel-z': effectivePanelZ,
              overflow: 'hidden',
            } as React.CSSProperties}
          >
            <div
              className={styles.header}
              style={{
                padding: '1rem 1.5rem',
                background: '#ffffff',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    background: currentPriorityObj.bg,
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: currentPriorityObj.color,
                    flexShrink: 0,
                  }}
                >
                  <AlertCircle size={20} />
                </div>

                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h2
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 800,
                        color: '#0f172a',
                        margin: 0,
                        lineHeight: 1.3,
                      }}
                    >
                      {formData.subject || 'Chi tiết Ticket'}
                    </h2>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          color: '#64748b',
                          background: '#f1f5f9',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        #{formData.id}
                      </span>

                      <span
                        style={{
                          background: currentPriorityObj.bg,
                          color: currentPriorityObj.color,
                          border: '1px solid #e2e8f0',
                          fontWeight: 700,
                          fontSize: '0.7rem',
                          padding: '2px 8px',
                          borderRadius: '6px',
                        }}
                      >
                        {currentPriorityObj.label}
                      </span>

                      {renderStatusBadge()}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      marginTop: '4px',
                      fontSize: '0.75rem',
                      color: '#64748b',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontVariantNumeric: 'tabular-nums' }}>
                      <Clock size={12} style={{ color: '#BD1D2D' }} />
                      Mở lúc: {formatDateTimeVN(formData.created_at)}
                    </span>
                    {formData.category && (
                      <span style={{ padding: '1px 7px', borderRadius: '4px', background: '#f1f5f9', color: '#334155', fontWeight: 600 }}>
                        {formData.category}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={styles.headerActions}
                style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}
              >
                {canAcceptTicket && (
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={handleAcceptTicket}
                    disabled={isSubmitting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 700,
                      borderRadius: '8px',
                      background: '#BD1D2D',
                      borderColor: '#BD1D2D',
                    }}
                  >
                    {isSubmitting ? <Loader2 size={14} className="spin" /> : <Inbox size={14} />}
                    Tiếp nhận Ticket
                  </button>
                )}

                {canResolveTicket && (
                  <button
                    type="button"
                    className="btn success sm"
                    onClick={handleResolveTicket}
                    disabled={isSubmitting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: '#10b981',
                      color: '#fff',
                      fontWeight: 700,
                      border: 'none',
                      borderRadius: '8px',
                    }}
                  >
                    {isSubmitting ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                    Hoàn thành & Đóng
                  </button>
                )}

                {canRejectTicket && (
                  <button
                    type="button"
                    className="btn danger sm outline"
                    onClick={() => setShowRejectModal(true)}
                    disabled={isSubmitting}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 700,
                      borderRadius: '8px',
                    }}
                  >
                    <XCircle size={14} />
                    Từ chối & Đóng
                  </button>
                )}

                {canReopenTicket && (
                  <button
                    type="button"
                    className="btn secondary sm"
                    onClick={handleReopenTicket}
                    disabled={isSubmitting}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, borderRadius: '8px' }}
                    title="Mở lại Ticket để tiếp tục xử lý"
                  >
                    {isSubmitting ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
                    Mở lại Ticket
                  </button>
                )}

                {canDeleteTicket && (
                  <button
                    type="button"
                    className="btn danger sm outline"
                    onClick={() => setShowDeleteModal(true)}
                    disabled={isSubmitting || isDeleting}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '8px', padding: '6px 10px' }}
                    title="Xóa Ticket"
                  >
                    <Trash2 size={15} />
                  </button>
                )}

                <button
                  type="button"
                  className={styles.closeBtn}
                  onClick={handleClose}
                  style={{ borderRadius: '8px', padding: '6px', cursor: 'pointer' }}
                  aria-label="Đóng"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div
              className={styles.drawerBody}
              style={{
                background: '#f8fafc',
                display: 'flex',
                flex: 1,
                overflow: 'hidden',
                flexDirection: isMobile ? 'column' : 'row',
              }}
            >
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRight: isMobile ? 'none' : '1px solid #e2e8f0',
                  borderBottom: isMobile ? '1px dashed #e2e8f0' : 'none',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    overflow: 'auto',
                    padding: isMobile ? '0.75rem 0.75rem 100px 0.75rem' : '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.15rem',
                  }}
                >
                  {formData.resolution_status === 'rejected' && formData.rejection_reason && (
                    <div
                      style={{
                        background: '#fef2f2',
                        border: '1px solid rgba(189, 29, 45, 0.25)',
                        borderRadius: '14px',
                        padding: '0.875rem 1rem',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                      }}
                    >
                      <ShieldAlert size={18} style={{ color: '#BD1D2D', flexShrink: 0, marginTop: '2px' }} />
                      <div>
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.8rem', color: '#BD1D2D', textTransform: 'uppercase' }}>
                          Lý do từ chối hỗ trợ
                        </p>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#0f172a', whiteSpace: 'pre-wrap' }}>
                          {formData.rejection_reason}
                        </p>
                      </div>
                    </div>
                  )}

                  <h4
                    style={{
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <MessageSquare size={15} style={{ color: '#BD1D2D' }} /> Nhật ký trao đổi ({comments.length})
                  </h4>

                  {loading ? (
                    <div style={{ padding: '1rem 0' }}>
                      <StatRowSkeleton />
                    </div>
                  ) : comments.length === 0 ? (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '2.5rem',
                        color: '#64748b',
                        background: '#ffffff',
                        borderRadius: '16px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                      }}
                    >
                      <MessageSquare size={32} style={{ marginBottom: '0.75rem', opacity: 0.35, color: '#64748b' }} />
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Chưa có ghi chú nào. Hãy bắt đầu thảo luận!</span>
                    </div>
                  ) : (
                    (() => {
                      const commentIds = new Set(comments.map((c: any) => Number(c.id)));
                      const rootComments = comments.filter(
                        (c: any) => !c.parent_id || !commentIds.has(Number(c.parent_id))
                      );
                      const getReplies = (parentId: number) =>
                        comments
                          .filter((c: any) => Number(c.parent_id) === Number(parentId))
                          .sort((a: any, b: any) => {
                            const ta = parseSafeDate(a.created_at || a.time)?.getTime() || 0;
                            const tb = parseSafeDate(b.created_at || b.time)?.getTime() || 0;
                            return ta - tb;
                          });

                      const renderSingleComment = (msg: any, isReply: boolean = false, isOrphan: boolean = false) => {
                        const isSelf = Boolean(currentUser && Number(msg.user_id) === Number(currentUser.id));
                        const cAtt = parseAttachments(msg);
                        const cleanCommentText = cleanTicketBodyText(msg.body || msg.text || '');
                        const isCommentAuthor = Boolean(currentUser?.id && Number(currentUser.id) === Number(msg.user_id));
                        const canDeleteComment = !isUserViewer && (canManageRole || isCommentAuthor);

                        return (
                          <div
                            key={msg.id}
                            id={`ticket-comment-${msg.id}`}
                            style={{
                              display: 'flex',
                              gap: '0.75rem',
                              flexDirection: isSelf ? 'row-reverse' : 'row',
                              alignSelf: isSelf ? 'flex-end' : 'flex-start',
                              width: '100%',
                              marginTop: isReply ? '4px' : '0',
                            }}
                          >
                            <Avatar name={msg.user_name || msg.user || 'User'} src={msg.avatar_url} size={isReply ? 26 : 32} />
                            <div
                              style={{
                                maxWidth: '85%',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: isSelf ? 'flex-end' : 'flex-start',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  marginBottom: '4px',
                                  flexDirection: isSelf ? 'row-reverse' : 'row',
                                }}
                              >
                                <span style={{ fontSize: isReply ? '0.75rem' : '0.85rem', fontWeight: 700, color: '#0f172a' }}>
                                  {msg.user_name || msg.user || 'Thành viên'}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>
                                  {formatDateTimeVN(msg.created_at || msg.time, '')}
                                </span>
                              </div>
                              {isOrphan && (
                                <span style={{ fontSize: '0.7rem', color: '#64748b', fontStyle: 'italic', marginBottom: '3px' }}>
                                  Phản hồi bình luận trước (đã xóa)
                                </span>
                              )}
                              <div
                                data-comment-bubble="1"
                                style={{
                                  padding: isReply ? '0.625rem 0.95rem' : '0.8rem 1.1rem',
                                  borderRadius: '14px',
                                  borderTopLeftRadius: isSelf ? '14px' : '4px',
                                  borderTopRightRadius: isSelf ? '4px' : '14px',
                                  background: isSelf
                                    ? 'rgba(189, 29, 45, 0.06)'
                                    : msg.is_internal
                                    ? '#fffbeb'
                                    : '#ffffff',
                                  border: isSelf ? '1px solid rgba(189, 29, 45, 0.18)' : '1px solid #e2e8f0',
                                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                                  color: '#0f172a',
                                  fontSize: isReply ? '0.84rem' : '0.9rem',
                                  lineHeight: 1.5,
                                  wordBreak: 'break-word',
                                }}
                              >
                                {renderCommentText(cleanCommentText)}

                                {cAtt.images.length > 0 && (
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
                                      gap: '6px',
                                      marginTop: cleanCommentText ? '8px' : '0',
                                    }}
                                  >
                                    {cAtt.images.map((img, idx) => (
                                      <div
                                        key={idx}
                                        onClick={() => setPreviewImage(img.url)}
                                        style={{
                                          borderRadius: '8px',
                                          overflow: 'hidden',
                                          border: '1px solid #e2e8f0',
                                          aspectRatio: '1',
                                          cursor: 'pointer',
                                          background: '#f8fafc',
                                        }}
                                      >
                                        <img src={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {cAtt.files.length > 0 && (
                                  <div
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '4px',
                                      marginTop: cleanCommentText || cAtt.images.length > 0 ? '8px' : '0',
                                    }}
                                  >
                                    {cAtt.files.map((f, idx) => (
                                      <a
                                        key={idx}
                                        href={f.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '6px',
                                          padding: '5px 8px',
                                          borderRadius: '8px',
                                          background: '#f8fafc',
                                          border: '1px solid #e2e8f0',
                                          fontSize: '0.75rem',
                                          color: '#BD1D2D',
                                          textDecoration: 'none',
                                          fontWeight: 600,
                                        }}
                                      >
                                        <Download size={12} />
                                        <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {f.label}
                                        </span>
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {((!isReply && canComment) || canDeleteComment) && (
                                <div style={{ display: 'flex', gap: '10px', flexDirection: isSelf ? 'row-reverse' : 'row', marginTop: '4px' }}>
                                  {!isReply && canComment && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setReplyTo({
                                          id: Number(msg.id),
                                          userName: msg.user_name || msg.user || 'Đồng nghiệp',
                                        })
                                      }
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#BD1D2D',
                                        fontSize: '0.72rem',
                                        padding: 0,
                                        cursor: 'pointer',
                                        fontWeight: 700,
                                      }}
                                    >
                                      Phản hồi
                                    </button>
                                  )}
                                  {canDeleteComment && (
                                    <button
                                      type="button"
                                      onClick={() => setCommentToDelete(Number(msg.id))}
                                      style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: '#dc2626',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        cursor: 'pointer',
                                        padding: 0,
                                      }}
                                      title={t('Xóa bình luận')}
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      };

                      return rootComments.map((rootComment: any) => {
                        const replies = getReplies(rootComment.id);
                        const isOrphan = Boolean(rootComment.parent_id && !commentIds.has(Number(rootComment.parent_id)));
                        const isSelfRoot = Boolean(currentUser && Number(rootComment.user_id) === Number(currentUser.id));
                        return (
                          <div key={rootComment.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {renderSingleComment(rootComment, false, isOrphan)}
                            {replies.length > 0 && (
                              <div
                                style={{
                                  marginLeft: isSelfRoot ? '0' : '2.5rem',
                                  marginRight: isSelfRoot ? '2.5rem' : '0',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px',
                                  borderLeft: isSelfRoot ? 'none' : '2px solid #e2e8f0',
                                  borderRight: isSelfRoot ? '2px solid #e2e8f0' : 'none',
                                  paddingLeft: isSelfRoot ? '0' : '12px',
                                  paddingRight: isSelfRoot ? '12px' : '0',
                                  marginTop: '4px',
                                }}
                              >
                                {replies.map((reply: any) => renderSingleComment(reply, true, false))}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()
                  )}
                </div>

                <input
                  type="file"
                  ref={commentFileInputRef}
                  multiple
                  accept={SAFE_COMMENT_ACCEPT}
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files && handleUploadCommentFiles(e.target.files)}
                />

                {normalizedStatus === 'closed' ? (
                  <div
                    style={{
                      padding: '1rem 1.25rem',
                      background: '#ffffff',
                      borderTop: '1px solid #e2e8f0',
                      textAlign: 'center',
                      color: '#64748b',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    <Lock size={15} style={{ display: 'inline-block', marginRight: '6px', verticalAlign: 'middle', color: '#64748b' }} />
                    Ticket đã đóng, không thể thêm phản hồi hoặc cập nhật.
                  </div>
                ) : isUserViewer ? (
                  <div
                    style={{
                      padding: '1rem 1.25rem',
                      background: '#ffffff',
                      borderTop: '1px solid #e2e8f0',
                      textAlign: 'center',
                      color: '#64748b',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    <Lock size={15} style={{ display: 'inline-block', marginRight: '6px', verticalAlign: 'middle', color: '#64748b' }} />
                    Tài khoản chỉ xem không có quyền bình luận hoặc chỉnh sửa Ticket.
                  </div>
                ) : (
                  <div
                    style={{ padding: '1rem 1.25rem', background: '#ffffff', borderTop: '1px solid #e2e8f0' }}
                    onPaste={handleCommentPaste}
                  >
                    {replyTo && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: '#fef2f2',
                          border: '1px solid rgba(189, 29, 45, 0.2)',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          fontSize: '0.74rem',
                          color: '#BD1D2D',
                          fontWeight: 700,
                          marginBottom: '8px',
                        }}
                      >
                        <span>Đang trả lời {replyTo.userName}</span>
                        <button
                          type="button"
                          onClick={() => setReplyTo(null)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#BD1D2D',
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            padding: '0 4px',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    )}

                    {commentAttachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                        {commentAttachments.map((att, idx) => {
                          const safeUrl = normalizeMediaUrl(att.url);
                          if (!safeUrl) return null;
                          const isImg =
                            /\.(jpeg|jpg|png|gif|webp)(\?.*)?$/i.test(safeUrl) ||
                            (att.type && /^image\/(png|jpeg|jpg|gif|webp)$/i.test(att.type));
                          return (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '4px 8px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                              }}
                            >
                              {isImg ? (
                                <img
                                  src={safeUrl}
                                  alt={att.name}
                                  style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }}
                                />
                              ) : (
                                <FileText size={14} style={{ color: '#BD1D2D' }} />
                              )}
                              <span
                                style={{
                                  maxWidth: '140px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontWeight: 600,
                                  color: '#0f172a',
                                }}
                              >
                                {att.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => setCommentAttachments((prev) => prev.filter((_, i) => i !== idx))}
                                style={{
                                  border: 'none',
                                  background: 'transparent',
                                  cursor: 'pointer',
                                  color: '#dc2626',
                                  display: 'flex',
                                  alignItems: 'center',
                                  padding: '1px',
                                }}
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <MentionInput
                      value={newComment}
                      onChange={(e: any) => setNewComment(e?.target?.value ?? (typeof e === 'string' ? e : ''))}
                      onSubmitShortcut={handleSend}
                      onImagePaste={(file) => handleUploadCommentFiles([file])}
                      onFilePaste={(file) => handleUploadCommentFiles([file])}
                      users={safeUsers}
                      disabled={isSubmitting}
                      placeholder="Thêm ghi chú, gõ @ để nhắc đồng nghiệp... (Ctrl+Enter để gửi, Ctrl+V dán ảnh)"
                      rows={3}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                      <button
                        className="btn outline sm"
                        type="button"
                        onClick={() => commentFileInputRef.current?.click()}
                        disabled={uploadingCommentFile || isSubmitting}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '8px', borderColor: '#e2e8f0', color: '#334155' }}
                      >
                        {uploadingCommentFile ? <Loader2 size={14} className="spin" /> : <Paperclip size={14} />}
                        Đính kèm tệp
                      </button>

                      <button
                        type="button"
                        className="btn primary sm"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: '#BD1D2D',
                          borderColor: '#BD1D2D',
                          borderRadius: '8px',
                          fontWeight: 700,
                        }}
                        onClick={handleSend}
                        disabled={
                          isSubmitting ||
                          uploadingCommentFile ||
                          (!hasMeaningfulCommentText(newComment) && commentAttachments.length === 0)
                        }
                      >
                        {isSubmitting ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                        {isSubmitting ? 'Đang gửi...' : 'Gửi bình luận'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div
                style={{
                  width: isMobile ? '100%' : '340px',
                  background: '#ffffff',
                  padding: isMobile ? '0.75rem 0.75rem 100px 0.75rem' : '1.25rem',
                  overflow: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.15rem',
                  flexShrink: 0,
                }}
              >
                <div>
                  <h4
                    style={{
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Điều phối & Thuộc tính
                  </h4>
                  <div style={{ ...cardSurfaceStyle, padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={assigneeName} src={assigneeAvatar} size={36} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#0f172a', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {assigneeName}
                        </p>
                        <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0 }}>Phụ trách xử lý Ticket</p>
                      </div>
                    </div>

                    {canEditMeta && normalizedStatus !== 'closed' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', paddingTop: '6px', borderTop: '1px solid #f1f5f9' }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          Trạng thái
                          <select
                            className="form-input"
                            value={normalizedStatus}
                            disabled={isSubmitting}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === normalizedStatus) return;
                              if (next === 'closed') {
                                handleResolveTicket();
                              } else {
                                handleUpdateField({ status: next }, `Đã chuyển trạng thái: ${STATUS_LABELS[next] || next}`);
                              }
                            }}
                            style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                          >
                            <option value="open">Mới tạo</option>
                            <option value="in_progress">Đang xử lý</option>
                            <option value="waiting">Chờ phản hồi</option>
                            <option value="resolved">Đã xử lý</option>
                            <option value="closed">Đã đóng (Hoàn thành)</option>
                          </select>
                        </label>

                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          Mức ưu tiên (SLA)
                          <select
                            className="form-input"
                            value={formData.priority || 'medium'}
                            disabled={isSubmitting}
                            onChange={(e) => {
                              const nextPriority = e.target.value;
                              if (nextPriority === formData.priority) return;
                              handleUpdateField(
                                { priority: nextPriority },
                                `Đã đổi ưu tiên thành ${PRIORITIES.find((p) => p.id === nextPriority)?.label || nextPriority}`
                              );
                            }}
                            style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                          >
                            {PRIORITIES.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.label} ({slaHoursMap[p.id as keyof typeof slaHoursMap] || 24}h)
                              </option>
                            ))}
                          </select>
                        </label>

                        {canManageRole && safeUsers.length > 0 && (
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            Chuyển người phụ trách
                            <select
                              className="form-input"
                              value={formData.assignee_id ? String(formData.assignee_id) : ''}
                              disabled={isSubmitting}
                              onChange={(e) => {
                                const nextId = e.target.value ? Number(e.target.value) : null;
                                if (!nextId || nextId === Number(formData.assignee_id)) return;
                                const u = safeUsers.find((usr: any) => Number(usr.id) === nextId);
                                handleUpdateField(
                                  { assignee_id: nextId },
                                  `Đã phân công ticket cho ${u?.full_name || 'nhân sự mới'}`
                                );
                              }}
                              style={{ fontSize: '0.8rem', padding: '5px 8px' }}
                            >
                              <option value="">— Chọn người phụ trách —</option>
                              {safeUsers.map((u: any) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h4
                    style={{
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      marginBottom: '0.5rem',
                    }}
                  >
                    Thời hạn xử lý (SLA)
                  </h4>
                  <div
                    style={{
                      ...cardSurfaceStyle,
                      padding: '0.8rem 0.95rem',
                      background: slaMeta.toneBg,
                    }}
                  >
                    <p
                      style={{
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        color: slaMeta.toneColor,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        margin: 0,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      <Clock size={14} /> {slaMeta.dateLabel}
                    </p>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.74rem', fontWeight: 600, color: slaMeta.toneColor }}>
                      {slaMeta.statusText}
                    </p>
                  </div>
                </div>

                <div>
                  <h4
                    style={{
                      fontSize: '0.73rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <FileText size={14} style={{ color: '#BD1D2D' }} /> Nội dung yêu cầu hỗ trợ
                  </h4>
                  <div style={{ ...cardSurfaceStyle, padding: '0.875rem 1rem' }}>
                    <div style={{ fontSize: '0.875rem', color: '#0f172a', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {cleanDescription || 'Không có mô tả chi tiết.'}
                    </div>

                    {attachedMedia.images.length > 0 && (
                      <div style={{ marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px dashed #e2e8f0' }}>
                        <p
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#64748b',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <ImageIcon size={13} style={{ color: '#BD1D2D' }} /> Ảnh đính kèm ({attachedMedia.images.length}):
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(75px, 1fr))', gap: '8px' }}>
                          {attachedMedia.images.map((img, idx) => (
                            <div
                              key={idx}
                              onClick={() => setPreviewImage(img.url)}
                              style={{
                                position: 'relative',
                                borderRadius: '8px',
                                overflow: 'hidden',
                                border: '1px solid #e2e8f0',
                                aspectRatio: '1',
                                cursor: 'pointer',
                                background: '#f8fafc',
                              }}
                              title={img.label}
                            >
                              <img src={img.url} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {attachedMedia.files.length > 0 && (
                      <div style={{ marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px dashed #e2e8f0' }}>
                        <p
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            color: '#64748b',
                            marginBottom: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <File size={13} style={{ color: '#BD1D2D' }} /> Tệp đính kèm ({attachedMedia.files.length}):
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {attachedMedia.files.map((file, idx) => (
                            <a
                              key={idx}
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '6px 10px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '8px',
                                textDecoration: 'none',
                                color: '#0f172a',
                                fontSize: '0.75rem',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                                <FileText size={14} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                  {file.label}
                                </span>
                              </div>
                              <Download size={13} style={{ color: '#BD1D2D', flexShrink: 0, marginLeft: '6px' }} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {!isSystemTicket && (
                  <div>
                    <h4
                      style={{
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: '#64748b',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Thông tin khách hàng
                    </h4>
                    {(() => {
                      const matchedContact =
                        resolvedContact ||
                        (primaryContactId
                          ? safeContacts.find((x: any) => Number(x.id) === Number(primaryContactId))
                          : safeContacts.find((x: any) => {
                              const fullName = String(x.full_name || '').trim().toLowerCase();
                              const cName = x.name ? String(x.name).trim().toLowerCase() : '';
                              const target = trimmedCustomerName.toLowerCase();
                              return target && (fullName === target || cName === target);
                            }));

                      const canOpen = Boolean(matchedContact?.id && Number(matchedContact.id) > 0 && onOpenContact);

                      return (
                        <div
                          onClick={() => {
                            if (canOpen && matchedContact) {
                              onOpenContact?.(matchedContact);
                            }
                          }}
                          style={{
                            ...cardSurfaceStyle,
                            padding: '0.75rem 0.875rem',
                            cursor: canOpen ? 'pointer' : 'default',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                              <Avatar
                                name={matchedContact?.full_name || formData.customer_name || 'Khách hàng'}
                                src={matchedContact?.avatar_url}
                                size={34}
                              />
                              <div style={{ minWidth: 0, flex: 1 }}>
                                <p
                                  style={{
                                    fontWeight: 700,
                                    fontSize: '0.85rem',
                                    color: '#0f172a',
                                    margin: 0,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                >
                                  {matchedContact?.full_name || formData.customer_name || 'Chưa cập nhật'}
                                </p>
                                <p style={{ fontSize: '0.72rem', color: '#64748b', margin: 0, marginTop: '1px', fontVariantNumeric: 'tabular-nums' }}>
                                  {matchedContact?.phone || (canOpen ? 'Nhấn để mở hồ sơ' : 'Khách hàng liên quan')}
                                </p>
                              </div>
                            </div>

                            {canOpen && (
                              <div
                                style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '8px',
                                  background: '#fef2f2',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#BD1D2D',
                                  flexShrink: 0,
                                }}
                              >
                                <ExternalLink size={14} />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {safeRelatedContacts.length > 0 && !isSystemTicket && (
                  <div>
                    <h4
                      style={{
                        fontSize: '0.73rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: '#64748b',
                        marginBottom: '0.5rem',
                      }}
                    >
                      Khách hàng liên quan khác
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {safeRelatedContacts.map((cid: any) => {
                        const c = safeContacts.find((x: any) => Number(x.id) === Number(cid));
                        if (!c) return null;
                        return (
                          <div
                            key={cid}
                            onClick={() => onOpenContact?.(c)}
                            style={{
                              ...cardSurfaceStyle,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              cursor: onOpenContact ? 'pointer' : 'default',
                              padding: '6px 10px',
                            }}
                          >
                            <Avatar src={c.avatar_url} name={c.full_name || ''} size={28} />
                            <div style={{ fontSize: '0.8125rem', minWidth: 0 }}>
                              <p style={{ fontWeight: 600, margin: 0, color: '#0f172a' }}>{c.full_name}</p>
                              <p style={{ fontSize: '0.7rem', color: '#64748b', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                                {c.phone}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div style={{ ...cardSurfaceStyle, padding: '0.75rem 0.9rem', fontSize: '0.75rem', color: '#64748b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                    <User size={13} style={{ color: '#BD1D2D' }} /> Người tạo Ticket
                  </div>
                  <span>{formData.creator_name || formData.created_by_name || `#${formData.created_by || '—'}`}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {showRejectModal && (
        <CustomModal
          isOpen={showRejectModal}
          onClose={() => {
            if (!isSubmitting) {
              setShowRejectModal(false);
              setRejectReason('');
            }
          }}
          title="Từ chối & đóng Ticket"
          width={440}
          zIndex={nestedOverlayZ}
          disableClose={isSubmitting}
          preventCloseOnBackdrop={isSubmitting}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0, lineHeight: 1.5 }}>
              Vui lòng nhập lý do từ chối hỗ trợ ticket này. Lý do sẽ được lưu và thông báo trực tiếp cho người tạo ticket.
            </p>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Nhập lý do từ chối hỗ trợ..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              style={{ width: '100%', resize: 'none' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                className="btn outline sm"
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
                disabled={isSubmitting}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                className="btn danger sm"
                onClick={handleRejectTicket}
                disabled={isSubmitting || !rejectReason.trim()}
              >
                {isSubmitting ? <Loader2 size={14} className="spin" /> : <XCircle size={14} />}
                <span>{isSubmitting ? 'Đang từ chối...' : 'Xác nhận từ chối'}</span>
              </button>
            </div>
          </div>
        </CustomModal>
      )}

      {showDeleteModal && (
        <ConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={async () => {
            await handleDeleteTicket();
          }}
          title={t('Xác nhận xóa Ticket')}
          message={t('Bạn có chắc chắn muốn xóa ticket này không? Nhật ký trao đổi cũng sẽ được lưu trữ ẩn theo chuẩn xóa mềm an toàn.')}
          confirmText={t('Xóa Ticket')}
          cancelText={t('Hủy')}
          confirmType="danger"
          zIndex={nestedOverlayZ}
        />
      )}

      {safePreviewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.88)',
            zIndex: 2147483647,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            cursor: 'pointer',
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <img
              src={safePreviewImage}
              alt="Preview"
              style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: '10px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <a
                href={safePreviewImage}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'white', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <ExternalLink size={14} /> Mở ảnh trong tab mới
              </a>
              <button
                type="button"
                className="btn outline sm"
                onClick={() => setPreviewImage(null)}
                style={{ color: 'white', borderColor: 'white' }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {commentToDelete !== null && (
        <ConfirmModal
          isOpen={commentToDelete !== null}
          onClose={() => setCommentToDelete(null)}
          onConfirm={async () => {
            if (commentToDelete !== null) {
              await handleDeleteComment(commentToDelete);
            }
          }}
          title={t('Xác nhận xóa bình luận')}
          message={t('Bạn có chắc chắn muốn xóa bình luận này không?')}
          confirmText={t('Xóa')}
          cancelText={t('Hủy')}
          confirmType="danger"
          zIndex={nestedOverlayZ}
        />
      )}
    </AnimatePresence>,
    document.body
  );
};
