export interface ChatSticker {
  id: string;
  name: string;
  category: 'work' | 'mood' | 'celebrate';
  icon: string;
  badgeText: string;
  color: string;
  bgGradient: string;
}

export const CHAT_STICKERS: ChatSticker[] = [
  {
    id: 'stk_approved',
    name: 'Đã Duyệt',
    category: 'work',
    icon: '✅',
    badgeText: 'ĐÃ PHÊ DUYỆT',
    color: '#0F172A',
    bgGradient: 'linear-gradient(135deg, #334155 0%, #0F172A 100%)'
  },
  {
    id: 'stk_deal_closed',
    name: 'Chốt Đơn',
    category: 'work',
    icon: '🎯',
    badgeText: 'CHỐT DEAL THÀNH CÔNG',
    color: '#BD1D2D',
    bgGradient: 'linear-gradient(135deg, #C6333D 0%, #991B1B 100%)'
  },
  {
    id: 'stk_urgent_meeting',
    name: 'Họp Gấp',
    category: 'work',
    icon: '🚨',
    badgeText: 'HỌP KHẨN CẤP',
    color: '#BD1D2D',
    bgGradient: 'linear-gradient(135deg, #E11D48 0%, #991B1B 100%)'
  },
  {
    id: 'stk_deadline',
    name: 'Deadline Tới',
    category: 'work',
    icon: '⏳',
    badgeText: 'HỐI DEADLINE',
    color: '#991B1B',
    bgGradient: 'linear-gradient(135deg, #C6333D 0%, #7F1D1D 100%)'
  },
  {
    id: 'stk_excellent',
    name: 'Xuất Sắc',
    category: 'celebrate',
    icon: '🌟',
    badgeText: 'QUÁ XUẤT SẮC',
    color: '#BD1D2D',
    bgGradient: 'linear-gradient(135deg, #C6333D 0%, #BD1D2D 100%)'
  },
  {
    id: 'stk_heart_thanks',
    name: 'Bắn Tim Cảm Ơn',
    category: 'mood',
    icon: '💖',
    badgeText: 'CẢM ƠN NHIỀU NHA',
    color: '#E11D48',
    bgGradient: 'linear-gradient(135deg, #FB7185 0%, #BD1D2D 100%)'
  },
  {
    id: 'stk_ok_chot',
    name: 'OK Nhất Trí',
    category: 'work',
    icon: '👍',
    badgeText: 'OK CHỐT LUÔN',
    color: '#334155',
    bgGradient: 'linear-gradient(135deg, #475569 0%, #1E293B 100%)'
  },
  {
    id: 'stk_fighting',
    name: 'Cố Lên Nào',
    category: 'mood',
    icon: '💪',
    badgeText: 'CỐ LÊN ANH EM',
    color: '#BD1D2D',
    bgGradient: 'linear-gradient(135deg, #C6333D 0%, #334155 100%)'
  },
  {
    id: 'stk_coffee_break',
    name: 'Cafe Đi',
    category: 'mood',
    icon: '☕',
    badgeText: 'LÀM TÁCH CAFE NHÉ',
    color: '#475569',
    bgGradient: 'linear-gradient(135deg, #64748B 0%, #334155 100%)'
  },
  {
    id: 'stk_party',
    name: 'Ăn Mừng',
    category: 'celebrate',
    icon: '🎉',
    badgeText: 'PARTY THÔI NÀO',
    color: '#BD1D2D',
    bgGradient: 'linear-gradient(135deg, #C6333D 0%, #991B1B 100%)'
  },
  {
    id: 'stk_checkin_done',
    name: 'Đã Check-in',
    category: 'work',
    icon: '⏰',
    badgeText: 'ĐÃ VÀO CA LÀM',
    color: '#1E293B',
    bgGradient: 'linear-gradient(135deg, #334155 0%, #0F172A 100%)'
  },
  {
    id: 'stk_on_leave',
    name: 'Xin Nghỉ',
    category: 'work',
    icon: '🌴',
    badgeText: 'HÔM NAY EM NGHỈ PHÉP',
    color: '#64748b',
    bgGradient: 'linear-gradient(135deg, #94a3b8 0%, #475569 100%)'
  }
];
