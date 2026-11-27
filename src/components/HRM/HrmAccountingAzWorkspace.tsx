import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2, Users, FileText, Calculator, BookOpen, CheckCircle2,
  Download, Copy, RefreshCw, ShieldCheck, DollarSign, Calendar,
  ChevronRight, TrendingUp, Layers, FileSpreadsheet,
  Clock, X, Search, SlidersHorizontal, Landmark, Plus,
  Upload, Trash2, Edit3, Save, Database, AlertTriangle, Lock, Unlock, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
  Cell
} from 'recharts';
import { fetchAPI } from '../../utils/api';
import { Avatar } from '../ui/Avatar';
import { EmptyCard } from '../ui/EmptyCard';
import { TableSkeleton } from '../ui/Skeleton';
import { ResponsiveSegmentedTabs, ResponsiveActionGroup } from '../ui/MobileResponsiveTabs';
import { useTenantConfig, getTenantOrganizationName } from '../../contexts/TenantConfigContext';
import { useSettingsBootstrap, useTypedSetting } from '../../contexts/SettingsBootstrapContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  isAccountant,
  isExecutive,
  isHR,
  isSystemAdmin,
  hasDynamicModulePermission
} from '../../utils/roleUtils';
import { pushOverlay } from '../../utils/overlayStack';
import { useUIStore } from '../../store/uiStore';
import { escapeHtml } from '../../utils/sanitizeHtml';
import { ensureArray, extractArray } from '../../utils/safeArray';
import { VietnameseDateInput } from '../ui/VietnameseDateInput';
import {
  DomKpiTile,
  DomPanelCard,
  DomRankBarRow,
  DomChartTooltip,
  DomToolbarButton,
  DomEmptyChartState,
} from '../Dashboard/DomationDashboardKit';
import {
  rulesFor,
  fmt,
  num,
  iso,
  TODAY,
  uid,
  ymParse,
  ymLabel,
  dmy,
  dParse,
  daysBetween,
  LAW,
  CODES,
  CODE,
  CT_TYPES,
  CO_FIELDS,
  EMP_FIELDS,
  type AzCompany,
  type AzEmployee,
  type AzContract,
  type AzDatabase,
  type AzPayRow,
  type AzStatutoryOverrides,
  type AzHtkkDeclOpts,
  type AzImportPreviewRow,
  blankEmp,
  newCompany,
  sampleCompany,
  DOW,
  monthDays,
  inService,
  serviceDay,
  ensureMonth,
  fillFull,
  markHolidays,
  attSummary,
  empContracts,
  contractAt,
  contractAlerts,
  payroll,
  slipLines,
  allTaxRecords,
  KK_ROWS,
  QTT_ROWS,
  computeKK,
  computeQTT,
  buildKKXml,
  buildQTTXml,
  getKKFileName,
  getQTTFileName,
  validateHtkkCompanyInfo,
  SO_HEAD,
  soRows,
  parseEmployeeImportPreview,
  importEmployeesIntoCompany,
  exportEmployeeTemplateExcel,
  exportEmployeesExcel,
  exportContractsExcel,
  exportAttendanceExcel,
  exportPayrollExcel,
  exportPayslipsExcel,
  exportBankTransferExcel,
  exportQttAppendicesExcel,
  exportLaborBookExcel,
  exportJournalExcel
} from './accountingAzEngine';

interface LegalParams {
  year: number;
  month: number;
  luong_co_so: number;
  vung: Record<number, number>;
  rate_nld: { bhxh: number; bhyt: number; bhtn: number };
  rate_dn: { bhxh: number; huu: number; om: number; tnld: number; bhyt: number; bhtn: number; kpcd: number };
  self_deduction: number;
  dep_deduction: number;
  brackets: Array<{ cap: number; rate: number; sub: number }>;
  an_trua_cap: number;
  casual_cap: number;
  cap_bhxh_bhyt: number;
  cap_bhtn_vung1: number;
}

interface OverviewData {
  month: string;
  legal_parameters: LegalParams;
  kpis: {
    active_employees: number;
    resigned_employees: number;
    total_employees: number;
    total_gross: number;
    total_net: number;
    total_tax_pit: number;
    total_advance?: number;
    total_insurance_nld: number;
    total_insurance_dn: number;
    total_insurance_all: number;
    total_kpcd: number;
    total_payslips: number;
    projected_gross?: number;
    projected_net?: number;
    projected_ins_nld?: number;
    projected_ins_dn?: number;
    is_projected?: boolean;
  };
  alerts: {
    contract_alerts: Array<{
      severity: 'bad' | 'warn' | 'info';
      user_id: number;
      full_name: string;
      avatar_url?: string;
      avatar?: string;
      contract_code: string;
      contract_type: string;
      end_date: string | null;
      days_left: number | null;
      message: string;
    }>;
    missing_info_users: Array<{
      id: number;
      full_name: string;
      avatar_url?: string;
      avatar?: string;
      email: string;
      miss_fields: string[];
    }>;
  };
  tax_schedule: {
    quarter: number;
    due_monthly: string;
    due_quarterly: string;
    suggested_type: string;
  };
  sop_checklist: Array<{
    id: string;
    title: string;
    done: boolean;
  }>;
}

interface JournalEntry {
  seq: number;
  date: string;
  doc_no: string;
  desc: string;
  debit_acc: string;
  credit_acc: string;
  amount: number;
  type: string;
}

interface FinancialData {
  month: string;
  pnl: {
    revenue: number;
    deposit_revenue: number;
    invoice_revenue: number;
    cogs: number;
    gross_profit: number;
    gross_margin_pct: number;
    hrm_cost: number;
    payroll_gross: number;
    insurance_dn: number;
    operating_expense: number;
    marketing_expense: number;
    total_expense: number;
    operating_profit: number;
    cit_tax_20pct: number;
    net_profit: number;
    net_margin_pct: number;
  };
  cashflow: {
    cash_in: number;
    cash_out: number;
    net_cashflow: number;
    is_positive: boolean;
  };
  tax_balance: {
    vat_output: number;
    vat_input: number;
    vat_payable: number;
    vat_deductible: number;
    pit_withheld: number;
    cit_estimated: number;
    total_tax_to_pay: number;
  };
}

const isAbortErr = (e: any): boolean =>
  e?.name === 'AbortError' || e?.name === 'CanceledError' || e?.code === 'ERR_CANCELED';

const cloneAzDb = (src: AzDatabase): AzDatabase => {
  try {
    if (typeof structuredClone === 'function') return structuredClone(src);
  } catch (_e) {
    // fallback below
  }
  return JSON.parse(JSON.stringify(src));
};

const FMT_COMPACT = (n: any) => {
  const numVal = Number(n);
  if (!Number.isFinite(numVal)) return '0';
  const sign = numVal < 0 ? '-' : '';
  const abs = Math.abs(numVal);
  return abs >= 1e9
    ? sign + (abs / 1e9).toFixed(1) + 'B'
    : abs >= 1e6
    ? sign + (abs / 1e6).toFixed(0) + 'M'
    : abs >= 1e3
    ? sign + (abs / 1e3).toFixed(0) + 'K'
    : String(Math.round(numVal));
};

const FMT = (n: number | string | null | undefined) => {
  const raw = Number(n);
  const numVal = Number.isFinite(raw) ? Math.round(raw) : 0;
  return new Intl.NumberFormat('vi-VN').format(numVal);
};

interface AzTopKpiStripProps {
  activeEmployeesCount: number;
  totalEmployeesCount: number;
  contractsCount: number;
  alertsCount: number;
  missingInfoCount: number;
  selectedMonth: string;
  monthLabel: string;
  hasMonthAttendance: boolean;
  payTotals: {
    gross: number;
    bhNLD: number;
    net: number;
    thue: number;
    tamUng: number;
    totalCost: number;
    bhDN: number;
    kpcd: number;
  };
}

const AzTopKpiStrip: React.FC<AzTopKpiStripProps> = React.memo(({
  activeEmployeesCount,
  totalEmployeesCount,
  contractsCount,
  alertsCount,
  missingInfoCount,
  monthLabel,
  hasMonthAttendance,
  payTotals,
}) => (
  <div className="dashboard-kpi-grid" style={{ marginBottom: 0 }}>
    <DomKpiTile
      label="NHÂN SỰ ĐANG LÀM VIỆC"
      value={`${activeEmployeesCount} người`}
      icon={<Users size={16} />}
      accent="brand"
      badge={`${totalEmployeesCount} hồ sơ`}
      breakdown={
        <>
          <span>Hợp đồng: <strong style={{ color: '#0f172a' }}>{contractsCount}</strong></span>
          <span>Cảnh báo HĐ: <strong style={{ color: alertsCount > 0 ? '#BD1D2D' : '#0f172a' }}>{alertsCount}</strong> · Thiếu MST/STK: <strong style={{ color: '#0f172a' }}>{missingInfoCount}</strong></span>
        </>
      }
    />
    <DomKpiTile
      label={`TỔNG LƯƠNG THÁNG ${monthLabel}`}
      value={`${FMT(payTotals.gross)} đ`}
      icon={<DollarSign size={16} />}
      accent="brand"
      valueTone="brand"
      breakdown={
        <>
          <span>BHXH NLĐ (10,5%): <strong style={{ color: '#0f172a' }}>{FMT(payTotals.bhNLD)} đ</strong></span>
          <span>Trạng thái: <strong style={{ color: '#0f172a' }}>{hasMonthAttendance ? 'Đã lập bảng công/lương' : 'Tự động tính đủ công'}</strong></span>
        </>
      }
    />
    <DomKpiTile
      label="PHẢI TRẢ NLĐ (THỰC LĨNH)"
      value={`${FMT(payTotals.net)} đ`}
      icon={<CheckCircle2 size={16} />}
      accent="slate"
      breakdown={
        <>
          <span>Thuế TNCN: <strong style={{ color: '#0f172a' }}>{FMT(payTotals.thue)} đ</strong></span>
          <span>Tạm ứng: <strong style={{ color: '#0f172a' }}>{FMT(payTotals.tamUng)} đ</strong></span>
        </>
      }
    />
    <DomKpiTile
      label="TỔNG CHI PHÍ DOANH NGHIỆP"
      value={`${FMT(payTotals.totalCost)} đ`}
      icon={<ShieldCheck size={16} />}
      accent="slate"
      breakdown={
        <>
          <span>BHXH DN (21,5%): <strong style={{ color: '#0f172a' }}>{FMT(payTotals.bhDN)} đ</strong> · KPCĐ: <strong style={{ color: '#0f172a' }}>{FMT(payTotals.kpcd)} đ</strong></span>
          <span>Tổng nộp BHXH (32%): <strong style={{ color: '#0f172a' }}>{FMT(payTotals.bhNLD + payTotals.bhDN)} đ</strong></span>
        </>
      }
    />
  </div>
));

