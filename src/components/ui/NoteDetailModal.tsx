import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Copy, Check, Globe, FileText, X, Link2 } from 'lucide-react';
import { pushOverlay } from '../../utils/overlayStack';
import toast from 'react-hot-toast';

interface NoteDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  itemName?: string;
  notes?: string;
  zIndex?: number;
}

function isSafeHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

// Helper to extract URLs from text
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;
  const matches = text.match(urlRegex);
  if (!matches) return [];
  return Array.from(
    new Set(
      matches
        .map((u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`))
        .filter(isSafeHttpUrl)
    )
  );
}

// Helper to render text with clickable links
export function renderLinkifiedText(text: string) {
  if (!text) return null;
  const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;
  const parts = text.split(urlRegex);

  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      const href = /^https?:\/\//i.test(part) ? part : `https://${part}`;
      if (!isSafeHttpUrl(href)) return <span key={index}>{part}</span>;
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{
            color: '#BD1D2D',
            textDecoration: 'underline',
            wordBreak: 'break-all',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            margin: '0 2px'
          }}
          title="Nhấn để mở liên kết trong tab mới"
        >
          {part}
          <ExternalLink size={12} style={{ flexShrink: 0 }} />
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export const NoteCell: React.FC<{
  notes?: string;
  itemName?: string;
  onOpenModal: (noteData: { notes: string; itemName?: string }) => void;
}> = ({ notes, itemName, onOpenModal }) => {
  if (!notes) {
    return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
  }

  const urls = extractUrls(notes);
  const isUrl = urls.length > 0;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onOpenModal({ notes, itemName });
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        maxWidth: '100%',
        cursor: 'pointer',
        padding: '3px 6px',
        borderRadius: '6px',
        transition: 'all 0.15s ease',
        background: isUrl ? 'rgba(189, 29, 45, 0.05)' : 'transparent',
        border: isUrl ? '1px solid rgba(189, 29, 45, 0.2)' : '1px solid transparent'
      }}
      className="hover-bg"
      title="Nhấn để xem đầy đủ nội dung"
    >
      {isUrl ? (
        <>
          <Globe size={13} style={{ color: '#BD1D2D', flexShrink: 0 }} />
          <span
            style={{
              color: '#BD1D2D',
              fontWeight: 600,
              textDecoration: 'underline',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '200px',
              fontSize: '0.8rem'
            }}
          >
            {notes}
          </span>
          <a
            href={urls[0]}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '2px 5px',
              borderRadius: '4px',
              background: 'rgba(189, 29, 45, 0.1)',
              color: '#BD1D2D',
              fontSize: '0.7rem',
              fontWeight: 700,
              textDecoration: 'none',
              flexShrink: 0,
              gap: '2px'
            }}
            title="Mở liên kết trong tab mới"
          >
            <ExternalLink size={11} />
          </a>
        </>
      ) : (
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '260px',
            color: 'var(--color-text)',
            fontSize: '0.8rem'
          }}
        >
          {notes}
        </span>
      )}
    </div>
  );
};

