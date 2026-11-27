import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X, Check, Paperclip, Link2, MessageSquare, Calendar, Clock,
  AlertCircle, Trash2, Plus, Send, Share2, FileText,
  Image as ImageIcon,
  Users, RefreshCw, Layers, CheckSquare2, ArrowUpRight, Search, Save, Bell, BellOff,
  Eye, EyeOff, ExternalLink, UserPlus, Edit3, Building2, Megaphone, Loader2,
  CheckCircle2, XCircle, Camera, Target, Shield, AlertTriangle, FileSpreadsheet, Download, Folder, Copy, Archive,
  GitBranch, PenTool, Square, StickyNote, Type, MousePointer, Undo2, History, RotateCcw, ZoomIn, ZoomOut, ChevronLeft, ChevronRight
} from 'lucide-react';
import { downloadFileWithName } from '../utils/fileDownloader';
import { triggerLocalConfetti } from '../utils/confettiHelper';
import api from '../api/axios';
import toast from 'react-hot-toast';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { CustomSelect } from '../components/ui/CustomSelect';
import { MentionInput } from '../components/ui/MentionInput';
import { Avatar } from '../components/ui/Avatar';
import styles from './EntityDrawer.module.css';
import { StatRowSkeleton, DrawerSkeleton } from '../components/ui/Skeleton';
import { showUndoToast } from '../components/ui/UndoToast';
import { useAutoSaveDraft } from '../hooks/useAutoSaveDraft';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTabActive } from '../contexts/TabActiveContext';
import { pushOverlay } from '../utils/overlayStack';
import { getUserDisplayRoleOrTitle, isViewer } from '../utils/roleUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '../store/uiStore';
import { useUploadActions } from '../contexts/UploadProgressContext';
import { PasteDropzoneArea } from '../components/ui/PasteDropzoneArea';
import { sanitizeHtml, escapeHtml } from '../utils/sanitizeHtml';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { VietnameseDateInput } from '../components/ui/VietnameseDateInput';
import { AttachmentLightboxModal, type AttachmentItem } from '../components/ui/AttachmentLightboxModal';
import { parseTaskBody, convertTextToHtmlParagraphs, formatVietnameseDescription } from '../utils/taskBodyParser';
import { formatCommentBody } from '../utils/commentFormatter';
import { getLocalDateStr, formatDateVN, formatDateTimeVN } from '../utils/dateUtils';
import { ensureArray, extractArray } from '../utils/safeArray';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';

interface WorkspaceTaskDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  task: any;
  onUpdate: (updatedTask?: any) => void;
  users?: any[];
  onOpenContact?: (contactId: number, initialData?: any) => void;
  embedMode?: boolean;
  isFocusSessionActive?: boolean;
  focusTaskIndex?: number;
  focusTasksCount?: number;
  onNextFocusTask?: () => void;
  zIndex?: number;
  isFromCustomerDrawer?: boolean;
  onOpenFocusMode?: () => void;
  taskGroups?: any[];
}

// ============================================================================
// PURE UTILITIES & SECURITY HELPERS
// ============================================================================

const METADATA_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const CHECKLIST_PAGE_SIZE = 50;
const TIMELINE_PAGE_SIZE = 20;
const COMMENTS_PAGE_SIZE = 40;
const MAX_UPLOAD_MB = 50;

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

const SYSTEM_HIDDEN_TAGS = new Set([
  'internal_task',
  'internal_meeting',
  'internal_announcement',
  'pinned',
  'ca_nhan',
  'personal',
  'personal_task'
]);

const isAbortError = (err: any): boolean => {
  if (!err) return false;
  return (
    err.name === 'AbortError' ||
    err.name === 'CanceledError' ||
    err.code === 'ERR_CANCELED' ||
    Boolean(err.__CANCEL__)
  );
};

const safeJsonParse = <T = any>(raw: unknown, fallback: T): T => {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw !== 'string') return (raw as T) ?? fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed === null || parsed === undefined ? fallback : (parsed as T);
  } catch {
    return fallback;
  }
};

const removeAccents = (str: string): string =>
  (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();

const isSubtaskDone = (item: any): boolean => Boolean(item?.done ?? item?.checked);

const parseTagTokens = (tagsStr: unknown): string[] => {
  if (Array.isArray(tagsStr)) {
    return tagsStr.map(s => String(s || '').trim()).filter(Boolean);
  }
  return String(tagsStr || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
};

const hasExactTag = (tagsStr: unknown, targetTag: string): boolean => {
  const lowerTarget = targetTag.toLowerCase();
  return parseTagTokens(tagsStr).some(t => t.toLowerCase() === lowerTarget);
};

const getLocalDateTimeStr = (dateVal: Date = new Date()): string => {
  const datePart = getLocalDateStr(dateVal);
  const hh = String(dateVal.getHours()).padStart(2, '0');
  const mm = String(dateVal.getMinutes()).padStart(2, '0');
  const ss = String(dateVal.getSeconds()).padStart(2, '0');
  return `${datePart} ${hh}:${mm}:${ss}`;
};

const safeParseDateMs = (dateVal: unknown): number => {
  if (!dateVal) return 0;
  try {
    if (dateVal instanceof Date) {
      const t = dateVal.getTime();
      return isNaN(t) ? 0 : t;
    }
    const str = String(dateVal).trim();
    if (!str || str === '0000-00-00' || str === '0000-00-00 00:00:00') return 0;
    const normalized = str.includes('T') ? str : str.replace(/-/g, '/');
    const ms = new Date(normalized).getTime();
    return isNaN(ms) ? 0 : ms;
  } catch {
    return 0;
  }
};

const toDateTimeLocalInput = (dateVal?: string | null, fallbackHHmm = '18:00'): string => {
  if (!dateVal) return '';
  const str = String(dateVal).trim();
  if (!str || str === '0000-00-00' || str === '0000-00-00 00:00:00') return '';
  // If already 'YYYY-MM-DD HH:mm:ss' or 'YYYY-MM-DD HH:mm' without timezone offset
  const localMatch = str.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (localMatch && !str.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(str)) {
    return `${localMatch[1]}T${localMatch[2]}`;
  }
  const dateOnlyMatch = str.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnlyMatch) {
    return `${dateOnlyMatch[1]}T${fallbackHHmm}`;
  }
  const ms = safeParseDateMs(str);
  if (!ms) return '';
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${getLocalDateStr(d)}T${hh}:${mm}`;
};

const getTomorrowString = (daysOffset = 1): string => {
  const target = new Date();
  target.setDate(target.getDate() + Math.max(0, Math.round(Number(daysOffset) || 0)));
  return getLocalDateStr(target);
};

const isSafeResourceUrl = (
  rawUrl: unknown,
  options?: { allowRelativeUploads?: boolean; allowBlob?: boolean; allowMailtoTel?: boolean }
): boolean => {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed === '#') return false;

  // Strip whitespace & control chars before scheme inspection to stop java\tscript: bypasses
  const normalized = trimmed.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
  if (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('file:') ||
    normalized.startsWith('//')
  ) {
    return false;
  }

  if (options?.allowBlob && normalized.startsWith('blob:')) {
    return true;
  }
  if (options?.allowMailtoTel && (normalized.startsWith('mailto:') || normalized.startsWith('tel:'))) {
    return true;
  }

  // Allow relative upload paths (UploadController `uploads/...` & ProjectController uploadTaskAttachment `/uploads/tasks/...`)
  if (options?.allowRelativeUploads !== false) {
    if (trimmed.includes('..')) return false;
    if (/^(?:\/?backend\/)?\/?uploads\//i.test(trimmed) || /^\/?storage\/uploads\//i.test(trimmed)) {
      return true;
    }
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const resolveDisplayFileUrl = (rawUrl: unknown): string => {
  if (!isSafeResourceUrl(rawUrl, { allowRelativeUploads: true, allowBlob: false })) {
    return '';
  }
  const trimmed = String(rawUrl).trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const apiBase = (import.meta.env.VITE_API_URL || '/backend').replace(/\/+$/, '');
  if (trimmed.startsWith('uploads/')) {
    return `${apiBase}/${trimmed}`;
  }
  if (trimmed.startsWith('storage/uploads/')) {
    return `${apiBase}/${trimmed.replace('storage/uploads/', 'uploads/')}`;
  }
  if (trimmed.startsWith('/uploads/')) {
    return typeof window !== 'undefined' ? `${window.location.origin}${trimmed}` : trimmed;
  }
  if (trimmed.startsWith('/')) {
    return typeof window !== 'undefined' ? `${window.location.origin}${trimmed}` : trimmed;
  }
  return `${apiBase}/${trimmed}`;
};

const validateTaskUploadFile = (
  file: File,
  options?: { imageOnly?: boolean; maxMb?: number; extraForbiddenExts?: string[] }
): string | null => {
  if (!file) return 'Không tìm thấy tệp tin';
  const maxMb = options?.maxMb ?? MAX_UPLOAD_MB;
  if (file.size <= 0) {
    return 'Tệp tin rỗng không thể tải lên';
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `Dung lượng tệp đính kèm không được vượt quá ${maxMb}MB`;
  }
  const fileName = String(file.name || '').trim();
  const dotIdx = fileName.lastIndexOf('.');
  const ext = dotIdx >= 0 ? fileName.slice(dotIdx + 1).toLowerCase() : '';
  const mime = String(file.type || '').toLowerCase();
  const extraBlocked = Array.isArray(options?.extraForbiddenExts)
    ? options.extraForbiddenExts.map(x => String(x || '').trim().toLowerCase().replace(/^\./, '')).filter(Boolean)
    : [];

  if ((ext && (BLOCKED_UPLOAD_EXTENSIONS.has(ext) || extraBlocked.includes(ext))) || (mime && BLOCKED_UPLOAD_MIMES.has(mime))) {
    return 'Định dạng tệp không được hỗ trợ hoặc không an toàn (chặn HTML, SVG, mã thực thi)';
  }

  if (options?.imageOnly) {
    const isRasterImg = (mime.startsWith('image/') && mime !== 'image/svg+xml') || RASTER_IMAGE_EXTENSIONS.has(ext);
    if (!isRasterImg) {
      return 'Vui lòng chọn tệp hình ảnh hợp lệ (JPEG, PNG, WebP, GIF)';
    }
  }
  return null;
};

const getRoleDisplayName = (user: any) => {
  if (!user) return '';
  return getUserDisplayRoleOrTitle(user);
};

export const getParticipantIds = (ids: any): string[] => {
  if (Array.isArray(ids)) {
    return ids.map(String).filter(Boolean);
  }
  if (typeof ids === 'string') {
    return ids.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (typeof ids === 'number') {
    return [String(ids)];
  }
  return [];
};

// Module-level metadata cache scoped by tenant + user to eliminate cross-tenant / cross-user leaks
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  key: string;
}

let cachedProjects: CacheEntry<any[]> | null = null;
let cachedCampaigns: CacheEntry<any[]> | null = null;
let cachedTeams: CacheEntry<any[]> | null = null;
let cachedContacts: CacheEntry<any[]> | null = null;
let cachedAuthScopeKey = '';

const resetScopedMetadataCaches = (scopeKey: string) => {
  if (cachedAuthScopeKey !== scopeKey) {
    cachedProjects = null;
    cachedCampaigns = null;
    cachedTeams = null;
    cachedContacts = null;
    cachedAuthScopeKey = scopeKey;
  }
};

// Ref-counted body scroll lock to prevent clobbering underlying Drawers/Modals
let drawerBodyLockCount = 0;
let drawerPrevBodyOverflow = '';

const lockDrawerBodyScroll = () => {
  if (typeof document === 'undefined') return;
  if (drawerBodyLockCount === 0) {
    drawerPrevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  drawerBodyLockCount++;
};

const unlockDrawerBodyScroll = () => {
  if (typeof document === 'undefined') return;
  drawerBodyLockCount = Math.max(0, drawerBodyLockCount - 1);
  if (drawerBodyLockCount === 0) {
    const stillHasOtherOverlay = Boolean(
      document.querySelector('.drawer-panel:not([data-closing="true"]), .modal-backdrop')
    );
    if (!stillHasOtherOverlay) {
      document.body.style.overflow = drawerPrevBodyOverflow || '';
    }
  }
};

// Helper to automatically recognize URLs and wrap them in safe <a> tags
export const linkifyHtml = (html: string): string => {
  if (!html || typeof html !== 'string' || !html.trim()) return html || '';
  if (!/https?:\/\/|www\.|<a\b/i.test(html)) return html;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');

    const walk = (node: Node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tagName = el.tagName.toUpperCase();
        if (tagName === 'A') {
          const rawHref = (el.getAttribute('href') || '').trim();
          const normalized = rawHref.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase();
          if (
            !rawHref ||
            rawHref === '#' ||
            normalized.startsWith('javascript:') ||
            normalized.startsWith('vbscript:') ||
            normalized.startsWith('data:') ||
            normalized.startsWith('file:') ||
            normalized.startsWith('//')
          ) {
            el.removeAttribute('href');
            return;
          }
          if (!/^(https?:\/\/|mailto:|tel:|\/)/i.test(rawHref)) {
            el.setAttribute('href', `https://${rawHref}`);
          }
          el.setAttribute('target', '_blank');
          el.setAttribute('rel', 'noopener noreferrer');
          return;
        }
        if (tagName === 'SCRIPT' || tagName === 'STYLE') {
          return;
        }
      }

      if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
        const text = node.nodeValue;
        const urlRegex = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s])/gi;
        if (urlRegex.test(text)) {
          const frag = doc.createDocumentFragment();
          let lastIdx = 0;
          let match;
          urlRegex.lastIndex = 0;
          while ((match = urlRegex.exec(text)) !== null) {
            const rawUrl = match[0];
            const startIdx = match.index;
            if (startIdx > lastIdx) {
              frag.appendChild(doc.createTextNode(text.substring(lastIdx, startIdx)));
            }
            const candidateHref = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`;
            if (isSafeResourceUrl(candidateHref, { allowRelativeUploads: false, allowBlob: false })) {
              const a = doc.createElement('a');
              a.href = candidateHref;
              a.target = '_blank';
              a.rel = 'noopener noreferrer';
              a.style.color = '#BD1D2D';
              a.style.textDecoration = 'underline';
              a.style.wordBreak = 'break-all';
              a.style.cursor = 'pointer';
              a.textContent = rawUrl;
              frag.appendChild(a);
            } else {
              frag.appendChild(doc.createTextNode(rawUrl));
            }
            lastIdx = startIdx + rawUrl.length;
          }
          if (lastIdx < text.length) {
            frag.appendChild(doc.createTextNode(text.substring(lastIdx)));
          }
          node.parentNode?.replaceChild(frag, node);
        }
      } else {
        const children = Array.from(node.childNodes);
        for (const child of children) {
          walk(child);
        }
      }
    };

    walk(doc.body);
    return doc.body.innerHTML;
  } catch (e) {
    console.error('linkifyHtml error:', e);
    return html;
  }
};

// Shared resource classification helper so Resource Cards and Lightbox always match 1:1
const classifyLinkItem = (link: any, t: (k: string) => string) => {
  const rawUrl = String(link?.url || '').trim();
  const fullUrl = resolveDisplayFileUrl(rawUrl);
  const safeOpen = Boolean(fullUrl);

  const youtubeMatch = rawUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
  const youtubeVideoId = youtubeMatch ? youtubeMatch[1] : null;
  const isYouTube = Boolean(youtubeVideoId) || /youtube\.com|youtu\.be/i.test(rawUrl);

  const urlWithoutQuery = rawUrl.split('?')[0].split('#')[0];
  const labelWithoutQuery = String(link?.label || '').split('?')[0].split('#')[0];
  const urlExt = urlWithoutQuery.includes('.') ? urlWithoutQuery.split('.').pop()?.toLowerCase() || '' : '';
  const labelExt = labelWithoutQuery.includes('.') ? labelWithoutQuery.split('.').pop()?.toLowerCase() || '' : '';
  const ext = (labelExt && labelExt.length <= 5) ? labelExt : ((urlExt && urlExt.length <= 5) ? urlExt : '');
  const combinedStr = `${rawUrl} ${link?.label || ''}`.toLowerCase();

  const isGoogleSheets = !isYouTube && (/docs\.google\.com\/spreadsheets/i.test(rawUrl) || /google sheet/i.test(combinedStr));
  const isGoogleDocs = !isYouTube && !isGoogleSheets && (/docs\.google\.com\/document/i.test(rawUrl) || /google doc/i.test(combinedStr));
  const isGoogleDrive = !isYouTube && !isGoogleSheets && !isGoogleDocs && (/drive\.google\.com/i.test(rawUrl) || /google drive/i.test(combinedStr));

  const isWebLink =
    !link?.is_file &&
    !isYouTube &&
    !isGoogleSheets &&
    !isGoogleDocs &&
    !isGoogleDrive &&
    /^https?:\/\//i.test(rawUrl) &&
    !/\/uploads\//i.test(rawUrl);
  const isCloudOrWeb = isYouTube || isGoogleSheets || isGoogleDocs || isGoogleDrive || isWebLink;

  const isImage =
    !isCloudOrWeb &&
    safeOpen &&
    Boolean(
      link?.is_image ||
      ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext) ||
      (combinedStr.includes('image/') && !combinedStr.includes('pdf'))
    );
  const isWord = !isCloudOrWeb && (['doc', 'docx'].includes(ext) || (!isImage && (combinedStr.includes('.docx') || combinedStr.includes('.doc') || combinedStr.includes('hop_dong') || combinedStr.includes('hopdong'))));
  const isExcel = !isCloudOrWeb && (['xls', 'xlsx', 'csv'].includes(ext) || (!isImage && (combinedStr.includes('.xlsx') || combinedStr.includes('.xls') || combinedStr.includes('.csv') || combinedStr.includes('lich_thanh_toan'))));
  const isPdf = !isCloudOrWeb && safeOpen && (ext === 'pdf' || (!isImage && combinedStr.includes('.pdf')));
  const isZip = !isCloudOrWeb && ['zip', 'rar', '7z', 'tar', 'gz'].includes(ext);

  let formatBadge = ext ? ext.toUpperCase() : 'FILE';
  let formatColor = '#334155';
  let formatBg = 'rgba(15, 23, 42, 0.06)';
  let formatBorder = '#E2E8F0';
  let subLabel = t('Tệp đính kèm • Nhấn để tải về / mở');

  if (isYouTube) {
    formatBadge = 'YOUTUBE';
    formatColor = '#BD1D2D';
    formatBg = 'rgba(189, 29, 45, 0.08)';
    formatBorder = 'rgba(189, 29, 45, 0.25)';
    subLabel = t('YouTube Video • Nhấn để xem / mở');
  } else if (isGoogleDocs) {
    formatBadge = 'DOCS';
    formatColor = '#334155';
    formatBg = '#F1F5F9';
    formatBorder = '#CBD5E1';
    subLabel = t('Google Docs • Nhấn để mở tài liệu');
  } else if (isGoogleSheets) {
    formatBadge = 'SHEETS';
    formatColor = '#334155';
    formatBg = '#F1F5F9';
    formatBorder = '#CBD5E1';
    subLabel = t('Google Sheets • Nhấn để mở bảng tính');
  } else if (isGoogleDrive) {
    formatBadge = 'DRIVE';
    formatColor = '#334155';
    formatBg = '#F1F5F9';
    formatBorder = '#CBD5E1';
    subLabel = t('Google Drive • Nhấn để mở thư mục / tệp');
  } else if (isImage) {
    formatBadge = (ext || 'IMG').toUpperCase();
    formatColor = '#BD1D2D';
    formatBg = 'rgba(189, 29, 45, 0.08)';
    formatBorder = 'rgba(189, 29, 45, 0.22)';
    subLabel = t('Hình ảnh • Nhấn để xem / phóng to');
  } else if (isWord) {
    formatBadge = (ext || 'DOCX').toUpperCase();
    formatColor = '#334155';
    formatBg = '#F1F5F9';
    formatBorder = '#CBD5E1';
    subLabel = t('Tài liệu Word • Nhấn để tải về / mở');
  } else if (isExcel) {
    formatBadge = (ext || 'XLSX').toUpperCase();
    formatColor = '#334155';
    formatBg = '#F1F5F9';
    formatBorder = '#CBD5E1';
    subLabel = t('Bảng tính Excel • Nhấn để tải về / mở');
  } else if (isPdf) {
    formatBadge = 'PDF';
    formatColor = '#BD1D2D';
    formatBg = 'rgba(189, 29, 45, 0.08)';
    formatBorder = 'rgba(189, 29, 45, 0.22)';
    subLabel = t('Tài liệu PDF • Nhấn để xem / tải về');
  } else if (isZip) {
    formatBadge = (ext || 'ZIP').toUpperCase();
    formatColor = '#475569';
    formatBg = '#F1F5F9';
    formatBorder = '#CBD5E1';
    subLabel = t('Tệp nén • Nhấn để tải về');
  } else if (isWebLink) {
    formatBadge = 'LINK';
    formatColor = '#334155';
    formatBg = '#F1F5F9';
    formatBorder = '#E2E8F0';
    subLabel = t('Liên kết web • Nhấn để mở');
  }

  return {
    rawUrl,
    fullUrl,
    safeOpen,
    youtubeVideoId,
    isYouTube,
    isGoogleSheets,
    isGoogleDocs,
    isGoogleDrive,
    isWebLink,
    isCloudOrWeb,
    isImage,
    isWord,
    isExcel,
    isPdf,
    isZip,
    formatBadge,
    formatColor,
    formatBg,
    formatBorder,
    subLabel
  };
};

const TASK_DRAWER_INLINE_STYLES = `
  .rich-text-editor-content ul, .rich-text-editor-content ol {
    padding-left: 1.5rem !important;
    margin: 0.5rem 0 !important;
    list-style-position: outside !important;
  }
  .rich-text-editor-content li {
    margin-bottom: 0.25rem !important;
  }
  .rich-text-editor-content img {
    max-width: 100% !important;
    height: auto !important;
    border-radius: 8px !important;
    margin: 8px 0 !important;
    display: block !important;
  }
  .rich-text-editor-content a {
    color: #BD1D2D !important;
    text-decoration: underline !important;
    word-break: break-all !important;
    cursor: pointer !important;
    font-weight: 500 !important;
    transition: opacity 0.2s ease !important;
  }
  .rich-text-editor-content a:hover {
    opacity: 0.8 !important;
  }
  .task-comment-body img:not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar),
  .rich-comment-content img:not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar),
  [id^="workspace-comment-"] .rich-text-editor-content img:not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar) {
    max-width: min(220px, 100%) !important;
    max-height: 180px !important;
    width: auto !important;
    height: auto !important;
    border-radius: 8px !important;
    cursor: zoom-in !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
    object-fit: cover !important;
    background: rgba(0, 0, 0, 0.02) !important;
    border: 1px solid #E2E8F0 !important;
    display: inline-block !important;
    vertical-align: top !important;
    margin: 4px 6px 4px 0 !important;
    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.06) !important;
  }
  .task-comment-body img:not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar):hover,
  .rich-comment-content img:not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar):hover,
  [id^="workspace-comment-"] .rich-text-editor-content img:not(.mention-avatar):not([data-mention-avatar]):not(.inline-avatar):hover {
    transform: scale(1.015) !important;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12) !important;
  }
  .task-comment-body p,
  .rich-comment-content p {
    margin: 3px 0 !important;
  }
`;

// ============================================================================
// MEMOIZED SUBCOMPONENTS
// ============================================================================

const TaskSubjectInput: React.FC<{
  taskKey?: string;
  initialValue: string;
  onSave: (val: string) => void;
  onSyncFormData: (val: string) => void;
  placeholder: string;
  disabled?: boolean;
}> = React.memo(({ taskKey, initialValue, onSave, onSyncFormData, placeholder, disabled = false }) => {
  const [val, setVal] = useState(initialValue || '');
  const lastSavedValueRef = useRef(initialValue || '');
  const prevTaskKeyRef = useRef(taskKey);
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (prevTaskKeyRef.current !== taskKey) {
      prevTaskKeyRef.current = taskKey;
      const nextInit = initialValue || '';
      setVal(nextInit);
      lastSavedValueRef.current = nextInit;
    } else if (!isFocusedRef.current) {
      const nextInit = initialValue || '';
      setVal(nextInit);
      lastSavedValueRef.current = nextInit;
    }
  }, [taskKey, initialValue]);

  const handleFocus = () => {
    if (!disabled) isFocusedRef.current = true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const next = e.target.value;
    setVal(next);
    onSyncFormData(next);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    isFocusedRef.current = false;
    if (disabled) return;
    const currentVal = e.target.value;
    onSyncFormData(currentVal);
    if (currentVal !== lastSavedValueRef.current) {
      lastSavedValueRef.current = currentVal;
      onSave(currentVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <input
      type="text"
      className="form-input"
      value={val}
      disabled={disabled}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      style={{
        fontSize: '0.88rem',
        fontWeight: 700,
        padding: '10px 14px',
        borderRadius: '10px',
        border: '1px solid #E2E8F0',
        background: disabled ? '#F8FAFC' : 'var(--color-surface, #ffffff)',
        color: 'var(--color-text, #0F172A)',
        cursor: disabled ? 'not-allowed' : 'text'
      }}
    />
  );
});

// ----------------------------------------------------------------------------
// TASK DEPENDENCIES TAB (Matches backend/index.php + ActivityController.php)
// ----------------------------------------------------------------------------

interface TaskDependencyItem {
  predecessor_id: number;
  subject?: string;
  start_date?: string | null;
  due_date?: string | null;
  dependency_type: 'FS' | 'SS' | 'FF' | 'SF';
  lag_days: number;
}

const DEPENDENCY_TYPE_LABELS: Record<string, string> = {
  FS: 'FS (Hoàn thành ➔ Bắt đầu)',
  SS: 'SS (Bắt đầu ➔ Bắt đầu)',
  FF: 'FF (Hoàn thành ➔ Hoàn thành)',
  SF: 'SF (Bắt đầu ➔ Hoàn thành)'
};

const TaskDependenciesTab: React.FC<{
  taskId: number;
  projectId?: number | string | null;
  isReadOnly: boolean;
  dependencies: TaskDependencyItem[];
  loading: boolean;
  candidateTasks: any[];
  loadingCandidates: boolean;
  saving: boolean;
  onAddDependency: (predId: number, depType: 'FS' | 'SS' | 'FF' | 'SF', lagDays: number) => Promise<void>;
  onRemoveDependency: (predId: number) => Promise<void>;
  onReload: () => void;
}> = React.memo(({
  taskId,
  projectId,
  isReadOnly,
  dependencies,
  loading,
  candidateTasks,
  loadingCandidates,
  saving,
  onAddDependency,
  onRemoveDependency,
  onReload
}) => {
  const { t } = useLanguage();
  const [selectedPredId, setSelectedPredId] = useState<string>('');
  const [depType, setDepType] = useState<'FS' | 'SS' | 'FF' | 'SF'>('FS');
  const [lagDays, setLagDays] = useState<number>(0);

  const existingIds = useMemo(() => new Set(dependencies.map(d => Number(d.predecessor_id))), [dependencies]);

  const pickerOptions = useMemo(() => {
    return ensureArray(candidateTasks)
      .filter((item: any) => Number(item?.id) > 0 && Number(item.id) !== Number(taskId) && !existingIds.has(Number(item.id)))
      .map((item: any) => {
        const dueStr = item.due_date ? ` (${t('Hạn')}: ${formatDateVN(item.due_date)})` : '';
        return {
          value: String(item.id),
          label: `#${item.id} — ${item.subject || t('Không có tiêu đề')}${dueStr}`
        };
      });
  }, [candidateTasks, taskId, existingIds, t]);

  const handleAddClick = async () => {
    const predIdNum = Number(selectedPredId);
    if (!predIdNum || saving) {
      toast.error(t('Vui lòng chọn công việc tiền nhiệm'));
      return;
    }
    await onAddDependency(predIdNum, depType, Number(lagDays) || 0);
    setSelectedPredId('');
    setLagDays(0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        padding: '10px 14px',
        borderRadius: '10px',
        background: '#F8FAFC',
        border: '1px solid #E2E8F0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.78rem', color: '#475569' }}>
          <GitBranch size={15} style={{ color: '#BD1D2D', flexShrink: 0 }} />
          <span>
            {projectId
              ? t('Công việc tiền nhiệm trong cùng dự án hoặc hệ thống. Dời hạn công việc tiền nhiệm sẽ tự động dời lịch dây chuyền.')
              : t('Thiết lập các công việc tiền nhiệm cần hoàn thành/bắt đầu trước công việc này.')}
          </span>
        </div>
        <button
          type="button"
          onClick={onReload}
          disabled={loading}
          style={{
            border: '1px solid #E2E8F0',
            background: '#ffffff',
            color: '#334155',
            borderRadius: '8px',
            padding: '5px 10px',
            fontSize: '0.72rem',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0
          }}
        >
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
          <span>{t('Làm mới')}</span>
        </button>
      </div>

      {/* Add Dependency Form */}
      {!isReadOnly && (
        <div style={{
          padding: '14px',
          borderRadius: '12px',
          background: '#ffffff',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {t('Thêm công việc tiền nhiệm')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(135px, 1fr) 90px', gap: '8px', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{t('Công việc tiền nhiệm')}</span>
              <CustomSelect
                searchable
                options={pickerOptions}
                value={selectedPredId}
                onChange={val => setSelectedPredId(String(val))}
                placeholder={loadingCandidates ? t('Đang tải công việc...') : t('Chọn công việc...')}
                size="sm"
                disabled={saving}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{t('Loại phụ thuộc')}</span>
              <CustomSelect
                options={[
                  { value: 'FS', label: 'FS (Finish → Start)' },
                  { value: 'SS', label: 'SS (Start → Start)' },
                  { value: 'FF', label: 'FF (Finish → Finish)' },
                  { value: 'SF', label: 'SF (Start → Finish)' }
                ]}
                value={depType}
                onChange={val => setDepType(String(val) as any)}
                size="sm"
                disabled={saving}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{t('Độ trễ (ngày)')}</span>
              <input
                type="number"
                className="form-input"
                value={lagDays}
                onChange={e => setLagDays(Number(e.target.value) || 0)}
                disabled={saving}
                style={{ height: '34px', fontSize: '0.8rem', textAlign: 'center', padding: '0 8px', borderRadius: '8px', border: '1px solid #E2E8F0' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={handleAddClick}
              disabled={!selectedPredId || saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: 'none',
                background: !selectedPredId || saving ? '#CBD5E1' : '#BD1D2D',
                color: '#ffffff',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: !selectedPredId || saving ? 'not-allowed' : 'pointer'
              }}
            >
              {saving ? <Loader2 size={13} className="spin" /> : <Plus size={14} />}
              <span>{t('Thêm phụ thuộc')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Dependencies List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <StatRowSkeleton />
            <StatRowSkeleton />
          </div>
        ) : dependencies.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '28px 16px',
            borderRadius: '12px',
            border: '1px dashed #E2E8F0',
            background: '#F8FAFC',
            color: '#64748B',
            fontSize: '0.8rem'
          }}>
            {t('Chưa có công việc tiền nhiệm nào được liên kết.')}
          </div>
        ) : (
          dependencies.map(dep => (
            <div
              key={`${dep.predecessor_id}_${dep.dependency_type}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '12px',
                background: '#ffffff',
                border: '1px solid #E2E8F0',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 7px',
                    borderRadius: '6px',
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    fontVariantNumeric: 'tabular-nums'
                  }}>
                    #{dep.predecessor_id}
                  </span>
                  <span style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {dep.subject || t('Công việc tiền nhiệm')}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '0.72rem', color: '#64748B' }}>
                  <span style={{
                    padding: '1px 7px',
                    borderRadius: '5px',
                    background: '#F1F5F9',
                    color: '#334155',
                    fontWeight: 700
                  }}>
                    {DEPENDENCY_TYPE_LABELS[dep.dependency_type] || dep.dependency_type}
                  </span>
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {t('Độ trễ')}: <strong style={{ color: '#0F172A' }}>{dep.lag_days >= 0 ? `+${dep.lag_days}` : dep.lag_days} {t('ngày')}</strong>
                  </span>
                  {dep.due_date && (
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t('Hạn')}: <strong style={{ color: '#0F172A' }}>{formatDateVN(dep.due_date)}</strong>
                    </span>
                  )}
                </div>
              </div>

              {!isReadOnly && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onRemoveDependency(Number(dep.predecessor_id))}
                  title={t('Gỡ phụ thuộc')}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    background: '#ffffff',
                    color: '#BD1D2D',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

// ----------------------------------------------------------------------------
// INTERACTIVE VECTOR WHITEBOARD TAB (Matches task_whiteboards + snapshots)
// ----------------------------------------------------------------------------

interface WhiteboardNode {
  id: string;
  kind: 'rect' | 'sticky' | 'text' | 'arrow' | 'freehand';
  x: number;
  y: number;
  w?: number;
  h?: number;
  x2?: number;
  y2?: number;
  text?: string;
  color: string;
  points?: Array<{ x: number; y: number }>;
}

interface WhiteboardCanvasData {
  viewport: { x: number; y: number; zoom: number };
  nodes: WhiteboardNode[];
  edges: any[];
  freehand: any[];
  frames: any[];
}

const EMPTY_WHITEBOARD_CANVAS: WhiteboardCanvasData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  nodes: [],
  edges: [],
  freehand: [],
  frames: []
};

const WHITEBOARD_COLORS = ['#BD1D2D', '#0F172A', '#475569', '#10b981', '#f59e0b'];

const parseWhiteboardCanvasData = (raw: unknown): WhiteboardCanvasData => {
  const parsed = safeJsonParse<any>(raw, null);
  if (!parsed || typeof parsed !== 'object') {
    return { ...EMPTY_WHITEBOARD_CANVAS, nodes: [], edges: [], freehand: [], frames: [] };
  }
  return {
    viewport: parsed.viewport && typeof parsed.viewport === 'object'
      ? {
          x: Number(parsed.viewport.x) || 0,
          y: Number(parsed.viewport.y) || 0,
          zoom: Math.min(2.5, Math.max(0.4, Number(parsed.viewport.zoom) || 1))
        }
      : { x: 0, y: 0, zoom: 1 },
    nodes: ensureArray<WhiteboardNode>(parsed.nodes),
    edges: ensureArray(parsed.edges),
    freehand: ensureArray(parsed.freehand),
    frames: ensureArray(parsed.frames)
  };
};

const TaskWhiteboardTab: React.FC<{
  isReadOnly: boolean;
  loading: boolean;
  saving: boolean;
  canEditServer: boolean;
  version: number;
  title: string;
  lastEditedByName?: string | null;
  lastEditedByAvatar?: string | null;
  updatedAt?: string | null;
  canvasData: WhiteboardCanvasData;
  isDirty: boolean;
  snapshots: any[];
  loadingSnapshots: boolean;
  onChangeCanvas: (next: WhiteboardCanvasData) => void;
  onSave: () => Promise<void>;
  onCreateSnapshot: (snapshotName: string) => Promise<void>;
  onRestoreSnapshot: (snapshotId: number) => Promise<void>;
  onReload: () => void;
}> = React.memo(({
  isReadOnly,
  loading,
  saving,
  canEditServer,
  version,
  lastEditedByName,
  lastEditedByAvatar,
  updatedAt,
  canvasData,
  isDirty,
  snapshots,
  loadingSnapshots,
  onChangeCanvas,
  onSave,
  onCreateSnapshot,
  onRestoreSnapshot,
  onReload
}) => {
  const { t } = useLanguage();
  const canEdit = !isReadOnly && canEditServer;
  const [tool, setTool] = useState<'select' | 'freehand' | 'rect' | 'sticky' | 'text' | 'arrow'>('freehand');
  const [activeColor, setActiveColor] = useState<string>('#BD1D2D');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [snapshotNameInput, setSnapshotNameInput] = useState('');
  const [undoStack, setUndoStack] = useState<WhiteboardCanvasData[]>([]);
  const [draftNode, setDraftNode] = useState<WhiteboardNode | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragStateRef = useRef<{
    mode: 'draw' | 'move';
    nodeId?: string;
    startX: number;
    startY: number;
    origX?: number;
    origY?: number;
    origX2?: number;
    origY2?: number;
    origPoints?: Array<{ x: number; y: number }>;
  } | null>(null);

  const pushUndoState = useCallback((snapshot: WhiteboardCanvasData) => {
    setUndoStack(prev => [...prev.slice(-19), snapshot]);
  }, []);

  const toCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const zoom = canvasData.viewport.zoom || 1;
    return {
      x: Math.round((clientX - rect.left - canvasData.viewport.x) / zoom),
      y: Math.round((clientY - rect.top - canvasData.viewport.y) / zoom)
    };
  }, [canvasData.viewport]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canEdit) return;
    if (e.button !== 0) return;
    const pt = toCanvasPoint(e.clientX, e.clientY);

    if (tool === 'select') {
      setSelectedNodeId(null);
      return;
    }

    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const newId = `wb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (tool === 'text' || tool === 'sticky') {
      pushUndoState(canvasData);
      const newNode: WhiteboardNode = tool === 'sticky'
        ? { id: newId, kind: 'sticky', x: pt.x, y: pt.y, w: 150, h: 95, text: t('Ghi chú mới'), color: activeColor }
        : { id: newId, kind: 'text', x: pt.x, y: pt.y, text: t('Nhãn văn bản'), color: activeColor };
      onChangeCanvas({ ...canvasData, nodes: [...canvasData.nodes, newNode] });
      setSelectedNodeId(newId);
      setTool('select');
      return;
    }

    dragStateRef.current = { mode: 'draw', startX: pt.x, startY: pt.y };
    if (tool === 'freehand') {
      setDraftNode({ id: newId, kind: 'freehand', x: pt.x, y: pt.y, color: activeColor, points: [pt] });
    } else if (tool === 'rect') {
      setDraftNode({ id: newId, kind: 'rect', x: pt.x, y: pt.y, w: 1, h: 1, color: activeColor });
    } else if (tool === 'arrow') {
      setDraftNode({ id: newId, kind: 'arrow', x: pt.x, y: pt.y, x2: pt.x, y2: pt.y, color: activeColor });
    }
  };

  const handleNodePointerDown = (e: React.PointerEvent, node: WhiteboardNode) => {
    if (!canEdit || tool !== 'select') return;
    e.stopPropagation();
    setSelectedNodeId(node.id);
    const pt = toCanvasPoint(e.clientX, e.clientY);
    pushUndoState(canvasData);
    dragStateRef.current = {
      mode: 'move',
      nodeId: node.id,
      startX: pt.x,
      startY: pt.y,
      origX: node.x,
      origY: node.y,
      origX2: node.x2,
      origY2: node.y2,
      origPoints: node.points ? node.points.map(p => ({ ...p })) : undefined
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragStateRef.current;
    if (!drag || !canEdit) return;
    const pt = toCanvasPoint(e.clientX, e.clientY);

    if (drag.mode === 'move' && drag.nodeId) {
      const dx = pt.x - drag.startX;
      const dy = pt.y - drag.startY;
      onChangeCanvas({
        ...canvasData,
        nodes: canvasData.nodes.map(n => {
          if (n.id !== drag.nodeId) return n;
          if (n.kind === 'freehand' && drag.origPoints) {
            return { ...n, points: drag.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy })) };
          }
          if (n.kind === 'arrow') {
            return { ...n, x: (drag.origX || 0) + dx, y: (drag.origY || 0) + dy, x2: (drag.origX2 || 0) + dx, y2: (drag.origY2 || 0) + dy };
          }
          return { ...n, x: (drag.origX || 0) + dx, y: (drag.origY || 0) + dy };
        })
      });
      return;
    }

    if (drag.mode === 'draw' && draftNode) {
      if (draftNode.kind === 'freehand') {
        setDraftNode(prev => prev ? { ...prev, points: [...(prev.points || []), pt] } : null);
      } else if (draftNode.kind === 'rect') {
        const rx = Math.min(drag.startX, pt.x);
        const ry = Math.min(drag.startY, pt.y);
        const rw = Math.max(8, Math.abs(pt.x - drag.startX));
        const rh = Math.max(8, Math.abs(pt.y - drag.startY));
        setDraftNode(prev => prev ? { ...prev, x: rx, y: ry, w: rw, h: rh } : null);
      } else if (draftNode.kind === 'arrow') {
        setDraftNode(prev => prev ? { ...prev, x2: pt.x, y2: pt.y } : null);
      }
    }
  };

  const handlePointerUp = () => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (drag?.mode === 'draw' && draftNode) {
      const hasValidSize =
        draftNode.kind === 'freehand'
          ? (draftNode.points?.length || 0) >= 2
          : draftNode.kind === 'rect'
            ? (draftNode.w || 0) >= 10 && (draftNode.h || 0) >= 10
            : Math.hypot((draftNode.x2 || 0) - draftNode.x, (draftNode.y2 || 0) - draftNode.y) >= 10;

      if (hasValidSize) {
        pushUndoState(canvasData);
        onChangeCanvas({ ...canvasData, nodes: [...canvasData.nodes, draftNode] });
        setSelectedNodeId(draftNode.id);
      }
      setDraftNode(null);
    }
  };

  const selectedNode = useMemo(
    () => canvasData.nodes.find(n => n.id === selectedNodeId) || null,
    [canvasData.nodes, selectedNodeId]
  );

  const handleUndo = () => {
    if (undoStack.length === 0 || !canEdit) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    onChangeCanvas(prev);
  };

  const handleDeleteSelected = () => {
    if (!selectedNodeId || !canEdit) return;
    pushUndoState(canvasData);
    onChangeCanvas({ ...canvasData, nodes: canvasData.nodes.filter(n => n.id !== selectedNodeId) });
    setSelectedNodeId(null);
  };

  const handleClearCanvas = () => {
    if (!canEdit || canvasData.nodes.length === 0) return;
    pushUndoState(canvasData);
    onChangeCanvas({ ...canvasData, nodes: [] });
    setSelectedNodeId(null);
  };

  const handleZoom = (delta: number) => {
    const nextZoom = Math.min(2, Math.max(0.5, Number((canvasData.viewport.zoom + delta).toFixed(2))));
    onChangeCanvas({ ...canvasData, viewport: { ...canvasData.viewport, zoom: nextZoom } });
  };

  const renderNode = (node: WhiteboardNode, isDraft = false) => {
    const isSel = !isDraft && node.id === selectedNodeId;
    const strokeHighlight = isSel ? '#BD1D2D' : node.color;
    const commonProps = isDraft
      ? {}
      : {
          onPointerDown: (e: React.PointerEvent) => handleNodePointerDown(e, node),
          style: { cursor: canEdit && tool === 'select' ? 'move' : 'default' }
        };

    if (node.kind === 'freehand') {
      const pts = ensureArray(node.points);
      if (pts.length === 0) return null;
      const d = pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
      return (
        <path
          key={node.id}
          d={d}
          fill="none"
          stroke={strokeHighlight}
          strokeWidth={isSel ? 3.5 : 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...commonProps}
        />
      );
    }

    if (node.kind === 'rect') {
      return (
        <g key={node.id} {...commonProps}>
          <rect
            x={node.x}
            y={node.y}
            width={node.w || 80}
            height={node.h || 50}
            rx={8}
            fill="rgba(255,255,255,0.88)"
            stroke={strokeHighlight}
            strokeWidth={isSel ? 2.5 : 2}
          />
          {node.text && (
            <text
              x={node.x + (node.w || 80) / 2}
              y={node.y + (node.h || 50) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#0F172A"
              fontSize="12"
              fontWeight="600"
            >
              {node.text}
            </text>
          )}
        </g>
      );
    }

    if (node.kind === 'sticky') {
      return (
        <g key={node.id} {...commonProps}>
          <rect
            x={node.x}
            y={node.y}
            width={node.w || 150}
            height={node.h || 95}
            rx={10}
            fill="#FEF9C3"
            stroke={isSel ? '#BD1D2D' : '#FDE047'}
            strokeWidth={isSel ? 2.5 : 1.5}
          />
          <foreignObject x={node.x + 8} y={node.y + 8} width={(node.w || 150) - 16} height={(node.h || 95) - 16}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#0F172A', lineHeight: 1.35, wordBreak: 'break-word', pointerEvents: 'none' }}>
              {node.text || t('Ghi chú')}
            </div>
          </foreignObject>
        </g>
      );
    }

    if (node.kind === 'text') {
      return (
        <text
          key={node.id}
          x={node.x}
          y={node.y}
          fill={node.color || '#0F172A'}
          fontSize="14"
          fontWeight="700"
          textDecoration={isSel ? 'underline' : 'none'}
          {...commonProps}
        >
          {node.text || t('Văn bản')}
        </text>
      );
    }

    if (node.kind === 'arrow') {
      const x1 = node.x;
      const y1 = node.y;
      const x2 = node.x2 ?? x1 + 40;
      const y2 = node.y2 ?? y1;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 10;
      const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
      const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
      const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
      const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6);
      return (
        <g key={node.id} {...commonProps}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={strokeHighlight} strokeWidth={isSel ? 3 : 2} strokeLinecap="round" />
          <polygon points={`${x2},${y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={strokeHighlight} />
        </g>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
        <StatRowSkeleton />
        <StatRowSkeleton />
      </div>
    );
  }

  const allNodes = draftNode ? [...canvasData.nodes, draftNode] : canvasData.nodes;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Top Info & Save Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '10px',
        background: '#F8FAFC',
        border: '1px solid #E2E8F0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: '6px',
            background: '#ffffff',
            border: '1px solid #E2E8F0',
            color: '#0F172A',
            fontVariantNumeric: 'tabular-nums'
          }}>
            v{version} • {canvasData.nodes.length} {t('đối tượng')}
          </span>
          {isDirty && (
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'rgba(189, 29, 45, 0.08)',
              color: '#BD1D2D'
            }}>
              {t('Chưa lưu')}
            </span>
          )}
          {lastEditedByName && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.72rem', color: '#64748B' }}>
              <Avatar src={lastEditedByAvatar || undefined} name={lastEditedByName} size={18} />
              <span>{lastEditedByName}</span>
              {updatedAt && <span>• {formatDateTimeVN(updatedAt)}</span>}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowSnapshots(v => !v)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: showSnapshots ? '#0F172A' : '#ffffff',
              color: showSnapshots ? '#ffffff' : '#334155',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <History size={13} />
            <span>{t('Cột mốc')} ({snapshots.length})</span>
          </button>

          <button
            type="button"
            onClick={onReload}
            disabled={loading || saving}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '5px 9px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              background: '#ffffff',
              color: '#334155',
              fontSize: '0.74rem',
              fontWeight: 600,
              cursor: loading || saving ? 'not-allowed' : 'pointer'
            }}
          >
            <RefreshCw size={12} />
          </button>

          {canEdit && (
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 12px',
                borderRadius: '8px',
                border: 'none',
                background: '#BD1D2D',
                color: '#ffffff',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.65 : 1
              }}
            >
              {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
              <span>{saving ? t('Đang lưu...') : t('Lưu bảng vẽ')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Drawing Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
        padding: '6px 10px',
        borderRadius: '10px',
        background: '#ffffff',
        border: '1px solid #E2E8F0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
          {([
            { id: 'select', icon: MousePointer, label: t('Chọn & Di chuyển') },
            { id: 'freehand', icon: PenTool, label: t('Vẽ tay') },
            { id: 'rect', icon: Square, label: t('Khối chữ nhật') },
            { id: 'sticky', icon: StickyNote, label: t('Ghi chú Sticky') },
            { id: 'text', icon: Type, label: t('Chữ') },
            { id: 'arrow', icon: ArrowUpRight, label: t('Mũi tên') }
          ] as const).map(item => {
            const IconComp = item.icon;
            const active = tool === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!canEdit}
                onClick={() => setTool(item.id)}
                title={item.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 8px',
                  borderRadius: '7px',
                  border: 'none',
                  background: active ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                  color: active ? '#BD1D2D' : '#475569',
                  fontSize: '0.72rem',
                  fontWeight: active ? 700 : 600,
                  cursor: canEdit ? 'pointer' : 'not-allowed'
                }}
              >
                <IconComp size={14} />
              </button>
            );
          })}

          <div style={{ width: '1px', height: '18px', background: '#E2E8F0', margin: '0 4px' }} />

          {WHITEBOARD_COLORS.map(c => (
            <button
              key={c}
              type="button"
              disabled={!canEdit}
              onClick={() => setActiveColor(c)}
              style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                border: activeColor === c ? '2px solid #0F172A' : '1px solid #E2E8F0',
                background: c,
                cursor: canEdit ? 'pointer' : 'not-allowed',
                padding: 0
              }}
              title={c}
            />
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button type="button" onClick={() => handleZoom(-0.15)} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#334155' }} title={t('Thu nhỏ')}>
            <ZoomOut size={13} />
          </button>
          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#334155', minWidth: '38px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(canvasData.viewport.zoom * 100)}%
          </span>
          <button type="button" onClick={() => handleZoom(0.15)} style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: '6px', padding: '4px', cursor: 'pointer', color: '#334155' }} title={t('Phóng to')}>
            <ZoomIn size={13} />
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
                style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: '6px', padding: '4px 6px', cursor: undoStack.length ? 'pointer' : 'not-allowed', color: '#334155', opacity: undoStack.length ? 1 : 0.45 }}
                title={t('Hoàn tác')}
              >
                <Undo2 size={13} />
              </button>
              {selectedNodeId && (
                <button
                  type="button"
                  onClick={handleDeleteSelected}
                  style={{ border: '1px solid rgba(189, 29, 45, 0.25)', background: 'rgba(189, 29, 45, 0.08)', borderRadius: '6px', padding: '4px 6px', cursor: 'pointer', color: '#BD1D2D' }}
                  title={t('Xóa đối tượng đang chọn')}
                >
                  <Trash2 size={13} />
                </button>
              )}
              {canvasData.nodes.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCanvas}
                  style={{ border: '1px solid #E2E8F0', background: '#fff', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', color: '#64748B', fontSize: '0.7rem', fontWeight: 600 }}
                >
                  {t('Xóa hết')}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Inline Text Edit Bar for Selected Sticky / Text / Rect */}
      {canEdit && selectedNode && (selectedNode.kind === 'sticky' || selectedNode.kind === 'text' || selectedNode.kind === 'rect') && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>{t('Nội dung chữ')}:</span>
          <input
            type="text"
            className="form-input"
            value={selectedNode.text || ''}
            onChange={e => {
              const val = e.target.value;
              onChangeCanvas({
                ...canvasData,
                nodes: canvasData.nodes.map(n => n.id === selectedNode.id ? { ...n, text: val } : n)
              });
            }}
            placeholder={t('Nhập nội dung hiển thị trên khối...')}
            style={{ flex: 1, height: '30px', fontSize: '0.78rem', padding: '4px 8px' }}
          />
        </div>
      )}

      {/* SVG Vector Canvas */}
      <div style={{
        position: 'relative',
        width: '100%',
        height: '320px',
        borderRadius: '12px',
        border: '1px solid #E2E8F0',
        background: '#ffffff',
        backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        overflow: 'hidden',
        touchAction: 'none'
      }}>
        {canvasData.nodes.length === 0 && !draftNode && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            color: '#94A3B8',
            fontSize: '0.8rem',
            fontWeight: 500
          }}>
            {canEdit ? t('Chọn công cụ phía trên và vẽ trực tiếp trên bảng trắng...') : t('Bảng trắng chưa có nội dung.')}
          </div>
        )}
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ display: 'block', width: '100%', height: '100%', cursor: !canEdit ? 'default' : (tool === 'select' ? 'default' : 'crosshair') }}
        >
          <g transform={`translate(${canvasData.viewport.x}, ${canvasData.viewport.y}) scale(${canvasData.viewport.zoom})`}>
            {allNodes.map((n, idx) => renderNode(n, Boolean(draftNode && idx === allNodes.length - 1)))}
          </g>
        </svg>
      </div>

      {/* Snapshots Panel */}
      {showSnapshots && (
        <div style={{
          padding: '12px',
          borderRadius: '12px',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}>
          <div style={{ fontSize: '0.76rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            {t('Lịch sử cột mốc (Snapshots)')}
          </div>

          {canEdit && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                className="form-input"
                value={snapshotNameInput}
                onChange={e => setSnapshotNameInput(e.target.value)}
                placeholder={t('Tên cột mốc (VD: Phác thảo luồng v1)...')}
                style={{ flex: 1, height: '32px', fontSize: '0.78rem', padding: '4px 10px' }}
              />
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  await onCreateSnapshot(snapshotNameInput.trim());
                  setSnapshotNameInput('');
                }}
                style={{
                  padding: '6px 12px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#BD1D2D',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {t('Tạo cột mốc')}
              </button>
            </div>
          )}

          {loadingSnapshots ? (
            <StatRowSkeleton />
          ) : snapshots.length === 0 ? (
            <div style={{ fontSize: '0.76rem', color: '#64748B', textAlign: 'center', padding: '12px 0' }}>
              {t('Chưa có cột mốc lưu trữ nào.')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }} className="custom-scrollbar">
              {snapshots.map((snap: any) => (
                <div
                  key={snap.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    border: '1px solid #E2E8F0'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                    <Avatar src={snap.created_by_avatar} name={snap.created_by_name || 'User'} size={22} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {snap.snapshot_name}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                        {snap.created_by_name || t('Hệ thống')} • {formatDateTimeVN(snap.created_at)}
                      </div>
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onRestoreSnapshot(Number(snap.id))}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid #E2E8F0',
                        background: '#F8FAFC',
                        color: '#BD1D2D',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        flexShrink: 0
                      }}
                    >
                      <RotateCcw size={12} />
                      <span>{t('Khôi phục')}</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// MAIN WORKSPACE TASK DRAWER COMPONENT
// ============================================================================

export const WorkspaceTaskDrawer: React.FC<WorkspaceTaskDrawerProps> = ({
  isOpen,
  onClose,
  task,
  onUpdate,
  users: externalUsers,
  onOpenContact,
  embedMode = false,
  isFocusSessionActive: _isFocusSessionActive = false,
  focusTaskIndex: _focusTaskIndex = 0,
  focusTasksCount: _focusTasksCount = 1,
  onNextFocusTask: _onNextFocusTask,
  zIndex,
  isFromCustomerDrawer = false,
  onOpenFocusMode,
  taskGroups
}) => {
  const isTabActive = useTabActive();
  // Typed Platform Settings (#126) with guaranteed identical fallback defaults
  const defaultPrioritySetting = useTypedSubSetting<string>('hrm.tasks_and_workflows_policy', 'default_priority', 'medium');
  const defaultDueTimeSetting = useTypedSubSetting<string>('hrm.tasks_and_workflows_policy', 'default_due_time', '18:00:00');
  const subtaskDueDaysSetting = useTypedSubSetting<number>('hrm.tasks_and_workflows_policy', 'subtask_due_days', 1);
  const rejectProgressPctSetting = useTypedSubSetting<number>('hrm.tasks_and_workflows_policy', 'reject_progress_pct', 90);
  const recurrenceMaxDaysSetting = useTypedSubSetting<number>('hrm.tasks_and_workflows_policy', 'recurrence_max_days', 365);
  const copyPrefixSetting = useTypedSubSetting<string>('hrm.tasks_and_workflows_policy', 'copy_prefix', '[Bản sao] ');
  const taskPollMsSetting = useTypedSubSetting<number>('hrm.ptk_ui_and_polling_limits', 'task_poll_ms', 4000);
  const uploadMaxMbSetting = useTypedSubSetting<number>('core.upload_security_policy', 'max_mb', MAX_UPLOAD_MB);
  const uploadForbiddenExtsSetting = useTypedSubSetting<string[]>('core.upload_security_policy', 'forbidden_exts', []);
  const uploadWebpQualitySetting = useTypedSubSetting<number>('core.upload_security_policy', 'webp_q', 0.82);
  const drawerMsSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'drawer_ms', 220);
  const zBackdropSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_backdrop', 2147483620);
  const zDrawerSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_drawer', 2147483625);
  const zModalNestedSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_modal_nested', 2147483646);
  const zToastTopSetting = useTypedSubSetting<number>('ui.overlay_zindex_and_motion_ms', 'z_toast_top', 2147483647);

  const safeDefaultPriority = ['low', 'medium', 'high', 'urgent'].includes(String(defaultPrioritySetting || '').toLowerCase())
    ? String(defaultPrioritySetting).toLowerCase()
    : 'medium';
  const normalizedDefaultDueTime = /^\d{2}:\d{2}(:\d{2})?$/.test(String(defaultDueTimeSetting || '').trim())
    ? (String(defaultDueTimeSetting).trim().length === 5 ? `${String(defaultDueTimeSetting).trim()}:00` : String(defaultDueTimeSetting).trim())
    : '18:00:00';
  const defaultDueTimeHHmm = normalizedDefaultDueTime.slice(0, 5);
  const safeSubtaskDueDays = Number.isFinite(Number(subtaskDueDaysSetting)) && Number(subtaskDueDaysSetting) >= 0
    ? Math.round(Number(subtaskDueDaysSetting))
    : 1;
  const safeRejectProgressPct = Number.isFinite(Number(rejectProgressPctSetting))
    ? Math.min(99, Math.max(0, Math.round(Number(rejectProgressPctSetting))))
    : 90;
  const safeRecurrenceMaxDays = Number.isFinite(Number(recurrenceMaxDaysSetting)) && Number(recurrenceMaxDaysSetting) >= 1
    ? Math.round(Number(recurrenceMaxDaysSetting))
    : 365;
  const safeCopyPrefix = String(copyPrefixSetting || '[Bản sao] ');
  const safeTaskPollMs = Math.max(2000, Number(taskPollMsSetting) || 4000);
  const safeUploadMaxMb = Number.isFinite(Number(uploadMaxMbSetting)) && Number(uploadMaxMbSetting) > 0
    ? Number(uploadMaxMbSetting)
    : MAX_UPLOAD_MB;
  const safeForbiddenExts = useMemo(
    () => ensureArray(uploadForbiddenExtsSetting).map((x: any) => String(x || '').trim().toLowerCase().replace(/^\./, '')).filter(Boolean),
    [uploadForbiddenExtsSetting]
  );
  const safeWebpQuality = Number.isFinite(Number(uploadWebpQualitySetting)) && Number(uploadWebpQualitySetting) > 0 && Number(uploadWebpQualitySetting) <= 1
    ? Number(uploadWebpQualitySetting)
    : 0.82;
  const safeDrawerMs = Math.max(100, Number(drawerMsSetting) || 220);
  const motionDurationSec = safeDrawerMs / 1000;
  const baseZDrawer = Math.min(Math.max(Number(zDrawerSetting) || 2147483625, 2147483625), 2147483638);
  const effectiveZIndex = Math.min(Math.max(zIndex || baseZDrawer, baseZDrawer), 2147483638);
  const effectiveBackdropZIndex = Math.min(
    effectiveZIndex - 5,
    Math.max(Number(zBackdropSetting) || 2147483620, 2147483620)
  );
  const effectiveZNestedModal = Math.max(Number(zModalNestedSetting) || 2147483646, 2147483646);
  const effectiveZTopModal = Math.max(Number(zToastTopSetting) || 2147483647, 2147483647);

  const navigate = useNavigate();
  const { t } = useLanguage();
  const { startUpload, updateProgress, finishUpload } = useUploadActions();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser } = useAuth();
  const showConfirm = useUIStore((s) => s.showConfirm);
  const closeConfirm = useUIStore((s) => s.closeConfirm);
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= 1024 : false
  );

  const isReadOnly = useMemo(
    () => isViewer(currentUser) || String(currentUser?.role || '').toLowerCase() === 'viewer',
    [currentUser]
  );

  const authScopeKey = `${(currentUser as any)?.tenant_id || 0}:${currentUser?.id || (currentUser as any)?.user_id || 0}`;
  resetScopedMetadataCaches(authScopeKey);

  // Scoped proposal ID via React state & custom event (replaces legacy global window state)
  const [scopedProposalId, setScopedProposalId] = useState<string | null>(null);
  const scopedProposalIdRef = useRef<string | null>(null);
  scopedProposalIdRef.current = scopedProposalId;

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.proposalId) {
        setScopedProposalId(String(detail.proposalId));
      }
    };
    window.addEventListener('erp-task-proposal-bind', handler);
    return () => window.removeEventListener('erp-task-proposal-bind', handler);
  }, []);

  // Users Hydration with AbortController
  const [internalUsers, setInternalUsers] = useState<any[]>([]);
  useEffect(() => {
    if (!isOpen || (Array.isArray(externalUsers) && externalUsers.length > 0)) return;
    const ctrl = new AbortController();
    api.get('/users?all=1', { signal: ctrl.signal }).then(res => {
      if (ctrl.signal.aborted) return;
      if (res.data?.success) {
        setInternalUsers(extractArray(res.data, 'users'));
      }
    }).catch((err: any) => {
      if (isAbortError(err)) return;
    });
    return () => ctrl.abort();
  }, [isOpen, externalUsers]);

  const users = useMemo(
    () => (Array.isArray(externalUsers) && externalUsers.length > 0)
      ? externalUsers
      : ensureArray(internalUsers),
    [externalUsers, internalUsers]
  );

  // Task Groups Hydration with AbortController
  const [internalTaskGroups, setInternalTaskGroups] = useState<any[]>([]);
  useEffect(() => {
    if (!isOpen || (Array.isArray(taskGroups) && taskGroups.length > 0)) return;
    const ctrl = new AbortController();
    api.get('/task-groups', { signal: ctrl.signal }).then(res => {
      if (ctrl.signal.aborted) return;
      if (res.data?.success) {
        setInternalTaskGroups(extractArray(res.data, 'groups'));
      }
    }).catch((err: any) => {
      if (isAbortError(err)) return;
    });
    return () => ctrl.abort();
  }, [isOpen, taskGroups]);

  const availableTaskGroups = useMemo(
    () => (Array.isArray(taskGroups) && taskGroups.length > 0)
      ? taskGroups
      : ensureArray(internalTaskGroups),
    [taskGroups, internalTaskGroups]
  );

  const escapeHandlerRef = useRef<() => void>(() => onClose());
  useEffect(() => {
    if (isOpen && !embedMode) {
      return pushOverlay('workspace-task-drawer', () => {
        escapeHandlerRef.current();
      }, isFromCustomerDrawer ? 110 : 90);
    }
  }, [isOpen, embedMode, isFromCustomerDrawer]);

  useEffect(() => {
    let lastIsMobile = typeof window !== 'undefined' ? window.innerWidth <= 1024 : false;
    const handleResize = () => {
      const next = window.innerWidth <= 1024;
      if (next !== lastIsMobile) {
        lastIsMobile = next;
        setIsMobileOrTablet(next);
      }
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [formData, setFormData] = useState<any>({});
  const [isClonedDraft, setIsClonedDraft] = useState<boolean>(false);
  const isClonedDraftRef = useRef<boolean>(false);
  isClonedDraftRef.current = isClonedDraft;

  const activeTaskId = (formData?.id && formData.id !== 'new' && formData.id !== 0 && formData.id !== '0')
    ? formData.id
    : task?.id;
  const activeTaskIdRef = useRef<any>(activeTaskId);
  activeTaskIdRef.current = activeTaskId;
  const isNew = Boolean(
    isClonedDraft ||
    formData?.id === 'new' ||
    (!activeTaskId && (task?.id === 'new' || !task?.id || task?.id === 0 || task?.id === '0'))
  );
  const formDataRef = useRef<any>(formData);
  formDataRef.current = formData;
  const isNewRef = useRef<boolean>(isNew);
  isNewRef.current = isNew;

  const formatHeaderDate = (dateVal: any): string | null => {
    const formatted = formatDateTimeVN(dateVal, '', 'dateFirst');
    return formatted || null;
  };

  const [erpMeta, setErpMeta] = useState<any>({
    description: '',
    internal_type: 'task',
    scope: 'team',
    team_id: String(task?.team_id || ''),
    project_id: String(task?.project_id || ''),
    recurrence: {
      pattern: 'none',
      weekly_days: [],
      monthly_day: 1,
      days_interval: 3,
      last_generated: ''
    },
    checklist: [],
    links: []
  });
  const erpMetaRef = useRef<any>(erpMeta);
  erpMetaRef.current = erpMeta;
  const lastSyncedDescRef = useRef<string>('');
  const isDescDirtyRef = useRef<boolean>(false);
  const deletedSubtaskIdsRef = useRef<string[]>([]);
  const lastSyncedUpdatedAtRef = useRef<string>('');
  const lastSyncedApprovalRef = useRef<{ progress: number; approval_status: string | null }>({
    progress: 0,
    approval_status: null
  });
  const liveSyncInFlightRef = useRef<boolean>(false);

  // Unified Serialized Save Queue Refs
  const saveChainRef = useRef<Promise<any>>(Promise.resolve());
  const saveQueueAbortRef = useRef<AbortController | null>(null);
  const saveSessionVersionRef = useRef<number>(0);
  const pendingFieldUpdatesRef = useRef<Record<string, any>>({});
  const pendingMetaSaveRef = useRef<{
    updatedMeta: any;
    overrideProgress?: number;
    dirtyMetaFields: Set<string>;
    dirtySubtaskIds: Set<string>;
    deletedSubtaskIds: Set<string>;
    forceFullBody?: boolean;
  } | null>(null);

  const saveMetaInFlightRef = useRef(false);
  const manualSaveInFlightRef = useRef(false);
  const deleteTaskInFlightRef = useRef(false);
  const updateFieldInFlightRef = useRef(false);
  const inlineApprovalInFlightRef = useRef(false);
  const completeMeetingInFlightRef = useRef(false);
  const cancelMeetingInFlightRef = useRef(false);
  const rescheduleMeetingInFlightRef = useRef(false);
  const muteInFlightRef = useRef(false);
  const hideInFlightRef = useRef(false);
  const archiveInFlightRef = useRef(false);
  const resourceUploadInFlightRef = useRef(false);
  const dependenciesInFlightRef = useRef(false);
  const whiteboardInFlightRef = useRef(false);

  const resetSaveQueueForTaskChange = useCallback(() => {
    saveSessionVersionRef.current += 1;
    if (saveQueueAbortRef.current) {
      saveQueueAbortRef.current.abort();
      saveQueueAbortRef.current = null;
    }
    pendingFieldUpdatesRef.current = {};
    pendingMetaSaveRef.current = null;
    updateFieldInFlightRef.current = false;
    saveMetaInFlightRef.current = false;
    manualSaveInFlightRef.current = false;
  }, []);

  const [isCustomerLinked, setIsCustomerLinked] = useState<boolean>(false);
  const hasLinkedCustomer = Boolean(
    formData.contact_id ||
    (formData.related_type === 'contact' && formData.related_id) ||
    (Array.isArray(erpMeta?.related_contact_ids) && erpMeta.related_contact_ids.length > 0)
  );

  const currentUid = Number(currentUser?.id || (currentUser as any)?.user_id || 0);
  const taskUid = Number(formData.user_id || 0);
  const taskCreatedBy = Number(formData.created_by || task?.created_by || currentUid);

  const unpinIfDone = useCallback((status?: string, progress?: number) => {
    const isDone = status === 'done' || Number(progress || 0) >= 100;
    const tid = activeTaskIdRef.current;
    if (isDone && currentUid && !isNewRef.current && tid && tid !== 'new') {
      try {
        const key = `pinned_tasks_${currentUid}`;
        const stored = localStorage.getItem(key);
        if (stored) {
          const arr = ensureArray(safeJsonParse(stored, []));
          const filtered = arr.filter((id: any) => Number(id) !== Number(tid));
          localStorage.setItem(key, JSON.stringify(filtered));
        }
      } catch {
        // Ignore storage errors
      }
    }
  }, [currentUid]);

  const isPersonalTask = useMemo(() => {
    if (hasExactTag(formData.tags, 'ca_nhan') || hasExactTag(formData.tags, 'personal') || hasExactTag(formData.tags, 'personal_task')) {
      return true;
    }

    const hasSubtaskForOthers = ensureArray(erpMeta?.checklist).some((item: any) => {
      if (!item?.assignee_id) return false;
      const ids = String(item.assignee_id).split(',').map(s => Number(s.trim())).filter(id => id > 0);
      return ids.some(id => id !== taskUid && id !== taskCreatedBy);
    });
    if (hasSubtaskForOthers) return false;

    if (taskUid > 0 && taskUid === taskCreatedBy) {
      const pIds = getParticipantIds(formData.participant_ids || formData.collaborator_ids || '').filter(id => Number(id) !== taskUid);
      const hasOtherParticipants = pIds.length > 0;
      const hasApprover = Number(formData.approver_id || 0) > 0 && Number(formData.approver_id) !== taskUid;
      return !hasOtherParticipants && !hasApprover;
    }
    return false;
  }, [formData.tags, formData.user_id, formData.created_by, task?.created_by, formData.participant_ids, formData.collaborator_ids, formData.approver_id, taskUid, taskCreatedBy, erpMeta?.checklist]);

  const personalUser = useMemo(() => {
    const pId = taskUid || taskCreatedBy || currentUid;
    const found = users.find(u => Number(u.id) === pId);
    if (found) return found;
    const isSelfPersonal = pId > 0 && pId === currentUid;
    const name = formData.user_name || formData.created_by_name || (isSelfPersonal ? (currentUser?.name || (currentUser as any)?.full_name) : '') || 'Tôi';
    const avatar = (pId === Number(formData.user_id) ? (formData.user_avatar || formData.assignee_avatar) : '') || (pId === Number(formData.created_by) ? formData.created_by_avatar : '') || (isSelfPersonal ? (currentUser?.avatar || (currentUser as any)?.avatar_url) : '') || '';
    return {
      id: pId,
      name,
      full_name: name,
      avatar,
      avatar_url: avatar
    };
  }, [users, taskUid, taskCreatedBy, currentUid, formData.user_id, formData.user_name, formData.user_avatar, formData.assignee_avatar, formData.created_by, formData.created_by_name, formData.created_by_avatar, currentUser]);

  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [commentsPage, setCommentsPage] = useState(1);
  const [activeTab, setActiveTab] = useState<'comments' | 'timeline' | 'dependencies' | 'whiteboard'>('comments');
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const [timelinePage, setTimelinePage] = useState(1);
  const [newCommentText, setNewCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState<any[]>([]);
  const [replyTo, setReplyTo] = useState<{ id: number; userName: string; avatar?: string } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Dependencies state
  const [dependencies, setDependencies] = useState<TaskDependencyItem[]>([]);
  const [loadingDependencies, setLoadingDependencies] = useState(false);
  const [savingDependencies, setSavingDependencies] = useState(false);
  const [dependencyCandidates, setDependencyCandidates] = useState<any[]>([]);
  const [loadingDependencyCandidates, setLoadingDependencyCandidates] = useState(false);

  // Whiteboard state
  const [whiteboardLoading, setWhiteboardLoading] = useState(false);
  const [whiteboardSaving, setWhiteboardSaving] = useState(false);
  const [whiteboardVersion, setWhiteboardVersion] = useState(0);
  const [whiteboardTitle, setWhiteboardTitle] = useState('Bản vẽ sơ đồ');
  const [whiteboardCanEdit, setWhiteboardCanEdit] = useState(true);
  const [whiteboardEditedBy, setWhiteboardEditedBy] = useState<{ name?: string | null; avatar?: string | null; updatedAt?: string | null }>({});
  const [whiteboardCanvas, setWhiteboardCanvas] = useState<WhiteboardCanvasData>(EMPTY_WHITEBOARD_CANVAS);
  const [whiteboardDirty, setWhiteboardDirty] = useState(false);
  const [whiteboardSnapshots, setWhiteboardSnapshots] = useState<any[]>([]);
  const [loadingWhiteboardSnapshots, setLoadingWhiteboardSnapshots] = useState(false);

  // Auto-save draft for comment
  const { clearDraft: clearCommentDraft, DraftRecoveryBanner: CommentDraftRecoveryBanner } = useAutoSaveDraft<string>({
    key: `task_comment_${isNew ? 'new' : (activeTaskId || 'new')}`,
    data: newCommentText,
    enabled: isOpen && !isNew && Boolean(activeTaskId) && !isReadOnly,
    isDataEmpty: (d) => !d || !d.trim()
  });

  // Subtask comments state
  const [selectedSubtask, setSelectedSubtask] = useState<any | null>(null);
  const [subtaskComments, setSubtaskComments] = useState<any[]>([]);
  const [loadingSubtaskComments, setLoadingSubtaskComments] = useState(false);
  const [newSubtaskCommentText, setNewSubtaskCommentText] = useState('');
  const [isSubmittingSubtaskComment, setIsSubmittingSubtaskComment] = useState(false);
  const [subtaskCommentAttachments, setSubtaskCommentAttachments] = useState<any[]>([]);
  const [subtaskCommentCounts, setSubtaskCommentCounts] = useState<Record<string, number>>({});

  const [isMuted, setIsMuted] = useState(false);
  const [loadingMute, setLoadingMute] = useState(false);
  const [showMuteConfirmModal, setShowMuteConfirmModal] = useState(false);

  const [isHidden, setIsHidden] = useState(false);
  const [loadingHide, setLoadingHide] = useState(false);

  // Meeting action modals
  const [meetingToComplete, setMeetingToComplete] = useState<any>(null);
  const [completingMeeting, setCompletingMeeting] = useState(false);
  const [proofCommentText, setProofCommentText] = useState('Ảnh minh chứng hoàn thành gặp gỡ');
  const [proofImageFile, setProofImageFile] = useState<File | null>(null);
  const [proofImagePreview, setProofImagePreview] = useState<string | null>(null);
  const proofPreviewUrlRef = useRef<string | null>(null);

  const setSafeProofPreview = useCallback((nextUrl: string | null) => {
    if (proofPreviewUrlRef.current) {
      try { URL.revokeObjectURL(proofPreviewUrlRef.current); } catch {}
      proofPreviewUrlRef.current = null;
    }
    if (nextUrl) proofPreviewUrlRef.current = nextUrl;
    setProofImagePreview(nextUrl);
  }, []);

  const [cancellingMeeting, setCancellingMeeting] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [savingCancel, setSavingCancel] = useState(false);
  const [showClearCustomerConfirm, setShowClearCustomerConfirm] = useState(false);

  // Track timers & blob previews for unmount cleanup
  const timersRef = useRef<Set<number>>(new Set());
  const registerTimer = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(id => window.clearTimeout(id));
    timersRef.current.clear();
  }, []);

  const commentAttachmentsRef = useRef<any[]>([]);
  commentAttachmentsRef.current = commentAttachments;
  const subtaskAttachmentsRef = useRef<any[]>([]);
  subtaskAttachmentsRef.current = subtaskCommentAttachments;

  const revokeAttachmentPreviewList = useCallback((list: any[]) => {
    ensureArray(list).forEach((att: any) => {
      if (att?.previewUrl) {
        try { URL.revokeObjectURL(att.previewUrl); } catch {}
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimers();
      revokeAttachmentPreviewList(commentAttachmentsRef.current);
      revokeAttachmentPreviewList(subtaskAttachmentsRef.current);
      if (proofPreviewUrlRef.current) {
        try { URL.revokeObjectURL(proofPreviewUrlRef.current); } catch {}
      }
      if (saveQueueAbortRef.current) saveQueueAbortRef.current.abort();
    };
  }, [clearAllTimers, revokeAttachmentPreviewList]);

  // AbortControllers
  const contactsAbortRef = useRef<AbortController | null>(null);
  const contactSearchAbortRef = useRef<AbortController | null>(null);
  const lastRemoteContactQueryRef = useRef<string>('');
  const commentsAbortRef = useRef<AbortController | null>(null);
  const timelineAbortRef = useRef<AbortController | null>(null);
  const subtaskCommentsAbortRef = useRef<AbortController | null>(null);
  const metaStatusAbortRef = useRef<AbortController | null>(null);
  const pollAbortRef = useRef<AbortController | null>(null);
  const dependenciesAbortRef = useRef<AbortController | null>(null);
  const depCandidatesAbortRef = useRef<AbortController | null>(null);
  const whiteboardAbortRef = useRef<AbortController | null>(null);
  const whiteboardSnapshotsAbortRef = useRef<AbortController | null>(null);
  const deleteCommentInFlightRef = useRef(false);

  const loadSubtaskCommentCounts = useCallback(() => {
    const tid = activeTaskIdRef.current;
    if (isNewRef.current || !tid || tid === 'new') return;
    const targetTid = String(tid);
    api.get(`/activities/${tid}/subtasks-comment-counts`)
      .then(res => {
        if (String(activeTaskIdRef.current) !== targetTid) return;
        if (res.data && res.data.success) {
          setSubtaskCommentCounts(res.data.data || {});
        }
      })
      .catch(err => {
        if (!isAbortError(err)) console.error('Lỗi lấy số lượng bình luận việc con:', err);
      });
  }, []);

  useEffect(() => {
    if (!isOpen || isNew || !activeTaskId || activeTaskId === 'new') return;
    if (metaStatusAbortRef.current) metaStatusAbortRef.current.abort();
    const ctrl = new AbortController();
    metaStatusAbortRef.current = ctrl;
    const taskId = activeTaskId;
    const taskIdStr = String(taskId);
    setLoadingMute(true);

    const promises: Promise<any>[] = [];
    if (formDataRef.current?.is_muted !== undefined) {
      setIsMuted(Boolean(formDataRef.current.is_muted));
    } else if (task?.id === taskId && task?.is_muted !== undefined) {
      setIsMuted(Boolean(task.is_muted));
    } else {
      promises.push(
        api.get(`/activities/${taskId}/mute-status`, { signal: ctrl.signal }).then(res => {
          if (ctrl.signal.aborted || String(activeTaskIdRef.current) !== taskIdStr) return;
          const mutedVal = res.data?.data?.is_muted ?? res.data?.is_muted;
          if (res.data?.success !== false && mutedVal !== undefined) {
            setIsMuted(Boolean(mutedVal));
          }
        }).catch(() => {})
      );
    }

    if (formDataRef.current?.is_hidden !== undefined) {
      setIsHidden(Boolean(formDataRef.current.is_hidden));
    } else if (task?.id === taskId && task?.is_hidden !== undefined) {
      setIsHidden(Boolean(task.is_hidden));
    } else {
      promises.push(
        api.get(`/activities/${taskId}/hide-status`, { signal: ctrl.signal }).then(res => {
          if (ctrl.signal.aborted || String(activeTaskIdRef.current) !== taskIdStr) return;
          const hiddenVal = res.data?.data?.is_hidden ?? res.data?.is_hidden;
          if (res.data?.success !== false && hiddenVal !== undefined) {
            setIsHidden(Boolean(hiddenVal));
          }
        }).catch(() => {})
      );
    }

    promises.push(
      api.get(`/activities/${taskId}/subtasks-comment-counts`, { signal: ctrl.signal }).then(res => {
        if (ctrl.signal.aborted || String(activeTaskIdRef.current) !== taskIdStr) return;
        if (res.data) {
          setSubtaskCommentCounts(res.data.data || res.data || {});
        }
      }).catch(() => {})
    );

    Promise.allSettled(promises).finally(() => {
      if (!ctrl.signal.aborted) setLoadingMute(false);
    });

    return () => ctrl.abort();
  }, [isOpen, activeTaskId, isNew, task?.id, task?.is_muted, task?.is_hidden]);

  const handleBellClick = () => {
    const tid = activeTaskIdRef.current;
    if (!tid || tid === 'new' || isNewRef.current || muteInFlightRef.current) return;
    if (!isMuted) {
      setShowMuteConfirmModal(true);
    } else {
      muteInFlightRef.current = true;
      setLoadingMute(true);
      api.post(`/activities/${tid}/toggle-mute`, { mute: false })
        .then(res => {
          if (String(activeTaskIdRef.current) !== String(tid)) return;
          if (res.data && res.data.success) {
            const nextMuted = res.data?.data?.is_muted ?? res.data?.is_muted ?? false;
            setIsMuted(Boolean(nextMuted));
            toast.success(res.data.message || t('Đã bật lại thông báo cho công việc này'));
          }
        })
        .catch(err => {
          toast.error(t('Lỗi cập nhật thông báo: ') + (err.response?.data?.message || err.message));
        })
        .finally(() => {
          muteInFlightRef.current = false;
          setLoadingMute(false);
        });
    }
  };

  const handleConfirmMute = () => {
    const tid = activeTaskIdRef.current;
    if (!tid || tid === 'new' || isNewRef.current || muteInFlightRef.current) return;
    muteInFlightRef.current = true;
    setShowMuteConfirmModal(false);
    setLoadingMute(true);
    api.post(`/activities/${tid}/toggle-mute`, { mute: true })
      .then(res => {
        if (String(activeTaskIdRef.current) !== String(tid)) return;
        if (res.data && res.data.success) {
          const nextMuted = res.data?.data?.is_muted ?? res.data?.is_muted ?? true;
          setIsMuted(Boolean(nextMuted));
          toast.success(res.data.message || t('Đã tắt thông báo cho công việc này'));
        }
      })
      .catch(err => {
        toast.error(t('Lỗi tắt thông báo: ') + (err.response?.data?.message || err.message));
      })
      .finally(() => {
        muteInFlightRef.current = false;
        setLoadingMute(false);
      });
  };

  const executeToggleHide = () => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || tid === 'new' || isNewRef.current || hideInFlightRef.current) return;
    hideInFlightRef.current = true;
    setLoadingHide(true);
    api.post(`/activities/${tid}/toggle-hide`)
      .then(res => {
        if (String(activeTaskIdRef.current) !== String(tid)) return;
        if (res.data && res.data.success) {
          const nextHidden = Boolean(res.data?.data?.is_hidden ?? res.data?.is_hidden);
          setIsHidden(nextHidden);
          toast.success(res.data.message || (nextHidden ? t('Đã ẩn công việc') : t('Đã hiển thị lại công việc')));
          if (onUpdate) onUpdate({ ...task, ...formDataRef.current, id: tid, is_hidden: nextHidden });
          window.dispatchEvent(new CustomEvent('task-updated'));
        }
      })
      .catch(err => {
        toast.error(t('Lỗi cập nhật trạng thái ẩn: ') + (err.response?.data?.message || err.message));
      })
      .finally(() => {
        hideInFlightRef.current = false;
        setLoadingHide(false);
      });
  };

  const handleHideClick = () => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || tid === 'new' || isNewRef.current || hideInFlightRef.current) return;
    if (isHidden) {
      executeToggleHide();
    } else {
      setShowHideConfirmModal(true);
    }
  };

  const handleToggleArchive = async () => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || tid === 'new' || isNewRef.current || archiveInFlightRef.current) return;
    archiveInFlightRef.current = true;
    const nextArchived = !formDataRef.current?.is_archived;
    try {
      const endpoint = nextArchived ? `/tasks/${tid}/archive` : `/tasks/${tid}/unarchive`;
      const res = await api.post(endpoint);
      if (String(activeTaskIdRef.current) !== String(tid)) return;
      if (res.data?.success) {
        setFormData((prev: any) => {
          const next = { ...prev, is_archived: nextArchived ? 1 : 0 };
          formDataRef.current = next;
          return next;
        });
        toast.success(nextArchived ? t('Đã lưu trữ công việc') : t('Đã bỏ lưu trữ công việc'));
        if (onUpdate) onUpdate({ ...task, ...formDataRef.current, id: tid, is_archived: nextArchived ? 1 : 0 });
        window.dispatchEvent(new CustomEvent('task-updated'));
      }
    } catch (err: any) {
      toast.error(t('Lỗi cập nhật lưu trữ: ') + (err.response?.data?.message || err.message));
    } finally {
      archiveInFlightRef.current = false;
    }
  };

  const handleShareTask = async () => {
    const tid = activeTaskIdRef.current;
    if (!tid || tid === 'new') return;
    const params = new URLSearchParams(window.location.search);
    params.set('task_id', String(tid));
    const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t('Đã sao chép liên kết chia sẻ công việc'));
        return;
      }
      // Fallback for non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copied) {
        toast.success(t('Đã sao chép liên kết chia sẻ công việc'));
      } else {
        toast.error(t('Không thể sao chép liên kết'));
      }
    } catch {
      toast.error(t('Không thể sao chép liên kết'));
    }
  };

  // Checklist adding state
  const [newSubTitle, setNewSubTitle] = useState('');
  const [newSubAssignee, setNewSubAssignee] = useState('');
  const [newSubDeadline, setNewSubDeadline] = useState(() => getTomorrowString(safeSubtaskDueDays));
  const [newSubPriority, setNewSubPriority] = useState<string>(safeDefaultPriority);

  // Checklist inline edit & assignee picker state
  const [editingChecklistId, setEditingChecklistId] = useState<string | null>(null);
  const [editingChecklistTitle, setEditingChecklistTitle] = useState<string>('');
  const [editingChecklistDeadline, setEditingChecklistDeadline] = useState<string>('');
  const [activeAssigneeDropdownId, setActiveAssigneeDropdownId] = useState<string | null>(null);
  const [subtaskDropdownRect, setSubtaskDropdownRect] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const [deleteSubtaskTarget, setDeleteSubtaskTarget] = useState<{ id: string; title: string } | null>(null);
  const [checklistPage, setChecklistPage] = useState<number>(1);
  const [checklistSearch, setChecklistSearch] = useState<string>('');
  const [checklistFilter, setChecklistFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [hideCompletedChecklist, setHideCompletedChecklist] = useState<boolean>(false);
  const [showParticipantDropdown, setShowParticipantDropdown] = useState(false);
  const [participantDropdownRect, setParticipantDropdownRect] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantModalSearch, setParticipantModalSearch] = useState('');
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [teamDropdownRect, setTeamDropdownRect] = useState<{ top: number; left: number; openUp: boolean } | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<number | null>(null);
  const [showHideConfirmModal, setShowHideConfirmModal] = useState(false);

  const [allowedProjects, setAllowedProjects] = useState<any[]>([]);
  const [allowedCampaigns, setAllowedCampaigns] = useState<any[]>([]);
  const [allowedTeams, setAllowedTeams] = useState<any[]>([]);

  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const participantDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (showTeamDropdown && !target.closest('.team-dropdown-portal') && !target.closest('.team-dropdown-trigger')) {
        setShowTeamDropdown(false);
      }
      if (showParticipantDropdown && !target.closest('.participant-dropdown-portal') && !target.closest('.participant-dropdown-trigger')) {
        setShowParticipantDropdown(false);
      }
      if (activeAssigneeDropdownId !== null) {
        const isTrigger = target.closest('.subtask-assignee-trigger');
        const isDropdown = target.closest('.subtask-assignee-dropdown');
        if (!isTrigger && !isDropdown) {
          setActiveAssigneeDropdownId(null);
        }
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showTeamDropdown, showParticipantDropdown, activeAssigneeDropdownId]);

  // Load Projects, Campaigns, Teams with tenant/user-scoped cache & AbortController
  useEffect(() => {
    if (!isOpen) return;
    const ctrl = new AbortController();
    const now = Date.now();
    const roleLower = String(currentUser?.role || '').toLowerCase();
    const isRosterRestricted = isReadOnly || ['sale', 'sales', 'manager', 'director'].includes(roleLower);
    const projUrl = isRosterRestricted ? '/projects' : '/projects?bypass_roster=1';
    const campUrl = isRosterRestricted ? '/campaigns' : '/campaigns?bypass_roster=1';
    const projCacheKey = `${authScopeKey}:${projUrl}`;
    const campCacheKey = `${authScopeKey}:${campUrl}`;
    const teamCacheKey = `${authScopeKey}:/teams`;

    if (cachedProjects && (now - cachedProjects.timestamp < METADATA_CACHE_TTL) && cachedProjects.key === projCacheKey) {
      setAllowedProjects(cachedProjects.data);
    } else {
      api.get(projUrl, { signal: ctrl.signal }).then(res => {
        if (ctrl.signal.aborted) return;
        const list = extractArray(res?.data, 'projects');
        cachedProjects = { data: list, timestamp: Date.now(), key: projCacheKey };
        setAllowedProjects(list);
      }).catch((err: any) => {
        if (!isAbortError(err)) console.error('Projects fetch error:', err);
      });
    }

    if (cachedCampaigns && (now - cachedCampaigns.timestamp < METADATA_CACHE_TTL) && cachedCampaigns.key === campCacheKey) {
      setAllowedCampaigns(cachedCampaigns.data);
    } else {
      api.get(campUrl, { signal: ctrl.signal }).then(res => {
        if (ctrl.signal.aborted) return;
        const list = extractArray(res?.data, 'campaigns');
        cachedCampaigns = { data: list, timestamp: Date.now(), key: campCacheKey };
        setAllowedCampaigns(list);
      }).catch((err: any) => {
        if (!isAbortError(err)) console.error('Campaigns fetch error:', err);
      });
    }

    if (cachedTeams && (now - cachedTeams.timestamp < METADATA_CACHE_TTL) && cachedTeams.key === teamCacheKey) {
      setAllowedTeams(cachedTeams.data);
    } else {
      api.get('/teams', { signal: ctrl.signal }).then(res => {
        if (ctrl.signal.aborted) return;
        const list = extractArray(res?.data, 'teams');
        cachedTeams = { data: list, timestamp: Date.now(), key: teamCacheKey };
        setAllowedTeams(list);
      }).catch((err: any) => {
        if (!isAbortError(err)) console.error('Teams fetch error:', err);
      });
    }

    return () => ctrl.abort();
  }, [isOpen, currentUser?.role, isReadOnly, authScopeKey]);

  useEffect(() => {
    if (!isOpen || !task || !erpMeta) return;
    const ctrl = new AbortController();

    const activeProjId = erpMeta.project_id || (task.related_type === 'project' ? task.related_id : null);
    if (activeProjId && !allowedProjects.some((p: any) => Number(p.id) === Number(activeProjId))) {
      api.get(`/projects/${activeProjId}`, { signal: ctrl.signal }).then(res => {
        if (ctrl.signal.aborted) return;
        const pObj = res.data?.data || res.data;
        if (pObj && pObj.id) {
          setAllowedProjects(prev => {
            if (prev.some((p: any) => Number(p.id) === Number(pObj.id))) return prev;
            const next = [pObj, ...prev];
            if (cachedProjects && cachedProjects.key.startsWith(`${authScopeKey}:`)) cachedProjects.data = next;
            return next;
          });
        }
      }).catch(() => {});
    }

    const activeCampId = erpMeta.campaign_id || (task.related_type === 'campaign' ? task.related_id : null);
    if (activeCampId && !allowedCampaigns.some((c: any) => Number(c.id) === Number(activeCampId))) {
      api.get(`/campaigns/${activeCampId}`, { signal: ctrl.signal }).then(res => {
        if (ctrl.signal.aborted) return;
        const cObj = res.data?.data || res.data;
        if (cObj && cObj.id) {
          setAllowedCampaigns(prev => {
            if (prev.some((c: any) => Number(c.id) === Number(cObj.id))) return prev;
            const next = [cObj, ...prev];
            if (cachedCampaigns && cachedCampaigns.key.startsWith(`${authScopeKey}:`)) cachedCampaigns.data = next;
            return next;
          });
        }
      }).catch(() => {});
    }

    return () => ctrl.abort();
  }, [isOpen, task?.id, erpMeta?.project_id, erpMeta?.campaign_id, allowedProjects.length, allowedCampaigns.length, authScopeKey]);

  const [showAddChecklist, setShowAddChecklist] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [lightboxState, setLightboxState] = useState<{
    isOpen: boolean;
    items: AttachmentItem[];
    initialIndex: number;
  }>({
    isOpen: false,
    items: [],
    initialIndex: 0
  });

  const [isPinned, setIsPinned] = useState(false);

  // Validation and approval modals state
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [showApprovalSuccessModal, setShowApprovalSuccessModal] = useState<string | null>(null);
  const [showUnsavedNewTaskPrompt, setShowUnsavedNewTaskPrompt] = useState(false);

  // Participants modal state
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [participantsSearch, setParticipantsSearch] = useState('');
  const [selectedSubtaskForParticipants, setSelectedSubtaskForParticipants] = useState<any | null>(null);
  const [showAddParticipantsSection, setShowAddParticipantsSection] = useState(false);

  // Contacts state
  const [contacts, setContacts] = useState<any[]>([]);
  const contactsRef = useRef<any[]>([]);
  contactsRef.current = contacts;
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [originalHash, setOriginalHash] = useState<string>('');
  const prevTaskIdRef = useRef<any>(null);
  const prevNewTaskObjRef = useRef<any>(null);
  const duplicatedFromRef = useRef<{ sourceId: string; newId: string } | null>(null);
  const taskRef = useRef(task);
  taskRef.current = task;

  const computeCleanHash = useCallback((fData: any, meta: any) => {
    const cleanObj = (obj: any) => {
      const clean: any = {};
      Object.keys(obj || {}).forEach(key => {
        if (['created_at', 'updated_at', 'deleted_at', 'created_by_name', 'created_by_avatar', 'contact_name', 'contact_avatar', 'user_name'].includes(key)) {
          return;
        }
        const val = obj[key];
        clean[key] = (val === null || val === undefined) ? '' : val;
      });
      return clean;
    };
    return JSON.stringify({
      formData: cleanObj(fData),
      erpMeta: cleanObj(meta)
    });
  }, []);

  const fetchContactsList = useCallback(async (preferredContactId?: number | string | null, forceFull: boolean = false) => {
    if (contactsAbortRef.current) contactsAbortRef.current.abort();
    const abortController = new AbortController();
    contactsAbortRef.current = abortController;
    const now = Date.now();
    const currentFd = formDataRef.current;
    const currentT = taskRef.current;
    const contactsCacheKey = `${authScopeKey}:/contacts`;
    const activeContactId = preferredContactId ||
      currentFd.contact_id ||
      (currentFd.related_type === 'contact' ? currentFd.related_id : null) ||
      currentT?.contact_id ||
      (currentT?.related_type === 'contact' ? currentT?.related_id : null);

    if (activeContactId && !forceFull) {
      if (cachedContacts && cachedContacts.key === contactsCacheKey && cachedContacts.data?.length) {
        const found = cachedContacts.data.find((c: any) => Number(c.id) === Number(activeContactId));
        if (found) {
          setContacts(cachedContacts.data);
          setLoadingContacts(false);
          return;
        }
      }
      setLoadingContacts(true);
      try {
        const singleRes = await api.get(`/contacts/${activeContactId}`, { signal: abortController.signal });
        if (abortController.signal.aborted) return;
        const cObj = singleRes.data?.data || singleRes.data;
        if (cObj && cObj.id) {
          setContacts(prev => {
            if (prev.some((c: any) => Number(c.id) === Number(cObj.id))) return prev;
            return [cObj, ...prev];
          });
        }
      } catch (err: any) {
        if (isAbortError(err)) return;
        console.error('Lỗi tải contact chi tiết:', err);
      } finally {
        if (!abortController.signal.aborted) setLoadingContacts(false);
      }
      return;
    }

    const applyContacts = async (initialList: any[]) => {
      let list = [...initialList];
      if (activeContactId && !list.some((c: any) => Number(c.id) === Number(activeContactId))) {
        try {
          const singleRes = await api.get(`/contacts/${activeContactId}`, { signal: abortController.signal });
          if (abortController.signal.aborted) return;
          const cObj = singleRes.data?.data || singleRes.data;
          if (cObj && cObj.id) {
            list = [cObj, ...list];
            if (cachedContacts && cachedContacts.key === contactsCacheKey) cachedContacts.data = list;
          }
        } catch (err: any) {
          if (isAbortError(err)) return;
          console.error('Lỗi tải contact chi tiết:', err);
        }
      }
      if (!abortController.signal.aborted) {
        setContacts(list);
        setLoadingContacts(false);
      }
    };

    if (cachedContacts && cachedContacts.key === contactsCacheKey && (now - cachedContacts.timestamp < METADATA_CACHE_TTL) && cachedContacts.data?.length > 0) {
      await applyContacts(cachedContacts.data);
      return;
    }

    setLoadingContacts(true);
    try {
      const res = await api.get('/contacts', {
        params: { limit: 150, skip_counts: 1, all_pipeline: 1, mode: 'lookup' },
        signal: ctrlSignal(abortController)
      });
      if (abortController.signal.aborted) return;
      const list = extractArray(res?.data, 'contacts');
      cachedContacts = { data: list, timestamp: Date.now(), key: contactsCacheKey };
      await applyContacts(list);
    } catch (err: any) {
      if (isAbortError(err)) return;
      console.error('Lỗi tải danh sách contacts:', err);
      if (activeContactId) {
        try {
          const singleRes = await api.get(`/contacts/${activeContactId}`, { signal: abortController.signal });
          if (abortController.signal.aborted) return;
          const cObj = singleRes.data?.data || singleRes.data;
          if (cObj && cObj.id) {
            setContacts([cObj]);
          }
        } catch {}
      }
      if (!abortController.signal.aborted) setLoadingContacts(false);
    }
  }, [authScopeKey]);

  const handleContactsSearch = useCallback(async (rawQuery: string) => {
    const q = rawQuery.trim();
    if (!q) {
      if (contactSearchAbortRef.current) contactSearchAbortRef.current.abort();
      setSearchingContacts(false);
      if (lastRemoteContactQueryRef.current !== '') {
        lastRemoteContactQueryRef.current = '';
        setContacts(prev => prev.map(c => (c?._matchedQuery ? { ...c, _matchedQuery: undefined } : c)));
      } else if (contactsRef.current.length <= 1) {
        fetchContactsList(null, true);
      }
      return;
    }

    if (q.length < 2) return;

    if (contactSearchAbortRef.current) contactSearchAbortRef.current.abort();
    const abortController = new AbortController();
    contactSearchAbortRef.current = abortController;
    lastRemoteContactQueryRef.current = q;
    setSearchingContacts(true);

    try {
      const res = await api.get('/contacts', {
        params: { search: q, limit: 50, skip_counts: 1, all_pipeline: 1, mode: 'lookup' },
        signal: abortController.signal
      });
      if (abortController.signal.aborted) return;

      const fetched = extractArray(res?.data, 'contacts').map((c: any) => ({ ...c, _matchedQuery: q }));
      setContacts(prev => {
        const mergedMap = new Map<number, any>();
        fetched.forEach((c: any) => {
          if (c?.id) mergedMap.set(Number(c.id), c);
        });
        const currentFd = formDataRef.current;
        const currentMeta = erpMetaRef.current;
        const pinnedIds = new Set<number>([
          ...(currentFd?.contact_id ? [Number(currentFd.contact_id)] : []),
          ...(currentFd?.related_type === 'contact' && currentFd?.related_id ? [Number(currentFd.related_id)] : []),
          ...ensureArray(currentMeta?.related_contact_ids).map(Number)
        ].filter(Boolean));

        let nonPinnedKept = 0;
        prev.forEach((c: any) => {
          const cid = Number(c?.id || 0);
          if (!cid || mergedMap.has(cid)) return;
          if (!pinnedIds.has(cid) && nonPinnedKept >= 150) return;
          if (!pinnedIds.has(cid)) nonPinnedKept++;
          mergedMap.set(cid, c?._matchedQuery ? { ...c, _matchedQuery: undefined } : c);
        });
        return Array.from(mergedMap.values());
      });
    } catch (err: any) {
      if (isAbortError(err)) return;
      console.error('Lỗi tìm kiếm khách hàng:', err);
    } finally {
      if (!abortController.signal.aborted && contactSearchAbortRef.current === abortController) {
        setSearchingContacts(false);
      }
    }
  }, [fetchContactsList]);

  const ctrlSignal = (c: AbortController) => c.signal;

  useEffect(() => {
    if (!isOpen) {
      prevTaskIdRef.current = null;
      prevNewTaskObjRef.current = null;
      duplicatedFromRef.current = null;
      if (contactsAbortRef.current) contactsAbortRef.current.abort();
      if (contactSearchAbortRef.current) contactSearchAbortRef.current.abort();
      lastRemoteContactQueryRef.current = '';
      setSearchingContacts(false);
      if (commentsAbortRef.current) commentsAbortRef.current.abort();
      if (timelineAbortRef.current) timelineAbortRef.current.abort();
      if (subtaskCommentsAbortRef.current) subtaskCommentsAbortRef.current.abort();
      if (metaStatusAbortRef.current) metaStatusAbortRef.current.abort();
      if (pollAbortRef.current) pollAbortRef.current.abort();
      if (dependenciesAbortRef.current) dependenciesAbortRef.current.abort();
      if (depCandidatesAbortRef.current) depCandidatesAbortRef.current.abort();
      if (whiteboardAbortRef.current) whiteboardAbortRef.current.abort();
      if (whiteboardSnapshotsAbortRef.current) whiteboardSnapshotsAbortRef.current.abort();
      return;
    }
    const hasCust = Boolean(
      task?.contact_id ||
      (task?.related_type === 'contact' && task?.related_id) ||
      isFromCustomerDrawer ||
      task?.from_customer_drawer
    );
    if (hasCust || isCustomerLinked) {
      fetchContactsList();
    }
  }, [isOpen, task?.id, task?.contact_id, task?.related_id, isFromCustomerDrawer, isCustomerLinked, fetchContactsList]);

  const loadComments = useCallback(async (taskId: number) => {
    if (!taskId) return;
    if (commentsAbortRef.current) commentsAbortRef.current.abort();
    const abortController = new AbortController();
    commentsAbortRef.current = abortController;
    setLoadingComments(true);
    try {
      const res = await api.get(`/activities/${taskId}/comments`, { signal: abortController.signal });
      if (abortController.signal.aborted || String(activeTaskIdRef.current) !== String(taskId)) return;
      if (res.data) {
        setComments(extractArray(res.data));
      }
    } catch (e: any) {
      if (isAbortError(e)) return;
      console.error(e);
    } finally {
      if (!abortController.signal.aborted) setLoadingComments(false);
    }
  }, []);

  const loadTimeline = useCallback(async (taskId: number) => {
    if (!taskId) return;
    if (timelineAbortRef.current) timelineAbortRef.current.abort();
    const abortController = new AbortController();
    timelineAbortRef.current = abortController;
    setLoadingTimeline(true);
    try {
      const res = await api.get(`/activities/${taskId}/timeline`, { signal: abortController.signal });
      if (abortController.signal.aborted || String(activeTaskIdRef.current) !== String(taskId)) return;
      if (res.data) {
        const list = extractArray(res.data);
        const sortedList = [...list].sort((a, b) => {
          const timeA = safeParseDateMs(a?.created_at);
          const timeB = safeParseDateMs(b?.created_at);
          return (timeB - timeA) || (Number(b?.id || 0) - Number(a?.id || 0));
        });
        setTimeline(sortedList);
      }
    } catch (e: any) {
      if (isAbortError(e)) return;
      console.error(e);
    } finally {
      if (!abortController.signal.aborted) setLoadingTimeline(false);
    }
  }, []);

  const handleDeleteComment = async (commentId: number) => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || isNewRef.current || tid === 'new') return;
    if (deleteCommentInFlightRef.current) return;
    deleteCommentInFlightRef.current = true;
    try {
      const res = await api.delete(`/activities/comments/${commentId}`);
      if (String(activeTaskIdRef.current) !== String(tid)) return;
      if (res.data && (res.data.success || res.status === 200)) {
        await loadComments(Number(tid));
        if (activeTabRef.current === 'timeline') await loadTimeline(Number(tid));
        if (onUpdate) onUpdate({ ...task, ...formDataRef.current, id: tid, comment_count: Math.max(0, Number(formDataRef.current?.comment_count || task?.comment_count || 1) - 1) });
        toast.success(t('Đã xóa bình luận'));
      } else {
        toast.error(res.data?.message || t('Không thể xóa bình luận'));
      }
    } catch (e: any) {
      if (!isAbortError(e)) toast.error(t('Lỗi khi xóa bình luận: ') + e.message);
    } finally {
      deleteCommentInFlightRef.current = false;
    }
  };

  // Lazy-load timeline only when user switches to 'timeline' tab
  useEffect(() => {
    if (isOpen && activeTab === 'timeline' && !isNew && activeTaskId && activeTaskId !== 'new') {
      loadTimeline(Number(activeTaskId));
    }
  }, [isOpen, activeTab, isNew, activeTaskId, loadTimeline]);

  // Dependencies Loader
  const loadDependencies = useCallback(async (taskId: number) => {
    if (!taskId) return;
    if (dependenciesAbortRef.current) dependenciesAbortRef.current.abort();
    const ctrl = new AbortController();
    dependenciesAbortRef.current = ctrl;
    setLoadingDependencies(true);
    try {
      const res = await api.get(`/activities/${taskId}/dependencies`, { signal: ctrl.signal });
      if (ctrl.signal.aborted || String(activeTaskIdRef.current) !== String(taskId)) return;
      const list = extractArray(res?.data, 'dependencies').map((d: any) => ({
        predecessor_id: Number(d.predecessor_id),
        subject: d.subject || '',
        start_date: d.start_date || null,
        due_date: d.due_date || null,
        dependency_type: (['FS', 'SS', 'FF', 'SF'].includes(String(d.dependency_type || '').toUpperCase())
          ? String(d.dependency_type).toUpperCase()
          : 'FS') as 'FS' | 'SS' | 'FF' | 'SF',
        lag_days: Number(d.lag_days) || 0
      }));
      setDependencies(list);
    } catch (err: any) {
      if (!isAbortError(err)) console.error('Load dependencies error:', err);
    } finally {
      if (!ctrl.signal.aborted) setLoadingDependencies(false);
    }
  }, []);

  const loadDependencyCandidates = useCallback(async (projectIdVal?: number | string | null) => {
    if (depCandidatesAbortRef.current) depCandidatesAbortRef.current.abort();
    const ctrl = new AbortController();
    depCandidatesAbortRef.current = ctrl;
    setLoadingDependencyCandidates(true);
    try {
      const url = projectIdVal
        ? `/activities?type=task&related_type=project&related_id=${projectIdVal}&limit=200&minimal=1`
        : '/activities?type=task&limit=100&minimal=1';
      const res = await api.get(url, { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setDependencyCandidates(extractArray(res?.data, 'activities'));
    } catch (err: any) {
      if (!isAbortError(err)) console.error('Load candidate tasks error:', err);
    } finally {
      if (!ctrl.signal.aborted) setLoadingDependencyCandidates(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && activeTab === 'dependencies' && !isNew && activeTaskId && activeTaskId !== 'new') {
      const tid = Number(activeTaskId);
      const projId = erpMetaRef.current?.project_id || (formDataRef.current?.related_type === 'project' ? formDataRef.current?.related_id : null);
      loadDependencies(tid);
      loadDependencyCandidates(projId);
    }
  }, [isOpen, activeTab, isNew, activeTaskId, loadDependencies, loadDependencyCandidates]);

  const handleUpdateDependenciesList = useCallback(async (nextList: Array<{ predecessor_id: number; dependency_type: 'FS' | 'SS' | 'FF' | 'SF'; lag_days: number }>, successMsg: string) => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || isNewRef.current || tid === 'new' || dependenciesInFlightRef.current) return;
    dependenciesInFlightRef.current = true;
    setSavingDependencies(true);
    try {
      const payload = {
        predecessors: nextList.map(d => ({
          predecessor_id: Number(d.predecessor_id),
          dependency_type: d.dependency_type || 'FS',
          lag_days: Number(d.lag_days) || 0
        }))
      };
      const res = await api.post(`/activities/${tid}/dependencies`, payload);
      if (String(activeTaskIdRef.current) !== String(tid)) return;
      if (res.data?.success !== false) {
        toast.success(successMsg);
        await loadDependencies(Number(tid));
        if (activeTabRef.current === 'timeline') loadTimeline(Number(tid));
      } else {
        toast.error(res.data?.message || t('Không thể cập nhật phụ thuộc'));
      }
    } catch (err: any) {
      if (!isAbortError(err)) {
        toast.error(err.response?.data?.message || t('Lỗi cập nhật quan hệ phụ thuộc'));
      }
    } finally {
      dependenciesInFlightRef.current = false;
      setSavingDependencies(false);
    }
  }, [isReadOnly, loadDependencies, loadTimeline, t]);

  const handleAddDependency = useCallback(async (predId: number, depType: 'FS' | 'SS' | 'FF' | 'SF', lagDaysVal: number) => {
    const merged = [
      ...dependencies.map(d => ({ predecessor_id: d.predecessor_id, dependency_type: d.dependency_type, lag_days: d.lag_days })),
      { predecessor_id: predId, dependency_type: depType, lag_days: lagDaysVal }
    ];
    await handleUpdateDependenciesList(merged, t('Đã thêm công việc phụ thuộc'));
  }, [dependencies, handleUpdateDependenciesList, t]);

  const handleRemoveDependency = useCallback(async (predId: number) => {
    // Backend uses POST /activities/${id}/dependencies to replace full predecessors list (no DELETE route)
    const remaining = dependencies
      .filter(d => Number(d.predecessor_id) !== Number(predId))
      .map(d => ({ predecessor_id: d.predecessor_id, dependency_type: d.dependency_type, lag_days: d.lag_days }));
    await handleUpdateDependenciesList(remaining, t('Đã gỡ bỏ công việc phụ thuộc'));
  }, [dependencies, handleUpdateDependenciesList, t]);

  // Whiteboard Loader & Actions
  const loadWhiteboardSnapshots = useCallback(async (taskId: number) => {
    if (!taskId) return;
    if (whiteboardSnapshotsAbortRef.current) whiteboardSnapshotsAbortRef.current.abort();
    const ctrl = new AbortController();
    whiteboardSnapshotsAbortRef.current = ctrl;
    setLoadingWhiteboardSnapshots(true);
    try {
      const res = await api.get(`/activities/${taskId}/whiteboard/snapshots`, { signal: ctrl.signal });
      if (ctrl.signal.aborted || String(activeTaskIdRef.current) !== String(taskId)) return;
      setWhiteboardSnapshots(extractArray(res?.data));
    } catch (err: any) {
      if (!isAbortError(err)) console.error('Load snapshots error:', err);
    } finally {
      if (!ctrl.signal.aborted) setLoadingWhiteboardSnapshots(false);
    }
  }, []);

  const loadWhiteboard = useCallback(async (taskId: number) => {
    if (!taskId) return;
    if (whiteboardAbortRef.current) whiteboardAbortRef.current.abort();
    const ctrl = new AbortController();
    whiteboardAbortRef.current = ctrl;
    setWhiteboardLoading(true);
    try {
      const res = await api.get(`/activities/${taskId}/whiteboard`, { signal: ctrl.signal });
      if (ctrl.signal.aborted || String(activeTaskIdRef.current) !== String(taskId)) return;
      const wb = res.data?.data || res.data || {};
      const parsedCanvas = parseWhiteboardCanvasData(wb.canvas_data);
      setWhiteboardCanvas(parsedCanvas);
      setWhiteboardVersion(Number(wb.version) || 0);
      setWhiteboardTitle(wb.title || 'Bản vẽ sơ đồ');
      setWhiteboardCanEdit(wb.can_edit !== undefined ? Boolean(wb.can_edit) : !isReadOnly);
      setWhiteboardEditedBy({
        name: wb.last_edited_by_name || null,
        avatar: wb.last_edited_by_avatar || null,
        updatedAt: wb.updated_at || null
      });
      setWhiteboardDirty(false);
    } catch (err: any) {
      if (!isAbortError(err)) console.error('Load whiteboard error:', err);
    } finally {
      if (!ctrl.signal.aborted) setWhiteboardLoading(false);
    }
  }, [isReadOnly]);

  useEffect(() => {
    if (isOpen && activeTab === 'whiteboard' && !isNew && activeTaskId && activeTaskId !== 'new') {
      const tid = Number(activeTaskId);
      loadWhiteboard(tid);
      loadWhiteboardSnapshots(tid);
    }
  }, [isOpen, activeTab, isNew, activeTaskId, loadWhiteboard, loadWhiteboardSnapshots]);

  const handleSaveWhiteboard = useCallback(async () => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || isNewRef.current || tid === 'new' || whiteboardInFlightRef.current) return;
    whiteboardInFlightRef.current = true;
    setWhiteboardSaving(true);
    try {
      const res = await api.put(`/activities/${tid}/whiteboard`, {
        title: whiteboardTitle || 'Bản vẽ sơ đồ',
        canvas_data: whiteboardCanvas,
        version: whiteboardVersion,
        node_count: whiteboardCanvas.nodes.length
      });
      if (String(activeTaskIdRef.current) !== String(tid)) return;
      const saved = res.data?.data || res.data || {};
      if (saved.version !== undefined) setWhiteboardVersion(Number(saved.version));
      setWhiteboardEditedBy({
        name: (currentUser as any)?.full_name || currentUser?.name || null,
        avatar: (currentUser as any)?.avatar_url || currentUser?.avatar || null,
        updatedAt: saved.updated_at || getLocalDateTimeStr()
      });
      setWhiteboardDirty(false);
      toast.success(res.data?.message || t('Đã lưu bảng vẽ'));
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(err.response?.data?.message || t('Bảng vẽ đã bị thay đổi ở phiên khác. Đang tải lại bản mới nhất...'));
        await loadWhiteboard(Number(tid));
      } else if (!isAbortError(err)) {
        toast.error(err.response?.data?.message || t('Lỗi lưu bảng vẽ'));
      }
    } finally {
      whiteboardInFlightRef.current = false;
      setWhiteboardSaving(false);
    }
  }, [isReadOnly, whiteboardTitle, whiteboardCanvas, whiteboardVersion, currentUser, loadWhiteboard, t]);

  const handleCreateWhiteboardSnapshot = useCallback(async (snapshotName: string) => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || isNewRef.current || tid === 'new' || whiteboardInFlightRef.current) return;
    whiteboardInFlightRef.current = true;
    setWhiteboardSaving(true);
    try {
      const cleanSnapName = snapshotName || `Cột mốc ${formatDateTimeVN(new Date())}`;
      if (whiteboardVersion === 0) {
        // Whiteboard row must exist before creating standalone snapshot
        const saveRes = await api.post(`/activities/${tid}/whiteboard`, {
          title: whiteboardTitle || 'Bản vẽ sơ đồ',
          canvas_data: whiteboardCanvas,
          version: 0,
          node_count: whiteboardCanvas.nodes.length,
          create_snapshot: true,
          snapshot_name: cleanSnapName
        });
        if (String(activeTaskIdRef.current) !== String(tid)) return;
        const saved = saveRes.data?.data || {};
        if (saved.version !== undefined) setWhiteboardVersion(Number(saved.version));
        setWhiteboardDirty(false);
      } else {
        await api.post(`/activities/${tid}/whiteboard/snapshots`, {
          snapshot_name: cleanSnapName,
          canvas_data: whiteboardCanvas
        });
      }
      if (String(activeTaskIdRef.current) !== String(tid)) return;
      toast.success(t('Đã tạo cột mốc lưu trữ bảng vẽ'));
      await loadWhiteboardSnapshots(Number(tid));
    } catch (err: any) {
      if (err?.response?.status === 409) {
        toast.error(err.response?.data?.message || t('Xung đột phiên bản bảng vẽ. Đang tải lại...'));
        await loadWhiteboard(Number(tid));
      } else if (!isAbortError(err)) {
        toast.error(err.response?.data?.message || t('Lỗi tạo cột mốc bảng vẽ'));
      }
    } finally {
      whiteboardInFlightRef.current = false;
      setWhiteboardSaving(false);
    }
  }, [isReadOnly, whiteboardVersion, whiteboardTitle, whiteboardCanvas, loadWhiteboardSnapshots, loadWhiteboard, t]);

  const handleRestoreWhiteboardSnapshot = useCallback(async (snapshotId: number) => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || isNewRef.current || tid === 'new' || whiteboardInFlightRef.current) return;
    whiteboardInFlightRef.current = true;
    setWhiteboardSaving(true);
    try {
      const res = await api.post(`/activities/${tid}/whiteboard/restore`, { snapshot_id: snapshotId });
      if (String(activeTaskIdRef.current) !== String(tid)) return;
      toast.success(res.data?.message || t('Đã khôi phục cột mốc bảng vẽ'));
      await Promise.all([loadWhiteboard(Number(tid)), loadWhiteboardSnapshots(Number(tid))]);
    } catch (err: any) {
      if (!isAbortError(err)) {
        toast.error(err.response?.data?.message || t('Lỗi khôi phục cột mốc bảng vẽ'));
      }
    } finally {
      whiteboardInFlightRef.current = false;
      setWhiteboardSaving(false);
    }
  }, [isReadOnly, loadWhiteboard, loadWhiteboardSnapshots, t]);

  const loadSubtaskComments = useCallback(async (taskId: number, subtaskId: string) => {
    if (subtaskCommentsAbortRef.current) subtaskCommentsAbortRef.current.abort();
    const abortController = new AbortController();
    subtaskCommentsAbortRef.current = abortController;
    setLoadingSubtaskComments(true);
    try {
      const res = await api.get(`/activities/${taskId}/comments?subtask_id=${encodeURIComponent(subtaskId)}`, { signal: abortController.signal });
      if (abortController.signal.aborted || String(activeTaskIdRef.current) !== String(taskId)) return;
      if (res.data && res.data.success !== false) {
        setSubtaskComments(extractArray(res.data));
      }
    } catch (e: any) {
      if (isAbortError(e)) return;
      console.error(e);
    } finally {
      if (!abortController.signal.aborted) setLoadingSubtaskComments(false);
    }
  }, []);

  useEffect(() => {
    if (activeTaskId && !isNew && activeTaskId !== 'new' && selectedSubtask?.id) {
      loadSubtaskComments(Number(activeTaskId), String(selectedSubtask.id));
    }
    return () => {
      if (subtaskCommentsAbortRef.current) subtaskCommentsAbortRef.current.abort();
    };
  }, [selectedSubtask, activeTaskId, isNew, loadSubtaskComments]);

  const lastHighlightedCommentRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen) {
      lastHighlightedCommentRef.current = '';
      return;
    }
    if (task && Array.isArray(erpMeta?.checklist)) {
      const urlParams = new URLSearchParams(window.location.search);
      const targetSubtaskId = searchParams.get('subtask_id') || urlParams.get('subtask_id') || task?.subtaskId;
      if (targetSubtaskId) {
        const found = erpMeta.checklist.find((item: any) => String(item.id) === String(targetSubtaskId));
        if (found) {
          setSelectedSubtask(found);
        }
      }
    }
  }, [isOpen, task, erpMeta?.checklist, searchParams]);

  // Auto-scroll and pulse highlight main task comment from notification
  useEffect(() => {
    if (!isOpen || comments.length === 0) return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetSubtaskId = searchParams.get('subtask_id') || urlParams.get('subtask_id') || task?.subtaskId;
    const highlightCommentId =
      searchParams.get('highlight_comment_id') ||
      searchParams.get('comment_id') ||
      urlParams.get('highlight_comment_id') ||
      urlParams.get('comment_id') ||
      task?.highlightCommentId;

    if (highlightCommentId && !targetSubtaskId) {
      const highlightKey = `main-${activeTaskIdRef.current}-${highlightCommentId}`;
      if (lastHighlightedCommentRef.current === highlightKey) return;
      setActiveTab('comments');

      // Ensure the page containing the highlighted comment is visible
      const rootComments = comments.filter((c: any) => !c.parent_id);
      const targetComment = comments.find((c: any) => String(c.id) === String(highlightCommentId));
      const rootId = targetComment?.parent_id ? targetComment.parent_id : targetComment?.id;
      const rootIndex = rootId ? rootComments.findIndex((c: any) => String(c.id) === String(rootId)) : -1;
      if (rootIndex >= 0) {
        const targetPage = Math.floor(rootIndex / COMMENTS_PAGE_SIZE) + 1;
        setCommentsPage(targetPage);
      }

      const timer = registerTimer(() => {
        const element =
          document.getElementById(`workspace-comment-${highlightCommentId}`) ||
          document.getElementById(`task-comment-${highlightCommentId}`) ||
          document.getElementById(`comment-${highlightCommentId}`);
        if (element) {
          lastHighlightedCommentRef.current = highlightKey;
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('comment-highlight-pulse');
          const prevBg = element.style.backgroundColor;
          element.style.backgroundColor = '#fef08a';
          registerTimer(() => {
            element.classList.remove('comment-highlight-pulse');
            element.style.backgroundColor = prevBg || '';
          }, 3000);
        }
      }, 300);
      return () => {
        window.clearTimeout(timer);
        timersRef.current.delete(timer);
      };
    }
  }, [isOpen, comments, searchParams, task?.id, task?.highlightCommentId, task?.subtaskId, registerTimer]);

  // Auto-scroll and pulse highlight subtask comment from notification
  useEffect(() => {
    if (!isOpen || subtaskComments.length === 0) return;
    const urlParams = new URLSearchParams(window.location.search);
    const targetSubtaskId = searchParams.get('subtask_id') || urlParams.get('subtask_id') || task?.subtaskId;
    const highlightCommentId =
      searchParams.get('highlight_comment_id') ||
      searchParams.get('comment_id') ||
      urlParams.get('highlight_comment_id') ||
      urlParams.get('comment_id') ||
      task?.highlightCommentId;

    if (targetSubtaskId && highlightCommentId) {
      const highlightKey = `sub-${targetSubtaskId}-${highlightCommentId}`;
      if (lastHighlightedCommentRef.current === highlightKey) return;
      const timer = registerTimer(() => {
        const element =
          document.getElementById(`workspace-comment-${highlightCommentId}`) ||
          document.getElementById(`task-comment-${highlightCommentId}`) ||
          document.getElementById(`comment-${highlightCommentId}`);
        if (element) {
          lastHighlightedCommentRef.current = highlightKey;
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('comment-highlight-pulse');
          const prevBg = element.style.backgroundColor;
          element.style.backgroundColor = '#fef08a';
          registerTimer(() => {
            element.classList.remove('comment-highlight-pulse');
            element.style.backgroundColor = prevBg || '';
          }, 3000);
        }
      }, 400);
      return () => {
        window.clearTimeout(timer);
        timersRef.current.delete(timer);
      };
    }
  }, [isOpen, subtaskComments, searchParams, task?.highlightCommentId, task?.subtaskId, registerTimer]);

  // Single deduplicated ref-counted body scroll lock
  useEffect(() => {
    if (isOpen && task && !embedMode) {
      setIsClosing(false);
      lockDrawerBodyScroll();
      return () => {
        unlockDrawerBodyScroll();
      };
    } else {
      setIsClosing(false);
    }
  }, [isOpen, task, embedMode]);

  // Task Hydration & Reset Effect
  useEffect(() => {
    if (!isOpen && !embedMode) {
      prevTaskIdRef.current = null;
      prevNewTaskObjRef.current = null;
      duplicatedFromRef.current = null;
      return;
    }
    if (!task) return;

    const incomingIdStr = String(task?.id ?? '');
    const dupState = duplicatedFromRef.current;
    if (dupState && incomingIdStr === dupState.sourceId && String(activeTaskIdRef.current) === dupState.newId) {
      // Parent hasn't switched `task` prop to duplicated ID yet; do NOT revert back to source task
      return;
    }
    if (dupState && incomingIdStr === dupState.newId) {
      duplicatedFromRef.current = null;
    }

    const isTaskNew = task.id === 'new' || !task.id || task.id === 0 || task.id === '0';
    const isSameTaskEarly = isTaskNew
      ? (prevTaskIdRef.current === 'new' && prevNewTaskObjRef.current === task)
      : (prevTaskIdRef.current !== null && String(prevTaskIdRef.current) === incomingIdStr);
    const wasLoadingPlaceholder = !formDataRef.current?.id || formDataRef.current?.subject === 'Đang tải công việc...';

    if (isSameTaskEarly && (isClonedDraft || !wasLoadingPlaceholder)) {
      return;
    }

    if (!isSameTaskEarly) {
      resetSaveQueueForTaskChange();
      setIsClonedDraft(false);
      isNewRef.current = isTaskNew;
      setActiveTab('comments');
      setTimelinePage(1);
      setCommentsPage(1);
      setSelectedSubtask(null);
      setEditingChecklistId(null);
      setChecklistSearch('');
      setChecklistFilter('all');
      setHideCompletedChecklist(false);
      setDependencies([]);
      setDependencyCandidates([]);
      setWhiteboardCanvas(EMPTY_WHITEBOARD_CANVAS);
      setWhiteboardVersion(0);
      setWhiteboardDirty(false);
      setWhiteboardSnapshots([]);
      setActiveAssigneeDropdownId(null);
      setShowTeamDropdown(false);
      setShowParticipantDropdown(false);
      setShowAddChecklist(false);
      setShowAddLink(false);
      revokeAttachmentPreviewList(commentAttachmentsRef.current);
      revokeAttachmentPreviewList(subtaskAttachmentsRef.current);
      setCommentAttachments([]);
      setSubtaskCommentAttachments([]);
      setReplyTo(null);
      setNewCommentText('');
      setNewSubtaskCommentText('');
    }

    const propId = task?.proposalId || task?.proposal_id || task?.__proposalId || null;
    setScopedProposalId(propId ? String(propId) : null);

    const isSaleRole = ['sale', 'sales'].includes(String(currentUser?.role || '').toLowerCase());
    const defaultUserId = task.user_id || (isSaleRole ? currentUser?.id : null);
    let initialDueDate = task.due_date || null;
    if (initialDueDate && String(initialDueDate).length === 10) {
      initialDueDate = `${initialDueDate} ${normalizedDefaultDueTime}`;
    }
    const rawParticipants = task.participant_ids || task.collaborator_ids || task.related_user_ids || '';
    const normalizedParticipants = Array.isArray(rawParticipants) ? rawParticipants.join(',') : String(rawParticipants || '');
    const creatorIdNum = isTaskNew ? Number(currentUser?.id || task.created_by || 0) : Number(task.created_by || 0);
    const isCreatorSelf = isTaskNew || (creatorIdNum > 0 && creatorIdNum === Number(currentUser?.id || 0) && !task.created_by_name);
    const matchedCreatorUser = creatorIdNum > 0 ? users.find(u => Number(u.id) === creatorIdNum) : null;
    const resolvedCreatorName = isTaskNew
      ? (currentUser?.name || (currentUser as any)?.full_name || task.created_by_name || '')
      : (task.created_by_name || matchedCreatorUser?.full_name || matchedCreatorUser?.name || (isCreatorSelf ? (currentUser?.name || (currentUser as any)?.full_name || '') : ''));
    const resolvedCreatorAvatar = isTaskNew
      ? (currentUser?.avatar || (currentUser as any)?.avatar_url || task.created_by_avatar || '')
      : (task.created_by_avatar || matchedCreatorUser?.avatar_url || matchedCreatorUser?.avatar || (isCreatorSelf ? (currentUser?.avatar || (currentUser as any)?.avatar_url || '') : ''));

    const normalizedTask: any = {
      ...task,
      id: isTaskNew ? 'new' : task.id,
      due_date: initialDueDate,
      subject: task.subject || task.title || '',
      body: task.body || task.description || '',
      user_id: defaultUserId ? Number(defaultUserId) : null,
      participant_ids: normalizedParticipants,
      team_id: task.team_id ? Number(task.team_id) : undefined,
      created_by: isTaskNew ? (currentUser?.id || task.created_by) : (task.created_by || null),
      created_by_name: resolvedCreatorName,
      created_by_avatar: resolvedCreatorAvatar,
      contact_id: task.contact_id || (task.related_type === 'contact' ? task.related_id : null)
    };

    const parsedBody = parseTaskBody(normalizedTask.body);
    const safeChecklist = ensureArray(parsedBody.checklist).map((item: any) => ({
      ...item,
      done: isSubtaskDone(item),
      checked: isSubtaskDone(item)
    }));
    const safeLinks = ensureArray(parsedBody.links);
    const checklistTotal = safeChecklist.length;
    const checklistDone = safeChecklist.filter(isSubtaskDone).length;
    if (checklistTotal > 0) {
      const autoProgress = Math.round((checklistDone / checklistTotal) * 100);
      normalizedTask.progress = autoProgress;
      if (checklistDone === checklistTotal && normalizedTask.status !== 'done' && Number(normalizedTask.require_approval || 0) !== 1) {
        normalizedTask.status = 'done';
      }
    }

    formDataRef.current = normalizedTask;
    setFormData(normalizedTask);
    setIsPinned(hasExactTag(normalizedTask.tags, 'pinned'));
    lastSyncedApprovalRef.current = {
      progress: Number(normalizedTask.progress || 0),
      approval_status: normalizedTask.approval_status || null
    };

    const cleanDescHtml = sanitizeHtml(linkifyHtml(convertTextToHtmlParagraphs(parsedBody.description)));
    const rawRec = parsedBody.recurrence || {};
    const parsedMeta: any = {
      description: cleanDescHtml,
      internal_type: parsedBody.internal_type || 'task',
      scope: parsedBody.scope || 'team',
      recurrence: {
        pattern: rawRec.pattern || 'none',
        weekly_days: ensureArray(rawRec.weekly_days),
        monthly_day: Number(rawRec.monthly_day) || 1,
        days_interval: Number(rawRec.days_interval) || 3,
        last_generated: rawRec.last_generated || ''
      },
      checklist: safeChecklist,
      links: safeLinks,
      project_id: normalizedTask.related_type === 'project' ? normalizedTask.related_id : (parsedBody.project_id || String(task.project_id || '') || null),
      campaign_id: normalizedTask.related_type === 'campaign' ? normalizedTask.related_id : (parsedBody.campaign_id || String(task.campaign_id || '') || null),
      team_id: normalizedTask.related_type === 'team' ? normalizedTask.related_id : (parsedBody.team_id || String(task.team_id || '') || null),
      team_ids: ensureArray(parsedBody.rawMeta?.team_ids, parsedBody.team_id ? [parsedBody.team_id] : (normalizedTask.related_type === 'team' && normalizedTask.related_id ? [normalizedTask.related_id] : [])),
      due_sla_notified: parsedBody.due_sla_notified || Boolean(task.due_sla_notified),
      subtask_sla_notified: parsedBody.subtask_sla_notified || Boolean(task.subtask_sla_notified),
      related_contact_ids: ensureArray(
        parsedBody.rawMeta?.related_contact_ids ?? (parsedBody as any).related_contact_ids
      ).map(Number).filter(n => n > 0)
    };

    if (normalizedTask.related_type === 'project' && normalizedTask.related_id) {
      parsedMeta.project_id = normalizedTask.related_id;
    }
    if (normalizedTask.related_type === 'campaign' && normalizedTask.related_id) {
      parsedMeta.campaign_id = normalizedTask.related_id;
    }
    if (normalizedTask.related_type === 'team' && normalizedTask.related_id) {
      parsedMeta.team_id = normalizedTask.related_id;
    }

    erpMetaRef.current = parsedMeta;
    setErpMeta(parsedMeta);
    lastSyncedDescRef.current = cleanDescHtml;
    isDescDirtyRef.current = false;
    deletedSubtaskIdsRef.current = [];
    lastSyncedUpdatedAtRef.current = String(task.updated_at || '');

    const hasInitialCustomer = Boolean(
      normalizedTask.contact_id ||
      (normalizedTask.related_type === 'contact' && normalizedTask.related_id) ||
      parsedMeta.related_contact_ids.length > 0 ||
      isFromCustomerDrawer ||
      task?.from_customer_drawer
    );

    const isSameId = prevTaskIdRef.current !== null && String(prevTaskIdRef.current) === (isTaskNew ? 'new' : incomingIdStr);
    if (!isSameId || (isTaskNew && prevNewTaskObjRef.current !== task)) {
      setIsCustomerLinked(hasInitialCustomer);
      prevTaskIdRef.current = isTaskNew ? 'new' : task.id;
      prevNewTaskObjRef.current = isTaskNew ? task : null;
    } else if (hasInitialCustomer) {
      setIsCustomerLinked(true);
    }

    if (hasInitialCustomer && !isSameId) {
      fetchContactsList(normalizedTask.contact_id || (normalizedTask.related_type === 'contact' ? normalizedTask.related_id : null));
    }

    setChecklistPage(1);
    if (normalizedTask.id !== 'new') {
      if (!isSameId || wasLoadingPlaceholder) {
        loadComments(Number(normalizedTask.id));
      }
    } else {
      setComments([]);
      setTimeline([]);
    }

    setOriginalHash(computeCleanHash(normalizedTask, parsedMeta));
  }, [task, isFromCustomerDrawer, isOpen, embedMode, currentUser, users, isClonedDraft, resetSaveQueueForTaskChange, revokeAttachmentPreviewList, fetchContactsList, loadComments, computeCleanHash]);

  // Late creator name/avatar hydration when `users` resolves after task mount
  useEffect(() => {
    if (!isOpen || users.length === 0 || !formData?.created_by || formData?.created_by_name) return;
    const matched = users.find(u => Number(u.id) === Number(formData.created_by));
    if (matched) {
      setFormData((prev: any) => {
        if (!prev || prev.created_by_name) return prev;
        const next = {
          ...prev,
          created_by_name: matched.full_name || matched.name || '',
          created_by_avatar: matched.avatar_url || matched.avatar || prev.created_by_avatar || ''
        };
        formDataRef.current = next;
        return next;
      });
    }
  }, [isOpen, users, formData?.created_by, formData?.created_by_name]);

  // Live merge helper for both PUT responses and real-time multi-user polling
  const applyLiveServerTask = useCallback((serverTask: any, options?: { fromSave?: boolean }) => {
    if (!serverTask || !serverTask.id) return;
    const currentTid = activeTaskIdRef.current;
    if (!currentTid || currentTid === 'new' || String(currentTid) !== String(serverTask.id)) return;
    if (!options?.fromSave) {
      if (saveMetaInFlightRef.current || manualSaveInFlightRef.current || updateFieldInFlightRef.current || pendingMetaSaveRef.current || Object.keys(pendingFieldUpdatesRef.current).length > 0) {
        return;
      }
    }

    const curForm = formDataRef.current || {};
    const curMeta = erpMetaRef.current || {};
    const serverUpdatedAt = String(serverTask.updated_at || '');
    const prevCommentCount = Number(curForm.comment_count || 0);
    const nextCommentCount = Number(serverTask.comment_count ?? prevCommentCount);

    // Fast-path early exit BEFORE heavy parseTaskBody/DOMParser when server timestamp & comment count haven't changed
    if (!options?.fromSave && serverUpdatedAt && serverUpdatedAt === lastSyncedUpdatedAtRef.current && nextCommentCount === prevCommentCount) {
      return;
    }

    const parsedServerBody = parseTaskBody(serverTask.body || '');
    const serverChecklist = ensureArray(parsedServerBody.checklist).map((item: any) => ({
      ...item,
      done: isSubtaskDone(item),
      checked: isSubtaskDone(item)
    }));
    const serverLinks = ensureArray(parsedServerBody.links);
    const serverDescHtml = sanitizeHtml(linkifyHtml(convertTextToHtmlParagraphs(parsedServerBody.description)));

    const checklistChanged = JSON.stringify(serverChecklist) !== JSON.stringify(curMeta.checklist || []);
    const linksChanged = JSON.stringify(serverLinks) !== JSON.stringify(curMeta.links || []);
    const descChanged = !isDescDirtyRef.current && serverDescHtml !== (curMeta.description || '');
    const fieldsChanged =
      String(serverTask.status || '') !== String(curForm.status || '') ||
      Number(serverTask.progress ?? 0) !== Number(curForm.progress ?? 0) ||
      String(serverTask.priority || '') !== String(curForm.priority || '') ||
      String(serverTask.due_date || '') !== String(curForm.due_date || '') ||
      String(serverTask.type || '') !== String(curForm.type || '') ||
      String(serverTask.tags || '') !== String(curForm.tags || '') ||
      String(serverTask.related_type || '') !== String(curForm.related_type || '') ||
      Number(serverTask.related_id || 0) !== Number(curForm.related_id || 0) ||
      Number(serverTask.contact_id || 0) !== Number(curForm.contact_id || 0) ||
      Number(serverTask.user_id || 0) !== Number(curForm.user_id || 0) ||
      String(serverTask.participant_ids || '') !== String(curForm.participant_ids || '') ||
      String(serverTask.approval_status || '') !== String(curForm.approval_status || '') ||
      Number(serverTask.require_approval || 0) !== Number(curForm.require_approval || 0) ||
      Number(serverTask.approver_id || 0) !== Number(curForm.approver_id || 0) ||
      Number(serverTask.task_group_id || 0) !== Number(curForm.task_group_id || 0) ||
      nextCommentCount !== prevCommentCount;

    if (!options?.fromSave && !checklistChanged && !linksChanged && !descChanged && !fieldsChanged && serverUpdatedAt === lastSyncedUpdatedAtRef.current) {
      return;
    }

    const serverTeamIds = ensureArray(
      parsedServerBody.rawMeta?.team_ids,
      serverTask.related_type === 'team' && serverTask.related_id ? [serverTask.related_id] : (parsedServerBody.team_id ? [parsedServerBody.team_id] : undefined)
    );
    const serverRelatedContactIds = ensureArray(
      parsedServerBody.rawMeta?.related_contact_ids ?? (parsedServerBody as any).related_contact_ids
    ).map(Number).filter(n => n > 0);

    const nextMeta = {
      ...curMeta,
      checklist: serverChecklist,
      links: serverLinks,
      internal_type: parsedServerBody.internal_type || curMeta.internal_type,
      scope: parsedServerBody.scope || curMeta.scope,
      project_id: serverTask.related_type === 'project' ? serverTask.related_id : (parsedServerBody.project_id ?? curMeta.project_id),
      campaign_id: serverTask.related_type === 'campaign' ? serverTask.related_id : (parsedServerBody.campaign_id ?? curMeta.campaign_id),
      team_id: serverTask.related_type === 'team' ? serverTask.related_id : (parsedServerBody.team_id ?? curMeta.team_id),
      ...(serverTeamIds !== undefined ? { team_ids: serverTeamIds } : {}),
      ...(parsedServerBody.rawMeta?.related_contact_ids !== undefined ? { related_contact_ids: serverRelatedContactIds } : {}),
      ...(descChanged ? { description: serverDescHtml } : {}),
      ...(parsedServerBody.recurrence ? {
        recurrence: {
          ...parsedServerBody.recurrence,
          weekly_days: ensureArray(parsedServerBody.recurrence.weekly_days)
        }
      } : {})
    };
    if (descChanged) {
      lastSyncedDescRef.current = serverDescHtml;
    }
    erpMetaRef.current = nextMeta;
    setErpMeta(nextMeta);

    setSelectedSubtask((prevSub: any) => {
      if (!prevSub || !prevSub.id) return prevSub;
      const updatedSub = serverChecklist.find((item: any) => String(item.id) === String(prevSub.id));
      return updatedSub ? { ...prevSub, ...updatedSub } : prevSub;
    });

    const isEditingSubject = typeof document !== 'undefined' && document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).value === curForm.subject;
    const nextForm = {
      ...curForm,
      ...(isEditingSubject ? {} : { subject: serverTask.subject || curForm.subject }),
      body: serverTask.body || curForm.body,
      type: serverTask.type ?? curForm.type,
      tags: serverTask.tags !== undefined ? serverTask.tags : curForm.tags,
      status: serverTask.status ?? curForm.status,
      progress: serverTask.progress !== undefined ? Number(serverTask.progress) : curForm.progress,
      priority: serverTask.priority ?? curForm.priority,
      due_date: serverTask.due_date !== undefined ? serverTask.due_date : curForm.due_date,
      related_type: serverTask.related_type !== undefined ? serverTask.related_type : curForm.related_type,
      related_id: serverTask.related_id !== undefined ? serverTask.related_id : curForm.related_id,
      contact_id: serverTask.contact_id !== undefined ? serverTask.contact_id : curForm.contact_id,
      contact_name: serverTask.contact_name !== undefined ? serverTask.contact_name : curForm.contact_name,
      contact_avatar: serverTask.contact_avatar !== undefined ? serverTask.contact_avatar : curForm.contact_avatar,
      user_id: serverTask.user_id ? Number(serverTask.user_id) : null,
      user_name: serverTask.user_name ?? curForm.user_name,
      participant_ids: serverTask.participant_ids !== undefined ? String(serverTask.participant_ids || '') : curForm.participant_ids,
      require_approval: serverTask.require_approval !== undefined ? Number(serverTask.require_approval) : curForm.require_approval,
      approver_id: serverTask.approver_id ? Number(serverTask.approver_id) : null,
      approval_status: serverTask.approval_status !== undefined ? serverTask.approval_status : curForm.approval_status,
      task_group_id: serverTask.task_group_id ? Number(serverTask.task_group_id) : null,
      task_group_name: serverTask.task_group_name ?? curForm.task_group_name,
      task_group_color: serverTask.task_group_color ?? curForm.task_group_color,
      task_group_icon: serverTask.task_group_icon ?? curForm.task_group_icon,
      is_archived: serverTask.is_archived !== undefined ? Number(serverTask.is_archived) : curForm.is_archived,
      comment_count: nextCommentCount,
      updated_at: serverTask.updated_at || curForm.updated_at
    };
    formDataRef.current = nextForm;
    setFormData(nextForm);
    setIsPinned(hasExactTag(nextForm.tags, 'pinned'));
    lastSyncedApprovalRef.current = {
      progress: Number(nextForm.progress || 0),
      approval_status: nextForm.approval_status || null
    };

    if (serverUpdatedAt) {
      lastSyncedUpdatedAtRef.current = serverUpdatedAt;
    }

    setOriginalHash(computeCleanHash(nextForm, nextMeta));
    window.dispatchEvent(new CustomEvent('task-local-updated', { detail: { id: serverTask.id, ...nextForm } }));

    if (!options?.fromSave) {
      if (nextCommentCount !== prevCommentCount) {
        loadComments(Number(serverTask.id));
        loadSubtaskCommentCounts();
      }
      if (activeTabRef.current === 'timeline') {
        loadTimeline(Number(serverTask.id));
      }
    }
  }, [computeCleanHash, loadComments, loadSubtaskCommentCounts, loadTimeline]);

  // Real-time multi-user sync polling while WorkspaceTaskDrawer is open (with AbortController)
  useEffect(() => {
    if (!isTabActive || !isOpen || isNew || isClonedDraft || !activeTaskId || activeTaskId === 'new') {
      return;
    }
    const taskIdNum = Number(activeTaskId);
    if (!taskIdNum || isNaN(taskIdNum)) return;

    const pollLatestTask = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (
        liveSyncInFlightRef.current ||
        saveMetaInFlightRef.current ||
        manualSaveInFlightRef.current ||
        updateFieldInFlightRef.current ||
        pendingMetaSaveRef.current ||
        Object.keys(pendingFieldUpdatesRef.current).length > 0
      ) {
        return;
      }
      if (pollAbortRef.current) pollAbortRef.current.abort();
      const ctrl = new AbortController();
      pollAbortRef.current = ctrl;
      liveSyncInFlightRef.current = true;
      try {
        const res = await api.get(`/activities/${taskIdNum}`, { signal: ctrl.signal });
        if (ctrl.signal.aborted || String(activeTaskIdRef.current) !== String(taskIdNum)) return;
        const serverTask = res.data?.data || res.data;
        if (serverTask && serverTask.id) {
          applyLiveServerTask(serverTask, { fromSave: false });
        }
      } catch (err: any) {
        if (!isAbortError(err)) {
          // Ignore transient network errors during background polling
        }
      } finally {
        liveSyncInFlightRef.current = false;
      }
    };

    pollLatestTask();
    const intervalId = window.setInterval(pollLatestTask, safeTaskPollMs);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        pollLatestTask();
      }
    };
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      if (pollAbortRef.current) pollAbortRef.current.abort();
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isTabActive, isOpen, isNew, isClonedDraft, activeTaskId, applyLiveServerTask, safeTaskPollMs]);

  const validateRecurrence = useCallback((meta: any): { isValid: boolean; error?: string } => {
    const rec = meta?.recurrence;
    if (!rec || rec.pattern === 'none') {
      return { isValid: true };
    }
    if (rec.pattern === 'weekly') {
      if (!Array.isArray(rec.weekly_days) || rec.weekly_days.length === 0) {
        return {
          isValid: false,
          error: t('Vui lòng chọn ít nhất một ngày trong tuần để lặp lại!')
        };
      }
    }
    if (rec.pattern === 'monthly') {
      const day = Number(rec.monthly_day);
      if (isNaN(day) || day < 1 || day > 31) {
        return {
          isValid: false,
          error: t('Vui lòng chọn một ngày hợp lệ trong tháng (từ 1 đến 31)!')
        };
      }
    }
    if (rec.pattern === 'custom_days') {
      const interval = Number(rec.days_interval);
      if (isNaN(interval) || interval < 1 || interval > safeRecurrenceMaxDays) {
        return {
          isValid: false,
          error: t(`Vui lòng chọn khoảng thời gian lặp lại hợp lệ (từ 1 đến ${safeRecurrenceMaxDays} ngày)!`)
        };
      }
    }
    return { isValid: true };
  }, [t, safeRecurrenceMaxDays]);

  const renderCommentContent = (text: string) => {
    if (!text) return '';
    const cleanText = text
      .replace(/&amp;nbsp;/gi, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ');
    const regex = /(https?:\/\/[^\s]+|@[\p{L}\p{N}_()]+)/gu;
    const parts = cleanText.split(regex);
    return parts.map((part, idx) => {
      if ((part.startsWith('http://') || part.startsWith('https://')) && isSafeResourceUrl(part, { allowRelativeUploads: false })) {
        return (
          <a
            key={idx}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#BD1D2D',
              textDecoration: 'underline',
              wordBreak: 'break-all'
            }}
          >
            {part}
          </a>
        );
      } else if (part.startsWith('@')) {
        const cleanName = (n: string) => (n || '').trim().replace(/\s+/g, '_').toLowerCase().replace(/_\([^)]+\)/g, '').replace(/\([^)]+\)/g, '');
        const cleanMentionVal = cleanName(part.substring(1));
        const taggedUser = users.find((u: any) => {
          const normalizedUser = cleanName(u.full_name || u.name || u.fullname || u.username);
          return normalizedUser === cleanMentionVal;
        });

        const displayName = taggedUser?.full_name || taggedUser?.name || taggedUser?.fullname || taggedUser?.username || part.substring(1).replace(/_/g, ' ');
        const avatarUrl = taggedUser?.avatar_url || taggedUser?.avatar;

        return (
          <span
            key={idx}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: '#BD1D2D',
              background: 'rgba(189, 29, 45, 0.08)',
              padding: '2px 8px',
              borderRadius: '9999px',
              margin: '0 2px',
              fontWeight: 600,
              fontSize: '0.85em',
              verticalAlign: 'middle'
            }}
          >
            <Avatar name={displayName} src={avatarUrl} size={16} />
            @{displayName}
          </span>
        );
      }
      return part;
    });
  };

  // ==========================================================================
  // UNIFIED SERIALIZED PER-TASK SAVE QUEUE (All PUT /activities/:id go here)
  // ==========================================================================

  const buildErpTags = useCallback((baseTags: string, internalType: string, pinned: boolean): string => {
    let tagArray = parseTagTokens(baseTags);
    if (internalType === 'announcement') {
      if (pinned && !tagArray.some(t => t.toLowerCase() === 'pinned')) {
        tagArray.push('pinned');
      } else if (!pinned) {
        tagArray = tagArray.filter(t => t.toLowerCase() !== 'pinned');
      }
    }
    const newTag = `internal_${internalType || 'task'}`;
    tagArray = tagArray.filter(t => !t.toLowerCase().startsWith('internal_'));
    tagArray.push(newTag);
    return tagArray.join(',');
  }, []);

  const enqueueTaskUpdate = useCallback((options: {
    fieldPatch?: Record<string, any>;
    metaUpdate?: any;
    overrideProgress?: number;
    dirtyMetaFields?: string[];
    dirtySubtaskIds?: string[];
    deletedSubtaskIds?: string[];
    forceFullBody?: boolean;
    silent?: boolean;
  }): Promise<{ success: boolean; serverTask?: any; aborted?: boolean; localOnly?: boolean; error?: any }> => {
    if (!taskRef.current) return Promise.resolve({ success: false });
    if (isReadOnly) return Promise.resolve({ success: false });

    const enqueuedTaskId = activeTaskIdRef.current;
    const enqueuedSessionVersion = saveSessionVersionRef.current;

    // 1. Optimistically update local formData & erpMeta immediately
    if (options.metaUpdate) {
      erpMetaRef.current = options.metaUpdate;
      setErpMeta(options.metaUpdate);
    }

    const combinedLocalPatch: Record<string, any> = {
      ...(options.fieldPatch || {}),
      ...(options.overrideProgress !== undefined ? { progress: options.overrideProgress } : {})
    };
    if (Object.keys(combinedLocalPatch).length > 0) {
      const nextForm = { ...(formDataRef.current || {}), ...combinedLocalPatch };
      formDataRef.current = nextForm;
      setFormData(nextForm);
    }

    // Draft / New tasks only live in local state until POST /activities
    if (
      isNewRef.current ||
      isClonedDraftRef.current ||
      formDataRef.current?.id === 'new' ||
      !enqueuedTaskId ||
      enqueuedTaskId === 'new'
    ) {
      return Promise.resolve({ success: true, localOnly: true });
    }

    // Optimistic board sync
    window.dispatchEvent(new CustomEvent('task-local-updated', {
      detail: { id: enqueuedTaskId, ...formDataRef.current }
    }));

    // 2. Coalesce into pending buffers
    if (Object.keys(combinedLocalPatch).length > 0) {
      pendingFieldUpdatesRef.current = {
        ...pendingFieldUpdatesRef.current,
        ...combinedLocalPatch
      };
    }

    if (options.metaUpdate || options.forceFullBody) {
      const prevPending = pendingMetaSaveRef.current;
      const dirtyMetaFieldsSet = new Set<string>(prevPending ? Array.from(prevPending.dirtyMetaFields) : []);
      const dirtySubtaskIdsSet = new Set<string>(prevPending ? Array.from(prevPending.dirtySubtaskIds) : []);
      const deletedSubtaskIdsSet = new Set<string>(prevPending ? Array.from(prevPending.deletedSubtaskIds) : []);
      (options.dirtyMetaFields || []).forEach(f => dirtyMetaFieldsSet.add(String(f)));
      (options.dirtySubtaskIds || []).forEach(id => dirtySubtaskIdsSet.add(String(id)));
      (options.deletedSubtaskIds || []).forEach(id => deletedSubtaskIdsSet.add(String(id)));

      pendingMetaSaveRef.current = {
        updatedMeta: options.metaUpdate || erpMetaRef.current,
        overrideProgress: options.overrideProgress !== undefined ? options.overrideProgress : prevPending?.overrideProgress,
        dirtyMetaFields: dirtyMetaFieldsSet,
        dirtySubtaskIds: dirtySubtaskIdsSet,
        deletedSubtaskIds: deletedSubtaskIdsSet,
        forceFullBody: Boolean(options.forceFullBody || prevPending?.forceFullBody)
      };
    }

    // 3. Serialize execution onto saveChainRef
    const stepPromise = saveChainRef.current.then(async () => {
      // Task-ID mismatch guard BEFORE executing HTTP call
      if (
        saveSessionVersionRef.current !== enqueuedSessionVersion ||
        String(activeTaskIdRef.current) !== String(enqueuedTaskId)
      ) {
        return { success: false, aborted: true };
      }

      const fieldBatch = { ...pendingFieldUpdatesRef.current };
      const metaBatch = pendingMetaSaveRef.current;
      pendingFieldUpdatesRef.current = {};
      pendingMetaSaveRef.current = null;

      if (Object.keys(fieldBatch).length === 0 && !metaBatch) {
        return { success: true };
      }

      const payload: Record<string, any> = { ...fieldBatch };
      const latestForm = formDataRef.current || {};
      let finalTags = String(payload.tags ?? latestForm.tags ?? '');

      if (metaBatch) {
        const batchMeta = { ...(erpMetaRef.current || metaBatch.updatedMeta) };
        if (typeof batchMeta.description === 'string') {
          batchMeta.description = sanitizeHtml(linkifyHtml(batchMeta.description));
        }

        const dirtyMetaArr = Array.from(metaBatch.dirtyMetaFields);
        const dirtySubArr = Array.from(metaBatch.dirtySubtaskIds);
        const deletedSubArr = metaBatch.forceFullBody
          ? Array.from(new Set([...Array.from(metaBatch.deletedSubtaskIds), ...deletedSubtaskIdsRef.current]))
          : Array.from(metaBatch.deletedSubtaskIds);

        const payloadObj: any = {
          erp_task: {
            ...batchMeta,
            ...(dirtyMetaArr.length > 0 && !metaBatch.forceFullBody ? { _dirty_meta_fields: dirtyMetaArr } : {}),
            ...(dirtySubArr.length > 0 && !metaBatch.forceFullBody ? { _dirty_subtask_ids: dirtySubArr } : {}),
            ...(deletedSubArr.length > 0 ? { _deleted_subtask_ids: deletedSubArr } : {})
          }
        };
        if (batchMeta.due_sla_notified || latestForm.due_sla_notified) {
          payloadObj.due_sla_notified = true;
        }
        if (batchMeta.subtask_sla_notified || latestForm.subtask_sla_notified) {
          payloadObj.subtask_sla_notified = true;
        }

        payload.body = JSON.stringify(payloadObj);
        if (!('tags' in fieldBatch)) {
          finalTags = buildErpTags(finalTags, batchMeta.internal_type || 'task', isPinned);
          payload.tags = finalTags;
        }
        if (dirtyMetaArr.length > 0 && !metaBatch.forceFullBody) payload._dirty_meta_fields = dirtyMetaArr;
        if (dirtySubArr.length > 0 && !metaBatch.forceFullBody) payload._dirty_subtask_ids = dirtySubArr;
        if (deletedSubArr.length > 0) payload._deleted_subtask_ids = deletedSubArr;

        if (metaBatch.overrideProgress !== undefined && payload.progress === undefined) {
          payload.progress = metaBatch.overrideProgress;
        }

        const isRelationModified =
          metaBatch.forceFullBody ||
          dirtyMetaArr.length === 0 ||
          dirtyMetaArr.some(f => ['project_id', 'campaign_id', 'team_id', 'team_ids', 'related_contact_ids'].includes(f));

        if (isRelationModified) {
          let relType: string | null = null;
          let relId: number | string | null = null;

          if (batchMeta.project_id) {
            relType = 'project';
            relId = batchMeta.project_id;
          } else if (batchMeta.campaign_id) {
            relType = 'campaign';
            relId = batchMeta.campaign_id;
          } else if (batchMeta.team_id) {
            relType = 'team';
            relId = batchMeta.team_id;
          } else if (
            latestForm.related_type &&
            ['deal', 'company'].includes(latestForm.related_type) &&
            latestForm.related_id
          ) {
            relType = latestForm.related_type;
            relId = latestForm.related_id;
          } else if (latestForm.contact_id || (latestForm.related_type === 'contact' && latestForm.related_id)) {
            relType = 'contact';
            relId = latestForm.contact_id || latestForm.related_id;
          }

          const finalContactId = latestForm.contact_id || (latestForm.related_type === 'contact' ? latestForm.related_id : null);
          if (!('related_type' in payload)) payload.related_type = relType;
          if (!('related_id' in payload)) payload.related_id = relId ? Number(relId) : null;
          if (!('contact_id' in payload)) payload.contact_id = finalContactId ? Number(finalContactId) : null;
        }
      }

      if (Object.keys(fieldBatch).length > 0) updateFieldInFlightRef.current = true;
      if (metaBatch) saveMetaInFlightRef.current = true;

      const ctrl = new AbortController();
      saveQueueAbortRef.current = ctrl;

      try {
        const res = await api.put(`/activities/${enqueuedTaskId}`, payload, { signal: ctrl.signal });

        // Task-ID mismatch guard AFTER HTTP response
        if (
          ctrl.signal.aborted ||
          saveSessionVersionRef.current !== enqueuedSessionVersion ||
          String(activeTaskIdRef.current) !== String(enqueuedTaskId)
        ) {
          return { success: false, aborted: true };
        }

        const isSuccess = Boolean(
          res && (
            res.data?.success === true ||
            res.data?.id ||
            res.data?.data?.id ||
            res.data?.subject ||
            (res.status >= 200 && res.status < 300 && res.data?.success !== false)
          )
        );

        if (!isSuccess) {
          const msg = res?.data?.message || t('Không thể lưu thay đổi');
          if (!options.silent) toast.error(msg);
          return { success: false, error: msg };
        }

        if (metaBatch) {
          const deletedArr = Array.from(metaBatch.deletedSubtaskIds);
          if (metaBatch.forceFullBody) {
            deletedSubtaskIdsRef.current = [];
          } else if (deletedArr.length > 0) {
            deletedSubtaskIdsRef.current = deletedSubtaskIdsRef.current.filter(id => !deletedArr.includes(String(id)));
          }
        }

        const serverTask = res.data?.data?.id ? res.data.data : (res.data?.id ? res.data : null);
        if (serverTask && serverTask.id) {
          applyLiveServerTask(serverTask, { fromSave: true });
          unpinIfDone(serverTask.status, serverTask.progress);
          if (onUpdate) onUpdate(serverTask);
          return { success: true, serverTask };
        }

        const latestAfterPut = formDataRef.current || latestForm;
        const nextDetail = { id: enqueuedTaskId, ...latestAfterPut, ...payload };
        formDataRef.current = nextDetail;
        setFormData(nextDetail);
        setOriginalHash(computeCleanHash(nextDetail, erpMetaRef.current));
        unpinIfDone(nextDetail.status, nextDetail.progress);
        window.dispatchEvent(new CustomEvent('task-local-updated', { detail: nextDetail }));
        if (onUpdate) onUpdate(nextDetail);
        if (activeTabRef.current === 'timeline') loadTimeline(Number(enqueuedTaskId));
        return { success: true, serverTask: nextDetail };
      } catch (err: any) {
        if (isAbortError(err) || saveSessionVersionRef.current !== enqueuedSessionVersion || String(activeTaskIdRef.current) !== String(enqueuedTaskId)) {
          return { success: false, aborted: true };
        }
        if (!options.silent) {
          toast.error(t('Lỗi lưu thay đổi: ') + (err.response?.data?.message || err.message));
        }
        return { success: false, error: err };
      } finally {
        updateFieldInFlightRef.current = false;
        saveMetaInFlightRef.current = false;
        if (saveQueueAbortRef.current === ctrl) {
          saveQueueAbortRef.current = null;
        }
      }
    });

    // Keep chain alive even if one step rejected
    saveChainRef.current = stepPromise.catch(() => ({ success: false }));
    return stepPromise;
  }, [isReadOnly, isPinned, buildErpTags, applyLiveServerTask, unpinIfDone, onUpdate, computeCleanHash, loadTimeline, t]);

  const handleSaveMeta = useCallback((
    updatedMeta: any,
    overrideProgress?: number,
    metaOptions?: {
      dirtyMetaFields?: string[];
      dirtySubtaskIds?: string[];
      deletedSubtaskIds?: string[];
    }
  ) => {
    if (!taskRef.current || isReadOnly) return Promise.resolve({ success: false });

    const validation = validateRecurrence(updatedMeta);
    if (!validation.isValid) {
      setErpMeta(updatedMeta);
      erpMetaRef.current = updatedMeta;
      toast.error(validation.error || t('Cấu hình lặp lại không hợp lệ'));
      return Promise.resolve({ success: false });
    }

    // Synchronize approval_status atomically when subtask progress reaches 100% or drops < 100%
    const autoApprovalPatch: Record<string, any> = {};
    if (overrideProgress !== undefined) {
      const curF = formDataRef.current || {};
      if (overrideProgress === 100 && Number(curF.require_approval) === 1 && curF.approver_id && curF.approval_status !== 'approved') {
        autoApprovalPatch.approval_status = 'pending';
      } else if (overrideProgress < 100 && curF.approval_status === 'pending') {
        autoApprovalPatch.approval_status = null;
      }
    }

    return enqueueTaskUpdate({
      fieldPatch: Object.keys(autoApprovalPatch).length > 0 ? autoApprovalPatch : undefined,
      metaUpdate: updatedMeta,
      overrideProgress,
      dirtyMetaFields: metaOptions?.dirtyMetaFields,
      dirtySubtaskIds: metaOptions?.dirtySubtaskIds,
      deletedSubtaskIds: metaOptions?.deletedSubtaskIds
    });
  }, [isReadOnly, validateRecurrence, enqueueTaskUpdate, t]);

  const handleUpdateField = useCallback((fieldOrPatch: string | Record<string, any>, value?: any) => {
    if (!taskRef.current || isReadOnly) return Promise.resolve({ success: false });
    const incomingPatch: Record<string, any> = typeof fieldOrPatch === 'string'
      ? { [fieldOrPatch]: value }
      : { ...fieldOrPatch };
    return enqueueTaskUpdate({ fieldPatch: incomingPatch });
  }, [isReadOnly, enqueueTaskUpdate]);

  const handleManualSave = async () => {
    if (!taskRef.current || isReadOnly) return;
    if (manualSaveInFlightRef.current) return;

    const curForm = formDataRef.current || {};
    const curMeta = erpMetaRef.current || {};

    if (curForm.require_approval === 1 && !curForm.approver_id) {
      setShowValidationModal(true);
      return;
    }

    const validation = validateRecurrence(curMeta);
    if (!validation.isValid) {
      toast.error(validation.error || t('Cấu hình lặp lại không hợp lệ'));
      return;
    }

    manualSaveInFlightRef.current = true;
    setIsSaving(true);
    try {
      const isJustSubmittedForApproval =
        !isNewRef.current &&
        !isClonedDraftRef.current &&
        curForm.id !== 'new' &&
        Number(curForm.progress) === 100 &&
        Number(curForm.require_approval) === 1 &&
        Boolean(curForm.approver_id) &&
        curForm.approval_status === 'pending' &&
        (lastSyncedApprovalRef.current.progress !== 100 || lastSyncedApprovalRef.current.approval_status !== 'pending');

      const approverName = isJustSubmittedForApproval
        ? users.find(u => Number(u.id) === Number(curForm.approver_id))?.full_name || 'Người duyệt'
        : null;

      let rawDescToSave = curMeta.description || '';
      if (typeof rawDescToSave === 'string' && (rawDescToSave.startsWith('{') || /"(?:erp_task|due_sla_notified|subtask_sla_notified|checklist|links|misa_stt)"/i.test(rawDescToSave))) {
        rawDescToSave = formatVietnameseDescription(rawDescToSave);
      }
      const finalDesc = sanitizeHtml(linkifyHtml(rawDescToSave));
      const updatedErpMeta: any = {
        ...curMeta,
        description: finalDesc,
        ...(deletedSubtaskIdsRef.current.length > 0 ? { _deleted_subtask_ids: deletedSubtaskIdsRef.current } : {})
      };

      const finalTags = buildErpTags(curForm.tags || '', updatedErpMeta.internal_type || 'task', isPinned);
      const normalizedDueDate = curForm.due_date
        ? (String(curForm.due_date).length === 10
            ? `${curForm.due_date} ${normalizedDefaultDueTime}`
            : String(curForm.due_date).length === 16
              ? `${curForm.due_date}:00`
              : curForm.due_date)
        : null;

      if (isClonedDraftRef.current || isNewRef.current || curForm.id === 'new') {
        let relType: string | null = null;
        let relId: number | string | null = null;

        if (updatedErpMeta.project_id) {
          relType = 'project';
          relId = updatedErpMeta.project_id;
        } else if (updatedErpMeta.campaign_id) {
          relType = 'campaign';
          relId = updatedErpMeta.campaign_id;
        } else if (updatedErpMeta.team_id) {
          relType = 'team';
          relId = updatedErpMeta.team_id;
        } else if (curForm.related_type && ['deal', 'company', 'project', 'campaign', 'team'].includes(curForm.related_type) && curForm.related_id) {
          relType = curForm.related_type;
          relId = curForm.related_id;
        } else if (curForm.contact_id || curForm.related_id) {
          relType = 'contact';
          relId = curForm.contact_id || curForm.related_id;
        }
        const finalContactId = curForm.contact_id || (curForm.related_type === 'contact' ? curForm.related_id : null);

        const payloadObj: any = { erp_task: updatedErpMeta };
        if (updatedErpMeta.due_sla_notified || curForm.due_sla_notified) payloadObj.due_sla_notified = true;
        if (updatedErpMeta.subtask_sla_notified || curForm.subtask_sla_notified) payloadObj.subtask_sla_notified = true;

        const payload: any = {
          subject: curForm.subject || curForm.title || '',
          description: finalDesc,
          body: JSON.stringify(payloadObj),
          tags: finalTags,
          progress: curForm.progress || 0,
          priority: curForm.priority || 'medium',
          status: curForm.status || 'planned',
          due_date: normalizedDueDate,
          user_id: curForm.user_id ? Number(curForm.user_id) : null,
          created_by: curForm.created_by ? Number(curForm.created_by) : null,
          require_approval: curForm.require_approval || 0,
          approver_id: curForm.require_approval === 1 ? Number(curForm.approver_id) : null,
          approval_status: curForm.approval_status || 'none',
          participant_ids: curForm.participant_ids ? String(curForm.participant_ids) : null,
          related_id: relId ? Number(relId) : null,
          related_type: relType,
          contact_id: finalContactId ? Number(finalContactId) : null,
          task_group_id: curForm.task_group_id ? Number(curForm.task_group_id) : null,
          type: curForm.type || 'task'
        };

        const res = await api.post('/activities', payload);
        const isSuccess = Boolean(
          res && (
            res.data?.success === true ||
            res.data?.id ||
            res.data?.data?.id ||
            res.data?.subject ||
            (res.status >= 200 && res.status < 300 && res.data?.success !== false)
          )
        );

        if (isSuccess) {
          const createdTask = res.data?.data || res.data;
          const newId = createdTask?.id;
          const activePropId = scopedProposalIdRef.current;

          window.dispatchEvent(new CustomEvent('erp-action-completed', {
            detail: {
              actionType: 'task',
              id: newId,
              entityId: newId,
              ...(activePropId ? { proposalId: activePropId } : {}),
              title: curForm.subject || createdTask?.subject || 'Công việc mới'
            }
          }));
          if (activePropId) setScopedProposalId(null);

          window.dispatchEvent(new CustomEvent('task-updated', { detail: { id: newId, ...(createdTask || payload) } }));
          if (newId) {
            window.dispatchEvent(new CustomEvent('task-local-updated', { detail: { id: newId, ...payload, ...(createdTask || {}) } }));
          }
          const taskName = curForm.subject || t('Không có tiêu đề');
          toast.success(t('Đã tạo công việc "{subject}" thành công').replace('{subject}', taskName));
          setOriginalHash(computeCleanHash(curForm, updatedErpMeta));
          setIsClonedDraft(false);
          onClose();
          registerTimer(() => onUpdate(), 50);
        } else {
          toast.error(res?.data?.message || t('Không thể tạo công việc'));
        }
      } else {
        // Existing task: coalesce with serialized queue so subject/meta/direct updates never race
        const fieldPatch: Record<string, any> = {
          subject: curForm.subject || curForm.title || '',
          description: finalDesc,
          tags: finalTags,
          progress: curForm.progress || 0,
          priority: curForm.priority || 'medium',
          status: curForm.status || 'planned',
          due_date: normalizedDueDate,
          user_id: curForm.user_id ? Number(curForm.user_id) : null,
          created_by: curForm.created_by ? Number(curForm.created_by) : null,
          require_approval: curForm.require_approval || 0,
          approver_id: curForm.require_approval === 1 ? Number(curForm.approver_id) : null,
          approval_status: curForm.approval_status || 'none',
          participant_ids: curForm.participant_ids ? String(curForm.participant_ids) : null,
          task_group_id: curForm.task_group_id ? Number(curForm.task_group_id) : null
        };

        const result = await enqueueTaskUpdate({
          fieldPatch,
          metaUpdate: updatedErpMeta,
          forceFullBody: true,
          silent: true
        });

        if (result.aborted) return;
        const taskName = curForm.subject || t('Không có tiêu đề');
        if (result.success) {
          isDescDirtyRef.current = false;
          lastSyncedDescRef.current = finalDesc;
          toast.success(t('Đã lưu các thay đổi của công việc "{subject}" thành công').replace('{subject}', taskName));
          if (isJustSubmittedForApproval && approverName) {
            toast.success(t('Đã gửi thông báo email phê duyệt tới {name}').replace('{name}', approverName));
            setShowApprovalSuccessModal(approverName);
          }
        } else {
          toast.error(t('Không thể lưu thay đổi cho công việc "{subject}"').replace('{subject}', taskName));
        }
      }
    } catch (e: any) {
      const taskName = curForm.subject || t('Không có tiêu đề');
      toast.error(t('Không thể lưu thay đổi cho công việc "{subject}": ').replace('{subject}', taskName) + (e.response?.data?.message || e.message));
    } finally {
      manualSaveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  const cleanupDeepLinkParams = useCallback(() => {
    if (embedMode) return;
    const keys = ['task_id', 'open_task_id', 'subtask_id', 'highlight_comment_id', 'comment_id', 'highlight_activity_id'];
    const current = new URLSearchParams(window.location.search);
    let changed = false;
    keys.forEach(k => {
      if (current.has(k)) {
        current.delete(k);
        changed = true;
      }
    });
    if (changed) {
      setSearchParams(current, { replace: true });
    }
  }, [embedMode, setSearchParams]);

  const handleCloseDrawer = useCallback(() => {
    const curForm = formDataRef.current || {};
    const curMeta = erpMetaRef.current || {};

    if (isNewRef.current || isClonedDraftRef.current || taskRef.current?.id === 'new') {
      const hasDraftContent = Boolean(
        curForm.subject?.trim() ||
        (curMeta?.description && String(curMeta.description).replace(/<[^>]*>/g, '').trim() !== '') ||
        (Array.isArray(curMeta?.checklist) && curMeta.checklist.length > 0) ||
        (Array.isArray(curMeta?.links) && curMeta.links.length > 0)
      );
      if (hasDraftContent) {
        setShowUnsavedNewTaskPrompt(true);
        return;
      }
    } else if (!isReadOnly) {
      // Flush any uncommitted description or queued changes silently before closing existing task
      if (isDescDirtyRef.current) {
        isDescDirtyRef.current = false;
        const linkified = sanitizeHtml(linkifyHtml(curMeta?.description || ''));
        lastSyncedDescRef.current = linkified;
        handleSaveMeta({ ...curMeta, description: linkified }, undefined, { dirtyMetaFields: ['description'] });
      }
    }

    if (curForm.require_approval === 1 && !curForm.approver_id && !isReadOnly) {
      setShowValidationModal(true);
      return;
    }

    cleanupDeepLinkParams();
    setIsClosing(true);
    registerTimer(() => {
      onClose();
      setIsClosing(false);
    }, safeDrawerMs);
  }, [isReadOnly, handleSaveMeta, cleanupDeepLinkParams, registerTimer, onClose, safeDrawerMs]);

  escapeHandlerRef.current = () => {
    if (lightboxState.isOpen) {
      setLightboxState(prev => ({ ...prev, isOpen: false }));
    } else if (deleteSubtaskTarget) {
      setDeleteSubtaskTarget(null);
    } else if (commentToDelete !== null) {
      setCommentToDelete(null);
    } else if (showHideConfirmModal) {
      setShowHideConfirmModal(false);
    } else if (showMuteConfirmModal) {
      setShowMuteConfirmModal(false);
    } else if (showClearCustomerConfirm) {
      setShowClearCustomerConfirm(false);
    } else if (meetingToComplete) {
      setSafeProofPreview(null);
      setMeetingToComplete(null);
    } else if (cancellingMeeting) {
      setCancellingMeeting(null);
    } else if (selectedSubtaskForParticipants) {
      setSelectedSubtaskForParticipants(null);
    } else if (showParticipantsModal) {
      setShowParticipantsModal(false);
      setShowAddParticipantsSection(false);
    } else if (showUnsavedNewTaskPrompt) {
      setShowUnsavedNewTaskPrompt(false);
    } else if (showValidationModal) {
      setShowValidationModal(false);
    } else if (showApprovalSuccessModal) {
      setShowApprovalSuccessModal(null);
    } else if (activeAssigneeDropdownId !== null) {
      setActiveAssigneeDropdownId(null);
    } else if (showTeamDropdown) {
      setShowTeamDropdown(false);
    } else if (showParticipantDropdown) {
      setShowParticipantDropdown(false);
    } else if (editingChecklistId !== null) {
      setEditingChecklistId(null);
    } else if (showAddChecklist) {
      setShowAddChecklist(false);
    } else if (showAddLink) {
      setShowAddLink(false);
    } else {
      handleCloseDrawer();
    }
  };

  const handleDeleteTask = async () => {
    const tid = activeTaskIdRef.current;
    if (isReadOnly || !tid || isNewRef.current || tid === 'new') return;

    showConfirm({
      title: t('Xóa công việc?'),
      message: t('Bạn có chắc chắn muốn xóa vĩnh viễn công việc này? Thao tác này không thể hoàn tác.'),
      isDanger: true,
      confirmText: t('Xác nhận xóa'),
      onConfirm: async () => {
        if (deleteTaskInFlightRef.current) return;
        deleteTaskInFlightRef.current = true;
        try {
          const res = await api.delete(`/activities/${tid}`);
          if (res.data.success) {
            toast.success(t('Đã xóa công việc'));
            cleanupDeepLinkParams();
            onUpdate();
            onClose();
          } else {
            toast.error(res.data.message || t('Không có quyền xóa'));
          }
        } catch (err: any) {
          toast.error(err.response?.data?.message || t('Lỗi kết nối server'));
        } finally {
          deleteTaskInFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  const roleLower = String(currentUser?.role || '').toLowerCase();
  const isAdminOrManager = ['admin', 'superadmin', 'super_admin', 'manager', 'director'].includes(roleLower);
  const isAssignee = Number(currentUser?.id) === Number(formData.user_id || task?.user_id);
  const isCreator = Number(currentUser?.id) === Number(formData.created_by || task?.created_by);
  const isApprover = Number(currentUser?.id) === Number(formData.approver_id || task?.approver_id);
  const canDelete = !isReadOnly && activeTaskId && activeTaskId !== 'new' && (isAdminOrManager || isAssignee || isCreator || isApprover);
  const isApproverOrAdmin = Boolean(
    !isReadOnly &&
    currentUser &&
    (Number(currentUser.id) === Number(formData.approver_id) || isAdminOrManager)
  );

  // Checklist Actions
  const handleAddChecklistItem = () => {
    if (isReadOnly) return;
    const titles = newSubTitle.split('\n').map(s => s.trim()).filter(Boolean);
    if (titles.length === 0) {
      toast.error(t('Vui lòng nhập tên công việc con'));
      return;
    }

    const curForm = formDataRef.current || {};
    let currentParticipantIds = getParticipantIds(curForm.participant_ids);
    const newItems = titles.map((title, idx) => {
      const itemId = 'sub_' + (Date.now() + idx);
      const assigneeId = newSubAssignee ? Number(newSubAssignee) : (isPersonalTask && personalUser?.id ? Number(personalUser.id) : null);
      if (assigneeId && !isPersonalTask) {
        const idStr = String(assigneeId);
        if (!currentParticipantIds.includes(idStr) && Number(idStr) !== Number(curForm.user_id)) {
          currentParticipantIds.push(idStr);
        }
      }
      return {
        id: itemId,
        title,
        text: title,
        assignee_id: assigneeId,
        due_date: newSubDeadline || null,
        priority: newSubPriority || safeDefaultPriority,
        done: false,
        checked: false
      };
    });

    const curMeta = erpMetaRef.current || erpMeta;
    const newChecklist = [...ensureArray(curMeta.checklist), ...newItems];
    const updatedMeta = { ...curMeta, checklist: newChecklist };
    const totalItems = newChecklist.length;
    const completedItems = newChecklist.filter(isSubtaskDone).length;
    const newProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    const addedIds = newItems.map((x: any) => String(x.id));

    const fieldPatch: Record<string, any> = {};
    if (!isPersonalTask) {
      const nextString = currentParticipantIds.join(',');
      if (curForm.participant_ids !== nextString) {
        fieldPatch.participant_ids = nextString;
      }
    }
    if (newSubDeadline) {
      const curDuePrefix = String(curForm.due_date || '').slice(0, 10);
      const newDuePrefix = String(newSubDeadline).slice(0, 10);
      if (!curDuePrefix || newDuePrefix > curDuePrefix) {
        fieldPatch.due_date = `${newDuePrefix} ${normalizedDefaultDueTime}`;
        toast.success(t('Đã tự động cập nhật hạn chót nhiệm vụ chính theo việc con'));
      }
    }

    if (Object.keys(fieldPatch).length > 0) {
      handleUpdateField(fieldPatch);
    }
    handleSaveMeta(updatedMeta, newProgress, {
      dirtyMetaFields: ['checklist'],
      dirtySubtaskIds: addedIds
    });

    setNewSubTitle('');
    setNewSubAssignee(isPersonalTask && personalUser?.id ? String(personalUser.id) : '');
    setNewSubDeadline(getTomorrowString(safeSubtaskDueDays));
    setNewSubPriority(safeDefaultPriority);
    setShowAddChecklist(false);
    toast.success(t('Đã thêm việc con'));

    const newTotalPages = Math.ceil(newChecklist.length / CHECKLIST_PAGE_SIZE);
    setChecklistPage(newTotalPages);
  };

  const handleToggleChecklist = (itemId: string) => {
    if (isReadOnly) return;
    const curMeta = erpMetaRef.current || erpMeta;
    const updatedChecklist = ensureArray(curMeta.checklist).map((item: any) => {
      if (String(item.id) === String(itemId)) {
        const nextDone = !isSubtaskDone(item);
        if (nextDone) triggerLocalConfetti();
        return { ...item, done: nextDone, checked: nextDone };
      }
      return item;
    });

    const updatedMeta = { ...curMeta, checklist: updatedChecklist };
    const totalItems = updatedChecklist.length;
    const completedItems = updatedChecklist.filter(isSubtaskDone).length;
    const newProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    handleSaveMeta(updatedMeta, newProgress, {
      dirtyMetaFields: ['checklist'],
      dirtySubtaskIds: [String(itemId)]
    });
  };

  const handleDeleteChecklistItem = (itemId: string) => {
    if (isReadOnly) return;
    const curMeta = erpMetaRef.current || erpMeta;
    const idStr = String(itemId);
    if (!deletedSubtaskIdsRef.current.includes(idStr)) {
      deletedSubtaskIdsRef.current.push(idStr);
    }
    const updatedChecklist = ensureArray(curMeta.checklist).filter((item: any) => String(item.id) !== idStr);
    const updatedMeta = { ...curMeta, checklist: updatedChecklist };
    const totalItems = updatedChecklist.length;
    const completedItems = updatedChecklist.filter(isSubtaskDone).length;
    const newProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
    handleSaveMeta(updatedMeta, newProgress, {
      dirtyMetaFields: ['checklist'],
      deletedSubtaskIds: [idStr]
    });
    toast.success(t('Đã xóa việc con'));
  };

  const handleUpdateChecklistItem = (itemId: string, newTitle: string, newDeadline: string): boolean => {
    if (isReadOnly) return false;
    const cleanTitle = newTitle.trim();
    if (!cleanTitle) {
      toast.error(t('Tên công việc con không được để trống'));
      return false;
    }
    const curMeta = erpMetaRef.current || erpMeta;
    const curForm = formDataRef.current || {};
    const updatedChecklist = ensureArray(curMeta.checklist).map((item: any) => {
      if (String(item.id) === String(itemId)) {
        return {
          ...item,
          title: cleanTitle,
          text: cleanTitle,
          due_date: newDeadline || null
        };
      }
      return item;
    });
    const updatedMeta = { ...curMeta, checklist: updatedChecklist };
    handleSaveMeta(updatedMeta, undefined, {
      dirtyMetaFields: ['checklist'],
      dirtySubtaskIds: [String(itemId)]
    });
    toast.success(t('Đã cập nhật công việc con'));

    if (newDeadline) {
      const curDuePrefix = String(curForm.due_date || '').slice(0, 10);
      const newDuePrefix = String(newDeadline).slice(0, 10);
      if (!curDuePrefix || newDuePrefix > curDuePrefix) {
        handleUpdateField('due_date', `${newDuePrefix} ${normalizedDefaultDueTime}`);
        toast.success(t('Đã tự động cập nhật hạn chót nhiệm vụ chính theo việc con'));
      }
    }
    return true;
  };

  const handleUpdateChecklistItemAssignee = (itemId: string, newAssigneeId: string) => {
    if (isReadOnly) return;
    const curMeta = erpMetaRef.current || erpMeta;
    const curForm = formDataRef.current || {};
    const updatedChecklist = ensureArray(curMeta.checklist).map((item: any) => {
      if (String(item.id) === String(itemId)) {
        return { ...item, assignee_id: newAssigneeId };
      }
      return item;
    });

    if (newAssigneeId) {
      const newAssignees = String(newAssigneeId).split(',').map(id => id.trim()).filter(Boolean);
      const current = getParticipantIds(curForm.participant_ids);
      let changed = false;
      newAssignees.forEach(id => {
        if (!current.includes(id) && Number(id) !== Number(curForm.user_id)) {
          current.push(id);
          changed = true;
        }
      });
      if (changed) {
        handleUpdateField('participant_ids', current.join(','));
      }
    }

    const updatedMeta = { ...curMeta, checklist: updatedChecklist };
    handleSaveMeta(updatedMeta, undefined, {
      dirtyMetaFields: ['checklist'],
      dirtySubtaskIds: [String(itemId)]
    });
    toast.success(t('Đã phân công nhân sự thực hiện'));
  };

  // Resources Actions
  const handleAddLink = () => {
    if (isReadOnly) return;
    const rawInput = newLinkUrl.trim();
    if (!rawInput) {
      toast.error(t('URL không được để trống'));
      return;
    }
    const cleanUrl = /^https?:\/\//i.test(rawInput) || rawInput.startsWith('/uploads/')
      ? rawInput
      : (rawInput.includes('://') ? rawInput : `https://${rawInput}`);

    if (!isSafeResourceUrl(cleanUrl, { allowRelativeUploads: true, allowBlob: false })) {
      toast.error(t('Đường dẫn URL không hợp lệ hoặc không an toàn'));
      return;
    }

    let autoLabel = newLinkLabel.trim();
    if (!autoLabel) {
      if (/youtube\.com|youtu\.be/i.test(cleanUrl)) autoLabel = 'YouTube Video';
      else if (/docs\.google\.com\/spreadsheets/i.test(cleanUrl)) autoLabel = 'Google Sheets';
      else if (/docs\.google\.com\/document/i.test(cleanUrl)) autoLabel = 'Google Docs';
      else if (/drive\.google\.com/i.test(cleanUrl)) autoLabel = 'Google Drive';
      else autoLabel = 'Liên kết đính kèm';
    }
    const newLink = {
      label: autoLabel,
      url: cleanUrl
    };
    const curMeta = erpMetaRef.current || erpMeta;
    const newLinks = [...ensureArray(curMeta.links), newLink];
    const updatedMeta = { ...curMeta, links: newLinks };
    handleSaveMeta(updatedMeta, undefined, { dirtyMetaFields: ['links'] });

    setNewLinkLabel('');
    setNewLinkUrl('');
    setShowAddLink(false);
    toast.success(t('Đã thêm liên kết'));
  };

  const handleDeleteLink = (index: number) => {
    if (isReadOnly) return;
    const curMeta = erpMetaRef.current || erpMeta;
    const newLinks = ensureArray(curMeta.links).filter((_: any, i: number) => i !== index);
    const updatedMeta = { ...curMeta, links: newLinks };
    handleSaveMeta(updatedMeta, undefined, { dirtyMetaFields: ['links'] });
    toast.success(t('Đã xóa liên kết'));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isReadOnly || resourceUploadInFlightRef.current) return;

    const validationError = validateTaskUploadFile(file, {
      maxMb: safeUploadMaxMb,
      extraForbiddenExts: safeForbiddenExts
    });
    if (validationError) {
      toast.error(t(validationError));
      return;
    }

    resourceUploadInFlightRef.current = true;
    setUploadingFile(true);
    const sizeStr = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    const taskId = startUpload(file.name, sizeStr);

    const fd = new FormData();
    fd.append('file', file);

    try {
      updateProgress(taskId, 20, 'uploading');
      const res = await api.post('/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            updateProgress(taskId, percent, percent === 100 ? 'processing' : 'uploading');
          }
        }
      });
      const fileUrl = res.data?.data?.url || res.data?.url;
      if (res.data && res.data.success && fileUrl && isSafeResourceUrl(fileUrl, { allowRelativeUploads: true })) {
        finishUpload(taskId, true);
        const newResource = {
          label: file.name,
          url: fileUrl,
          is_file: true
        };
        const curMeta = erpMetaRef.current || erpMeta;
        const newLinks = [...ensureArray(curMeta.links), newResource];
        const updatedMeta = { ...curMeta, links: newLinks };
        handleSaveMeta(updatedMeta, undefined, { dirtyMetaFields: ['links'] });
        toast.success(t('Tải lên tài liệu thành công'));
      } else {
        finishUpload(taskId, false, res.data?.message || t('Lỗi tải tệp lên'));
        toast.error(res.data?.message || t('Lỗi tải tệp lên'));
      }
    } catch (err: any) {
      finishUpload(taskId, false, err.message || t('Lỗi kết nối tải tệp'));
      toast.error(t('Lỗi kết nối tải tệp: ') + err.message);
    } finally {
      resourceUploadInFlightRef.current = false;
      setUploadingFile(false);
    }
  };

  const handlePasteDropzoneUpload = async (item: { file?: File; url?: string; label: string }) => {
    if (isReadOnly) return;
    if (item.url) {
      if (!isSafeResourceUrl(item.url, { allowRelativeUploads: true, allowBlob: false })) {
        toast.error(t('Đường dẫn URL không hợp lệ hoặc không an toàn'));
        return;
      }
      const newResource = {
        label: item.label || item.url,
        url: item.url,
        is_file: false
      };
      const curMeta = erpMetaRef.current || erpMeta;
      const newLinks = [...ensureArray(curMeta.links), newResource];
      const updatedMeta = { ...curMeta, links: newLinks };
      handleSaveMeta(updatedMeta, undefined, { dirtyMetaFields: ['links'] });
      toast.success(t('Thêm liên kết đính kèm thành công'));
      return;
    }

    if (item.file) {
      const file = item.file;
      const validationError = validateTaskUploadFile(file, {
        maxMb: safeUploadMaxMb,
        extraForbiddenExts: safeForbiddenExts
      });
      if (validationError) {
        toast.error(t(validationError));
        return;
      }
      if (resourceUploadInFlightRef.current) return;
      resourceUploadInFlightRef.current = true;
      setUploadingFile(true);
      const sizeStr = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
      const taskId = startUpload(item.label || file.name, sizeStr);

      const fd = new FormData();
      fd.append('file', file);

      try {
        updateProgress(taskId, 20, 'uploading');
        const res = await api.post('/upload', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              updateProgress(taskId, percent, percent === 100 ? 'processing' : 'uploading');
            }
          }
        });

        const fileUrl = res.data?.data?.url || res.data?.url;
        if (res.data && res.data.success && fileUrl && isSafeResourceUrl(fileUrl, { allowRelativeUploads: true })) {
          finishUpload(taskId, true);
          const newResource = {
            label: item.label || file.name,
            url: fileUrl,
            is_file: true
          };
          const curMeta = erpMetaRef.current || erpMeta;
          const newLinks = [...ensureArray(curMeta.links), newResource];
          const updatedMeta = { ...curMeta, links: newLinks };
          handleSaveMeta(updatedMeta, undefined, { dirtyMetaFields: ['links'] });
          toast.success(t('Tải lên đính kèm thành công'));
        } else {
          finishUpload(taskId, false, res.data?.message || t('Lỗi tải tệp lên'));
          toast.error(res.data?.message || t('Lỗi tải tệp lên'));
        }
      } catch (err: any) {
        finishUpload(taskId, false, err.message || t('Lỗi kết nối tải tệp'));
        toast.error(t('Lỗi kết nối tải tệp: ') + err.message);
      } finally {
        resourceUploadInFlightRef.current = false;
        setUploadingFile(false);
      }
    }
  };

  // Comment Attachments Upload
  const addLocalTaskCommentAttachment = (file: File) => {
    if (!file || isReadOnly) return;
    const validationError = validateTaskUploadFile(file, {
      maxMb: safeUploadMaxMb,
      extraForbiddenExts: safeForbiddenExts
    });
    if (validationError) {
      toast.error(t(validationError));
      return;
    }
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : '';
    const isRasterImg = (file.type.startsWith('image/') && file.type !== 'image/svg+xml') || RASTER_IMAGE_EXTENSIONS.has(ext);
    const previewUrl = isRasterImg ? URL.createObjectURL(file) : undefined;
    setCommentAttachments(prev => [...prev, { file, name: file.name, previewUrl }]);
    toast.success(t('Đã thêm tệp đính kèm'));
  };

  const handleCommentAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addLocalTaskCommentAttachment(file);
    e.target.value = '';
  };

  const removeTaskCommentAttachment = (index: number) => {
    setCommentAttachments(prev => {
      const target = prev[index];
      if (target?.previewUrl) {
        try { URL.revokeObjectURL(target.previewUrl); } catch {}
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const postCommentInFlightRef = useRef(false);
  const handlePostComment = async () => {
    if (isReadOnly) return;
    if (!newCommentText.trim() && commentAttachments.length === 0) return;
    if (postCommentInFlightRef.current) return;
    const targetId = activeTaskIdRef.current || task?.id;
    if (!targetId || targetId === 'new') return;

    postCommentInFlightRef.current = true;
    setIsSubmittingComment(true);
    setUploadingFile(true);

    try {
      const uploadedUrls: string[] = [];
      for (const att of commentAttachments) {
        if (att.url) {
          if (isSafeResourceUrl(att.url, { allowRelativeUploads: true })) {
            uploadedUrls.push(att.url);
          }
        } else if (att.file) {
          const sizeStr = (att.file.size / (1024 * 1024)).toFixed(1) + ' MB';
          const taskId = startUpload(att.name, sizeStr);

          const fd = new FormData();
          fd.append('file', att.file);

          updateProgress(taskId, 20, 'uploading');
          const res = await api.post('/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                updateProgress(taskId, percent, percent === 100 ? 'processing' : 'uploading');
              }
            }
          });
          const fileUrl = res.data?.data?.url || res.data?.url;
          if (fileUrl) {
            finishUpload(taskId, true);
            uploadedUrls.push(fileUrl);
          } else {
            finishUpload(taskId, false, res.data?.message || t('Lỗi tải tệp lên'));
            throw new Error(res.data?.message || t('Lỗi tải tệp lên'));
          }
        }
      }

      const commentText = newCommentText
        .replace(/&amp;nbsp;/gi, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
        .trim();

      const res = await api.post(`/activities/${targetId}/comments`, {
        content: commentText,
        attachments: uploadedUrls,
        parent_id: replyTo ? replyTo.id : null
      });

      if (res.data && (res.data.success || res.status === 200)) {
        // Only clear draft & input AFTER backend confirms persistence
        revokeAttachmentPreviewList(commentAttachments);
        setNewCommentText('');
        setCommentAttachments([]);
        setReplyTo(null);
        clearCommentDraft();

        if (String(activeTaskIdRef.current) !== String(targetId)) return;
        if (res.data.data?.participant_ids !== undefined && res.data.data?.participant_ids !== null) {
          setFormData((prev: any) => {
            const next = { ...prev, participant_ids: res.data.data.participant_ids };
            formDataRef.current = next;
            return next;
          });
        }
        await loadComments(Number(targetId));
        if (activeTabRef.current === 'timeline') await loadTimeline(Number(targetId));
        const latestForm = formDataRef.current || formData;
        if (onUpdate) onUpdate({ ...task, ...latestForm, id: targetId, comment_count: Number(latestForm.comment_count ?? task?.comment_count ?? 0) + 1 });
        toast.success(t('Đã thêm bình luận'));
      } else {
        toast.error(res.data?.message || t('Không thể gửi bình luận'));
      }
    } catch (e: any) {
      toast.error(t('Không thể gửi bình luận: ') + (e.response?.data?.message || e.message));
    } finally {
      postCommentInFlightRef.current = false;
      setIsSubmittingComment(false);
      setUploadingFile(false);
    }
  };

  // Subtask Comment Attachments Upload Helpers
  const addLocalSubtaskCommentAttachment = (file: File) => {
    if (!file || isReadOnly) return;
    const validationError = validateTaskUploadFile(file, {
      maxMb: safeUploadMaxMb,
      extraForbiddenExts: safeForbiddenExts
    });
    if (validationError) {
      toast.error(t(validationError));
      return;
    }
    const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() : '';
    const isRasterImg = (file.type.startsWith('image/') && file.type !== 'image/svg+xml') || RASTER_IMAGE_EXTENSIONS.has(ext);
    const previewUrl = isRasterImg ? URL.createObjectURL(file) : undefined;
    setSubtaskCommentAttachments(prev => [...prev, { file, name: file.name, previewUrl }]);
    toast.success(t('Đã thêm tệp đính kèm'));
  };

  const handleSubtaskCommentAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addLocalSubtaskCommentAttachment(file);
    e.target.value = '';
  };

  const removeSubtaskCommentAttachment = (index: number) => {
    setSubtaskCommentAttachments(prev => {
      const target = prev[index];
      if (target?.previewUrl) {
        try { URL.revokeObjectURL(target.previewUrl); } catch {}
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const subtaskCommentInFlightRef = useRef(false);
  const handlePostSubtaskComment = async () => {
    if (isReadOnly || !task || !selectedSubtask) return;
    if (!newSubtaskCommentText.trim() && subtaskCommentAttachments.length === 0) return;
    if (subtaskCommentInFlightRef.current) return;
    const targetId = activeTaskIdRef.current || task.id;
    if (!targetId || targetId === 'new') return;

    subtaskCommentInFlightRef.current = true;
    setIsSubmittingSubtaskComment(true);
    setUploadingFile(true);

    try {
      const uploadedUrls: string[] = [];
      for (const att of subtaskCommentAttachments) {
        if (att.file) {
          const sizeStr = (att.file.size / (1024 * 1024)).toFixed(1) + ' MB';
          const taskId = startUpload(att.name, sizeStr);

          const fd = new FormData();
          fd.append('file', att.file);

          updateProgress(taskId, 20, 'uploading');
          const res = await api.post('/upload', fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                updateProgress(taskId, percent, percent === 100 ? 'processing' : 'uploading');
              }
            }
          });
          const fileUrl = res.data?.data?.url || res.data?.url;
          if (fileUrl) {
            finishUpload(taskId, true);
            uploadedUrls.push(fileUrl);
          } else {
            finishUpload(taskId, false, res.data?.message || t('Lỗi tải tệp lên'));
            throw new Error(res.data?.message || t('Lỗi tải tệp lên'));
          }
        }
      }

      const commentText = newSubtaskCommentText
        .replace(/&amp;nbsp;/gi, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, ' ')
        .trim();

      const res = await api.post(`/activities/${targetId}/comments`, {
        content: commentText,
        attachments: uploadedUrls,
        subtask_id: selectedSubtask.id
      });

      if (res.data && res.data.success) {
        revokeAttachmentPreviewList(subtaskCommentAttachments);
        setNewSubtaskCommentText('');
        setSubtaskCommentAttachments([]);

        if (String(activeTaskIdRef.current) !== String(targetId)) return;
        if (res.data.data?.participant_ids !== undefined && res.data.data?.participant_ids !== null) {
          setFormData((prev: any) => {
            const next = { ...prev, participant_ids: res.data.data.participant_ids };
            formDataRef.current = next;
            return next;
          });
        }
        loadSubtaskComments(Number(targetId), selectedSubtask.id);
        loadSubtaskCommentCounts();
        const latestForm = formDataRef.current || formData;
        if (onUpdate) onUpdate({ ...task, ...latestForm, id: targetId });
        toast.success(t('Đã thêm bình luận việc con'));
      } else {
        toast.error(res.data?.message || t('Không thể gửi bình luận'));
      }
    } catch (e: any) {
      toast.error(t('Không thể gửi bình luận: ') + (e.response?.data?.message || e.message));
    } finally {
      subtaskCommentInFlightRef.current = false;
      setIsSubmittingSubtaskComment(false);
      setUploadingFile(false);
    }
  };

  const handleToggleParticipant = (userId: number) => {
    if (isReadOnly) return;
    const curForm = formDataRef.current || {};
    const primaryUserId = Number(curForm.user_id || 0);
    if (primaryUserId && userId === primaryUserId) {
      toast.error(t('Người thực hiện chính không cần thêm vào người liên quan'));
      return;
    }
    const current = getParticipantIds(curForm.participant_ids);
    const isSelected = current.includes(String(userId));

    if (isSelected) {
      const isAssignedToSubtask = ensureArray(erpMetaRef.current?.checklist).some((item: any) => {
        const assignedIds = getParticipantIds(item.assignee_id);
        return assignedIds.includes(String(userId));
      });
      if (isAssignedToSubtask) {
        toast.error(t('Người này hiện đang thực hiện công việc con'));
        return;
      }
      const next = current.filter(id => id !== String(userId));
      handleUpdateField('participant_ids', next.join(','));
    } else {
      const next = [...current.filter(id => Number(id) !== primaryUserId), String(userId)];
      handleUpdateField('participant_ids', next.join(','));
    }
  };

  const participantIds = useMemo(() => {
    return getParticipantIds(formData.participant_ids).map(Number);
  }, [formData.participant_ids]);

  const participants = useMemo(() => {
    const primaryUserId = Number(formData.user_id || 0);
    return users.filter(u => participantIds.includes(Number(u.id)) && Number(u.id) !== primaryUserId);
  }, [users, participantIds, formData.user_id]);

  const availableUsersForParticipantDropdown = useMemo(() => {
    const searchClean = removeAccents(participantSearch || '');
    const primaryUserId = Number(formData.user_id || 0);

    return users
      .filter((u: any) => {
        if (primaryUserId && Number(u.id) === primaryUserId) return false;
        if (!searchClean) return true;
        return (
          removeAccents(u.full_name || u.name || '').includes(searchClean) ||
          removeAccents(u.email || '').includes(searchClean) ||
          removeAccents(u.role || '').includes(searchClean)
        );
      })
      .sort((a, b) => {
        const aChecked = participantIds.includes(Number(a.id)) ? 1 : 0;
        const bChecked = participantIds.includes(Number(b.id)) ? 1 : 0;
        return bChecked - aChecked;
      });
  }, [users, participantSearch, participantIds, formData.user_id]);

  const handleSelectAllParticipants = () => {
    if (isReadOnly) return;
    const primaryUserId = Number(formDataRef.current?.user_id || 0);
    const validIds = availableUsersForParticipantDropdown
      .map((u: any) => Number(u.id))
      .filter((id: number) => id && id !== primaryUserId);

    const current = getParticipantIds(formDataRef.current?.participant_ids).map(Number);
    const combined = Array.from(new Set([...current, ...validIds])).map(String);
    handleUpdateField('participant_ids', combined.join(','));
    toast.success(t('Đã thêm tất cả người liên quan'));
  };

  const handleDeselectAllParticipants = () => {
    if (isReadOnly) return;
    const assignedIds = new Set<string>();
    ensureArray(erpMetaRef.current?.checklist).forEach((item: any) => {
      getParticipantIds(item.assignee_id).forEach(tId => assignedIds.add(tId));
    });

    const current = getParticipantIds(formDataRef.current?.participant_ids);
    const remaining = current.filter(id => assignedIds.has(id));
    handleUpdateField('participant_ids', remaining.join(','));
    if (remaining.length > 0) {
      toast.success(t('Đã bỏ chọn (ngoại trừ nhân sự có việc con)'));
    } else {
      toast.success(t('Đã bỏ chọn tất cả người liên quan'));
    }
  };

  const duplicateTaskInFlightRef = useRef(false);
  const handleDuplicateTask = async () => {
    if (isReadOnly || duplicateTaskInFlightRef.current) return;
    duplicateTaskInFlightRef.current = true;

    resetSaveQueueForTaskChange();
    if (commentsAbortRef.current) commentsAbortRef.current.abort();
    if (timelineAbortRef.current) timelineAbortRef.current.abort();
    if (subtaskCommentsAbortRef.current) subtaskCommentsAbortRef.current.abort();
    if (dependenciesAbortRef.current) dependenciesAbortRef.current.abort();
    if (whiteboardAbortRef.current) whiteboardAbortRef.current.abort();

    revokeAttachmentPreviewList(commentAttachmentsRef.current);
    revokeAttachmentPreviewList(subtaskAttachmentsRef.current);
    setComments([]);
    setSubtaskComments([]);
    setSubtaskCommentCounts({});
    setTimeline([]);
    setTimelinePage(1);
    setCommentsPage(1);
    setActiveTab('comments');
    setDependencies([]);
    setWhiteboardCanvas(EMPTY_WHITEBOARD_CANVAS);
    setWhiteboardVersion(0);
    setWhiteboardSnapshots([]);
    setSelectedSubtask(null);
    setNewCommentText('');
    setNewSubtaskCommentText('');
    setCommentAttachments([]);
    setSubtaskCommentAttachments([]);
    setReplyTo(null);
    clearCommentDraft();

    const sourceTaskId = activeTaskIdRef.current || task?.id;
    const curForm = formDataRef.current || formData;
    const curMeta = erpMetaRef.current || erpMeta;

    if (sourceTaskId && sourceTaskId !== 'new' && sourceTaskId !== 0 && sourceTaskId !== '0') {
      try {
        const res = await api.post(`/tasks/${sourceTaskId}/duplicate`);
        if (res.data?.success && res.data?.data) {
          const newTask = res.data.data;
          let detailData: any = null;
          if (newTask.id) {
            const detailRes = await api.get(`/activities/${newTask.id}`).catch(() => null);
            detailData = detailRes?.data?.data || detailRes?.data || null;
          }

          const mergedRaw = {
            ...curForm,
            ...newTask,
            ...(detailData && typeof detailData === 'object' ? detailData : {})
          };

          const resolvedSubject =
            mergedRaw.subject ||
            mergedRaw.title ||
            (curForm.subject ? `${safeCopyPrefix}${curForm.subject.replace(/^(\[Bản sao\]\s*)+/, '')}` : 'Công việc mới');
          const resolvedBody = mergedRaw.body || mergedRaw.description || '';

          const parsedBody = parseTaskBody(resolvedBody);
          const cleanChecklist = ensureArray(parsedBody.checklist).map((item: any, idx: number) => ({
            id: item.id && !ensureArray(curMeta.checklist).some((oldItem: any) => oldItem.id === item.id)
              ? item.id
              : `sub_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
            text: item.text || item.title || item.name || '',
            title: item.title || item.text || item.name || '',
            done: false,
            checked: false,
            status: 'pending',
            deadline: null,
            due_date: null,
            sub_deadline: null,
            priority: item.priority || safeDefaultPriority,
            user_id: item.user_id || item.assignee_id || null,
            assignee_id: item.assignee_id || item.user_id || null,
            assignee_name: item.assignee_name || null,
            assignee_avatar: item.assignee_avatar || null
          }));

          const nextErpMeta = {
            ...curMeta,
            description: sanitizeHtml(linkifyHtml(convertTextToHtmlParagraphs(parsedBody.description))),
            internal_type: parsedBody.internal_type || curMeta.internal_type || 'task',
            scope: parsedBody.scope || curMeta.scope || 'team',
            recurrence: parsedBody.recurrence || curMeta.recurrence || { pattern: 'none', weekly_days: [], monthly_day: 1, days_interval: 3, last_generated: '' },
            checklist: cleanChecklist,
            links: ensureArray(parsedBody.links, ensureArray(curMeta.links)),
            due_sla_notified: false,
            subtask_sla_notified: false
          };

          const cleanDuplicatedTask = {
            ...mergedRaw,
            id: newTask.id,
            subject: resolvedSubject,
            title: resolvedSubject,
            body: resolvedBody,
            description: resolvedBody,
            status: mergedRaw.status || 'planned',
            progress: 0,
            due_date: null,
            start_date: null,
            done_at: null,
            comments: [],
            comment_count: 0,
            subtask_comment_counts: {},
            __duplicatedFromId: sourceTaskId
          };

          duplicatedFromRef.current = { sourceId: String(sourceTaskId), newId: String(newTask.id) };
          prevTaskIdRef.current = newTask.id;
          activeTaskIdRef.current = newTask.id;
          isNewRef.current = false;
          setIsClonedDraft(false);
          formDataRef.current = cleanDuplicatedTask;
          erpMetaRef.current = nextErpMeta;
          setFormData(cleanDuplicatedTask);
          setErpMeta(nextErpMeta);
          setOriginalHash(computeCleanHash(cleanDuplicatedTask, nextErpMeta));

          toast.success(t('Đã nhân bản công việc thành công'));
          if (onUpdate) onUpdate(cleanDuplicatedTask);
          window.dispatchEvent(new CustomEvent('task-updated', { detail: cleanDuplicatedTask }));
          duplicateTaskInFlightRef.current = false;
          return;
        }
      } catch (err: any) {
        console.warn('Server duplicate fallback to local draft clone:', err);
      }
    }

    try {
      const originalChecklist = ensureArray(curMeta.checklist);
      const clonedChecklist = originalChecklist.map((item: any, idx: number) => ({
        id: `clone_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 7)}`,
        text: item.text || item.title || item.name || '',
        title: item.text || item.title || item.name || '',
        done: false,
        checked: false,
        status: 'pending',
        deadline: null,
        due_date: null,
        sub_deadline: null,
        priority: item.priority || 'medium',
        user_id: item.user_id || item.assignee_id || null,
        assignee_id: item.user_id || item.assignee_id || null,
        assignee_name: item.assignee_name || null,
        assignee_avatar: item.assignee_avatar || null
      }));

      const clonedFormData = {
        ...curForm,
        id: 'new',
        subject: curForm.subject ? `[Bản sao] ${curForm.subject.replace(/^(\[Bản sao\]\s*)+/, '')}` : 'Công việc mới',
        status: 'planned',
        progress: 0,
        due_date: null,
        start_date: null,
        deadline: null,
        created_at: getLocalDateTimeStr(),
        user_id: curForm.user_id || currentUser?.id,
        participant_ids: curForm.participant_ids || '',
        priority: curForm.priority || 'medium',
        type: curForm.type || 'task',
        task_group_id: curForm.task_group_id || null,
        task_group_name: curForm.task_group_name || null,
        related_type: curForm.related_type || null,
        related_id: curForm.related_id || null,
        contact_id: curForm.contact_id || null,
        created_by: currentUser?.id,
        created_by_name: currentUser?.name || (currentUser as any)?.full_name || '',
        created_by_avatar: currentUser?.avatar || (currentUser as any)?.avatar_url || '',
        comments: [],
        comment_count: 0,
        subtask_comment_counts: {}
      };

      const clonedErpMeta = {
        ...curMeta,
        checklist: clonedChecklist,
        due_sla_notified: false,
        subtask_sla_notified: false
      };

      isNewRef.current = true;
      formDataRef.current = clonedFormData;
      erpMetaRef.current = clonedErpMeta;
      setIsClonedDraft(true);
      setFormData(clonedFormData);
      setErpMeta(clonedErpMeta);
      setOriginalHash(computeCleanHash(clonedFormData, clonedErpMeta));

      toast.success(t('Đã nhân bản công việc. Dữ liệu đã được điền sẵn, hãy kiểm tra và bấm "Tạo việc" để lưu'));
    } finally {
      duplicateTaskInFlightRef.current = false;
    }
  };

  const drawerMotionProps = embedMode ? {} : {
    initial: isMobileOrTablet ? { opacity: 0, y: '100%' } : { opacity: 0, x: '80px' },
    animate: { y: 0, x: 0, opacity: 1 },
    exit: isMobileOrTablet ? { y: '60%', opacity: 0 } : { x: '60%', opacity: 0 },
    transition: { duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] as any },
    drag: false
  };

  // Ch.V Card & Label Styles
  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: embedMode ? '8px' : '12px',
    background: 'var(--color-surface, #FFFFFF)',
    border: '1px solid var(--color-border-light, #E2E8F0)',
    boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
    borderRadius: embedMode ? '12px' : '16px',
    padding: embedMode ? '1rem' : '1.4rem'
  };

  const cardLabelStyle: React.CSSProperties = {
    fontSize: '0.73rem',
    fontWeight: 700,
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  };

  const isSale = currentUser && ['sales', 'sale'].includes(String(currentUser.role || '').toLowerCase());

  const getContactFullName = (c: any) => {
    return (c?.full_name || '').trim() || c?.name || t('Khách hàng');
  };

  const allowedContacts = useMemo(() => {
    const activeContactId = formData.contact_id || (formData.related_type === 'contact' ? formData.related_id : null);
    return contacts.filter(c => {
      if (activeContactId && Number(c.id) === Number(activeContactId)) return true;
      if (isSale) return Number(c.owner_id) === Number(currentUser?.id);
      return true;
    });
  }, [contacts, formData.contact_id, formData.related_type, formData.related_id, isSale, currentUser?.id]);

  const primaryContactObj = useMemo(() => {
    const cid = formData.contact_id || (formData.related_type === 'contact' ? formData.related_id : null);
    if (!cid) return null;
    return allowedContacts.find(c => String(c.id) === String(cid)) || null;
  }, [allowedContacts, formData.contact_id, formData.related_type, formData.related_id]);

  const buildContactSearchKeywords = useCallback((c: any) => {
    const rawPhones = [c?.phone, c?.mobile, c?.phone2, c?.zalo_phone]
      .filter(Boolean)
      .map((p: any) => String(p).trim());
    const phoneVariants: string[] = [];
    rawPhones.forEach(p => {
      phoneVariants.push(p);
      const digits = p.replace(/[^0-9]/g, '');
      if (digits) {
        phoneVariants.push(digits);
        if (digits.startsWith('0') && digits.length >= 9) {
          phoneVariants.push(digits.slice(1));
          phoneVariants.push('84' + digits.slice(1));
          phoneVariants.push('+84' + digits.slice(1));
        } else if (digits.startsWith('84') && digits.length >= 10) {
          phoneVariants.push(digits.slice(2));
          phoneVariants.push('0' + digits.slice(2));
        } else if (digits.length >= 8 && !digits.startsWith('0')) {
          phoneVariants.push('0' + digits);
          phoneVariants.push('84' + digits);
        }
      }
    });
    return [
      ...phoneVariants,
      c?.email,
      c?.student_id,
      c?.citizen_id,
      c?.company,
      c?._matchedQuery,
    ]
      .filter(Boolean)
      .join(' ');
  }, []);

  const buildContactSelectOption = useCallback((c: any) => ({
    value: String(c.id),
    label: getContactFullName(c),
    sublabel: [c?.phone || c?.mobile, c?.email, c?.student_id].filter(Boolean).join(' • ') || undefined,
    searchKeywords: buildContactSearchKeywords(c),
    avatar: c.avatar_url || c.avatar
  }), [buildContactSearchKeywords]);

  const contactOptions = useMemo(() => {
    if ((loadingContacts || searchingContacts) && allowedContacts.length === 0) {
      return [{ value: '', label: t('Đang tải danh sách khách hàng...') }];
    }
    return [
      { value: '', label: t('Chọn khách hàng chính...') },
      ...allowedContacts.map(buildContactSelectOption)
    ];
  }, [allowedContacts, buildContactSelectOption, loadingContacts, searchingContacts, t]);

  const userSelectOptions = useMemo(() => {
    return users.map(u => ({
      value: String(u.id),
      label: u.full_name || u.name,
      avatar: u.avatar || u.avatar_url
    }));
  }, [users]);

  const approverSelectOptions = useMemo(() => {
    return users.map(u => ({
      value: String(u.id),
      label: `${u.full_name || u.name} (${getRoleDisplayName(u)})`,
      avatar: u.avatar || u.avatar_url
    }));
  }, [users]);

  const filteredUsersForParticipants = useMemo(() => {
    const searchClean = removeAccents(participantsSearch || '');
    const primaryUserId = Number(formData.user_id || 0);
    return users
      .filter(u => {
        if (primaryUserId && Number(u.id) === primaryUserId) return false;
        if (!searchClean) return true;
        return (
          removeAccents(u.full_name || u.name || '').includes(searchClean) ||
          removeAccents(u.email || '').includes(searchClean) ||
          removeAccents(u.role || '').includes(searchClean)
        );
      })
      .sort((a, b) => {
        const aChecked = participantIds.includes(Number(a.id)) ? 1 : 0;
        const bChecked = participantIds.includes(Number(b.id)) ? 1 : 0;
        return bChecked - aChecked;
      });
  }, [users, participantsSearch, participantIds, formData.user_id]);

  const currentHash = useMemo(() => computeCleanHash(formData, erpMeta), [formData, erpMeta, computeCleanHash]);
  const _hasChanges = originalHash !== currentHash;
  void _hasChanges;

  if (!task) return null;

  const isHydratingSkeleton = Boolean(
    !isNew &&
    task?.subject === 'Đang tải công việc...' &&
    (!formData?.id || formData?.subject === 'Đang tải công việc...')
  );

  const handleImageClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target || target.tagName !== 'IMG') return;
    const imgEl = target as HTMLImageElement;
    if (!imgEl.src || !isSafeResourceUrl(imgEl.src, { allowRelativeUploads: true, allowBlob: true })) return;

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
      imgEl.closest('.custom-select') ||
      imgEl.closest('button')
    ) {
      return;
    }

    const container =
      imgEl.closest('.rich-comment-content') ||
      imgEl.closest('.rich-text-editor-content') ||
      imgEl.closest('[id^="workspace-comment-"]') ||
      imgEl.closest('.task-description-body') ||
      imgEl.closest('.task-attachments-list');
    if (!container) return;

    e.preventDefault();
    e.stopPropagation();
    const src = imgEl.src;
    const allImgs = Array.from(
      container.querySelectorAll('img:not([data-avatar]):not([data-no-lightbox]):not([data-mention-avatar]):not([class*="avatar"])')
    ) as HTMLImageElement[];
    const imgItems: AttachmentItem[] = allImgs
      .filter(img => isSafeResourceUrl(img.src, { allowRelativeUploads: true, allowBlob: true }))
      .map(img => ({
        url: img.src,
        name: img.alt || 'Hình ảnh',
        type: 'image' as const
      }));

    const clickedIdx = imgItems.findIndex(x => x.url === src);
    setLightboxState({
      isOpen: true,
      items: imgItems.length > 0 ? imgItems : [{ url: src, name: imgEl.alt || 'Hình ảnh', type: 'image' }],
      initialIndex: Math.max(0, clickedIdx)
    });
  };

  const executeClearCustomerLinks = async () => {
    const curForm = formDataRef.current || {};
    const curMeta = erpMetaRef.current || {};
    const isContactRelated = curForm.related_type === 'contact';
    const nextPatch: Record<string, any> = {
      contact_id: null,
      contact_name: '',
      contact_avatar: '',
      contact_phone: '',
      contact_email: '',
      ...(isContactRelated ? { related_id: null, related_type: null } : {})
    };
    const updatedMeta = { ...curMeta, related_contact_ids: [] };
    setIsCustomerLinked(false);
    await enqueueTaskUpdate({
      fieldPatch: nextPatch,
      metaUpdate: updatedMeta,
      dirtyMetaFields: ['related_contact_ids']
    });
  };

  const portalComputeRect = (el: HTMLElement | null, width = 260, height = 280) => {
    if (!el || typeof window === 'undefined') return { top: 80, left: 20, openUp: false };
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < height + 16 && rect.top > height + 16;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
    const top = openUp ? Math.max(12, rect.top - height - 6) : Math.min(window.innerHeight - 60, rect.bottom + 6);
    return { top, left, openUp };
  };

  // ==========================================================================
  // UNIFIED MODALS & PORTAL DROPDOWNS NODE (works in both embedMode & normal)
  // ==========================================================================

  const shouldRenderModalsPortal = (isOpen && Boolean(task)) || lightboxState.isOpen;
  const shouldRenderContent = Boolean(isOpen && task && (embedMode || !isClosing));

  const modalsAndDropdownsPortal = (shouldRenderModalsPortal && typeof document !== 'undefined') ? createPortal(
    <>
      {/* Subtask Assignee Fixed Portal Dropdown */}
      {activeAssigneeDropdownId !== null && subtaskDropdownRect && (() => {
        const targetSubItem = ensureArray(erpMeta.checklist).find((it: any) => String(it.id) === String(activeAssigneeDropdownId));
        if (!targetSubItem) return null;
        const assignedIds = getParticipantIds(targetSubItem.assignee_id);
        return (
          <div
            onClick={(e) => e.stopPropagation()}
            className="subtask-assignee-dropdown"
            style={{
              position: 'fixed',
              top: subtaskDropdownRect.top,
              left: subtaskDropdownRect.left,
              zIndex: effectiveZIndex + 4,
              background: 'var(--color-surface, #ffffff)',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)',
              minWidth: '230px',
              maxWidth: '280px',
              maxHeight: '240px',
              overflowY: 'auto',
              padding: '6px',
              display: 'flex',
              flexDirection: 'column',
              gap: '2px'
            }}
          >
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', padding: '4px 8px' }}>
              {t('Phân công người thực hiện:')}
            </div>
            <div
              onClick={(e) => {
                e.stopPropagation();
                handleUpdateChecklistItemAssignee(targetSubItem.id, '');
                setActiveAssigneeDropdownId(null);
              }}
              style={{
                padding: '6px 8px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: '#BD1D2D',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
              className="hover-bg-alt"
            >
              <span>✕ {t('Bỏ phân công (Chưa ai làm)')}</span>
            </div>
            {users.map((u: any) => {
              const isAssigned = assignedIds.includes(String(u.id));
              return (
                <div
                  key={u.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    const nextAssignees = isAssigned
                      ? assignedIds.filter(id => id !== String(u.id))
                      : [...assignedIds, String(u.id)];
                    handleUpdateChecklistItemAssignee(targetSubItem.id, nextAssignees.join(','));
                  }}
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    background: isAssigned ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                    color: isAssigned ? '#BD1D2D' : '#0F172A',
                    fontWeight: isAssigned ? 700 : 500
                  }}
                  className="hover-bg-alt"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={18} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.full_name || u.name}
                    </span>
                  </div>
                  {isAssigned && <Check size={12} color="#BD1D2D" />}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Team Fixed Portal Dropdown */}
      {showTeamDropdown && teamDropdownRect && (
        <div
          ref={teamDropdownRef}
          className="team-dropdown-portal"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: teamDropdownRect.top,
            left: teamDropdownRect.left,
            zIndex: effectiveZIndex + 4,
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid #E2E8F0',
            borderRadius: '14px',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.16)',
            minWidth: '260px',
            maxWidth: '300px',
            maxHeight: '280px',
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px'
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', padding: '6px 8px', borderBottom: '1px dashed #E2E8F0', marginBottom: '4px' }}>
            {t('Chọn team liên kết:')}
          </div>
          {allowedTeams.map((tItem: any) => {
            const selectedTeamIds = ensureArray(erpMeta?.team_ids, erpMeta?.team_id ? [erpMeta.team_id] : []);
            const isSelected = selectedTeamIds.some((id: any) => String(id) === String(tItem.id));

            return (
              <div
                key={tItem.id}
                onClick={() => {
                  let nextTeamIds = [...selectedTeamIds];
                  if (isSelected) {
                    nextTeamIds = nextTeamIds.filter((id: any) => String(id) !== String(tItem.id));
                  } else {
                    nextTeamIds.push(tItem.id);
                    const teamUsers = users.filter(u => Number(u.team_id) === Number(tItem.id));
                    if (teamUsers.length > 0) {
                      const currentP = getParticipantIds(formDataRef.current?.participant_ids);
                      const nextP = [...currentP];
                      let addedCount = 0;
                      teamUsers.forEach(u => {
                        const uidStr = String(u.id);
                        if (!nextP.includes(uidStr) && Number(uidStr) !== Number(formDataRef.current?.user_id)) {
                          nextP.push(uidStr);
                          addedCount++;
                        }
                      });
                      if (addedCount > 0) {
                        handleUpdateField('participant_ids', nextP.join(','));
                        toast.success(t('Đã tự động thêm {count} nhân sự thuộc phòng ban vào người liên quan.').replace('{count}', String(addedCount)));
                      }
                    }
                  }

                  const nextPrimaryTeamId = nextTeamIds[0] || null;
                  const curMeta = erpMetaRef.current || erpMeta;
                  const nextMeta = { ...curMeta, team_ids: nextTeamIds, team_id: nextPrimaryTeamId };

                  // Sync related_type/related_id cleanly when last team is unlinked (prevents ghost team re-binding!)
                  const curForm = formDataRef.current || {};
                  if (!nextPrimaryTeamId && curForm.related_type === 'team') {
                    const fallbackCid = curForm.contact_id || null;
                    formDataRef.current = {
                      ...curForm,
                      team_id: undefined,
                      related_type: fallbackCid ? 'contact' : null,
                      related_id: fallbackCid || null
                    };
                    setFormData(formDataRef.current);
                  }

                  handleSaveMeta(nextMeta, undefined, { dirtyMetaFields: ['team_ids', 'team_id'] });
                }}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isSelected ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                  color: isSelected ? '#BD1D2D' : '#0F172A',
                  fontWeight: isSelected ? 700 : 500
                }}
                className="hover-bg-alt"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={14} color={isSelected ? '#BD1D2D' : '#64748B'} />
                  <span>{tItem.name}</span>
                </div>
                {isSelected && <Check size={12} color="#BD1D2D" strokeWidth={3} />}
              </div>
            );
          })}
        </div>
      )}

      {/* Participant Fixed Portal Dropdown */}
      {showParticipantDropdown && participantDropdownRect && (
        <div
          ref={participantDropdownRef}
          className="participant-dropdown-portal"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: participantDropdownRect.top,
            left: participantDropdownRect.left,
            zIndex: effectiveZIndex + 4,
            background: 'var(--color-surface, #ffffff)',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            boxShadow: '0 12px 28px rgba(15, 23, 42, 0.18)',
            minWidth: '250px',
            maxWidth: isMobileOrTablet ? 'calc(100vw - 24px)' : '320px',
            maxHeight: '280px',
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}
        >
          <div style={{ position: 'sticky', top: 0, background: 'var(--color-surface, #ffffff)', zIndex: 10, paddingBottom: '4px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <Search size={13} style={{ position: 'absolute', left: '8px', color: '#64748B', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder={t('Tìm người liên quan...')}
                value={participantSearch}
                onChange={(e) => setParticipantSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  padding: '6px 8px 6px 26px',
                  fontSize: '0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  background: '#F8FAFC',
                  color: '#0F172A',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 2px 4px 2px', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                {t('Đã chọn')} {participantIds.length}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectAllParticipants();
                  }}
                  style={{ fontSize: '0.72rem', fontWeight: 700, color: '#BD1D2D', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}
                  className="hover-bg-alt"
                >
                  {t('Chọn tất cả')}
                </button>
                {participantIds.length > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeselectAllParticipants();
                    }}
                    style={{ fontSize: '0.72rem', color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: '4px' }}
                    className="hover-bg-alt"
                  >
                    {t('Bỏ chọn')}
                  </button>
                )}
              </div>
            </div>
          </div>
          {availableUsersForParticipantDropdown.map((u: any) => {
            const isSelected = participantIds.includes(Number(u.id));
            return (
              <div
                key={u.id}
                onClick={() => handleToggleParticipant(Number(u.id))}
                style={{
                  padding: '6px 8px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: isSelected ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                  color: isSelected ? '#BD1D2D' : '#0F172A',
                  fontWeight: isSelected ? 600 : 400
                }}
                className="hover-bg-alt"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, flex: 1 }}>
                  <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={20} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.full_name || u.name}</span>
                </div>
                {isSelected && <Check size={12} color="#BD1D2D" strokeWidth={3} style={{ flexShrink: 0, marginLeft: '4px' }} />}
              </div>
            );
          })}
          {availableUsersForParticipantDropdown.length === 0 && (
            <div style={{ textAlign: 'center', padding: '10px 4px', fontSize: '0.75rem', color: '#64748B' }}>
              {t('Không tìm thấy kết quả')}
            </div>
          )}
        </div>
      )}

      {/* Modals Stack (zIndex >= 2147483646, synchronized 220ms transitions) */}
      <AnimatePresence>
        {showParticipantsModal && (
          <motion.div
            key="participants-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            className="modal-backdrop modal-above-drawer"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.58)',
              zIndex: effectiveZNestedModal,
              ...({ '--modal-z': effectiveZNestedModal } as any),
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={() => { setShowParticipantsModal(false); setShowAddParticipantsSection(false); }}
          >
            <motion.div
              key="participants-modal-card"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                width: '850px',
                maxWidth: '94vw',
                height: '80vh',
                background: 'var(--color-surface, #ffffff)',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 20px 50px rgba(15, 23, 42, 0.28)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', margin: 0 }}>
                    {t('Quản lý người liên quan & công việc')}
                  </h3>
                  <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '4px 0 0' }}>
                    {t('Chọn thành viên tham gia và theo dõi tiến độ của từng người')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setShowParticipantsModal(false); setShowAddParticipantsSection(false); }}
                  style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('Tìm kiếm thành viên...')}
                  value={participantsSearch}
                  onChange={(e) => setParticipantsSearch(e.target.value)}
                  style={{ paddingLeft: '12px', fontSize: '0.8rem', borderRadius: '8px' }}
                />
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.5rem' }} className="custom-scrollbar">
                {(() => {
                  const currentRelatedUsers = filteredUsersForParticipants.filter((u: any) => participantIds.includes(Number(u.id)));
                  const nonRelatedUsers = filteredUsersForParticipants.filter((u: any) => !participantIds.includes(Number(u.id)));
                  const modalSearchClean = removeAccents(participantModalSearch.trim());

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
                          {t('Thành viên liên quan')} ({currentRelatedUsers.length})
                        </span>
                        {currentRelatedUsers.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '24px 0', color: '#64748B', fontSize: '0.78rem', border: '1px dashed #E2E8F0', borderRadius: '12px' }}>
                            {t('Chưa có thành viên liên quan nào')}
                          </div>
                        ) : (
                          currentRelatedUsers.map((u: any) => {
                            const subtasks = ensureArray(erpMeta.checklist).filter((item: any) =>
                              getParticipantIds(item.assignee_id).includes(String(u.id))
                            );
                            return (
                              <div
                                key={u.id}
                                style={{
                                  background: '#F8FAFC',
                                  border: '1px solid #E2E8F0',
                                  borderRadius: '12px',
                                  padding: '12px 16px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '8px'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <input
                                      type="checkbox"
                                      checked={true}
                                      disabled={isReadOnly}
                                      onChange={() => handleToggleParticipant(u.id)}
                                      style={{ width: '16px', height: '16px', cursor: isReadOnly ? 'not-allowed' : 'pointer', accentColor: '#BD1D2D' }}
                                    />
                                    <Avatar src={u.avatar_url || u.avatar} name={u.full_name} size={28} />
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A' }}>{u.full_name}</span>
                                      <span style={{ fontSize: '0.6875rem', color: '#64748B' }}>{getRoleDisplayName(u)}</span>
                                    </div>
                                  </div>
                                </div>

                                <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '8px', marginTop: '4px' }}>
                                  {subtasks.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginLeft: '36px' }}>
                                      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
                                        {t('Nhiệm vụ được giao')} ({subtasks.length}):
                                      </span>
                                      {subtasks.map((st: any) => {
                                        const stDone = isSubtaskDone(st);
                                        return (
                                          <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem' }}>
                                            <input type="checkbox" checked={stDone} readOnly style={{ width: 12, height: 12, accentColor: '#10b981', cursor: 'default' }} />
                                            <span style={{ textDecoration: stDone ? 'line-through' : 'none', color: stDone ? '#64748B' : '#0F172A' }}>
                                              {st.title}
                                            </span>
                                            {st.due_date && (
                                              <span style={{
                                                fontSize: '0.68rem',
                                                color: '#64748B',
                                                background: '#ffffff',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                border: '1px solid #E2E8F0',
                                                marginLeft: '8px',
                                                fontVariantNumeric: 'tabular-nums'
                                              }}>
                                                {t('Hạn')}: {formatDateVN(st.due_date)}
                                              </span>
                                            )}
                                            {st.priority && st.priority !== 'medium' && (
                                              <span style={{
                                                fontSize: '0.625rem',
                                                fontWeight: 700,
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: st.priority === 'high' ? 'rgba(189, 29, 45, 0.08)' : '#F1F5F9',
                                                color: st.priority === 'high' ? '#BD1D2D' : '#334155',
                                                textTransform: 'uppercase',
                                                marginLeft: '6px'
                                              }}>
                                                {st.priority === 'high' ? t('Cao') : t('Thấp')}
                                              </span>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '0.6875rem', color: '#64748B', marginLeft: '36px' }}>
                                      {t('Chưa giao việc con nào')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>

                      {!isReadOnly && (
                        <div style={{ marginTop: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '16px' }}>
                          {!showAddParticipantsSection ? (
                            <div style={{ display: 'flex', justifyContent: 'center' }}>
                              <button
                                type="button"
                                onClick={() => setShowAddParticipantsSection(true)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 20px',
                                  background: 'rgba(189, 29, 45, 0.06)',
                                  color: '#BD1D2D',
                                  border: '1px dashed #BD1D2D',
                                  borderRadius: '10px',
                                  fontSize: '0.8rem',
                                  fontWeight: 700,
                                  cursor: 'pointer'
                                }}
                              >
                                <UserPlus size={15} />
                                {t('Thêm thành viên')}
                              </button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', fontVariantNumeric: 'tabular-nums' }}>
                                  {t('Thành viên chưa liên quan')} ({nonRelatedUsers.length})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setShowAddParticipantsSection(false)}
                                  style={{ border: 'none', background: 'transparent', color: '#BD1D2D', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                  {t('Thu gọn')}
                                </button>
                              </div>

                              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', margin: '2px 0 6px 0' }}>
                                <Search size={13} style={{ position: 'absolute', left: '8px', color: '#64748B', pointerEvents: 'none' }} />
                                <input
                                  type="text"
                                  placeholder={t('Tìm thành viên chưa liên quan...')}
                                  value={participantModalSearch}
                                  onChange={(e) => setParticipantModalSearch(e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '6px 8px 6px 26px',
                                    fontSize: '0.75rem',
                                    borderRadius: '6px',
                                    border: '1px solid #E2E8F0',
                                    background: '#F8FAFC',
                                    color: '#0F172A',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                  }}
                                />
                              </div>

                              {nonRelatedUsers.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '16px 0', color: '#64748B', fontSize: '0.75rem' }}>
                                  {t('Tất cả nhân sự đều đã được thêm làm người liên quan')}
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto', paddingRight: '4px' }} className="custom-scrollbar">
                                  {nonRelatedUsers
                                    .filter((u: any) => {
                                      if (!modalSearchClean) return true;
                                      return (
                                        removeAccents(u.full_name || u.name || '').includes(modalSearchClean) ||
                                        removeAccents(u.email || '').includes(modalSearchClean) ||
                                        removeAccents(u.role || '').includes(modalSearchClean)
                                      );
                                    })
                                    .map((u: any) => (
                                      <div
                                        key={u.id}
                                        style={{
                                          background: '#ffffff',
                                          border: '1px solid #E2E8F0',
                                          borderRadius: '10px',
                                          padding: '8px 12px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'space-between'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                          <input
                                            type="checkbox"
                                            checked={false}
                                            onChange={() => handleToggleParticipant(u.id)}
                                            style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#BD1D2D' }}
                                          />
                                          <Avatar src={u.avatar_url || u.avatar} name={u.full_name} size={28} />
                                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0F172A' }}>{u.full_name}</span>
                                            <span style={{ fontSize: '0.6875rem', color: '#64748B' }}>{getRoleDisplayName(u)}</span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', background: '#F8FAFC' }}>
                <button className="btn outline" onClick={() => { setShowParticipantsModal(false); setShowAddParticipantsSection(false); }} style={{ borderRadius: '8px', padding: '6px 20px' }}>
                  {t('Đóng')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {selectedSubtaskForParticipants && (
          <motion.div
            key="subtask-participants-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            className="modal-backdrop modal-above-drawer"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.58)',
              zIndex: effectiveZNestedModal,
              ...({ '--modal-z': effectiveZNestedModal } as any),
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={() => setSelectedSubtaskForParticipants(null)}
          >
            <motion.div
              key="subtask-participants-card"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              style={{
                width: '450px',
                maxWidth: '90vw',
                background: 'var(--color-surface, #ffffff)',
                borderRadius: '16px',
                border: '1px solid #E2E8F0',
                boxShadow: '0 20px 50px rgba(15, 23, 42, 0.28)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ padding: '16px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                    {t('Người thực hiện công việc con')}
                  </h3>
                  <p style={{ fontSize: '0.72rem', color: '#64748B', margin: '2px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '340px' }}>
                    {selectedSubtaskForParticipants.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSubtaskForParticipants(null)}
                  style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer' }}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ padding: '16px 24px', maxHeight: '400px', overflowY: 'auto' }} className="custom-scrollbar">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(() => {
                    const rawAssigneeId = selectedSubtaskForParticipants.assignee_id || (isPersonalTask && personalUser?.id ? String(personalUser.id) : '');
                    const assigneeIds = getParticipantIds(rawAssigneeId);
                    let subtaskUsers = assigneeIds.map((id: string) => users.find((u: any) => String(u.id) === String(id))).filter(Boolean);
                    if (subtaskUsers.length === 0 && isPersonalTask && personalUser) {
                      subtaskUsers = [personalUser];
                    }

                    if (subtaskUsers.length === 0) {
                      return (
                        <div style={{ textAlign: 'center', padding: '16px 0', color: '#64748B', fontSize: '0.8rem' }}>
                          {t('Chưa phân công ai')}
                        </div>
                      );
                    }

                    return subtaskUsers.map((u: any) => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        <Avatar src={u.avatar_url || u.avatar} name={u.full_name} size={32} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '0.825rem', fontWeight: 600, color: '#0F172A' }}>{u.full_name}</span>
                          <span style={{ fontSize: '0.6875rem', color: '#64748B' }}>{getRoleDisplayName(u)}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              <div style={{ padding: '14px 24px', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end', background: '#F8FAFC' }}>
                <button className="btn outline" onClick={() => setSelectedSubtaskForParticipants(null)} style={{ borderRadius: '8px', padding: '6px 20px', fontSize: '0.8rem' }}>
                  {t('Đóng')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showValidationModal && (
          <motion.div
            key="validation-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            className="overlay-backdrop modal-above-drawer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: effectiveZNestedModal, ...({ '--modal-z': effectiveZNestedModal } as any) }}
            onClick={() => setShowValidationModal(false)}
          >
            <motion.div
              key="validation-modal-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--color-surface, #ffffff)',
                width: '90%',
                maxWidth: '420px',
                borderRadius: '16px',
                padding: '2rem',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1rem'
              }}
            >
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertCircle size={26} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#0F172A' }}>
                {t('Thiếu thông tin người phê duyệt')}
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                {t('Bạn đã kích hoạt chức năng "Yêu cầu phê duyệt" cho công việc này, nhưng chưa phân công Người phê duyệt. Vui lòng chọn người phê duyệt trước khi lưu hoặc đóng cửa sổ.')}
              </p>
              <button
                className="btn primary"
                onClick={() => setShowValidationModal(false)}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', fontWeight: 700, background: '#BD1D2D', borderColor: '#BD1D2D' }}
              >
                {t('Đã hiểu, quay lại chọn')}
              </button>
            </motion.div>
          </motion.div>
        )}

        {showUnsavedNewTaskPrompt && (
          <motion.div
            key="unsaved-new-task-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            className="overlay-backdrop modal-above-drawer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: effectiveZNestedModal, ...({ '--modal-z': effectiveZNestedModal } as any) }}
            onClick={() => setShowUnsavedNewTaskPrompt(false)}
          >
            <motion.div
              key="unsaved-new-task-card"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--color-surface, #ffffff)',
                width: '92%',
                maxWidth: '430px',
                borderRadius: '16px',
                padding: '1.75rem 1.5rem',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1rem'
              }}
            >
              <div style={{
                width: '52px',
                height: '52px',
                borderRadius: '50%',
                background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertTriangle size={26} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                  {t('Công việc chưa được tạo')}
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                  {t('Bạn đang tạo công việc mới mà chưa bấm tạo thật sự. Bạn muốn thoát luôn hay tạo ngay bây giờ?')}
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', marginTop: '4px' }}>
                <button
                  type="button"
                  className="btn primary"
                  onClick={async () => {
                    if (!formDataRef.current?.subject?.trim()) {
                      toast.error(t('Vui lòng nhập tên công việc trước khi tạo'));
                      setShowUnsavedNewTaskPrompt(false);
                      const titleInput = document.querySelector('input[placeholder*="tên công việc"]') as HTMLInputElement;
                      if (titleInput) titleInput.focus();
                      return;
                    }
                    setShowUnsavedNewTaskPrompt(false);
                    await handleManualSave();
                  }}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    background: '#BD1D2D',
                    borderColor: '#BD1D2D',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '0.9rem',
                    cursor: 'pointer'
                  }}
                >
                  <Save size={16} />
                  {t('Tạo ngay')}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowUnsavedNewTaskPrompt(false);
                    cleanupDeepLinkParams();
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    fontWeight: 700,
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    border: '1px solid rgba(189, 29, 45, 0.2)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    fontSize: '0.9rem'
                  }}
                >
                  <X size={16} />
                  {t('Thoát luôn')}
                </button>

                <button
                  type="button"
                  onClick={() => setShowUnsavedNewTaskPrompt(false)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#64748B',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '6px 12px'
                  }}
                >
                  {t('Tiếp tục chỉnh sửa')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showApprovalSuccessModal && (
          <motion.div
            key="approval-success-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            className="overlay-backdrop modal-above-drawer"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: effectiveZNestedModal, ...({ '--modal-z': effectiveZNestedModal } as any) }}
            onClick={() => setShowApprovalSuccessModal(null)}
          >
            <motion.div
              key="approval-success-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--color-surface, #ffffff)',
                width: '90%',
                maxWidth: '440px',
                borderRadius: '16px',
                padding: '2rem',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
                gap: '1.25rem'
              }}
            >
              <div style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.1)',
                color: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <CheckSquare2 size={28} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>
                  {t('Đã gửi yêu cầu phê duyệt')}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700, margin: 0 }}>
                  {t('Tiến độ đạt 100%')}
                </p>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0, lineHeight: 1.5 }}>
                {t('Hệ thống đã gửi thông báo khẩn cấp và email xác nhận đến Người phê duyệt:')}
                <br />
                <strong style={{ color: '#0F172A', display: 'inline-block', marginTop: '0.5rem', fontSize: '0.9rem' }}>
                  {showApprovalSuccessModal}
                </strong>
                <br />
                {t('Trạng thái công việc được chuyển sang "Đang chờ duyệt". Bạn sẽ nhận được thông báo ngay khi có kết quả phê duyệt.')}
              </p>
              <button
                className="btn primary"
                onClick={() => setShowApprovalSuccessModal(null)}
                style={{ width: '100%', padding: '10px', borderRadius: '10px', fontWeight: 700, background: '#BD1D2D', borderColor: '#BD1D2D' }}
              >
                {t('Đóng')}
              </button>
            </motion.div>
          </motion.div>
        )}

        {meetingToComplete && (
          <motion.div
            key="meeting-proof-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            className="modal-above-drawer"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: effectiveZNestedModal,
              ...({ '--modal-z': effectiveZNestedModal } as any),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onClick={() => { if (!completingMeeting) { setSafeProofPreview(null); setMeetingToComplete(null); } }}
          >
            <motion.div
              key="meeting-proof-card"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 500,
                padding: '1.5rem',
                borderRadius: '16px',
                overflow: 'hidden',
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid #E2E8F0',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.15rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Camera style={{ color: '#BD1D2D' }} size={20} />
                  {t('Cung cấp ảnh minh chứng')}
                </h3>
                <button
                  type="button"
                  disabled={completingMeeting}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}
                  onClick={() => { setSafeProofPreview(null); setMeetingToComplete(null); }}
                >
                  <X size={16} />
                </button>
              </div>

              <p style={{ fontSize: '0.85rem', color: '#64748B', marginBottom: '1.25rem', lineHeight: 1.5, margin: 0 }}>
                {t('Gặp gỡ này chưa có ảnh đính kèm trong phần bình luận. Bạn phải tải lên ảnh minh chứng (chụp ảnh cùng khách hàng, sa bàn, v.v.) để hoàn thành cuộc gặp.')}
              </p>

              <div style={{ marginBottom: '1.25rem', marginTop: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>{t('Ảnh minh chứng *')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {proofImagePreview ? (
                    <div style={{ position: 'relative', width: '100%', height: '180px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #E2E8F0' }}>
                      <img src={proofImagePreview} alt="Proof preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button
                        type="button"
                        onClick={() => {
                          setProofImageFile(null);
                          setSafeProofPreview(null);
                        }}
                        style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(15, 23, 42, 0.7)', color: 'white', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '120px', border: '2px dashed #E2E8F0', borderRadius: '10px', cursor: 'pointer', background: '#F8FAFC' }}>
                      <Camera size={28} style={{ color: '#64748B', marginBottom: '6px' }} />
                      <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 600 }}>{t('Tải ảnh lên (JPEG, PNG, WebP)')}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file) return;
                          const validationErr = validateTaskUploadFile(file, {
                            imageOnly: true,
                            maxMb: safeUploadMaxMb,
                            extraForbiddenExts: safeForbiddenExts
                          });
                          if (validationErr) {
                            toast.error(t(validationErr));
                            return;
                          }
                          const previewUrl = URL.createObjectURL(file);
                          setProofImageFile(file);
                          setSafeProofPreview(previewUrl);
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>{t('Nội dung bình luận')}</label>
                <textarea
                  style={{ width: '100%', minHeight: '80px', fontSize: '0.875rem', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', outline: 'none', resize: 'none', background: '#F8FAFC', color: '#0F172A' }}
                  value={proofCommentText}
                  onChange={(e) => setProofCommentText(e.target.value)}
                  placeholder={t('Nhập ghi chú hoặc mô tả về buổi gặp gỡ...')}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn outline"
                  onClick={() => { setSafeProofPreview(null); setMeetingToComplete(null); }}
                  disabled={completingMeeting}
                >
                  {t('Hủy')}
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!proofImageFile || completingMeeting}
                  onClick={async () => {
                    if (!proofImageFile || !meetingToComplete) return;
                    if (completeMeetingInFlightRef.current) return;
                    const targetTid = activeTaskIdRef.current;
                    if (!targetTid || targetTid === 'new') return;

                    const validationErr = validateTaskUploadFile(proofImageFile, {
                      imageOnly: true,
                      maxMb: safeUploadMaxMb,
                      extraForbiddenExts: safeForbiddenExts
                    });
                    if (validationErr) {
                      toast.error(t(validationErr));
                      return;
                    }

                    completeMeetingInFlightRef.current = true;
                    setCompletingMeeting(true);
                    try {
                      let fileToUpload = proofImageFile;
                      const { compressToWebP } = await import('../utils/imageCompress');
                      fileToUpload = await compressToWebP(proofImageFile, safeWebpQuality);

                      const fd = new FormData();
                      fd.append('file', fileToUpload);
                      const uploadRes = await api.post('/upload', fd, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                      });
                      const uploadedUrl = uploadRes.data?.data?.url ?? uploadRes.data?.url ?? '';
                      if (!uploadedUrl || !isSafeResourceUrl(uploadedUrl, { allowRelativeUploads: true })) {
                        throw new Error(t('Không thể tải ảnh lên'));
                      }

                      await api.post(`/activities/${targetTid}/comments`, {
                        content: proofCommentText,
                        attachments: [uploadedUrl],
                        parent_id: null
                      });

                      const prevStatus = formDataRef.current?.status || 'open';
                      const prevProgress = formDataRef.current?.progress || 0;
                      const resUpdate = await enqueueTaskUpdate({ fieldPatch: { status: 'done', progress: 100 } });
                      if (resUpdate.success) {
                        triggerLocalConfetti();
                        setSafeProofPreview(null);
                        setMeetingToComplete(null);
                        loadComments(Number(targetTid));
                        showUndoToast({
                          message: t('Đã tải ảnh minh chứng và hoàn thành gặp gỡ'),
                          subMessage: t('Bấm để hoàn tác nếu bạn thao tác nhầm'),
                          onUndo: async () => {
                            await enqueueTaskUpdate({ fieldPatch: { status: prevStatus, progress: prevProgress } });
                          }
                        });
                      }
                    } catch (e: any) {
                      toast.error(e.response?.data?.message || e.message || t('Có lỗi xảy ra khi lưu minh chứng'));
                    } finally {
                      completeMeetingInFlightRef.current = false;
                      setCompletingMeeting(false);
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#BD1D2D', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                >
                  {completingMeeting ? (
                    <>
                      <Loader2 size={14} className="spin" />
                      {t('Đang xử lý...')}
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} />
                      {t('Hoàn thành')}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {cancellingMeeting && (
          <motion.div
            key="meeting-cancel-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            className="modal-above-drawer"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(4px)',
              zIndex: effectiveZNestedModal,
              ...({ '--modal-z': effectiveZNestedModal } as any),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onClick={() => { if (!savingCancel) setCancellingMeeting(null); }}
          >
            <motion.div
              key="meeting-cancel-card"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 450,
                padding: '1.5rem',
                borderRadius: '16px',
                overflow: 'hidden',
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid #E2E8F0',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <h3 style={{ fontWeight: 700, fontSize: '1.15rem', color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <XCircle style={{ color: '#BD1D2D' }} size={20} />
                  {t('Nhập lý do hủy lịch')}
                </h3>
                <button
                  type="button"
                  disabled={savingCancel}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B' }}
                  onClick={() => setCancellingMeeting(null)}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', marginBottom: '0.5rem' }}>{t('Lý do hủy *')}</label>
                <textarea
                  style={{ width: '100%', minHeight: '100px', fontSize: '0.875rem', padding: '8px 12px', border: '1px solid #E2E8F0', borderRadius: '8px', outline: 'none', resize: 'none', background: '#F8FAFC', color: '#0F172A' }}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder={t('Vui lòng nhập lý do hủy cuộc hẹn...')}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="btn outline" onClick={() => setCancellingMeeting(null)} disabled={savingCancel}>{t('Hủy')}</button>
                <button
                  type="button"
                  className="btn danger"
                  disabled={!cancelReason.trim() || savingCancel}
                  onClick={async () => {
                    const reason = cancelReason.trim();
                    const targetTid = activeTaskIdRef.current;
                    if (!reason || !targetTid || targetTid === 'new' || cancelMeetingInFlightRef.current) return;
                    cancelMeetingInFlightRef.current = true;
                    setSavingCancel(true);
                    try {
                      const resUpdate = await enqueueTaskUpdate({ fieldPatch: { status: 'cancelled', progress: 0 } });
                      if (resUpdate.success) {
                        await api.post(`/activities/${targetTid}/comments`, {
                          content: `Hủy lịch gặp gỡ với lý do: ${reason}`
                        });
                        toast.success(t('Đã hủy lịch hẹn thành công'));
                        loadComments(Number(targetTid));
                        setCancellingMeeting(null);
                      }
                    } catch {
                      toast.error(t('Lỗi khi hủy gặp gỡ'));
                    } finally {
                      cancelMeetingInFlightRef.current = false;
                      setSavingCancel(false);
                    }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#BD1D2D', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 }}
                >
                  {savingCancel ? (
                    <>
                      <Loader2 size={14} className="spin" />
                      {t('Đang xử lý...')}
                    </>
                  ) : (
                    <>
                      <XCircle size={14} />
                      {t('Xác nhận hủy')}
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showMuteConfirmModal && (
          <motion.div
            key="mute-confirm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
            className="modal-above-drawer"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.5)',
              backdropFilter: 'blur(4px)',
              zIndex: effectiveZNestedModal,
              ...({ '--modal-z': effectiveZNestedModal } as any),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1rem'
            }}
            onClick={() => setShowMuteConfirmModal(false)}
          >
            <motion.div
              key="mute-confirm-card"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: '420px',
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid #E2E8F0',
                borderRadius: '16px',
                padding: '24px',
                boxShadow: '0 20px 40px rgba(15, 23, 42, 0.25)',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(189, 29, 45, 0.08)',
                  color: '#BD1D2D',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <BellOff size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#0F172A' }}>
                    {t('Tắt thông báo cho công việc này?')}
                  </h3>
                  <p style={{ margin: '6px 0 0', fontSize: '0.8125rem', color: '#64748B', lineHeight: 1.5 }}>
                    {t('Bạn sẽ không còn nhận bất kỳ thông báo nào (bình luận mới, nhắc tên, cập nhật trạng thái...) về công việc này nữa.')}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowMuteConfirmModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    background: 'transparent',
                    color: '#334155',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {t('Quay lại')}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMute}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#BD1D2D',
                    color: 'white',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {t('Xác nhận tắt')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm Clear Customer Link Modal */}
      {showClearCustomerConfirm && (
        <ConfirmModal
          isOpen={showClearCustomerConfirm}
          onClose={() => setShowClearCustomerConfirm(false)}
          onConfirm={executeClearCustomerLinks}
          title={t('Gỡ liên kết khách hàng?')}
          message={t('Thao tác này sẽ gỡ bỏ toàn bộ khách hàng đang liên kết với công việc này. Bạn có chắc chắn muốn tiếp tục?')}
          confirmText={t('Xác nhận gỡ')}
          cancelText={t('Hủy')}
          confirmType="danger"
          zIndex={effectiveZTopModal}
        />
      )}

      {/* Confirm Subtask Deletion Modal */}
      {Boolean(deleteSubtaskTarget) && (
        <ConfirmModal
          isOpen={Boolean(deleteSubtaskTarget)}
          onClose={() => setDeleteSubtaskTarget(null)}
          onConfirm={() => {
            if (deleteSubtaskTarget) {
              handleDeleteChecklistItem(deleteSubtaskTarget.id);
              setDeleteSubtaskTarget(null);
            }
          }}
          title={t('Xác nhận xóa việc con')}
          message={t(`Bạn có chắc chắn muốn xóa việc con "${deleteSubtaskTarget?.title || ''}" không? Hành động này không thể hoàn tác.`)}
          confirmText={t('Xóa việc con')}
          cancelText={t('Quay lại')}
          confirmType="danger"
          zIndex={effectiveZTopModal}
        />
      )}

      {/* Confirm Comment Deletion Modal */}
      {commentToDelete !== null && (
        <ConfirmModal
          isOpen={commentToDelete !== null}
          onClose={() => setCommentToDelete(null)}
          onConfirm={async () => {
            if (commentToDelete !== null) {
              await handleDeleteComment(commentToDelete);
              setCommentToDelete(null);
            }
          }}
          title={t('Xác nhận xóa bình luận')}
          message={t('Bạn có chắc chắn muốn xóa bình luận này không? Hành động này không thể hoàn tác.')}
          confirmText={t('Xóa')}
          cancelText={t('Hủy')}
          confirmType="danger"
          zIndex={effectiveZTopModal}
        />
      )}

      {/* Confirm Hide Task Modal */}
      {showHideConfirmModal && (
        <ConfirmModal
          isOpen={showHideConfirmModal}
          onClose={() => setShowHideConfirmModal(false)}
          onConfirm={() => {
            setShowHideConfirmModal(false);
            executeToggleHide();
          }}
          title={t('Ẩn công việc khỏi bàn làm việc?')}
          confirmText={t('Xác nhận ẩn')}
          cancelText={t('Hủy')}
          confirmType="danger"
          width={480}
          zIndex={effectiveZTopModal}
        >
          <div style={{ textAlign: 'left', lineHeight: '1.6', fontSize: '0.85rem', color: '#0F172A' }}>
            <p style={{ marginBottom: '12px' }}>{t('Bạn có chắc chắn muốn ẩn công việc này khỏi Bàn làm việc của mình không?')}</p>
            <p style={{ fontWeight: 700, color: '#BD1D2D', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              {t('Công việc này sẽ tự động hiển thị trở lại khi:')}
            </p>
            <ul style={{ listStyleType: 'disc', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px', color: '#64748B' }}>
              <li>{t('Bạn được phân công làm Người thực hiện chính mới.')}</li>
              <li>{t('Bạn được thêm vào danh sách Người liên quan (Người tham gia).')}</li>
              <li>{t('Ai đó nhắc tên (mention) bạn bằng cú pháp @tên hoặc tag trực tiếp bạn trong phần mô tả/checklist.')}</li>
              <li>{t('Ai đó nhắc tên (mention) bạn hoặc trả lời bình luận của bạn trong phần Thảo luận.')}</li>
            </ul>
          </div>
        </ConfirmModal>
      )}

      {/* Lightbox Modal for attachments (images & PDF) */}
      <AttachmentLightboxModal
        isOpen={lightboxState.isOpen}
        onClose={() => setLightboxState(prev => ({ ...prev, isOpen: false }))}
        items={lightboxState.items}
        initialIndex={lightboxState.initialIndex}
        zIndex={effectiveZTopModal}
      />
    </>,
    document.body
  ) : null;

  // ==========================================================================
  // DRAWER CONTENT
  // ==========================================================================

  const content = shouldRenderContent ? (
    <motion.div
      data-closing={isClosing ? 'true' : 'false'}
      className={`${embedMode ? '' : `${styles.drawer} drawer-panel drawer-sheet`} ${embedMode ? 'focus-right-column' : ''}`}
      {...drawerMotionProps}
      style={embedMode ? {
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        boxShadow: 'none',
        borderLeft: '1px solid #E2E8F0'
      } : {
        left: isMobileOrTablet ? 0 : 'var(--sidebar-width, 220px)',
        right: 0,
        top: 0,
        bottom: 0,
        width: isMobileOrTablet ? '100vw' : 'auto',
        height: isMobileOrTablet ? '100dvh' : '100vh',
        marginTop: 0,
        borderRadius: 0,
        overflow: 'hidden',
        boxShadow: isMobileOrTablet ? 'none' : '-10px 0 30px rgba(15, 23, 42, 0.15)',
        zIndex: effectiveZIndex,
        '--drawer-panel-z': effectiveZIndex,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        background: 'var(--color-surface, #ffffff)'
      } as React.CSSProperties}
    >
      <style>{TASK_DRAWER_INLINE_STYLES}</style>

      {/* Drawer Header */}
      <div style={{
        padding: isMobileOrTablet ? '0.65rem 0.85rem' : (embedMode ? '0.75rem 0.5rem' : '1.15rem 1.5rem'),
        borderBottom: '1px solid #E2E8F0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--color-surface, #ffffff)',
        zIndex: 100,
        position: 'sticky',
        top: 0,
        flexShrink: 0,
        gap: '8px'
      }}>
        {isMobileOrTablet ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: (erpMeta.internal_type === 'announcement' || formData.priority === 'high')
                ? 'rgba(189, 29, 45, 0.08)'
                : 'rgba(15, 23, 42, 0.06)',
              color: (erpMeta.internal_type === 'announcement' || formData.priority === 'high')
                ? '#BD1D2D'
                : '#334155',
              flexShrink: 0
            }}>
              {erpMeta.internal_type === 'announcement' ? <AlertCircle size={17} /> : <CheckSquare2 size={17} />}
            </div>
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <h3 style={{
                fontSize: '0.92rem',
                fontWeight: 700,
                color: '#0F172A',
                margin: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}>
                {isNew ? t('Tạo công việc mới') : (formData.subject || t('Chi tiết công việc'))}
              </h3>
              {!isNew && formData.id && formData.id !== 'new' && (
                <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>#{formData.id}</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', minWidth: 0, flex: 1, overflow: 'hidden' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: (erpMeta.internal_type === 'announcement' || formData.priority === 'high')
                ? 'rgba(189, 29, 45, 0.08)'
                : 'rgba(15, 23, 42, 0.06)',
              color: (erpMeta.internal_type === 'announcement' || formData.priority === 'high')
                ? '#BD1D2D'
                : '#334155',
              flexShrink: 0
            }}>
              {erpMeta.internal_type === 'announcement' ? <AlertCircle size={20} /> : <CheckSquare2 size={20} />}
            </div>
            <div style={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
              <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span
                  style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={formData.subject || t('Chi tiết công việc')}
                >
                  {formData.subject || t('Chi tiết công việc')}
                </span>
                <span style={{
                  background: '#F1F5F9',
                  color: '#475569',
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: '1px solid #E2E8F0',
                  textTransform: 'uppercase',
                  flexShrink: 0
                }}>#{isNew ? t('MỚI') : formData.id}</span>
                <span style={{
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '6px',
                  background: formData.priority === 'high' ? 'rgba(189, 29, 45, 0.08)' : '#F1F5F9',
                  color: formData.priority === 'high' ? '#BD1D2D' : '#334155',
                  textTransform: 'uppercase',
                  flexShrink: 0
                }}>
                  {formData.priority === 'high' ? t('Khẩn cấp') : formData.priority === 'low' ? t('Thấp') : t('Trung bình')}
                </span>
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px', flexWrap: 'wrap', fontSize: '0.75rem', color: '#64748B' }}>
                {(() => {
                  const cId = Number(formData.created_by || task?.created_by || 0);
                  const matchedCreator = cId > 0 ? users.find(u => Number(u.id) === cId) : null;
                  const isSelfCreator = isNew || (cId > 0 && cId === Number(currentUser?.id || 0) && !formData.created_by_name);
                  const creatorName = formData.created_by_name || matchedCreator?.full_name || matchedCreator?.name || (isSelfCreator ? (currentUser?.name || (currentUser as any)?.full_name) : '') || t('Hệ thống / Admin');
                  const creatorAvatar = formData.created_by_avatar || matchedCreator?.avatar_url || matchedCreator?.avatar || (isSelfCreator ? (currentUser?.avatar || (currentUser as any)?.avatar_url) : '') || undefined;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>{t('Người tạo:')}</span>
                      <Avatar src={creatorAvatar} name={creatorName} size={20} />
                      <span style={{ fontWeight: 700, color: '#0F172A' }}>{creatorName}</span>
                    </div>
                  );
                })()}

                {formatHeaderDate(formData.created_at) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '2px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontVariantNumeric: 'tabular-nums' }}>
                    <Calendar size={12} style={{ color: '#334155' }} />
                    <span>{t('Ngày tạo:')}</span>
                    <strong style={{ color: '#0F172A' }}>{formatHeaderDate(formData.created_at)}</strong>
                  </div>
                )}

                {formatHeaderDate(formData.due_date) ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '2px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', fontVariantNumeric: 'tabular-nums' }}>
                    <Clock size={12} style={{ color: '#BD1D2D' }} />
                    <span>{t('Hạn hoàn thành:')}</span>
                    <strong style={{ color: '#0F172A' }}>{formatHeaderDate(formData.due_date)}</strong>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', padding: '2px 8px', borderRadius: '6px', border: '1px solid #E2E8F0', color: '#64748B' }}>
                    <Clock size={12} style={{ color: '#64748B' }} />
                    <span style={{ fontSize: '0.72rem' }}>{t('Không có thời hạn')}</span>
                  </div>
                )}

                {!!erpMeta.project_id && (
                  <button
                    type="button"
                    onClick={() => { cleanupDeepLinkParams(); navigate(`/projects?id=${erpMeta.project_id}`); onClose?.(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: '6px', fontSize: '0.725rem', fontWeight: 700, cursor: 'pointer' }}
                    title={t('Mở Drawer xem chi tiết Dự án')}
                  >
                    <Building2 size={12} style={{ color: '#BD1D2D' }} />
                    <span>{allowedProjects.find(p => Number(p.id) === Number(erpMeta.project_id))?.name || t('Dự án')}</span>
                  </button>
                )}
                {!!erpMeta.campaign_id && (
                  <button
                    type="button"
                    onClick={() => { cleanupDeepLinkParams(); navigate(`/projects?tab=campaigns&id=${erpMeta.campaign_id}`); onClose?.(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', color: '#0F172A', border: '1px solid #E2E8F0', padding: '2px 8px', borderRadius: '6px', fontSize: '0.725rem', fontWeight: 700, cursor: 'pointer' }}
                    title={t('Mở Drawer xem chi tiết Chiến dịch')}
                  >
                    <Megaphone size={12} style={{ color: '#BD1D2D' }} />
                    <span>{allowedCampaigns.find(c => Number(c.id) === Number(erpMeta.campaign_id))?.name || t('Chiến dịch')}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: isMobileOrTablet ? '6px' : '10px', alignItems: 'center', flexShrink: 0, justifyContent: 'flex-end' }}>
          {/* Share Task Button */}
          {Boolean(!isNew && activeTaskId && activeTaskId !== 'new' && activeTaskId !== 0 && activeTaskId !== '0') && (
            <button
              type="button"
              onClick={handleShareTask}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobileOrTablet ? '32px' : '36px',
                height: isMobileOrTablet ? '32px' : '36px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#ffffff',
                color: '#64748B',
                cursor: 'pointer',
                padding: 0
              }}
              title={t('Chia sẻ liên kết công việc')}
            >
              <Share2 size={isMobileOrTablet ? 15 : 17} />
            </button>
          )}

          {/* Mute Notification Bell Toggle Button (Wired to /mute-status & /toggle-mute) */}
          {Boolean(!isNew && activeTaskId && activeTaskId !== 'new' && activeTaskId !== 0 && activeTaskId !== '0') && (
            <button
              type="button"
              onClick={handleBellClick}
              disabled={loadingMute}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobileOrTablet ? '32px' : '36px',
                height: isMobileOrTablet ? '32px' : '36px',
                borderRadius: '8px',
                border: isMuted ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                background: isMuted ? 'rgba(189, 29, 45, 0.08)' : '#ffffff',
                color: isMuted ? '#BD1D2D' : '#64748B',
                cursor: loadingMute ? 'not-allowed' : 'pointer',
                padding: 0
              }}
              title={isMuted ? t('Thông báo đang tắt (Bấm để bật lại)') : t('Tắt thông báo cho công việc này')}
            >
              {isMuted ? <BellOff size={isMobileOrTablet ? 15 : 17} /> : <Bell size={isMobileOrTablet ? 15 : 17} />}
            </button>
          )}

          {/* Delete task button */}
          {Boolean(!isNew && canDelete && activeTaskId && activeTaskId !== 'new' && activeTaskId !== 0 && activeTaskId !== '0') && (
            <button
              type="button"
              onClick={handleDeleteTask}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobileOrTablet ? '32px' : '36px',
                height: isMobileOrTablet ? '32px' : '36px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#ffffff',
                color: '#BD1D2D',
                cursor: 'pointer',
                padding: 0
              }}
              title={t('Xóa công việc')}
            >
              <Trash2 size={isMobileOrTablet ? 15 : 17} />
            </button>
          )}

          {/* Archive Task Button */}
          {Boolean(!isNew && !isReadOnly && activeTaskId && activeTaskId !== 'new' && activeTaskId !== 0 && activeTaskId !== '0') && (
            <button
              type="button"
              onClick={handleToggleArchive}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobileOrTablet ? '32px' : '36px',
                height: isMobileOrTablet ? '32px' : '36px',
                borderRadius: '8px',
                border: formData.is_archived ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                background: formData.is_archived ? 'rgba(189, 29, 45, 0.08)' : '#ffffff',
                color: formData.is_archived ? '#BD1D2D' : '#64748B',
                cursor: 'pointer',
                padding: 0
              }}
              title={formData.is_archived ? t('Công việc đang được lưu trữ (Bấm để bỏ lưu trữ)') : t('Lưu trữ công việc')}
            >
              <Archive size={isMobileOrTablet ? 15 : 17} />
            </button>
          )}

          {/* Hide task eye button */}
          {Boolean(!isNew && !isReadOnly && activeTaskId && activeTaskId !== 'new' && activeTaskId !== 0 && activeTaskId !== '0') && (
            <button
              type="button"
              onClick={handleHideClick}
              disabled={loadingHide}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobileOrTablet ? '32px' : '36px',
                height: isMobileOrTablet ? '32px' : '36px',
                borderRadius: '8px',
                border: isHidden ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                background: isHidden ? 'rgba(189, 29, 45, 0.08)' : '#ffffff',
                color: isHidden ? '#BD1D2D' : '#64748B',
                cursor: loadingHide ? 'not-allowed' : 'pointer',
                padding: 0
              }}
              title={isHidden ? t('Công việc đang ẩn (Bấm để hiển thị lại)') : t('Ẩn công việc khỏi bàn làm việc')}
            >
              {isHidden ? <EyeOff size={isMobileOrTablet ? 15 : 17} /> : <Eye size={isMobileOrTablet ? 15 : 17} />}
            </button>
          )}

          {/* Focus Mode Button for PC */}
          {!isMobileOrTablet && !embedMode && onOpenFocusMode && (
            <button
              type="button"
              onClick={onOpenFocusMode}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#ffffff',
                color: '#64748B',
                cursor: 'pointer',
                padding: 0
              }}
              title={t('Chế độ tập trung (Focus Mode)')}
            >
              <Target size={17} />
            </button>
          )}

          {/* Duplicate Task Button */}
          {Boolean(!isNew && !isReadOnly && activeTaskId && activeTaskId !== 'new' && activeTaskId !== 0 && activeTaskId !== '0') && (
            <button
              type="button"
              onClick={handleDuplicateTask}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobileOrTablet ? '32px' : '36px',
                height: isMobileOrTablet ? '32px' : '36px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                background: '#ffffff',
                color: '#64748B',
                cursor: 'pointer',
                padding: 0
              }}
              title={t('Nhân bản công việc (sao chép toàn bộ nội dung, việc con, người thực hiện, bỏ deadline)')}
            >
              <Copy size={isMobileOrTablet ? 15 : 17} />
            </button>
          )}

          {/* Manual Save / Create Button */}
          {!isReadOnly && (
            <button
              type="button"
              onClick={handleManualSave}
              disabled={isSaving}
              className="btn"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: isMobileOrTablet ? '0 12px' : '8px 18px',
                borderRadius: '8px',
                fontSize: isMobileOrTablet ? '0.8rem' : '0.86rem',
                fontWeight: 700,
                height: isMobileOrTablet ? '32px' : '36px',
                background: '#BD1D2D',
                borderColor: '#BD1D2D',
                color: 'white',
                cursor: isSaving ? 'not-allowed' : 'pointer',
                opacity: isSaving ? 0.7 : 1
              }}
            >
              {isSaving ? <RefreshCw className="spin" size={14} /> : <Save size={isMobileOrTablet ? 14 : 16} />}
              <span>{isSaving ? t('Đang lưu...') : (isNew ? t('Tạo việc') : (isMobileOrTablet ? t('Lưu') : t('Lưu thay đổi')))}</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCloseDrawer}
            style={{
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              padding: 0,
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#64748B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: isMobileOrTablet ? '32px' : '36px',
              width: isMobileOrTablet ? '32px' : '36px'
            }}
          >
            <X size={isMobileOrTablet ? 16 : 18} />
          </button>
        </div>
      </div>

      {/* Hydrating Skeleton vs Body */}
      {isHydratingSkeleton ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <DrawerSkeleton />
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexDirection: isMobileOrTablet ? 'column' : 'row',
            flex: 1,
            overflowY: isMobileOrTablet ? 'auto' : 'hidden',
            overflowX: 'hidden',
            minHeight: 0,
            WebkitOverflowScrolling: 'touch',
            overscrollBehaviorY: 'contain'
          }}
          className={embedMode ? 'focus-right-column' : ''}
        >
          {/* Left Column (7) */}
          <div
            style={{
              flex: isMobileOrTablet ? '1 0 auto' : 7,
              display: 'flex',
              flexDirection: 'column',
              gap: isMobileOrTablet ? '1rem' : (embedMode ? '12px' : '1.35rem'),
              minWidth: 0,
              overflowY: isMobileOrTablet ? 'visible' : 'auto',
              WebkitOverflowScrolling: 'touch',
              padding: isMobileOrTablet ? '1rem 1rem 120px 1rem' : (embedMode ? '1rem 0.5rem 1.5rem 1.25rem' : '1.5rem 2rem 1.5rem 2rem')
            }}
            className="custom-scrollbar"
          >
            {/* Tên công việc */}
            <div className="card" style={cardStyle}>
              <label style={cardLabelStyle}>
                {t('Tên công việc')}
              </label>
              <TaskSubjectInput
                taskKey={isNew ? `new_${isClonedDraft ? 'clone' : 'fresh'}_${activeTaskId || '0'}` : String(activeTaskId || '')}
                initialValue={formData.subject || ''}
                disabled={isReadOnly}
                onSave={(val) => handleUpdateField('subject', val)}
                onSyncFormData={(val) => {
                  formDataRef.current = { ...(formDataRef.current || {}), subject: val };
                  setFormData((prev: any) => ({ ...prev, subject: val }));
                }}
                placeholder={t('Nhập tên công việc...')}
              />
            </div>

            {/* Mô tả chi tiết */}
            <div className="card" style={cardStyle}>
              <label style={cardLabelStyle}>
                {t('Mô tả chi tiết')}
              </label>
              <MentionInput
                key={isNew ? `new_${isClonedDraft ? 'clone' : 'fresh'}_${activeTaskId || '0'}` : String(activeTaskId || '')}
                value={erpMeta?.description || ''}
                onChange={(e: any) => {
                  if (isReadOnly) return;
                  const html = e.target.value;
                  isDescDirtyRef.current = true;
                  setErpMeta((prev: any) => {
                    const next = { ...prev, description: html };
                    erpMetaRef.current = next;
                    return next;
                  });
                }}
                onBlur={() => {
                  if (isReadOnly) return;
                  const curMeta = erpMetaRef.current || erpMeta;
                  const html = curMeta?.description || '';
                  const linkified = sanitizeHtml(linkifyHtml(html));
                  if (linkified !== html) {
                    setErpMeta((prev: any) => {
                      const next = { ...prev, description: linkified };
                      erpMetaRef.current = next;
                      return next;
                    });
                  }
                  if (!isDescDirtyRef.current && linkified === lastSyncedDescRef.current) {
                    return;
                  }
                  isDescDirtyRef.current = false;
                  lastSyncedDescRef.current = linkified;
                  handleSaveMeta({ ...curMeta, description: linkified }, undefined, {
                    dirtyMetaFields: ['description']
                  });
                }}
                users={users}
                placeholder={t('Nhập mô tả chi tiết công việc... Gõ @ để nhắc tên đồng nghiệp')}
                style={{ minHeight: '220px', maxHeight: '520px' }}
                disabled={isReadOnly}
              />
            </div>

            {/* Checklist công việc con */}
            <div className="card" style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <label style={cardLabelStyle}>
                  {t('Checklist công việc con')}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {ensureArray(erpMeta.checklist).some(isSubtaskDone) && (
                    <button
                      type="button"
                      onClick={() => {
                        const next = !hideCompletedChecklist;
                        setHideCompletedChecklist(next);
                        if (next && checklistFilter === 'completed') setChecklistFilter('all');
                      }}
                      title={hideCompletedChecklist ? t('Hiển thị tất cả') : t('Ẩn các việc đã hoàn thành')}
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1px solid #E2E8F0',
                        background: hideCompletedChecklist ? 'rgba(189, 29, 45, 0.08)' : '#ffffff',
                        color: hideCompletedChecklist ? '#BD1D2D' : '#64748B',
                        cursor: 'pointer'
                      }}
                    >
                      <EyeOff size={12} />
                      {t('Ẩn đã xong')} ({ensureArray(erpMeta.checklist).filter(isSubtaskDone).length})
                    </button>
                  )}
                  {!isReadOnly && (
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => {
                        if (!showAddChecklist && !newSubAssignee && isPersonalTask && personalUser?.id) {
                          setNewSubAssignee(String(personalUser.id));
                        }
                        setShowAddChecklist(!showAddChecklist);
                      }}
                      style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', borderColor: '#E2E8F0', color: '#0F172A', fontWeight: 600 }}
                    >
                      <Plus size={12} style={{ color: '#BD1D2D' }} />
                      {t('Thêm mục')}
                    </button>
                  )}
                </div>
              </div>

              {/* Checklist Progress Bar */}
              {ensureArray(erpMeta.checklist).length > 0 && (() => {
                const safeList = ensureArray(erpMeta.checklist);
                const total = safeList.length;
                const completed = safeList.filter(isSubtaskDone).length;
                const percent = Math.round((completed / total) * 100);
                const barTone = percent >= 80 ? '#10b981' : percent >= 50 ? '#f59e0b' : '#ef4444';

                return (
                  <div style={{
                    marginTop: '4px',
                    marginBottom: '8px',
                    padding: '10px 12px',
                    background: '#F8FAFC',
                    borderRadius: '10px',
                    border: '1px solid #E2E8F0'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                        {t('Tiến độ việc con:')} <strong style={{ color: '#0F172A' }}>{completed}/{total}</strong> {t('đã xong')} ({percent}%)
                      </span>
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        color: '#334155',
                        background: '#ffffff',
                        border: '1px solid #E2E8F0',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Check size={12} style={{ color: '#10b981' }} /> {t('Tự động đồng bộ')}
                      </span>
                    </div>
                    <div style={{
                      width: '100%',
                      height: '6px',
                      borderRadius: '4px',
                      background: '#E2E8F0',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${percent}%`,
                        height: '100%',
                        background: barTone,
                        borderRadius: '4px',
                        transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
                      }} />
                    </div>
                  </div>
                );
              })()}

              {/* Search & Segmented Control Filter bar for checklist */}
              {ensureArray(erpMeta.checklist).length > 2 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  marginBottom: '8px',
                  flexWrap: 'wrap'
                }}>
                  <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
                    <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('Tìm việc con, người làm...')}
                      value={checklistSearch}
                      onChange={(e) => {
                        setChecklistSearch(e.target.value);
                        setChecklistPage(1);
                      }}
                      style={{
                        paddingLeft: '28px',
                        paddingRight: checklistSearch ? '24px' : '8px',
                        height: '32px',
                        fontSize: '0.75rem',
                        borderRadius: '8px',
                        width: '100%'
                      }}
                    />
                    {checklistSearch && (
                      <X
                        size={12}
                        onClick={() => {
                          setChecklistSearch('');
                          setChecklistPage(1);
                        }}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#64748B' }}
                      />
                    )}
                  </div>
                  {/* Ch.V §3 Segmented Control */}
                  <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#F1F5F9', border: '1px solid #E2E8F0', gap: '2px' }}>
                    {(['all', 'pending', 'completed'] as const).map((filterKey) => {
                      const isActive = checklistFilter === filterKey;
                      const label = filterKey === 'all' ? t('Tất cả') : filterKey === 'pending' ? t('Chưa xong') : t('Đã xong');
                      return (
                        <button
                          key={filterKey}
                          type="button"
                          onClick={() => {
                            setChecklistFilter(filterKey);
                            if (filterKey === 'completed') setHideCompletedChecklist(false);
                            setChecklistPage(1);
                          }}
                          style={{
                            height: '26px',
                            padding: '0 10px',
                            borderRadius: '7px',
                            border: 'none',
                            background: isActive ? '#ffffff' : 'transparent',
                            color: isActive ? '#BD1D2D' : '#64748B',
                            fontSize: '0.72rem',
                            fontWeight: isActive ? 700 : 600,
                            boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            cursor: 'pointer'
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add checklist item expander form */}
              {showAddChecklist && !isReadOnly && (
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  padding: '14px',
                  borderRadius: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{t('Tên công việc con')}</span>
                    <textarea
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '8px 12px', minHeight: '60px', borderRadius: '8px', border: '1px solid #E2E8F0', width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                      placeholder={t('Nhập công việc con (Có thể xuống dòng để thêm nhiều mục cùng lúc...)')}
                      value={newSubTitle}
                      onChange={(e) => setNewSubTitle(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: isMobileOrTablet ? '1fr' : '1.5fr 1fr 1fr', gap: '10px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{t('Người thực hiện')}</span>
                      <CustomSelect
                        options={userSelectOptions}
                        value={newSubAssignee}
                        onChange={val => setNewSubAssignee(String(val))}
                        placeholder={t('Chọn người làm...')}
                        searchable
                        showAvatars
                        size="sm"
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{t('Độ ưu tiên')}</span>
                      <CustomSelect
                        options={[
                          { value: 'high', label: t('Cao') },
                          { value: 'medium', label: t('Trung bình') },
                          { value: 'low', label: t('Thấp') }
                        ]}
                        value={newSubPriority}
                        onChange={val => setNewSubPriority(String(val))}
                        placeholder={t('Độ ưu tiên')}
                        size="sm"
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>{t('Hạn hoàn thành')}</span>
                      <VietnameseDateInput
                        value={newSubDeadline}
                        onChange={(isoDate) => setNewSubDeadline(isoDate)}
                        style={{ height: '36px' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => setShowAddChecklist(false)}
                      style={{ padding: '6px 14px', fontSize: '0.75rem', borderRadius: '8px', cursor: 'pointer', height: '32px', display: 'flex', alignItems: 'center' }}
                    >
                      {t('Hủy')}
                    </button>
                    <button
                      type="button"
                      className="btn primary sm"
                      onClick={handleAddChecklistItem}
                      style={{ padding: '6px 14px', fontSize: '0.75rem', borderRadius: '8px', cursor: 'pointer', height: '32px', display: 'flex', alignItems: 'center', background: '#BD1D2D', color: 'white', border: 'none' }}
                    >
                      {t('Thêm')}
                    </button>
                  </div>
                </div>
              )}

              {/* Sub-tasks list */}
              {(() => {
                let filteredChecklist = ensureArray(erpMeta.checklist);

                if (checklistFilter === 'pending') {
                  filteredChecklist = filteredChecklist.filter((x: any) => !isSubtaskDone(x));
                } else if (checklistFilter === 'completed') {
                  filteredChecklist = filteredChecklist.filter(isSubtaskDone);
                } else if (hideCompletedChecklist) {
                  filteredChecklist = filteredChecklist.filter((x: any) => !isSubtaskDone(x));
                }

                if (checklistSearch.trim()) {
                  const q = removeAccents(checklistSearch.trim());
                  filteredChecklist = filteredChecklist.filter((item: any) => {
                    const titleMatch = removeAccents(item.title || item.text || '').includes(q);
                    if (titleMatch) return true;
                    const assignedIds = getParticipantIds(item.assignee_id);
                    const itemUsers = users.filter(u => assignedIds.includes(String(u.id)));
                    return itemUsers.some(u => removeAccents(u.full_name || u.name || '').includes(q));
                  });
                }

                const totalChecklistItems = filteredChecklist.length;
                const totalChecklistPages = Math.ceil(totalChecklistItems / CHECKLIST_PAGE_SIZE);
                const safeChecklistPage = Math.min(Math.max(1, checklistPage), Math.max(1, totalChecklistPages));
                const checklistStartIndex = (safeChecklistPage - 1) * CHECKLIST_PAGE_SIZE;
                const checklistEndIndex = safeChecklistPage * CHECKLIST_PAGE_SIZE;
                const pagedChecklist = filteredChecklist.slice(checklistStartIndex, checklistEndIndex);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div
                      className="custom-scrollbar"
                      style={{
                        maxHeight: '390px',
                        overflowY: 'auto',
                        paddingRight: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                    >
                      {totalChecklistItems === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1.25rem', color: '#64748B', fontSize: '0.78rem' }}>
                          {checklistSearch.trim() || checklistFilter !== 'all' || hideCompletedChecklist
                            ? t('Không có công việc con nào khớp bộ lọc.')
                            : t('Chưa có công việc con nào.')}
                        </div>
                      ) : (
                        pagedChecklist.map((item: any) => {
                          const itemDone = isSubtaskDone(item);
                          const assignedIds = getParticipantIds(item.assignee_id);
                          let itemUsers = users.filter(u => assignedIds.includes(String(u.id)));
                          if (itemUsers.length === 0 && isPersonalTask && personalUser) {
                            itemUsers = [personalUser];
                          }
                          const isEditingThis = editingChecklistId === item.id;
                          const isAssigneeDropdownOpen = activeAssigneeDropdownId === item.id;
                          const isCommentsOpen = selectedSubtask?.id === item.id;

                          return (
                            <div key={item.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {/* Subtask Card (no opacity<1 stacking context trap!) */}
                              <div
                                onClick={() => {
                                  if (!isNew) {
                                    setSelectedSubtask(isCommentsOpen ? null : item);
                                  }
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  background: itemDone ? '#F8FAFC' : '#ffffff',
                                  border: '1px solid #E2E8F0',
                                  padding: '10px 14px',
                                  borderRadius: '10px',
                                  position: 'relative',
                                  gap: '10px',
                                  cursor: !isNew ? 'pointer' : 'default'
                                }}
                                className={!isNew ? 'hover-bg-alt' : ''}
                              >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: 0 }}>
                                  <div
                                    onClick={(e) => e.stopPropagation()}
                                    style={{ position: 'relative', width: 22, height: 22, flexShrink: 0, marginTop: '2px' }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={itemDone}
                                      onChange={() => handleToggleChecklist(item.id)}
                                      onClick={(e) => e.stopPropagation()}
                                      disabled={isReadOnly}
                                      style={{
                                        opacity: 0,
                                        position: 'absolute',
                                        width: '100%',
                                        height: '100%',
                                        cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                        margin: 0,
                                        zIndex: 1
                                      }}
                                    />
                                    <motion.div
                                      animate={{
                                        backgroundColor: itemDone ? '#10b981' : '#ffffff',
                                        borderColor: itemDone ? '#10b981' : '#CBD5E1'
                                      }}
                                      style={{
                                        width: 22,
                                        height: 22,
                                        border: '2px solid',
                                        borderRadius: '50%',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'background-color 0.2s, border-color 0.2s'
                                      }}
                                    >
                                      <AnimatePresence>
                                        {itemDone && (
                                          <motion.div
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0, opacity: 0 }}
                                            transition={{ duration: 0.16 }}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                          >
                                            <Check size={14} color="white" strokeWidth={4} />
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </motion.div>
                                  </div>

                                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: '3px' }}>
                                    {isEditingThis ? (
                                      <div
                                        onClick={(e) => e.stopPropagation()}
                                        style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}>
                                          <input
                                            type="text"
                                            className="form-input"
                                            value={editingChecklistTitle}
                                            onChange={(e) => setEditingChecklistTitle(e.target.value)}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                if (handleUpdateChecklistItem(item.id, editingChecklistTitle, editingChecklistDeadline)) {
                                                  setEditingChecklistId(null);
                                                }
                                              } else if (e.key === 'Escape') {
                                                setEditingChecklistId(null);
                                              }
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            autoFocus
                                            style={{ fontSize: '0.82rem', padding: '4px 8px', height: '32px', borderRadius: '6px', flex: 1 }}
                                          />
                                          <div style={{ width: '130px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                                            <VietnameseDateInput
                                              value={editingChecklistDeadline}
                                              onChange={(isoDate) => setEditingChecklistDeadline(isoDate)}
                                              style={{ height: '32px' }}
                                              inputStyle={{ height: '32px', fontSize: '0.8rem', padding: '4px 6px' }}
                                            />
                                          </div>
                                          <button
                                            type="button"
                                            className="btn primary sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              if (handleUpdateChecklistItem(item.id, editingChecklistTitle, editingChecklistDeadline)) {
                                                setEditingChecklistId(null);
                                              }
                                            }}
                                            style={{ padding: '4px 10px', height: '32px', fontSize: '0.75rem', flexShrink: 0, background: '#BD1D2D', borderColor: '#BD1D2D' }}
                                          >
                                            {t('Lưu')}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn outline sm"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingChecklistId(null);
                                            }}
                                            style={{ padding: '4px 8px', height: '32px', fontSize: '0.75rem', flexShrink: 0 }}
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{
                                          fontSize: '0.82rem',
                                          fontWeight: 700,
                                          color: itemDone ? '#64748B' : '#0F172A',
                                          textDecoration: itemDone ? 'line-through' : 'none',
                                          wordBreak: 'break-word'
                                        }}>
                                          {item.title || item.text}
                                        </span>
                                        {!isReadOnly && (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setEditingChecklistId(item.id);
                                              setEditingChecklistTitle(item.title || item.text || '');
                                              setEditingChecklistDeadline(item.due_date ? String(item.due_date).slice(0, 10) : '');
                                            }}
                                            style={{
                                              border: 'none',
                                              background: 'transparent',
                                              color: '#64748B',
                                              cursor: 'pointer',
                                              padding: '2px 4px',
                                              borderRadius: '4px',
                                              display: 'inline-flex',
                                              alignItems: 'center'
                                            }}
                                            title={t('Sửa tiêu đề')}
                                          >
                                            <Edit3 size={13} />
                                          </button>
                                        )}
                                      </div>
                                    )}

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                      <span style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                        {t('Giao cho')}: <strong style={{ color: itemUsers.length > 0 ? '#0F172A' : '#64748B' }}>{itemUsers.length > 0 ? itemUsers.map(u => u.full_name || u.name).join(', ') : t('Chưa phân công')}</strong>
                                      </span>
                                      {item.due_date && (
                                        <span style={{ fontSize: '0.68rem', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>
                                          {` • Hạn: ${formatDateVN(item.due_date)}`}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {itemUsers.length > 0 && (
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedSubtaskForParticipants(item);
                                        }}
                                        className="subtask-assignee-trigger"
                                        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                        title={itemUsers.map(u => u.full_name || u.name).join(', ')}
                                      >
                                        {itemUsers.slice(0, 3).map((u, idx) => (
                                          <div
                                            key={u.id}
                                            style={{
                                              marginLeft: idx === 0 ? 0 : -8,
                                              border: '1.5px solid #ffffff',
                                              borderRadius: '50%',
                                              overflow: 'hidden',
                                              zIndex: 10 - idx,
                                              display: 'flex'
                                            }}
                                          >
                                            <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={22} />
                                          </div>
                                        ))}
                                        {itemUsers.length > 3 && (
                                          <div
                                            style={{
                                              marginLeft: -8,
                                              width: '22px',
                                              height: '22px',
                                              borderRadius: '50%',
                                              background: 'rgba(189, 29, 45, 0.1)',
                                              color: '#BD1D2D',
                                              fontSize: '0.625rem',
                                              fontWeight: 800,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              border: '1.5px solid #ffffff',
                                              zIndex: 5
                                            }}
                                          >
                                            +{itemUsers.length - 3}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {!isReadOnly && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isAssigneeDropdownOpen) {
                                            setActiveAssigneeDropdownId(null);
                                          } else {
                                            setSubtaskDropdownRect(portalComputeRect(e.currentTarget, 240, 240));
                                            setActiveAssigneeDropdownId(item.id);
                                          }
                                        }}
                                        style={{
                                          border: '1px dashed #BD1D2D',
                                          background: 'rgba(189, 29, 45, 0.04)',
                                          width: '24px',
                                          height: '24px',
                                          borderRadius: '50%',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          padding: 0
                                        }}
                                        className="subtask-assignee-trigger"
                                        title={t('Phân công người thực hiện')}
                                      >
                                        <UserPlus size={12} color="#BD1D2D" />
                                      </button>
                                    )}
                                  </div>

                                  {!isNew && (() => {
                                    const commentCount = subtaskCommentCounts[item.id] || 0;
                                    return (
                                      <div style={{ position: 'relative' }}>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedSubtask(isCommentsOpen ? null : item);
                                          }}
                                          style={{
                                            border: isCommentsOpen ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                                            background: isCommentsOpen ? 'rgba(189, 29, 45, 0.06)' : 'transparent',
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '50%',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            padding: 0,
                                            color: isCommentsOpen ? '#BD1D2D' : '#64748B'
                                          }}
                                          title={t('Thảo luận / Bình luận việc con')}
                                        >
                                          <MessageSquare size={13} />
                                        </button>
                                        {commentCount > 0 && (
                                          <span style={{
                                            position: 'absolute',
                                            top: '-6px',
                                            right: '-6px',
                                            background: '#BD1D2D',
                                            color: 'white',
                                            fontSize: '9px',
                                            fontWeight: 800,
                                            borderRadius: '8px',
                                            padding: '2px 5px',
                                            lineHeight: 1,
                                            border: '1.5px solid #ffffff',
                                            pointerEvents: 'none'
                                          }}>
                                            {commentCount}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {!isReadOnly && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeleteSubtaskTarget({ id: item.id, title: item.title || item.text || '' });
                                      }}
                                      style={{
                                        border: 'none',
                                        background: 'transparent',
                                        color: '#BD1D2D',
                                        cursor: 'pointer',
                                        padding: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                      }}
                                      title={t('Xóa việc con')}
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Inline Subtask Comments Area */}
                              <AnimatePresence>
                                {isCommentsOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.22 }}
                                    style={{
                                      overflow: 'hidden',
                                      background: '#F8FAFC',
                                      border: '1px solid #E2E8F0',
                                      borderRadius: '12px',
                                      padding: '14px',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '10px',
                                      marginLeft: '34px'
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }} className="custom-scrollbar">
                                      {loadingSubtaskComments ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                          <StatRowSkeleton />
                                          <StatRowSkeleton />
                                        </div>
                                      ) : subtaskComments.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '12px', color: '#64748B', fontSize: '0.75rem' }}>
                                          {t('Chưa có thảo luận nào.')}
                                        </div>
                                      ) : (
                                        subtaskComments.map((comment: any) => {
                                          const commUser = users.find(u => Number(u.id) === Number(comment.user_id));
                                          const commentParsedAtts = ensureArray(safeJsonParse(comment.attachments, []));

                                          return (
                                            <div
                                              key={comment.id}
                                              id={`workspace-comment-${comment.id}`}
                                              onClick={handleImageClick}
                                              style={{
                                                display: 'flex',
                                                gap: '8px',
                                                background: '#ffffff',
                                                border: '1px solid #E2E8F0',
                                                padding: '8px 12px',
                                                borderRadius: '10px'
                                              }}
                                            >
                                              <Avatar src={comment.avatar_url || commUser?.avatar || commUser?.avatar_url} name={commUser?.full_name || comment.user_name || 'Đồng nghiệp'} size={22} />
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F172A' }}>{commUser?.full_name || comment.user_name || 'Đồng nghiệp'}</span>
                                                  <span style={{ fontSize: '0.62rem', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{formatDateTimeVN(comment.created_at, '')}</span>
                                                </div>
                                                {comment.content && (/<[a-z][\s\S]*>/i.test(comment.content) || /[📕📄📊📝📦🖼️📎]/.test(comment.content)) ? (
                                                  <div
                                                    className="rich-comment-content task-comment-body"
                                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(linkifyHtml(formatCommentBody(comment.content))) }}
                                                    style={{ fontSize: '0.78rem', color: '#334155', margin: '2px 0 0', lineHeight: '1.4', wordBreak: 'break-word' }}
                                                  />
                                                ) : (
                                                  <div
                                                    className="task-comment-body"
                                                    style={{ fontSize: '0.78rem', color: '#334155', margin: '2px 0 0', lineHeight: '1.4', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                                  >
                                                    {renderCommentContent(comment.content)}
                                                  </div>
                                                )}
                                                {commentParsedAtts.length > 0 && (
                                                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                                                    {commentParsedAtts.map((url: any, aIdx: number) => {
                                                      const name = typeof url === 'string' ? url.substring(url.lastIndexOf('/') + 1) : (url?.name || 'File');
                                                      const rawHref = typeof url === 'string' ? url : (url?.url || '');
                                                      const href = resolveDisplayFileUrl(rawHref);
                                                      if (!href) return null;

                                                      const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)($|\?)/i.test(href) || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);
                                                      if (isImg) {
                                                        return (
                                                          <a
                                                            key={aIdx}
                                                            href={href}
                                                            onClick={(e) => {
                                                              e.preventDefault();
                                                              setLightboxState({
                                                                isOpen: true,
                                                                items: [{ url: href, name, type: 'image' }],
                                                                initialIndex: 0
                                                              });
                                                            }}
                                                            style={{ display: 'block', borderRadius: '6px', overflow: 'hidden', border: '1px solid #E2E8F0', cursor: 'zoom-in' }}
                                                          >
                                                            <img src={href} alt={name} style={{ maxHeight: '70px', maxWidth: '120px', objectFit: 'contain', background: '#F8FAFC' }} />
                                                          </a>
                                                        );
                                                      }
                                                      return (
                                                        <a key={aIdx} href={href} data-file-url={href} data-file-name={name} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '3px 6px', borderRadius: '8px', background: '#F8FAFC', fontSize: '0.68rem', color: '#BD1D2D', fontWeight: 600, border: '1px solid #E2E8F0' }} className="comment-attachment-chip">
                                                          <Paperclip size={9} />
                                                          <span style={{ maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                                        </a>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>

                                    {!isReadOnly && (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px dashed #E2E8F0', paddingTop: '10px' }}>
                                        <div style={{ position: 'relative' }}>
                                          <MentionInput
                                            value={newSubtaskCommentText}
                                            onChange={e => setNewSubtaskCommentText(e.target.value)}
                                            users={users}
                                            onImagePaste={addLocalSubtaskCommentAttachment}
                                            onFilePaste={addLocalSubtaskCommentAttachment}
                                            placeholder={t('Viết bình luận việc con... (Dán ảnh Ctrl+V)')}
                                            style={{ minHeight: '48px', fontSize: '0.8rem', paddingRight: '40px' }}
                                            disabled={isSubmittingSubtaskComment || uploadingFile}
                                          />
                                          <label style={{ position: 'absolute', right: '8px', bottom: '8px', cursor: (uploadingFile || isSubmittingSubtaskComment) ? 'not-allowed' : 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('Đính kèm file')}>
                                            <input type="file" onChange={handleSubtaskCommentAttachmentUpload} style={{ display: 'none' }} disabled={uploadingFile || isSubmittingSubtaskComment} />
                                            {uploadingFile ? <RefreshCw className="spin" size={15} /> : <Paperclip size={15} />}
                                          </label>
                                        </div>

                                        {subtaskCommentAttachments.length > 0 && (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                            {subtaskCommentAttachments.map((att: any, idx: number) => (
                                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ffffff', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: '8px', fontSize: '0.68rem', color: '#0F172A' }}>
                                                {att.previewUrl ? (
                                                  <img src={att.previewUrl} alt="preview" style={{ width: '18px', height: '18px', borderRadius: '3px', objectFit: 'cover' }} />
                                                ) : (
                                                  <Paperclip size={10} color="#BD1D2D" />
                                                )}
                                                <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{att.name}</span>
                                                <button type="button" onClick={() => removeSubtaskCommentAttachment(idx)} style={{ border: 'none', background: 'transparent', color: '#BD1D2D', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}>×</button>
                                              </div>
                                            ))}
                                          </div>
                                        )}

                                        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                                          <button
                                            type="button"
                                            onClick={handlePostSubtaskComment}
                                            disabled={isSubmittingSubtaskComment || uploadingFile || (!newSubtaskCommentText.trim() && subtaskCommentAttachments.length === 0)}
                                            className="btn primary sm"
                                            style={{ padding: '4px 14px', fontSize: '0.72rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#fff' }}
                                          >
                                            {isSubmittingSubtaskComment ? <RefreshCw className="spin" size={11} /> : <Send size={11} />}
                                            <span>{t('Gửi')}</span>
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Pagination when > 50 subtasks */}
                    {totalChecklistPages > 1 && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 12px',
                        marginTop: '6px',
                        borderRadius: '10px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        fontSize: '0.76rem',
                        flexWrap: 'wrap',
                        gap: '8px'
                      }}>
                        <span style={{ color: '#64748B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {t('Hiển thị')} <strong style={{ color: '#0F172A' }}>{checklistStartIndex + 1}–{Math.min(checklistEndIndex, totalChecklistItems)}</strong> / {totalChecklistItems} {t('việc con')}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <button
                            type="button"
                            disabled={safeChecklistPage <= 1}
                            onClick={() => setChecklistPage(p => Math.max(1, p - 1))}
                            className="btn outline sm"
                            style={{ padding: '3px 8px', height: '26px', fontSize: '0.72rem', borderRadius: '6px', cursor: safeChecklistPage <= 1 ? 'not-allowed' : 'pointer', opacity: safeChecklistPage <= 1 ? 0.4 : 1 }}
                          >
                            ‹ {t('Trước')}
                          </button>

                          {Array.from({ length: totalChecklistPages }, (_, idx) => {
                            const pNum = idx + 1;
                            if (totalChecklistPages <= 7 || pNum === 1 || pNum === totalChecklistPages || Math.abs(pNum - safeChecklistPage) <= 1) {
                              return (
                                <button
                                  key={pNum}
                                  type="button"
                                  onClick={() => setChecklistPage(pNum)}
                                  style={{
                                    width: '26px',
                                    height: '26px',
                                    borderRadius: '6px',
                                    border: pNum === safeChecklistPage ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                                    background: pNum === safeChecklistPage ? '#BD1D2D' : '#ffffff',
                                    color: pNum === safeChecklistPage ? 'white' : '#0F172A',
                                    fontWeight: pNum === safeChecklistPage ? 700 : 500,
                                    fontSize: '0.72rem',
                                    cursor: 'pointer',
                                    padding: 0
                                  }}
                                >
                                  {pNum}
                                </button>
                              );
                            } else if (
                              (pNum === 2 && safeChecklistPage > 3) ||
                              (pNum === totalChecklistPages - 1 && safeChecklistPage < totalChecklistPages - 2)
                            ) {
                              return <span key={pNum} style={{ color: '#64748B', padding: '0 2px' }}>…</span>;
                            }
                            return null;
                          })}

                          <button
                            type="button"
                            disabled={safeChecklistPage >= totalChecklistPages}
                            onClick={() => setChecklistPage(p => Math.min(totalChecklistPages, p + 1))}
                            className="btn outline sm"
                            style={{ padding: '3px 8px', height: '26px', fontSize: '0.72rem', borderRadius: '6px', cursor: safeChecklistPage >= totalChecklistPages ? 'not-allowed' : 'pointer', opacity: safeChecklistPage >= totalChecklistPages ? 0.4 : 1 }}
                          >
                            {t('Sau')} ›
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Tài liệu hoặc Link đính kèm */}
            <div className="card" style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={cardLabelStyle}>
                  {t('Tài liệu hoặc Link đính kèm')}
                </label>
                {!isReadOnly && (
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => setShowAddLink(!showAddLink)}
                      style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', borderColor: '#E2E8F0', color: '#0F172A' }}
                    >
                      <Link2 size={12} style={{ color: '#BD1D2D' }} />
                      {t('Thêm link')}
                    </button>
                    <label
                      className="btn outline sm"
                      style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', cursor: uploadingFile ? 'not-allowed' : 'pointer', margin: 0, borderColor: '#E2E8F0', color: '#0F172A' }}
                    >
                      {uploadingFile ? <RefreshCw className="spin" size={12} /> : <Plus size={12} style={{ color: '#BD1D2D' }} />}
                      {t('Tải tệp lên')}
                      <input type="file" onChange={handleFileUpload} style={{ display: 'none' }} disabled={uploadingFile || isReadOnly} />
                    </label>
                  </div>
                )}
              </div>

              {showAddLink && !isReadOnly && (
                <div style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  padding: '12px',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={t('Tên nhãn (ví dụ: Google Drive)')}
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                    />
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewLinkUrl(val);
                        if (!newLinkLabel.trim()) {
                          if (/youtube\.com|youtu\.be/i.test(val)) setNewLinkLabel('YouTube Video');
                          else if (/docs\.google\.com\/spreadsheets/i.test(val)) setNewLinkLabel('Google Sheets');
                          else if (/docs\.google\.com\/document/i.test(val)) setNewLinkLabel('Google Docs');
                          else if (/drive\.google\.com/i.test(val)) setNewLinkLabel('Google Drive');
                        }
                      }}
                      style={{ fontSize: '0.75rem', padding: '6px 10px' }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button type="button" className="btn outline sm" onClick={() => setShowAddLink(false)} style={{ padding: '4px 10px', fontSize: '0.72rem', borderRadius: '6px' }}>{t('Hủy')}</button>
                    <button type="button" className="btn primary sm" onClick={handleAddLink} style={{ padding: '4px 10px', fontSize: '0.72rem', borderRadius: '6px', background: '#BD1D2D', borderColor: '#BD1D2D' }}>{t('Thêm')}</button>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {!isReadOnly && (
                  <PasteDropzoneArea
                    onConfirmUpload={handlePasteDropzoneUpload}
                    compact={true}
                    disabled={isReadOnly}
                    maxSizeMb={safeUploadMaxMb}
                    placeholder="Kéo thả tệp tin hoặc nhấn Ctrl+V để dán ảnh/link tại đây"
                    subtext="Xem trước ảnh/tệp tin trước khi tải lên (Hỗ trợ Ctrl+V từ Clipboard)"
                  />
                )}

                {(() => {
                  const safeLinks = ensureArray(erpMeta.links);
                  const classifiedLinks = safeLinks.map(link => ({ link, meta: classifyLinkItem(link, t) }));
                  const allMediaItems: AttachmentItem[] = classifiedLinks
                    .filter(({ meta }) => meta.safeOpen && (meta.isImage || meta.isPdf))
                    .map(({ link, meta }) => ({
                      url: meta.fullUrl,
                      name: link.label || 'Tệp đính kèm',
                      type: meta.isImage ? ('image' as const) : ('pdf' as const)
                    }));

                  return classifiedLinks.map(({ link, meta }, idx) => {
                    const {
                      fullUrl,
                      safeOpen,
                      youtubeVideoId,
                      isYouTube,
                      isGoogleSheets,
                      isGoogleDocs,
                      isGoogleDrive,
                      isCloudOrWeb,
                      isImage,
                      isWord,
                      isExcel,
                      isPdf,
                      isZip,
                      formatBadge,
                      formatColor,
                      formatBg,
                      formatBorder,
                      subLabel
                    } = meta;

                    return (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          background: '#ffffff',
                          border: '1px solid #E2E8F0',
                          padding: '12px 16px',
                          borderRadius: '12px',
                          gap: '12px',
                          cursor: safeOpen ? 'pointer' : 'default'
                        }}
                        className="task-attachment-item"
                        data-file-url={fullUrl}
                        data-file-name={link.label || link.url}
                        onClick={(e) => {
                          if (!safeOpen) return;
                          if (
                            (e.target as HTMLElement).closest('.btn-delete-link') ||
                            (e.target as HTMLElement).closest('.btn-external-link') ||
                            (e.target as HTMLElement).closest('.btn-download-link') ||
                            (e.target as HTMLElement).closest('iframe')
                          ) return;

                          if (isImage || isPdf) {
                            e.preventDefault();
                            const targetIdx = allMediaItems.findIndex(x => x.url === fullUrl);
                            setLightboxState({
                              isOpen: true,
                              items: allMediaItems.length > 0 ? allMediaItems : [{ url: fullUrl, name: link.label || 'Tệp đính kèm', type: isImage ? 'image' : 'pdf' }],
                              initialIndex: Math.max(0, targetIdx)
                            });
                          } else if (isCloudOrWeb) {
                            e.preventDefault();
                            window.open(fullUrl, '_blank', 'noopener,noreferrer');
                          } else {
                            e.preventDefault();
                            downloadFileWithName(fullUrl, link.label || link.url);
                          }
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                            {isImage && fullUrl ? (
                              <div style={{
                                width: '46px',
                                height: '46px',
                                borderRadius: '10px',
                                overflow: 'hidden',
                                flexShrink: 0,
                                border: `1px solid ${formatBorder}`,
                                background: '#F8FAFC',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                <img
                                  src={fullUrl}
                                  alt={link.label || 'Preview'}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                  onError={(e) => {
                                    (e.currentTarget as HTMLElement).style.display = 'none';
                                    const fb = e.currentTarget.parentElement?.querySelector('.img-fallback') as HTMLElement;
                                    if (fb) fb.style.display = 'flex';
                                  }}
                                />
                                <div className="img-fallback" style={{ display: 'none', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', background: formatBg, color: formatColor }}>
                                  <ImageIcon size={20} />
                                </div>
                              </div>
                            ) : (
                              <div style={{
                                width: '46px',
                                height: '46px',
                                borderRadius: '10px',
                                background: formatBg,
                                border: `1px solid ${formatBorder}`,
                                color: formatColor,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                gap: '2px'
                              }}>
                                {isGoogleDrive ? (
                                  <img
                                    src="/imgs/google_drive_2026.png"
                                    alt="Google Drive"
                                    style={{ width: 22, height: 22, objectFit: 'contain' }}
                                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                  />
                                ) : isGoogleDocs ? (
                                  <img
                                    src="/imgs/google_docs_flaticon.png"
                                    alt="Google Docs"
                                    style={{ width: 22, height: 22, objectFit: 'contain' }}
                                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                  />
                                ) : isGoogleSheets ? (
                                  <img
                                    src="/imgs/google_sheets_flaticon.png"
                                    alt="Google Sheets"
                                    style={{ width: 22, height: 22, objectFit: 'contain' }}
                                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                  />
                                ) : isYouTube ? (
                                  <img
                                    src="/imgs/YouTube_full-color_icon_(2017).svg.webp"
                                    alt="YouTube"
                                    style={{ width: 24, height: 18, objectFit: 'contain' }}
                                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                                  />
                                ) : isExcel ? (
                                  <FileSpreadsheet size={20} />
                                ) : isWord || isPdf || link.is_file ? (
                                  <FileText size={20} />
                                ) : isZip ? (
                                  <Layers size={20} />
                                ) : (
                                  <Link2 size={20} />
                                )}
                                <span style={{ fontSize: '0.58rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1 }}>
                                  {formatBadge}
                                </span>
                              </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                <span style={{
                                  fontSize: '0.85rem',
                                  fontWeight: 700,
                                  color: '#0F172A',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  display: 'inline-block'
                                }}>
                                  {link.label || link.url}
                                </span>
                                <span style={{
                                  fontSize: '0.625rem',
                                  fontWeight: 800,
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: formatBg,
                                  color: formatColor,
                                  textTransform: 'uppercase',
                                  flexShrink: 0
                                }}>
                                  {formatBadge}
                                </span>
                              </div>
                              <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Eye size={12} /> {safeOpen ? subLabel : t('URL không hợp lệ')}
                              </span>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {!isCloudOrWeb && safeOpen && (
                              <button
                                type="button"
                                className="btn-download-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  downloadFileWithName(fullUrl, link.label || link.url);
                                }}
                                style={{
                                  border: '1px solid #E2E8F0',
                                  background: '#F8FAFC',
                                  color: '#334155',
                                  cursor: 'pointer',
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title={t('Tải xuống')}
                              >
                                <Download size={15} />
                              </button>
                            )}
                            {safeOpen && (
                              <a
                                href={fullUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  color: '#334155',
                                  background: '#F8FAFC',
                                  border: '1px solid #E2E8F0'
                                }}
                                className="btn-external-link"
                                title={
                                  isYouTube ? t('Mở trên YouTube') :
                                  isGoogleDrive ? t('Mở trong Google Drive') :
                                  isGoogleDocs ? t('Mở trong Google Docs') :
                                  isGoogleSheets ? t('Mở trong Google Sheets') :
                                  t('Mở trong tab mới')
                                }
                              >
                                <ExternalLink size={15} />
                              </a>
                            )}
                            {!isReadOnly && (
                              <button
                                type="button"
                                className="btn-delete-link"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteLink(idx);
                                }}
                                style={{
                                  border: '1px solid rgba(189, 29, 45, 0.2)',
                                  background: 'rgba(189, 29, 45, 0.06)',
                                  color: '#BD1D2D',
                                  cursor: 'pointer',
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '8px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                                title={t('Xóa tệp')}
                              >
                                <Trash2 size={15} />
                              </button>
                            )}
                          </div>
                        </div>

                        {youtubeVideoId && (
                          <div
                            style={{
                              width: '100%',
                              borderRadius: '10px',
                              overflow: 'hidden',
                              border: '1px solid #E2E8F0',
                              background: '#0F172A',
                              marginTop: '2px'
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <iframe
                              src={`https://www.youtube-nocookie.com/embed/${youtubeVideoId}?rel=0`}
                              title={link.label || 'YouTube video player'}
                              style={{
                                width: '100%',
                                aspectRatio: '16/9',
                                minHeight: '220px',
                                maxHeight: '340px',
                                border: 'none',
                                display: 'block'
                              }}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                              allowFullScreen
                            />
                          </div>
                        )}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Comments, Timeline, Dependencies & Whiteboard Tabs */}
            {!isNew && (
              <div className="card" style={cardStyle}>
                {/* Ch.V §3 Segmented Control Tab Bar */}
                <div style={{ marginBottom: '6px', overflowX: 'auto' }}>
                  <div style={{
                    display: 'inline-flex',
                    padding: '3px',
                    borderRadius: '10px',
                    background: '#F1F5F9',
                    border: '1px solid #E2E8F0',
                    gap: '2px',
                    flexWrap: 'wrap'
                  }}>
                    {([
                      { id: 'comments', icon: MessageSquare, label: `${t('Bình luận')} (${comments.length})` },
                      { id: 'timeline', icon: Clock, label: `${t('Dòng thời gian')} (${timeline.length})` },
                      { id: 'dependencies', icon: GitBranch, label: `${t('Phụ thuộc')}${dependencies.length > 0 ? ` (${dependencies.length})` : ''}` },
                      { id: 'whiteboard', icon: PenTool, label: `${t('Bảng trắng')}${whiteboardCanvas.nodes.length > 0 ? ` (${whiteboardCanvas.nodes.length})` : ''}` }
                    ] as const).map(tabItem => {
                      const isActive = activeTab === tabItem.id;
                      const IconComp = tabItem.icon;
                      return (
                        <button
                          key={tabItem.id}
                          type="button"
                          onClick={() => setActiveTab(tabItem.id)}
                          style={{
                            height: '32px',
                            padding: '0 14px',
                            borderRadius: '7px',
                            border: 'none',
                            background: isActive ? '#ffffff' : 'transparent',
                            color: isActive ? '#BD1D2D' : '#64748B',
                            fontWeight: isActive ? 700 : 600,
                            fontSize: '0.8rem',
                            boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <IconComp size={14} />
                          <span>{tabItem.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeTab === 'comments' ? (
                  <>
                    {!isReadOnly && (
                      <div className="workspace-task-comment-input-box" style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {replyTo && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: '#ffffff',
                            border: '1px solid #E2E8F0',
                            padding: '8px 12px',
                            borderRadius: '10px',
                            fontSize: '0.78rem',
                            color: '#0F172A'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Avatar src={replyTo.avatar} name={replyTo.userName} size={20} />
                              <span>
                                {t('Đang trả lời')}{' '}
                                <strong style={{ color: '#BD1D2D' }}>{replyTo.userName}</strong>
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setReplyTo(null)}
                              style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', fontWeight: 700, fontSize: '1rem', padding: '0 4px', lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </div>
                        )}
                        <CommentDraftRecoveryBanner onRestore={(val) => setNewCommentText(val)} />
                        <div style={{ position: 'relative' }}>
                          <MentionInput
                            value={newCommentText}
                            onChange={e => setNewCommentText(e.target.value)}
                            users={users}
                            onImagePaste={addLocalTaskCommentAttachment}
                            onFilePaste={addLocalTaskCommentAttachment}
                            placeholder={t('Viết bình luận... (Dán ảnh trực tiếp Ctrl+V)')}
                            style={{ minHeight: '65px', fontSize: '0.85rem', paddingRight: '40px' }}
                            disabled={isSubmittingComment || uploadingFile}
                          />
                          <label style={{ position: 'absolute', right: '10px', bottom: '10px', cursor: (uploadingFile || isSubmittingComment) ? 'not-allowed' : 'pointer', color: '#64748B', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title={t('Đính kèm file')}>
                            <input type="file" onChange={handleCommentAttachmentUpload} style={{ display: 'none' }} disabled={uploadingFile || isSubmittingComment} />
                            {uploadingFile ? <RefreshCw className="spin" size={18} /> : <Paperclip size={18} />}
                          </label>
                        </div>

                        {commentAttachments.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingTop: '4px' }}>
                            {commentAttachments.map((att: any, idx: number) => (
                              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#ffffff', border: '1px solid #E2E8F0', padding: '4px 8px', borderRadius: '8px', fontSize: '0.72rem', color: '#0F172A' }}>
                                {att.previewUrl ? (
                                  <img src={att.previewUrl} alt="preview" style={{ width: '22px', height: '22px', borderRadius: '4px', objectFit: 'cover' }} />
                                ) : (
                                  <Paperclip size={11} color="#BD1D2D" />
                                )}
                                <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{att.name}</span>
                                <button type="button" onClick={() => removeTaskCommentAttachment(idx)} style={{ border: 'none', background: 'transparent', color: '#BD1D2D', cursor: 'pointer', fontSize: '0.8rem', padding: '0 2px', lineHeight: 1 }}>×</button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '4px' }}>
                          <button
                            type="button"
                            onClick={handlePostComment}
                            disabled={isSubmittingComment || uploadingFile || (!newCommentText.trim() && commentAttachments.length === 0)}
                            className="btn primary sm"
                            style={{ padding: '6px 16px', fontSize: '0.78rem', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px', background: '#BD1D2D', borderColor: '#BD1D2D', color: '#fff' }}
                          >
                            {isSubmittingComment ? <RefreshCw className="spin" size={13} /> : <Send size={13} />}
                            <span>{t('Gửi')}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Comments feed list */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '420px', overflowY: 'auto', marginTop: '4px' }} className="custom-scrollbar">
                      {loadingComments ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <StatRowSkeleton />
                          <StatRowSkeleton />
                          <StatRowSkeleton />
                        </div>
                      ) : comments.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#64748B', fontSize: '0.78rem' }}>
                          {t('Chưa có thảo luận nào.')}
                        </div>
                      ) : (
                        (() => {
                          const rootComments = comments.filter((c: any) => !c.parent_id);
                          const repliesByParent = new Map<number, any[]>();
                          comments.forEach((c: any) => {
                            if (c.parent_id) {
                              const pid = Number(c.parent_id);
                              const arr = repliesByParent.get(pid) || [];
                              arr.push(c);
                              repliesByParent.set(pid, arr);
                            }
                          });
                          repliesByParent.forEach((arr) => {
                            arr.sort((a: any, b: any) => safeParseDateMs(a?.created_at) - safeParseDateMs(b?.created_at));
                          });

                          const totalCommentPages = Math.max(1, Math.ceil(rootComments.length / COMMENTS_PAGE_SIZE));
                          const safeCommentsPage = Math.min(Math.max(1, commentsPage), totalCommentPages);
                          const pagedRootComments = rootComments.slice(
                            (safeCommentsPage - 1) * COMMENTS_PAGE_SIZE,
                            safeCommentsPage * COMMENTS_PAGE_SIZE
                          );

                          const renderSingleComment = (comment: any, isReply: boolean = false) => {
                            const commUser = users.find(u => Number(u.id) === Number(comment.user_id));
                            const commentParsedAtts = ensureArray(safeJsonParse(comment.attachments, []));

                            return (
                              <div
                                key={comment.id}
                                id={`workspace-comment-${comment.id}`}
                                onClick={handleImageClick}
                                style={{
                                  display: 'flex',
                                  gap: '12px',
                                  background: isReply ? '#F8FAFC' : '#ffffff',
                                  border: '1px solid #E2E8F0',
                                  padding: isReply ? '10px 14px' : '14px 18px',
                                  borderRadius: isReply ? '12px' : '14px',
                                  marginTop: isReply ? '4px' : '0',
                                  boxSizing: 'border-box'
                                }}
                              >
                                <Avatar src={comment.avatar_url || commUser?.avatar || commUser?.avatar_url} name={commUser?.full_name || comment.user_name || 'Đồng nghiệp'} size={isReply ? 24 : 32} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '4px' }}>
                                    <span style={{ fontSize: isReply ? '0.76rem' : '0.82rem', fontWeight: 700, color: '#0F172A' }}>{commUser?.full_name || comment.user_name || 'Đồng nghiệp'}</span>
                                    <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                                      {formatDateTimeVN(comment.created_at, '')}
                                    </span>
                                  </div>
                                  {comment.content && (/<[a-z][\s\S]*>/i.test(comment.content) || /[📕📄📊📝📦🖼️📎]/.test(comment.content)) ? (
                                    <div
                                      className="rich-text-editor-content task-comment-body"
                                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(linkifyHtml(formatCommentBody(comment.content))) }}
                                      style={{ fontSize: isReply ? '0.78rem' : '0.825rem', color: '#334155', margin: '6px 0 0', lineHeight: '1.45', wordBreak: 'break-word' }}
                                    />
                                  ) : (
                                    <div
                                      className="task-comment-body"
                                      style={{ fontSize: isReply ? '0.78rem' : '0.825rem', color: '#334155', margin: '6px 0 0', lineHeight: '1.45', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                                    >
                                      {renderCommentContent(comment.content)}
                                    </div>
                                  )}
                                  {commentParsedAtts.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                                      {commentParsedAtts.map((url: any, aIdx: number) => {
                                        const name = typeof url === 'string' ? url.substring(url.lastIndexOf('/') + 1) : (url?.name || 'File');
                                        const rawHref = typeof url === 'string' ? url : (url?.url || '');
                                        const href = resolveDisplayFileUrl(rawHref);
                                        if (!href) return null;

                                        const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)($|\?)/i.test(href) || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name);
                                        if (isImage) {
                                          return (
                                            <div key={aIdx} style={{ marginTop: '4px', display: 'inline-block' }}>
                                              <a
                                                href={href}
                                                onClick={(e) => {
                                                  e.preventDefault();
                                                  setLightboxState({
                                                    isOpen: true,
                                                    items: [{ url: href, name, type: 'image' }],
                                                    initialIndex: 0
                                                  });
                                                }}
                                              >
                                                <img
                                                  src={href}
                                                  alt={name}
                                                  style={{
                                                    maxWidth: '240px',
                                                    maxHeight: '160px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #E2E8F0',
                                                    objectFit: 'contain',
                                                    background: '#F8FAFC',
                                                    cursor: 'zoom-in'
                                                  }}
                                                />
                                              </a>
                                            </div>
                                          );
                                        }

                                        return (
                                          <a key={aIdx} href={href} data-file-url={href} data-file-name={name} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '3px 8px', borderRadius: '6px', textDecoration: 'none', color: '#BD1D2D', fontSize: '0.7rem', fontWeight: 600 }} className="comment-attachment-chip">
                                            <FileText size={11} />
                                            <span>{name}</span>
                                          </a>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {!isReadOnly && (() => {
                                    const isCurrentUserAdmin = ['admin', 'superadmin', 'super_admin', 'director'].includes(roleLower);
                                    const isCommentAuthor = currentUser?.id && String(currentUser.id) === String(comment.user_id);
                                    const canDeleteComment = isCurrentUserAdmin || isCommentAuthor;

                                    return (
                                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', alignItems: 'center' }}>
                                        {canDeleteComment && (
                                          <button
                                            type="button"
                                            onClick={() => setCommentToDelete(comment.id)}
                                            style={{ background: 'none', border: 'none', color: '#BD1D2D', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', padding: '4px' }}
                                            title={t('Xóa bình luận')}
                                          >
                                            <Trash2 size={12} />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const targetName = commUser?.full_name || comment.user_name || 'Đồng nghiệp';
                                            const parentId = isReply ? (comment.parent_id || comment.id) : comment.id;
                                            setReplyTo({
                                              id: parentId,
                                              userName: targetName,
                                              avatar: comment.avatar_url || commUser?.avatar || commUser?.avatar_url
                                            });
                                            if (targetName) {
                                              const safeName = escapeHtml(targetName);
                                              const safeUid = escapeHtml(String(comment.user_id || commUser?.id || ''));
                                              const mentionTag = `<span class="mention" data-user-id="${safeUid}" contenteditable="false" style="color: #BD1D2D; font-weight: 700; background: rgba(189, 29, 45, 0.08); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin: 0 2px;">@${safeName}</span> `;
                                              setNewCommentText(prev => {
                                                if (!prev || prev === '<p><br></p>' || prev.trim() === '') return `<p>${mentionTag}</p>`;
                                                return prev.endsWith('</p>') ? prev.replace(/<\/p>$/, ` ${mentionTag}</p>`) : `${prev} ${mentionTag}`;
                                              });
                                            }
                                            const inputEl = document.querySelector('.workspace-task-comment-input-box');
                                            if (inputEl) inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }}
                                          style={{
                                            background: 'rgba(189, 29, 45, 0.06)',
                                            border: 'none',
                                            color: '#BD1D2D',
                                            fontSize: '0.7rem',
                                            padding: '4px 10px',
                                            borderRadius: '8px',
                                            cursor: 'pointer',
                                            fontWeight: 700,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                          }}
                                        >
                                          <MessageSquare size={11} />
                                          <span>{t('Phản hồi')}</span>
                                        </button>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            );
                          };

                          return (
                            <>
                              {pagedRootComments.map((rootComment: any) => {
                                const replies = repliesByParent.get(Number(rootComment.id)) || [];
                                return (
                                  <div key={rootComment.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {renderSingleComment(rootComment, false)}
                                    {replies.length > 0 && (
                                      <div style={{
                                        marginLeft: '20px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        borderLeft: '2px solid rgba(189, 29, 45, 0.2)',
                                        paddingLeft: '14px',
                                        marginTop: '6px',
                                        marginBottom: '6px'
                                      }}>
                                        {replies.map((reply: any) => renderSingleComment(reply, true))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {totalCommentPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', paddingTop: '10px', borderTop: '1px solid #E2E8F0' }}>
                                  <button type="button" disabled={safeCommentsPage <= 1} onClick={() => setCommentsPage(p => Math.max(1, p - 1))} className="btn outline sm" style={{ height: '28px', padding: '0 8px', borderRadius: '6px' }}>
                                    <ChevronLeft size={14} />
                                  </button>
                                  <span style={{ fontSize: '0.74rem', color: '#64748B', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                    {t('Trang')} {safeCommentsPage}/{totalCommentPages}
                                  </span>
                                  <button type="button" disabled={safeCommentsPage >= totalCommentPages} onClick={() => setCommentsPage(p => Math.min(totalCommentPages, p + 1))} className="btn outline sm" style={{ height: '28px', padding: '0 8px', borderRadius: '6px' }}>
                                    <ChevronRight size={14} />
                                  </button>
                                </div>
                              )}
                            </>
                          );
                        })()
                      )}
                    </div>
                  </>
                ) : activeTab === 'timeline' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '8px 4px', position: 'relative' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '450px', overflowY: 'auto', paddingRight: '6px', position: 'relative' }} className="custom-scrollbar">
                      <div style={{ position: 'absolute', left: '17px', top: '15px', bottom: '15px', width: '2px', background: '#E2E8F0' }} />

                      {loadingTimeline ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <StatRowSkeleton />
                          <StatRowSkeleton />
                        </div>
                      ) : timeline.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#64748B', fontSize: '0.8rem', padding: '20px 0' }}>
                          {t('Chưa có lịch sử hoạt động ghi nhận')}
                        </div>
                      ) : (
                        (() => {
                          const totalTimelinePages = Math.max(1, Math.ceil(timeline.length / TIMELINE_PAGE_SIZE));
                          const safeTimelinePage = Math.min(Math.max(1, timelinePage), totalTimelinePages);
                          const startIndex = (safeTimelinePage - 1) * TIMELINE_PAGE_SIZE;
                          const paginatedTimeline = timeline.slice(startIndex, startIndex + TIMELINE_PAGE_SIZE);

                          return paginatedTimeline.map((log: any, idx: number) => {
                            const dateStr = formatDateTimeVN(log.created_at, '');
                            const data: any = safeJsonParse(log.new_data, {});
                            const keys = Object.keys(data);
                            const displayKeys = keys.filter(k => [
                              'status', 'progress', 'priority', 'user_id', 'due_date', 'start_date', 'subject', 'body', 'participant_ids', 'tags', 'approver_id', 'approval_status', 'require_approval', 'type', 'task_group_id', 'related_type', 'related_id', 'contact_id'
                            ].includes(k));

                            const getActionMainText = () => {
                              switch (log.action) {
                                case 'CREATE': return t('đã tạo công việc này');
                                case 'UPDATE': return displayKeys.length > 0 ? t('đã cập nhật các thông tin:') : t('đã cập nhật thông tin công việc');
                                case 'ADD_COMMENT': return t('đã thêm bình luận mới');
                                case 'DELETE_COMMENT': return t('đã xóa bình luận');
                                case 'COMPLETE_SUBTASK': return `${t('đã hoàn thành công việc con')} "${data.title || ''}"`;
                                case 'INCOMPLETE_SUBTASK': return `${t('đã đánh dấu chưa hoàn thành công việc con')} "${data.title || ''}"`;
                                case 'ADD_SUBTASK': return `${t('đã thêm công việc con')} "${data.title || ''}"`;
                                case 'DELETE_SUBTASK': return `${t('đã xóa công việc con')} "${data.title || ''}"`;
                                case 'CANCEL_MEETING': return `${t('đã hủy lịch hẹn')} (Lý do: "${data.reason || ''}")`;
                                case 'RESCHEDULE_MEETING': return `${t('đã dời lịch hẹn đến ngày')} ${formatDateTimeVN(data.due_date, data.due_date || '')}`;
                                case 'ARCHIVE_TASK': return t('đã lưu trữ công việc');
                                case 'UNARCHIVE_TASK': return t('đã bỏ lưu trữ công việc');
                                case 'FOCUS': return t('đã hoàn thành phiên tập trung');
                                default: return `${t('đã thực hiện thao tác')} "${log.action}"`;
                              }
                            };

                            const renderFieldDiff = (k: string, rawVal: any) => {
                              const isDiff = rawVal && typeof rawVal === 'object' && ('new' in rawVal || 'to' in rawVal);
                              const oldVal = isDiff ? (rawVal.old ?? rawVal.from) : undefined;
                              const newVal = isDiff ? (rawVal.new ?? rawVal.to) : rawVal;

                              const formatValue = (fieldKey: string, v: any) => {
                                if (v === null || v === undefined || v === '' || v === 'null') return t('Không có');
                                if (fieldKey === 'status') {
                                  const statusLabels: Record<string, string> = {
                                    todo: t('Cần làm'),
                                    in_progress: t('Đang làm'),
                                    done: t('Hoàn thành'),
                                    cancelled: t('Đã hủy'),
                                    pending: t('Chờ duyệt'),
                                    planned: t('Lên kế hoạch')
                                  };
                                  return statusLabels[v] || v;
                                }
                                if (fieldKey === 'type') {
                                  return v === 'meeting' ? t('Lịch hẹn gặp gỡ') : t('Công việc chính');
                                }
                                if (fieldKey === 'task_group_id') {
                                  const grp = availableTaskGroups.find(g => Number(g.id) === Number(v));
                                  return grp?.name || `#${v}`;
                                }
                                if (fieldKey === 'approval_status') {
                                  const approvalLabels: Record<string, string> = { pending: t('Chờ duyệt'), approved: t('Đã duyệt'), rejected: t('Từ chối') };
                                  return approvalLabels[v] || v;
                                }
                                if (fieldKey === 'progress') return `${v}%`;
                                if (fieldKey === 'priority') {
                                  const priorityLabels: Record<string, string> = { low: t('Thấp'), medium: t('Trung bình'), high: t('Cao'), urgent: t('Khẩn cấp') };
                                  return priorityLabels[v] || v;
                                }
                                if (fieldKey === 'user_id' || fieldKey === 'approver_id') {
                                  const u = users.find(usr => Number(usr.id) === Number(v));
                                  return u?.full_name || `#${v}`;
                                }
                                if (fieldKey === 'due_date' || fieldKey === 'start_date') {
                                  return formatDateVN(v, String(v));
                                }
                                if (fieldKey === 'participant_ids') {
                                  const pIds = String(v).split(',').map(Number).filter(Boolean);
                                  const names = pIds.map(pid => users.find(usr => Number(usr.id) === pid)?.full_name || `#${pid}`);
                                  return names.length > 0 ? names.join(', ') : t('Không có');
                                }
                                if (fieldKey === 'require_approval') return v ? t('Bắt buộc duyệt') : t('Không bắt buộc');
                                if (fieldKey === 'body') return t('Đã cập nhật mô tả');
                                return String(v);
                              };

                              const getLabel = (fieldKey: string) => {
                                switch (fieldKey) {
                                  case 'status': return t('Trạng thái');
                                  case 'progress': return t('Tiến độ');
                                  case 'priority': return t('Độ ưu tiên');
                                  case 'user_id': return t('Người thực hiện');
                                  case 'approver_id': return t('Người duyệt');
                                  case 'approval_status': return t('Phê duyệt');
                                  case 'due_date': return t('Thời hạn');
                                  case 'start_date': return t('Ngày bắt đầu');
                                  case 'subject': return t('Tiêu đề');
                                  case 'body': return t('Mô tả');
                                  case 'participant_ids': return t('Người liên quan');
                                  case 'tags': return t('Nhãn tag');
                                  case 'require_approval': return t('Cần duyệt');
                                  case 'type': return t('Phân loại');
                                  case 'task_group_id': return t('Nhóm công việc');
                                  case 'related_type': return t('Loại liên kết');
                                  case 'related_id': return t('ID liên kết');
                                  case 'contact_id': return t('Khách hàng');
                                  default: return fieldKey;
                                }
                              };

                              const label = getLabel(k);
                              const formattedNew = formatValue(k, newVal);
                              const formattedOld = (oldVal !== undefined && oldVal !== null && oldVal !== '') ? formatValue(k, oldVal) : null;

                              if (k === 'participant_ids' && isDiff && oldVal !== undefined && newVal !== undefined) {
                                const oldIds = String(oldVal || '').split(',').map(s => s.trim()).filter(Boolean);
                                const newIds = String(newVal || '').split(',').map(s => s.trim()).filter(Boolean);
                                const addedIds = newIds.filter(id => !oldIds.includes(id));
                                const removedIds = oldIds.filter(id => !newIds.includes(id));

                                if (addedIds.length > 0 || removedIds.length > 0) {
                                  const addedNames = addedIds.map(id => users.find(u => String(u.id) === String(id))?.full_name || `#${id}`);
                                  const removedNames = removedIds.map(id => users.find(u => String(u.id) === String(id))?.full_name || `#${id}`);

                                  return (
                                    <div key={k} style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', lineHeight: '1.5' }}>
                                      <span style={{ fontWeight: 600 }}>• {label}:</span>
                                      {addedNames.length > 0 && (
                                        <span style={{ color: '#15803d', background: 'rgba(22, 163, 74, 0.08)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                          + Thêm: <strong>{addedNames.join(', ')}</strong>
                                        </span>
                                      )}
                                      {removedNames.length > 0 && (
                                        <span style={{ color: '#BD1D2D', background: 'rgba(189, 29, 45, 0.08)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                          - Bớt: <strong style={{ textDecoration: 'line-through' }}>{removedNames.join(', ')}</strong>
                                        </span>
                                      )}
                                    </div>
                                  );
                                }
                              }

                              if (k === 'tags' && isDiff && oldVal !== undefined && newVal !== undefined) {
                                const oldTags = String(oldVal || '').split(',').map(s => s.trim()).filter(Boolean);
                                const newTags = String(newVal || '').split(',').map(s => s.trim()).filter(Boolean);
                                const addedTags = newTags.filter(tg => !oldTags.includes(tg));
                                const removedTags = oldTags.filter(tg => !newTags.includes(tg));

                                if (addedTags.length > 0 || removedTags.length > 0) {
                                  return (
                                    <div key={k} style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', lineHeight: '1.5' }}>
                                      <span style={{ fontWeight: 600 }}>• {label}:</span>
                                      {addedTags.length > 0 && (
                                        <span style={{ color: '#15803d', background: 'rgba(22, 163, 74, 0.08)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                          + Thêm: <strong>{addedTags.join(', ')}</strong>
                                        </span>
                                      )}
                                      {removedTags.length > 0 && (
                                        <span style={{ color: '#BD1D2D', background: 'rgba(189, 29, 45, 0.08)', padding: '2px 8px', borderRadius: '6px', fontWeight: 600 }}>
                                          - Bớt: <strong style={{ textDecoration: 'line-through' }}>{removedTags.join(', ')}</strong>
                                        </span>
                                      )}
                                    </div>
                                  );
                                }
                              }

                              if (formattedOld && formattedOld !== formattedNew) {
                                return (
                                  <div key={k} style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', lineHeight: '1.4' }}>
                                    <span style={{ fontWeight: 600 }}>• {label}:</span>
                                    <span style={{ textDecoration: 'line-through', opacity: 0.7 }}>{formattedOld}</span>
                                    <span style={{ color: '#BD1D2D', fontWeight: 800, fontSize: '0.8rem' }}>➔</span>
                                    <strong style={{ color: '#0F172A', fontWeight: 700 }}>{formattedNew}</strong>
                                  </div>
                                );
                              }

                              return (
                                <div key={k} style={{ fontSize: '0.78rem', color: '#64748B', lineHeight: '1.4' }}>
                                  <span style={{ fontWeight: 600 }}>• {label}:</span> <strong style={{ color: '#0F172A', fontWeight: 700 }}>{formattedNew}</strong>
                                </div>
                              );
                            };

                            return (
                              <div key={log.id || idx} style={{ display: 'flex', gap: '15px', position: 'relative', zIndex: 1 }}>
                                <div style={{ flexShrink: 0 }}>
                                  <Avatar src={log.user_avatar} name={log.user_name || t('Hệ thống')} size={34} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, paddingTop: '2px' }}>
                                  <div style={{ fontSize: '0.825rem', color: '#0F172A', lineHeight: '1.4' }}>
                                    <strong style={{ color: '#0F172A', marginRight: '6px', fontWeight: 700 }}>{log.user_name || t('Hệ thống')}</strong>
                                    {getActionMainText()}
                                  </div>
                                  {log.action === 'UPDATE' && displayKeys.length > 0 && (
                                    <div style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '4px',
                                      marginTop: '3px',
                                      marginBottom: '3px',
                                      borderLeft: '2px solid #BD1D2D',
                                      background: '#F8FAFC',
                                      padding: '6px 10px',
                                      borderRadius: '0 8px 8px 0'
                                    }}>
                                      {displayKeys.map(k => renderFieldDiff(k, data[k]))}
                                    </div>
                                  )}
                                  <span style={{ fontSize: '0.72rem', color: '#64748B', fontVariantNumeric: 'tabular-nums' }}>{dateStr}</span>
                                </div>
                              </div>
                            );
                          });
                        })()
                      )}
                    </div>

                    {/* Full Windowed Timeline Pagination (no 100-item hard cap!) */}
                    {timeline.length > TIMELINE_PAGE_SIZE && (() => {
                      const totalPages = Math.ceil(timeline.length / TIMELINE_PAGE_SIZE);
                      const safePage = Math.min(Math.max(1, timelinePage), totalPages);
                      return (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '12px', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            disabled={safePage <= 1}
                            onClick={() => setTimelinePage(p => Math.max(1, p - 1))}
                            className="btn outline sm"
                            style={{ minWidth: '30px', height: '30px', borderRadius: '8px', padding: '0 8px' }}
                          >
                            ‹ {t('Trước')}
                          </button>
                          {Array.from({ length: totalPages }, (_, pIdx) => {
                            const pNum = pIdx + 1;
                            if (totalPages <= 5 || pNum === 1 || pNum === totalPages || Math.abs(pNum - safePage) <= 1) {
                              return (
                                <button
                                  key={pNum}
                                  type="button"
                                  onClick={() => setTimelinePage(pNum)}
                                  style={{
                                    minWidth: '30px',
                                    height: '30px',
                                    borderRadius: '8px',
                                    border: safePage === pNum ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                                    background: safePage === pNum ? '#BD1D2D' : '#ffffff',
                                    color: safePage === pNum ? '#fff' : '#0F172A',
                                    fontWeight: 700,
                                    fontSize: '0.78rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {pNum}
                                </button>
                              );
                            } else if (
                              (pNum === 2 && safePage > 3) ||
                              (pNum === totalPages - 1 && safePage < totalPages - 2)
                            ) {
                              return <span key={pNum} style={{ color: '#64748B', padding: '0 2px' }}>…</span>;
                            }
                            return null;
                          })}
                          <button
                            type="button"
                            disabled={safePage >= totalPages}
                            onClick={() => setTimelinePage(p => Math.min(totalPages, p + 1))}
                            className="btn outline sm"
                            style={{ minWidth: '30px', height: '30px', borderRadius: '8px', padding: '0 8px' }}
                          >
                            {t('Sau')} ›
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                ) : activeTab === 'dependencies' ? (
                  <TaskDependenciesTab
                    taskId={Number(activeTaskId)}
                    projectId={erpMeta.project_id || (formData.related_type === 'project' ? formData.related_id : null)}
                    isReadOnly={isReadOnly}
                    dependencies={dependencies}
                    loading={loadingDependencies}
                    candidateTasks={dependencyCandidates}
                    loadingCandidates={loadingDependencyCandidates}
                    saving={savingDependencies}
                    onAddDependency={handleAddDependency}
                    onRemoveDependency={handleRemoveDependency}
                    onReload={() => loadDependencies(Number(activeTaskId))}
                  />
                ) : (
                  <TaskWhiteboardTab
                    isReadOnly={isReadOnly}
                    loading={whiteboardLoading}
                    saving={whiteboardSaving}
                    canEditServer={whiteboardCanEdit}
                    version={whiteboardVersion}
                    title={whiteboardTitle}
                    lastEditedByName={whiteboardEditedBy.name}
                    lastEditedByAvatar={whiteboardEditedBy.avatar}
                    updatedAt={whiteboardEditedBy.updatedAt}
                    canvasData={whiteboardCanvas}
                    isDirty={whiteboardDirty}
                    snapshots={whiteboardSnapshots}
                    loadingSnapshots={loadingWhiteboardSnapshots}
                    onChangeCanvas={(nextCanvas) => {
                      setWhiteboardCanvas(nextCanvas);
                      setWhiteboardDirty(true);
                    }}
                    onSave={handleSaveWhiteboard}
                    onCreateSnapshot={handleCreateWhiteboardSnapshot}
                    onRestoreSnapshot={handleRestoreWhiteboardSnapshot}
                    onReload={() => {
                      const tid = Number(activeTaskIdRef.current);
                      if (tid) {
                        loadWhiteboard(tid);
                        loadWhiteboardSnapshots(tid);
                      }
                    }}
                  />
                )}
              </div>
            )}

            <div style={{ height: '5rem', flexShrink: 0 }} />
          </div>

          {/* Right Column (3) */}
          <div
            style={{
              flex: isMobileOrTablet ? 'none' : 3,
              display: 'flex',
              flexDirection: 'column',
              gap: isMobileOrTablet ? '1rem' : (embedMode ? '12px' : '1.35rem'),
              minWidth: 0,
              background: '#F8FAFC',
              borderLeft: isMobileOrTablet ? 'none' : '1px solid #E2E8F0',
              overflowY: 'auto',
              padding: isMobileOrTablet ? '1rem 1rem 100px 1rem' : (embedMode ? '1rem 0.5rem 1.5rem 0.5rem' : '1.5rem 2rem 1.5rem 2rem')
            }}
            className="custom-scrollbar"
          >
            {/* Tiến độ công việc / Lịch hẹn */}
            <div className="card" style={cardStyle}>
              {formData.type === 'meeting' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>{t('Trạng thái lịch hẹn')}</span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>{t('Trạng thái hiện tại:')}</span>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: formData.status === 'done'
                          ? 'rgba(16, 185, 129, 0.1)'
                          : (formData.status === 'cancelled' ? 'rgba(189, 29, 45, 0.08)' : '#F1F5F9'),
                        color: formData.status === 'done'
                          ? '#10b981'
                          : (formData.status === 'cancelled' ? '#BD1D2D' : '#334155')
                      }}
                    >
                      {formData.status === 'done' ? t('Đã gặp') : (formData.status === 'cancelled' ? t('Đã hủy') : t('Chưa gặp'))}
                    </span>
                  </div>

                  {!isReadOnly && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                      {/* Đã gặp Button */}
                      <button
                        type="button"
                        className="btn success"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer',
                          background: formData.status === 'done' ? '#10b981' : 'rgba(16, 185, 129, 0.1)',
                          color: formData.status === 'done' ? '#fff' : '#059669'
                        }}
                        onClick={async () => {
                          const targetTid = activeTaskIdRef.current;
                          if (!targetTid || targetTid === 'new' || completeMeetingInFlightRef.current) return;
                          completeMeetingInFlightRef.current = true;
                          try {
                            const res = await api.get(`/activities/${targetTid}/comments`);
                            if (String(activeTaskIdRef.current) !== String(targetTid)) return;
                            const commentsList = extractArray(res?.data);
                            const hasImage = commentsList.some((c: any) => {
                              const rawAtts = Array.isArray(c.attachments)
                                ? c.attachments
                                : ensureArray(safeJsonParse(c.attachments, []));
                              return rawAtts.some((att: any) => {
                                const attStr = typeof att === 'string' ? att : (att?.url || att?.file_url || att?.name || '');
                                return /\.(jpg|jpeg|png|gif|webp)$/i.test(String(attStr));
                              });
                            });

                            if (hasImage) {
                              const prevStatus = formDataRef.current?.status || 'open';
                              const prevProgress = formDataRef.current?.progress || 0;
                              const resUpdate = await enqueueTaskUpdate({ fieldPatch: { status: 'done', progress: 100 } });
                              if (resUpdate.success) {
                                triggerLocalConfetti();
                                showUndoToast({
                                  message: t('Đã cập nhật trạng thái lịch hẹn thành công'),
                                  subMessage: t('Bấm để hoàn tác nếu bạn thao tác nhầm'),
                                  onUndo: async () => {
                                    await enqueueTaskUpdate({ fieldPatch: { status: prevStatus, progress: prevProgress } });
                                  }
                                });
                              }
                            } else {
                              setMeetingToComplete({ ...formDataRef.current, id: targetTid });
                              setProofCommentText('Ảnh minh chứng hoàn thành gặp gỡ');
                              setProofImageFile(null);
                              setSafeProofPreview(null);
                            }
                          } catch {
                            toast.error(t('Lỗi khi kiểm tra minh chứng'));
                          } finally {
                            completeMeetingInFlightRef.current = false;
                          }
                        }}
                      >
                        <CheckCircle2 size={14} /> {t('Đã gặp')}
                      </button>

                      {/* Hủy Button */}
                      <button
                        type="button"
                        className="btn danger"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                          padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer',
                          background: formData.status === 'cancelled' ? '#BD1D2D' : 'rgba(189, 29, 45, 0.08)',
                          color: formData.status === 'cancelled' ? '#fff' : '#BD1D2D'
                        }}
                        onClick={() => {
                          setCancellingMeeting({ ...formDataRef.current, id: activeTaskIdRef.current });
                          setCancelReason('');
                        }}
                      >
                        <XCircle size={14} /> {t('Hủy lịch hẹn')}
                      </button>

                      {/* Dời lịch Input (Local timezone safe!) */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px dashed #E2E8F0', paddingTop: '10px', marginTop: '4px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Calendar size={12} /> {t('Dời lịch hẹn sang:')}
                        </span>
                        <input
                          type="datetime-local"
                          value={toDateTimeLocalInput(formData.due_date, defaultDueTimeHHmm)}
                          onChange={async (e) => {
                            const newDate = e.target.value;
                            if (!newDate || rescheduleMeetingInFlightRef.current) return;
                            rescheduleMeetingInFlightRef.current = true;
                            try {
                              const formattedLocal = newDate.replace('T', ' ') + (newDate.length === 16 ? ':00' : '');
                              const resUpdate = await enqueueTaskUpdate({
                                fieldPatch: { due_date: formattedLocal, status: 'open', progress: 0 }
                              });
                              if (resUpdate.success) {
                                toast.success(t('Đã dời lịch hẹn thành công'));
                              }
                            } finally {
                              rescheduleMeetingInFlightRef.current = false;
                            }
                          }}
                          style={{
                            width: '100%',
                            fontSize: '0.8rem',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            background: '#ffffff',
                            color: '#0F172A'
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>{t('Tiến độ công việc')}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontVariantNumeric: 'tabular-nums' }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        disabled={isReadOnly}
                        value={formData.progress ?? 0}
                        onChange={(e) => {
                          if (isReadOnly) return;
                          let val = Number(e.target.value);
                          if (isNaN(val)) val = 0;
                          val = Math.min(100, Math.max(0, val));
                          setFormData((prev: any) => {
                            const next: any = { ...prev, progress: val };
                            if (val === 100 && prev.require_approval === 1 && prev.approver_id && prev.approval_status !== 'approved') {
                              next.approval_status = 'pending';
                            } else if (val < 100 && prev.approval_status === 'pending') {
                              next.approval_status = null;
                            }
                            formDataRef.current = next;
                            return next;
                          });
                        }}
                        onBlur={() => {
                          if (!isReadOnly && !isNew && activeTaskId && activeTaskId !== 'new') {
                            const cur = formDataRef.current || {};
                            const prog = Number(cur.progress || 0);
                            const patch: Record<string, any> = { progress: prog };
                            if (prog === 100 && Number(cur.require_approval) === 1 && cur.approver_id && cur.approval_status !== 'approved') {
                              patch.approval_status = 'pending';
                            } else if (prog < 100 && cur.approval_status === 'pending') {
                              patch.approval_status = null;
                            }
                            handleUpdateField(patch);
                          }
                        }}
                        style={{
                          width: '44px',
                          height: '24px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                          textAlign: 'center',
                          color: '#BD1D2D',
                          border: '1px solid #E2E8F0',
                          borderRadius: '6px',
                          background: isReadOnly ? '#F8FAFC' : '#ffffff',
                          padding: 0
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#BD1D2D' }}>%</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    disabled={isReadOnly}
                    value={formData.progress || 0}
                    onChange={(e) => {
                      if (isReadOnly) return;
                      const val = Number(e.target.value);
                      setFormData((prev: any) => {
                        const next: any = { ...prev, progress: val };
                        if (val === 100 && prev.require_approval === 1 && prev.approver_id && prev.approval_status !== 'approved') {
                          next.approval_status = 'pending';
                        } else if (val < 100 && prev.approval_status === 'pending') {
                          next.approval_status = null;
                        }
                        formDataRef.current = next;
                        return next;
                      });
                    }}
                    onMouseUp={() => {
                      if (!isReadOnly && !isNew && activeTaskId && activeTaskId !== 'new') {
                        const cur = formDataRef.current || {};
                        const prog = Number(cur.progress || 0);
                        const patch: Record<string, any> = { progress: prog };
                        if (prog === 100 && Number(cur.require_approval) === 1 && cur.approver_id && cur.approval_status !== 'approved') {
                          patch.approval_status = 'pending';
                        } else if (prog < 100 && cur.approval_status === 'pending') {
                          patch.approval_status = null;
                        }
                        handleUpdateField(patch);
                      }
                    }}
                    onTouchEnd={() => {
                      if (!isReadOnly && !isNew && activeTaskId && activeTaskId !== 'new') {
                        const cur = formDataRef.current || {};
                        const prog = Number(cur.progress || 0);
                        const patch: Record<string, any> = { progress: prog };
                        if (prog === 100 && Number(cur.require_approval) === 1 && cur.approver_id && cur.approval_status !== 'approved') {
                          patch.approval_status = 'pending';
                        } else if (prog < 100 && cur.approval_status === 'pending') {
                          patch.approval_status = null;
                        }
                        handleUpdateField(patch);
                      }
                    }}
                    onKeyUp={() => {
                      if (!isReadOnly && !isNew && activeTaskId && activeTaskId !== 'new') {
                        const cur = formDataRef.current || {};
                        const prog = Number(cur.progress || 0);
                        const patch: Record<string, any> = { progress: prog };
                        if (prog === 100 && Number(cur.require_approval) === 1 && cur.approver_id && cur.approval_status !== 'approved') {
                          patch.approval_status = 'pending';
                        } else if (prog < 100 && cur.approval_status === 'pending') {
                          patch.approval_status = null;
                        }
                        handleUpdateField(patch);
                      }
                    }}
                    className="progress-slider"
                    style={{
                      cursor: isReadOnly ? 'not-allowed' : 'pointer',
                      background: (formData.progress || 0) === 100
                        ? '#10b981'
                        : 'linear-gradient(to right, #BD1D2D 0%, #BD1D2D ' + (formData.progress || 0) + '%, #E2E8F0 ' + (formData.progress || 0) + '%, #E2E8F0 100%)'
                    }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </>
              )}
            </div>

            {/* Khách hàng liên kết */}
            <div className="card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>{t('Liên kết khách hàng')}</span>
                  <p style={{ fontSize: '0.65rem', color: '#64748B', margin: 0 }}>{t('Gắn công việc với khách hàng')}</p>
                </div>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => {
                    if (isReadOnly) return;
                    const next = !isCustomerLinked;
                    if (next) {
                      setIsCustomerLinked(true);
                      fetchContactsList();
                    } else if (hasLinkedCustomer) {
                      setShowClearCustomerConfirm(true);
                    } else {
                      setIsCustomerLinked(false);
                    }
                  }}
                  style={{
                    width: '38px',
                    height: '20px',
                    borderRadius: '10px',
                    border: 'none',
                    background: isCustomerLinked ? '#BD1D2D' : '#CBD5E1',
                    position: 'relative',
                    cursor: isReadOnly ? 'not-allowed' : 'pointer',
                    opacity: isReadOnly ? 0.6 : 1,
                    transition: 'background 0.2s',
                    flexShrink: 0
                  }}
                >
                  <div style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: isCustomerLinked ? 20 : 2,
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                  }} />
                </button>
              </div>

              {isCustomerLinked && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                  {((formData.related_type === 'contact' || formData.contact_id) && (formData.related_type === 'contact' ? formData.related_id : formData.contact_id)) ? (
                    <div style={{ marginBottom: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                          {t('Khách hàng chính')}
                        </div>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={() => {
                              setFormData((prev: any) => {
                                const next = {
                                  ...prev,
                                  contact_id: null,
                                  contact_name: '',
                                  contact_avatar: '',
                                  contact_phone: '',
                                  contact_email: '',
                                  ...(prev.related_type === 'contact' ? { related_id: null, related_type: null } : {})
                                };
                                formDataRef.current = next;
                                return next;
                              });
                              fetchContactsList(null, true);
                            }}
                            style={{ border: 'none', background: 'transparent', color: '#BD1D2D', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, padding: '2px' }}
                          >
                            {t('Thay đổi')}
                          </button>
                        )}
                      </div>
                      <div
                        onClick={() => {
                          const contactIdVal = Number(formData.related_type === 'contact' ? formData.related_id : formData.contact_id);
                          if (contactIdVal) {
                            const initData = {
                              id: contactIdVal,
                              full_name: formData.contact_name,
                              avatar_url: primaryContactObj?.avatar_url || primaryContactObj?.avatar || formData.contact_avatar,
                              phone: primaryContactObj?.phone || formData.contact_phone,
                              email: primaryContactObj?.email || formData.contact_email,
                              _isLoading: true
                            };
                            if (onOpenContact) {
                              onOpenContact(contactIdVal, initData);
                            } else {
                              window.dispatchEvent(new CustomEvent('open-contact-drawer', {
                                detail: { id: contactIdVal, contactId: contactIdVal, initialData: initData }
                              }));
                            }
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '10px 12px',
                          background: '#F8FAFC',
                          border: '1px solid #E2E8F0',
                          borderRadius: '12px',
                          cursor: 'pointer'
                        }}
                        title={t('Nhấn để mở chi tiết hồ sơ khách hàng')}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <Avatar
                            name={formData.contact_name || t('Khách hàng')}
                            src={primaryContactObj?.avatar_url || primaryContactObj?.avatar || formData.contact_avatar}
                            size={28}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {formData.contact_name || t('Khách hàng')}
                            </span>
                            <span style={{ fontSize: '0.625rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {primaryContactObj?.phone || primaryContactObj?.email || formData.contact_phone || formData.contact_email || t('Xem hồ sơ')}
                            </span>
                          </div>
                        </div>
                        <ArrowUpRight size={16} style={{ flexShrink: 0, marginLeft: 8, color: '#BD1D2D' }} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                        {t('Khách hàng chính')}
                      </div>
                      <CustomSelect
                        searchable
                        showAvatars
                        disabled={isReadOnly}
                        loading={searchingContacts || loadingContacts}
                        onSearchChange={handleContactsSearch}
                        options={contactOptions}
                        value={formData.contact_id ? String(formData.contact_id) : (formData.related_type === 'contact' && formData.related_id ? String(formData.related_id) : '')}
                        onChange={val => {
                          if (isReadOnly) return;
                          const selected = allowedContacts.find(c => String(c.id) === String(val));
                          const contactIdVal = val ? Number(val) : null;
                          const contactNameVal = selected ? getContactFullName(selected) : '';
                          const isContactRelated = (formDataRef.current?.related_type === 'contact' || !formDataRef.current?.related_type);

                          const nextPatch: Record<string, any> = {
                            contact_id: contactIdVal,
                            contact_name: contactNameVal,
                            contact_avatar: selected?.avatar_url || selected?.avatar || '',
                            contact_phone: selected?.phone || '',
                            contact_email: selected?.email || '',
                            ...(isContactRelated ? {
                              related_id: contactIdVal,
                              related_type: contactIdVal ? 'contact' : null
                            } : {})
                          };
                          setIsCustomerLinked(true);
                          handleUpdateField(nextPatch);
                        }}
                        placeholder={loadingContacts ? t('Đang tải danh sách...') : t('Chọn khách hàng chính...')}
                      />
                    </div>
                  )}

                  {(() => {
                    const addContactIds = ensureArray(erpMeta.related_contact_ids);
                    const addContacts = allowedContacts.filter(c => addContactIds.includes(Number(c.id)));
                    const mainContactId = Number(formData.related_id || formData.contact_id || 0);

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                        {addContacts.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                              {t('Khách hàng liên kết thêm')} ({addContacts.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                              {addContacts.map(c => (
                                <div
                                  key={c.id}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    padding: '8px 12px',
                                    borderRadius: '10px'
                                  }}
                                >
                                  <div
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', flex: 1, minWidth: 0 }}
                                    onClick={() => {
                                      const targetAddId = Number(c.id);
                                      if (targetAddId) {
                                        const initData = {
                                          id: targetAddId,
                                          full_name: getContactFullName(c),
                                          avatar_url: c.avatar_url || c.avatar,
                                          phone: c.phone,
                                          email: c.email,
                                          _isLoading: true
                                        };
                                        if (onOpenContact) {
                                          onOpenContact(targetAddId, initData);
                                        } else {
                                          window.dispatchEvent(new CustomEvent('open-contact-drawer', {
                                            detail: { id: targetAddId, contactId: targetAddId, initialData: initData }
                                          }));
                                        }
                                      }
                                    }}
                                  >
                                    <Avatar name={getContactFullName(c)} src={c.avatar_url || c.avatar} size={22} />
                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getContactFullName(c)}</span>
                                      <span style={{ fontSize: '0.625rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.phone || c.email || t('Xem hồ sơ')}</span>
                                    </div>
                                  </div>
                                  {!isReadOnly && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextIds = addContactIds.filter((id: number) => id !== Number(c.id));
                                        const curMeta = erpMetaRef.current || erpMeta;
                                        const updatedMeta = { ...curMeta, related_contact_ids: nextIds };
                                        handleSaveMeta(updatedMeta, undefined, { dirtyMetaFields: ['related_contact_ids'] });
                                      }}
                                      style={{ border: 'none', background: 'transparent', color: '#BD1D2D', cursor: 'pointer', fontSize: '0.9rem', padding: '4px', lineHeight: 1 }}
                                      title={t('Xóa')}
                                    >
                                      ×
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {!isReadOnly && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase' }}>
                              {t('Thêm khách hàng liên kết')}
                            </div>
                            <CustomSelect
                              multiple
                              searchable
                              showAvatars
                              loading={searchingContacts || loadingContacts}
                              onSearchChange={handleContactsSearch}
                              options={allowedContacts
                                .filter(c => Number(c.id) !== mainContactId)
                                .map(buildContactSelectOption)}
                              value={addContactIds.map(String)}
                              onChange={(vals) => {
                                const nextIds = ensureArray(vals).map(Number);
                                const curMeta = erpMetaRef.current || erpMeta;
                                const updatedMeta = { ...curMeta, related_contact_ids: nextIds };
                                setIsCustomerLinked(true);
                                handleSaveMeta(updatedMeta, undefined, { dirtyMetaFields: ['related_contact_ids'] });
                              }}
                              placeholder={t('Chọn khách hàng...')}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Approval Banner */}
            {formData.require_approval === 1 && formData.progress === 100 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px',
                borderRadius: '12px',
                background: formData.approval_status === 'pending' ? 'rgba(245, 158, 11, 0.06)' : formData.approval_status === 'approved' ? 'rgba(16, 185, 129, 0.06)' : 'rgba(189, 29, 45, 0.06)',
                border: `1px solid ${formData.approval_status === 'pending' ? '#f59e0b' : formData.approval_status === 'approved' ? '#10b981' : '#BD1D2D'}`,
                color: formData.approval_status === 'pending' ? '#b45309' : formData.approval_status === 'approved' ? '#047857' : '#BD1D2D'
              }}>
                <div style={{ fontSize: '0.825rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={16} />
                  <span>
                    {formData.approval_status === 'pending' ? (
                      `Đang chờ Người duyệt (${users.find(u => String(u.id) === String(formData.approver_id))?.full_name || 'Chưa phân công'}) phê duyệt hoàn thành.`
                    ) : formData.approval_status === 'approved' ? (
                      t('Nhiệm vụ đã được phê duyệt thành công')
                    ) : (
                      t('Yêu cầu hoàn thành nhiệm vụ bị từ chối')
                    )}
                  </span>
                </div>
                {formData.approval_status === 'pending' && isApproverOrAdmin && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="btn primary"
                      disabled={isSaving}
                      onClick={async () => {
                        if (inlineApprovalInFlightRef.current) return;
                        inlineApprovalInFlightRef.current = true;
                        setIsSaving(true);
                        try {
                          const resUpdate = await enqueueTaskUpdate({ fieldPatch: { approval_status: 'approved', status: 'done' } });
                          if (resUpdate.success) {
                            triggerLocalConfetti();
                            toast.success(t('Đã phê duyệt hoàn thành công việc'));
                          }
                        } finally {
                          inlineApprovalInFlightRef.current = false;
                          setIsSaving(false);
                        }
                      }}
                      style={{ height: '28px', fontSize: '0.72rem', fontWeight: 700, padding: '0 10px', background: '#10b981', borderColor: '#10b981', color: 'white' }}
                    >
                      {isSaving ? t('Đang duyệt...') : t('Phê duyệt')}
                    </button>
                    <button
                      type="button"
                      className="btn outline"
                      disabled={isSaving}
                      onClick={async () => {
                        if (inlineApprovalInFlightRef.current) return;
                        inlineApprovalInFlightRef.current = true;
                        setIsSaving(true);
                        try {
                          const resUpdate = await enqueueTaskUpdate({ fieldPatch: { approval_status: 'rejected', progress: safeRejectProgressPct } });
                          if (resUpdate.success) {
                            toast.success(t('Đã từ chối phê duyệt hoàn thành.'));
                          }
                        } finally {
                          inlineApprovalInFlightRef.current = false;
                          setIsSaving(false);
                        }
                      }}
                      style={{ height: '28px', fontSize: '0.72rem', fontWeight: 700, padding: '0 10px', color: '#BD1D2D', borderColor: '#BD1D2D' }}
                    >
                      {isSaving ? t('Đang từ chối...') : t('Từ chối')}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Yêu cầu phê duyệt */}
            <div className="card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>{t('Yêu cầu phê duyệt')}</span>
                  <p style={{ fontSize: '0.6875rem', color: '#64748B', margin: 0 }}>{t('Duyệt hoàn thành khi đạt 100%')}</p>
                </div>
                <button
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => {
                    if (isReadOnly) return;
                    const curForm = formDataRef.current || {};
                    const next = curForm.require_approval === 1 ? 0 : 1;
                    const nextData: any = { require_approval: next };
                    if (next === 0) {
                      nextData.approver_id = null;
                      nextData.approval_status = null;
                    } else if (curForm.progress === 100 && curForm.approver_id) {
                      nextData.approval_status = 'pending';
                    }
                    handleUpdateField(nextData);
                  }}
                  style={{
                    width: '38px',
                    height: '20px',
                    borderRadius: '10px',
                    border: 'none',
                    background: formData.require_approval === 1 ? '#BD1D2D' : '#CBD5E1',
                    position: 'relative',
                    cursor: isReadOnly ? 'not-allowed' : 'pointer',
                    opacity: isReadOnly ? 0.6 : 1,
                    transition: 'background 0.2s'
                  }}
                >
                  <div style={{
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: '#ffffff',
                    position: 'absolute',
                    top: '2px',
                    left: formData.require_approval === 1 ? 20 : 2,
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                  }} />
                </button>
              </div>

              {formData.require_approval === 1 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{t('Người phê duyệt')}</label>
                  <CustomSelect
                    options={approverSelectOptions}
                    disabled={isReadOnly}
                    value={formData.approver_id ? String(formData.approver_id) : ''}
                    onChange={val => {
                      if (isReadOnly) return;
                      const nextVal = val ? Number(val) : null;
                      const nextData: any = { approver_id: nextVal };
                      if (formDataRef.current?.progress === 100 && nextVal) {
                        nextData.approval_status = 'pending';
                      }
                      handleUpdateField(nextData);
                    }}
                    placeholder={t('Chọn người phê duyệt...')}
                    searchable
                    showAvatars
                  />
                </div>
              )}
            </div>

            {/* Liên kết team */}
            <div className="card" style={cardStyle}>
              <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
                {t('Liên kết team')}
              </div>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                {(() => {
                  const selectedTeamIds = ensureArray(erpMeta?.team_ids, erpMeta?.team_id ? [erpMeta.team_id] : []);
                  const selectedTeams = allowedTeams.filter(tm => selectedTeamIds.some((id: any) => String(id) === String(tm.id)));

                  return (
                    <>
                      {selectedTeams.map(tm => (
                        <span
                          key={tm.id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '5px 12px',
                            background: '#F8FAFC',
                            color: '#0F172A',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0'
                          }}
                        >
                          <Users size={13} color="#64748B" />
                          {tm.name}
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextTeamIds = selectedTeamIds.filter((id: any) => String(id) !== String(tm.id));
                                const nextPrimaryTeamId = nextTeamIds[0] || null;
                                const curMeta = erpMetaRef.current || erpMeta;
                                const nextMeta = { ...curMeta, team_ids: nextTeamIds, team_id: nextPrimaryTeamId };

                                const curForm = formDataRef.current || {};
                                if (!nextPrimaryTeamId && curForm.related_type === 'team') {
                                  const fallbackCid = curForm.contact_id || null;
                                  formDataRef.current = {
                                    ...curForm,
                                    team_id: undefined,
                                    related_type: fallbackCid ? 'contact' : null,
                                    related_id: fallbackCid || null
                                  };
                                  setFormData(formDataRef.current);
                                }
                                handleSaveMeta(nextMeta, undefined, { dirtyMetaFields: ['team_ids', 'team_id'] });
                              }}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#64748B',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                padding: 0,
                                fontSize: '0.85rem',
                                marginLeft: '4px'
                              }}
                            >
                              ×
                            </button>
                          )}
                        </span>
                      ))}
                    </>
                  );
                })()}

                {!isReadOnly && (
                  <button
                    type="button"
                    className="team-dropdown-trigger"
                    onClick={(e) => {
                      if (showTeamDropdown) {
                        setShowTeamDropdown(false);
                      } else {
                        setTeamDropdownRect(portalComputeRect(e.currentTarget, 260, 280));
                        setShowTeamDropdown(true);
                      }
                    }}
                    style={{
                      border: '1px dashed #BD1D2D',
                      background: 'rgba(189, 29, 45, 0.04)',
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title={t('Liên kết thêm team')}
                  >
                    <Plus size={16} color="#BD1D2D" />
                  </button>
                )}
              </div>
            </div>

            {/* Người thực hiện & Người liên quan */}
            <div className="card" style={cardStyle}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={cardLabelStyle}>
                    {t('Người thực hiện chính')}
                  </label>
                  <CustomSelect
                    options={userSelectOptions}
                    disabled={isReadOnly}
                    value={String(formData.user_id || '')}
                    onChange={val => {
                      if (isReadOnly) return;
                      const newUserId = Number(val);
                      const patch: Record<string, any> = { user_id: newUserId };
                      if (newUserId) {
                        const currentP = getParticipantIds(formDataRef.current?.participant_ids);
                        if (currentP.includes(String(newUserId))) {
                          patch.participant_ids = currentP.filter(id => id !== String(newUserId)).join(',');
                        }
                      }
                      handleUpdateField(patch);
                    }}
                    searchable
                    showAvatars
                  />
                </div>

                <div style={{ borderTop: '1px dashed #E2E8F0', paddingTop: '12px' }}>
                  <label style={cardLabelStyle}>
                    {t('Người liên quan')}
                  </label>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {participants.length > 0 && (
                      <div
                        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowParticipantsModal(true);
                        }}
                        title={t('Xem chi tiết người liên quan')}
                      >
                        {participants.map((u, idx) => (
                          <div
                            key={u.id}
                            style={{
                              marginLeft: idx === 0 ? 0 : -8,
                              border: '1.5px solid #ffffff',
                              borderRadius: '50%',
                              overflow: 'hidden',
                              zIndex: 10 - idx,
                              display: 'flex'
                            }}
                            title={u.full_name || u.name}
                          >
                            <Avatar src={u.avatar || u.avatar_url} name={u.full_name || u.name} size={28} />
                          </div>
                        ))}
                      </div>
                    )}

                    {!isReadOnly && (
                      <button
                        type="button"
                        className="participant-dropdown-trigger"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (showParticipantDropdown) {
                            setShowParticipantDropdown(false);
                          } else {
                            setParticipantDropdownRect(portalComputeRect(e.currentTarget, 260, 280));
                            setShowParticipantDropdown(true);
                          }
                        }}
                        style={{
                          border: '1px dashed #BD1D2D',
                          background: 'rgba(189, 29, 45, 0.04)',
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          padding: 0
                        }}
                        title={t('Thêm người liên quan')}
                      >
                        <UserPlus size={14} color="#BD1D2D" />
                      </button>
                    )}
                  </div>
                </div>

                {isPersonalTask && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(15, 23, 42, 0.05)',
                    border: '1px solid #E2E8F0',
                    marginTop: '4px'
                  }}>
                    <Shield size={15} color="#334155" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '0.76rem', color: '#0F172A', lineHeight: 1.4 }}>
                      <strong>{t('Công việc cá nhân:')}</strong> {t('Chỉ bạn nhìn thấy')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Phân loại công việc */}
            <div className="card" style={cardStyle}>
              <label style={cardLabelStyle}>
                {t('Phân loại công việc')}
              </label>
              <CustomSelect
                disabled={isReadOnly}
                options={[
                  { value: 'task', label: t('Công việc chính') },
                  { value: 'meeting', label: t('Lịch hẹn gặp gỡ') }
                ]}
                value={formData.type || 'task'}
                onChange={async (val) => {
                  if (isReadOnly) return;
                  const newType = String(val);
                  await handleUpdateField('type', newType);
                  toast.success(t('Đã thay đổi phân loại công việc'));
                }}
              />
            </div>

            {/* Nhóm công việc */}
            <div className="card" style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label style={{ ...cardLabelStyle, margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Folder size={13} style={{ color: '#BD1D2D' }} />
                  {t('Nhóm công việc')}
                </label>
                {formData.task_group_id && !isReadOnly && (
                  <button
                    type="button"
                    onClick={async () => {
                      await handleUpdateField({ task_group_id: null, task_group_name: null, task_group_color: null });
                      toast.success(t('Đã chuyển thành chưa phân nhóm'));
                    }}
                    style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: '0.72rem', padding: '0 4px' }}
                  >
                    {t('Bỏ nhóm')}
                  </button>
                )}
              </div>
              <CustomSelect
                disabled={isReadOnly}
                options={[
                  { value: '', label: t('-- Chưa phân nhóm --') },
                  ...availableTaskGroups.map((g: any) => ({
                    value: String(g.id),
                    label: g.name,
                    icon: (
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: g.color || '#BD1D2D',
                          display: 'inline-block',
                          flexShrink: 0
                        }}
                      />
                    )
                  }))
                ]}
                value={formData.task_group_id ? String(formData.task_group_id) : ''}
                onChange={async (val) => {
                  if (isReadOnly) return;
                  const newGId = val ? Number(val) : null;
                  const chosenGroup = availableTaskGroups.find((g: any) => Number(g.id) === newGId);
                  await handleUpdateField({
                    task_group_id: newGId,
                    task_group_name: chosenGroup ? chosenGroup.name : null,
                    task_group_color: chosenGroup ? chosenGroup.color : null,
                    task_group_icon: chosenGroup ? chosenGroup.icon : null
                  });
                  toast.success(t('Đã chuyển nhóm công việc'));
                }}
              />
            </div>

            {/* Độ ưu tiên & Hạn hoàn thành */}
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px' }}>
              <div className="card" style={{ ...cardStyle, padding: embedMode ? '10px 8px' : '14px 10px' }}>
                <label style={{ ...cardLabelStyle, whiteSpace: 'nowrap' }}>
                  {t('Độ ưu tiên')}
                </label>
                <CustomSelect
                  disabled={isReadOnly}
                  options={[
                    { value: 'high', label: t('Cao') },
                    { value: 'medium', label: t('Trung bình') },
                    { value: 'low', label: t('Thấp') }
                  ]}
                  value={formData.priority || safeDefaultPriority}
                  onChange={val => {
                    if (isReadOnly) return;
                    handleUpdateField('priority', String(val));
                  }}
                />
              </div>

              <div className="card" style={{ ...cardStyle, padding: embedMode ? '10px 10px' : '14px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label style={{ ...cardLabelStyle, margin: 0, whiteSpace: 'nowrap' }}>
                    {t('Hạn hoàn thành')}
                  </label>
                  {formData.due_date ? (
                    !isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleUpdateField('due_date', null)}
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          color: '#BD1D2D',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '2px',
                          padding: '1px 4px',
                          borderRadius: '4px'
                        }}
                        title={t('Xóa hạn hoàn thành')}
                      >
                        <X size={11} />
                        <span>{t('Bỏ hạn chót')}</span>
                      </button>
                    )
                  ) : (
                    <span style={{ fontSize: '0.68rem', color: '#64748B', fontStyle: 'italic' }}>
                      {t('Vô thời hạn')}
                    </span>
                  )}
                </div>
                {formData.due_date ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <VietnameseDateInput
                        disabled={isReadOnly}
                        value={formData.due_date ? String(formData.due_date).substring(0, 10) : ''}
                        onChange={(isoDate) => {
                          if (isReadOnly) return;
                          if (!isoDate) {
                            handleUpdateField('due_date', null);
                            return;
                          }
                          let curTime = defaultDueTimeHHmm;
                          const curDue = String(formDataRef.current?.due_date || '');
                          if (curDue.length >= 16) {
                            const timePart = curDue.substring(11, 16);
                            if (timePart) curTime = timePart;
                          }
                          handleUpdateField('due_date', `${isoDate} ${curTime}:00`);
                        }}
                        style={{ height: '36px', width: '100%' }}
                        inputStyle={{ padding: '0 8px', fontSize: '0.82rem' }}
                      />
                    </div>
                    <input
                      type="time"
                      className="form-input"
                      disabled={isReadOnly}
                      value={
                        formData.due_date && String(formData.due_date).length >= 16
                          ? String(formData.due_date).substring(11, 16)
                          : defaultDueTimeHHmm
                      }
                      onChange={(e) => {
                        if (isReadOnly) return;
                        const newTime = e.target.value || defaultDueTimeHHmm;
                        const curDue = String(formDataRef.current?.due_date || '');
                        const curDate = curDue.length >= 10
                          ? curDue.substring(0, 10)
                          : getLocalDateStr();
                        handleUpdateField('due_date', `${curDate} ${newTime}:00`);
                      }}
                      style={{
                        height: '36px',
                        padding: '0 6px',
                        fontSize: '0.82rem',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        background: isReadOnly ? '#F8FAFC' : '#ffffff',
                        color: '#0F172A',
                        fontWeight: 600,
                        width: '80px',
                        flexShrink: 0,
                        cursor: isReadOnly ? 'not-allowed' : 'pointer'
                      }}
                      title={t('Chọn giờ hạn hoàn thành')}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => {
                      if (isReadOnly) return;
                      const today = getLocalDateStr();
                      handleUpdateField('due_date', `${today} ${normalizedDefaultDueTime}`);
                    }}
                    style={{
                      width: '100%',
                      height: '36px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      border: '1px dashed #E2E8F0',
                      borderRadius: '8px',
                      background: '#F8FAFC',
                      color: '#64748B',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: isReadOnly ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <Clock size={13} />
                    <span>{t('+ Thiết lập hạn chót')}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Thẻ tag */}
            <div className="card" style={cardStyle}>
              <label style={cardLabelStyle}>
                {t('Thẻ tag')}
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' }}>
                {parseTagTokens(formData.tags).map((trimmedTag: string, tIdx: number) => {
                  if (SYSTEM_HIDDEN_TAGS.has(trimmedTag.toLowerCase()) || trimmedTag.toLowerCase().startsWith('internal_')) {
                    return null;
                  }
                  return (
                    <span key={tIdx} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#F1F5F9', color: '#334155', fontSize: '0.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                      <span>{trimmedTag}</span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            const next = parseTagTokens(formDataRef.current?.tags).filter((tg: string) => tg !== trimmedTag).join(',');
                            handleUpdateField('tags', next);
                          }}
                          style={{ border: 'none', background: 'transparent', color: '#64748B', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', padding: 0 }}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              {!isReadOnly && (
                <input
                  type="text"
                  className="form-input"
                  placeholder={t('Gõ tag & nhấn Enter...')}
                  style={{ fontSize: '0.78rem', padding: '6px 10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const inputVal = (e.target as HTMLInputElement).value.trim();
                      if (inputVal) {
                        const tags = parseTagTokens(formDataRef.current?.tags);
                        if (!tags.some(tg => tg.toLowerCase() === inputVal.toLowerCase())) {
                          tags.push(inputVal);
                          handleUpdateField('tags', tags.join(','));
                        }
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              )}
            </div>

            {/* Lặp lại định kỳ */}
            <div className="card" style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={cardLabelStyle}>{t('Lặp lại định kỳ')}</span>
                  {erpMeta.recurrence?.pattern && erpMeta.recurrence.pattern !== 'none' && (
                    <span style={{ fontSize: '0.65rem', fontWeight: 700, borderRadius: '6px', padding: '2px 7px', background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D' }}>
                      {erpMeta.recurrence?.pattern === 'daily' ? t('Hàng ngày') :
                       erpMeta.recurrence?.pattern === 'weekly' ? t('Hàng tuần') :
                       erpMeta.recurrence?.pattern === 'monthly' ? t('Hàng tháng') :
                       erpMeta.recurrence?.pattern === 'custom_days' ? t('Theo chu kỳ') : ''}
                    </span>
                  )}
                </div>

                <div style={{ width: '180px' }}>
                  <CustomSelect
                    disabled={isReadOnly}
                    options={[
                      { value: 'none', label: t('Không lặp lại') },
                      { value: 'daily', label: t('Hàng ngày') },
                      { value: 'weekly', label: t('Hàng tuần') },
                      { value: 'monthly', label: t('Hàng tháng') },
                      { value: 'custom_days', label: t('Chu kỳ ngày') }
                    ]}
                    value={erpMeta.recurrence?.pattern || 'none'}
                    onChange={val => {
                      if (isReadOnly) return;
                      const nextPattern = val.toString();
                      const curMeta = erpMetaRef.current || erpMeta;
                      const nextRecurrence = {
                        ...(curMeta.recurrence || { weekly_days: [], monthly_day: 1, days_interval: 3, last_generated: '' }),
                        weekly_days: ensureArray(curMeta.recurrence?.weekly_days),
                        pattern: nextPattern
                      };
                      const nextMeta = { ...curMeta, recurrence: nextRecurrence };
                      handleSaveMeta(nextMeta, undefined, { dirtyMetaFields: ['recurrence'] });
                    }}
                    width="100%"
                  />
                </div>
              </div>

              {erpMeta.recurrence?.pattern && erpMeta.recurrence.pattern !== 'none' && erpMeta.recurrence.pattern !== 'daily' && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 14px',
                  background: '#F8FAFC',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  marginTop: '4px',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap'
                }}>
                  {erpMeta.recurrence?.pattern === 'weekly' && (
                    <>
                      <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>{t('Chọn ngày lặp lại:')}</span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {[
                          { key: 1, label: 'T2' }, { key: 2, label: 'T3' }, { key: 3, label: 'T4' },
                          { key: 4, label: 'T5' }, { key: 5, label: 'T6' }, { key: 6, label: 'T7' },
                          { key: 0, label: 'CN' }
                        ].map(day => {
                          const currentDays = ensureArray(erpMeta.recurrence?.weekly_days);
                          const isSelected = currentDays.includes(day.key);
                          return (
                            <button
                              key={day.key}
                              type="button"
                              disabled={isReadOnly}
                              onClick={() => {
                                if (isReadOnly) return;
                                const curMeta = erpMetaRef.current || erpMeta;
                                const days = ensureArray(curMeta.recurrence?.weekly_days);
                                const exists = days.includes(day.key);
                                const newDays = exists
                                  ? days.filter((d: number) => d !== day.key)
                                  : [...days, day.key].sort((a, b) => a - b);
                                const nextRecurrence = {
                                  ...(curMeta.recurrence || { monthly_day: 1, days_interval: 3, last_generated: '' }),
                                  weekly_days: newDays
                                };
                                const nextMeta = { ...curMeta, recurrence: nextRecurrence };
                                handleSaveMeta(nextMeta, undefined, { dirtyMetaFields: ['recurrence'] });
                              }}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                border: isSelected ? '1px solid #BD1D2D' : '1px solid #E2E8F0',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: isReadOnly ? 'not-allowed' : 'pointer',
                                background: isSelected ? '#BD1D2D' : '#ffffff',
                                color: isSelected ? 'white' : '#0F172A',
                                boxShadow: isSelected ? '0 1px 3px rgba(189, 29, 45, 0.25)' : 'none'
                              }}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {erpMeta.recurrence?.pattern === 'monthly' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>{t('Chọn ngày trong tháng để tự động lặp lại:')}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '0.75rem', color: '#0F172A', fontWeight: 600 }}>{t('Ngày')}</span>
                        <input
                          type="number"
                          className="form-input"
                          disabled={isReadOnly}
                          min={1}
                          max={31}
                          value={erpMeta.recurrence?.monthly_day || 1}
                          onChange={e => {
                            if (isReadOnly) return;
                            const dayVal = Math.min(31, Math.max(1, Number(e.target.value) || 1));
                            const curMeta = erpMetaRef.current || erpMeta;
                            const nextRecurrence = {
                              ...(curMeta.recurrence || { weekly_days: [], days_interval: 3, last_generated: '' }),
                              monthly_day: dayVal
                            };
                            const nextMeta = { ...curMeta, recurrence: nextRecurrence };
                            erpMetaRef.current = nextMeta;
                            setErpMeta(nextMeta);
                          }}
                          onBlur={() => {
                            if (!isReadOnly) {
                              handleSaveMeta(erpMetaRef.current || erpMeta, undefined, { dirtyMetaFields: ['recurrence'] });
                            }
                          }}
                          style={{ width: '55px', height: '32px', textAlign: 'center', padding: 0, borderRadius: '6px', border: '1px solid #E2E8F0', background: '#ffffff', color: '#0F172A' }}
                        />
                      </div>
                    </div>
                  )}

                  {erpMeta.recurrence?.pattern === 'custom_days' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>{t('Tự động tạo nhiệm vụ mới sau một khoảng thời gian:')}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto' }}>
                        <span style={{ fontSize: '0.75rem', color: '#0F172A', fontWeight: 600 }}>{t('Mỗi')}</span>
                        <input
                          type="number"
                          className="form-input"
                          disabled={isReadOnly}
                          min={1}
                          max={safeRecurrenceMaxDays}
                          value={erpMeta.recurrence?.days_interval || 3}
                          onChange={e => {
                            if (isReadOnly) return;
                            const daysVal = Math.max(1, Number(e.target.value) || 1);
                            const curMeta = erpMetaRef.current || erpMeta;
                            const nextRecurrence = {
                              ...(curMeta.recurrence || { weekly_days: [], monthly_day: 1, last_generated: '' }),
                              days_interval: daysVal
                            };
                            const nextMeta = { ...curMeta, recurrence: nextRecurrence };
                            erpMetaRef.current = nextMeta;
                            setErpMeta(nextMeta);
                          }}
                          onBlur={() => {
                            if (!isReadOnly) {
                              handleSaveMeta(erpMetaRef.current || erpMeta, undefined, { dirtyMetaFields: ['recurrence'] });
                            }
                          }}
                          style={{ width: '55px', height: '32px', textAlign: 'center', padding: 0, borderRadius: '6px', border: '1px solid #E2E8F0', background: '#ffffff', color: '#0F172A' }}
                        />
                        <span style={{ fontSize: '0.75rem', color: '#0F172A', fontWeight: 600 }}>{t('ngày')}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ height: '5rem', flexShrink: 0 }} />
          </div>
        </div>
      )}
    </motion.div>
  ) : null;

  if (embedMode) {
    return isOpen && task ? (
      <>
        {content}
        {modalsAndDropdownsPortal}
      </>
    ) : null;
  }

  return createPortal(
    <>
      <AnimatePresence>
        {isOpen && task && !isClosing && (
          <>
            <motion.div
              key="workspace-task-drawer-backdrop"
              className="drawer-backdrop"
              onClick={handleCloseDrawer}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: motionDurationSec, ease: [0.25, 0.1, 0.25, 1] as any }}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                zIndex: effectiveBackdropZIndex,
                '--drawer-backdrop-z': effectiveBackdropZIndex,
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)'
              } as React.CSSProperties}
            />
            {content}
          </>
        )}
      </AnimatePresence>
      {modalsAndDropdownsPortal}
    </>,
    document.body
  );
};
