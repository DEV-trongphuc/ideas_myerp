import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle2, X, User, UserCheck, Users, Calendar,
  FileText, CheckSquare, Tag, Check, Loader2,
  ExternalLink, FileSpreadsheet, Paperclip
} from 'lucide-react';
import { Avatar } from './Avatar';
import { useLanguage } from '../../contexts/LanguageContext';
import { parseTaskBody, formatVietnameseDescription } from '../../utils/taskBodyParser';
import { pushOverlay } from '../../utils/overlayStack';
import { formatDateVN } from '../../utils/dateUtils';
import { ensureArray } from '../../utils/safeArray';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';

export interface TaskCompleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: any | null;
  users: any[];
  onConfirm: (task: any) => Promise<void> | void;
  isSubmitting?: boolean;
}

const isSafeHttpUrl = (raw?: string | null): boolean => {
  if (!raw || typeof raw !== 'string') return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  const normalized = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (normalized.startsWith('javascript:') || normalized.startsWith('vbscript:') || normalized.startsWith('data:')) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

export const TaskCompleteConfirmModal: React.FC<TaskCompleteConfirmModalProps> = ({
  isOpen,
  onClose,
  task,
  users,
  onConfirm,
  isSubmitting = false
}) => {
  const { t } = useLanguage();
  const drawerMsSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);
  const zToastTopSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_toast_top', 2147483647);
  const effectiveZIndex = Math.max(Number(zToastTopSetting) || 2147483647, 2147483647);
  const motionDurationSec = Math.max(0.1, (Number(drawerMsSetting) || 220) / 1000);
  const [isAgreed, setIsAgreed] = useState(true);
  const confirmInFlightRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setIsAgreed(true);
      confirmInFlightRef.current = false;
    }
  }, [isOpen, task?.id]);

  const handleSafeClose = useCallback(() => {
    if (confirmInFlightRef.current || isSubmitting) return;
    onClose();
  }, [isSubmitting, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    return pushOverlay('task-complete-confirm-modal', handleSafeClose, effectiveZIndex);
  }, [isOpen, handleSafeClose, effectiveZIndex]);

  const handleConfirmClick = async () => {
    if (!task || !isAgreed || isSubmitting || confirmInFlightRef.current) return;
    confirmInFlightRef.current = true;
    try {
      await onConfirm(task);
    } finally {
      confirmInFlightRef.current = false;
    }
  };

  // Parse task body safely & comprehensively
  const parsedBody = useMemo(() => {
    if (!task) return null;
    const rawBody = task.body || task.description || '';
    return parseTaskBody(rawBody);
  }, [task?.body, task?.description]);

  if (typeof document === 'undefined') return null;

  const safeUsers = ensureArray(users);
  const showModal = Boolean(isOpen && task);

  // Resolve details safely when task is present
  const creatorUser = task ? safeUsers.find((u: any) => String(u.id) === String(task.created_by || task.creator_id)) : null;
  const creatorName = task ? (task.created_by_name || creatorUser?.full_name || creatorUser?.name || t('Người tạo việc')) : '';
  const creatorAvatar = task ? (task.created_by_avatar || creatorUser?.avatar_url || creatorUser?.avatar) : undefined;

  const assigneeUser = task ? safeUsers.find((u: any) => String(u.id) === String(task.user_id)) : null;
  const assigneeName = task ? (assigneeUser?.full_name || assigneeUser?.name || task.user_name || t('Chưa phân công')) : '';
  const assigneeAvatar = task ? (assigneeUser?.avatar_url || assigneeUser?.avatar || task.avatar_url) : undefined;

  const rawPIds = task ? String(task.participant_ids || '').split(',').map(s => s.trim()).filter(Boolean) : [];
  const participantUsers = rawPIds
    .map(id => safeUsers.find((u: any) => String(u.id) === String(id)))
    .filter(Boolean);

  let cleanDesc = parsedBody?.pureDescription || parsedBody?.description || '';
  if (task && !cleanDesc && typeof task.description === 'string' && !task.description.startsWith('{')) {
    cleanDesc = formatVietnameseDescription(task.description);
  }

  const urlRegex = /(https?:\/\/[^\s<>"']+)/gi;
  const detectedUrls = Array.from(new Set(cleanDesc.match(urlRegex) || [])).filter(u => isSafeHttpUrl(u));

  let displayDescription = cleanDesc;
  detectedUrls.forEach(url => {
    displayDescription = displayDescription.replace(url, '').trim();
  });
  displayDescription = displayDescription.replace(/\n{3,}/g, '\n\n').trim();

  const checklistItems = ensureArray(parsedBody?.checklist);
  const totalChecklist = checklistItems.length;
  const doneChecklist = checklistItems.filter((c: any) => Boolean(c?.checked || c?.done)).length;

  const isHighPriority = task?.priority === 'urgent' || task?.priority === 'high';
  const priorityColor = isHighPriority ? '#BD1D2D' : '#334155';
  const priorityBg = isHighPriority ? 'rgba(189, 29, 45, 0.08)' : '#F1F5F9';
  const priorityLabel =
    task?.priority === 'urgent' ? t('Khẩn cấp') :
    task?.priority === 'high' ? t('Ưu tiên cao') :
    task?.priority === 'medium' ? t('Bình thường') : t('Thấp');

  const dueDateDisplay = task?.due_date ? formatDateVN(task.due_date, '') : '';

  const modalNode = (
    <AnimatePresence>
      {showModal && task && (
        <motion.div
          key="task-complete-confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
          className="modal-backdrop modal-above-drawer"
          onClick={handleSafeClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: effectiveZIndex,
            ...({ '--modal-z': effectiveZIndex } as any),
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            boxSizing: 'border-box'
          }}
        >
          {/* Modal Window Card */}
          <motion.div
            key="task-complete-confirm-card"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '88vh',
              background: 'var(--color-surface, #ffffff)',
              border: '1px solid #E2E8F0',
              borderRadius: '16px',
              boxShadow: '0 25px 60px rgba(15, 23, 42, 0.3)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              zIndex: 1
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header Section */}
            <div style={{
              padding: '20px 24px 16px',
              borderBottom: '1px solid #E2E8F0',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              position: 'relative',
              background: 'var(--color-surface, #ffffff)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  borderRadius: '8px',
                  background: 'rgba(189, 29, 45, 0.08)',
                  color: '#BD1D2D',
                  fontSize: '0.73rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.03em'
                }}>
                  <CheckCircle2 size={14} strokeWidth={2} />
                  <span>{t('Xác nhận hoàn thành công việc')}</span>
                </div>

                <button
                  type="button"
                  onClick={handleSafeClose}
                  disabled={isSubmitting}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                    color: '#64748B',
                    padding: '6px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background-color 0.15s, color 0.15s'
                  }}
                  onMouseEnter={e => { if (!isSubmitting) { e.currentTarget.style.backgroundColor = '#F1F5F9'; e.currentTarget.style.color = '#0F172A'; } }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#64748B'; }}
                  title={t('Đóng')}
                >
                  <X size={18} />
                </button>
              </div>

              <h3 style={{
                margin: '4px 0 2px',
                fontSize: '1.12rem',
                fontWeight: 800,
                color: 'var(--color-text, #0F172A)',
                lineHeight: 1.4,
                letterSpacing: '-0.01em'
              }}>
                {task.subject || t('Không có tiêu đề')}
              </h3>

              {/* Meta Tags: Priority & Due Date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingTop: '2px' }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '3px 9px',
                  borderRadius: '8px',
                  background: priorityBg,
                  color: priorityColor,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}>
                  {priorityLabel}
                </span>

                {dueDateDisplay && (
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    color: '#64748B',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    <Calendar size={12} style={{ color: '#BD1D2D' }} />
                    <span>{t('Hạn chót')}: <strong style={{ color: '#0F172A' }}>{dueDateDisplay}</strong></span>
                  </span>
                )}

                {task.task_group_name && (
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: '#F8FAFC',
                    border: '1px solid #E2E8F0',
                    color: '#334155',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}>
                    <Tag size={12} style={{ color: '#BD1D2D' }} />
                    <span>{task.task_group_name}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Scrollable Body Content */}
            <div style={{
              padding: '18px 24px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              {/* Unified Personnel Card */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1.15fr',
                gap: '1px',
                background: '#E2E8F0',
                border: '1px solid #E2E8F0',
                borderRadius: '14px',
                overflow: 'hidden'
              }}>
                {/* Box 1: Người tạo */}
                <div style={{
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <User size={12} style={{ color: '#334155' }} />
                    <span>{t('Người tạo')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <Avatar src={creatorAvatar} name={creatorName} size={30} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {creatorName}
                    </span>
                  </div>
                </div>

                {/* Box 2: Thực hiện chính */}
                <div style={{
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <UserCheck size={12} style={{ color: '#BD1D2D' }} />
                    <span>{t('Thực hiện')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <Avatar src={assigneeAvatar} name={assigneeName} size={30} />
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {assigneeName}
                    </span>
                  </div>
                </div>

                {/* Box 3: Người liên quan */}
                <div style={{
                  background: '#F8FAFC',
                  padding: '12px 14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    <Users size={12} style={{ color: '#334155' }} strokeWidth={1.75} />
                    <span>{t('Liên quan')}</span>
                    {participantUsers.length > 0 && (
                      <span style={{ fontSize: '0.68rem', color: '#BD1D2D', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>({participantUsers.length})</span>
                    )}
                  </div>

                  {participantUsers.length > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {participantUsers.slice(0, 4).map((pUser: any, idx: number) => (
                        <div
                          key={pUser.id || idx}
                          title={pUser.full_name || pUser.name}
                          style={{
                            marginLeft: idx > 0 ? '-8px' : 0,
                            border: '2px solid #ffffff',
                            borderRadius: '50%',
                            zIndex: 10 - idx
                          }}
                        >
                          <Avatar src={pUser.avatar_url || pUser.avatar} name={pUser.full_name || pUser.name} size={28} />
                        </div>
                      ))}
                      {participantUsers.length > 4 && (
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#E2E8F0',
                          border: '2px solid #ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          color: '#0F172A',
                          marginLeft: '-8px',
                          zIndex: 5
                        }}>
                          +{participantUsers.length - 4}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                      {t('Không có')}
                    </span>
                  )}
                </div>
              </div>

              {/* Task Content / Description Card */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <FileText size={13} />
                  <span>{t('Nội dung công việc')}</span>
                </label>

                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  maxHeight: '180px',
                  overflowY: 'auto'
                }}>
                  {displayDescription ? (
                    <div style={{
                      fontSize: '0.8125rem',
                      color: '#0F172A',
                      lineHeight: 1.6,
                      whiteSpace: 'pre-line',
                      wordBreak: 'break-word'
                    }}>
                      {displayDescription}
                    </div>
                  ) : !detectedUrls.length && !checklistItems.length ? (
                    <span style={{ fontSize: '0.78rem', color: '#64748B' }}>
                      {t('Không có mô tả chi tiết kèm theo.')}
                    </span>
                  ) : null}

                  {/* Detected Links Cards */}
                  {detectedUrls.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: displayDescription ? '4px' : 0 }}>
                      {detectedUrls.map((url, idx) => {
                        const isSheet = url.includes('spreadsheets') || url.includes('excel') || url.includes('.xlsx');
                        return (
                          <a
                            key={idx}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 12px',
                              borderRadius: '10px',
                              background: '#ffffff',
                              border: '1px solid #E2E8F0',
                              color: '#BD1D2D',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              textDecoration: 'none',
                              transition: 'border-color 0.15s, box-shadow 0.15s'
                            }}
                          >
                            {isSheet ? (
                              <FileSpreadsheet size={15} style={{ color: '#334155', flexShrink: 0 }} />
                            ) : (
                              <Paperclip size={14} style={{ color: '#BD1D2D', flexShrink: 0 }} />
                            )}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                              {url}
                            </span>
                            <ExternalLink size={12} style={{ opacity: 0.7, flexShrink: 0 }} />
                          </a>
                        );
                      })}
                    </div>
                  )}

                  {/* Checklist Summary & Items */}
                  {checklistItems.length > 0 && (
                    <div style={{
                      marginTop: '4px',
                      paddingTop: '8px',
                      borderTop: '1px dashed #E2E8F0',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color: '#64748B' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <CheckSquare size={12} />
                          <span>{t('Danh sách việc con (Checklist)')}</span>
                        </span>
                        <span style={{ color: doneChecklist === totalChecklist ? '#10b981' : '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                          {doneChecklist}/{totalChecklist} {t('hoàn thành')}
                        </span>
                      </div>
                      {checklistItems.map((c: any, cIdx: number) => {
                        const isDone = Boolean(c?.checked || c?.done);
                        return (
                          <div key={c?.id || cIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: isDone ? '#64748B' : '#0F172A' }}>
                            <span style={{
                              width: 14,
                              height: 14,
                              borderRadius: '4px',
                              background: isDone ? '#10b981' : 'transparent',
                              border: isDone ? 'none' : '1.5px solid #CBD5E1',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.6rem',
                              flexShrink: 0
                            }}>
                              {isDone && '✓'}
                            </span>
                            <span style={{ textDecoration: isDone ? 'line-through' : 'none' }}>
                              {c?.text || c?.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Confirmation Toggle Box */}
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                background: isAgreed ? 'rgba(189, 29, 45, 0.05)' : '#F8FAFC',
                border: isAgreed ? '1px solid rgba(189, 29, 45, 0.35)' : '1px solid #E2E8F0',
                borderRadius: '12px',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.15s ease'
              }}>
                <input
                  type="checkbox"
                  checked={isAgreed}
                  onChange={e => setIsAgreed(e.target.checked)}
                  style={{
                    width: '18px',
                    height: '18px',
                    accentColor: '#BD1D2D',
                    cursor: 'pointer',
                    flexShrink: 0
                  }}
                />
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', lineHeight: 1.4 }}>
                  {t('Tôi xác nhận công việc này đã hoàn thành đầy đủ và đạt yêu cầu.')}
                </span>
              </label>
            </div>

            {/* Footer Actions */}
            <div style={{
              padding: '14px 24px',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '10px',
              background: '#F8FAFC'
            }}>
              <button
                type="button"
                onClick={handleSafeClose}
                disabled={isSubmitting}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  background: '#ffffff',
                  color: '#334155',
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.15s'
                }}
              >
                {t('Hủy bỏ')}
              </button>

              <button
                type="button"
                disabled={!isAgreed || isSubmitting}
                onClick={handleConfirmClick}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 22px',
                  borderRadius: '10px',
                  border: 'none',
                  background: isAgreed ? '#BD1D2D' : '#CBD5E1',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  cursor: !isAgreed || isSubmitting ? 'not-allowed' : 'pointer',
                  boxShadow: isAgreed ? '0 4px 12px rgba(189, 29, 45, 0.25)' : 'none',
                  opacity: !isAgreed || isSubmitting ? 0.55 : 1,
                  transition: 'all 0.2s ease'
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={15} className="spin" />
                    <span>{t('Đang lưu...')}</span>
                  </>
                ) : (
                  <>
                    <Check size={16} strokeWidth={2.5} />
                    <span>{t('Xác nhận hoàn thành')}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(modalNode, document.body);
};
