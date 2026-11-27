import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, Search, Share2, Users, Check, Loader2, 
  Image as ImageIcon, FileText, Briefcase 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatStore } from '../../store/chatStore';
import { useShallow } from 'zustand/react/shallow';
import { Avatar } from '../ui/Avatar';
import type { ChatMessage } from '../../types/chat';
import toast from 'react-hot-toast';
import { pushOverlay } from '../../utils/overlayStack';

interface ChatForwardModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: ChatMessage | null;
}

interface TargetItem {
  key: string;
  type: 'conversation' | 'staff';
  id: number;
  name: string;
  avatar?: string;
  subtitle?: string;
  isGroup?: boolean;
}

export const ChatForwardModal: React.FC<ChatForwardModalProps> = ({
  isOpen,
  onClose,
  message
}) => {
  if (!isOpen || !message || typeof document === 'undefined') return null;
  return <ChatForwardModalInner onClose={onClose} message={message} />;
};

const ChatForwardModalInner: React.FC<Omit<ChatForwardModalProps, 'isOpen'> & { message: ChatMessage }> = ({
  onClose,
  message
}) => {
  const {
    conversations,
    staffDirectory,
    forwardMessage,
    startDirectChat
  } = useChatStore(
    useShallow((s) => ({
      conversations: s.conversations,
      staffDirectory: s.staffDirectory,
      forwardMessage: s.forwardMessage,
      startDirectChat: s.startDirectChat,
    }))
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'conversations' | 'staff'>('all');
  const [selectedTargets, setSelectedTargets] = useState<Map<string, TargetItem>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    const unregister = pushOverlay('chat-forward-modal', onClose, 2200);
    return () => unregister();
  }, [onClose]);

  // Normalize vietnamese string for accent-insensitive search
  const normalizeText = (text: string) =>
    (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  // Build target items list
  const allTargets = useMemo(() => {
    const list: TargetItem[] = [];
    const safeConversations = Array.isArray(conversations) ? conversations : [];
    const safeStaff = Array.isArray(staffDirectory) ? staffDirectory : [];

    // 1. Conversations
    safeConversations.forEach((c) => {
      const isDirect = c.type === 'direct';
      const name = isDirect && c.other_user?.full_name
        ? c.other_user.full_name
        : (c.title || 'Cuộc trò chuyện');
      const avatar = isDirect && c.other_user?.avatar_url
        ? c.other_user.avatar_url
        : (c.avatar_url || c.other_user?.avatar_url);

      list.push({
        key: `conv_${c.id}`,
        type: 'conversation',
        id: c.id,
        name,
        avatar,
        subtitle: isDirect ? (c.other_user?.job_title || 'Trò chuyện trực tiếp') : `Nhóm • ${c.participants?.length || c.participant_count || 0} thành viên`,
        isGroup: !isDirect
      });
    });

    // 2. Staff directory (exclude users who already have a direct conversation in the list to avoid duplicate entries)
    const existingDirectOtherUserIds = new Set(
      safeConversations
        .filter((c) => c.type === 'direct' && c.other_user?.id)
        .map((c) => Number(c.other_user?.id))
    );

    safeStaff.forEach((s) => {
      if (!existingDirectOtherUserIds.has(s.id)) {
        list.push({
          key: `staff_${s.id}`,
          type: 'staff',
          id: s.id,
          name: s.full_name,
          avatar: s.avatar_url,
          subtitle: s.job_title || s.team_name || 'Nhân sự',
          isGroup: false
        });
      }
    });

    return list;
  }, [conversations, staffDirectory]);

  const convTabCount = useMemo(
    () => allTargets.filter((t) => t.type === 'conversation').length,
    [allTargets]
  );
  const staffTabCount = useMemo(
    () => allTargets.filter((t) => t.type === 'staff').length,
    [allTargets]
  );

  // Filtered targets based on search and tab
  const filteredTargets = useMemo(() => {
    let result = allTargets;

    if (activeFilterTab === 'conversations') {
      result = result.filter((t) => t.type === 'conversation');
    } else if (activeFilterTab === 'staff') {
      result = result.filter((t) => t.type === 'staff');
    }

    if (searchQuery.trim()) {
      const q = normalizeText(searchQuery.trim());
      result = result.filter((t) =>
        normalizeText(t.name).includes(q) || normalizeText(t.subtitle || '').includes(q)
      );
    }

    return result;
  }, [allTargets, activeFilterTab, searchQuery]);

  const toggleSelectTarget = (target: TargetItem) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev);
      if (next.has(target.key)) {
        next.delete(target.key);
      } else {
        next.set(target.key, target);
      }
      return next;
    });
  };

  const handleSendForward = async () => {
    if (!message || selectedTargets.size === 0 || isSubmitting || inFlightRef.current) return;
    inFlightRef.current = true;
    setIsSubmitting(true);

    try {
      const targets = Array.from(selectedTargets.values());
      const convIds = targets
        .filter((t) => t.type === 'conversation')
        .map((t) => t.id);

      const staffTargets = targets.filter((t) => t.type === 'staff');
      const createdIds = await Promise.all(
        staffTargets.map(async (t) => {
          try {
            return await startDirectChat(t.id);
          } catch {
            return null;
          }
        })
      );

      const targetConvIds = Array.from(
        new Set<number>([
          ...convIds,
          ...(createdIds.filter((id): id is number => Boolean(id && id > 0)))
        ])
      );

      if (targetConvIds.length > 0) {
        const ok = await forwardMessage(message, targetConvIds);
        if (ok) {
          setSelectedTargets(new Map());
          setSearchQuery('');
          onClose();
        }
      } else {
        toast.error('Không tìm thấy cuộc trò chuyện đích để chuyển tiếp');
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e?.message || 'Lỗi khi chuyển tiếp tin nhắn');
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="chat-forward-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.65)',
          backdropFilter: 'blur(4px)',
          zIndex: 2147483647,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px'
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
            background: '#ffffff',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '480px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.22)',
            border: '1px solid #e2e8f0',
            overflow: 'hidden'
          }}
        >
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: 'rgba(189, 29, 45, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#BD1D2D'
              }}>
                <Share2 size={16} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Chuyển tiếp tin nhắn
                </h3>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Chọn cuộc trò chuyện hoặc đồng nghiệp để gửi
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '6px',
                cursor: 'pointer',
                color: '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Forwarded Content Preview Box */}
          <div style={{
            padding: '10px 18px',
            background: '#f8fafc',
            borderBottom: '1px solid #f1f5f9'
          }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', marginBottom: '5px' }}>
              NỘI DUNG CHUYỂN TIẾP:
            </div>
            <div style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderLeft: '3px solid #BD1D2D',
              borderRadius: '8px',
              padding: '8px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.8rem',
              color: '#1e293b'
            }}>
              {message.message_type === 'image' ? (
                <>
                  <div style={{ width: 28, height: 28, borderRadius: '6px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#BD1D2D' }}>
                    <ImageIcon size={15} />
                  </div>
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700 }}>[Hình ảnh]</span> {message.content || 'Đính kèm hình ảnh'}
                  </div>
                </>
              ) : message.message_type === 'file' ? (
                <>
                  <div style={{ width: 28, height: 28, borderRadius: '6px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#BD1D2D' }}>
                    <FileText size={15} />
                  </div>
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 700 }}>[Tệp tin]</span> {message.metadata?.file_name || message.content}
                  </div>
                </>
              ) : message.message_type === 'sticker' ? (
                <>
                  <span style={{ fontSize: '1.2rem' }}>{message.metadata?.icon || '🌟'}</span>
                  <div style={{ fontWeight: 700, color: '#BD1D2D' }}>
                    [Nhãn dán] {message.metadata?.badgeText || message.content}
                  </div>
                </>
              ) : message.message_type === 'erp_card' ? (
                <>
                  <div style={{ width: 28, height: 28, borderRadius: '6px', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#BD1D2D' }}>
                    <Briefcase size={15} />
                  </div>
                  <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 800, color: '#BD1D2D' }}>[{message.metadata?.badge || 'ERP'}]</span> {message.metadata?.title || message.content}
                  </div>
                </>
              ) : (
                <div style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.35
                }}>
                  {message.content}
                </div>
              )}
            </div>
          </div>

          {/* Search Box & Filter Tabs */}
          <div style={{ padding: '12px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '6px 12px',
              marginBottom: '10px'
            }}>
              <Search size={15} color="#94a3b8" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm cuộc trò chuyện hoặc người nhận..."
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  width: '100%',
                  fontSize: '0.82rem',
                  color: '#0f172a'
                }}
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Quick Filter Segmented Tray */}
            <div style={{
              display: 'inline-flex',
              padding: '3px',
              borderRadius: '10px',
              background: '#f1f5f9',
              border: '1px solid #e2e8f0',
              gap: '2px',
              flexWrap: 'wrap'
            }}>
              {[
                { id: 'all', label: 'Tất cả', count: allTargets.length },
                { id: 'conversations', label: 'Cuộc trò chuyện', count: convTabCount },
                { id: 'staff', label: 'Đồng nghiệp', count: staffTabCount }
              ].map((tab) => {
                const isActive = activeFilterTab === tab.id;
                return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilterTab(tab.id as any)}
                  style={{
                    height: '30px',
                    padding: '0 12px',
                    borderRadius: '7px',
                    border: 'none',
                    fontSize: '0.74rem',
                    fontWeight: isActive ? 700 : 600,
                    cursor: 'pointer',
                    background: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#BD1D2D' : '#64748b',
                    boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {tab.label} ({tab.count})
                </button>
                );
              })}
            </div>
          </div>

          {/* Target List */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            maxHeight: '340px',
            padding: '8px 12px'
          }}>
            {filteredTargets.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '36px 16px', color: '#94a3b8', fontSize: '0.82rem' }}>
                Không tìm thấy người nhận phù hợp
              </div>
            ) : (
              filteredTargets.map((target) => {
                const isSelected = selectedTargets.has(target.key);
                return (
                  <div
                    key={target.key}
                    onClick={() => toggleSelectTarget(target)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      background: isSelected ? '#fef2f2' : 'transparent',
                      border: isSelected ? '1px solid #fecaca' : '1px solid transparent',
                      marginBottom: '4px',
                      transition: 'background 0.12s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = '#f8fafc';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{ position: 'relative' }}>
                        <Avatar src={target.avatar} name={target.name} size={36} />
                        {target.isGroup && (
                          <div style={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            width: 15,
                            height: 15,
                            borderRadius: '50%',
                            background: '#0F172A',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff',
                            border: '1.5px solid #ffffff'
                          }}>
                            <Users size={9} />
                          </div>
                        )}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {target.name}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {target.subtitle}
                        </div>
                      </div>
                    </div>

                    {/* Custom Checkbox Pill */}
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: '6px',
                      border: isSelected ? 'none' : '1.5px solid #cbd5e1',
                      background: isSelected ? '#BD1D2D' : '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      flexShrink: 0
                    }}>
                      {isSelected && <Check size={13} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer with summary and action */}
          <div style={{
            padding: '12px 18px',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#ffffff'
          }}>
            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
              Đã chọn: <strong style={{ color: '#BD1D2D' }}>{selectedTargets.size}</strong> người nhận
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#475569',
                  fontSize: '0.8rem',
                  fontWeight: 650,
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={handleSendForward}
                disabled={selectedTargets.size === 0 || isSubmitting}
                style={{
                  padding: '7px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: selectedTargets.size === 0 ? '#94a3b8' : '#BD1D2D',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  fontWeight: 750,
                  cursor: selectedTargets.size === 0 || isSubmitting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: selectedTargets.size > 0 ? '0 2px 6px rgba(189, 29, 45, 0.25)' : 'none',
                  transition: 'background 0.15s ease'
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Đang gửi...</span>
                  </>
                ) : (
                  <>
                    <Share2 size={14} />
                    <span>Gửi ({selectedTargets.size})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
};
