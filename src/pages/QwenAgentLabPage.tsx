import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Send,
  Sparkles,
  Cpu,
  Zap,
  ShieldCheck,
  Trash2,
  KeyRound,
  Terminal,
  Database,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Layers,
  Sliders,
  Brain,
  Play,
  Briefcase,
  X,
  Info,
  Target,
  DollarSign,
  Clock,
  ClipboardList,
  PenTool,
  Trophy,
  Package,
  Square,
  BarChart3,
  Activity,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { parseAllChatTags } from '../components/chat/chatTagParsers';
import { ChatDynamicChart } from '../components/chat/ChatDynamicChart';
import { ChatSmartErpCard } from '../components/chat/ChatSmartErpCard';
import { ActionProposalCard } from '../components/chat/ActionProposalCard';
import { NextBestActionChips } from '../components/chat/NextBestActionChips';
import { ProactiveInsightCard } from '../components/chat/ProactiveInsightCard';
import { ChatErpCardModal } from '../components/chat/ChatErpCardModal';
import { AgentDetailModal } from '../components/chat/AgentDetailModal';
import { CustomModal } from '../components/ui/CustomModal';
import { SPECIALIZED_AGENTS, type SpecializedAgent } from '../constants/aiAgents';
import { downloadExportFile } from '../utils/exportHelper';
import { useUIStore } from '../store/uiStore';
import { useAuth } from '../contexts/AuthContext';
import { useTypedSubSetting } from '../contexts/SettingsBootstrapContext';
import { isSystemAdmin, isExecutive } from '../utils/roleUtils';
import { ensureArray } from '../utils/safeArray';
import type { ErpEntitySearchResult } from '../types/chat';
import '../components/Dashboard/DomationDashboard.css';
import {
  DomKpiTile,
  DomPanelCard,
  DomChartTooltip,
  DomSegmentedSwitch,
  DomEmptyChartState,
  DomToolbarButton,
} from '../components/Dashboard/DomationDashboardKit';

interface ExecutedStep {
  tool: string;
  args: Record<string, any>;
  latency_ms: number;
  summary: string;
  has_error?: boolean;
}

interface TelemetryData {
  model: string;
  provider?: string;
  turns_used: number;
  tools_loaded_count?: number;
  tools_called_count?: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  groq_time_ms?: number;
  total_wall_ms?: number;
  tokens_per_second?: number;
  rag_matched_count?: number;
}

interface CollaboratingAgent {
  id: string;
  badge: string;
  focus: string;
}

interface LabMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  model?: string;
  reasoning_trace?: string;
  collaborating_agents?: CollaboratingAgent[];
  executed_steps?: ExecutedStep[];
  telemetry?: TelemetryData;
  attached_entity?: ErpEntitySearchResult | null;
}

interface ServerTelemetrySummary {
  total_queries: number;
  avg_latency_ms: number;
  total_proposals: number;
  total_fallbacks: number;
  total_gaps: number;
  erp_grounded_queries: number;
  accuracy_rate_pct: number;
}

interface ServerTelemetryData {
  scope?: 'tenant' | 'personal';
  days?: number;
  summary?: ServerTelemetrySummary;
  top_tools?: { tool_name: string; count: number }[];
  top_agents?: { agent_name: string; count: number }[];
  daily_trend?: { date: string; queries: number; gaps: number; avg_latency_ms: number }[];
}

interface StatusInfo {
  has_key: boolean;
  masked_key: string;
  active_model: string;
  engine: string;
  available_models: {
    id: string;
    name?: string;
    label?: string;
    context_window: number;
    badge: string;
  }[];
  total_tools: number;
  tool_names: string[];
  telemetry?: ServerTelemetryData;
}

const SLASH_COMMANDS = [
  {
    command: '/lead',
    label: 'Truy vấn CRM Leads đa tầng',
    description: 'Lọc học viên theo chương trình, giai đoạn, tiền cọc & nguồn',
    icon: <Target size={14} />,
    template: 'Lọc dữ liệu học viên chương trình MBA theo giai đoạn và tiền cọc',
  },
  {
    command: '/po',
    label: 'Phân tích Chi phí & PO',
    description: 'Bóc tách chi phí, đề xuất PO, trễ hạn & ngân sách phòng ban',
    icon: <DollarSign size={14} />,
    template: 'Phân tích chi phí và đề xuất ngân sách tháng này, kiểm tra khoản trễ hạn',
  },
  {
    command: '/chamcong',
    label: 'Tình hình chấm công hôm nay',
    description: 'Xem ai có mặt tại văn phòng, ai WFH, ai chưa check-in',
    icon: <Clock size={14} />,
    template: 'Tình hình đi làm và chấm công hôm nay thế nào?',
  },
  {
    command: '/viec',
    label: 'Công việc & Deadline của tôi',
    description: 'Xem các task đang mở, việc trễ hạn hoặc sắp tới hạn',
    icon: <ClipboardList size={14} />,
    template: 'Xem các công việc của tôi đang mở hoặc sắp trễ hạn',
  },
  {
    command: '/duyet',
    label: 'Đơn từ & Đề xuất chờ duyệt',
    description: 'Kiểm tra phiếu nghỉ phép, tạm ứng, PO đang chờ duyệt',
    icon: <PenTool size={14} />,
    template: 'Kiểm tra các đơn và đề xuất đang chờ phê duyệt',
  },
  {
    command: '/leaderboard',
    label: 'Bảng xếp hạng Doanh số Sale',
    description: 'Xem xếp hạng doanh số tư vấn tuyển sinh tháng này',
    icon: <Trophy size={14} />,
    template: 'Bảng xếp hạng doanh số sale tháng này',
  },
  {
    command: '/kho',
    label: 'Cảnh báo tồn kho & Quà tặng',
    description: 'Kiểm tra vật phẩm tuyển sinh sắp hết hàng',
    icon: <Package size={14} />,
    template: 'Kiểm tra cảnh báo tồn kho và quà phẩm tuyển sinh',
  },
  {
    command: '/clear',
    label: 'Làm sạch cửa sổ trò chuyện',
    description: 'Xóa lịch sử tin nhắn tạm thời để bắt đầu chủ đề mới',
    icon: <Trash2 size={14} />,
    template: 'CLEAR_ACTION',
  },
];

const TEST_PROMPTS = [
  {
    category: 'Điều hành & Ban Giám đốc',
    title: 'Bức tranh toàn cảnh 360° toàn viện',
    prompt: 'Tổng hợp bức tranh điều hành toàn viện tháng này: số lượng Lead mới, doanh thu đặt cọc thực thu, chi phí PO và tỷ lệ chuyển đổi.',
    agentId: 'executive_bi',
  },
  {
    category: 'CRM & Tuyển sinh',
    title: 'Phân tích Lead MBA/DBA & Xuất Excel',
    prompt: 'Thống kê khách hàng tiềm năng quan tâm chương trình MBA và DBA trong tháng này theo nguồn và giai đoạn, kèm biểu đồ và link xuất Excel.',
    agentId: 'sales',
  },
  {
    category: 'Tài chính & Kế toán',
    title: 'Đối soát thu chi PO / SO & Đặt cọc',
    prompt: 'Phân tích tổng quan thu chi tài chính tháng này, liệt kê các khoản đặt cọc (SO) gần đây và các đề xuất chi (PO) đang chờ duyệt.',
    agentId: 'finance',
  },
  {
    category: 'Nhân sự & Chấm công',
    title: 'Kiểm tra chấm công & Lịch nghỉ phép',
    prompt: 'Tra cứu tình hình nhân sự, tổng hợp chấm công tháng này và danh sách nhân viên nghỉ phép hôm nay.',
    agentId: 'hrm',
  },
  {
    category: 'Công việc & Bàn làm việc',
    title: 'Rà soát Task quá hạn & Việc hôm nay',
    prompt: 'Kiểm tra danh sách công việc trên bàn làm việc của tôi đang đến hạn hôm nay hoặc đang quá hạn cần xử lý ngay.',
    agentId: 'tasks',
  },
  {
    category: 'Marketing & Nguồn Lead',
    title: 'Hiệu quả nguồn Lead & Chiến dịch Tuyển sinh',
    prompt: 'Phân tích hiệu quả các chiến dịch tuyển sinh, chi phí CPL/CAC và danh sách Lead nóng tương tác cao.',
    agentId: 'marketing_campaigns',
  },
];

