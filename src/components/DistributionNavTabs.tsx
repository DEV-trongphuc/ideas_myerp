import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { GitBranch, Webhook, Link2, Scale } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface DistributionNavTabsProps {
  currentTab?: 'rules' | 'rounds' | 'integrations' | 'fair-share';
}

export const DistributionNavTabs: React.FC<DistributionNavTabsProps> = ({ currentTab }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useLanguage();

  const tabs = [
    {
      id: 'rules',
      name: t('Quy tắc định tuyến'),
      path: '/rules',
      icon: Webhook
    },
    {
      id: 'rounds',
      name: t('Vòng phân bổ'),
      path: '/rounds',
      icon: GitBranch
    },
    {
      id: 'integrations',
      name: t('Tích hợp Data'),
      path: '/integrations',
      icon: Link2
    },
    {
      id: 'fair-share',
      name: t('Kiểm toán Công bằng'),
      path: '/fair-share',
      icon: Scale
    }
  ];

  const activeId = currentTab || (
    location.pathname.startsWith('/rounds') ? 'rounds' :
    location.pathname.startsWith('/integrations') ? 'integrations' :
    location.pathname.startsWith('/fair-share') ? 'fair-share' : 'rules'
  );

  return (
    <div style={{ marginBottom: '1.25rem', maxWidth: '100%', overflowX: 'auto', scrollbarWidth: 'none' }} className="no-scrollbar">
      <div
        role="tablist"
        aria-label={t('Điều hướng phân bổ Lead')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '3px',
          borderRadius: '10px',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          gap: '2px',
          maxWidth: '100%'
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeId === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => navigate(tab.path)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                height: '32px',
                padding: '0 14px',
                borderRadius: '7px',
                border: 'none',
                background: isActive ? '#ffffff' : 'transparent',
                color: isActive ? '#BD1D2D' : '#64748b',
                fontSize: '0.82rem',
                fontWeight: isActive ? 700 : 600,
                cursor: 'pointer',
                transition: 'background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease',
                whiteSpace: 'nowrap',
                boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none'
              }}
            >
              <Icon size={15} color={isActive ? '#BD1D2D' : '#64748b'} strokeWidth={isActive ? 2.25 : 2} />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
