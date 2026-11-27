import { useState, useEffect } from 'react';

export interface ViewportDeviceState {
  isMobile: boolean;
  isTablet: boolean;
  isMobileOrTablet: boolean;
}

const MOBILE_QUERY = '(max-width: 767px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1024px)';

function readDeviceState(): ViewportDeviceState {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false, isMobileOrTablet: false };
  }
  const w = window.innerWidth;
  const isMobile = w <= 767;
  const isTablet = w >= 768 && w <= 1024;
  return {
    isMobile,
    isTablet,
    isMobileOrTablet: isMobile || isTablet,
  };
}

/**
 * Zero-jank viewport breakpoint hook using matchMedia('change') instead of raw
 * window 'resize' events (prevents 60Hz re-renders when iOS/Android address bar
 * expands or collapses during touch scrolling).
 */
export function useViewportDevice(): ViewportDeviceState {
  const [state, setState] = useState<ViewportDeviceState>(readDeviceState);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mqMobile = window.matchMedia(MOBILE_QUERY);
    const mqTablet = window.matchMedia(TABLET_QUERY);

    const sync = () => {
      const nextMobile = mqMobile.matches;
      const nextTablet = mqTablet.matches;
      setState(prev => {
        if (prev.isMobile === nextMobile && prev.isTablet === nextTablet) {
          return prev;
        }
        return {
          isMobile: nextMobile,
          isTablet: nextTablet,
          isMobileOrTablet: nextMobile || nextTablet,
        };
      });
    };

    sync();

    if (mqMobile.addEventListener) {
      mqMobile.addEventListener('change', sync);
      mqTablet.addEventListener('change', sync);
      return () => {
        mqMobile.removeEventListener('change', sync);
        mqTablet.removeEventListener('change', sync);
      };
    } else {
      mqMobile.addListener(sync);
      mqTablet.addListener(sync);
      return () => {
        mqMobile.removeListener(sync);
        mqTablet.removeListener(sync);
      };
    }
  }, []);

  return state;
}