const buildStorageKey = (tenantId?: number | string, userId?: number | string) =>
  `myerp_gemini_agent_lab_messages_v2_${tenantId || 1}_${userId || 'anon'}`;

const createDefaultWelcomeMessage = (model = 'gemini-3.5-flash-lite', totalTools = 0): LabMessage => ({
  id: 'welcome_gemini',
  role: 'assistant',
  content:
    'Xin chào. Tôi là **SI IDEAS × Gemini 3.5 Flash Lite**.\n\n' +
    `Tôi được tích hợp đầy đủ cơ chế **Multi-Agent Swarm**, **${totalTools || 'đầy đủ'} Công cụ Nghiệp vụ (\`AgentToolRegistry\`)**, **Trí nhớ Làm việc 2 Tầng & Ngữ cảnh Thực thể 48h**, **Cảnh báo Rủi ro Chủ động (\`Proactive Insight\`)**, **Đề xuất Hành động 1-Click (\`Action Proposal\`)**, **Lệnh tắt \`/\` (Slash Commands)** và **Đính kèm Hồ sơ ERP (\`#\`)**. Bạn có thể chọn kịch bản bên trái hoặc nhập câu hỏi bất kỳ.`,
  timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  model,
  collaborating_agents: [
    {
      id: 'master',
      badge: 'SI IDEAS (Gemini 3.5 Flash Lite • Full Access)',
      focus: 'Điều phối viên trung tâm kết nối công cụ ERP & MySQL thực tế.',
    },
  ],
});

const formatModelLabel = (modelId?: string): string => {
  if (!modelId || modelId === 'gemini-3.5-flash-lite') return 'Gemini 3.5 Flash Lite';
  return modelId;
};

const isSafeMarkdownUrl = (rawHref?: string): boolean => {
  if (!rawHref || typeof rawHref !== 'string') return false;
  const trimmed = rawHref.trim();
  if (!trimmed) return false;
  if (/^(javascript|vbscript|data):/i.test(trimmed)) return false;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  return /^(https?:\/\/|mailto:|tel:)/i.test(trimmed);
};

interface SessionAnalyticsSummary {
  turnCount: number;
  totalTokens: number;
  totalPrompt: number;
  totalCompletion: number;
  avgTokPerSec: number;
  avgWallMs: number;
  avgLoops: string;
  totalToolCalls: number;
  failedToolCalls: number;
  uniqueToolsCount: number;
  successRatePct: number;
  toolLatencyData: { name: string; avgLatencyMs: number; calls: number }[];
  turnSeries: { turn: string; promptTokens: number; completionTokens: number; wallMs: number }[];
}

interface QwenTelemetryTabProps {
  sessionAnalytics: SessionAnalyticsSummary;
  selectedModel: string;
  maxTokens: number;
  totalTools: number;
  serverTelemetry?: ServerTelemetryData;
  onBackToChat: () => void;
}

