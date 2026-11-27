import React, { useState, useEffect, useRef, Fragment, useMemo, useCallback, memo, lazy, Suspense } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import api from '../api/axios';
import { Database, Search, Filter, ChevronLeft, ChevronRight, Download, RefreshCw, User, Users, Phone, Mail, Clock, Tag, ExternalLink, AlertTriangle, CheckCircle2, XCircle, ShieldAlert, Calendar, LayoutList, Sparkles, Check, X, Edit, Bell, Copy, BarChart2, Scale, Info, Ban, UserPlus, Send, Plus, Eye, RotateCcw, Trash2, FileText, DollarSign, TrendingUp, Wallet, Receipt } from 'lucide-react';
import {
  Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, LabelList
} from 'recharts';
import { CustomModal } from '../components/ui/CustomModal';
import { CustomSelect } from '../components/ui/CustomSelect';
import { Avatar, getColorFromName } from '../components/ui/Avatar';
import { ToggleSwitch } from '../components/ui/ToggleSwitch';
import { EmptyCard } from '../components/ui/EmptyCard';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useUIStore } from '../store/uiStore';
import { getModulePermissionScope, hasPermission } from '../store/authStore';
import {
  isSales,
  isViewer,
  isAccountant,
  isHR,
  isManagement,
  isExecutive,
  isSystemAdmin,
  isMarketing,
  normalizeRole,
  hasExplicitDynamicModuleGrant
} from '../utils/roleUtils';
import { getCachedTenantBootstrap } from '../contexts/TenantConfigContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';

import { withRouterFreezer } from '../components/RouterFreezer';
import { CalendarSkeleton, TableSkeleton, KpiCardSkeleton, CardSkeleton, ChartSkeleton } from '../components/ui/Skeleton';
import { detectCountryFromPhone } from '../utils/phoneHelper';
import { ensureArray, extractArray } from '../utils/safeArray';
import { TableContextMenu } from '../components/ui/TableContextMenu';
import { getLocalDateStr } from '../utils/dateUtils';
import { VietnameseDateInput } from '../components/ui/VietnameseDateInput';
import { ResponsiveActionGroup } from '../components/ui/MobileResponsiveTabs';
import { fetchAPI, getDefaultDateFilter } from '../utils/api';
import '../components/Dashboard/DomationDashboard.css';
import {
  DomKpiTile,
  DomPanelCard,
  DomRankBarRow,
  DomChartTooltip,
  DomSegmentedSwitch,
  DomToolbarButton,
  DomEmptyChartState,
} from '../components/Dashboard/DomationDashboardKit';

const NotificationPreviewModal = lazy(() =>
  import('../components/ui/NotificationPreviewModal').then(m => ({ default: m.NotificationPreviewModal }))
);

const ExpenseQuickViewDrawer = lazy(() => import('../components/ExpenseQuickViewDrawer').then(m => ({ default: m.ExpenseQuickViewDrawer })));
const ExpenseCreateDrawer = lazy(() => import('../components/ExpenseCreateDrawer').then(m => ({ default: m.ExpenseCreateDrawer })));
const DepositDetailDrawer = lazy(() => import('../components/DepositDetailDrawer').then(m => ({ default: m.DepositDetailDrawer })));

const DEFAULT_ITEMS_PER_PAGE = 50;

type Lead = {
  id: number;
  lead_id?: number;
  person_id?: number;
  assigned_to?: number;
  name: string;
  phone: string;
  email: string;
  source: string;
  status: string;
  message?: string;
  assigned_to_name: string;
  assigned_to_avatar?: string;
  round_name: string;
  round_id?: number;
  created_at: string;
  type?: string;
  note?: string;
  report_status?: string;
  resolved_by?: string | null;
  resolved_at?: string | null;
  last_activity_at?: string | null;
  ai_screener_status?: string;
  ai_evaluation?: string;
  takers?: any[];
  is_public?: number | boolean;
  is_won?: number | boolean;
  deleted_from_databank?: number | boolean;
  deleted_at?: string | null;
  team_id?: number | null;
  is_referral?: boolean | number;
  referrer_name?: string;
  referrer_avatar?: string;
  partner_id?: number;
  partner_name?: string;
  partner_avatar?: string;
  original_source?: string;
};

const parseServerDate = (dateStr?: string | null): Date => {
  if (!dateStr) return new Date(NaN);
  const trimmed = String(dateStr).trim();
  if (!trimmed) return new Date(NaN);
  // Parse date-only YYYY-MM-DD as local midnight to prevent UTC shift
  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    return new Date(Number(dateOnlyMatch[1]), Number(dateOnlyMatch[2]) - 1, Number(dateOnlyMatch[3]));
  }
  if (trimmed.includes('T') || trimmed.includes('+') || trimmed.includes('Z')) {
    return new Date(trimmed);
  }
  const isoStr = trimmed.replace(' ', 'T') + '+07:00';
  return new Date(isoStr);
};

const formatDisplayDate = (dateStr?: string | null, locale: string = 'vi-VN'): string => {
  if (!dateStr) return 'N/A';
  const parsed = parseServerDate(dateStr);
  if (isNaN(parsed.getTime())) return String(dateStr);
  return parsed.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const getLocalTimestampForFilename = (): string => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const sanitizeCsvCell = (val: unknown): string => {
  const raw = val === null || val === undefined ? '' : String(val);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};

const isAbortError = (err: any, signal?: AbortSignal): boolean => {
  if (signal?.aborted) return true;
  const name = String(err?.name || '');
  const code = String(err?.code || '');
  const msg = String(err?.message || '').toLowerCase();
  return name === 'AbortError' || name === 'CanceledError' || code === 'ERR_CANCELED' || msg === 'canceled' || msg === 'aborted';
};

const maskPhone = (phone: string) => {
  if (!phone || phone === '-') return phone;
  const clean = phone.replace(/[^\d+]/g, '');
  if (clean.length < 8) return phone;
  const start = clean.slice(0, clean.length - 6);
  const end = clean.slice(-3);
  return `${start}***${end}`;
};

const maskEmail = (email: string) => {
  if (!email || email === '-') return email;
  const parts = email.split('@');
  if (parts.length < 2) return email;
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 3) {
    return `${name.slice(0, 1)}***@${domain}`;
  }
  return `${name.slice(0, 3)}***${name.slice(-1)}@${domain}`;
};

const parseNote = (noteText: string) => {
  if (!noteText) return { cleanNote: '', errorNotes: [], blacklistNotes: [], warningNotes: [], aiDecisionNotes: [] };
  const normalized = noteText.replace(/\\n/g, '\n');
  const lines = normalized.split('\n');
  const cleanLines: string[] = [];
  const errorNotes: string[] = [];
  const blacklistNotes: string[] = [];
  const warningNotes: string[] = [];
  const aiDecisionNotes: string[] = [];

  lines.forEach(line => {
    const trimmed = line.trim();
    if (/^(?:Nhập dữ liệu cũ|Nhap du lieu cu)\s*(?:\(Silent\))?$/i.test(trimmed)) {
      return;
    }
    if (trimmed.startsWith('[LỖI -') || trimmed.startsWith('[LỖI ')) {
      errorNotes.push(trimmed);
    } else if (
      trimmed.startsWith('[Bị chặn bởi') ||
      trimmed.startsWith('[Chặn bởi') ||
      trimmed.toLowerCase().startsWith('[bị chặn bởi') ||
      trimmed.toLowerCase().startsWith('[chặn bởi')
    ) {
      blacklistNotes.push(trimmed);
    } else if (
      trimmed.startsWith('[Lưu ý:') ||
      trimmed.startsWith('Lưu ý:') ||
      trimmed.toLowerCase().startsWith('[lưu ý:') ||
      trimmed.toLowerCase().startsWith('lưu ý:') ||
      trimmed.startsWith('[Chú ý:') ||
      trimmed.toLowerCase().startsWith('[chú ý:')
    ) {
      let cleanWarn = trimmed;
      if (cleanWarn.startsWith('[') && cleanWarn.endsWith(']')) {
        cleanWarn = cleanWarn.substring(1, cleanWarn.length - 1).trim();
      }
      warningNotes.push(cleanWarn);
    } else if (
      trimmed.startsWith('[Từ chối AI]:') ||
      trimmed.startsWith('[Duyệt AI]:') ||
      trimmed.startsWith('[Blacklist AI]:') ||
      trimmed.startsWith('[Xác nhận dưới chuẩn - Fallback]:')
    ) {
      aiDecisionNotes.push(trimmed);
    } else {
      cleanLines.push(line);
    }
  });

  return {
    cleanNote: cleanLines.join('\n').trim(),
    errorNotes,
    blacklistNotes,
    warningNotes,
    aiDecisionNotes
  };
};

const parseAIDecisionNote = (note: string) => {
  let type = 'ai_reject';
  let prefix = '[Từ chối AI]';
  let reason = '';
  let admin = 'Hệ thống';
  let time = 'Hệ thống';

  let remaining = note;
  if (note.startsWith('[Từ chối AI]:')) {
    type = 'ai_reject';
    prefix = '[Từ chối AI]';
    remaining = note.substring('[Từ chối AI]:'.length).trim();
  } else if (note.startsWith('[Duyệt AI]:')) {
    type = 'ai_approve';
    prefix = '[Duyệt AI]';
    remaining = note.substring('[Duyệt AI]:'.length).trim();
  } else if (note.startsWith('[Blacklist AI]:')) {
    type = 'ai_blacklist';
    prefix = '[Blacklist AI]';
    remaining = note.substring('[Blacklist AI]:'.length).trim();
  } else if (note.startsWith('[Xác nhận dưới chuẩn - Fallback]:')) {
    type = 'ai_fallback';
    prefix = '[Xác nhận dưới chuẩn - Fallback]';
    remaining = note.substring('[Xác nhận dưới chuẩn - Fallback]:'.length).trim();
  }

  const parts = remaining.split('|');
  if (parts.length > 0) {
    reason = parts[0].trim();
  }

  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith('Admin:')) {
      admin = trimmed.substring('Admin:'.length).trim();
    } else if (trimmed.startsWith('Lúc:')) {
      time = trimmed.substring('Lúc:'.length).trim();
    }
  });

  return { type, prefix, reason, admin, time };
};

const parseErrorNote = (err: string) => {
  const parts = err.split(' | ');
  let admin = '';
  let time = '';

  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith('Admin duyệt:') || trimmed.startsWith('Admin từ chối:')) {
      admin = trimmed.substring(trimmed.indexOf(':') + 1).trim();
    } else if (trimmed.startsWith('Thời gian:')) {
      time = trimmed.substring(trimmed.indexOf(':') + 1).trim();
    }
  });

  const cleanText = parts.filter(part => {
    const trimmed = part.trim();
    return !trimmed.startsWith('Admin duyệt:') && !trimmed.startsWith('Admin từ chối:') && !trimmed.startsWith('Thời gian:');
  }).join(' | ');

  return { cleanText, admin, time };
};

const parseBlacklistNote = (note: string) => {
  let admin = 'Hệ thống';
  let time = 'Hệ thống';
  let reason = '';

  const adminMatch = note.match(/bởi\s+Admin\s+([^\s]+(?:\s+[^\s]+)*?)(?:\s+lúc|$)/i);
  if (adminMatch && adminMatch[1]) {
    admin = adminMatch[1].trim();
  }

  const timeMatch = note.match(/lúc\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}|\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/i);
  if (timeMatch && timeMatch[1]) {
    time = timeMatch[1].trim();
  }

  const reasonMatch = note.match(/Lý\s+do:\s*(.*?)\]?$/i);
  if (reasonMatch && reasonMatch[1]) {
    reason = reasonMatch[1].trim();
  }

  return { admin, time, reason };
};

const getAICardConfig = (selectedLead: Lead | null, theme: 'light' | 'dark', t: (key: string) => string) => {
  if (!selectedLead) return null;
  if (selectedLead.ai_screener_status === 'passed' && selectedLead.ai_evaluation) {
    return {
      avatar: "/LOGO.jpg",
      title: "IDEAS AI",
      badgeText: t("Đạt chuẩn"),
      badgeBg: '#059669',
      badgeColor: '#ffffff',
      content: selectedLead.ai_evaluation,
      accentColor: '#BD1D2D',
      textAccentColor: theme === 'dark' ? '#fb7185' : '#8a0f1b',
      topAccentGradient: '#BD1D2D',
      bgGradient: theme === 'dark' ? 'rgba(189, 29, 45, 0.08)' : '#fff8f9',
      borderColor: theme === 'dark' ? '1px solid rgba(189, 29, 45, 0.25)' : '1px solid rgba(189, 29, 45, 0.15)',
    };
  } else if (selectedLead.status === 'pending_approval') {
    const isPendingEvaluation = selectedLead.ai_screener_status === 'pending' && (() => {
      const now = new Date();
      const created = selectedLead.created_at ? parseServerDate(selectedLead.created_at) : now;
      const diffMins = (now.getTime() - created.getTime()) / 60000;
      return diffMins >= -2 && diffMins < 5;
    })();
    return {
      avatar: "/imgs/warn_icon.png",
      title: "IDEAS AI",
      badgeText: t("Chờ duyệt"),
      badgeBg: '#d97706',
      badgeColor: '#ffffff',
      content: selectedLead.ai_evaluation || (isPendingEvaluation ? t('Đang chờ AI đánh giá...') : t('Tạm giữ')),
      accentColor: '#f59e0b',
      textAccentColor: theme === 'dark' ? '#fbbf24' : '#b45309',
      topAccentGradient: '#f59e0b',
      bgGradient: theme === 'dark' ? 'rgba(245, 158, 11, 0.08)' : '#fffbeb',
      borderColor: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid rgba(245, 158, 11, 0.2)',
    };
  } else if (selectedLead.status === 'rejected') {
    return {
      avatar: "/LOGO.jpg",
      title: "IDEAS AI",
      badgeText: t("Từ chối"),
      badgeBg: '#dc2626',
      badgeColor: '#ffffff',
      content: selectedLead.ai_evaluation || t('Không đủ điều kiện'),
      accentColor: '#ef4444',
      textAccentColor: theme === 'dark' ? '#f87171' : '#be123c',
      topAccentGradient: '#ef4444',
      bgGradient: theme === 'dark' ? 'rgba(239, 68, 68, 0.08)' : '#fef2f2',
      borderColor: theme === 'dark' ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(239, 68, 68, 0.2)',
    };
  } else if (selectedLead.status === 'blacklisted') {
    return {
      avatar: "/imgs/angry_icon.jpg",
      title: "IDEAS AI",
      badgeText: t("Bị chặn"),
      badgeBg: '#b91c1c',
      badgeColor: '#ffffff',
      content: selectedLead.ai_evaluation || t('Chặn tự động'),
      accentColor: '#ef4444',
      textAccentColor: theme === 'dark' ? '#f87171' : '#dc2626',
      topAccentGradient: '#ef4444',
      bgGradient: theme === 'dark' ? 'rgba(239, 68, 68, 0.08)' : '#fff5f5',
      borderColor: theme === 'dark' ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(239, 68, 68, 0.2)',
    };
  }
  return null;
};

interface DataListFinanceKpiStripProps {
  financeSummary: any;
  formatMoney: (amount: number, currencyOverride?: string) => string;
  t: (key: string) => string;
}

const DataListFinanceKpiStrip = memo<DataListFinanceKpiStripProps>(({
  financeSummary,
  formatMoney,
  t,
}) => (
  <div className="dashboard-kpi-grid" style={{ marginBottom: '16px', marginTop: '4px' }}>
    <DomKpiTile
      label={t('TỔNG DOANH THU (SO)')}
      value={formatMoney((financeSummary?.so_paid || 0) + (financeSummary?.so_pending || 0))}
      accent="brand"
      icon={<TrendingUp size={16} />}
      breakdown={
        <>
          <span>• {t('Đã thu')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.so_paid || 0)}</strong></span>
          <span>• {t('Chờ thanh toán (SO)')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.so_pending || 0)}</strong></span>
          {Number(financeSummary?.milestone_pending || 0) > 0 && (
            <span>• {t('Mốc cọc chờ thu')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.milestone_pending || 0)}</strong></span>
          )}
        </>
      }
    />
    <DomKpiTile
      label={t('TỔNG CHI PHÍ (PO)')}
      value={formatMoney((financeSummary?.po_approved || 0) + (financeSummary?.po_pending || 0))}
      accent="brand"
      valueTone="brand"
      icon={<Receipt size={16} />}
      breakdown={
        <>
          <span>• {t('Đã duyệt')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.po_approved || 0)}</strong></span>
          <span>• {t('Chờ duyệt')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.po_pending || 0)}</strong></span>
        </>
      }
    />
    <DomKpiTile
      label={t('DÒNG TIỀN THỰC TẾ')}
      value={formatMoney((financeSummary?.so_paid || 0) - (financeSummary?.po_approved || 0))}
      accent="slate"
      icon={<Wallet size={16} />}
      breakdown={
        <>
          <span>• {t('Thực thu')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.so_paid || 0)}</strong></span>
          <span>• {t('Thực chi')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.po_approved || 0)}</strong></span>
        </>
      }
    />
    <DomKpiTile
      label={t('DỰ BÁO DÒNG TIỀN')}
      value={formatMoney((financeSummary?.so_pending || 0) - (financeSummary?.po_pending || 0))}
      accent="slate"
      icon={<DollarSign size={16} />}
      breakdown={
        <>
          <span>• {t('Sắp thu')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.so_pending || 0)}</strong></span>
          <span>• {t('Sắp chi')}: <strong style={{ color: 'var(--color-text)' }}>{formatMoney(financeSummary?.po_pending || 0)}</strong></span>
        </>
      }
    />
  </div>
));

interface DataListStatsChartsPanelProps {
  statsData: any;
  isMobile: boolean;
  onViewFairShareComp: () => void;
  t: (key: string) => string;
}

const DataListStatsChartsPanel = memo<DataListStatsChartsPanelProps>(({
  statsData,
  isMobile,
  onViewFairShareComp,
  t,
}) => {
  const statsSummary = statsData?.summary || {};
  const totalReceived = Number(statsSummary.total_received || 0);
  const distCount = Number(statsSummary.distributed_count || 0);
  const coopCount = Number(statsSummary.coop_count || 0);
  const distPlusCoop = distCount + coopCount;
  const selfCount = Number(statsSummary.self_count || 0);
  const reminderCount = Number(statsSummary.reminder || 0);
  const errorCount = Number(statsSummary.error || 0);
  const successfulCount = Number(statsSummary.successful || 0);
  const summaryTotal = Number(statsSummary.total || 0);
  const safeSummaryTotal = Math.max(1, summaryTotal);
  const safeSuccessful = Math.max(1, successfulCount);

  const byDateList = useMemo(() => ensureArray<any>(statsData?.by_date), [statsData?.by_date]);
  const roundsList = useMemo(() => ensureArray<any>(statsData?.rounds), [statsData?.rounds]);
  const bySourceList = useMemo(() => ensureArray<any>(statsData?.by_source), [statsData?.by_source]);

  const statusChartData = useMemo(() => [
    { name: t('Thành công'), value: successfulCount, color: '#C6333D' },
    { name: t('Nhắc lại'), value: reminderCount, color: '#64748B' },
    { name: t('Lỗi'), value: errorCount, color: '#CBD5E1' },
  ].filter(item => item.value > 0), [successfulCount, reminderCount, errorCount, t]);

  return (
    <>
      <div className="responsive-grid-3" style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: '16px' }}>
        <DomKpiTile
          label={t('Tổng khách hàng')}
          value={totalReceived}
          accent="brand"
          icon={<Users size={16} strokeWidth={1.75} />}
          breakdown={
            <span>• {t('Tổng data đang chăm sóc')}: <strong style={{ color: 'var(--color-text)' }}>{totalReceived}</strong></span>
          }
        />
        <DomKpiTile
          label={t('Được chia')}
          value={distPlusCoop}
          accent="brand"
          valueTone="brand"
          icon={<Send size={16} strokeWidth={1.75} />}
          breakdown={
            <>
              <span>• {t('Chia tự động')}: <strong style={{ color: 'var(--color-text)' }}>{distCount}</strong></span>
              <span>• {t('Hợp tác (co.op)')}: <strong style={{ color: 'var(--color-text)' }}>{coopCount}</strong></span>
            </>
          }
        />
        <DomKpiTile
          label={t('Tự nhập')}
          value={selfCount}
          accent="slate"
          icon={<UserPlus size={16} strokeWidth={1.75} />}
          breakdown={
            <span>• {t('Tự tạo hoặc giới thiệu')}: <strong style={{ color: 'var(--color-text)' }}>{selfCount}</strong></span>
          }
        />
      </div>

      <DomPanelCard title={t('Lưu lượng nhận Data theo ngày')} icon={<BarChart2 size={16} />} iconAccent="brand">
        {byDateList.length > 0 ? (
          <div style={{ height: 180, width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDateList} margin={{ left: -8, right: 8, top: 20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-light)" strokeOpacity={0.7} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, (max: number) => (max < 5 ? 5 : Math.ceil(max * 1.15))]} tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${Number(v).toLocaleString('vi-VN')} data`} />} />
                <Bar dataKey="count" fill="#C6333D" radius={[4, 4, 0, 0]} maxBarSize={28} name={t('Data thành công')}>
                  <LabelList dataKey="count" position="top" style={{ fill: 'var(--color-text)', fontSize: 11, fontWeight: 600 }} offset={6} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <DomEmptyChartState title={t('Không có dữ liệu phân bổ theo ngày')} minHeight={180} />
        )}
      </DomPanelCard>

      <div className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <DomPanelCard title={t('Tỷ lệ trạng thái Data')} icon={<CheckCircle2 size={16} />} iconAccent="slate">
          {summaryTotal > 0 && statusChartData.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', justifyContent: 'center' }}>
              <div style={{ width: 140, height: 140, flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={38}
                      outerRadius={58}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${Number(v).toLocaleString('vi-VN')} data`} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                {statusChartData.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color }} />
                    <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>
                      {item.name}: <strong style={{ fontSize: '0.8125rem' }}>{item.value}</strong> ({Math.round((item.value / safeSummaryTotal) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <DomEmptyChartState title={t('Không có dữ liệu lưu lượng')} minHeight={140} />
          )}
        </DomPanelCard>

        <DomPanelCard title={t('Phân bổ theo Vòng (Round)')} icon={<Tag size={16} />} iconAccent="slate">
          {roundsList.length > 0 ? (
            <div style={{ height: 160, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={roundsList} layout="vertical" margin={{ left: -8, right: 12, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--color-border-light)" strokeOpacity={0.7} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="round_name" type="category" width={92} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 500 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${Number(v).toLocaleString('vi-VN')} data`} />} />
                  <Bar dataKey="successful_count" stackId="a" fill="#C6333D" radius={[0, 0, 0, 0]} barSize={12} name={t('Thành công')} />
                  <Bar dataKey="reminder_count" stackId="a" fill="#64748B" radius={[0, 0, 0, 0]} barSize={12} name={t('Nhắc lại')} />
                  <Bar dataKey="error_count" stackId="a" fill="#CBD5E1" radius={[0, 4, 4, 0]} barSize={12} name={t('Lỗi')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <DomEmptyChartState title={t('Không có dữ liệu chia số theo vòng')} minHeight={140} />
          )}
        </DomPanelCard>
      </div>

      <div className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <DomPanelCard title={t('Tỷ lệ nguồn Data (Chi tiết)')} icon={<Database size={16} />} iconAccent="slate">
          {bySourceList.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto', paddingRight: 4 }}>
              {bySourceList.map((src: any, idx: number) => {
                const countVal = Number(src?.count || 0);
                const sourcePercent = successfulCount > 0 ? Math.round((countVal / safeSuccessful) * 100) : 0;
                return (
                  <DomRankBarRow
                    key={src?.source || idx}
                    rank={idx + 1}
                    label={src?.source || '—'}
                    value={`${countVal} ${t('data')}`}
                    secondaryValue={`${sourcePercent}%`}
                    percent={sourcePercent}
                    barColor="#BD1D2D"
                  />
                );
              })}
            </div>
          ) : (
            <DomEmptyChartState title={t('Không có dữ liệu nguồn data')} minHeight={110} />
          )}
        </DomPanelCard>

        <DomPanelCard title={t('Thống kê Ticket báo lỗi Data')} icon={<AlertTriangle size={16} />} iconAccent="brand">
          {statsData?.tickets ? (
            <>
              <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                <div style={{ background: 'var(--color-bg)', padding: '8px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>{t('GỬI ĐI')}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: 4 }}>{Number(statsData.tickets.total || 0)}</div>
                </div>
                <div style={{ background: 'var(--color-bg)', padding: '8px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>{t('ĐÃ BÙ')}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#BD1D2D', marginTop: 4 }}>{Number(statsData.tickets.approved || 0)}</div>
                </div>
                <div style={{ background: 'var(--color-bg)', padding: '8px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>{t('ĐANG CHỜ')}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: 4 }}>{Number(statsData.tickets.pending || 0)}</div>
                </div>
                <div style={{ background: 'var(--color-bg)', padding: '8px', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <div style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 700 }}>{t('TỪ CHỐI')}</div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)', marginTop: 4 }}>{Number(statsData.tickets.rejected || 0)}</div>
                </div>
              </div>
              <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b', textAlign: 'center', fontWeight: 500 }}>
                {t('Tổng nhận bù:')} <strong style={{ color: 'var(--color-text)' }}>{Number(statsData.tickets.approved || 0) + Number(statsData.active_compensation || 0) + Number(statsData.blacklist_compensation || 0)}</strong> {t('data')} (Ticket: {Number(statsData.tickets.approved || 0)}, Blacklist: {Number(statsData.blacklist_compensation || 0)}, {t('Chủ động')}: {Number(statsData.active_compensation || 0)})
              </div>
              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'center' }}>
                <DomToolbarButton variant="outline" onClick={onViewFairShareComp} icon={<Scale size={13} />}>
                  {t('Xem chi tiết data bù')}
                </DomToolbarButton>
              </div>
            </>
          ) : (
            <DomEmptyChartState title={t('Không có dữ liệu ticket')} minHeight={110} />
          )}
        </DomPanelCard>
      </div>
    </>
  );
});

