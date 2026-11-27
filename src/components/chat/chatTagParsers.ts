// src/components/chat/chatTagParsers.ts
// Unified parser for AI Copilot Smart Tags: Action Proposal, Dynamic Chart (Micro-BI), Next Best Actions, Proactive Insights

import type { ActionProposal } from './ActionProposalCard';

export interface DynamicChartSeries {
  dataKey: string;
  name: string;
  color?: string;
  type?: 'bar' | 'line' | 'area';
}

export interface DynamicChartDataset {
  key: string;
  label: string;
  type?: 'bar' | 'line' | 'pie' | 'area' | 'composed' | 'hbar' | 'funnel' | 'table';
  title?: string;
  subtitle?: string;
  xAxisKey?: string;
  data: Record<string, any>[];
  series?: DynamicChartSeries[];
}

export interface DynamicChartData {
  type: 'bar' | 'line' | 'pie' | 'area' | 'composed' | 'hbar' | 'funnel' | 'table';
  title: string;
  subtitle?: string;
  description?: string;
  xAxisKey?: string;
  data: Record<string, any>[];
  series?: DynamicChartSeries[];
  datasets?: DynamicChartDataset[];
}

export interface ProactiveInsightData {
  type?: 'warning' | 'opportunity' | 'info' | 'urgent';
  title: string;
  description: string;
  actionPrompt?: string;
  actionLabel?: string;
}

export function safeParseJson<T = any>(str: string): T | null {
  if (!str || typeof str !== 'string') return null;
  try {
    return JSON.parse(str);
  } catch {
    try {
      const sanitized = str
        .replace(/\\u1ecp/gi, 'ỉ')
        .replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u')
        .replace(/[\x00-\x1F\x7F-\x9F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? c : ''));
      return JSON.parse(sanitized);
    } catch {
      try {
        const relaxed = str
          .replace(/\\u1ecp/gi, 'ỉ')
          .replace(/\\u(?![0-9a-fA-F]{4})/g, '');
        return JSON.parse(relaxed);
      } catch {
        return null;
      }
    }
  }
}

export function normalizePlainObject(val: unknown): Record<string, any> {
  if (!val) return {};
  if (typeof val === 'string') {
    const parsed = safeParseJson<any>(val);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }
  if (typeof val === 'object' && !Array.isArray(val)) {
    return val as Record<string, any>;
  }
  return {};
}

export function normalizeActionProposal(raw: any): ActionProposal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const baseParams = normalizePlainObject(raw.params);
  const extraParams = normalizePlainObject(raw.params_json);
  const params = { ...baseParams, ...extraParams };
  const actionType = (raw.action_type || params.action_type || 'leave') as ActionProposal['action_type'];
  return {
    action_type: actionType,
    title: raw.title || params.title || (actionType === 'leave' ? 'Đề xuất nghỉ phép' : 'Đề xuất hành động ERP'),
    summary: raw.summary || params.summary || 'Đề xuất từ AI IDEAS',
    params,
  };
}

export interface ErpCardTagData {
  entity_type: 'contact' | 'expense' | 'deposit' | 'task' | 'approval' | 'system' | string;
  entity_id?: number | string;
  title: string;
  subtitle?: string;
  status?: string;
  direct_url?: string;
  relative_url?: string;
  action_label?: string;
  extra_info?: string;
}

export interface ClarifyOptionItem {
  id?: string | number;
  label: string;
  sub?: string;
  prompt: string;
  entity_type?: string;
}

export interface ParsedChatTags {
  cleanContent: string;
  proposal: ActionProposal | null;
  proposals: ActionProposal[];
  chart: DynamicChartData | null;
  nextBestActions: string[] | null;
  clarifyOptions: ClarifyOptionItem[] | null;
  proactiveInsight: ProactiveInsightData | null;
  erpCard: ErpCardTagData | null;
  erpCards: ErpCardTagData[];
}

export type ParsedChatMessageTags = ParsedChatTags;

const PARSE_TAG_CACHE = new Map<string, ParsedChatTags>();

export function clearChatTagParserCache(): void {
  PARSE_TAG_CACHE.clear();
}

