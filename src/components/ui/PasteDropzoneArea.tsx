import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Upload, Link2, FileText, X, Check, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { pushOverlay } from '../../utils/overlayStack';
import { getLocalDateStr } from '../../utils/dateUtils';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';

interface PendingUploadItem {
  file?: File;
  url?: string;
  previewUrl: string;
  name: string;
  size?: string;
  isImage: boolean;
  label: string;
}

export interface PasteDropzoneAreaProps {
  onConfirmUpload: (item: { file?: File; url?: string; label: string }) => Promise<void>;
  placeholder?: string;
  subtext?: string;
  compact?: boolean;
  accept?: string;
  disabled?: boolean;
  maxSizeMb?: number;
}

const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  'php', 'php3', 'php4', 'php5', 'php7', 'phps', 'phtml', 'phar',
  'html', 'htm', 'xhtml', 'shtml', 'mhtml', 'xml', 'svg', 'svgz',
  'js', 'mjs', 'ts', 'jsx', 'tsx', 'py', 'pl', 'sh', 'bash', 'cgi', 'rb', 'go',
  'c', 'cpp', 'java', 'h', 'cs', 'swift', 'kt', 'rs',
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'vbs', 'wsf', 'ps1', 'jar', 'apk',
  'htaccess', 'config', 'env', 'sql'
]);

const BLOCKED_UPLOAD_MIMES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
  'application/x-httpd-php',
  'application/x-msdownload',
  'application/x-sh',
  'text/xml',
  'application/xml'
]);

const RASTER_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

