/**
 * Pure formatting, parsing, and type definitions for Approval items and drawers.
 * Separated from React components to preserve Vite React Fast Refresh compatibility.
 */

export interface ApprovalItem {
  id: number;
  type: 'leave' | 'advance' | 'expense' | 'checkin' | 'attendance_bulk' | 'po' | 'purchase_order' | 'so' | 'sales_order' | 'deposit' | 'quote';
  user_id?: number;
  created_by?: number;
  employee_name?: string;
  title: string;
  description: string;
  status?: string;
  created_at: string;
  updated_at?: string;
  currency?: string;
  amount?: number;
  approver_id?: number;
  approver_id_2?: number;
  approver_id_3?: number;
  approver_name?: string;
  status_level_1?: string;
  status_level_2?: string;
  manager_id?: number;
  related_user_ids?: number[];
  is_following?: boolean;
  is_draft?: boolean;
  draft_id?: string;
  is_refunded?: number | boolean;
  refunded_at?: string | null;
}

export function resolveLateEarlySubType(obj: any, fallbackReason?: string): 'early' | 'late' {
  const explicit = String(obj?.late_early_type || obj?.ot_type || '').toLowerCase().trim();
  if (explicit === 'early' || explicit === 'late') {
    return explicit;
  }
  const r = String(obj?.raw_reason || obj?.reason || fallbackReason || obj?.description || obj?.title || '').normalize('NFC');
  const hasEarlyKw = /về\s*sớm|ve\s*som/i.test(r);
  const hasLateKw = /đi\s*(?:muộn|trễ)|di\s*(?:muon|tre)/i.test(r);
  if (hasEarlyKw && !hasLateKw) return 'early';
  if (hasLateKw && !hasEarlyKw) return 'late';
  const startStr = String(obj?.start_date || obj?.from_date || '');
  const timeMatch = startStr.match(/(?:T|\s)(\d{1,2}):(\d{2})/);
  if (timeMatch) {
    const hour = Number(timeMatch[1]);
    if (!isNaN(hour) && hour >= 12) return 'early';
  }
  return 'late';
}

