import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { fetchAPI } from '../utils/api';

export const DemoEntry: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useLanguage();

  useEffect(() => {
    if (import.meta.env.PROD) {
      navigate('/login', { replace: true });
      return;
    }

    // Set global demo mode flag (dev-only)
    localStorage.setItem('IDEAS_DEMO_MODE', 'true');

    // Clear out old real tokens
    localStorage.removeItem('Ideas_token');
    localStorage.removeItem('Ideas_user');

    // Dev-only demo user
    const demoToken = 'demo_token_dev_only';
    const demoUser = { id: 1, email: 'demo@myerp.local', role: 'admin' as const, is_confirmed: 1, username: 'demo_admin', name: 'Demo Admin' };

    login(demoToken, demoUser);

    fetchAPI('reset_demo').catch(err => console.error('Failed to reset demo DB:', err));

    const timer = window.setTimeout(() => {
      navigate('/', { replace: true });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [login, navigate]);

  return (
    <div style={{ height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', position: 'fixed', top: 0, left: 0, zIndex: 9999 }}>
      <Loader2 size={48} className="spin" style={{ color: '#3b82f6', marginBottom: 20 }} />
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 8 }}>{t("Khởi tạo môi trường Demo...")}</h2>
      <p style={{ color: '#94a3b8' }}>{t("Đang nạp dữ liệu ảo và chuẩn bị giao diện.")}</p>
      <style>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
