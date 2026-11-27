import React, { useEffect, useMemo, useState, useCallback, useRef, useDeferredValue } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LabelList
} from 'recharts';
import {
  Users,
  GraduationCap,
  Briefcase,
  Building2,
  Layers,
  RefreshCw,
  RotateCcw,
  Search,
  Award,
  ExternalLink,
  SlidersHorizontal,
  X,
  Check,
  Landmark,
  HeartPulse,
  Cpu,
  HardHat,
  ShoppingBag,
  Factory,
  ShieldCheck,
  BookOpen,
  Calendar,
  Download
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../contexts/AuthContext';
import { pushOverlay } from '../../utils/overlayStack';
import { downloadExportFile } from '../../utils/exportHelper';
import { ensureArray } from '../../utils/safeArray';
import { CustomSelect } from '../ui/CustomSelect';
import { VietnameseDateInput } from '../ui/VietnameseDateInput';
import { Avatar } from '../ui/Avatar';
import {
  DomDashboardToolbar,
  DomToolbarButton,
  DomSegmentedSwitch,
  DomDateRangePill,
  DomKpiTile,
  DomPanelCard,
  DomRankBarRow,
  DomChartTooltip,
  DomEmptyChartState,
  MYERP_CHART_PALETTE,
  formatDomNumber
} from './DomationDashboardKit';
import {
  KpiCardSkeleton,
  TableSkeleton,
  ChartSkeleton,
  DonutAndRankedListSkeleton,
  DonutAndBarChartSkeleton,
  LeaderboardCardSkeleton,
  CompletenessGridSkeleton
} from '../ui/Skeleton';

interface BreakdownItem {
  label: string;
  key?: string;
  count: number;
  pct: number;
  variants_count?: number;
  variants?: string[];
}

interface OwnerBreakdownItem {
  owner_id: string;
  label: string;
  email: string;
  avatar: string;
  count: number;
  pct: number;
}

interface MultiCourseStudent {
  primary_id: number;
  full_name: string;
  phone: string;
  email: string;
  gender: string;
  job_title: string;
  company: string;
  owner_name?: string;
  owner_avatar?: string;
  course_count: number;
  school_count: number;
  schools: string[];
  courses: Array<{
    contact_id: number;
    student_id: string;
    school: string;
    intake: string;
    label: string;
  }>;
  contact_ids: number[];
}

interface CompletenessItem {
  field: string;
  label: string;
  filled: number;
  total: number;
  pct: number;
}

interface FilterOptionItem {
  value: string;
  label: string;
  name?: string;
  sublabel?: string;
  avatar?: string | null;
  count?: number;
}

interface PersonaOverviewResponse {
  segment: string;
  summary: {
    total_profiles: number;
    unique_persons: number;
    multi_course_persons: number;
    with_phone: number;
    with_email: number;
    with_gender: number;
    male_count: number;
    female_count: number;
    unknown_gender_count: number;
    avg_age: number;
    with_job_title: number;
    with_company: number;
    with_industry: number;
    with_intake: number;
    with_birthday?: number;
    distinct_companies: number;
    distinct_intakes: number;
    distinct_schools: number;
    excluded_personal_count?: number;
  };
  by_school_program: BreakdownItem[];
  by_intake: BreakdownItem[];
  by_owner?: OwnerBreakdownItem[];
  by_gender: BreakdownItem[];
  by_age_group: BreakdownItem[];
  by_job_group: BreakdownItem[];
  top_job_titles: BreakdownItem[];
  by_industry: BreakdownItem[];
  top_companies: BreakdownItem[];
  by_city: BreakdownItem[];
  multi_course_students: MultiCourseStudent[];
  data_completeness: CompletenessItem[];
  filter_options: {
    schools: FilterOptionItem[];
    intakes: FilterOptionItem[];
    owners?: FilterOptionItem[];
    job_groups?: FilterOptionItem[];
    industries?: FilterOptionItem[];
  };
}

interface CustomerPersonaOverviewDeckProps {
  defaultSegment?: 'student' | 'lead';
  externalDateFilter?: string;
  onOpenContact?: (contactId: number, fallbackContact?: Record<string, any>) => void;
}

const PALETTE = MYERP_CHART_PALETTE;

const getIndustryIcon = (label: string) => {
  const l = label.toLowerCase();
  if (l.includes('tài chính') || l.includes('ngân hàng') || l.includes('chứng khoán') || l.includes('bảo hiểm')) {
    return Landmark;
  }
  if (l.includes('y tế') || l.includes('dược') || l.includes('bệnh viện')) {
    return HeartPulse;
  }
  if (l.includes('công nghệ') || l.includes('viễn thông') || l.includes('it')) {
    return Cpu;
  }
  if (l.includes('bất động sản') || l.includes('xây dựng') || l.includes('kiến trúc')) {
    return HardHat;
  }
  if (l.includes('giáo dục') || l.includes('đào tạo')) {
    return BookOpen;
  }
  if (l.includes('sản xuất') || l.includes('công nghiệp') || l.includes('năng lượng')) {
    return Factory;
  }
  if (l.includes('nhà nước') || l.includes('hành chính') || l.includes('công')) {
    return ShieldCheck;
  }
  if (l.includes('thương mại') || l.includes('dịch vụ') || l.includes('bán lẻ') || l.includes('fmcg')) {
    return ShoppingBag;
  }
  return Layers;
};

/** Dynamic Red / Yellow / Green color coding based on percentage */
const getCompletenessTone = (pct: number) => {
  if (pct >= 80) {
    return {
      bar: '#10b981',
      dot: '#10b981',
      text: '#059669',
      bg: '#ecfdf5'
    };
  }
  if (pct >= 50) {
    return {
      bar: '#f59e0b',
      dot: '#f59e0b',
      text: '#d97706',
      bg: '#fffbeb'
    };
  }
  return {
    bar: '#ef4444',
    dot: '#ef4444',
    text: '#dc2626',
    bg: '#fef2f2'
  };
};

/** Clean flex search box so icon never overlaps placeholder text */
const CleanSearchBox: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  width?: number | string;
}> = ({ value, onChange, placeholder, width = 195 }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      width,
      height: '32px',
      padding: '0 10px',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      background: 'var(--color-surface, #ffffff)',
      boxSizing: 'border-box'
    }}
  >
    <Search size={13.5} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        border: 'none',
        outline: 'none',
        background: 'transparent',
        width: '100%',
        fontSize: '0.76rem',
        color: 'var(--color-text)',
        padding: 0
      }}
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange('')}
        style={{
          border: 'none',
          background: 'none',
          padding: 0,
          cursor: 'pointer',
          color: 'var(--color-text-muted)',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <X size={12} />
      </button>
    )}
  </div>
);

const deckCache = new Map<string, { data: PersonaOverviewResponse; timestamp: number }>();
const SWR_TTL_MS = 45_000;
const MAX_DECK_CACHE_ENTRIES = 30;

const setDeckCacheEntry = (key: string, data: PersonaOverviewResponse) => {
  if (deckCache.has(key)) {
    deckCache.delete(key);
  }
  while (deckCache.size >= MAX_DECK_CACHE_ENTRIES) {
    const oldestKey = deckCache.keys().next().value;
    if (oldestKey === undefined) break;
    deckCache.delete(oldestKey);
  }
  deckCache.set(key, { data, timestamp: Date.now() });
};

interface PersonaFetchParams {
  tenantId: number | string;
  userId: number | string;
  seg: 'student' | 'lead';
  owner: string;
  school: string;
  intake: string;
  gender: string;
  jobGroup: string;
  industry: string;
  company?: string;
  multiCourse: boolean;
  dateFilter?: string;
  fromDate?: string;
  toDate?: string;
}

const buildPersonaCacheKey = (params: PersonaFetchParams) =>
  `${params.tenantId}:${params.userId}|${params.seg}|${params.owner}|${params.school}|${params.intake}|${params.gender}|${params.jobGroup}|${params.industry}|${params.company || 'all'}|${params.multiCourse ? '1' : '0'}|${params.dateFilter || 'all'}|${params.fromDate || ''}|${params.toDate || ''}`;

interface PersonaSummaryData {
  total_profiles: number;
  unique_persons: number;
  multi_course_persons: number;
  with_phone: number;
  with_email: number;
  with_gender: number;
  male_count: number;
  female_count: number;
  unknown_gender_count: number;
  avg_age: number;
  with_job_title: number;
  with_company: number;
  with_industry: number;
  with_intake: number;
  with_birthday?: number;
  distinct_companies: number;
  distinct_intakes: number;
  distinct_schools: number;
  excluded_personal_count?: number;
}

const PersonaKpiStrip = React.memo<{
  segmentFilter: 'student' | 'lead';
  summary: PersonaSummaryData;
  intakeFilledPct: number;
  onScrollMultiCourse: () => void;
}>(({ segmentFilter, summary, intakeFilledPct, onScrollMultiCourse }) => {
  const emailPct =
    summary.total_profiles > 0 ? Math.round((summary.with_email / summary.total_profiles) * 100) : 0;
  const heroBreakdown: Array<{ label: string; value: string | number }> = [
    { label: 'Cá nhân duy nhất', value: formatDomNumber(summary.unique_persons) },
    { label: 'Có SĐT', value: formatDomNumber(summary.with_phone) },
    { label: 'Có Email', value: `${formatDomNumber(summary.with_email)} (${emailPct}%)` }
  ];
  if (segmentFilter === 'lead' && (summary.excluded_personal_count ?? 0) > 0) {
    heroBreakdown.push({
      label: 'Đã tách Self/GT',
      value: formatDomNumber(summary.excluded_personal_count ?? 0)
    });
  }

  return (
    <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
      <DomKpiTile
        variant="hero"
        label={segmentFilter === 'student' ? 'TỔNG HỒ SƠ HỌC VIÊN' : 'TỔNG HỒ SƠ TIỀM NĂNG'}
        value={formatDomNumber(summary.total_profiles)}
        icon={<Users size={16} />}
        badge={summary.avg_age > 0 ? `TB ${summary.avg_age} tuổi` : undefined}
        breakdown={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>
              • Cá nhân: <strong>{formatDomNumber(summary.unique_persons)}</strong> • Có SĐT:{' '}
              <strong>{formatDomNumber(summary.with_phone)}</strong>
            </div>
            <div>
              • Có Email: <strong>{formatDomNumber(summary.with_email)}</strong> ({emailPct}%)
              {heroBreakdown.length > 3 ? ` • Đã tách Self/GT: ${heroBreakdown[3].value}` : ''}
            </div>
          </div>
        }
      />

      <DomKpiTile
        label="HỌC NHIỀU KHÓA / ĐA TRƯỜNG"
        value={formatDomNumber(summary.multi_course_persons)}
        valueTone="teal"
        icon={<Award size={16} />}
        accent="teal"
        badge="360°"
        onClick={onScrollMultiCourse}
        breakdown={
          <div>
            Học viên đăng ký từ <strong style={{ color: 'var(--color-text)' }}>≥ 2 khóa / chương trình</strong>
          </div>
        }
        comparisonLabel="Bấm để xem danh sách 360° chi tiết →"
      />

      <DomKpiTile
        label="KHÓA ĐÀO TẠO & CHƯƠNG TRÌNH"
        value={`${formatDomNumber(summary.distinct_intakes)} khóa`}
        icon={<Calendar size={16} />}
        accent="blue"
        breakdown={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>
              • Đã gắn Intake:{' '}
              <strong style={{ color: 'var(--color-text)' }}>
                {formatDomNumber(summary.with_intake)} ({intakeFilledPct}%)
              </strong>
            </div>
            <div>
              • Trường / Chương trình:{' '}
              <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(summary.distinct_schools)}</strong>
            </div>
          </div>
        }
        comparisonLabel={`Phân bổ trên ${formatDomNumber(summary.distinct_schools)} chương trình`}
      />

      <DomKpiTile
        label="CÔNG TY, CHỨC VỤ & NGÀNH"
        value={`${formatDomNumber(summary.distinct_companies)} công ty`}
        icon={<Building2 size={16} />}
        accent="indigo"
        breakdown={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div>
              • Có Công ty: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(summary.with_company)}</strong> • Có Chức vụ:{' '}
              <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(summary.with_job_title)}</strong>
            </div>
          </div>
        }
        comparisonLabel={`Đã phân nhóm Ngành nghề: ${formatDomNumber(summary.with_industry)} hồ sơ`}
      />
    </div>
  );
});
PersonaKpiStrip.displayName = 'PersonaKpiStrip';

interface SchoolSegmentItem extends BreakdownItem {
  color: string;
  arc: number;
  offset: number;
}

