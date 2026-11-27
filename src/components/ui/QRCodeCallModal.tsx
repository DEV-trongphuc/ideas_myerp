import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Smartphone, Copy, Check, AlertCircle } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import { QRCodeCanvas } from 'qrcode.react';
import { pushOverlay } from '../../utils/overlayStack';

export const QRCodeCallModal: React.FC = () => {
  const callModal = useUIStore((s) => s.callModal);
  const closeCall = useUIStore((s) => s.closeCall);
  const addToast = useUIStore((s) => s.addToast);
  const { isOpen, phone } = callModal;
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rawPhone = String(phone || '').trim();
  const isMasked = rawPhone.includes('*');
  const cleanDigits = isMasked ? '' : rawPhone.replace(/[^\d+]/g, '');
  const telLink = cleanDigits ? `tel:${cleanDigits}` : '';

  useEffect(() => {
    if (!isOpen) {
      setCopied(false);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      return;
    }
    return pushOverlay('qr-call-modal', closeCall, 2147483646);
  }, [isOpen, closeCall]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopyPhone = async () => {
    if (!rawPhone || isMasked) {
      addToast('Số điện thoại không khả dụng để sao chép', 'error');
      return;
    }
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(cleanDigits || rawPhone);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = cleanDigits || rawPhone;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (!ok) throw new Error('Copy failed');
      }
      setCopied(true);
      addToast('Đã sao chép số điện thoại', 'success');
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast('Không thể sao chép số điện thoại', 'error');
    }
  };

  const content = (
    <AnimatePresence>
      {isOpen && (
        <div
          className="overlay-backdrop modal-above-drawer"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2147483646,
            ...({ '--modal-z': 2147483646 } as React.CSSProperties),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
            contain: 'strict',
            willChange: 'opacity'
          }}
          onClick={closeCall}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              zIndex: -1,
              contain: 'strict'
            }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 400,
              background: 'var(--color-surface, #ffffff)',
              border: '1px solid var(--color-border, #E2E8F0)',
              borderRadius: '16px',
              boxShadow: '0 20px 48px rgba(15, 23, 42, 0.25)',
              overflow: 'hidden',
              willChange: 'transform, opacity',
              transform: 'translate3d(0, 0, 0)',
              contain: 'layout style'
            }}
          >
            <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border-light, #E2E8F0)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 38, height: 38, borderRadius: '10px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Smartphone size={18} />
                </div>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: '1.05rem', margin: 0, color: 'var(--color-text, #0F172A)' }}>Quét mã để gọi</h3>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted, #64748B)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{rawPhone || '—'}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={closeCall}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted, #64748B)', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '1.75rem 1.5rem', textAlign: 'center' }}>
              {telLink ? (
                <div
                  style={{
                    width: 220,
                    height: 220,
                    margin: '0 auto 1.25rem',
                    padding: '16px',
                    background: '#ffffff',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
                  }}
                >
                  <QRCodeCanvas
                    value={telLink}
                    size={188}
                    level="H"
                    includeMargin={false}
                    imageSettings={{
                      src: '/favicon.ico',
                      x: undefined,
                      y: undefined,
                      height: 24,
                      width: 24,
                      excavate: true
                    }}
                  />
                </div>
              ) : (
                <div
                  style={{
                    padding: '2rem 1rem',
                    marginBottom: '1.25rem',
                    borderRadius: '14px',
                    background: 'var(--color-bg, #F8FAFC)',
                    border: '1px solid var(--color-border, #E2E8F0)',
                    color: 'var(--color-text-muted, #64748B)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <AlertCircle size={28} color="#BD1D2D" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Số điện thoại không hợp lệ hoặc đang được bảo mật</span>
                </div>
              )}

              <div className="alert-info" style={{ marginBottom: '1.25rem', textAlign: 'left', fontSize: '0.8125rem' }}>
                <p style={{ margin: 0 }}>Mở camera trên điện thoại của bạn để quét mã và thực hiện cuộc gọi nhanh chóng.</p>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={handleCopyPhone}
                  disabled={!telLink}
                  className={`btn ${copied ? 'success' : 'primary'}`}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    height: '40px',
                    borderRadius: '10px',
                    transition: 'background-color 0.2s cubic-bezier(0.25, 0.1, 0.25, 1)',
                    background: copied ? 'var(--color-success, #10b981)' : undefined,
                    opacity: !telLink ? 0.5 : 1,
                    cursor: !telLink ? 'not-allowed' : 'pointer'
                  }}
                >
                  {copied ? (
                    <>
                      <Check size={16} /> Đã sao chép!
                    </>
                  ) : (
                    <>
                      <Copy size={16} /> Sao chép số
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null;
};
