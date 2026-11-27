import React from 'react';
import { Phone } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

interface PhoneLinkProps {
  phone: string;
  className?: string;
  style?: React.CSSProperties;
  showIcon?: boolean;
}

export const PhoneLink: React.FC<PhoneLinkProps> = ({
  phone, className = '', style = {}, showIcon = false
}) => {
  const showCall = useUIStore((s) => s.showCall);

  const trimmedPhone = typeof phone === 'string' ? phone.trim() : String(phone ?? '').trim();
  if (!trimmedPhone) {
    return <span style={{ color: 'var(--color-text-muted)', ...style }}>N/A</span>;
  }

  const isMasked = trimmedPhone.includes('*');
  const cleanTel = trimmedPhone.replace(/[^\d+]/g, '');

  if (isMasked || !cleanTel) {
    return (
      <span
        className={`phone-link phone-link-masked ${className}`}
        style={{
          color: 'var(--color-text-muted)',
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontVariantNumeric: 'tabular-nums',
          ...style
        }}
        title={isMasked ? 'Số điện thoại đang được bảo mật' : undefined}
      >
        {showIcon && <Phone size={14} />}
        {trimmedPhone}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (window.innerWidth < 768) {
          window.location.href = `tel:${cleanTel}`;
        } else {
          showCall(trimmedPhone);
        }
      }}
      className={`phone-link ${className}`}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: 'var(--color-primary)',
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        textDecoration: 'none',
        fontVariantNumeric: 'tabular-nums',
        ...style
      }}
      title="Click để gọi qua QR Code"
    >
      {showIcon && <Phone size={14} />}
      {trimmedPhone}
    </button>
  );
};