const AzPnlReportPanels: React.FC<{
  selectedMonth: string;
  financialData: any;
  payTotals: { totalCost: number; thue: number };
}> = React.memo(({ selectedMonth, financialData, payTotals }) => {
  const rev = Number(financialData?.pnl?.revenue || 0);
  const hrmCost = payTotals.totalCost || Number(financialData?.pnl?.hrm_cost || 0);
  const opMkt = Number(financialData?.pnl?.operating_expense || 0) + Number(financialData?.pnl?.marketing_expense || 0);
  const netProfit = Number(financialData?.pnl?.net_profit || 0);
  const netMarginPct = financialData ? Math.round(Number(financialData.pnl?.net_margin_pct || 0)) : 0;

  const pnlRows = [
    { label: 'Doanh thu thuần (Cọc + HĐ)', amount: rev, color: '#BD1D2D', pct: 100 },
    {
      label: 'Chi phí nhân sự & BHXH (Kế Toán A-Z)',
      amount: hrmCost,
      color: '#334155',
      pct: rev > 0 ? Math.min(100, Math.round((hrmCost / rev) * 100)) : 0,
    },
    {
      label: 'Chi phí vận hành & MKT',
      amount: opMkt,
      color: '#64748b',
      pct: rev > 0 ? Math.min(100, Math.round((opMkt / rev) * 100)) : 0,
    },
    {
      label: 'Lợi nhuận ròng sau thuế',
      amount: netProfit,
      color: netProfit < 0 ? '#BD1D2D' : '#0f172a',
      pct: Math.max(0, netMarginPct),
    },
  ];

  const vatPay = financialData?.tax_balance?.vat_payable || 0;
  const pitPay = financialData ? (financialData.tax_balance?.pit_withheld || 0) : payTotals.thue;
  const citPay = financialData?.pnl?.cit_tax_20pct || 0;
  const taxChartRows = [
    { name: 'Thuế GTGT', amount: vatPay, color: '#BD1D2D' },
    { name: 'Thuế TNCN', amount: pitPay, color: '#334155' },
    { name: 'Thuế TNDN', amount: citPay, color: '#64748b' },
    { name: 'Tổng thuế', amount: vatPay + pitPay + citPay, color: '#0f172a' },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: '1.25rem' }}>
      <DomPanelCard
        deferred
        title="Cơ Cấu Doanh Thu, Chi Phí & Lợi Nhuận (P&L)"
        subtitle={`Doanh thu thuần, chi phí nhân sự, vận hành và lợi nhuận ròng kỳ ${selectedMonth}`}
        icon={<TrendingUp size={16} />}
        iconAccent="brand"
        rightSlot={
          <span className="dom-kpi-tile__badge dom-tone-slate">
            Biên LN: {financialData ? `${financialData.pnl.net_margin_pct}%` : '—'}
          </span>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {pnlRows.map((item, idx) => (
            <DomRankBarRow
              key={item.label}
              rank={idx + 1}
              label={item.label}
              value={`${FMT(item.amount)} đ`}
              secondaryValue={`${item.pct}%`}
              percent={item.pct}
              barColor={item.color}
            />
          ))}
        </div>
      </DomPanelCard>

      <DomPanelCard
        deferred
        title="Dòng tiền thực thu - thực chi & nghĩa vụ thuế"
        subtitle={`Biểu đồ nghĩa vụ thuế GTGT, TNCN, TNDN kỳ ${selectedMonth}`}
        icon={<ShieldCheck size={16} />}
        iconAccent="slate"
        rightSlot={
          <span className="dom-kpi-tile__badge dom-tone-slate">
            Net Cashflow: {financialData ? `${FMT_COMPACT(financialData.cashflow.net_cashflow)} đ` : '—'}
          </span>
        }
      >
        {taxChartRows.every((r) => Number(r.amount || 0) === 0) ? (
          <DomEmptyChartState title="Chưa có dữ liệu nghĩa vụ thuế trong kỳ" minHeight={210} />
        ) : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={taxChartRows} margin={{ top: 22, right: 6, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => FMT_COMPACT(v)} />
                <Tooltip
                  cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                  content={<DomChartTooltip valueFormatter={(v) => `${FMT(v)} đ`} />}
                />
                <Bar name="Số tiền" dataKey="amount" barSize={28} radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="amount" position="top" style={{ fontSize: '11px', fontWeight: 600, fill: '#334155' }} formatter={(v: any) => FMT_COMPACT(v)} />
                  {taxChartRows.map((row, index) => (
                    <Cell key={`cell-${index}`} fill={row.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </DomPanelCard>
    </div>
  );
});

type SubtabId =
  | 'tongquan'
  | 'nhanvien'
  | 'hopdong'
  | 'chamcong'
  | 'bangluong'
  | 'chuyenkhoan'
  | 'thue'
  | 'soqlld'
  | 'congty'
  | 'saoluu'
  | 'pnl_report'
  | 'journal'
  | 'calculator';

const CleanSearchBox: React.FC<{
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
  width?: number | string;
}> = ({ value, onChange, placeholder, width = 220 }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      width,
      height: '32px',
      padding: '0 10px',
      borderRadius: '8px',
      border: '1px solid #e2e8f0',
      background: '#ffffff',
      boxSizing: 'border-box'
    }}
  >
    <Search size={13.5} style={{ color: '#64748b', flexShrink: 0 }} />
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
        color: '#0f172a',
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
          color: '#64748b',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        <X size={12} />
      </button>
    )}
  </div>
);

function createInitialDb(ym: string, orgName?: string, statutory?: AzStatutoryOverrides, orgInfo?: Partial<Record<string, string>>): AzDatabase {
  const c = newCompany(orgName || getTenantOrganizationName('Doanh nghiệp'), statutory);
  c.id = 'myerp-primary';
  if (orgInfo) {
    Object.entries(orgInfo).forEach(([k, v]) => {
      if (v) c.info[k] = v;
    });
  }
  return {
    v: 2,
    companies: { [c.id]: c },
    active: c.id,
    ui: {
      tab: 'tongquan',
      ym,
      q: '',
      ctFilter: 'all',
      ckNote: '',
      soYear: ymParse(ym).y,
      tax: {}
    },
    manual: { kk: {}, qtt: {} }
  };
}

function downloadTextFile(name: string, content: string, mime = 'application/xml;charset=utf-8'): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

export const HrmAccountingAzWorkspace: React.FC<{
  currentMonth?: string;
  onNavigateToPayroll?: () => void;
  onNavigateToProfiles?: () => void;
  embedMode?: boolean;
}> = ({ currentMonth, onNavigateToPayroll, onNavigateToProfiles, embedMode = false }) => {
  const { user } = useAuth();
  const { config, hasPermission } = useTenantConfig();
  const { tenantId } = useSettingsBootstrap();
  const showConfirm = useUIStore((s) => s.showConfirm);
  const closeConfirm = useUIStore((s) => s.closeConfirm);

  const statutoryWages = useTypedSetting<AzStatutoryOverrides['wages']>('finance.az_statutory_wages_and_rates', {});
  const statutoryPit = useTypedSetting<AzStatutoryOverrides['pit']>('finance.az_pit_deductions_and_brackets', {});
  const tt200Setting = useTypedSetting<AzStatutoryOverrides['tt200']>('finance.az_tt200_journal_and_htkk', {});
  const workScheduleSetting = useTypedSetting<AzStatutoryOverrides['workSchedule']>('hrm.work_schedule_and_shifts', {});
  const otMultipliersSetting = useTypedSetting<AzStatutoryOverrides['otMultipliers']>('hrm.ot_and_kpi_multipliers', {});
  const uploadPolicy = useTypedSetting<{ max_mb?: number }>('core.upload_security_policy', { max_mb: 50 });
  const uiMotion = useTypedSetting<{ drawer_ms?: number; bezier?: string; z_modal_nested?: number }>(
    'ui.overlay_zindex_and_motion_ms',
    { drawer_ms: 220, bezier: 'cubic-bezier(0.25, 0.1, 0.25, 1)', z_modal_nested: 2147483646 }
  );

  const statutoryConfig: AzStatutoryOverrides = useMemo(
    () => ({
      wages: statutoryWages,
      pit: statutoryPit,
      tt200: tt200Setting,
      workSchedule: workScheduleSetting,
      otMultipliers: otMultipliersSetting
    }),
    [statutoryWages, statutoryPit, tt200Setting, workScheduleSetting, otMultipliersSetting]
  );

  const lsKey = useMemo(
    () => `ke_toan_az_ns_luong_v2_t${tenantId || 'default'}_u${user?.id || 'anon'}`,
    [tenantId, user?.id]
  );

  const canWriteAz = useMemo(
    () =>
      isSystemAdmin(user) ||
      isExecutive(user) ||
      isAccountant(user) ||
      isHR(user) ||
      hasDynamicModulePermission(user, 'hrm', 'write') ||
      hasDynamicModulePermission(user, 'finance', 'write'),
    [user]
  );
  const canLockPeriod = useMemo(
    () => isSystemAdmin(user) || isExecutive(user) || Boolean(hasPermission?.('hrm', 'approve')),
    [user, hasPermission]
  );

  const initialYm = currentMonth || new Date().toISOString().slice(0, 7);
  const [activeSubtab, setActiveSubtab] = useState<SubtabId>('tongquan');
  const [selectedMonth, setSelectedMonth] = useState<string>(initialYm);
  const [loading, setLoading] = useState<boolean>(false);
  const [syncingCloud, setSyncingCloud] = useState<boolean>(false);
  const [cloudConflictMsg, setCloudConflictMsg] = useState<string | null>(null);
  const [kkDeclOpts, setKkDeclOpts] = useState<AzHtkkDeclOpts>({ loaiTKhai: 'C', soLan: 0 });
  const [qttDeclOpts, setQttDeclOpts] = useState<AzHtkkDeclOpts>({ loaiTKhai: 'C', soLan: 0 });

  const [serverPayslips, setServerPayslips] = useState<Array<{ id?: number; status?: string; net_salary?: number; gross_salary?: number; tax_pit?: number }>>([]);
  const [commissionReconciliation, setCommissionReconciliation] = useState<{ count: number; total: number }>({ count: 0, total: 0 });

  useEffect(() => {
    if (currentMonth && /^\d{4}-\d{2}$/.test(currentMonth)) {
      setSelectedMonth((prev) => (prev === currentMonth ? prev : currentMonth));
    }
  }, [currentMonth]);

  const tenantOrgInfo = useMemo(
    () => ({
      tenNNT: config?.organization?.name || getTenantOrganizationName('Doanh nghiệp'),
      mst: config?.organization?.tax_id || '',
      dchiNNT: config?.organization?.address || '',
      dthoaiNNT: config?.organization?.support_hotline || '',
      emailNNT: config?.organization?.support_email || ''
    }),
    [config?.organization]
  );

  // Full A-Z Workspace Database State (tenant & user scoped)
  const [azDb, setAzDb] = useState<AzDatabase>(() => {
    try {
      const raw = localStorage.getItem(lsKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.companies && Object.keys(parsed.companies).length > 0) {
          if (!parsed.manual) parsed.manual = { kk: {}, qtt: {} };
          if (!parsed.ui) parsed.ui = { tab: 'tongquan', ym: initialYm };
          return parsed;
        }
      }
    } catch (_e) {
      // ignore local storage parse error
    }
    return createInitialDb(initialYm, tenantOrgInfo.tenNNT, statutoryConfig, tenantOrgInfo);
  });

  // Optimistic revision + debounced save queue refs
  const workspaceRevisionRef = useRef<number | null>(null);
  const pendingCloudSaveRef = useRef<{ db: AzDatabase; month: string } | null>(null);
  const cloudSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedDraftRef = useRef<boolean>(false);
  const inFlightRef = useRef<boolean>(false);

  // Hydrate empty org fields on myerp-primary when tenant organization loads
  useEffect(() => {
    setAzDb((prev) => {
      const primary = prev.companies?.['myerp-primary'];
      if (!primary) return prev;
      let changed = false;
      const nextInfo = { ...primary.info };
      (['tenNNT', 'mst', 'dchiNNT', 'dthoaiNNT', 'emailNNT'] as const).forEach((k) => {
        const orgVal = tenantOrgInfo[k];
        if (orgVal && (!nextInfo[k] || (k === 'tenNNT' && nextInfo[k] === 'DOANH NGHIỆP MẶC ĐỊNH'))) {
          nextInfo[k] = orgVal;
          changed = true;
        }
      });
      if (!changed) return prev;
      return {
        ...prev,
        companies: {
          ...prev.companies,
          'myerp-primary': { ...primary, info: nextInfo }
        }
      };
    });
  }, [tenantOrgInfo]);

  // Brush for Attendance Table
  const [brush, setBrush] = useState<string>('X');

  // Search & Filter states
  const [empSearch, setEmpSearch] = useState<string>('');
  const [ctFilter, setCtFilter] = useState<'all' | 'warn'>('all');
  const [soSearch, setSoSearch] = useState<string>('');

  // Debounced year input drafts (P2-AZ-08)
  const [kkYearDraft, setKkYearDraft] = useState<string>(() => String(ymParse(initialYm).y));
  const [qttYearDraft, setQttYearDraft] = useState<string>(() => String(ymParse(initialYm).y));
  const [soYearDraft, setSoYearDraft] = useState<string>(() => String(ymParse(initialYm).y));

  // Modals for Employee, Contract, Payslip, New Company, Import Preview
  const [editingEmpModal, setEditingEmpModal] = useState<{ emp: AzEmployee; isNew: boolean } | null>(null);
  const [editingCtModal, setEditingCtModal] = useState<{
    ct: AzContract;
    isNew: boolean;
    updateSalary: boolean;
  } | null>(null);
  const [viewingSlipRow, setViewingSlipRow] = useState<AzPayRow | null>(null);
  const [newCompanyModalOpen, setNewCompanyModalOpen] = useState<boolean>(false);
  const [newCompanyName, setNewCompanyName] = useState<string>('');
  const [importPreviewModal, setImportPreviewModal] = useState<{
    filename: string;
    aoa: any[][];
    rows: AzImportPreviewRow[];
    warnings: string[];
  } | null>(null);

  // File input refs
  const empExcelInputRef = useRef<HTMLInputElement | null>(null);
  const htkkXmlInputRef = useRef<HTMLInputElement | null>(null);
  const backupJsonInputRef = useRef<HTMLInputElement | null>(null);

  // MYERP Executive Overview, Journal & Financial P&L
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [journalSummary, setJournalSummary] = useState<any>(null);
  const [journalFilterAcc, setJournalFilterAcc] = useState<string>('all');
  const [journalSearch, setJournalSearch] = useState<string>('');
  const [financialData, setFinancialData] = useState<FinancialData | null>(null);

  // Simulator & Benefits States
  const [simMode, setSimMode] = useState<'gross_to_net' | 'net_to_gross'>('gross_to_net');
  const [simSalary, setSimSalary] = useState<number>(20000000);
  const [simDependents, setSimDependents] = useState<number>(0);
  const [simRegion, setSimRegion] = useState<number>(1);
  const [simYear, setSimYear] = useState<number>(() => new Date().getFullYear());
  const [simContractType, setSimContractType] = useState<string>('labour_resident');
  const [simMeal, setSimMeal] = useState<number>(() => statutoryPit?.meal_old ?? 730000);
  const [simPhone, setSimPhone] = useState<number>(300000);
  const [simTravel, setSimTravel] = useState<number>(500000);
  const [simHasInsurance, setSimHasInsurance] = useState<boolean>(true);
  const [simHasUnion, setSimHasUnion] = useState<boolean>(false);
  const [simResult, setSimResult] = useState<any>(null);
  const [simulating, setSimulating] = useState<boolean>(false);

  const [benefitType, setBenefitType] = useState<'maternity' | 'severance' | 'job_loss'>('maternity');
  const [benefitAvgSalary, setBenefitAvgSalary] = useState<number>(15000000);
  const [benefitWorkYears, setBenefitWorkYears] = useState<number>(3.5);
  const [benefitUnempYears, setBenefitUnempYears] = useState<number>(2.0);
  const [benefitResult, setBenefitResult] = useState<any>(null);

  // Period Lock State from MySQL monthly_payslips
  const isPeriodLocked = useMemo(
    () => serverPayslips.some((p) => p.status === 'locked'),
    [serverPayslips]
  );
  const lockedPayslipCount = useMemo(
    () => serverPayslips.filter((p) => p.status === 'locked').length,
    [serverPayslips]
  );

  // Active company helper
  const activeCompany: AzCompany = useMemo(() => {
    const companies = azDb.companies || {};
    if (azDb.active && companies[azDb.active]) {
      return companies[azDb.active];
    }
    const firstKey = Object.keys(companies)[0];
    if (firstKey) return companies[firstKey];
    return newCompany(tenantOrgInfo.tenNNT, statutoryConfig);
  }, [azDb, tenantOrgInfo.tenNNT, statutoryConfig]);

  // Explicit debounced workspace draft persistence (NO side effects inside setState; NO sync_to_myerp=true on draft edits)
  const flushPendingCloudDraft = useCallback(async () => {
    const pending = pendingCloudSaveRef.current;
    if (!pending || !canWriteAz) return;
    pendingCloudSaveRef.current = null;
    try {
      const res = await fetchAPI('/hrm/accounting-az/workspace', {
        method: 'POST',
        body: JSON.stringify({
          workspace: pending.db,
          sync_to_myerp: false,
          month: pending.month,
          expected_revision: workspaceRevisionRef.current
        })
      });
      if (res?.data?.revision != null) {
        workspaceRevisionRef.current = Number(res.data.revision);
      }
      hasUnsavedDraftRef.current = false;
      setCloudConflictMsg(null);
    } catch (err: any) {
      if (isAbortErr(err)) return;
      const status = err?.response?.status ?? err?.status;
      if (status === 409) {
        const msg = 'Dữ liệu Kế Toán A-Z trên máy chủ vừa được cập nhật bởi phiên khác (409). Vui lòng tải lại trước khi lưu tiếp.';
        setCloudConflictMsg(msg);
        toast.error(msg);
      } else {
        toast.error(err?.response?.data?.message || err?.message || 'Lỗi lưu bản nháp Kế Toán A-Z lên máy chủ');
      }
    }
  }, [canWriteAz]);

  const scheduleCloudDraftSave = useCallback(
    (nextDb: AzDatabase, month: string) => {
      try {
        localStorage.setItem(lsKey, JSON.stringify(nextDb));
      } catch (e) {
        console.warn('LocalStorage quota warning:', e);
      }
      if (!canWriteAz) return;
      hasUnsavedDraftRef.current = true;
      pendingCloudSaveRef.current = { db: nextDb, month };
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = setTimeout(() => {
        flushPendingCloudDraft();
      }, 650);
    },
    [lsKey, canWriteAz, flushPendingCloudDraft]
  );

  useEffect(() => {
    return () => {
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
    };
  }, []);

  // Safe state mutation without side effects inside React updater
  const updateAzDb = useCallback(
    (updater: (draft: AzDatabase) => AzDatabase, persistToCloud = false, _syncPayslipsMonth?: string) => {
      let computedNext: AzDatabase | null = null;
      setAzDb((prev) => {
        const cloned = cloneAzDb(prev);
        const next = updater(cloned);
        computedNext = next;
        return next;
      });
      // Queue localStorage + optional debounced draft save cleanly after state computation
      Promise.resolve().then(() => {
        if (!computedNext) return;
        if (persistToCloud) {
          scheduleCloudDraftSave(computedNext, selectedMonth);
        } else {
          try {
            localStorage.setItem(lsKey, JSON.stringify(computedNext));
          } catch (_e) {
            // ignore storage quota
          }
        }
      });
    },
    [selectedMonth, lsKey, scheduleCloudDraftSave]
  );

  // Load Workspace from Cloud MYERP on mount / month change (respecting dirty draft & AbortController)
  const loadCloudWorkspace = useCallback(
    async (monthToLoad: string, signal?: AbortSignal, forceOverwriteDirty = false) => {
      if (hasUnsavedDraftRef.current && !forceOverwriteDirty) {
        await flushPendingCloudDraft();
      }
      try {
        const res = await fetchAPI(`/hrm/accounting-az/workspace?month=${encodeURIComponent(monthToLoad)}`, {
          signal
        });
        if (signal?.aborted) return;
        if (res && res.data && res.data.revision != null) {
          workspaceRevisionRef.current = Number(res.data.revision);
        }
        if (res && res.data && res.data.workspace && res.data.workspace.companies) {
          if (hasUnsavedDraftRef.current && !forceOverwriteDirty) return;
          const cloudWs: AzDatabase = res.data.workspace;
          if (!cloudWs.manual) cloudWs.manual = { kk: {}, qtt: {} };
          if (!cloudWs.ui) cloudWs.ui = { tab: 'tongquan', ym: monthToLoad };
          cloudWs.ui.ym = monthToLoad;
          setAzDb(cloudWs);
          setCloudConflictMsg(null);
          try {
            localStorage.setItem(lsKey, JSON.stringify(cloudWs));
          } catch (_e) {
            // ignore
          }
        }
      } catch (err: any) {
        if (isAbortErr(err)) return;
        console.error('Failed to load Accounting A-Z workspace from cloud', err);
      }
    },
    [lsKey, flushPendingCloudDraft]
  );

  // Load MYERP Overview, Journal, Financial P&L, Payslips Lock State & Commission Expenses
  const loadOverview = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setLoading(true);
        const res = await fetchAPI(`/hrm/accounting-az/overview?month=${encodeURIComponent(selectedMonth)}`, { signal });
        if (!signal?.aborted && res && res.data) setOverview(res.data);
      } catch (err: any) {
        if (isAbortErr(err)) return;
        console.error('Failed to load accounting overview', err);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [selectedMonth]
  );

  const loadJournal = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetchAPI(`/hrm/accounting-az/general-journal?month=${encodeURIComponent(selectedMonth)}`, {
          signal
        });
        if (!signal?.aborted && res && res.data) {
          setJournalEntries(ensureArray(res.data.entries));
          setJournalSummary(res.data.summary || null);
        }
      } catch (err: any) {
        if (isAbortErr(err)) return;
        console.error('Failed to load journal', err);
      }
    },
    [selectedMonth]
  );

  const loadFinancial = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const res = await fetchAPI(`/finance/accounting-az/summary?month=${encodeURIComponent(selectedMonth)}`, {
          signal
        });
        if (!signal?.aborted && res && res.data) setFinancialData(res.data);
      } catch (err: any) {
        if (isAbortErr(err)) return;
        console.error('Failed to load finance summary', err);
      }
    },
    [selectedMonth]
  );

  const loadPayslipAndCommissionStatus = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const [psRes, expRes] = await Promise.allSettled([
          fetchAPI(`/hrm/payslips?month_year=${encodeURIComponent(selectedMonth)}`, { signal }),
          fetchAPI('/expenses?status=approved&limit=100', { signal })
        ]);
        if (signal?.aborted) return;
        if (psRes.status === 'fulfilled') {
          setServerPayslips(extractArray(psRes.value, 'payslips', 'items'));
        }
        if (expRes.status === 'fulfilled') {
          const allExp = extractArray(expRes.value, 'expenses', 'items');
          const comm = allExp.filter((x: any) => {
            const cat = String(x.category || '').toLowerCase();
            const dt = String(x.expense_date || x.created_at || '').slice(0, 7);
            return (cat.includes('hoa hồng') || cat.includes('commission')) && dt === selectedMonth;
          });
          setCommissionReconciliation({
            count: comm.length,
            total: comm.reduce((s: number, x: any) => s + Number(x.amount || 0), 0)
          });
        }
      } catch (err: any) {
        if (isAbortErr(err)) return;
      }
    },
    [selectedMonth]
  );

  // Manual Sync from MYERP HR Database
  const handleSyncFromMyerp = async (overwriteMonths = false) => {
    if (!canWriteAz || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      setSyncingCloud(true);
      const res = await fetchAPI('/hrm/accounting-az/sync-from-myerp', {
        method: 'POST',
        body: JSON.stringify({
          month: selectedMonth,
          overwrite_months: overwriteMonths
        })
      });
      if (res && res.data && res.data.workspace) {
        const ws: AzDatabase = res.data.workspace;
        if (!ws.manual) ws.manual = { kk: {}, qtt: {} };
        if (res.data.revision != null) workspaceRevisionRef.current = Number(res.data.revision);
        hasUnsavedDraftRef.current = false;
        pendingCloudSaveRef.current = null;
        setAzDb(ws);
        try {
          localStorage.setItem(lsKey, JSON.stringify(ws));
        } catch (_e) {
          // ignore
        }
        toast.success(res.message || 'Đã đồng bộ dữ liệu nhân sự & lương từ MYERP!');
      }
    } catch (err: any) {
      console.error('Failed to sync from MYERP', err);
      toast.error(err?.response?.data?.message || err?.message || 'Không thể đồng bộ dữ liệu từ MYERP');
    } finally {
      setSyncingCloud(false);
      inFlightRef.current = false;
    }
  };

  // Manual Save & Sync Payroll to MYERP (explicit commit button; blocked on locked month or secondary companies)
  const handleSaveAndSyncPayrollToMyerp = async () => {
    if (!canWriteAz || inFlightRef.current) return;
    if (isPeriodLocked) {
      toast.error(`Kỳ lương ${ymLabel(selectedMonth)} đã khoá sổ. Vui lòng Mở khoá kỳ trước khi đồng bộ.`);
      return;
    }
    inFlightRef.current = true;
    try {
      setSyncingCloud(true);
      if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
      const isPrimary = activeCompany.id === 'myerp-primary';
      const rows = payroll(activeCompany, selectedMonth, statutoryConfig);
      const computedPayslips = isPrimary
        ? rows.map((r) => ({
            empId: r.e.id,
            user_id: r.e.user_id,
            ma: r.e.ma,
            ten: r.e.ten,
            luongCB: r.luongCB,
            lTheoCong: r.lTheoCong,
            congChuan: r.s.congChuan,
            congTL: r.s.congTL,
            pc: r.pc,
            khacMien: r.khacMien,
            ot: r.ot,
            otH: r.otH,
            thuong: r.thuong,
            gross: r.gross,
            nld: r.nld,
            bhNLD: r.bhNLD,
            bhDN: r.bhDN,
            doanPhi: r.doanPhi,
            thue: r.thue,
            tamUng: r.tamUng,
            khauTru: r.khauTru,
            net: r.net
          }))
        : undefined;
      const res = await fetchAPI('/hrm/accounting-az/workspace', {
        method: 'POST',
        body: JSON.stringify({
          workspace: azDb,
          sync_to_myerp: isPrimary,
          month: selectedMonth,
          expected_revision: workspaceRevisionRef.current,
          computed_payslips: computedPayslips
        })
      });
      if (res) {
        if (res.data?.revision != null) workspaceRevisionRef.current = Number(res.data.revision);
        hasUnsavedDraftRef.current = false;
        pendingCloudSaveRef.current = null;
        setCloudConflictMsg(null);
        toast.success(
          isPrimary
            ? `Đã lưu & đồng bộ ${rows.length} phiếu lương tháng ${ymLabel(selectedMonth)} vào hệ thống MYERP!`
            : `Đã lưu dữ liệu công ty "${activeCompany.info.tenNNT || activeCompany.id}" lên Cloud (không ghi đè pháp nhân chính MYERP).`
        );
        loadOverview();
        loadJournal();
        loadFinancial();
        loadPayslipAndCommissionStatus();
      }
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      if (status === 409) {
        const msg = 'Xung đột phiên bản (409): Dữ liệu vừa được người khác lưu. Vui lòng tải lại trước khi chốt.';
        setCloudConflictMsg(msg);
        toast.error(msg);
      } else {
        console.error('Failed to save workspace to MYERP', err);
        toast.error(err?.response?.data?.message || err?.message || 'Lỗi khi đồng bộ bảng lương lên MYERP');
      }
    } finally {
      setSyncingCloud(false);
      inFlightRef.current = false;
    }
  };

  // Period Lock / Unlock handler
  const handleTogglePeriodLock = () => {
    if (!canLockPeriod || inFlightRef.current) return;
    const action = isPeriodLocked ? 'unlock' : 'lock';
    showConfirm({
      title: isPeriodLocked ? `Mở khoá kỳ lương ${ymLabel(selectedMonth)}` : `Khoá sổ kỳ lương ${ymLabel(selectedMonth)}`,
      message: isPeriodLocked
        ? 'Mở khoá cho phép chỉnh sửa lại chấm công và bảng lương trong kỳ này.'
        : 'Khoá sổ sẽ ngăn toàn bộ thao tác sửa công, sửa lương và ghi đè phiếu lương trên hệ thống.',
      confirmText: isPeriodLocked ? 'Mở khoá kỳ' : 'Khoá sổ ngay',
      isDanger: !isPeriodLocked,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          setSyncingCloud(true);
          const res = await fetchAPI('/hrm/payslips/lock', {
            method: 'PUT',
            body: JSON.stringify({ month_year: selectedMonth, action })
          });
          toast.success(
            res?.message ||
              (action === 'lock'
                ? `Đã khoá sổ kỳ lương ${ymLabel(selectedMonth)}`
                : `Đã mở khoá kỳ lương ${ymLabel(selectedMonth)}`)
          );
          await loadPayslipAndCommissionStatus();
        } catch (err: any) {
          toast.error(err?.response?.data?.message || err?.message || 'Không thể thay đổi trạng thái khoá kỳ');
        } finally {
          setSyncingCloud(false);
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  const simAbortRef = useRef<AbortController | null>(null);
  const handleSimulate = useCallback(async () => {
    if (simAbortRef.current) simAbortRef.current.abort();
    const ctrl = new AbortController();
    simAbortRef.current = ctrl;
    try {
      setSimulating(true);
      const res = await fetchAPI('/hrm/accounting-az/simulate-payroll', {
        method: 'POST',
        signal: ctrl.signal,
        body: JSON.stringify({
          salary: Math.max(0, simSalary),
          mode: simMode,
          dependents: Math.max(0, simDependents),
          region: simRegion,
          year: simYear,
          contract_type: simContractType,
          has_insurance: simHasInsurance,
          has_union: simHasUnion,
          allowance_meal: Math.max(0, simMeal),
          allowance_phone: Math.max(0, simPhone),
          allowance_travel: Math.max(0, simTravel)
        })
      });
      if (!ctrl.signal.aborted && res && res.data) setSimResult(res.data);
    } catch (err: any) {
      if (isAbortErr(err)) return;
      console.error('Failed to simulate payroll', err);
      toast.error(err?.response?.data?.message || 'Lỗi khi mô phỏng tính lương');
    } finally {
      if (!ctrl.signal.aborted) setSimulating(false);
    }
  }, [
    simSalary,
    simMode,
    simDependents,
    simRegion,
    simYear,
    simContractType,
    simHasInsurance,
    simHasUnion,
    simMeal,
    simPhone,
    simTravel
  ]);

  const benefitAbortRef = useRef<AbortController | null>(null);
  const handleCalculateBenefit = useCallback(async () => {
    if (benefitAbortRef.current) benefitAbortRef.current.abort();
    const ctrl = new AbortController();
    benefitAbortRef.current = ctrl;
    try {
      const res = await fetchAPI('/hrm/accounting-az/calculate-benefits', {
        method: 'POST',
        signal: ctrl.signal,
        body: JSON.stringify({
          benefit_type: benefitType,
          average_salary: Math.max(0, benefitAvgSalary),
          work_years: Math.max(0, benefitWorkYears),
          unemployment_insured_years: Math.max(0, benefitUnempYears)
        })
      });
      if (!ctrl.signal.aborted && res && res.data) setBenefitResult(res.data);
    } catch (err: any) {
      if (isAbortErr(err)) return;
      console.error('Failed to calculate benefit', err);
      toast.error(err?.response?.data?.message || 'Lỗi tính chế độ BHXH / thôi việc');
    }
  }, [benefitType, benefitAvgSalary, benefitWorkYears, benefitUnempYears]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadCloudWorkspace(selectedMonth, ctrl.signal);
    loadOverview(ctrl.signal);
    loadJournal(ctrl.signal);
    loadFinancial(ctrl.signal);
    loadPayslipAndCommissionStatus(ctrl.signal);
    return () => ctrl.abort();
  }, [selectedMonth, loadCloudWorkspace, loadOverview, loadJournal, loadFinancial, loadPayslipAndCommissionStatus]);

  useEffect(() => {
    if (activeSubtab === 'calculator') {
      if (!simResult) handleSimulate();
      if (!benefitResult) handleCalculateBenefit();
    }
  }, [activeSubtab, simResult, benefitResult, handleSimulate, handleCalculateBenefit]);

  // Derived Calculations from Accounting A-Z Engine for Active Company & Selected Month
  const ymObj = useMemo(() => ymParse(selectedMonth), [selectedMonth]);
  const currentPayrollRows = useMemo(
    () => payroll(activeCompany, selectedMonth, statutoryConfig),
    [activeCompany, selectedMonth, statutoryConfig]
  );
  const currentAlerts = useMemo(() => contractAlerts(activeCompany), [activeCompany]);
  const activeEmployeesInMonth = useMemo(
    () => (activeCompany.employees || []).filter((e) => inService(e, ymObj.y, ymObj.m)),
    [activeCompany, ymObj]
  );

  const payTotals = useMemo(() => {
    const sum = (fn: (r: AzPayRow) => number) => currentPayrollRows.reduce((t, r) => t + fn(r), 0);
    const lTheoCong = sum((r) => r.lTheoCong);
    const pc = sum((r) => r.pc);
    const ot = sum((r) => r.ot);
    const thuong = sum((r) => r.thuong);
    const khacMien = sum((r) => r.khacMien);
    const gross = sum((r) => r.gross);
    const mien = sum((r) => r.mien);
    const tnct = sum((r) => r.tnct);
    const nldBhxh = sum((r) => r.nld.bhxh);
    const nldBhyt = sum((r) => r.nld.bhyt);
    const nldBhtn = sum((r) => r.nld.bhtn);
    const gt = sum((r) => r.gt);
    const tntt = sum((r) => r.tntt);
    const net = sum((r) => r.net);
    const thue = sum((r) => r.thue);
    const bhNLD = sum((r) => r.bhNLD);
    const bhDN = sum((r) => r.bhDN);
    const kpcd = sum((r) => r.dn.kpcd);
    const dnBhxh = sum((r) => r.dn.bhxh);
    const dnBhyt = sum((r) => r.dn.bhyt);
    const dnBhtn = sum((r) => r.dn.bhtn);
    const tamUng = sum((r) => r.tamUng);
    const khauTru = sum((r) => r.khauTru);
    return {
      lTheoCong,
      pc,
      ot,
      thuong,
      khacMien,
      gross,
      mien,
      tnct,
      nldBhxh,
      nldBhyt,
      nldBhtn,
      gt,
      tntt,
      net,
      thue,
      bhNLD,
      bhDN,
      kpcd,
      dnBhxh,
      dnBhyt,
      dnBhtn,
      tamUng,
      khauTru,
      totalCost: gross + bhDN + kpcd
    };
  }, [currentPayrollRows]);

  const missingInfoEmps = useMemo(
    () => activeEmployeesInMonth.filter((e) => !e.mst || !e.cccd || !e.stk),
    [activeEmployeesInMonth]
  );

  // Filtered Journal Entries
  const filteredJournalEntries = useMemo(() => {
    let list = ensureArray<JournalEntry>(journalEntries);
    if (journalFilterAcc !== 'all') {
      list = list.filter((e) => e.debit_acc.startsWith(journalFilterAcc) || e.credit_acc.startsWith(journalFilterAcc));
    }
    if (journalSearch.trim()) {
      const q = journalSearch.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.doc_no.toLowerCase().includes(q) ||
          e.desc.toLowerCase().includes(q) ||
          e.debit_acc.includes(q) ||
          e.credit_acc.includes(q)
      );
    }
    return list;
  }, [journalEntries, journalFilterAcc, journalSearch]);

  // Tax computations for Tab `thue`
  const allTaxRecs = useMemo(() => allTaxRecords(activeCompany, statutoryConfig), [activeCompany, statutoryConfig]);
  const taxUi = azDb.ui?.tax || {};
  const kkType = activeCompany.cfg.kkType || 'Q';
  const kkYear = Number(taxUi.kkYear || ymObj.y);
  const kkNum = Number(taxUi.kkNum || (kkType === 'Q' ? Math.ceil(ymObj.m / 3) : ymObj.m));
  const qttYear = Number(taxUi.qttYear || ymObj.y);
  const soYear = Number(azDb.ui.soYear || ymObj.y);

  useEffect(() => {
    setKkYearDraft(String(kkYear));
  }, [kkYear]);
  useEffect(() => {
    setQttYearDraft(String(qttYear));
  }, [qttYear]);
  useEffect(() => {
    setSoYearDraft(String(soYear));
  }, [soYear]);

  const soAllRowsMemo = useMemo(() => soRows(activeCompany, soYear), [activeCompany, soYear]);
  const htkkValidationErrors = useMemo(() => validateHtkkCompanyInfo(activeCompany.info), [activeCompany.info]);

  const kkData = useMemo(() => {
    const m1 = kkType === 'Q' ? (kkNum - 1) * 3 + 1 : kkNum;
    const m2 = kkType === 'Q' ? kkNum * 3 : kkNum;
    return computeKK(allTaxRecs, { y: kkYear, m1, m2 }, azDb.manual?.kk || {});
  }, [allTaxRecs, kkType, kkNum, kkYear, azDb.manual]);

  const qttData = useMemo(
    () => computeQTT(allTaxRecs, qttYear, azDb.manual?.qtt || {}, statutoryConfig),
    [allTaxRecs, qttYear, azDb.manual, statutoryConfig]
  );

  const kkXmlPreview = useMemo(() => {
    try {
      return buildKKXml(activeCompany, kkType, kkNum, kkYear, kkData.v, iso(TODAY), kkDeclOpts);
    } catch (e: any) {
      return 'Lỗi tạo XML: ' + (e?.message || String(e));
    }
  }, [activeCompany, kkType, kkNum, kkYear, kkData.v, kkDeclOpts]);

  const qttXmlPreview = useMemo(() => {
    try {
      return buildQTTXml(activeCompany, qttYear, qttData.v, iso(TODAY), qttDeclOpts);
    } catch (e: any) {
      return 'Lỗi tạo XML: ' + (e?.message || String(e));
    }
  }, [activeCompany, qttYear, qttData.v, qttDeclOpts]);

  // Handlers for Employee CRUD
  const openEditEmployee = (empId?: string) => {
    if (!canWriteAz) {
      toast.error('Bạn đang ở chế độ chỉ xem');
      return;
    }
    if (!empId) {
      const nextIdx = (activeCompany.employees?.length || 0) + 1;
      const e = blankEmp();
      e.ma = 'NV' + String(nextIdx).padStart(3, '0');
      setEditingEmpModal({ emp: e, isNew: true });
    } else {
      const found = activeCompany.employees.find((x) => x.id === empId);
      if (found) {
        setEditingEmpModal({ emp: JSON.parse(JSON.stringify(found)), isNew: false });
      }
    }
  };

  const handleSaveEmployeeModal = () => {
    if (!canWriteAz || !editingEmpModal || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { emp, isNew } = editingEmpModal;
      if (!emp.ten || !emp.ten.trim()) {
        toast.error('Vui lòng nhập Họ và tên nhân viên');
        return;
      }
      const cleanEmp: AzEmployee = {
        ...emp,
        luongCB: Math.max(0, Number(emp.luongCB || 0)),
        luongBH: Math.max(0, Number(emp.luongBH || 0)),
        npt: Math.max(0, Math.floor(Number(emp.npt || 0)))
      };
      updateAzDb((draft) => {
        const co = draft.companies[draft.active];
        if (!co) return draft;
        if (isNew) {
          co.employees.push(cleanEmp);
          if (!empContracts(co, cleanEmp.id).length) {
            co.contracts.push({
              id: uid(),
              empId: cleanEmp.id,
              loai: 'XD',
              so: '',
              tu: cleanEmp.vaoLam || iso(TODAY),
              den: '',
              luong: cleanEmp.luongCB || 0,
              ghiChu: ''
            });
          }
        } else {
          const idx = co.employees.findIndex((x) => x.id === cleanEmp.id);
          if (idx >= 0) co.employees[idx] = cleanEmp;
        }
        return draft;
      }, true);
      setEditingEmpModal(null);
      toast.success(isNew ? 'Đã thêm nhân viên mới (nhấn Lưu & Chốt để đồng bộ MYERP)' : 'Đã cập nhật hồ sơ nhân viên');
    } finally {
      inFlightRef.current = false;
    }
  };

  // Soft-offboard if employee has payroll/tax history or belongs to myerp-primary (P0-AZ-05)
  const handleDeleteEmployeeModal = () => {
    if (!canWriteAz || !editingEmpModal || editingEmpModal.isNew || inFlightRef.current) return;
    const emp = editingEmpModal.emp;
    const empId = emp.id;
    const hasHistory =
      activeCompany.id === 'myerp-primary' ||
      Object.values(activeCompany.months || {}).some((mo) => Boolean(mo?.att?.[empId] || mo?.var?.[empId]));
    showConfirm({
      title: hasHistory ? `Nghỉ việc / Lưu trữ hồ sơ ${emp.ten}` : `Xoá nhân viên ${emp.ten}`,
      message: hasHistory
        ? 'Nhân viên này thuộc pháp nhân chính MYERP hoặc đã phát sinh dữ liệu công/lương/thuế. Hệ thống sẽ đánh dấu Ngày nghỉ việc (lưu trữ mềm) để bảo toàn 05/QTT-TNCN & Sổ QLLĐ.'
        : 'Bạn chắc chắn muốn xoá nhân viên này và hợp đồng liên quan khỏi công ty đang chọn?',
      confirmText: hasHistory ? 'Đánh dấu nghỉ việc' : 'Xoá hồ sơ',
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          updateAzDb((draft) => {
            const co = draft.companies[draft.active];
            if (!co) return draft;
            if (hasHistory) {
              const target = co.employees.find((x) => x.id === empId);
              if (target) {
                target.nghiViec = target.nghiViec || iso(TODAY);
                target.lyDoNghi = target.lyDoNghi || 'Chấm dứt HĐLĐ (lưu trữ lịch sử QTT)';
              }
            } else {
              co.employees = co.employees.filter((x) => x.id !== empId);
              co.contracts = co.contracts.filter((x) => x.empId !== empId);
            }
            return draft;
          }, true);
          setEditingEmpModal(null);
          toast.success(
            hasHistory
              ? `Đã chuyển trạng thái nghỉ việc cho ${emp.ten} (giữ nguyên dữ liệu quyết toán thuế)`
              : `Đã xoá nhân viên ${emp.ten}`
          );
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  // Handlers for Contract CRUD & "Ký hợp đồng tiếp"
  const openEditContract = (ctId?: string, prefillEmpId?: string, renew = false) => {
    if (!canWriteAz) {
      toast.error('Bạn đang ở chế độ chỉ xem');
      return;
    }
    const co = activeCompany;
    if (ctId) {
      const found = co.contracts.find((x) => x.id === ctId);
      if (found) {
        setEditingCtModal({
          ct: JSON.parse(JSON.stringify(found)),
          isNew: false,
          updateSalary: true
        });
      }
      return;
    }
    const e = co.employees.find((x) => x.id === prefillEmpId) || co.employees[0];
    if (!e) {
      toast.error('Vui lòng thêm nhân viên trước khi tạo hợp đồng');
      return;
    }
    const prev = empContracts(co, e.id);
    const last = prev[prev.length - 1];
    const xdCount = prev.filter((x) => x.loai === 'XD').length;
    let loai: AzContract['loai'] = 'XD';
    let tu = e.vaoLam || iso(TODAY);
    if (renew && last) {
      if (last.loai === 'TV') loai = 'XD';
      else if (last.loai === 'XD' && xdCount >= 2) loai = 'KXD';
      else loai = last.loai;
      if (last.den) {
        const d = dParse(last.den);
        if (d) {
          d.setDate(d.getDate() + 1);
          tu = iso(d);
        }
      }
    }
    let den = '';
    if (loai === 'XD') {
      const d = dParse(tu);
      if (d) {
        d.setFullYear(d.getFullYear() + 1);
        d.setDate(d.getDate() - 1);
        den = iso(d);
      }
    }
    setEditingCtModal({
      ct: {
        id: uid(),
        empId: e.id,
        loai,
        so: '',
        tu,
        den,
        luong: e.luongCB || 0,
        ghiChu: ''
      },
      isNew: true,
      updateSalary: true
    });
  };

  const handleSaveContractModal = () => {
    if (!canWriteAz || !editingCtModal || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const { ct, isNew, updateSalary } = editingCtModal;
      const normalizedCt: AzContract = {
        ...ct,
        luong: Math.max(0, Number(ct.luong || 0)),
        den: ct.loai === 'KXD' ? '' : ct.den
      };
      updateAzDb((draft) => {
        const co = draft.companies[draft.active];
        if (!co) return draft;
        if (isNew) {
          co.contracts.push(normalizedCt);
        } else {
          const idx = co.contracts.findIndex((x) => x.id === normalizedCt.id);
          if (idx >= 0) co.contracts[idx] = normalizedCt;
        }
        if (updateSalary && normalizedCt.luong > 0) {
          const emp = co.employees.find((x) => x.id === normalizedCt.empId);
          if (emp) emp.luongCB = normalizedCt.luong;
        }
        return draft;
      }, true);
      setEditingCtModal(null);
      toast.success(isNew ? 'Đã tạo hợp đồng lao động' : 'Đã cập nhật hợp đồng lao động');
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleDeleteContract = (ctId: string) => {
    if (!canWriteAz || inFlightRef.current) return;
    showConfirm({
      title: 'Xoá hợp đồng lao động',
      message: 'Bạn chắc chắn muốn xoá hợp đồng này? Thao tác này ảnh hưởng phân loại thuế TNCN của kỳ liên quan.',
      confirmText: 'Xoá hợp đồng',
      isDanger: true,
      onConfirm: async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        try {
          updateAzDb((draft) => {
            const co = draft.companies[draft.active];
            if (!co) return draft;
            co.contracts = co.contracts.filter((x) => x.id !== ctId);
            return draft;
          }, true);
          toast.success('Đã xoá hợp đồng');
        } finally {
          inFlightRef.current = false;
          closeConfirm();
        }
      }
    });
  };

  // Validate max upload size against core.upload_security_policy
  const checkUploadFileSize = useCallback(
    (file: File): boolean => {
      const maxMb = Number(uploadPolicy?.max_mb || 50);
      if (file.size > maxMb * 1024 * 1024) {
        toast.error(`Dung lượng file vượt quá giới hạn cho phép (${maxMb} MB).`);
        return false;
      }
      return true;
    },
    [uploadPolicy?.max_mb]
  );

  // Handle Employee Excel Import with Preview Diff Modal (P1-AZ-12)
  const handleImportEmployeesFile = async (file?: File | null) => {
    if (!file || !canWriteAz) return;
    if (!checkUploadFileSize(file)) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      const preview = parseEmployeeImportPreview(activeCompany, aoa);
      if (preview.error) {
        toast.error(preview.error);
        return;
      }
      if (!preview.rows.length) {
        toast.error('File Excel không có dòng dữ liệu nhân viên nào.');
        return;
      }
      setImportPreviewModal({
        filename: file.name,
        aoa,
        rows: preview.rows,
        warnings: preview.warnings
      });
    } catch (err: any) {
      toast.error('Không đọc được file Excel: ' + (err?.message || String(err)));
    }
  };

  const handleConfirmImportEmployees = () => {
    if (!importPreviewModal || !canWriteAz || inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      let resMsg = '';
      let hasErr = '';
      const aoa = importPreviewModal.aoa;
      updateAzDb((draft) => {
        const co = draft.companies[draft.active];
        if (!co) return draft;
        const result = importEmployeesIntoCompany(co, aoa);
        if (result.error) {
          hasErr = result.error;
        } else {
          resMsg = `Đã nhập: ${result.added} nhân viên mới, cập nhật ${result.updated} nhân viên${
            result.skipped ? `, bỏ qua ${result.skipped} dòng lỗi` : ''
          }.`;
        }
        return draft;
      }, true);
      setImportPreviewModal(null);
      if (hasErr) toast.error(hasErr);
      else if (resMsg) toast.success(resMsg);
    } finally {
      inFlightRef.current = false;
    }
  };

  // Handle HTKK XML Import (into Company Info & Template; draft save only)
  const handleImportHtkkXmlFile = async (file?: File | null) => {
    if (!file || !canWriteAz) return;
    if (!checkUploadFileSize(file)) return;
    try {
      const txt = await file.text();
      const doc = new DOMParser().parseFromString(txt, 'application/xml');
      if (doc.querySelector('parsererror')) {
        toast.error('File XML không hợp lệ');
        return;
      }
      const rootTag = doc.documentElement?.tagName;
      const g = (t: string) => (doc.getElementsByTagName(t)[0]?.textContent || '').trim();
      const ma = g('maTKhai');
      const hasAnyField = CO_FIELDS.some(([k]) => Boolean(g(k)));
      if (rootTag !== 'HSoThueDTu' && !ma && !hasAnyField) {
        toast.error('Cấu trúc XML không phải tờ khai HTKK hợp lệ');
        return;
      }
      updateAzDb((draft) => {
        const co = draft.companies[draft.active];
        if (!co) return draft;
        CO_FIELDS.forEach(([k]) => {
          const val = g(k);
          if (val) co.info[k] = val;
        });
        if (!co.tpl) co.tpl = {};
        if (ma === '864') co.tpl.kk = txt;
        if (ma === '953') co.tpl.qtt = txt;
        return draft;
      }, true);
      toast.success(
        `Đã nạp thông tin doanh nghiệp${
          ma === '864'
            ? ' & mẫu XML 05/KK-TNCN'
            : ma === '953'
            ? ' & mẫu XML 05/QTT-TNCN'
            : ''
        } từ file HTKK!`
      );
    } catch (err: any) {
      toast.error('Lỗi đọc file XML: ' + (err?.message || String(err)));
    }
  };

  // Handle Backup JSON Restore (validated schema, safe storage, draft save only - sync_to_myerp: false)
  const handleRestoreBackupJson = async (file?: File | null) => {
    if (!file || !canWriteAz) return;
    if (!checkUploadFileSize(file)) return;
    try {
      const txt = await file.text();
      const d = JSON.parse(txt);
      const companiesObj = d?.companies && typeof d.companies === 'object' ? d.companies : null;
      const keys = companiesObj ? Object.keys(companiesObj) : [];
      const firstCo = keys.length ? companiesObj[keys[0]] : null;
      if (!d || !companiesObj || !keys.length || !firstCo || !Array.isArray(firstCo.employees) || !firstCo.cfg) {
        toast.error('File sao lưu .json không đúng cấu trúc Kế Toán A-Z');
        return;
      }
      if (!d.manual) d.manual = { kk: {}, qtt: {} };
      if (!d.ui) d.ui = { tab: 'tongquan', ym: selectedMonth };
      if (!d.active || !companiesObj[d.active]) d.active = keys[0];
      setAzDb(d);
      scheduleCloudDraftSave(d, selectedMonth);
      toast.success('Đã khôi phục dữ liệu Kế Toán A-Z thành công (chưa tự động ghi đè bảng lương MYERP)!');
    } catch (err: any) {
      toast.error('Không đọc được file JSON: ' + (err?.message || String(err)));
    }
  };

  // Printable Payslip (Modal 3)
  const handlePrintPayslip = (row: AzPayRow) => {
    const lines = slipLines(row);
    const bodyHtml = lines
      .map((x) => {
        if (x[0] === 'h') {
          return `<tr class="grp"><td colspan="2">${escapeHtml(String(x[1] ?? ''))}</td></tr>`;
        }
        if (x[0] === 'tot') {
          return `<tr class="tot"><td>${escapeHtml(String(x[1] ?? ''))}</td><td class="num">${escapeHtml(fmt(x[2]))} đ</td></tr>`;
        }
        const val = typeof x[1] === 'number' ? fmt(x[1]) + ' đ' : String(x[1] ?? '');
        return `<tr><td>${escapeHtml(String(x[0] ?? ''))}</td><td class="num">${escapeHtml(val)}</td></tr>`;
      })
      .join('');
    const html = `<!DOCTYPE html>
<html lang="vi"><head><meta charset="utf-8" /><title>Phiếu lương ${escapeHtml(row.e.ten)} - ${escapeHtml(ymLabel(row.k))}</title>
<style>
  @page { size: A4; margin: 16mm; }
  body { background: #ffffff; color: #0f172a; font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 20px; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #BD1D2D; padding-bottom: 10px; margin-bottom: 14px; }
  .co { font-weight: 800; font-size: 14px; }
  .sub { font-size: 11px; color: #475569; margin-top: 2px; }
  h1 { font-size: 17px; margin: 8px 0 4px; color: #BD1D2D; text-transform: uppercase; }
  .meta { font-size: 12px; color: #334155; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 6px 10px; border-bottom: 1px solid #e2e8f0; }
  td.num { text-align: right; font-family: ui-monospace, monospace; font-weight: 600; }
  tr.grp td { background: #f8fafc; font-weight: 800; color: #0f172a; }
  tr.tot td { background: #fef2f2; font-weight: 800; color: #BD1D2D; border-top: 1px solid #fecaca; }
  .signs { display: flex; justify-content: space-between; margin-top: 32px; font-size: 12px; text-align: center; }
</style></head>
<body>
  <div class="head">
    <div><div class="co">${escapeHtml(activeCompany.info.tenNNT || '')}</div><div class="sub">MST: ${escapeHtml(activeCompany.info.mst || '—')} · ${escapeHtml(activeCompany.info.dchiNNT || '')}</div></div>
    <div class="sub">Kỳ lương: <strong>${escapeHtml(ymLabel(row.k))}</strong></div>
  </div>
  <h1>Phiếu lương nhân viên</h1>
  <div class="meta">Họ và tên: <strong>${escapeHtml(row.e.ten)}</strong> · Mã NV: ${escapeHtml(row.e.ma || '—')} · Chức vụ: ${escapeHtml(row.e.viTri || '—')} · STK: ${escapeHtml(row.e.stk || '—')} (${escapeHtml(row.e.nh || '—')})</div>
  <table><tbody>${bodyHtml}</tbody></table>
  <div class="signs"><div><strong>Người nhận ký</strong><div style="margin-top:48px">${escapeHtml(row.e.ten)}</div></div><div><strong>Người lập phiếu</strong><div style="margin-top:48px">${escapeHtml(activeCompany.info.nguoiKy || '')}</div></div></div>
  <script>window.onload = () => { window.print(); };</script>
</body></html>`;
    const w = window.open('', '_blank', 'width=820,height=900');
    if (w) {
      w.opener = null;
      w.document.open();
      w.document.write(html);
      w.document.close();
    } else {
      toast.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép popup để in phiếu lương.');
    }
  };

  // Close overlays via ESC using pushOverlay
  const zModalNested = uiMotion?.z_modal_nested ?? 2147483646;
  const drawerMs = uiMotion?.drawer_ms ?? 220;
  const motionCurve = uiMotion?.bezier ?? 'cubic-bezier(0.25, 0.1, 0.25, 1)';

  useEffect(() => {
    if (!editingEmpModal) return;
    return pushOverlay('az-emp-modal', () => setEditingEmpModal(null), zModalNested);
  }, [Boolean(editingEmpModal), zModalNested]);
  useEffect(() => {
    if (!editingCtModal) return;
    return pushOverlay('az-ct-modal', () => setEditingCtModal(null), zModalNested);
  }, [Boolean(editingCtModal), zModalNested]);
  useEffect(() => {
    if (!viewingSlipRow) return;
    return pushOverlay('az-slip-modal', () => setViewingSlipRow(null), zModalNested);
  }, [Boolean(viewingSlipRow), zModalNested]);
  useEffect(() => {
    if (!newCompanyModalOpen) return;
    return pushOverlay('az-co-modal', () => setNewCompanyModalOpen(false), zModalNested);
  }, [newCompanyModalOpen, zModalNested]);
  useEffect(() => {
    if (!importPreviewModal) return;
    return pushOverlay('az-import-preview-modal', () => setImportPreviewModal(null), zModalNested);
  }, [Boolean(importPreviewModal), zModalNested]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: embedMode ? '0.85rem' : '1rem', width: '100%' }}>
      {/* Hidden File Inputs */}
      <input
        ref={empExcelInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleImportEmployeesFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={htkkXmlInputRef}
        type="file"
        accept=".xml"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleImportHtkkXmlFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={backupJsonInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleRestoreBackupJson(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {/* 1. 4 TOP KPI CARDS ON VERY TOP (Memoized DomKpiTile Strip) */}
      <AzTopKpiStrip
        activeEmployeesCount={activeEmployeesInMonth.length}
        totalEmployeesCount={activeCompany.employees.length}
        contractsCount={activeCompany.contracts.length}
        alertsCount={currentAlerts.length}
        missingInfoCount={missingInfoEmps.length}
        selectedMonth={selectedMonth}
        monthLabel={ymLabel(selectedMonth)}
        hasMonthAttendance={Boolean(activeCompany.months[selectedMonth])}
        payTotals={payTotals}
      />

      {/* 2. SUBTABS (ALL 10 A-Z TABS + 3 MYERP TABS) & MULTI-COMPANY / MONTH BAR */}
      <div
        className="card"
        style={{
          padding: '0.65rem 0.9rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem'
        }}
      >
        {/* Top Row inside bar: Company Switcher + Month Selector + Quick Sync Actions */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.6rem',
            paddingBottom: '0.5rem',
            borderBottom: '1px solid #f1f5f9'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', minWidth: 0, flex: '1 1 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0, flex: '1 1 240px' }}>
              <Building2 size={15} style={{ color: '#BD1D2D', flexShrink: 0 }} />
              <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569', flexShrink: 0 }}>Công ty:</span>
              <select
                value={activeCompany.id}
                onChange={(e) => {
                  const newId = e.target.value;
                  updateAzDb((draft) => {
                    draft.active = newId;
                    return draft;
                  }, true);
                }}
                style={{
                  height: '36px',
                  padding: '0 28px 0 10px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  outline: 'none',
                  flex: '1 1 160px',
                  minWidth: 0,
                  maxWidth: '100%'
                }}
              >
                {Object.values(azDb.companies).map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.info.tenNNT || 'Chưa đặt tên') + (c.info.mst ? ` (${c.info.mst})` : '')}
                  </option>
                ))}
              </select>
              <DomToolbarButton
                variant="outline"
                icon={<Plus size={13} />}
                onClick={() => {
                  setNewCompanyName('');
                  setNewCompanyModalOpen(true);
                }}
              >
                Công ty
              </DomToolbarButton>
            </div>

            {/* Month Selector */}
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '36px',
                padding: '0 10px',
                borderRadius: '10px',
                border: '1px solid #e2e8f0',
                background: '#ffffff'
              }}
            >
              <Calendar size={13.5} style={{ color: '#64748b' }} />
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b' }}>Kỳ lương:</span>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                style={{
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: '#0f172a',
                  padding: 0
                }}
              />
            </div>

            {activeCompany.sample && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#BD1D2D',
                  fontSize: '0.73rem',
                  fontWeight: 700
                }}
              >
                Công ty mẫu minh hoạ
              </span>
            )}
            {!canWriteAz && (
              <span
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#475569',
                  fontSize: '0.73rem',
                  fontWeight: 700
                }}
              >
                Chế độ chỉ xem
              </span>
            )}
            {isPeriodLocked && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#BD1D2D',
                  fontSize: '0.73rem',
                  fontWeight: 700
                }}
              >
                <Lock size={12} />
                <span>Kỳ {ymLabel(selectedMonth)} đã khoá ({lockedPayslipCount}/{serverPayslips.length})</span>
              </span>
            )}
          </div>

          <ResponsiveActionGroup
            moreLabel="Khác"
            actions={[
              {
                key: 'save_sync',
                label: 'Lưu & Chốt Lương MYERP',
                shortLabel: 'Lưu & Chốt Lương',
                description: isPeriodLocked
                  ? 'Kỳ lương đã khoá — Mở khoá trước khi chốt lại'
                  : 'Lưu dữ liệu Kế Toán A-Z và chốt sang Bảng lương MYERP',
                icon: <Save size={13} />,
                variant: 'primary',
                disabled: syncingCloud || !canWriteAz || isPeriodLocked,
                onClick: handleSaveAndSyncPayrollToMyerp,
              },
              {
                key: 'sync_from',
                label: 'Đồng bộ từ MYERP',
                description: 'Nạp nhân sự, hợp đồng, phép & tạm ứng mới nhất',
                icon: <RefreshCw size={12.5} className={syncingCloud ? 'animate-spin' : ''} />,
                variant: 'outline',
                disabled: syncingCloud || !canWriteAz,
                onClick: () => handleSyncFromMyerp(false),
              },
              ...(canLockPeriod
                ? [
                    {
                      key: 'toggle_lock',
                      label: isPeriodLocked ? 'Mở khoá kỳ lương' : 'Khoá sổ kỳ lương',
                      icon: isPeriodLocked ? <Unlock size={13} /> : <Lock size={13} />,
                      variant: 'outline' as const,
                      disabled: syncingCloud,
                      onClick: handleTogglePeriodLock,
                    },
                  ]
                : []),
              ...(onNavigateToPayroll
                ? [
                    {
                      key: 'nav_payroll',
                      label: 'Phiếu lương HRM',
                      icon: <ChevronRight size={13} />,
                      variant: 'outline' as const,
                      onClick: onNavigateToPayroll,
                    },
                  ]
                : []),
              ...(onNavigateToProfiles
                ? [
                    {
                      key: 'nav_profiles',
                      label: 'Hồ sơ NS',
                      icon: <ChevronRight size={13} />,
                      variant: 'outline' as const,
                      onClick: onNavigateToProfiles,
                    },
                  ]
                : []),
            ]}
          />
        </div>

        {/* Bottom Row inside bar: All 13 A-Z & Executive Subtabs with Auto '...' Overflow */}
        <ResponsiveSegmentedTabs
          tabs={[
            { id: 'tongquan', label: '1. Tổng quan A-Z', shortLabel: '1. Tổng quan', icon: <Layers size={13} /> },
            { id: 'nhanvien', label: `2. Nhân viên (${activeCompany.employees.length})`, shortLabel: `2. NV (${activeCompany.employees.length})`, icon: <Users size={13} /> },
            { id: 'hopdong', label: `3. Hợp đồng${currentAlerts.length ? ` (${currentAlerts.length}!)` : ''}`, shortLabel: '3. Hợp đồng', icon: <FileText size={13} />, badge: currentAlerts.length || undefined },
            { id: 'chamcong', label: '4. Chấm công', icon: <Calendar size={13} /> },
            { id: 'bangluong', label: '5. Bảng lương', icon: <DollarSign size={13} /> },
            { id: 'chuyenkhoan', label: '6. Chuyển khoản', icon: <Landmark size={13} /> },
            { id: 'thue', label: '7. Tờ khai TNCN (XML)', shortLabel: '7. Thuế TNCN', icon: <ShieldCheck size={13} /> },
            { id: 'soqlld', label: '8. Sổ QLLĐ (NĐ 145)', shortLabel: '8. Sổ QLLĐ', icon: <BookOpen size={13} /> },
            { id: 'congty', label: '9. Công ty & Cài đặt', shortLabel: '9. Công ty', icon: <SlidersHorizontal size={13} /> },
            { id: 'saoluu', label: '10. Sao lưu & Đa công ty', shortLabel: '10. Sao lưu', icon: <Database size={13} /> },
            { id: 'pnl_report', label: 'P&L & Dòng Tiền', shortLabel: 'P&L', icon: <TrendingUp size={13} /> },
            { id: 'journal', label: 'Sổ Nhật Ký Chung', shortLabel: 'Nhật ký chung', icon: <FileSpreadsheet size={13} /> },
            { id: 'calculator', label: 'Gross ⇄ Net & Chế độ', shortLabel: 'Gross ⇄ Net', icon: <Calculator size={13} /> },
          ]}
          activeId={activeSubtab}
          onChange={(nextId) => setActiveSubtab(nextId as SubtabId)}
          mobileMaxVisible={2}
          tabletMaxVisible={4}
          desktopMaxVisible={8}
        />
      </div>

      {/* Conflict 409 Recovery Banner & 4-Way Reconciliation Strip */}
      {cloudConflictMsg && (
        <div
          className="card"
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '12px',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#BD1D2D', fontSize: '0.8rem', fontWeight: 700 }}>
            <AlertTriangle size={16} />
            <span>{cloudConflictMsg}</span>
          </div>
          <DomToolbarButton
            variant="primary"
            onClick={() => loadCloudWorkspace(selectedMonth, undefined, true)}
          >
            Tải lại bản mới nhất
          </DomToolbarButton>
        </div>
      )}

      {loading && !overview && activeSubtab === 'tongquan' && (
        <div className="card" style={{ padding: '1rem' }}>
          <TableSkeleton rows={4} cols={6} />
        </div>
      )}

      {/* =================================================================================
          TAB 1: TỔNG QUAN A-Z (100% KE-TOAN-A-Z-NHAN-SU-LUONG.html + MYERP Executive Overview)
         ================================================================================= */}
      {activeSubtab === 'tongquan' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Đối soát 4 chiều & Trạng thái khoá sổ kỳ lương */}
          {(() => {
            const serverNetTotal = serverPayslips.reduce((s, p) => s + Number(p.net_salary || 0), 0);
            const netDelta = Math.abs(Math.round(payTotals.net - serverNetTotal));
            const bankDisbursable = currentPayrollRows.filter((r) => r.net > 0).reduce((s, r) => s + r.net, 0);
            return (
              <div
                className="card"
                style={{
                  padding: '0.9rem 1.1rem',
                  borderRadius: '16px',
                  border: '1px solid #E2E8F0',
                  background: '#FFFFFF',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '0.85rem'
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    1. Trạng thái kỳ {ymLabel(selectedMonth)}
                  </span>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: isPeriodLocked ? '#BD1D2D' : '#0f172a' }}>
                    {isPeriodLocked ? 'Đã khoá sổ kỳ lương' : 'Đang mở chỉnh sửa'}
                  </div>
                  <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                    Khoá {lockedPayslipCount}/{serverPayslips.length} phiếu trên MYERP
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    2. A-Z Client ⇄ MySQL Payslips
                  </span>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: netDelta > 0 ? '#BD1D2D' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                    Chênh lệch Net: {FMT(netDelta)} đ
                  </div>
                  <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                    A-Z {FMT(payTotals.net)} đ · DB {FMT(serverNetTotal)} đ
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    3. Quỹ chi ngân hàng (TK 1121)
                  </span>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                    {FMT(bankDisbursable)} đ
                  </div>
                  <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                    Đã trừ tạm ứng {FMT(payTotals.tamUng)} đ &amp; TNCN {FMT(payTotals.thue)} đ
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                    4. Đối soát Chi Hoa hồng đã duyệt
                  </span>
                  <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                    {FMT(commissionReconciliation.total)} đ
                  </div>
                  <span style={{ fontSize: '0.73rem', color: '#64748b' }}>
                    {commissionReconciliation.count} phiếu chi hoa hồng duyệt trong kỳ
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Row 1: Việc cần làm + Quy trình 5 bước mỗi tháng (Exact from KE-TOAN-A-Z-NHAN-SU-LUONG.html) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '1.25rem' }}>
            {/* Left Card: Việc cần làm */}
            <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    Việc cần làm &amp; Cảnh báo vận hành
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                    Kiểm tra tự động bảng lương tháng {ymLabel(selectedMonth)}, hợp đồng lao động và hồ sơ nhân sự
                  </p>
                </div>
                <span
                  style={{
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background:
                      !activeCompany.months[selectedMonth] || currentAlerts.length > 0 || missingInfoEmps.length > 0
                        ? '#fef2f2'
                        : '#f8fafc',
                    color:
                      !activeCompany.months[selectedMonth] || currentAlerts.length > 0 || missingInfoEmps.length > 0
                        ? '#BD1D2D'
                        : '#0f172a',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  {(!activeCompany.months[selectedMonth] ? 1 : 0) +
                    currentAlerts.length +
                    (missingInfoEmps.length ? 1 : 0)}{' '}
                  mục cần chú ý
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '340px', overflowY: 'auto' }}>
                {!activeCompany.months[selectedMonth] && activeEmployeesInMonth.length > 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span>
                      Tháng <strong>{ymLabel(selectedMonth)}</strong> chưa lập bảng chấm công riêng — hệ thống đang tạm tính đủ công theo lịch.
                    </span>
                    <button
                      type="button"
                      className="btn primary sm"
                      disabled={!canWriteAz || isPeriodLocked}
                      onClick={() => {
                        updateAzDb((draft) => {
                          const co = draft.companies[draft.active];
                          if (co) fillFull(co, selectedMonth, true);
                          return draft;
                        }, true);
                        setActiveSubtab('bangluong');
                        toast.success(`Đã lập bảng chấm công & bảng lương tháng ${ymLabel(selectedMonth)}`);
                      }}
                      style={{ height: '30px', padding: '0 12px', fontSize: '0.75rem', fontWeight: 700 }}
                    >
                      Lập bảng lương tháng {ymLabel(selectedMonth)}
                    </button>
                  </div>
                )}

                {currentAlerts.slice(0, 6).map((a, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: a.lv === 'bad' ? '#fef2f2' : '#f8fafc',
                      border: a.lv === 'bad' ? '1px solid #fecaca' : '1px solid #e2e8f0',
                      color: a.lv === 'bad' ? '#BD1D2D' : '#0f172a',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 200 }}>
                      <Avatar src={a.e.avatar_url || undefined} name={a.e.ten} size={28} />
                      <div>
                        <strong>{a.e.ten}:</strong> {a.text}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => setActiveSubtab('hopdong')}
                      style={{ height: '28px', padding: '0 10px', fontSize: '0.74rem', fontWeight: 600 }}
                    >
                      Xem hợp đồng
                    </button>
                  </div>
                ))}

                {missingInfoEmps.length > 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      color: '#0f172a',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <span>
                      <strong style={{ color: '#BD1D2D' }}>{missingInfoEmps.length}</strong> nhân viên chưa đủ MST / CCCD / Số tài khoản ngân hàng:{' '}
                      {missingInfoEmps
                        .slice(0, 4)
                        .map((e) => e.ten)
                        .join(', ')}
                      {missingInfoEmps.length > 4 ? '…' : ''}
                    </span>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => setActiveSubtab('nhanvien')}
                      style={{ height: '28px', padding: '0 10px', fontSize: '0.74rem', fontWeight: 600 }}
                    >
                      Bổ sung
                    </button>
                  </div>
                )}

                {Boolean(activeCompany.months[selectedMonth]) &&
                  currentAlerts.length === 0 &&
                  missingInfoEmps.length === 0 && (
                    <div
                      style={{
                        padding: '18px 14px',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        color: '#0f172a',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <CheckCircle2 size={18} color="#BD1D2D" />
                      <span>
                        Tất cả hồ sơ, hợp đồng và bảng lương tháng {ymLabel(selectedMonth)} đều đầy đủ!
                      </span>
                    </div>
                  )}
              </div>
            </div>

            {/* Right Card: Quy trình mỗi tháng (5 bước từ KE-TOAN-A-Z-NHAN-SU-LUONG.html) */}
            <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Quy trình Kế Toán Nhân Sự &amp; Lương mỗi tháng (5 bước A-Z)
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                  Bấm vào từng bước để mở trực tiếp phân hệ thao tác tương ứng
                </p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {[
                  {
                    step: '1. Thêm nhân viên & ký hợp đồng',
                    desc: 'Khi có người mới hoặc gia hạn HĐLĐ theo Điều 20 BLLĐ 2019',
                    tab: 'nhanvien' as SubtabId,
                    btn: 'Nhân viên'
                  },
                  {
                    step: '2. Chấm công tháng',
                    desc: 'Mặc định đã điền đủ công — chỉ cần bấm vào ngày nghỉ phép, không lương hoặc nhập giờ tăng ca',
                    tab: 'chamcong' as SubtabId,
                    btn: 'Chấm công'
                  },
                  {
                    step: '3. Kiểm tra bảng lương',
                    desc: 'Nhập thưởng, tạm ứng nếu có → Xuất bảng lương (2 sheet) & phiếu lương Excel',
                    tab: 'bangluong' as SubtabId,
                    btn: 'Bảng lương'
                  },
                  {
                    step: '4. Chi lương chuyển khoản',
                    desc: 'Xuất danh sách chuyển khoản ngân hàng giữ nguyên định dạng STK',
                    tab: 'chuyenkhoan' as SubtabId,
                    btn: 'Chuyển khoản'
                  },
                  {
                    step: '5. Kê khai thuế TNCN (cuối quý / cuối năm)',
                    desc: 'Tải file XML 05/KK-TNCN & 05/QTT-TNCN nộp thẳng lên HTKK / Thuế điện tử',
                    tab: 'thue' as SubtabId,
                    btn: 'Tờ khai TNCN'
                  }
                ].map((item) => (
                  <div
                    key={item.step}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0f172a' }}>{item.step}</div>
                      <div style={{ fontSize: '0.74rem', color: '#64748b' }}>{item.desc}</div>
                    </div>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => setActiveSubtab(item.tab)}
                      style={{ height: '28px', padding: '0 10px', fontSize: '0.74rem', fontWeight: 600, flexShrink: 0 }}
                    >
                      <span>{item.btn}</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 2: Báo cáo P&L & Dòng tiền + SOP 7 bước từ MYERP */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '1.25rem' }}>
            {/* Card Left: P&L Overview */}
            <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    Cơ Cấu Doanh Thu, Chi Phí Nhân Sự &amp; Lợi Nhuận (MYERP Live)
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                    Đồng bộ trực tiếp với Hoá đơn, Đặt cọc và Phiếu chi tháng {selectedMonth}
                  </p>
                </div>
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: '#f8fafc',
                    border: '1px solid #e2e8f0',
                    color: '#0f172a',
                    fontSize: '0.74rem',
                    fontWeight: 700
                  }}
                >
                  Biên LN: {financialData ? `${financialData.pnl.net_margin_pct}%` : '—'}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                {[
                  {
                    label: 'Doanh thu thuần (Cọc + HĐ)',
                    amount: financialData?.pnl.revenue || 0,
                    color: '#C6333D',
                    pct: 100
                  },
                  {
                    label: 'Tổng chi phí Nhân sự & BHXH (Kế Toán A-Z)',
                    amount: payTotals.totalCost || financialData?.pnl.hrm_cost || 0,
                    color: '#334155',
                    pct:
                      financialData && financialData.pnl.revenue > 0
                        ? Math.min(
                            100,
                            Math.round(((payTotals.totalCost || financialData.pnl.hrm_cost) / financialData.pnl.revenue) * 100)
                          )
                        : 0
                  },
                  {
                    label: 'Chi phí vận hành & Marketing',
                    amount: (financialData?.pnl.operating_expense || 0) + (financialData?.pnl.marketing_expense || 0),
                    color: '#64748b',
                    pct:
                      financialData && financialData.pnl.revenue > 0
                        ? Math.min(
                            100,
                            Math.round(
                              (((financialData.pnl.operating_expense || 0) + (financialData.pnl.marketing_expense || 0)) /
                                financialData.pnl.revenue) *
                                100
                            )
                          )
                        : 0
                  },
                  {
                    label: 'Lợi nhuận ròng sau thuế',
                    amount: financialData?.pnl.net_profit || 0,
                    color: '#0f172a',
                    pct: financialData ? Math.max(0, Math.round(Number(financialData.pnl.net_margin_pct || 0))) : 0
                  }
                ].map((item, idx) => (
                  <div key={item.label} style={{ padding: '6px 8px', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '0.73rem', fontWeight: 700, color: idx === 0 ? '#BD1D2D' : '#64748b', width: 20 }}>
                          #{idx + 1}
                        </span>
                        <span style={{ width: 8, height: 8, borderRadius: '2px', background: item.color }} />
                        <span style={{ fontSize: '0.82rem', fontWeight: idx === 0 ? 700 : 600, color: '#0f172a' }}>
                          {item.label}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                        {FMT(item.amount)} đ
                      </span>
                    </div>
                    <div style={{ marginLeft: 28, height: 6, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${item.pct > 0 ? Math.max(2, Math.min(100, item.pct)) : 0}%`,
                          height: '100%',
                          background: item.color,
                          borderRadius: 4
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card Right: SOP 7 bước đóng kỳ MYERP */}
            <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                    Checklist Đóng Kỳ Kế Toán &amp; Thuế Hàng Tháng
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                    Tiến độ kiểm soát tự động tháng {ymLabel(selectedMonth)}
                  </p>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>
                  Hạn chi lương: <strong>{tt200Setting?.payday ? `Ngày ${String(tt200Setting.payday).padStart(2, '0')}` : 'Ngày 05'}</strong>
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
                {(overview?.sop_checklist || []).map((step) => (
                  <div
                    key={step.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      borderRadius: '8px',
                      background: step.done ? '#ffffff' : '#f8fafc',
                      border: '1px solid #e2e8f0',
                      fontSize: '0.78rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {step.done ? (
                        <CheckCircle2 size={15} color="#BD1D2D" />
                      ) : (
                        <Clock size={15} style={{ color: '#64748b' }} />
                      )}
                      <span style={{ fontWeight: step.done ? 700 : 500, color: '#0f172a' }}>
                        {step.title}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================================
          TAB 2: NHÂN VIÊN (100% KE-TOAN-A-Z-NHAN-SU-LUONG.html)
         ================================================================================= */}
      {activeSubtab === 'nhanvien' && (
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                Danh sách nhân viên ({activeCompany.employees.length})
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                Quản lý toàn bộ hồ sơ cá nhân, mức lương cơ bản, phụ cấp, BHXH, người phụ thuộc và tài khoản nhận lương
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <CleanSearchBox
                value={empSearch}
                onChange={setEmpSearch}
                placeholder="Tìm tên, mã, MST, CCCD, phòng..."
                width={230}
              />

              <DomToolbarButton
                variant="primary"
                onClick={() => openEditEmployee()}
                icon={<Plus size={14} />}
              >
                Thêm nhân viên
              </DomToolbarButton>

              <DomToolbarButton
                variant="outline"
                onClick={() => empExcelInputRef.current?.click()}
                icon={<Upload size={13} />}
              >
                Nhập từ Excel
              </DomToolbarButton>

              <DomToolbarButton
                variant="outline"
                onClick={() => exportEmployeeTemplateExcel(activeCompany)}
                icon={<Download size={13} />}
              >
                Mẫu nhập (.xlsx)
              </DomToolbarButton>

              <DomToolbarButton
                variant="outline"
                onClick={() => exportEmployeesExcel(activeCompany)}
                icon={<FileSpreadsheet size={13} />}
              >
                Xuất danh sách
              </DomToolbarButton>
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto', maxHeight: '65vh' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                <thead>
                  <tr
                    style={{
                      background: '#f8fafc',
                      borderBottom: '1px solid #e2e8f0',
                      color: '#475569',
                      textAlign: 'left',
                      position: 'sticky',
                      top: 0,
                      zIndex: 2
                    }}
                  >
                    <th style={{ padding: '9px 10px', fontWeight: 700 }}>Mã</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700 }}>Họ và tên</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700 }}>Chức vụ / Phòng</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700 }}>Hợp đồng</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>Lương cơ bản</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>Phụ cấp</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>Lương đóng BH</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'center' }}>NPT</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700 }}>Ngân hàng / STK</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700 }}>Trạng thái</th>
                    <th style={{ padding: '9px 10px', fontWeight: 700 }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const q = empSearch.trim().toLowerCase();
                    const list = (activeCompany.employees || []).filter(
                      (e) =>
                        !q ||
                        [e.ma, e.ten, e.mst, e.cccd, e.phong, e.viTri, e.email]
                          .join(' ')
                          .toLowerCase()
                          .includes(q)
                    );
                    if (!list.length) {
                      return (
                        <tr>
                          <td colSpan={11} style={{ textAlign: 'center', padding: '32px', color: '#64748b' }}>
                            Chưa có nhân viên phù hợp. Bấm <strong>+ Thêm nhân viên</strong> hoặc <strong>Đồng bộ từ MYERP</strong>.
                          </td>
                        </tr>
                      );
                    }
                    return list.map((e) => {
                      const ct =
                        contractAt(activeCompany, e.id, iso(TODAY)) ||
                        empContracts(activeCompany, e.id).slice(-1)[0];
                      const pcSum = (activeCompany.allowances || []).reduce(
                        (t, a) => t + (num(e.pc?.[a.id]) || 0),
                        0
                      );
                      const bhBase =
                        e.bh === 'Có'
                          ? num(e.luongBH) ||
                            e.luongCB +
                              (activeCompany.allowances || [])
                                .filter((a) => a.bh)
                                .reduce((t, a) => t + (num(e.pc?.[a.id]) || 0), 0)
                          : 0;
                      const offDate = dParse(e.nghiViec);
                      const off = Boolean(e.nghiViec && offDate && offDate < TODAY);
                      return (
                        <tr key={e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>
                            {e.ma || '—'}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <Avatar src={e.avatar_url || undefined} name={e.ten} size={28} />
                              <div>
                                <div style={{ fontWeight: 700, color: '#0f172a' }}>{e.ten}</div>
                                <div style={{ fontSize: '0.71rem', color: '#64748b' }}>
                                  {e.mst ? `MST: ${e.mst}` : e.cccd ? `CCCD: ${e.cccd}` : 'Chưa có MST/CCCD'}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 600, color: '#0f172a' }}>{e.viTri || '—'}</div>
                            <div style={{ fontSize: '0.71rem', color: '#64748b' }}>{e.phong || ''}</div>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {ct ? (
                              <div>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: '#f1f5f9',
                                    color: '#0f172a',
                                    fontSize: '0.71rem',
                                    fontWeight: 700
                                  }}
                                >
                                  {ct.loai}
                                </span>
                                <div style={{ fontSize: '0.71rem', color: '#64748b', marginTop: 2 }}>
                                  {ct.den ? 'đến ' + dmy(ct.den) : 'Không thời hạn'}
                                </div>
                              </div>
                            ) : (
                              <span
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: '6px',
                                  background: '#fef2f2',
                                  color: '#BD1D2D',
                                  fontSize: '0.71rem',
                                  fontWeight: 700
                                }}
                              >
                                Chưa có HĐ
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'JetBrains Mono, monospace',
                              fontWeight: 700
                            }}
                          >
                            {fmt(e.luongCB)}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'JetBrains Mono, monospace'
                            }}
                          >
                            {fmt(pcSum)}
                          </td>
                          <td
                            style={{
                              padding: '8px 10px',
                              textAlign: 'right',
                              fontFamily: 'JetBrains Mono, monospace'
                            }}
                          >
                            {bhBase ? fmt(bhBase) : <span style={{ color: '#94a3b8' }}>Không đóng</span>}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 700 }}>
                            {e.npt || 0}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.76rem', color: '#0f172a' }}>
                              {e.stk || '—'}
                            </div>
                            <div style={{ fontSize: '0.71rem', color: '#64748b' }}>{e.nh || ''}</div>
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {off ? (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: '#f1f5f9',
                                  color: '#475569',
                                  fontSize: '0.71rem',
                                  fontWeight: 700
                                }}
                              >
                                Đã nghỉ {dmy(e.nghiViec)}
                              </span>
                            ) : (
                              <span
                                style={{
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: '#fef2f2',
                                  color: '#BD1D2D',
                                  fontSize: '0.71rem',
                                  fontWeight: 700
                                }}
                              >
                                Đang làm
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', gap: '4px' }}>
                              <button
                                type="button"
                                className="btn outline sm"
                                onClick={() => openEditEmployee(e.id)}
                                style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem' }}
                              >
                                Sửa
                              </button>
                              <button
                                type="button"
                                className="btn outline sm"
                                onClick={() => openEditContract(undefined, e.id, true)}
                                style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem' }}
                              >
                                +HĐ
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================================
          TAB 3: HỢP ĐỒNG LAO ĐỘNG & CẢNH BÁO ĐIỀU 20 BLLĐ 2019
         ================================================================================= */}
      {activeSubtab === 'hopdong' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Cảnh báo hợp đồng */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                  Cảnh báo hợp đồng ({currentAlerts.length})
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Tự động rà soát hạn hợp đồng &amp; quy định tối đa 2 lần ký HĐ xác định thời hạn (Khoản 2 Điều 20 BLLĐ 2019)
                </p>
              </div>
            </div>

            {currentAlerts.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {currentAlerts.map((a, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: a.lv === 'bad' ? '#fef2f2' : '#f8fafc',
                      border:
                        a.lv === 'bad'
                          ? '1px solid #fecaca'
                          : '1px solid #e2e8f0',
                      color: a.lv === 'bad' ? '#BD1D2D' : '#0f172a',
                      fontSize: '0.8rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                      flexWrap: 'wrap'
                    }}
                  >
                    <div>
                      <strong>
                        {a.e.ten} ({a.e.ma || '—'}):
                      </strong>{' '}
                      {a.text}
                    </div>
                    <button
                      type="button"
                      className="btn primary sm"
                      onClick={() => openEditContract(undefined, a.e.id, true)}
                      style={{ height: '28px', padding: '0 10px', fontSize: '0.74rem', fontWeight: 700 }}
                    >
                      Ký hợp đồng tiếp
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  color: '#0f172a',
                  fontSize: '0.8rem',
                  fontWeight: 600
                }}
              >
                Tất cả hợp đồng lao động đều còn hạn hợp lệ.
              </div>
            )}
          </div>

          {/* Danh sách hợp đồng */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
                Danh sách hợp đồng ({activeCompany.contracts.length})
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  value={ctFilter}
                  onChange={(e) => setCtFilter(e.target.value as 'all' | 'warn')}
                  style={{
                    height: '36px',
                    padding: '0 10px',
                    borderRadius: '10px',
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    fontSize: '0.78rem',
                    fontWeight: 600
                  }}
                >
                  <option value="all">Tất cả hợp đồng</option>
                  <option value="warn">Cần xử lý (quá hạn / ≤ 30 ngày)</option>
                </select>
                <DomToolbarButton
                  variant="primary"
                  onClick={() => openEditContract(undefined, undefined, false)}
                  icon={<Plus size={14} />}
                >
                  Thêm hợp đồng
                </DomToolbarButton>
                <DomToolbarButton
                  variant="outline"
                  onClick={() => exportContractsExcel(activeCompany)}
                  icon={<Download size={13} />}
                >
                  Xuất Excel
                </DomToolbarButton>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                      <th style={{ padding: '9px 10px', fontWeight: 700 }}>Nhân viên</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700 }}>Số HĐ</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700 }}>Loại hợp đồng</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700 }}>Từ ngày</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700 }}>Đến ngày</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700, textAlign: 'right' }}>Mức lương</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700 }}>Tình trạng</th>
                      <th style={{ padding: '9px 10px', fontWeight: 700 }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const byE = Object.fromEntries((activeCompany.employees || []).map((e) => [e.id, e]));
                      const list = [...(activeCompany.contracts || [])].sort((a, b) =>
                        (b.tu || '').localeCompare(a.tu || '')
                      );
                      const rows = list.filter((x) => {
                        if (ctFilter !== 'warn') return true;
                        const denDate = dParse(x.den);
                        const left = denDate ? daysBetween(TODAY, denDate) : null;
                        const empCts = empContracts(activeCompany, x.empId);
                        const isLatest = empCts[empCts.length - 1]?.id === x.id;
                        return isLatest && left !== null && left <= 30;
                      });
                      if (!rows.length) {
                        return (
                          <tr>
                            <td colSpan={8} style={{ textAlign: 'center', padding: '28px', color: '#64748b' }}>
                              Chưa có hợp đồng phù hợp.
                            </td>
                          </tr>
                        );
                      }
                      return rows.map((x) => {
                        const e = byE[x.empId];
                        const denDate = dParse(x.den);
                        const left = denDate ? daysBetween(TODAY, denDate) : null;
                        const empCts = empContracts(activeCompany, x.empId);
                        const isLatest = empCts[empCts.length - 1]?.id === x.id;
                        return (
                          <tr key={x.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>
                              {e ? e.ten : '(đã xoá)'}
                            </td>
                            <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace' }}>
                              {x.so || '—'}
                            </td>
                            <td style={{ padding: '8px 10px' }}>{CT_TYPES[x.loai] || x.loai}</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace' }}>
                              {dmy(x.tu)}
                            </td>
                            <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace' }}>
                              {x.den ? dmy(x.den) : '—'}
                            </td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontWeight: 700
                              }}
                            >
                              {fmt(x.luong)}
                            </td>
                            <td style={{ padding: '8px 10px' }}>
                              {!x.den ? (
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: '#f1f5f9',
                                    color: '#0f172a',
                                    fontSize: '0.71rem',
                                    fontWeight: 700
                                  }}
                                >
                                  Không thời hạn
                                </span>
                              ) : !isLatest ? (
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: '#f8fafc',
                                    color: '#64748b',
                                    fontSize: '0.71rem',
                                    fontWeight: 700
                                  }}
                                >
                                  Đã có HĐ kế tiếp
                                </span>
                              ) : left !== null && left < 0 ? (
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: '#fef2f2',
                                    color: '#BD1D2D',
                                    fontSize: '0.71rem',
                                    fontWeight: 700
                                  }}
                                >
                                  Quá hạn {-left} ngày
                                </span>
                              ) : left !== null && left <= 30 ? (
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: '#fffbeb',
                                    color: '#b45309',
                                    fontSize: '0.71rem',
                                    fontWeight: 700
                                  }}
                                >
                                  Còn {left} ngày
                                </span>
                              ) : (
                                <span
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    background: '#f1f5f9',
                                    color: '#0f172a',
                                    fontSize: '0.71rem',
                                    fontWeight: 700
                                  }}
                                >
                                  Còn {left} ngày
                                </span>
                              )}
                            </td>
                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                              <div style={{ display: 'inline-flex', gap: '4px' }}>
                                <button
                                  type="button"
                                  className="btn outline sm"
                                  onClick={() => openEditContract(x.id)}
                                  style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem' }}
                                >
                                  Sửa
                                </button>
                                <button
                                  type="button"
                                  className="btn outline sm"
                                  onClick={() => handleDeleteContract(x.id)}
                                  style={{ height: '26px', padding: '0 8px', fontSize: '0.72rem', color: '#dc2626' }}
                                >
                                  Xoá
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================================
          TAB 4: CHẤM CÔNG THÁNG (MA TRẬN NGÀY 1..31 + BRUSH + TĂNG CA)
         ================================================================================= */}
      {activeSubtab === 'chamcong' && (
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(() => {
            const { y, m } = ymObj;
            const md = monthDays(y, m, activeCompany.cfg);
            return (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                      Bảng chấm công tháng {ymLabel(selectedMonth)} · Công chuẩn:{' '}
                      <span style={{ color: '#BD1D2D' }}>{md.congChuan}</span> ngày
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                      Thứ 7:{' '}
                      {activeCompany.cfg.t7 === 'nghi'
                        ? 'Nghỉ'
                        : activeCompany.cfg.t7 === 'nua'
                        ? 'Làm nửa ngày'
                        : 'Làm cả ngày'}{' '}
                      · Chọn ký hiệu bên dưới rồi bấm vào ô ngày để chấm
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <DomToolbarButton
                      variant="primary"
                      disabled={!canWriteAz || isPeriodLocked}
                      onClick={() => {
                        if (!canWriteAz || isPeriodLocked) return;
                        updateAzDb((draft) => {
                          const co = draft.companies[draft.active];
                          if (co) fillFull(co, selectedMonth, true);
                          return draft;
                        }, true);
                        toast.success('Đã điền đủ công cho các ô trống');
                      }}
                    >
                      Điền đủ công (ô trống)
                    </DomToolbarButton>

                    <DomToolbarButton
                      variant="outline"
                      disabled={!canWriteAz || isPeriodLocked}
                      onClick={() => {
                        if (!canWriteAz || isPeriodLocked) return;
                        updateAzDb((draft) => {
                          const co = draft.companies[draft.active];
                          if (co) markHolidays(co, selectedMonth);
                          return draft;
                        }, true);
                        toast.success('Đã đánh dấu các ngày nghỉ lễ trong tháng');
                      }}
                    >
                      Đánh dấu ngày lễ (1/1, 30/4, 1/5, 2/9)
                    </DomToolbarButton>

                    <DomToolbarButton
                      variant="outline"
                      onClick={() => exportAttendanceExcel(activeCompany, selectedMonth)}
                      icon={<Download size={13} />}
                    >
                      Xuất Excel
                    </DomToolbarButton>
                  </div>
                </div>

                {/* Brush Selector (Ch. V Slate/Red Tray) */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexWrap: 'wrap',
                    padding: '6px 10px',
                    borderRadius: '10px',
                    background: '#f1f5f9',
                    border: '1px solid #e2e8f0'
                  }}
                >
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginRight: 4 }}>
                    Cọ chấm công:
                  </span>
                  {CODES.map(([k, lb]) => {
                    const isAct = brush === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setBrush(k)}
                        style={{
                          height: '28px',
                          padding: '0 10px',
                          borderRadius: '7px',
                          border: 'none',
                          background: isAct ? '#ffffff' : 'transparent',
                          boxShadow: isAct ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                          fontSize: '0.73rem',
                          fontWeight: isAct ? 700 : 600,
                          color: isAct ? '#BD1D2D' : '#64748b',
                          cursor: 'pointer'
                        }}
                      >
                        <strong>{k === 'N' ? '½' : k}</strong> {lb}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setBrush('')}
                    style={{
                      height: '28px',
                      padding: '0 10px',
                      borderRadius: '7px',
                      border: 'none',
                      background: brush === '' ? '#ffffff' : 'transparent',
                      boxShadow: brush === '' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                      fontSize: '0.73rem',
                      fontWeight: brush === '' ? 700 : 600,
                      color: brush === '' ? '#BD1D2D' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    Xoá ô
                  </button>
                </div>

                {/* Attendance Matrix Table */}
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto', maxHeight: '65vh' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                          <th
                            style={{
                              padding: '6px 10px',
                              textAlign: 'left',
                              position: 'sticky',
                              left: 0,
                              background: '#f8fafc',
                              zIndex: 2,
                              minWidth: 165
                            }}
                          >
                            Họ và tên
                          </th>
                          {md.days.map(({ d, dow }) => (
                            <th
                              key={d}
                              style={{
                                padding: '4px 2px',
                                textAlign: 'center',
                                minWidth: 26,
                                background: dow === 0 || dow === 6 ? '#f1f5f9' : '#f8fafc',
                                borderLeft: '1px solid #f1f5f9'
                              }}
                            >
                              <div>{d}</div>
                              <div style={{ fontSize: '0.64rem', color: '#94a3b8' }}>{DOW[dow]}</div>
                            </th>
                          ))}
                          <th style={{ padding: '6px 6px', textAlign: 'right' }}>Công làm</th>
                          <th style={{ padding: '6px 6px', textAlign: 'right' }}>Phép/Lễ</th>
                          <th style={{ padding: '6px 6px', textAlign: 'right' }}>KL/Ốm</th>
                          <th style={{ padding: '6px 6px', textAlign: 'right', color: '#BD1D2D' }}>Công TL</th>
                          <th style={{ padding: '6px 6px', textAlign: 'right' }} title="Giờ làm thêm ngày thường (150%)">
                            TC thường
                          </th>
                          <th style={{ padding: '6px 6px', textAlign: 'right' }} title="Giờ làm thêm ngày nghỉ tuần (200%)">
                            TC nghỉ
                          </th>
                          <th style={{ padding: '6px 6px', textAlign: 'right' }} title="Giờ làm thêm ngày lễ (300%)">
                            TC lễ
                          </th>
                          <th style={{ padding: '6px 6px' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeEmployeesInMonth.map((e) => {
                          const a = activeCompany.months[selectedMonth]?.att?.[e.id] || { d: {} };
                          const s = attSummary(activeCompany, e, selectedMonth);
                          const v = activeCompany.months[selectedMonth]?.var?.[e.id] || {};
                          return (
                            <tr key={`${e.id}-${selectedMonth}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                              <td
                                style={{
                                  padding: '6px 10px',
                                  fontWeight: 700,
                                  color: '#0f172a',
                                  position: 'sticky',
                                  left: 0,
                                  background: '#ffffff',
                                  zIndex: 1,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {e.ten}
                              </td>
                              {md.days.map(({ d, dow }) => {
                                const val = a.d[String(d)] || '';
                                const inSvc = serviceDay(e, y, m, d);
                                let bg = dow === 0 || dow === 6 ? '#f8fafc' : '#ffffff';
                                let fg = '#0f172a';
                                if (val === 'X') {
                                  bg = '#f8fafc';
                                  fg = '#0f172a';
                                } else if (val === 'N') {
                                  bg = '#f1f5f9';
                                  fg = '#334155';
                                } else if (val === 'P' || val === 'R' || val === 'L') {
                                  bg = '#fff1f2';
                                  fg = '#BD1D2D';
                                } else if (val === 'KL' || val === 'O') {
                                  bg = '#fef2f2';
                                  fg = '#991b1b';
                                }
                                return (
                                  <td
                                    key={d}
                                    onClick={() => {
                                      if (!inSvc || !canWriteAz || isPeriodLocked) return;
                                      updateAzDb((draft) => {
                                        const co = draft.companies[draft.active];
                                        if (!co) return draft;
                                        const mo = ensureMonth(co, selectedMonth);
                                        if (!Object.keys(mo.att[e.id]?.d || {}).length && co.cfg.autoFull) {
                                          fillFull(co, selectedMonth, true, e.id);
                                        }
                                        const rec = mo.att[e.id] || (mo.att[e.id] = { d: {} });
                                        const dayKey = String(d);
                                        if (!brush || rec.d[dayKey] === brush) delete rec.d[dayKey];
                                        else rec.d[dayKey] = brush;
                                        return draft;
                                      }, true);
                                    }}
                                    style={{
                                      padding: 0,
                                      textAlign: 'center',
                                      cursor: inSvc && canWriteAz && !isPeriodLocked ? 'pointer' : 'not-allowed',
                                      opacity: inSvc ? 1 : 0.3,
                                      background: bg,
                                      color: fg,
                                      fontWeight: 700,
                                      borderLeft: '1px solid #f1f5f9',
                                      userSelect: 'none',
                                      height: 28
                                    }}
                                    title={val ? CODE[val]?.[1] : ''}
                                  >
                                    {val === 'N' ? '½' : val}
                                  </td>
                                );
                              })}
                              <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                                {s.work}
                              </td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                                {s.paid}
                              </td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                                {s.kl + s.om}
                              </td>
                              <td
                                style={{
                                  padding: '4px 6px',
                                  textAlign: 'right',
                                  fontFamily: 'JetBrains Mono, monospace',
                                  fontWeight: 800,
                                  color: '#BD1D2D'
                                }}
                              >
                                {s.congTL}
                              </td>
                              {(['ot1', 'ot2', 'ot3'] as const).map((otField) => (
                                <td key={otField} style={{ padding: '3px 4px' }}>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.5"
                                    disabled={!canWriteAz || isPeriodLocked}
                                    value={v[otField] ?? ''}
                                    placeholder="0"
                                    onChange={(ev) => {
                                      const val = ev.target.value;
                                      updateAzDb((draft) => {
                                        const co = draft.companies[draft.active];
                                        if (!co) return draft;
                                        const mo = ensureMonth(co, selectedMonth);
                                        const vr = mo.var[e.id] || (mo.var[e.id] = {});
                                        if (val === '') delete vr[otField];
                                        else vr[otField] = Math.max(0, num(val) ?? 0);
                                        return draft;
                                      }, true);
                                    }}
                                    style={{
                                      width: 52,
                                      padding: '3px 5px',
                                      borderRadius: 5,
                                      border: '1px solid #cbd5e1',
                                      textAlign: 'right',
                                      fontFamily: 'JetBrains Mono, monospace',
                                      fontSize: '0.73rem'
                                    }}
                                  />
                                </td>
                              ))}
                              <td style={{ padding: '3px 6px' }}>
                                <button
                                  type="button"
                                  className="btn outline sm"
                                  onClick={() => {
                                    updateAzDb((draft) => {
                                      const co = draft.companies[draft.active];
                                      if (co) fillFull(co, selectedMonth, false, e.id);
                                      return draft;
                                    }, true);
                                  }}
                                  style={{ height: 24, padding: '0 7px', fontSize: '0.7rem' }}
                                >
                                  Đủ công
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* =================================================================================
          TAB 5: BẢNG LƯƠNG THÁNG (21 CỘT + CHỈNH SỬA TRỰC TIẾP + CHI PHÍ DN + PHIẾU LƯƠNG)
         ================================================================================= */}
      {activeSubtab === 'bangluong' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Bảng thanh toán tiền lương tháng {ymLabel(selectedMonth)}
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Bấm vào tên nhân viên để xem <strong>Phiếu lương chi tiết</strong>. Nhập trực tiếp Thưởng, Tạm ứng, Khấu trừ hoặc sửa Thuế TNCN ngay trên dòng.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <DomToolbarButton
                  variant="outline"
                  onClick={() => exportPayrollExcel(activeCompany, selectedMonth, statutoryConfig)}
                  icon={<Download size={13} />}
                >
                  Xuất bảng lương Excel (2 sheet)
                </DomToolbarButton>
                <DomToolbarButton
                  variant="outline"
                  onClick={() => exportPayslipsExcel(activeCompany, selectedMonth, statutoryConfig)}
                  icon={<FileSpreadsheet size={13} />}
                >
                  Xuất phiếu lương
                </DomToolbarButton>
                <DomToolbarButton
                  variant="primary"
                  disabled={syncingCloud || !canWriteAz || isPeriodLocked}
                  loading={syncingCloud}
                  onClick={handleSaveAndSyncPayrollToMyerp}
                  icon={<Save size={13} />}
                >
                  Chốt &amp; Đồng bộ sang MYERP
                </DomToolbarButton>
              </div>
            </div>

            {currentPayrollRows.length === 0 ? (
              <EmptyCard
                icon={<Users size={24} />}
                title={`Chưa có nhân viên trong kỳ lương ${ymLabel(selectedMonth)}`}
                description="Hãy thêm nhân viên ở Tab 2 hoặc bấm Đồng bộ từ MYERP để tính bảng lương tháng."
              />
            ) : (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto', maxHeight: '65vh' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                  <thead>
                    <tr
                      style={{
                        background: '#f8fafc',
                        borderBottom: '1px solid #e2e8f0',
                        color: '#475569',
                        position: 'sticky',
                        top: 0,
                        zIndex: 2
                      }}
                    >
                      <th style={{ padding: '8px 8px', textAlign: 'left' }}>#</th>
                      <th style={{ padding: '8px 8px', textAlign: 'left', minWidth: 165 }}>Họ và tên</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Công</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', minWidth: 120 }}>Phép / Bù sử dụng</th>
                      <th style={{ padding: '8px 8px', textAlign: 'center', minWidth: 120 }}>Phép / Bù còn lại</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Lương theo công</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Phụ cấp</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Làm thêm</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Thưởng</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Khác (miễn thuế)</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Tổng thu nhập</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Miễn thuế</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>TN chịu thuế</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>BHXH 8%</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>BHYT 1,5%</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>BHTN 1%</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Giảm trừ GC</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>TN tính thuế</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Thuế TNCN</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }} title="Ghi đè số thuế TNCN (để trống = tự tính)">
                        Thuế (sửa)
                      </th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Tạm ứng</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right' }}>Khấu trừ khác</th>
                      <th style={{ padding: '8px 8px', textAlign: 'right', color: '#BD1D2D' }}>Thực lĩnh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPayrollRows.map((r, i) => (
                      <tr key={`${r.e.id}-${selectedMonth}`} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 8px', color: '#64748b' }}>{i + 1}</td>
                        <td style={{ padding: '6px 8px' }}>
                          <button
                            type="button"
                            onClick={() => setViewingSlipRow(r)}
                            style={{
                              border: 'none',
                              background: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              textAlign: 'left',
                              fontWeight: 700,
                              color: '#BD1D2D',
                              fontSize: '0.78rem'
                            }}
                          >
                            {r.e.ten}
                          </button>
                          <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                            {r.e.ma || ''} · {r.e.viTri || ''}
                          </div>
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {r.s.congTL}/{r.s.congChuan}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '0.7rem' }}>
                          {(() => {
                            const phepThang = Number(r.v?.phepThang ?? r.s.P ?? 0);
                            const buThang = Number(r.v?.buThang ?? 0);
                            const phepDaDung = Number(r.e.phepNamDaDung ?? phepThang ?? 0);
                            const buDaDung = Number(r.e.nghiBuDaDung ?? buThang ?? 0);
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                                <span>
                                  Phép: <strong>{phepThang}</strong> <span style={{ color: '#64748b' }}>(LK: {phepDaDung})</span>
                                </span>
                                <span>
                                  Bù: <strong>{buThang}</strong> <span style={{ color: '#64748b' }}>(LK: {buDaDung})</span>
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'center', fontSize: '0.7rem' }}>
                          {(() => {
                            const phepTong = Number(r.e.phepNamTong ?? 12);
                            const phepDaDung = Number(r.e.phepNamDaDung ?? 0);
                            const phepCon = Number(r.e.phepNamConLai ?? Math.max(0, phepTong - phepDaDung));
                            const buTong = Number(r.e.nghiBuTong ?? 0);
                            const buDaDung = Number(r.e.nghiBuDaDung ?? 0);
                            const buCon = Number(r.e.nghiBuConLai ?? Math.max(0, buTong - buDaDung));
                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                                <span style={{ color: phepCon > 0 ? '#0f172a' : '#64748b', fontWeight: 700 }}>
                                  Phép: {phepCon}/{phepTong}
                                </span>
                                <span style={{ color: buCon > 0 ? '#334155' : '#64748b', fontWeight: 700 }}>
                                  Bù: {buCon}/{buTong}
                                </span>
                              </div>
                            );
                          })()}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.lTheoCong)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.pc)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.ot)}
                        </td>
                        {(
                          [
                            ['thuong', '0'],
                            ['khacMien', '0']
                          ] as const
                        ).map(([vf, ph]) => (
                          <td key={vf} style={{ padding: '4px 6px' }}>
                            <input
                              key={`${r.e.id}-${selectedMonth}-${vf}-${r.v[vf] ?? ''}`}
                              type="text"
                              disabled={!canWriteAz || isPeriodLocked}
                              defaultValue={r.v[vf] ?? ''}
                              placeholder={ph}
                              onBlur={(ev) => {
                                const val = ev.target.value.trim();
                                updateAzDb((draft) => {
                                  const co = draft.companies[draft.active];
                                  if (!co) return draft;
                                  const mo = ensureMonth(co, selectedMonth);
                                  const vr = mo.var[r.e.id] || (mo.var[r.e.id] = {});
                                  if (val === '') delete vr[vf];
                                  else vr[vf] = Math.max(0, num(val) ?? 0);
                                  return draft;
                                }, true);
                              }}
                              style={{
                                width: 82,
                                padding: '4px 6px',
                                borderRadius: 5,
                                border: '1px solid #cbd5e1',
                                textAlign: 'right',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.73rem'
                              }}
                            />
                          </td>
                        ))}
                        <td
                          style={{
                            padding: '6px 8px',
                            textAlign: 'right',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 700
                          }}
                        >
                          {fmt(r.gross)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.mien)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.tnct)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.nld.bhxh)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.nld.bhyt)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.nld.bhtn)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.gt)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.tntt)}
                        </td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          <div style={{ fontWeight: 700, color: r.thue > 0 ? '#BD1D2D' : '#0f172a' }}>{fmt(r.thue)}</div>
                          <div style={{ fontSize: '0.66rem', color: r.thueManual ? '#BD1D2D' : '#64748b', fontWeight: r.thueManual ? 700 : 400 }}>
                            {r.thueManual ? 'Sửa tay' : r.method}
                          </div>
                        </td>
                        {(
                          [
                            ['thueOverride', 'Tự tính'],
                            ['tamUng', '0'],
                            ['khauTru', '0']
                          ] as const
                        ).map(([vf, ph]) => (
                          <td key={vf} style={{ padding: '4px 6px' }}>
                            <input
                              key={`${r.e.id}-${selectedMonth}-${vf}-${r.v[vf] ?? ''}`}
                              type="text"
                              disabled={!canWriteAz || isPeriodLocked}
                              defaultValue={r.v[vf] ?? ''}
                              placeholder={ph}
                              onBlur={(ev) => {
                                const val = ev.target.value.trim();
                                updateAzDb((draft) => {
                                  const co = draft.companies[draft.active];
                                  if (!co) return draft;
                                  const mo = ensureMonth(co, selectedMonth);
                                  const vr = mo.var[r.e.id] || (mo.var[r.e.id] = {});
                                  if (val === '') delete vr[vf];
                                  else vr[vf] = Math.max(0, num(val) ?? 0);
                                  return draft;
                                }, true);
                              }}
                              style={{
                                width: 82,
                                padding: '4px 6px',
                                borderRadius: 5,
                                border: vf === 'thueOverride' && r.thueManual ? '1px solid #BD1D2D' : '1px solid #cbd5e1',
                                textAlign: 'right',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.73rem'
                              }}
                            />
                          </td>
                        ))}
                        <td
                          style={{
                            padding: '6px 8px',
                            textAlign: 'right',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontWeight: 800,
                            color: '#BD1D2D'
                          }}
                        >
                          {fmt(r.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f1f5f9', fontWeight: 800, borderTop: '2px solid #cbd5e1' }}>
                      <td colSpan={5} style={{ padding: '8px' }}>
                        Tổng cộng ({currentPayrollRows.length} người)
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.lTheoCong)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.pc)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.ot)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.thuong)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.khacMien)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.gross)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.mien)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.tnct)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.nldBhxh)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.nldBhyt)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.nldBhtn)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.gt)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.tntt)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.thue)}
                      </td>
                      <td></td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.tamUng)}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {fmt(payTotals.khauTru)}
                      </td>
                      <td
                        style={{
                          padding: '8px',
                          textAlign: 'right',
                          fontFamily: 'JetBrains Mono, monospace',
                          color: '#BD1D2D'
                        }}
                      >
                        {fmt(payTotals.net)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            )}
          </div>

          {/* Chi phí doanh nghiệp tháng (Exact from KE-TOAN-A-Z-NHAN-SU-LUONG.html) */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0f172a' }}>
              Chi phí doanh nghiệp tháng {ymLabel(selectedMonth)}
            </h3>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Tổng lương Gross</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                      {fmt(payTotals.gross)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>BHXH doanh nghiệp đóng (17,5%: hưu trí 14% + ốm đau 3% + TNLĐ 0,5%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                      {fmt(payTotals.dnBhxh)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>BHYT doanh nghiệp đóng (3%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                      {fmt(payTotals.dnBhyt)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>BHTN doanh nghiệp đóng (1%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                      {fmt(payTotals.dnBhtn)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Kinh phí công đoàn (2%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                      {fmt(payTotals.kpcd)}
                    </td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px' }}>Tổng BH phải nộp cơ quan BHXH (NLĐ 10,5% + DN 21,5% = 32%)</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>
                      {fmt(payTotals.bhNLD + payTotals.bhDN)}
                    </td>
                  </tr>
                  <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                    <td style={{ padding: '10px 12px', color: '#0f172a' }}>Tổng chi phí nhân sự của doanh nghiệp</td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        fontFamily: 'JetBrains Mono, monospace',
                        color: '#BD1D2D',
                        fontSize: '0.9rem'
                      }}
                    >
                      {fmt(payTotals.totalCost)} đ
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================================
          TAB 6: CHUYỂN KHOẢN NGÂN HÀNG (100% KE-TOAN-A-Z-NHAN-SU-LUONG.html)
         ================================================================================= */}
      {activeSubtab === 'chuyenkhoan' && (
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(() => {
            const rows = currentPayrollRows.filter((r) => r.net > 0);
            const missingBank = rows.filter((r) => !r.e.stk || !r.e.nh);
            const totalNet = rows.reduce((t, r) => t + r.net, 0);
            const defaultNote = azDb.ui.ckNote || `Luong thang ${ymLabel(selectedMonth)}`;
            return (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                      Danh sách chi lương qua ngân hàng tháng {ymLabel(selectedMonth)}
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                      Xuất file Excel Ủy nhiệm chi / Lô chuyển khoản giữ nguyên định dạng chuỗi Số tài khoản
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={defaultNote}
                      onChange={(ev) => {
                        const val = ev.target.value;
                        updateAzDb((draft) => {
                          draft.ui.ckNote = val;
                          return draft;
                        }, false);
                      }}
                      placeholder="Nội dung chuyển khoản"
                      style={{
                        height: 36,
                        width: 240,
                        padding: '0 10px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        fontSize: '0.78rem'
                      }}
                    />
                    <DomToolbarButton
                      variant="primary"
                      onClick={() => exportBankTransferExcel(activeCompany, selectedMonth, defaultNote, statutoryConfig)}
                      icon={<Download size={13} />}
                    >
                      Xuất Excel gửi ngân hàng
                    </DomToolbarButton>
                  </div>
                </div>

                {missingBank.length > 0 && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      color: '#b45309',
                      fontSize: '0.8rem'
                    }}
                  >
                    <strong>{missingBank.length}</strong> nhân viên chưa có Số tài khoản hoặc tên Ngân hàng:{' '}
                    {missingBank.map((r) => r.e.ten).join(', ')}
                  </div>
                )}

                {rows.length === 0 ? (
                  <EmptyCard
                    icon={<Landmark size={24} />}
                    title={`Chưa có khoản chuyển khoản lương tháng ${ymLabel(selectedMonth)}`}
                    description="Chỉ hiển thị nhân viên có Thực lĩnh lớn hơn 0 đ."
                  />
                ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                          <th style={{ padding: '9px 10px' }}>STT</th>
                          <th style={{ padding: '9px 10px' }}>Họ và tên</th>
                          <th style={{ padding: '9px 10px' }}>Số tài khoản</th>
                          <th style={{ padding: '9px 10px' }}>Ngân hàng</th>
                          <th style={{ padding: '9px 10px' }}>Chi nhánh</th>
                          <th style={{ padding: '9px 10px', textAlign: 'right' }}>Số tiền</th>
                          <th style={{ padding: '9px 10px' }}>Nội dung</th>
                          <th style={{ padding: '9px 10px' }}>Trạng thái</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r.e.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px' }}>{i + 1}</td>
                            <td style={{ padding: '8px 10px', fontWeight: 700, color: '#0f172a' }}>{r.e.ten}</td>
                            <td style={{ padding: '8px 10px', fontFamily: 'JetBrains Mono, monospace' }}>
                              {r.e.stk || <span style={{ color: '#dc2626', fontWeight: 700 }}>Thiếu STK</span>}
                            </td>
                            <td style={{ padding: '8px 10px' }}>{r.e.nh || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>{r.e.cn || '—'}</td>
                            <td
                              style={{
                                padding: '8px 10px',
                                textAlign: 'right',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontWeight: 700,
                                color: '#BD1D2D'
                              }}
                            >
                              {fmt(r.net)}
                            </td>
                            <td style={{ padding: '8px 10px' }}>{defaultNote}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <button
                                type="button"
                                className="btn outline sm"
                                onClick={() => openEditEmployee(r.e.id)}
                                style={{ height: 26, padding: '0 8px', fontSize: '0.72rem' }}
                              >
                                Sửa TK
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ background: '#f1f5f9', fontWeight: 800 }}>
                          <td colSpan={5} style={{ padding: '9px 10px' }}>
                            Tổng chuyển khoản ({rows.length} người)
                          </td>
                          <td
                            style={{
                              padding: '9px 10px',
                              textAlign: 'right',
                              fontFamily: 'JetBrains Mono, monospace',
                              color: '#BD1D2D'
                            }}
                          >
                            {fmt(totalNet)} đ
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* =================================================================================
          TAB 7: TỜ KHAI THUẾ TNCN 05/KK-TNCN & 05/QTT-TNCN + PHỤ LỤC 05-1BK, 05-2BK (100% HTKK XML)
         ================================================================================= */}
      {activeSubtab === 'thue' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {htkkValidationErrors.length > 0 && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#BD1D2D',
                fontSize: '0.8rem',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap'
              }}
            >
              <div>
                <strong>Cảnh báo trước khi xuất XML HTKK:</strong>{' '}
                {htkkValidationErrors.join(' · ')}
              </div>
              <button
                type="button"
                className="btn outline sm"
                onClick={() => setActiveSubtab('congty')}
                style={{ height: 28, padding: '0 10px', fontSize: '0.73rem', fontWeight: 700 }}
              >
                Cập nhật thông tin Cty
              </button>
            </div>
          )}

          {!allTaxRecs.length && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '8px',
                background: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#b45309',
                fontSize: '0.8rem'
              }}
            >
              Chưa có bảng lương nào phát sinh thu nhập trong năm — hãy kiểm tra ở mục <strong>Bảng lương</strong> trước.
            </div>
          )}

          {/* KHỐI 1: TỜ KHAI 05/KK-TNCN (THEO QUÝ / THÁNG) */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Tờ khai 05/KK-TNCN (kê khai theo quý hoặc tháng — Thông tư 80/2021/TT-BTC · maTKhai=864)
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Thời điểm tính thuế TNCN:{' '}
                  <strong>
                    {activeCompany.cfg.payLag
                      ? 'Tháng thực trả (lương tháng T trả đầu tháng T+1)'
                      : 'Tháng phát sinh (trả trong tháng)'}
                  </strong>{' '}
                  · {rulesFor(kkYear, statutoryConfig?.pit).label}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <select
                  value={kkType}
                  onChange={(ev) => {
                    const val = ev.target.value as 'Q' | 'M';
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.kkType = val;
                      if (!draft.ui.tax) draft.ui.tax = {};
                      draft.ui.tax.kkNum = 1;
                      return draft;
                    }, true);
                  }}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.76rem', fontWeight: 600 }}
                >
                  <option value="Q">Theo quý</option>
                  <option value="M">Theo tháng</option>
                </select>

                <select
                  value={kkNum}
                  onChange={(ev) => {
                    const val = Number(ev.target.value);
                    updateAzDb((draft) => {
                      if (!draft.ui.tax) draft.ui.tax = {};
                      draft.ui.tax.kkNum = val;
                      return draft;
                    }, false);
                  }}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.76rem', fontWeight: 600 }}
                >
                  {kkType === 'Q'
                    ? [1, 2, 3, 4].map((q) => (
                        <option key={q} value={q}>
                          Quý {q} (tháng {(q - 1) * 3 + 1}–{q * 3})
                        </option>
                      ))
                    : Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          Tháng {String(m).padStart(2, '0')}
                        </option>
                      ))}
                </select>

                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={kkYearDraft}
                  onChange={(ev) => {
                    const raw = ev.target.value.replace(/\D/g, '').slice(0, 4);
                    setKkYearDraft(raw);
                    if (raw.length === 4) {
                      const n = Number(raw);
                      if (n >= 1990 && n <= 2100) {
                        updateAzDb((draft) => {
                          if (!draft.ui.tax) draft.ui.tax = {};
                          draft.ui.tax.kkYear = n;
                          return draft;
                        }, false);
                      }
                    }
                  }}
                  onBlur={() => {
                    const n = Number(kkYearDraft);
                    if (!n || n < 1990 || n > 2100) setKkYearDraft(String(kkYear));
                  }}
                  style={{
                    height: 36,
                    width: 72,
                    padding: '0 8px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: '0.78rem'
                  }}
                />

                <select
                  value={kkDeclOpts.loaiTKhai || 'C'}
                  onChange={(ev) => {
                    const loaiTKhai = ev.target.value === 'B' ? 'B' : 'C';
                    setKkDeclOpts({ loaiTKhai, soLan: loaiTKhai === 'B' ? Math.max(1, kkDeclOpts.soLan || 1) : 0 });
                  }}
                  style={{ height: 36, padding: '0 8px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.76rem', fontWeight: 600 }}
                >
                  <option value="C">Chính thức (L00)</option>
                  <option value="B">Bổ sung</option>
                </select>
                {kkDeclOpts.loaiTKhai === 'B' && (
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={kkDeclOpts.soLan || 1}
                    onChange={(ev) =>
                      setKkDeclOpts({ loaiTKhai: 'B', soLan: Math.max(1, Math.min(99, parseInt(ev.target.value) || 1)) })
                    }
                    title="Số lần bổ sung"
                    style={{ height: 36, width: 56, padding: '0 6px', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700, fontSize: '0.76rem' }}
                  />
                )}

                <DomToolbarButton
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(kkXmlPreview);
                      toast.success('Đã sao chép XML 05/KK-TNCN vào Clipboard');
                    } catch (_e) {
                      toast.error('Trình duyệt không cho phép sao chép tự động. Vui lòng dùng nút Tải XML.');
                    }
                  }}
                  icon={<Copy size={13} />}
                >
                  Copy XML
                </DomToolbarButton>

                <DomToolbarButton
                  variant="primary"
                  onClick={() => {
                    if (htkkValidationErrors.length > 0) {
                      toast.error(htkkValidationErrors[0]);
                      return;
                    }
                    const fname = getKKFileName(activeCompany.info.mst, kkType, kkNum, kkYear, kkDeclOpts.soLan || 0);
                    downloadTextFile(fname, kkXmlPreview);
                    toast.success(`Đã tải ${fname}`);
                  }}
                  icon={<Download size={13} />}
                >
                  Tải XML 05/KK-TNCN
                </DomToolbarButton>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', width: 90 }}>Chỉ tiêu</th>
                    <th style={{ padding: '8px 12px' }}>Nội dung chỉ tiêu trên tờ khai 05/KK-TNCN</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: 190 }}>Số tiền / Số người</th>
                  </tr>
                </thead>
                <tbody>
                  {KK_ROWS.map(([c, label, cls, manual]) => {
                    const k = 'ct' + c;
                    return (
                      <tr
                        key={c}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: cls === 'total' ? '#f8fafc' : '#ffffff',
                          fontWeight: cls === 'total' ? 700 : 400
                        }}
                      >
                        <td style={{ padding: '7px 12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#64748b' }}>
                          [{c.replace('_', '.')}]
                        </td>
                        <td style={{ padding: cls === 'sub' ? '7px 12px 7px 26px' : '7px 12px', color: '#0f172a' }}>
                          {label}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {manual ? (
                            <input
                              type="number"
                              value={kkData.v[k] || 0}
                              onChange={(ev) => {
                                const val = num(ev.target.value) || 0;
                                updateAzDb((draft) => {
                                  if (!draft.manual) draft.manual = { kk: {}, qtt: {} };
                                  draft.manual.kk[k] = val;
                                  return draft;
                                }, false);
                              }}
                              style={{
                                width: 140,
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                                textAlign: 'right',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.76rem'
                              }}
                            />
                          ) : (
                            <span style={{ fontWeight: cls === 'total' ? 800 : 600, color: c === '29' ? '#BD1D2D' : '#0f172a' }}>
                              {fmt(kkData.v[k])}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>
                Xem trước nội dung XML 05/KK-TNCN ({getKKFileName(activeCompany.info.mst, kkType, kkNum, kkYear)})
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  borderRadius: 8,
                  fontSize: '0.73rem',
                  fontFamily: 'JetBrains Mono, monospace',
                  maxHeight: 280,
                  overflow: 'auto',
                  whiteSpace: 'pre'
                }}
              >
                {kkXmlPreview}
              </pre>
            </details>
          </div>

          {/* KHỐI 2: TỜ KHAI QUYẾT TOÁN NĂM 05/QTT-TNCN & PHỤ LỤC 05-1BK, 05-2BK */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Tờ khai quyết toán năm 05/QTT-TNCN (maTKhai=953) &amp; Bảng kê 05-1/BK, 05-2/BK
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Năm quyết toán <strong>{qttYear}</strong> · {qttData.R.label}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Năm quyết toán:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={qttYearDraft}
                  onChange={(ev) => {
                    const raw = ev.target.value.replace(/\D/g, '').slice(0, 4);
                    setQttYearDraft(raw);
                    if (raw.length === 4) {
                      const n = Number(raw);
                      if (n >= 1990 && n <= 2100) {
                        updateAzDb((draft) => {
                          if (!draft.ui.tax) draft.ui.tax = {};
                          draft.ui.tax.qttYear = n;
                          return draft;
                        }, false);
                      }
                    }
                  }}
                  onBlur={() => {
                    const n = Number(qttYearDraft);
                    if (!n || n < 1990 || n > 2100) setQttYearDraft(String(qttYear));
                  }}
                  style={{
                    height: 36,
                    width: 72,
                    padding: '0 8px',
                    borderRadius: 10,
                    border: '1px solid #e2e8f0',
                    textAlign: 'center',
                    fontWeight: 700,
                    fontSize: '0.78rem'
                  }}
                />

                <select
                  value={qttDeclOpts.loaiTKhai || 'C'}
                  onChange={(ev) => {
                    const loaiTKhai = ev.target.value === 'B' ? 'B' : 'C';
                    setQttDeclOpts({ loaiTKhai, soLan: loaiTKhai === 'B' ? Math.max(1, qttDeclOpts.soLan || 1) : 0 });
                  }}
                  style={{ height: 36, padding: '0 8px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.76rem', fontWeight: 600 }}
                >
                  <option value="C">Chính thức (L00)</option>
                  <option value="B">Bổ sung</option>
                </select>
                {qttDeclOpts.loaiTKhai === 'B' && (
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={qttDeclOpts.soLan || 1}
                    onChange={(ev) =>
                      setQttDeclOpts({ loaiTKhai: 'B', soLan: Math.max(1, Math.min(99, parseInt(ev.target.value) || 1)) })
                    }
                    title="Số lần bổ sung QTT"
                    style={{ height: 36, width: 56, padding: '0 6px', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: 700, fontSize: '0.76rem' }}
                  />
                )}

                <DomToolbarButton
                  variant="primary"
                  onClick={() => {
                    if (htkkValidationErrors.length > 0) {
                      toast.error(htkkValidationErrors[0]);
                      return;
                    }
                    const fname = getQTTFileName(activeCompany.info.mst, qttYear, qttDeclOpts.soLan || 0);
                    downloadTextFile(fname, qttXmlPreview);
                    toast.success(`Đã tải ${fname}`);
                  }}
                  icon={<Download size={13} />}
                >
                  Tải XML 05/QTT-TNCN
                </DomToolbarButton>

                <DomToolbarButton
                  variant="outline"
                  onClick={() => {
                    if (htkkValidationErrors.length > 0) {
                      toast.error(htkkValidationErrors[0]);
                      return;
                    }
                    const f1 = getKKFileName(activeCompany.info.mst, kkType, kkNum, kkYear, kkDeclOpts.soLan || 0);
                    const f2 = getQTTFileName(activeCompany.info.mst, qttYear, qttDeclOpts.soLan || 0);
                    downloadTextFile(f1, kkXmlPreview);
                    setTimeout(() => downloadTextFile(f2, qttXmlPreview), 750);
                    toast.success('Đã tải lần lượt 2 file XML (05/KK + 05/QTT)');
                  }}
                  icon={<Download size={13} />}
                >
                  Tải cả 2 XML
                </DomToolbarButton>

                <DomToolbarButton
                  variant="outline"
                  onClick={() => {
                    exportQttAppendicesExcel(qttData, qttYear);
                    toast.success(`Đã tải Bảng kê 05-1BK, 05-2BK năm ${qttYear}`);
                  }}
                  icon={<FileSpreadsheet size={13} />}
                >
                  Tải Excel Bảng kê 05-1BK, 05-2BK
                </DomToolbarButton>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px 12px', width: 90 }}>Chỉ tiêu</th>
                    <th style={{ padding: '8px 12px' }}>Nội dung chỉ tiêu trên tờ khai 05/QTT-TNCN</th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', width: 190 }}>Số tiền / Số người</th>
                  </tr>
                </thead>
                <tbody>
                  {QTT_ROWS.map((row, idx) => {
                    if (row[0] === 'grp') {
                      return (
                        <tr key={'grp-' + idx} style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                          <td colSpan={3} style={{ padding: '8px 12px', fontWeight: 800, color: '#0f172a' }}>
                            {row[1]}
                          </td>
                        </tr>
                      );
                    }
                    const [c, label, cls, manual] = row;
                    const k = 'ct' + c;
                    return (
                      <tr
                        key={c}
                        style={{
                          borderBottom: '1px solid #f1f5f9',
                          background: cls === 'total' ? '#f8fafc' : '#ffffff',
                          fontWeight: cls === 'total' ? 700 : 400
                        }}
                      >
                        <td style={{ padding: '7px 12px', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#64748b' }}>
                          [{c}]
                        </td>
                        <td style={{ padding: cls === 'sub' ? '7px 12px 7px 26px' : '7px 12px', color: '#0f172a' }}>
                          {label}
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {manual ? (
                            <input
                              type="number"
                              value={qttData.v[k] || 0}
                              onChange={(ev) => {
                                const val = num(ev.target.value) || 0;
                                updateAzDb((draft) => {
                                  if (!draft.manual) draft.manual = { kk: {}, qtt: {} };
                                  draft.manual.qtt[k] = val;
                                  return draft;
                                }, false);
                              }}
                              style={{
                                width: 140,
                                padding: '4px 8px',
                                borderRadius: 6,
                                border: '1px solid #cbd5e1',
                                textAlign: 'right',
                                fontFamily: 'JetBrains Mono, monospace',
                                fontSize: '0.76rem'
                              }}
                            />
                          ) : (
                            <span
                              style={{
                                fontWeight: cls === 'total' ? 800 : 600,
                                color: c === '31' || c === '38' || c === '40' ? '#BD1D2D' : '#0f172a'
                              }}
                            >
                              {fmt(qttData.v[k])}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Phụ lục 05-1/BK-QTT-TNCN */}
            <div>
              <h4 style={{ margin: '4px 0 8px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                Phụ lục 05-1/BK-QTT-TNCN — Cá nhân cư trú có HĐLĐ ({qttData.bk1.length} người)
              </h4>
              {qttData.bk1.length === 0 ? (
                <EmptyCard
                  icon={<FileText size={24} />}
                  title={`Chưa có dữ liệu Phụ lục 05-1/BK năm ${qttYear}`}
                  description="Chưa phát sinh thu nhập từ HĐLĐ ≥ 3 tháng của cá nhân cư trú trong năm quyết toán."
                />
              ) : (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                        <th style={{ padding: '8px' }}>#</th>
                        <th style={{ padding: '8px' }}>Họ và tên</th>
                        <th style={{ padding: '8px' }}>MST</th>
                        <th style={{ padding: '8px' }}>CCCD</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}>Ủy quyền</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[12] TNCT</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[16] NPT</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[17] Giảm trừ GC</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[19] BH bắt buộc</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[21] TN tính thuế</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[22] Đã khấu trừ</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[24] Phải nộp năm</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[25] Nộp thừa</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[26] Còn phải nộp</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>[27] Miễn ≤50k</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qttData.bk1.map((p: any, i: number) => (
                        <tr key={p.key || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '7px 8px' }}>{i + 1}</td>
                          <td style={{ padding: '7px 8px', fontWeight: 700, color: '#0f172a' }}>{p.name}</td>
                          <td style={{ padding: '7px 8px', fontFamily: 'JetBrains Mono, monospace' }}>{p.mst}</td>
                          <td style={{ padding: '7px 8px', fontFamily: 'JetBrains Mono, monospace' }}>{p.cccd}</td>
                          <td style={{ padding: '7px 8px', textAlign: 'center', fontWeight: 700 }}>
                            {p.auth ? 'Có' : 'Không'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {fmt(p.tnct)}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {p.nptMax}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {fmt(p.gt)}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {fmt(p.bh)}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {fmt(p.tntt)}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {fmt(p.thue)}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {p.auth ? fmt(p.payable) : '—'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {p.auth ? fmt(p.thua) : '—'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {p.auth ? fmt(p.conNop) : '—'}
                          </td>
                          <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {p.auth ? fmt(p.mien) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              )}
            </div>

            {qttData.bk2.length > 0 && (
              <div>
                <h4 style={{ margin: '4px 0 8px', fontSize: '0.88rem', fontWeight: 800, color: '#0f172a' }}>
                  Phụ lục 05-2/BK-QTT-TNCN — Không HĐLĐ / Vãng lai / Không cư trú ({qttData.bk2.length} người)
                </h4>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                          <th style={{ padding: '8px' }}>#</th>
                          <th style={{ padding: '8px' }}>Họ và tên</th>
                          <th style={{ padding: '8px' }}>MST</th>
                          <th style={{ padding: '8px' }}>CCCD/Hộ chiếu</th>
                          <th style={{ padding: '8px' }}>Cư trú</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>TNCT</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Thuế đã khấu trừ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qttData.bk2.map((p: any, i: number) => (
                          <tr key={p.key || i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '7px 8px' }}>{i + 1}</td>
                            <td style={{ padding: '7px 8px', fontWeight: 700, color: '#0f172a' }}>{p.name}</td>
                            <td style={{ padding: '7px 8px', fontFamily: 'JetBrains Mono, monospace' }}>{p.mst}</td>
                            <td style={{ padding: '7px 8px', fontFamily: 'JetBrains Mono, monospace' }}>{p.cccd}</td>
                            <td style={{ padding: '7px 8px' }}>{p.resident ? 'Cư trú' : 'Không cư trú'}</td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                              {fmt(p.tnct)}
                            </td>
                            <td style={{ padding: '7px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                              {fmt(p.thue)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>
                Xem trước nội dung XML 05/QTT-TNCN ({getQTTFileName(activeCompany.info.mst, qttYear)})
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  background: '#0f172a',
                  color: '#e2e8f0',
                  borderRadius: 8,
                  fontSize: '0.73rem',
                  fontFamily: 'JetBrains Mono, monospace',
                  maxHeight: 280,
                  overflow: 'auto',
                  whiteSpace: 'pre'
                }}
              >
                {qttXmlPreview}
              </pre>
            </details>
          </div>
        </div>
      )}

      {/* =================================================================================
          TAB 8: SỔ QUẢN LÝ LAO ĐỘNG (ĐỦ 21 CỘT THEO NGHỊ ĐỊNH 145/2020/NĐ-CP)
         ================================================================================= */}
      {activeSubtab === 'soqlld' && (
        <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {(() => {
            const q = soSearch.trim().toLowerCase();
            const filtered = q ? soAllRowsMemo.filter((r) => r.join(' ').toLowerCase().includes(q)) : soAllRowsMemo;
            return (
              <>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}
                >
                  <div>
                    <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                      Sổ quản lý lao động năm {soYear} (21 cột theo Khoản 2 Điều 3 Nghị định 145/2020/NĐ-CP)
                    </h3>
                    <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                      Số ngày nghỉ phép năm và số giờ làm thêm được tự động cộng từ bảng chấm công các tháng trong năm {soYear}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <CleanSearchBox
                      value={soSearch}
                      onChange={setSoSearch}
                      placeholder="Tìm họ tên, CCCD, vị trí..."
                      width={220}
                    />
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>Năm:</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      value={soYearDraft}
                      onChange={(ev) => {
                        const raw = ev.target.value.replace(/\D/g, '').slice(0, 4);
                        setSoYearDraft(raw);
                        if (raw.length === 4) {
                          const n = Number(raw);
                          if (n >= 1990 && n <= 2100) {
                            updateAzDb((draft) => {
                              draft.ui.soYear = n;
                              return draft;
                            }, false);
                          }
                        }
                      }}
                      onBlur={() => {
                        const n = Number(soYearDraft);
                        if (!n || n < 1990 || n > 2100) setSoYearDraft(String(soYear));
                      }}
                      style={{
                        height: 36,
                        width: 72,
                        padding: '0 8px',
                        borderRadius: 10,
                        border: '1px solid #e2e8f0',
                        textAlign: 'center',
                        fontWeight: 700,
                        fontSize: '0.78rem'
                      }}
                    />
                    <DomToolbarButton
                      variant="primary"
                      onClick={() => exportLaborBookExcel(activeCompany, soYear)}
                      icon={<Download size={13} />}
                    >
                      Xuất sổ Excel
                    </DomToolbarButton>
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <EmptyCard
                    icon={<BookOpen size={24} />}
                    title={`Chưa có dữ liệu Sổ quản lý lao động năm ${soYear}`}
                    description="Thử xóa từ khóa tìm kiếm hoặc bổ sung danh sách nhân viên ở Tab 2."
                  />
                ) : (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
                  <div style={{ overflowX: 'auto', maxHeight: '65vh' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                      <thead>
                        <tr
                          style={{
                            background: '#f8fafc',
                            borderBottom: '1px solid #e2e8f0',
                            color: '#475569',
                            textAlign: 'left',
                            position: 'sticky',
                            top: 0,
                            zIndex: 2
                          }}
                        >
                          {SO_HEAD.map((h) => (
                            <th key={h} style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontWeight: 700 }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((r, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            {r.map((cell, ci) => (
                              <td
                                key={ci}
                                style={{
                                  padding: '7px 10px',
                                  whiteSpace: 'nowrap',
                                  fontWeight: ci === 1 ? 700 : 400,
                                  color: '#0f172a'
                                }}
                              >
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* =================================================================================
          TAB 9: CÔNG TY & CÀI ĐẶT (13 TRƯỜNG HTKK + 12 THAM SỐ LƯƠNG + PHỤ CẤP ĐỘNG)
         ================================================================================= */}
      {activeSubtab === 'congty' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Khối 1: Thông tin doanh nghiệp */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Thông tin doanh nghiệp (dùng cho tờ khai HTKK &amp; tiêu đề phiếu/bảng)
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Có thể nhập trực tiếp hoặc bấm <strong>Nạp từ file XML HTKK…</strong> để tự động điền toàn bộ mã CQT, địa chỉ và giữ nguyên mẫu XML gốc
                </p>
              </div>
              <DomToolbarButton
                variant="outline"
                onClick={() => htkkXmlInputRef.current?.click()}
                icon={<Upload size={13} />}
              >
                Nạp từ file XML HTKK…
              </DomToolbarButton>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
              {CO_FIELDS.map(([k, lb, cls, ph]) => (
                <div key={k} style={{ gridColumn: cls === 'wide' ? '1 / -1' : 'span 1' }}>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    {lb}
                  </label>
                  <input
                    type="text"
                    disabled={!canWriteAz}
                    value={activeCompany.info[k] || ''}
                    placeholder={ph || ''}
                    onChange={(ev) => {
                      const val = ev.target.value;
                      updateAzDb((draft) => {
                        const co = draft.companies[draft.active];
                        if (co) co.info[k] = val;
                        return draft;
                      }, true);
                    }}
                    style={{
                      width: '100%',
                      padding: '7px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: '0.8rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Khối 2: Cài đặt tính lương */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                Cài đặt tính lương &amp; tham số pháp lý (2025 / 2026)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                Tự động áp dụng cho toàn bộ bảng chấm công, bảng lương và tờ khai thuế TNCN của công ty đang chọn
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Vùng lương tối thiểu (trần BHTN = 20 × vùng)
                </label>
                <select
                  value={activeCompany.cfg.vung}
                  onChange={(ev) => {
                    const val = Number(ev.target.value);
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.vung = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                >
                  {[1, 2, 3, 4].map((v) => (
                    <option key={v} value={v}>
                      Vùng {v} ({fmt(LAW.vung(2025)[v])} đ năm 2025 → {fmt(LAW.vung(2026)[v])} đ từ 2026)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Ngày công chuẩn tháng
                </label>
                <select
                  value={String(activeCompany.cfg.congChuan)}
                  onChange={(ev) => {
                    const val = ev.target.value === 'lich' ? 'lich' : Number(ev.target.value);
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.congChuan = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                >
                  <option value="lich">Theo lịch thực tế của tháng</option>
                  <option value="26">Cố định 26 công</option>
                  <option value="24">Cố định 24 công</option>
                  <option value="22">Cố định 22 công</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Làm việc Thứ 7
                </label>
                <select
                  value={activeCompany.cfg.t7}
                  onChange={(ev) => {
                    const val = ev.target.value as 'nghi' | 'nua' | 'lam';
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.t7 = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                >
                  <option value="nghi">Nghỉ Thứ 7</option>
                  <option value="nua">Làm nửa ngày Thứ 7</option>
                  <option value="lam">Làm cả ngày Thứ 7</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Chưa chấm công thì mặc định đủ công
                </label>
                <select
                  value={activeCompany.cfg.autoFull ? '1' : '0'}
                  onChange={(ev) => {
                    const val = ev.target.value === '1';
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.autoFull = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                >
                  <option value="1">Có — tự tính đủ công nếu chưa chấm</option>
                  <option value="0">Không — phải chấm mới có công</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Kinh phí công đoàn 2% (DN đóng)
                </label>
                <select
                  value={activeCompany.cfg.kpcd ? '1' : '0'}
                  onChange={(ev) => {
                    const val = ev.target.value === '1';
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.kpcd = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                >
                  <option value="1">Có trích 2%</option>
                  <option value="0">Không trích</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Thời điểm trả lương &amp; tính thuế TNCN
                </label>
                <select
                  value={String(activeCompany.cfg.payLag)}
                  onChange={(ev) => {
                    const val = Number(ev.target.value);
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.payLag = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                >
                  <option value="0">Trả ngay trong tháng (lương T tính thuế tháng T)</option>
                  <option value="1">Trả đầu tháng sau (lương T tính thuế tháng T+1)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Miễn thuế làm thêm giờ
                </label>
                <select
                  value={activeCompany.cfg.otMode}
                  onChange={(ev) => {
                    const val = ev.target.value as 'chenh' | 'toanbo';
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.otMode = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                >
                  <option value="chenh">Miễn phần chênh lệch (50% / 100% / 200%)</option>
                  <option value="toanbo">Miễn toàn bộ tiền làm thêm (trong trần giờ)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Trần giờ làm thêm được miễn thuế / tháng
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={!canWriteAz}
                  value={activeCompany.cfg.otCap}
                  onChange={(ev) => {
                    const val = Math.max(0, num(ev.target.value) ?? 0);
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.otCap = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Mức ăn trưa miễn thuế trước 01/07/2026
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={!canWriteAz}
                  value={activeCompany.cfg.anTrua1}
                  onChange={(ev) => {
                    const val = Math.max(0, num(ev.target.value) ?? 0);
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.anTrua1 = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Mức ăn trưa miễn thuế từ 01/07/2026
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={!canWriteAz}
                  value={activeCompany.cfg.anTrua2}
                  onChange={(ev) => {
                    const val = Math.max(0, num(ev.target.value) ?? 0);
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.anTrua2 = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Ngưỡng khấu trừ 10% vãng lai trước 01/07/2026
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={!canWriteAz}
                  value={activeCompany.cfg.casualOld ?? 2000000}
                  onChange={(ev) => {
                    const val = Math.max(0, num(ev.target.value) ?? 0);
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.casualOld = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                  Ngưỡng khấu trừ 10% vãng lai từ 01/07/2026
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={!canWriteAz}
                  value={activeCompany.cfg.casualNew ?? 5000000}
                  onChange={(ev) => {
                    const val = Math.max(0, num(ev.target.value) ?? 0);
                    updateAzDb((draft) => {
                      const co = draft.companies[draft.active];
                      if (co) co.cfg.casualNew = val;
                      return draft;
                    }, true);
                  }}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem', boxSizing: 'border-box' }}
                />
              </div>
            </div>
          </div>

          {/* Khối 3: Các khoản phụ cấp */}
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Danh mục các khoản phụ cấp ({activeCompany.allowances.length})
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Cấu hình tính thuế TNCN, tính theo ngày công thực tế và cộng vào nền đóng BHXH
                </p>
              </div>
              <DomToolbarButton
                variant="primary"
                onClick={() => {
                  updateAzDb((draft) => {
                    const co = draft.companies[draft.active];
                    if (co) {
                      co.allowances.push({
                        id: 'pc_' + uid(),
                        name: 'Phụ cấp mới',
                        tax: 'chiu',
                        prorate: true,
                        bh: false
                      });
                    }
                    return draft;
                  }, true);
                }}
                icon={<Plus size={13} />}
              >
                Thêm khoản phụ cấp
              </DomToolbarButton>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Tên khoản phụ cấp</th>
                    <th style={{ padding: '8px 10px' }}>Thuế TNCN</th>
                    <th style={{ padding: '8px 10px' }}>Tính theo ngày công</th>
                    <th style={{ padding: '8px 10px' }}>Cộng vào lương đóng BHXH</th>
                    <th style={{ padding: '8px 10px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {activeCompany.allowances.map((a, idx) => (
                    <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 10px' }}>
                        <input
                          type="text"
                          value={a.name}
                          onChange={(ev) => {
                            const val = ev.target.value;
                            updateAzDb((draft) => {
                              const co = draft.companies[draft.active];
                              if (co && co.allowances[idx]) co.allowances[idx].name = val;
                              return draft;
                            }, true);
                          }}
                          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                        />
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <select
                          value={a.tax}
                          onChange={(ev) => {
                            const val = ev.target.value as 'chiu' | 'antrua' | 'mien';
                            updateAzDb((draft) => {
                              const co = draft.companies[draft.active];
                              if (co && co.allowances[idx]) co.allowances[idx].tax = val;
                              return draft;
                            }, true);
                          }}
                          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                        >
                          <option value="chiu">Chịu thuế TNCN</option>
                          <option value="antrua">Ăn trưa (miễn trong mức quy định)</option>
                          <option value="mien">Miễn thuế TNCN</option>
                        </select>
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={a.prorate}
                            onChange={(ev) => {
                              const val = ev.target.checked;
                              updateAzDb((draft) => {
                                const co = draft.companies[draft.active];
                                if (co && co.allowances[idx]) co.allowances[idx].prorate = val;
                                return draft;
                              }, true);
                            }}
                          />
                          <span>Theo công</span>
                        </label>
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={a.bh}
                            onChange={(ev) => {
                              const val = ev.target.checked;
                              updateAzDb((draft) => {
                                const co = draft.companies[draft.active];
                                if (co && co.allowances[idx]) co.allowances[idx].bh = val;
                                return draft;
                              }, true);
                            }}
                          />
                          <span>Đóng BHXH</span>
                        </label>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn outline sm"
                          disabled={!canWriteAz}
                          onClick={() => {
                            showConfirm({
                              title: `Xoá phụ cấp "${a.name}"`,
                              message: 'Bạn chắc chắn muốn xoá khoản phụ cấp này khỏi cấu hình công ty?',
                              confirmText: 'Xoá phụ cấp',
                              isDanger: true,
                              onConfirm: () => {
                                updateAzDb((draft) => {
                                  const co = draft.companies[draft.active];
                                  if (co) co.allowances.splice(idx, 1);
                                  return draft;
                                }, true);
                                toast.success(`Đã xoá phụ cấp "${a.name}"`);
                                closeConfirm();
                              }
                            });
                          }}
                          style={{ height: 26, padding: '0 8px', fontSize: '0.72rem', color: '#BD1D2D' }}
                        >
                          Xoá
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================================
          TAB 10: SAO LƯU & QUẢN LÝ ĐA CÔNG TY (CLOUD MYERP + JSON BACKUP + MULTI-COMPANY)
         ================================================================================= */}
      {activeSubtab === 'saoluu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                Đồng bộ Cloud MYERP &amp; Sao lưu dữ liệu (.json)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                Dữ liệu được lưu tự động trên cơ sở dữ liệu MySQL của MYERP và bộ nhớ trình duyệt. Bạn cũng có thể xuất file <code>.json</code> để lưu trữ độc lập.
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <DomToolbarButton
                variant="primary"
                disabled={syncingCloud}
                loading={syncingCloud}
                onClick={handleSaveAndSyncPayrollToMyerp}
                icon={<Save size={14} />}
              >
                Lưu &amp; Đồng bộ lên MYERP Cloud ngay
              </DomToolbarButton>

              <DomToolbarButton
                variant="outline"
                disabled={syncingCloud}
                onClick={() => handleSyncFromMyerp(false)}
                icon={<RefreshCw size={14} />}
              >
                Đồng bộ mới nhất từ Hồ sơ Nhân sự MYERP
              </DomToolbarButton>

              <DomToolbarButton
                variant="outline"
                onClick={() => {
                  downloadTextFile(
                    `Sao_luu_ke_toan_AZ_${iso(TODAY)}.json`,
                    JSON.stringify(azDb, null, 2),
                    'application/json;charset=utf-8'
                  );
                  toast.success('Đã xuất file sao lưu .json');
                }}
                icon={<Download size={14} />}
              >
                Xuất file sao lưu (.json)
              </DomToolbarButton>

              <DomToolbarButton
                variant="outline"
                onClick={() => backupJsonInputRef.current?.click()}
                icon={<Upload size={14} />}
              >
                Khôi phục từ file sao lưu (.json)
              </DomToolbarButton>
            </div>
          </div>

          <div className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                  Quản lý danh sách Công ty ({Object.keys(azDb.companies).length})
                </h3>
                <p style={{ margin: '3px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
                  Hỗ trợ kế toán dịch vụ / tập đoàn quản lý nhiều pháp nhân độc lập
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <DomToolbarButton
                  variant="primary"
                  disabled={!canWriteAz}
                  onClick={() => {
                    setNewCompanyName('');
                    setNewCompanyModalOpen(true);
                  }}
                  icon={<Plus size={14} />}
                >
                  Thêm công ty mới
                </DomToolbarButton>
                {import.meta.env.DEV && (
                  <DomToolbarButton
                    variant="outline"
                    disabled={!canWriteAz}
                    onClick={() => {
                      updateAzDb((draft) => {
                        const s = sampleCompany();
                        draft.companies[s.id] = s;
                        draft.active = s.id;
                        return draft;
                      }, true);
                      toast.success('Đã tạo Công ty mẫu (6 nhân viên minh hoạ — DEV)');
                    }}
                  >
                    + Tạo công ty mẫu (DEV)
                  </DomToolbarButton>
                )}
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '9px 12px' }}>Tên công ty</th>
                    <th style={{ padding: '9px 12px' }}>MST</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Số nhân viên</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Số tháng đã lập</th>
                    <th style={{ padding: '9px 12px' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(azDb.companies).map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '9px 12px', fontWeight: 700, color: '#0f172a' }}>
                        {c.info.tenNNT || '(Chưa đặt tên)'}{' '}
                        {c.id === activeCompany.id && (
                          <span
                            style={{
                              marginLeft: 6,
                              padding: '2px 8px',
                              borderRadius: 6,
                              background: '#fef2f2',
                              color: '#BD1D2D',
                              fontSize: '0.7rem',
                              fontWeight: 700
                            }}
                          >
                            Đang mở
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '9px 12px', fontFamily: 'JetBrains Mono, monospace' }}>{c.info.mst || '—'}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {c.employees?.length || 0}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                        {Object.keys(c.months || {}).length}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          {c.id !== activeCompany.id && (
                            <button
                              type="button"
                              className="btn outline sm"
                              onClick={() => {
                                updateAzDb((draft) => {
                                  draft.active = c.id;
                                  return draft;
                                }, true);
                              }}
                              style={{ height: 26, padding: '0 8px', fontSize: '0.72rem' }}
                            >
                              Mở
                            </button>
                          )}
                          {c.id !== 'myerp-primary' && Object.keys(azDb.companies).length > 1 && canWriteAz && (
                            <button
                              type="button"
                              className="btn outline sm"
                              onClick={() => {
                                showConfirm({
                                  title: `Xoá công ty "${c.info.tenNNT || c.id}"`,
                                  message: 'Toàn bộ nhân viên, hợp đồng và bảng lương của công ty phụ này sẽ bị xoá khỏi không gian làm việc.',
                                  confirmText: 'Xoá công ty',
                                  isDanger: true,
                                  onConfirm: () => {
                                    updateAzDb((draft) => {
                                      delete draft.companies[c.id];
                                      draft.active = Object.keys(draft.companies)[0];
                                      return draft;
                                    }, true);
                                    toast.success('Đã xoá công ty');
                                    closeConfirm();
                                  }
                                });
                              }}
                              style={{ height: 26, padding: '0 8px', fontSize: '0.72rem', color: '#BD1D2D' }}
                            >
                              Xoá
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================================
          MYERP EXECUTIVE TAB 11: BÁO CÁO P&L & DÒNG TIỀN
         ================================================================================= */}
      {activeSubtab === 'pnl_report' && (
        <AzPnlReportPanels
          selectedMonth={selectedMonth}
          financialData={financialData}
          payTotals={payTotals}
        />
      )}

      {/* =================================================================================
          MYERP EXECUTIVE TAB 12: SỔ NHẬT KÝ CHUNG (TT200/TT133)
         ================================================================================= */}
      {activeSubtab === 'journal' && (
        <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>
                Sổ nhật ký chung điện tử (TT200)
              </h3>
              <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                Tự động hạch toán kép toàn bộ lương 334, BHXH 338, thuế TNCN 3335, doanh thu 511 và chi phí 642 kỳ {selectedMonth}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <select
                value={journalFilterAcc}
                onChange={(e) => setJournalFilterAcc(e.target.value)}
                style={{
                  height: '36px',
                  padding: '0 10px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  background: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 600
                }}
              >
                <option value="all">Tất cả tài khoản kế toán</option>
                <option value="334">TK 334 (Phải trả NLĐ)</option>
                <option value="338">TK 338 (Bảo hiểm &amp; KPCĐ)</option>
                <option value="3335">TK 3335 (Thuế TNCN)</option>
                <option value="642">TK 642 (Chi phí QLDN)</option>
                <option value="112">TK 112 (Tiền gửi ngân hàng)</option>
                <option value="511">TK 511 (Doanh thu)</option>
              </select>

              <CleanSearchBox
                value={journalSearch}
                onChange={setJournalSearch}
                placeholder="Tìm số CT, diễn giải, TK..."
                width={210}
              />

              <DomToolbarButton
                variant="outline"
                onClick={() => {
                  if (!filteredJournalEntries.length) {
                    toast.error('Chưa có bút toán hạch toán phù hợp để xuất Excel');
                    return;
                  }
                  exportJournalExcel(
                    activeCompany,
                    filteredJournalEntries.map((e) => ({
                      date: e.date,
                      doc_no: e.doc_no,
                      description: e.desc,
                      debit_account: e.debit_acc,
                      credit_account: e.credit_acc,
                      amount: e.amount,
                      module: e.type
                    })),
                    `Kỳ ${ymLabel(selectedMonth)} · Tài khoản: ${journalFilterAcc}`
                  );
                  toast.success(`Đã xuất ${filteredJournalEntries.length} bút toán Sổ Nhật Ký Chung ra Excel!`);
                }}
                icon={<Download size={13} />}
              >
                Xuất Excel TT200
              </DomToolbarButton>
            </div>
          </div>

          {loading && journalEntries.length === 0 ? (
            <TableSkeleton rows={5} cols={7} />
          ) : filteredJournalEntries.length === 0 ? (
            <EmptyCard
              icon={<FileSpreadsheet size={24} />}
              title={`Chưa có bút toán TT200 kỳ ${ymLabel(selectedMonth)}`}
              description="Thay đổi bộ lọc tài khoản / từ khóa hoặc chốt bảng lương để sinh bút toán hạch toán."
            />
          ) : (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                    <th style={{ padding: '9px 12px', width: 40 }}>#</th>
                    <th style={{ padding: '9px 12px' }}>Ngày ghi sổ</th>
                    <th style={{ padding: '9px 12px' }}>Số chứng từ</th>
                    <th style={{ padding: '9px 12px' }}>Diễn giải nghiệp vụ</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>TK Nợ</th>
                    <th style={{ padding: '9px 12px', textAlign: 'center' }}>TK Có</th>
                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Số tiền (VNĐ)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJournalEntries.map((e, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 12px', color: '#64748b' }}>{idx + 1}</td>
                      <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{e.date}</td>
                      <td style={{ padding: '8px 12px', fontWeight: 700, color: '#0f172a' }}>{e.doc_no}</td>
                      <td style={{ padding: '8px 12px', color: '#0f172a' }}>{e.desc}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{ background: '#f1f5f9', color: '#0f172a', fontWeight: 700, padding: '2px 8px', borderRadius: 6, fontSize: '0.74rem' }}>
                          {e.debit_acc}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <span style={{ background: '#fef2f2', color: '#BD1D2D', fontWeight: 700, padding: '2px 8px', borderRadius: 6, fontSize: '0.74rem' }}>
                          {e.credit_acc}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                        {FMT(e.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {journalSummary && (
                  <tfoot>
                    {(() => {
                      const balanced =
                        Math.round(Number(journalSummary.total_debit || 0)) ===
                        Math.round(Number(journalSummary.total_credit || 0));
                      return (
                    <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                      <td colSpan={4} style={{ padding: '9px 12px', textAlign: 'right' }}>
                        TỔNG CỘNG ({filteredJournalEntries.length} BÚT TOÁN):
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: '#0f172a' }}>
                        Nợ: {FMT(journalSummary.total_debit)} đ
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center', color: '#BD1D2D' }}>
                        Có: {FMT(journalSummary.total_credit)} đ
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: balanced ? '#0f172a' : '#BD1D2D' }}>
                        {balanced ? 'Cân đối Nợ = Có' : 'Lệch cân đối Nợ/Có'}
                      </td>
                    </tr>
                      );
                    })()}
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          )}
        </div>
      )}

      {/* =================================================================================
          MYERP EXECUTIVE TAB 13: BỘ TÍNH LƯƠNG GROSS ⇄ NET & CHẾ ĐỘ THAI SẢN / THÔI VIỆC
         ================================================================================= */}
      {activeSubtab === 'calculator' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '1.25rem' }}>
            <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                Mô Phỏng Lương Gross ⇄ Net 3 Chiều (2025 / 2026)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  className={simMode === 'gross_to_net' ? 'btn primary sm' : 'btn outline sm'}
                  onClick={() => setSimMode('gross_to_net')}
                  style={{ height: 34, fontWeight: 700 }}
                >
                  Từ GROSS sang NET
                </button>
                <button
                  type="button"
                  className={simMode === 'net_to_gross' ? 'btn primary sm' : 'btn outline sm'}
                  onClick={() => setSimMode('net_to_gross')}
                  style={{ height: 34, fontWeight: 700 }}
                >
                  Từ NET sang GROSS
                </button>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, marginBottom: 4 }}>
                  {simMode === 'gross_to_net' ? 'Mức lương Gross (VNĐ):' : 'Mức lương Net mong muốn (VNĐ):'}
                </label>
                <input
                  type="number"
                  min={0}
                  value={simSalary}
                  onChange={(e) => setSimSalary(Math.max(0, Number(e.target.value) || 0))}
                  step="500000"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontWeight: 700, boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, marginBottom: 4 }}>Người phụ thuộc</label>
                  <input
                    type="number"
                    min="0"
                    value={simDependents}
                    onChange={(e) => setSimDependents(Math.max(0, parseInt(e.target.value) || 0))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, marginBottom: 4 }}>Vùng</label>
                  <select
                    value={simRegion}
                    onChange={(e) => setSimRegion(Number(e.target.value))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  >
                    <option value={1}>Vùng I</option>
                    <option value={2}>Vùng II</option>
                    <option value={3}>Vùng III</option>
                    <option value={4}>Vùng IV</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, marginBottom: 4 }}>Quy chuẩn</label>
                  <select
                    value={simYear}
                    onChange={(e) => setSimYear(Number(e.target.value))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  >
                    <option value={2025}>2025 (11M/4.4M)</option>
                    <option value={2026}>2026 (15.5M/6.2M)</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, marginBottom: 4 }}>Loại hợp đồng</label>
                  <select
                    value={simContractType}
                    onChange={(e) => setSimContractType(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1' }}
                  >
                    <option value="labour_resident">HĐLĐ cư trú (Lũy tiến)</option>
                    <option value="probation_casual">Thử việc / Vãng lai (10%)</option>
                    <option value="non_resident">Không cư trú (20%)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, marginBottom: 4 }}>PC ăn trưa (đ)</label>
                  <input
                    type="number"
                    min={0}
                    value={simMeal}
                    onChange={(e) => setSimMeal(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, marginBottom: 4 }}>PC điện thoại (đ)</label>
                  <input
                    type="number"
                    min={0}
                    value={simPhone}
                    onChange={(e) => setSimPhone(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 600, marginBottom: 4 }}>PC xăng xe / đi lại (đ)</label>
                  <input
                    type="number"
                    min={0}
                    value={simTravel}
                    onChange={(e) => setSimTravel(Math.max(0, Number(e.target.value) || 0))}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '14px' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={simHasInsurance} onChange={(e) => setSimHasInsurance(e.target.checked)} />
                  Đóng BHXH bắt buộc
                </label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={simHasUnion} onChange={(e) => setSimHasUnion(e.target.checked)} />
                  Đoàn viên công đoàn (1%)
                </label>
              </div>
              <button
                type="button"
                onClick={handleSimulate}
                disabled={simulating}
                className="btn primary"
                style={{ height: 36, fontWeight: 700 }}
              >
                <Calculator size={14} />
                <span>Tính toán chi tiết 3 chiều</span>
              </button>
            </div>

            <div className="card" style={{ padding: '1.35rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 800, color: '#0f172a' }}>
                Kết Quả Bóc Tách Lương, Bảo Hiểm &amp; Thuế TNCN
              </h3>
              {simResult ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>LƯƠNG GROSS</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', fontFamily: 'JetBrains Mono, monospace' }}>
                        {FMT(simResult.gross)} đ
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 10, background: '#ffffff', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#BD1D2D' }}>THỰC LĨNH NET</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#BD1D2D', fontFamily: 'JetBrains Mono, monospace' }}>
                        {FMT(simResult.net)} đ
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, border: '1px solid #e2e8f0', fontSize: '0.78rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>BHXH (8%) + BHYT (1.5%) + BHTN (1%):</span>
                      <strong>{FMT(simResult.insurance_nld?.total)} đ</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>Thu nhập tính thuế (TNTT):</span>
                      <strong>{FMT(simResult.tax?.tntt)} đ</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#BD1D2D', fontWeight: 700 }}>
                      <span>Thuế TNCN ({simResult.tax?.method}):</span>
                      <span>{FMT(simResult.tax?.pit)} đ</span>
                    </div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, color: '#0f172a' }}>
                      <span>Tổng chi phí Doanh nghiệp (gồm 23.5% BHXH/KPCĐ):</span>
                      <span>{FMT(simResult.employer_total_cost)} đ</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Máy tính chế độ Thai sản / Thôi việc */}
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '4px' }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
                  Máy Tính Chế Độ Thai Sản / Trợ Cấp Thôi Việc (Điều 46, 47 BLLĐ)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 8 }}>
                  <select
                    value={benefitType}
                    onChange={(e) => setBenefitType(e.target.value as any)}
                    style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.76rem', fontWeight: 600 }}
                  >
                    <option value="maternity">Chế độ Thai sản (6 tháng + 2 LCS)</option>
                    <option value="severance">Trợ cấp thôi việc (Điều 46 BLLĐ)</option>
                    <option value="job_loss">Trợ cấp mất việc làm (Điều 47 BLLĐ)</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={benefitAvgSalary}
                    onChange={(e) => setBenefitAvgSalary(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Lương BQ 6 tháng"
                    style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.76rem' }}
                  />
                </div>
                {benefitType !== 'maternity' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: 8 }}>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={benefitWorkYears}
                      onChange={(e) => setBenefitWorkYears(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="Số năm làm việc"
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.76rem' }}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={benefitUnempYears}
                      onChange={(e) => setBenefitUnempYears(Math.max(0, Number(e.target.value) || 0))}
                      placeholder="Số năm đóng BHTN"
                      style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.76rem' }}
                    />
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <button type="button" className="btn outline sm" onClick={handleCalculateBenefit} style={{ height: 30, fontSize: '0.75rem' }}>
                    Tính chế độ
                  </button>
                  {benefitResult && (
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#BD1D2D', fontFamily: 'JetBrains Mono, monospace' }}>
                      Mức hưởng: {FMT(benefitResult.total_benefit || benefitResult.total_allowance)} đ
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================================
          MODAL 1: THÊM / SỬA NHÂN VIÊN (PORTALED + ESCAPE + Z-INDEX + NON-NEGATIVE)
         ================================================================================= */}
      {editingEmpModal &&
        createPortal(
          <div
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setEditingEmpModal(null);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              zIndex: zModalNested,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              transition: `opacity ${drawerMs}ms ${motionCurve}`
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                maxWidth: 880,
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '20px 24px',
                boxShadow: '0 24px 60px rgba(15,23,42,0.25)',
                transition: `transform ${drawerMs}ms ${motionCurve}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                  {editingEmpModal.isNew ? 'Thêm nhân viên mới' : `Hồ sơ nhân viên: ${editingEmpModal.emp.ten}`}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingEmpModal(null)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>

              {EMP_FIELDS.map(([grp, fields]) => (
                <div key={grp} style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      color: '#0f172a',
                      paddingBottom: 6,
                      marginBottom: 10,
                      borderBottom: '1px solid #e2e8f0'
                    }}
                  >
                    {grp}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                    {fields.map(([k, lb, cls, tp]) => {
                      const val = editingEmpModal.emp[k] ?? '';
                      return (
                        <div key={k} style={{ gridColumn: cls === 'wide' ? '1 / -1' : 'span 1' }}>
                          <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                            {lb}
                          </label>
                          {Array.isArray(tp) ? (
                            <select
                              value={String(val)}
                              onChange={(ev) => {
                                const v = ev.target.value;
                                setEditingEmpModal((prev) =>
                                  prev ? { ...prev, emp: { ...prev.emp, [k]: v } } : null
                                );
                              }}
                              style={{ width: '100%', padding: '7px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.78rem' }}
                            >
                              {tp.map((o: string) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : tp === 'date' ? (
                            <VietnameseDateInput
                              size="sm"
                              value={val || ''}
                              onChange={(v) =>
                                setEditingEmpModal((prev) =>
                                  prev ? { ...prev, emp: { ...prev.emp, [k]: v } } : null
                                )
                              }
                              placeholder="dd/mm/yyyy"
                            />
                          ) : (
                            <input
                              type={tp === 'money' || tp === 'number' ? 'number' : 'text'}
                              min={tp === 'money' || tp === 'number' ? 0 : undefined}
                              value={val || ''}
                              onChange={(ev) => {
                                const raw = ev.target.value;
                                const v =
                                  tp === 'money' || tp === 'number' ? Math.max(0, num(raw) || 0) : raw;
                                setEditingEmpModal((prev) =>
                                  prev ? { ...prev, emp: { ...prev.emp, [k]: v } } : null
                                );
                              }}
                              style={{
                                width: '100%',
                                padding: '7px 10px',
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                fontSize: '0.78rem',
                                boxSizing: 'border-box'
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Phụ cấp hằng tháng động */}
              <div style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 800,
                    color: '#0f172a',
                    paddingBottom: 6,
                    marginBottom: 10,
                    borderBottom: '1px solid #e2e8f0'
                  }}
                >
                  Phụ cấp hằng tháng
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
                  {activeCompany.allowances.map((a) => (
                    <div key={a.id}>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                        {a.name}{' '}
                        <span style={{ fontWeight: 400, color: '#94a3b8' }}>
                          ({a.tax === 'mien' ? 'miễn thuế' : a.tax === 'antrua' ? 'ăn trưa' : 'chịu thuế'})
                        </span>
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={editingEmpModal.emp.pc?.[a.id] || ''}
                        placeholder="0"
                        onChange={(ev) => {
                          const val = Math.max(0, num(ev.target.value) || 0);
                          setEditingEmpModal((prev) => {
                            if (!prev) return null;
                            const nextPc = { ...(prev.emp.pc || {}) };
                            if (val > 0) nextPc[a.id] = val;
                            else delete nextPc[a.id];
                            return { ...prev, emp: { ...prev.emp, pc: nextPc } };
                          });
                        }}
                        style={{
                          width: '100%',
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: '1px solid #cbd5e1',
                          fontSize: '0.78rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 12,
                  borderTop: '1px solid #e2e8f0'
                }}
              >
                <div>
                  {!editingEmpModal.isNew && (
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={handleDeleteEmployeeModal}
                      style={{ color: '#BD1D2D', borderColor: '#fecaca', height: 34, padding: '0 12px' }}
                    >
                      <Trash2 size={14} />
                      <span>Nghỉ việc / Xoá</span>
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn outline sm"
                    onClick={() => setEditingEmpModal(null)}
                    style={{ height: 34, padding: '0 14px' }}
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    className="btn primary sm"
                    onClick={handleSaveEmployeeModal}
                    style={{ height: 34, padding: '0 16px', fontWeight: 700 }}
                  >
                    Lưu hồ sơ
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* =================================================================================
          MODAL 2: THÊM / SỬA HỢP ĐỒNG LAO ĐỘNG (PORTALED + ESCAPE)
         ================================================================================= */}
      {editingCtModal &&
        createPortal(
          <div
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setEditingCtModal(null);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              zIndex: zModalNested,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              transition: `opacity ${drawerMs}ms ${motionCurve}`
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                maxWidth: 640,
                width: '100%',
                padding: '20px 24px',
                boxShadow: '0 24px 60px rgba(15,23,42,0.25)',
                transition: `transform ${drawerMs}ms ${motionCurve}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  {editingCtModal.isNew ? 'Thêm / Gia hạn hợp đồng lao động' : 'Sửa hợp đồng lao động'}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingCtModal(null)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Nhân viên
                  </label>
                  <select
                    value={editingCtModal.ct.empId}
                    onChange={(ev) => {
                      const empId = ev.target.value;
                      setEditingCtModal((prev) => (prev ? { ...prev, ct: { ...prev.ct, empId } } : null));
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                  >
                    {activeCompany.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.ten} ({e.ma || '—'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Loại hợp đồng
                  </label>
                  <select
                    value={editingCtModal.ct.loai}
                    onChange={(ev) => {
                      const loai = ev.target.value as AzContract['loai'];
                      setEditingCtModal((prev) =>
                        prev ? { ...prev, ct: { ...prev.ct, loai, den: loai === 'KXD' ? '' : prev.ct.den } } : null
                      );
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.8rem' }}
                  >
                    {Object.entries(CT_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Số hợp đồng
                  </label>
                  <input
                    type="text"
                    value={editingCtModal.ct.so}
                    placeholder="VD: 01/2026/HĐLĐ"
                    onChange={(ev) => {
                      const so = ev.target.value;
                      setEditingCtModal((prev) => (prev ? { ...prev, ct: { ...prev.ct, so } } : null));
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Hiệu lực từ ngày
                  </label>
                  <VietnameseDateInput
                    size="sm"
                    value={editingCtModal.ct.tu}
                    onChange={(tu) => {
                      setEditingCtModal((prev) => (prev ? { ...prev, ct: { ...prev.ct, tu } } : null));
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Đến ngày (để trống nếu không thời hạn)
                  </label>
                  <VietnameseDateInput
                    size="sm"
                    value={editingCtModal.ct.den}
                    disabled={editingCtModal.ct.loai === 'KXD'}
                    onChange={(den) => {
                      setEditingCtModal((prev) => (prev ? { ...prev, ct: { ...prev.ct, den } } : null));
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Mức lương theo hợp đồng
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editingCtModal.ct.luong}
                    onChange={(ev) => {
                      const luong = Math.max(0, num(ev.target.value) || 0);
                      setEditingCtModal((prev) => (prev ? { ...prev, ct: { ...prev.ct, luong } } : null));
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editingCtModal.updateSalary}
                      onChange={(ev) => {
                        const updateSalary = ev.target.checked;
                        setEditingCtModal((prev) => (prev ? { ...prev, updateSalary } : null));
                      }}
                    />
                    <span>Cập nhật làm Lương cơ bản của nhân viên</span>
                  </label>
                </div>

                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', fontSize: '0.73rem', fontWeight: 700, color: '#475569', marginBottom: 4 }}>
                    Ghi chú
                  </label>
                  <input
                    type="text"
                    value={editingCtModal.ct.ghiChu}
                    onChange={(ev) => {
                      const ghiChu = ev.target.value;
                      setEditingCtModal((prev) => (prev ? { ...prev, ct: { ...prev.ct, ghiChu } } : null));
                    }}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.8rem', boxSizing: 'border-box' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => setEditingCtModal(null)}
                  style={{ height: 34, padding: '0 14px' }}
                >
                  Đóng
                </button>
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={handleSaveContractModal}
                  style={{ height: 34, padding: '0 16px', fontWeight: 700 }}
                >
                  Lưu hợp đồng
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* =================================================================================
          MODAL 3: PHIẾU LƯƠNG CHI TIẾT NHÂN VIÊN (PORTALED + PRINT + STRING SAFE)
         ================================================================================= */}
      {viewingSlipRow &&
        createPortal(
          <div
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setViewingSlipRow(null);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              zIndex: zModalNested,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              transition: `opacity ${drawerMs}ms ${motionCurve}`
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                maxWidth: 640,
                width: '100%',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '20px 24px',
                boxShadow: '0 24px 60px rgba(15,23,42,0.25)',
                transition: `transform ${drawerMs}ms ${motionCurve}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800, color: '#0f172a' }}>
                  Phiếu lương tháng {ymLabel(viewingSlipRow.k)} — {viewingSlipRow.e.ten}
                </h3>
                <button
                  type="button"
                  onClick={() => setViewingSlipRow(null)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: 12 }}>
                Mã NV: {viewingSlipRow.e.ma || '—'} · Chức vụ: {viewingSlipRow.e.viTri || '—'} · MST:{' '}
                {viewingSlipRow.e.mst || '—'} · STK: {viewingSlipRow.e.stk || '—'} ({viewingSlipRow.e.nh || '—'})
              </div>

              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <tbody>
                    {slipLines(viewingSlipRow).map((x, idx) => {
                      if (x[0] === 'h') {
                        return (
                          <tr key={idx} style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <td colSpan={2} style={{ padding: '7px 12px', fontWeight: 800, color: '#0f172a' }}>
                              {x[1]}
                            </td>
                          </tr>
                        );
                      }
                      if (x[0] === 'tot') {
                        return (
                          <tr key={idx} style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 800 }}>
                            <td style={{ padding: '8px 12px', color: '#0f172a' }}>{x[1]}</td>
                            <td
                              style={{
                                padding: '8px 12px',
                                textAlign: 'right',
                                fontFamily: 'JetBrains Mono, monospace',
                                color: x[1] === 'Thực lĩnh' ? '#BD1D2D' : '#0f172a'
                              }}
                            >
                              {fmt(x[2])} đ
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '7px 12px', color: '#334155' }}>{x[0]}</td>
                          <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            {typeof x[1] === 'number' ? `${fmt(x[1])} đ` : String(x[1] ?? '')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => handlePrintPayslip(viewingSlipRow)}
                  style={{ height: 34, padding: '0 14px', fontWeight: 600 }}
                >
                  <Printer size={14} />
                  <span>In / PDF Phiếu lương</span>
                </button>
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={() => setViewingSlipRow(null)}
                  style={{ height: 34, padding: '0 16px', fontWeight: 700 }}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* =================================================================================
          MODAL 4: THÊM CÔNG TY MỚI (PORTALED + X CLOSE + ESCAPE + DRAFT SAVE ONLY)
         ================================================================================= */}
      {newCompanyModalOpen &&
        createPortal(
          <div
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setNewCompanyModalOpen(false);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              zIndex: zModalNested,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              transition: `opacity ${drawerMs}ms ${motionCurve}`
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                maxWidth: 460,
                width: '100%',
                padding: '20px 24px',
                boxShadow: '0 24px 60px rgba(15,23,42,0.25)',
                transition: `transform ${drawerMs}ms ${motionCurve}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                  Thêm công ty mới
                </h3>
                <button
                  type="button"
                  onClick={() => setNewCompanyModalOpen(false)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Tên doanh nghiệp
              </label>
              <input
                type="text"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="VD: CÔNG TY TNHH ABC"
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: '0.84rem',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => setNewCompanyModalOpen(false)}
                  style={{ height: 34, padding: '0 14px' }}
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  className="btn primary sm"
                  onClick={() => {
                    if (!newCompanyName.trim() || inFlightRef.current) {
                      if (!newCompanyName.trim()) toast.error('Vui lòng nhập tên doanh nghiệp');
                      return;
                    }
                    inFlightRef.current = true;
                    try {
                      const c = newCompany(newCompanyName.trim(), statutoryConfig);
                      updateAzDb((draft) => {
                        draft.companies[c.id] = c;
                        draft.active = c.id;
                        return draft;
                      }, true);
                      setNewCompanyModalOpen(false);
                      setActiveSubtab('congty');
                      toast.success(`Đã tạo công ty: ${newCompanyName.trim()}`);
                    } finally {
                      inFlightRef.current = false;
                    }
                  }}
                  style={{ height: 34, padding: '0 16px', fontWeight: 700 }}
                >
                  Tạo công ty
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* =================================================================================
          MODAL 5: XEM TRƯỚC IMPORT NHÂN VIÊN EXCEL (DIFF PREVIEW + VALIDATION)
         ================================================================================= */}
      {importPreviewModal &&
        createPortal(
          <div
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setImportPreviewModal(null);
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.5)',
              zIndex: zModalNested,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 16,
              transition: `opacity ${drawerMs}ms ${motionCurve}`
            }}
          >
            <div
              style={{
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #e2e8f0',
                maxWidth: 780,
                width: '100%',
                maxHeight: '88vh',
                display: 'flex',
                flexDirection: 'column',
                padding: '20px 24px',
                boxShadow: '0 24px 60px rgba(15,23,42,0.25)',
                transition: `transform ${drawerMs}ms ${motionCurve}`
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    Xem trước nhập Excel: {importPreviewModal.filename}
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: '0.76rem', color: '#64748b' }}>
                    Thêm mới: <strong>{importPreviewModal.rows.filter((r) => r.action === 'add').length}</strong> · Cập nhật:{' '}
                    <strong>{importPreviewModal.rows.filter((r) => r.action === 'update').length}</strong> · Bỏ qua lỗi:{' '}
                    <strong style={{ color: '#BD1D2D' }}>
                      {importPreviewModal.rows.filter((r) => r.action === 'skip').length}
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setImportPreviewModal(null)}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}
                  aria-label="Đóng"
                >
                  <X size={20} />
                </button>
              </div>

              {importPreviewModal.warnings.length > 0 && (
                <div
                  style={{
                    padding: '8px 12px',
                    marginBottom: 10,
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#BD1D2D',
                    fontSize: '0.76rem'
                  }}
                >
                  {importPreviewModal.warnings.slice(0, 5).map((w, idx) => (
                    <div key={idx}>• {w}</div>
                  ))}
                </div>
              )}

              <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                      <th style={{ padding: '7px 10px' }}>Dòng</th>
                      <th style={{ padding: '7px 10px' }}>Họ và tên</th>
                      <th style={{ padding: '7px 10px' }}>Mã / CCCD / MST</th>
                      <th style={{ padding: '7px 10px', textAlign: 'right' }}>Lương CB</th>
                      <th style={{ padding: '7px 10px' }}>Hành động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importPreviewModal.rows.slice(0, 100).map((r) => (
                      <tr key={r.rowNum} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', color: '#64748b' }}>#{r.rowNum}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 700, color: '#0f172a' }}>{r.ten}</td>
                        <td style={{ padding: '6px 10px', fontFamily: 'JetBrains Mono, monospace' }}>
                          {[r.ma, r.cccd, r.mst].filter(Boolean).join(' · ') || '—'}
                        </td>
                        <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                          {fmt(r.luongCB)}
                        </td>
                        <td style={{ padding: '6px 10px' }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: 6,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              background: r.action === 'skip' ? '#fef2f2' : '#f1f5f9',
                              color: r.action === 'skip' ? '#BD1D2D' : '#0f172a'
                            }}
                          >
                            {r.action === 'add' ? 'Thêm mới' : r.action === 'update' ? 'Cập nhật' : 'Bỏ qua'}
                          </span>
                          {r.reason && <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>{r.reason}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => setImportPreviewModal(null)}
                  style={{ height: 34, padding: '0 14px' }}
                >
                  Huỷ
                </button>
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={!importPreviewModal.rows.some((r) => r.action !== 'skip')}
                  onClick={handleConfirmImportEmployees}
                  style={{ height: 34, padding: '0 16px', fontWeight: 700 }}
                >
                  Xác nhận nhập ({importPreviewModal.rows.filter((r) => r.action !== 'skip').length} dòng)
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default HrmAccountingAzWorkspace;
