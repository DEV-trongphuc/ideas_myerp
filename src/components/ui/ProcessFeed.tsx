import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Activity, Clock, Coffee, Trash2, Send, Paperclip, Loader2, CornerDownRight, X } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import api from '../../api/axios';
import { Avatar } from './Avatar';
import { MentionInput } from './MentionInput';
import { ConfirmModal } from './ConfirmModal';
import { Skeleton } from './Skeleton';
import { formatCommentBody, formatFileSize, getFileBadgeInfo } from '../../utils/commentFormatter';
import { AttachmentLightboxModal, type AttachmentItem } from './AttachmentLightboxModal';
import { sanitizeHtml } from '../../utils/sanitizeHtml';
import { ensureArray } from '../../utils/safeArray';
import { isExecutive, isSystemAdmin } from '../../utils/roleUtils';
import { useUIStore } from '../../store/uiStore';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const FORBIDDEN_ATTACHMENT_EXT = /\.(php|phtml|phar|exe|bat|cmd|sh|ps1|msi|vbs|js|mjs|jsx|ts|tsx|html?|svg)$/i;
const SAFE_FILE_ACCEPT = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z';

const isSafeHref = (raw?: string): boolean => {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/^(javascript|vbscript|data):/i.test(trimmed)) return false;
  return !trimmed.startsWith('//');
};

const resolveStoredMediaUrl = (raw?: string): string => {
  if (!raw || typeof raw !== 'string') return '';
  const apiBase = import.meta.env.VITE_API_URL || '/backend';
  if (raw.startsWith('uploads/')) return `${apiBase}/${raw}`;
  if (raw.startsWith('storage/uploads/')) return `${apiBase}/${raw.replace('storage/uploads/', 'uploads/')}`;
  if (raw.startsWith('/storage/uploads/')) return `${apiBase}/${raw.replace('/storage/uploads/', 'uploads/')}`;
  return raw;
};

const parseSafeDate = (val?: string | number): Date | null => {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') {
    const dt = new Date(val);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const s = String(val).trim();
  const normalized = s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T');
  const dt = new Date(normalized);
  return isNaN(dt.getTime()) ? null : dt;
};

const decodeSnippetText = (html: string): string => {
  const plain = html.replace(/<[^>]*>/g, ' ');
  return plain
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
};

const hasCommentBodyContent = (html: string): boolean => {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;
  return decodeSnippetText(html).length > 0;
};

export interface ProcessFeedComment {
  id: string | number;
  user_name?: string;
  author?: string;
  avatar_url?: string;
  avatar?: string;
  created_at?: string | number;
  time?: string;
  body?: string;
  text?: string;
  user_id?: string | number;
  attachments?: any[];
  parent_id?: string | number | null;
}

export interface ProcessFeedHistory {
  id: string | number;
  user_name?: string;
  author?: string;
  avatar_url?: string;
  avatar?: string;
  action?: string;
  action_text?: string;
  text?: string;
  new_data?: string;
  created_at?: string | number;
  time?: string;
}

interface ProcessFeedProps {
  comments: ProcessFeedComment[];
  historyLogs: ProcessFeedHistory[];
  loadingComments?: boolean;
  loadingHistory?: boolean;
  currentUser: any;
  users?: any[];
  onAddComment: (text: string, attachments?: any[], parentId?: string | number | null) => Promise<void> | void;
  onDeleteComment?: (id: string | number) => Promise<void> | void;
  showAttachments?: boolean;
  maxHeight?: string | number;
}

