import React, { useEffect, useRef } from 'react';
import { RECAPTCHA_SITE_KEY } from '../../config/env';

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void;
      render: (
        container: HTMLElement,
        parameters: {
          sitekey: string;
          theme?: 'dark' | 'light';
          size?: 'normal' | 'compact';
          callback?: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
        }
      ) => number;
      reset: (widgetId?: number) => void;
      getResponse: (widgetId?: number) => string;
    };
  }
}

let recaptchaScriptPromise: Promise<void> | null = null;

function loadRecaptchaScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (window.grecaptcha && typeof window.grecaptcha.render === 'function') {
    return Promise.resolve();
  }
  if (recaptchaScriptPromise) {
    return recaptchaScriptPromise;
  }

  recaptchaScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src*="recaptcha/api.js"]'
    );
    if (existing) {
      const waitExisting = () => {
        if (window.grecaptcha && typeof window.grecaptcha.ready === 'function') {
          window.grecaptcha.ready(() => resolve());
        } else {
          setTimeout(waitExisting, 80);
        }
      };
      waitExisting();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://www.google.com/recaptcha/api.js?render=explicit&hl=vi';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.grecaptcha && typeof window.grecaptcha.ready === 'function') {
        window.grecaptcha.ready(() => resolve());
      } else {
        const waitLoad = () => {
          if (window.grecaptcha && typeof window.grecaptcha.ready === 'function') {
            window.grecaptcha.ready(() => resolve());
          } else {
            setTimeout(waitLoad, 80);
          }
        };
        waitLoad();
      }
    };
    script.onerror = () => {
      recaptchaScriptPromise = null;
      reject(new Error('Failed to load Google reCAPTCHA script'));
    };
    document.head.appendChild(script);
  });

  return recaptchaScriptPromise;
}

interface RecaptchaBoxProps {
  siteKey?: string;
  theme?: 'dark' | 'light';
  resetKey?: number;
  onChange: (token: string) => void;
}

export const RecaptchaBox: React.FC<RecaptchaBoxProps> = ({
  siteKey = RECAPTCHA_SITE_KEY,
  theme = 'dark',
  resetKey = 0,
  onChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Elevate Google reCAPTCHA challenge popups above CustomModal (z-index 2147483610)
  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return;

    const elevateChallenges = () => {
      const children = document.body.children;
      for (let i = 0; i < children.length; i++) {
        const el = children[i] as HTMLElement;
        if (el.tagName !== 'DIV') continue;
        const hasRecaptchaFrame = Boolean(el.querySelector('iframe[src*="recaptcha"]'));
        if (hasRecaptchaFrame || el.style.zIndex === '2000000000') {
          if (el.style.zIndex !== '2147483647') {
            el.style.zIndex = '2147483647';
          }
        }
      }
    };

    elevateChallenges();
    const observer = new MutationObserver(() => elevateChallenges());
    observer.observe(document.body, {
      childList: true,
      attributes: true,
      attributeFilter: ['style'],
      subtree: false,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    if (!siteKey) return;

    loadRecaptchaScript()
      .then(() => {
        if (!active || !containerRef.current || !window.grecaptcha) return;
        if (widgetIdRef.current !== null) return;
        containerRef.current.innerHTML = '';
        widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => onChangeRef.current(token || ''),
          'expired-callback': () => onChangeRef.current(''),
          'error-callback': () => onChangeRef.current(''),
        });
      })
      .catch(() => {
        if (active) {
          onChangeRef.current('');
        }
      });

    return () => {
      active = false;
      widgetIdRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [siteKey, theme]);

  useEffect(() => {
    if (resetKey <= 0) return;
    if (widgetIdRef.current !== null && window.grecaptcha) {
      try {
        window.grecaptcha.reset(widgetIdRef.current);
      } catch {}
    }
    onChangeRef.current('');
  }, [resetKey]);

  if (!siteKey) return null;

  return (
    <div className="recaptcha-wrapper">
      <div ref={containerRef} />
      <style>{`
        .recaptcha-wrapper {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 100%;
          min-height: 78px;
          overflow: visible;
        }
        @media (max-width: 360px) {
          .recaptcha-wrapper > div {
            transform: scale(0.9);
            transform-origin: center;
          }
        }
      `}</style>
    </div>
  );
};