export function cleanLeaveReasonText(raw?: string, keepTrailingBrackets = false): string {
  if (!raw) return '';
  let r = String(raw).trim().replace(/^["']+|["']+$/g, '');

  let trailingAttachments = '';
  const attMatch = r.match(/(\s*\[Tài liệu đính kèm[^\]]*\]:[\s\S]*)$/i);
  if (attMatch) {
    trailingAttachments = attMatch[1];
    r = r.slice(0, -attMatch[1].length);
  }

  const trailingTags: string[] = [];
  while (true) {
    const mTag = r.match(/\s*(\[(?:Khấu trừ thực tế|Đã duyệt WFH|Đã tự động cộng|Ngày nghỉ chi tiết|Ngày nghỉ lẻ|Ngày WFH lẻ|Lặp lại định kỳ|Từ chối)[^\]]*\])\s*$/i);
    if (!mTag) break;
    trailingTags.unshift(mTag[1]);
    r = r.slice(0, -mTag[0].length);
  }

  r = r.replace(/(?:\s*-\s*Cấp\s*\d+(?:\s*\([^)]*\))?)+$/gi, '');

  let guard = 0;
  let prev: string;
  do {
    prev = r;
    r = r
      .replace(/^\[(?:Đăng ký làm việc từ xa|Tăng ca|Đi muộn\/Về sớm|Nghỉ phép)\]\s*(?:[^:\-\n]+:\s*)?/i, '')
      .replace(/^(?:Đăng ký WFH|Đăng ký OT|Đăng ký đi muộn\/về sớm|Đăng ký đi trễ\s*\/\s*về sớm|Đăng ký đi muộn|Đăng ký đi trễ|Đăng ký về sớm|Đăng ký công tác|Đơn xin nghỉ phép(?:\s*\([^)]*\))?|Đề xuất nghỉ[^:-]*|Đề xuất tạm ứng lương|Đề nghị tạm ứng lương)\s*:?\s*/i, '')
      .replace(/^\[(?:Tỷ lệ hưởng lương|Hình thức|Nghỉ buổi sáng|Nghỉ buổi chiều|Nghỉ cả ngày|Nghỉ nhiều ngày|Nghỉ ngắt quãng|Làm việc từ xa)[^\]]*\]\s*/i, '')
      .replace(/^(?:Thời gian:\s*)?\d{1,2}\/\d{1,2}\/\d{4}(?:\s*-\s*\d{1,2}\/\d{1,2}\/\d{4})?\s*(?:\([\d.,]+\s*ngày(?:\/giờ)?\))?\s*(?:-\s*)?/i, '')
      .replace(/^Thời gian:\s*[^.]+\.\s*/i, '')
      .replace(/^Lý do:\s*/i, '')
      .replace(/^[\s"'-]+|[\s"'-]+$/g, '');
    guard++;
  } while (r !== prev && guard < 10);

  r = r.replace(/(?:^|\s*-\s*)\d{1,2}\/\d{1,2}\/\d{4}(?:\s*-\s*\d{1,2}\/\d{1,2}\/\d{4})?\s*\([\d.,]+\s*ngày(?:\/giờ)?\)\s*(?=-|$)/gi, '');
  r = r.replace(/^[\s"'-]+|[\s"'-]+$/g, '');

  if (r.includes(' - ')) {
    const parts = r.split(/\s+-\s+/);
    const uniqueParts: string[] = [];
    for (const part of parts) {
      const pClean = part.trim().replace(/^["']+|["']+$/g, '');
      if (!pClean) continue;
      if (/^\d{1,2}\/\d{1,2}\/\d{4}(?:\s*-\s*\d{1,2}\/\d{1,2}\/\d{4})?(?:\s*\([\d.,]+\s*ngày\))?$/i.test(pClean)) continue;
      if (/^Cấp\s*\d+(?:\s*\([^)]*\))?$/i.test(pClean)) continue;
      const pLower = pClean.toLowerCase();
      let exists = false;
      for (let i = 0; i < uniqueParts.length; i++) {
        const exLower = uniqueParts[i].toLowerCase();
        if (pLower === exLower || exLower.includes(pLower)) {
          exists = true;
          break;
        }
        if (pLower.includes(exLower)) {
          uniqueParts[i] = pClean;
          exists = true;
          break;
        }
      }
      if (!exists) uniqueParts.push(pClean);
    }
    r = uniqueParts.join(' - ');
  }

  if (keepTrailingBrackets) {
    if (trailingTags.length > 0) {
      r = (r + ' ' + Array.from(new Set(trailingTags)).join(' ')).trim();
    }
    if (trailingAttachments) {
      r += trailingAttachments;
    }
  }
  return r.trim();
}

export const formatWaitDuration = (fromTime: any): string => {
  if (!fromTime) return '';
  const d = new Date(fromTime);
  if (isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  if (diffMs <= 0) return 'Vừa gửi';

  const totalMinutes = Math.floor(diffMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) {
    return `${days} ngày ${hours} giờ ${mins} phút`;
  }
  if (hours > 0) {
    return `${hours} giờ ${mins} phút`;
  }
  if (mins > 0) {
    return `${mins} phút`;
  }
  return 'Vừa gửi';
};

export const parseMoneyVn = (val: string | number | undefined | null, currency: string = 'VND'): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  const raw = String(val).trim();
  if (!raw) return 0;
  if (currency !== 'VND') {
    const cleaned = raw.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
    const dotParts = cleaned.split('.');
    const normalized = dotParts.length > 2
      ? `${dotParts.slice(0, -1).join('')}.${dotParts[dotParts.length - 1]}`
      : cleaned;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : 0;
  }
  const digits = raw.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
};

export const formatApprovalCurrency = (amount: number | string, currency: string = 'VND') => {
  const normCurrency = currency === 'EURO' ? 'EUR' : currency;
  const num = Number(amount || 0);
  if (normCurrency === 'VND') {
    return Math.round(num).toLocaleString('vi-VN') + ' đ';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normCurrency
  }).format(num);
};

const normalizeExpenseItems = (items: any[]) => {
  if (!Array.isArray(items)) return [];
  return items
    .filter(it => it && typeof it === 'object')
    .map((it: any) => {
      const rawContent = it.content || it.name || it.description || it.item_name || it.title || it.noi_dung || 'Chi phí';
      return {
        ...it,
        content: rawContent,
        name: rawContent,
        description: it.description || rawContent
      };
    });
};

export const parseExpenseLineItems = (text: string, directItems?: any) => {
  if (Array.isArray(directItems) && directItems.length > 0) {
    return normalizeExpenseItems(directItems);
  }
  if (typeof directItems === 'string' && directItems.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(directItems);
      if (Array.isArray(parsed) && parsed.length > 0) return normalizeExpenseItems(parsed);
    } catch (e) {}
  }
  if (!text) return null;
  const jsonMatch = text.match(/\[JSON_ITEMS\]:\s*(\[[\s\S]*?\])(?=\n\n|\n\[|$)/i);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (Array.isArray(parsed) && parsed.length > 0) return normalizeExpenseItems(parsed);
    } catch (e) {}
  }
  const blockMatch = text.match(/\[Bảng chi tiết thanh toán\]:\s*([\s\S]*?)(?=\n\n\[|\n\[|$)/i);
  if (blockMatch) {
    const lines = blockMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
    const parsedItems: any[] = [];
    for (const line of lines) {
      if (/^Tổng cộng/i.test(line)) continue;
      const m = line.match(/^(\d+)[.)]\s*(.*?)(?:\s*\(SL:\s*([\d.,]+)\s*x\s*([\d.,]+)\s*đ\s*=\s*([\d.,]+)\s*đ\))?$/i);
      if (m) {
        const stt = parseInt(m[1]);
        const name = m[2].trim();
        const qty = m[3] ? parseFloat(m[3].replace(/\./g, '').replace(',', '.')) : 1;
        const price = m[4] ? Math.round(parseFloat(m[4].replace(/\./g, '').replace(',', '.'))) : 0;
        const amt = m[5] ? Math.round(parseFloat(m[5].replace(/\./g, '').replace(',', '.'))) : 0;
        parsedItems.push({ stt, name, content: name, quantity: qty, unit_price: price, price, amount: amt, total: amt });
      }
    }
    if (parsedItems.length > 0) return normalizeExpenseItems(parsedItems);
  }
  const expBlockMatch = text.match(/\[Chi tiết các khoản chi\]:\s*([\s\S]*?)(?=\n\n\[|\n\[|$)/i);
  if (expBlockMatch) {
    const lines = expBlockMatch[1].split('\n').map(l => l.trim()).filter(Boolean);
    const parsedItems: any[] = [];
    for (const line of lines) {
      const m = line.match(/[•\-*]?\s*(?:\[\d+\])?\s*(.*?)\s*-\s*SL:\s*([\d.,]+)\s*-\s*Đơn giá:\s*([0-9.,]+)[^-]*-\s*VAT:\s*(\d+)%/i);
      if (m) {
        const name = m[1].trim();
        const qty = parseFloat(m[2].replace(/\./g, '').replace(',', '.')) || 1;
        const p = parseMoneyVn(m[3]);
        const vat = m[4] ? parseInt(m[4]) : 10;
        parsedItems.push({ name, content: name, quantity: qty, unit_price: p, price: p, vat });
      }
    }
    if (parsedItems.length > 0) return normalizeExpenseItems(parsedItems);
  }
  return null;
};