const DataListInner = ({ isActive, searchParams, setSearchParams, location }: { isActive: boolean; searchParams: URLSearchParams; setSearchParams: any; location: any }) => {
  const { user } = useAuth();
  const { language, t } = useLanguage();
  const showConfirm = useUIStore((s) => s.showConfirm);

  const normalizedRole = normalizeRole(user);
  const isSaleUser = isSales(user);
  const isViewerUser = isViewer(user);
  const isAccountantUser = isAccountant(user, false);
  const isHRUser = isHR(user, false);
  const isSysAdmin = isSystemAdmin(user);
  const isExecUser = isExecutive(user);
  const isManagerUser = normalizedRole === 'manager';
  const isMarketingUser = isMarketing(user);
  const isAdmin = isExecUser || isManagerUser;
  const canViewFinanceCalendar = isAccountantUser || isExecUser;

  const canExportData =
    hasPermission(user, 'leads', 'read') &&
    !isSaleUser &&
    !isViewerUser &&
    (!isAccountantUser || hasExplicitDynamicModuleGrant(user, 'leads', 'read')) &&
    (!isHRUser || hasExplicitDynamicModuleGrant(user, 'leads', 'read'));

  const canReassignLead =
    hasPermission(user, 'leads', 'write') &&
    !isSaleUser &&
    !isViewerUser &&
    (!isAccountantUser || hasExplicitDynamicModuleGrant(user, 'leads', 'write')) &&
    (!isHRUser || hasExplicitDynamicModuleGrant(user, 'leads', 'write'));

  const canEditLeadFields = canReassignLead;
  const canBlockLead =
    (isSysAdmin || isExecUser || isManagerUser || isMarketingUser || hasExplicitDynamicModuleGrant(user, 'leads', 'write')) &&
    !isSaleUser &&
    !isViewerUser &&
    (!isAccountantUser || hasExplicitDynamicModuleGrant(user, 'leads', 'write')) &&
    (!isHRUser || hasExplicitDynamicModuleGrant(user, 'leads', 'write'));
  const canSendManualReminder = canReassignLead;
  const canAccessDatabank = !isAccountantUser && !isViewerUser && !isHRUser && (isAdmin || isSaleUser || isMarketingUser);

  const isRouteActive = Boolean(
    isActive &&
    (location?.pathname === '/data' || (location?.pathname === '/calendar' && isAccountantUser))
  );

  const [users, setUsers] = useState<any[]>([]);
  const [teamsList, setTeamsList] = useState<any[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: any } | null>(null);

  useEffect(() => {
    if (!isRouteActive || (!isManagerUser && !canViewFinanceCalendar && !isAdmin)) return;
    const controller = new AbortController();

    api.get('/users?all=1', { signal: controller.signal }).then(r => {
      if (controller.signal.aborted) return;
      setUsers(extractArray(r?.data));
    }).catch((err: any) => {
      if (isAbortError(err, controller.signal)) return;
    });

    if (isManagerUser) {
      api.get('/teams', { signal: controller.signal }).then(r => {
        if (controller.signal.aborted) return;
        setTeamsList(extractArray(r?.data));
      }).catch((err: any) => {
        if (isAbortError(err, controller.signal)) return;
      });
    }

    return () => controller.abort();
  }, [isRouteActive, isManagerUser, canViewFinanceCalendar, isAdmin]);

  const getManagedTeamIds = (): number[] => {
    const currentUserId = Number(user?.id || 0);
    const safeTeams = ensureArray(teamsList);
    return safeTeams
      .filter((tm: any) => {
        if (Number(tm?.leader_id) === currentUserId) return true;
        if (tm?.co_leader_ids) {
          const coIds = String(tm.co_leader_ids)
            .split(',')
            .map(s => Number(s.trim()))
            .filter(n => n > 0);
          if (coIds.includes(currentUserId)) return true;
        }
        if ((user as any)?.team_id && Number(tm?.id) === Number((user as any).team_id) && isManagement(user)) {
          return true;
        }
        return false;
      })
      .map((tm: any) => Number(tm.id))
      .filter(id => id > 0);
  };

  const filterVisibleTakers = (takers: any[] | undefined) => {
    const safeTakers = ensureArray(takers);
    if (safeTakers.length === 0) return [];
    const currentUserId = Number(user?.id || 0);
    const currentConsultantId = Number(user?.consultant_id || 0);

    if (isExecUser) {
      return safeTakers;
    }
    if (isSaleUser) {
      return [];
    }
    if (isManagerUser) {
      const managedTeamIds = getManagedTeamIds();
      const safeUsers = ensureArray(users);
      return safeTakers.filter((taker: any) => {
        const takerId = Number(taker?.id || 0);
        if (takerId > 0 && (takerId === currentUserId || (currentConsultantId > 0 && takerId === currentConsultantId))) {
          return true;
        }
        const takerUser = safeUsers.find(
          (u: any) => Number(u?.id) === takerId || (u?.consultant_id && Number(u.consultant_id) === takerId)
        );
        return Boolean(takerUser?.team_id && managedTeamIds.includes(Number(takerUser.team_id)));
      });
    }
    return [];
  };

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleThemeChange = () => {
      const nextTheme = (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
      setTheme(nextTheme);
    };
    window.addEventListener('theme-change', handleThemeChange);
    return () => window.removeEventListener('theme-change', handleThemeChange);
  }, []);

  const navigate = useNavigate();
  const searchTerm = searchParams.get('search') || '';
  const statusFilter = searchParams.get('status') || 'all';
  const [dateFilter, setDateFilter] = useState(() => {
    return localStorage.getItem('Ideas_global_date') || getDefaultDateFilter();
  });

  const [showDateModal, setShowDateModal] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const getDisplayDateFilterText = (filter: string) => {
    if (filter.includes('đến')) {
      return filter.replace(/\s*đến\s*/i, ` ${t('đến')} `);
    }
    return t(filter);
  };

  const handleUpdateDateFilter = (val: string) => {
    if (val === 'Tùy chỉnh') {
      setShowDateModal(true);
      return;
    }
    setDateFilter(val);
    localStorage.setItem('Ideas_global_date', val);
    window.dispatchEvent(new CustomEvent('global-date-change', { detail: val }));
  };
  const consultantFilter = searchParams.get('consultant') || 'all';
  const roundFilter = searchParams.get('round') || 'all';
  const rawPage = Number(searchParams.get('page') || '1');
  const currentPage = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [sysSettings, setSysSettings] = useState<any>(null);

  const typedPageSize = useTypedSubSetting<number>('crm.ui_list_page_sizes_and_limits', 'datalist', DEFAULT_ITEMS_PER_PAGE);
  const ITEMS_PER_PAGE = Math.max(10, Number(typedPageSize) || DEFAULT_ITEMS_PER_PAGE);
  const typedMaxParallelClaims = useTypedSubSetting<number>('crm.databank_policy', 'max_parallel_sales', 2);
  const maxParallelClaims = Math.max(1, Number(sysSettings?.max_parallel_sales_per_client) || Number(typedMaxParallelClaims) || 2);
  const tenantCurrency = useMemo(() => {
    const raw = String(
      sysSettings?.tenant_default_currency ||
      getCachedTenantBootstrap()?.organization?.currency ||
      'VND'
    ).trim().toUpperCase();
    return raw === 'EURO' ? 'EUR' : (raw || 'VND');
  }, [sysSettings]);

  const formatMoney = useCallback((amount: number, currencyOverride?: string): string => {
    const curr = String(currencyOverride || tenantCurrency || 'VND').trim().toUpperCase();
    const norm = curr === 'EURO' ? 'EUR' : (curr || 'VND');
    const num = Number(amount || 0);
    if (!isFinite(num)) return norm === 'VND' ? '0 đ' : '0';
    if (norm === 'VND') {
      return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Math.round(num));
    }
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: norm, maximumFractionDigits: 2 }).format(num);
    } catch {
      return `${num.toLocaleString('en-US')} ${norm}`;
    }
  }, [tenantCurrency]);

  useEffect(() => {
    if (!isRouteActive) return;
    let cancelled = false;
    fetchAPI('get_settings')
      .then(res => {
        if (!cancelled && res && res.success) {
          setSysSettings(res.data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isRouteActive]);

  const [searchInput, setSearchInput] = useState(searchTerm);

  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  // Timeout & AbortController cleanup tracking
  const timeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const scheduleTimeout = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timeoutsRef.current.delete(timer);
      fn();
    }, ms);
    timeoutsRef.current.add(timer);
    return timer;
  };

  const leadsAbortRef = useRef<AbortController | null>(null);
  const publicLeadsAbortRef = useRef<AbortController | null>(null);
  const calendarAbortRef = useRef<AbortController | null>(null);
  const dayDetailsAbortRef = useRef<AbortController | null>(null);
  const statsAbortRef = useRef<AbortController | null>(null);
  const notifAbortRef = useRef<AbortController | null>(null);
  const consultantsAbortRef = useRef<AbortController | null>(null);
  const accountsAbortRef = useRef<AbortController | null>(null);
  const roundsAbortRef = useRef<AbortController | null>(null);
  const openIdAbortRef = useRef<AbortController | null>(null);
  const soAbortRef = useRef<AbortController | null>(null);

  // Synchronous mutation in-flight guards (P1-18)
  const claimInFlightRef = useRef(false);
  const deleteClaimInFlightRef = useRef(false);
  const reassignInFlightRef = useRef(false);
  const blockInFlightRef = useRef(false);
  const reminderInFlightRef = useRef(false);
  const saveFieldsInFlightRef = useRef(false);
  const exportInFlightRef = useRef(false);
  const releaseInFlightRef = useRef(false);
  const databankActionInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current.clear();
      leadsAbortRef.current?.abort();
      publicLeadsAbortRef.current?.abort();
      calendarAbortRef.current?.abort();
      dayDetailsAbortRef.current?.abort();
      statsAbortRef.current?.abort();
      notifAbortRef.current?.abort();
      consultantsAbortRef.current?.abort();
      accountsAbortRef.current?.abort();
      roundsAbortRef.current?.abort();
      openIdAbortRef.current?.abort();
      soAbortRef.current?.abort();
    };
  }, []);

  // Consultant stats state for details modal
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [statsConsultant, setStatsConsultant] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsData, setStatsData] = useState<any>(null);
  const [statsDateMode, setStatsDateMode] = useState<string>('this_month');

  const handleViewStatsFairShare = useCallback(() => {
    if (!statsConsultant) return;
    setStatsModalOpen(false);
    navigate(`/fair-share?open_comp_id=${statsConsultant.id}&date_mode=${statsDateMode}`);
  }, [statsConsultant, statsDateMode, navigate]);
  const [statsStartDate, setStatsStartDate] = useState<string>('');
  const [statsEndDate, setStatsEndDate] = useState<string>('');

  const syncDateFilterToModal = (filter: string) => {
    let mode = 'this_month';
    let start = '';
    let end = '';

    if (filter === 'Hôm nay') {
      mode = 'today';
    } else if (filter === 'Hôm qua') {
      mode = 'yesterday';
    } else if (filter === '7 ngày qua') {
      mode = '7_days';
    } else if (filter === '30 ngày qua') {
      mode = '30_days';
    } else if (filter === 'Tháng này') {
      mode = 'this_month';
    } else if (filter === 'Tháng trước') {
      mode = 'last_month';
    } else if (filter === 'Tuần này') {
      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const monday = new Date(now);
      monday.setDate(now.getDate() + distanceToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);

      mode = 'custom';
      start = getLocalDateStr(monday);
      end = getLocalDateStr(sunday);
    } else if (filter === 'Tuần trước') {
      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const prevMonday = new Date(now);
      prevMonday.setDate(now.getDate() + distanceToMonday - 7);
      const prevSunday = new Date(prevMonday);
      prevSunday.setDate(prevMonday.getDate() + 6);

      mode = 'custom';
      start = getLocalDateStr(prevMonday);
      end = getLocalDateStr(prevSunday);
    } else if (filter === 'Tuần trước nữa') {
      const now = new Date();
      const currentDay = now.getDay();
      const distanceToMonday = currentDay === 0 ? -6 : 1 - currentDay;
      const prev2Monday = new Date(now);
      prev2Monday.setDate(now.getDate() + distanceToMonday - 14);
      const prev2Sunday = new Date(prev2Monday);
      prev2Sunday.setDate(prev2Monday.getDate() + 6);

      mode = 'custom';
      start = getLocalDateStr(prev2Monday);
      end = getLocalDateStr(prev2Sunday);
    } else {
      const match = filter.match(/^(\d{4}-\d{2}-\d{2})\s*(?:đến|đên|den|to|-)\s*(\d{4}-\d{2}-\d{2})$/i);
      if (match) {
        mode = 'custom';
        start = match[1];
        end = match[2];
      }
    }

    setStatsDateMode(mode);
    setStatsStartDate(start);
    setStatsEndDate(end);
  };

  const fetchConsultantStats = async (consId: number, mode: string, start?: string, end?: string) => {
    statsAbortRef.current?.abort();
    const controller = new AbortController();
    statsAbortRef.current = controller;
    setStatsLoading(true);
    try {
      let query = `get_consultant_stats&consultant_id=${consId}&date_mode=${mode}`;
      if (mode === 'custom' && start && end) {
        query += `&start_date=${start}&end_date=${end}`;
      }
      const json = await fetchAPI(query, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (json.success) {
        setStatsData(json);
      } else {
        toast.error(json.message || t('Lỗi khi tải báo cáo thống kê'));
      }
    } catch (e: any) {
      if (isAbortError(e, controller.signal)) return;
      toast.error(t('Lỗi kết nối: ') + e.message);
    } finally {
      if (!controller.signal.aborted) setStatsLoading(false);
    }
  };

  useEffect(() => {
    if (statsModalOpen && statsConsultant) {
      if (statsDateMode !== 'custom' || (statsStartDate && statsEndDate)) {
        fetchConsultantStats(statsConsultant.id, statsDateMode, statsStartDate, statsEndDate);
      }
    } else {
      statsAbortRef.current?.abort();
    }
  }, [statsModalOpen, statsConsultant, statsDateMode, statsStartDate, statsEndDate]);

  const [isExportingCSV, setIsExportingCSV] = useState(false);

  useEffect(() => {
    if (!isRouteActive) return;
    const delayDebounceFn = setTimeout(() => {
      if (searchInput !== searchTerm) {
        updateParams('search', searchInput);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchInput, searchTerm, isRouteActive]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [rounds, setRounds] = useState<{ id: number; round_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const mapRawLeadItem = (item: any): Lead => ({
    id: Number(item.id),
    lead_id: item.lead_id !== undefined && item.lead_id !== null ? Number(item.lead_id) : undefined,
    person_id: item.person_id !== undefined && item.person_id !== null ? Number(item.person_id) : undefined,
    assigned_to: item.assigned_to !== undefined && item.assigned_to !== null ? Number(item.assigned_to) : undefined,
    name: item.lead_name || item.full_name || item.name || t('Khách hàng ẩn danh'),
    phone: item.phone || '-',
    email: item.email || '-',
    source: item.source || '-',
    type: item.type || '-',
    note: item.note || '',
    status: item.status,
    message: item.message || '',
    assigned_to_name: item.assigned_to_name || '-',
    assigned_to_avatar: item.assigned_to_avatar,
    round_name: item.round_name || '-',
    round_id: item.round_id !== undefined && item.round_id !== null ? Number(item.round_id) : undefined,
    created_at: item.created_at,
    report_status: item.report_status,
    resolved_by: item.resolved_by ?? null,
    resolved_at: item.resolved_at ?? null,
    last_activity_at: item.last_activity_at,
    ai_screener_status: item.ai_screener_status,
    ai_evaluation: item.ai_evaluation,
    is_public: item.is_public,
    is_won: item.is_won,
    deleted_from_databank: item.deleted_from_databank,
    deleted_at: item.deleted_at ?? null,
    team_id: item.team_id !== undefined && item.team_id !== null ? Number(item.team_id) : null,
    is_referral: item.is_referral,
    referrer_name: item.referrer_name,
    referrer_avatar: item.referrer_avatar,
    partner_id: item.partner_id,
    partner_name: item.partner_name,
    partner_avatar: item.partner_avatar,
    original_source: item.original_source,
    takers: ensureArray(item.takers)
  });

  const fetchLeads = async () => {
    leadsAbortRef.current?.abort();
    const controller = new AbortController();
    leadsAbortRef.current = controller;
    const signal = controller.signal;

    setLoading(true);
    try {
      const json = await fetchAPI(`get_logs&page=${currentPage}&pageSize=${ITEMS_PER_PAGE}&date=${encodeURIComponent(dateFilter)}&status=${encodeURIComponent(statusFilter)}&consultant=${encodeURIComponent(consultantFilter)}&round=${encodeURIComponent(roundFilter)}&search=${encodeURIComponent(searchTerm)}`, { signal });
      if (signal.aborted) return;
      if (json.success) {
        const mappedLeads = extractArray(json)
          .filter((item: any) => !item?.deleted_at)
          .map(mapRawLeadItem);
        setLeads(mappedLeads);
        setTotalCount(json.total_count ?? mappedLeads.length);
      }
    } catch (e: any) {
      if (isAbortError(e, signal)) {
        return;
      }
      toast.error(t('Lỗi tải dữ liệu: ') + e.message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  // Calendar / Databank View Mode States (declared early for use in effects)
  const [localViewMode, setLocalViewMode] = useState<'list' | 'calendar' | 'databank'>(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'databank') return 'databank';
    if (viewParam === 'calendar' || isAccountantUser) return 'calendar';
    return 'list';
  });
  useEffect(() => {
    const viewParam = searchParams.get('view');
    if (viewParam === 'databank' && canAccessDatabank) {
      setLocalViewMode('databank');
    } else if (viewParam === 'calendar' || isAccountantUser) {
      setLocalViewMode('calendar');
    } else {
      setLocalViewMode('list');
    }
  }, [searchParams, canAccessDatabank, isAccountantUser]);
  const viewMode = localViewMode;

  useEffect(() => {
    if (!isRouteActive) return;
    const saved = localStorage.getItem('Ideas_global_date') || getDefaultDateFilter();
    if (saved && saved !== dateFilter) {
      setDateFilter(saved);
    } else if (viewMode === 'list') {
      fetchLeads();
    }
  }, [searchParams, dateFilter, isRouteActive, viewMode, ITEMS_PER_PAGE]);

  useEffect(() => {
    if (!isRouteActive) return;
    const handleGlobalDate = (e: any) => {
      const newDate = e.detail;
      if (newDate && newDate !== dateFilter) {
        setDateFilter(newDate);
      }
    };
    window.addEventListener('global-date-change', handleGlobalDate);
    return () => window.removeEventListener('global-date-change', handleGlobalDate);
  }, [dateFilter, isRouteActive]);

  useEffect(() => {
    if (!isRouteActive) return;
    fetchConsultants();
    fetchAccounts();
    fetchRounds();
  }, [isRouteActive]);

  useEffect(() => {
    if (!isRouteActive) return;
    const handleLeadAdded = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.source === 'datalist') return;
      if (viewMode === 'list') {
        fetchLeads();
      } else if (viewMode === 'databank') {
        fetchPublicLeads();
      }
    };
    const handleLeadClaimed = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail?.source === 'datalist') return;
      if (viewMode === 'databank') {
        fetchPublicLeads();
      } else if (viewMode === 'list') {
        fetchLeads();
      }
    };
    window.addEventListener('lead-added', handleLeadAdded);
    window.addEventListener('lead-claimed', handleLeadClaimed);
    return () => {
      window.removeEventListener('lead-added', handleLeadAdded);
      window.removeEventListener('lead-claimed', handleLeadClaimed);
    };
  }, [searchParams, dateFilter, isRouteActive, viewMode]);

  const clearOpenParams = () => {
    setSearchParams((prev: URLSearchParams) => {
      const next = new URLSearchParams(prev);
      next.delete('auto_open');
      next.delete('open_id');
      return next;
    }, { replace: true });
  };

  const openIdHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isRouteActive || loading) return;
    const autoOpen = searchParams.get('auto_open');
    const openId = searchParams.get('open_id');
    const phoneParam = searchParams.get('search');

    if (autoOpen !== 'true' && !openId) {
      openIdHandledRef.current = null;
      return;
    }

    const requestKey = `${openId || ''}_${autoOpen || ''}_${phoneParam || ''}`;
    if (openIdHandledRef.current === requestKey) return;

    let foundLead: Lead | null = null;
    if (openId) {
      foundLead = leads.find(l => String(l.id) === String(openId) || String(l.lead_id) === String(openId)) || null;
    }
    if (!foundLead && phoneParam) {
      foundLead = leads.find(l => l.phone === phoneParam) || null;
    }
    if (!foundLead && autoOpen === 'true' && !openId && leads.length === 1) {
      foundLead = leads[0];
    }

    if (foundLead) {
      openIdHandledRef.current = requestKey;
      setSelectedLead(foundLead);
      clearOpenParams();
      return;
    }

    if (openId) {
      openIdHandledRef.current = requestKey;
      openIdAbortRef.current?.abort();
      const controller = new AbortController();
      openIdAbortRef.current = controller;

      fetchAPI(
        `get_logs&lead_id=${encodeURIComponent(openId)}&open_id=${encodeURIComponent(openId)}&date=all&page=1&pageSize=100`,
        { signal: controller.signal }
      )
        .then(json => {
          if (controller.signal.aborted) return;
          const items = extractArray(json);
          const matched = items.find(
            (item: any) =>
              String(item.id) === String(openId) || String(item.lead_id) === String(openId)
          );
          if (matched) {
            setSelectedLead(mapRawLeadItem(matched));
          } else {
            toast.error(t('Không tìm thấy thông tin khách hàng này'));
          }
          clearOpenParams();
        })
        .catch((err: any) => {
          if (isAbortError(err, controller.signal)) return;
          toast.error(t('Không thể tải thông tin khách hàng'));
          clearOpenParams();
        });
    }
  }, [leads, loading, searchParams, isRouteActive]);

  const updateParams = (key: string, value: string) => {
    if (key === 'date') {
      handleUpdateDateFilter(value);
      return;
    }
    setSearchParams((prev: URLSearchParams) => {
      const next = new URLSearchParams(prev);
      if (value === 'all' || value === '' || (key === 'view' && value === 'list')) next.delete(key);
      else next.set(key, value);
      if (key !== 'page') next.delete('page');
      return next;
    }, { replace: true });
  };

  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewType, setPreviewType] = useState<'email' | 'zalo'>('email');
  const [previewSentAt, setPreviewSentAt] = useState<string>('');

  const handleCopyText = (text: string, successMessage: string, type?: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        toast.success(successMessage);
        if (type) {
          setCopiedType(type);
          scheduleTimeout(() => setCopiedType(null), 1500);
        }
      })
      .catch(() => toast.error(t('Lỗi khi sao chép')));
  };

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);

  const isUserInTakers = (takers: any): boolean => {
    return ensureArray(takers).some(
      (tk: any) =>
        (user?.id && Number(tk?.id) === Number(user.id)) ||
        (user?.consultant_id && Number(tk?.id) === Number(user.consultant_id))
    );
  };

  const checkCanSeeLeadFullInfo = (lead: Lead | null): boolean => {
    if (!lead) return false;
    if (isViewerUser) return false;
    if (isSysAdmin || isExecUser) return true;

    const scope = getModulePermissionScope(user, 'leads', 'read');
    if (scope === 'none') return false;
    if (scope === 'all') return true;

    const myConsultantId = Number(user?.consultant_id || 0);
    const myUserId = Number(user?.id || 0);

    if (scope === 'team') {
      const userTeamId = Number((user as any)?.team_id || (user as any)?.consultant_profile?.team_id || 0);
      const managedTeamIds = getManagedTeamIds();
      if (lead.team_id && ((userTeamId > 0 && Number(lead.team_id) === userTeamId) || managedTeamIds.includes(Number(lead.team_id)))) {
        return true;
      }
      if (lead.assigned_to) {
        const assignedUser = ensureArray(users).find(
          (u: any) => Number(u?.id) === Number(lead.assigned_to) || (u?.consultant_id && Number(u.consultant_id) === Number(lead.assigned_to))
        );
        if (assignedUser?.team_id && ((userTeamId > 0 && Number(assignedUser.team_id) === userTeamId) || managedTeamIds.includes(Number(assignedUser.team_id)))) {
          return true;
        }
      }
    }

    return (
      isUserInTakers(lead.takers) ||
      (myConsultantId > 0 && Number(lead.assigned_to) === myConsultantId) ||
      (myUserId > 0 && Number(lead.assigned_to) === myUserId)
    );
  };

  const canSeeFullInfo = useMemo(() => checkCanSeeLeadFullInfo(selectedLead), [selectedLead, user, users, teamsList]);

  const handleCopyFullInfo = (lead: Lead) => {
    const canSee = checkCanSeeLeadFullInfo(lead);
    const displayPhone = canSee ? lead.phone : maskPhone(lead.phone);
    const displayEmail = canSee ? lead.email : maskEmail(lead.email);
    const text = [
      `${t('Họ tên')}: ${lead.name || ''}`,
      `${t('Số điện thoại')}: ${displayPhone || ''}`,
      `Email: ${displayEmail || ''}`,
      `${t('Nguồn')}: ${lead.source || ''}`,
      `${t('Loại')}: ${lead.type || ''}`,
      `${t('Ghi chú')}: ${lead.note || ''}`
    ].join('\n');
    handleCopyText(text, t('Đã sao chép toàn bộ thông tin khách hàng'), 'full');
  };

  const [notificationStatus, setNotificationStatus] = useState<any>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [isAdminEditingLead, setIsAdminEditingLead] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    email: '',
    source: '',
    type: '',
    note: ''
  });
  const [isSavingLeadFields, setIsSavingLeadFields] = useState(false);
  const [isReleasingLead, setIsReleasingLead] = useState(false);

  const handleReleaseToDatabank = (leadId: number, contactId?: number) => {
    if (releaseInFlightRef.current) return;
    showConfirm({
      title: t('Nhả khách về Kho chung'),
      message: t('Bạn có chắc chắn muốn nhả khách hàng này về Kho chung (Databank)? Việc này sẽ thu hồi quyền sở hữu của các tư vấn viên hiện tại.'),
      confirmText: t('Nhả về Kho chung'),
      cancelText: t('Hủy'),
      isDanger: true,
      onConfirm: async () => {
        if (releaseInFlightRef.current) return;
        releaseInFlightRef.current = true;
        setIsReleasingLead(true);
        try {
          let res;
          if (contactId) {
            res = await fetchAPI(`contacts/${contactId}/release-databank`, {
              method: 'POST'
            });
            if (res && !Object.prototype.hasOwnProperty.call(res, 'success')) {
              res = { success: true, message: res.message || t('Đã nhả về Kho chung thành công') };
            }
          } else {
            res = await fetchAPI('release_to_databank', {
              method: 'POST',
              body: JSON.stringify({ lead_id: leadId })
            });
          }
          if (res?.success || res?.action) {
            toast.success(res.message || t('Đã nhả về Kho chung thành công'));
            setSelectedLead(null);
            fetchLeads();
            if (viewMode === 'databank') {
              fetchPublicLeads();
            }
          } else {
            toast.error(res?.message || t('Lỗi khi nhả về Kho chung.'));
          }
        } catch (e: any) {
          toast.error(t('Lỗi kết nối') + ': ' + e.message);
        } finally {
          releaseInFlightRef.current = false;
          setIsReleasingLead(false);
        }
      }
    });
  };

  const [isDeletingClaim, setIsDeletingClaim] = useState(false);

  const handleDeletePublicClaim = (personId: number, saleId: number, saleName: string) => {
    if (!personId || personId <= 0) {
      toast.error(t('Không xác định được mã hồ sơ khách hàng (person_id)'));
      return;
    }
    if (deleteClaimInFlightRef.current) return;
    showConfirm({
      title: t('Xóa lượt nhận của Sale'),
      message: t('Bạn có chắc chắn muốn xóa lượt nhận của Sale {name} cho khách hàng này không?').replace('{name}', saleName),
      confirmText: t('Xóa'),
      cancelText: t('Hủy'),
      isDanger: true,
      onConfirm: async () => {
        if (deleteClaimInFlightRef.current) return;
        deleteClaimInFlightRef.current = true;
        setIsDeletingClaim(true);
        try {
          const res = await fetchAPI('delete_public_lead_claim', {
            method: 'POST',
            body: JSON.stringify({ person_id: personId, sale_id: saleId })
          });
          if (res.success) {
            toast.success(res.message || t('Đã xóa lượt nhận thành công'));

            setSelectedLead(prev => {
              if (!prev) return null;
              return {
                ...prev,
                takers: ensureArray(prev.takers).filter((tk: any) => Number(tk?.id) !== Number(saleId))
              };
            });

            fetchLeads();
            if (viewMode === 'databank') {
              fetchPublicLeads();
            }
          } else {
            toast.error(res.message || t('Lỗi khi xóa lượt nhận.'));
          }
        } catch (e: any) {
          toast.error(t('Lỗi kết nối: ') + e.message);
        } finally {
          deleteClaimInFlightRef.current = false;
          setIsDeletingClaim(false);
        }
      }
    });
  };

  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderChannels, setReminderChannels] = useState({ zalo: true, email: true, telegram: true });
  const [isSendingReminder, setIsSendingReminder] = useState(false);

  const fetchNotificationStatus = async (leadId: number) => {
    notifAbortRef.current?.abort();
    const controller = new AbortController();
    notifAbortRef.current = controller;
    setNotifLoading(true);
    try {
      const json = await fetchAPI(`get_lead_notification_status&lead_id=${leadId}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (json.success) {
        setNotificationStatus(json.data);
      }
    } catch (err: any) {
      if (isAbortError(err, controller.signal)) return;
      console.error("Lỗi lấy trạng thái thông báo:", err);
    } finally {
      if (!controller.signal.aborted) setNotifLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLead) {
      setNotificationStatus(null);
      const targetLeadId = Number(selectedLead.lead_id || (selectedLead.status !== 'databank' ? selectedLead.id : 0));
      if (targetLeadId > 0) {
        fetchNotificationStatus(targetLeadId);
      } else {
        setNotifLoading(false);
      }

      setEditForm({
        name: selectedLead.name || '',
        phone: selectedLead.phone || '',
        email: selectedLead.email || '',
        source: selectedLead.source || '',
        type: selectedLead.type || '',
        note: selectedLead.note || ''
      });
      setIsAdminEditingLead(false);
    } else {
      notifAbortRef.current?.abort();
      setNotificationStatus(null);
      setIsAdminEditingLead(false);
    }
  }, [selectedLead]);

  const handleSendReminder = async () => {
    if (!selectedLead || reminderInFlightRef.current) return;
    reminderInFlightRef.current = true;
    setIsSendingReminder(true);
    try {
      const res = await fetchAPI('send_lead_reminder', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: selectedLead.lead_id || selectedLead.id,
          send_zalo: reminderChannels.zalo,
          send_email: reminderChannels.email,
          send_telegram: reminderChannels.telegram
        })
      });
      if (res.success) {
        toast.success(res.message || t('Đã gửi nhắc nhở thành công'));
        setIsReminderModalOpen(false);
        fetchNotificationStatus(selectedLead.lead_id || selectedLead.id);
      } else {
        toast.error(t('Lỗi: ') + (res.message || t('Không thể gửi nhắc nhở')));
      }
    } catch (err: any) {
      toast.error(t('Đã xảy ra lỗi: ') + err.message);
    } finally {
      reminderInFlightRef.current = false;
      setIsSendingReminder(false);
    }
  };

  const handleSaveLeadFields = async () => {
    if (!selectedLead || saveFieldsInFlightRef.current) return;
    if (!editForm.name.trim()) {
      toast.error(t('Tên khách hàng không được để trống'));
      return;
    }
    saveFieldsInFlightRef.current = true;
    setIsSavingLeadFields(true);
    try {
      const res = await fetchAPI('update_lead_fields', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: selectedLead.lead_id || selectedLead.id,
          name: editForm.name.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
          source: editForm.source.trim(),
          type: editForm.type.trim(),
          note: editForm.note.trim()
        })
      });
      if (res.success) {
        toast.success(t('Cập nhật thông tin khách hàng thành công'));
        setSelectedLead({
          ...selectedLead,
          name: editForm.name.trim(),
          phone: editForm.phone.trim(),
          email: editForm.email.trim(),
          source: editForm.source.trim(),
          type: editForm.type.trim(),
          note: editForm.note.trim()
        });
        setIsAdminEditingLead(false);
        fetchLeads();
        window.dispatchEvent(new CustomEvent('lead-added', { detail: { source: 'datalist' } }));
      } else {
        toast.error(t('Lỗi: ') + (res.message || t('Không thể lưu thông tin')));
      }
    } catch (err: any) {
      toast.error(t('Đã xảy ra lỗi: ') + err.message);
    } finally {
      saveFieldsInFlightRef.current = false;
      setIsSavingLeadFields(false);
    }
  };

  const [consultants, setConsultants] = useState<{ id: number; name: string; status: string; avatar?: string; vacation_mode?: number }[]>([]);
  const [allAccounts, setAllAccounts] = useState<any[]>([]);
  const [reassignConsId, setReassignConsId] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState<boolean>(false);
  const [confirmReassignOpen, setConfirmReassignOpen] = useState<boolean>(false);
  const [confirmBlockOpen, setConfirmBlockOpen] = useState<boolean>(false);
  const [blockReason, setBlockReason] = useState<string>('');
  const [compensateBlock, setCompensateBlock] = useState<boolean>(false);
  const [isBlocking, setIsBlocking] = useState<boolean>(false);
  const isTicketLead =
    selectedLead?.status === 'error' ||
    ['approved', 'approved_no_comp', 'pending'].includes(String(selectedLead?.report_status || '').toLowerCase());

  const [publicLeads, setPublicLeads] = useState<any[]>([]);
  const [publicTotalCount, setPublicTotalCount] = useState(0);
  const [publicLoading, setPublicLoading] = useState(false);
  const [publicPage, setPublicPage] = useState(1);
  const [showDeletedFilter, setShowDeletedFilter] = useState<'none' | 'only' | 'all'>('none');
  const [isClaimingLeadId, setIsClaimingLeadId] = useState<number | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendarData, setCalendarData] = useState<any>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayDetails, setDayDetails] = useState<any>(null);
  const [dayDetailsLoading, setDayDetailsLoading] = useState(false);

  const getDefaultDayDetailsTab = (): 'sales' | 'tickets' | 'blacklist' | 'so' | 'po' => {
    if (isAccountantUser && !isExecUser) return 'so';
    if (canViewFinanceCalendar) return 'po';
    return 'sales';
  };

  const [activeModalTab, setActiveModalTab] = useState<'sales' | 'tickets' | 'blacklist' | 'so' | 'po'>(() =>
    isAccountantUser && !isExecUser ? 'so' : (canViewFinanceCalendar ? 'po' : 'sales')
  );
  const [expandedSales, setExpandedSales] = useState<Record<string, boolean>>({});
  const [activePOId, setActivePOId] = useState<number | null>(null);
  const [selectedDepForManage, setSelectedDepForManage] = useState<any | null>(null);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedInvoicePreview, setSelectedInvoicePreview] = useState<any | null>(null);
  const [invoicePreviewLoading, setInvoicePreviewLoading] = useState(false);
  const [financeSummary, setFinanceSummary] = useState<any>(null);
  const [pendingOnly, setPendingOnly] = useState<boolean>(false);
  const [showCreateExpenseModal, setShowCreateExpenseModal] = useState<boolean>(false);
  const [selectedExpenseDate, setSelectedExpenseDate] = useState<string>('');
  const [editingExpense, setEditingExpense] = useState<any>(null);

  const usersMap = useMemo(() => {
    const map = new Map<number, any>();
    ensureArray(users).forEach((u: any) => {
      if (u?.id) map.set(Number(u.id), u);
    });
    return map;
  }, [users]);

  const renderWorkflowStepsAndWatchers = (item: any) => {
    interface StepInfo {
      stepIndex: number;
      title: string;
      userId?: number;
      userName?: string;
      userAvatar?: string | null;
      status: 'approved' | 'rejected' | 'pending' | 'waiting';
    }

    const steps: StepInfo[] = [];
    const overall = String(item?.status || 'pending').toLowerCase();
    const isDraft = overall === 'draft' || Boolean(item?.is_draft);
    const isPaid = Boolean(item?.is_refunded) || overall === 'paid' || overall === 'refunded';

    const s1 = String(item?.status_level_1 || (overall === 'level1_approved' || overall === 'approved' || isPaid ? 'approved' : overall === 'rejected' ? 'rejected' : 'pending')).toLowerCase();
    const s2 = String(item?.status_level_2 || 'none').toLowerCase();
    const s3 = String(item?.status_level_3 || 'none').toLowerCase();

    // Step 1
    const app1Id = Number(item?.approver_id || 0);
    const app1User = app1Id > 0 ? usersMap.get(app1Id) : null;
    const app1Name = item?.approver_name || app1User?.full_name || app1User?.name || '';
    const app1Avatar = item?.approver_avatar || app1User?.avatar_url || app1User?.avatar || null;
    if (app1Id > 0 || app1Name || item?.approver_id_2) {
      let stepStatus: StepInfo['status'] = 'pending';
      if (isDraft) stepStatus = 'waiting';
      else if (s1 === 'approved' || overall === 'approved' || isPaid || overall === 'level1_approved') stepStatus = 'approved';
      else if (s1 === 'rejected' || (overall === 'rejected' && s1 !== 'approved')) stepStatus = 'rejected';
      else stepStatus = 'pending';

      steps.push({
        stepIndex: 1,
        title: t('Cấp 1'),
        userId: app1Id,
        userName: app1Name,
        userAvatar: app1Avatar,
        status: stepStatus
      });
    }

    // Step 2
    const app2Id = Number(item?.approver_id_2 || 0);
    const app2User = app2Id > 0 ? usersMap.get(app2Id) : null;
    const app2Name = item?.approver_name_2 || app2User?.full_name || app2User?.name || '';
    const app2Avatar = item?.approver_avatar_2 || app2User?.avatar_url || app2User?.avatar || null;
    if (app2Id > 0 || (app2Name && app2Name.trim() !== '')) {
      let stepStatus: StepInfo['status'] = 'waiting';
      if (isDraft) stepStatus = 'waiting';
      else if (s2 === 'approved' || (overall === 'approved' && s2 !== 'rejected')) stepStatus = 'approved';
      else if (s2 === 'rejected') stepStatus = 'rejected';
      else if (s1 === 'approved' && s2 !== 'approved' && s2 !== 'rejected') stepStatus = 'pending';
      else stepStatus = 'waiting';

      steps.push({
        stepIndex: 2,
        title: t('Cấp 2'),
        userId: app2Id,
        userName: app2Name,
        userAvatar: app2Avatar,
        status: stepStatus
      });
    }

    // Step 3
    const app3Id = Number(item?.approver_id_3 || 0);
    const app3User = app3Id > 0 ? usersMap.get(app3Id) : null;
    const app3Name = item?.approver_name_3 || app3User?.full_name || app3User?.name || '';
    const app3Avatar = item?.approver_avatar_3 || app3User?.avatar_url || app3User?.avatar || null;
    if (app3Id > 0 || (app3Name && app3Name.trim() !== '')) {
      let stepStatus: StepInfo['status'] = 'waiting';
      if (isDraft) stepStatus = 'waiting';
      else if (s3 === 'approved' || (overall === 'approved' && s3 !== 'rejected')) stepStatus = 'approved';
      else if (s3 === 'rejected') stepStatus = 'rejected';
      else if (s1 === 'approved' && (s2 === 'approved' || s2 === 'none') && s3 !== 'approved' && s3 !== 'rejected') stepStatus = 'pending';
      else stepStatus = 'waiting';

      steps.push({
        stepIndex: 3,
        title: t('Cấp 3'),
        userId: app3Id,
        userName: app3Name,
        userAvatar: app3Avatar,
        status: stepStatus
      });
    }

    if (steps.length === 0) {
      steps.push({
        stepIndex: 1,
        title: t('Duyệt'),
        userId: app1Id,
        userName: app1Name || t('Người duyệt'),
        userAvatar: app1Avatar,
        status: isDraft ? 'waiting' : (overall === 'approved' || isPaid ? 'approved' : overall === 'rejected' ? 'rejected' : 'pending')
      });
    }

    // Watchers list
    let watchersList: Array<{ id?: number; name?: string; avatar?: string | null }> = [];
    if (Array.isArray(item?.watchers) && item.watchers.length > 0) {
      watchersList = item.watchers;
    } else if (item?.related_user_ids) {
      let relIds: number[] = [];
      const rawWatchers = item.related_user_ids;
      if (Array.isArray(rawWatchers)) {
        relIds = rawWatchers.map((id: any) => Number(typeof id === 'object' && id !== null ? (id.id || id.user_id) : id)).filter((id: number) => id > 0);
      } else if (typeof rawWatchers === 'string') {
        const trimmed = rawWatchers.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              relIds = parsed.map((id: any) => Number(typeof id === 'object' && id !== null ? (id.id || id.user_id) : id)).filter((id: number) => id > 0);
            }
          } catch {
            relIds = trimmed.slice(1, -1).split(',').map((id: string) => Number(id.trim().replace(/^['"]|['"]$/g, ''))).filter((id: number) => id > 0);
          }
        } else {
          relIds = trimmed.split(',').map((id: string) => Number(id.trim())).filter((id: number) => id > 0);
        }
      }
      watchersList = relIds.map(id => {
        const u = usersMap.get(id);
        return { id, name: u?.full_name || u?.name || `ID ${id}`, avatar: u?.avatar_url || u?.avatar || null };
      });
    }

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
        {/* Step Approvers Chain */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          {steps.map((st, idx) => {
            const displayName = st.userName || st.title;
            const avatarUrl = st.userAvatar;

            const isApproved = !isDraft && st.status === 'approved';
            const isRejected = !isDraft && st.status === 'rejected';
            const isPending = !isDraft && st.status === 'pending';

            const borderColor = isApproved ? '#34C759' : isRejected ? '#BD1D2D' : isPending ? '#FF9500' : 'var(--color-border)';
            const statusText = isApproved ? t('Đã duyệt') : isRejected ? t('Từ chối') : isPending ? t('Đang chờ duyệt') : isDraft ? t('Dự kiến duyệt (Bản nháp)') : t('Chưa đến lượt');

            return (
              <Fragment key={`po-step-${st.stepIndex}`}>
                {idx > 0 && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: '0 1px' }}>➔</span>
                )}
                <div
                  title={`${st.title}: ${displayName} (${statusText})`}
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    borderRadius: '50%',
                    padding: '1.5px',
                    border: `2px solid ${borderColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--color-surface, #ffffff)',
                    opacity: isDraft ? 0.95 : (st.status === 'waiting' ? 0.6 : 1)
                  }}>
                    <Avatar src={avatarUrl || undefined} name={displayName} size={24} />
                  </div>
                  <div style={{
                    position: 'absolute',
                    bottom: '-2px',
                    right: '-2px',
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    background: isApproved ? '#34C759' : isRejected ? '#BD1D2D' : isPending ? '#FF9500' : isDraft ? '#64748B' : '#8E8E93',
                    border: '1.5px solid #ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontSize: '8px',
                    fontWeight: 800
                  }}>
                    {isApproved ? '✓' : isRejected ? '✕' : isPending ? '•' : st.stepIndex}
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>

        {/* Related Watchers Avatars */}
        {watchersList.length > 0 && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              marginLeft: '4px',
              paddingLeft: '6px',
              borderLeft: '1px solid var(--color-border)'
            }}
            title={`${t('Người liên quan')} (${watchersList.length}): ${watchersList.map(w => w.name).join(', ')}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', marginRight: '1px' }}>
              <Eye size={12} />
            </div>
            {watchersList.slice(0, 3).map((w, wIdx) => (
              <Avatar
                key={`rel-${w.id || wIdx}`}
                src={w.avatar || undefined}
                name={w.name || `User ${w.id}`}
                size={22}
              />
            ))}
            {watchersList.length > 3 && (
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                +{watchersList.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const handleOpenPO = (poId: number) => {
    setActivePOId(poId);
  };

  const isDepositMilestoneRow = (row: any): boolean => {
    if (!row || typeof row !== 'object') return false;
    const entityType = String(row.entity_type || '').toLowerCase();
    if (entityType === 'invoice') return false;
    if (entityType === 'deposit_milestone' || entityType === 'deposit') return true;
    if (row.deposit_id && !row.invoice_id) return true;
    if (!row.invoice_id && row.deal_id && !/^INV/i.test(String(row.invoice_number || '')) && row.status === 'pending') {
      return true;
    }
    return false;
  };

  const handleOpenSO = async (itemOrId: any) => {
    const isObject = typeof itemOrId === 'object' && itemOrId !== null;
    const isMilestone = isObject ? isDepositMilestoneRow(itemOrId) : true;

    soAbortRef.current?.abort();
    const controller = new AbortController();
    soAbortRef.current = controller;

    if (!isMilestone) {
      const invoiceId = Number(itemOrId.invoice_id || itemOrId.id || 0);
      if (!invoiceId) {
        toast.error(t('Không tìm thấy thông tin hóa đơn tương ứng.'));
        return;
      }
      const loadToastId = toast.loading(t('Đang tải chi tiết hóa đơn (SO)...'));
      setInvoicePreviewLoading(true);
      try {
        const res = await api.get(`/invoices/${invoiceId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        const inv = res?.data?.data || res?.data;
        if (inv && inv.id) {
          setSelectedInvoicePreview(inv);
          return;
        }
        toast.error(t('Không tìm thấy thông tin hóa đơn tương ứng.'));
      } catch (err: any) {
        if (isAbortError(err, controller.signal)) return;
        toast.error(err?.response?.data?.message || t('Không tìm thấy thông tin hóa đơn tương ứng.'));
      } finally {
        toast.dismiss(loadToastId);
        if (!controller.signal.aborted) setInvoicePreviewLoading(false);
      }
      return;
    }

    const depositId = Number(isObject ? (itemOrId.deposit_id || itemOrId.deal_id || 0) : itemOrId);
    if (!depositId) {
      toast.error(t('Không tìm thấy thông tin phiếu cọc tương ứng.'));
      return;
    }

    const loadToastId = toast.loading(t('Đang tải chi tiết phiếu cọc...'));
    try {
      const res = await fetchAPI(`deposits?id=${depositId}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const deps = extractArray(res);
      if (res?.success && deps.length > 0) {
        setSelectedDepForManage(deps[0]);
        setShowManageModal(true);
        return;
      }
      toast.error(t('Không tìm thấy thông tin phiếu cọc tương ứng.'));
    } catch (err: any) {
      if (isAbortError(err, controller.signal)) return;
      console.error('Error fetching deposit details:', err);
      toast.error(t('Không tìm thấy thông tin phiếu cọc tương ứng.'));
    } finally {
      toast.dismiss(loadToastId);
    }
  };

  const toggleExpandSale = (saleName: string) => {
    setExpandedSales(prev => ({
      ...prev,
      [saleName]: !prev[saleName]
    }));
  };

  const fetchPublicLeads = async () => {
    publicLeadsAbortRef.current?.abort();
    const controller = new AbortController();
    publicLeadsAbortRef.current = controller;
    setPublicLoading(true);
    try {
      const showDel = isSysAdmin ? showDeletedFilter : 'none';
      const json = await fetchAPI(
        `get_public_leads&page=${publicPage}&pageSize=${ITEMS_PER_PAGE}&search=${encodeURIComponent(searchTerm)}&show_deleted=${encodeURIComponent(showDel)}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (json.success) {
        const rawList = extractArray(json).map((l: any) => ({
          ...l,
          takers: ensureArray(l.takers)
        }));
        if (json.total_count !== undefined) {
          setPublicLeads(rawList);
          setPublicTotalCount(Number(json.total_count) || 0);
        } else {
          // Backend returned full unpaginated dataset: apply search + pagination parity on client
          const q = searchTerm.trim().toLowerCase();
          const filtered = q
            ? rawList.filter((l: any) =>
                String(l.full_name || l.name || '').toLowerCase().includes(q) ||
                String(l.phone || '').toLowerCase().includes(q) ||
                String(l.email || '').toLowerCase().includes(q) ||
                String(l.original_source || '').toLowerCase().includes(q)
              )
            : rawList;
          const startIdx = (publicPage - 1) * ITEMS_PER_PAGE;
          setPublicTotalCount(filtered.length);
          setPublicLeads(filtered.slice(startIdx, startIdx + ITEMS_PER_PAGE));
        }
      } else {
        toast.error(json.message || t('Lỗi tải dữ liệu kho data chung'));
      }
    } catch (e: any) {
      if (isAbortError(e, controller.signal)) return;
      toast.error(t('Lỗi tải dữ liệu kho data chung: ') + e.message);
    } finally {
      if (!controller.signal.aborted) setPublicLoading(false);
    }
  };

  const handleClaimLead = (personId: number, personName?: string, onSuccess?: () => void) => {
    if (!personId || personId <= 0) {
      toast.error(t('Không xác định được mã hồ sơ khách hàng (person_id)'));
      return;
    }
    if (claimInFlightRef.current) return;
    const displayName = personName || t('Khách hàng này');
    showConfirm({
      title: t('Nhận Khách hàng'),
      message: t('Bạn có chắc chắn muốn nhận khách hàng "{name}" từ Kho Databank về danh sách quản lý của mình không?').replace('{name}', displayName),
      confirmText: t('Nhận Khách'),
      cancelText: t('Hủy'),
      onConfirm: async () => {
        if (claimInFlightRef.current) return;
        claimInFlightRef.current = true;
        setIsClaimingLeadId(personId);
        try {
          const json = await fetchAPI('claim_public_lead', {
            method: 'POST',
            body: JSON.stringify({ person_id: personId })
          });
          if (json.success) {
            toast.success(json.message || t('Nhận data thành công'));
            fetchPublicLeads();
            window.dispatchEvent(new CustomEvent('lead-claimed', { detail: { source: 'datalist' } }));
            if (onSuccess) onSuccess();
          } else {
            toast.error(json.message || t('Nhận data thất bại'));
          }
        } catch (e: any) {
          toast.error(t('Lỗi: ') + e.message);
        } finally {
          claimInFlightRef.current = false;
          setIsClaimingLeadId(null);
        }
      }
    });
  };

  const handleDeletePublicLeads = (personIds: number[]) => {
    const cleanIds = ensureArray(personIds).map(Number).filter(id => id > 0);
    if (cleanIds.length === 0 || databankActionInFlightRef.current) return;
    showConfirm({
      title: t('Ẩn khỏi Kho chung (Databank)'),
      message: t('Bạn có chắc chắn muốn ẩn {count} khách hàng đã chọn khỏi Kho chung? Quản trị viên vẫn có thể khôi phục từ bộ lọc Đã ẩn.').replace('{count}', String(cleanIds.length)),
      confirmText: t('Ẩn dữ liệu'),
      cancelText: t('Hủy'),
      isDanger: true,
      onConfirm: async () => {
        if (databankActionInFlightRef.current) return;
        databankActionInFlightRef.current = true;
        try {
          const res = await fetchAPI('delete_public_leads', {
            method: 'POST',
            body: JSON.stringify({ person_ids: cleanIds })
          });
          if (res?.success) {
            toast.success(res.message || t('Đã ẩn dữ liệu khỏi Kho Databank thành công'));
            fetchPublicLeads();
            fetchLeads();
          } else {
            toast.error(res?.message || t('Lỗi ẩn dữ liệu Databank'));
          }
        } catch (e: any) {
          toast.error(t('Lỗi: ') + e.message);
        } finally {
          databankActionInFlightRef.current = false;
        }
      }
    });
  };

  const handleRestorePublicLeads = (personIds: number[]) => {
    const cleanIds = ensureArray(personIds).map(Number).filter(id => id > 0);
    if (cleanIds.length === 0 || databankActionInFlightRef.current) return;
    showConfirm({
      title: t('Khôi phục hiển thị Databank'),
      message: t('Bạn có chắc chắn muốn khôi phục hiển thị {count} khách hàng trong Kho chung (Databank)?').replace('{count}', String(cleanIds.length)),
      confirmText: t('Khôi phục'),
      cancelText: t('Hủy'),
      onConfirm: async () => {
        if (databankActionInFlightRef.current) return;
        databankActionInFlightRef.current = true;
        try {
          const res = await fetchAPI('restore_public_leads', {
            method: 'POST',
            body: JSON.stringify({ person_ids: cleanIds })
          });
          if (res?.success) {
            toast.success(res.message || t('Đã khôi phục hiển thị dữ liệu thành công'));
            fetchPublicLeads();
            fetchLeads();
          } else {
            toast.error(res?.message || t('Lỗi khôi phục dữ liệu Databank'));
          }
        } catch (e: any) {
          toast.error(t('Lỗi: ') + e.message);
        } finally {
          databankActionInFlightRef.current = false;
        }
      }
    });
  };

  useEffect(() => {
    if (isRouteActive && viewMode === 'databank') {
      fetchPublicLeads();
    }
  }, [isRouteActive, viewMode, publicPage, searchTerm, showDeletedFilter, ITEMS_PER_PAGE]);

  const fetchCalendarStats = async () => {
    calendarAbortRef.current?.abort();
    const controller = new AbortController();
    calendarAbortRef.current = controller;
    setCalendarLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const json = await fetchAPI(
        `get_calendar_stats&year=${year}&month=${month}&consultant=${encodeURIComponent(consultantFilter)}&pending_only=${pendingOnly ? 1 : 0}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (json.success) {
        setCalendarData(json.data || {});
        setFinanceSummary(json.finance_summary || null);
      }
    } catch (e: any) {
      if (isAbortError(e, controller.signal)) return;
      toast.error(t('Lỗi tải dữ liệu lịch: ') + e.message);
    } finally {
      if (!controller.signal.aborted) setCalendarLoading(false);
    }
  };

  const handleDateClick = async (dateStr: string) => {
    dayDetailsAbortRef.current?.abort();
    const controller = new AbortController();
    dayDetailsAbortRef.current = controller;
    setSelectedDate(dateStr);
    setDayDetailsLoading(true);
    setDayDetails(null);
    try {
      const json = await fetchAPI(
        `get_calendar_day_details&date=${dateStr}&consultant=${encodeURIComponent(consultantFilter)}&pending_only=${pendingOnly ? 1 : 0}`,
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return;
      if (json.success) {
        setDayDetails(json.data);
        setActiveModalTab(getDefaultDayDetailsTab());
      }
    } catch (e: any) {
      if (isAbortError(e, controller.signal)) return;
      toast.error(t('Lỗi tải chi tiết ngày: ') + e.message);
    } finally {
      if (!controller.signal.aborted) setDayDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (isRouteActive && viewMode === 'calendar') {
      fetchCalendarStats();
    }
  }, [viewMode, currentDate, consultantFilter, isRouteActive, pendingOnly]);

  useEffect(() => {
    if (isRouteActive && selectedDate) {
      handleDateClick(selectedDate);
    }
  }, [consultantFilter, isRouteActive, pendingOnly]);

  const fetchConsultants = async () => {
    consultantsAbortRef.current?.abort();
    const controller = new AbortController();
    consultantsAbortRef.current = controller;
    try {
      const json = await fetchAPI('get_consultants', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (json.success) {
        setConsultants(extractArray(json));
      }
    } catch (e: any) {
      if (isAbortError(e, controller.signal)) return;
      console.error(e.message);
    }
  };

  const fetchAccounts = async () => {
    accountsAbortRef.current?.abort();
    const controller = new AbortController();
    accountsAbortRef.current = controller;
    try {
      const json = await fetchAPI('get_accounts', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (json.success) {
        setAllAccounts(extractArray(json));
      }
    } catch (e: any) {
      if (isAbortError(e, controller.signal)) return;
      console.error(e.message);
    }
  };

  const getUserAvatarByName = (name: string) => {
    if (!name || name === 'Hệ thống') return undefined;
    const acc = ensureArray(allAccounts).find((a: any) => (a?.name || a?.username) === name);
    if (acc?.avatar || acc?.avatar_url) return acc.avatar || acc.avatar_url;
    const cons = ensureArray(consultants).find((c: any) => c?.name === name);
    if (cons?.avatar || (cons as any)?.avatar_url) return cons.avatar || (cons as any).avatar_url;
    return undefined;
  };

  const fetchRounds = async () => {
    roundsAbortRef.current?.abort();
    const controller = new AbortController();
    roundsAbortRef.current = controller;
    try {
      const json = await fetchAPI('get_rounds', { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (json.success) {
        setRounds(extractArray(json));
      }
    } catch (e: any) {
      if (isAbortError(e, controller.signal)) return;
      console.error(e.message);
    }
  };

  const handleReassign = async (compensate: boolean = false) => {
    if (!selectedLead || !reassignConsId || reassignInFlightRef.current) return;
    reassignInFlightRef.current = true;
    setIsReassigning(true);
    try {
      const res = await fetchAPI('reassign_lead', {
        method: 'POST',
        body: JSON.stringify({
          log_id: selectedLead.id,
          new_consultant_id: Number(reassignConsId),
          compensate_old_sale: compensate
        })
      });
      if (res.success) {
        toast.success(compensate
          ? t('Giao lại Tư vấn viên & Đền bù thành công')
          : t('Giao lại Tư vấn viên thành công')
        );
        setSelectedLead(null);
        setReassignConsId('');
        setConfirmReassignOpen(false);
        fetchLeads();
        window.dispatchEvent(new CustomEvent('lead-added', { detail: { source: 'datalist' } }));
      } else {
        toast.error(t('Lỗi: ') + (res.message || t('Không thể giao lại')));
      }
    } catch (err: any) {
      toast.error(t('Đã xảy ra lỗi: ') + err.message);
    } finally {
      reassignInFlightRef.current = false;
      setIsReassigning(false);
    }
  };

  const handleBlockLead = async () => {
    if (!selectedLead || blockInFlightRef.current) return;
    if (!blockReason.trim()) {
      toast.error(t('Vui lòng nhập lý do chặn.'));
      return;
    }
    blockInFlightRef.current = true;
    setIsBlocking(true);
    try {
      const res = await fetchAPI('block_lead', {
        method: 'POST',
        body: JSON.stringify({
          log_id: selectedLead.id,
          compensate_sale: compensateBlock,
          reason: blockReason.trim()
        })
      });
      if (res.success) {
        toast.success(t('Chặn khách hàng và đưa vào Blacklist thành công'));
        setSelectedLead(null);
        setConfirmBlockOpen(false);
        setBlockReason('');
        setCompensateBlock(false);
        fetchLeads();
        window.dispatchEvent(new CustomEvent('lead-added', { detail: { source: 'datalist' } }));
      } else {
        toast.error(t('Lỗi: ') + (res.message || t('Không thể chặn khách hàng')));
      }
    } catch (err: any) {
      toast.error(t('Đã xảy ra lỗi: ') + err.message);
    } finally {
      blockInFlightRef.current = false;
      setIsBlocking(false);
    }
  };

  const handleExportCSV = async () => {
    if (!canExportData) {
      toast.error(t('Bạn không có quyền xuất dữ liệu CSV.'));
      return;
    }
    if (exportInFlightRef.current || isExportingCSV) return;
    exportInFlightRef.current = true;
    setIsExportingCSV(true);
    if (localStorage.getItem('IDEAS_DEMO_MODE') === 'true') {
      toast.loading(t('Đang chuẩn bị dữ liệu xuất CSV (Demo)...'), { id: 'export' });
      try {
        if (leads.length === 0) {
          toast.error(t('Không có dữ liệu để xuất'), { id: 'export' });
          return;
        }

        const headers = [t('ID'), t('Họ Tên'), t('SĐT'), t('Email'), t('Vòng'), t('Phân bổ cho'), t('Trạng thái'), t('Nguồn'), t('Ghi chú'), t('Thời gian')];
        const rows = leads.map(lead => [
          lead.id,
          lead.name,
          checkCanSeeLeadFullInfo(lead) ? lead.phone : maskPhone(lead.phone),
          checkCanSeeLeadFullInfo(lead) ? lead.email : maskEmail(lead.email),
          lead.round_name || '',
          lead.assigned_to_name || t('Chưa phân bổ'),
          lead.status === 'assigned' ? t('Đã chia') :
            lead.status === 'compensation' ? t('Data Bù') :
              lead.status === 'pending' ? t('Chờ chia') :
                lead.status === 'fallback' ? t('Fallback') :
                  lead.status === 'silent' ? t('Chỉ đồng bộ') :
                    lead.status === 'reminder' ? t('Nhắc lại') :
                      lead.status === 'pending_approval' ? (
                        lead.ai_screener_status === 'pending' && (() => {
                          const now = new Date();
                          const created = lead.created_at ? parseServerDate(lead.created_at) : now;
                          const diffMins = (now.getTime() - created.getTime()) / 60000;
                          return diffMins >= -2 && diffMins < 5;
                        })()
                          ? t('Chờ AI đánh giá')
                          : t('Tạm giữ')
                      ) :
                        lead.status === 'rejected' ? t('Dưới chuẩn') : lead.status,
          lead.source || '',
          lead.note || '',
          lead.created_at
        ]);

        const csvContent = "\uFEFF" + [
          headers.map(h => sanitizeCsvCell(h)).join(','),
          ...rows.map(row => row.map(val => sanitizeCsvCell(val)).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `export_${getLocalTimestampForFilename()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        scheduleTimeout(() => URL.revokeObjectURL(url), 5000);

        toast.success(t('Đã tải xuống file CSV an toàn'), { id: 'export' });
      } catch (err) {
        toast.error(t('Có lỗi xảy ra khi xuất dữ liệu'), { id: 'export' });
      } finally {
        exportInFlightRef.current = false;
        setIsExportingCSV(false);
      }
      return;
    }

    toast.loading(t('Đang chuẩn bị dữ liệu xuất CSV...'), { id: 'export' });
    try {
      const token = localStorage.getItem('access_token') || localStorage.getItem('Ideas_token') || '';
      const baseUrl = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api.php` : '/backend/api.php';
      const exportUrl = `${baseUrl}?action=export_csv&date=${encodeURIComponent(dateFilter)}&status=${encodeURIComponent(statusFilter)}&consultant=${encodeURIComponent(consultantFilter)}&round=${encodeURIComponent(roundFilter)}&search=${encodeURIComponent(searchTerm)}`;

      const response = await fetch(exportUrl, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        let errMsg = t('Có lỗi xảy ra khi xuất dữ liệu');
        try {
          const errJson = await response.json();
          if (errJson?.message) errMsg = errJson.message;
        } catch {}
        throw new Error(errMsg);
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', `export_${getLocalTimestampForFilename()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      scheduleTimeout(() => URL.revokeObjectURL(blobUrl), 15000);

      toast.success(t('Đang tải xuống file CSV...'), { id: 'export' });
    } catch (err: any) {
      toast.error(err?.message || t('Có lỗi xảy ra khi xuất dữ liệu'), { id: 'export' });
    } finally {
      scheduleTimeout(() => {
        exportInFlightRef.current = false;
        setIsExportingCSV(false);
      }, 800);
    }
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const paginatedLeads = leads;

  const VIRTUALIZE_THRESHOLD = 40;
  const databankScrollRef = useRef<HTMLDivElement>(null);
  const logsScrollRef = useRef<HTMLDivElement>(null);
  const safePublicLeads = useMemo(() => ensureArray(publicLeads), [publicLeads]);
  const shouldVirtualizeDatabank = viewMode === 'databank' && safePublicLeads.length > VIRTUALIZE_THRESHOLD;
  const databankVirtualizer = useVirtualizer({
    count: shouldVirtualizeDatabank ? safePublicLeads.length : 0,
    getScrollElement: () => databankScrollRef.current,
    estimateSize: () => 60,
    overscan: 8,
    initialRect: { width: 1100, height: 640 }
  });
  const virtualDatabankItems = shouldVirtualizeDatabank ? databankVirtualizer.getVirtualItems() : [];
  const databankPadTop = virtualDatabankItems.length > 0 ? virtualDatabankItems[0].start : 0;
  const databankPadBottom = virtualDatabankItems.length > 0
    ? Math.max(0, databankVirtualizer.getTotalSize() - virtualDatabankItems[virtualDatabankItems.length - 1].end)
    : 0;
  const visiblePublicLeads = shouldVirtualizeDatabank
    ? virtualDatabankItems.map((vi) => safePublicLeads[vi.index]).filter(Boolean)
    : safePublicLeads;

  const shouldVirtualizeLogs = viewMode !== 'databank' && !isMobile && !loading && paginatedLeads.length > VIRTUALIZE_THRESHOLD;
  const logsVirtualizer = useVirtualizer({
    count: shouldVirtualizeLogs ? paginatedLeads.length : 0,
    getScrollElement: () => logsScrollRef.current,
    estimateSize: () => 62,
    overscan: 8,
    initialRect: { width: 1100, height: 640 }
  });
  const virtualLogsItems = shouldVirtualizeLogs ? logsVirtualizer.getVirtualItems() : [];
  const logsPadTop = virtualLogsItems.length > 0 ? virtualLogsItems[0].start : 0;
  const logsPadBottom = virtualLogsItems.length > 0
    ? Math.max(0, logsVirtualizer.getTotalSize() - virtualLogsItems[virtualLogsItems.length - 1].end)
    : 0;
  const visiblePaginatedLeads = shouldVirtualizeLogs
    ? virtualLogsItems.map((vi) => paginatedLeads[vi.index]).filter(Boolean)
    : paginatedLeads;

  const getPendingUntilTime = () => {
    if (!sysSettings) return t('Chờ giờ làm');
    const now = new Date();
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    const workStart = sysSettings.global_work_start_time || '08:00';
    const nightStart = sysSettings.night_shift_start_time || '22:00';
    const goldenStart = sysSettings.golden_hours_start_time || '06:00';

    const times = [workStart, nightStart, goldenStart];
    let nextTimeStr = '';
    let minDiff = Infinity;

    times.forEach(tStr => {
      const [h, m] = tStr.split(':').map(Number);
      const targetMins = h * 60 + m;
      const currentMins = currentHour * 60 + currentMin;

      let diff = targetMins - currentMins;
      if (diff <= 0) {
        diff += 24 * 60;
      }

      if (diff < minDiff) {
        minDiff = diff;
        nextTimeStr = tStr;
      }
    });

    return `${t('Chờ đến')} ${nextTimeStr}`;
  };

  const getStatusBadge = (status: string, reportStatus?: string, aiScreenerStatus?: string, createdAt?: string, takers?: any[], message?: string) => {
    const msg = (message || '').toLowerCase();

    // Heuristic override from distribution log message
    if (status === 'compensation' || msg.includes('đền bù') || msg.includes('bù lượt') || msg.includes('bù chủ động') || msg.includes('bù data')) {
      return (
        <span className="badge" style={{ background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', border: '1px solid rgba(189, 29, 45, 0.2)', fontWeight: 600 }}>
          {t('Đã bù')}
        </span>
      );
    }

    if (status === 'reallocated' || msg.includes('phân bổ lại') || msg.includes('thu hồi')) {
      return (
        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.25)', fontWeight: 600 }}>
          {t('Phân bổ lại')}
        </span>
      );
    }

    if (status === 'reminder' || msg.includes('khách cũ đăng ký lại') || msg.includes('nhắc trùng') || msg.includes('nhắc lại')) {
      return (
        <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.25)', fontWeight: 600 }}>
          {t('Nhắc lại')}
        </span>
      );
    }

    if (status === 'assigned' && reportStatus === 'pending') {
      return <span className="badge" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-border-light)' }}>{t('Ticket Review')}</span>;
    }
    if (status === 'error' && (reportStatus === 'approved' || reportStatus === 'approved_no_comp')) {
      return <span className="badge warning">{t('Ticket')}</span>;
    }
    if (status === 'pending_approval' && aiScreenerStatus === 'pending') {
      const now = new Date();
      const created = createdAt ? parseServerDate(createdAt) : now;
      const diffMins = !isNaN(created.getTime()) ? (now.getTime() - created.getTime()) / 60000 : 999;
      if (diffMins >= -2 && diffMins < 5) {
        return <span className="badge" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)', border: '1px solid var(--color-border-light)' }}>{t('Chờ AI đánh giá')}</span>;
      }
    }
    switch (status) {
      case 'assigned': return <span className="badge success">{t('Đã chia')}</span>;
      case 'compensation': return <span className="badge" style={{ background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', border: '1px solid rgba(189, 29, 45, 0.2)', fontWeight: 600 }}>{t('Đã bù')}</span>;
      case 'reallocated': return <span className="badge warning" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.25)', fontWeight: 600 }}>{t('Phân bổ lại')}</span>;
      case 'pending_work_hours': return <span className="badge warm">{t('Chờ giờ làm')}</span>;
      case 'error': return <span className="badge danger">{t('Ticket')}</span>;
      case 'pending': return <span className="badge warning">{t('Chờ chia')}</span>;
      case 'reminder': return <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.25)', fontWeight: 600 }}>{t('Nhắc lại')}</span>;
      case 'duplicate': return <span className="badge danger">{t('Trùng lặp')}</span>;
      case 'rule_6_month': return <span className="badge cold">{t('Quy định 6 tháng')}</span>;
      case 'silent': return <span className="badge cold">{t('Chỉ đồng bộ')}</span>;
      case 'blacklisted': return <span className="badge danger">{t('Blacklist')}</span>;
      case 'pending_approval': return <span className="badge warning">{t('Tạm giữ')}</span>;
      case 'rejected': return <span className="badge danger">{t('Dưới chuẩn')}</span>;
      case 'released_to_kho':
      case 'databank': {
        const cnt = ensureArray(takers).length;
        const rem = Math.max(0, maxParallelClaims - cnt);
        if (cnt === 0) {
          return (
            <span className="badge" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
              {t('Public')} ({rem}/{maxParallelClaims})
            </span>
          );
        } else if (cnt >= maxParallelClaims) {
          return (
            <span className="badge" style={{ background: 'rgba(156,163,175,0.12)', color: '#9ca3af', border: '1px solid rgba(156,163,175,0.2)' }}>
              {t('Giới hạn')} (0/{maxParallelClaims})
            </span>
          );
        } else {
          return (
            <span className="badge" style={{ background: 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', border: '1px solid rgba(189, 29, 45, 0.2)' }}>
              {t('Public')} ({rem}/{maxParallelClaims})
            </span>
          );
        }
      }
      case 'fallback': return <span className="badge" style={{ background: 'var(--color-warning-light)', color: 'var(--color-warning)', border: '1px solid var(--color-border-light)' }}>{t('Fallback')}</span>;
      default: return null;
    }
  };

  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = new Intl.DateTimeFormat(
    language === 'vi' ? 'vi-VN' : language === 'ja' ? 'ja-JP' : language === 'zh' ? 'zh-CN' : 'en-US',
    { month: 'long' }
  ).format(currentDate);

  const days = [];
  const totalDays = daysInMonth(year, month);
  const startOffset = (firstDayOfMonth(year, month) + 6) % 7;

  // Padding for start of month
  for (let i = 0; i < startOffset; i++) {
    days.push(<div key={`empty-start-${i}`} style={{ background: 'var(--color-bg)', borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', opacity: 0.3 }}></div>);
  }

  // Days of month
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dayData = calendarData[dateStr] || { distributed: 0, blacklist: 0, reminder: 0, error: 0, ticket_total: 0 };
    const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
    const dayOfWeek = (startOffset + d - 1) % 7;
    const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;

    days.push(
      <div
        key={d}
        onClick={() => handleDateClick(dateStr)}
        style={{
          borderRight: '1px solid var(--color-border)',
          borderBottom: '1px solid var(--color-border)',
          padding: '0.625rem',
          minHeight: '110px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          transition: 'all 0.2s',
          backgroundColor: isToday
            ? 'rgba(189, 29, 45, 0.08)'
            : isWeekend
              ? 'var(--color-calendar-weekend)'
              : 'var(--color-surface)',
          cursor: 'pointer',
          position: 'relative'
        }}
        className="calendar-day-cell"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{
            fontSize: '0.8125rem',
            fontWeight: 700,
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            backgroundColor: isToday ? 'var(--color-primary)' : 'transparent',
            color: isToday ? 'white' : 'var(--color-text-light)'
          }}>{d}</span>
          {isToday && <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--color-primary)' }}>{t('Hôm nay')}</span>}
        </div>

        <div className="datalist-calendar-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '4px', alignContent: 'end' }}>
          {!isAccountantUser && dayData.distributed > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '2px 4px',
              borderRadius: '4px',
              background: 'var(--color-success-light)',
              color: 'var(--color-success)',
              fontSize: '0.6875rem',
              fontWeight: 600
            }} title={t("Đã chia")}>
              <span>{t('Chia')}:</span>
              <strong>{dayData.distributed}</strong>
            </div>
          )}
          {!isAccountantUser && dayData.blacklist > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '2px 4px',
              borderRadius: '4px',
              background: 'var(--color-danger-light)',
              color: 'var(--color-danger)',
              fontSize: '0.6875rem',
              fontWeight: 600
            }} title="Blacklist">
              <span>{t('Chặn')}:</span>
              <strong>{dayData.blacklist}</strong>
            </div>
          )}
          {!isAccountantUser && dayData.ticket_total > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '2px 4px',
              borderRadius: '4px',
              background: theme === 'dark' ? 'var(--color-primary-light)' : '#fff5f6',
              color: theme === 'dark' ? 'var(--color-primary)' : '#a31422',
              fontSize: '0.6875rem',
              fontWeight: 600,
              border: theme === 'dark' ? '1px solid var(--color-border)' : '1px solid #fecdd3'
            }} title={t("Ticket lỗi")}>
              <span>{t('Ticket')}:</span>
              <strong>{dayData.ticket_total}</strong>
            </div>
          )}
          {!isAccountantUser && dayData.reminder > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '2px 4px',
              borderRadius: '4px',
              background: theme === 'dark' ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
              color: theme === 'dark' ? '#fbbf24' : '#b45309',
              fontSize: '0.6875rem',
              fontWeight: 600,
              border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid #fde68a'
            }} title={t("Nhắc lại")}>
              <span>{t('Nhắc')}:</span>
              <strong>{dayData.reminder}</strong>
            </div>
          )}
          {!isAccountantUser && dayData.error > 0 && (
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '2px 4px',
              borderRadius: '4px',
              background: 'var(--color-warning-light)',
              color: 'var(--color-warning)',
              fontSize: '0.6875rem',
              fontWeight: 600
            }} title={t("Ticket")}>
              <span>{t('Ticket')}:</span>
              <strong>{dayData.error}</strong>
            </div>
          )}
          {canViewFinanceCalendar && dayData.so_count > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '4px 6px',
              borderRadius: '6px',
              background: theme === 'dark' ? 'rgba(189, 29, 45, 0.14)' : 'rgba(189, 29, 45, 0.07)',
              color: theme === 'dark' ? '#fb7185' : '#BD1D2D',
              border: theme === 'dark' ? '1px solid rgba(189, 29, 45, 0.28)' : '1px solid rgba(189, 29, 45, 0.2)',
              gap: '2px'
            }} title={`${t('Sales Order')}: ${dayData.so_count}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', fontWeight: 700 }}>
                <span>SO:</span>
                <strong>{dayData.so_count}</strong>
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, textAlign: 'right', marginTop: '1px', borderTop: theme === 'dark' ? '1px dashed rgba(251, 113, 133, 0.25)' : '1px dashed rgba(189, 29, 45, 0.2)', paddingTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(dayData.so_total || 0)}
              </div>
            </div>
          )}
          {canViewFinanceCalendar && dayData.po_count > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              padding: '4px 6px',
              borderRadius: '6px',
              background: theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : '#f1f5f9',
              color: theme === 'dark' ? '#cbd5e1' : '#334155',
              border: theme === 'dark' ? '1px solid rgba(148, 163, 184, 0.22)' : '1px solid #cbd5e1',
              gap: '2px'
            }} title={`${t('Purchase Order')}: ${dayData.po_count}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', fontWeight: 700 }}>
                <span>PO:</span>
                <strong>{dayData.po_count}</strong>
              </div>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, textAlign: 'right', marginTop: '1px', borderTop: theme === 'dark' ? '1px dashed rgba(203, 213, 225, 0.2)' : '1px dashed rgba(51, 65, 85, 0.2)', paddingTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
                {formatMoney(dayData.po_total || 0)}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Padding for end of month to make a perfect grid
  const totalCells = startOffset + totalDays;
  const rows = Math.ceil(totalCells / 7);
  const targetTotalCells = rows * 7;
  const endOffset = targetTotalCells - totalCells;
  for (let i = 0; i < endOffset; i++) {
    days.push(<div key={`empty-end-${i}`} style={{ background: 'var(--color-bg)', borderRight: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', opacity: 0.3 }}></div>);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: viewMode === 'calendar' ? 'auto' : 'calc(100vh - 150px)', minHeight: 0 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1.25rem', flexShrink: 0 }}>
        <div>
          {(viewMode === 'calendar' || isAccountantUser) ? (
            <>
              <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Calendar size={24} color="var(--color-primary)" /> {canViewFinanceCalendar ? t('Lịch trình Tài chính') : t('Lịch trình Phân bổ Data')}
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={() => navigate('/personal-calendar')}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '6px', 
                    fontWeight: 600, 
                    marginLeft: '12px',
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    borderRadius: '6px'
                  }}
                >
                  <Calendar size={13} />
                  {t('Xem Lịch trình Cá nhân')}
                </button>
              </h1>
              <p className="page-subtitle">
                {canViewFinanceCalendar
                  ? t('Xem lịch trình, theo dõi tiến trình phát sinh Sales Order & Purchase Order.')
                  : t('Theo dõi lịch chia Data, Blacklist và Ticket theo từng ngày trong tháng.')}
              </p>
            </>
          ) : (
            <>
              <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Database size={24} color="var(--color-primary)" /> {viewMode === 'databank' ? t('Kho chung (Databank)') : t('Quản lý Data')}
                <button
                  type="button"
                  onClick={() => setShowInfoModal(true)}
                  style={{
                    background: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                    border: '1px solid var(--color-border)',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    color: 'var(--color-text-muted)',
                    transition: 'all 0.2s',
                    marginLeft: '8px'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.color = 'var(--color-primary)';
                    e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                    e.currentTarget.style.background = 'var(--color-primary-light)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.color = 'var(--color-text-muted)';
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
                  }}
                  title={t("Giải thích ý nghĩa các trạng thái data")}
                >
                  <Info size={14} />
                  <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{t("Giải thích trạng thái")}</span>
                </button>
              </h1>
              <p className="page-subtitle">{t('Xem lịch sử, theo dõi tiến trình và quản lý toàn bộ dữ liệu Khách hàng.')}</p>
            </>
          )}
        </div>
        {!isAccountantUser && (
          <div className="data-list-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', width: isMobile ? '100%' : undefined }}>
            {!isSaleUser && !isViewerUser ? (
              isMobile ? (
                <ResponsiveActionGroup
                  moreLabel={t('Tác vụ')}
                  fullWidthOnMobile={true}
                  actions={[
                    {
                      key: 'toggle-filters',
                      label: showMobileFilters ? t('Ẩn bộ lọc') : t('Bộ lọc'),
                      icon: <Filter size={14} />,
                      primary: true,
                      onClick: () => setShowMobileFilters(!showMobileFilters),
                    },
                    ...(canExportData ? [{
                      key: 'export-csv',
                      label: isExportingCSV ? t('Đang xuất...') : t('Xuất CSV'),
                      icon: isExportingCSV ? <RefreshCw size={14} className="spin" /> : <Download size={14} />,
                      disabled: isExportingCSV,
                      onClick: handleExportCSV,
                    }] : []),
                    {
                      key: 'view-list',
                      label: t('Chế độ Danh sách'),
                      icon: <LayoutList size={14} />,
                      onClick: () => {
                        setLocalViewMode('list');
                        updateParams('view', 'list');
                      },
                    },
                    {
                      key: 'view-calendar',
                      label: t('Chế độ Lịch biểu'),
                      icon: <Calendar size={14} />,
                      onClick: () => {
                        setLocalViewMode('calendar');
                        updateParams('view', 'calendar');
                      },
                    },
                    ...(canAccessDatabank ? [{
                      key: 'view-databank',
                      label: t('Kho chung'),
                      icon: <Database size={14} />,
                      onClick: () => {
                        setLocalViewMode('databank');
                        updateParams('view', 'databank');
                      },
                    }] : []),
                  ]}
                />
              ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <DomSegmentedSwitch
                  size="sm"
                  ariaLabel={t('Chế độ xem Data')}
                  value={viewMode}
                  onChange={(val) => {
                    setLocalViewMode(val as any);
                    updateParams('view', val);
                  }}
                  options={[
                    { value: 'list', label: t('Danh sách'), icon: <LayoutList size={13} /> },
                    { value: 'calendar', label: t('Lịch biểu'), icon: <Calendar size={13} /> },
                    ...(canAccessDatabank ? [{ value: 'databank', label: t('Kho chung'), icon: <Database size={13} /> }] : []),
                  ]}
                />

                {/* Compact Export CSV Button */}
                {canExportData && (
                  <DomToolbarButton
                    variant="outline"
                    onClick={handleExportCSV}
                    disabled={isExportingCSV}
                    loading={isExportingCSV}
                    icon={<Download size={13} />}
                    className="btn-export-csv-compact"
                  >
                    {isExportingCSV ? t('Đang xuất...') : `${t('Xuất')} CSV`}
                  </DomToolbarButton>
                )}

                {/* Compact Filter Toggle Button (Mobile only) */}
                <button
                  type="button"
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 8px',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border)',
                    background: showMobileFilters ? 'var(--color-primary-light)' : 'var(--color-surface)',
                    color: showMobileFilters ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    height: '38px',
                    width: '38px'
                  }}
                  title={showMobileFilters ? t('Ẩn bộ lọc') : t('Hiện bộ lọc')}
                  className="mobile-only"
                >
                  <Filter size={13} style={{ color: showMobileFilters ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
                </button>
              </div>
              )
            ) : (
              /* For Sale / Viewer: Filter toggle on mobile, and Databank switch when permitted */
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {canAccessDatabank && !isMobile && (
                  <DomSegmentedSwitch
                    size="sm"
                    ariaLabel={t('Chế độ xem Data')}
                    value={viewMode}
                    onChange={(val) => {
                      setLocalViewMode(val as any);
                      updateParams('view', val);
                    }}
                    options={[
                      { value: 'list', label: t('Danh sách'), icon: <LayoutList size={13} /> },
                      { value: 'databank', label: t('Kho chung'), icon: <Database size={13} /> },
                    ]}
                  />
                )}
                <div className="mobile-only" style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '3px 4px',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                  height: '38px'
                }}>
                  <button
                    type="button"
                    onClick={() => setShowMobileFilters(!showMobileFilters)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 8px',
                      borderRadius: '6px',
                      border: 'none',
                      background: showMobileFilters ? 'var(--color-primary-light)' : 'transparent',
                      color: showMobileFilters ? 'var(--color-primary)' : 'var(--color-text-muted)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      height: '28px',
                      width: '32px'
                    }}
                  >
                    <Filter size={13} style={{ color: showMobileFilters ? 'var(--color-primary)' : 'var(--color-text-muted)' }} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filters */}
      <div
        className={`responsive-filter-row ${!showMobileFilters ? 'filter-hide-on-mobile' : ''}`}
        style={{
          position: 'relative',
          zIndex: 100,
          display: (viewMode === 'calendar') ? 'none' : 'flex',
          gap: '0.75rem',
          marginBottom: '1.25rem',
          flexShrink: 0,
          flexWrap: 'wrap',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-light)',
          borderRadius: '12px',
          padding: '0.75rem 1rem',
          alignItems: 'center',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)'
        }}
      >
        <div className="responsive-filter-item" style={{ position: 'relative', width: 240 }}>
          <input
            className="form-input"
            placeholder={t("Tìm theo tên, SĐT, email...")}
            style={{ paddingLeft: 12, paddingRight: searchInput ? 32 : 12, width: '100%', height: 36, fontSize: '0.875rem', borderRadius: 10 }}
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                updateParams('search', '');
              }}
              title={t('Xóa tìm kiếm')}
              style={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {viewMode === 'databank' && isSysAdmin && (
          <div className="responsive-filter-item">
            <DomSegmentedSwitch
              size="sm"
              ariaLabel={t('Hiển thị dữ liệu Databank')}
              value={showDeletedFilter}
              onChange={(val) => {
                setShowDeletedFilter(val as any);
                setPublicPage(1);
              }}
              options={[
                { value: 'none', label: t('Đang hiển thị') },
                { value: 'only', label: t('Đã ẩn') },
                { value: 'all', label: t('Tất cả') },
              ]}
            />
          </div>
        )}

        {viewMode !== 'databank' && (
          <>
            <div className="responsive-filter-item">
              <CustomSelect
                size="sm"
                options={[
                  { value: 'all', label: t('Tất cả thời gian'), icon: <Clock size={16} /> },
                  { value: 'Hôm nay', label: t('Hôm nay') },
                  { value: 'Hôm qua', label: t('Hôm qua') },
                  { value: 'Tuần này', label: t('Tuần này') },
                  { value: 'Tuần trước', label: t('Tuần trước') },
                  { value: 'Tuần trước nữa', label: t('Tuần trước nữa') },
                  { value: '7 ngày qua', label: t('7 ngày qua') },
                  { value: '30 ngày qua', label: t('30 ngày qua') },
                  { value: 'Tháng này', label: t('Tháng này') },
                  { value: 'Tháng trước', label: t('Tháng trước') },
                  { value: 'Quý này', label: t('Quý này') },
                  { value: 'Năm nay', label: t('Năm nay') },
                  ...(!['all', 'Hôm nay', 'Hôm qua', 'Tuần này', 'Tuần trước', 'Tuần trước nữa', '7 ngày qua', '30 ngày qua', 'Tháng này', 'Tháng trước', 'Quý này', 'Năm nay', 'Tùy chỉnh'].includes(dateFilter)
                    ? [{ value: dateFilter, label: getDisplayDateFilterText(dateFilter) }]
                    : []),
                  { value: 'Tùy chỉnh', label: t('Tùy chỉnh...') }
                ]}
                value={dateFilter}
                onChange={val => handleUpdateDateFilter(val.toString())}
                width={160}
              />
            </div>

            <div className="responsive-filter-item">
              <CustomSelect
                size="sm"
                options={[
                  { value: 'all', label: t('Tất cả trạng thái'), icon: <Filter size={16} /> },
                  { value: 'distributed_valid', label: t('Chia thành công (Chuẩn)') },
                  { value: 'not_contacted', label: t('Chưa liên hệ') },
                  { value: 'assigned', label: t('Đã chia') },
                  { value: 'compensation', label: t('Đã bù') },
                  { value: 'reallocated', label: t('Phân bổ lại') },
                  { value: 'reminder', label: t('Nhắc lại') },
                  { value: 'pending_work_hours', label: t('Chờ giờ làm') },
                  { value: 'databank_claim', label: 'Databank Claim' },
                  { value: 'pending', label: t('Chờ chia') },
                  { value: 'silent', label: t('Chỉ đồng bộ') },
                  { value: 'error', label: t('Ticket') },
                  { value: 'blacklisted', label: t('Blacklist') },
                  { value: 'pending_approval', label: t('Tạm giữ') },
                  { value: 'rejected', label: t('Dưới chuẩn') }
                ]}
                value={statusFilter ? statusFilter.split(',').filter(Boolean) : ['all']}
                onChange={val => {
                  const arr = ensureArray(val).map(String).filter(Boolean);
                  let nextVal = 'all';
                  if (arr.length > 0) {
                    if (arr[arr.length - 1] === 'all') {
                      nextVal = 'all';
                    } else {
                      nextVal = arr.filter(v => v !== 'all').join(',') || 'all';
                    }
                  }
                  updateParams('status', nextVal);
                }}
                multiple={true}
                width={170}
              />
            </div>

            <div className="responsive-filter-item">
              <CustomSelect
                size="sm"
                options={[
                  { value: 'all', label: t('Tất cả vòng'), icon: <Tag size={16} /> },
                  ...ensureArray(rounds).map(r => ({
                    value: r.round_name,
                    label: r.round_name
                  }))
                ]}
                value={roundFilter}
                onChange={val => updateParams('round', val.toString())}
                searchable={true}
                width={160}
              />
            </div>

            {!isSaleUser && !isAccountantUser && (
              <div className="responsive-filter-item">
                <CustomSelect
                  size="sm"
                  options={[
                    { value: 'all', label: t('Tất cả TVV'), icon: <User size={16} /> },
                    ...ensureArray(consultants).map(c => ({
                      value: c.name,
                      label: c.name,
                      avatar: c.avatar || undefined
                    }))
                  ]}
                  value={consultantFilter}
                  onChange={val => updateParams('consultant', val.toString())}
                  showAvatars={true}
                  searchable={true}
                  width={180}
                />
              </div>
            )}
          </>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
          {t('Tổng cộng')}: <strong style={{ color: 'var(--color-text)', marginLeft: 4 }}>{viewMode === 'databank' ? publicTotalCount : totalCount}</strong> {t('data')}
        </div>
      </div>

      {/* Table */}
      {viewMode === 'calendar' ? (
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }} className="fade-in-view">
          {/* Calendar Header / Control */}
          <div className="mobile-stack" style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.75rem 1rem',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '12px',
            marginBottom: '1rem',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
            flexShrink: 0,
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', background: 'var(--color-bg)', borderRadius: '8px', border: '1px solid var(--color-border)', padding: '2px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={prevMonth}
                  style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }}
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ padding: '0 1rem', display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-text)', textTransform: 'capitalize', minWidth: 140, justifyContent: 'center' }}>
                  {monthName} {year}
                </span>
                <button
                  type="button"
                  className="btn-icon"
                  onClick={nextMonth}
                  style={{ width: 34, height: 34, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text)' }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <button
                type="button"
                className="btn outline"
                onClick={() => setCurrentDate(new Date())}
                style={{ height: 36, padding: '0 0.85rem', fontSize: '0.8rem', fontWeight: 600 }}
              >
                {t('Hôm nay')}
              </button>

              {canViewFinanceCalendar && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => setPendingOnly(!pendingOnly)}
                  style={{
                    height: 36,
                    padding: '0 0.85rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: pendingOnly ? '#BD1D2D' : 'transparent',
                    borderColor: pendingOnly ? '#BD1D2D' : 'var(--color-border)',
                    color: pendingOnly ? 'white' : 'var(--color-text)'
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: pendingOnly ? '#fff' : 'var(--color-warning)', display: 'inline-block' }} />
                  {t('Chỉ hiện chờ thanh toán')}
                </button>
              )}

              {!isSaleUser && !isAccountantUser && (
                <CustomSelect
                  size="sm"
                  options={[
                    { value: 'all', label: t('Tất cả TVV'), icon: <User size={16} /> },
                    ...ensureArray(consultants).map(c => ({
                      value: c.name,
                      label: c.name,
                      avatar: c.avatar || undefined
                    }))
                  ]}
                  value={consultantFilter}
                  onChange={val => updateParams('consultant', val.toString())}
                  showAvatars={true}
                  searchable={true}
                  width={180}
                />
              )}
            </div>

            {/* Calendar Legend */}
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.75rem', fontWeight: 600 }}>
              {(viewMode === 'calendar' && canViewFinanceCalendar) ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#C6333D' }}></span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('Sales Order (SO)')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#334155' }}></span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('Purchase Order (PO)')}</span>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)' }}></span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('Đã chia')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-danger)' }}></span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('Blacklist')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#BD1D2D' }}></span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('Ticket lỗi')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-warning)' }}></span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('Nhắc lại')}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#334155' }}></span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{t('Ticket khác')}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Finance Statistics Cards (Accountant / Exec) — Chương V Standardized */}
          {canViewFinanceCalendar && financeSummary && (
            <DataListFinanceKpiStrip
              financeSummary={financeSummary}
              formatMoney={formatMoney}
              t={t}
            />
          )}

          {/* Calendar Body */}
          <div className="responsive-table-wrap" style={{ display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: 0, minWidth: 700, overflow: 'visible' }}>
              {/* Calendar Grid Header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                background: 'var(--color-border-light)',
                borderBottom: '1px solid var(--color-border)',
                padding: '8px 0',
                flexShrink: 0
              }}>
                {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'].map(wd => (
                  <div key={wd} style={{ padding: '4px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 800, color: wd === 'CN' ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>
                    <span className="hide-on-mobile">{t(wd)}</span>
                    <span className="mobile-only">{wd === 'CN' ? t('CN') : t(wd.replace('Thứ ', 'T'))}</span>
                  </div>
                ))}
              </div>

              {/* Calendar Days */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                gridAutoRows: 'minmax(110px, 1fr)',
                overflowY: 'visible'
              }}>
                {calendarLoading ? (
                  <div style={{ gridColumn: 'span 7' }}>
                    <CalendarSkeleton />
                  </div>
                ) : days}
              </div>
            </div>
          </div>
        </div>
      ) : viewMode === 'databank' ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }} className="fade-in-view">
          <div className="card" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: 0 }}>
            <div ref={databankScrollRef} style={{ flex: 1, overflow: 'auto' }} className="table-wrap custom-scrollbar">
              {publicLoading ? (
                <div style={{ padding: '2rem' }}>
                  <TableSkeleton />
                </div>
              ) : publicLeads.length === 0 ? (
                <div style={{ padding: '3rem 1rem' }}>
                  <EmptyCard
                    icon={<Database size={32} color="var(--color-text-muted)" />}
                    title={t('Kho chung trống')}
                    description={t('Không có dữ liệu trong Kho chung (Databank)')}
                  />
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700 }}>{t('Khách hàng')}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700 }}>{t('Liên hệ')}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700 }}>{t('Nguồn')}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700 }}>{t('Người nhận')}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700 }}>{t('Giải phóng lúc')}</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700 }}>
                        {isAdmin ? t('Lượt nhận') : t('Hành động')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {databankPadTop > 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={6} style={{ height: databankPadTop, padding: 0, border: 'none' }} />
                      </tr>
                    )}
                    {visiblePublicLeads.map((lead: any) => {
                      const safeTakers = ensureArray(lead.takers);
                      const hasClaimed = isUserInTakers(safeTakers);
                      const isFull = safeTakers.length >= maxParallelClaims;
                      const isDeleted = Number(lead.deleted_from_databank) === 1;
                      const personId = Number(lead.person_id || lead.id);
                      const canOpenLead = isAdmin || (isSaleUser && Number(lead.is_won) !== 1 && !isDeleted && !hasClaimed && !isFull);

                      return (
                        <tr
                          key={lead.id}
                          style={{
                            borderBottom: '1px solid var(--color-border)',
                            transition: 'background-color 0.2s',
                            opacity: isDeleted ? 0.65 : 1,
                            cursor: canOpenLead ? 'pointer' : 'default'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-bg)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const canSeeFull = checkCanSeeLeadFullInfo({ ...lead, takers: safeTakers });
                            const rawPhone = lead.phone && lead.phone !== '-' && !String(lead.phone).includes('*') && canSeeFull ? lead.phone : '';
                            const rawEmail = lead.email && lead.email !== '-' && !String(lead.email).includes('*') && canSeeFull ? lead.email : '';
                            setContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              item: {
                                ...lead,
                                id: lead.id,
                                person_id: personId,
                                name: lead.full_name || lead.name || t('Khách hàng'),
                                phone: rawPhone,
                                email: rawEmail,
                                status: Number(lead.is_won) === 1 ? 'won' : 'databank',
                                takers: safeTakers,
                                _isDatabank: true
                              }
                            });
                          }}
                          onClick={() => {
                            if (isAdmin) {
                              setSelectedLead({
                                id: lead.id,
                                person_id: personId,
                                name: lead.full_name || lead.name || '',
                                phone: lead.phone || '',
                                email: lead.email || '',
                                source: lead.original_source || 'Databank',
                                status: 'databank',
                                assigned_to_name: t('Chưa ai nhận'),
                                round_name: t('Kho chung'),
                                created_at: lead.released_to_kho_at || '',
                                note: '',
                                type: '-',
                                is_public: 1,
                                is_won: lead.is_won,
                                deleted_from_databank: lead.deleted_from_databank,
                                takers: safeTakers
                              });
                            } else if (isSaleUser && Number(lead.is_won) !== 1 && !isDeleted && !hasClaimed && !isFull) {
                              handleClaimLead(personId, lead.full_name || lead.name || t('Khách hàng'));
                            }
                          }}
                        >
                          <td style={{ padding: '12px 16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Avatar name={lead.full_name || lead.name || t('Khách hàng')} size={32} />
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.875rem' }}>{lead.full_name || lead.name || t('Khách hàng')}</span>
                                {isDeleted && (
                                  <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    padding: '1px 6px',
                                    borderRadius: '6px',
                                    background: 'var(--color-danger-light)',
                                    color: 'var(--color-danger)'
                                  }}>
                                    {t('Đã ẩn')}
                                  </span>
                                )}
                                {(lead.is_referral || lead.referrer_name || lead.partner_id || lead.original_source === 'ref' || lead.original_source === 'referral' || lead.source === 'ref' || lead.source === 'referral' || lead.source === 'gioi_thieu') && (() => {
                                  const refName = lead.referrer_name || lead.partner_name || '';
                                  const refColor = refName ? getColorFromName(refName) : '#0284c7';
                                  return (
                                    <span title={refName ? `Khách hàng giới thiệu bởi: ${refName}` : 'Khách hàng giới thiệu (Ref)'} style={{ display: 'inline-flex', color: refColor }}>
                                      <UserPlus size={13} />
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {(() => {
                              const isRef = Boolean(lead.is_referral || lead.referrer_name || lead.partner_id || lead.original_source === 'ref' || lead.original_source === 'referral' || lead.source === 'ref' || lead.source === 'referral' || lead.source === 'gioi_thieu');
                              const hasPhone = Boolean(lead.phone && lead.phone !== '-');
                              const hasEmail = Boolean(lead.email && lead.email !== '-');
                              const refName = lead.referrer_name || lead.partner_name || '';
                              const refAvatar = lead.referrer_avatar || lead.partner_avatar || '';
                              const showFull = checkCanSeeLeadFullInfo({ ...lead, takers: safeTakers });
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                  {hasPhone && (
                                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                      {showFull ? lead.phone : maskPhone(lead.phone)}
                                    </div>
                                  )}
                                  {hasEmail && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: hasPhone ? 2 : 0 }}>
                                      {showFull ? lead.email : maskEmail(lead.email)}
                                    </div>
                                  )}
                                  {isRef && (() => {
                                    const refColor = refName ? getColorFromName(refName) : '#0284c7';
                                    return (
                                      <div
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          background: `${refColor}12`,
                                          border: `1px solid ${refColor}33`,
                                          borderRadius: '12px',
                                          padding: '1px 6px 1px 2px',
                                          fontSize: '0.72rem',
                                          maxWidth: '100%',
                                          overflow: 'hidden',
                                          marginTop: (hasPhone || hasEmail) ? '3px' : 0,
                                          width: 'fit-content',
                                          boxSizing: 'border-box'
                                        }}
                                        title={refName ? `Được giới thiệu bởi: ${refName}` : 'Khách hàng có nguồn giới thiệu (Ref)'}
                                      >
                                        {refName ? (
                                          <>
                                            <Avatar name={refName} src={refAvatar || undefined} size={16} />
                                            <span style={{
                                              fontSize: '0.6rem',
                                              fontWeight: 700,
                                              color: refColor,
                                              opacity: 0.85,
                                              transform: 'scale(0.82)',
                                              transformOrigin: 'left center',
                                              display: 'inline-block',
                                              flexShrink: 0,
                                              lineHeight: 1,
                                              marginRight: '-2px'
                                            }}>
                                              REF:
                                            </span>
                                            <span style={{
                                              fontSize: '0.72rem',
                                              fontWeight: 550,
                                              color: 'var(--color-text)',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis',
                                              whiteSpace: 'nowrap',
                                              lineHeight: 1.2
                                            }}>
                                              {refName}
                                            </span>
                                          </>
                                        ) : (
                                          <>
                                            <UserPlus size={11} style={{ color: refColor, flexShrink: 0, marginLeft: '2px' }} />
                                            <span style={{
                                              fontSize: '0.6rem',
                                              fontWeight: 700,
                                              color: refColor,
                                              opacity: 0.85,
                                              transform: 'scale(0.82)',
                                              transformOrigin: 'left center',
                                              display: 'inline-block',
                                              lineHeight: 1
                                            }}>
                                              REF
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {!hasPhone && !hasEmail && !isRef && (
                                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>-</span>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span className="badge" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '0.75rem', padding: '2px 8px', borderRadius: '12px' }}>
                              {lead.original_source || 'Databank'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            {(() => {
                              const displayTakers = filterVisibleTakers(safeTakers);
                              if (displayTakers.length > 0) {
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {displayTakers.map((tk: any) => (
                                      <Avatar
                                        key={tk.id}
                                        name={tk.name || t('TVV')}
                                        src={tk.avatar || undefined}
                                        size={26}
                                        title={tk.claimed_at ? `${tk.name} (${tk.claimed_at})` : tk.name}
                                        style={{ border: '2px solid var(--color-surface)', cursor: 'help' }}
                                      />
                                    ))}
                                  </div>
                                );
                              }
                              return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{t('Chưa ai nhận')}</span>;
                            })()}
                          </td>

                          <td style={{ padding: '12px 16px', color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>{lead.released_to_kho_at || '-'}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                              {Number(lead.is_won) === 1 ? (
                                <span
                                  className="badge"
                                  style={{
                                    background: theme === 'dark' ? 'rgba(189, 29, 45, 0.16)' : 'rgba(189, 29, 45, 0.08)',
                                    color: theme === 'dark' ? '#fb7185' : '#BD1D2D',
                                    border: theme === 'dark' ? '1px solid rgba(189, 29, 45, 0.3)' : '1px solid rgba(189, 29, 45, 0.2)',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    padding: '4px 10px',
                                    borderRadius: '20px'
                                  }}
                                >
                                  {t('Đặt cọc')}
                                </span>
                              ) : isAdmin ? (
                                <span
                                  className="badge"
                                  style={{
                                    background: safeTakers.length === 0 ? 'rgba(16,185,129,0.1)' : (safeTakers.length < maxParallelClaims ? (theme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : '#f1f5f9') : 'rgba(156,163,175,0.1)'),
                                    color: safeTakers.length === 0 ? '#10b981' : (safeTakers.length < maxParallelClaims ? (theme === 'dark' ? '#cbd5e1' : '#334155') : '#9ca3af'),
                                    border: safeTakers.length === 0 ? '1px solid rgba(16,185,129,0.2)' : (safeTakers.length < maxParallelClaims ? '1px solid var(--color-border)' : '1px solid rgba(156,163,175,0.2)'),
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    padding: '4px 10px',
                                    borderRadius: '20px'
                                  }}
                                >
                                  {Math.max(0, maxParallelClaims - safeTakers.length)} / {maxParallelClaims}
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleClaimLead(personId, lead.full_name || lead.name || t('Khách hàng'))}
                                  disabled={!isSaleUser || isDeleted || isClaimingLeadId !== null || hasClaimed || isFull}
                                  style={{
                                    background: hasClaimed ? 'rgba(16,185,129,0.12)' : ((isFull || !isSaleUser || isDeleted) ? 'transparent' : '#BD1D2D'),
                                    border: hasClaimed ? '1px solid rgba(16,185,129,0.2)' : ((isFull || !isSaleUser || isDeleted) ? '1px solid var(--color-border)' : 'none'),
                                    color: hasClaimed ? '#10b981' : ((isFull || !isSaleUser || isDeleted) ? 'var(--color-text-muted)' : '#ffffff'),
                                    padding: '6px 16px',
                                    borderRadius: '8px',
                                    fontSize: '0.8125rem',
                                    fontWeight: 600,
                                    cursor: (hasClaimed || isFull || !isSaleUser || isDeleted) ? 'default' : 'pointer',
                                    transition: 'background-color 0.18s ease, opacity 0.18s ease'
                                  }}
                                >
                                  {isClaimingLeadId === personId ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                                      <RefreshCw size={13} className="spin" />
                                      {t('Đang nhận...')}
                                    </span>
                                  ) : (hasClaimed ? t('Đã nhận') : (isFull ? t('Hết lượt') : t('Nhận Data')))}
                                </button>
                              )}
                              {isSysAdmin && (
                                isDeleted ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRestorePublicLeads([personId])}
                                    title={t('Khôi phục vào kho')}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 4,
                                      padding: '4px 8px',
                                      borderRadius: '6px',
                                      border: '1px solid rgba(16, 185, 129, 0.3)',
                                      background: 'rgba(16, 185, 129, 0.08)',
                                      color: 'var(--color-success)',
                                      fontSize: '0.75rem',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <RotateCcw size={13} />
                                    {t('Khôi phục')}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePublicLeads([personId])}
                                    title={t('Ẩn khỏi kho chung')}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      width: 28,
                                      height: 28,
                                      borderRadius: '6px',
                                      border: '1px solid var(--color-border)',
                                      background: 'transparent',
                                      color: 'var(--color-text-muted)',
                                      cursor: 'pointer'
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {databankPadBottom > 0 && (
                      <tr aria-hidden="true">
                        <td colSpan={6} style={{ height: databankPadBottom, padding: 0, border: 'none' }} />
                      </tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination for Databank */}
            {publicTotalCount > ITEMS_PER_PAGE && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                  {t('Hiển thị')} <strong>{Math.min(publicTotalCount, (publicPage - 1) * ITEMS_PER_PAGE + 1)}</strong> - <strong>{Math.min(publicTotalCount, publicPage * ITEMS_PER_PAGE)}</strong> {t('trên')} <strong>{publicTotalCount}</strong>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={publicPage <= 1}
                    onClick={() => setPublicPage(prev => Math.max(1, prev - 1))}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: publicPage <= 1 ? 'not-allowed' : 'pointer',
                      color: 'var(--color-text)'
                    }}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    disabled={publicPage * ITEMS_PER_PAGE >= publicTotalCount}
                    onClick={() => setPublicPage(prev => prev + 1)}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--color-border)',
                      borderRadius: '6px',
                      width: '32px',
                      height: '32px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: publicPage * ITEMS_PER_PAGE >= publicTotalCount ? 'not-allowed' : 'pointer',
                      color: 'var(--color-text)'
                    }}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="card fade-in-view mobile-flat-container" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div ref={logsScrollRef} style={{ flex: 1, overflow: isMobile ? 'visible' : 'auto' }} className="table-wrap custom-scrollbar">
            {isMobile ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0 5rem 0' }}>
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <div key={`skel-${i}`} style={{ padding: '1rem', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border-light)', animation: 'pulse 1.5s infinite', opacity: 0.5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-border)' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ width: 100, height: 14, background: 'var(--color-border)', borderRadius: 4, marginBottom: 6 }} />
                          <div style={{ width: 70, height: 10, background: 'var(--color-border-light)', borderRadius: 4 }} />
                        </div>
                      </div>
                      <div style={{ width: '100%', height: 1, background: 'var(--color-border-light)', margin: '8px 0' }} />
                      <div style={{ width: 150, height: 12, background: 'var(--color-border-light)', borderRadius: 4 }} />
                    </div>
                  ))
                ) : paginatedLeads.length > 0 ? (
                  paginatedLeads.map(lead => (
                    <div
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      style={{
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        borderRadius: '12px',
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border-light)',
                        cursor: 'pointer',
                        transition: 'transform 0.2s, box-shadow 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.01)'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.04)';
                        e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.01)';
                        e.currentTarget.style.borderColor = 'var(--color-border-light)';
                      }}
                    >
                      {/* Top Row: Avatar + Name + Status Badges */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                          <Avatar name={lead.name} size={32} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--color-text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                              {lead.name}
                            </div>
                          </div>
                        </div>

                        {/* Status badge */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          {getStatusBadge((lead.is_public === 1 || Number(lead.is_public) === 1 || lead.status === 'released_to_kho' || lead.status === 'databank_claim') ? 'databank' : lead.status, lead.report_status, lead.ai_screener_status, lead.created_at, lead.takers, (lead as any).message)}
                          {lead.status !== 'assigned' && lead.report_status === 'pending' && (
                            <span style={{ padding: '2px 6px', borderRadius: 4, fontSize: '0.65rem', fontWeight: 700, background: theme === 'dark' ? 'rgba(245, 158, 11, 0.14)' : '#fffbeb', color: 'var(--color-warning)', border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.28)' : '1px solid #fde68a' }}>
                              {t('Chờ duyệt')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Middle row: Source & Received Time */}
                      <div style={{
                        borderTop: '1px dotted var(--color-border-light)',
                        paddingTop: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--color-text-muted)'
                      }}>
                        <div>
                          <span style={{ fontWeight: 600, color: 'var(--color-text-light)' }}>{t('Nguồn')}: </span>
                          <span>{lead.source || 'N/A'}</span>
                          {lead.type && lead.type !== '-' && <span style={{ color: '#94a3b8' }}> ({lead.type})</span>}
                        </div>
                        <div style={{ textAlign: 'right', color: '#64748b', fontSize: '0.65rem' }}>
                          {lead.created_at}
                        </div>
                      </div>

                      {/* Bottom row: Phân bổ cho */}
                      <div style={{
                        borderTop: '1px solid var(--color-border-light)',
                        paddingTop: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.75rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ color: 'var(--color-text-muted)' }}>{t('Giao cho')}:</span>
                          {lead.status === 'pending_approval' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Avatar src="/imgs/warn_icon.png" name="IDEAS AI - Screener" size={20} />
                              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>IDEAS AI - Screener</span>
                            </div>
                          ) : lead.status === 'fallback' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Avatar src="/LOGO.jpg" name="IDEAS AI" size={20} />
                              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>IDEAS AI</span>
                            </div>
                          ) : lead.status === 'rejected' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Avatar src="/LOGO.jpg" name="IDEAS AI - Evaluator" size={20} />
                              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>IDEAS AI - Evaluator</span>
                            </div>
                          ) : lead.status === 'blacklisted' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Avatar src="/imgs/angry_icon.jpg" name="IDEAS AI - Angry" size={20} />
                              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>IDEAS AI - Angry</span>
                            </div>
                          ) : (lead.is_public === 1 || Number(lead.is_public) === 1 || lead.status === 'released_to_kho' || lead.status === 'databank_claim' || lead.status === 'databank') ? (
                            (() => {
                              const displayTakers = filterVisibleTakers(lead.takers);
                              if (displayTakers.length > 0) {
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    {displayTakers.map((tk: any) => (
                                      <Avatar key={tk.id} src={tk.avatar || undefined} name={tk.name || t('TVV')} size={20} />
                                    ))}
                                  </div>
                                );
                              } else {
                                return <span style={{ color: 'var(--color-text-muted)' }}>{t('Chưa ai nhận')}</span>;
                              }
                            })()
                          ) : (lead.assigned_to_name !== '-' && lead.status !== 'pending_work_hours') ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Avatar src={lead.assigned_to_avatar || undefined} name={lead.assigned_to_name} size={20} aiScreened={!!(lead.ai_screener_status && lead.ai_screener_status !== 'not_screened')} />
                              <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{lead.assigned_to_name}</span>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <Avatar src="/LOGO.jpg" name="IDEAS Bot" size={20} />
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                                <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.75rem', lineHeight: '1rem' }}>IDEAS Bot</span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', lineHeight: '0.8rem' }}>{getPendingUntilTime()}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {lead.round_name && lead.round_name !== '-' && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: theme === 'dark' ? 'rgba(189, 29, 45, 0.16)' : 'rgba(189, 29, 45, 0.08)',
                            color: theme === 'dark' ? '#fb7185' : '#BD1D2D',
                            fontSize: '0.65rem',
                            fontWeight: 700
                          }}>
                            {lead.round_name}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyCard
                    icon={<Database size={48} />}
                    title={t("Không tìm thấy dữ liệu phù hợp")}
                    description={t("Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm để xem kết quả.")}
                  />
                )}
              </div>
            ) : (
              <table style={{ width: '100%', minWidth: 1000, borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 20, background: 'var(--color-bg)' }}>
                  <tr>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--color-border)' }}>{t('Khách hàng')}</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--color-border)' }}>{t('Liên hệ')}</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--color-border)' }}>{t('Trạng thái')}</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>{t('Phân bổ cho')}</th>
                    <th style={{ padding: '1rem', textAlign: 'left', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-light)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--color-border)' }}>{t('Thời gian nhận')}</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? [...Array(8)].map((_, i) => (
                    <tr key={`skel-${i}`}>
                      <td style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-light)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--skeleton-base)', animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                          <div>
                            <div style={{ width: 120, height: 16, background: 'var(--skeleton-base)', borderRadius: 4, marginBottom: 8, animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                            <div style={{ width: 80, height: 12, background: 'var(--skeleton-shine)', borderRadius: 4, animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-light)' }}>
                        <div style={{ width: 100, height: 16, background: 'var(--skeleton-base)', borderRadius: 4, marginBottom: 8, animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                        <div style={{ width: 140, height: 12, background: 'var(--skeleton-shine)', borderRadius: 4, animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                      </td>
                      <td style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-light)' }}>
                        <div style={{ width: 80, height: 24, background: 'var(--skeleton-base)', borderRadius: 12, animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                      </td>
                      <td style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-light)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--skeleton-base)', animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                          <div style={{ width: 90, height: 14, background: 'var(--skeleton-base)', borderRadius: 4, animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                        </div>
                      </td>
                      <td style={{ padding: '1rem', borderBottom: '1px solid var(--color-border-light)' }}>
                        <div style={{ width: 110, height: 14, background: 'var(--skeleton-base)', borderRadius: 4, animation: 'pulse 1.5s infinite', opacity: 0.5 }} />
                      </td>
                    </tr>
                  )) : visiblePaginatedLeads.length > 0 ? (
                    <>
                      {logsPadTop > 0 && (
                        <tr aria-hidden="true">
                          <td colSpan={5} style={{ height: logsPadTop, padding: 0, border: 'none' }} />
                        </tr>
                      )}
                      {visiblePaginatedLeads.map(lead => {
                        return (
                      <tr
                        key={lead.id}
                        className="lead-row"
                        onClick={() => setSelectedLead(lead)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const canSeeFull = checkCanSeeLeadFullInfo(lead);
                          const rawPhone = lead.phone && lead.phone !== '-' && !String(lead.phone).includes('*') && canSeeFull ? lead.phone : '';
                          const rawEmail = lead.email && lead.email !== '-' && !String(lead.email).includes('*') && canSeeFull ? lead.email : '';
                          setContextMenu({
                            x: e.clientX,
                            y: e.clientY,
                            item: {
                              ...lead,
                              phone: rawPhone,
                              email: rawEmail,
                              _isDatabank: false
                            }
                          });
                        }}
                        style={{ borderBottom: '1px solid var(--color-border)', transition: 'background 0.2s', cursor: 'pointer' }}
                      >
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <Avatar name={lead.name} size={32} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.875rem' }}>{lead.name}</span>
                              {Boolean((lead as any).is_referral || (lead as any).referrer_name || (lead as any).partner_id || (lead as any).original_source === 'ref' || (lead as any).original_source === 'referral' || lead.source === 'ref' || lead.source === 'referral' || lead.source === 'gioi_thieu') && (
                                <span title={(lead as any).referrer_name ? `Khách hàng giới thiệu bởi: ${(lead as any).referrer_name}` : 'Khách hàng giới thiệu (Ref)'} style={{ display: 'inline-flex', color: 'var(--color-primary, #BD1D2D)' }}>
                                  <UserPlus size={13} />
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '1rem' }}>
                          {(() => {
                            const leadAny = lead as any;
                            const isRef = Boolean(leadAny.is_referral || leadAny.referrer_name || leadAny.partner_id || leadAny.original_source === 'ref' || leadAny.original_source === 'referral' || lead.source === 'ref' || lead.source === 'referral' || lead.source === 'gioi_thieu');
                            const hasPhone = Boolean(lead.phone && lead.phone !== '-');
                            const hasEmail = Boolean(lead.email && lead.email !== '-');
                            const refName = leadAny.referrer_name || leadAny.partner_name || '';
                            const refAvatar = leadAny.referrer_avatar || leadAny.partner_avatar || '';
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                {hasPhone && (
                                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                    {maskPhone(lead.phone)}
                                  </div>
                                )}
                                {hasEmail && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: hasPhone ? 2 : 0 }}>{maskEmail(lead.email)}</div>
                                )}
                                {isRef && (() => {
                                  const refColor = refName ? getColorFromName(refName) : '#0284c7';
                                  return (
                                    <div 
                                      style={{ 
                                        display: 'inline-flex', 
                                        alignItems: 'center', 
                                        gap: '4px', 
                                        background: `${refColor}12`, 
                                        border: `1px solid ${refColor}33`, 
                                        borderRadius: '12px', 
                                        padding: '1px 6px 1px 2px', 
                                        fontSize: '0.72rem', 
                                        maxWidth: '100%', 
                                        overflow: 'hidden',
                                        marginTop: (hasPhone || hasEmail) ? '3px' : 0,
                                        width: 'fit-content',
                                        boxSizing: 'border-box'
                                      }} 
                                      title={refName ? `Được giới thiệu bởi: ${refName}` : 'Khách hàng có nguồn giới thiệu (Ref)'}
                                    >
                                      {refName ? (
                                        <>
                                          <Avatar name={refName} src={refAvatar || undefined} size={16} />
                                          <span style={{ 
                                            fontSize: '0.6rem', 
                                            fontWeight: 700, 
                                            color: refColor, 
                                            opacity: 0.85, 
                                            transform: 'scale(0.82)', 
                                            transformOrigin: 'left center', 
                                            display: 'inline-block', 
                                            flexShrink: 0,
                                            lineHeight: 1,
                                            marginRight: '-2px'
                                          }}>
                                            REF:
                                          </span>
                                          <span style={{ 
                                            fontSize: '0.72rem', 
                                            fontWeight: 550, 
                                            color: 'var(--color-text)', 
                                            overflow: 'hidden', 
                                            textOverflow: 'ellipsis', 
                                            whiteSpace: 'nowrap',
                                            lineHeight: 1.2
                                          }}>
                                            {refName}
                                          </span>
                                        </>
                                      ) : (
                                        <>
                                          <UserPlus size={11} style={{ color: refColor, flexShrink: 0, marginLeft: '2px' }} />
                                          <span style={{ 
                                            fontSize: '0.6rem', 
                                            fontWeight: 700, 
                                            color: refColor, 
                                            opacity: 0.85, 
                                            transform: 'scale(0.82)', 
                                            transformOrigin: 'left center', 
                                            display: 'inline-block', 
                                            lineHeight: 1 
                                          }}>
                                            REF
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
                                {!hasPhone && !hasEmail && !isRef && (
                                  <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8125rem' }}>-</span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '1rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                            {getStatusBadge((lead.is_public === 1 || Number(lead.is_public) === 1 || lead.status === 'released_to_kho' || lead.status === 'databank_claim') ? 'databank' : lead.status, lead.report_status, lead.ai_screener_status, lead.created_at, lead.takers, (lead as any).message)}
                            {lead.status !== 'assigned' && lead.report_status === 'pending' && <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, background: theme === 'dark' ? 'rgba(245, 158, 11, 0.14)' : '#fffbeb', color: 'var(--color-warning)', border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.28)' : '1px solid #fde68a' }}>{t('Đang chờ duyệt')}</span>}
                            {Boolean((lead as any).message) && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  color: 'var(--color-text-muted)',
                                  maxWidth: 200,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}
                                title={(lead as any).message}
                              >
                                {(lead as any).message}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '1rem', whiteSpace: 'nowrap' }}>
                          {lead.status === 'pending_approval' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Avatar src="/imgs/warn_icon.png" name="IDEAS AI - Screener" size={32} />
                              <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>IDEAS AI - Screener</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{t('Chờ duyệt')}</div>
                              </div>
                            </div>
                          ) : lead.status === 'fallback' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Avatar src="/LOGO.jpg" name="IDEAS AI" size={32} />
                              <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>IDEAS AI</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{t('Fallback')}</div>
                              </div>
                            </div>
                          ) : lead.status === 'rejected' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Avatar src="/LOGO.jpg" name="IDEAS AI - Evaluator" size={32} />
                              <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>IDEAS AI - Evaluator</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{t('Failed')}</div>
                              </div>
                            </div>
                          ) : lead.status === 'blacklisted' ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Avatar src="/imgs/angry_icon.jpg" name="IDEAS AI - Angry" size={32} />
                              <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>IDEAS AI - Angry</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{t('Blacklist')}</div>
                              </div>
                            </div>
                          ) : (lead.is_public === 1 || Number(lead.is_public) === 1 || lead.status === 'released_to_kho' || lead.status === 'databank_claim' || lead.status === 'databank') ? (
                            (() => {
                              const displayTakers = filterVisibleTakers(lead.takers);
                              if (displayTakers.length > 0) {
                                if (displayTakers.length === 1) {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <Avatar name={displayTakers[0].name} src={displayTakers[0].avatar || undefined} size={28} title={`${displayTakers[0].name} (${t('Nhận lúc')}: ${displayTakers[0].claimed_at})`} />
                                      <span style={{ fontSize: '0.875rem', fontWeight: 550, color: 'var(--color-text)' }}>{displayTakers[0].name}</span>
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                      {displayTakers.map((tk: any) => (
                                        <Avatar 
                                          key={tk.id} 
                                          name={tk.name} 
                                          src={tk.avatar || undefined} 
                                          size={28} 
                                          title={`${tk.name} (${t('Nhận lúc')}: ${tk.claimed_at})`} 
                                          style={{ border: '2px solid var(--color-surface)', cursor: 'help' }}
                                        />
                                      ))}
                                    </div>
                                  );
                                }
                              } else {
                                return <span style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>{t('Chưa ai nhận')}</span>;
                              }
                            })()
                          ) : (lead.assigned_to_name !== '-' && lead.status !== 'pending_work_hours') ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Avatar src={lead.assigned_to_avatar || undefined} name={lead.assigned_to_name} size={32} aiScreened={!!(lead.ai_screener_status && lead.ai_screener_status !== 'not_screened')} />
                              <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{lead.assigned_to_name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                  {(lead.status === 'reminder' && (!lead.round_name || lead.round_name === '-')) ? 'Reminder' : lead.round_name}
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <Avatar src="/LOGO.jpg" name="IDEAS Bot" size={32} />
                              <div>
                                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>IDEAS Bot</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                  {getPendingUntilTime()}
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '1rem', fontSize: '0.8125rem', color: 'var(--color-text-light)' }}>{lead.created_at}</td>
                      </tr>
                    );
                  })}
                  {logsPadBottom > 0 && (
                    <tr aria-hidden="true">
                      <td colSpan={5} style={{ height: logsPadBottom, padding: 0, border: 'none' }} />
                    </tr>
                  )}
                </>
              ) : (
                    <tr>
                      <td colSpan={5} style={{ padding: '2.5rem 1rem' }}>
                        <EmptyCard
                          icon={<Database size={40} color="var(--color-text-muted)" />}
                          title={t('Không tìm thấy dữ liệu phù hợp.')}
                          description={t('Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm để xem kết quả.')}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
          {/* Pagination */}
          {totalPages > 0 && (
            <div className="responsive-pagination" style={{ padding: '1rem 1.25rem', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-surface)', flexShrink: 0 }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                {t('Hiển thị')} <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> - <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{Math.min(currentPage * ITEMS_PER_PAGE, totalCount)}</span> {t('trên')} <span style={{ fontWeight: 600, color: 'var(--color-text)' }}>{totalCount}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  onClick={() => updateParams('page', String(Math.max(currentPage - 1, 1)))}
                  disabled={currentPage === 1}
                  style={{ padding: '6px', borderRadius: 6, border: '1px solid var(--color-border)', background: currentPage === 1 ? 'var(--color-bg)' : 'var(--color-surface)', color: currentPage === 1 ? 'var(--color-text-muted)' : 'var(--color-text)', cursor: currentPage === 1 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronLeft size={16} />
                </button>
                <div style={{ display: 'flex', gap: 4 }}>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let startPage = 1;
                    if (totalPages > 5) {
                      if (currentPage > 3) {
                        startPage = currentPage - 2;
                        if (startPage + 4 > totalPages) {
                          startPage = totalPages - 4;
                        }
                      }
                    }
                    const pageNum = startPage + i;
                    return (
                      <button
                        key={pageNum}
                        onClick={() => updateParams('page', pageNum.toString())}
                        style={{
                          width: 32, height: 32, borderRadius: 6, fontSize: '0.8125rem', fontWeight: 600,
                          border: currentPage === pageNum ? 'none' : '1px solid var(--color-border)',
                          background: currentPage === pageNum ? 'var(--color-primary)' : 'var(--color-surface)',
                          color: currentPage === pageNum ? 'white' : 'var(--color-text)',
                          cursor: 'pointer'
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => updateParams('page', String(Math.min(currentPage + 1, totalPages)))}
                  disabled={currentPage === totalPages || totalPages === 0}
                  style={{ padding: '6px', borderRadius: 6, border: '1px solid var(--color-border)', background: currentPage === totalPages || totalPages === 0 ? 'var(--color-bg)' : 'var(--color-surface)', color: currentPage === totalPages || totalPages === 0 ? 'var(--color-text-muted)' : 'var(--color-text)', cursor: currentPage === totalPages || totalPages === 0 ? 'not-allowed' : 'pointer' }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedLead !== null && (
        <CustomModal
          isOpen={selectedLead !== null}
          onClose={() => {
            setSelectedLead(null);
            setReassignConsId('');
            clearOpenParams();
          }}
          title={t("Chi tiết Khách hàng")}
          width="1050px"
        >
        {selectedLead && (
          <div className="modal-body-padding">
            <div className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: '2rem', alignItems: 'start' }}>
              {/* Cột Trái: Chi Tiết */}
              <div className="sticky-column">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', width: '100%', flexWrap: 'wrap', gap: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <Avatar name={selectedLead.name} size={48} />
                    <div>
                      {isAdminEditingLead ? (
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder={t("Nhập tên khách hàng")}
                          style={{
                            fontSize: '1.25rem',
                            fontWeight: 800,
                            color: 'var(--color-text)',
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-primary-light)',
                            borderRadius: '10px',
                            padding: '8px 14px',
                            width: '240px',
                            outline: 'none',
                            transition: 'all 0.2s ease-in-out',
                            boxShadow: '0 0 0 3px rgba(163, 20, 34, 0.08)'
                          }}
                          onFocus={e => {
                            e.currentTarget.style.borderColor = 'var(--color-primary)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(163, 20, 34, 0.15)';
                          }}
                          onBlur={e => {
                            e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(163, 20, 34, 0.08)';
                          }}
                        />
                      ) : (
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>{selectedLead.name}</h2>
                      )}
                      <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: 4 }}>ID: #{selectedLead.id}</div>
                    </div>
                  </div>

                  <div className="detail-action-buttons">
                    {!isAdminEditingLead && (
                      <button
                        onClick={() => selectedLead && handleCopyFullInfo(selectedLead)}
                        title={t("Sao chép toàn bộ thông tin")}
                        className="detail-action-btn"
                        style={{
                          background: copiedType === 'full' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)',
                          border: copiedType === 'full' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(59, 130, 246, 0.2)',
                          color: copiedType === 'full' ? '#10b981' : '#3b82f6',
                          boxShadow: '0 2px 6px rgba(59, 130, 246, 0.05)'
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.background = copiedType === 'full' ? '#10b981' : '#3b82f6';
                          e.currentTarget.style.color = '#ffffff';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = copiedType === 'full' ? '0 6px 15px rgba(16, 185, 129, 0.2)' : '0 6px 15px rgba(59, 130, 246, 0.2)';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = copiedType === 'full' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(59, 130, 246, 0.08)';
                          e.currentTarget.style.color = copiedType === 'full' ? '#10b981' : '#3b82f6';
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 2px 6px rgba(59, 130, 246, 0.05)';
                        }}
                      >
                        {copiedType === 'full' ? <Check size={14} /> : <Copy size={14} />}
                        {copiedType === 'full' ? t('Đã chép') : t('Sao chép')}
                      </button>
                    )}
                    {canEditLeadFields && (
                      <>
                        {isAdminEditingLead ? (
                          <>
                            <button
                              onClick={handleSaveLeadFields}
                              disabled={isSavingLeadFields}
                              title={t("Lưu thay đổi")}
                              className="detail-action-btn"
                              style={{
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                border: 'none',
                                color: '#ffffff',
                                fontWeight: 700,
                                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                              }}
                              onMouseOver={e => {
                                e.currentTarget.style.transform = 'translateY(-2px)';
                                e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.35)';
                              }}
                              onMouseOut={e => {
                                e.currentTarget.style.transform = 'none';
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)';
                              }}
                            >
                              <Check size={14} />
                              {isSavingLeadFields ? t('Đang lưu...') : t('Lưu')}
                            </button>
                            <button
                              onClick={() => setIsAdminEditingLead(false)}
                              title={t("Hủy")}
                              className="detail-action-btn"
                              style={{
                                background: 'var(--color-surface)',
                                border: '1px solid var(--color-border)',
                                color: 'var(--color-text-muted)'
                              }}
                              onMouseOver={e => {
                                e.currentTarget.style.background = 'var(--color-border-light)';
                                e.currentTarget.style.color = 'var(--color-text)';
                                e.currentTarget.style.transform = 'translateY(-1px)';
                              }}
                              onMouseOut={e => {
                                e.currentTarget.style.background = 'var(--color-surface)';
                                e.currentTarget.style.color = 'var(--color-text-muted)';
                                e.currentTarget.style.transform = 'none';
                              }}
                            >
                              <X size={14} />
                              {t('Hủy')}
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => {
                              setEditForm({
                                name: selectedLead.name || '',
                                phone: selectedLead.phone || '',
                                email: selectedLead.email || '',
                                source: selectedLead.source || '',
                                type: selectedLead.type || '',
                                note: selectedLead.note || ''
                              });
                              setIsAdminEditingLead(true);
                            }}
                            title={t("Sửa thông tin")}
                            className="detail-action-btn"
                            style={{
                              background: 'rgba(163, 20, 34, 0.08)',
                              border: '1px solid var(--color-primary-light)',
                              color: 'var(--color-primary)',
                              boxShadow: '0 2px 6px rgba(163, 20, 34, 0.05)'
                            }}
                            onMouseOver={e => {
                              e.currentTarget.style.background = 'var(--color-primary)';
                              e.currentTarget.style.color = '#ffffff';
                              e.currentTarget.style.transform = 'translateY(-2px)';
                              e.currentTarget.style.boxShadow = '0 6px 15px rgba(163, 20, 34, 0.2)';
                            }}
                            onMouseOut={e => {
                              e.currentTarget.style.background = 'rgba(163, 20, 34, 0.08)';
                              e.currentTarget.style.color = 'var(--color-primary)';
                              e.currentTarget.style.transform = 'none';
                              e.currentTarget.style.boxShadow = '0 2px 6px rgba(163, 20, 34, 0.05)';
                            }}
                          >
                            <Edit size={14} />
                            {t('Sửa')}
                          </button>
                        )}
                      </>
                    )}
 
                    {canBlockLead && selectedLead.status !== 'blacklisted' && !isAdminEditingLead && (
                      <button
                        onClick={() => {
                          setCompensateBlock(
                            Boolean(
                              selectedLead.assigned_to_name &&
                              selectedLead.assigned_to_name !== '-' &&
                              selectedLead.assigned_to_name !== t('Chưa phân bổ')
                            ) && !isTicketLead
                          );
                          setConfirmBlockOpen(true);
                        }}
                        title={t("Chặn & Blacklist khách hàng này")}
                        className="detail-action-btn"
                        style={{
                          background: 'rgba(239, 68, 68, 0.08)',
                          border: '1px solid var(--color-danger-light)',
                          color: 'var(--color-danger)',
                          boxShadow: '0 2px 6px rgba(239, 68, 68, 0.05)'
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.background = 'var(--color-danger)';
                          e.currentTarget.style.color = '#ffffff';
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 15px rgba(239, 68, 68, 0.2)';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                          e.currentTarget.style.color = 'var(--color-danger)';
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 2px 6px rgba(239, 68, 68, 0.05)';
                        }}
                      >
                        <Ban size={14} />
                        {t('Chặn')}
                      </button>
                    )}

                    {(() => {
                      const myTaker = ensureArray(selectedLead.takers).find((tk: any) => Number(tk?.id) === Number(user?.id) || Number(tk?.id) === Number(user?.consultant_id));
                      const isClaimer = !!myTaker;
                      const canRelease = false;

                      return canRelease ? (
                        <button
                          onClick={() => handleReleaseToDatabank(selectedLead.lead_id || selectedLead.id, myTaker?.contact_id)}
                          disabled={isReleasingLead}
                          title={t("Nhả về Kho chung (Databank)")}
                          className="detail-action-btn"
                          style={{
                            background: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            color: '#10b981',
                            boxShadow: '0 2px 6px rgba(16, 185, 129, 0.05)'
                          }}
                          onMouseOver={e => {
                            e.currentTarget.style.background = '#10b981';
                            e.currentTarget.style.color = '#ffffff';
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 6px 15px rgba(16, 185, 129, 0.2)';
                          }}
                          onMouseOut={e => {
                            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.08)';
                            e.currentTarget.style.color = '#10b981';
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = '0 2px 6px rgba(16, 185, 129, 0.05)';
                          }}
                        >
                          <RefreshCw size={14} className={isReleasingLead ? 'animate-spin' : ''} />
                          {isReleasingLead ? t('Đang nhả...') : t('Nhả Kho')}
                        </button>
                      ) : null;
                    })()}

                    {isSaleUser &&
                     (selectedLead.is_public === 1 || Number(selectedLead.is_public) === 1 || selectedLead.status === 'released_to_kho' || selectedLead.status === 'databank_claim' || selectedLead.status === 'databank') &&
                     !isUserInTakers(selectedLead.takers) &&
                     ensureArray(selectedLead.takers).length < maxParallelClaims && (
                      <button
                        onClick={() => {
                          const claimPersonId = Number(selectedLead.person_id || (selectedLead.status === 'databank' ? selectedLead.id : 0));
                          handleClaimLead(claimPersonId, selectedLead.name, () => {
                            setSelectedLead(null);
                            clearOpenParams();
                            fetchLeads();
                          });
                        }}

                        disabled={isClaimingLeadId !== null}
                        title={t("Nhận khách hàng này về danh sách chăm sóc của bạn")}
                        className="detail-action-btn"
                        style={{
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          border: 'none',
                          color: '#ffffff',
                          fontWeight: 700,
                          boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)'
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.transform = 'translateY(-2px)';
                          e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.35)';
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.transform = 'none';
                          e.currentTarget.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.2)';
                        }}
                      >
                        <RefreshCw size={14} className={isClaimingLeadId !== null ? 'animate-spin' : ''} />
                        {isClaimingLeadId !== null ? t('Đang nhận...') : t('Nhận Data')}
                      </button>
                    )}
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div
                    onClick={!isAdminEditingLead ? () => {
                      if (!selectedLead.phone || selectedLead.phone === '-') return;
                      if (!canSeeFullInfo || String(selectedLead.phone).includes('*')) {
                        toast.error(t('Không thể sao chép số điện thoại đang bị che'));
                        return;
                      }
                      handleCopyText(selectedLead.phone, t('Đã sao chép số điện thoại!'), 'phone');
                    } : undefined}
                    style={{
                      background: 'var(--color-bg)',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 10,
                      border: '1px solid var(--color-border-light)',
                      cursor: !isAdminEditingLead ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      if (!isAdminEditingLead) {
                        e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                        e.currentTarget.style.background = 'rgba(163, 20, 34, 0.02)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isAdminEditingLead) {
                        e.currentTarget.style.borderColor = 'var(--color-border-light)';
                        e.currentTarget.style.background = 'var(--color-bg)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Phone size={12} /> {t("Phone")}
                      </div>
                      {(() => {
                        const country = detectCountryFromPhone(selectedLead.phone);
                        if (!country) return null;
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} title={country.name}>
                            <img
                              src={country.flagUrl}
                              alt={country.name}
                              style={{
                                width: '16px',
                                height: '11px',
                                borderRadius: '2px',
                                objectFit: 'cover',
                                border: '1px solid rgba(0,0,0,0.1)'
                              }}
                            />
                            <span style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{country.code}</span>
                          </div>
                        );
                      })()}
                    </div>
                    {isAdminEditingLead ? (
                      <input
                        type="text"
                        value={editForm.phone}
                        onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          background: 'var(--color-surface)',
                          border: '1px solid rgba(163, 20, 34, 0.15)',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          width: '100%',
                          boxSizing: 'border-box',
                          outline: 'none',
                          transition: 'all 0.2s ease-in-out',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = 'var(--color-primary)';
                          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(163, 20, 34, 0.12)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = 'rgba(163, 20, 34, 0.15)';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.02)';
                        }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }} title={selectedLead.phone}>
                          {canSeeFullInfo ? selectedLead.phone : maskPhone(selectedLead.phone)}
                        </span>
                        {!isAdminEditingLead && (
                          <div
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: copiedType === 'phone' ? '#10b981' : 'var(--color-text-muted)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: copiedType === 'phone' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.05)'
                            }}
                          >
                            {copiedType === 'phone' ? <Check size={12} /> : <Copy size={12} />}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div
                    onClick={!isAdminEditingLead ? () => handleCopyText(canSeeFullInfo ? selectedLead.email : maskEmail(selectedLead.email), t('Đã sao chép email!'), 'email') : undefined}
                    style={{
                      background: 'var(--color-bg)',
                      padding: '0.625rem 0.75rem',
                      borderRadius: 10,
                      border: '1px solid var(--color-border-light)',
                      minWidth: 0,
                      cursor: !isAdminEditingLead ? 'pointer' : 'default',
                      transition: 'all 0.2s',
                    }}
                    onMouseEnter={e => {
                      if (!isAdminEditingLead) {
                        e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                        e.currentTarget.style.background = 'rgba(163, 20, 34, 0.02)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isAdminEditingLead) {
                        e.currentTarget.style.borderColor = 'var(--color-border-light)';
                        e.currentTarget.style.background = 'var(--color-bg)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}><Mail size={12} /> {t("Email")}</div>
                    {isAdminEditingLead ? (
                      <input
                        type="text"
                        value={editForm.email}
                        onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          background: 'var(--color-surface)',
                          border: '1px solid rgba(163, 20, 34, 0.15)',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          width: '100%',
                          boxSizing: 'border-box',
                          outline: 'none',
                          transition: 'all 0.2s ease-in-out',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = 'var(--color-primary)';
                          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(163, 20, 34, 0.12)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = 'rgba(163, 20, 34, 0.15)';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.02)';
                        }}
                      />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', flex: 1 }} title={selectedLead.email}>
                          {canSeeFullInfo ? selectedLead.email : maskEmail(selectedLead.email)}
                        </span>
                        {!isAdminEditingLead && (
                          <div
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: copiedType === 'email' ? '#10b981' : 'var(--color-text-muted)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              background: copiedType === 'email' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255, 255, 255, 0.05)'
                            }}
                          >
                            {copiedType === 'email' ? <Check size={12} /> : <Copy size={12} />}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ background: 'var(--color-bg)', padding: '0.625rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-border-light)', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}><ExternalLink size={12} /> {t('Nguồn')}</div>
                    {isAdminEditingLead ? (
                      <input
                        type="text"
                        value={editForm.source}
                        onChange={e => setEditForm({ ...editForm, source: e.target.value })}
                        style={{
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          color: 'var(--color-text)',
                          background: 'var(--color-surface)',
                          border: '1px solid rgba(163, 20, 34, 0.15)',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          width: '100%',
                          boxSizing: 'border-box',
                          outline: 'none',
                          transition: 'all 0.2s ease-in-out',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = 'var(--color-primary)';
                          e.currentTarget.style.boxShadow = '0 0 0 4px rgba(163, 20, 34, 0.12)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = 'rgba(163, 20, 34, 0.15)';
                          e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.02)';
                        }}
                      />
                    ) : (
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={selectedLead.source}>{selectedLead.source}</div>
                    )}
                  </div>
                  <div style={{ background: 'var(--color-bg)', padding: '0.625rem 0.75rem', borderRadius: 10, border: '1px solid var(--color-border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text-muted)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}><Tag size={12} /> {t('Trạng thái')}</div>
                    <div>
                      {getStatusBadge((selectedLead.is_public === 1 || Number(selectedLead.is_public) === 1 || selectedLead.status === 'released_to_kho' || selectedLead.status === 'databank_claim') ? 'databank' : selectedLead.status, selectedLead.report_status, selectedLead.ai_screener_status, selectedLead.created_at, selectedLead.takers, (selectedLead as any).message)}
                    </div>
                  </div>
                </div>

                {(() => {
                  const { cleanNote, errorNotes, blacklistNotes, warningNotes, aiDecisionNotes } = parseNote(selectedLead.note || '');
                  return (
                    <>
                      {/* Warning Notes Card */}
                      {warningNotes && warningNotes.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                          {warningNotes.map((warn, index) => (
                            <div key={index} style={{
                              background: theme === 'dark' ? 'rgba(245, 158, 11, 0.08)' : '#fffbeb',
                              border: '1px dashed var(--color-warning)',
                              padding: '1rem 1.25rem',
                              borderRadius: '16px',
                              display: 'flex',
                              gap: '0.75rem',
                              alignItems: 'center'
                            }}>
                              <div style={{
                                background: theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
                                padding: '6px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--color-warning)',
                                flexShrink: 0
                              }}>
                                <AlertTriangle size={16} strokeWidth={2.5} />
                              </div>
                              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: theme === 'dark' ? '#f3f4f6' : '#78350f', lineHeight: 1.4 }}>
                                {warn}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Clean Note Card */}
                      <div style={{
                        background: theme === 'dark' ? 'rgba(245, 158, 11, 0.08)' : 'linear-gradient(135deg, #fefce8 0%, #fffbeb 100%)',
                        border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid #fef3c7',
                        padding: '1.25rem',
                        borderRadius: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        boxShadow: theme === 'dark' ? 'none' : '0 4px 15px rgba(245, 158, 11, 0.03)'
                      }}
                        className="premium-alert-card"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            background: theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#fef3c7',
                            padding: '8px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: theme === 'dark' ? '#f59e0b' : '#d97706'
                          }}>
                            <Tag size={18} strokeWidth={2.5} />
                          </div>
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: theme === 'dark' ? '#fbbf24' : '#92400e', letterSpacing: '-0.01em' }}>{t('Ghi chú & Phân loại')}</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                          {isAdminEditingLead ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: theme === 'dark' ? '#fbbf24' : '#b45309', width: '80px', flexShrink: 0 }}>{t('Loại Data:')}</span>
                              <input
                                type="text"
                                value={editForm.type}
                                onChange={e => setEditForm({ ...editForm, type: e.target.value })}
                                style={{
                                  fontSize: '0.875rem',
                                  fontWeight: 600,
                                  color: 'var(--color-text)',
                                  background: 'var(--color-surface)',
                                  border: '1px solid rgba(163, 20, 34, 0.15)',
                                  borderRadius: '10px',
                                  padding: '8px 12px',
                                  flex: 1,
                                  outline: 'none',
                                  transition: 'all 0.2s ease-in-out',
                                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                                }}
                                onFocus={e => {
                                  e.currentTarget.style.borderColor = 'var(--color-primary)';
                                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(163, 20, 34, 0.12)';
                                }}
                                onBlur={e => {
                                  e.currentTarget.style.borderColor = 'rgba(163, 20, 34, 0.15)';
                                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.02)';
                                }}
                              />
                            </div>
                          ) : (
                            <div style={{ fontSize: '0.85rem', color: theme === 'dark' ? '#dadada' : '#78350f' }}>
                              <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: theme === 'dark' ? '#fbbf24' : '#b45309', marginRight: '6px' }}>{t('Loại Data:')}</span>
                              <span style={{ fontWeight: 600 }}>{selectedLead.type !== '-' ? selectedLead.type : t('Không có')}</span>
                            </div>
                          )}

                          <div style={{ borderTop: theme === 'dark' ? '1px dashed rgba(245, 158, 11, 0.2)' : '1px dashed rgba(217, 119, 6, 0.15)', paddingTop: '10px', marginTop: '2px' }}>
                            <span style={{ fontWeight: 700, textTransform: 'uppercase', fontSize: '0.75rem', color: theme === 'dark' ? '#fbbf24' : '#b45309', display: 'block', marginBottom: '6px' }}>{t('Nội dung ghi chú:')}</span>
                            {isAdminEditingLead ? (
                              <textarea
                                value={editForm.note}
                                onChange={e => setEditForm({ ...editForm, note: e.target.value })}
                                rows={4}
                                style={{
                                  fontSize: '0.875rem',
                                  fontWeight: 500,
                                  color: 'var(--color-text)',
                                  background: 'var(--color-surface)',
                                  border: '1px solid rgba(245, 158, 11, 0.25)',
                                  borderRadius: '10px',
                                  padding: '10px 14px',
                                  width: '100%',
                                  boxSizing: 'border-box',
                                  lineHeight: 1.5,
                                  resize: 'vertical',
                                  outline: 'none',
                                  transition: 'all 0.2s ease-in-out',
                                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
                                }}
                                onFocus={e => {
                                  e.currentTarget.style.borderColor = '#d97706';
                                  e.currentTarget.style.boxShadow = '0 0 0 4px rgba(245, 158, 11, 0.15)';
                                }}
                                onBlur={e => {
                                  e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.25)';
                                  e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.02)';
                                }}
                              />
                            ) : (
                              <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#f3f4f6' : '#451a03', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontWeight: 500 }}>
                                {cleanNote ? cleanNote : <em style={{ color: theme === 'dark' ? '#cbd5e1' : '#b45309', opacity: 0.6 }}>{t('Không có ghi chú thêm')}</em>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* AI Decision Notes */}
                      {aiDecisionNotes && aiDecisionNotes.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                          {aiDecisionNotes.map((note, index) => {
                            const parsed = parseAIDecisionNote(note);

                            const isApprove = parsed.type === 'ai_approve';
                            const isBlacklist = parsed.type === 'ai_blacklist';
                            const isFallback = parsed.type === 'ai_fallback';

                            let cardBg = 'rgba(239, 68, 68, 0.08)';
                            let cardBorder = '1px solid rgba(239, 68, 68, 0.15)';
                            let iconBg = 'rgba(239, 68, 68, 0.15)';
                            let iconColor = 'var(--color-danger)';
                            let titleColor = 'var(--color-danger)';
                            let titleText = t("Từ chối bởi AI");
                            let IconComponent = XCircle;

                            if (isApprove) {
                              cardBg = theme === 'dark' ? 'rgba(16, 185, 129, 0.08)' : '#f0fdf4';
                              cardBorder = theme === 'dark' ? '1px solid rgba(16, 185, 129, 0.15)' : '1px solid #a7f3d0';
                              iconBg = theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#d1fae5';
                              iconColor = 'var(--color-success)';
                              titleColor = 'var(--color-success)';
                              titleText = t("Duyệt bởi AI");
                              IconComponent = CheckCircle2;
                            } else if (isBlacklist) {
                              titleText = t("Tự động chặn bởi AI (Blacklist)");
                              IconComponent = ShieldAlert;
                            } else if (isFallback) {
                              cardBg = theme === 'dark' ? 'rgba(245, 158, 11, 0.08)' : '#fffbeb';
                              cardBorder = theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.15)' : '1px solid #fde68a';
                              iconBg = theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.12)';
                              iconColor = 'var(--color-warning)';
                              titleColor = 'var(--color-warning)';
                              titleText = t("Xác nhận dưới chuẩn (Fallback)");
                              IconComponent = AlertTriangle;
                            }

                            return (
                              <div key={index} style={{
                                background: cardBg,
                                border: cardBorder,
                                padding: '12px 16px',
                                borderRadius: '12px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', width: '100%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <div style={{ background: iconBg, padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor }}>
                                      <IconComponent size={15} />
                                    </div>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: titleColor }}>{titleText}</span>
                                  </div>
                                </div>

                                <div style={{ fontSize: '0.8125rem', color: theme === 'dark' ? 'var(--color-text-light)' : '#334155' }}>
                                  <strong>{t("Lý do:")}</strong> <span style={{ fontWeight: 600 }}>{parsed.reason || t("Không rõ")}</span>
                                </div>

                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  paddingTop: '0.5rem',
                                  borderTop: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(0, 0, 0, 0.04)',
                                  flexWrap: 'wrap'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: theme === 'dark' ? 'var(--color-text-muted)' : '#64748b' }}>
                                    <Avatar src={getUserAvatarByName(parsed.admin)} name={parsed.admin} size={16} />
                                    <span>{t("Admin phụ trách: ")}<strong style={{ color: theme === 'dark' ? 'var(--color-text)' : '#334155' }}>{parsed.admin}</strong></span>
                                  </div>
                                  <span style={{ color: theme === 'dark' ? '#374151' : '#cbd5e1', fontSize: '0.75rem' }}>•</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: theme === 'dark' ? 'var(--color-text-muted)' : '#64748b' }}>
                                    <Clock size={13} style={{ opacity: 0.7 }} />
                                    <span>{t("Thời gian: ")}<strong style={{ color: theme === 'dark' ? 'var(--color-text)' : '#334155' }}>{parsed.time}</strong></span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Error Notes (Approved / Rejected) */}
                      {errorNotes.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                          {errorNotes.map((err, index) => {
                            const isApproved = err.includes('DUYỆT');

                            // Rich harmonious color palettes
                            const colors = isApproved ? (
                              theme === 'dark' ? {
                                gradient: 'rgba(16, 185, 129, 0.08)',
                                border: '1px solid rgba(16, 185, 129, 0.15)',
                                glow: 'none',
                                accent: '#34d399',
                                title: '#34d399',
                                text: '#dadada',
                                badgeBg: 'rgba(16, 185, 129, 0.15)',
                                badgeText: '#34d399',
                                badgeBorder: '1px solid rgba(16, 185, 129, 0.2)',
                                iconBg: 'rgba(16, 185, 129, 0.15)',
                              } : {
                                gradient: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)',
                                border: '1px solid #a7f3d0',
                                glow: '0 4px 15px rgba(16, 185, 129, 0.04)',
                                accent: '#10b981',
                                title: '#065f46',
                                text: '#047857',
                                badgeBg: '#d1fae5',
                                badgeText: '#065f46',
                                badgeBorder: '1px solid #a7f3d0',
                                iconBg: '#d1fae5',
                              }
                            ) : (
                              theme === 'dark' ? {
                                gradient: 'rgba(239, 68, 68, 0.08)',
                                border: '1px solid rgba(239, 68, 68, 0.15)',
                                glow: 'none',
                                accent: '#f87171',
                                title: '#f87171',
                                text: '#dadada',
                                badgeBg: 'rgba(239, 68, 68, 0.15)',
                                badgeText: '#f87171',
                                badgeBorder: '1px solid rgba(239, 68, 68, 0.2)',
                                iconBg: 'rgba(239, 68, 68, 0.15)',
                              } : {
                                gradient: 'linear-gradient(135deg, #fef2f2 0%, #fff1f2 100%)',
                                border: '1px solid #fecaca',
                                glow: '0 4px 15px rgba(244, 63, 94, 0.04)',
                                accent: '#f43f5e',
                                title: '#9f1239',
                                text: '#be123c',
                                badgeBg: '#ffe4e6',
                                badgeText: '#9f1239',
                                badgeBorder: '1px solid #fca5a5',
                                iconBg: '#ffe4e6',
                              }
                            );

                            const IconComponent = isApproved ? CheckCircle2 : XCircle;

                            const { cleanText, admin: noteAdmin, time: noteTime } = parseErrorNote(err);
                            const displayAdmin = noteAdmin || selectedLead?.resolved_by || 'Hệ thống';

                            let displayTime = noteTime;
                            if (!displayTime) {
                              if (selectedLead?.resolved_at) {
                                const dt = parseServerDate(selectedLead.resolved_at);
                                displayTime = !isNaN(dt.getTime())
                                  ? dt.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')
                                  : selectedLead.resolved_at;
                              } else {
                                displayTime = t('Hệ thống');
                              }
                            }

                            let cleanMsg = cleanText;
                            if (cleanMsg.startsWith('[LỖI -')) {
                              const bracketIndex = cleanMsg.indexOf(']');
                              if (bracketIndex !== -1) {
                                cleanMsg = cleanMsg.substring(bracketIndex + 1).trim();
                                if (cleanMsg.startsWith(':')) {
                                  cleanMsg = cleanMsg.substring(1).trim();
                                }
                              }
                            }

                            const msgParts = cleanMsg.split(' | ');
                            const coreError = msgParts[0] || '';
                            const actionReason = msgParts[1] || '';

                            let cleanReason = actionReason.trim();
                            let reasonLabel = isApproved ? t('Lý do duyệt:') : t('Lý do từ chối:');

                            if (cleanReason.startsWith('Lý do duyệt:')) {
                              reasonLabel = t('Lý do duyệt:');
                              cleanReason = cleanReason.replace(/^Lý do duyệt:/, '').trim();
                            } else if (cleanReason.startsWith('Lý do từ chối:')) {
                              reasonLabel = t('Lý do từ chối:');
                              cleanReason = cleanReason.replace(/^Lý do từ chối:/, '').trim();
                            }

                            return (
                              <div key={index} style={{
                                background: colors.gradient,
                                border: colors.border,
                                boxShadow: colors.glow,
                                padding: '1.25rem',
                                borderRadius: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                position: 'relative'
                              }}
                                className="premium-alert-card"
                              >
                                {/* Top header info */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', width: '100%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                      background: colors.iconBg,
                                      padding: '8px',
                                      borderRadius: '10px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: colors.accent
                                    }}>
                                      <IconComponent size={18} strokeWidth={2.5} />
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: colors.title, letterSpacing: '-0.01em' }}>
                                      {isApproved ? t('Thông tin lỗi - Đã Duyệt') : t('Thông tin lỗi - Từ Chối')}
                                    </span>
                                  </div>
                                  <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: colors.badgeText,
                                    background: colors.badgeBg,
                                    border: colors.badgeBorder,
                                    padding: '3px 8px',
                                    borderRadius: '8px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                  }}>
                                    {isApproved ? t('Đã duyệt') : t('Từ chối')}
                                  </span>
                                </div>

                                {/* Content block */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  <div style={{ fontSize: '0.875rem', color: theme === 'dark' ? '#cbd5e1' : '#1e293b', fontWeight: 500, lineHeight: 1.5 }}>
                                    {t('Lỗi: ')}<span style={{ fontWeight: 600, color: colors.text }}>{coreError}</span>
                                  </div>
                                  {actionReason && (
                                    <div style={{
                                      fontSize: '0.85rem',
                                      color: theme === 'dark' ? '#9ca3af' : '#475569',
                                      fontWeight: 400,
                                      lineHeight: 1.5,
                                      background: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.4)',
                                      padding: '8px 12px',
                                      borderRadius: '8px',
                                      border: theme === 'dark' ? '1px dashed rgba(255, 255, 255, 0.08)' : '1px dashed rgba(0, 0, 0, 0.05)',
                                      marginTop: 2
                                    }}>
                                      <strong>{reasonLabel}</strong> {cleanReason}
                                    </div>
                                  )}
                                </div>

                                {/* Footer metadata */}
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  paddingTop: '0.75rem',
                                  marginTop: '0.25rem',
                                  borderTop: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.04)',
                                  flexWrap: 'wrap'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: theme === 'dark' ? 'var(--color-text-muted)' : '#64748b' }}>
                                    <Avatar src={getUserAvatarByName(displayAdmin)} name={displayAdmin} size={16} />
                                    <span>{t('Xử lý bởi: ')}<strong style={{ color: theme === 'dark' ? 'var(--color-text)' : '#334155' }}>{displayAdmin}</strong></span>
                                  </div>
                                  <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>•</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: theme === 'dark' ? 'var(--color-text-muted)' : '#64748b' }}>
                                    <Clock size={13} style={{ opacity: 0.7 }} />
                                    <span>{t('Thời gian: ')}<strong style={{ color: theme === 'dark' ? 'var(--color-text)' : '#334155' }}>{displayTime}</strong></span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Blacklist Notes */}
                      {blacklistNotes && blacklistNotes.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                          {blacklistNotes.map((note, index) => {
                            const parsed = parseBlacklistNote(note);
                            const blacklistColors = theme === 'dark' ? {
                              gradient: 'rgba(239, 68, 68, 0.08)',
                              border: '1px solid rgba(239, 68, 68, 0.15)',
                              glow: 'none',
                              accent: '#f87171',
                              title: '#f87171',
                              text: '#dadada',
                              badgeBg: 'rgba(239, 68, 68, 0.15)',
                              badgeText: '#f87171',
                              badgeBorder: '1px solid rgba(239, 68, 68, 0.2)',
                              iconBg: 'rgba(239, 68, 68, 0.15)',
                            } : {
                              gradient: 'linear-gradient(135deg, #fff1f2 0%, #fff5f5 100%)',
                              border: '1px solid #fecaca',
                              glow: '0 4px 15px rgba(244, 63, 94, 0.04)',
                              accent: '#f43f5e',
                              title: '#9f1239',
                              text: '#be123c',
                              badgeBg: '#ffe4e6',
                              badgeText: '#9f1239',
                              badgeBorder: '1px solid #fca5a5',
                              iconBg: '#ffe4e6',
                            };

                            return (
                              <div key={index} style={{
                                background: blacklistColors.gradient,
                                border: blacklistColors.border,
                                boxShadow: blacklistColors.glow,
                                padding: '1.25rem',
                                borderRadius: '16px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.75rem',
                                position: 'relative'
                              }}
                                className="premium-alert-card"
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', width: '100%' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div style={{
                                      background: blacklistColors.iconBg,
                                      padding: '8px',
                                      borderRadius: '10px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: blacklistColors.accent
                                    }}>
                                      <ShieldAlert size={18} strokeWidth={2.5} />
                                    </div>
                                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: blacklistColors.title, letterSpacing: '-0.01em' }}>
                                      Thông tin chặn (Blacklist)
                                    </span>
                                  </div>
                                  <span style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    color: blacklistColors.badgeText,
                                    background: blacklistColors.badgeBg,
                                    border: blacklistColors.badgeBorder,
                                    padding: '3px 8px',
                                    borderRadius: '8px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em'
                                  }}>
                                    Bị Chặn
                                  </span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {parsed.reason && (
                                    <div style={{
                                      fontSize: '0.875rem',
                                      color: theme === 'dark' ? '#9ca3af' : '#1e293b',
                                      fontWeight: 500,
                                      lineHeight: 1.5,
                                      background: theme === 'dark' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.4)',
                                      padding: '8px 12px',
                                      borderRadius: '8px',
                                      border: theme === 'dark' ? '1px dashed rgba(255, 255, 255, 0.08)' : '1px dashed rgba(0, 0, 0, 0.05)'
                                    }}>
                                      <strong>{t('Lý do chặn:')}</strong> <span style={{ color: blacklistColors.text, fontWeight: 600 }}>{parsed.reason}</span>
                                    </div>
                                  )}
                                </div>

                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '12px',
                                  paddingTop: '0.75rem',
                                  marginTop: '0.25rem',
                                  borderTop: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(0, 0, 0, 0.04)',
                                  flexWrap: 'wrap'
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: theme === 'dark' ? 'var(--color-text-muted)' : '#64748b' }}>
                                    <Avatar src={getUserAvatarByName(parsed.admin)} name={parsed.admin} size={16} />
                                    <span>{t('Chặn bởi: ')}<strong style={{ color: theme === 'dark' ? 'var(--color-text)' : '#334155' }}>{parsed.admin}</strong></span>
                                  </div>
                                  <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>•</span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: theme === 'dark' ? 'var(--color-text-muted)' : '#64748b' }}>
                                    <Clock size={13} style={{ opacity: 0.7 }} />
                                    <span>{t('Thời gian: ')}<strong style={{ color: theme === 'dark' ? 'var(--color-text)' : '#334155' }}>{parsed.time}</strong></span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Cột Phải: Phân bổ */}
              <div className="sticky-column">
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>{t('Thông tin Phân bổ')}</h3>

                {/* Đánh giá AI - Nằm bên trên người tiếp nhận */}
                {(() => {
                  const aiConfig = getAICardConfig(selectedLead, theme, t);
                  if (!aiConfig) return null;
                  return (
                    <div style={{
                      marginTop: '0.5rem',
                      marginBottom: '1.5rem',
                      background: aiConfig.bgGradient,
                      border: aiConfig.borderColor,
                      borderRadius: '16px',
                      padding: '1.25rem',
                      position: 'relative',
                      overflow: 'hidden',
                      boxShadow: theme === 'dark' ? '0 8px 32px 0 rgba(0, 0, 0, 0.15)' : '0 10px 25px -5px rgba(189, 29, 45, 0.05), 0 8px 10px -6px rgba(189, 29, 45, 0.03)',
                      transition: 'all 0.3s ease'
                    }}>
                      {/* Top glowing accent bar */}
                      <div style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 3,
                        background: aiConfig.topAccentGradient
                      }} />

                      {/* Header */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '1rem',
                        gap: '0.75rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Avatar src={aiConfig.avatar} name={aiConfig.title} size={36} />
                            <div style={{
                              position: 'absolute',
                              bottom: -2,
                              right: -2,
                              background: aiConfig.accentColor,
                              borderRadius: '50%',
                              padding: '2px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: '#fff',
                              border: '1.5px solid var(--color-surface)'
                            }}>
                              <Sparkles size={8} />
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: aiConfig.textAccentColor, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('ĐÁNH GIÁ AI')}</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--color-text)' }}>{aiConfig.title}</div>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span style={{
                          fontSize: '0.625rem',
                          fontWeight: 700,
                          background: aiConfig.badgeBg,
                          color: aiConfig.badgeColor,
                          padding: '2px 6px',
                          borderRadius: '6px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.03em',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                        }}>
                          {aiConfig.badgeText}
                        </span>
                      </div>

                      {/* Content */}
                      <div style={{
                        background: theme === 'dark' ? 'rgba(0, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.6)',
                        border: theme === 'dark' ? '1px solid rgba(255, 255, 255, 0.05)' : '1px solid rgba(255, 255, 255, 0.8)',
                        borderRadius: '12px',
                        padding: '0.875rem 1rem',
                        boxShadow: 'inset 0 1px 2px rgba(0, 0, 0, 0.02)'
                      }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          color: aiConfig.textAccentColor,
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.02em',
                          marginBottom: 6
                        }}>
                          <Tag size={12} strokeWidth={2.5} style={{ color: aiConfig.accentColor }} /> {t('Phân tích kết quả')}
                        </div>
                        <div style={{
                          fontSize: '0.85rem',
                          color: 'var(--color-text)',
                          whiteSpace: 'pre-wrap',
                          lineHeight: 1.6,
                          fontWeight: 500,
                          letterSpacing: '-0.005em'
                        }}>
                          {aiConfig.content}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {selectedLead.status === 'pending_approval' ? (
                  <div style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    padding: '1.25rem',
                    borderRadius: 12
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <Avatar src="/imgs/warn_icon.png" name="IDEAS AI - Screener" size={36} />
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{t('Người tiếp nhận')}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>IDEAS AI - Screener</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}><Tag size={12} /> {t('Trạng thái phân bổ')}</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{t('Chờ duyệt')}</div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>
                          <Clock size={12} /> {t('Thời gian nhận')}
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{selectedLead.created_at}</div>
                      </div>
                    </div>
                  </div>
                ) : selectedLead.status === 'rejected' ? (
                  <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <Avatar src="/LOGO.jpg" name="IDEAS AI - Evaluator" size={36} />
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{t('Người tiếp nhận')}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>IDEAS AI - Evaluator</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}><Tag size={12} /> {t('Trạng thái phân bổ')}</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{t('Failed - Đã hủy')}</div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>
                          <Clock size={12} /> {t('Thời gian nhận')}
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{selectedLead.created_at}</div>
                      </div>
                    </div>
                  </div>
                ) : selectedLead.status === 'blacklisted' ? (
                  <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <Avatar src="/imgs/angry_icon.jpg" name="IDEAS AI - Angry" size={36} />
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{t('Người tiếp nhận')}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>IDEAS AI - Angry</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}><Tag size={12} /> {t('Trạng thái phân bổ')}</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{t('Blacklist')}</div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>
                          <Clock size={12} /> {t('Thời gian nhận')}
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{selectedLead.created_at}</div>
                      </div>
                    </div>
                  </div>
                ) : (selectedLead.is_public === 1 || Number(selectedLead.is_public) === 1 || selectedLead.status === 'released_to_kho' || selectedLead.status === 'databank_claim' || selectedLead.status === 'databank') ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
                      {t('Danh sách Sale đã nhận')}
                    </div>
                    {ensureArray(selectedLead.takers).length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {ensureArray(selectedLead.takers).map((tk: any, idx: number) => (
                          <div key={tk.id || idx} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--color-surface)', padding: '0.75rem 1rem', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                            <Avatar src={tk.avatar || undefined} name={tk.name || t('TVV')} size={32} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>{tk.name}</div>
                              {tk.claimed_at && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                                  <Clock size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                                  {tk.claimed_at}
                                </div>
                              )}
                            </div>
                            {isSysAdmin && (
                              <button
                                onClick={() => handleDeletePublicClaim(Number(selectedLead.person_id || (selectedLead.status === 'databank' ? selectedLead.id : 0)), tk.id, tk.name)}
                                disabled={isDeletingClaim}
                                title={t('Xóa lượt nhận của Sale')}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.08)',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '28px',
                                  height: '28px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ef4444',
                                  cursor: 'pointer',
                                  transition: 'all 0.2s',
                                  flexShrink: 0
                                }}
                                onMouseOver={e => {
                                  e.currentTarget.style.background = '#ef4444';
                                  e.currentTarget.style.color = '#ffffff';
                                }}
                                onMouseOut={e => {
                                  e.currentTarget.style.background = 'rgba(239, 68, 68, 0.08)';
                                  e.currentTarget.style.color = '#ef4444';
                                }}
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ background: 'var(--color-bg)', padding: '1.25rem', borderRadius: 12, textAlign: 'center', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                        {t('Chưa có Sale nào nhận chăm sóc khách hàng này.')}
                      </div>
                    )}
                  </div>
                ) : selectedLead.assigned_to_name !== '-' ? (
                  <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                      <Avatar src={selectedLead.assigned_to_avatar || undefined} name={selectedLead.assigned_to_name} size={40} aiScreened={!!(selectedLead.ai_screener_status && selectedLead.ai_screener_status !== 'not_screened')} />
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>{t('Người tiếp nhận')}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {(() => {
                            const cObj = ensureArray(consultants).find(c => c.name === selectedLead.assigned_to_name);
                            if (cObj) {
                              return (
                                <div
                                  style={{
                                    fontSize: '1rem',
                                    fontWeight: 700,
                                    color: 'var(--color-text)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'color 0.2s ease'
                                  }}
                                  className="consultant-hover-trigger"
                                  onClick={() => {
                                    setStatsConsultant(cObj);
                                    syncDateFilterToModal(dateFilter);
                                    setStatsModalOpen(true);
                                  }}
                                >
                                  {selectedLead.assigned_to_name}
                                  <BarChart2 size={16} className="consultant-chart-icon" style={{ opacity: 0.7, color: 'var(--color-primary)', transition: 'opacity 0.2s ease' }} />
                                </div>
                              );
                            }
                            return <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-text)' }}>{selectedLead.assigned_to_name}</div>;
                          })()}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}><Tag size={12} /> {t('Vòng chia')}</div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                          {(selectedLead.status === 'reminder' && (!selectedLead.round_name || selectedLead.round_name === '-')) ? 'Reminder' : selectedLead.round_name}
                        </div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>
                          <Clock size={12} /> {t('Thời gian nhận')}
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{selectedLead.created_at}</div>
                      </div>
                      {selectedLead.status === 'reminder' && selectedLead.last_activity_at && (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>
                            <Clock size={12} /> {t('Thời gian nhắc lại từ:')}
                          </div>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f59e0b' }}>
                            {selectedLead.last_activity_at}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tình trạng thông báo Zalo & Email */}
                    {selectedLead.assigned_to_name !== '-' && selectedLead.assigned_to_name !== t('Chưa ai nhận') && selectedLead.status !== 'databank' && selectedLead.status !== 'released_to_kho' && selectedLead.status !== 'databank_claim' && selectedLead.is_public !== 1 && Number(selectedLead.is_public) !== 1 && (
                      <div style={{
                        marginTop: '1rem',
                        paddingTop: '1rem',
                        borderTop: '1px dashed var(--color-border-light)'
                      }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-text)', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.75rem' }}>
                        <RefreshCw size={12} className={notifLoading ? "spin" : ""} style={{ color: 'var(--color-primary)' }} />
                        <span>{t('Tình trạng gửi thông báo')}</span>
                      </div>
                      {notifLoading ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)', padding: '4px 0' }}>
                          <RefreshCw size={12} className="spin" />
                          <span>{t('Đang tải trạng thái thực tế...')}</span>
                        </div>
                      ) : notificationStatus ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                          {/* Email Status */}
                          <div
                            onClick={() => {
                              if (notificationStatus.email.status === 'sent') {
                                setPreviewType('email');
                                setPreviewSentAt(notificationStatus.email.sent_at || '');
                                setPreviewOpen(true);
                              }
                            }}
                            title={notificationStatus.email.status === 'sent' ? t('Bấm để xem mẫu email đã gửi') : undefined}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.78rem',
                              cursor: notificationStatus.email.status === 'sent' ? 'pointer' : 'default',
                              padding: '4px 6px',
                              borderRadius: '6px',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={e => {
                              if (notificationStatus.email.status === 'sent') {
                                e.currentTarget.style.backgroundColor = 'var(--color-border-light)';
                              }
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', minWidth: 0 }}>
                              <img
                                src="/imgs/gmail-icon-free-png.webp"
                                alt="Gmail"
                                style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
                              />
                              <span style={{ flexShrink: 0 }}>Email:</span>
                              <span style={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={notificationStatus.email.sent_at || notificationStatus.email.target}>
                                {notificationStatus.email.status === 'sent'
                                  ? (notificationStatus.email.sent_at || '-')
                                  : ((notificationStatus.email.status === 'pending' || (selectedLead?.status === 'pending_work_hours' && notificationStatus.email.status === 'missed')) ? t('Đang chờ gửi...') : '-')}
                              </span>
                            </div>
                            <div style={{ flexShrink: 0 }}>
                              {notificationStatus.email.status === 'sent' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, borderRadius: '50%', background: 'var(--color-success)', color: 'white', flexShrink: 0 }}>
                                    <Check size={8} strokeWidth={3} />
                                  </span> {t('Đã gửi')} {notificationStatus.email.id ? `#${notificationStatus.email.id}` : ''}
                                </span>
                              )}
                              {(notificationStatus.email.status === 'pending' || (selectedLead?.status === 'pending_work_hours' && notificationStatus.email.status === 'missed')) && (
                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-info-light)', color: 'var(--color-info)' }}>
                                  {selectedLead?.status === 'pending_work_hours' ? t('Chờ gửi') : t('Đang chờ')} {notificationStatus.email.id ? `#${notificationStatus.email.id}` : ''}
                                </span>
                              )}
                              {notificationStatus.email.status === 'failed' && (
                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
                                  {t('Thất bại')} {notificationStatus.email.id ? `#${notificationStatus.email.id}` : ''}
                                </span>
                              )}
                              {notificationStatus.email.status === 'missed' && selectedLead?.status !== 'pending_work_hours' && (
                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px dashed rgba(239, 68, 68, 0.2)' }}>
                                  {t('Chưa gửi')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Zalo Status */}
                          <div
                            onClick={() => {
                              if (notificationStatus.zalo.status === 'sent') {
                                setPreviewType('zalo');
                                setPreviewSentAt(notificationStatus.zalo.sent_at || '');
                                setPreviewOpen(true);
                              }
                            }}
                            title={notificationStatus.zalo.status === 'sent' ? t('Bấm để xem mẫu Zalo đã gửi') : undefined}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              fontSize: '0.78rem',
                              cursor: notificationStatus.zalo.status === 'sent' ? 'pointer' : 'default',
                              padding: '4px 6px',
                              borderRadius: '6px',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={e => {
                              if (notificationStatus.zalo.status === 'sent') {
                                e.currentTarget.style.backgroundColor = 'var(--color-border-light)';
                              }
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', minWidth: 0 }}>
                              <img
                                src="https://stc-zpl.zdn.vn/favicon.ico"
                                alt="Zalo"
                                style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
                              />
                              <span style={{ flexShrink: 0 }}>Zalo:</span>
                              <span style={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={notificationStatus.zalo.sent_at || notificationStatus.zalo.target}>
                                {notificationStatus.zalo.status === 'sent'
                                  ? (notificationStatus.zalo.sent_at || '-')
                                  : (notificationStatus.zalo.status === 'no_zalo_config' ? t('Chưa cấu hình ID') : ((notificationStatus.zalo.status === 'pending' || (selectedLead?.status === 'pending_work_hours' && notificationStatus.zalo.status === 'missed')) ? t('Đang chờ gửi...') : '-'))}
                              </span>
                            </div>
                            <div style={{ flexShrink: 0 }}>
                              {notificationStatus.zalo.status === 'no_zalo_config' && (
                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                                  {t('Chưa cấu hình ID')}
                                </span>
                              )}
                              {notificationStatus.zalo.status === 'sent (Direct cURL)' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, borderRadius: '50%', background: 'var(--color-success)', color: 'white', flexShrink: 0 }}>
                                    <Check size={8} strokeWidth={3} />
                                  </span> {t('Đã gửi (cURL)')}
                                </span>
                              )}
                              {notificationStatus.zalo.status === 'sent' && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, borderRadius: '50%', background: 'var(--color-success)', color: 'white', flexShrink: 0 }}>
                                    <Check size={8} strokeWidth={3} />
                                  </span> {t('Đã gửi')} {notificationStatus.zalo.id && notificationStatus.zalo.id !== 'Log' ? `#${notificationStatus.zalo.id}` : ''}
                                </span>
                              )}
                              {(notificationStatus.zalo.status === 'pending' || (selectedLead?.status === 'pending_work_hours' && notificationStatus.zalo.status === 'missed')) && (
                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-info-light)', color: 'var(--color-info)' }}>
                                  {selectedLead?.status === 'pending_work_hours' ? t('Chờ gửi') : t('Đang chờ')} {notificationStatus.zalo.id ? `#${notificationStatus.zalo.id}` : ''}
                                </span>
                              )}
                              {notificationStatus.zalo.status === 'failed' && (
                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
                                  {t('Thất bại')} {notificationStatus.zalo.id ? `#${notificationStatus.zalo.id}` : ''}
                                </span>
                              )}
                              {notificationStatus.zalo.status === 'missed' && selectedLead?.status !== 'pending_work_hours' && (
                                <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px dashed rgba(239, 68, 68, 0.2)' }}>
                                  {t('Chưa gửi')}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Telegram Status */}
                          {notificationStatus.telegram && (
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '0.78rem',
                                padding: '4px 6px',
                                borderRadius: '6px'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-muted)', minWidth: 0 }}>
                                <img
                                  src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg"
                                  alt="Telegram"
                                  style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
                                />
                                <span style={{ flexShrink: 0 }}>Telegram:</span>
                                <span style={{ fontSize: '0.72rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={notificationStatus.telegram.sent_at || notificationStatus.telegram.target}>
                                  {notificationStatus.telegram.status === 'sent'
                                    ? (notificationStatus.telegram.sent_at || '-')
                                    : (notificationStatus.telegram.status === 'no_telegram_config' ? t('Chưa cấu hình ID') : ((notificationStatus.telegram.status === 'pending' || (selectedLead?.status === 'pending_work_hours' && notificationStatus.telegram.status === 'missed')) ? t('Đang chờ gửi...') : '-'))}
                                </span>
                              </div>
                              <div style={{ flexShrink: 0 }}>
                                {notificationStatus.telegram.status === 'no_telegram_config' && (
                                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                                    {t('Chưa cấu hình ID')}
                                  </span>
                                )}
                                {notificationStatus.telegram.status === 'sent' && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-success-light)', color: 'var(--color-success)' }}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 12, height: 12, borderRadius: '50%', background: 'var(--color-success)', color: 'white', flexShrink: 0 }}>
                                      <Check size={8} strokeWidth={3} />
                                    </span> {t('Đã gửi')}
                                  </span>
                                )}
                                {(notificationStatus.telegram.status === 'pending' || (selectedLead?.status === 'pending_work_hours' && notificationStatus.telegram.status === 'missed')) && (
                                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-info-light)', color: 'var(--color-info)' }}>
                                    {selectedLead?.status === 'pending_work_hours' ? t('Chờ gửi') : t('Đang chờ')}
                                  </span>
                                )}
                                {notificationStatus.telegram.status === 'failed' && (
                                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}>
                                    {t('Thất bại')}
                                  </span>
                                )}
                                {notificationStatus.telegram.status === 'missed' && selectedLead?.status !== 'pending_work_hours' && (
                                  <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 700, background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', border: '1px dashed rgba(239, 68, 68, 0.2)' }}>
                                    {t('Chưa gửi')}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          {t('Không lấy được trạng thái gửi thông báo')}
                        </div>
                      )}

                      {/* Manual Reminder Button */}
                      {canSendManualReminder && selectedLead.assigned_to_name && selectedLead.assigned_to_name !== '-' && selectedLead.assigned_to_name !== t('Chưa ai nhận') && selectedLead.assigned_to_name !== t('Chưa phân bổ') && selectedLead.status !== 'databank' && selectedLead.status !== 'released_to_kho' && selectedLead.is_public !== 1 && Number(selectedLead.is_public) !== 1 && (
                        <button
                          onClick={() => {
                            setReminderChannels({ zalo: true, email: true, telegram: true });
                            setIsReminderModalOpen(true);
                          }}
                          style={{
                            marginTop: '0.75rem',
                            width: '100%',
                            background: 'rgba(163, 20, 34, 0.08)',
                            border: '1px solid var(--color-primary-light)',
                            borderRadius: '10px',
                            padding: '8px 12px',
                            color: 'var(--color-primary)',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
                          }}
                          onMouseOver={e => {
                            e.currentTarget.style.background = 'var(--color-primary)';
                            e.currentTarget.style.color = '#ffffff';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 4px 10px rgba(163, 20, 34, 0.15)';
                          }}
                          onMouseOut={e => {
                            e.currentTarget.style.background = 'rgba(163, 20, 34, 0.08)';
                            e.currentTarget.style.color = 'var(--color-primary)';
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.style.boxShadow = 'none';
                          }}
                        >
                          <Bell size={12} />
                          {t('Nhắc lại thông báo')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
                ) : (
                  <div style={{ background: 'var(--color-bg)', padding: '1.5rem', borderRadius: 12, textAlign: 'center', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                    {t('Chưa có thông tin phân bổ cho Khách hàng này.')}
                  </div>
                )}
                {/* Reassignment section */}
                {canReassignLead && (
                  <div style={{ marginTop: '1.5rem', background: 'var(--color-bg)', padding: '1.25rem', borderRadius: 12, border: '1px solid var(--color-border)' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={16} color="var(--color-primary)" /> {t('Giao lại Tư vấn viên')}
                    </h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 12, lineHeight: 1.4 }}>
                      {t('Thay đổi người tiếp nhận (Không ảnh hưởng lượt chia).')}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <CustomSelect
                        options={[
                          { value: '', label: t('-- Chọn Tư vấn viên --') },
                          ...ensureArray(consultants)
                            .filter(c => c.name !== selectedLead?.assigned_to_name)
                            .map(c => ({
                              value: c.id.toString(),
                              label: c.name + (c.status === 'leave' ? ` (${t('Nghỉ phép')})` : Number(c.vacation_mode) === 1 ? ` (${t('Tạm ngưng')})` : c.status === 'inactive' ? ` (${t('Nghỉ việc')})` : ''),
                              avatar: c.avatar || undefined,
                              disabled: c.status !== 'active' || Number(c.vacation_mode) === 1,
                              disabledType: 'sale' as const
                            }))
                        ]}
                        value={reassignConsId}
                        onChange={val => setReassignConsId(val.toString())}
                        showAvatars={true}
                        searchable={true}
                        width="100%"
                        direction="up"
                      />
                      <button
                        className="btn primary"
                        onClick={() => setConfirmReassignOpen(true)}
                        disabled={isReassigning || !reassignConsId}
                        style={{ height: 38, background: 'var(--color-primary)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, padding: '0 1rem', fontSize: '0.875rem', fontWeight: 700, width: '100%' }}
                      >
                        {isReassigning ? <RefreshCw size={14} className="spin" /> : null}
                        {t('Xác nhận giao')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}
        </CustomModal>
      )}

      {confirmReassignOpen && (
        <CustomModal
          isOpen={confirmReassignOpen}
          onClose={() => { if (!isReassigning) setConfirmReassignOpen(false); }}
          title={t("Xác nhận Giao lại Lead")}
          width={500}
          disableClose={isReassigning}
          preventCloseOnBackdrop={isReassigning}
        >
        {confirmReassignOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: 'rgba(189, 29, 45, 0.08)',
                color: '#BD1D2D', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <p style={{ color: 'var(--color-text)', lineHeight: 1.6, fontSize: '0.9375rem', margin: 0 }}>
                  {t('Bạn có chắc chắn muốn chuyển quyền chăm sóc Lead')} <strong>"{selectedLead?.name}"</strong> {t('sang cho Tư vấn viên')} <strong>"{ensureArray(consultants).find(c => Number(c.id) === Number(reassignConsId))?.name}"</strong>?
                </p>
                {selectedLead?.assigned_to_name && selectedLead.assigned_to_name !== '-' && selectedLead.assigned_to_name !== t('Chưa phân bổ') && (
                  <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: 8, marginBottom: 0 }}>
                    {t('Tư vấn viên hiện tại:')} <strong>{selectedLead.assigned_to_name}</strong>. {t('Chọn hình thức giao lại:')}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <button className="btn outline" onClick={() => setConfirmReassignOpen(false)} disabled={isReassigning}>{t('Hủy')}</button>

              {selectedLead?.assigned_to_name && selectedLead.assigned_to_name !== '-' && selectedLead.assigned_to_name !== t('Chưa phân bổ') ? (
                <>
                  <button
                    className="btn secondary"
                    onClick={() => handleReassign(false)}
                    style={{ background: '#f59e0b', color: '#fff', border: 'none' }}
                    disabled={isReassigning}
                  >
                    {t('Giao lại luôn')}
                  </button>
                  <button
                    className="btn success"
                    onClick={() => handleReassign(true)}
                    style={{ background: '#10b981', color: '#fff', border: 'none' }}
                    disabled={isReassigning}
                  >
                    {t('Giao lại và bù vòng cho TVV')}
                  </button>
                </>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => handleReassign(false)}
                  disabled={isReassigning}
                >
                  {t('Xác nhận chuyển')}
                </button>
              )}
            </div>
          </div>
        )}
        </CustomModal>
      )}

      {confirmBlockOpen && (
        <CustomModal
          isOpen={confirmBlockOpen}
          onClose={() => {
            if (isBlocking) return;
            setConfirmBlockOpen(false);
            setBlockReason('');
            setCompensateBlock(false);
          }}
          title={t("Xác nhận Chặn & Blacklist")}
          width="550px"
          disableClose={isBlocking}
          preventCloseOnBackdrop={isBlocking}
        >
        {confirmBlockOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: 'var(--color-danger-light)',
                color: 'var(--color-danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <p style={{ color: 'var(--color-text)', lineHeight: 1.6, fontSize: '0.9375rem', fontWeight: 600, margin: 0 }}>
                  {t('Bạn có chắc chắn muốn chặn khách hàng')} "{selectedLead?.name}"?
                </p>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginTop: 4, marginBottom: 0 }}>
                  {t('Số điện thoại/Email của khách hàng sẽ được thêm vào Blacklist toàn cục để chặn nhận trùng trong tương lai.')}
                </p>
              </div>
            </div>

            {(!selectedLead?.phone || selectedLead.phone === '-') && (!selectedLead?.email || selectedLead.email === '-') && (
              <div style={{
                background: theme === 'dark' ? 'rgba(245, 158, 11, 0.14)' : '#fffbeb',
                border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.28)' : '1px solid #fde68a',
                borderRadius: '10px',
                padding: '0.75rem 1rem',
                color: 'var(--color-warning)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                <span>{t('Khách hàng này không có Số điện thoại hoặc Email. Thao tác sẽ đánh dấu Blacklist cho bản ghi hiện tại nhưng không tạo được rule chặn SĐT/Email tự động.')}</span>
              </div>
            )}

            {isTicketLead && (
              <div style={{
                background: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '12px',
                padding: '1rem',
                color: 'var(--color-danger)',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                lineHeight: 1.5,
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.08)'
              }}>
                <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  {t("Lead này đã có trạng thái Ticket và đã được bù rồi. Hệ thống sẽ chỉ đưa thông tin khách hàng này vào Blacklist và không thực hiện đền bù thêm lượt nào nữa.")}
                </div>
              </div>
            )}

            <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', padding: '1rem', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>{t('Hình thức chặn:')}</div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="blockType"
                  checked={!compensateBlock}
                  onChange={() => setCompensateBlock(false)}
                  style={{ marginTop: '3px' }}
                />
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{t('Chỉ đưa vào danh sách đen (Blacklist)')}</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>{t('Không thực hiện đền bù data cho Sale.')}</p>
                </div>
              </label>

              {(() => {
                const hasAssignedSale = Boolean(selectedLead?.assigned_to_name && selectedLead.assigned_to_name !== '-' && selectedLead.assigned_to_name !== t('Chưa phân bổ'));
                const disableComp = !hasAssignedSale || isTicketLead;
                return (
                  <>
                    <label style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      cursor: disableComp ? 'not-allowed' : 'pointer',
                      opacity: disableComp ? 0.5 : 1
                    }}>
                      <input
                        type="radio"
                        name="blockType"
                        checked={compensateBlock}
                        onChange={() => setCompensateBlock(true)}
                        disabled={disableComp}
                        style={{ marginTop: '3px' }}
                      />
                      <div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{t('Chặn và Bù vòng cho Sale')}</span>
                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '2px 0 0 0' }}>
                          {t('Đền bù 1 lượt data vòng')} <strong>"{selectedLead?.round_name}"</strong> {t('cho Sale')} <strong>"{selectedLead?.assigned_to_name}"</strong>.
                        </p>
                      </div>
                    </label>

                    {!hasAssignedSale && (
                      <div style={{ color: '#ea580c', fontSize: '0.75rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={12} /> {t('Lead chưa phân bổ cho Sale nào, không thể chọn hình thức Bù vòng.')}
                      </div>
                    )}

                    {isTicketLead && (
                      <div style={{ color: '#ea580c', fontSize: '0.75rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={12} /> {t('Lead đã có trạng thái Ticket (lỗi), không thể đền bù thêm khi chặn.')}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>{t('Lý do chặn')} <span style={{ color: 'var(--color-danger)' }}>*</span></label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                placeholder={t("Nhập lý do chặn (ví dụ: Số điện thoại ảo, khách không có nhu cầu, spam...)")}
                style={{
                  width: '100%',
                  height: '80px',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: '0.875rem',
                  outline: 'none',
                  resize: 'none'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                className="btn outline"
                onClick={() => {
                  setConfirmBlockOpen(false);
                  setBlockReason('');
                  setCompensateBlock(false);
                }}
                disabled={isBlocking}
              >
                {t('Hủy')}
              </button>
              <button
                className="btn danger"
                onClick={handleBlockLead}
                disabled={isBlocking || !blockReason.trim()}
                style={{ background: '#ef4444', color: '#fff', border: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                {isBlocking ? <RefreshCw size={14} className="spin" /> : null}
                {t('Xác nhận chặn')}
              </button>
            </div>
          </div>
        )}
        </CustomModal>
      )}

      {/* Day Details Modal */}
      {selectedDate !== null && (
        <CustomModal
          isOpen={selectedDate !== null}
          onClose={() => {
            setSelectedDate(null);
            setDayDetails(null);
            setActiveModalTab(getDefaultDayDetailsTab());
          }}
          title={`${t('Chi tiết hoạt động ngày')} ${selectedDate ? formatDisplayDate(selectedDate, language === 'vi' ? 'vi-VN' : 'en-US') : ''}`}
          width="1200px"
        >
        {selectedDate !== null && (
          <>
            {dayDetailsLoading ? (
              <div style={{ padding: '1rem' }}>
                <TableSkeleton rows={6} cols={4} />
              </div>
            ) : dayDetails ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '580px', margin: '-1.5rem', overflow: 'hidden' }}>
                {/* Modal Tabs — Chương V Segmented Control */}
                <div style={{
                  display: 'flex',
                  background: theme === 'dark' ? 'var(--color-bg)' : '#f1f5f9',
                  border: '1px solid var(--color-border)',
                  borderRadius: '10px',
                  padding: '3px',
                  gap: '2px',
                  flexShrink: 0,
                  margin: '1.5rem 1.5rem 1rem 1.5rem',
                  minHeight: '38px',
                  alignItems: 'center',
                  flexWrap: 'wrap'
                }}>
                  {!isAccountantUser && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveModalTab('sales')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '0 12px',
                          borderRadius: '7px',
                          border: 'none',
                          background: activeModalTab === 'sales' ? (theme === 'dark' ? 'var(--color-surface)' : '#ffffff') : 'transparent',
                          color: activeModalTab === 'sales' ? '#BD1D2D' : (theme === 'dark' ? 'var(--color-text-muted)' : '#64748b'),
                          fontSize: '0.8125rem',
                          fontWeight: activeModalTab === 'sales' ? 700 : 600,
                          boxShadow: activeModalTab === 'sales' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          height: '32px',
                          flex: 1
                        }}
                        className="modal-tab-button"
                      >
                        <span>{t('Phân bổ cho Sale')}</span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: activeModalTab === 'sales' ? (theme === 'dark' ? 'rgba(189, 29, 45, 0.16)' : 'rgba(189, 29, 45, 0.1)') : 'var(--color-border-light)',
                          color: activeModalTab === 'sales' ? '#BD1D2D' : 'var(--color-text-muted)',
                          padding: '1px 6px',
                          borderRadius: '5px'
                        }}>
                          {ensureArray(dayDetails.sales).length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveModalTab('tickets')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '0 12px',
                          borderRadius: '7px',
                          border: 'none',
                          background: activeModalTab === 'tickets' ? (theme === 'dark' ? 'var(--color-surface)' : '#ffffff') : 'transparent',
                          color: activeModalTab === 'tickets' ? '#BD1D2D' : (theme === 'dark' ? 'var(--color-text-muted)' : '#64748b'),
                          fontSize: '0.8125rem',
                          fontWeight: activeModalTab === 'tickets' ? 700 : 600,
                          boxShadow: activeModalTab === 'tickets' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          height: '32px',
                          flex: 1
                        }}
                        className="modal-tab-button"
                      >
                        <span>{t('Ticket Lỗi')}</span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: activeModalTab === 'tickets' ? (theme === 'dark' ? 'rgba(189, 29, 45, 0.16)' : 'rgba(189, 29, 45, 0.1)') : 'var(--color-border-light)',
                          color: activeModalTab === 'tickets' ? '#BD1D2D' : 'var(--color-text-muted)',
                          padding: '1px 6px',
                          borderRadius: '5px'
                        }}>
                          {ensureArray(dayDetails.tickets).length}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActiveModalTab('blacklist')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '0 12px',
                          borderRadius: '7px',
                          border: 'none',
                          background: activeModalTab === 'blacklist' ? (theme === 'dark' ? 'var(--color-surface)' : '#ffffff') : 'transparent',
                          color: activeModalTab === 'blacklist' ? '#BD1D2D' : (theme === 'dark' ? 'var(--color-text-muted)' : '#64748b'),
                          fontSize: '0.8125rem',
                          fontWeight: activeModalTab === 'blacklist' ? 700 : 600,
                          boxShadow: activeModalTab === 'blacklist' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          height: '32px',
                          flex: 1
                        }}
                        className="modal-tab-button"
                      >
                        <span>{t('Blacklist & Lỗi Hệ Thống')}</span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: activeModalTab === 'blacklist' ? (theme === 'dark' ? 'rgba(189, 29, 45, 0.16)' : 'rgba(189, 29, 45, 0.1)') : 'var(--color-border-light)',
                          color: activeModalTab === 'blacklist' ? '#BD1D2D' : 'var(--color-text-muted)',
                          padding: '1px 6px',
                          borderRadius: '5px'
                        }}>
                          {ensureArray(dayDetails.blacklist_logs).length}
                        </span>
                      </button>
                    </>
                  )}
                  {canViewFinanceCalendar && (
                    <>
                      <button
                        type="button"
                        onClick={() => setActiveModalTab('po')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '0 12px',
                          borderRadius: '7px',
                          border: 'none',
                          background: activeModalTab === 'po' ? (theme === 'dark' ? 'var(--color-surface)' : '#ffffff') : 'transparent',
                          color: activeModalTab === 'po' ? '#BD1D2D' : (theme === 'dark' ? 'var(--color-text-muted)' : '#64748b'),
                          fontSize: '0.8125rem',
                          fontWeight: activeModalTab === 'po' ? 700 : 600,
                          boxShadow: activeModalTab === 'po' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          height: '32px',
                          flex: 1
                        }}
                        className="modal-tab-button"
                      >
                        <span>{t('PO (Chi phí)')}</span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: activeModalTab === 'po' ? (theme === 'dark' ? 'rgba(189, 29, 45, 0.16)' : 'rgba(189, 29, 45, 0.1)') : 'var(--color-border-light)',
                          color: activeModalTab === 'po' ? '#BD1D2D' : 'var(--color-text-muted)',
                          padding: '1px 6px',
                          borderRadius: '5px'
                        }}>
                          {ensureArray(dayDetails.expenses).filter((e: any) => Number(e.amount || 0) > 0).length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveModalTab('so')}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          padding: '0 12px',
                          borderRadius: '7px',
                          border: 'none',
                          background: activeModalTab === 'so' ? (theme === 'dark' ? 'var(--color-surface)' : '#ffffff') : 'transparent',
                          color: activeModalTab === 'so' ? '#BD1D2D' : (theme === 'dark' ? 'var(--color-text-muted)' : '#64748b'),
                          fontSize: '0.8125rem',
                          fontWeight: activeModalTab === 'so' ? 700 : 600,
                          boxShadow: activeModalTab === 'so' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          height: '32px',
                          flex: 1
                        }}
                        className="modal-tab-button"
                      >
                        <span>{t('SO (Doanh thu)')}</span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          background: activeModalTab === 'so' ? (theme === 'dark' ? 'rgba(189, 29, 45, 0.16)' : 'rgba(189, 29, 45, 0.1)') : 'var(--color-border-light)',
                          color: activeModalTab === 'so' ? '#BD1D2D' : 'var(--color-text-muted)',
                          padding: '1px 6px',
                          borderRadius: '5px'
                        }}>
                          {ensureArray(dayDetails.invoices).length}
                        </span>
                      </button>
                    </>
                  )}
                </div>

                {/* Modal Content */}
                <div style={{ padding: '0 1.5rem 1.5rem 1.5rem', flex: 1, overflowY: 'auto' }}>
                  {activeModalTab === 'sales' && (
                    <div>
                      {ensureArray(dayDetails.sales).length > 0 ? (
                        <div className="premium-table-container">
                          <table className="premium-table">
                            <thead>
                              <tr>
                                <th style={{ width: '45%' }}>{t('Tư vấn viên')}</th>
                                <th style={{ width: '25%' }}>{t('Vòng')}</th>
                                <th style={{ width: '15%' }}>{t('Trạng thái')}</th>
                                <th style={{ width: '15%', textAlign: 'right' }}>{t('Số lượng data')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(() => {
                                const groupedSales: Record<string, {
                                  sale_name: string;
                                  sale_avatar?: string;
                                  items: any[];
                                  totalCount: number;
                                }> = {};

                                ensureArray(dayDetails?.sales).forEach((item: any) => {
                                  const name = item.sale_name || t('Chưa phân bổ');
                                  if (!groupedSales[name]) {
                                    groupedSales[name] = {
                                      sale_name: name,
                                      sale_avatar: item.sale_avatar,
                                      items: [],
                                      totalCount: 0
                                    };
                                  }
                                  groupedSales[name].items.push(item);
                                  groupedSales[name].totalCount += Number(item.count) || 0;
                                });

                                const sortedGroupedNames = Object.keys(groupedSales).sort((a, b) => {
                                  const isUnassignedA = a === 'Chưa phân bổ' || a === 'Unassigned' || a === '';
                                  const isUnassignedB = b === 'Chưa phân bổ' || b === 'Unassigned' || b === '';
                                  if (isUnassignedA && !isUnassignedB) return 1;
                                  if (!isUnassignedA && isUnassignedB) return -1;
                                  return a.localeCompare(b, 'vi');
                                });

                                return sortedGroupedNames.map((name) => {
                                  const group = groupedSales[name];
                                  const isExpanded = !!expandedSales[name];

                                  const sortedItems = [...group.items].sort((a, b) => {
                                    const roundA = a.status === 'reminder' ? 'REMINDER' : (a.round_name || '');
                                    const roundB = b.status === 'reminder' ? 'REMINDER' : (b.round_name || '');
                                    return roundA.localeCompare(roundB, 'vi');
                                  });

                                  return (
                                    <Fragment key={name}>
                                      {/* Collapsible Header Row */}
                                      <tr
                                        onClick={() => toggleExpandSale(name)}
                                        style={{
                                          background: 'var(--color-bg-light)',
                                          cursor: 'pointer',
                                          fontWeight: 600,
                                          borderBottom: '1px solid var(--color-border)'
                                        }}
                                      >
                                        <td>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', paddingLeft: '4px' }}>
                                            <span style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              transition: 'transform 0.2s',
                                              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                              color: 'var(--color-text-muted)',
                                              marginRight: '2px'
                                            }}>
                                              <ChevronRight size={16} />
                                            </span>
                                            <Avatar src={group.sale_avatar || undefined} name={group.sale_name} size={30} />
                                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                                              {group.sale_name}
                                            </span>
                                            <span style={{
                                              fontSize: '0.7rem',
                                              background: 'var(--color-border-light)',
                                              color: 'var(--color-text-light)',
                                              padding: '2px 6px',
                                              borderRadius: '10px',
                                              marginLeft: '6px',
                                              fontWeight: 600
                                            }}>
                                              {group.items.length} {t('nhóm')}
                                            </span>
                                          </div>
                                        </td>
                                        <td style={{ color: 'var(--color-text-light)', fontSize: '0.75rem', fontWeight: 500 }}>
                                          {isExpanded ? '' : t('Nhấp để xem chi tiết')}
                                        </td>
                                        <td></td>
                                        <td style={{ textAlign: 'right', paddingRight: '1rem' }}>
                                          <span style={{ fontWeight: 800, color: 'var(--color-primary)', fontSize: '0.95rem' }}>
                                            {group.totalCount}
                                          </span>
                                        </td>
                                      </tr>

                                      {/* Detail Rows when expanded */}
                                      {isExpanded && sortedItems.map((item: any, idx: number) => {
                                        const isReminder = item.status === 'reminder';
                                        const roundDisplay = isReminder ? 'REMINDER' : (item.round_name || '-');

                                        return (
                                          <tr key={`${name}_${idx}`} style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border-light)' }}>
                                            <td style={{ paddingLeft: '2.5rem' }}>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)', fontSize: '0.825rem' }}>
                                                <span style={{ opacity: 0.5 }}>└─</span>
                                                <span>{t('Phân bổ trong vòng')}</span>
                                              </div>
                                            </td>
                                            <td>
                                                <span style={{
                                                background: isReminder ? 'rgba(245, 158, 11, 0.12)' : 'var(--color-primary-light)',
                                                color: isReminder ? '#b45309' : 'var(--color-primary)',
                                                padding: '4px 8px',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600
                                              }}>
                                                {roundDisplay}
                                              </span>
                                            </td>
                                            <td>{getStatusBadge(item.status)}</td>
                                            <td style={{ textAlign: 'right', paddingRight: '1rem' }}>
                                              <span style={{ fontWeight: 700, color: 'var(--color-text)', fontSize: '0.9rem' }}>
                                                {item.count}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </Fragment>
                                  );
                                });
                              })()}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--color-text-muted)', background: 'var(--color-surface)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                          <User size={40} style={{ marginBottom: 12, color: 'var(--color-text-muted)', opacity: 0.6 }} />
                          <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{t('Không có lịch sử chia data cho tư vấn viên nào vào ngày này.')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeModalTab === 'tickets' && (
                    <div>
                      {ensureArray(dayDetails?.tickets).length > 0 ? (
                        <div className="premium-table-container">
                          <table className="premium-table">
                            <thead>
                              <tr>
                                <th style={{ width: '25%' }}>{t('Khách hàng')}</th>
                                <th style={{ width: '22%' }}>{t('Tư vấn viên báo cáo')}</th>
                                <th style={{ width: '28%' }}>{t('Lý do lỗi')}</th>
                                <th style={{ width: '13%' }}>{t('Trạng thái')}</th>
                                <th style={{ width: '12%', textAlign: 'right' }}>{t('Thời gian báo')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ensureArray(dayDetails?.tickets).map((item: any, idx: number) => {
                                const canUnmaskInModal = isSysAdmin || isExecUser;
                                const showPhone = canUnmaskInModal ? item.phone : maskPhone(item.phone);
                                return (
                                  <tr key={idx}>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Avatar name={item.lead_name || t('Khách hàng')} size={32} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                          <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.875rem' }}>{item.lead_name}</span>
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--color-text-light)' }}>
                                            <Phone size={11} style={{ opacity: 0.6 }} />
                                            {showPhone}
                                          </span>
                                        </div>
                                      </div>
                                    </td>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Avatar src={item.sale_avatar || undefined} name={item.sale_name || t('TVV')} size={28} aiScreened={!!(item.ai_screener_status && item.ai_screener_status !== 'not_screened')} />
                                        <span style={{ fontWeight: 500, color: 'var(--color-text)', fontSize: '0.85rem' }}>{item.sale_name}</span>
                                      </div>
                                    </td>
                                    <td>
                                      <div style={{
                                        fontSize: '0.8125rem',
                                        color: 'var(--color-text-light)',
                                        lineHeight: 1.4,
                                        maxWidth: '240px',
                                        wordBreak: 'break-word',
                                        whiteSpace: 'normal'
                                      }}>
                                        {item.reason}
                                      </div>
                                    </td>
                                    <td>
                                      {item.status === 'pending' && <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', border: '1px solid rgba(245, 158, 11, 0.2)' }}>{t('Chờ duyệt')}</span>}
                                      {item.status === 'approved' && <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: 'var(--color-success-light)', color: 'var(--color-success)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>{t('Đã duyệt')}</span>}
                                      {item.status === 'approved_no_comp' && <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>{t('Đã duyệt (Không bù)')}</span>}
                                      {item.status === 'rejected' && <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: '0.72rem', fontWeight: 600, background: 'var(--color-danger-light)', color: 'var(--color-danger)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{t('Từ chối')}</span>}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                        <Clock size={11} style={{ opacity: 0.6 }} />
                                        <span>{item.created_at ? item.created_at.split(' ')[1] || item.created_at : ''}</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--color-text-muted)', background: 'var(--color-surface)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                          <AlertTriangle size={40} style={{ marginBottom: 12, color: 'var(--color-text-muted)', opacity: 0.6 }} />
                          <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{t('Không có báo cáo ticket lỗi dữ liệu nào trong ngày này.')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeModalTab === 'blacklist' && (
                    <div>
                      {ensureArray(dayDetails?.blacklist_logs).length > 0 ? (
                        <div className="premium-table-container">
                          <table className="premium-table">
                            <thead>
                              <tr>
                                <th style={{ width: '32%' }}>{t('Khách hàng')}</th>
                                <th style={{ width: '13%' }}>{t('Loại')}</th>
                                <th style={{ width: '43%' }}>{t('Thông điệp hệ thống')}</th>
                                <th style={{ width: '12%', textAlign: 'right' }}>{t('Thời gian')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {ensureArray(dayDetails?.blacklist_logs).map((item: any, idx: number) => {
                                const canUnmaskInModal = isSysAdmin || isExecUser;
                                const showPhone = canUnmaskInModal ? item.phone : maskPhone(item.phone);
                                const showEmail = canUnmaskInModal ? item.email : maskEmail(item.email);
                                return (
                                  <tr key={idx}>
                                    <td>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <Avatar name={item.lead_name || t('Khách hàng')} size={32} />
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                          <span style={{ fontWeight: 600, color: 'var(--color-text)', fontSize: '0.875rem' }}>{item.lead_name}</span>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {showPhone && showPhone !== '-' && (
                                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--color-text-light)' }}>
                                                <Phone size={10} style={{ opacity: 0.6 }} />
                                                {showPhone}
                                              </span>
                                            )}
                                            {showEmail && showEmail !== '-' && (
                                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--color-text-light)' }}>
                                                <Mail size={10} style={{ opacity: 0.6 }} />
                                                {showEmail}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </td>
                                    <td>{getStatusBadge(item.status)}</td>
                                    <td>
                                      <div style={{
                                        fontSize: '0.8125rem',
                                        color: 'var(--color-text-light)',
                                        lineHeight: 1.4,
                                        maxWidth: '360px',
                                        wordBreak: 'break-word',
                                        whiteSpace: 'normal'
                                      }}>
                                        {item.message}
                                      </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                                        <Clock size={11} style={{ opacity: 0.6 }} />
                                        <span>{item.received_at ? item.received_at.split(' ')[1] || item.received_at : ''}</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '3.5rem 1.5rem', color: 'var(--color-text-muted)', background: 'var(--color-surface)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                          <ShieldAlert size={40} style={{ marginBottom: 12, color: 'var(--color-text-muted)', opacity: 0.6 }} />
                          <p style={{ fontSize: '0.875rem', fontWeight: 500 }}>{t('Không phát hiện trường hợp Blacklist hay Lỗi hệ thống nào vào ngày này.')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeModalTab === 'so' && (() => {
                    const allSoRows = ensureArray(dayDetails?.invoices);
                    const soInvoiceRows = allSoRows.filter((r: any) => !isDepositMilestoneRow(r));
                    const milestoneRows = allSoRows.filter((r: any) => isDepositMilestoneRow(r));
                    const soTotalVal = soInvoiceRows.reduce((acc: number, r: any) => acc + Number(r.total || 0), 0);
                    const milestoneTotalVal = milestoneRows.reduce((acc: number, r: any) => acc + Number(r.total || 0), 0);

                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '0.78rem', fontVariantNumeric: 'tabular-nums' }}>
                            <span style={{ padding: '4px 10px', borderRadius: '8px', background: theme === 'dark' ? 'rgba(189, 29, 45, 0.14)' : 'rgba(189, 29, 45, 0.08)', color: '#BD1D2D', fontWeight: 700, border: '1px solid rgba(189, 29, 45, 0.2)' }}>
                              {t('Hóa đơn SO')}: {soInvoiceRows.length} ({formatMoney(soTotalVal)})
                            </span>
                            {milestoneRows.length > 0 && (
                              <span style={{ padding: '4px 10px', borderRadius: '8px', background: 'var(--color-bg)', color: 'var(--color-text)', fontWeight: 700, border: '1px solid var(--color-border)' }}>
                                {t('Mốc đặt cọc')}: {milestoneRows.length} ({formatMoney(milestoneTotalVal)})
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            className="btn primary"
                            onClick={() => {
                              useUIStore.getState().setShowPOS(true);
                            }}
                            style={{ height: '32px', padding: '0 0.85rem', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Plus size={14} />
                            {t('Tạo SO mới')}
                          </button>
                        </div>
                        {allSoRows.length > 0 ? (
                          <div className="premium-table-container">
                            <table className="premium-table">
                              <thead>
                                <tr>
                                  <th>{t('Mã đơn / Mốc thu')}</th>
                                  <th>{t('Khách hàng')}</th>
                                  <th>{t('Giá trị')}</th>
                                  <th>{t('Trạng thái')}</th>
                                  <th>{t('Ngày tạo')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {allSoRows.map((item: any, idx: number) => {
                                  const isMilestone = isDepositMilestoneRow(item);
                                  return (
                                    <tr key={`${item.entity_type || (isMilestone ? 'm' : 'i')}_${item.id || idx}`} onClick={() => handleOpenSO(item)} style={{ cursor: 'pointer' }}>
                                      <td>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                                          <strong style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>{item.invoice_number || `#${item.id}`}</strong>
                                          <span style={{
                                            fontSize: '0.68rem',
                                            fontWeight: 600,
                                            color: isMilestone ? 'var(--color-text-muted)' : '#BD1D2D'
                                          }}>
                                            {isMilestone ? t('Mốc đặt cọc') : t('Hóa đơn SO')}
                                          </span>
                                        </div>
                                      </td>
                                      <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <Avatar
                                            src={item.customer_avatar || undefined}
                                            name={item.customer_name || item.contact_name || t('Khách hàng')}
                                            size={24}
                                          />
                                          <span style={{ fontWeight: 550, color: 'var(--color-text)' }}>{item.customer_name || item.contact_name || 'N/A'}</span>
                                        </div>
                                      </td>
                                      <td>
                                        <strong style={{ color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                                          {formatMoney(item.total || 0, item.currency)}
                                        </strong>
                                      </td>
                                      <td>
                                        <span className={`badge ${item.status === 'paid' ? 'success' : item.status === 'overdue' ? 'danger' : 'warning'}`}>
                                          {item.status === 'paid' ? t('Đã thanh toán') : item.status === 'overdue' ? t('Quá hạn') : t('Chờ thanh toán')}
                                        </span>
                                      </td>
                                      <td>{formatDisplayDate(item.issue_date, language === 'vi' ? 'vi-VN' : 'en-US')}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-surface)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                            {t('Không có Sales Order nào trong ngày này.')}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {activeModalTab === 'po' && (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                        <button
                          type="button"
                          className="btn primary"
                          onClick={() => {
                            setSelectedExpenseDate(selectedDate ? getLocalDateStr(selectedDate) : getLocalDateStr());
                            setShowCreateExpenseModal(true);
                          }}
                          style={{ height: '32px', padding: '0 0.85rem', fontSize: '0.78rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                          <Plus size={14} />
                          {t('Nhập chi phí mới')}
                        </button>
                      </div>

                      {(() => {
                        const poList = ensureArray(dayDetails?.expenses).filter((item: any) => Number(item.amount || 0) > 0);
                        return poList.length > 0 ? (
                        <div className="premium-table-container">
                          <table className="premium-table">
                            <thead>
                              <tr>
                                <th style={{ width: '105px', minWidth: '95px', whiteSpace: 'nowrap' }}>{t('Mã phiếu / Ngày')}</th>
                                <th style={{ width: '170px', minWidth: '150px' }}>{t('Người đề xuất')}</th>
                                <th>{t('Tiêu đề chi phí')}</th>
                                <th style={{ whiteSpace: 'nowrap', width: '130px' }}>{t('Số tiền')}</th>
                                <th style={{ minWidth: '220px' }}>{t('Các bước & Người liên quan')}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {poList.map((item: any, idx: number) => (
                                <tr key={item.id || idx} onClick={() => handleOpenPO(item.id)} style={{ cursor: 'pointer' }}>
                                  {/* 1. Mã phiếu / Ngày lập (ngắn gọn) */}
                                  <td style={{ width: '105px', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }}>
                                      <strong style={{ color: 'var(--color-primary)', textDecoration: 'underline', fontSize: '0.8rem' }}>#EXP-{item.id}</strong>
                                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                                        {formatDisplayDate(item.date, language === 'vi' ? 'vi-VN' : 'en-US')}
                                      </span>
                                    </div>
                                  </td>

                                  {/* 2. Người đề xuất (kế cột mã) */}
                                  <td style={{ verticalAlign: 'middle', width: '170px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <Avatar name={item.creator_name || t('Nhân sự')} src={item.creator_avatar || undefined} size={24} />
                                      <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>{item.creator_name || 'N/A'}</span>
                                    </div>
                                  </td>

                                  {/* 3. Tiêu đề chi phí */}
                                  <td>
                                    <span style={{ fontSize: '0.84rem', color: 'var(--color-text)', fontWeight: 500 }}>
                                      {item.title}
                                    </span>
                                  </td>

                                  {/* 4. Số tiền */}
                                  <td style={{ whiteSpace: 'nowrap', verticalAlign: 'middle' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <strong style={{ color: 'var(--color-text)', fontSize: '0.85rem', fontVariantNumeric: 'tabular-nums' }}>
                                        {formatMoney(item.amount || 0, item.currency)}
                                      </strong>
                                      {Boolean(item.is_refunded) && (
                                        <span style={{ fontSize: '0.68rem', color: '#10b981', fontWeight: 600 }}>
                                          ✓ {t('Đã thanh toán')}
                                        </span>
                                      )}
                                    </div>
                                  </td>

                                  {/* 5. Trạng thái: Style UI step bên Quy trình */}
                                  <td style={{ verticalAlign: 'middle', minWidth: '220px' }}>
                                    {renderWorkflowStepsAndWatchers(item)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', background: 'var(--color-surface)', borderRadius: '12px', border: '1px dashed var(--color-border)' }}>
                          {t('Không có phiếu chi phí tài chính nào trong ngày này')}
                        </div>
                      );
                      })()}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  padding: '1rem 1.5rem',
                  borderTop: '1px solid var(--color-border-light)',
                  background: 'var(--color-bg)',
                  flexShrink: 0
                }}>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setSelectedDate(null);
                      setDayDetails(null);
                      setActiveModalTab(getDefaultDayDetailsTab());
                    }}
                  >
                    {t('Đóng')}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                {t('Có lỗi xảy ra khi hiển thị chi tiết.')}
              </div>
            )}
          </>
        )}
        </CustomModal>
      )}

      {/* Reminder Confirmation Modal */}
      {isReminderModalOpen && selectedLead && (
        <CustomModal
          isOpen={isReminderModalOpen}
          onClose={() => { if (!isSendingReminder) setIsReminderModalOpen(false); }}
          title={t("Xác nhận nhắc lại cho Tư vấn viên")}
          width="480px"
          disableClose={isSendingReminder}
          preventCloseOnBackdrop={isSendingReminder}
        >
        {isReminderModalOpen && selectedLead && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.5rem 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <Avatar
                src={selectedLead.assigned_to_avatar || undefined}
                name={selectedLead.assigned_to_name}
                size={44}
              />
              <div>
                <p style={{ color: 'var(--color-text)', lineHeight: 1.6, fontSize: '0.9375rem', margin: 0, fontWeight: 500 }}>
                  {t('Gửi thông báo nhắc nhở chăm sóc khách hàng')} <strong>"{selectedLead.name}"</strong> {t('đến Tư vấn viên')} <strong>"{selectedLead.assigned_to_name}"</strong>.
                </p>
              </div>
            </div>

            <div style={{
              background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
              border: '1px solid var(--color-border-light)',
              borderRadius: '12px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {t('Kênh nhận thông báo:')}
              </span>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src="https://stc-zpl.zdn.vn/favicon.ico"
                    alt="Zalo"
                    style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: '50%' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>Zalo Bot Message</span>
                </div>
                <ToggleSwitch
                  checked={reminderChannels.zalo}
                  onChange={checked => setReminderChannels({ ...reminderChannels, zalo: checked })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src="/imgs/gmail-icon-free-png.webp"
                    alt="Gmail"
                    style={{ width: 16, height: 16, objectFit: 'contain' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>Gmail SMTP Notification</span>
                </div>
                <ToggleSwitch
                  checked={reminderChannels.email}
                  onChange={checked => setReminderChannels({ ...reminderChannels, email: checked })}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg"
                    alt="Telegram"
                    style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: '50%' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>Telegram Bot Message</span>
                </div>
                <ToggleSwitch
                  checked={reminderChannels.telegram}
                  onChange={checked => setReminderChannels({ ...reminderChannels, telegram: checked })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '0.5rem' }}>
              <button
                className="btn outline"
                onClick={() => setIsReminderModalOpen(false)}
                disabled={isSendingReminder}
                style={{
                  borderRadius: '10px',
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  transition: 'all 0.2s'
                }}
              >
                {t('Hủy')}
              </button>
              <button
                className="btn primary"
                onClick={handleSendReminder}
                disabled={isSendingReminder || (!reminderChannels.zalo && !reminderChannels.email && !reminderChannels.telegram)}
                style={{
                  borderRadius: '10px',
                  padding: '8px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, var(--color-primary) 0%, #8a0f1b 100%)',
                  boxShadow: '0 4px 12px rgba(163, 20, 34, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.25s'
                }}
                onMouseOver={e => {
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 6px 15px rgba(163, 20, 34, 0.3)';
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(163, 20, 34, 0.2)';
                }}
              >
                {isSendingReminder ? <RefreshCw size={14} className="spin" /> : <Bell size={14} />}
                {isSendingReminder ? t('Đang gửi...') : t('Xác nhận')}
              </button>
            </div>
          </div>
        )}
        </CustomModal>
      )}

      {showInfoModal && (
        <CustomModal
          isOpen={showInfoModal}
          onClose={() => setShowInfoModal(false)}
          title={t("Ý nghĩa các Trạng thái Data")}
          width="800px"
        >
        <div style={{ padding: '0.25rem 0', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', margin: 0, lineHeight: 1.5 }}>
            {t("Hệ thống tự động phân loại dữ liệu khách hàng theo các trạng thái dưới đây nhằm đảm bảo tính tối ưu, minh bạch và công bằng cho đội ngũ Tư vấn viên (TVV).")}
          </p>

          {/* Group 1: Active & Distributed */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ 
              fontSize: '0.9rem', 
              fontWeight: 700, 
              color: 'var(--color-success)', 
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--color-border-light)'
            }}>
              <CheckCircle2 size={16} /> {t("1. Hoạt động & Phân bổ")}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }} className="responsive-grid-1">
              {/* assigned */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : '#e6f4ea',
                  color: theme === 'dark' ? '#34d399' : '#137333',
                  border: theme === 'dark' ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid #ceead6',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <CheckCircle2 size={12} />
                  {t("Đã chia (assigned)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Data được phân bổ thành công cho TVV thông qua cơ chế xoay vòng (Round-Robin) tự động.")}
                </span>
              </div>

              {/* compensation */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(189, 29, 45, 0.15)' : '#fff0f3',
                  color: theme === 'dark' ? '#fb7185' : '#8a0f1b',
                  border: theme === 'dark' ? '1px solid rgba(189, 29, 45, 0.25)' : '1px solid #fecdd3',
                  padding: '4px 8px',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 600
                }}>
                  <Scale size={12} />
                  {t("Data Bù (compensation)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Lượt đền bù tự động giao cho TVV để trả nợ data lỗi đã được duyệt. Luôn có độ ưu tiên cao nhất hàng đợi.")}
                </span>
              </div>

              {/* reminder */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
                  color: theme === 'dark' ? '#fbbf24' : '#b45309',
                  border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid #fde68a',
                  padding: '4px 8px',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 600
                }}>
                  <Bell size={12} />
                  {t("Nhắc lại (reminder)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Khách hàng cũ đăng ký lại. Hệ thống tự động chuyển thẳng cho TVV đã chăm sóc trước đó để tiếp tục theo dõi.")}
                </span>
              </div>

              {/* fallback */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(249, 115, 22, 0.15)' : '#fff7ed',
                  color: theme === 'dark' ? '#fb923c' : '#c2410c',
                  border: theme === 'dark' ? '1px solid rgba(249, 115, 22, 0.25)' : '1px solid #ffedd5',
                  padding: '4px 8px',
                  borderRadius: '8px',
                  fontSize: '0.72rem',
                  fontWeight: 600
                }}>
                  <AlertTriangle size={12} />
                  {t("Dự phòng (fallback)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Phân bổ khẩn cấp cho TVV được chỉ định làm dự phòng khi vòng không tìm được TVV nào sẵn sàng nhận số.")}
                </span>
              </div>
            </div>
          </div>

          {/* Group 2: Queue & Verification */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ 
              fontSize: '0.9rem', 
              fontWeight: 700, 
              color: 'var(--color-warning)', 
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--color-border-light)'
            }}>
              <Clock size={16} /> {t("2. Hàng đợi & Kiểm duyệt")}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }} className="responsive-grid-1">
              {/* pending */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(59, 130, 246, 0.15)' : '#e8f0fe',
                  color: theme === 'dark' ? '#60a5fa' : '#1a73e8',
                  border: theme === 'dark' ? '1px solid rgba(59, 130, 246, 0.25)' : '1px solid #d2e3fc',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <Clock size={12} />
                  {t("Chờ chia (pending)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Data đang nằm trong hàng đợi phân phối, chờ đến lượt của thuật toán chia số tiếp theo.")}
                </span>
              </div>

              {/* pending_work_hours */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(6, 182, 212, 0.15)' : '#ecfeff',
                  color: theme === 'dark' ? '#22d3ee' : '#0f766e',
                  border: theme === 'dark' ? '1px solid rgba(6, 182, 212, 0.25)' : '1px solid #cffafe',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <Calendar size={12} />
                  {t("Chờ giờ làm (pending_work_hours)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Data đổ về ngoài khung giờ làm việc. Hệ thống sẽ giữ lại và tự động chia khi bắt đầu ca làm việc.")}
                </span>
              </div>

              {/* pending_approval */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start',
                gridColumn: 'span 2'
              }} className="span-full-mobile">
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(245, 158, 11, 0.15)' : '#fffbeb',
                  color: theme === 'dark' ? '#fbbf24' : '#b45309',
                  border: theme === 'dark' ? '1px solid rgba(245, 158, 11, 0.25)' : '1px solid #fef3c7',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <ShieldAlert size={12} />
                  {t("Tạm giữ / Chờ AI đánh giá (pending_approval)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Data có yếu tố nghi vấn về chất lượng hoặc đang trong hàng đợi xử lý sàng lọc của AI (Gatekeeper). Nếu đạt chuẩn sẽ được chia tiếp, nếu dưới chuẩn sẽ bị từ chối chuyển sang trạng thái Dưới chuẩn.")}
                </span>
              </div>
            </div>
          </div>

          {/* Group 3: Filtered & Blocked */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ 
              fontSize: '0.9rem', 
              fontWeight: 700, 
              color: 'var(--color-danger)', 
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--color-border-light)'
            }}>
              <XCircle size={16} /> {t("3. Lọc bỏ & Chặn")}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }} className="responsive-grid-1">
              {/* rejected */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : '#fce8e6',
                  color: theme === 'dark' ? '#f87171' : '#c5221f',
                  border: theme === 'dark' ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid #fad2cf',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <XCircle size={12} />
                  {t("Dưới chuẩn (rejected)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Data bị hệ thống AI hoặc Admin từ chối do không đủ tiêu chuẩn tối thiểu (sai chuyên ngành, học sinh cấp 3, không nhu cầu thực tế...).")}
                </span>
              </div>

              {/* blacklisted */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(220, 38, 38, 0.15)' : '#fee2e2',
                  color: theme === 'dark' ? '#fca5a5' : '#991b1b',
                  border: theme === 'dark' ? '1px solid rgba(220, 38, 38, 0.25)' : '1px solid #fca5a5',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <AlertTriangle size={12} />
                  {t("Blacklist (blacklisted)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Số điện thoại rác, spam hoặc quấy phá nằm trong danh sách đen bị chặn vĩnh viễn, không bao giờ được chia.")}
                </span>
              </div>

              {/* duplicate */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(100, 116, 139, 0.15)' : '#f1f5f9',
                  color: theme === 'dark' ? '#94a3b8' : '#475569',
                  border: theme === 'dark' ? '1px solid rgba(100, 116, 139, 0.25)' : '1px solid #e2e8f0',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <Copy size={12} />
                  {t("Trùng lặp (duplicate)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Data bị trùng lặp thông tin liên hệ với khách hàng đã tồn tại trong hệ thống.")}
                </span>
              </div>

              {/* rule_6_month */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(100, 116, 139, 0.15)' : '#f1f5f9',
                  color: theme === 'dark' ? '#94a3b8' : '#475569',
                  border: theme === 'dark' ? '1px solid rgba(100, 116, 139, 0.25)' : '1px solid #e2e8f0',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <Calendar size={12} />
                  {t("Quy định 6 tháng (rule_6_month)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Áp dụng quy tắc chặn hoặc điều hướng đặc biệt đối với khách hàng đăng ký lại trong vòng 6 tháng gần nhất.")}
                </span>
              </div>

              {/* silent */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start',
                gridColumn: 'span 2'
              }} className="span-full-mobile">
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: theme === 'dark' ? 'rgba(100, 116, 139, 0.15)' : '#f1f5f9',
                  color: theme === 'dark' ? '#94a3b8' : '#475569',
                  border: theme === 'dark' ? '1px solid rgba(100, 116, 139, 0.25)' : '1px solid #e2e8f0',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <RefreshCw size={12} />
                  {t("Chỉ đồng bộ (silent)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Data được đẩy vào phục vụ mục đích ghi nhận lịch sử, đối soát hoặc thống kê của hệ thống tiếp thị mà không tham gia vào luồng chia số.")}
                </span>
              </div>
            </div>
          </div>

          {/* Group 4: Security & Deposit Cancellation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h4 style={{ 
              fontSize: '0.9rem', 
              fontWeight: 700, 
              color: 'var(--color-primary)', 
              margin: 0,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              paddingBottom: '6px',
              borderBottom: '1px solid var(--color-border-light)'
            }}>
              <ShieldAlert size={16} /> {t("4. Bảo mật & Bể cọc (Deposit Cancellation)")}
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem' }} className="responsive-grid-1">
              {/* security clock */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(245, 158, 11, 0.1)',
                  color: 'var(--color-warning)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <Clock size={12} />
                  {t("Đồng hồ Bảo mật (Inactivity Expiration)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("Thời hạn chăm sóc bắt buộc cho từng TVV. Nếu hết thời gian mà TVV không tương tác ghi nhận hoạt động (gọi điện, gặp mặt, tạo note), data sẽ bị tự động thu hồi trả về Databank chung (Thời gian bảo mật Booking: ")}
                  <strong>{sysSettings?.security_timer_booking || 120} {t("giờ")}</strong>
                  {t(", Đã Gặp: ")}
                  <strong>{sysSettings?.security_timer_da_gap || 72} {t("giờ")}</strong>
                  {t(").")}
                </span>
              </div>

              {/* deposit cancellation */}
              <div style={{
                background: theme === 'dark' ? 'rgba(255, 255, 255, 0.02)' : '#f8fafc',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                padding: '0.85rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'flex-start'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  color: 'var(--color-danger)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  padding: '3px 8px',
                  borderRadius: '12px',
                  fontSize: '0.72rem',
                  fontWeight: 700
                }}>
                  <AlertTriangle size={12} />
                  {t("Cơ chế Bể cọc (Cancellation Rules)")}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
                  {t("• Chưa có doanh thu: Hạ trạng thái về Booking/Đã Gặp, kích hoạt lại đồng hồ bảo mật và có thể bị thu hồi.")}
                  <br />
                  {t("• Đã có doanh thu (đóng đợt 1): Giữ nguyên trạng thái Đặt cọc để bảo vệ quyền sở hữu của Sale.")}
                </span>
              </div>
            </div>
          </div>
        </div>
        </CustomModal>
      )}

      {selectedLead && previewOpen && (
        <Suspense fallback={null}>
          <NotificationPreviewModal
            isOpen={previewOpen}
            onClose={() => setPreviewOpen(false)}
            type={previewType}
            leadName={selectedLead.name}
            leadPhone={canSeeFullInfo ? selectedLead.phone : maskPhone(selectedLead.phone)}
            leadEmail={canSeeFullInfo ? selectedLead.email : maskEmail(selectedLead.email)}
            leadSource={selectedLead.source || ''}
            leadType={selectedLead.type || ''}
            leadNote={selectedLead.note || ''}
            assignedToName={selectedLead.assigned_to_name || ''}
            sentAt={previewSentAt}
            isReminder={selectedLead.status === 'reminder'}
            leadId={selectedLead.lead_id || selectedLead.id}
            assignedToId={consultants.find(c => c.name === selectedLead.assigned_to_name)?.id}
            roundId={rounds.find(r => r.round_name === selectedLead.round_name)?.id}
            roundName={selectedLead.round_name}
            aiEvaluation={selectedLead.ai_evaluation}
            aiStatus={selectedLead.ai_screener_status}
          />
        </Suspense>
      )}

      {statsModalOpen && statsConsultant && (
        <CustomModal
          isOpen={statsModalOpen && Boolean(statsConsultant)}
          onClose={() => {
            setStatsModalOpen(false);
            setStatsConsultant(null);
          }}
          title={t('Báo cáo hiệu suất TVV')}
          width="900px"
          zIndex={2147483646}
        >
        {statsConsultant && (() => {
          const statsSummary = statsData?.summary || {};
          const totalReceived = Number(statsSummary.total_received || 0);
          const distCount = Number(statsSummary.distributed_count || 0);
          const coopCount = Number(statsSummary.coop_count || 0);
          const distPlusCoop = distCount + coopCount;
          const databankCount = Number(statsSummary.databank_count || 0);
          const selfCount = Number(statsSummary.self_count || 0);
          const reminderCount = Number(statsSummary.reminder || 0);
          const errorCount = Number(statsSummary.error || 0);
          const safeTotalReceived = Math.max(1, totalReceived);
          const isInactiveOrLeave = statsConsultant.status === 'inactive' || statsConsultant.status === 'leave' || Number(statsConsultant.vacation_mode) === 1;

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', position: 'relative' }}>
              {/* Consultant Summary + Date Filter Toolbar */}
              <div className="stats-header-container" style={{ borderBottom: '1px solid var(--color-border-light)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                  <Avatar
                    src={statsConsultant.avatar || undefined}
                    name={statsConsultant.name}
                    size={44}
                    style={{
                      filter: isInactiveOrLeave ? 'grayscale(1)' : 'none',
                      opacity: isInactiveOrLeave ? 0.5 : 1
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--color-text)' }}>{statsConsultant.name}</div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: 0 }}>
                      ID: {statsConsultant.id}{statsConsultant.email ? ` • ${statsConsultant.email}` : ''}
                    </p>
                  </div>
                </div>

                {/* Timeframe Filter Dropdown */}
                <div className="stats-header-filters" style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
                  <Calendar size={16} color="var(--color-text-light)" style={{ flexShrink: 0 }} />
                  <div style={{ position: 'relative', zIndex: 30 }}>
                    <CustomSelect
                      size="sm"
                      options={[
                        { value: 'this_month', label: t('Tháng này') },
                        { value: 'today', label: t('Hôm nay') },
                        { value: 'yesterday', label: t('Hôm qua') },
                        { value: '7_days', label: t('7 ngày qua') },
                        { value: '30_days', label: t('30 ngày qua') },
                        { value: 'last_month', label: t('Tháng trước') },
                        { value: 'all', label: t('Tất cả thời gian') },
                        { value: 'custom', label: t('Tự chọn ngày...') }
                      ]}
                      value={statsDateMode}
                      onChange={val => setStatsDateMode(String(val))}
                      width={180}
                    />
                  </div>

                  {statsDateMode === 'custom' && (
                    <div className="stats-custom-dates" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <div style={{ width: 145 }}>
                        <VietnameseDateInput value={statsStartDate} onChange={val => setStatsStartDate(val)} />
                      </div>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{t('đến')}</span>
                      <div style={{ width: 145 }}>
                        <VietnameseDateInput value={statsEndDate} onChange={val => setStatsEndDate(val)} />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {statsLoading && !statsData ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  <div className="responsive-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                    <KpiCardSkeleton />
                    <KpiCardSkeleton />
                    <KpiCardSkeleton />
                    <KpiCardSkeleton />
                  </div>
                  <ChartSkeleton height={180} />
                  <div className="responsive-grid-1-1" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                    <CardSkeleton height={140} />
                    <CardSkeleton height={140} />
                  </div>
                </div>
              ) : !statsData ? (
                <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-muted)' }}>
                  {t('Không có dữ liệu thống kê.')}
                </div>
              ) : (
                <>
                  {statsLoading && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: 'var(--color-primary-light)', zIndex: 10, overflow: 'hidden' }}>
                      <div style={{ width: '30%', height: '100%', background: 'var(--color-primary)', borderRadius: 'inherit', animation: 'loadingBar 1.5s infinite ease-in-out' }} />
                    </div>
                  )}

                  {/* Visual Breakdown explanation */}
                  <div style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 12,
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text)' }}>
                        {t('Tổng data TVV này tiếp nhận:')} <strong style={{ fontSize: '1.05rem', color: 'var(--color-text)' }}>{totalReceived}</strong> lead
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>
                        * {t('Các nhóm độc lập hoàn toàn, không cộng dồn/chồng chéo')}
                      </span>
                    </div>

                    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'var(--color-border-light)', position: 'relative' }}>
                      {distPlusCoop > 0 && (
                        <div
                          style={{
                            width: `${(distPlusCoop / safeTotalReceived) * 100}%`,
                            background: '#C6333D',
                            transition: 'width 0.3s ease'
                          }}
                          title={`${t('Được chia')}: ${distPlusCoop}`}
                        />
                      )}
                      {databankCount > 0 && (
                        <div
                          style={{
                            width: `${(databankCount / safeTotalReceived) * 100}%`,
                            background: '#334155',
                            transition: 'width 0.3s ease'
                          }}
                          title={`${t('Từ Databank')}: ${databankCount}`}
                        />
                      )}
                      {selfCount > 0 && (
                        <div
                          style={{
                            width: `${(selfCount / safeTotalReceived) * 100}%`,
                            background: '#94A3B8',
                            transition: 'width 0.3s ease'
                          }}
                          title={`${t('Tự nhập')}: ${selfCount}`}
                        />
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '16px', fontSize: '0.75rem', marginTop: 4, flexWrap: 'wrap', alignItems: 'center', fontVariantNumeric: 'tabular-nums' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#C6333D' }} />
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {t('Được chia')}: <strong style={{ color: '#BD1D2D' }}>{distPlusCoop}</strong> ({totalReceived > 0 ? Math.round((distPlusCoop / safeTotalReceived) * 100) : 0}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#334155' }} />
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {t('Từ Databank')}: <strong style={{ color: 'var(--color-text)' }}>{databankCount}</strong> ({totalReceived > 0 ? Math.round((databankCount / safeTotalReceived) * 100) : 0}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#94A3B8' }} />
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {t('Tự nhập')}: <strong style={{ color: '#64748B' }}>{selfCount}</strong> ({totalReceived > 0 ? Math.round((selfCount / safeTotalReceived) * 100) : 0}%)
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', paddingLeft: '16px', borderLeft: '1px solid var(--color-border)' }}>
                        <span style={{ color: 'var(--color-text-muted)' }}>
                          {t('Nhắc lại')}: <strong style={{ color: 'var(--color-text)' }}>{reminderCount}</strong> | {t('Lỗi/Trùng')}: <strong style={{ color: '#BD1D2D' }}>{errorCount}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <DataListStatsChartsPanel
                    statsData={statsData}
                    isMobile={isMobile}
                    onViewFairShareComp={handleViewStatsFairShare}
                    t={t}
                  />
                </>
              )}
            </div>
          );
        })()}
        </CustomModal>
      )}

      {/* Invoice Detail Preview Modal (P0-15 SO Invoices) */}
      {selectedInvoicePreview && (
        <CustomModal
          isOpen={Boolean(selectedInvoicePreview)}
          onClose={() => {
            soAbortRef.current?.abort();
            setSelectedInvoicePreview(null);
          }}
          title={`${t('Chi tiết Hóa đơn (SO)')}${selectedInvoicePreview?.invoice_number ? ` — ${selectedInvoicePreview.invoice_number}` : ''}`}
          width="740px"
          zIndex={2147483618}
        >
        {selectedInvoicePreview && (() => {
          const inv = selectedInvoicePreview;
          const invItems = ensureArray(inv.items);
          const invCurrency = inv.currency || tenantCurrency;
          const statusNorm = String(inv.status || 'pending').toLowerCase();
          const statusBadgeClass = statusNorm === 'paid' ? 'success' : statusNorm === 'overdue' || statusNorm === 'cancelled' || statusNorm === 'void' ? 'danger' : 'warning';
          const statusLabel = statusNorm === 'paid'
            ? t('Đã thanh toán')
            : statusNorm === 'overdue'
              ? t('Quá hạn')
              : statusNorm === 'partial'
                ? t('Thanh toán một phần')
                : (statusNorm === 'cancelled' || statusNorm === 'void')
                  ? t('Đã hủy')
                  : t('Chờ thanh toán');

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', fontVariantNumeric: 'tabular-nums' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', padding: '1rem', background: 'var(--color-bg)', borderRadius: '12px', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} color="#BD1D2D" />
                    <strong style={{ fontSize: '1rem', color: 'var(--color-text)' }}>{inv.invoice_number || `#${inv.id}`}</strong>
                    <span className={`badge ${statusBadgeClass}`}>{statusLabel}</span>
                  </div>
                  {inv.title && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', fontWeight: 500 }}>{inv.title}</div>
                  )}
                  <div style={{ fontSize: '0.82rem', color: 'var(--color-text)', marginTop: '4px' }}>
                    {t('Khách hàng')}: <strong>{inv.contact_name || inv.company_name || 'N/A'}</strong>
                    {(isSysAdmin || isExecUser) && inv.contact_phone ? ` • ${inv.contact_phone}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>{t('Ngày phát hành')}: <strong style={{ color: 'var(--color-text)' }}>{formatDisplayDate(inv.issue_date, language === 'vi' ? 'vi-VN' : 'en-US')}</strong></div>
                  {inv.due_date && (
                    <div>{t('Hạn thanh toán')}: <strong style={{ color: 'var(--color-text)' }}>{formatDisplayDate(inv.due_date, language === 'vi' ? 'vi-VN' : 'en-US')}</strong></div>
                  )}
                </div>
              </div>

              {invItems.length > 0 && (
                <div className="premium-table-container">
                  <table className="premium-table" style={{ minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th>{t('Hạng mục')}</th>
                        <th style={{ textAlign: 'right' }}>{t('SL')}</th>
                        <th style={{ textAlign: 'right' }}>{t('Đơn giá')}</th>
                        <th style={{ textAlign: 'right' }}>{t('Thành tiền')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invItems.map((it: any, i: number) => {
                        const qty = Number(it.quantity ?? it.qty ?? 1);
                        const price = Number(it.unit_price ?? it.price ?? 0);
                        const lineTotal = Number(it.total ?? it.amount ?? (qty * price));
                        return (
                          <tr key={it.id || i}>
                            <td>{it.description || it.item_name || it.name || it.title || t('Hạng mục')}</td>
                            <td style={{ textAlign: 'right' }}>{qty}</td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(price, invCurrency)}</td>
                            <td style={{ textAlign: 'right' }}><strong>{formatMoney(lineTotal, invCurrency)}</strong></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '1rem', background: 'var(--color-bg)', borderRadius: '12px', border: '1px solid var(--color-border)', alignItems: 'flex-end', fontSize: '0.85rem' }}>
                {inv.subtotal !== undefined && (
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {t('Tạm tính')}: <strong style={{ color: 'var(--color-text)', marginLeft: 8 }}>{formatMoney(Number(inv.subtotal || 0), invCurrency)}</strong>
                  </div>
                )}
                {Number(inv.discount_amount || 0) > 0 && (
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {t('Giảm giá')}: <strong style={{ color: 'var(--color-text)', marginLeft: 8 }}>-{formatMoney(Number(inv.discount_amount || 0), invCurrency)}</strong>
                  </div>
                )}
                {Number(inv.tax_amount || 0) > 0 && (
                  <div style={{ color: 'var(--color-text-muted)' }}>
                    {t('Thuế VAT')}: <strong style={{ color: 'var(--color-text)', marginLeft: 8 }}>{formatMoney(Number(inv.tax_amount || 0), invCurrency)}</strong>
                  </div>
                )}
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#BD1D2D', borderTop: '1px solid var(--color-border)', paddingTop: '8px', marginTop: '4px' }}>
                  {t('Tổng cộng')}: {formatMoney(Number(inv.total || 0), invCurrency)}
                </div>
              </div>

              {inv.notes && (
                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', padding: '0.75rem 1rem', borderRadius: '8px', border: '1px dashed var(--color-border)' }}>
                  <strong>{t('Ghi chú')}:</strong> {inv.notes}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn secondary" onClick={() => setSelectedInvoicePreview(null)}>
                  {t('Đóng')}
                </button>
              </div>
            </div>
          );
        })()}
        </CustomModal>
      )}

      {activePOId !== null && (
        <Suspense fallback={null}>
          <ExpenseQuickViewDrawer
            expenseId={activePOId}
            onClose={() => setActivePOId(null)}
            user={user}
            onStatusChange={() => {
              fetchCalendarStats();
              if (selectedDate) handleDateClick(selectedDate);
            }}
            onEditClick={(item) => {
              setEditingExpense(item);
            }}
          />
        </Suspense>
      )}

      {(showCreateExpenseModal || !!editingExpense) && (
        <Suspense fallback={null}>
          <ExpenseCreateDrawer
            isOpen={showCreateExpenseModal || !!editingExpense}
            onClose={() => {
              setShowCreateExpenseModal(false);
              setEditingExpense(null);
            }}
            editItem={editingExpense}
            initialDate={selectedExpenseDate}
            onSaveSuccess={() => {
              fetchCalendarStats();
              if (selectedDate) handleDateClick(selectedDate);
            }}
            user={user}
          />
        </Suspense>
      )}

      {showManageModal && selectedDepForManage && (
        <Suspense fallback={null}>
          <DepositDetailDrawer
            isOpen={showManageModal}
            onClose={() => setShowManageModal(false)}
            deposit={selectedDepForManage}
            onSaveSuccess={() => {
              fetchCalendarStats();
              if (selectedDate) handleDateClick(selectedDate);
            }}
            zIndex={2147483635}
          />
        </Suspense>
      )}

      {showDateModal && (
        <CustomModal
          isOpen={showDateModal}
          onClose={() => setShowDateModal(false)}
          title={t("Tùy chỉnh thời gian")}
          width="400px"
        >
          {showDateModal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1rem 0' }}>
              <div>
                <label className="form-label">{t('Từ ngày')}</label>
                <VietnameseDateInput value={startDate} onChange={val => setStartDate(val)} />
              </div>
              <div>
                <label className="form-label">{t('Đến ngày')}</label>
                <VietnameseDateInput value={endDate} onChange={val => setEndDate(val)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn outline" onClick={() => setShowDateModal(false)}>{t('Hủy')}</button>
                <button
                  className="btn primary"
                  onClick={() => {
                    if (!startDate || !endDate) return toast.error(t("Vui lòng chọn đầy đủ Từ ngày và Đến ngày"));
                    if (parseServerDate(startDate).getTime() > parseServerDate(endDate).getTime()) return toast.error(t("Từ ngày không được lớn hơn Đến ngày"));
                    handleUpdateDateFilter(`${startDate} đến ${endDate}`);
                    setShowDateModal(false);
                  }}
                >
                  {t('Áp dụng')}
                </button>
              </div>
            </div>
          )}
        </CustomModal>
      )}

      <style>{`
        @keyframes loadingBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(330%); }
        }
        @media (max-width: 768px) {
          .responsive-grid-1 {
            grid-template-columns: 1fr !important;
          }
          .span-full-mobile {
            grid-column: span 1 !important;
          }
        }
        :root {
          --color-calendar-weekend: #f7f8fa81;
        }
        [data-theme="dark"] {
          --color-calendar-weekend: #141b2d;
        }
        .spin { animation: spin 1s linear infinite; }
        .btn-export-csv-compact:hover {
          background-color: var(--color-primary-light) !important;
        }
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .lead-row:hover { background: var(--color-bg) !important; }
        .calendar-day-cell {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
        }
        .calendar-day-cell:hover {
          background-color: var(--color-surface-hover) !important;
          box-shadow: inset 0 0 0 2px var(--color-primary-light), 0 8px 24px rgba(189, 29, 45, 0.08);
          z-index: 10;
          transform: translateY(-2px);
        }
        .fade-in-view {
          opacity: 1;
        }
        .datalist-calendar-stat-grid > div,
        .datalist-stat-badge {
          transition: all 0.15s ease-in-out;
          border-radius: 6px;
        }
        .datalist-calendar-stat-grid > div:hover,
        .datalist-stat-badge:hover {
          transform: scale(1.05);
          filter: brightness(0.96);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
        }
        
        /* Premium Table Styles for Day Details Modal */
         .premium-table-container {
          border: 1px solid var(--color-border);
          border-radius: 12px;
          overflow-x: auto;
          background: var(--color-surface);
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.015);
        }
        .premium-table {
          width: 100%;
          min-width: 600px;
          border-collapse: collapse;
          text-align: left;
        }
        .premium-table th {
          background: var(--color-border-light);
          padding: 12px 16px;
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--color-text-muted);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          border-bottom: 1px solid var(--color-border);
        }
        .premium-table td {
          padding: 14px 16px;
          font-size: 0.875rem;
          color: var(--color-text);
          border-bottom: 1px solid var(--color-border-light);
          vertical-align: middle;
        }
        .premium-table tr:last-child td {
          border-bottom: none;
        }
        .premium-table tr {
          transition: background-color 0.15s ease;
        }
        .premium-table tr:hover {
          background-color: var(--color-primary-light);
        }
        .modal-tab-button {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .modal-tab-button:hover {
          color: var(--color-primary) !important;
        }
      `}</style>

      {/* Solid Dark Table Context Menu */}
      {contextMenu && (
        <TableContextMenu
          isOpen={!!contextMenu}
          x={contextMenu?.x || 0}
          y={contextMenu?.y || 0}
          item={contextMenu?.item || null}
          onClose={() => setContextMenu(null)}
          onOpenProfile={(item) => {
            setSelectedLead(
              item?._isDatabank
                ? {
                    id: item.id,
                    person_id: Number(item.person_id || item.id),
                    name: item.full_name || item.name || '',
                    phone: item.phone || '',
                    email: item.email || '',
                    source: item.original_source || 'Databank',
                    status: 'databank',
                    assigned_to_name: t('Chưa ai nhận'),
                    round_name: t('Kho chung'),
                    created_at: item.released_to_kho_at || '',
                    note: '',
                    type: '-',
                    is_public: 1,
                    is_won: item.is_won,
                    deleted_from_databank: item.deleted_from_databank,
                    takers: ensureArray(item.takers)
                  }
                : item
            );
          }}
          onAssign={
            !contextMenu?.item?._isDatabank && canReassignLead
              ? (item) => {
                  setSelectedLead(item);
                  setReassignConsId('');
                }
              : undefined
          }
          onDelete={
            contextMenu?.item?._isDatabank
              ? (isSysAdmin && Number(contextMenu.item.deleted_from_databank) !== 1
                  ? (item) => handleDeletePublicLeads([Number(item.person_id || item.id)])
                  : undefined)
              : (contextMenu?.item && canBlockLead && contextMenu.item.status !== 'blacklisted'
                  ? (item) => {
                      setSelectedLead(item);
                      const isTk =
                        item.status === 'error' ||
                        ['approved', 'approved_no_comp', 'pending'].includes(String(item.report_status || '').toLowerCase());
                      setCompensateBlock(
                        Boolean(
                          item.assigned_to_name &&
                          item.assigned_to_name !== '-' &&
                          item.assigned_to_name !== t('Chưa phân bổ')
                        ) && !isTk
                      );
                      setConfirmBlockOpen(true);
                    }
                  : undefined)
          }
        />
      )}
    </div>
  );
};

export const DataList = withRouterFreezer(DataListInner, (path) => path === '/data');
