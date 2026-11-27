import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LogIn, Lock, Mail, Share2, Bell, BarChart3, Sparkles, ShieldCheck, Zap, Bot, Shield, KeyRound, Loader2, Eye, EyeOff, Smartphone, Copy, Check } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { fetchAPI } from '../utils/api';
import { API_BASE, RECAPTCHA_SITE_KEY } from '../config/env';
import toast from 'react-hot-toast';
import { CustomModal } from '../components/ui/CustomModal';
import { DigitPinInput } from '../components/ui/DigitPinInput';
import { RecaptchaBox } from '../components/ui/RecaptchaBox';
import { getDefaultRouteByRole } from '../utils/roleUtils';

export const Login = () => {
  const { t } = useLanguage();
  const [email, setEmail] = useState(() => localStorage.getItem('ideas_remembered_email') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => localStorage.getItem('ideas_remember_me') !== 'false');

  useEffect(() => {
    try { localStorage.removeItem('ideas_remembered_pw'); } catch {}
  }, []);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, user, token, isRestoringSession } = useAuth();

  // If user already has an active or silently restored session (e.g. from iPhone HttpOnly cookie),
  // redirect straight into the app instead of showing the login screen again.
  useEffect(() => {
    if (!isRestoringSession && user && token) {
      navigate(getDefaultRouteByRole(user.role || ''), { replace: true });
    }
  }, [isRestoringSession, user, token, navigate]);

  // 2FA Prompt State
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [pending2FAData, setPending2FAData] = useState<{ tempToken: string; type: string; maskedEmail: string } | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [verifying2FA, setVerifying2FA] = useState(false);
  const [twoFaError, setTwoFaError] = useState('');

  // Mandatory 2FA Enrollment State (privileged roles without 2FA enabled yet)
  const [show2FASetupModal, setShow2FASetupModal] = useState(false);
  const [pendingSetup2FA, setPendingSetup2FA] = useState<{
    setupToken: string;
    maskedEmail: string;
    totpSecret: string;
    otpauthUrl: string;
    backupCodes: string[];
  } | null>(null);
  const [setupMethod, setSetupMethod] = useState<'totp' | 'email'>('email');
  const [setupCode, setSetupCode] = useState('');
  const [setupError, setSetupError] = useState('');
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [setupEmailSending, setSetupEmailSending] = useState(false);
  const [setupEmailSent, setSetupEmailSent] = useState(false);
  const [setupEmailCooldown, setSetupEmailCooldown] = useState(0);
  const [copiedSecret, setCopiedSecret] = useState(false);

  // Forgot Password State
  const [showForgotPasswordModal, setShowForgotPasswordModal] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [forgotCooldown, setForgotCooldown] = useState(0);

  // Google reCAPTCHA v2 State
  const [loginRecaptchaToken, setLoginRecaptchaToken] = useState('');
  const [loginRecaptchaResetKey, setLoginRecaptchaResetKey] = useState(0);
  const [forgotStep1CaptchaToken, setForgotStep1CaptchaToken] = useState('');
  const [forgotStep1CaptchaResetKey, setForgotStep1CaptchaResetKey] = useState(0);
  const [forgotStep2CaptchaToken, setForgotStep2CaptchaToken] = useState('');
  const [forgotStep2CaptchaResetKey, setForgotStep2CaptchaResetKey] = useState(0);

  // Synchronous anti-double-submit guard
  const authInFlightRef = useRef(false);

  useEffect(() => {
    if (forgotCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setForgotCooldown(prev => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotCooldown]);

  useEffect(() => {
    if (setupEmailCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setSetupEmailCooldown(prev => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [setupEmailCooldown]);

  const handleAuthGatePayload = (payload: any): boolean => {
    if (!payload) return false;
    if (payload.requires_2fa) {
      setPending2FAData({
        tempToken: payload.temp_token,
        type: payload.two_factor_type,
        maskedEmail: payload.masked_email
      });
      setOtpCode('');
      setTwoFaError('');
      setLoginRecaptchaToken('');
      setLoginRecaptchaResetKey(k => k + 1);
      setShow2FAModal(true);
      return true;
    }
    if (payload.requires_2fa_setup) {
      setPendingSetup2FA({
        setupToken: payload.setup_token,
        maskedEmail: payload.masked_email || '',
        totpSecret: payload.totp_secret || '',
        otpauthUrl: payload.otpauth_url || '',
        backupCodes: Array.isArray(payload.backup_codes) ? payload.backup_codes : [],
      });
      setSetupMethod('email');
      setSetupCode('');
      setSetupError('');
      setSetupEmailSent(false);
      setSetupEmailCooldown(0);
      setCopiedSecret(false);
      setLoginRecaptchaToken('');
      setLoginRecaptchaResetKey(k => k + 1);
      setShow2FASetupModal(true);
      return true;
    }
    return false;
  };

  const handleGoogleLoginResponse = async (response: any) => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api.php?action=login_google`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      const json = await res.json();
      if (json.success) {
        const gatePayload = json.data?.requires_2fa || json.data?.requires_2fa_setup ? json.data : json;
        if (handleAuthGatePayload(gatePayload)) {
          setLoading(false);
          return;
        }
        if (typeof (window as any).showSplashScreen === 'function') {
          (window as any).showSplashScreen('Đang đăng nhập...');
        }
        const userRole = json.user?.role || '';
        const targetPath = getDefaultRouteByRole(userRole);
        login(json.token, json.user, json.refresh_token);
        navigate(targetPath);
      } else {
        setError(t(json.message) || t('Đăng nhập Google thất bại'));
      }
    } catch {
      setError(t('Không thể kết nối đến máy chủ xác thực Google. Vui lòng thử lại.'));
    }
    setLoading(false);
  };

  const googleBtnRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef(false);

  useEffect(() => {
    if (typeof (window as any).hideSplashScreen === 'function') {
      (window as any).hideSplashScreen(true);
    }
    let intervalId: any;
    
    const initGoogle = () => {
      if (renderedRef.current) {
        clearInterval(intervalId);
        return;
      }
      
      if ((window as any).google?.accounts?.id && googleBtnRef.current) {
        (window as any).google.accounts.id.initialize({
          client_id: '641158233158-nsg8a8tdsj3fdgb34dc9tugm8god7tho.apps.googleusercontent.com',
          callback: handleGoogleLoginResponse
        });
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark' || localStorage.getItem('Ideas_theme') === 'dark';
        (window as any).google.accounts.id.renderButton(
          googleBtnRef.current,
          { theme: isDark ? 'filled_blue' : 'outline', size: 'large', width: 320, text: 'signin_with', shape: 'rectangular' }
        );
        renderedRef.current = true;
        clearInterval(intervalId);
      }
    };

    initGoogle();
    intervalId = setInterval(initGoogle, 500);

    return () => clearInterval(intervalId);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authInFlightRef.current || loading) return;
    if (!email.trim() || !password) {
      setError(t('Vui lòng nhập đầy đủ Email và Mật khẩu'));
      return;
    }
    if (RECAPTCHA_SITE_KEY && !loginRecaptchaToken) {
      setError(t('Vui lòng xác nhận "Tôi không phải người máy" trước khi đăng nhập'));
      return;
    }
    authInFlightRef.current = true;
    setLoading(true);
    setError('');

    if (rememberMe) {
      localStorage.setItem('ideas_remember_me', 'true');
      localStorage.setItem('ideas_remembered_email', email.trim());
      try { localStorage.removeItem('ideas_remembered_pw'); } catch {}
    } else {
      localStorage.setItem('ideas_remember_me', 'false');
      localStorage.removeItem('ideas_remembered_email');
      try { localStorage.removeItem('ideas_remembered_pw'); } catch {}
    }

    try {
      const res = await fetchAPI('auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim(),
          password,
          recaptcha_token: loginRecaptchaToken
        })
      });

      if (res.success && res.data) {
        if (handleAuthGatePayload(res.data)) {
          // 2FA or mandatory 2FA setup modal opened
        } else {
          if (typeof (window as any).showSplashScreen === 'function') {
            (window as any).showSplashScreen('Đang tải dữ liệu...');
          }
          const userRole = res.data.user?.role || '';
          const targetPath = getDefaultRouteByRole(userRole);
          login(res.data.access_token, res.data.user, res.data.refresh_token);
          navigate(targetPath);
        }
      } else {
        setError(t(res.message) || t('Email hoặc mật khẩu không chính xác'));
        setLoginRecaptchaToken('');
        setLoginRecaptchaResetKey(k => k + 1);
      }
    } catch (err: any) {
      setError(err.message || t('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'));
      setLoginRecaptchaToken('');
      setLoginRecaptchaResetKey(k => k + 1);
    } finally {
      authInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authInFlightRef.current || verifying2FA) return;
    if (!otpCode || otpCode.trim().length < 6) {
      const msg = 'Vui lòng nhập đủ 6 chữ số mã xác thực';
      setTwoFaError(msg);
      toast.error(msg, { id: 'auth-2fa-error' });
      return;
    }
    authInFlightRef.current = true;
    setVerifying2FA(true);
    setTwoFaError('');
    try {
      const res = await fetchAPI('auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({
          temp_token: pending2FAData?.tempToken,
          otp_code: otpCode.trim()
        })
      });
      if (res.success && res.data) {
        if (typeof (window as any).showSplashScreen === 'function') {
          (window as any).showSplashScreen('Đang tải dữ liệu...');
        }
        const userRole = res.data.user?.role || '';
        const targetPath = getDefaultRouteByRole(userRole);
        login(res.data.access_token, res.data.user, res.data.refresh_token);
        setShow2FAModal(false);
        navigate(targetPath);
      } else {
        const msg = res.message || 'Mã xác thực không chính xác';
        setTwoFaError(msg);
        toast.error(msg, { id: 'auth-2fa-error' });
      }
    } catch (err: any) {
      const msg = err.message || 'Lỗi xác thực 2FA';
      setTwoFaError(msg);
      toast.error(msg, { id: 'auth-2fa-error' });
    } finally {
      authInFlightRef.current = false;
      setVerifying2FA(false);
    }
  };

  const handleSendSetupEmailOtp = async () => {
    if (!pendingSetup2FA?.setupToken || setupEmailSending || setupEmailCooldown > 0) return;
    setSetupEmailSending(true);
    setSetupError('');
    try {
      const res = await fetchAPI('auth/2fa-setup/send-email-otp', {
        method: 'POST',
        body: JSON.stringify({ setup_token: pendingSetup2FA.setupToken })
      });
      if (res.success) {
        setSetupEmailSent(true);
        setSetupEmailCooldown(res.data?.cooldown_seconds || 30);
        toast.success(res.message || 'Đã gửi mã OTP đến email của bạn');
      } else {
        setSetupError(res.message || 'Không thể gửi mã OTP email');
      }
    } catch (err: any) {
      setSetupError(err.message || 'Lỗi gửi mã OTP kích hoạt 2FA');
    } finally {
      setSetupEmailSending(false);
    }
  };

  const handleComplete2FASetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authInFlightRef.current || setupSubmitting || !pendingSetup2FA?.setupToken) return;
    if (!setupCode || setupCode.trim().length < 6) {
      setSetupError('Vui lòng nhập đủ 6 chữ số mã xác thực');
      return;
    }
    authInFlightRef.current = true;
    setSetupSubmitting(true);
    setSetupError('');
    try {
      const res = await fetchAPI('auth/2fa-setup/complete', {
        method: 'POST',
        body: JSON.stringify({
          setup_token: pendingSetup2FA.setupToken,
          type: setupMethod,
          code: setupCode.trim(),
        })
      });
      if (res.success && res.data?.access_token) {
        toast.success('Đã kích hoạt bảo mật 2 lớp (2FA) thành công!');
        if (typeof (window as any).showSplashScreen === 'function') {
          (window as any).showSplashScreen('Đang tải dữ liệu...');
        }
        const userRole = res.data.user?.role || '';
        const targetPath = getDefaultRouteByRole(userRole);
        login(res.data.access_token, res.data.user, res.data.refresh_token);
        setShow2FASetupModal(false);
        navigate(targetPath);
      } else {
        setSetupError(res.message || 'Mã xác thực không chính xác hoặc đã hết hạn');
      }
    } catch (err: any) {
      setSetupError(err.message || 'Lỗi kích hoạt 2FA');
    } finally {
      authInFlightRef.current = false;
      setSetupSubmitting(false);
    }
  };

  const handleSendForgotOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authInFlightRef.current || forgotLoading) return;
    if (!forgotEmail) {
      const msg = 'Vui lòng nhập Email';
      setForgotError(msg);
      toast.error(msg, { id: 'auth-forgot-error' });
      return;
    }
    if (forgotCooldown > 0) {
      const msg = `Vui lòng đợi ${forgotCooldown} giây trước khi gửi lại mã OTP`;
      setForgotError(msg);
      toast.error(msg, { id: 'auth-forgot-error' });
      return;
    }
    if (RECAPTCHA_SITE_KEY && !forgotStep1CaptchaToken) {
      const msg = t('Vui lòng xác nhận "Tôi không phải người máy" trước khi gửi OTP');
      setForgotError(msg);
      toast.error(msg, { id: 'auth-forgot-error' });
      return;
    }
    authInFlightRef.current = true;
    setForgotLoading(true);
    setForgotError('');
    try {
      const res = await fetchAPI('auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail.trim(),
          recaptcha_token: forgotStep1CaptchaToken
        })
      });
      if (res.success) {
        toast.success(res.message || 'Đã gửi mã OTP đến email', { id: 'auth-forgot-success' });
        setForgotCooldown(60);
        setForgotStep1CaptchaToken('');
        setForgotStep2CaptchaToken('');
        setForgotStep2CaptchaResetKey(k => k + 1);
        setForgotStep(2);
      } else {
        const msg = res.message || 'Không thể gửi mã OTP';
        setForgotError(msg);
        toast.error(msg, { id: 'auth-forgot-error' });
        setForgotStep1CaptchaToken('');
        setForgotStep1CaptchaResetKey(k => k + 1);
      }
    } catch (err: any) {
      const msg = err.message || 'Lỗi gửi yêu cầu';
      setForgotError(msg);
      toast.error(msg, { id: 'auth-forgot-error' });
      setForgotStep1CaptchaToken('');
      setForgotStep1CaptchaResetKey(k => k + 1);
    } finally {
      authInFlightRef.current = false;
      setForgotLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authInFlightRef.current || forgotLoading) return;
    if (!forgotOtp || !forgotNewPassword) {
      const msg = 'Vui lòng nhập đầy đủ OTP và Mật khẩu mới';
      setForgotError(msg);
      toast.error(msg, { id: 'auth-forgot-error' });
      return;
    }
    const isLongEnough = forgotNewPassword.length >= 8;
    const hasLetter = /[A-Za-z]/.test(forgotNewPassword);
    const hasDigit = /\d/.test(forgotNewPassword);
    if (!isLongEnough || !hasLetter || !hasDigit) {
      const msg = 'Mật khẩu mới phải có ít nhất 8 ký tự, bao gồm cả chữ và số';
      setForgotError(msg);
      toast.error(msg, { id: 'auth-forgot-error' });
      return;
    }
    if (RECAPTCHA_SITE_KEY && !forgotStep2CaptchaToken) {
      const msg = t('Vui lòng xác nhận "Tôi không phải người máy" trước khi đặt lại mật khẩu');
      setForgotError(msg);
      toast.error(msg, { id: 'auth-forgot-error' });
      return;
    }
    authInFlightRef.current = true;
    setForgotLoading(true);
    setForgotError('');
    try {
      const res = await fetchAPI('auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail.trim(),
          otp_code: forgotOtp.trim(),
          new_password: forgotNewPassword,
          recaptcha_token: forgotStep2CaptchaToken
        })
      });
      if (res.success) {
        toast.success(res.message || 'Đặt lại mật khẩu thành công!', { id: 'auth-forgot-success' });
        setEmail(forgotEmail.trim());
        setPassword('');
        setForgotOtp('');
        setForgotNewPassword('');
        setForgotError('');
        setForgotStep2CaptchaToken('');
        setLoginRecaptchaToken('');
        setLoginRecaptchaResetKey(k => k + 1);
        setShowForgotPasswordModal(false);
      } else {
        const msg = res.message || 'Không thể đặt lại mật khẩu';
        setForgotError(msg);
        toast.error(msg, { id: 'auth-forgot-error' });
        setForgotStep2CaptchaToken('');
        setForgotStep2CaptchaResetKey(k => k + 1);
      }
    } catch (err: any) {
      const msg = err.message || 'Lỗi đặt lại mật khẩu';
      setForgotError(msg);
      toast.error(msg, { id: 'auth-forgot-error' });
      setForgotStep2CaptchaToken('');
      setForgotStep2CaptchaResetKey(k => k + 1);
    } finally {
      authInFlightRef.current = false;
      setForgotLoading(false);
    }
  };

  const ALL_MODULES = [
    { title: t('Tích Hợp Zalo Bot'), sub: t('Quản lý ticket, nhận thông báo chia số và phản hồi duyệt lỗi tức thì trên Zalo.'), icon: Bot, color: 'linear-gradient(135deg, #3b82f6, #6366f1)' },
    { title: t('Chia Data Thông Minh'), sub: t('Tự động phân bổ data theo vòng lặp, xử lý chống trùng lặp và đền bù lỗi.'), icon: Share2, color: 'linear-gradient(135deg, #f43f5e, #be123c)' },
    { title: t('Thông Báo Email'), sub: t('Gửi mail cảnh báo trùng lặp, thông báo kết quả duyệt ticket ngay lập tức.'), icon: Bell, color: 'linear-gradient(135deg, #f59e0b, #d97706)' },
    { title: t('Báo Cáo & Thống Kê'), sub: t('Báo cáo thống kê gửi hàng ngày theo khung giờ, đo lường hiệu suất Sale.'), icon: BarChart3, color: 'linear-gradient(135deg, #10b981, #059669)' },
    { title: t('Đồng Hồ Bảo Mật'), sub: t('Tự động thu hồi khách hàng không tương tác và giải phóng về Databank chung.'), icon: ShieldCheck, color: 'linear-gradient(135deg, #a855f7, #6d28d9)' },
    { title: t('Bù Lượt Lỗi Ca Trực'), sub: t('Cơ chế đền bù lượt lỗi, bù lượt thiếu do nghỉ phép hoặc trực ngoài giờ.'), icon: Zap, color: 'linear-gradient(135deg, #06b6d4, #0891b2)' }
  ];

  const row1 = ALL_MODULES.slice(0, 3);
  const row2 = ALL_MODULES.slice(3);

  const isDemoMode = localStorage.getItem('IDEAS_DEMO_MODE') === 'true';

  return (
    <div className="login-container">
      {/* Background Decorative Blur Gradients */}
      <div className="blur-glow-1" />
      <div className="blur-glow-2" />

      {/* Left Side: Brand & Visual Marquee */}
      <div className="left-side">
        <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: '3rem' }}>
          <a href="https://portfo-turnio.vercel.app/" target="_blank" rel="noopener noreferrer" className="badge-container animate-float" style={{ textDecoration: 'none', display: 'inline-flex', width: 'fit-content' }}>
            <Sparkles size={14} style={{ color: '#f87171' }} />
            <span style={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px', color: '#fca5a5' }}>
              Power by TurnioDEV
            </span>
          </a>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <h1 className="title-main">
              MYERP <br />
              <span className="title-gradient">ENTERPRISE SYSTEM.</span>
            </h1>
            <p className="subtitle-main">
              {t("Giải pháp toàn diện giúp tự động hóa quy trình phân bổ khách hàng, tối ưu hóa điểm chạm và tăng tỷ lệ chuyển đổi.")}
            </p>
          </div>

          {/* Scrolling Features Marquee */}
          <div className="marquee-wrapper pause-on-hover mask-fade-edges">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', position: 'relative' }}>
              {/* Row 1 */}
              <div className="marquee-row animate-slide-infinite">
                {[...row1, ...row1, ...row1].map((f, i) => (
                  <div key={`r1-${i}`} className="marquee-item">
                    <div className="icon-box" style={{ background: f.color }}>
                      <f.icon size={20} color="white" />
                    </div>
                    <h3 className="item-title">{f.title}</h3>
                    <p className="item-sub">{f.sub}</p>
                  </div>
                ))}
              </div>

              {/* Row 2 */}
              <div className="marquee-row animate-slide-infinite-reverse">
                {[...row2, ...row2, ...row2].map((f, i) => (
                  <div key={`r2-${i}`} className="marquee-item">
                    <div className="icon-box" style={{ background: f.color }}>
                      <f.icon size={20} color="white" />
                    </div>
                    <h3 className="item-title">{f.title}</h3>
                    <p className="item-sub">{f.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Circular Lines Decor */}
        <div className="circle-decor-1" />
        <div className="circle-decor-2" />
        <div className="circle-decor-3" />
      </div>

      {/* Right Side: Identity Check Card */}
      <div className="right-side">
        <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Animated rotated logo container */}
            <div className="logo-box">
              <img src="/LOGO.webp" className="logo-img" style={{ objectFit: 'contain' }} alt="IDEAS Logo" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'white', letterSpacing: '-0.5px', margin: 0 }}>
                {t('Đăng Nhập Hệ Thống')}
              </h2>
              <p style={{ color: '#94a3b8', fontWeight: 500, fontSize: '0.875rem', marginTop: '6px', marginBottom: 0 }}>
                {t('Nhập thông tin tài khoản để truy cập hệ thống')}
              </p>
            </div>
          </div>

          {error && (
            <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '14px', fontSize: '13px', fontWeight: 600, color: '#f87171', textAlign: 'center', lineHeight: 1.4 }}>
              {error}
            </div>
          )}

          <div className="login-card">
            <form onSubmit={handleLogin} className="login-form">
              {/* Email */}
              <div>
                <label className="form-label-custom">
                  {t('Email Doanh Nghiệp')}
                </label>
                <div className="input-wrapper">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field"
                    placeholder="name@company.com"
                    autoComplete="username"
                  />
                  <div className="input-icon">
                    <Mail size={18} />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="form-label-custom">
                  {t('Mật Khẩu')}
                </label>
                <div className="input-wrapper">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field"
                    placeholder="••••••••"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="input-icon-btn"
                  >
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </div>
              </div>

              {/* Options row: Remember Me & Forgot Password */}
              <div className="options-row">
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    style={{ accentColor: 'var(--color-primary, #BD1D2D)', width: '15px', height: '15px', cursor: 'pointer', borderRadius: '4px' }}
                  />
                  <span>{t('Ghi nhớ tài khoản')}</span>
                </label>

                <button
                  type="button"
                  onClick={() => {
                    setForgotEmail(email || '');
                    setForgotError('');
                    setForgotStep1CaptchaToken('');
                    setForgotStep1CaptchaResetKey(k => k + 1);
                    setForgotStep2CaptchaToken('');
                    setForgotStep2CaptchaResetKey(k => k + 1);
                    setForgotStep(1);
                    setShowForgotPasswordModal(true);
                  }}
                  className="forgot-btn"
                >
                  {t('Quên mật khẩu?')}
                </button>
              </div>

              {/* Google reCAPTCHA v2 Checkbox */}
              <RecaptchaBox
                theme="dark"
                resetKey={loginRecaptchaResetKey}
                onChange={(tok) => {
                  setLoginRecaptchaToken(tok);
                  if (tok && error) setError('');
                }}
              />

              {/* Submit Button */}
              <button
                type="submit"
                className="submit-btn-custom"
                disabled={loading}
                style={{ marginTop: '0.25rem' }}
              >
                {loading ? (
                  <><Loader2 className="animate-spin" size={19} /> {t('Đang xác thực...')}</>
                ) : (
                  <><LogIn size={19} /> {t('Đăng Nhập')}</>
                )}
              </button>
            </form>

            {/* Google Sign-in / Divider */}
            <div className="divider-modern">
              <span>{t('Hoặc đăng nhập với')}</span>
            </div>

            <div ref={googleBtnRef} style={{ display: 'flex', justifyContent: 'center', minHeight: '44px', width: '100%' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '1.25rem', color: '#94a3b8', fontSize: '11px', fontWeight: 500 }}>
              <ShieldCheck size={14} style={{ color: '#10b981' }} />
              <span>{t('Bảo mật dữ liệu chuẩn doanh nghiệp SSL/TLS')}</span>
            </div>
          </div>
        </div>

        <div style={{ position: 'absolute', bottom: '24px', right: '24px', color: 'rgba(0,0,0,0.03)', fontSize: '80px', fontWeight: 900, pointerEvents: 'none', userSelect: 'none', transform: 'rotate(2deg) translateY(40px)' }}>
          IDEAS.
        </div>

        {/* 2FA Verification Modal */}
        {show2FAModal && (
          <CustomModal
            isOpen={show2FAModal}
            onClose={() => setShow2FAModal(false)}
            title={t("Xác thực 2 yếu tố (2FA)")}
            maxWidth="500px"
          >
            <form onSubmit={handleVerify2FA} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-bg-light)', padding: '12px 16px', borderRadius: '10px' }}>
                <Shield size={24} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text)' }}>
                  {pending2FAData?.type === 'email'
                    ? t(`Đã gửi mã OTP 6 chữ số đến email: ${pending2FAData?.maskedEmail}`)
                    : t("Vui lòng mở ứng dụng Google Authenticator và nhập mã 6 chữ số")}
                </p>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ textAlign: 'center', display: 'block', fontWeight: 600 }}>{t("Nhập mã 6 chữ số")}</label>
                <DigitPinInput
                  value={otpCode}
                  onChange={(v) => { setOtpCode(v); if (twoFaError) setTwoFaError(''); }}
                />
              </div>

              {twoFaError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', color: '#b91c1c', fontSize: '0.8125rem', fontWeight: 600 }}>
                  {twoFaError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => setShow2FAModal(false)}
                  disabled={verifying2FA}
                >
                  {t("Hủy")}
                </button>
                <button
                  type="submit"
                  className="btn primary sm"
                  disabled={verifying2FA || otpCode.length < 6}
                >
                  {verifying2FA ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                  {t("Xác thực & Đăng nhập")}
                </button>
              </div>
            </form>
          </CustomModal>
        )}

        {/* Mandatory 2FA Setup Gate Modal */}
        {show2FASetupModal && pendingSetup2FA && (
          <CustomModal
            isOpen={show2FASetupModal}
            onClose={() => { if (!setupSubmitting) setShow2FASetupModal(false); }}
            title={t("Kích hoạt bắt buộc Bảo mật 2 lớp (2FA)")}
            maxWidth="520px"
          >
            <form onSubmit={handleComplete2FASetup} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#fef2f2', border: '1px solid #fecaca', padding: '12px 14px', borderRadius: '10px' }}>
                <ShieldCheck size={20} style={{ color: '#BD1D2D', flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.8125rem', color: '#7f1d1d', lineHeight: 1.5 }}>
                  <strong>{t("Chính sách bảo mật tài khoản nhạy cảm:")}</strong> {t("Vui lòng chọn một phương thức 2FA bên dưới để bảo vệ tài khoản trước khi vào hệ thống.")}
                </div>
              </div>

              <div style={{ display: 'inline-flex', padding: '3px', borderRadius: '10px', background: '#f1f5f9', border: '1px solid #e2e8f0', gap: '4px', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => { setSetupMethod('email'); setSetupCode(''); setSetupError(''); }}
                  style={{
                    flex: 1, height: '36px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                    background: setupMethod === 'email' ? '#ffffff' : 'transparent',
                    color: setupMethod === 'email' ? '#BD1D2D' : '#64748b',
                    fontWeight: setupMethod === 'email' ? 700 : 600,
                    fontSize: '0.84rem',
                    boxShadow: setupMethod === 'email' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <Mail size={15} />
                  {t("Email OTP")}
                </button>
                <button
                  type="button"
                  onClick={() => { setSetupMethod('totp'); setSetupCode(''); setSetupError(''); }}
                  style={{
                    flex: 1, height: '36px', borderRadius: '7px', border: 'none', cursor: 'pointer',
                    background: setupMethod === 'totp' ? '#ffffff' : 'transparent',
                    color: setupMethod === 'totp' ? '#BD1D2D' : '#64748b',
                    fontWeight: setupMethod === 'totp' ? 700 : 600,
                    fontSize: '0.84rem',
                    boxShadow: setupMethod === 'totp' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  <Smartphone size={15} />
                  {t("Google Authenticator")}
                </button>
              </div>

              {setupMethod === 'totp' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.8125rem', color: '#475569', textAlign: 'center' }}>
                    {t("Mở ứng dụng Google Authenticator / Microsoft Authenticator và quét mã QR:")}
                  </div>
                  <div style={{ background: '#ffffff', padding: '10px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <QRCodeSVG value={pendingSetup2FA.otpauthUrl} size={156} level="M" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{t("Khóa thủ công:")}</span>
                    <code style={{ background: '#ffffff', padding: '4px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 700, fontSize: '0.85rem', letterSpacing: '1px', color: '#0f172a' }}>
                      {pendingSetup2FA.totpSecret}
                    </code>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => {
                        navigator.clipboard?.writeText(pendingSetup2FA.totpSecret).catch(() => {});
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 1800);
                      }}
                      style={{ padding: '4px 8px', height: '28px', fontSize: '0.75rem' }}
                    >
                      {copiedSecret ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  {pendingSetup2FA.backupCodes.length > 0 && (
                    <div style={{ width: '100%', fontSize: '0.75rem', color: '#475569', textAlign: 'center', paddingTop: '6px', borderTop: '1px dashed #cbd5e1' }}>
                      <span>{t("Mã dự phòng (lưu lại phòng mất máy):")} </span>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                        {pendingSetup2FA.backupCodes.join(' • ')}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.82rem', color: '#475569', fontWeight: 500 }}>
                      {t("Email nhận mã xác thực:")}
                    </span>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px',
                      padding: '4px 10px', fontSize: '0.84rem', fontWeight: 700, color: '#0f172a'
                    }}>
                      <Mail size={14} style={{ color: '#BD1D2D' }} />
                      {pendingSetup2FA.maskedEmail}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendSetupEmailOtp}
                    disabled={setupEmailSending || setupEmailCooldown > 0}
                    style={{
                      width: '100%',
                      height: '44px',
                      borderRadius: '10px',
                      border: setupEmailSent && setupEmailCooldown === 0 ? '1px solid #cbd5e1' : 'none',
                      background: setupEmailCooldown > 0
                        ? '#e2e8f0'
                        : setupEmailSent
                          ? '#ffffff'
                          : 'linear-gradient(135deg, #991B1B 0%, #BD1D2D 55%, #E11D48 100%)',
                      color: setupEmailCooldown > 0
                        ? '#64748b'
                        : setupEmailSent
                          ? '#0f172a'
                          : '#ffffff',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      cursor: (setupEmailSending || setupEmailCooldown > 0) ? 'not-allowed' : 'pointer',
                      boxShadow: (!setupEmailSent && setupEmailCooldown === 0)
                        ? '0 6px 16px -4px rgba(189, 29, 45, 0.42)'
                        : '0 1px 2px rgba(15, 23, 42, 0.06)',
                      transition: 'all 0.16s ease',
                    }}
                  >
                    {setupEmailSending ? <Loader2 size={16} className="spin" /> : <Mail size={16} />}
                    {setupEmailSending
                      ? t("Đang gửi mã OTP đến Email...")
                      : setupEmailCooldown > 0
                        ? t(`Gửi lại mã OTP sau ${setupEmailCooldown}s`)
                        : (setupEmailSent ? t("Gửi lại mã OTP đến Email") : t("Gửi mã OTP đến Email"))}
                  </button>

                  {setupEmailSent && (
                    <div style={{ fontSize: '0.8rem', color: '#166534', background: '#f0fdf4', border: '1px solid #86efac', padding: '10px 12px', borderRadius: '9px', fontWeight: 500, lineHeight: 1.45 }}>
                      {t("Đã gửi OTP! Vui lòng kiểm tra hộp thư (hoặc thư mục Spam) và nhập 6 chữ số bên dưới.")}
                    </div>
                  )}
                </div>
              )}

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ textAlign: 'center', display: 'block', fontWeight: 600 }}>
                  {setupMethod === 'email' && !setupEmailSent
                    ? t("Sau khi nhận được email, nhập mã xác thực 6 chữ số bên dưới")
                    : t("Nhập mã xác thực 6 chữ số để hoàn tất")}
                </label>
                <DigitPinInput
                  value={setupCode}
                  onChange={(v) => { setSetupCode(v); if (setupError) setSetupError(''); }}
                />
              </div>

              {setupError && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', color: '#b91c1c', fontSize: '0.8125rem', fontWeight: 600 }}>
                  {setupError}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  className="btn outline sm"
                  onClick={() => setShow2FASetupModal(false)}
                  disabled={setupSubmitting}
                >
                  {t("Hủy")}
                </button>
                <button
                  type="submit"
                  className="btn primary sm"
                  disabled={setupSubmitting || setupCode.length < 6}
                >
                  {setupSubmitting ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
                  {t("Kích hoạt 2FA & Đăng nhập")}
                </button>
              </div>
            </form>
          </CustomModal>
        )}

        {/* Forgot Password Modal */}
        {showForgotPasswordModal && (
          <CustomModal
            isOpen={showForgotPasswordModal}
            onClose={() => {
              setForgotStep1CaptchaToken('');
              setForgotStep2CaptchaToken('');
              setShowForgotPasswordModal(false);
            }}
            title={t("Quên mật khẩu")}
            maxWidth="500px"
          >
            {forgotStep === 1 ? (
              <form onSubmit={handleSendForgotOtp} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
                <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                  {t("Nhập email tài khoản của bạn. Hệ thống sẽ gửi mã xác thực OTP 6 chữ số để bạn đặt lại mật khẩu.")}
                </p>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{t("Email đăng ký")}</label>
                  <input
                    type="email"
                    className="form-input"
                    value={forgotEmail}
                    onChange={e => { setForgotEmail(e.target.value); if (forgotError) setForgotError(''); }}
                    placeholder="email@company.com"
                    required
                  />
                </div>

                <RecaptchaBox
                  key="forgot-step-1"
                  theme="light"
                  resetKey={forgotStep1CaptchaResetKey}
                  onChange={(tok) => {
                    setForgotStep1CaptchaToken(tok);
                    if (tok && forgotError) setForgotError('');
                  }}
                />

                {forgotError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', color: '#b91c1c', fontSize: '0.8125rem', fontWeight: 600 }}>
                    {forgotError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn outline sm"
                    onClick={() => {
                      setForgotStep1CaptchaToken('');
                      setShowForgotPasswordModal(false);
                    }}
                    disabled={forgotLoading}
                  >
                    {t("Hủy")}
                  </button>
                  <button
                    type="submit"
                    className="btn primary sm"
                    disabled={forgotLoading || !forgotEmail || forgotCooldown > 0}
                  >
                    {forgotLoading ? <Loader2 size={14} className="spin" /> : <Mail size={14} />}
                    {forgotCooldown > 0 ? t(`Đợi ${forgotCooldown}s`) : t("Gửi mã OTP")}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.5rem 0' }}>
                <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '8px', color: '#166534', fontSize: '0.8125rem' }}>
                  {t(`Đã gửi mã OTP đến email ${forgotEmail}. Vui lòng kiểm tra hộp thư.`)}
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ textAlign: 'center', display: 'block', fontWeight: 600 }}>{t("Mã OTP 6 chữ số")}</label>
                  <DigitPinInput
                    value={forgotOtp}
                    onChange={(v) => { setForgotOtp(v); if (forgotError) setForgotError(''); }}
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">{t("Mật khẩu mới")}</label>
                  <input
                    type="password"
                    className="form-input"
                    value={forgotNewPassword}
                    onChange={e => { setForgotNewPassword(e.target.value); if (forgotError) setForgotError(''); }}
                    placeholder={t("Nhập mật khẩu mới (tối thiểu 8 ký tự gồm cả chữ và số)")}
                    required
                  />
                </div>

                <RecaptchaBox
                  key="forgot-step-2"
                  theme="light"
                  resetKey={forgotStep2CaptchaResetKey}
                  onChange={(tok) => {
                    setForgotStep2CaptchaToken(tok);
                    if (tok && forgotError) setForgotError('');
                  }}
                />

                {forgotError && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '8px', color: '#b91c1c', fontSize: '0.8125rem', fontWeight: 600 }}>
                    {forgotError}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    disabled={forgotCooldown > 0}
                    onClick={() => {
                      setForgotError('');
                      setForgotStep1CaptchaToken('');
                      setForgotStep1CaptchaResetKey(k => k + 1);
                      setForgotStep2CaptchaToken('');
                      setForgotStep2CaptchaResetKey(k => k + 1);
                      setForgotStep(1);
                    }}
                    style={{ background: 'none', border: 'none', color: forgotCooldown > 0 ? '#94a3b8' : 'var(--color-primary)', fontSize: '0.8rem', fontWeight: 600, cursor: forgotCooldown > 0 ? 'not-allowed' : 'pointer' }}
                  >
                    {forgotCooldown > 0 ? t(`Gửi lại OTP (${forgotCooldown}s)`) : t("← Gửi lại OTP")}
                  </button>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn outline sm"
                      onClick={() => {
                        setForgotStep2CaptchaToken('');
                        setShowForgotPasswordModal(false);
                      }}
                      disabled={forgotLoading}
                    >
                      {t("Hủy")}
                    </button>
                    <button
                      type="submit"
                      className="btn primary sm"
                      disabled={forgotLoading || !forgotOtp || !forgotNewPassword}
                    >
                      {forgotLoading ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />}
                      {t("Xác nhận đặt lại")}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </CustomModal>
        )}
      </div>

      <style>{`
        .login-container {
          min-height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: row;
          background: #080d1a;
          position: relative;
          overflow: hidden;
        }
        .blur-glow-1 {
          position: absolute;
          top: 0;
          right: 0;
          width: 500px;
          height: 500px;
          background: rgba(239, 68, 68, 0.08);
          filter: blur(120px);
          border-radius: 50%;
          pointer-events: none;
        }
        .blur-glow-2 {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 500px;
          height: 500px;
          background: rgba(245, 158, 11, 0.08);
          filter: blur(120px);
          border-radius: 50%;
          pointer-events: none;
        }
        .left-side {
          position: relative;
          flex: 1;
          padding: 5rem 2rem 5rem 5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
        }
        .right-side {
          position: relative;
          width: 560px;
          background: rgba(12, 18, 32, 0.6);
          backdrop-filter: blur(30px);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          padding: 4rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          overflow-y: auto;
        }
        .badge-container {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: rgba(239, 68, 68, 0.08);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(239, 68, 68, 0.25);
          border-radius: 9999px;
          margin-bottom: 2rem;
          align-self: flex-start;
        }
        .title-main {
          font-size: 4rem;
          font-weight: 900;
          color: white;
          line-height: 1.1;
          letter-spacing: -2px;
          margin-bottom: 1.5rem;
        }
        .title-gradient {
          background: linear-gradient(to right, #ff4d4d, #ff8080, #ffb366);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .subtitle-main {
          max-width: 450px;
          font-size: 1.125rem;
          color: #94a3b8;
          font-weight: 500;
          line-height: 1.6;
          margin-bottom: 3rem;
        }
        .logo-box {
          width: 80px;
          height: 80px;
          background: #ffffff;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 1rem;
          box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35), 0 0 25px rgba(255, 255, 255, 0.15);
          transform: rotate(3deg);
          overflow: hidden;
          padding: 10px;
          border: 1px solid rgba(255, 255, 255, 0.9);
        }
        .logo-img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          border-radius: 14px;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 2.25rem 2rem;
          background: rgba(15, 23, 42, 0.55);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 32px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
          backdrop-filter: blur(20px);
        }
        .login-form {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .form-label-custom {
          font-size: 11.5px;
          font-weight: 700;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          display: block;
          margin-bottom: 7px;
        }
        .input-wrapper {
          position: relative;
          margin-bottom: 0;
          display: flex;
          align-items: center;
          width: 100%;
        }
        .input-icon {
          position: absolute;
          right: 15px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        }
        .input-icon-btn {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%) !important;
          width: 38px;
          height: 38px;
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 8px;
          transition: color 0.15s ease, background-color 0.15s ease;
          z-index: 2;
          outline: none;
          user-select: none;
        }
        .input-icon-btn:hover {
          color: #ef4444;
          background: rgba(255, 255, 255, 0.05);
          transform: translateY(-50%) !important;
        }
        .input-icon-btn:active,
        .input-icon-btn:focus {
          transform: translateY(-50%) !important;
          outline: none;
        }
        .options-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 0.8125rem;
          margin-top: 2px;
        }
        .forgot-btn {
          background: none;
          border: none;
          color: #f87171;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          padding: 0;
          transition: color 0.2s;
        }
        .forgot-btn:hover {
          color: #fca5a5;
          text-decoration: underline;
        }
        .divider-modern {
          display: flex;
          align-items: center;
          text-align: center;
          margin: 1.25rem 0;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .divider-modern::before,
        .divider-modern::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .divider-modern span {
          padding: 0 10px;
        }
        .input-field {
          width: 100%;
          height: 48px;
          padding-left: 16px;
          padding-right: 46px;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          background: rgba(15, 23, 42, 0.8);
          color: white;
          font-size: 15px;
          transition: all 0.2s ease;
          box-sizing: border-box;
        }
        .input-field:focus {
          outline: none;
          border-color: #ef4444;
          box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
        }
        .input-field::placeholder {
          color: #64748b;
        }
        .submit-btn-custom {
          width: 100%;
          height: 48px;
          background: linear-gradient(135deg, #a31422 0%, #d01d33 100%);
          color: white;
          border-radius: 12px;
          font-weight: 700;
          font-size: 15px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          border: none;
          cursor: pointer;
          box-shadow: 0 8px 16px rgba(163, 20, 34, 0.25);
        }
        .submit-btn-custom:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 20px rgba(163, 20, 34, 0.35);
        }
        .submit-btn-custom:active {
          transform: translateY(1px);
        }
        .marquee-wrapper {
          position: relative;
          width: 100%;
          overflow: hidden;
          margin-top: 2rem;
        }
        .marquee-row {
          display: flex;
          gap: 16px;
          width: max-content;
        }
        .marquee-item {
          width: 280px;
          flex-shrink: 0;
          padding: 1.25rem;
          background: rgba(18, 25, 42, 0.4);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 24px;
          transition: all 0.3s ease;
        }
        .marquee-item:hover {
          background: rgba(30, 41, 59, 0.6);
          border-color: rgba(239, 68, 68, 0.3);
          transform: translateY(-2px);
        }
        .icon-box {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 12px;
          box-shadow: 0 8px 16px rgba(0,0,0,0.15);
        }
        .item-title {
          font-size: 14px;
          font-weight: 700;
          color: white;
          margin-bottom: 4px;
        }
        .item-sub {
          font-size: 11px;
          color: #94a3b8;
          line-height: 1.5;
        }
        .circle-decor-1 {
          position: absolute;
          top: 50%;
          left: 0;
          transform: translateY(-50%);
          width: 800px;
          height: 800px;
          border: 1px solid rgba(255,255,255,0.015);
          border-radius: 50%;
          pointer-events: none;
        }
        .circle-decor-2 {
          position: absolute;
          top: 50%;
          left: 0;
          transform: translateY(-50%) translate(40px);
          width: 600px;
          height: 600px;
          border: 1px solid rgba(255,255,255,0.015);
          border-radius: 50%;
          pointer-events: none;
        }
        .circle-decor-3 {
          position: absolute;
          top: 50%;
          left: 0;
          transform: translateY(-50%) translate(80px);
          width: 400px;
          height: 400px;
          border: 1px solid rgba(255,255,255,0.02);
          border-radius: 50%;
          pointer-events: none;
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-float {
          animation: float 4s ease-in-out infinite;
        }
        @keyframes slide-infinite {
          0% { transform: translateX(0); }
          100% { transform: translateX(-33.3333%); }
        }
        @keyframes slide-infinite-reverse {
          0% { transform: translateX(-33.3333%); }
          100% { transform: translateX(0); }
        }
        .animate-slide-infinite {
          animation: slide-infinite 25s linear infinite;
        }
        .animate-slide-infinite-reverse {
          animation: slide-infinite-reverse 25s linear infinite;
        }
        .pause-on-hover:hover .animate-slide-infinite,
        .pause-on-hover:hover .animate-slide-infinite-reverse {
          animation-play-state: paused;
        }
        .mask-fade-edges {
          mask-image: linear-gradient(to right, transparent, white 4%, white 98%, transparent);
          -webkit-mask-image: linear-gradient(to right, transparent, white 4%, white 98%, transparent);
        }

        @media (max-width: 992px) {
          .login-container {
            flex-direction: column;
            overflow-y: auto;
            align-items: center;
            justify-content: center;
          }
          .left-side {
            display: none;
          }
          .right-side {
            width: 100%;
            min-height: 100vh;
            padding: 2rem 1.25rem;
            border-left: none;
            border-top: none;
            background: transparent;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
          }
          .login-card {
            max-width: 440px;
            padding: 2rem 1.35rem;
            border-radius: 26px;
          }
          .login-form {
            gap: 1.35rem;
          }
          .form-label-custom {
            font-size: 12px;
            letter-spacing: 0.8px;
            margin-bottom: 8px;
          }
          .input-field {
            height: 52px;
            font-size: 16px;
            padding-left: 18px;
            padding-right: 50px;
            border-radius: 14px;
          }
          .input-icon {
            right: 16px;
          }
          .input-icon svg {
            width: 20px;
            height: 20px;
          }
          .input-icon-btn {
            right: 8px;
            width: 42px;
            height: 42px;
          }
          .input-icon-btn svg {
            width: 20px;
            height: 20px;
          }
          .options-row {
            font-size: 0.875rem;
          }
          .submit-btn-custom {
            height: 52px;
            font-size: 16px;
            border-radius: 14px;
          }
          .right-side > div {
            gap: 1.25rem !important;
          }
          .logo-box {
            width: 70px;
            height: 70px;
            margin-bottom: 0.5rem;
          }
          .logo-box + div h2 {
            font-size: 1.5rem !important;
          }
        }
        @media (max-width: 480px) {
          .right-side {
            padding: 1.5rem 1rem;
          }
          .login-card {
            padding: 1.75rem 1.15rem;
          }
          .input-field {
            height: 52px;
            font-size: 16px;
            padding-left: 16px;
            padding-right: 48px;
          }
        }
        body > div:has(iframe[src*="recaptcha/api2/bframe"]),
        body > div[style*="z-index: 2000000000"] {
          z-index: 2147483647 !important;
        }
      `}</style>
    </div>
  );
};