export function parseAllChatTags(rawContent: string, skipCache = false): ParsedChatTags {
  if (!rawContent || typeof rawContent !== 'string') {
    return {
      cleanContent: '',
      proposal: null,
      proposals: [],
      chart: null,
      nextBestActions: null,
      clarifyOptions: null,
      proactiveInsight: null,
      erpCard: null,
      erpCards: [],
    };
  }

  if (!skipCache) {
    const cached = PARSE_TAG_CACHE.get(rawContent);
    if (cached) {
      return cached;
    }
  }

  let text = rawContent;
  const proposals: ActionProposal[] = [];
  let chart: DynamicChartData | null = null;
  let nextBestActions: string[] | null = null;
  let clarifyOptions: ClarifyOptionItem[] | null = null;
  let proactiveInsight: ProactiveInsightData | null = null;
  const erpCards: ErpCardTagData[] = [];

  // 1. Parse & Strip ALL ACTION_PROPOSAL tags (<<<ACTION_PROPOSAL:...>>> and [[ACTION_PROPOSAL:...]])
  const proposalMatches = [
    ...Array.from(text.matchAll(/<<<ACTION_PROPOSAL:\s*(\{[\s\S]*?\})\s*>>>/g)),
    ...Array.from(text.matchAll(/\[\[ACTION_PROPOSAL:\s*(\{[\s\S]*?\})\s*\]\]/g)),
  ];
  for (const proposalMatch of proposalMatches) {
    text = text.replace(proposalMatch[0], '').trim();
    const raw = safeParseJson<any>(proposalMatch[1]);
    const normalized = normalizeActionProposal(raw);
    if (normalized) {
      proposals.push(normalized);
    } else {
      const typeMatch = proposalMatch[1].match(/"action_type"\s*:\s*"([^"]+)"/);
      if (typeMatch) {
        const actionType = typeMatch[1] as ActionProposal['action_type'];
        const summaryMatch = proposalMatch[1].match(/"summary"\s*:\s*"([^"]+)"/);
        const reasonMatch = proposalMatch[1].match(/"reason"\s*:\s*"([^"]+)"/);
        const startDateMatch = proposalMatch[1].match(/"start_date"\s*:\s*"([^"]+)"/);
        const endDateMatch = proposalMatch[1].match(/"end_date"\s*:\s*"([^"]+)"/);
        const todayLocal = new Date().toLocaleDateString('sv-SE');
        proposals.push({
          action_type: actionType,
          title: actionType === 'leave' ? 'Đề xuất nghỉ phép' : 'Đề xuất hành động ERP',
          summary: summaryMatch ? summaryMatch[1] : 'Đề xuất từ AI IDEAS',
          params: {
            leave_type: 'unpaid',
            start_date: startDateMatch ? startDateMatch[1] : todayLocal,
            end_date: endDateMatch ? endDateMatch[1] : todayLocal,
            total_days: 1,
            reason: reasonMatch ? reasonMatch[1] : 'Việc cá nhân'
          }
        });
      }
    }
  }
  const proposal: ActionProposal | null = proposals[0] || null;

  // 2. Parse & Strip DYNAMIC_CHART
  const chartMatch = text.match(/<<<DYNAMIC_CHART:\s*(\{[\s\S]*?\})\s*>>>/) || text.match(/\[\[DYNAMIC_CHART:\s*(\{[\s\S]*?\})\s*\]\]/);
  if (chartMatch) {
    text = text.replace(chartMatch[0], '').trim();
    const rawChart = safeParseJson<any>(chartMatch[1]);
    if (rawChart) {
      const validTypes = ['bar', 'line', 'pie', 'area', 'composed', 'hbar', 'funnel', 'table'];
      const validDatasets: DynamicChartDataset[] = Array.isArray(rawChart.datasets)
        ? rawChart.datasets
            .filter((ds: any) => ds && Array.isArray(ds.data) && ds.data.length > 0)
            .map((ds: any, idx: number) => ({
              key: String(ds.key || `ds_${idx}`),
              label: String(ds.label || ds.title || `Góc nhìn #${idx + 1}`),
              type: validTypes.includes(ds.type) ? ds.type : undefined,
              title: ds.title ? String(ds.title) : undefined,
              subtitle: ds.subtitle || ds.description ? String(ds.subtitle || ds.description) : undefined,
              xAxisKey: ds.xAxisKey || 'name',
              data: ds.data,
              series: Array.isArray(ds.series) && ds.series.length > 0
                ? ds.series
                : [{ dataKey: 'value', name: 'Số lượng' }],
            }))
        : [];

      const primaryData = Array.isArray(rawChart.data) && rawChart.data.length > 0
        ? rawChart.data
        : (validDatasets[0]?.data || []);

      if (primaryData.length > 0) {
        const primaryType = validTypes.includes(rawChart.type)
          ? rawChart.type
          : (validDatasets[0]?.type || 'bar');
        chart = {
          type: primaryType,
          title: rawChart.title || validDatasets[0]?.title || 'Biểu đồ phân tích số liệu',
          subtitle: rawChart.subtitle || rawChart.description || validDatasets[0]?.subtitle || '',
          description: rawChart.description || rawChart.subtitle || validDatasets[0]?.subtitle || '',
          xAxisKey: rawChart.xAxisKey || validDatasets[0]?.xAxisKey || 'name',
          data: primaryData,
          series: Array.isArray(rawChart.series) && rawChart.series.length > 0
            ? rawChart.series
            : (validDatasets[0]?.series || [{ dataKey: 'value', name: 'Số lượng' }]),
          datasets: validDatasets.length > 0 ? validDatasets : undefined,
        };
      }
    }
  }

  // 3. Parse & Strip PROACTIVE_INSIGHT (supports both <<<...>>> and [[...]])
  const insightMatch =
    text.match(/<<<PROACTIVE_INSIGHT:\s*(\{[\s\S]*?\})\s*>>>/) ||
    text.match(/\[\[PROACTIVE_INSIGHT:\s*(\{[\s\S]*?\})\s*\]\]/);
  if (insightMatch) {
    text = text.replace(insightMatch[0], '').trim();
    const rawInsight = safeParseJson<any>(insightMatch[1]);
    if (rawInsight && (rawInsight.title || rawInsight.description)) {
      proactiveInsight = {
        type: rawInsight.type || 'warning',
        title: rawInsight.title || 'Cảnh báo vận hành',
        description: rawInsight.description || '',
        actionPrompt: rawInsight.actionPrompt || rawInsight.action_prompt || '',
        actionLabel: rawInsight.actionLabel || rawInsight.action_label || 'Xử lý ngay',
      };
    }
  }

  // 4. Parse & Strip NEXT_BEST_ACTIONS (supports both <<<...>>> and [[...]])
  const actionsMatch =
    text.match(/<<<NEXT_BEST_ACTIONS:\s*(\[[\s\S]*?\])\s*>>>/) ||
    text.match(/\[\[NEXT_BEST_ACTIONS:\s*(\[[\s\S]*?\])\s*\]\]/);
  if (actionsMatch) {
    text = text.replace(actionsMatch[0], '').trim();
    const rawActions = safeParseJson<any[]>(actionsMatch[1]);
    if (Array.isArray(rawActions) && rawActions.length > 0) {
      const cleanList = rawActions
        .map((item) => (typeof item === 'string' ? item.trim() : typeof item?.text === 'string' ? item.text.trim() : ''))
        .filter((t) => t.length > 0);
      if (cleanList.length > 0) {
        nextBestActions = cleanList;
      }
    }
  }

  // 4.1 Parse & Strip CLARIFY_OPTIONS
  const clarifyMatch = text.match(/<<<CLARIFY_OPTIONS:\s*(\[[\s\S]*?\])\s*>>>/) || text.match(/\[\[CLARIFY_OPTIONS:\s*(\[[\s\S]*?\])\s*\]\]/);
  if (clarifyMatch) {
    text = text.replace(clarifyMatch[0], '').trim();
    const rawClarify = safeParseJson<any[]>(clarifyMatch[1]);
    if (Array.isArray(rawClarify) && rawClarify.length > 0) {
      const parsedOptions: ClarifyOptionItem[] = rawClarify
        .map((item): ClarifyOptionItem | null => {
          if (typeof item === 'string') {
            return { label: item.trim(), prompt: item.trim() };
          }
          if (item && typeof item === 'object') {
            const label = String(item.label || item.title || item.name || '').trim();
            const prompt = String(item.prompt || item.action_prompt || label).trim();
            if (!label) return null;
            return {
              id: item.id ?? item.entity_id,
              label,
              sub: item.sub || item.subtitle || item.extra_info || undefined,
              prompt,
              entity_type: item.entity_type || undefined,
            };
          }
          return null;
        })
        .filter((opt): opt is ClarifyOptionItem => opt !== null);
      if (parsedOptions.length > 0) {
        clarifyOptions = parsedOptions;
      }
    }
  }

  // 5. Parse & Strip ALL ERP_CARD tags (<<<ERP_CARD:...>>> and [[ERP_CARD:...]])
  const erpCardMatches = [
    ...Array.from(text.matchAll(/<<<ERP_CARD:\s*(\{[\s\S]*?\})\s*>>>/g)),
    ...Array.from(text.matchAll(/\[\[ERP_CARD:\s*(\{[\s\S]*?\})\s*\]\]/g)),
  ];
  for (const erpCardMatch of erpCardMatches) {
    text = text.replace(erpCardMatch[0], '').trim();
    const rawCard = safeParseJson<any>(erpCardMatch[1]);
    if (rawCard && rawCard.title) {
      const eType = String(rawCard.entity_type || 'contact').toLowerCase();
      // If entity_type is contact, but title or subtitle mentions staff/employee/nhân viên, suppress displaying as Lead card
      const isStaffContext = /nhân viên|nhân sự|digital marketing|marketing|sale admin|kế toán|công nghệ|hr|developer/i.test(rawCard.subtitle || '') ||
                             /nhân viên|nhân sự/i.test(rawCard.title || '');
      erpCards.push({
        entity_type: isStaffContext && eType === 'contact' ? 'employee' : (rawCard.entity_type || 'contact'),
        entity_id: rawCard.entity_id,
        title: rawCard.title,
        subtitle: rawCard.subtitle || '',
        status: rawCard.status || '',
        direct_url: rawCard.direct_url || '',
        relative_url: rawCard.relative_url || '',
        action_label: rawCard.action_label || (isStaffContext ? 'Mở hồ sơ nhân sự' : 'Mở xem chi tiết'),
        extra_info: rawCard.extra_info || '',
      });
    }
  }
  const erpCard: ErpCardTagData | null = erpCards[0] || null;

  // 6. Clean any residual <<<SAVE_MEMORY:...>>> or [[SAVE_MEMORY:...]] tags if present
  text = text.replace(/<<<SAVE_MEMORY:\s*(\{[\s\S]*?\})\s*>>>/g, '').trim();
  text = text.replace(/\[\[SAVE_MEMORY:\s*(\{[\s\S]*?\})\s*\]\]/g, '').trim();

  // 6.1 Clean any machine phrases like '(Zero-Trust)' or 'Zero-Trust'
  text = text.replace(/\s*\((?:Zero-Trust|Zero Trust)\)/gi, '');
  text = text.replace(/\b(?:Zero-Trust|Zero Trust)\b/gi, 'bảo mật');

  // 7. Streaming Anti-Flicker Guard: Strip any unclosed <<<TAG: or [[TAG: partial content at the very end of stream
  text = text.replace(/(?:<<<|\[\[)[A-Z_]+(?::[\s\S]*)?$/, '').trim();
  text = text.replace(/(?:<<<?|<<|\[\[?)$/, '').trim();

  const parsedResult: ParsedChatTags = {
    cleanContent: text,
    proposal,
    proposals,
    chart,
    nextBestActions,
    clarifyOptions,
    proactiveInsight,
    erpCard,
    erpCards,
  };

  if (!skipCache) {
    if (PARSE_TAG_CACHE.size >= 500) {
      const oldestKey = PARSE_TAG_CACHE.keys().next().value;
      if (oldestKey !== undefined) {
        PARSE_TAG_CACHE.delete(oldestKey);
      }
    }
    PARSE_TAG_CACHE.set(rawContent, parsedResult);
  }

  return parsedResult;
}
