import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ThumbsUp, Heart, Laugh, Angry, MessageCircle, Share2,
  Send, Trash2, Globe, Lock, Users, Link as LinkIcon, Paperclip, X, Camera,
  MessageSquare, MoreHorizontal, Filter, Search, Tag, Eye, Edit, Smile,
  ArrowUp, Check, Link2, LayoutGrid, LayoutList, UserCheck, UserX, CheckSquare, Square, Settings
} from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { Avatar } from '../components/ui/Avatar';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Skeleton } from '../components/ui/Skeleton';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { compressToWebP } from '../utils/imageCompress';
import { CustomModal } from '../components/ui/CustomModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { MentionInput } from '../components/ui/MentionInput';
import { StickerPickerModal } from '../components/ui/StickerPickerModal';
import { AttachmentLightboxModal, type AttachmentItem } from '../components/ui/AttachmentLightboxModal';
import { useUIStore } from '../store/uiStore';
import { ensureArray, extractArray } from '../utils/safeArray';
import { isSystemAdmin, isExecutive } from '../utils/roleUtils';

const FORBIDDEN_FEED_EXT = /\.(php|phtml|phar|exe|bat|cmd|sh|ps1|msi|vbs|js|mjs|jsx|ts|tsx|html?|svg)$/i;

const isVideoUrl = (url?: string): boolean => {
  if (!url || typeof url !== 'string') return false;
  const cleanUrl = url.split('?')[0].toLowerCase();
  return /\.(mp4|webm|mov|ogg|m4v)$/i.test(cleanUrl);
};

const resolveFeedMediaUrl = (raw?: string): string => {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || /^(javascript|vbscript):/i.test(trimmed)) return '';
  if (/^(https?:\/\/|data:image\/|blob:)/i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/backend/') || trimmed.startsWith('/stickers/')) return trimmed;
  const apiBase = import.meta.env.VITE_API_URL || '/backend';
  if (trimmed.startsWith('storage/uploads/') || trimmed.startsWith('/storage/uploads/')) {
    return `${apiBase}/${trimmed.replace(/^\/?storage\//, '')}`;
  }
  if (trimmed.startsWith('uploads/') || trimmed.startsWith('/uploads/')) {
    return `${apiBase}/${trimmed.replace(/^\//, '')}`;
  }
  return trimmed;
};

const parseSafeDate = (val?: string | number | null): Date | null => {
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

const hasRichContent = (html?: string, extraMediaCount = 0): boolean => {
  if (extraMediaCount > 0) return true;
  const raw = String(html || '');
  if (!raw) return false;
  if (raw.includes('<img') || raw.includes('/stickers/') || raw.includes('data-file-url')) return true;
  return raw.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim().length > 0;
};

const countTotalComments = (list: any[]): number => {
  if (!Array.isArray(list)) return 0;
  return list.reduce((sum, c) => sum + 1 + (Array.isArray(c?.replies) ? countTotalComments(c.replies) : 0), 0);
};

// High-performance DOMPurify HTML sanitizer cache (avoids repeated synchronous parsing)
const sanitizeCache = new Map<string, string>();
const mediaRowCache = new Map<string, string>();
const defaultSanitizeConfig = {
  ADD_TAGS: ['img', 'span', 'a'],
  ADD_ATTR: [
    'src', 'alt', 'style', 'class', 'href', 'target', 'rel',
    'data-user-id', 'data-user-name', 'data-mention-avatar', 'data-file-url', 'data-file-name'
  ],
  ALLOW_DATA_ATTR: true
};
const stripUnsafeLayoutInlineStyles = (html: string): string => {
  if (!html || !html.includes('style=')) return html;
  return html.replace(/style=(["'])([\s\S]*?)\1/gi, (_full, quote, cssText: string) => {
    const cleaned = cssText
      .split(';')
      .map(rule => rule.trim())
      .filter(rule => {
        if (!rule) return false;
        const prop = rule.split(':')[0]?.trim().toLowerCase() || '';
        if (
          prop === 'font-size' ||
          prop === 'line-height' ||
          prop === 'width' ||
          prop === 'min-width' ||
          prop === 'max-width' ||
          prop === 'margin-left' ||
          prop === 'margin-right' ||
          prop === 'padding-left' ||
          prop === 'padding-right' ||
          prop === 'white-space' ||
          prop === 'text-indent'
        ) {
          return false;
        }
        return true;
      })
      .join('; ');
    return cleaned ? `style=${quote}${cleaned}${quote}` : '';
  });
};

const safeSanitize = (rawHtml: string, config?: any): string => {
  if (!rawHtml) return '';
  const finalConfig = config ? { ...defaultSanitizeConfig, ...config } : defaultSanitizeConfig;
  const cacheKey = `${rawHtml}_${JSON.stringify(finalConfig)}`;
  const cached = sanitizeCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const sanitized = String(DOMPurify.sanitize(rawHtml, finalConfig));
  const clean = stripUnsafeLayoutInlineStyles(sanitized);
  if (sanitizeCache.size > 800) {
    const firstKey = sanitizeCache.keys().next().value;
    if (firstKey) sanitizeCache.delete(firstKey);
  }
  sanitizeCache.set(cacheKey, clean);
  return clean;
};

const formatCommentHtmlWithMediaRow = (html: string): string => {
  if (!html || !html.includes('<img')) return html;
  const cached = mediaRowCache.get(html);
  if (cached !== undefined) return cached;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const commentImgs = Array.from(doc.body.querySelectorAll<HTMLImageElement>(
      'img:not(.mention-avatar):not([data-mention-avatar]):not(.chat-comment-sticker):not(.feed-comment-sticker):not([src*="/stickers/"])'
    ));
    if (commentImgs.length === 0) {
      if (mediaRowCache.size > 400) {
        const firstKey = mediaRowCache.keys().next().value;
        if (firstKey) mediaRowCache.delete(firstKey);
      }
      mediaRowCache.set(html, html);
      return html;
    }

    const mediaRow = doc.createElement('div');
    mediaRow.className = 'feed-comment-media-row';
    commentImgs.forEach(img => {
      const parent = img.parentElement;
      mediaRow.appendChild(img);
      if (parent && parent !== doc.body && parent.textContent?.trim() === '' && parent.children.length === 0) {
        parent.remove();
      }
    });
    doc.body.appendChild(mediaRow);
    const out = doc.body.innerHTML;
    if (mediaRowCache.size > 400) {
      const firstKey = mediaRowCache.keys().next().value;
      if (firstKey) mediaRowCache.delete(firstKey);
    }
    mediaRowCache.set(html, out);
    return out;
  } catch {
    return html;
  }
};

// Reaction Types Constants
const REACTION_TYPES = [
  { type: 'like', label: 'Thích', emoji: '👍', color: '#3b82f6' },
  { type: 'love', label: 'Yêu thích', emoji: '❤️', color: '#ef4444' },
  { type: 'haha', label: 'Vui vẻ', emoji: '😂', color: '#f59e0b' },
  { type: 'rocket', label: 'Đẩy tiến độ', emoji: '🚀', color: '#0284c7' },
  { type: 'clap', label: 'Tuyệt vời', emoji: '👏', color: '#BD1D2D' },
  { type: 'flex', label: 'Đồng lòng', emoji: '💪', color: '#10b981' }
];

export interface StaffAudienceUser {
  id: number;
  full_name: string;
  avatar_url?: string | null;
  role?: string;
  department?: string;
  team_id?: number | null;
}

interface Post {
  id: number;
  user_id: number;
  content: string;
  visibility: string;
  author_name: string;
  author_avatar: string | null;
  created_at: string;
  attachments: string[];
  tags: string[];
  link_metadata: {
    url: string;
    title: string;
    description: string | null;
    image: string | null;
  } | null;
  reactions_summary: Record<string, number>;
  reactions_count: number;
  user_reaction: string | null;
  comments_count: number;
  top_comments: Comment[];
  team_name?: string | null;
  team_id?: number | null;
  target_user_ids?: number[];
  excluded_user_ids?: number[];
  target_users?: { id: number; full_name: string; avatar_url?: string | null; role?: string }[];
  excluded_users?: { id: number; full_name: string; avatar_url?: string | null; role?: string }[];
}

interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  parent_id: number | null;
  content: string;
  author_name: string;
  author_avatar: string | null;
  created_at: string;
  replies?: Comment[];
}

interface PostCommentBoxProps {
  postId: number;
  replyToId: number | null;
  user: any;
  users?: StaffAudienceUser[];
  appendedEmoji?: { emoji: string; id: number } | null;
  onSend: (postId: number, parentId: number | null, text: string) => Promise<boolean>;
  onOpenSticker: (postId: number, parentId: number | null, el: HTMLElement) => void;
  onCancelReply: (postId: number) => void;
  t: (key: string) => string;
}