const QwenTelemetryTab: React.FC<QwenTelemetryTabProps> = React.memo(({
  sessionAnalytics,
  selectedModel,
  maxTokens,
  totalTools,
  serverTelemetry,
  onBackToChat,
}) => {
  const dailyTrendSlice = useMemo(
    () => ensureArray(serverTelemetry?.daily_trend).slice(-14),
    [serverTelemetry?.daily_trend]
  );

  const topToolsChartData = useMemo(
    () =>
      ensureArray(serverTelemetry?.top_tools).map((item) => ({
        name: item.tool_name.length > 18 ? `${item.tool_name.slice(0, 16)}..` : item.tool_name,
        count: item.count,
      })),
    [serverTelemetry?.top_tools]
  );

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="dashboard-kpi-grid">
        <DomKpiTile
          label="LƯỢT TRUY VẤN (TURNS)"
          value={sessionAnalytics.turnCount}
          accent="brand"
          icon={<Activity size={16} />}
          breakdown={
            <>
              <span>• Tool Loop TB: <strong style={{ color: '#0f172a' }}>{sessionAnalytics.avgLoops} vòng/lượt</strong></span>
              <span>• Mô hình: <strong style={{ color: '#0f172a' }}>{formatModelLabel(selectedModel)}</strong></span>
            </>
          }
        />
        <DomKpiTile
          label="TỔNG TOKEN TIÊU THỤ"
          value={sessionAnalytics.totalTokens.toLocaleString('vi-VN')}
          accent="brand"
          valueTone="brand"
          icon={<Zap size={16} />}
          breakdown={
            <>
              <span>• Input Tokens: <strong style={{ color: '#0f172a' }}>{sessionAnalytics.totalPrompt.toLocaleString('vi-VN')}</strong></span>
              <span>• Output Tokens: <strong style={{ color: '#0f172a' }}>{sessionAnalytics.totalCompletion.toLocaleString('vi-VN')}</strong></span>
            </>
          }
        />
        <DomKpiTile
          label="TỐC ĐỘ & ĐỘ TRỄ TB"
          value={`${sessionAnalytics.avgWallMs} ms`}
          accent="slate"
          icon={<Clock size={16} />}
          breakdown={
            <>
              <span>• Tốc độ TB: <strong style={{ color: '#0f172a' }}>{sessionAnalytics.avgTokPerSec || '—'} tok/s</strong></span>
              <span>• Giới hạn Output: <strong style={{ color: '#0f172a' }}>{maxTokens.toLocaleString('vi-VN')} tokens</strong></span>
            </>
          }
        />
        <DomKpiTile
          label="THỰC THI SQL TOOLS"
          value={sessionAnalytics.totalToolCalls}
          accent="slate"
          icon={<Database size={16} />}
          breakdown={
            <>
              <span>• Công cụ đã dùng: <strong style={{ color: '#0f172a' }}>{sessionAnalytics.uniqueToolsCount} / {totalTools}</strong></span>
              <span>• Tỷ lệ thành công: <strong style={{ color: '#0f172a' }}>{sessionAnalytics.successRatePct}% ({sessionAnalytics.failedToolCalls} lỗi)</strong></span>
            </>
          }
        />
      </div>

      {sessionAnalytics.turnCount === 0 && !(serverTelemetry?.summary?.total_queries) ? (
        <DomPanelCard>
          <DomEmptyChartState
            icon={<BarChart3 size={28} />}
            title="Chưa có dữ liệu Telemetry trong phiên hiện tại"
            description="Hãy chuyển về tab Phòng thử nghiệm và gửi ít nhất 1 truy vấn để ghi nhận biểu đồ độ trễ Tool SQL và lượng Token tiêu thụ thực tế."
            action={
              <DomToolbarButton variant="primary" onClick={onBackToChat} icon={<Sparkles size={14} />}>
                Quay lại Phòng thử nghiệm
              </DomToolbarButton>
            }
            minHeight={220}
          />
        </DomPanelCard>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sessionAnalytics.turnCount > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
              <DomPanelCard
                title="Độ trễ trung bình theo Công cụ MySQL (ms)"
                icon={<Clock size={16} />}
                iconAccent="brand"
              >
                {sessionAnalytics.toolLatencyData.length === 0 ? (
                  <DomEmptyChartState
                    title="Chưa có lệnh gọi công cụ SQL nào được ghi nhận."
                    minHeight={240}
                  />
                ) : (
                  <div style={{ height: 280 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sessionAnalytics.toolLatencyData} margin={{ top: 24, right: 16, left: 0, bottom: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                        <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                        <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${Number(v).toLocaleString('vi-VN')} ms`} />} />
                        <Bar dataKey="avgLatencyMs" name="Latency TB (ms)" fill="#C6333D" radius={[6, 6, 0, 0]}>
                          <LabelList dataKey="avgLatencyMs" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </DomPanelCard>

              <DomPanelCard
                title="Tiêu thụ Input vs Output Tokens theo lượt"
                icon={<Zap size={16} />}
                iconAccent="slate"
              >
                <div style={{ height: 280 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sessionAnalytics.turnSeries} margin={{ top: 24, right: 16, left: 0, bottom: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="turn" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                      <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${Number(v).toLocaleString('vi-VN')} tokens`} />} />
                      <Bar dataKey="promptTokens" name="Input Tokens" fill="#334155" radius={[6, 6, 0, 0]}>
                        <LabelList dataKey="promptTokens" position="top" style={{ fontSize: 10, fontWeight: 700, fill: '#334155' }} />
                      </Bar>
                      <Bar dataKey="completionTokens" name="Output Tokens" fill="#C6333D" radius={[6, 6, 0, 0]}>
                        <LabelList dataKey="completionTokens" position="top" style={{ fontSize: 10, fontWeight: 700, fill: '#BD1D2D' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </DomPanelCard>
            </div>
          )}

          {serverTelemetry?.summary && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <DomPanelCard
                deferred
                title={`THỐNG KÊ HỆ THỐNG (${serverTelemetry.days || 30} NGÀY • ${serverTelemetry.scope === 'tenant' ? 'TOÀN DOANH NGHIỆP' : 'CÁ NHÂN'})`}
                icon={<BarChart3 size={16} />}
                iconAccent="slate"
              >
                <div style={{ fontSize: '0.84rem', color: '#0f172a', display: 'flex', flexWrap: 'wrap', gap: '14px', alignItems: 'center' }}>
                  <span>Tổng truy vấn: <strong>{serverTelemetry.summary.total_queries.toLocaleString('vi-VN')}</strong></span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span>Độ trễ TB: <strong>{serverTelemetry.summary.avg_latency_ms} ms</strong></span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span>Tỷ lệ chính xác ERP: <strong style={{ color: '#BD1D2D' }}>{serverTelemetry.summary.accuracy_rate_pct}%</strong></span>
                  <span style={{ color: '#cbd5e1' }}>•</span>
                  <span>Đề xuất hành động: <strong>{serverTelemetry.summary.total_proposals}</strong></span>
                </div>
              </DomPanelCard>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
                {dailyTrendSlice.length > 0 && (
                  <DomPanelCard
                    deferred
                    title="Xu hướng Truy vấn AI & Khoảng trống tri thức theo ngày"
                    icon={<Activity size={16} />}
                    iconAccent="slate"
                  >
                    <div style={{ height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={dailyTrendSlice} margin={{ top: 24, right: 16, left: 0, bottom: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${Number(v).toLocaleString('vi-VN')} lượt`} />} />
                          <Bar dataKey="queries" name="Truy vấn" fill="#334155" radius={[6, 6, 0, 0]}>
                            <LabelList dataKey="queries" position="top" style={{ fontSize: 10, fontWeight: 700, fill: '#0f172a' }} />
                          </Bar>
                          <Bar dataKey="gaps" name="Thiếu tri thức" fill="#C6333D" radius={[6, 6, 0, 0]}>
                            <LabelList dataKey="gaps" position="top" style={{ fontSize: 10, fontWeight: 700, fill: '#BD1D2D' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </DomPanelCard>
                )}

                {topToolsChartData.length > 0 && (
                  <DomPanelCard
                    deferred
                    title="Top Công cụ ERP được AI gọi nhiều nhất"
                    icon={<Database size={16} />}
                    iconAccent="brand"
                  >
                    <div style={{ height: 260 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={topToolsChartData} margin={{ top: 24, right: 16, left: 0, bottom: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                          <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                          <Tooltip content={<DomChartTooltip valueFormatter={(v) => `${Number(v).toLocaleString('vi-VN')} lượt gọi`} />} />
                          <Bar dataKey="count" name="Số lượt gọi" fill="#C6333D" radius={[6, 6, 0, 0]}>
                            <LabelList dataKey="count" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#0f172a' }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </DomPanelCard>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const QwenAgentLabPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const primaryModelSetting = useTypedSubSetting<string>('ai.chat_engine_models', 'primary', 'gemini-3.5-flash-lite') || 'gemini-3.5-flash-lite';
  const canManageApiKey = isSystemAdmin(user) || isExecutive(user);
  const storageKey = buildStorageKey((user as any)?.tenant_id, user?.id);

  const [statusInfo, setStatusInfo] = useState<StatusInfo | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<string>(primaryModelSetting);
  const [temperature, setTemperature] = useState<number>(0.15);
  const [maxTokens, setMaxTokens] = useState<number>(8192);
  const [pinnedAgentId, setPinnedAgentId] = useState<string>('auto');
  const [labViewTab, setLabViewTab] = useState<'chat' | 'telemetry'>('chat');

  const [messages, setMessages] = useState<LabMessage[]>(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Ignore storage error
    }
    return [createDefaultWelcomeMessage()];
  });

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
          return;
        }
      }
    } catch {
      // Ignore storage error
    }
    setMessages([createDefaultWelcomeMessage()]);
  }, [storageKey]);

  const [inputText, setInputText] = useState<string>('');
  const [slashDismissed, setSlashDismissed] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Record<string, boolean>>({});
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const [newApiKeyInput, setNewApiKeyInput] = useState<string>('');
  const [savingKey, setSavingKey] = useState<boolean>(false);

  const [attachedEntity, setAttachedEntity] = useState<ErpEntitySearchResult | null>(null);
  const [showErpCardModal, setShowErpCardModal] = useState<boolean>(false);
  const [selectedAgentDetail, setSelectedAgentDetail] = useState<SpecializedAgent | null>(null);
  const [slashIndex, setSlashIndex] = useState<number>(0);

  const inFlightRef = useRef<boolean>(false);
  const statusAbortRef = useRef<AbortController | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
    } catch {
      // Ignore quota error
    }
  }, [messages, storageKey]);

  const fetchStatus = async () => {
    statusAbortRef.current?.abort();
    const ctrl = new AbortController();
    statusAbortRef.current = ctrl;
    setLoadingStatus(true);
    try {
      const res = await api.get('/qwen-agent/status?include_telemetry=1', { signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      const data = res.data?.data;
      if (data) {
        setStatusInfo(data);
        if (data.active_model) {
          setSelectedModel(data.active_model);
        }
      }
    } catch {
      // Silent fallback
    } finally {
      if (!ctrl.signal.aborted) {
        setLoadingStatus(false);
      }
    }
  };

  useEffect(() => {
    fetchStatus();
    return () => {
      statusAbortRef.current?.abort();
      chatAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (labViewTab === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isSending, labViewTab]);

  // Filtered Slash Commands when input starts with '/'
  const matchingSlashCommands = useMemo(() => {
    if (slashDismissed) return [];
    const trimmed = inputText.trim();
    if (!trimmed.startsWith('/') || trimmed.includes(' ')) return [];
    const q = trimmed.toLowerCase();
    return SLASH_COMMANDS.filter(
      (cmd) =>
        cmd.command.toLowerCase().startsWith(q) ||
        cmd.label.toLowerCase().includes(q.slice(1))
    );
  }, [inputText, slashDismissed]);

  useEffect(() => {
    setSlashIndex(0);
  }, [matchingSlashCommands.length]);

  const latestTelemetryMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && (messages[i].telemetry || messages[i].executed_steps)) {
        return messages[i];
      }
    }
    return null;
  }, [messages]);

  // Real session telemetry metrics for Telemetry & Cost tab
  const sessionAnalytics = useMemo(() => {
    const assistantTurns = messages.filter(
      (m) => m.role === 'assistant' && (m.telemetry || (m.executed_steps && m.executed_steps.length > 0))
    );
    let totalPrompt = 0;
    let totalCompletion = 0;
    let totalWallMs = 0;
    let sumTokPerSec = 0;
    let tokRateCount = 0;
    let totalLoops = 0;
    let totalToolCalls = 0;
    let failedToolCalls = 0;

    const toolAgg: Record<string, { tool: string; calls: number; totalLatency: number; errors: number }> = {};
    const turnSeries: { turn: string; promptTokens: number; completionTokens: number; wallMs: number }[] = [];

    assistantTurns.forEach((m, idx) => {
      const tel = m.telemetry;
      if (tel) {
        totalPrompt += Number(tel.prompt_tokens || 0);
        totalCompletion += Number(tel.completion_tokens || 0);
        totalWallMs += Number(tel.total_wall_ms || 0);
        totalLoops += Number(tel.turns_used || 1);
        if (tel.tokens_per_second) {
          sumTokPerSec += Number(tel.tokens_per_second);
          tokRateCount++;
        }
        turnSeries.push({
          turn: `Lượt ${idx + 1}`,
          promptTokens: Number(tel.prompt_tokens || 0),
          completionTokens: Number(tel.completion_tokens || 0),
          wallMs: Number(tel.total_wall_ms || 0),
        });
      }
      ensureArray<ExecutedStep>(m.executed_steps).forEach((st) => {
        totalToolCalls++;
        if (st.has_error) failedToolCalls++;
        if (!toolAgg[st.tool]) {
          toolAgg[st.tool] = { tool: st.tool, calls: 0, totalLatency: 0, errors: 0 };
        }
        toolAgg[st.tool].calls++;
        toolAgg[st.tool].totalLatency += Number(st.latency_ms || 0);
        if (st.has_error) toolAgg[st.tool].errors++;
      });
    });

    const toolLatencyData = Object.values(toolAgg)
      .map((item) => ({
        name: item.tool.length > 18 ? `${item.tool.slice(0, 16)}..` : item.tool,
        avgLatencyMs: Math.round(item.totalLatency / Math.max(1, item.calls)),
        calls: item.calls,
      }))
      .sort((a, b) => b.avgLatencyMs - a.avgLatencyMs)
      .slice(0, 8);

    const turnCount = assistantTurns.length;
    return {
      turnCount,
      totalTokens: totalPrompt + totalCompletion,
      totalPrompt,
      totalCompletion,
      avgTokPerSec: tokRateCount > 0 ? Math.round(sumTokPerSec / tokRateCount) : 0,
      avgWallMs: turnCount > 0 ? Math.round(totalWallMs / turnCount) : 0,
      avgLoops: turnCount > 0 ? (totalLoops / turnCount).toFixed(1) : '0',
      totalToolCalls,
      failedToolCalls,
      uniqueToolsCount: Object.keys(toolAgg).length,
      successRatePct: totalToolCalls > 0 ? Math.round(((totalToolCalls - failedToolCalls) / totalToolCalls) * 100) : 100,
      toolLatencyData,
      turnSeries: turnSeries.slice(-10),
    };
  }, [messages]);

  const handleSelectSlashCommand = (cmd: (typeof SLASH_COMMANDS)[0]) => {
    setSlashDismissed(false);
    if (cmd.template === 'CLEAR_ACTION') {
      setInputText('');
      handleClearSession();
      return;
    }
    setInputText(cmd.template);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const handleBackToChat = useCallback(() => setLabViewTab('chat'), []);

  const handleStopGeneration = () => {
    chatAbortRef.current?.abort();
    inFlightRef.current = false;
    setIsSending(false);
    toast('Đã dừng phản hồi AI', { icon: '⏹️' });
  };

  const handleSendMessage = async (overridePrompt?: string, overrideAgentId?: string) => {
    const rawText = (overridePrompt !== undefined ? overridePrompt : inputText).trim();
    const entityToSend = overridePrompt !== undefined ? null : attachedEntity;
    const textToSend =
      rawText ||
      (entityToSend
        ? `Phân tích chi tiết hồ sơ ${entityToSend.title} (#${entityToSend.id})`
        : '');

    if (!textToSend || inFlightRef.current) return;

    inFlightRef.current = true;
    setIsSending(true);
    setLabViewTab('chat');
    if (overridePrompt === undefined) {
      setInputText('');
      setSlashDismissed(false);
      setAttachedEntity(null);
    }
    const activeAgentToUse = overrideAgentId !== undefined ? overrideAgentId : pinnedAgentId;
    if (overrideAgentId !== undefined) {
      setPinnedAgentId(overrideAgentId);
    }

    const userMsg: LabMessage = {
      id: 'u_' + Date.now(),
      role: 'user',
      content: textToSend,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      attached_entity: entityToSend,
    };

    const historyForApi = messages
      .filter((m) => !m.id.startsWith('welcome_'))
      .slice(-10)
      .map((m) => ({
        role: m.role,
        content: m.content,
      }));

    setMessages((prev) => [...prev, userMsg]);

    chatAbortRef.current?.abort();
    const ctrl = new AbortController();
    chatAbortRef.current = ctrl;

    try {
      const res = await api.post(
        '/qwen-agent/chat',
        {
          message: textToSend,
          model: selectedModel,
          temperature,
          max_tokens: maxTokens,
          pinned_agent_id: activeAgentToUse,
          history: historyForApi,
          attached_entity: entityToSend || undefined,
        },
        { signal: ctrl.signal }
      );
      if (ctrl.signal.aborted) return;

      const payload = res.data?.data;
      const assistantMsg: LabMessage = {
        id: 'a_' + Date.now(),
        role: 'assistant',
        content: payload?.reply || 'Không nhận được nội dung phản hồi.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        model: payload?.model || selectedModel,
        reasoning_trace: payload?.reasoning_trace || '',
        collaborating_agents: ensureArray(payload?.collaborating_agents),
        executed_steps: ensureArray(payload?.executed_steps),
        telemetry: payload?.telemetry || undefined,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      if (ctrl.signal.aborted || err?.name === 'CanceledError' || err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') {
        return;
      }
      const errMsg =
        err?.response?.data?.message ||
        err?.response?.data?.data?.error_detail ||
        err?.message ||
        'Lỗi kết nối tới SI IDEAS × Gemini API';
      toast.error(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: 'err_' + Date.now(),
          role: 'assistant',
          content: `⚠️ **Không thể hoàn tất truy vấn trên Gemini 3.5 Flash Lite**: ${errMsg}`,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          model: selectedModel,
        },
      ]);
    } finally {
      inFlightRef.current = false;
      setIsSending(false);
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  };

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageApiKey) {
      toast.error('Bạn không có quyền cập nhật cấu hình API Key');
      return;
    }
    if (!newApiKeyInput.trim() && !selectedModel) return;
    setSavingKey(true);
    try {
      const res = await api.post('/qwen-agent/settings', {
        gemini_api_key: newApiKeyInput.trim() || undefined,
        gemini_model: selectedModel,
      });
      const data = res.data?.data;
      if (data) {
        setStatusInfo((prev) =>
          prev
            ? {
                ...prev,
                has_key: data.has_key,
                masked_key: data.masked_key,
                active_model: data.active_model,
              }
            : prev
        );
      }
      setNewApiKeyInput('');
      setShowKeyModal(false);
      toast.success('Đã cập nhật cấu hình Gemini Engine bảo mật');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Không thể lưu cấu hình API');
    } finally {
      setSavingKey(false);
    }
  };

  const handleClearSession = () => {
    chatAbortRef.current?.abort();
    inFlightRef.current = false;
    setIsSending(false);
    sessionStorage.removeItem(storageKey);
    setAttachedEntity(null);
    setMessages([
      {
        id: 'welcome_gemini_' + Date.now(),
        role: 'assistant',
        content:
          'Đã làm mới phiên làm việc. Toàn bộ ngữ cảnh đã được dọn sạch. Hãy chọn kịch bản hoặc nhập câu hỏi mới cho **SI IDEAS × Gemini 3.5 Flash Lite**.',
        timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        model: selectedModel,
      },
    ]);
    toast.success('Đã làm mới phiên test SI IDEAS × Gemini');
  };

  const triggerExportUrl = (rawHref: string) => {
    try {
      const url = new URL(rawHref, window.location.origin);
      const params: Record<string, any> = {};
      url.searchParams.forEach((v, k) => {
        params[k] = v;
      });
      downloadExportFile({
        endpoint: '/export',
        params,
        defaultFilename: `export_${params.type || 'data'}.csv`,
        onError: (err: any) => toast.error(err?.message || 'Không thể tải xuống file export'),
      }).catch(() => {});
    } catch {
      if (isSafeMarkdownUrl(rawHref)) {
        window.open(rawHref, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const handleOpenErpCard = (card: any) => {
    const eType = String(card.entity_type || '').toLowerCase();
    const eId = Number(card.entity_id || card.id || 0);
    if (['contact', 'customer', 'student', 'lead'].includes(eType) && eId > 0) {
      useUIStore.getState().openCustomerDrawer(eId);
      return;
    }
    if (eType === 'task' && eId > 0) {
      useUIStore.getState().openTaskDrawer({ id: eId });
      return;
    }
    if (['expense', 'po', 'purchase_order'].includes(eType) && eId > 0) {
      navigate(`/expenses?open_po_id=${eId}`);
      return;
    }
    if (['deposit', 'so', 'sales_order'].includes(eType) && eId > 0) {
      navigate(`/deposits?open_so_id=${eId}`);
      return;
    }
    if (['approval', 'leave', 'advance'].includes(eType) && eId > 0) {
      const openType = eType === 'approval' ? 'expense' : eType;
      navigate(`/approvals?open_id=${eId}&open_type=${openType}`);
      window.dispatchEvent(new CustomEvent('open-approval-item', { detail: { id: eId, type: openType } }));
      return;
    }
    if (eType === 'company' && eId > 0) {
      window.dispatchEvent(new CustomEvent('open-company-drawer', { detail: { id: eId, companyId: eId } }));
      return;
    }
    if (eType === 'deal' && eId > 0) {
      navigate(`/deals?open_deal_id=${eId}`);
      window.dispatchEvent(new CustomEvent('open-deal-drawer', { detail: { id: eId } }));
      return;
    }
    if (card.relative_url && isSafeMarkdownUrl(card.relative_url)) {
      navigate(card.relative_url);
      return;
    }
    if (card.direct_url && isSafeMarkdownUrl(card.direct_url)) {
      try {
        const u = new URL(card.direct_url, window.location.origin);
        if (u.origin === window.location.origin) {
          navigate(u.pathname + u.search);
        } else {
          window.open(u.href, '_blank', 'noopener,noreferrer');
        }
      } catch {
        // ignore invalid URL
      }
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 64px)',
        background: 'var(--color-bg)',
        color: 'var(--color-text)',
        overflow: 'hidden',
      }}
    >
      {/* Top Header Bar */}
      <style>{`
        .qwen-lab-grid {
          display: grid;
          grid-template-columns: 290px minmax(0, 1fr) 320px;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        @media (max-width: 1180px) {
          .qwen-lab-grid {
            grid-template-columns: 240px minmax(0, 1fr);
          }
          .qwen-lab-telemetry-col {
            display: none !important;
          }
        }
        @media (max-width: 820px) {
          .qwen-lab-grid {
            grid-template-columns: minmax(0, 1fr);
            overflow-y: auto;
          }
          .qwen-lab-left-col {
            display: none !important;
          }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          background: 'var(--color-surface)',
          borderBottom: '1px solid var(--color-border)',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: '#BD1D2D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <Brain size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-text)' }}>
                SI IDEAS × Gemini 3.5 Flash Lite Lab
              </h1>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #e2e8f0',
                }}
              >
                {statusInfo?.engine || 'GEMINI 3.5 FLASH LITE'}
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(189, 29, 45, 0.08)',
                  color: '#BD1D2D',
                }}
              >
                {statusInfo?.total_tools ?? 0} ERP Tools • Full Access
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              Màn hình kiểm thử Multi-Agent Swarm, Bộ nhớ 2 tầng, Action Proposal & SQL Tool Registry trên Gemini 3.5 Flash Lite
            </div>
          </div>
        </div>

        {/* Right Controls: Segmented Tab, Model Switcher, Temp, Max Tokens, Key, Clear */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <DomSegmentedSwitch
            size="sm"
            ariaLabel="Chế độ SI IDEAS Lab"
            value={labViewTab}
            onChange={(val) => setLabViewTab(val as 'chat' | 'telemetry')}
            options={[
              { value: 'chat', label: 'Phòng thử nghiệm', icon: <Sparkles size={13} /> },
              { value: 'telemetry', label: 'Telemetry & Cost', icon: <BarChart3 size={13} /> },
            ]}
          />

          {/* Dynamic Model Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Cpu size={15} style={{ color: '#BD1D2D' }} />
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {ensureArray(statusInfo?.available_models).length > 0 ? (
                ensureArray(statusInfo?.available_models).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.label || m.id}
                  </option>
                ))
              ) : (
                <option value={primaryModelSetting}>{formatModelLabel(primaryModelSetting)} (Mặc định)</option>
              )}
            </select>
          </div>

          {/* Temperature Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sliders size={14} style={{ color: 'var(--color-text-muted)' }} />
            <select
              value={String(temperature)}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{
                height: 34,
                padding: '0 8px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <option value="0.1">Temp 0.1 (Chuẩn SQL)</option>
              <option value="0.15">Temp 0.15 (Mặc định)</option>
              <option value="0.3">Temp 0.3 (Linh hoạt)</option>
              <option value="0.6">Temp 0.6 (Sáng tạo)</option>
            </select>
          </div>

          {/* Max Tokens Selector */}
          <select
            value={String(maxTokens)}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
            title="Giới hạn Max Output Tokens"
            style={{
              height: 34,
              padding: '0 8px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              color: 'var(--color-text)',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <option value="2048">2K Tokens</option>
            <option value="4096">4K Tokens</option>
            <option value="8192">8K Tokens</option>
            <option value="16384">16K Tokens</option>
          </select>

          {/* Masked API Key Security Badge (Admin/Executive Only) */}
          {canManageApiKey && (
            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              title="Key được bảo mật tuyệt đối ở tầng Backend (.env.local / system_settings)"
              style={{
                height: 34,
                padding: '0 10px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: '0.76rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <ShieldCheck size={14} style={{ color: statusInfo?.has_key !== false ? '#334155' : '#BD1D2D' }} />
              <span>Gemini Key: {loadingStatus ? '••••' : statusInfo?.masked_key || 'Đã bảo mật'}</span>
            </button>
          )}

          {/* Clear Chat Button */}
          <button
            type="button"
            onClick={handleClearSession}
            style={{
              height: 34,
              padding: '0 12px',
              borderRadius: 8,
              border: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              color: 'var(--color-text-muted)',
              fontSize: '0.78rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
            }}
          >
            <Trash2 size={14} />
            <span>Làm mới</span>
          </button>
        </div>
      </div>

      {labViewTab === 'telemetry' ? (
        <QwenTelemetryTab
          sessionAnalytics={sessionAnalytics}
          selectedModel={selectedModel}
          maxTokens={maxTokens}
          totalTools={statusInfo?.total_tools ?? 0}
          serverTelemetry={statusInfo?.telemetry}
          onBackToChat={handleBackToChat}
        />
      ) : (
        /* Main 3-Column Body */
        <div className="qwen-lab-grid">
          {/* LEFT COLUMN: Specialized Agent Selector & 1-Click Test Scenarios */}
          <div
            className="qwen-lab-left-col"
            style={{
              borderRight: '1px solid var(--color-border)',
              background: 'var(--color-surface)',
              display: 'flex',
              flexDirection: 'column',
              overflowY: 'auto',
              padding: '16px',
              gap: '16px',
            }}
          >
          {/* Agent Selector */}
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-text-muted)',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Chế độ Multi-Agent Swarm</span>
              <Layers size={13} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <button
                type="button"
                onClick={() => setPinnedAgentId('auto')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 12px',
                  borderRadius: 10,
                  border:
                    pinnedAgentId === 'auto'
                      ? '1px solid var(--color-primary)'
                      : '1px solid var(--color-border)',
                  background:
                    pinnedAgentId === 'auto' ? 'rgba(189, 29, 45, 0.08)' : 'var(--color-bg)',
                  color: 'var(--color-text)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'var(--color-primary)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Sparkles size={15} strokeWidth={1.75} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>Auto Swarm (Tự động)</div>
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--color-text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    Tự động gọi 1-3 Agent theo câu hỏi
                  </div>
                </div>
              </button>

              {SPECIALIZED_AGENTS.filter((a) => a.id !== 'master').map((ag) => {
                const isSelected = pinnedAgentId === ag.id;
                return (
                  <div
                    key={ag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      borderRadius: 10,
                      border: isSelected
                        ? `1px solid ${ag.badgeColor}`
                        : '1px solid transparent',
                      background: isSelected ? ag.badgeBg : 'transparent',
                      paddingRight: 8,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setPinnedAgentId(ag.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--color-text)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        flex: 1,
                        minWidth: 0,
                      }}
                    >
                      <img
                        src={ag.avatar}
                        alt={ag.name}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          objectFit: 'cover',
                          flexShrink: 0,
                          border: `1px solid ${ag.badgeColor}`,
                        }}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: isSelected ? '#0f172a' : 'var(--color-text)' }}>
                          {ag.name}
                        </div>
                        <div
                          style={{
                            fontSize: '0.68rem',
                            color: isSelected ? '#334155' : 'var(--color-text-muted)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {ag.roleTitle}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Xem hồ sơ năng lực & câu lệnh mẫu của Agent"
                      onClick={() => setSelectedAgentDetail(ag)}
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 6,
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--color-text-muted)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <Info size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 1-Click ERP Test Scenarios */}
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: 'var(--color-text-muted)',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Kịch bản test 1-click</span>
              <Play size={12} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {TEST_PROMPTS.map((tp, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isSending}
                  onClick={() => handleSendMessage(tp.prompt, 'auto')}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text)',
                    cursor: isSending ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--color-primary)',
                      textTransform: 'uppercase',
                    }}
                  >
                    {tp.category}
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{tp.title}</span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--color-text-muted)',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {tp.prompt}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER COLUMN: Chat Stream & Input */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: 'var(--color-bg)',
          }}
        >
          {/* Messages List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              const parsed = !isUser ? parseAllChatTags(msg.content) : null;
              const displayContent = parsed ? parsed.cleanContent : msg.content;
              const isReasoningOpen = !!expandedReasoningIds[msg.id];

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isUser ? 'flex-end' : 'flex-start',
                    gap: '6px',
                  }}
                >
                  {/* Sender Header + Agent Badges */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                      fontSize: '0.73rem',
                      color: 'var(--color-text-muted)',
                    }}
                  >
                    <span style={{ fontWeight: 700, color: isUser ? 'var(--color-primary)' : 'var(--color-text)' }}>
                      {isUser ? 'Bạn' : 'SI IDEAS × Turnio 3.8 27B'}
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>• {msg.timestamp}</span>
                    {!isUser && msg.model && (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                        }}
                      >
                        {formatModelLabel(msg.model)}
                      </span>
                    )}
                    {!isUser &&
                      msg.collaborating_agents &&
                      msg.collaborating_agents.map((ag) => (
                        <span
                          key={ag.id}
                          style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: 'rgba(189, 29, 45, 0.1)',
                            color: 'var(--color-primary)',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                          }}
                        >
                          {ag.badge}
                        </span>
                      ))}
                    {!isUser && msg.telemetry?.tokens_per_second ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(189, 29, 45, 0.08)',
                          color: '#BD1D2D',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        <Zap size={11} /> {msg.telemetry.tokens_per_second} tok/s ({msg.telemetry.total_wall_ms}ms)
                      </span>
                    ) : null}
                  </div>

                  {/* Executed Tools Pills (if any) */}
                  {!isUser && msg.executed_steps && msg.executed_steps.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxWidth: '92%' }}>
                      {msg.executed_steps.map((st, sIdx) => (
                        <div
                          key={sIdx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: 8,
                            background: 'var(--color-surface)',
                            border: st.has_error ? '1px solid rgba(239, 68, 68, 0.35)' : '1px solid var(--color-border)',
                            fontSize: '0.72rem',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          <Database size={12} style={{ color: st.has_error ? '#ef4444' : '#334155' }} />
                          <code style={{ fontWeight: 700, color: 'var(--color-text)' }}>{st.tool}</code>
                          <span style={{ color: st.has_error ? '#ef4444' : 'var(--color-text-muted)' }}>({st.latency_ms}ms)</span>
                          <span style={{ color: st.has_error ? '#ef4444' : '#334155', fontWeight: 600 }}>• {st.summary}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Collapsible Reasoning Trace (<think>) */}
                  {!isUser && msg.reasoning_trace && (
                    <div style={{ maxWidth: '92%', width: '100%' }}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedReasoningIds((prev) => ({
                            ...prev,
                            [msg.id]: !prev[msg.id],
                          }))
                        }
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: 8,
                          border: '1px solid var(--color-border)',
                          background: 'var(--color-surface)',
                          color: 'var(--color-text-muted)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        {isReasoningOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        <span>Chuỗi suy luận nội tại Turnio 3.8 (&lt;think&gt;)</span>
                      </button>
                      {isReasoningOpen && (
                        <pre
                          style={{
                            marginTop: 6,
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            fontSize: '0.74rem',
                            color: 'var(--color-text-muted)',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 240,
                            overflowY: 'auto',
                          }}
                        >
                          {msg.reasoning_trace}
                        </pre>
                      )}
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div
                    style={{
                      maxWidth: isUser ? '78%' : '94%',
                      padding: isUser ? '12px 16px' : '16px 20px',
                      borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      background: isUser ? 'var(--color-primary)' : 'var(--color-surface)',
                      color: isUser ? '#ffffff' : 'var(--color-text)',
                      border: isUser ? 'none' : '1px solid var(--color-border)',
                      fontSize: '0.875rem',
                      lineHeight: 1.6,
                      overflowX: 'auto',
                    }}
                  >
                    {isUser ? (
                      <div>
                        <div style={{ whiteSpace: 'pre-wrap' }}>{displayContent}</div>
                        {msg.attached_entity && (
                          <div style={{ marginTop: 10 }}>
                            <ChatSmartErpCard
                              card={msg.attached_entity as any}
                              onOpen={handleOpenErpCard}
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="qwen-markdown-body">
                        <QwenMarkdownRenderer content={displayContent} onExport={triggerExportUrl} />

                        {/* Rich ERP Widgets Parsed from Tags */}
                        {parsed?.proactiveInsight && (
                          <div style={{ marginTop: 12 }}>
                            <ProactiveInsightCard
                              insight={parsed.proactiveInsight}
                              onAction={(p) => handleSendMessage(p)}
                            />
                          </div>
                        )}

                        {parsed?.chart && (
                          <div style={{ marginTop: 14 }}>
                            <ChatDynamicChart chart={parsed.chart} />
                          </div>
                        )}

                        {parsed?.erpCard && (
                          <div style={{ marginTop: 12 }}>
                            <ChatSmartErpCard card={parsed.erpCard} onOpen={handleOpenErpCard} />
                          </div>
                        )}

                        {parsed?.proposals &&
                          parsed.proposals.map((prop, pIdx) => (
                            <div key={pIdx} style={{ marginTop: 12 }}>
                              <ActionProposalCard proposal={prop} messageId={`${msg.id}_${pIdx}`} />
                            </div>
                          ))}

                        {(parsed?.nextBestActions || parsed?.clarifyOptions) && (
                          <div style={{ marginTop: 12 }}>
                            <NextBestActionChips
                              actions={parsed.nextBestActions}
                              clarifyOptions={parsed.clarifyOptions}
                              onSelectAction={(prompt) => handleSendMessage(prompt)}
                              disabled={isSending}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Skeleton Loading State (Zero Spinners Policy) */}
            {isSending && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  maxWidth: '75%',
                  padding: '16px 20px',
                  borderRadius: '16px 16px 16px 4px',
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    className="animate-pulse"
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                    }}
                  />
                  <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
                    Turnio 3.8 27B (LPU Engine) đang điều phối Agent & truy vấn MySQL...
                  </span>
                </div>
                <div
                  className="animate-pulse"
                  style={{
                    height: 12,
                    width: '88%',
                    borderRadius: 6,
                    background: 'var(--color-border)',
                  }}
                />
                <div
                  className="animate-pulse"
                  style={{
                    height: 12,
                    width: '64%',
                    borderRadius: 6,
                    background: 'var(--color-border)',
                  }}
                />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Composer Bar with Slash Commands & ERP Entity Attachment */}
          <div
            style={{
              position: 'relative',
              padding: '12px 20px',
              background: 'var(--color-surface)',
              borderTop: '1px solid var(--color-border)',
            }}
          >
            {/* Slash Command Popup Menu */}
            {matchingSlashCommands.length > 0 && !slashDismissed && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: 20,
                  right: 20,
                  maxWidth: 460,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 12,
                  padding: 8,
                  zIndex: 50,
                }}
              >
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--color-text-muted)',
                    padding: '4px 12px',
                  }}
                >
                  Lệnh tắt AI Copilot (Slash Commands)
                </div>
                {matchingSlashCommands.map((cmd, idx) => (
                  <button
                    key={cmd.command}
                    type="button"
                    onClick={() => handleSelectSlashCommand(cmd)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      borderRadius: 10,
                      border: 'none',
                      background: idx === slashIndex ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                      color: 'var(--color-text)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-primary)',
                        flexShrink: 0,
                      }}
                    >
                      {cmd.icon}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--color-primary)' }}>
                          {cmd.command}
                        </code>
                        <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>{cmd.label}</span>
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        {cmd.description}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Attached ERP Entity Preview Pill */}
            {attachedEntity && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 8,
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'rgba(189, 29, 45, 0.06)',
                  border: '1px solid rgba(189, 29, 45, 0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <Briefcase size={15} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                      Đính kèm: {attachedEntity.title} (#{attachedEntity.id})
                    </div>
                    {attachedEntity.subtitle && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        {attachedEntity.subtitle}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachedEntity(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--color-text-muted)',
                    cursor: 'pointer',
                    padding: 4,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                background: 'var(--color-bg)',
                border: '1px solid var(--color-border)',
                borderRadius: 12,
                padding: '8px 12px',
              }}
            >
              {/* Attach ERP Record Button (Same mechanism as main Agent Chat) */}
              <button
                type="button"
                title="Đính kèm Hồ sơ ERP (Lead, Học viên, Task, PO, SO)"
                onClick={() => setShowErpCardModal(true)}
                style={{
                  height: 36,
                  padding: '0 12px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface)',
                  color: 'var(--color-text)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <Briefcase size={14} style={{ color: 'var(--color-primary)' }} />
                <span>Hồ sơ ERP</span>
              </button>

              <textarea
                ref={inputRef}
                rows={2}
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  setSlashDismissed(false);
                }}
                onKeyDown={(e) => {
                  if (matchingSlashCommands.length > 0) {
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      setSlashDismissed(true);
                      return;
                    }
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSlashIndex((prev) => (prev + 1) % matchingSlashCommands.length);
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSlashIndex((prev) => (prev - 1 + matchingSlashCommands.length) % matchingSlashCommands.length);
                      return;
                    }
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      handleSelectSlashCommand(matchingSlashCommands[slashIndex] || matchingSlashCommands[0]);
                      return;
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (matchingSlashCommands.length > 0 && inputText.trim().startsWith('/')) {
                      handleSelectSlashCommand(matchingSlashCommands[slashIndex] || matchingSlashCommands[0]);
                      return;
                    }
                    handleSendMessage();
                  }
                }}
                placeholder="Gõ / để mở lệnh tắt, đính kèm Hồ sơ ERP hoặc nhập câu hỏi cho SI IDEAS × Gemini 3.5 Flash Lite..."
                style={{
                  flex: 1,
                  width: '100%',
                  minWidth: 0,
                  border: 'none',
                  outline: 'none',
                  background: 'transparent',
                  color: 'var(--color-text)',
                  fontSize: '0.875rem',
                  resize: 'none',
                  lineHeight: 1.5,
                }}
              />
              {isSending ? (
                <button
                  type="button"
                  onClick={handleStopGeneration}
                  style={{
                    height: 36,
                    padding: '0 14px',
                    borderRadius: 8,
                    border: '1px solid #BD1D2D',
                    background: 'rgba(189, 29, 45, 0.08)',
                    color: '#BD1D2D',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Square size={13} fill="#BD1D2D" />
                  <span>Dừng sinh</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!inputText.trim() && !attachedEntity}
                  onClick={() => handleSendMessage()}
                  style={{
                    height: 36,
                    padding: '0 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: !inputText.trim() && !attachedEntity ? 'var(--color-border)' : '#BD1D2D',
                    color: '#ffffff',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: !inputText.trim() && !attachedEntity ? 'not-allowed' : 'pointer',
                    flexShrink: 0,
                  }}
                >
                  <Send size={15} />
                  <span>Gửi Gemini</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live Gemini Telemetry & Tool Execution Inspector */}
        <div
          className="qwen-lab-telemetry-col"
          style={{
            borderLeft: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            padding: '16px',
            gap: '16px',
          }}
        >
          {/* Telemetry Speedometer Card */}
          <div
            style={{
              padding: '16px',
              borderRadius: 12,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  color: 'var(--color-text-muted)',
                }}
              >
                Gemini Engine Telemetry
              </span>
              <Zap size={14} style={{ color: '#BD1D2D' }} />
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Tốc độ sinh Token</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#BD1D2D', fontVariantNumeric: 'tabular-nums' }}>
                  {latestTelemetryMessage?.telemetry?.tokens_per_second
                    ? `${latestTelemetryMessage.telemetry.tokens_per_second} tok/s`
                    : '—'}
                </div>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Thời gian phản hồi</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
                  {latestTelemetryMessage?.telemetry?.groq_time_ms !== undefined
                    ? `${latestTelemetryMessage.telemetry.groq_time_ms} ms`
                    : latestTelemetryMessage?.telemetry?.total_wall_ms !== undefined
                    ? `${latestTelemetryMessage.telemetry.total_wall_ms} ms`
                    : '—'}
                </div>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Tổng Tokens (In/Out)</div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--color-text)', fontVariantNumeric: 'tabular-nums' }}>
                  {latestTelemetryMessage?.telemetry
                    ? `${latestTelemetryMessage.telemetry.prompt_tokens} / ${latestTelemetryMessage.telemetry.completion_tokens}`
                    : '—'}
                </div>
              </div>

              <div
                style={{
                  padding: '8px 12px',
                  borderRadius: 10,
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)' }}>Số vòng Tool Loop</div>
                <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--color-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  {latestTelemetryMessage?.telemetry?.turns_used
                    ? `${latestTelemetryMessage.telemetry.turns_used} vòng`
                    : '1 vòng'}
                </div>
              </div>
            </div>
          </div>

          {/* Active Collaborating Agents */}
          <div>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 8,
              }}
            >
              Swarm đang phối hợp
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(latestTelemetryMessage?.collaborating_agents || [
                {
                  id: 'master',
                  badge: 'SI IDEAS (Gemini 3.5 Flash Lite)',
                  focus: 'Sẵn sàng phân tích yêu cầu và gọi công cụ MySQL.',
                },
              ]).map((ag) => (
                <div
                  key={ag.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--color-primary)' }}>
                    {ag.badge}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                    {ag.focus}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tool Execution Trace */}
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                color: 'var(--color-text-muted)',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span>Nhật ký gọi Tool (MySQL)</span>
              <Terminal size={13} />
            </div>

            {!latestTelemetryMessage?.executed_steps ||
            latestTelemetryMessage.executed_steps.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  borderRadius: 12,
                  background: 'var(--color-bg)',
                  border: '1px dashed var(--color-border)',
                  fontSize: '0.75rem',
                  color: 'var(--color-text-muted)',
                  textAlign: 'center',
                }}
              >
                Chưa có lệnh gọi công cụ nào trong lượt gần nhất. Hãy bấm vào một kịch bản test bên trái.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {latestTelemetryMessage.executed_steps.map((step, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: 'var(--color-bg)',
                      border: step.has_error ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--color-border)',
                      fontSize: '0.74rem',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <code style={{ fontWeight: 700, color: 'var(--color-text)' }}>{step.tool}</code>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          color: step.has_error ? '#ef4444' : '#334155',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {step.latency_ms}ms
                      </span>
                    </div>
                    <div style={{ marginTop: 4, color: step.has_error ? '#ef4444' : '#BD1D2D', fontWeight: 700 }}>
                      {step.summary}
                    </div>
                    <pre
                      style={{
                        marginTop: 6,
                        marginBottom: 0,
                        padding: '6px 8px',
                        borderRadius: 8,
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        fontSize: '0.68rem',
                        color: 'var(--color-text-muted)',
                        overflowX: 'auto',
                      }}
                    >
                      {JSON.stringify(step.args, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ERP Entity Attachment Modal (Same as Main Agent Chat) */}
      <ChatErpCardModal
        isOpen={showErpCardModal}
        onClose={() => setShowErpCardModal(false)}
        onSelect={(entity) => {
          setAttachedEntity(entity);
          setShowErpCardModal(false);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
      />

      {/* Specialized Agent Detail Modal */}
      {selectedAgentDetail && (
        <AgentDetailModal
          isOpen={!!selectedAgentDetail}
          agent={selectedAgentDetail}
          onClose={() => setSelectedAgentDetail(null)}
          onSelectPrompt={(prompt) => {
            const agId = selectedAgentDetail.id;
            setSelectedAgentDetail(null);
            handleSendMessage(prompt, agId);
          }}
        />
      )}

      {/* Security / API Key Configuration Modal (Admin/Executive Only) */}
      <CustomModal
        isOpen={showKeyModal && canManageApiKey}
        onClose={() => !savingKey && setShowKeyModal(false)}
        title="Cấu hình Gemini 3.5 Flash Lite API Key"
        width={460}
        zIndex={2147483646}
        disableClose={savingKey}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#BD1D2D', fontSize: '0.82rem', fontWeight: 700 }}>
            <KeyRound size={17} />
            <span>Bảo mật API Key ở tầng Backend</span>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.5, margin: 0 }}>
            API Key của bạn đang được lưu trữ mã hóa bảo mật ở tầng Backend (<code>.env.local</code> và <code>system_settings</code>), tuyệt đối không lộ trên trình duyệt hay Git.
          </p>
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ color: 'var(--color-text-muted)' }}>Key đang kích hoạt:</span>
            <code style={{ fontWeight: 700, color: '#0f172a', fontVariantNumeric: 'tabular-nums' }}>
              {statusInfo?.masked_key || 'Đã cấu hình'}
            </code>
          </div>

          <form onSubmit={handleSaveApiKey}>
            <label
              style={{
                display: 'block',
                fontSize: '0.76rem',
                fontWeight: 600,
                marginBottom: 8,
              }}
            >
              Đổi Gemini API Key mới (tùy chọn — để trống nếu chỉ đổi Engine):
            </label>
            <input
              type="password"
              value={newApiKeyInput}
              onChange={(e) => setNewApiKeyInput(e.target.value)}
              placeholder="Nhập API Key mới..."
              style={{
                width: '100%',
                height: 36,
                padding: '0 12px',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                background: 'var(--color-bg)',
                color: 'var(--color-text)',
                fontSize: '0.84rem',
                marginBottom: 16,
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                disabled={savingKey}
                style={{
                  height: 36,
                  padding: '0 16px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={savingKey}
                style={{
                  height: 36,
                  padding: '0 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#BD1D2D',
                  color: '#fff',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {savingKey ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </div>
          </form>
        </div>
      </CustomModal>
    </div>
  );
};

const renderInlineMarkdown = (text: string, onExport: (href: string) => void): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  const tokenRegex = /(\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIdx = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    if (match[2] !== undefined && match[3] !== undefined) {
      const label = match[2];
      const rawHref = match[3].trim();
      if (/\/(?:api\/)?export(?:\?|$)/i.test(rawHref)) {
        nodes.push(
          <button
            key={`exp-${keyIdx++}`}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onExport(rawHref);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              margin: '4px 4px 4px 0',
              padding: '6px 12px',
              borderRadius: 8,
              background: '#BD1D2D',
              color: '#fff',
              border: 'none',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Download size={13} />
            <span>{label}</span>
          </button>
        );
      } else if (isSafeMarkdownUrl(rawHref)) {
        nodes.push(
          <a
            key={`lnk-${keyIdx++}`}
            href={rawHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: '#BD1D2D',
              fontWeight: 700,
              textDecoration: 'underline',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{label}</span>
            <ExternalLink size={12} />
          </a>
        );
      } else {
        nodes.push(<span key={`txt-${keyIdx++}`}>{label}</span>);
      }
    } else if (match[4] !== undefined) {
      nodes.push(<strong key={`b-${keyIdx++}`}>{match[4]}</strong>);
    } else if (match[5] !== undefined) {
      nodes.push(
        <code
          key={`c-${keyIdx++}`}
          style={{
            padding: '1px 6px',
            borderRadius: 5,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            fontSize: '0.79rem',
            fontFamily: 'monospace',
          }}
        >
          {match[5]}
        </code>
      );
    }
    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
};

const QwenMarkdownRenderer: React.FC<{ content: string; onExport: (href: string) => void }> = ({
  content,
  onExport,
}) => {
  const lines = String(content || '').split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Fenced code block (```lang ... ```)
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++;
      }
      elements.push(
        <div
          key={`code-${i}`}
          style={{
            margin: '10px 0',
            borderRadius: 10,
            border: '1px solid #334155',
            background: '#0f172a',
            overflow: 'hidden',
          }}
        >
          {lang && (
            <div style={{ padding: '4px 12px', fontSize: '0.68rem', fontWeight: 700, color: '#cbd5e1', background: '#1e293b', textTransform: 'uppercase' }}>
              {lang}
            </div>
          )}
          <pre
            style={{
              margin: 0,
              padding: '10px 12px',
              overflowX: 'auto',
              fontSize: '0.78rem',
              lineHeight: 1.5,
              color: '#f8fafc',
              fontFamily: 'monospace',
            }}
          >
            <code>{codeLines.join('\n')}</code>
          </pre>
        </div>
      );
      continue;
    }

    // GFM Table detection
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      const parseRow = (rowStr: string) =>
        rowStr
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((c) => c.trim());

      const headers = parseRow(lines[i]);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseRow(lines[i]));
        i++;
      }

      elements.push(
        <div
          key={`tbl-${i}`}
          style={{
            overflowX: 'auto',
            margin: '12px 0',
            borderRadius: 10,
            border: '1px solid var(--color-border)',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
            <thead>
              <tr>
                {headers.map((h, hIdx) => (
                  <th
                    key={hIdx}
                    style={{
                      padding: '8px 12px',
                      background: 'var(--color-bg)',
                      borderBottom: '1px solid var(--color-border)',
                      textAlign: 'left',
                      fontWeight: 700,
                      fontSize: '0.74rem',
                      textTransform: 'uppercase',
                    }}
                  >
                    {renderInlineMarkdown(h, onExport)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, rIdx) => (
                <tr key={rIdx}>
                  {r.map((cell, cIdx) => (
                    <td
                      key={cIdx}
                      style={{
                        padding: '8px 12px',
                        borderBottom: '1px solid var(--color-border)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {renderInlineMarkdown(cell, onExport)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Headings
    if (trimmed.startsWith('### ')) {
      elements.push(
        <h4 key={`h3-${i}`} style={{ margin: '12px 0 8px', fontSize: '0.94rem', fontWeight: 700 }}>
          {renderInlineMarkdown(trimmed.slice(4), onExport)}
        </h4>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <h3 key={`h2-${i}`} style={{ margin: '16px 0 8px', fontSize: '1.02rem', fontWeight: 700 }}>
          {renderInlineMarkdown(trimmed.slice(3), onExport)}
        </h3>
      );
      i++;
      continue;
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <h2 key={`h1-${i}`} style={{ margin: '16px 0 8px', fontSize: '1.1rem', fontWeight: 700 }}>
          {renderInlineMarkdown(trimmed.slice(2), onExport)}
        </h2>
      );
      i++;
      continue;
    }

    // Bullet list
    if (/^[-*•]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} style={{ margin: '6px 0 10px 18px', padding: 0 }}>
          {listItems.map((item, idx) => (
            <li key={idx} style={{ marginBottom: 4 }}>
              {renderInlineMarkdown(item, onExport)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph
    elements.push(
      <p key={`p-${i}`} style={{ margin: '6px 0' }}>
        {renderInlineMarkdown(line, onExport)}
      </p>
    );
    i++;
  }

  return <>{elements}</>;
};

export default QwenAgentLabPage;