const isSafeDropzoneUrl = (raw?: string | null, allowTrackedBlob = false): boolean => {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  // Strip control characters and whitespace before scheme inspection to block obfuscation (e.g. java\tscript:)
  const normalized = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('//')
  ) {
    return false;
  }
  if (allowTrackedBlob && normalized.startsWith('blob:')) {
    return true;
  }
  if (trimmed.startsWith('/')) {
    return !trimmed.includes('..');
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const PasteDropzoneArea: React.FC<PasteDropzoneAreaProps> = ({
  onConfirmUpload,
  placeholder = 'Kéo thả tệp tin hoặc dán ảnh chụp màn hình (Ctrl+V)',
  subtext = 'Hỗ trợ dán ảnh trực tiếp từ Clipboard hoặc nhập đường dẫn link',
  compact = false,
  accept = '*',
  disabled = false,
  maxSizeMb
}) => {
  const policyMaxMb = useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', 50);
  const policyForbiddenExts = useTypedSubSetting<string[]>('core.upload_security_policy', 'forbidden_exts', []);
  const drawerMsSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);
  const zToastTopSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_toast_top', 2147483647);
  const resolvedMaxMb = Number.isFinite(Number(maxSizeMb)) && Number(maxSizeMb) > 0
    ? Number(maxSizeMb)
    : (Number.isFinite(Number(policyMaxMb)) && Number(policyMaxMb) > 0 ? Number(policyMaxMb) : 50);
  const effectiveZIndex = Math.max(Number(zToastTopSetting) || 2147483647, 2147483647);
  const motionDurationSec = Math.max(0.1, (Number(drawerMsSetting) || 220) / 1000);
  const [isDragOver, setIsDragOver] = useState(false);
  const [pendingItem, setPendingItem] = useState<PendingUploadItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmInFlightRef = useRef(false);
  const activeBlobUrlRef = useRef<string | null>(null);

  const revokeActiveBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      } catch {
        // Ignore revoke failures
      }
      activeBlobUrlRef.current = null;
    }
  }, []);

  const clearPendingItem = useCallback(() => {
    revokeActiveBlobUrl();
    setPendingItem(null);
  }, [revokeActiveBlobUrl]);

  const setPendingItemWithBlobTracking = useCallback((nextItem: PendingUploadItem, createdBlobUrl?: string) => {
    revokeActiveBlobUrl();
    if (createdBlobUrl) {
      activeBlobUrlRef.current = createdBlobUrl;
    }
    setPendingItem(nextItem);
  }, [revokeActiveBlobUrl]);

  useEffect(() => {
    return () => {
      revokeActiveBlobUrl();
    };
  }, [revokeActiveBlobUrl]);

  useEffect(() => {
    if (!pendingItem) return;
    return pushOverlay('paste-dropzone-preview-modal', () => {
      if (!uploading && !confirmInFlightRef.current) {
        clearPendingItem();
      }
    }, effectiveZIndex);
  }, [pendingItem, uploading, clearPendingItem, effectiveZIndex]);

  const validateFile = useCallback((file: File): boolean => {
    if (!file) return false;
    const effectiveMaxMb = resolvedMaxMb;
    const maxBytes = effectiveMaxMb * 1024 * 1024;
    if (file.size <= 0) {
      toast.error('Tệp tin rỗng không thể tải lên');
      return false;
    }
    if (file.size > maxBytes) {
      toast.error(`Dung lượng tệp vượt quá giới hạn tối đa ${effectiveMaxMb}MB`);
      return false;
    }

    const fileName = String(file.name || '').trim();
    const dotIdx = fileName.lastIndexOf('.');
    const ext = dotIdx >= 0 ? fileName.slice(dotIdx + 1).toLowerCase() : '';
    const mime = String(file.type || '').toLowerCase();
    const extraBlocked = Array.isArray(policyForbiddenExts)
      ? policyForbiddenExts.map(item => String(item || '').trim().toLowerCase().replace(/^\./, '')).filter(Boolean)
      : [];

    if ((ext && (BLOCKED_UPLOAD_EXTENSIONS.has(ext) || extraBlocked.includes(ext))) || (mime && BLOCKED_UPLOAD_MIMES.has(mime))) {
      toast.error('Định dạng tệp không an toàn hoặc không được phép tải lên (chặn HTML, SVG, mã thực thi)');
      return false;
    }

    if (accept === 'image/*') {
      const isValidImage = (mime.startsWith('image/') && mime !== 'image/svg+xml') || RASTER_IMAGE_EXTENSIONS.has(ext);
      if (!isValidImage) {
        toast.error('Vui lòng chỉ chọn tệp hình ảnh hợp lệ (PNG, JPG, WebP, GIF)');
        return false;
      }
    }

    return true;
  }, [accept, resolvedMaxMb, policyForbiddenExts]);

  const processFile = useCallback((file: File, customName?: string) => {
    if (!validateFile(file)) return;
    const fileName = customName || file.name;
    const ext = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toLowerCase() : '';
    const isImage = (file.type.startsWith('image/') && file.type !== 'image/svg+xml') || RASTER_IMAGE_EXTENSIONS.has(ext);
    const createdBlobUrl = isImage ? URL.createObjectURL(file) : '';
    const sizeStr = (file.size / (1024 * 1024)).toFixed(2) + ' MB';

    setPendingItemWithBlobTracking({
      file,
      previewUrl: createdBlobUrl,
      name: fileName,
      size: sizeStr,
      isImage,
      label: fileName.replace(/\.[^/.]+$/, '') || fileName
    }, createdBlobUrl || undefined);
  }, [validateFile, setPendingItemWithBlobTracking]);

  // Global & Local Paste Listener for Ctrl+V
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled || pendingItem || uploading || confirmInFlightRef.current || e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      const isRichEditable = Boolean(target && (target.isContentEditable || target.closest('[contenteditable="true"]')));
      const isTextControl = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || isRichEditable));

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // 1. Paste Image from Clipboard (skip if inside rich contenteditable editor that handles its own paste)
        if (item.type.indexOf('image') !== -1) {
          if (isRichEditable) return;
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const defaultName = `Screenshot_${getLocalDateStr()}_${Math.floor(Math.random() * 1000)}.png`;
            processFile(file, defaultName);
            return;
          }
        }

        // 2. Paste URL from Clipboard if it looks like a safe http(s) link and not typing inside a text field
        if (item.type === 'text/plain' && !isTextControl) {
          item.getAsString((text) => {
            const trimmed = (text || '').trim();
            if (isSafeDropzoneUrl(trimmed, false) && /^https?:\/\//i.test(trimmed)) {
              setPendingItemWithBlobTracking({
                url: trimmed,
                previewUrl: '',
                name: trimmed,
                isImage: false,
                label: 'Liên kết đính kèm'
              });
            }
          });
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [disabled, pendingItem, uploading, processFile, setPendingItemWithBlobTracking]);

  // Handle Drag & Drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (disabled || e.dataTransfer.files.length === 0) return;

    const file = e.dataTransfer.files[0];
    processFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    e.target.value = '';
  };

  const handleConfirm = async () => {
    if (!pendingItem || uploading || confirmInFlightRef.current) return;
    if (pendingItem.url && !isSafeDropzoneUrl(pendingItem.url, false)) {
      toast.error('Đường dẫn liên kết không hợp lệ hoặc không an toàn');
      clearPendingItem();
      return;
    }

    confirmInFlightRef.current = true;
    setUploading(true);
    try {
      await onConfirmUpload({
        file: pendingItem.file,
        url: pendingItem.url,
        label: pendingItem.label.trim() || pendingItem.name
      });
      clearPendingItem();
    } catch (err) {
      console.error('Upload preview confirm error:', err);
    } finally {
      confirmInFlightRef.current = false;
      setUploading(false);
    }
  };

  const safeModalPreviewUrl = pendingItem && isSafeDropzoneUrl(pendingItem.previewUrl, true) ? pendingItem.previewUrl : '';

  return (
    <>
      {/* Dropzone Box */}
      <div
        ref={containerRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        style={{
          border: isDragOver ? '2px dashed #BD1D2D' : '2px dashed #E2E8F0',
          borderRadius: '12px',
          padding: compact ? '1rem' : '1.5rem 1rem',
          textAlign: 'center',
          background: isDragOver ? 'rgba(189, 29, 45, 0.04)' : 'var(--color-bg, #F8FAFC)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.6 : 1,
          transition: 'all 0.2s ease',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
        className="hover-border-primary"
      >
        <input
          type="file"
          ref={fileInputRef}
          accept={accept}
          style={{ display: 'none' }}
          onChange={handleFileInputChange}
          disabled={disabled}
        />

        <div style={{
          width: compact ? 36 : 44,
          height: compact ? 36 : 44,
          borderRadius: '10px',
          background: isDragOver ? '#BD1D2D' : 'rgba(189, 29, 45, 0.08)',
          color: isDragOver ? '#ffffff' : '#BD1D2D',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease'
        }}>
          <Upload size={compact ? 18 : 22} />
        </div>

        <div>
          <p style={{ margin: 0, fontSize: compact ? '0.8125rem' : '0.875rem', fontWeight: 600, color: 'var(--color-text, #0F172A)' }}>
            {placeholder}
          </p>
          {subtext && (
            <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted, #64748B)' }}>
              {subtext}
            </p>
          )}
        </div>
      </div>

      {/* PREVIEW MODAL BEFORE CONFIRMING UPLOAD */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {pendingItem && (
            <motion.div
              key="paste-dropzone-preview-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              className="overlay-backdrop modal-above-drawer"
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: effectiveZIndex,
                ...({ '--modal-z': effectiveZIndex } as any),
                background: 'rgba(15, 23, 42, 0.55)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px'
              }}
              onClick={() => !uploading && !confirmInFlightRef.current && clearPendingItem()}
            >
              <motion.div
                key="paste-dropzone-preview-card"
                style={{
                  width: '100%',
                  maxWidth: '480px',
                  background: 'var(--color-surface, #ffffff)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 25px 60px rgba(15, 23, 42, 0.28)',
                  border: '1px solid #E2E8F0'
                }}
                initial={{ opacity: 0, scale: 0.96, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
                onClick={e => e.stopPropagation()}
              >
                {/* Modal Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid #E2E8F0'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: 30,
                      height: 30,
                      borderRadius: '8px',
                      background: 'rgba(189, 29, 45, 0.08)',
                      color: '#BD1D2D',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <Eye size={16} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text, #0F172A)' }}>
                      Xem trước đính kèm
                    </h4>
                  </div>
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => !confirmInFlightRef.current && clearPendingItem()}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-muted, #64748B)',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      padding: '4px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Body: Image or File Preview */}
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {pendingItem.isImage && safeModalPreviewUrl ? (
                    <div style={{
                      maxHeight: '260px',
                      width: '100%',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      background: '#0F172A',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '1px solid #E2E8F0'
                    }}>
                      <img
                        src={safeModalPreviewUrl}
                        alt={pendingItem.name}
                        style={{ maxHeight: '260px', maxWidth: '100%', objectFit: 'contain' }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      padding: '1.25rem',
                      borderRadius: '12px',
                      background: 'var(--color-bg, #F8FAFC)',
                      border: '1px solid #E2E8F0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <div style={{
                        width: 44,
                        height: 44,
                        borderRadius: '10px',
                        background: 'rgba(189, 29, 45, 0.08)',
                        color: '#BD1D2D',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {pendingItem.url ? <Link2 size={22} /> : <FileText size={22} />}
                      </div>
                      <div style={{ flex: 1, overflow: 'hidden' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text, #0F172A)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pendingItem.name}
                        </div>
                        {pendingItem.size && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #64748B)', marginTop: 2 }}>
                            Dung lượng: {pendingItem.size}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Edit Title/Label Input */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text, #0F172A)' }}>
                      Tên hiển thị đính kèm
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={pendingItem.label}
                      onChange={e => setPendingItem(prev => prev ? { ...prev, label: e.target.value } : null)}
                      placeholder="Nhập tên đính kèm..."
                    />
                  </div>
                </div>

                {/* Modal Footer Actions */}
                <div style={{
                  padding: '0.9rem 1.25rem',
                  borderTop: '1px solid #E2E8F0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '8px',
                  background: 'var(--color-bg, #F8FAFC)'
                }}>
                  <button
                    type="button"
                    className="btn outline sm"
                    disabled={uploading}
                    onClick={() => !confirmInFlightRef.current && clearPendingItem()}
                    style={{ borderRadius: '8px', padding: '7px 16px', border: '1px solid #E2E8F0', color: 'var(--color-text, #334155)', background: 'var(--color-surface, #ffffff)' }}
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    className="btn primary sm"
                    disabled={uploading}
                    onClick={handleConfirm}
                    style={{
                      backgroundColor: '#BD1D2D',
                      color: '#ffffff',
                      borderRadius: '8px',
                      padding: '7px 18px',
                      fontWeight: 700,
                      border: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      cursor: uploading ? 'not-allowed' : 'pointer',
                      opacity: uploading ? 0.65 : 1
                    }}
                  >
                    <Check size={15} />
                    <span>{uploading ? 'Đang tải lên...' : 'Xác nhận Tải lên'}</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