const SchoolProgramPanel = React.memo<{
  isMobile: boolean;
  schools: BreakdownItem[];
  schoolSegments: SchoolSegmentItem[];
  topSchool: SchoolSegmentItem | null;
  schoolDonutRadius: number;
  schoolDonutCircumference: number;
  selectedSchool: string;
  onSelectSchool: (label: string) => void;
}>(({
  isMobile,
  schools,
  schoolSegments,
  topSchool,
  schoolDonutRadius,
  schoolDonutCircumference,
  selectedSchool,
  onSelectSchool
}) => {
  const maxSchoolCount = Math.max(1, ...schools.map((s) => s.count || 0));
  return (
    <DomPanelCard
      title="Thống kê theo trường / chương trình"
      subtitle="Bấm vào từng trường để lọc nhanh toàn bộ báo cáo"
      icon={<GraduationCap size={16} />}
      iconAccent="teal"
      rightSlot={
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '8px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontSize: '0.74rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {schools.length} trường
        </span>
      }
    >
      {schools.length === 0 ? (
        <DomEmptyChartState
          icon={<GraduationCap size={20} />}
          title="Chưa có dữ liệu trường / chương trình"
          description="Không có hồ sơ nào gắn trường hoặc chương trình trong bộ lọc hiện tại."
          minHeight={220}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr',
            gap: '1.2rem',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: '305px', overflowY: 'auto', paddingRight: '4px' }}>
            {schools.map((item, idx) => {
              const color = item.label === 'Chưa phân loại' ? '#94a3b8' : PALETTE[idx % PALETTE.length];
              const isSelected = selectedSchool === item.label;
              const pctOfMax = Math.max(3, Math.round(((item.count || 0) / maxSchoolCount) * 100));
              return (
                <div
                  key={item.label}
                  style={{
                    borderRadius: 10,
                    border: isSelected ? '1.5px solid var(--color-text)' : '1px solid transparent',
                    background: isSelected ? 'var(--color-bg-secondary)' : 'transparent',
                    padding: '2px 4px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <DomRankBarRow
                    rank={idx + 1}
                    label={item.label}
                    value={formatDomNumber(item.count)}
                    badge={`${item.pct}%`}
                    badgeTone={isSelected || idx === 0 ? 'teal' : 'slate'}
                    percent={Math.max(3, item.pct || pctOfMax)}
                    barColor={color}
                    onClick={() => onSelectSchool(item.label)}
                  />
                </div>
              );
            })}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0.5rem',
              borderLeft: isMobile ? 'none' : '1px solid var(--color-border-light)'
            }}
          >
            <div style={{ position: 'relative', width: 162, height: 162 }}>
              <svg width="162" height="162" viewBox="0 0 164 164" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="82" cy="82" r={schoolDonutRadius} fill="transparent" stroke="var(--color-bg-secondary)" strokeWidth="18" />
                {schoolSegments.map((seg) => (
                  <circle
                    key={seg.label}
                    cx="82"
                    cy="82"
                    r={schoolDonutRadius}
                    fill="transparent"
                    stroke={seg.color}
                    strokeWidth="18"
                    strokeDasharray={`${seg.arc} ${schoolDonutCircumference}`}
                    strokeDashoffset={seg.offset}
                    style={{ cursor: 'pointer', transition: 'all 0.25s ease' }}
                    onClick={() => onSelectSchool(seg.label)}
                  />
                ))}
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '0 18px',
                  pointerEvents: 'none'
                }}
              >
                <span style={{ fontSize: '1.22rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                  {topSchool ? `${topSchool.pct}%` : '0%'}
                </span>
                <span
                  style={{
                    fontSize: '0.69rem',
                    color: 'var(--color-text-muted)',
                    fontWeight: 600,
                    marginTop: '3px',
                    maxWidth: '100px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {topSchool ? topSchool.label : 'Trường đào tạo'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 10px', marginTop: '10px' }}>
              {schoolSegments.slice(0, 4).map((seg) => (
                <span
                  key={seg.label}
                  onClick={() => onSelectSchool(seg.label)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer'
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '2px', background: seg.color }} />
                  <span>{seg.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </DomPanelCard>
  );
});
SchoolProgramPanel.displayName = 'SchoolProgramPanel';

interface AgeChartDatum {
  name: string;
  fullLabel: string;
  count: number;
  pct: number;
}

const GenderAgePanel = React.memo<{
  isMobile: boolean;
  summary: PersonaSummaryData;
  malePct: number;
  femalePct: number;
  unknownGenderPct: number;
  genderDonutRadius: number;
  genderDonutCircumference: number;
  maleArc: number;
  femaleArc: number;
  selectedGender: string;
  ageChartData: AgeChartDatum[];
  onSelectGender: (gender: string) => void;
}>(({
  isMobile,
  summary,
  malePct,
  femalePct,
  unknownGenderPct,
  genderDonutRadius,
  genderDonutCircumference,
  maleArc,
  femaleArc,
  selectedGender,
  ageChartData,
  onSelectGender
}) => (
  <DomPanelCard
    title="Cơ cấu giới tính & độ tuổi"
    subtitle="Tỷ lệ giới tính & biểu đồ phân bố nhóm tuổi học viên"
    icon={<Users size={16} />}
    iconAccent="indigo"
    rightSlot={
      <span
        style={{
          padding: '4px 10px',
          borderRadius: '8px',
          background: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
          fontSize: '0.74rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums'
        }}
      >
        TB: {summary.avg_age > 0 ? `${summary.avg_age} tuổi` : '—'}
      </span>
    }
  >
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '0.88fr 1.12fr',
        gap: '1.1rem',
        alignItems: 'center',
        flex: 1
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingRight: isMobile ? 0 : '0.5rem',
          borderRight: isMobile ? 'none' : '1px solid var(--color-border-light)'
        }}
      >
        <div style={{ position: 'relative', width: 154, height: 154 }}>
          <svg width="154" height="154" viewBox="0 0 168 168" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="84" cy="84" r={genderDonutRadius} fill="transparent" stroke="var(--color-bg-secondary)" strokeWidth="18" />
            {maleArc > 0 && (
              <circle
                cx="84"
                cy="84"
                r={genderDonutRadius}
                fill="transparent"
                stroke="#2563EB"
                strokeWidth="18"
                strokeDasharray={`${maleArc} ${genderDonutCircumference}`}
                strokeDashoffset={0}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectGender('Nam')}
              />
            )}
            {femaleArc > 0 && (
              <circle
                cx="84"
                cy="84"
                r={genderDonutRadius}
                fill="transparent"
                stroke="#8B5CF6"
                strokeWidth="18"
                strokeDasharray={`${femaleArc} ${genderDonutCircumference}`}
                strokeDashoffset={-maleArc}
                style={{ cursor: 'pointer' }}
                onClick={() => onSelectGender('Nữ')}
              />
            )}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              pointerEvents: 'none'
            }}
          >
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-text)', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
              {formatDomNumber(summary.with_gender)}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 600, marginTop: '2px' }}>
              Có giới tính
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', maxWidth: '210px', marginTop: '10px' }}>
          <div
            onClick={() => onSelectGender('Nam')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '8px',
              background: selectedGender === 'Nam' ? 'var(--color-bg-secondary)' : 'var(--color-surface)',
              border: selectedGender === 'Nam' ? '1.5px solid var(--color-text)' : '1px solid var(--color-border)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--color-text)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#2563EB' }} />
              Nam
            </span>
            <span style={{ fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
              {formatDomNumber(summary.male_count)} <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>({malePct}%)</span>
            </span>
          </div>

          <div
            onClick={() => onSelectGender('Nữ')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              borderRadius: '8px',
              background: selectedGender === 'Nữ' ? 'var(--color-bg-secondary)' : 'var(--color-surface)',
              border: selectedGender === 'Nữ' ? '1.5px solid var(--color-text)' : '1px solid var(--color-border)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              transition: 'all 0.15s ease'
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: 'var(--color-text)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '2px', background: '#8B5CF6' }} />
              Nữ
            </span>
            <span style={{ fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
              {formatDomNumber(summary.female_count)} <span style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}>({femalePct}%)</span>
            </span>
          </div>

          {summary.unknown_gender_count > 0 && (
            <div
              onClick={() => onSelectGender('Chưa rõ')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '3px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.72rem',
                color: 'var(--color-text-muted)'
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 7, height: 7, borderRadius: '2px', background: '#cbd5e1' }} />
                Chưa rõ
              </span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatDomNumber(summary.unknown_gender_count)} ({unknownGenderPct}%)
              </span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', height: '100%', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-text)' }}>Phân nhóm Độ tuổi</span>
          <span style={{ fontSize: '0.71rem', color: 'var(--color-text-muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatDomNumber(summary.with_birthday || 0)} có NS
          </span>
        </div>

        {ageChartData.length === 0 ? (
          <DomEmptyChartState title="Chưa có dữ liệu nhóm tuổi" minHeight={190} />
        ) : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageChartData} margin={{ top: 22, right: 6, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="personaAgeRedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0F766E" />
                    <stop offset="100%" stopColor="#14B8A6" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)', fontWeight: 500 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(13, 148, 136, 0.06)' }}
                  content={
                    <DomChartTooltip
                      labelFormatter={(_l, payload) => String(payload?.[0]?.payload?.fullLabel || 'Độ tuổi')}
                      valueFormatter={(val, _name, item) => `${formatDomNumber(Number(val))} HV (${item?.payload?.pct || 0}%)`}
                    />
                  }
                />
                <Bar dataKey="count" name="Số lượng" barSize={24} radius={[6, 6, 0, 0]}>
                  <LabelList
                    dataKey="count"
                    position="top"
                    style={{ fontSize: '11px', fontWeight: 600, fill: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}
                  />
                  {ageChartData.map((entry) => (
                    <Cell
                      key={entry.fullLabel}
                      fill={entry.fullLabel === 'Chưa có ngày sinh' ? '#94a3b8' : 'url(#personaAgeRedGrad)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  </DomPanelCard>
));
GenderAgePanel.displayName = 'GenderAgePanel';

const TopOwnersPanel = React.memo<{
  ownerSearch: string;
  onOwnerSearchChange: (v: string) => void;
  filteredOwners: OwnerBreakdownItem[];
  selectedOwner: string;
  onSelectOwner: (ownerId: string) => void;
}>(({ ownerSearch, onOwnerSearchChange, filteredOwners, selectedOwner, onSelectOwner }) => {
  const maxOwnerCount = Math.max(1, ...filteredOwners.map((o) => o.count || 0));
  return (
    <DomPanelCard
      deferred
      title="Top tư vấn viên / Sale phụ trách"
      subtitle="Bấm vào Tư vấn viên để lọc toàn bộ chân dung học viên của Sale đó"
      icon={<Award size={16} />}
      iconAccent="brand"
      rightSlot={
        <CleanSearchBox
          value={ownerSearch}
          onChange={onOwnerSearchChange}
          placeholder="Tìm tên Sale..."
          width={175}
        />
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '340px', overflowY: 'auto', paddingRight: '4px' }}>
        {filteredOwners.length === 0 ? (
          <DomEmptyChartState
            icon={<Users size={20} />}
            title="Không tìm thấy Tư vấn viên phù hợp"
            minHeight={210}
          />
        ) : (
          filteredOwners.map((ow, i) => {
            const isSelected = String(selectedOwner) === String(ow.owner_id);
            const barPct = Math.max(3, Math.round((ow.count / maxOwnerCount) * 100));
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null;
            const barColor =
              ow.owner_id === 'unassigned'
                ? '#94a3b8'
                : isSelected || i < 3
                ? '#C6333D'
                : 'var(--color-text-secondary)';

            return (
              <div
                key={ow.owner_id}
                onClick={() => onSelectOwner(String(ow.owner_id))}
                style={{
                  cursor: 'pointer',
                  padding: '9px 10px',
                  borderRadius: '10px',
                  border: isSelected ? '1.5px solid var(--color-text)' : '1px solid var(--color-border-light)',
                  background: isSelected ? '#f8fafc' : 'transparent',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      fontSize: medal ? '1rem' : '0.74rem',
                      fontWeight: 700,
                      color: 'var(--color-text-muted)',
                      width: 24,
                      textAlign: 'center',
                      flexShrink: 0
                    }}
                  >
                    {medal || `#${i + 1}`}
                  </span>
                  <Avatar src={ow.avatar || undefined} name={ow.label} size={30} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: isSelected || i < 3 ? 700 : 600,
                        color: isSelected ? '#BD1D2D' : 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {ow.label}
                    </div>
                    <div style={{ height: 5, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden', marginTop: 5, maxWidth: '210px' }}>
                      <div
                        style={{
                          width: `${barPct}%`,
                          height: '100%',
                          background: barColor,
                          borderRadius: 4,
                          transition: 'width 0.35s ease'
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatDomNumber(ow.count)}
                  </span>
                  <span
                    style={{
                      fontSize: '0.71rem',
                      fontWeight: 700,
                      color: isSelected ? '#BD1D2D' : 'var(--color-text-secondary)',
                      background: isSelected ? 'rgba(189, 29, 45, 0.1)' : '#f1f5f9',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      minWidth: '46px',
                      textAlign: 'center',
                      fontVariantNumeric: 'tabular-nums'
                    }}
                  >
                    {ow.pct}%
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </DomPanelCard>
  );
});
TopOwnersPanel.displayName = 'TopOwnersPanel';

interface IntakeChartDatum {
  name: string;
  fullLabel: string;
  count: number;
  pct: number;
}

const IntakePanel = React.memo<{
  distinctIntakes: number;
  intakeViewMode: 'chart' | 'grid';
  intakeSearch: string;
  onChangeViewMode: (mode: 'chart' | 'grid') => void;
  onIntakeSearchChange: (val: string) => void;
  chartIntakes: IntakeChartDatum[];
  filteredIntakes: BreakdownItem[];
  selectedIntake: string;
  onSelectIntake: (label: string) => void;
}>(({
  distinctIntakes,
  intakeViewMode,
  intakeSearch,
  onChangeViewMode,
  onIntakeSearchChange,
  chartIntakes,
  filteredIntakes,
  selectedIntake,
  onSelectIntake
}) => (
  <DomPanelCard
    deferred
    title="Thống kê theo khóa học (Intake)"
    subtitle="Biểu đồ lưu lượng học viên theo khóa (kèm tiền tố Trường)"
    icon={<Calendar size={16} />}
    iconAccent="slate"
    rightSlot={
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <DomSegmentedSwitch<'chart' | 'grid'>
          size="sm"
          value={!intakeSearch ? intakeViewMode : 'grid'}
          onChange={(mode) => onChangeViewMode(mode)}
          options={[
            { value: 'chart', label: 'Biểu đồ cột' },
            { value: 'grid', label: `Tất cả (${distinctIntakes})` }
          ]}
        />
        <CleanSearchBox
          value={intakeSearch}
          onChange={onIntakeSearchChange}
          placeholder="Tìm Intake..."
          width={145}
        />
      </div>
    }
  >
    {!intakeSearch && intakeViewMode === 'chart' && chartIntakes.length > 0 ? (
      <>
        <div style={{ width: '100%', height: 225, marginTop: '4px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartIntakes} margin={{ top: 22, right: 8, left: -22, bottom: 4 }}>
              <defs>
                <linearGradient id="personaIntakeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1D4ED8" />
                  <stop offset="100%" stopColor="#3B82F6" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border-light)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--color-text-secondary)', fontWeight: 600 }} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} interval={0} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(37, 99, 235, 0.06)' }}
                content={
                  <DomChartTooltip
                    labelFormatter={(_l, payload) => String(payload?.[0]?.payload?.fullLabel || 'Khóa học')}
                    valueFormatter={(val, _name, item) => `${formatDomNumber(Number(val))} HV (${item?.payload?.pct || 0}%)`}
                  />
                }
              />
              <Bar
                dataKey="count"
                name="Học viên"
                barSize={22}
                radius={[6, 6, 2, 2]}
                cursor="pointer"
                onClick={(barData: any) => {
                  const target = barData?.fullLabel;
                  if (target) onSelectIntake(target);
                }}
              >
                <LabelList
                  dataKey="count"
                  position="top"
                  style={{ fontSize: '11px', fontWeight: 600, fill: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}
                />
                {chartIntakes.map((entry) => (
                  <Cell
                    key={entry.fullLabel}
                    fill={selectedIntake === entry.fullLabel ? '#1E3A8A' : 'url(#personaIntakeGrad)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            overflowX: 'auto',
            paddingBottom: '4px',
            borderTop: '1px solid var(--color-border-light)',
            paddingTop: '10px'
          }}
        >
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-muted)', flexShrink: 0 }}>Lọc nhanh:</span>
          {filteredIntakes.slice(0, 8).map((item) => {
            const isSelected = selectedIntake === item.label;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (item.label !== 'Chưa gắn Intake') onSelectIntake(item.label);
                }}
                style={{
                  border: isSelected ? '1.5px solid var(--color-text)' : '1px solid var(--color-border)',
                  background: isSelected ? '#f1f5f9' : '#f8fafc',
                  color: isSelected ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  borderRadius: '999px',
                  padding: '3px 9px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  flexShrink: 0
                }}
              >
                <span>{item.label}</span>
                <strong style={{ color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>{item.count}</strong>
              </button>
            );
          })}
        </div>
      </>
    ) : filteredIntakes.length === 0 ? (
      <DomEmptyChartState
        icon={<Calendar size={20} />}
        title="Không có khóa học (Intake) phù hợp"
        minHeight={225}
      />
    ) : (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '7px',
          maxHeight: '295px',
          overflowY: 'auto',
          paddingRight: '4px'
        }}
      >
        {filteredIntakes.map((item) => {
          const isSelected = selectedIntake === item.label;
          const clickable = item.label !== 'Chưa gắn Intake';
          return (
            <div
              key={item.label}
              onClick={() => {
                if (clickable) onSelectIntake(item.label);
              }}
              style={{
                cursor: clickable ? 'pointer' : 'default',
                padding: '7px 10px',
                borderRadius: '8px',
                border: isSelected ? '1.5px solid var(--color-text)' : '1px solid var(--color-border)',
                background: isSelected ? 'var(--color-bg-secondary)' : 'var(--color-surface)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '6px',
                transition: 'all 0.15s ease'
              }}
              title={`${item.label}: ${item.count} HV (${item.pct}%)`}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: isSelected ? 700 : 600,
                  color: 'var(--color-text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  color: isSelected ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                  flexShrink: 0
                }}
              >
                {item.count}
              </span>
            </div>
          );
        })}
      </div>
    )}
  </DomPanelCard>
));
IntakePanel.displayName = 'IntakePanel';

const JobPyramidPanel = React.memo<{
  withJobTitleCount: number;
  jobGroups: BreakdownItem[];
  topJobTitles: BreakdownItem[];
  selectedJobGroup: string;
  onSelectJobGroup: (label: string) => void;
}>(({ withJobTitleCount, jobGroups, topJobTitles, selectedJobGroup, onSelectJobGroup }) => {
  const maxJgCount = Math.max(1, ...jobGroups.filter((j) => j.label !== 'Chưa cập nhật').map((j) => j.count));
  return (
    <DomPanelCard
      deferred
      title="Tháp cấp bậc chức vụ & quản lý"
      subtitle="Bấm vào từng cấp bậc để lọc danh sách học viên"
      icon={<Briefcase size={16} />}
      iconAccent="brand"
      rightSlot={
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '8px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontSize: '0.74rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {formatDomNumber(withJobTitleCount)} có chức vụ
        </span>
      }
    >
      {jobGroups.length === 0 ? (
        <DomEmptyChartState icon={<Briefcase size={20} />} title="Chưa có dữ liệu chức vụ" minHeight={210} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {jobGroups.map((jg, idx) => {
            const isUnassigned = jg.label === 'Chưa cập nhật';
            const isSelected = selectedJobGroup === jg.label;
            const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
            const barColor = isUnassigned
              ? '#cbd5e1'
              : isSelected || idx === 0
              ? '#C6333D'
              : idx === 1
              ? '#334155'
              : idx === 2
              ? '#475569'
              : 'var(--color-text-muted)';
            const barWidthPct = isUnassigned
              ? Math.min(100, Math.max(4, jg.pct))
              : Math.min(100, Math.max(5, Math.round((jg.count / maxJgCount) * 100)));

            return (
              <div
                key={jg.label}
                onClick={() => onSelectJobGroup(jg.label)}
                style={{
                  cursor: 'pointer',
                  padding: '7px 10px',
                  borderRadius: '8px',
                  border: isSelected ? '1.5px solid var(--color-text)' : '1px solid transparent',
                  background: isSelected ? '#f8fafc' : 'transparent',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span style={{ fontSize: idx < 3 ? '0.92rem' : '0.73rem', fontWeight: 700, color: 'var(--color-text-muted)', width: 22, textAlign: 'center', flexShrink: 0 }}>
                      {medal}
                    </span>
                    <span
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: isSelected || idx === 0 ? 700 : 600,
                        color: isSelected ? '#BD1D2D' : 'var(--color-text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {jg.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 800, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                      {formatDomNumber(jg.count)}
                    </span>
                    <span
                      style={{
                        fontSize: '0.71rem',
                        fontWeight: 700,
                        color: isSelected ? '#BD1D2D' : 'var(--color-text-secondary)',
                        background: isSelected ? 'rgba(189, 29, 45, 0.1)' : '#f1f5f9',
                        padding: '1px 7px',
                        borderRadius: '999px',
                        minWidth: '44px',
                        textAlign: 'center',
                        fontVariantNumeric: 'tabular-nums'
                      }}
                    >
                      {jg.pct}%
                    </span>
                  </div>
                </div>
                <div style={{ marginLeft: 30, height: 6, background: 'var(--color-bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${barWidthPct}%`,
                      height: '100%',
                      background: barColor,
                      borderRadius: 4,
                      transition: 'width 0.35s ease'
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {topJobTitles.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '0.8rem', marginTop: 'auto' }}>
          <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '7px' }}>
            Chức danh phổ biến nhất:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {topJobTitles.slice(0, 10).map((jt) => (
              <span
                key={jt.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  padding: '3px 9px',
                  borderRadius: '999px',
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                  fontSize: '0.73rem',
                  fontWeight: 500
                }}
              >
                <span>{jt.label}</span>
                <strong style={{ color: '#BD1D2D', fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }}>
                  {jt.count}
                </strong>
              </span>
            ))}
          </div>
        </div>
      )}
    </DomPanelCard>
  );
});
JobPyramidPanel.displayName = 'JobPyramidPanel';

const IndustryBreakdownPanel = React.memo<{
  isMobile: boolean;
  withIndustryCount: number;
  industries: BreakdownItem[];
  selectedIndustry: string;
  onSelectIndustry: (label: string) => void;
}>(({ isMobile, withIndustryCount, industries, selectedIndustry, onSelectIndustry }) => {
  const assignedInds = industries.filter((i) => i.label !== 'Chưa cập nhật' && i.count > 0);
  const totalAssigned = assignedInds.reduce((acc, cur) => acc + cur.count, 0) || 1;
  const spectrumColors = ['#C6333D', '#334155', '#E11D48', '#64748B', '#991B1B', '#94A3B8', '#CBD5E1'];
  const topSegments = assignedInds.slice(0, 6);
  const otherCount = assignedInds.slice(6).reduce((acc, cur) => acc + cur.count, 0);
  const maxIndCount = Math.max(1, industries[0]?.count || 1);

  return (
    <DomPanelCard
      deferred
      title="Nhóm ngành nghề & lĩnh vực"
      subtitle="Tỷ trọng phân bổ & xếp hạng theo lĩnh vực công tác (bấm vào dòng để lọc)"
      icon={<Layers size={16} />}
      iconAccent="slate"
      rightSlot={
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '8px',
            background: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            fontSize: '0.74rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {formatDomNumber(withIndustryCount)} đã phân ngành
        </span>
      }
    >
      {industries.length === 0 ? (
        <DomEmptyChartState icon={<Layers size={20} />} title="Chưa có dữ liệu ngành nghề" minHeight={210} />
      ) : (
        <>
          {topSegments.length > 0 && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                marginBottom: '0.85rem'
              }}
            >
              <div
                style={{
                  height: 10,
                  width: '100%',
                  borderRadius: 999,
                  overflow: 'hidden',
                  display: 'flex',
                  gap: 2,
                  background: '#e2e8f0'
                }}
              >
                {topSegments.map((seg, sIdx) => {
                  const wPct = Math.max(2, Math.round((seg.count / totalAssigned) * 1000) / 10);
                  return (
                    <div
                      key={seg.label}
                      onClick={() => onSelectIndustry(seg.label)}
                      title={`${seg.label}: ${seg.count} HV (${wPct}% nhóm đã phân ngành)`}
                      style={{
                        width: `${wPct}%`,
                        height: '100%',
                        background: spectrumColors[sIdx % spectrumColors.length],
                        cursor: 'pointer',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  );
                })}
                {otherCount > 0 && (
                  <div
                    title={`Ngành khác: ${otherCount} HV`}
                    style={{
                      width: `${Math.max(2, Math.round((otherCount / totalAssigned) * 1000) / 10)}%`,
                      height: '100%',
                      background: '#cbd5e1'
                    }}
                  />
                )}
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                  gap: '8px 16px'
                }}
              >
                {topSegments.slice(0, 4).map((seg, sIdx) => {
                  const isSelected = selectedIndustry === seg.label;
                  return (
                    <div
                      key={seg.label}
                      onClick={() => onSelectIndustry(seg.label)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                        cursor: 'pointer',
                        fontSize: '0.74rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: spectrumColors[sIdx % spectrumColors.length],
                            flexShrink: 0
                          }}
                        />
                        <span
                          style={{
                            color: isSelected ? 'var(--color-text)' : 'var(--color-text-secondary)',
                            fontWeight: isSelected ? 700 : 600,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={seg.label}
                        >
                          {seg.label}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                        <strong style={{ color: 'var(--color-text)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{seg.count}</strong>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: '0.7rem' }}>({seg.pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '345px', overflowY: 'auto', paddingRight: '4px' }}>
            {industries.map((ind, idx) => {
              const isUnassigned = ind.label === 'Chưa cập nhật';
              const isSelected = selectedIndustry === ind.label;
              const IndIcon = getIndustryIcon(ind.label);
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;
              const pctOfMax = isUnassigned
                ? Math.min(100, Math.max(4, ind.pct))
                : Math.min(100, Math.max(4, Math.round((ind.count / maxIndCount) * 100)));

              return (
                <div
                  key={ind.label}
                  onClick={() => onSelectIndustry(ind.label)}
                  style={{
                    cursor: 'pointer',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: isSelected ? 'var(--color-bg-secondary)' : 'var(--color-surface)',
                    border: isSelected ? '1.5px solid var(--color-text)' : '1px solid var(--color-border)',
                    boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      <span
                        style={{
                          fontSize: idx < 3 ? '0.95rem' : '0.73rem',
                          fontWeight: 700,
                          color: 'var(--color-text-muted)',
                          width: 24,
                          textAlign: 'center',
                          flexShrink: 0
                        }}
                      >
                        {medal}
                      </span>
                      <span
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          background: 'var(--color-bg-secondary)',
                          color: idx === 0 ? '#C6333D' : 'var(--color-text-secondary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}
                      >
                        <IndIcon size={14} />
                      </span>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: isSelected || idx === 0 ? 700 : 600,
                          color: 'var(--color-text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={ind.label}
                      >
                        {ind.label}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDomNumber(ind.count)} HV
                      </span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: 'var(--color-bg-tertiary)',
                          color: 'var(--color-text-secondary)',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          minWidth: '46px',
                          textAlign: 'center',
                          fontVariantNumeric: 'tabular-nums'
                        }}
                      >
                        {ind.pct}%
                      </span>
                    </div>
                  </div>

                  <div style={{ height: 5, borderRadius: 999, background: '#f1f5f9', marginTop: 7, marginLeft: 32, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${Math.max(4, pctOfMax)}%`,
                        height: '100%',
                        borderRadius: 999,
                        background: isUnassigned ? '#cbd5e1' : idx === 0 ? '#C6333D' : idx < 3 ? '#334155' : '#94a3b8',
                        transition: 'width 0.35s ease'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </DomPanelCard>
  );
});
IndustryBreakdownPanel.displayName = 'IndustryBreakdownPanel';

const TopCompaniesPanel = React.memo<{
  isMobile: boolean;
  distinctCompanies: number;
  companySearch: string;
  onCompanySearchChange: (v: string) => void;
  filteredCompanies: BreakdownItem[];
  selectedCompany: string;
  onSelectCompany: (label: string) => void;
}>(({
  isMobile,
  distinctCompanies,
  companySearch,
  onCompanySearchChange,
  filteredCompanies,
  selectedCompany,
  onSelectCompany
}) => (
  <DomPanelCard
    deferred
    title={`Top công ty / đơn vị công tác (${distinctCompanies})`}
    subtitle="Các ngân hàng, tập đoàn và doanh nghiệp có nhiều học viên nhất"
    icon={<Building2 size={16} />}
    iconAccent="brand"
    rightSlot={
      <CleanSearchBox
        value={companySearch}
        onChange={onCompanySearchChange}
        placeholder="Tìm tên công ty..."
        width={185}
      />
    }
  >
    {!companySearch && filteredCompanies.length >= 3 && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px', marginBottom: '0.85rem' }}>
        {filteredCompanies.slice(0, 3).map((topComp, idx) => {
          const podiumMedals = ['🥇', '🥈', '🥉'];
          const podiumBadges = ['TOP 1', 'TOP 2', 'TOP 3'];
          const medal = podiumMedals[idx] || `#${idx + 1}`;
          const badge = podiumBadges[idx] || `TOP ${idx + 1}`;
          const isSelected = selectedCompany === topComp.label;
          const tooltipText =
            topComp.variants && topComp.variants.length > 1
              ? `${topComp.label} (${topComp.count} HV) — Đã hợp nhất ${topComp.variants.length} đơn vị/chi nhánh:\n• ${topComp.variants.join('\n• ')}`
              : `${topComp.label}: ${topComp.count} HV`;
          return (
            <div
              key={topComp.label}
              onClick={() => onSelectCompany(topComp.label)}
              style={{
                padding: '12px 14px',
                borderRadius: 12,
                background: isSelected ? 'var(--color-bg-secondary)' : 'var(--color-surface)',
                border: isSelected ? '1.5px solid var(--color-text)' : '1px solid var(--color-border)',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                minWidth: 0,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={tooltipText}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '1rem' }}>{medal}</span>
                  <span>{badge}</span>
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: isSelected ? '#BD1D2D' : 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                  {topComp.count} HV
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.84rem',
                  fontWeight: 700,
                  color: isSelected ? '#BD1D2D' : 'var(--color-text)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {topComp.label}
              </div>
            </div>
          );
        })}
      </div>
    )}

    <div
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
        gap: '8px',
        maxHeight: '265px',
        overflowY: 'auto',
        paddingRight: '4px'
      }}
    >
      {filteredCompanies.length === 0 ? (
        <div style={{ gridColumn: '1 / -1' }}>
          <DomEmptyChartState icon={<Building2 size={20} />} title="Không tìm thấy công ty phù hợp" minHeight={180} />
        </div>
      ) : (
        (companySearch ? filteredCompanies : filteredCompanies.slice(3)).map((comp, idx) => {
          const actualRank = companySearch ? idx + 1 : idx + 4;
          const rankBadge = actualRank === 1 ? '🥇' : actualRank === 2 ? '🥈' : actualRank === 3 ? '🥉' : `#${actualRank}`;
          const isSelected = selectedCompany === comp.label;
          const tooltipText =
            comp.variants && comp.variants.length > 1
              ? `${comp.label} (${comp.count} HV) — Đã hợp nhất ${comp.variants.length} đơn vị/chi nhánh:\n• ${comp.variants.join('\n• ')}`
              : `${comp.label}: ${comp.count} HV`;
          return (
            <div
              key={comp.label}
              onClick={() => onSelectCompany(comp.label)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                padding: '10px 12px',
                borderRadius: 10,
                border: isSelected ? '1.5px solid var(--color-text)' : '1px solid var(--color-border)',
                background: isSelected ? 'var(--color-bg-secondary)' : 'var(--color-surface)',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
                minWidth: 0,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={tooltipText}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--color-text-muted)', minWidth: 24, textAlign: 'center', flexShrink: 0 }}>
                  {rankBadge}
                </span>
                <span
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: isSelected ? 700 : 600,
                    color: isSelected ? '#BD1D2D' : 'var(--color-text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {comp.label}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  color: isSelected ? '#BD1D2D' : 'var(--color-text-secondary)',
                  background: 'var(--color-bg-tertiary)',
                  padding: '2px 8px',
                  borderRadius: 6,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums'
                }}
              >
                {comp.count} HV
              </span>
            </div>
          );
        })
      )}
    </div>
  </DomPanelCard>
));
TopCompaniesPanel.displayName = 'TopCompaniesPanel';

const DataCompletenessPanel = React.memo<{
  avgCompletenessPct: number;
  items: CompletenessItem[];
}>(({ avgCompletenessPct, items }) => {
  const avgTone = getCompletenessTone(avgCompletenessPct);
  return (
    <DomPanelCard
      deferred
      title="Độ đầy đủ dữ liệu chân dung"
      subtitle="Tỷ lệ điền đầy đủ của 8 trường thông tin trên tập dữ liệu đang lọc"
      icon={<ShieldCheck size={16} />}
      iconAccent="slate"
      rightSlot={
        <span
          style={{
            padding: '4px 10px',
            borderRadius: '8px',
            background: avgTone.bg,
            color: avgTone.text,
            fontSize: '0.74rem',
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          TB: {avgCompletenessPct}% đầy đủ
        </span>
      }
    >
      {items.length === 0 ? (
        <DomEmptyChartState icon={<ShieldCheck size={20} />} title="Chưa có dữ liệu trường thông tin" minHeight={180} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {items.map((c) => {
            const missing = Math.max(0, c.total - c.filled);
            const tone = getCompletenessTone(c.pct);
            return (
              <div
                key={c.field}
                style={{
                  padding: '9px 12px',
                  borderRadius: 10,
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border-light)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: tone.dot, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.label}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      Có: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(c.filled)}</strong>
                    </span>
                    <span style={{ color: '#cbd5e1' }}>•</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      Thiếu: <strong style={{ color: 'var(--color-text)' }}>{formatDomNumber(missing)}</strong>
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: tone.text,
                        background: tone.bg,
                        padding: '2px 8px',
                        borderRadius: 6,
                        fontSize: '0.72rem',
                        minWidth: '44px',
                        textAlign: 'center'
                      }}
                    >
                      {c.pct}%
                    </span>
                  </div>
                </div>
                <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.max(2, c.pct)}%`,
                      height: '100%',
                      background: tone.bar,
                      borderRadius: 999,
                      transition: 'width 0.35s ease'
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DomPanelCard>
  );
});
DataCompletenessPanel.displayName = 'DataCompletenessPanel';

const MultiCourseStudentsPanel = React.memo<{
  totalFilteredCount: number;
  paginatedMultiStudents: MultiCourseStudent[];
  multiStudentSearch: string;
  onMultiStudentSearchChange: (val: string) => void;
  multiPage: number;
  totalMultiPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onOpenStudentProfile: (st: MultiCourseStudent) => void;
  onOpenCourseModal: (st: MultiCourseStudent) => void;
}>(({
  totalFilteredCount,
  paginatedMultiStudents,
  multiStudentSearch,
  onMultiStudentSearchChange,
  multiPage,
  totalMultiPages,
  pageSize,
  onPageChange,
  onOpenStudentProfile,
  onOpenCourseModal
}) => (
  <div id="multi-course-students-section">
    <DomPanelCard
      deferred
      title={`Danh sách học viên học nhiều khóa / nhiều trường (${totalFilteredCount})`}
      subtitle="Bấm vào nút Số khóa để xem danh sách các khóa đã học, hoặc bấm vào dòng để mở Hồ sơ 360°"
      icon={<Award size={16} />}
      iconAccent="brand"
      rightSlot={
        <CleanSearchBox
          value={multiStudentSearch}
          onChange={onMultiStudentSearchChange}
          placeholder="Tìm tên, SĐT, công ty, trường, Sale..."
          width={270}
        />
      }
    >
      <div className="table-wrap" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>#</th>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>HỌ VÀ TÊN</th>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>GIỚI TÍNH</th>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>SỐ KHÓA ĐÃ HỌC</th>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>CHỨC VỤ &amp; CÔNG TY</th>
              <th style={{ textAlign: 'left', padding: '10px 12px' }}>SALE PHỤ TRÁCH</th>
              <th style={{ textAlign: 'right', padding: '10px 12px' }}>HỒ SƠ</th>
            </tr>
          </thead>
          <tbody>
            {paginatedMultiStudents.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '1.25rem' }}>
                  <DomEmptyChartState
                    icon={<GraduationCap size={20} />}
                    title="Không có học viên đa khóa nào khớp điều kiện lọc"
                    minHeight={130}
                  />
                </td>
              </tr>
            ) : (
              paginatedMultiStudents.map((st, idx) => (
                <tr
                  key={st.primary_id}
                  onClick={() => onOpenStudentProfile(st)}
                  style={{
                    borderBottom: '1px solid var(--color-border-light)',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(189, 29, 45, 0.03)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <td style={{ padding: '10px 12px', fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                    {(multiPage - 1) * pageSize + idx + 1}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Avatar name={st.full_name} size={34} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.83rem', color: 'var(--color-text)' }}>{st.full_name}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                          {[st.phone, st.email].filter(Boolean).join(' • ') || '—'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: '0.78rem', fontWeight: 500 }}>{st.gender || '—'}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCourseModal(st);
                      }}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-text)',
                        fontSize: '0.78rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        whiteSpace: 'nowrap'
                      }}
                      title="Bấm để xem chi tiết các khóa đã học"
                    >
                      <GraduationCap size={14} style={{ color: '#BD1D2D' }} />
                      <span>{st.course_count} khóa học</span>
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, opacity: 0.85 }}>• Xem chi tiết</span>
                    </button>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)' }}>{st.job_title || '—'}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{st.company || '—'}</div>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    {st.owner_name ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <Avatar src={st.owner_avatar || undefined} name={st.owner_name} size={24} />
                        <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--color-text)' }}>{st.owner_name}</span>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                    <DomToolbarButton
                      variant="outline"
                      icon={<ExternalLink size={12} />}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenStudentProfile(st);
                      }}
                      style={{ height: '30px', padding: '0 10px', fontSize: '0.74rem' }}
                    >
                      Xem 360°
                    </DomToolbarButton>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalMultiPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            Trang {multiPage} / {totalMultiPages} ({totalFilteredCount} học viên đa khóa)
          </span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <DomToolbarButton
              variant="outline"
              disabled={multiPage <= 1}
              onClick={() => onPageChange(Math.max(1, multiPage - 1))}
              style={{ height: '32px', padding: '0 12px' }}
            >
              Trước
            </DomToolbarButton>
            <DomToolbarButton
              variant="outline"
              disabled={multiPage >= totalMultiPages}
              onClick={() => onPageChange(Math.min(totalMultiPages, multiPage + 1))}
              style={{ height: '32px', padding: '0 12px' }}
            >
              Sau
            </DomToolbarButton>
          </div>
        </div>
      )}
    </DomPanelCard>
  </div>
));
MultiCourseStudentsPanel.displayName = 'MultiCourseStudentsPanel';

export const CustomerPersonaOverviewDeck: React.FC<CustomerPersonaOverviewDeckProps> = ({
  defaultSegment = 'student',
  externalDateFilter = '',
  onOpenContact
}) => {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenant_id ?? 1;
  const userId = user?.id ?? 0;

  // Always default to 'student' (Học viên)
  const [segmentFilter, setSegmentFilter] = useState<'student' | 'lead'>(defaultSegment || 'student');
  const [selectedOwner, setSelectedOwner] = useState<string>('all');
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedIntake, setSelectedIntake] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [selectedJobGroup, setSelectedJobGroup] = useState<string>('all');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [multiCourseOnly, setMultiCourseOnly] = useState<boolean>(false);
  const [customFromDate, setCustomFromDate] = useState<string>('');
  const [customToDate, setCustomToDate] = useState<string>('');
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);

  const [showAdvancedDrawer, setShowAdvancedDrawer] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 767px)').matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const handleChange = () => setIsMobile(mq.matches);
    handleChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', handleChange);
      return () => mq.removeEventListener('change', handleChange);
    }
    mq.addListener(handleChange);
    return () => mq.removeListener(handleChange);
  }, []);

  const initialCacheKey = buildPersonaCacheKey({
    tenantId,
    userId,
    seg: defaultSegment || 'student',
    owner: 'all',
    school: 'all',
    intake: 'all',
    gender: 'all',
    jobGroup: 'all',
    industry: 'all',
    company: 'all',
    multiCourse: false,
    dateFilter: externalDateFilter,
    fromDate: '',
    toDate: ''
  });
  const [data, setData] = useState<PersonaOverviewResponse | null>(
    () => deckCache.get(initialCacheKey)?.data ?? null
  );
  const [loading, setLoading] = useState<boolean>(() => !deckCache.has(initialCacheKey));
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const abortPersonaRef = useRef<AbortController | null>(null);
  const inFlightRefreshRef = useRef<boolean>(false);
  const inFlightExportRef = useRef<boolean>(false);

  const [companySearch, setCompanySearch] = useState<string>('');
  const [multiStudentSearch, setMultiStudentSearch] = useState<string>('');
  const [intakeSearch, setIntakeSearch] = useState<string>('');
  const [intakeViewMode, setIntakeViewMode] = useState<'chart' | 'grid'>('chart');
  const [ownerSearch, setOwnerSearch] = useState<string>('');
  const deferredCompanySearch = useDeferredValue(companySearch);
  const deferredMultiStudentSearch = useDeferredValue(multiStudentSearch);
  const deferredIntakeSearch = useDeferredValue(intakeSearch);
  const deferredOwnerSearch = useDeferredValue(ownerSearch);
  const [multiPage, setMultiPage] = useState<number>(1);
  const [courseModalStudent, setCourseModalStudent] = useState<MultiCourseStudent | null>(null);
  const MULTI_PAGE_SIZE = 10;

  const fetchPersonaOverview = useCallback(
    async (params: PersonaFetchParams, forceRefresh = false) => {
      const cacheKey = buildPersonaCacheKey(params);
      const cached = deckCache.get(cacheKey);
      const now = Date.now();

      if (cached) {
        // Touch LRU order
        deckCache.delete(cacheKey);
        deckCache.set(cacheKey, cached);
        setData(cached.data);
        setLoading(false);
        setError(null);
        if (!forceRefresh && now - cached.timestamp < SWR_TTL_MS) {
          return;
        }
        setIsRefreshing(true);
      } else {
        setLoading(true);
        setError(null);
      }

      if (abortPersonaRef.current) {
        abortPersonaRef.current.abort();
      }
      const controller = new AbortController();
      abortPersonaRef.current = controller;
      inFlightRefreshRef.current = true;

      const hasCustomRange = Boolean(params.fromDate && params.toDate);
      try {
        const res = await api.get('/contacts/persona-overview', {
          params: {
            segment: params.seg,
            owner_id: params.owner !== 'all' ? params.owner : undefined,
            program: params.school !== 'all' ? params.school : undefined,
            intake: params.intake !== 'all' ? params.intake : undefined,
            expected_intake: params.intake !== 'all' ? params.intake : undefined,
            gender: params.gender !== 'all' ? params.gender : undefined,
            job_group: params.jobGroup !== 'all' ? params.jobGroup : undefined,
            industry: params.industry !== 'all' ? params.industry : undefined,
            company: params.company && params.company !== 'all' ? params.company : undefined,
            multi_course: params.multiCourse ? '1' : undefined,
            multi_program: params.multiCourse ? '1' : undefined,
            date_filter: !hasCustomRange && params.dateFilter ? params.dateFilter : undefined,
            from_date: hasCustomRange ? params.fromDate : undefined,
            to_date: hasCustomRange ? params.toDate : undefined,
            from: hasCustomRange ? params.fromDate : undefined,
            to: hasCustomRange ? params.toDate : undefined,
            refresh: forceRefresh ? '1' : undefined
          },
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        const payload = res.data?.data || res.data;
        setDeckCacheEntry(cacheKey, payload);
        setData(payload);
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError' || controller.signal.aborted) return;
        if (!cached) {
          setError(err?.response?.data?.message || 'Không thể tải dữ liệu tổng quan chân dung khách hàng');
        }
      } finally {
        if (abortPersonaRef.current === controller) {
          inFlightRefreshRef.current = false;
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    fetchPersonaOverview({
      tenantId,
      userId,
      seg: segmentFilter,
      owner: selectedOwner,
      school: selectedSchool,
      intake: selectedIntake,
      gender: selectedGender,
      jobGroup: selectedJobGroup,
      industry: selectedIndustry,
      company: selectedCompany,
      multiCourse: multiCourseOnly,
      dateFilter: externalDateFilter,
      fromDate: customFromDate,
      toDate: customToDate
    });
    return () => {
      if (abortPersonaRef.current) {
        abortPersonaRef.current.abort();
      }
    };
  }, [
    fetchPersonaOverview,
    tenantId,
    userId,
    segmentFilter,
    selectedOwner,
    selectedSchool,
    selectedIntake,
    selectedGender,
    selectedJobGroup,
    selectedIndustry,
    selectedCompany,
    multiCourseOnly,
    externalDateFilter,
    customFromDate,
    customToDate
  ]);

  // Invalidate cache & refresh when contact/deposit mutations occur (e.g., CustomerProfileDrawer edits)
  useEffect(() => {
    const handleSyncInvalidate = () => {
      deckCache.clear();
      fetchPersonaOverview(
        {
          tenantId,
          userId,
          seg: segmentFilter,
          owner: selectedOwner,
          school: selectedSchool,
          intake: selectedIntake,
          gender: selectedGender,
          jobGroup: selectedJobGroup,
          industry: selectedIndustry,
          company: selectedCompany,
          multiCourse: multiCourseOnly,
          dateFilter: externalDateFilter,
          fromDate: customFromDate,
          toDate: customToDate
        },
        true
      );
    };
    window.addEventListener('contact-updated', handleSyncInvalidate);
    window.addEventListener('contacts-updated', handleSyncInvalidate);
    window.addEventListener('deposit-created', handleSyncInvalidate);
    return () => {
      window.removeEventListener('contact-updated', handleSyncInvalidate);
      window.removeEventListener('contacts-updated', handleSyncInvalidate);
      window.removeEventListener('deposit-created', handleSyncInvalidate);
    };
  }, [
    fetchPersonaOverview,
    tenantId,
    userId,
    segmentFilter,
    selectedOwner,
    selectedSchool,
    selectedIntake,
    selectedGender,
    selectedJobGroup,
    selectedIndustry,
    selectedCompany,
    multiCourseOnly,
    externalDateFilter,
    customFromDate,
    customToDate
  ]);

  // LIFO Escape + body scroll lock for Course Modal & Advanced Filter Drawer
  useEffect(() => {
    if (!courseModalStudent) return;
    const unregister = pushOverlay('persona-course-modal', () => setCourseModalStudent(null), 2147483610);
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      unregister();
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow || 'unset';
      }
    };
  }, [courseModalStudent]);

  useEffect(() => {
    if (!showAdvancedDrawer) return;
    const unregister = pushOverlay('persona-filter-drawer', () => setShowAdvancedDrawer(false), 2147483625);
    const prevOverflow = typeof document !== 'undefined' ? document.body.style.overflow : '';
    if (typeof document !== 'undefined') {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      unregister();
      if (typeof document !== 'undefined') {
        document.body.style.overflow = prevOverflow || 'unset';
      }
    };
  }, [showAdvancedDrawer]);

  const handleResetAllFilters = () => {
    setSelectedOwner('all');
    setSelectedSchool('all');
    setSelectedIntake('all');
    setSelectedGender('all');
    setSelectedJobGroup('all');
    setSelectedIndustry('all');
    setSelectedCompany('all');
    setMultiCourseOnly(false);
    setCustomFromDate('');
    setCustomToDate('');
    setMultiPage(1);
  };

  const handleExportParityCsv = async () => {
    if (inFlightExportRef.current) return;
    inFlightExportRef.current = true;
    setExportingCsv(true);
    const hasCustomRange = Boolean(customFromDate && customToDate);
    try {
      await downloadExportFile({
        endpoint: '/export',
        params: {
          type: 'contact',
          segment: segmentFilter === 'student' ? 'customer' : 'tiem_nang',
          data_type: segmentFilter === 'lead' ? 'distributed' : undefined,
          owner_id: selectedOwner !== 'all' ? selectedOwner : undefined,
          program: selectedSchool !== 'all' ? selectedSchool : undefined,
          expected_intake: selectedIntake !== 'all' ? selectedIntake : undefined,
          intake: selectedIntake !== 'all' ? selectedIntake : undefined,
          gender: selectedGender !== 'all' ? selectedGender : undefined,
          job_group: selectedJobGroup !== 'all' ? selectedJobGroup : undefined,
          industry: selectedIndustry !== 'all' ? selectedIndustry : undefined,
          company: selectedCompany !== 'all' ? selectedCompany : undefined,
          multi_program: multiCourseOnly ? '1' : undefined,
          multi_course: multiCourseOnly ? '1' : undefined,
          date_filter: !hasCustomRange && externalDateFilter ? externalDateFilter : undefined,
          from: hasCustomRange ? customFromDate : undefined,
          to: hasCustomRange ? customToDate : undefined,
          from_date: hasCustomRange ? customFromDate : undefined,
          to_date: hasCustomRange ? customToDate : undefined
        },
        defaultFilename: `persona_${segmentFilter}_${new Date().toISOString().slice(0, 10)}.csv`,
        onSuccess: () => toast.success('Đã xuất file CSV theo đúng bộ lọc đang xem')
      });
    } catch (err: any) {
      toast.error(err?.message || 'Không thể xuất file CSV');
    } finally {
      inFlightExportRef.current = false;
      setExportingCsv(false);
    }
  };

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedOwner !== 'all') count++;
    if (selectedSchool !== 'all') count++;
    if (selectedIntake !== 'all') count++;
    if (selectedGender !== 'all') count++;
    if (selectedJobGroup !== 'all') count++;
    if (selectedIndustry !== 'all') count++;
    if (selectedCompany !== 'all') count++;
    if (multiCourseOnly) count++;
    if (customFromDate && customToDate) count++;
    return count;
  }, [
    selectedOwner,
    selectedSchool,
    selectedIntake,
    selectedGender,
    selectedJobGroup,
    selectedIndustry,
    selectedCompany,
    multiCourseOnly,
    customFromDate,
    customToDate
  ]);

  const ownerOptions = useMemo(() => {
    const base = [
      {
        value: 'all',
        label: 'Tất cả Sale phụ trách',
        icon: <Users size={14} style={{ color: 'var(--color-primary, #BD1D2D)' }} />
      }
    ];
    if (Array.isArray(data?.filter_options?.owners)) {
      return [
        ...base,
        ...data!.filter_options.owners.map((o) => ({
          value: String(o.value),
          label: o.label,
          avatar: o.avatar || undefined,
          sublabel: o.sublabel || undefined
        }))
      ];
    }
    return base;
  }, [data?.filter_options?.owners]);

  const schoolOptions = useMemo(() => {
    const base = [{ value: 'all', label: 'Tất cả Trường / Chương trình' }];
    if (Array.isArray(data?.filter_options?.schools)) {
      return [...base, ...data!.filter_options.schools];
    }
    return base;
  }, [data?.filter_options?.schools]);

  const intakeOptions = useMemo(() => {
    const base = [{ value: 'all', label: 'Tất cả Khóa học (Intake)' }];
    if (Array.isArray(data?.filter_options?.intakes)) {
      return [...base, ...data!.filter_options.intakes];
    }
    return base;
  }, [data?.filter_options?.intakes]);

  const jobGroupOptions = useMemo(() => {
    const base = [{ value: 'all', label: 'Tất cả Nhóm chức vụ' }];
    if (Array.isArray(data?.filter_options?.job_groups)) {
      return [...base, ...data!.filter_options.job_groups];
    }
    return base;
  }, [data?.filter_options?.job_groups]);

  const industryOptions = useMemo(() => {
    const base = [{ value: 'all', label: 'Tất cả Ngành nghề / Lĩnh vực' }];
    if (Array.isArray(data?.filter_options?.industries)) {
      return [...base, ...data!.filter_options.industries];
    }
    return base;
  }, [data?.filter_options?.industries]);

  const selectedOwnerName = useMemo(() => {
    if (selectedOwner === 'all') return '';
    const found = (data?.filter_options?.owners || []).find((o) => String(o.value) === String(selectedOwner));
    return found?.name || found?.label || selectedOwner;
  }, [data?.filter_options?.owners, selectedOwner]);

  const filteredCompanies = useMemo(() => {
    const list = ensureArray<BreakdownItem>(data?.top_companies);
    if (!deferredCompanySearch.trim()) return list;
    const q = deferredCompanySearch.trim().toLowerCase();
    return list.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        (c.key && c.key.toLowerCase().includes(q)) ||
        (Array.isArray(c.variants) && c.variants.some((v) => v.toLowerCase().includes(q)))
    );
  }, [data?.top_companies, deferredCompanySearch]);

  const filteredIntakes = useMemo(() => {
    const list = ensureArray<BreakdownItem>(data?.by_intake);
    if (!deferredIntakeSearch.trim()) return list;
    const q = deferredIntakeSearch.trim().toLowerCase();
    return list.filter((i) => i.label.toLowerCase().includes(q));
  }, [data?.by_intake, deferredIntakeSearch]);

  const chartIntakes = useMemo(() => {
    const list = ensureArray<BreakdownItem>(data?.by_intake);
    return list
      .filter((i) => i.label !== 'Chưa gắn Intake')
      .slice(0, 12)
      .map((it) => ({
        name: it.label
          .replace(/^([A-Za-z0-9-]+)\s*-\s*Intake\s+/i, '$1 K.')
          .replace(/^Intake\s+/i, 'K.'),
        fullLabel: it.label,
        count: it.count,
        pct: it.pct
      }));
  }, [data?.by_intake]);

  const ageChartData = useMemo(
    () =>
      ensureArray<BreakdownItem>(data?.by_age_group).map((ag) => ({
        name: ag.label
          .replace('Dưới 25 tuổi', '<25')
          .replace('Trên 55 tuổi', '55+')
          .replace('Chưa có ngày sinh', 'Chưa rõ')
          .replace(/\s*tuổi$/i, ''),
        fullLabel: ag.label,
        count: ag.count,
        pct: ag.pct
      })),
    [data?.by_age_group]
  );

  const filteredOwners = useMemo(() => {
    const list = ensureArray<OwnerBreakdownItem>(data?.by_owner);
    if (!deferredOwnerSearch.trim()) return list;
    const q = deferredOwnerSearch.trim().toLowerCase();
    return list.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.email || '').toLowerCase().includes(q)
    );
  }, [data?.by_owner, deferredOwnerSearch]);

  const filteredMultiStudents = useMemo(() => {
    const list = ensureArray<MultiCourseStudent>(data?.multi_course_students);
    if (!deferredMultiStudentSearch.trim()) return list;
    const q = deferredMultiStudentSearch.trim().toLowerCase();
    return list.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        s.phone.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q) ||
        s.company.toLowerCase().includes(q) ||
        s.job_title.toLowerCase().includes(q) ||
        (s.owner_name || '').toLowerCase().includes(q) ||
        ensureArray(s.courses).some((c) => c.label.toLowerCase().includes(q))
    );
  }, [data?.multi_course_students, deferredMultiStudentSearch]);

  const paginatedMultiStudents = useMemo(() => {
    const start = (multiPage - 1) * MULTI_PAGE_SIZE;
    return filteredMultiStudents.slice(start, start + MULTI_PAGE_SIZE);
  }, [filteredMultiStudents, multiPage]);

  const totalMultiPages = Math.max(1, Math.ceil(filteredMultiStudents.length / MULTI_PAGE_SIZE));

  const summary = data?.summary || {
    total_profiles: 0,
    unique_persons: 0,
    multi_course_persons: 0,
    with_phone: 0,
    with_email: 0,
    with_gender: 0,
    male_count: 0,
    female_count: 0,
    unknown_gender_count: 0,
    avg_age: 0,
    with_job_title: 0,
    with_company: 0,
    with_industry: 0,
    with_intake: 0,
    with_birthday: 0,
    distinct_companies: 0,
    distinct_intakes: 0,
    distinct_schools: 0
  };

  const malePct = summary.total_profiles > 0 ? Math.round((summary.male_count / summary.total_profiles) * 1000) / 10 : 0;
  const femalePct = summary.total_profiles > 0 ? Math.round((summary.female_count / summary.total_profiles) * 1000) / 10 : 0;
  const unknownGenderPct = Math.max(0, Math.round((100 - malePct - femalePct) * 10) / 10);
  const intakeFilledPct =
    summary.total_profiles > 0 ? Math.round((summary.with_intake / summary.total_profiles) * 1000) / 10 : 0;

  // Gender Donut SVG geometry (50% left column)
  const genderDonutRadius = 64;
  const genderDonutCircumference = 2 * Math.PI * genderDonutRadius;
  const maleArc = (malePct / 100) * genderDonutCircumference;
  const femaleArc = (femalePct / 100) * genderDonutCircumference;

  // School Donut SVG geometry (50% right column of School Card)
  const schoolDonutRadius = 64;
  const schoolDonutCircumference = 2 * Math.PI * schoolDonutRadius;
  const schoolSegments = useMemo(() => {
    const list = Array.isArray(data?.by_school_program) ? data!.by_school_program : [];
    let accOffset = 0;
    return list.map((item, idx) => {
      const color = item.label === 'Chưa phân loại' ? '#94a3b8' : PALETTE[idx % PALETTE.length];
      const arc = (item.pct / 100) * schoolDonutCircumference;
      const seg = {
        ...item,
        color,
        arc,
        offset: -accOffset
      };
      accOffset += arc;
      return seg;
    });
  }, [data?.by_school_program, schoolDonutCircumference]);

  const topSchool = schoolSegments[0] || null;

  // Average completeness score across 8 fields
  const avgCompletenessPct = useMemo(() => {
    const list = Array.isArray(data?.data_completeness) ? data!.data_completeness : [];
    if (list.length === 0) return 0;
    const sum = list.reduce((acc, c) => acc + Number(c.pct || 0), 0);
    return Math.round((sum / list.length) * 10) / 10;
  }, [data?.data_completeness]);

  const handleOpenStudentProfile = useCallback(
    (st: MultiCourseStudent, specificContactId?: number) => {
      const targetId = specificContactId || st.primary_id;
      if (!targetId || !onOpenContact) return;
      onOpenContact(targetId, {
        id: targetId,
        full_name: st.full_name,
        phone: st.phone,
        email: st.email,
        gender: st.gender,
        job_title: st.job_title,
        company: st.company,
        status: segmentFilter === 'student' ? 'customer' : 'lead'
      });
    },
    [onOpenContact, segmentFilter]
  );

  const handleScrollMultiCourse = useCallback(() => {
    const el = document.getElementById('multi-course-students-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleToggleSchool = useCallback((label: string) => {
    setSelectedSchool((prev) => (prev === label ? 'all' : label));
    setMultiPage(1);
  }, []);

  const handleToggleGender = useCallback((gender: string) => {
    setSelectedGender((prev) => (prev === gender ? 'all' : gender));
    setMultiPage(1);
  }, []);

  const handleToggleOwner = useCallback((ownerId: string) => {
    setSelectedOwner((prev) => (String(prev) === String(ownerId) ? 'all' : String(ownerId)));
    setMultiPage(1);
  }, []);

  const handleToggleIntake = useCallback((label: string) => {
    setSelectedIntake((prev) => (prev === label ? 'all' : label));
    setMultiPage(1);
  }, []);

  const handleToggleJobGroup = useCallback((label: string) => {
    setSelectedJobGroup((prev) => (prev === label ? 'all' : label));
    setMultiPage(1);
  }, []);

  const handleToggleIndustry = useCallback((label: string) => {
    setSelectedIndustry((prev) => (prev === label ? 'all' : label));
    setMultiPage(1);
  }, []);

  const handleToggleCompany = useCallback((label: string) => {
    setSelectedCompany((prev) => (prev === label ? 'all' : label));
    setMultiPage(1);
  }, []);

  const handleIntakeViewModeChange = useCallback((mode: 'chart' | 'grid') => {
    setIntakeSearch('');
    setIntakeViewMode(mode);
  }, []);

  const handleIntakeSearchChange = useCallback((val: string) => {
    setIntakeSearch(val);
    if (val) setIntakeViewMode('grid');
  }, []);

  const handleMultiSearchChange = useCallback((val: string) => {
    setMultiStudentSearch(val);
    setMultiPage(1);
  }, []);

  const handleRefreshPersona = useCallback(() => {
    if (inFlightRefreshRef.current) return;
    fetchPersonaOverview(
      {
        tenantId,
        userId,
        seg: segmentFilter,
        owner: selectedOwner,
        school: selectedSchool,
        intake: selectedIntake,
        gender: selectedGender,
        jobGroup: selectedJobGroup,
        industry: selectedIndustry,
        company: selectedCompany,
        multiCourse: multiCourseOnly,
        dateFilter: externalDateFilter,
        fromDate: customFromDate,
        toDate: customToDate
      },
      true
    );
  }, [
    fetchPersonaOverview,
    tenantId,
    userId,
    segmentFilter,
    selectedOwner,
    selectedSchool,
    selectedIntake,
    selectedGender,
    selectedJobGroup,
    selectedIndustry,
    selectedCompany,
    multiCourseOnly,
    externalDateFilter,
    customFromDate,
    customToDate
  ]);

  const segmentSwitchOptions = useMemo(
    () => [
      {
        value: 'student' as const,
        label: 'Học viên',
        icon: <GraduationCap size={14} />
      },
      {
        value: 'lead' as const,
        label: isMobile ? 'Tiềm năng' : 'Tiềm năng (Lead)',
        icon: <Users size={14} />
      }
    ],
    [isMobile]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
      {/* Unified 36px DOMATION Dashboard Filter & Segment Toolbar */}
      <DomDashboardToolbar
        elevated
        left={
          <>
            <DomSegmentedSwitch<'student' | 'lead'>
              size="md"
              ariaLabel="Chuyển đổi phân khúc chân dung"
              value={segmentFilter}
              onChange={(nextSeg) => {
                if (segmentFilter !== nextSeg) {
                  setSegmentFilter(nextSeg);
                  handleResetAllFilters();
                }
              }}
              options={segmentSwitchOptions}
            />

            {!isMobile && (
              <>
                <div style={{ flex: '1 1 190px', minWidth: '175px', maxWidth: '240px' }}>
                  <CustomSelect
                    options={ownerOptions}
                    value={selectedOwner}
                    onChange={(val) => {
                      setSelectedOwner(String(val));
                      setMultiPage(1);
                    }}
                    searchable
                    showAvatars
                    hideSelectedSublabel
                    placeholder="Sale phụ trách..."
                    size="sm"
                    width="100%"
                  />
                </div>

                <div style={{ flex: '1 1 180px', minWidth: '165px', maxWidth: '230px' }}>
                  <CustomSelect
                    options={schoolOptions}
                    value={selectedSchool}
                    onChange={(val) => {
                      setSelectedSchool(String(val));
                      setMultiPage(1);
                    }}
                    searchable
                    size="sm"
                    width="100%"
                  />
                </div>

                <div style={{ flex: '1 1 165px', minWidth: '155px', maxWidth: '215px' }}>
                  <CustomSelect
                    options={intakeOptions}
                    value={selectedIntake}
                    onChange={(val) => {
                      setSelectedIntake(String(val));
                      setMultiPage(1);
                    }}
                    searchable
                    size="sm"
                    width="100%"
                  />
                </div>
              </>
            )}
          </>
        }
        right={
          !isMobile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <DomDateRangePill
                fromDate={customFromDate}
                toDate={customToDate}
                onFromChange={(iso) => {
                  setCustomFromDate(iso);
                  setMultiPage(1);
                }}
                onToChange={(iso) => {
                  setCustomToDate(iso);
                  setMultiPage(1);
                }}
              />
              {(customFromDate || customToDate) && (
                <DomToolbarButton
                  variant="ghost"
                  icon={<X size={13} />}
                  onClick={() => {
                    setCustomFromDate('');
                    setCustomToDate('');
                    setMultiPage(1);
                  }}
                  title="Xóa khoảng ngày"
                  aria-label="Xóa khoảng ngày"
                  style={{ width: '36px', padding: 0 }}
                />
              )}
            </div>
          ) : undefined
        }
        actions={
          <>
            <DomToolbarButton
              variant="outline"
              disabled={exportingCsv}
              loading={exportingCsv}
              icon={!exportingCsv ? <Download size={14} /> : undefined}
              onClick={handleExportParityCsv}
              title="Xuất file CSV đúng tập hồ sơ đang lọc"
            >
              {exportingCsv ? 'Đang xuất...' : 'Xuất CSV'}
            </DomToolbarButton>

            <DomToolbarButton
              variant="outline"
              active={activeFilterCount > 0}
              icon={<SlidersHorizontal size={14} />}
              badge={activeFilterCount > 0 ? activeFilterCount : undefined}
              onClick={() => setShowAdvancedDrawer(true)}
              title="Mở bảng Bộ lọc nâng cao"
            >
              {isMobile ? 'Bộ lọc' : 'Bộ lọc nâng cao'}
            </DomToolbarButton>

            {!isMobile && activeFilterCount > 0 && (
              <DomToolbarButton
                variant="outline"
                icon={<RotateCcw size={13} />}
                onClick={handleResetAllFilters}
              >
                Đặt lại
              </DomToolbarButton>
            )}

            <DomToolbarButton
              variant="outline"
              disabled={loading || isRefreshing || inFlightRefreshRef.current}
              icon={<RefreshCw size={14} className={loading || isRefreshing ? 'animate-spin' : ''} />}
              onClick={handleRefreshPersona}
              title="Làm mới dữ liệu"
              aria-label="Làm mới dữ liệu"
              style={{ width: '36px', padding: 0 }}
            />
          </>
        }
      />

      {/* SKELETON LOADING WHEN SWITCHING BETWEEN HỌC VIÊN / TIỀM NĂNG OR FILTERING */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            <DonutAndRankedListSkeleton />
            <DonutAndBarChartSkeleton />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            <LeaderboardCardSkeleton rows={5} />
            <ChartSkeleton height={240} />
          </div>
          <CompletenessGridSkeleton items={8} />
          <TableSkeleton rows={6} cols={6} />
        </div>
      ) : error && !data ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontWeight: 700, color: 'var(--color-danger)' }}>{error}</div>
          <DomToolbarButton variant="outline" icon={<RefreshCw size={14} />} onClick={handleRefreshPersona}>
            Thử lại
          </DomToolbarButton>
        </div>
      ) : (
        <>
          {/* Active Filter Chips Bar */}
          {activeFilterCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '6px',
                padding: '8px 12px',
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border-light)',
                borderRadius: '10px',
                fontSize: '0.78rem'
              }}
            >
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 600, marginRight: '4px' }}>Đang lọc:</span>

              {selectedOwner !== 'all' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Sale: {selectedOwnerName}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedOwner('all')}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {selectedSchool !== 'all' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    border: '1px solid rgba(189, 29, 45, 0.16)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Trường: {selectedSchool}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedSchool('all')}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {selectedIntake !== 'all' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Khóa: {selectedIntake}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIntake('all')}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {selectedGender !== 'all' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Giới tính: {selectedGender}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedGender('all')}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {selectedJobGroup !== 'all' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Chức vụ: {selectedJobGroup}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedJobGroup('all')}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {selectedIndustry !== 'all' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Ngành nghề: {selectedIndustry}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedIndustry('all')}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {selectedCompany !== 'all' && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    border: '1px solid rgba(189, 29, 45, 0.16)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Đơn vị: {selectedCompany}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedCompany('all')}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {multiCourseOnly && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    border: '1px solid rgba(189, 29, 45, 0.16)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Học nhiều khóa (≥ 2)</span>
                  <button
                    type="button"
                    onClick={() => setMultiCourseOnly(false)}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              {customFromDate && customToDate && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '3px 9px',
                    borderRadius: '8px',
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    fontSize: '0.75rem',
                    fontWeight: 600
                  }}
                >
                  <span>Thời gian: {customFromDate} → {customToDate}</span>
                  <button
                    type="button"
                    onClick={() => { setCustomFromDate(''); setCustomToDate(''); }}
                    style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}
                  >
                    <X size={12} />
                  </button>
                </span>
              )}

              <button
                type="button"
                onClick={handleResetAllFilters}
                style={{
                  marginLeft: 'auto',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-danger, #ef4444)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <RotateCcw size={12} />
                <span>Xóa tất cả</span>
              </button>
            </div>
          )}

          {/* 4 App-Standard KPI Cards — DOMATION Brand Red Hero + Executive Slate Tiles */}
          <PersonaKpiStrip
            segmentFilter={segmentFilter}
            summary={summary}
            intakeFilledPct={intakeFilledPct}
            onScrollMultiCourse={handleScrollMultiCourse}
          />

          {/* ROW 1: TRƯỜNG / CHƯƠNG TRÌNH ĐÀO TẠO & CƠ CẤU GIỚI TÍNH + ĐỘ TUỔI */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            <SchoolProgramPanel
              isMobile={isMobile}
              schools={ensureArray<BreakdownItem>(data?.by_school_program)}
              schoolSegments={schoolSegments}
              topSchool={topSchool}
              schoolDonutRadius={schoolDonutRadius}
              schoolDonutCircumference={schoolDonutCircumference}
              selectedSchool={selectedSchool}
              onSelectSchool={handleToggleSchool}
            />

            <GenderAgePanel
              isMobile={isMobile}
              summary={summary}
              malePct={malePct}
              femalePct={femalePct}
              unknownGenderPct={unknownGenderPct}
              genderDonutRadius={genderDonutRadius}
              genderDonutCircumference={genderDonutCircumference}
              maleArc={maleArc}
              femaleArc={femaleArc}
              selectedGender={selectedGender}
              ageChartData={ageChartData}
              onSelectGender={handleToggleGender}
            />
          </div>

          {/* ROW 2: TOP TƯ VẤN VIÊN & BIỂU ĐỒ CỘT KHÓA HỌC INTAKE */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            <TopOwnersPanel
              ownerSearch={ownerSearch}
              onOwnerSearchChange={setOwnerSearch}
              filteredOwners={filteredOwners}
              selectedOwner={selectedOwner}
              onSelectOwner={handleToggleOwner}
            />

            <IntakePanel
              distinctIntakes={summary.distinct_intakes}
              intakeViewMode={intakeViewMode}
              intakeSearch={intakeSearch}
              onChangeViewMode={handleIntakeViewModeChange}
              onIntakeSearchChange={handleIntakeSearchChange}
              chartIntakes={chartIntakes}
              filteredIntakes={filteredIntakes}
              selectedIntake={selectedIntake}
              onSelectIntake={handleToggleIntake}
            />
          </div>

          {/* ROW 3: THÁP CẤP BẬC CHỨC VỤ & NHÓM NGÀNH NGHỀ */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(440px, 1fr))', gap: '1.25rem' }}>
            <JobPyramidPanel
              withJobTitleCount={summary.with_job_title}
              jobGroups={ensureArray<BreakdownItem>(data?.by_job_group)}
              topJobTitles={ensureArray<BreakdownItem>(data?.top_job_titles)}
              selectedJobGroup={selectedJobGroup}
              onSelectJobGroup={handleToggleJobGroup}
            />

            <IndustryBreakdownPanel
              isMobile={isMobile}
              withIndustryCount={summary.with_industry}
              industries={ensureArray<BreakdownItem>(data?.by_industry)}
              selectedIndustry={selectedIndustry}
              onSelectIndustry={handleToggleIndustry}
            />
          </div>

          {/* ROW 4: TOP CÔNG TY / ĐƠN VỊ CÔNG TÁC & ĐỘ ĐẦY ĐỦ DỮ LIỆU CHÂN DUNG */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: '1.25rem' }}>
            <TopCompaniesPanel
              isMobile={isMobile}
              distinctCompanies={summary.distinct_companies}
              companySearch={companySearch}
              onCompanySearchChange={setCompanySearch}
              filteredCompanies={filteredCompanies}
              selectedCompany={selectedCompany}
              onSelectCompany={handleToggleCompany}
            />

            <DataCompletenessPanel
              avgCompletenessPct={avgCompletenessPct}
              items={ensureArray<CompletenessItem>(data?.data_completeness)}
            />
          </div>

          {/* ROW 5: DANH SÁCH HỌC VIÊN HỌC NHIỀU KHÓA / NHIỀU CHƯƠNG TRÌNH */}
          <MultiCourseStudentsPanel
            totalFilteredCount={filteredMultiStudents.length}
            paginatedMultiStudents={paginatedMultiStudents}
            multiStudentSearch={multiStudentSearch}
            onMultiStudentSearchChange={handleMultiSearchChange}
            multiPage={multiPage}
            totalMultiPages={totalMultiPages}
            pageSize={MULTI_PAGE_SIZE}
            onPageChange={setMultiPage}
            onOpenStudentProfile={handleOpenStudentProfile}
            onOpenCourseModal={setCourseModalStudent}
          />
        </>
      )}

      {/* MODAL CHI TIẾT CÁC KHÓA ĐÃ HỌC CỦA HỌC VIÊN */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {courseModalStudent && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 2147483610,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '16px'
                }}
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setCourseModalStudent(null)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(15, 23, 42, 0.55)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)'
                  }}
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96, y: 10 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: '560px',
                    maxHeight: '85dvh',
                    background: 'var(--color-surface, #ffffff)',
                    borderRadius: '16px',
                    border: '1px solid var(--color-border)',
                    boxShadow: '0 24px 60px -12px rgba(15, 23, 42, 0.25)',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    zIndex: 1
                  }}
                >
                  {/* Modal Header */}
                  <div
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid var(--color-border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <Avatar name={courseModalStudent.full_name} size={42} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--color-text)' }}>
                            {courseModalStudent.full_name}
                          </h3>
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              color: '#BD1D2D',
                              background: 'rgba(189, 29, 45, 0.08)',
                              padding: '2px 8px',
                              borderRadius: '999px'
                            }}
                          >
                            {courseModalStudent.course_count} khóa học
                          </span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                          {[courseModalStudent.phone, courseModalStudent.email].filter(Boolean).join(' • ') || '—'}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCourseModalStudent(null)}
                      className="macos-drawer-close"
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-alt, #f8fafc)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: 'var(--color-text-muted)'
                      }}
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Modal Body: Course Cards */}
                  <div style={{ padding: '16px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(courseModalStudent.job_title || courseModalStudent.company) && (
                      <div
                        style={{
                          padding: '10px 12px',
                          borderRadius: '10px',
                          background: 'var(--color-bg-alt, #f8fafc)',
                          border: '1px solid var(--color-border-light)',
                          fontSize: '0.78rem',
                          color: 'var(--color-text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                      >
                        <Briefcase size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                        <span>
                          <strong style={{ color: 'var(--color-text)' }}>{courseModalStudent.job_title || 'Chưa cập nhật chức vụ'}</strong>
                          {courseModalStudent.company ? ` — ${courseModalStudent.company}` : ''}
                        </span>
                      </div>
                    )}

                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '4px' }}>
                      Danh sách các Trường &amp; Khóa đã đăng ký ({courseModalStudent.courses.length})
                    </div>

                    {courseModalStudent.courses.map((c, cIdx) => (
                      <div
                        key={`${c.contact_id}_${cIdx}`}
                        onClick={() => {
                          const targetStudent = courseModalStudent;
                          setCourseModalStudent(null);
                          handleOpenStudentProfile(targetStudent, c.contact_id);
                        }}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '11px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface, #ffffff)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.03)'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <div
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '8px',
                              background: 'rgba(189, 29, 45, 0.08)',
                              color: '#BD1D2D',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 800,
                              fontSize: '0.78rem',
                              flexShrink: 0
                            }}
                          >
                            #{cIdx + 1}
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--color-text)' }}>
                              {c.label}
                            </div>
                            <div style={{ fontSize: '0.73rem', color: 'var(--color-text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              {c.school && <span>Trường: <strong>{c.school}</strong></span>}
                              {c.intake && <span>• Khóa: <strong>{c.intake}</strong></span>}
                              {c.student_id && (
                                <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>• Mã HV: {c.student_id}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <DomToolbarButton
                          variant="outline"
                          icon={<ExternalLink size={12} />}
                          onClick={(e) => {
                            e.stopPropagation();
                            const targetStudent = courseModalStudent;
                            setCourseModalStudent(null);
                            handleOpenStudentProfile(targetStudent, c.contact_id);
                          }}
                          style={{ height: '32px', padding: '0 10px', fontSize: '0.74rem', flexShrink: 0 }}
                        >
                          Mở hồ sơ
                        </DomToolbarButton>
                      </div>
                    ))}
                  </div>

                  {/* Modal Footer */}
                  <div
                    style={{
                      padding: '12px 20px',
                      borderTop: '1px solid var(--color-border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'flex-end',
                      gap: '8px',
                      background: 'var(--color-bg-alt, #f8fafc)'
                    }}
                  >
                    <DomToolbarButton
                      variant="outline"
                      onClick={() => setCourseModalStudent(null)}
                    >
                      Đóng
                    </DomToolbarButton>
                    <DomToolbarButton
                      variant="primary"
                      icon={<ExternalLink size={13} />}
                      onClick={() => {
                        const targetStudent = courseModalStudent;
                        setCourseModalStudent(null);
                        handleOpenStudentProfile(targetStudent);
                      }}
                    >
                      Xem Hồ sơ 360° chính
                    </DomToolbarButton>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* WIDE SLIDE-OVER DRAWER FOR ADVANCED FILTERS (Matching ContactsPage "Bộ lọc đa tầng chuyên sâu") */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {showAdvancedDrawer && (
              <div
                style={{
                  position: 'fixed',
                  inset: 0,
                  zIndex: 2147483625,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  overflow: 'hidden'
                }}
              >
                <motion.div
                  className="drawer-backdrop"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                  onClick={() => setShowAdvancedDrawer(false)}
                  style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(6px)',
                    WebkitBackdropFilter: 'blur(6px)',
                    zIndex: 2147483620
                  }}
                />

                <motion.div
                  className="drawer-panel"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                  style={{
                    position: 'relative',
                    width: '100%',
                    maxWidth: isMobile ? '100%' : 'min(95vw, 780px)',
                    height: '100%',
                    background: 'var(--color-surface, #ffffff)',
                    boxShadow: '-8px 0 36px rgba(0, 0, 0, 0.28)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 2147483625,
                    overflow: 'hidden'
                  }}
                >
                  {/* Drawer Header */}
                  <div
                    style={{
                      padding: isMobile ? '1rem' : '1.25rem 1.5rem',
                      borderBottom: '1px solid var(--color-border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--color-surface)',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '10px',
                          background: 'rgba(189, 29, 45, 0.1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'var(--color-primary, #BD1D2D)'
                        }}
                      >
                        <SlidersHorizontal size={18} />
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)' }}>
                          Bộ lọc đa tầng chuyên sâu
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                          Lọc chân dung Học viên &amp; Tiềm năng theo Sale phụ trách, Trường, Khóa, Chức vụ &amp; Ngành nghề
                        </p>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {activeFilterCount > 0 && (
                        <button
                          type="button"
                          onClick={handleResetAllFilters}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--color-border)',
                            background: 'transparent',
                            color: 'var(--color-danger, #ef4444)',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          <RotateCcw size={12} /> Đặt lại
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowAdvancedDrawer(false)}
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          color: 'var(--color-text-muted)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>

                  {/* Drawer Body */}
                  <div
                    style={{
                      flex: 1,
                      overflowY: 'auto',
                      padding: '1.25rem 1.5rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1.1rem',
                      background: 'var(--color-bg-secondary)'
                    }}
                  >
                    {/* Card 1: Đối tượng & Sale Phụ Trách */}
                    <div
                      style={{
                        padding: '1.15rem',
                        borderRadius: '14px',
                        background: 'var(--color-surface, #ffffff)',
                        border: '1px solid var(--color-border-light)',
                        boxShadow: '0 1px 2px rgba(15,23,42,0.03)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          color: 'var(--color-text, #0f172a)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '0.875rem'
                        }}
                      >
                        <Users size={16} /> Đối Tượng &amp; Sale Phụ Trách
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                            Tệp dữ liệu thống kê
                          </label>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {[
                              { id: 'student' as const, label: 'Học viên (Mặc định)' },
                              { id: 'lead' as const, label: 'Tiềm năng (Lead)' }
                            ].map((item) => {
                              const isAct = segmentFilter === item.id;
                              return (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setSegmentFilter(item.id);
                                    handleResetAllFilters();
                                  }}
                                  style={{
                                    padding: '8px 10px',
                                    fontSize: '0.8rem',
                                    fontWeight: isAct ? 700 : 500,
                                    borderRadius: '8px',
                                    border: isAct ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                                    background: 'var(--color-surface, #ffffff)',
                                    color: isAct ? 'var(--color-primary)' : 'var(--color-text)',
                                    cursor: 'pointer'
                                  }}
                                >
                                  {item.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                            Sale / Tư vấn viên phụ trách (Có Avatar &amp; Tìm kiếm)
                          </label>
                          <CustomSelect
                            options={ownerOptions}
                            value={selectedOwner}
                            onChange={(val) => {
                              setSelectedOwner(String(val));
                              setMultiPage(1);
                            }}
                            searchable
                            showAvatars
                            placeholder="Chọn hoặc tìm tên Sale..."
                            width="100%"
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                            Từ ngày (Tùy chọn)
                          </label>
                          <VietnameseDateInput
                            size="md"
                            value={customFromDate}
                            onChange={(iso) => { setCustomFromDate(iso); setMultiPage(1); }}
                            placeholder="dd/mm/yyyy"
                            style={{ width: '100%' }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                            Đến ngày (Tùy chọn)
                          </label>
                          <VietnameseDateInput
                            size="md"
                            value={customToDate}
                            onChange={(iso) => { setCustomToDate(iso); setMultiPage(1); }}
                            placeholder="dd/mm/yyyy"
                            style={{ width: '100%' }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Trường, Khóa học & Đa khóa */}
                    <div
                      style={{
                        padding: '1.15rem',
                        borderRadius: '14px',
                        background: 'var(--color-surface, #ffffff)',
                        border: '1px solid var(--color-border-light)',
                        boxShadow: '0 1px 2px rgba(15,23,42,0.03)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          color: 'var(--color-text, #0f172a)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '0.875rem'
                        }}
                      >
                        <GraduationCap size={16} /> Học Vụ, Trường &amp; Khóa Học (Intake)
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                            Trường / Chương trình đào tạo
                          </label>
                          <CustomSelect
                            options={schoolOptions}
                            value={selectedSchool}
                            onChange={(val) => {
                              setSelectedSchool(String(val));
                              setMultiPage(1);
                            }}
                            searchable
                            width="100%"
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                            Khóa học / Kỳ nhập học (Intake)
                          </label>
                          <CustomSelect
                            options={intakeOptions}
                            value={selectedIntake}
                            onChange={(val) => {
                              setSelectedIntake(String(val));
                              setMultiPage(1);
                            }}
                            searchable
                            width="100%"
                          />
                        </div>
                      </div>

                      <div>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                          Phân loại Học viên đa khóa / đa chương trình
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                          <button
                            type="button"
                            onClick={() => {
                              setMultiCourseOnly(false);
                              setMultiPage(1);
                            }}
                            style={{
                              padding: '8px 10px',
                              fontSize: '0.8rem',
                              fontWeight: !multiCourseOnly ? 700 : 500,
                              borderRadius: '8px',
                              border: !multiCourseOnly ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                              background: 'var(--color-surface, #ffffff)',
                              color: !multiCourseOnly ? 'var(--color-primary)' : 'var(--color-text)',
                              cursor: 'pointer'
                            }}
                          >
                            Tất cả hồ sơ
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setMultiCourseOnly(true);
                              setMultiPage(1);
                            }}
                            style={{
                              padding: '8px 10px',
                              fontSize: '0.8rem',
                              fontWeight: multiCourseOnly ? 700 : 500,
                              borderRadius: '8px',
                              border: multiCourseOnly ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                              background: 'var(--color-surface, #ffffff)',
                              color: multiCourseOnly ? 'var(--color-primary)' : 'var(--color-text)',
                              cursor: 'pointer'
                            }}
                          >
                            Học viên đa khóa (≥ 2 khóa / trường)
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Card 3: Nhân khẩu học, Chức vụ & Ngành nghề */}
                    <div
                      style={{
                        padding: '1.15rem',
                        borderRadius: '14px',
                        background: 'var(--color-surface, #ffffff)',
                        border: '1px solid var(--color-border-light)',
                        boxShadow: '0 1px 2px rgba(15,23,42,0.03)'
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          color: 'var(--color-text, #0f172a)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                          marginBottom: '0.875rem'
                        }}
                      >
                        <Briefcase size={16} /> Nhân Khẩu Học, Chức Vụ &amp; Ngành Nghề
                      </div>

                      <div style={{ marginBottom: '1rem' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                          Giới tính
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                          {[
                            { id: 'all', label: 'Tất cả' },
                            { id: 'Nam', label: 'Nam' },
                            { id: 'Nữ', label: 'Nữ' },
                            { id: 'Chưa rõ', label: 'Chưa rõ' }
                          ].map((g) => {
                            const isAct = selectedGender === g.id;
                            return (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => {
                                  setSelectedGender(g.id);
                                  setMultiPage(1);
                                }}
                                style={{
                                  padding: '8px 10px',
                                  fontSize: '0.8rem',
                                  fontWeight: isAct ? 700 : 500,
                                  borderRadius: '8px',
                                  border: isAct ? '1.5px solid var(--color-primary)' : '1px solid var(--color-border)',
                                  background: 'var(--color-surface, #ffffff)',
                                  color: isAct ? 'var(--color-primary)' : 'var(--color-text)',
                                  cursor: 'pointer'
                                }}
                              >
                                {g.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                            Nhóm chức vụ / Cấp bậc quản lý
                          </label>
                          <CustomSelect
                            options={jobGroupOptions}
                            value={selectedJobGroup}
                            onChange={(val) => {
                              setSelectedJobGroup(String(val));
                              setMultiPage(1);
                            }}
                            searchable
                            width="100%"
                          />
                        </div>

                        <div>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: '6px' }}>
                            Nhóm ngành nghề / Lĩnh vực
                          </label>
                          <CustomSelect
                            options={industryOptions}
                            value={selectedIndustry}
                            onChange={(val) => {
                              setSelectedIndustry(String(val));
                              setMultiPage(1);
                            }}
                            searchable
                            width="100%"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Drawer Footer */}
                  <div
                    style={{
                      padding: '1rem 1.5rem',
                      borderTop: '1px solid var(--color-border)',
                      background: 'var(--color-surface)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px'
                    }}
                  >
                    <button
                      type="button"
                      className="btn outline"
                      onClick={handleResetAllFilters}
                      style={{ borderRadius: '10px', fontWeight: 600 }}
                    >
                      Đặt lại
                    </button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        className="btn outline"
                        onClick={() => setShowAdvancedDrawer(false)}
                        style={{ borderRadius: '10px', fontWeight: 600 }}
                      >
                        Đóng
                      </button>
                      <button
                        type="button"
                        className="btn primary"
                        onClick={() => setShowAdvancedDrawer(false)}
                        style={{
                          borderRadius: '10px',
                          fontWeight: 700,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Check size={16} />
                        <span>Áp dụng bộ lọc ({summary.total_profiles.toLocaleString('vi-VN')} hồ sơ)</span>
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

export default CustomerPersonaOverviewDeck;