export const NoteDetailModal: React.FC<NoteDetailModalProps> = ({
  isOpen,
  onClose,
  title = 'Ghi chú / Mục đích sử dụng',
  itemName,
  notes = '',
  zIndex = 2147483646
}) => {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const copyAllTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyLinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveZIndex = zIndex ? Math.min(Math.max(zIndex, 2147483640), 2147483646) : 2147483646;

  useEffect(() => {
    if (isOpen) {
      return pushOverlay('note-detail-modal', onClose, effectiveZIndex);
    } else {
      setCopiedLink(null);
      setCopiedAll(false);
    }
  }, [isOpen, onClose, effectiveZIndex]);

  useEffect(() => {
    return () => {
      if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
      if (copyLinkTimerRef.current) clearTimeout(copyLinkTimerRef.current);
    };
  }, []);

  const safeNotes = typeof notes === 'string' ? notes : String(notes ?? '');
  const detectedUrls = extractUrls(safeNotes);
  const trimmedNotes = safeNotes.trim();
  const isPureUrl =
    detectedUrls.length === 1 &&
    (trimmedNotes === detectedUrls[0] || `https://${trimmedNotes}` === detectedUrls[0]);

  const handleCopy = async (textToCopy: string, isFullText = false) => {
    if (!textToCopy) return;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) throw new Error('Copy failed');
      }

      if (isFullText) {
        setCopiedAll(true);
        if (copyAllTimerRef.current) clearTimeout(copyAllTimerRef.current);
        copyAllTimerRef.current = setTimeout(() => setCopiedAll(false), 2000);
      } else {
        setCopiedLink(textToCopy);
        if (copyLinkTimerRef.current) clearTimeout(copyLinkTimerRef.current);
        copyLinkTimerRef.current = setTimeout(() => setCopiedLink(null), 2000);
      }
    } catch {
      toast.error('Không thể sao chép nội dung');
    }
  };

  const modalNode = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="overlay-backdrop modal-above-drawer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: effectiveZIndex,
            ...({ '--modal-z': effectiveZIndex } as React.CSSProperties),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--color-surface, #FFFFFF)',
              border: '1px solid var(--color-border-light, #E2E8F0)',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 40px -10px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--color-border-light, #E2E8F0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--color-bg-secondary, #F8FAFC)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: isPureUrl ? 'rgba(15, 23, 42, 0.06)' : 'rgba(189, 29, 45, 0.08)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isPureUrl ? '#334155' : '#BD1D2D'
                  }}
                >
                  {isPureUrl ? <Globe size={18} /> : <FileText size={18} />}
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.975rem', fontWeight: 700, color: 'var(--color-text, #0F172A)' }}>
                    {title}
                  </h3>
                  {itemName && (
                    <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--color-text-muted, #64748B)' }}>
                      Vật phẩm: <strong style={{ color: 'var(--color-text, #0F172A)' }}>{itemName}</strong>
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="btn-icon sm"
                style={{
                  borderRadius: '8px',
                  color: 'var(--color-text-muted)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px'
                }}
                title="Đóng (ESC)"
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div
              style={{
                padding: '20px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              <div>
                <label
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    display: 'block',
                    marginBottom: '8px'
                  }}
                >
                  Nội dung chi tiết
                </label>
                <div
                  style={{
                    background: 'var(--color-bg-secondary, #F8FAFC)',
                    border: '1px solid var(--color-border-light, #E2E8F0)',
                    borderRadius: '12px',
                    padding: '14px 16px',
                    fontSize: '0.875rem',
                    color: 'var(--color-text, #0F172A)',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    userSelect: 'text'
                  }}
                >
                  {renderLinkifiedText(safeNotes)}
                </div>
              </div>

              {detectedUrls.length > 0 && (
                <div>
                  <label
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      color: '#334155',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      marginBottom: '8px'
                    }}
                  >
                    <Link2 size={14} />
                    Liên kết nhận diện được ({detectedUrls.length})
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {detectedUrls.map((url, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          background: 'rgba(15, 23, 42, 0.03)',
                          border: '1px solid var(--color-border-light, #E2E8F0)',
                          borderRadius: '10px',
                          padding: '10px 14px'
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            overflow: 'hidden',
                            minWidth: 0
                          }}
                        >
                          <Globe size={16} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                          <span
                            style={{
                              fontSize: '0.8125rem',
                              color: '#0F172A',
                              fontWeight: 600,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              wordBreak: 'break-all'
                            }}
                            title={url}
                          >
                            {url}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleCopy(url)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '6px',
                              border: '1px solid var(--color-border-light, #E2E8F0)',
                              background: 'var(--color-surface, #FFFFFF)',
                              color: copiedLink === url ? '#10b981' : 'var(--color-text, #0F172A)',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            title="Sao chép liên kết"
                          >
                            {copiedLink === url ? <Check size={13} /> : <Copy size={13} />}
                            {copiedLink === url ? 'Đã chép' : 'Sao chép'}
                          </button>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 12px',
                              borderRadius: '6px',
                              border: 'none',
                              background: '#BD1D2D',
                              color: '#ffffff',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              textDecoration: 'none',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            <ExternalLink size={13} />
                            Mở link
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--color-border-light, #E2E8F0)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--color-bg-secondary, #F8FAFC)'
              }}
            >
              <button
                type="button"
                onClick={() => handleCopy(safeNotes, true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border-light, #E2E8F0)',
                  background: 'var(--color-surface, #FFFFFF)',
                  color: copiedAll ? '#10b981' : 'var(--color-text, #0F172A)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {copiedAll ? <Check size={14} /> : <Copy size={14} />}
                {copiedAll ? 'Đã sao chép toàn bộ' : 'Sao chép toàn bộ'}
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {detectedUrls.length > 0 && (
                  <a
                    href={detectedUrls[0]}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: '#BD1D2D',
                      color: '#ffffff',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      textDecoration: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    <ExternalLink size={14} />
                    Mở liên kết
                  </a>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border-light, #E2E8F0)',
                    background: 'var(--color-surface, #FFFFFF)',
                    color: 'var(--color-text, #0F172A)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Đóng
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalNode, document.body) : null;
};
