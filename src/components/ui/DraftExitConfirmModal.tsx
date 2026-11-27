import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, LogOut, Edit3, AlertCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { pushOverlay } from '../../utils/overlayStack';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';

export interface DraftExitConfirmModalProps {
  isOpen: boolean;
  onSaveDraft: () => void | Promise<void>;
  onDiscard: () => void;
  onContinue: () => void;
  title?: string;
  message?: string;
  saveDraftText?: string;
  discardText?: string;
  continueText?: string;
  zIndex?: number;
}

export const DraftExitConfirmModal: React.FC<DraftExitConfirmModalProps> = ({
  isOpen,
  onSaveDraft,
  onDiscard,
  onContinue,
  title = 'Bạn có thay đổi chưa lưu',
  message = 'Bạn đang nhập thông tin dở dang. Nếu rời đi lúc này, dữ liệu vừa nhập sẽ bị mất. Bạn muốn làm gì?',
  saveDraftText = 'Lưu nháp',
  discardText = 'Rời khỏi',
  continueText = 'Tiếp tục chỉnh sửa',
  zIndex
}) => {
  const { t } = useLanguage();
  const drawerMsSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);
  const zToastTopSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_toast_top', 2147483647);
  const defaultZTop = Math.max(Number(zToastTopSetting) || 2147483647, 2147483647);
  const motionDurationSec = Math.max(0.1, (Number(drawerMsSetting) || 220) / 1000);
  const [isSaving, setIsSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth <= 768 : false);
  const actionInFlightRef = useRef(false);
  const effectiveZIndex = Math.max(zIndex || defaultZTop, 2147483647);

  useEffect(() => {
    if (isOpen) {
      actionInFlightRef.current = false;
      setIsSaving(false);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleContinueClick = useCallback(() => {
    if (isSaving || actionInFlightRef.current) return;
    onContinue();
  }, [isSaving, onContinue]);

  const handleDiscardClick = useCallback(() => {
    if (isSaving || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      onDiscard();
    } finally {
      actionInFlightRef.current = false;
    }
  }, [isSaving, onDiscard]);

  // Register in LIFO overlay stack for ESC and Mobile Back button dismissal
  useEffect(() => {
    if (!isOpen) return;
    return pushOverlay('draft-exit-confirm-modal', handleContinueClick, effectiveZIndex);
  }, [isOpen, handleContinueClick, effectiveZIndex]);

  const handleSaveDraftClick = async () => {
    if (isSaving || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setIsSaving(true);
    try {
      const res = onSaveDraft();
      if (res && typeof (res as any).then === 'function') {
        await res;
      }
    } catch (err) {
      console.error('Error in onSaveDraft:', err);
    } finally {
      actionInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="draft-exit-confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
          className="modal-backdrop modal-above-drawer"
          onClick={handleContinueClick}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: effectiveZIndex,
            ...({ '--modal-z': effectiveZIndex } as any),
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: isMobile ? '1rem' : '1.5rem',
            overflowY: 'auto'
          }}
        >
          {/* Modal Content */}
          <motion.div
            key="draft-exit-confirm-card"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              zIndex: 10,
              width: '100%',
              maxWidth: isMobile ? '94%' : '580px',
              background: 'var(--color-surface, #ffffff)',
              borderRadius: '16px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.28)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ padding: isMobile ? '1.25rem' : '1.75rem' }}>
              {/* Header Icon & Title */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', marginBottom: '1rem' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    border: '1px solid rgba(189, 29, 45, 0.16)'
                  }}
                >
                  <AlertCircle size={22} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: isMobile ? '1.05rem' : '1.15rem',
                      fontWeight: 800,
                      color: 'var(--color-text, #0F172A)',
                      lineHeight: 1.35
                    }}
                  >
                    {t(title)}
                  </h3>
                  <p
                    style={{
                      margin: '6px 0 0 0',
                      fontSize: isMobile ? '0.84rem' : '0.88rem',
                      color: 'var(--color-text-muted, #64748B)',
                      lineHeight: 1.55
                    }}
                  >
                    {t(message)}
                  </p>
                </div>
              </div>

              {/* Action Buttons: Rời khỏi bên trái, Lưu nháp & Tiếp tục chỉnh sửa bên phải */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: isMobile ? 'column' : 'row',
                  gap: '12px',
                  marginTop: '1.5rem',
                  justifyContent: 'space-between',
                  alignItems: isMobile ? 'stretch' : 'center'
                }}
              >
                {/* 1. Discard & exit */}
                <button
                  type="button"
                  onClick={handleDiscardClick}
                  disabled={isSaving}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '10px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    background: 'rgba(189, 29, 45, 0.08)',
                    border: '1px solid rgba(189, 29, 45, 0.22)',
                    color: '#BD1D2D',
                    cursor: isSaving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'background-color 0.16s ease',
                    order: isMobile ? 3 : 1
                  }}
                >
                  <LogOut size={15} style={{ flexShrink: 0, transform: 'scaleX(-1)' }} />
                  <span style={{ whiteSpace: 'nowrap' }}>{t(discardText)}</span>
                </button>

                {/* 2 & 3. Save draft + Continue editing */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    gap: '8px',
                    alignItems: isMobile ? 'stretch' : 'center',
                    justifyContent: 'flex-end',
                    order: isMobile ? 1 : 2
                  }}
                >
                  <button
                    type="button"
                    onClick={handleSaveDraftClick}
                    disabled={isSaving}
                    style={{
                      padding: '9px 16px',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      background: 'var(--color-bg, #F8FAFC)',
                      border: '1px solid #E2E8F0',
                      color: 'var(--color-text, #0F172A)',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      transition: 'background-color 0.16s ease',
                      order: isMobile ? 2 : 1
                    }}
                  >
                    {isSaving ? <RefreshCw size={15} className="spin" style={{ flexShrink: 0 }} /> : <FileText size={15} style={{ flexShrink: 0, color: '#334155' }} />}
                    <span style={{ whiteSpace: 'nowrap' }}>{isSaving ? `${t('Đang lưu nháp')}...` : t(saveDraftText)}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleContinueClick}
                    disabled={isSaving}
                    className="btn primary"
                    style={{
                      padding: '9px 20px',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      background: '#BD1D2D',
                      border: '1px solid #BD1D2D',
                      color: '#ffffff',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      boxShadow: '0 4px 12px rgba(189, 29, 45, 0.25)',
                      order: isMobile ? 1 : 2
                    }}
                  >
                    <Edit3 size={15} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap' }}>{t(continueText)}</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