const PostCommentBox: React.FC<PostCommentBoxProps> = ({
  postId,
  replyToId,
  user,
  users,
  appendedEmoji,
  onSend,
  onOpenSticker,
  onCancelReply,
  t
}) => {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (appendedEmoji?.emoji) {
      setText(prev => prev + appendedEmoji.emoji);
    }
  }, [appendedEmoji]);

  const handleSend = async () => {
    if (submitting || !hasRichContent(text)) return;
    setSubmitting(true);
    try {
      const ok = await onSend(postId, replyToId, text);
      if (ok) {
        setText('');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', width: '100%' }}>
      <Avatar
        src={user?.avatar_url || user?.avatar}
        name={user?.name || 'User'}
        size={32}
        style={{ marginTop: '4px' }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, minWidth: 0 }}>
        <MentionInput
          placeholder={
            replyToId
              ? `${t('Phản hồi bình luận')}... (Enter để gửi)`
              : `${t('Viết bình luận')}... (Enter để gửi)`
          }
          value={text}
          onChange={val => setText(val.target.value)}
          users={users}
          enterSubmits={true}
          onSubmitShortcut={handleSend}
          style={{
            width: '100%',
            minHeight: '48px',
            fontSize: '0.8rem'
          }}
        />
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            disabled={submitting}
            onClick={handleSend}
            style={{
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '0.72rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
            className="btn primary sm"
          >
            <Send size={11} />
            <span>{submitting ? '...' : t('Gửi')}</span>
          </button>
          <button
            type="button"
            onClick={(e) => onOpenSticker(postId, replyToId, e.currentTarget)}
            style={{
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '0.72rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              background: 'rgba(189, 29, 45, 0.08)',
              color: '#BD1D2D',
              border: '1px solid rgba(189, 29, 45, 0.25)',
              cursor: 'pointer',
              fontWeight: 600,
              transition: 'all 0.15s ease'
            }}
            title={t('Gửi nhãn dán Sticker')}
          >
            <Smile size={13} />
            <span>{t('Nhãn dán')}</span>
          </button>
          {replyToId && (
            <button
              type="button"
              onClick={() => onCancelReply(postId)}
              style={{
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '0.72rem'
              }}
              className="btn outline sm"
            >
              {t('Hủy')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Feed Skeleton Loaders ──
const FeedSkeletonItem: React.FC<{ width?: string | number; height?: string | number; borderRadius?: string | number; style?: React.CSSProperties }> = ({
  width = '100%',
  height = '16px',
  borderRadius = '8px',
  style = {}
}) => (
  <Skeleton width={width} height={height} borderRadius={borderRadius} style={style} />
);

const PostSkeletonCard: React.FC = () => (
  <div
    style={{
      background: 'var(--color-surface)',
      borderRadius: '16px',
      border: '1px solid var(--color-border-light)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      boxShadow: 'var(--shadow-sm)'
    }}
  >
    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
      <FeedSkeletonItem width={40} height={40} borderRadius="50%" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
        <FeedSkeletonItem width="140px" height="14px" />
        <FeedSkeletonItem width="90px" height="11px" />
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <FeedSkeletonItem width="100%" height="13px" />
      <FeedSkeletonItem width="88%" height="13px" />
      <FeedSkeletonItem width="60%" height="13px" />
    </div>
    <FeedSkeletonItem width="100%" height="220px" borderRadius="12px" />
    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--color-border-light)', paddingTop: '10px', marginTop: '4px' }}>
      <FeedSkeletonItem width="80px" height="24px" borderRadius="20px" />
      <FeedSkeletonItem width="80px" height="24px" borderRadius="20px" />
      <FeedSkeletonItem width="80px" height="24px" borderRadius="20px" />
    </div>
  </div>
);

const HonorSkeletonCard: React.FC = () => (
  <div
    style={{
      background: 'linear-gradient(135deg, rgba(220, 38, 38, 0.82) 0%, rgba(153, 27, 27, 0.92) 100%)',
      borderRadius: '16px',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '12px',
      boxShadow: 'var(--shadow-md)',
      position: 'relative',
      overflow: 'hidden'
    }}
  >
    <div
      style={{
        width: '130px',
        height: '20px',
        borderRadius: '10px',
        background: 'rgba(255, 255, 255, 0.25)',
        animation: 'feedSkeletonShimmer 1.5s ease-in-out infinite'
      }}
    />
    <div
      style={{
        width: 60,
        height: 60,
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.3)',
        animation: 'feedSkeletonShimmer 1.5s ease-in-out infinite'
      }}
    />
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '100%' }}>
      <div style={{ width: '130px', height: '14px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.25)', animation: 'feedSkeletonShimmer 1.5s ease-in-out infinite' }} />
      <div style={{ width: '90px', height: '11px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.2)', animation: 'feedSkeletonShimmer 1.5s ease-in-out infinite' }} />
    </div>
    <div style={{ width: '100px', height: '28px', borderRadius: '16px', background: 'rgba(255, 255, 255, 0.2)', animation: 'feedSkeletonShimmer 1.5s ease-in-out infinite' }} />
  </div>
);

const CommentSkeletonItem: React.FC = () => (
  <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
    <FeedSkeletonItem width={28} height={28} borderRadius="50%" />
    <div style={{ flex: 1, background: 'var(--color-bg)', padding: '10px 12px', borderRadius: '12px', border: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <FeedSkeletonItem width="100px" height="11px" />
      <FeedSkeletonItem width="75%" height="12px" />
    </div>
  </div>
);

export const EnterpriseFeed: React.FC = () => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const showConfirm = useUIStore((s) => s.showConfirm);
  const [searchParams, setSearchParams] = useSearchParams();

  // Dynamic policy settings with safe fallbacks
  const postsLimit = useTypedSubSetting<number>('ui.feed_and_mentions_policy', 'posts_page', 10);
  const trendingLimit = useTypedSubSetting<number>('ui.feed_and_mentions_policy', 'trending_tags', 5);
  const maxHonorClaps = useTypedSubSetting<number>('ui.feed_and_mentions_policy', 'max_hearts_claps', 10);
  const highlightMs = useTypedSubSetting<number>('ui.feed_and_mentions_policy', 'deeplink_highlight_ms', 4000);
  const maxUploadMb = useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', 50);
  const maxUploadBytes = maxUploadMb * 1024 * 1024;

  const targetPostId = searchParams.get('post_id');
  const openCommentId = searchParams.get('open_comment');
  const [highlightedPostId, setHighlightedPostId] = useState<number | null>(null);
  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // Filters
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const trendingTags = useMemo(() => {
    const counts: Record<string, number> = {};
    ensureArray<Post>(posts).forEach(post => {
      ensureArray<string>(post.tags).forEach(tag => {
        const clean = String(tag).trim().toLowerCase();
        if (clean && !/^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i.test(clean)) {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      });
    });
    return Object.entries(counts)
      .map(([tag, count]) => ({
        tag,
        label: `#${tag}`,
        count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, trendingLimit);
  }, [posts, trendingLimit]);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 200);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const [selectedVisibility, setSelectedVisibility] = useState<string>('all');

  // View Mode: 'list' | 'grid'
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() => {
    return (localStorage.getItem('enterprise_feed_view_mode') as 'list' | 'grid') || 'list';
  });
  const handleSetViewMode = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    try { localStorage.setItem('enterprise_feed_view_mode', mode); } catch {}
  };

  // Creation State
  const [content, setContent] = useState('');
  const [visibility, setVisibility] = useState('global');
  const [targetUserIds, setTargetUserIds] = useState<number[]>([]);
  const [excludedUserIds, setExcludedUserIds] = useState<number[]>([]);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audience Picker Modal state
  const [audienceModalOpen, setAudienceModalOpen] = useState(false);
  const [audienceModalMode, setAudienceModalMode] = useState<'target' | 'exclude'>('target');
  const [audienceModalContext, setAudienceModalContext] = useState<'create' | 'edit'>('create');
  const [audienceSearchTerm, setAudienceSearchTerm] = useState('');
  const [audienceSelectedTeam, setAudienceSelectedTeam] = useState<number | 'all'>('all');

  // Edit Post State
  const [editingPost, setEditingPost] = useState<Post | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editVisibility, setEditVisibility] = useState('global');
  const [editTeamId, setEditTeamId] = useState<number | null>(null);
  const [editTargetUserIds, setEditTargetUserIds] = useState<number[]>([]);
  const [editExcludedUserIds, setEditExcludedUserIds] = useState<number[]>([]);
  const [editAttachments, setEditAttachments] = useState<string[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editUploading, setEditUploading] = useState(false);

  // Active Post Comments Drawers
  const [activeCommentsPostId, setActiveCommentsPostId] = useState<number | null>(null);
  const [commentsMap, setCommentsMap] = useState<Record<number, Comment[]>>({});
  const [loadingCommentsMap, setLoadingCommentsMap] = useState<Record<number, boolean>>({});
  const [newCommentText, setNewCommentText] = useState<Record<number, string>>({});
  const [appendedEmoji, setAppendedEmoji] = useState<{ postId: number; emoji: string; id: number } | null>(null);
  const [replyToCommentId, setReplyToCommentId] = useState<Record<number, number | null>>({});
  const [commentToDelete, setCommentToDelete] = useState<{ postId: number; commentId: number } | null>(null);

  // Sticker modal state for feed comments
  const [showFeedStickerModal, setShowFeedStickerModal] = useState(false);
  const [feedStickerAnchorEl, setFeedStickerAnchorEl] = useState<HTMLElement | null>(null);
  const [stickerTargetPostId, setStickerTargetPostId] = useState<number | null>(null);
  const [stickerTargetParentId, setStickerTargetParentId] = useState<number | null>(null);

  // Floating reactions active state per post
  const [hoveredPostId, setHoveredPostId] = useState<number | null>(null);
  const hoverTimeoutRef = useRef<Record<number, any>>({});

  // Lightbox modal state for full-screen image inspection
  const [lightboxData, setLightboxData] = useState<{ items: AttachmentItem[]; initialIndex: number } | null>(null);

  // Floating Back-to-Top button state
  const [showBackToTop, setShowBackToTop] = useState(false);

  // Edit comment state
  const [editingComment, setEditingComment] = useState<{ id: number; postId: number; content: string } | null>(null);
  const [isSavingCommentEdit, setIsSavingCommentEdit] = useState(false);

  // Synchronous in-flight & AbortController refs
  const bottomObserverRef = useRef<HTMLDivElement | null>(null);
  const isFetchingRef = useRef(false);
  const postsAbortRef = useRef<AbortController | null>(null);
  const honorsAbortRef = useRef<AbortController | null>(null);
  const teamsAbortRef = useRef<AbortController | null>(null);
  const staffAbortRef = useRef<AbortController | null>(null);
  const reactionsAbortRef = useRef<AbortController | null>(null);
  const commentsAbortMapRef = useRef<Record<number, AbortController>>({});

  const postSubmitInFlightRef = useRef(false);
  const editPostInFlightRef = useRef(false);
  const saveHonorsInFlightRef = useRef(false);
  const honorHeartInFlightSetRef = useRef<Set<number>>(new Set());
  const reactInFlightSetRef = useRef<Set<number>>(new Set());
  const commentSendInFlightSetRef = useRef<Set<number>>(new Set());
  const stickerCommentInFlightSetRef = useRef<Set<number>>(new Set());
  const editCommentInFlightRef = useRef(false);

  useEffect(() => {
    const mainEl = document.querySelector('main.responsive-main');
    const handleScroll = () => {
      const scrollTop = mainEl ? mainEl.scrollTop : window.scrollY;
      setShowBackToTop(scrollTop > 420);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    mainEl?.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      mainEl?.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    return () => {
      postsAbortRef.current?.abort();
      honorsAbortRef.current?.abort();
      teamsAbortRef.current?.abort();
      staffAbortRef.current?.abort();
      reactionsAbortRef.current?.abort();
      Object.values(commentsAbortMapRef.current).forEach(ctrl => ctrl?.abort());
    };
  }, []);

  // Teams List for Group Visibility selection
  interface Team {
    id: number;
    name: string;
  }
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const fetchTeams = async () => {
    teamsAbortRef.current?.abort();
    const ctrl = new AbortController();
    teamsAbortRef.current = ctrl;
    try {
      const res = await api.get('/teams', { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setTeams(extractArray(res?.data));
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      console.error('Error fetching teams', e);
    }
  };

  // Staff Directory for Audience targeting & exclusion
  const [allStaff, setAllStaff] = useState<StaffAudienceUser[]>([]);

  const fetchAllStaff = async () => {
    staffAbortRef.current?.abort();
    const ctrl = new AbortController();
    staffAbortRef.current = ctrl;
    try {
      const res = await api.get('/users?all=1', { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const d = res.data?.data;
      const list = ensureArray<any>(Array.isArray(d) ? d : d?.items);
      setAllStaff(list.map((u: any) => ({
        id: u.id,
        full_name: u.full_name || u.name || u.username || 'Nhân sự',
        avatar_url: u.avatar_url || u.avatar || null,
        role: u.role || 'Nhân viên',
        department: u.department || '',
        team_id: u.team_id || null
      })));
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      console.error('Error fetching all staff', e);
    }
  };

  // Active audience selected IDs helper
  const currentAudienceSelectedIds = useMemo(() => {
    if (audienceModalContext === 'create') {
      return audienceModalMode === 'target' ? targetUserIds : excludedUserIds;
    } else {
      return audienceModalMode === 'target' ? editTargetUserIds : editExcludedUserIds;
    }
  }, [audienceModalContext, audienceModalMode, targetUserIds, excludedUserIds, editTargetUserIds, editExcludedUserIds]);

  // Filtered staff in audience picker modal
  const filteredAudienceStaff = useMemo(() => {
    return allStaff.filter(s => {
      if (Number(s.id) === Number(user?.id)) return false;
      if (audienceSelectedTeam !== 'all') {
        if (s.team_id !== audienceSelectedTeam) return false;
      }
      if (audienceSearchTerm.trim()) {
        const query = audienceSearchTerm.toLowerCase();
        const matchName = s.full_name.toLowerCase().includes(query);
        const matchRole = (s.role || '').toLowerCase().includes(query);
        const matchDept = (s.department || '').toLowerCase().includes(query);
        if (!matchName && !matchRole && !matchDept) return false;
      }
      return true;
    });
  }, [allStaff, audienceSelectedTeam, audienceSearchTerm, user?.id]);

  const handleToggleAudienceUser = (userId: number) => {
    if (audienceModalContext === 'create') {
      if (audienceModalMode === 'target') {
        setTargetUserIds(prev =>
          prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
      } else {
        setExcludedUserIds(prev =>
          prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
      }
    } else {
      if (audienceModalMode === 'target') {
        setEditTargetUserIds(prev =>
          prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
      } else {
        setEditExcludedUserIds(prev =>
          prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
      }
    }
  };

  const handleSelectAllAudience = (staffList: StaffAudienceUser[]) => {
    const ids = staffList.map(s => s.id);
    if (audienceModalContext === 'create') {
      if (audienceModalMode === 'target') {
        setTargetUserIds(prev => Array.from(new Set([...prev, ...ids])));
      } else {
        setExcludedUserIds(prev => Array.from(new Set([...prev, ...ids])));
      }
    } else {
      if (audienceModalMode === 'target') {
        setEditTargetUserIds(prev => Array.from(new Set([...prev, ...ids])));
      } else {
        setEditExcludedUserIds(prev => Array.from(new Set([...prev, ...ids])));
      }
    }
  };

  const handleClearAllAudience = () => {
    if (audienceModalContext === 'create') {
      if (audienceModalMode === 'target') {
        setTargetUserIds([]);
      } else {
        setExcludedUserIds([]);
      }
    } else {
      if (audienceModalMode === 'target') {
        setEditTargetUserIds([]);
      } else {
        setEditExcludedUserIds([]);
      }
    }
  };

  // Honors Widget States
  interface HonorsUser {
    id: number;
    full_name: string;
    avatar_url: string | null;
    role: string;
  }
  interface HonorItem {
    id: number;
    user_id: number;
    title: string;
    badge: string;
    reason: string;
    hearts_count: number;
    full_name: string;
    avatar_url: string | null;
    role: string;
    user_reactions: number;
    created_at: string;
  }
  interface HonorsData {
    honors: HonorItem[];
    candidates: HonorsUser[];
  }
  const [honorsData, setHonorsData] = useState<HonorsData | null>(null);
  const [loadingHonors, setLoadingHonors] = useState(false);
  const [showEditHonors, setShowEditHonors] = useState(false);
  const [selectedHonorId, setSelectedHonorId] = useState<number | null>(null);
  const [editHonorsUserId, setEditHonorsUserId] = useState<number | null>(null);
  const [editHonorsTitle, setEditHonorsTitle] = useState('');
  const [editHonorsBadge, setEditHonorsBadge] = useState('');
  const [editHonorsReason, setEditHonorsReason] = useState('');
  const [savingHonors, setSavingHonors] = useState(false);

  // Reactions List Modal States
  const [reactionsModalPostId, setReactionsModalPostId] = useState<number | null>(null);
  const [reactionsModalList, setReactionsModalList] = useState<any[]>([]);
  const [loadingReactionsModal, setLoadingReactionsModal] = useState(false);

  const handleShowReactionsModal = async (postId: number) => {
    reactionsAbortRef.current?.abort();
    const ctrl = new AbortController();
    reactionsAbortRef.current = ctrl;
    setReactionsModalPostId(postId);
    setLoadingReactionsModal(true);
    try {
      const res = await api.get(`/posts/${postId}/reactions`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res.data && res.data.success) {
        setReactionsModalList(ensureArray(res.data.data?.reactions));
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      console.error('Error fetching reactions list', err);
    } finally {
      if (!ctrl.signal.aborted) {
        setLoadingReactionsModal(false);
      }
    }
  };

  const fetchHonors = async () => {
    honorsAbortRef.current?.abort();
    const ctrl = new AbortController();
    honorsAbortRef.current = ctrl;
    setLoadingHonors(true);
    try {
      const res = await api.get('/posts/honors', { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res.data && res.data.success) {
        const data = res.data.data;
        if (data && Array.isArray(data.honors)) {
          data.honors = [...data.honors].sort((a, b) => {
            if (b.hearts_count !== a.hearts_count) {
              return b.hearts_count - a.hearts_count;
            }
            const dB = parseSafeDate(b.created_at)?.getTime() || 0;
            const dA = parseSafeDate(a.created_at)?.getTime() || 0;
            return dB - dA;
          });
        }
        setHonorsData(data);
      }
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      console.error('Error fetching honors', e);
    } finally {
      if (!ctrl.signal.aborted) {
        setLoadingHonors(false);
      }
    }
  };

  const handleSaveHonors = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saveHonorsInFlightRef.current || savingHonors) return;
    if (!editHonorsUserId) {
      toast.error(t('Vui lòng chọn nhân viên vinh danh'));
      return;
    }
    if (!editHonorsTitle.trim() || !editHonorsBadge.trim() || !editHonorsReason.trim()) {
      toast.error(t('Vui lòng nhập đầy đủ thông tin'));
      return;
    }
    saveHonorsInFlightRef.current = true;
    setSavingHonors(true);
    try {
      const res = await api.post('/posts/honors', {
        id: selectedHonorId,
        honored_user_id: editHonorsUserId,
        title: editHonorsTitle,
        badge: editHonorsBadge,
        reason: editHonorsReason
      });
      if (res.data && res.data.success) {
        toast.success(selectedHonorId ? t('Cập nhật vinh danh thành công!') : t('Thêm vinh danh mới thành công!'));
        setShowEditHonors(false);
        fetchHonors();
      }
    } catch {
      toast.error(t('Lỗi khi cập nhật vinh danh'));
    } finally {
      saveHonorsInFlightRef.current = false;
      setSavingHonors(false);
    }
  };

  const handleDeleteHonor = (id: number) => {
    showConfirm({
      title: t('Xóa vinh danh'),
      message: t('Bạn có chắc chắn muốn xóa vinh danh này không? Hành động này không thể hoàn tác.'),
      confirmText: t('Xóa'),
      isDanger: true,
      onConfirm: async () => {
        try {
          const res = await api.post('/posts/honors', {
            id,
            action: 'delete'
          });
          if (res.data && res.data.success) {
            toast.success(t('Xóa vinh danh thành công!'));
            fetchHonors();
          }
        } catch {
          toast.error(t('Lỗi khi xóa vinh danh'));
        }
      }
    });
  };

  const handleHeartHonor = async (id: number) => {
    if (honorHeartInFlightSetRef.current.has(id)) return;
    const item = honorsData?.honors?.find(h => h.id === id);
    if (item && item.user_reactions >= maxHonorClaps) {
      toast.error(t(`Bạn đã thả tối đa ${maxHonorClaps} nhiệt cho thẻ vinh danh này rồi!`));
      return;
    }

    honorHeartInFlightSetRef.current.add(id);
    try {
      const res = await api.post(`/posts/honors/${id}`);
      if (res.data && res.data.success) {
        setHonorsData(prev => {
          if (!prev) return null;
          const updatedHonors = ensureArray<HonorItem>(prev.honors).map(h => {
            if (h.id === id) {
              return {
                ...h,
                hearts_count: res.data.data.hearts_count,
                user_reactions: res.data.data.user_reactions
              };
            }
            return h;
          });
          const sorted = [...updatedHonors].sort((a, b) => {
            if (b.hearts_count !== a.hearts_count) {
              return b.hearts_count - a.hearts_count;
            }
            const dB = parseSafeDate(b.created_at)?.getTime() || 0;
            const dA = parseSafeDate(a.created_at)?.getTime() || 0;
            return dB - dA;
          });
          return {
            ...prev,
            honors: sorted
          };
        });
      }
    } catch (e: any) {
      if (e.response?.data?.message) {
        toast.error(e.response.data.message);
      } else {
        console.error('Error hearting honor card', e);
      }
    } finally {
      honorHeartInFlightSetRef.current.delete(id);
    }
  };

  // Fetch initial posts with AbortController and full server parity params
  const fetchPosts = async (reset = false) => {
    if (isFetchingRef.current && !reset) return;
    if (reset) {
      postsAbortRef.current?.abort();
    }
    const ctrl = new AbortController();
    postsAbortRef.current = ctrl;

    isFetchingRef.current = true;
    setLoading(true);

    try {
      const currentCursor = reset ? '' : (cursor || '');
      const params: Record<string, any> = {
        limit: postsLimit,
        cursor: currentCursor
      };
      if (activeTag) {
        params.tag = activeTag;
      }
      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (selectedVisibility === 'global') {
        params.visibility = 'global';
      } else if (selectedVisibility && selectedVisibility.startsWith('team_')) {
        params.visibility = 'team';
        params.team_id = selectedVisibility.replace('team_', '');
      }

      const res = await api.get('/posts', { params, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      if (res.data && res.data.success) {
        const fetched = ensureArray<Post>(res.data.data?.posts);
        const next = res.data.data?.next_cursor || null;
        const more = Boolean(res.data.data?.has_more);

        setPosts(prev => {
          if (reset) {
            if (targetPostId && !activeTag && selectedVisibility === 'all' && !debouncedSearch.trim()) {
              const pId = parseInt(targetPostId, 10);
              const deepPost = prev.find(p => p.id === pId);
              if (deepPost && !fetched.some((p: Post) => p.id === pId)) {
                return [deepPost, ...fetched];
              }
            }
            return fetched;
          }
          const existingIds = new Set(prev.map(p => p.id));
          return [...prev, ...fetched.filter(p => !existingIds.has(p.id))];
        });
        setCursor(next);
        setHasMore(more);
      }
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
      toast.error(t('Không thể tải bài viết'));
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
        isFetchingRef.current = false;
      }
    }
  };

  // Handle Deep Linking from Notifications (/feed?post_id=X&open_comment=Y)
  useEffect(() => {
    if (!targetPostId) return;
    const postIdNum = parseInt(targetPostId, 10);
    if (isNaN(postIdNum)) return;

    let isMounted = true;
    const timers: any[] = [];
    const deepAbort = new AbortController();

    const handleDeepLink = async () => {
      try {
        try {
          const res = await api.get(`/posts/${postIdNum}`, { signal: deepAbort.signal });
          if (isMounted && res.data && res.data.success && res.data.data?.post) {
            const fetchedPost = res.data.data.post;
            setPosts(curr => curr.some(p => p.id === fetchedPost.id) ? curr : [fetchedPost, ...curr]);
          }
        } catch (fetchErr: any) {
          if (fetchErr?.name !== 'CanceledError' && fetchErr?.name !== 'AbortError') {
            console.error('Error fetching deep linked post', fetchErr);
          }
        }

        if (!isMounted) return;

        setActiveCommentsPostId(postIdNum);
        await loadComments(postIdNum);

        if (!isMounted) return;

        if (openCommentId) {
          const commentIdNum = parseInt(openCommentId, 10);
          setHighlightedCommentId(commentIdNum);
          timers.push(setTimeout(() => {
            const el = document.getElementById(`comment-${commentIdNum}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else {
              const postEl = document.getElementById(`post-${postIdNum}`);
              if (postEl) postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 400));

          timers.push(setTimeout(() => {
            if (isMounted) setHighlightedCommentId(null);
          }, highlightMs));
        } else {
          setHighlightedPostId(postIdNum);
          timers.push(setTimeout(() => {
            const postEl = document.getElementById(`post-${postIdNum}`);
            if (postEl) {
              postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 400));

          timers.push(setTimeout(() => {
            if (isMounted) setHighlightedPostId(null);
          }, highlightMs));
        }

        // Clear URL deep-link params after hydrating so refresh doesn't hijack scroll
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('post_id');
        nextParams.delete('open_comment');
        setSearchParams(nextParams, { replace: true });
      } catch (e) {
        console.error('Deep link error', e);
      }
    };

    handleDeepLink();

    return () => {
      isMounted = false;
      deepAbort.abort();
      timers.forEach(tId => clearTimeout(tId));
    };
  }, [targetPostId, openCommentId]);

  // Reset and reload when filters change
  useEffect(() => {
    fetchPosts(true);
    fetchHonors();
  }, [activeTag, selectedVisibility, debouncedSearch]);

  useEffect(() => {
    fetchTeams();
    fetchAllStaff();
  }, []);

  // Infinite Scroll Observer Setup
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasMore && !loading && posts.length > 0) {
          fetchPosts();
        }
      },
      { threshold: 0.1 }
    );

    if (bottomObserverRef.current) {
      observer.observe(bottomObserverRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [cursor, hasMore, loading, posts.length]);

  // Handle post submit
  const handlePostSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (postSubmitInFlightRef.current || isSubmitting) return;
    if (!hasRichContent(content, attachments.length)) return;
    if (visibility === 'team' && !selectedTeamId) {
      toast.error(t('Vui lòng chọn phòng ban đăng bài'));
      return;
    }
    if (visibility === 'specific' && targetUserIds.length === 0) {
      toast.error(t('Vui lòng chọn ít nhất một người xem cho bài viết chỉ định'));
      return;
    }
    postSubmitInFlightRef.current = true;
    setIsSubmitting(true);

    try {
      const res = await api.post('/posts', {
        content: content.trim(),
        visibility,
        team_id: visibility === 'team' ? selectedTeamId : null,
        target_user_ids: visibility === 'specific' ? targetUserIds : [],
        excluded_user_ids: excludedUserIds,
        attachments
      });

      if (res.data && res.data.success) {
        toast.success(t('Đã đăng bài viết mới!'));
        setContent('');
        setAttachments([]);
        setSelectedTeamId(null);
        setTargetUserIds([]);
        setExcludedUserIds([]);
        fetchPosts(true);
      }
    } catch {
      toast.error(t('Lỗi khi đăng bài'));
    } finally {
      postSubmitInFlightRef.current = false;
      setIsSubmitting(false);
    }
  };

  // Handle open edit post modal
  const handleOpenEditPost = (post: Post) => {
    setEditingPost(post);
    setEditContent(post.content || '');
    setEditVisibility(post.visibility || 'global');
    setEditTeamId(post.team_id || null);
    setEditTargetUserIds(ensureArray(post.target_user_ids));
    setEditExcludedUserIds(ensureArray(post.excluded_user_ids));
    setEditAttachments(ensureArray(post.attachments));
  };

  // Handle save edit post
  const handleSaveEditPost = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingPost || editPostInFlightRef.current || isSavingEdit) return;
    if (!hasRichContent(editContent, editAttachments.length)) {
      toast.error(t('Nội dung bài viết không được để trống'));
      return;
    }
    if (editVisibility === 'team' && !editTeamId) {
      toast.error(t('Vui lòng chọn phòng ban'));
      return;
    }
    if (editVisibility === 'specific' && editTargetUserIds.length === 0) {
      toast.error(t('Vui lòng chọn ít nhất một người xem'));
      return;
    }

    editPostInFlightRef.current = true;
    setIsSavingEdit(true);
    try {
      const res = await api.put(`/posts/${editingPost.id}`, {
        content: editContent,
        visibility: editVisibility,
        team_id: editVisibility === 'team' ? editTeamId : null,
        target_user_ids: editVisibility === 'specific' ? editTargetUserIds : [],
        excluded_user_ids: editExcludedUserIds,
        attachments: editAttachments
      });
      if (res.data?.success || res.status === 200) {
        toast.success(t('Đã cập nhật bài viết thành công'));
        const updatedTeam = teams.find(tm => tm.id === editTeamId);
        const resolvedTargetUsers = allStaff.filter(s => editTargetUserIds.includes(s.id));
        const resolvedExcludedUsers = allStaff.filter(s => editExcludedUserIds.includes(s.id));

        setPosts(prev => prev.map(p => {
          if (p.id === editingPost.id) {
            return {
              ...p,
              content: editContent,
              visibility: editVisibility,
              team_id: editVisibility === 'team' ? editTeamId : null,
              team_name: editVisibility === 'team' ? (updatedTeam?.name || p.team_name) : null,
              target_user_ids: editVisibility === 'specific' ? editTargetUserIds : [],
              excluded_user_ids: editExcludedUserIds,
              target_users: editVisibility === 'specific' ? resolvedTargetUsers : [],
              excluded_users: resolvedExcludedUsers,
              attachments: editAttachments
            };
          }
          return p;
        }));
        setEditingPost(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || t('Lỗi khi cập nhật bài viết'));
    } finally {
      editPostInFlightRef.current = false;
      setIsSavingEdit(false);
    }
  };

  // Handle image/media upload in edit modal
  const handleEditImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setEditUploading(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of Array.from(files)) {
        if (FORBIDDEN_FEED_EXT.test(file.name)) {
          toast.error(`Định dạng tệp "${file.name}" không được phép tải lên.`);
          continue;
        }
        if (file.size > maxUploadBytes) {
          toast.error(`Tệp "${file.name}" vượt quá giới hạn tối đa ${maxUploadMb}MB.`);
          continue;
        }
        let fileToUpload = file;
        if (file.type.startsWith('image/')) {
          try {
            fileToUpload = await compressToWebP(file);
          } catch {}
        }
        const formData = new FormData();
        formData.append('file', fileToUpload);
        const res = await api.post('/upload', formData);
        const url = res.data?.data?.url || res.data?.url || res.data?.file_url;
        if (url && typeof url === 'string') {
          uploadedUrls.push(resolveFeedMediaUrl(url) || url);
        }
      }
      if (uploadedUrls.length > 0) {
        setEditAttachments(prev => [...prev, ...uploadedUrls]);
        toast.success(t('Đã tải tệp lên'));
      }
    } catch {
      toast.error(t('Lỗi upload ảnh'));
    } finally {
      setEditUploading(false);
      if (e.target) e.target.value = '';
    }
  };

  // Handle post delete
  const handleDeletePost = (postId: number) => {
    showConfirm({
      title: t('Xóa bài viết'),
      message: t('Bạn có chắc chắn muốn xóa bài viết này không? Toàn bộ bình luận và tương tác liên quan sẽ bị xóa bỏ.'),
      confirmText: t('Xóa'),
      isDanger: true,
      onConfirm: async () => {
        try {
          const res = await api.delete(`/posts/${postId}`);
          if (res.data && res.data.success) {
            toast.success(t('Bài viết đã được xóa'));
            setPosts(prev => prev.filter(p => p.id !== postId));
          }
        } catch {
          toast.error(t('Lỗi khi xóa bài viết'));
        }
      }
    });
  };

  // Handle Reaction Selection (with per-post in-flight lock)
  const handleReact = async (postId: number, reactionType: string) => {
    if (reactInFlightSetRef.current.has(postId)) return;
    reactInFlightSetRef.current.add(postId);
    try {
      const res = await api.post(`/posts/${postId}/react`, {
        reaction_type: reactionType
      });

      if (res.data && res.data.success) {
        const payload = res.data.data;
        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              reactions_summary: payload.reactions_summary || {},
              reactions_count: Number(payload.reactions_count || 0),
              user_reaction: payload.user_reaction
            };
          }
          return p;
        }));
      }
    } catch {
      toast.error(t('Lỗi khi tương tác bài viết'));
    } finally {
      reactInFlightSetRef.current.delete(postId);
    }
  };

  // Load comments for a post with AbortController and accurate total count
  const loadComments = async (postId: number): Promise<number | null> => {
    commentsAbortMapRef.current[postId]?.abort();
    const ctrl = new AbortController();
    commentsAbortMapRef.current[postId] = ctrl;
    setLoadingCommentsMap(prev => ({ ...prev, [postId]: true }));
    try {
      const res = await api.get(`/posts/${postId}/comments`, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return null;
      if (res.data && res.data.success) {
        const list = ensureArray<Comment>(res.data.data?.comments);
        setCommentsMap(prev => ({
          ...prev,
          [postId]: list
        }));
        return countTotalComments(list);
      }
      return null;
    } catch (e: any) {
      if (e?.name === 'CanceledError' || e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return null;
      toast.error(t('Không thể tải bình luận'));
      return null;
    } finally {
      if (!ctrl.signal.aborted) {
        setLoadingCommentsMap(prev => ({ ...prev, [postId]: false }));
      }
    }
  };

  // Toggle comments drawer
  const toggleCommentsDrawer = (postId: number) => {
    if (activeCommentsPostId === postId) {
      setActiveCommentsPostId(null);
    } else {
      setActiveCommentsPostId(postId);
      loadComments(postId);
    }
  };

  // Handle add comment / reply
  const handleAddComment = async (postId: number, parentId: number | null = null, commentText?: string): Promise<boolean> => {
    const rawText = commentText !== undefined ? commentText : (newCommentText[postId] || '');
    if (!hasRichContent(rawText)) return false;
    if (commentSendInFlightSetRef.current.has(postId)) return false;
    commentSendInFlightSetRef.current.add(postId);

    try {
      const res = await api.post(`/posts/${postId}/comments`, {
        content: rawText.trim(),
        parent_id: parentId
      });

      if (res.data && res.data.success) {
        setNewCommentText(prev => ({ ...prev, [postId]: '' }));
        setReplyToCommentId(prev => ({ ...prev, [postId]: null }));
        const syncedTotal = await loadComments(postId);

        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return { ...p, comments_count: syncedTotal !== null ? syncedTotal : p.comments_count + 1 };
          }
          return p;
        }));
        return true;
      }
      return false;
    } catch {
      toast.error(t('Lỗi khi thêm bình luận'));
      return false;
    } finally {
      commentSendInFlightSetRef.current.delete(postId);
    }
  };

  // Handle send sticker comment directly
  const handleSendStickerComment = async (postId: number, stickerUrl: string, parentId: number | null = null) => {
    if (stickerCommentInFlightSetRef.current.has(postId)) return;
    stickerCommentInFlightSetRef.current.add(postId);
    try {
      const res = await api.post(`/posts/${postId}/comments`, {
        content: stickerUrl,
        parent_id: parentId
      });

      if (res.data && res.data.success) {
        setReplyToCommentId(prev => ({ ...prev, [postId]: null }));
        const syncedTotal = await loadComments(postId);

        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return { ...p, comments_count: syncedTotal !== null ? syncedTotal : p.comments_count + 1 };
          }
          return p;
        }));
        toast.success(t('Đã gửi nhãn dán!'));
      }
    } catch {
      toast.error(t('Lỗi khi gửi nhãn dán'));
    } finally {
      stickerCommentInFlightSetRef.current.delete(postId);
    }
  };

  // Handle delete comment (sync accurate count including cascade-deleted replies)
  const handleDeleteComment = async (postId: number, commentId: number) => {
    try {
      const res = await api.delete(`/posts/comments/${commentId}`);
      if (res.data && res.data.success) {
        toast.success(t('Đã xóa bình luận'));
        const syncedTotal = await loadComments(postId);
        setPosts(prev => prev.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              comments_count: syncedTotal !== null ? syncedTotal : Math.max(0, p.comments_count - 1)
            };
          }
          return p;
        }));
      }
    } catch (e: any) {
      const errMsg = e?.response?.data?.message || t('Lỗi khi xóa bình luận');
      toast.error(errMsg);
    }
  };

  // Handle save edited comment
  const handleSaveEditComment = async (commentId: number, postId: number, updatedText: string) => {
    if (!hasRichContent(updatedText) || editCommentInFlightRef.current || isSavingCommentEdit) return;
    editCommentInFlightRef.current = true;
    setIsSavingCommentEdit(true);
    try {
      const res = await api.put(`/comments/${commentId}`, { content: updatedText.trim() });
      if (res.data && res.data.success) {
        setCommentsMap(prev => {
          const postComments = prev[postId] || [];
          return {
            ...prev,
            [postId]: postComments.map(c => {
              if (c.id === commentId) {
                return { ...c, content: updatedText.trim() };
              }
              if (c.replies) {
                return {
                  ...c,
                  replies: c.replies.map(r => r.id === commentId ? { ...r, content: updatedText.trim() } : r)
                };
              }
              return c;
            })
          };
        });
        setEditingComment(null);
        toast.success(t('Đã cập nhật bình luận!'));
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || t('Lỗi khi cập nhật bình luận'));
    } finally {
      editCommentInFlightRef.current = false;
      setIsSavingCommentEdit(false);
    }
  };

  // Handle copy post direct link
  const handleCopyPostLink = (postId: number) => {
    const url = `${window.location.origin}${window.location.pathname}?post_id=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success(t('Đã sao chép liên kết bài viết!'));
    }).catch(() => {
      toast(url, { icon: '🔗' });
    });
  };

  // Handle pasted image from clipboard into composer
  const handlePastedImage = async (file: File) => {
    if (FORBIDDEN_FEED_EXT.test(file.name)) {
      toast.error(`Định dạng tệp "${file.name}" không được phép tải lên.`);
      return;
    }
    if (file.size > maxUploadBytes) {
      toast.error(`Tệp "${file.name}" vượt quá giới hạn tối đa ${maxUploadMb}MB.`);
      return;
    }
    setUploading(true);
    const toastId = toast.loading(t('Đang xử lý ảnh từ clipboard...'));
    try {
      let fileToUpload = file;
      try {
        fileToUpload = await compressToWebP(file);
      } catch {}

      const formData = new FormData();
      formData.append('file', fileToUpload);

      const res = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const fileUrl = res.data?.data?.url || res.data?.url || res.data?.file_url;
      if (fileUrl && typeof fileUrl === 'string') {
        const resolved = resolveFeedMediaUrl(fileUrl) || fileUrl;
        setAttachments(prev => [...prev, resolved]);
        toast.success(t('Đã dán ảnh từ clipboard!'), { id: toastId });
      } else {
        toast.error(t('Không lấy được URL ảnh'), { id: toastId });
      }
    } catch {
      toast.error(t('Lỗi khi tải ảnh từ clipboard'), { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  // File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);

    try {
      const uploadedUrls: string[] = [];
      for (const rawFile of Array.from(files)) {
        if (FORBIDDEN_FEED_EXT.test(rawFile.name)) {
          toast.error(`Định dạng tệp "${rawFile.name}" không được phép tải lên.`);
          continue;
        }
        if (rawFile.size > maxUploadBytes) {
          toast.error(`Tệp "${rawFile.name}" vượt quá giới hạn tối đa ${maxUploadMb}MB.`);
          continue;
        }
        let fileToUpload = rawFile;
        if (fileToUpload.type.startsWith('image/')) {
          try {
            fileToUpload = await compressToWebP(fileToUpload);
          } catch (compressErr) {
            console.warn('Image compression failed, using raw file', compressErr);
          }
        }

        const formData = new FormData();
        formData.append('file', fileToUpload);

        const res = await api.post('/upload', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        const fileUrl = res.data?.data?.url || res.data?.url || res.data?.file_url;
        if (fileUrl && typeof fileUrl === 'string') {
          uploadedUrls.push(resolveFeedMediaUrl(fileUrl) || fileUrl);
        }
      }

      if (uploadedUrls.length > 0) {
        setAttachments(prev => [...prev, ...uploadedUrls]);
        toast.success(t(`Đã tải lên ${uploadedUrls.length} tệp tin`));
      }
    } catch {
      toast.error(t('Lỗi tải tệp lên server'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  // Convert plain text URLs to clickable <a> elements
  const formatText = (text: string) => {
    const urlRegex = /(https?:\/\/[^\s<>]+)/gi;
    const parts = text.split(urlRegex);
    return parts.map((part, index) => {
      if (part.match(urlRegex)) {
        return (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
            {part}
          </a>
        );
      }
      const tagRegex = /(#\w+)/gu;
      const subParts = part.split(tagRegex);
      return subParts.map((subPart, subIdx) => {
        if (subPart.match(tagRegex)) {
          return (
            <span
              key={`${index}-${subIdx}`}
              onClick={() => setActiveTag(subPart.replace('#', ''))}
              style={{ color: 'var(--color-primary)', cursor: 'pointer', fontWeight: 600 }}
            >
              {subPart}
            </span>
          );
        }
        return subPart;
      });
    });
  };

  const renderPostContent = (contentStr: string) => {
    if (!contentStr) return null;
    const isHtml = /<[a-z][\s\S]*>/i.test(contentStr);
    if (isHtml) {
      return (
        <div
          className="rich-text-content"
          dangerouslySetInnerHTML={{ __html: safeSanitize(contentStr) }}
          style={{ fontSize: '0.9rem', color: 'var(--color-text)', wordBreak: 'break-word' }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            const isEntityChip = Boolean(
              target.closest('.entity-mention') ||
              target.closest('[data-entity-type]') ||
              target.hasAttribute('data-entity-type')
            );
            if (!isEntityChip && target.tagName === 'SPAN' && target.textContent?.startsWith('#')) {
              const tag = target.textContent.replace('#', '').trim();
              if (tag) setActiveTag(tag);
              return;
            }
            if (target.tagName === 'IMG') {
              const imgEl = target as HTMLImageElement;
              const isAvatarImg =
                imgEl.classList.contains('mention-avatar') ||
                imgEl.hasAttribute('data-mention-avatar') ||
                Boolean(imgEl.closest('.mention'));
              const src = imgEl.currentSrc || imgEl.src;
              if (src && !isAvatarImg) {
                setLightboxData({
                  items: [{ url: src, type: 'image', name: imgEl.alt || 'Ảnh bài viết' }],
                  initialIndex: 0
                });
              }
            }
          }}
        />
      );
    }
    return (
      <p className="feed-plain-post-body" style={{
        margin: 0,
        fontSize: '0.875rem',
        lineHeight: '1.52',
        color: 'var(--color-text)',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word'
      }}>
        {formatText(contentStr)}
      </p>
    );
  };

  const isOnlyStickerComment = (rawContent: string) => {
    if (!rawContent) return false;
    const cleaned = rawContent
      .replace(/<\/?(?:p|div|span)[^>]*>/gi, '')
      .replace(/&nbsp;/gi, '')
      .trim();
    if (/^\/stickers\/[a-zA-Z0-9_\-\/]+\.(png|gif|webp|jpg)$/i.test(cleaned)) return true;
    if (/^<img\s+[^>]*src=["'][^"']*\/stickers\/[^"']*["'][^>]*\/?>$/i.test(cleaned)) return true;
    if (/^!\[.*?\]\([^\)]*\/stickers\/[^\)]*\)$/i.test(cleaned)) return true;
    return false;
  };

  const renderCommentContent = (content: string) => {
    if (!content) return null;
    const trimmed = content.trim();

    // Check if content is a direct sticker URL
    if (/^\/stickers\/[a-zA-Z0-9_\-\/]+\.(png|gif|webp|jpg)$/i.test(trimmed)) {
      return (
        <div style={{ marginTop: '4px', marginBottom: '2px' }}>
          <img 
            src={trimmed} 
            alt="sticker" 
            loading="lazy"
            decoding="async"
            className="feed-comment-sticker" 
            style={{ 
              maxWidth: '120px', 
              maxHeight: '120px', 
              width: 'auto', 
              height: 'auto', 
              objectFit: 'contain', 
              display: 'block', 
              borderRadius: '8px' 
            }} 
          />
        </div>
      );
    }

    // Check if content is markdown sticker ![...](/stickers/...)
    const mdStickerMatch = trimmed.match(/^!\[.*?\]\(([^\)]*\/stickers\/[^\)]*)\)$/i);
    if (mdStickerMatch) {
      return (
        <div style={{ marginTop: '4px', marginBottom: '2px' }}>
          <img 
            src={mdStickerMatch[1]} 
            alt="sticker" 
            loading="lazy"
            decoding="async"
            className="feed-comment-sticker" 
            style={{ 
              maxWidth: '120px', 
              maxHeight: '120px', 
              width: 'auto', 
              height: 'auto', 
              objectFit: 'contain', 
              display: 'block', 
              borderRadius: '8px' 
            }} 
          />
        </div>
      );
    }

    const cleanContent = (content || '')
      .replace(/&amp;nbsp;/gi, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ');

    const isHtml = /<[a-z][\s\S]*>/i.test(cleanContent);
    if (isHtml) {
      const sanitized = safeSanitize(cleanContent);
      const structuredHtml = formatCommentHtmlWithMediaRow(sanitized);
      return (
        <div 
          className="rich-text-content feed-rich-comment" 
          dangerouslySetInnerHTML={{ __html: structuredHtml }} 
          style={{ fontSize: '0.8rem', color: 'var(--color-text)', lineHeight: 1.4, wordBreak: 'break-word' }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'IMG') {
              const imgEl = target as HTMLImageElement;
              const src = imgEl.currentSrc || imgEl.src;
              const isMentionAvatar = imgEl.classList.contains('mention-avatar') || 
                                     imgEl.hasAttribute('data-mention-avatar') || 
                                     Boolean(imgEl.closest('.mention'));
              if (src && !isMentionAvatar) {
                const container = target.closest('.feed-comment-media-row') || target.closest('.feed-rich-comment') || target.parentElement;
                const commentImgs = container 
                  ? Array.from(container.querySelectorAll<HTMLImageElement>('img:not(.mention-avatar):not([data-mention-avatar]):not(.chat-comment-sticker):not(.feed-comment-sticker)'))
                  : [imgEl];
                const items: AttachmentItem[] = commentImgs.map(img => ({
                  url: img.currentSrc || img.src,
                  type: 'image',
                  name: img.alt || 'Ảnh bình luận'
                }));
                const clickedIndex = commentImgs.indexOf(imgEl);
                setLightboxData({
                  items: items.length > 0 ? items : [{ url: src, type: 'image', name: imgEl.alt || 'Ảnh bình luận' }],
                  initialIndex: clickedIndex >= 0 ? clickedIndex : 0
                });
              }
            }
          }}
        />
      );
    }
    return (
      <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--color-text)', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
        {cleanContent}
      </p>
    );
  };

  // Reactions Popover Hover Handlers
  const handleMouseEnterLike = (postId: number) => {
    if (hoverTimeoutRef.current[postId]) clearTimeout(hoverTimeoutRef.current[postId]);
    hoverTimeoutRef.current[postId] = setTimeout(() => {
      setHoveredPostId(postId);
    }, 250);
  };

  const handleMouseLeaveLike = (postId: number) => {
    if (hoverTimeoutRef.current[postId]) clearTimeout(hoverTimeoutRef.current[postId]);
    hoverTimeoutRef.current[postId] = setTimeout(() => {
      setHoveredPostId(null);
    }, 300);
  };

  // Grid layout helper for multi-image attachments
  const renderAttachmentsGrid = (rawUrls: string[]) => {
    const urls = ensureArray<string>(rawUrls)
      .filter(u => Boolean(u && typeof u === 'string'))
      .map(u => resolveFeedMediaUrl(u) || u);
    if (urls.length === 0) return null;
    const isImage = (url: string) => !isVideoUrl(url);

    const handleOpenLightbox = (index: number) => {
      const items: AttachmentItem[] = urls.map(u => ({
        url: u,
        type: isImage(u) ? 'image' : 'other',
        name: u.split('/').pop() || 'Attachment'
      }));
      setLightboxData({ items, initialIndex: index });
    };

    if (urls.length === 1) {
      const url = urls[0];
      return (
        <div className="feed-attachment-single" style={{ marginTop: '0.75rem', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--color-border-light)', lineHeight: 0, background: 'var(--color-bg)' }}>
          {isImage(url) ? (
            <img
              src={url}
              alt="Attachment"
              loading="lazy"
              decoding="async"
              onClick={() => handleOpenLightbox(0)}
              style={{ display: 'block', width: '100%', maxHeight: '550px', objectFit: 'contain', cursor: 'pointer', background: 'rgba(0,0,0,0.02)' }}
              title={t('Click để phóng to ảnh')}
            />
          ) : (
            <video src={url} controls preload="none" style={{ display: 'block', width: '100%', maxHeight: '550px' }} />
          )}
        </div>
      );
    }

    if (urls.length === 2) {
      return (
        <div className="feed-attachment-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '0.75rem', borderRadius: '12px', overflow: 'hidden', lineHeight: 0 }}>
          {urls.map((url, i) => (
            <div key={i} className="feed-attachment-cell-2" style={{ height: '220px', background: 'var(--color-bg)', overflow: 'hidden' }}>
              {isImage(url) ? (
                <img
                  src={url}
                  alt="Attachment"
                  loading="lazy"
                  decoding="async"
                  onClick={() => handleOpenLightbox(i)}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                  title={t('Click để phóng to ảnh')}
                />
              ) : (
                <video src={url} controls preload="none" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>
          ))}
        </div>
      );
    }

    // 3 or more attachments layout
    return (
      <div className="feed-attachment-grid-3" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginTop: '0.75rem', borderRadius: '12px', overflow: 'hidden', lineHeight: 0 }}>
        <div className="feed-attachment-cell-3-main" style={{ height: '320px', background: 'var(--color-bg)', overflow: 'hidden' }}>
          {isImage(urls[0]) ? (
            <img
              src={urls[0]}
              alt="Attachment"
              loading="lazy"
              decoding="async"
              onClick={() => handleOpenLightbox(0)}
              style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
              title={t('Click để phóng to ảnh')}
            />
          ) : (
            <video src={urls[0]} controls preload="none" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div className="feed-attachment-cell-3-sub" style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: '8px', height: '320px' }}>
          {urls.slice(1, 3).map((url, i) => (
            <div key={i} style={{ height: '100%', position: 'relative', background: 'var(--color-bg)', overflow: 'hidden' }}>
              {isImage(url) ? (
                <img
                  src={url}
                  alt="Attachment"
                  loading="lazy"
                  decoding="async"
                  onClick={() => handleOpenLightbox(i + 1)}
                  style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                  title={t('Click để phóng to ảnh')}
                />
              ) : (
                <video src={url} controls preload="none" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              {i === 1 && urls.length > 3 && (
                <div
                  onClick={() => handleOpenLightbox(2)}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    cursor: 'pointer'
                  }}
                  title={t('Xem tất cả ảnh')}
                >
                  +{urls.length - 3}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Filtered list (memoized with debounced search & safe array guards)
  const filteredPosts = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return ensureArray<Post>(posts).filter(p => {
      const matchesSearch = !term ||
        String(p.content || '').toLowerCase().includes(term) ||
        String(p.author_name || '').toLowerCase().includes(term);

      let matchesVisibility = true;
      if (selectedVisibility === 'global') {
        matchesVisibility = p.visibility === 'global';
      } else if (selectedVisibility && selectedVisibility.startsWith('team_')) {
        const teamId = parseInt(selectedVisibility.replace('team_', ''), 10);
        matchesVisibility = p.visibility === 'team' && Number(p.team_id) === teamId;
      }
      return matchesSearch && matchesVisibility;
    });
  }, [posts, debouncedSearch, selectedVisibility]);

  return (
    <div 
      className="feed-container"
      style={{
        maxWidth: '1380px',
        margin: '0 auto',
        padding: '2rem 1.5rem',
        fontFamily: "'Outfit', 'Inter', sans-serif"
      }}
    >
      <style>{`
        @keyframes feedSkeletonShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .feed-post-card {
          content-visibility: auto;
          contain-intrinsic-size: 0 420px;
        }
        .rich-text-content:not(.feed-rich-comment) img:not(.chat-comment-sticker):not(.feed-comment-sticker):not([src*="/stickers/"]):not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar) {
          max-width: 100% !important;
          max-height: 550px !important;
          width: auto !important;
          height: auto !important;
          border-radius: 12px !important;
          object-fit: contain !important;
          cursor: zoom-in !important;
          margin: 8px 0 !important;
          display: block !important;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .rich-text-content img:hover {
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
        }
        .feed-rich-comment img:not(.chat-comment-sticker):not(.feed-comment-sticker):not([src*="/stickers/"]):not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar) {
          max-width: min(220px, 100%) !important;
          max-height: 180px !important;
          width: auto !important;
          height: auto !important;
          border-radius: 8px !important;
          cursor: zoom-in !important;
          display: inline-block !important;
          vertical-align: top !important;
          margin: 4px 6px 4px 0 !important;
          object-fit: cover !important;
          background: rgba(0, 0, 0, 0.02) !important;
          border: 1px solid var(--color-border-light, rgba(0, 0, 0, 0.08)) !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06) !important;
          transition: transform 0.15s ease, box-shadow 0.15s ease !important;
        }
        .feed-rich-comment img:not(.chat-comment-sticker):not(.feed-comment-sticker):not([src*="/stickers/"]):not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar):hover {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12) !important;
        }
        .feed-comment-media-row {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 6px !important;
          margin-top: 6px !important;
          margin-bottom: 2px !important;
          width: 100% !important;
          clear: both !important;
        }
        .feed-comment-media-row img {
          max-width: min(220px, 100%) !important;
          max-height: 180px !important;
          width: auto !important;
          height: auto !important;
          border-radius: 8px !important;
          cursor: zoom-in !important;
          flex: 0 0 auto !important;
          margin: 0 !important;
          object-fit: cover !important;
          background: rgba(0, 0, 0, 0.02) !important;
          border: 1px solid var(--color-border-light, rgba(0, 0, 0, 0.08)) !important;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06) !important;
          transition: transform 0.15s ease, box-shadow 0.15s ease !important;
        }
        .feed-comment-media-row img:hover {
          transform: scale(1.02);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12) !important;
        }
        /* Lock mention avatars strictly to 16x16 circle */
        .feed-rich-comment span.mention img,
        .feed-rich-comment .mention-avatar,
        .feed-rich-comment img[data-mention-avatar],
        .rich-text-content span.mention img,
        .rich-text-content .mention-avatar,
        .rich-text-content img[data-mention-avatar] {
          width: 16px !important;
          height: 16px !important;
          min-width: 16px !important;
          min-height: 16px !important;
          max-width: 16px !important;
          max-height: 16px !important;
          border-radius: 50% !important;
          object-fit: cover !important;
          display: inline-block !important;
          vertical-align: middle !important;
          margin: 0 4px 0 0 !important;
          padding: 0 !important;
          box-shadow: none !important;
          border: none !important;
          cursor: default !important;
          transform: none !important;
        }
        .feed-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 340px;
          gap: 36px;
          align-items: start;
          width: 100%;
          max-width: 100%;
        }
        .feed-main-col {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          min-width: 0;
          max-width: 100%;
          width: 100%;
        }
        .feed-post-card {
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box !important;
          overflow-wrap: anywhere;
        }
        .feed-post-card .rich-text-content,
        .feed-post-card .rich-text-content p,
        .feed-post-card .rich-text-content div,
        .feed-post-card .rich-text-content li,
        .feed-post-card .rich-text-content span:not(.mention) {
          font-size: 0.9rem !important;
          line-height: 1.52 !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
          max-width: 100% !important;
        }
        .feed-post-card .rich-text-content h1,
        .feed-post-card .rich-text-content h2,
        .feed-post-card .rich-text-content h3,
        .feed-post-card .rich-text-content h4 {
          font-size: 1rem !important;
          font-weight: 700 !important;
          line-height: 1.42 !important;
          margin: 4px 0 !important;
          overflow-wrap: anywhere !important;
          word-break: break-word !important;
          max-width: 100% !important;
        }
        .feed-mobile-honors-strip {
          display: none;
        }
        .icon-only-select [class*="trigger"] {
          border: none !important;
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 4px !important;
          justify-content: center !important;
          gap: 2px !important;
          min-height: 32px !important;
          height: 32px !important;
        }
        .icon-only-select [class*="triggerContent"] span:has(svg) + span {
          display: none !important;
        }
        .icon-only-select [class*="triggerContent"] span:has(svg) {
          margin: 0 !important;
        }
        .icon-only-select [class*="selectedValue"] {
          width: auto !important;
          overflow: visible !important;
        }
        .enterprise-feed-grid {
          display: grid !important;
          grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)) !important;
          gap: 1.25rem !important;
          align-items: start !important;
          min-width: 0 !important;
          max-width: 100% !important;
        }
        @media (max-width: 1024px) {
          .feed-layout {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 14px !important;
          }
          .feed-sidebar {
            display: none !important;
          }
          .feed-mobile-honors-strip {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            padding-bottom: 2px;
          }
          .feed-mobile-honors-strip::-webkit-scrollbar {
            display: none;
          }
        }
        @media (max-width: 768px) {
          .enterprise-feed-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 0.75rem !important;
          }
          .feed-container {
            padding: 0.25rem 0 calc(var(--mobile-bottom-nav-height, 62px) + env(safe-area-inset-bottom, 0px) + 96px) 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            overflow-x: hidden !important;
          }
          .feed-page-heading {
            font-size: 1.125rem !important;
            line-height: 1.28 !important;
          }
          .feed-page-heading svg {
            width: 18px !important;
            height: 18px !important;
          }
          .feed-filter-bar {
            flex-wrap: nowrap !important;
            padding: 6px 8px !important;
            gap: 6px !important;
          }
          .feed-search-box {
            min-width: 0 !important;
          }
          .feed-view-toggle-label {
            display: none !important;
          }
          .feed-composer {
            padding: 12px !important;
            border-radius: 14px !important;
            margin-bottom: 10px !important;
            gap: 10px !important;
          }
          .feed-composer-top {
            gap: 8px !important;
          }
          .composer-actions-bar {
            flex-wrap: nowrap !important;
            gap: 6px !important;
            padding-top: 8px !important;
            align-items: center !important;
          }
          .composer-left-tools {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            display: flex !important;
            align-items: center !important;
            gap: 5px !important;
            flex-wrap: nowrap !important;
          }
          .composer-photo-label {
            padding: 5px 9px !important;
            font-size: 0.74rem !important;
          }
          .composer-photo-text {
            display: none !important;
          }
          .composer-submit-btn {
            white-space: nowrap !important;
            padding: 0 12px !important;
            min-width: 0 !important;
            height: 32px !important;
            flex-shrink: 0 !important;
            font-size: 0.76rem !important;
          }
          .feed-post-card {
            padding: 12px !important;
            border-radius: 14px !important;
            margin-bottom: 0 !important;
            gap: 10px !important;
          }
          .feed-post-card .rich-text-content,
          .feed-post-card .rich-text-content p,
          .feed-post-card .rich-text-content div,
          .feed-post-card .rich-text-content li,
          .feed-post-card .rich-text-content span:not(.mention),
          .feed-plain-post-body {
            font-size: 0.875rem !important;
            line-height: 1.48 !important;
            font-weight: 400;
          }
          .feed-post-card .rich-text-content strong,
          .feed-post-card .rich-text-content b {
            font-weight: 700 !important;
          }
          .feed-post-card .rich-text-content h1,
          .feed-post-card .rich-text-content h2,
          .feed-post-card .rich-text-content h3,
          .feed-post-card .rich-text-content h4 {
            font-size: 0.94rem !important;
            font-weight: 700 !important;
            line-height: 1.38 !important;
          }
          .feed-attachment-single img, .feed-attachment-single video {
            max-height: 320px !important;
          }
          .feed-attachment-grid-2 {
            gap: 4px !important;
          }
          .feed-attachment-cell-2 {
            height: 160px !important;
          }
          .feed-attachment-grid-3 {
            gap: 4px !important;
          }
          .feed-attachment-cell-3-main {
            height: 210px !important;
          }
          .feed-attachment-cell-3-sub {
            gap: 4px !important;
            height: 210px !important;
          }
          .post-action-btn {
            font-size: 0.75rem !important;
            height: 34px !important;
          }
          .post-action-btn span {
            font-size: 0.75rem !important;
          }
        }
      `}</style>

      <div className="feed-layout">
        {/* Left Side: Timeline Feed */}
        <div className="feed-main-col">
      {/* Header with quick dashboard filters */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        marginBottom: '0.5rem'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <h2 className="feed-page-heading page-title" style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe size={22} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('Bảng tin doanh nghiệp')}</span>
            </h2>
            <span className="page-subtitle" style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', display: 'block' }}>{t('Chia sẻ tin tức, gắn kết đội ngũ')}</span>
          </div>
          {activeTag && (
            <button
              type="button"
              onClick={() => setActiveTag(null)}
              style={{
                background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D',
                border: '1px solid rgba(189, 29, 45, 0.2)',
                padding: '5px 10px',
                borderRadius: '20px',
                fontSize: '0.74rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                cursor: 'pointer',
                flexShrink: 0
              }}
            >
              <Tag size={12} />
              #{activeTag} &times;
            </button>
          )}
        </div>

        {/* Filters and search bar */}
        <div className="feed-filter-bar" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '10px',
          background: 'var(--color-surface)',
          padding: '8px 12px',
          borderRadius: '12px',
          border: '1px solid var(--color-border-light)',
          flexWrap: 'wrap',
          minWidth: 0
        }}>
          <div className="feed-search-box" style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: '140px' }}>
            <input 
              type="text" 
              placeholder={t('Tìm bài viết, tác giả...')} 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                padding: '0 28px 0 8px',
                fontSize: '0.85rem',
                height: '32px',
                outline: 'none',
                color: 'var(--color-text)',
                minWidth: 0
              }}
            />
            <Search size={14} style={{ position: 'absolute', right: '8px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
          </div>

          {/* View Mode Toggle: List vs Grid */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--color-bg)',
            padding: '3px',
            borderRadius: '8px',
            border: '1px solid var(--color-border-light)',
            gap: '2px',
            flexShrink: 0
          }}>
            <button
              type="button"
              onClick={() => handleSetViewMode('list')}
              title={t('Xem dạng danh sách (1 cột cuộn)')}
              style={{
                background: viewMode === 'list' ? 'var(--color-surface)' : 'transparent',
                color: viewMode === 'list' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                border: 'none',
                padding: '5px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: viewMode === 'list' ? 700 : 500,
                boxShadow: viewMode === 'list' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <LayoutList size={14} />
              <span className="feed-view-toggle-label" style={{ fontSize: '0.75rem' }}>{t('Danh sách')}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetViewMode('grid')}
              title={t('Xem dạng lưới thẻ (nhiều cột)')}
              style={{
                background: viewMode === 'grid' ? 'var(--color-surface)' : 'transparent',
                color: viewMode === 'grid' ? 'var(--color-primary)' : 'var(--color-text-muted)',
                border: 'none',
                padding: '5px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.75rem',
                fontWeight: viewMode === 'grid' ? 700 : 500,
                boxShadow: viewMode === 'grid' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <LayoutGrid size={14} />
              <span className="feed-view-toggle-label" style={{ fontSize: '0.75rem' }}>{t('Lưới')}</span>
            </button>
          </div>

          <div className="icon-only-select" style={{ flexShrink: 0 }}>
            <CustomSelect
              value={selectedVisibility}
              onChange={val => setSelectedVisibility(val)}
              options={[
                { value: 'all', label: t('Tất cả chế độ'), icon: <Filter size={15} /> },
                { value: 'global', label: t('Công khai'), icon: <Globe size={15} /> },
                ...teams.map(tObj => ({
                  value: `team_${tObj.id}`,
                  label: `${t('Phòng ban')}: ${tObj.name}`,
                  icon: <Users size={15} />
                }))
              ]}
              width="42px"
              align="right"
            />
          </div>
        </div>
      </div>

      {/* Compact Honors Strip for Mobile & Tablet (since right sidebar is hidden <= 1024px) */}
      {honorsData?.honors && honorsData.honors.length > 0 && (
        <div className="feed-mobile-honors-strip">
          {honorsData.honors.map(hObj => (
            <div
              key={`mob-honor-${hObj.id}`}
              style={{
                flex: '0 0 auto',
                width: 'min(260px, 78vw)',
                background: 'linear-gradient(135deg, #BD1D2D 0%, #881337 100%)',
                color: '#ffffff',
                borderRadius: '12px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <Avatar src={hObj.avatar_url || undefined} name={hObj.full_name || 'User'} size={38} style={{ border: '2px solid rgba(255,255,255,0.85)', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '0.62rem', fontWeight: 800, textTransform: 'uppercase', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  🏆 {hObj.badge}
                </div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {hObj.full_name}
                </div>
                <div style={{ fontSize: '0.68rem', opacity: 0.88, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {hObj.title}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleHeartHonor(hObj.id)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '999px',
                  padding: '4px 8px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  flexShrink: 0
                }}
              >
                🔥 {hObj.hearts_count || 0}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Post Creator Box */}
      <form onSubmit={handlePostSubmit} className="feed-composer" style={{
        background: 'var(--color-surface)',
        borderRadius: '16px',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-sm)',
        border: '1px solid var(--color-border-light)',
        marginBottom: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <div className="feed-composer-top" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <Avatar 
            src={user?.avatar_url || user?.avatar} 
            name={user?.name || 'User'} 
            size={38} 
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <MentionInput
              placeholder={`${t('Bạn đang nghĩ gì thế')}, ${user?.name || ''}?`}
              value={content}
              onChange={e => setContent(e.target.value)}
              users={allStaff}
              onImagePaste={handlePastedImage}
              style={{
                width: '100%',
                minHeight: '80px',
                border: 'none',
                boxShadow: 'none',
                background: 'transparent',
                fontSize: '0.9rem',
                color: 'var(--color-text)'
              }}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Attachment Previews */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
            {attachments.map((url, i) => {
              const resolvedUrl = resolveFeedMediaUrl(url) || url;
              return (
                <div key={i} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border-light)', background: '#0f172a' }}>
                  {isVideoUrl(resolvedUrl) ? (
                    <video src={resolvedUrl} muted playsInline style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <img src={resolvedUrl} alt="Uploaded" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                    style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      background: 'rgba(15, 23, 42, 0.7)',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '10px'
                    }}
                  >
                    <X size={10} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="composer-actions-bar" style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--color-border-light)',
          paddingTop: '10px',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          <div className="composer-left-tools" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
            <label style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--color-bg)',
              padding: '6px 12px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--color-text-muted)',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }} className="hover-lift composer-photo-label" title={t('Ảnh / Video')}>
              <Camera size={15} style={{ color: '#BD1D2D', flexShrink: 0 }} />
              <span className="composer-photo-text" style={{ whiteSpace: 'nowrap' }}>{t('Ảnh / Video')}</span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileUpload}
                style={{ display: 'none' }}
                disabled={uploading}
              />
            </label>

            <CustomSelect
              value={visibility}
              onChange={val => {
                setVisibility(val);
                if (val !== 'team') {
                  setSelectedTeamId(null);
                }
                if (val === 'specific' && targetUserIds.length === 0) {
                  setAudienceModalMode('target');
                  setAudienceModalContext('create');
                  setAudienceModalOpen(true);
                }
              }}
              options={[
                { value: 'global', label: t('Công khai'), icon: <Globe size={12} /> },
                { value: 'team', label: t('Phòng ban'), icon: <Users size={12} /> },
                { value: 'specific', label: t('Chỉ định người'), icon: <UserCheck size={12} /> }
              ]}
              width="132px"
              size="xs"
            />

            {visibility === 'team' && (
              <CustomSelect
                value={selectedTeamId || ''}
                onChange={val => setSelectedTeamId(val ? parseInt(val) : null)}
                options={[
                  { value: '', label: t('Chọn phòng ban') },
                  ...teams.map(tObj => ({
                    value: tObj.id,
                    label: tObj.name
                  }))
                ]}
                width="160px"
                size="sm"
              />
            )}

            {/* Gear Settings Button (Icon-Only for Audience & Exclusion) */}
            <button
              type="button"
              onClick={() => {
                setAudienceModalMode(visibility === 'specific' ? 'target' : 'exclude');
                setAudienceModalContext('create');
                setAudienceModalOpen(true);
              }}
              title={
                excludedUserIds.length > 0
                  ? `${t('Đang loại trừ')} ${excludedUserIds.length} ${t('người xem')}`
                  : (visibility === 'specific' ? `${t('Chỉ định')} ${targetUserIds.length} ${t('người xem')}` : t('Cài đặt đối tượng & loại trừ người xem'))
              }
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: (excludedUserIds.length > 0 || (visibility === 'specific' && targetUserIds.length > 0))
                  ? (excludedUserIds.length > 0 ? 'rgba(189, 29, 45, 0.1)' : 'rgba(15, 23, 42, 0.08)')
                  : 'var(--color-bg)',
                border: '1px solid ' + (
                  excludedUserIds.length > 0
                    ? '#BD1D2D'
                    : (visibility === 'specific' && targetUserIds.length > 0 ? '#334155' : 'var(--color-border-light)')
                ),
                color: excludedUserIds.length > 0
                  ? '#BD1D2D'
                  : (visibility === 'specific' && targetUserIds.length > 0 ? '#334155' : 'var(--color-text-muted)'),
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                flexShrink: 0
              }}
              className="hover-lift"
            >
              <Settings size={15} />
              {excludedUserIds.length > 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  background: '#BD1D2D',
                  color: '#ffffff',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  minWidth: '15px',
                  height: '15px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }}>
                  {excludedUserIds.length}
                </span>
              )}
              {visibility === 'specific' && targetUserIds.length > 0 && excludedUserIds.length === 0 && (
                <span style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  background: '#334155',
                  color: '#ffffff',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  minWidth: '15px',
                  height: '15px',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 3px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                }}>
                  {targetUserIds.length}
                </span>
              )}
            </button>
          </div>

          <button
            type="submit"
            className="composer-submit-btn"
            disabled={isSubmitting || uploading || !hasRichContent(content, attachments.length)}
            style={{
              background: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              boxShadow: 'var(--shadow-sm)',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}
          >
            <Send size={12} style={{ flexShrink: 0 }} />
            <span style={{ whiteSpace: 'nowrap' }}>{isSubmitting ? t('Đang đăng...') : t('Đăng tin')}</span>
          </button>
        </div>
      </form>

      {/* Feed List */}
      <div 
        className={viewMode === 'grid' ? 'enterprise-feed-grid' : 'enterprise-feed-list'}
        style={viewMode === 'grid' ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 340px), 1fr))',
          gap: '1rem',
          alignItems: 'start',
          minWidth: 0,
          maxWidth: '100%'
        } : {
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          minWidth: 0,
          maxWidth: '100%'
        }}
      >
        {loading && posts.length === 0 ? (
          <>
            <PostSkeletonCard />
            <PostSkeletonCard />
            <PostSkeletonCard />
          </>
        ) : filteredPosts.length === 0 && !loading ? (
          <div style={{
            background: 'var(--color-surface)',
            borderRadius: '16px',
            padding: '3rem 1.5rem',
            textAlign: 'center',
            border: '1px solid var(--color-border-light)',
            color: 'var(--color-text-muted)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <MessageSquare size={48} style={{ opacity: 0.3 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>{t('Chưa có bài viết nào ở đây')}</p>
            <span style={{ fontSize: '0.8rem' }}>{t('Hãy chia sẻ điều gì đó hữu ích hoặc tìm kiếm nội dung khác')}</span>
          </div>
        ) : (
          filteredPosts.map(post => {
            const hasReacted = post.user_reaction !== null;
            const currentReactionObj = REACTION_TYPES.find(r => r.type === post.user_reaction);

            return (
              <div 
                key={post.id} 
                id={`post-${post.id}`}
                className="feed-post-card"
                style={{
                  background: 'var(--color-surface)',
                  borderRadius: '16px',
                  border: highlightedPostId === post.id ? '2px solid #BD1D2D' : '1px solid var(--color-border-light)',
                  boxShadow: highlightedPostId === post.id ? '0 0 0 4px rgba(189, 29, 45, 0.14), var(--shadow-md)' : 'var(--shadow-sm)',
                  transition: 'all 0.3s ease',
                  overflow: 'visible',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  height: viewMode === 'grid' ? '100%' : 'auto'
                }}
              >
                {/* Post Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <Avatar
                      src={post.author_avatar || undefined}
                      name={post.author_name}
                      size={38}
                    />
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {post.author_name}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
                        <span>{parseSafeDate(post.created_at)?.toLocaleString('vi-VN') || ''}</span>
                        <span>•</span>
                        {post.visibility === 'specific' ? (
                          <span
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#334155', fontWeight: 600 }}
                            title={ensureArray(post.target_users).length > 0 ? ensureArray(post.target_users).map(u => u.full_name).join(', ') : t('Chỉ định người xem')}
                          >
                            <UserCheck size={11} /> {t('Chỉ định')} ({ensureArray(post.target_user_ids).length})
                          </span>
                        ) : post.visibility === 'team' ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#BD1D2D' }} title={t('Bài viết giới hạn phòng ban')}>
                            <Users size={11} /> {post.team_name || t('Phòng ban')}
                          </span>
                        ) : (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                            <Globe size={11} /> {t('Công khai')}
                          </span>
                        )}
                        {ensureArray(post.excluded_user_ids).length > 0 && (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              color: '#BD1D2D',
                              fontSize: '0.7rem',
                              background: 'rgba(189, 29, 45, 0.08)',
                              padding: '1px 6px',
                              borderRadius: '8px',
                              fontWeight: 500
                            }}
                            title={ensureArray(post.excluded_users).length > 0 ? `${t('Loại trừ')}: ${ensureArray(post.excluded_users).map(u => u.full_name).join(', ')}` : t('Đã loại trừ người xem')}
                          >
                            <UserX size={10} /> -{ensureArray(post.excluded_user_ids).length}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleCopyPostLink(post.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text-muted)',
                        cursor: 'pointer',
                        padding: '6px',
                        borderRadius: '8px'
                      }}
                      className="hover-bg"
                      title={t('Sao chép liên kết bài viết')}
                    >
                      <Share2 size={14} />
                    </button>

                    {(Number(user?.id) === Number(post.user_id) || isSystemAdmin(user) || isExecutive(user)) && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenEditPost(post)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '8px'
                          }}
                          className="hover-bg"
                          title={t('Chỉnh sửa bài viết')}
                        >
                          <Edit size={14} style={{ color: 'var(--color-primary)' }} />
                        </button>
                        <button 
                          onClick={() => handleDeletePost(post.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-text-muted)',
                            cursor: 'pointer',
                            padding: '6px',
                            borderRadius: '8px'
                          }}
                          className="hover-bg"
                          title={t('Xóa bài viết')}
                        >
                          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Post Content */}
                {renderPostContent(post.content)}

                {/* Scraped Link Preview */}
                {post.link_metadata && post.link_metadata.url && !post.link_metadata.url.includes('/uploads/') && (
                  Boolean(post.link_metadata.image) || 
                  Boolean(post.link_metadata.description) || 
                  (Boolean(post.link_metadata.title) && post.link_metadata.title !== parse_url_host(post.link_metadata.url))
                ) && (
                  <a 
                    href={post.link_metadata.url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    style={{
                      display: 'grid',
                      gridTemplateColumns: post.link_metadata.image ? '120px 1fr' : '1fr',
                      border: '1px solid var(--color-border-light)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      textDecoration: 'none',
                      color: 'inherit',
                      background: 'var(--color-bg)',
                      marginTop: '4px'
                    }}
                    className="hover-lift"
                  >
                    {post.link_metadata.image && (
                      <div style={{ height: '100%', minHeight: '90px', background: '#e2e8f0' }}>
                        <img 
                          src={post.link_metadata.image} 
                          alt="Preview" 
                          loading="lazy"
                          decoding="async"
                          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} 
                        />
                      </div>
                    )}
                    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>
                        {parse_url_host(post.link_metadata.url)}
                      </span>
                      <h5 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 700 }}>
                        {post.link_metadata.title}
                      </h5>
                      {post.link_metadata.description && (
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: '1.4' }}>
                          {post.link_metadata.description}
                        </p>
                      )}
                    </div>
                  </a>
                )}

                {/* Attachments rendering */}
                {renderAttachmentsGrid(post.attachments)}

                {/* Metrics Summary */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                  borderBottom: '1px solid var(--color-border-light)',
                  paddingBottom: '8px',
                  marginTop: '4px'
                }}>
                  <div 
                    onClick={() => post.reactions_count > 0 && handleShowReactionsModal(post.id)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px',
                      cursor: post.reactions_count > 0 ? 'pointer' : 'default',
                      userSelect: 'none'
                    }}
                  >
                    {post.reactions_count > 0 && (
                      <>
                        <span style={{ display: 'flex', gap: '2px' }}>
                          {Object.keys(post.reactions_summary || {}).slice(0, 3).map(type => (
                            <span key={type}>
                              {REACTION_TYPES.find(r => r.type === type)?.emoji}
                            </span>
                          ))}
                        </span>
                        <span style={{ textDecoration: 'underline' }}>
                          {post.reactions_count} {t('Lượt thích')}
                        </span>
                      </>
                    )}
                  </div>
                  <div>
                    <span>{post.comments_count} {t('Bình luận')}</span>
                  </div>
                </div>

                {/* Post Action Buttons & Floating Reactions Hover */}
                <div style={{
                  display: 'flex',
                  position: 'relative',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  {/* Floating Emojis bar */}
                  <AnimatePresence>
                    {hoveredPostId === post.id && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: -45, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.9 }}
                        onMouseEnter={() => handleMouseEnterLike(post.id)}
                        onMouseLeave={() => handleMouseLeaveLike(post.id)}
                        style={{
                          position: 'absolute',
                          left: '0px',
                          display: 'flex',
                          gap: '6px',
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border-light)',
                          padding: '6px 12px',
                          borderRadius: '30px',
                          boxShadow: 'var(--shadow-lg)',
                          zIndex: 10
                        }}
                      >
                        {REACTION_TYPES.map(react => (
                          <motion.button 
                            key={react.type}
                            whileHover={{ scale: 1.35 }}
                            onClick={() => {
                              handleReact(post.id, react.type);
                              setHoveredPostId(null);
                            }}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              fontSize: '1.25rem',
                              cursor: 'pointer',
                              padding: '2px',
                              lineHeight: 1
                            }}
                            title={react.label}
                          >
                            {react.emoji}
                          </motion.button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <button 
                    onClick={() => handleReact(post.id, 'like')}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'transparent',
                      border: 'none',
                      height: '36px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      borderRadius: '8px',
                      color: hasReacted ? (currentReactionObj?.color || '#3b82f6') : 'var(--color-text-muted)',
                      padding: 0
                    }}
                    className="hover-bg post-action-btn"
                  >
                    <div
                      onMouseEnter={() => handleMouseEnterLike(post.id)}
                      onMouseLeave={() => handleMouseLeaveLike(post.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        width: '100%',
                        height: '100%',
                        padding: '0 8px'
                      }}
                    >
                      {hasReacted ? (
                        <span style={{ fontSize: '1rem', lineHeight: 1 }}>{currentReactionObj?.emoji}</span>
                      ) : (
                        <ThumbsUp size={16} />
                      )}
                      <span>{hasReacted ? currentReactionObj?.label : t('Yêu thích')}</span>
                    </div>
                  </button>

                  <button 
                    onClick={() => toggleCommentsDrawer(post.id)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      background: 'transparent',
                      border: 'none',
                      height: '36px',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      borderRadius: '8px',
                      color: activeCommentsPostId === post.id ? 'var(--color-primary)' : 'var(--color-text-muted)'
                    }}
                    className="hover-bg post-action-btn"
                  >
                    <MessageCircle size={16} />
                    <span>{t('Bình luận')} ({post.comments_count})</span>
                  </button>
                </div>

                {/* Comments Section Drawer (Accordian list) */}
                {activeCommentsPostId === post.id && (
                  <div style={{
                    borderTop: '1px solid var(--color-border-light)',
                    paddingTop: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px'
                  }}>
                    {/* Add Comment Input (Isolated component to eliminate root feed re-renders) */}
                    <PostCommentBox
                      postId={post.id}
                      replyToId={replyToCommentId[post.id] || null}
                      user={user}
                      users={allStaff}
                      appendedEmoji={appendedEmoji?.postId === post.id ? appendedEmoji : null}
                      onSend={handleAddComment}
                      onOpenSticker={(postId, parentId, anchorEl) => {
                        setStickerTargetPostId(postId);
                        setStickerTargetParentId(parentId);
                        setFeedStickerAnchorEl(anchorEl);
                        setShowFeedStickerModal(true);
                      }}
                      onCancelReply={(postId) => {
                        setReplyToCommentId(prev => ({ ...prev, [postId]: null }));
                      }}
                      t={t}
                    />

                    {/* Comments List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                      {loadingCommentsMap[post.id] ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '6px 0' }}>
                          <CommentSkeletonItem />
                          <CommentSkeletonItem />
                        </div>
                      ) : ensureArray<Comment>(commentsMap[post.id]).length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '10px 0' }}>
                          {t('Chưa có bình luận nào. Hãy trở thành người đầu tiên!')}
                        </span>
                      ) : (
                        [...ensureArray<Comment>(commentsMap[post.id])]
                          .filter(c => !c.parent_id || Number(c.parent_id) === 0)
                          .sort((a, b) => (parseSafeDate(b.created_at)?.getTime() || 0) - (parseSafeDate(a.created_at)?.getTime() || 0))
                          .map(comment => (
                          <div
                            key={comment.id}
                            id={`comment-${comment.id}`}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                              borderRadius: '12px',
                              padding: highlightedCommentId === comment.id ? '6px' : '0px',
                              backgroundColor: highlightedCommentId === comment.id ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                              boxShadow: highlightedCommentId === comment.id ? '0 0 0 2px #BD1D2D' : 'none',
                              transition: 'all 0.3s ease'
                            }}
                          >
                            {/* Parent Comment */}
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                              <Avatar
                                src={comment.author_avatar || undefined}
                                name={comment.author_name}
                                size={28}
                              />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {(() => {
                                  const isSticker = isOnlyStickerComment(comment.content);
                                  const canModifyComment = Number(user?.id) === Number(comment.user_id) || isSystemAdmin(user) || isExecutive(user);
                                  return (
                                    <>
                                      <div style={{
                                        background: isSticker ? 'transparent' : 'var(--color-bg)',
                                        padding: isSticker ? '2px 0' : '8px 12px',
                                        borderRadius: '12px',
                                        border: isSticker ? 'none' : '1px solid var(--color-border-light)'
                                      }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isSticker ? '2px' : '0' }}>
                                          <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{comment.author_name}</span>
                                          <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                            {parseSafeDate(comment.created_at)?.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) || ''}
                                          </span>
                                        </div>
                                        {editingComment?.id === comment.id ? (
                                          <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <MentionInput
                                              placeholder={t('Chỉnh sửa bình luận...')}
                                              value={editingComment.content}
                                              onChange={e => setEditingComment(prev => prev ? { ...prev, content: e.target.value } : null)}
                                              users={allStaff}
                                              enterSubmits={true}
                                              onSubmitShortcut={() => handleSaveEditComment(comment.id, post.id, editingComment.content)}
                                              style={{
                                                width: '100%',
                                                minHeight: '44px',
                                                padding: '6px 10px',
                                                fontSize: '0.8rem',
                                                borderRadius: '8px',
                                                border: '1px solid var(--color-primary)',
                                                background: 'var(--color-bg-secondary)'
                                              }}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                                              <button
                                                type="button"
                                                onClick={() => setEditingComment(null)}
                                                disabled={isSavingCommentEdit}
                                                style={{
                                                  padding: '3px 8px',
                                                  fontSize: '0.7rem',
                                                  borderRadius: '6px',
                                                  border: '1px solid var(--color-border)',
                                                  background: 'transparent',
                                                  color: 'var(--color-text-muted)',
                                                  cursor: 'pointer'
                                                }}
                                              >
                                                {t('Hủy')}
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleSaveEditComment(comment.id, post.id, editingComment.content)}
                                                disabled={isSavingCommentEdit || !hasRichContent(editingComment.content)}
                                                style={{
                                                  padding: '3px 10px',
                                                  fontSize: '0.7rem',
                                                  borderRadius: '6px',
                                                  border: 'none',
                                                  background: 'var(--color-primary)',
                                                  color: '#ffffff',
                                                  fontWeight: 600,
                                                  cursor: 'pointer',
                                                  opacity: isSavingCommentEdit ? 0.6 : 1
                                                }}
                                              >
                                                {isSavingCommentEdit ? t('Đang lưu...') : t('Lưu')}
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          renderCommentContent(comment.content)
                                        )}
                                      </div>

                                      {/* Comment Actions - Aligned Right */}
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', fontSize: '0.7rem', color: 'var(--color-text-muted)', padding: '3px 4px 0 4px' }}>
                                        <button
                                          type="button"
                                          onClick={() => setReplyToCommentId(prev => ({ ...prev, [post.id]: comment.id }))}
                                          style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                        >
                                          {t('Phản hồi')}
                                        </button>
                                        {canModifyComment && !isSticker && (
                                          <button
                                            type="button"
                                            onClick={() => setEditingComment({ id: comment.id, postId: post.id, content: comment.content })}
                                            style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                          >
                                            {t('Sửa')}
                                          </button>
                                        )}
                                        {canModifyComment && (
                                          <button
                                            type="button"
                                            onClick={() => setCommentToDelete({ postId: post.id, commentId: comment.id })}
                                            style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
                                            title={t('Xóa')}
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                            </div>

                            {/* Nested Replies */}
                            {ensureArray<Comment>(comment.replies).map(reply => {
                              const isReplySticker = isOnlyStickerComment(reply.content);
                              const canModifyReply = Number(user?.id) === Number(reply.user_id) || isSystemAdmin(user) || isExecutive(user);
                              return (
                                <div
                                  key={reply.id}
                                  id={`comment-${reply.id}`}
                                  style={{
                                    display: 'flex',
                                    gap: '8px',
                                    alignItems: 'flex-start',
                                    marginLeft: '36px',
                                    borderRadius: '12px',
                                    padding: highlightedCommentId === reply.id ? '6px' : '0px',
                                    backgroundColor: highlightedCommentId === reply.id ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                                    boxShadow: highlightedCommentId === reply.id ? '0 0 0 2px #BD1D2D' : 'none',
                                    transition: 'all 0.3s ease'
                                  }}
                                >
                                  <Avatar
                                    src={reply.author_avatar || undefined}
                                    name={reply.author_name}
                                    size={24}
                                  />
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                      background: isReplySticker ? 'transparent' : 'var(--color-bg)',
                                      padding: isReplySticker ? '2px 0' : '6px 10px',
                                      borderRadius: '12px',
                                      border: isReplySticker ? 'none' : '1px solid var(--color-border-light)'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isReplySticker ? '2px' : '0' }}>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>{reply.author_name}</span>
                                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)' }}>
                                          {parseSafeDate(reply.created_at)?.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) || ''}
                                        </span>
                                      </div>
                                      {editingComment?.id === reply.id ? (
                                        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          <MentionInput
                                            placeholder={t('Chỉnh sửa phản hồi...')}
                                            value={editingComment.content}
                                            onChange={e => setEditingComment(prev => prev ? { ...prev, content: e.target.value } : null)}
                                            users={allStaff}
                                            enterSubmits={true}
                                            onSubmitShortcut={() => handleSaveEditComment(reply.id, post.id, editingComment.content)}
                                            style={{
                                              width: '100%',
                                              minHeight: '40px',
                                              padding: '5px 8px',
                                              fontSize: '0.75rem',
                                              borderRadius: '8px',
                                              border: '1px solid var(--color-primary)',
                                              background: 'var(--color-bg-secondary)'
                                            }}
                                          />
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', alignItems: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => setEditingComment(null)}
                                              disabled={isSavingCommentEdit}
                                              style={{
                                                padding: '2px 8px',
                                                fontSize: '0.7rem',
                                                borderRadius: '6px',
                                                border: '1px solid var(--color-border)',
                                                background: 'transparent',
                                                color: 'var(--color-text-muted)',
                                                cursor: 'pointer'
                                              }}
                                            >
                                              {t('Hủy')}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleSaveEditComment(reply.id, post.id, editingComment.content)}
                                              disabled={isSavingCommentEdit || !hasRichContent(editingComment.content)}
                                              style={{
                                                padding: '2px 10px',
                                                fontSize: '0.7rem',
                                                borderRadius: '6px',
                                                border: 'none',
                                                background: 'var(--color-primary)',
                                                color: '#ffffff',
                                                fontWeight: 600,
                                                cursor: 'pointer',
                                                opacity: isSavingCommentEdit ? 0.6 : 1
                                              }}
                                            >
                                              {isSavingCommentEdit ? t('Đang lưu...') : t('Lưu')}
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        renderCommentContent(reply.content)
                                      )}
                                    </div>
                                    {/* Reply Actions - Aligned Right */}
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', fontSize: '0.7rem', color: 'var(--color-text-muted)', padding: '3px 4px 0 4px' }}>
                                      <button
                                        type="button"
                                        onClick={() => setReplyToCommentId(prev => ({ ...prev, [post.id]: comment.id }))}
                                        style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                      >
                                        {t('Phản hồi')}
                                      </button>
                                      {canModifyReply && !isReplySticker && (
                                        <button
                                          type="button"
                                          onClick={() => setEditingComment({ id: reply.id, postId: post.id, content: reply.content })}
                                          style={{ background: 'transparent', border: 'none', color: 'inherit', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                                        >
                                          {t('Sửa')}
                                        </button>
                                      )}
                                      {canModifyReply && (
                                        <button
                                          type="button"
                                          onClick={() => setCommentToDelete({ postId: post.id, commentId: reply.id })}
                                          style={{ background: 'transparent', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
                                          title={t('Xóa')}
                                        >
                                          <Trash2 size={12} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Infinite Scroll trigger area */}
      <div
        ref={bottomObserverRef}
        style={{
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
          fontSize: '0.8rem',
          marginTop: '1rem'
        }}
      >
        {loading ? (
          <div style={{ width: '180px' }}><Skeleton width="100%" height={12} /></div>
        ) : (hasMore && posts.length > 0) ? (
          t('Cuộn xuống để xem thêm...')
        ) : (
          posts.length > 0 && t('Bạn đã xem hết toàn bộ bài viết')
        )}
      </div>
    </div>

    {/* Right Side: Widgets Panel */}
    <div className="feed-sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px', position: 'sticky', top: '24px' }}>
      {/* Winner Honor Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🏆 {t('Vinh danh xuất sắc')}
          </h3>
          {isSystemAdmin(user) && (
            <button
              type="button"
              onClick={() => {
                setSelectedHonorId(null);
                setEditHonorsUserId(honorsData?.candidates?.[0]?.id ?? null);
                setEditHonorsTitle('');
                setEditHonorsBadge('');
                setEditHonorsReason('');
                setShowEditHonors(true);
              }}
              style={{
                background: 'var(--color-primary-light)',
                color: 'var(--color-primary)',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '12px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer'
              }}
              className="hover-scale"
            >
              + {t('Thêm')}
            </button>
          )}
        </div>

        {loadingHonors || !honorsData ? (
          <HonorSkeletonCard />
        ) : ensureArray<HonorItem>(honorsData?.honors).length > 0 ? (
          ensureArray<HonorItem>(honorsData?.honors).map((hObj) => (
            <div
              key={hObj.id}
              style={{
                background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                color: '#ffffff',
                borderRadius: '16px',
                padding: '1.25rem',
                boxShadow: 'var(--shadow-md)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '10px'
              }}
            >
              {/* Sparkle background effects */}
              <div style={{
                position: 'absolute',
                top: '-10px',
                right: '-10px',
                fontSize: '4rem',
                opacity: 0.3,
                pointerEvents: 'none'
              }}>👑</div>

              {/* Admin Action Buttons (Edit & Delete) */}
              {isSystemAdmin(user) && (
                <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '6px', zIndex: 10 }}>
                  <button
                    onClick={() => {
                      setSelectedHonorId(hObj.id);
                      setEditHonorsUserId(hObj.user_id);
                      setEditHonorsTitle(hObj.title);
                      setEditHonorsBadge(hObj.badge);
                      setEditHonorsReason(hObj.reason);
                      setShowEditHonors(true);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.25)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#ffffff'
                    }}
                    title={t('Chỉnh sửa')}
                    className="hover-scale"
                  >
                    <Edit size={12} />
                  </button>
                  <button
                    onClick={() => handleDeleteHonor(hObj.id)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.25)',
                      border: 'none',
                      borderRadius: '50%',
                      width: '26px',
                      height: '26px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      color: '#ffffff'
                    }}
                    title={t('Xóa')}
                    className="hover-scale"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}

              <div style={{
                background: 'rgba(255, 255, 255, 0.2)',
                padding: '3px 10px',
                borderRadius: '20px',
                fontSize: '0.65rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '1px'
              }}>
                🏆 {hObj.badge}
              </div>

              <Avatar 
                src={hObj.avatar_url || undefined} 
                name={hObj.full_name || 'User'} 
                size={64} 
                style={{ border: '3px solid #ffffff', boxShadow: '0 4px 10px rgba(0,0,0,0.15)' }}
              />

              <div>
                <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800 }}>
                  {hObj.full_name}
                </h4>
                <span style={{ fontSize: '0.7rem', opacity: 0.9, fontWeight: 600 }}>
                  {hObj.title}
                </span>
              </div>

              <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: '1.4', opacity: 0.95 }}>
                "{hObj.reason}"
              </p>

              {/* Heart clap reaction button ("thả tym đẩy nhiệt") */}
              <button
                onClick={() => handleHeartHonor(hObj.id)}
                style={{
                  background: 'rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '4px',
                  transition: 'background 0.2s, transform 0.1s'
                }}
                className="hover-scale active-shrink"
              >
                <span>🔥</span> {t('Đẩy nhiệt')} ({hObj.hearts_count || 0})
              </button>
            </div>
          ))
        ) : (
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border-light)',
            borderRadius: '16px',
            padding: '1.5rem',
            textAlign: 'center',
            fontSize: '0.8rem',
            color: 'var(--color-text-muted)'
          }}>
            {t('Chưa có nhân viên vinh danh')}
          </div>
        )}
      </div>

      {/* Trending hashtags */}
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: '16px',
        border: '1px solid var(--color-border-light)',
        padding: '1.25rem',
        boxShadow: 'var(--shadow-sm)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text)' }}>
          <Tag size={14} style={{ color: 'var(--color-primary)' }} />
          {t('Xu hướng nội bộ')}
        </h4>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {trendingTags.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', textAlign: 'center', padding: '10px 0', fontStyle: 'italic' }}>
              {t('Chưa có xu hướng nào')}
            </div>
          ) : (
            trendingTags.map(tObj => (
              <div 
                key={tObj.tag}
                onClick={() => setActiveTag(tObj.tag)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  background: activeTag === tObj.tag ? 'rgba(189, 29, 45, 0.08)' : 'var(--color-bg)',
                  transition: 'all 0.2s'
                }}
                className="hover-bg"
              >
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: activeTag === tObj.tag ? '#BD1D2D' : 'var(--color-text)' }}>
                  {tObj.label}
                </span>
                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', background: 'var(--color-surface)', padding: '2px 6px', borderRadius: '10px' }}>
                  {tObj.count}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  </div>

  {/* Edit Honors Modal */}
  {showEditHonors && (
  <CustomModal
    isOpen={showEditHonors}
    onClose={() => setShowEditHonors(false)}
    title={`🏆 ${t('Thiết lập vinh danh')}`}
    width="500px"
    zIndex={2000000}
  >
    <form onSubmit={handleSaveHonors} style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Employee Selection */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
          {t('Chọn nhân viên')} <span style={{ color: 'var(--color-danger)' }}>*</span>
        </label>
        <CustomSelect
          value={editHonorsUserId || ''}
          onChange={val => {
            const numVal = val ? parseInt(val) : null;
            setEditHonorsUserId(numVal);
            if (numVal && honorsData?.candidates) {
              const cand = honorsData.candidates.find(c => c.id === numVal);
              if (cand) {
                const roleMap: Record<string, string> = {
                  'admin': 'Quản trị viên',
                  'superadmin': 'Quản trị viên cấp cao',
                  'sales': 'Nhân viên kinh doanh (Sales)',
                  'sale': 'Nhân viên kinh doanh (Sales)',
                  'manager': 'Quản lý dự án (Manager)',
                  'hr': 'Nhân viên nhân sự (HR)',
                  'accountant': 'Kế toán viên'
                };
                setEditHonorsTitle(roleMap[cand.role] || cand.role || '');
              }
            }
          }}
          options={[
            { value: '', label: t('Chọn nhân viên') },
            ...(honorsData?.candidates?.map(c => ({
              value: c.id,
              label: c.full_name,
              avatar: c.avatar_url || undefined,
              sublabel: c.role
            })) || [])
          ]}
          showAvatars={true}
          searchable={true}
          width="100%"
          size="sm"
        />
      </div>

      {/* Title Input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
          {t('Chức danh vinh danh')} <span style={{ color: 'var(--color-danger)' }}>*</span>
        </label>
        <input
          type="text"
          value={editHonorsTitle}
          onChange={(e) => setEditHonorsTitle(e.target.value)}
          placeholder={t('Ví dụ: Trưởng phòng Kinh doanh (Sale Manager)')}
          className="form-input"
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '0.85rem'
          }}
        />
      </div>

      {/* Badge/Award Title Input */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
          {t('Danh hiệu / Giải thưởng')} <span style={{ color: 'var(--color-danger)' }}>*</span>
        </label>
        <input
          type="text"
          value={editHonorsBadge}
          onChange={(e) => setEditHonorsBadge(e.target.value)}
          placeholder={t('Ví dụ: Nhân viên xuất sắc của tháng')}
          className="form-input"
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '0.85rem'
          }}
        />
      </div>

      {/* Reason Textarea */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text)' }}>
          {t('Lời chúc / Ghi chú vinh danh')} <span style={{ color: 'var(--color-danger)' }}>*</span>
        </label>
        <textarea
          value={editHonorsReason}
          onChange={(e) => setEditHonorsReason(e.target.value)}
          rows={4}
          placeholder={t('Nhập mô tả thành tích vinh danh...')}
          className="form-textarea"
          style={{
            width: '100%',
            padding: '8px 12px',
            fontSize: '0.85rem',
            resize: 'none'
          }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button
          type="button"
          onClick={() => setShowEditHonors(false)}
          className="btn secondary"
          style={{
            padding: '8px 16px',
            fontSize: '0.85rem'
          }}
        >
          {t('Hủy')}
        </button>
        <button
          type="submit"
          disabled={savingHonors}
          className="btn primary"
          style={{
            padding: '8px 20px',
            fontSize: '0.85rem'
          }}
        >
          {savingHonors ? t('Đang lưu...') : t('Lưu thay đổi')}
        </button>
      </div>
    </form>
  </CustomModal>
  )}

      {/* Reactions Detail Modal */}
      {reactionsModalPostId !== null && (
      <CustomModal
        isOpen={reactionsModalPostId !== null}
        onClose={() => setReactionsModalPostId(null)}
        title={t('Tương tác với bài viết')}
        width="450px"
      >
        <div style={{ padding: '4px' }}>
          {loadingReactionsModal ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '0.75rem 0' }}>
              {[1, 2, 3].map(idx => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Skeleton width={32} height={32} borderRadius="50%" />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <Skeleton width="45%" height={12} />
                    <Skeleton width="30%" height={10} />
                  </div>
                </div>
              ))}
            </div>
          ) : reactionsModalList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
              {t('Chưa có lượt tương tác nào.')}
            </div>
          ) : (
            <div 
              className="custom-scrollbar"
              style={{ 
                maxHeight: '350px', 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px',
                paddingRight: '6px'
              }}
            >
              {reactionsModalList.map((react, index) => {
                const reactionObj = REACTION_TYPES.find(r => r.type === react.reaction_type);
                return (
                  <div 
                    key={index} 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'var(--color-bg-light)',
                      border: '1px solid var(--color-border-light)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ position: 'relative' }}>
                        <Avatar 
                          src={react.avatar_url} 
                          name={react.full_name} 
                          size="sm" 
                        />
                        <span style={{ 
                          position: 'absolute', 
                          bottom: '-4px', 
                          right: '-4px', 
                          fontSize: '1rem',
                          background: 'var(--color-surface)',
                          borderRadius: '50%',
                          width: '18px',
                          height: '18px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: 'var(--shadow-sm)'
                        }}>
                          {reactionObj?.emoji || '👍'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-text)' }}>
                          {react.full_name}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                          {t(react.role || 'Nhân viên')}
                        </span>
                      </div>
                    </div>
                    <span style={{ 
                      fontSize: '0.75rem', 
                      fontWeight: 600, 
                      color: reactionObj?.color || 'var(--color-text-muted)' 
                    }}>
                      {t(reactionObj?.label || 'Thích')}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CustomModal>
      )}

      {commentToDelete !== null && (
        <ConfirmModal
          isOpen={commentToDelete !== null}
          onClose={() => setCommentToDelete(null)}
          onConfirm={async () => {
            if (commentToDelete) {
              await handleDeleteComment(commentToDelete.postId, commentToDelete.commentId);
              setCommentToDelete(null);
            }
          }}
          title={t('Xác nhận xóa bình luận')}
          message={t('Bạn có chắc chắn muốn xóa bình luận này không? Hành động này không thể hoàn tác.')}
          confirmText={t('Xóa')}
          cancelText={t('Hủy')}
          confirmType="danger"
        />
      )}

      {showFeedStickerModal && (
        <StickerPickerModal
          isOpen={showFeedStickerModal}
          onClose={() => {
            setShowFeedStickerModal(false);
            setStickerTargetPostId(null);
            setStickerTargetParentId(null);
            setFeedStickerAnchorEl(null);
          }}
          anchorEl={feedStickerAnchorEl}
          onSelectSticker={(url) => {
            if (stickerTargetPostId) {
              handleSendStickerComment(stickerTargetPostId, url, stickerTargetParentId);
            }
          }}
          onSelectEmoji={(emoji) => {
            if (stickerTargetPostId) {
              setAppendedEmoji({
                postId: stickerTargetPostId,
                emoji,
                id: Date.now()
              });
              setNewCommentText(prev => ({
                ...prev,
                [stickerTargetPostId]: (prev[stickerTargetPostId] || '') + emoji
              }));
            }
          }}
        />
      )}

      {/* Edit Post Modal */}
      {Boolean(editingPost) && (
      <CustomModal
        isOpen={Boolean(editingPost)}
        onClose={() => setEditingPost(null)}
        title={`✏️ ${t('Chỉnh sửa bài viết')}`}
        width="600px"
        zIndex={2000000}
      >
        {editingPost && (
          <form onSubmit={handleSaveEditPost} style={{ padding: '8px 4px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Visibility & Audience Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <CustomSelect
                value={editVisibility}
                onChange={val => {
                  setEditVisibility(val);
                  if (val !== 'team') setEditTeamId(null);
                  if (val === 'specific' && editTargetUserIds.length === 0) {
                    setAudienceModalMode('target');
                    setAudienceModalContext('edit');
                    setAudienceModalOpen(true);
                  }
                }}
                options={[
                  { value: 'global', label: t('Công khai'), icon: <Globe size={12} /> },
                  { value: 'team', label: t('Phòng ban'), icon: <Users size={12} /> },
                  { value: 'specific', label: t('Chỉ định người'), icon: <UserCheck size={12} /> }
                ]}
                width="150px"
                size="sm"
              />

              {editVisibility === 'team' && (
                <CustomSelect
                  value={editTeamId ? String(editTeamId) : ''}
                  onChange={val => setEditTeamId(val ? Number(val) : null)}
                  options={[
                    { value: '', label: t('Chọn phòng ban') },
                    ...teams.map(tObj => ({
                      value: String(tObj.id),
                      label: tObj.name
                    }))
                  ]}
                  width="160px"
                  size="sm"
                />
              )}

              {/* Gear Settings Button (Icon-Only for Edit Audience & Exclusion) */}
              <button
                type="button"
                onClick={() => {
                  setAudienceModalMode(editVisibility === 'specific' ? 'target' : 'exclude');
                  setAudienceModalContext('edit');
                  setAudienceModalOpen(true);
                }}
                title={
                  editExcludedUserIds.length > 0 
                    ? `${t('Đang loại trừ')} ${editExcludedUserIds.length} ${t('người xem')}` 
                    : (editVisibility === 'specific' ? `${t('Chỉ định')} ${editTargetUserIds.length} ${t('người xem')}` : t('Cài đặt đối tượng & loại trừ người xem'))
                }
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: (editExcludedUserIds.length > 0 || (editVisibility === 'specific' && editTargetUserIds.length > 0))
                    ? (editExcludedUserIds.length > 0 ? 'rgba(189, 29, 45, 0.1)' : 'rgba(51, 65, 85, 0.1)')
                    : 'var(--color-bg)',
                  border: '1px solid ' + (
                    editExcludedUserIds.length > 0 
                      ? '#BD1D2D' 
                      : (editVisibility === 'specific' && editTargetUserIds.length > 0 ? '#334155' : 'var(--color-border-light)')
                  ),
                  color: editExcludedUserIds.length > 0 
                    ? '#BD1D2D' 
                    : (editVisibility === 'specific' && editTargetUserIds.length > 0 ? '#334155' : 'var(--color-text-muted)'),
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
                className="hover-lift"
              >
                <Settings size={15} />
                {editExcludedUserIds.length > 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    background: '#BD1D2D',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    minWidth: '15px',
                    height: '15px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 3px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }}>
                    {editExcludedUserIds.length}
                  </span>
                )}
                {editVisibility === 'specific' && editTargetUserIds.length > 0 && editExcludedUserIds.length === 0 && (
                  <span style={{
                    position: 'absolute',
                    top: '-3px',
                    right: '-3px',
                    background: '#334155',
                    color: '#ffffff',
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    minWidth: '15px',
                    height: '15px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 3px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                  }}>
                    {editTargetUserIds.length}
                  </span>
                )}
              </button>
            </div>

            {/* Content text area */}
            <div style={{ border: '1px solid var(--color-border)', borderRadius: '12px', padding: '10px', background: 'var(--color-bg)' }}>
              <MentionInput
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                users={allStaff}
                placeholder={t('Bạn đang nghĩ gì?')}
                style={{
                  width: '100%',
                  minHeight: '110px',
                  border: 'none',
                  boxShadow: 'none',
                  background: 'transparent',
                  fontSize: '0.9rem',
                  color: 'var(--color-text)'
                }}
                disabled={isSavingEdit}
              />
            </div>

            {/* Attachments preview & removal */}
            {editAttachments.length > 0 && (
              <div>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: '6px', display: 'block' }}>
                  {t('Ảnh / Video đính kèm')} ({editAttachments.length})
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {editAttachments.map((url, i) => {
                    const resolvedUrl = resolveFeedMediaUrl(url) || url;
                    return (
                      <div key={i} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--color-border-light)', background: '#0f172a' }}>
                        {isVideoUrl(resolvedUrl) ? (
                          <video src={resolvedUrl} muted playsInline style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <img src={resolvedUrl} alt="Attachment" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
                        )}
                        <button
                          type="button"
                          onClick={() => setEditAttachments(prev => prev.filter((_, idx) => idx !== i))}
                          style={{
                            position: 'absolute',
                            top: '2px',
                            right: '2px',
                            background: 'rgba(15, 23, 42, 0.75)',
                            border: 'none',
                            color: '#fff',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            padding: 0
                          }}
                          title={t('Xóa tệp')}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add more attachments button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-card)',
                  cursor: editUploading ? 'wait' : 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--color-text)'
                }}
              >
                <Camera size={14} style={{ color: '#BD1D2D' }} />
                <span>{editUploading ? t('Đang tải tệp...') : t('Thêm ảnh / video')}</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleEditImageUpload}
                  disabled={editUploading || isSavingEdit}
                />
              </label>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px', borderTop: '1px solid var(--color-border-light)', paddingTop: '12px' }}>
              <button
                type="button"
                onClick={() => setEditingPost(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem'
                }}
              >
                {t('Hủy')}
              </button>
              <button
                type="submit"
                disabled={isSavingEdit || editUploading || !hasRichContent(editContent, editAttachments.length)}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'var(--color-primary)',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  opacity: (isSavingEdit || editUploading || !hasRichContent(editContent, editAttachments.length)) ? 0.6 : 1
                }}
              >
                {isSavingEdit ? t('Đang lưu...') : t('Lưu thay đổi')}
              </button>
            </div>
          </form>
        )}
      </CustomModal>
      )}

      {/* Audience Picker Modal */}
      {audienceModalOpen && (
      <CustomModal
        isOpen={audienceModalOpen}
        onClose={() => setAudienceModalOpen(false)}
        title={`⚙️ ${t('Cài đặt đối tượng bài viết')}`}
        width="580px"
        zIndex={2147483646}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
          {/* Mode Switcher Tabs inside Audience Modal */}
          <div style={{
            display: 'flex',
            background: 'var(--color-bg)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid var(--color-border-light)',
            gap: '4px'
          }}>
            <button
              type="button"
              onClick={() => {
                setAudienceModalMode('target');
                if (audienceModalContext === 'create') setVisibility('specific');
                else setEditVisibility('specific');
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                background: audienceModalMode === 'target' ? 'var(--color-surface)' : 'transparent',
                color: audienceModalMode === 'target' ? '#334155' : 'var(--color-text-muted)',
                fontWeight: audienceModalMode === 'target' ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: audienceModalMode === 'target' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <UserCheck size={14} />
              <span>{t('Chỉ định người xem')}</span>
              {(audienceModalContext === 'create' ? targetUserIds.length : editTargetUserIds.length) > 0 && (
                <span style={{
                  background: '#334155',
                  color: '#fff',
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px'
                }}>
                  {audienceModalContext === 'create' ? targetUserIds.length : editTargetUserIds.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setAudienceModalMode('exclude')}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: '8px',
                border: 'none',
                background: audienceModalMode === 'exclude' ? 'var(--color-surface)' : 'transparent',
                color: audienceModalMode === 'exclude' ? '#BD1D2D' : 'var(--color-text-muted)',
                fontWeight: audienceModalMode === 'exclude' ? 700 : 500,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                boxShadow: audienceModalMode === 'exclude' ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <UserX size={14} />
              <span>{t('Loại trừ người xem')}</span>
              {(audienceModalContext === 'create' ? excludedUserIds.length : editExcludedUserIds.length) > 0 && (
                <span style={{
                  background: '#BD1D2D',
                  color: '#fff',
                  fontSize: '0.7rem',
                  padding: '1px 6px',
                  borderRadius: '10px'
                }}>
                  {audienceModalContext === 'create' ? excludedUserIds.length : editExcludedUserIds.length}
                </span>
              )}
            </button>
          </div>

          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            {audienceModalMode === 'target'
              ? t('Chỉ những nhân sự được chọn dưới đây mới có quyền xem bài viết này trên bảng tin.')
              : t('Bài viết sẽ được đăng công khai/theo phòng ban, nhưng sẽ bị ẩn hoàn toàn đối với những người được chọn dưới đây.')
            }
          </p>

          {/* Search & Team Filter Bar */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                placeholder={t('Tìm nhân sự theo tên, chức vụ, bộ phận...')}
                value={audienceSearchTerm}
                onChange={e => setAudienceSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  height: '36px',
                  padding: '0 32px 0 12px',
                  borderRadius: '10px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  fontSize: '0.85rem',
                  color: 'var(--color-text)',
                  outline: 'none'
                }}
              />
              <Search size={14} style={{ position: 'absolute', right: '10px', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
            </div>

            <div style={{ width: '160px' }}>
              <CustomSelect
                value={audienceSelectedTeam === 'all' ? 'all' : String(audienceSelectedTeam)}
                onChange={val => setAudienceSelectedTeam(val === 'all' ? 'all' : Number(val))}
                options={[
                  { value: 'all', label: t('Tất cả phòng ban') },
                  ...teams.map(tm => ({ value: String(tm.id), label: tm.name }))
                ]}
                width="160px"
                size="sm"
              />
            </div>
          </div>

          {/* Selection counter & Quick Select/Clear buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
            <span style={{ fontWeight: 600, color: currentAudienceSelectedIds.length > 0 ? (audienceModalMode === 'target' ? '#334155' : '#BD1D2D') : 'var(--color-text-muted)' }}>
              {t('Đã chọn')}: {currentAudienceSelectedIds.length} {t('nhân sự')}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleSelectAllAudience(filteredAudienceStaff)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-primary)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px'
                }}
              >
                {t('Chọn tất cả kết quả')}
              </button>
              <button
                type="button"
                onClick={handleClearAllAudience}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--color-text-muted)',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px'
                }}
              >
                {t('Bỏ chọn tất cả')}
              </button>
            </div>
          </div>

          {/* Selected chips bar */}
          {currentAudienceSelectedIds.length > 0 && (
            <div style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
              maxHeight: '80px',
              overflowY: 'auto',
              padding: '6px 8px',
              background: 'var(--color-bg)',
              borderRadius: '8px',
              border: '1px dashed var(--color-border-light)'
            }}>
              {allStaff.filter(s => currentAudienceSelectedIds.includes(s.id)).map(s => (
                <span
                  key={s.id}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 8px',
                    borderRadius: '16px',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    background: audienceModalMode === 'target' ? 'rgba(51, 65, 85, 0.1)' : 'rgba(189, 29, 45, 0.1)',
                    color: audienceModalMode === 'target' ? '#334155' : '#BD1D2D',
                    border: '1px solid ' + (audienceModalMode === 'target' ? 'rgba(51, 65, 85, 0.25)' : 'rgba(189, 29, 45, 0.25)')
                  }}
                >
                  <Avatar src={s.avatar_url || undefined} name={s.full_name} size={16} />
                  <span>{s.full_name}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleAudienceUser(s.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'inherit',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      padding: 0
                    }}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Staff List */}
          <div style={{
            maxHeight: '260px',
            overflowY: 'auto',
            border: '1px solid var(--color-border-light)',
            borderRadius: '10px',
            background: 'var(--color-surface)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {filteredAudienceStaff.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                {t('Không tìm thấy nhân sự phù hợp')}
              </div>
            ) : (
              filteredAudienceStaff.map(s => {
                const isSelected = currentAudienceSelectedIds.includes(s.id);
                return (
                  <div
                    key={s.id}
                    onClick={() => handleToggleAudienceUser(s.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      cursor: 'pointer',
                      borderBottom: '1px solid var(--color-border-light)',
                      background: isSelected 
                        ? (audienceModalMode === 'target' ? 'rgba(51, 65, 85, 0.06)' : 'rgba(189, 29, 45, 0.05)') 
                        : 'transparent',
                      transition: 'background 0.15s ease'
                    }}
                    className="hover-lift-subtle"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '4px',
                        border: '2px solid ' + (isSelected ? (audienceModalMode === 'target' ? '#334155' : '#BD1D2D') : 'var(--color-border)'),
                        background: isSelected ? (audienceModalMode === 'target' ? '#334155' : '#BD1D2D') : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        transition: 'all 0.15s ease'
                      }}>
                        {isSelected && <Check size={12} strokeWidth={3} />}
                      </div>
                      <Avatar src={s.avatar_url || undefined} name={s.full_name} size={32} />
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text)' }}>
                          {s.full_name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                          {s.department || s.role || t('Nhân viên')}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Modal Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button
              type="button"
              onClick={() => setAudienceModalOpen(false)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {t('Đóng')}
            </button>
            <button
              type="button"
              onClick={() => setAudienceModalOpen(false)}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: 'none',
                background: audienceModalMode === 'target' ? '#334155' : '#BD1D2D',
                color: '#fff',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              {t('Xác nhận')} ({currentAudienceSelectedIds.length})
            </button>
          </div>
        </div>
      </CustomModal>
      )}

      {/* Lightbox Modal for Fullscreen Image Viewing */}
      {Boolean(lightboxData) && (
        <AttachmentLightboxModal
          isOpen={Boolean(lightboxData)}
          onClose={() => setLightboxData(null)}
          items={lightboxData?.items || []}
          initialIndex={lightboxData?.initialIndex || 0}
          zIndex={2147483647}
        />
      )}

      {/* Floating Back to Top Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              const mainEl = document.querySelector('main.responsive-main');
              if (mainEl) mainEl.scrollTo({ top: 0, behavior: 'smooth' });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              position: 'fixed',
              bottom: 'calc(var(--mobile-bottom-nav-height, 62px) + env(safe-area-inset-bottom, 0px) + 12px)',
              left: '14px',
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-primary)',
              color: '#ffffff',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 99
            }}
            title={t('Cuộn lên đầu trang')}
          >
            <ArrowUp size={20} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

// Simple helper to parse and clean hostname from url
function parse_url_host(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace('www.', '');
  } catch (e) {
    return 'link';
  }
}
