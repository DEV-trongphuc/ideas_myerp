import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Trash2, Download, Loader2, 
  CheckCircle2, Archive, ShieldAlert 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import JSZip from 'jszip';
import api from '../../api/axios';
import { useChatStore } from '../../store/chatStore';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../ui/Avatar';
import toast from 'react-hot-toast';
import { pushOverlay } from '../../utils/overlayStack';
import { resolveChatFileUrl } from '../../utils/chatWallpapers';
import { getCurrentSessionToken, getStreamTicket } from '../../utils/streamTicket';

interface DeleteConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const sanitizeZipFilename = (rawName: string | undefined, fallbackId: number | string, usedNames: Set<string>): string => {
  const baseRaw = String(rawName || `file_${fallbackId}`)
    .replace(/[/\\]/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/[\x00-\x1f<>:"|?*]/g, '_')
    .trim();
  const base = baseRaw || `file_${fallbackId}`;
  if (!usedNames.has(base.toLowerCase())) {
    usedNames.add(base.toLowerCase());
    return base;
  }
  const dotIdx = base.lastIndexOf('.');
  const stem = dotIdx > 0 ? base.slice(0, dotIdx) : base;
  const ext = dotIdx > 0 ? base.slice(dotIdx) : '';
  let counter = 1;
  let candidate = `${stem} (${counter})${ext}`;
  while (usedNames.has(candidate.toLowerCase())) {
    counter += 1;
    candidate = `${stem} (${counter})${ext}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
};

export const DeleteConversationModal: React.FC<DeleteConversationModalProps> = ({
  isOpen,
  onClose,
  onSuccess
}) => {
  if (!isOpen || typeof document === 'undefined') return null;
  return <DeleteConversationModalInner onClose={onClose} onSuccess={onSuccess} />;
};

const DeleteConversationModalInner: React.FC<Omit<DeleteConversationModalProps, 'isOpen'>> = ({
  onClose,
  onSuccess
}) => {
  const {
    activeConversation,
    vaultItems,
    deleteConversation
  } = useChatStore(
    useShallow((s) => ({
      activeConversation: s.activeConversation,
      vaultItems: s.vaultItems,
      deleteConversation: s.deleteConversation,
    }))
  );
  const convMessages = useChatStore((s) =>
    s.activeConversation?.id ? s.messagesByConvId?.[s.activeConversation.id] : undefined
  );

  const [isDeleting, setIsDeleting] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const deleteInFlightRef = useRef(false);

  useEffect(() => {
    if (activeConversation) {
      const unregister = pushOverlay('delete-conversation-modal', onClose, 2300);
      return () => unregister();
    } else {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
      setBackupDownloaded(false);
    }
  }, [activeConversation, onClose]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  if (!activeConversation) return null;

  const convId = activeConversation?.id || 0;
  const isDirect = activeConversation?.type === 'direct';
  const title = (isDirect && activeConversation?.other_user?.full_name)
    ? activeConversation.other_user.full_name
    : (activeConversation?.title || 'Cuộc trò chuyện');
  const avatar = (isDirect && activeConversation?.other_user)
    ? activeConversation.other_user.avatar_url
    : (activeConversation?.avatar_url || activeConversation?.other_user?.avatar_url);

  const messages = Array.isArray(convMessages) ? convMessages : [];
  const safeVaultItems = Array.isArray(vaultItems) ? vaultItems : [];
  const mediaCount = safeVaultItems.filter(i => i.category === 'image' || i.category === 'video').length;
  const fileCount = safeVaultItems.filter(i => i.category === 'document').length;

  const handleDownloadBackup = async () => {
    if (!activeConversation || isBackingUp) return;
    abortControllerRef.current?.abort();
    const ctrl = new AbortController();
    abortControllerRef.current = ctrl;

    setIsBackingUp(true);
    try {
      const zip = new JSZip();

      // 1. Fetch full paginated message archive (up to 5,000 messages) rather than RAM-only slice
      const archiveById = new Map<number, any>();
      messages.forEach((m) => {
        if (m && typeof m.id === 'number' && m.id > 0) archiveById.set(m.id, m);
      });
      let beforeId: number | undefined = undefined;
      for (let page = 0; page < 50; page += 1) {
        if (ctrl.signal.aborted) break;
        const res = await api.get(`/chat/conversations/${convId}/messages`, {
          params: beforeId ? { before_id: beforeId, limit: 100 } : { limit: 100 },
          signal: ctrl.signal
        });
        const batch = Array.isArray(res.data?.data) ? res.data.data : (Array.isArray(res.data) ? res.data : []);
        if (batch.length === 0) break;
        let minId = Infinity;
        batch.forEach((m: any) => {
          const mid = Number(m?.id || 0);
          if (mid > 0) {
            archiveById.set(mid, m);
            if (mid < minId) minId = mid;
          }
        });
        if (batch.length < 100 || !Number.isFinite(minId) || minId === beforeId) break;
        beforeId = minId;
      }

      const fullMessages = Array.from(archiveById.values()).sort((a, b) => Number(a.id) - Number(b.id));
      const formattedLines = fullMessages.map((m) => {
        const timeStr = m.created_at ? new Date(m.created_at).toLocaleString('vi-VN') : '';
        const sender = m.sender_name || 'Người dùng';
        if (m.deleted_at) {
          return `[${timeStr}] ${sender}: [Tin nhắn đã thu hồi]`;
        }
        return `[${timeStr}] ${sender}: ${m.content || `[Tệp đính kèm: ${m.message_type}]`}`;
      });

      zip.file(
        'lich_su_tro_chuyen.txt',
        `=== BẢN SAO LƯU CUỘC TRÒ CHUYỆN: ${title} ===\nThời gian xuất: ${new Date().toLocaleString('vi-VN')}\nTổng số tin nhắn: ${fullMessages.length}\n\n` +
          formattedLines.join('\n')
      );

      // 2. Fetch and package images & files safely with Auth header & size/Content-Type guards
      const imgFolder = zip.folder('hinh_anh');
      const docFolder = zip.folder('tai_lieu');
      const usedImgNames = new Set<string>();
      const usedDocNames = new Set<string>();
      const skippedNotes: string[] = [];
      const token = getCurrentSessionToken();

      for (const item of safeVaultItems) {
        if (ctrl.signal.aborted) break;
        if (!item?.file_url) continue;
        try {
          let fetchUrl = resolveChatFileUrl(item.file_url);
          if (!fetchUrl) continue;
          const isUploadPath = /^https?:\/\/[^/]+\/uploads\//i.test(fetchUrl) || fetchUrl.startsWith('/uploads/');
          let res: Response;
          const headers: Record<string, string> = {};
          if (token) headers['Authorization'] = `Bearer ${token}`;

          res = await fetch(fetchUrl, {
            headers,
            credentials: 'include',
            signal: ctrl.signal
          });
          if (!res.ok && isUploadPath) {
            const ticket = await getStreamTicket('download', true, ctrl.signal);
            const rawRel = item.file_url.replace(/^https?:\/\/[^/]+/i, '');
            const dlUrl = `/api.php?action=download-file&file=${encodeURIComponent(rawRel)}${ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''}`;
            res = await fetch(dlUrl, { headers, credentials: 'include', signal: ctrl.signal });
          }

          if (!res.ok) {
            skippedNotes.push(`${item.file_name || item.id}: HTTP ${res.status}`);
            continue;
          }
          const ct = (res.headers.get('content-type') || '').toLowerCase();
          if (ct.startsWith('text/html') || ct.includes('application/json')) {
            skippedNotes.push(`${item.file_name || item.id}: server trả về ${ct}`);
            continue;
          }
          const contentLen = Number(res.headers.get('content-length') || 0);
          if (contentLen > 25 * 1024 * 1024) {
            skippedNotes.push(`${item.file_name || item.id}: vượt quá 25MB (${Math.round(contentLen / 1048576)}MB), bỏ qua để tránh tràn RAM — URL: ${fetchUrl}`);
            continue;
          }
          const blob = await res.blob();
          if (blob.size > 25 * 1024 * 1024) {
            skippedNotes.push(`${item.file_name || item.id}: vượt quá 25MB (${Math.round(blob.size / 1048576)}MB), bỏ qua — URL: ${fetchUrl}`);
            continue;
          }

          if (item.category === 'image' || item.category === 'video') {
            const safeName = sanitizeZipFilename(item.file_name, item.id, usedImgNames);
            imgFolder?.file(safeName, blob);
          } else {
            const safeName = sanitizeZipFilename(item.file_name, item.id, usedDocNames);
            docFolder?.file(safeName, blob);
          }
        } catch (e: any) {
          if (e?.name === 'AbortError') break;
          skippedNotes.push(`${item.file_name || item.id}: lỗi kết nối`);
        }
      }

      if (skippedNotes.length > 0) {
        zip.file('tep_bo_qua.txt', skippedNotes.join('\n'));
      }
      if (ctrl.signal.aborted) return;

      // 3. Generate zip and trigger download
      const content = await zip.generateAsync({ type: 'blob' });
      const dlUrl = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = dlUrl;
      const cleanTitle = title.replace(/[^a-zA-Z0-9_\u00C0-\u1EF9]/g, '_');
      a.download = `Sao_luu_${cleanTitle}_${Date.now()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(dlUrl), 1500);

      setBackupDownloaded(true);
      toast.success(
        skippedNotes.length > 0
          ? `Đã tải ZIP (có ${skippedNotes.length} tệp quá lớn/lỗi được ghi chú trong tep_bo_qua.txt)`
          : 'Đã tải xuống gói sao lưu ZIP thành công!'
      );
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        toast.error('Lỗi khi nén gói sao lưu: ' + (err.message || 'Không thể tải'));
      }
    } finally {
      if (abortControllerRef.current === ctrl) {
        abortControllerRef.current = null;
      }
      setIsBackingUp(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (deleteInFlightRef.current || isDeleting || !activeConversation) return;
    deleteInFlightRef.current = true;
    setIsDeleting(true);
    try {
      const ok = await deleteConversation(convId);
      if (ok) {
        onClose();
        if (onSuccess) onSuccess();
      }
    } finally {
      deleteInFlightRef.current = false;
      setIsDeleting(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="delete-conv-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2147483647,
          padding: '16px'
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 14 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 14 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '460px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #fee2e2',
            background: '#fff5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: '#fee2e2',
                color: '#dc2626',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Trash2 size={18} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#991b1b' }}>
                  Xóa cuộc trò chuyện
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#b91c1c' }}>
                  Giải phóng hoàn toàn dung lượng lưu trữ
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px'
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Conversation Summary Card */}
            <div style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <Avatar src={avatar} name={title} size={38} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: 750, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {title}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                    {isDirect ? 'Cuộc trò chuyện trực tiếp' : 'Nhóm trò chuyện nội bộ'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: '#f1f5f9', color: '#334155' }}>
                  {messages.length} tin nhắn
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: '6px', background: '#fef2f2', color: '#BD1D2D' }}>
                  {mediaCount + fileCount} tệp
                </span>
              </div>
            </div>

            {/* Backup Box */}
            <div style={{
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              padding: '12px 14px',
              background: backupDownloaded ? '#f0fdf4' : '#ffffff',
              borderColor: backupDownloaded ? '#86efac' : '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              transition: 'all 0.2s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: backupDownloaded ? '#dcfce7' : '#f1f5f9',
                  color: backupDownloaded ? '#16a34a' : '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  {backupDownloaded ? <CheckCircle2 size={16} /> : <Archive size={16} />}
                </div>
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#1e293b' }}>
                    {backupDownloaded ? 'Đã tải bản sao lưu về máy' : 'Sao lưu ảnh & tệp trước khi xóa'}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    Gói nén ZIP bao gồm ảnh, tài liệu và toàn bộ tin nhắn
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleDownloadBackup}
                disabled={isBackingUp}
                style={{
                  background: backupDownloaded ? '#ffffff' : '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  padding: '6px 12px',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: '#334155',
                  cursor: isBackingUp ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexShrink: 0,
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  transition: 'all 0.15s ease'
                }}
              >
                {isBackingUp ? (
                  <>
                    <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                    <span>Đang nén ZIP...</span>
                  </>
                ) : (
                  <>
                    <Download size={13} />
                    <span>{backupDownloaded ? 'Tải lại' : 'Tải ZIP'}</span>
                  </>
                )}
              </button>
            </div>

            {/* Permanent Warning */}
            <div style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '10px',
              padding: '10px 12px',
              display: 'flex',
              gap: '9px',
              alignItems: 'flex-start'
            }}>
              <ShieldAlert size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '0.76rem', color: '#991b1b', lineHeight: 1.4 }}>
                <strong>Xóa thật sự 100%:</strong> Toàn bộ tin nhắn, tệp đính kèm và <strong>các file vật lý trên ổ đĩa máy chủ</strong> sẽ bị xóa vĩnh viễn nhằm giải phóng dung lượng đĩa. Hành động này không thể hoàn tác!
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{
            padding: '12px 20px',
            background: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '10px'
          }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              style={{
                background: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '7px 14px',
                fontSize: '0.82rem',
                fontWeight: 650,
                color: '#475569',
                cursor: 'pointer'
              }}
            >
              Hủy bỏ
            </button>

            <button
              type="button"
              onClick={handleConfirmDelete}
              disabled={isDeleting || isBackingUp}
              style={{
                background: '#BD1D2D',
                border: 'none',
                borderRadius: '8px',
                padding: '7px 16px',
                fontSize: '0.82rem',
                fontWeight: 750,
                color: '#ffffff',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(189, 29, 45, 0.25)',
                opacity: isDeleting ? 0.7 : 1
              }}
            >
              {isDeleting ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  <span>Đang xóa và giải phóng đĩa...</span>
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  <span>Xác nhận xóa vĩnh viễn</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
