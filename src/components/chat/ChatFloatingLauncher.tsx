import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useChatStore } from '../../store/chatStore';
import { useShallow } from 'zustand/react/shallow';
import { useAuth } from '../../contexts/AuthContext';
import { BrandChatIcon } from './BrandChatIcon';
import { hasOpenDrawerOrModal, subscribeOverlayStack } from '../../utils/overlayStack';
import { useTypedSubSetting } from '../../contexts/SettingsBootstrapContext';

const WorkChatModal = React.lazy(() => import('./WorkChatModal').then(m => ({ default: m.WorkChatModal })));

let workChatPreloaded = false;
const preloadWorkChatModal = () => {
  if (workChatPreloaded) return;
  workChatPreloaded = true;
  void import('./WorkChatModal').catch(() => {
    workChatPreloaded = false;
  });
};

const DEFAULT_PUBLIC_NO_LAUNCHER_ROUTES = [
  '/download',
  '/login',
  '/s/',
  '/claim/',
  '/public-schedule',
  '/public-booking',
  '/splash-preview',
  '/docs',
  '/documentation',
  '/api-docs',
  '/architecture'
];

export const ChatFloatingLauncher: React.FC = () => {
  const location = useLocation();
  const { user, token } = useAuth();
  const {
    isOpen,
    openChat,
    closeChat,
    unreadTotal,
    fetchConversations,
    syncDelta,
    fetchStaffDirectory,
    initRealtimeSSE,
    disconnectRealtimeSSE,
    isRealtimeConnected
  } = useChatStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      openChat: s.openChat,
      closeChat: s.closeChat,
      unreadTotal: s.unreadTotal,
      fetchConversations: s.fetchConversations,
      syncDelta: s.syncDelta,
      fetchStaffDirectory: s.fetchStaffDirectory,
      initRealtimeSSE: s.initRealtimeSSE,
      disconnectRealtimeSSE: s.disconnectRealtimeSSE,
      isRealtimeConnected: s.isRealtimeConnected,
    }))
  );

  const pollHiddenMs = useTypedSubSetting<number>('ui.workchat_realtime_and_limits', 'poll_hidden_ms', 35000);
  const pollIdleMs = useTypedSubSetting<number>('ui.workchat_realtime_and_limits', 'poll_idle_ms', 14000);
  const pollOpenMs = useTypedSubSetting<number>('ui.workchat_realtime_and_limits', 'poll_open_ms', 6000);
  const pollClosedMs = useTypedSubSetting<number>('ui.workchat_realtime_and_limits', 'poll_closed_ms', 7000);
  const idleMs = useTypedSubSetting<number>('ui.workchat_realtime_and_limits', 'idle_ms', 180000);
  const badgeCap = useTypedSubSetting<number>('ui.workchat_realtime_and_limits', 'badge_cap', 99);
  const configuredPublicRoutes = useTypedSubSetting<string[]>(
    'ui.workchat_realtime_and_limits',
    'public_routes_no_launcher',
    DEFAULT_PUBLIC_NO_LAUNCHER_ROUTES
  );

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [isOverlayOpen, setIsOverlayOpen] = useState(() => hasOpenDrawerOrModal());

  // Refs prevent opening/closing modal or toggling SSE from restarting background polling
  const isOpenRef = useRef(isOpen);
  const isRealtimeConnectedRef = useRef(isRealtimeConnected);
  useEffect(() => {
    isOpenRef.current = isOpen;
    isRealtimeConnectedRef.current = isRealtimeConnected;
  }, [isOpen, isRealtimeConnected]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const syncOverlayState = () => {
      setIsOverlayOpen(hasOpenDrawerOrModal());
    };
    syncOverlayState();
    return subscribeOverlayStack(syncOverlayState);
  }, [location.pathname, location.search]);

  // Listen for notification deep-link and Spotlight AI Assistant events
  useEffect(() => {
    const handleOpenChatEvent = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {};
      const convId = Number(detail.conversationId || detail.id || 0);
      openChat(convId > 0 ? convId : undefined, 'chats', { maximized: false });
    };
    const handleOpenAiAssistant = () => {
      const state = useChatStore.getState();
      const convs = Array.isArray(state.conversations) ? state.conversations : [];
      const aiConv = convs.find(
        (c) =>
          c.id === 9000001 ||
          c.id === -9000001 ||
          c.other_user?.id === 9000001 ||
          c.created_by === 9000001 ||
          /IDEAS/i.test(c.title || c.other_user?.full_name || '')
      );
      if (aiConv) {
        openChat(aiConv.id, 'chats', { maximized: false });
      } else {
        openChat(-9000001, 'chats', { maximized: false });
        state.startDirectChat(9000001)
          .then((cid) => {
            if (cid) useChatStore.getState().selectConversation(cid);
          })
          .catch(() => {});
      }
    };
    window.addEventListener('myerp:open-chat-conversation', handleOpenChatEvent);
    window.addEventListener('open-ai-assistant', handleOpenAiAssistant);
    return () => {
      window.removeEventListener('myerp:open-chat-conversation', handleOpenChatEvent);
      window.removeEventListener('open-ai-assistant', handleOpenAiAssistant);
    };
  }, [openChat]);

  // 1. Establish On-Demand Real-time SSE Stream ONLY when Chat Modal is open (< 50ms latency)
  // When chat modal is closed, immediately disconnect SSE to free up PHP-FPM workers for the server
  useEffect(() => {
    if (!token || !user) return;
    if (isOpen) {
      initRealtimeSSE(token);
    } else {
      disconnectRealtimeSSE();
    }
    return () => {
      disconnectRealtimeSSE();
    };
  }, [token, user, isOpen, initRealtimeSSE, disconnectRealtimeSSE]);

  // 2. Centralized intelligent adaptive polling (acts as presence heartbeat & fallback without mount bursts)
  useEffect(() => {
    if (!token || !user) return;
    fetchConversations();
    fetchStaffDirectory();

    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastActiveTime = Date.now();

    const onUserInteraction = () => {
      lastActiveTime = Date.now();
    };

    window.addEventListener('mousemove', onUserInteraction, { passive: true });
    window.addEventListener('keydown', onUserInteraction, { passive: true });
    window.addEventListener('touchstart', onUserInteraction, { passive: true });

    const runPolling = () => {
      syncDelta();
      const isHidden = document.hidden;
      const isIdle = Date.now() - lastActiveTime > idleMs;
      const modalOpen = isOpenRef.current;
      const sseLive = isRealtimeConnectedRef.current;

      let delay = pollClosedMs;
      if (isHidden) {
        delay = pollHiddenMs;
      } else if (sseLive) {
        delay = modalOpen ? Math.max(pollOpenMs * 2, 12000) : Math.max(pollClosedMs * 2, 12000);
      } else if (isIdle && !modalOpen) {
        delay = pollIdleMs;
      } else if (modalOpen) {
        delay = pollOpenMs;
      }
      timer = setTimeout(runPolling, delay);
    };

    timer = setTimeout(runPolling, isRealtimeConnectedRef.current ? 12000 : pollOpenMs);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (timer) clearTimeout(timer);
        lastActiveTime = Date.now();
        syncDelta();
        timer = setTimeout(runPolling, isOpenRef.current ? pollOpenMs : pollClosedMs);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('mousemove', onUserInteraction);
      window.removeEventListener('keydown', onUserInteraction);
      window.removeEventListener('touchstart', onUserInteraction);
    };
  }, [token, user?.id, pollHiddenMs, pollIdleMs, pollOpenMs, pollClosedMs, idleMs, fetchConversations, fetchStaffDirectory, syncDelta]);

  const publicRoutes = Array.isArray(configuredPublicRoutes) && configuredPublicRoutes.length > 0
    ? configuredPublicRoutes
    : DEFAULT_PUBLIC_NO_LAUNCHER_ROUTES;
  const isPublicPage = publicRoutes.some((prefix) =>
    location.pathname === prefix || location.pathname.startsWith(prefix)
  );

  if (!token || !user || isPublicPage) return null;

  const capLimit = Number.isFinite(badgeCap) && badgeCap > 0 ? badgeCap : 99;

  const floatingButton = (
    <>
      <style>{`
        @keyframes chatBeaconPing {
          0% {
            transform: scale(0.95);
            opacity: 0.7;
          }
          65% {
            transform: scale(1.45);
            opacity: 0;
          }
          100% {
            transform: scale(1.45);
            opacity: 0;
          }
        }
      `}</style>

      <button
        type="button"
        onClick={() => {
          if (isOpen) {
            closeChat();
          } else {
            openChat();
          }
        }}
        style={{
          position: 'fixed',
          bottom: isMobile 
            ? 'calc(var(--mobile-bottom-nav-height, 62px) + env(safe-area-inset-bottom, 0px) + 12px)' 
            : '24px',
          right: isMobile ? '12px' : '24px',
          width: isMobile ? '42px' : '52px',
          height: isMobile ? '42px' : '52px',
          borderRadius: '50%',
          background: '#BD1D2D',
          color: '#ffffff',
          border: 'none',
          display: isMobile && isOverlayOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: '0 4px 14px rgba(15, 23, 42, 0.22)',
          zIndex: 10005,
          opacity: isOverlayOpen && isMobile ? 0 : 1,
          pointerEvents: isOverlayOpen && isMobile ? 'none' : 'auto',
          transition: 'background-color 0.18s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
          outline: 'none'
        }}
        onMouseEnter={(e) => {
          preloadWorkChatModal();
          e.currentTarget.style.backgroundColor = '#A31422';
          e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 23, 42, 0.28)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#BD1D2D';
          e.currentTarget.style.boxShadow = '0 4px 14px rgba(15, 23, 42, 0.22)';
        }}
        onFocus={preloadWorkChatModal}
        onTouchStart={preloadWorkChatModal}
        title="Tin nhắn nội bộ (WorkChat)"
      >
        {/* Live Unread Beacon Ripple when unread messages exist */}
        {unreadTotal > 0 && (
          <span
            style={{
              position: 'absolute',
              inset: '-2px',
              borderRadius: '50%',
              background: 'rgba(189, 29, 45, 0.35)',
              zIndex: -1,
              pointerEvents: 'none',
              animation: 'chatBeaconPing 2.4s cubic-bezier(0, 0, 0.2, 1) infinite'
            }}
          />
        )}

        <BrandChatIcon size={27} variant="solid-white" />

        {/* Live Active Status Indicator Dot */}
        <span
          style={{
            position: 'absolute',
            bottom: '2px',
            right: '2px',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            border: '2px solid #ffffff',
            boxShadow: '0 0 0 1px rgba(16, 185, 129, 0.3)'
          }}
        />

        {/* Unread Message Count Badge */}
        {unreadTotal > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-4px',
              right: '-4px',
              background: '#BD1D2D',
              color: '#ffffff',
              fontSize: '0.72rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              padding: '2px 6px',
              borderRadius: '12px',
              minWidth: '18px',
              height: '18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #ffffff'
            }}
          >
            {unreadTotal > capLimit ? `${capLimit}+` : unreadTotal}
          </span>
        )}
      </button>
    </>
  );

  const portalContent = (
    <>
      {!isOpen && floatingButton}
      {isOpen && (
        <React.Suspense fallback={null}>
          <WorkChatModal />
        </React.Suspense>
      )}
    </>
  );

  return typeof document !== 'undefined' ? createPortal(portalContent, document.body) : portalContent;
};