export const ProcessFeed: React.FC<ProcessFeedProps> = ({
  comments,
  historyLogs,
  loadingComments = false,
  loadingHistory = false,
  currentUser,
  users,
  onAddComment,
  onDeleteComment,
  showAttachments = true,
  maxHeight = 'auto'
}) => {
  const { t } = useLanguage();
  const maxUploadMb = useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', 50);
  const maxAttachmentBytes = maxUploadMb * 1024 * 1024;
  const [activeTab, setActiveTab] = useState<'comments' | 'history'>('comments');
  const [commentText, setCommentText] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [submittingComment, setSubmittingComment] = useState(false);
  const isSendingRef = useRef(false);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<string | number | null>(null);
  const [replyTo, setReplyTo] = useState<{
    id: string | number;
    userName: string;
    avatar?: string;
    snippet?: string;
  } | null>(null);
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    items: AttachmentItem[];
    initialIndex: number;
  }>({
    isOpen: false,
    items: [],
    initialIndex: 0
  });

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
    };
  }, []);

  const safeComments = ensureArray<ProcessFeedComment>(comments);
  const safeHistoryLogs = ensureArray<ProcessFeedHistory>(historyLogs);

  const handleFeedClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (!target) return;
    const imgEl = target.closest('img') as HTMLImageElement | null;
    if (!imgEl || !imgEl.src) return;

    // Strict guard: Never trigger lightbox for avatars, icons, emojis, buttons
    if (
      imgEl.hasAttribute('data-avatar') ||
      imgEl.hasAttribute('data-no-lightbox') ||
      imgEl.hasAttribute('data-mention-avatar') ||
      imgEl.closest('[data-avatar]') ||
      imgEl.closest('[data-no-lightbox]') ||
      imgEl.closest('.avatar') ||
      imgEl.closest('.user-avatar') ||
      imgEl.closest('.mention-avatar') ||
      imgEl.closest('[class*="avatar"]') ||
      imgEl.closest('button')
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const container = imgEl.closest('.rich-comment-content') || imgEl.closest('[class*="comment"]') || e.currentTarget;
    const allImgs = Array.from(container.querySelectorAll('img:not([data-avatar]):not([data-no-lightbox]):not([data-mention-avatar]):not([class*="avatar"])')) as HTMLImageElement[];

    const imgItems: AttachmentItem[] = allImgs
      .map(img => ({
        url: img.src,
        name: img.alt || 'Hình ảnh',
        type: 'image' as const
      }))
      .filter(x => Boolean(x.url));

    const clickedIdx = imgItems.findIndex(x => x.url === imgEl.src);
    setLightboxState({
      isOpen: true,
      items: imgItems.length > 0 ? imgItems : [{ url: imgEl.src, name: imgEl.alt || 'Hình ảnh', type: 'image' }],
      initialIndex: Math.max(0, clickedIdx)
    });
  };

  const canSend = hasCommentBodyContent(commentText) || attachments.length > 0;

  const handleSend = async () => {
    if (isSendingRef.current || submittingComment) return;
    if (!canSend) return;
    isSendingRef.current = true;
    setSubmittingComment(true);

    uploadAbortRef.current?.abort();
    const ctrl = new AbortController();
    uploadAbortRef.current = ctrl;

    const workingAttachments = [...attachments];
    try {
      const uploadedAttachments: any[] = [];
      for (let i = 0; i < workingAttachments.length; i++) {
        const att = workingAttachments[i];
        if (att.file instanceof File) {
          const fd = new FormData();
          fd.append('file', att.file);
          const res = await api.post('/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            signal: ctrl.signal
          });
          if (ctrl.signal.aborted) return;
          const fileUrl = res.data?.data?.url || res.data?.url;
          const resolvedUrl = resolveStoredMediaUrl(fileUrl);
          const uploadedMeta = {
            name: att.name,
            url: resolvedUrl,
            size: att.size,
            type: att.type
          };
          workingAttachments[i] = uploadedMeta;
          setAttachments([...workingAttachments]);
          uploadedAttachments.push(uploadedMeta);
        } else {
          uploadedAttachments.push(att);
        }
      }

      if (ctrl.signal.aborted) return;
      await onAddComment(commentText, uploadedAttachments, replyTo ? replyTo.id : null);
      setCommentText('');
      setAttachments([]);
      setReplyTo(null);
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        return;
      }
      useUIStore.getState().addToast(t('Không thể gửi bình luận hoặc tải tệp lên. Vui lòng thử lại.'), 'error');
    } finally {
      isSendingRef.current = false;
      setSubmittingComment(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const accepted: any[] = [];
    for (const f of files) {
      if (FORBIDDEN_ATTACHMENT_EXT.test(f.name)) {
        useUIStore.getState().addToast(`Định dạng tệp "${f.name}" không được phép tải lên.`, 'warning');
        continue;
      }
      if (f.size > maxAttachmentBytes) {
        useUIStore.getState().addToast(`Tệp "${f.name}" vượt quá giới hạn tối đa ${maxUploadMb}MB.`, 'warning');
        continue;
      }
      accepted.push({ name: f.name, file: f, size: f.size, type: f.type });
    }
    if (accepted.length > 0) {
      setAttachments(prev => [...prev, ...accepted]);
    }
  };

  const getLogDetails = (item: ProcessFeedHistory) => {
    let actionLabel = item.action_text || item.text || item.action || '';
    let actionColor = '#334155';

    if (item.action === 'CREATE') {
      actionLabel = t('Tạo mới đề xuất / hồ sơ');
      actionColor = '#BD1D2D';
    } else if (item.action === 'REFUND_CONFIRM') {
      actionLabel = t('Xác nhận đã thanh toán & đính kèm chứng từ/UNC');
      actionColor = '#10b981';
    } else if (item.action === 'UPDATE_ATTACHMENT') {
      actionLabel = t('Cập nhật tài liệu / chứng từ đính kèm');
      actionColor = '#334155';
    } else if (item.action === 'UPDATE') {
      try {
        const parsed = JSON.parse(item.new_data || '{}');
        if (parsed.is_refunded || parsed.refund_image_url) {
          actionLabel = t('Xác nhận đã thanh toán & đính kèm chứng từ/UNC');
          actionColor = '#10b981';
        } else if (parsed.image_url && Object.keys(parsed).length <= 2) {
          actionLabel = t('Cập nhật tài liệu / chứng từ đính kèm');
          actionColor = '#334155';
        } else {
          actionLabel = t('Cập nhật nội dung');
          actionColor = '#334155';
        }
      } catch {
        actionLabel = t('Cập nhật nội dung');
        actionColor = '#334155';
      }
    } else if (item.action === 'APPROVE') {
      let statusText = t('phê duyệt');
      try {
        const parsed = JSON.parse(item.new_data || '{}');
        if (parsed.status === 'rejected') {
          statusText = t('từ chối');
          actionColor = '#ef4444';
        } else {
          actionColor = '#10b981';
        }
      } catch {}
      actionLabel = `${t('Thay đổi trạng thái')}: ${statusText}`;
    } else if (item.action === 'DELETE') {
      actionLabel = t('Xóa mục');
      actionColor = '#ef4444';
    } else if (item.action === 'ADD_COMMENT') {
      actionLabel = t('Thêm bình luận');
      actionColor = '#334155';
    }

    return { actionLabel, actionColor };
  };

  // Group comments into root comments and replies threads
  const rootComments: ProcessFeedComment[] = [];
  const repliesMap = new Map<string, ProcessFeedComment[]>();

  safeComments.forEach((item) => {
    const pId = item.parent_id;
    if (pId && safeComments.some(c => String(c.id) === String(pId))) {
      const key = String(pId);
      const list = repliesMap.get(key) || [];
      list.push(item);
      repliesMap.set(key, list);
    } else {
      rootComments.push(item);
    }
  });

  // Sort replies inside each thread chronologically
  repliesMap.forEach((replies) => {
    replies.sort((a, b) => {
      const dA = parseSafeDate(a.created_at);
      const dB = parseSafeDate(b.created_at);
      return (dA ? dA.getTime() : 0) - (dB ? dB.getTime() : 0);
    });
  });

  const handleReplyClick = (targetComment: ProcessFeedComment) => {
    const authorName = targetComment.user_name || targetComment.author || t('Đồng nghiệp');
    const avatarSrc = targetComment.avatar_url || targetComment.avatar;
    const rawSnippet = decodeSnippetText(targetComment.body || targetComment.text || '');
    const pId = targetComment.parent_id || targetComment.id;
    setReplyTo({
      id: pId,
      userName: authorName,
      avatar: avatarSrc,
      snippet: rawSnippet.length > 50 ? rawSnippet.slice(0, 50) + '...' : rawSnippet
    });
    if (!hasCommentBodyContent(commentText)) {
      setCommentText(`@${authorName} `);
    }
  };

  const renderCommentCard = (item: ProcessFeedComment, isReply = false) => {
    const authorName = item.user_name || item.author || t('Người dùng');
    const isIdeasSystem = authorName.includes('Hệ thống') || authorName.includes('IDEAS') || authorName.includes('System');
    const avatarSrc = item.avatar_url || item.avatar || (isIdeasSystem ? '/cropped-logofavicon-1.webp' : undefined);
    const parsedDt = parseSafeDate(item.created_at);
    const displayTime = parsedDt
      ? parsedDt.toLocaleString('vi-VN')
      : (item.created_at ? String(item.created_at) : (item.time || ''));
    const bodyText = item.body || item.text || '';
    const canDelete = Boolean(
      onDeleteComment && (
        isSystemAdmin(currentUser) ||
        isExecutive(currentUser) ||
        (currentUser?.id != null && item.user_id != null && Number(currentUser.id) === Number(item.user_id))
      )
    );
    const itemAttachments = ensureArray<any>(item.attachments);

    return (
      <div
        key={item.id}
        style={{
          display: 'flex',
          gap: isReply ? '10px' : '12px',
          padding: isReply ? '10px 14px' : '12px 16px',
          background: isReply ? 'var(--color-bg-light, rgba(0,0,0,0.015))' : 'var(--color-bg)',
          borderRadius: isReply ? '12px' : '14px',
          border: '1px solid var(--color-border-light)',
          boxShadow: isReply ? 'inset 0 1px 2px rgba(0,0,0,0.01)' : '0 2px 6px rgba(0,0,0,0.01)',
          position: 'relative',
          transition: 'all 0.2s ease'
        }}
      >
        <Avatar src={avatarSrc} name={authorName} size={isReply ? 24 : 28} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px', flexWrap: 'wrap', gap: '4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <strong style={{ fontSize: isReply ? '0.78rem' : '0.8rem', color: 'var(--color-text)', fontWeight: 700 }}>{authorName}</strong>
              {isReply && (
                <span style={{ fontSize: '0.66rem', color: 'var(--color-primary, #BD1D2D)', background: 'rgba(189, 29, 45, 0.08)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                  {t('Phản hồi')}
                </span>
              )}
            </div>
            <span style={{ fontSize: '0.675rem', color: 'var(--color-text-muted)' }}>{displayTime}</span>
          </div>
          {bodyText && (/<[a-z][\s\S]*>/i.test(bodyText) || /[📕📄📊📝📦🖼️📎]/.test(bodyText)) ? (
            <div
              className="rich-comment-content text-left"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(formatCommentBody(bodyText)) }}
              style={{ fontSize: isReply ? '0.78rem' : '0.8rem', color: 'var(--color-text-light)', margin: '2px 0 0', lineHeight: '1.45', textAlign: 'left' }}
            />
          ) : (
            <p style={{ margin: 0, fontSize: isReply ? '0.78rem' : '0.8rem', color: 'var(--color-text-light)', lineHeight: '1.45', whiteSpace: 'pre-wrap', textAlign: 'left', wordBreak: 'break-word' }}>{bodyText}</p>
          )}

          {/* Attached files chips list */}
          {itemAttachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
              {itemAttachments.map((file: any, index: number) => {
                const rawUrl = file?.url || file?.file_url || (typeof file === 'string' ? file : '');
                const resolvedUrl = resolveStoredMediaUrl(rawUrl);
                const safeFileUrl = isSafeHref(resolvedUrl) ? resolvedUrl : '';
                const fileName = file?.name || 'Tệp đính kèm';
                const isImage = /\.(jpg|jpeg|png|webp|gif|svg)(\?.*)?$/i.test(fileName || safeFileUrl) || file?.type?.startsWith('image/');
                const { label, cls } = getFileBadgeInfo(fileName);
                return (
                  <a
                    key={index}
                    href={safeFileUrl || undefined}
                    target={isImage ? undefined : (safeFileUrl ? '_blank' : undefined)}
                    rel="noopener noreferrer"
                    download={isImage ? undefined : (safeFileUrl ? fileName : undefined)}
                    data-file-url={safeFileUrl}
                    data-file-name={fileName}
                    className="comment-attachment-chip"
                    style={{ margin: 0, cursor: isImage ? 'zoom-in' : (safeFileUrl ? 'pointer' : 'default') }}
                    title={isImage ? `Bấm để phóng to xem ảnh: ${fileName}` : (safeFileUrl ? `Bấm để tải về / mở: ${fileName}` : undefined)}
                    onClick={(e) => {
                      if (!safeFileUrl) {
                        e.preventDefault();
                        return;
                      }
                      if (isImage) {
                        e.preventDefault();
                        e.stopPropagation();
                        setLightboxState({
                          isOpen: true,
                          items: [{ url: safeFileUrl, name: fileName, type: 'image' }],
                          initialIndex: 0
                        });
                      }
                    }}
                  >
                    <span className={`file-doc-badge ${cls}`}>{label}</span>
                    <span className="file-doc-name" style={{ maxWidth: '180px' }}>
                      {fileName}
                    </span>
                    {file?.size ? (
                      <span className="file-doc-size">
                        ({formatFileSize(file.size)})
                      </span>
                    ) : null}
                    <span className="file-doc-action-icon">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </span>
                  </a>
                );
              })}
            </div>
          )}

          {/* Action Row: Phản hồi + Xóa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            {!isIdeasSystem && (
              <button
                type="button"
                onClick={() => handleReplyClick(item)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  color: 'var(--color-primary, #BD1D2D)',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
                className="hover-bg"
                title={t('Trả lời bình luận này')}
              >
                <CornerDownRight size={12} />
                <span>{t('Phản hồi')}</span>
              </button>
            )}

            {canDelete && (
              <button
                type="button"
                onClick={() => setCommentToDelete(item.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  background: 'none',
                  border: 'none',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.7rem',
                  cursor: 'pointer'
                }}
                className="hover-danger"
                title={t('Xóa bình luận')}
              >
                <Trash2 size={11} />
                <span>{t('Xóa')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, overflow: 'hidden' }}>
      {/* Tabs Header */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-light)', background: 'var(--color-bg-light)', padding: '0 8px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setActiveTab('comments')}
          style={{
            flex: 1,
            padding: '12px 10px',
            border: 'none',
            background: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: activeTab === 'comments' ? 'var(--color-primary, #BD1D2D)' : 'var(--color-text-muted)',
            borderBottom: activeTab === 'comments' ? '2px solid var(--color-primary, #BD1D2D)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease'
          }}
        >
          <MessageSquare size={14} />
          {t('Thảo luận')} ({safeComments.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          style={{
            flex: 1,
            padding: '12px 10px',
            border: 'none',
            background: 'none',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: activeTab === 'history' ? 'var(--color-primary, #BD1D2D)' : 'var(--color-text-muted)',
            borderBottom: activeTab === 'history' ? '2px solid var(--color-primary, #BD1D2D)' : '2px solid transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'all 0.15s ease'
          }}
        >
          <Activity size={14} />
          {t('Hoạt động')} ({safeHistoryLogs.length})
        </button>
      </div>

      {/* Tab Contents (Scrollable Container) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxHeight: maxHeight,
          paddingRight: '6px'
        }}
        className="custom-scrollbar"
        onClick={handleFeedClick}
      >
        {activeTab === 'comments' ? (
          loadingComments ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0.5rem 0' }}>
              {[1, 2, 3].map(idx => (
                <div key={idx} style={{ display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--color-border-light)' }}>
                  <Skeleton width={28} height={28} borderRadius="50%" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton width="35%" height={12} />
                    <Skeleton width="88%" height={11} />
                    <Skeleton width="52%" height={10} />
                  </div>
                </div>
              ))}
            </div>
          ) : safeComments.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: 'var(--color-text-muted)', gap: '8px', textAlign: 'center' }}>
              <Coffee size={24} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: '0.8rem' }}>{t('Chưa có thảo luận nào. Hãy bắt đầu thảo luận!')}</span>
            </div>
          ) : (
            rootComments.map((rootItem) => {
              const threadReplies = repliesMap.get(String(rootItem.id)) || [];
              return (
                <div key={rootItem.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {renderCommentCard(rootItem, false)}

                  {/* Nested Replies Thread */}
                  {threadReplies.length > 0 && (
                    <div style={{
                      marginLeft: '20px',
                      paddingLeft: '12px',
                      borderLeft: '2px solid rgba(189, 29, 45, 0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      marginTop: '2px'
                    }}>
                      {threadReplies.map((replyItem) => (
                        <div key={replyItem.id}>
                          {renderCommentCard(replyItem, true)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : (
          /* activeTab === 'history' */
          loadingHistory ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0.5rem 0' }}>
              {[1, 2, 3].map(idx => (
                <div key={idx} style={{ display: 'flex', gap: 12, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--color-border-light)', alignItems: 'center' }}>
                  <Skeleton width={28} height={28} borderRadius="50%" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Skeleton width="40%" height={11} />
                    <Skeleton width="72%" height={10} />
                  </div>
                </div>
              ))}
            </div>
          ) : safeHistoryLogs.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 1rem', color: 'var(--color-text-muted)', gap: '8px', textAlign: 'center' }}>
              <Clock size={20} style={{ opacity: 0.4 }} />
              <span style={{ fontSize: '0.8rem' }}>{t('Chưa ghi nhận lịch sử hoạt động nào.')}</span>
            </div>
          ) : (
            safeHistoryLogs.map((item) => {
              const { actionLabel, actionColor } = getLogDetails(item);
              const authorName = item.user_name || item.author || t('Hệ thống');
              const parsedDt = parseSafeDate(item.created_at);
              const displayTime = parsedDt
                ? parsedDt.toLocaleString('vi-VN')
                : (item.created_at ? String(item.created_at) : (item.time || ''));

              const isIdeasSystem = authorName.includes('Hệ thống') || authorName.includes('IDEAS') || authorName.includes('System');
              const logAvatar = item.avatar_url || item.avatar || (isIdeasSystem ? '/cropped-logofavicon-1.webp' : undefined);

              return (
                <div key={item.id} style={{
                  display: 'flex',
                  gap: '12px',
                  padding: '10px 14px',
                  background: 'var(--color-bg-secondary)',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border-light)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.01)',
                  alignItems: 'center'
                }}>
                  <Avatar src={logAvatar} name={authorName} size={28} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <strong style={{ fontSize: '0.78rem', color: 'var(--color-text)', fontWeight: 700 }}>{authorName}</strong>
                      <span style={{ fontSize: '0.675rem', color: 'var(--color-text-muted)' }}>{displayTime}</span>
                    </div>
                    {actionLabel && /<[a-z][\s\S]*>/i.test(actionLabel) ? (
                      <div
                        style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', textAlign: 'left', lineHeight: '1.4' }}
                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(actionLabel) }}
                      />
                    ) : (
                      <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--color-text-muted)', textAlign: 'left', lineHeight: '1.4' }}>
                        {item.action ? (
                          <>
                            {t('Hành động')}: <strong style={{ color: actionColor }}>{actionLabel}</strong>
                          </>
                        ) : actionLabel}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      {/* Comment Editor Box at bottom */}
      {activeTab === 'comments' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          borderTop: '1px solid var(--color-border-light)',
          paddingTop: '8px',
          flexShrink: 0,
          position: 'sticky',
          bottom: 0,
          background: 'var(--color-surface)',
          zIndex: 10
        }}>
          {/* Active Reply Banner */}
          {replyTo && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 12px',
              background: 'rgba(189, 29, 45, 0.06)',
              borderLeft: '3px solid var(--color-primary, #BD1D2D)',
              borderRadius: '8px',
              fontSize: '0.78rem',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                <CornerDownRight size={14} color="#BD1D2D" style={{ flexShrink: 0 }} />
                <Avatar src={replyTo.avatar} name={replyTo.userName} size={20} />
                <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>{t('Đang trả lời')} </span>
                  <strong style={{ color: 'var(--color-primary, #BD1D2D)' }}>@{replyTo.userName}</strong>
                  {replyTo.snippet && (
                    <span style={{ color: 'var(--color-text-muted)', marginLeft: '6px' }}>
                      "{replyTo.snippet}"
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  borderRadius: '4px',
                  fontSize: '0.72rem',
                  fontWeight: 600
                }}
                className="hover-danger"
                title={t('Hủy trả lời')}
              >
                <X size={13} />
                <span>{t('Hủy')}</span>
              </button>
            </div>
          )}

          <div style={{ background: 'rgba(0, 0, 0, 0.015)', border: '1px solid var(--color-border-light)', padding: '10px', borderRadius: '14px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.01)' }}>
            <div style={{ position: 'relative' }}>
              <MentionInput
                value={commentText}
                onChange={(e: any) => setCommentText(e.target.value)}
                onSubmitShortcut={handleSend}
                users={users}
                placeholder={t('Viết bình luận... Gõ @ để nhắc tên')}
                style={{
                  width: '100%',
                  minHeight: '65px',
                  maxHeight: '220px',
                  border: 'none',
                  borderRadius: 0,
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  boxSizing: 'border-box',
                  paddingRight: showAttachments ? '40px' : '0'
                }}
                disabled={submittingComment}
              />
              {showAttachments && (
                <label style={{ position: 'absolute', right: '10px', bottom: '10px', cursor: 'pointer', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('Đính kèm tệp (PDF, Word, Excel, ZIP, Ảnh...)')}>
                  <input type="file" multiple accept={SAFE_FILE_ACCEPT} onChange={handleFileChange} style={{ display: 'none' }} />
                  <Paperclip size={18} />
                </label>
              )}
            </div>

            {attachments.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '2px' }}>
                {attachments.map((file, index) => {
                  const { label, cls } = getFileBadgeInfo(file.name);
                  return (
                    <div key={index} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border-light)',
                      padding: '4px 10px',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                      color: 'var(--color-text)',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}>
                      <span className={`file-doc-badge ${cls}`}>{label}</span>
                      <span className="file-doc-name" style={{ maxWidth: '180px' }}>
                        {file.name}
                      </span>
                      {file.size && (
                        <span className="file-doc-size">
                          ({formatFileSize(file.size)})
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setAttachments(attachments.filter((_, i) => i !== index))}
                        style={{ border: 'none', background: 'transparent', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 2px', lineHeight: 1 }}
                        title={t('Xóa tệp này')}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '4px', borderTop: '1px dashed var(--color-border-light)' }}>
              <button
                type="button"
                disabled={submittingComment || !canSend}
                onClick={handleSend}
                className="btn primary sm"
                style={{
                  background: 'var(--color-primary, #BD1D2D)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '6px 18px',
                  cursor: submittingComment || !canSend ? 'not-allowed' : 'pointer',
                  opacity: submittingComment || !canSend ? 0.65 : 1,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                {submittingComment ? (
                  <>
                    <Loader2 size={12} className="spin" /> {t('Đang gửi...')}
                  </>
                ) : (
                  <>
                    <Send size={13} /> {t('Gửi')}
                  </>
                )}
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
            if (commentToDelete !== null && onDeleteComment) {
              await onDeleteComment(commentToDelete);
              setCommentToDelete(null);
            }
          }}
          title="Xác nhận xóa bình luận"
          message="Bạn có chắc chắn muốn xóa bình luận này không? Hành động này không thể hoàn tác."
        />
      )}

      {/* Lightbox Modal for Fullscreen Image Zooming */}
      <AttachmentLightboxModal
        isOpen={lightboxState.isOpen}
        onClose={() => setLightboxState(prev => ({ ...prev, isOpen: false }))}
        items={lightboxState.items}
        initialIndex={lightboxState.initialIndex}
        zIndex={2147483647}
      />
    </div>
  );
};
