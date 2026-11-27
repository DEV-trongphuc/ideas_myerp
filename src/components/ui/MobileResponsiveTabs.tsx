import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, MoreHorizontal } from 'lucide-react';
import { useViewportDevice } from '../../hooks/useViewportDevice';

export interface ResponsiveTabItem {
  id: string;
  label: string;
  shortLabel?: string;
  mobileLabel?: string;
  icon?: React.ReactNode;
  badge?: number | string;
  badgeBg?: string;
  badgeColor?: string;
  hidden?: boolean;
  disabled?: boolean;
}

export interface ResponsiveSegmentedTabsProps {
  tabs: ResponsiveTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  mobileMaxVisible?: number;
  tabletMaxVisible?: number;
  desktopMaxVisible?: number;
  fullWidthOnMobile?: boolean;
  moreLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Enterprise Segmented Subtab Control (100% AGENTS.md Chapter V compliant).
 * - Never wraps onto multiple lines ("không bao giờ rớt dòng tab").
 * - Automatically collapses excess subtabs into a crisp `⋯ / Khác ▾` portal dropdown
 *   on Mobile (<= 767px), Tablet (768px - 1024px), or dense Desktop bars.
 * - Always keeps the currently active tab visible in the bar even if selected from overflow.
 */
export const ResponsiveSegmentedTabs: React.FC<ResponsiveSegmentedTabsProps> = ({
  tabs,
  activeId,
  onChange,
  mobileMaxVisible = 2,
  tabletMaxVisible = 4,
  desktopMaxVisible = 8,
  fullWidthOnMobile = true,
  moreLabel = 'Khác',
  className = '',
  style,
}) => {
  const { isMobile, isTablet } = useViewportDevice();
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number; maxHeight: number }>({
    top: 0,
    right: 12,
    maxHeight: 340,
  });

  const visibleSourceTabs = useMemo(
    () => (Array.isArray(tabs) ? tabs.filter(t => t && !t.hidden) : []),
    [tabs]
  );

  const maxSlots = isMobile
    ? Math.max(1, mobileMaxVisible)
    : isTablet
      ? Math.max(2, tabletMaxVisible)
      : Math.max(3, desktopMaxVisible);

  const { barTabs, overflowTabs } = useMemo(() => {
    if (visibleSourceTabs.length <= maxSlots) {
      return { barTabs: visibleSourceTabs, overflowTabs: [] as ResponsiveTabItem[] };
    }
    const activeIdx = visibleSourceTabs.findIndex(t => t.id === activeId);
    if (activeIdx < 0 || activeIdx < maxSlots) {
      return {
        barTabs: visibleSourceTabs.slice(0, maxSlots),
        overflowTabs: visibleSourceTabs.slice(maxSlots),
      };
    }
    const head = visibleSourceTabs.slice(0, Math.max(1, maxSlots - 1));
    const activeTab = visibleSourceTabs[activeIdx];
    const barSet = new Set([...head.map(t => t.id), activeTab.id]);
    return {
      barTabs: [...head, activeTab],
      overflowTabs: visibleSourceTabs.filter(t => !barSet.has(t.id)),
    };
  }, [visibleSourceTabs, maxSlots, activeId]);

  const overflowBadgeTotal = useMemo(() => {
    let sum = 0;
    for (const t of overflowTabs) {
      const n = Number(t.badge);
      if (Number.isFinite(n) && n > 0) sum += n;
    }
    return sum;
  }, [overflowTabs]);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMenuOpen(false);
      }
    };
    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      setMenuOpen(false);
    };
    window.addEventListener('keydown', handleKey, true);
    window.addEventListener('resize', handleScrollOrResize, { passive: true });
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      window.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [menuOpen]);

  const handleToggleMenu = () => {
    if (!menuOpen && triggerRef.current && typeof window !== 'undefined') {
      const rect = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const spaceBelow = vh - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
      const computedMaxH = Math.max(180, Math.min(360, openUp ? spaceAbove - 8 : spaceBelow - 8));
      const menuWidth = Math.min(270, vw - 24);

      let right: number | undefined = Math.max(12, vw - rect.right);
      let left: number | undefined = undefined;
      if (vw - right - menuWidth < 12) {
        right = 12;
      }

      setMenuPos({
        top: openUp ? Math.max(12, rect.top - Math.min(computedMaxH, overflowTabs.length * 42 + 20) - 6) : rect.bottom + 6,
        left,
        right,
        maxHeight: computedMaxH,
      });
    }
    setMenuOpen(prev => !prev);
  };

  if (visibleSourceTabs.length === 0) return null;

  return (
    <div
      role="tablist"
      className={`segmented-tab-container ${className}`.trim()}
      style={{
        display: isMobile && fullWidthOnMobile ? 'flex' : 'inline-flex',
        alignItems: 'center',
        flexWrap: 'nowrap',
        padding: '3px',
        borderRadius: '10px',
        background: '#f1f5f9',
        border: '1px solid #e2e8f0',
        gap: '2px',
        width: isMobile && fullWidthOnMobile ? '100%' : 'auto',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...style,
      }}
    >
      {barTabs.map(tab => {
        const isActive = tab.id === activeId;
        const compactLabel = tab.shortLabel || tab.mobileLabel;
        const displayLabel = isMobile && compactLabel ? compactLabel : tab.label;
        const hasBadge = tab.badge !== undefined && tab.badge !== null && tab.badge !== 0 && tab.badge !== '0' && tab.badge !== '';

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => {
              setMenuOpen(false);
              onChange(tab.id);
            }}
            title={tab.label}
            style={{
              flex: isMobile && fullWidthOnMobile ? '1 1 0%' : '0 1 auto',
              minWidth: 0,
              height: '32px',
              padding: isMobile ? '0 9px' : '0 13px',
              borderRadius: '7px',
              border: 'none',
              background: isActive ? '#ffffff' : 'transparent',
              color: isActive ? '#BD1D2D' : '#64748b',
              fontWeight: isActive ? 700 : 600,
              fontSize: isMobile ? '0.76rem' : '0.8125rem',
              boxShadow: isActive ? '0 1px 3px rgba(0, 0, 0, 0.08)' : 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '5px',
              cursor: tab.disabled ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              transition: 'background-color 0.15s ease, color 0.15s ease',
            }}
          >
            {tab.icon && (
              <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
                {tab.icon}
              </span>
            )}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {displayLabel}
            </span>
            {hasBadge && (
              <span
                style={{
                  fontSize: '0.66rem',
                  fontWeight: 700,
                  padding: '1px 5px',
                  borderRadius: '999px',
                  background: tab.badgeBg || (isActive ? 'rgba(189, 29, 45, 0.12)' : '#e2e8f0'),
                  color: tab.badgeColor || (isActive ? '#BD1D2D' : '#334155'),
                  lineHeight: 1.25,
                  flexShrink: 0,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}

      {overflowTabs.length > 0 && (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleToggleMenu}
          aria-expanded={menuOpen}
          title={`${moreLabel} (${overflowTabs.length} mục)`}
          style={{
            flex: '0 0 auto',
            height: '32px',
            padding: isMobile ? '0 9px' : '0 11px',
            borderRadius: '7px',
            border: menuOpen ? '1px solid #cbd5e1' : 'none',
            background: menuOpen ? '#0f172a' : '#ffffff',
            color: menuOpen ? '#ffffff' : '#334155',
            fontWeight: 700,
            fontSize: isMobile ? '0.74rem' : '0.78rem',
            boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            position: 'relative',
          }}
        >
          <MoreHorizontal size={14} style={{ flexShrink: 0 }} />
          {!isMobile && <span>{moreLabel}</span>}
          <span style={{ fontSize: '0.68rem', opacity: 0.85, fontVariantNumeric: 'tabular-nums' }}>
            ({overflowTabs.length})
          </span>
          <ChevronDown
            size={12}
            style={{
              flexShrink: 0,
              transform: menuOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.15s ease',
            }}
          />
          {overflowBadgeTotal > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                minWidth: 15,
                height: 15,
                padding: '0 4px',
                borderRadius: 999,
                background: '#BD1D2D',
                color: '#ffffff',
                fontSize: '0.6rem',
                fontWeight: 800,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1.5px solid #ffffff',
              }}
            >
              {overflowBadgeTotal > 99 ? '99+' : overflowBadgeTotal}
            </span>
          )}
        </button>
      )}

      {menuOpen &&
        overflowTabs.length > 0 &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2147483645,
                background: 'rgba(15, 23, 42, 0.12)',
              }}
            />
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                top: menuPos.top,
                left: menuPos.left,
                right: menuPos.right,
                width: 'min(272px, calc(100vw - 24px))',
                maxHeight: menuPos.maxHeight,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                zIndex: 2147483646,
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e2e8f0)',
                borderRadius: '12px',
                boxShadow: '0 14px 34px rgba(15, 23, 42, 0.18)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div
                style={{
                  padding: '4px 10px 6px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#64748b',
                  borderBottom: '1px solid #f1f5f9',
                  marginBottom: '2px',
                }}
              >
                Danh mục khác ({overflowTabs.length})
              </div>
              {visibleSourceTabs.map(tab => {
                const isAct = tab.id === activeId;
                const hasBadge =
                  tab.badge !== undefined &&
                  tab.badge !== null &&
                  tab.badge !== 0 &&
                  tab.badge !== '0' &&
                  tab.badge !== '';
                return (
                  <button
                    key={tab.id}
                    type="button"
                    disabled={tab.disabled}
                    onClick={() => {
                      setMenuOpen(false);
                      onChange(tab.id);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                      width: '100%',
                      minHeight: '38px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: 'none',
                      background: isAct ? 'rgba(189, 29, 45, 0.08)' : 'transparent',
                      color: isAct ? '#BD1D2D' : 'var(--color-text, #0f172a)',
                      fontSize: '0.8125rem',
                      fontWeight: isAct ? 700 : 600,
                      cursor: tab.disabled ? 'not-allowed' : 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                      {tab.icon && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0, color: isAct ? '#BD1D2D' : '#64748b' }}>
                          {tab.icon}
                        </span>
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tab.label}
                      </span>
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                      {hasBadge && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '999px',
                            background: tab.badgeBg || '#fee2e2',
                            color: tab.badgeColor || '#BD1D2D',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {tab.badge}
                        </span>
                      )}
                      {isAct && <Check size={14} style={{ color: '#BD1D2D' }} />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>,
          document.body
        )}
    </div>
  );
};

export interface ResponsiveActionItem {
  key?: string;
  id?: string;
  label: string;
  shortLabel?: string;
  mobileLabel?: string;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'primary' | 'outline' | 'secondary' | 'danger' | 'success';
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  badge?: number | string;
}

export interface ResponsiveActionGroupProps {
  actions: ResponsiveActionItem[];
  moreLabel?: string;
  fullWidthOnMobile?: boolean;
  menuOnlyOnMobile?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Enforces the strict Mobile Action Rule:
 * NEVER place > 2 buttons horizontally on mobile ("tuyệt đối ko bao giờ được dàn ngang các button quá 2 nút").
 * - Desktop/Tablet: Renders clean inline buttons.
 * - Mobile (<= 767px):
 *   - `menuOnlyOnMobile`: 1 compact `⋯` button opening all actions
 *   - 1 button: 1 clean button
 *   - 2 buttons: 2 balanced side-by-side buttons
 *   - >= 3 buttons: Primary CTA button + `⋯` ("Tác vụ ▾") overflow dropdown menu!
 */
export const ResponsiveActionGroup: React.FC<ResponsiveActionGroupProps> = ({
  actions,
  moreLabel = 'Tác vụ',
  fullWidthOnMobile = true,
  menuOnlyOnMobile = false,
  className = '',
  style,
}) => {
  const { isMobile } = useViewportDevice();
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight: number }>({
    top: 0,
    right: 12,
    maxHeight: 320,
  });

  const visibleActions = useMemo(
    () =>
      (Array.isArray(actions) ? actions.filter(a => a && !a.hidden) : []).map((a, idx) => ({
        ...a,
        key: a.key || a.id || `act-${idx}`,
        shortLabel: a.shortLabel || a.mobileLabel,
        variant: a.variant || (a.primary ? 'primary' : a.danger ? 'danger' : 'outline'),
      })),
    [actions]
  );

  useEffect(() => {
    if (!open) return;
    const closeOnEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    const closeOnScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', closeOnEsc, true);
    window.addEventListener('resize', closeOnScroll, { passive: true });
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      window.removeEventListener('keydown', closeOnEsc, true);
      window.removeEventListener('resize', closeOnScroll);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [open]);

  if (visibleActions.length === 0) return null;

  const getBtnStyle = (variant: ResponsiveActionItem['variant'] = 'outline', compact = false): React.CSSProperties => {
    const base: React.CSSProperties = {
      height: compact ? '36px' : '38px',
      padding: compact ? '0 12px' : '0 14px',
      borderRadius: '9px',
      fontSize: compact ? '0.8rem' : '0.82rem',
      fontWeight: 700,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '6px',
      whiteSpace: 'nowrap',
      minWidth: 0,
      overflow: 'hidden',
      cursor: 'pointer',
      transition: 'background-color 0.15s ease, border-color 0.15s ease',
    };
    if (variant === 'primary') {
      return { ...base, background: 'var(--color-primary, #BD1D2D)', color: '#ffffff', border: 'none', boxShadow: '0 2px 6px rgba(189, 29, 45, 0.2)' };
    }
    if (variant === 'danger') {
      return { ...base, background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', border: '1px solid rgba(239, 68, 68, 0.28)' };
    }
    if (variant === 'success') {
      return { ...base, background: '#059669', color: '#ffffff', border: 'none' };
    }
    if (variant === 'secondary') {
      return { ...base, background: 'var(--color-bg, #f1f5f9)', color: 'var(--color-text, #0f172a)', border: '1px solid var(--color-border, #e2e8f0)' };
    }
    return { ...base, background: 'var(--color-surface, #ffffff)', color: 'var(--color-text, #0f172a)', border: '1px solid var(--color-border, #cbd5e1)', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' };
  };

  if (!isMobile || (!menuOnlyOnMobile && visibleActions.length <= 2)) {
    return (
      <div
        className={className}
        style={{
          display: isMobile && fullWidthOnMobile ? 'grid' : 'inline-flex',
          gridTemplateColumns:
            isMobile && fullWidthOnMobile
              ? visibleActions.length === 2
                ? 'repeat(2, minmax(0, 1fr))'
                : 'minmax(0, 1fr)'
              : undefined,
          alignItems: 'center',
          gap: '8px',
          width: isMobile && fullWidthOnMobile ? '100%' : 'auto',
          maxWidth: '100%',
          minWidth: 0,
          ...style,
        }}
      >
        {visibleActions.map(act => (
          <button
            key={act.key}
            type="button"
            disabled={act.disabled}
            onClick={act.onClick}
            title={act.title || act.label}
            style={getBtnStyle(act.variant, isMobile)}
          >
            {act.icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{act.icon}</span>}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isMobile && act.shortLabel ? act.shortLabel : act.label}
            </span>
          </button>
        ))}
      </div>
    );
  }

  // Mobile with >= 3 actions (or menuOnlyOnMobile):
  const primaryIdx = visibleActions.findIndex(a => a.variant === 'primary');
  const mainAction = menuOnlyOnMobile ? null : visibleActions[primaryIdx >= 0 ? primaryIdx : 0];
  const secondaryActions = menuOnlyOnMobile
    ? visibleActions
    : visibleActions.filter(a => a.key !== mainAction?.key);

  const toggleMenu = () => {
    if (!open && btnRef.current && typeof window !== 'undefined') {
      const rect = btnRef.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const spaceBelow = vh - rect.bottom - 16;
      const openUp = spaceBelow < 180 && rect.top > spaceBelow;
      setPos({
        top: openUp ? Math.max(12, rect.top - Math.min(300, secondaryActions.length * 48 + 24) - 6) : rect.bottom + 6,
        right: Math.max(12, vw - rect.right),
        maxHeight: Math.max(180, Math.min(340, openUp ? rect.top - 20 : spaceBelow)),
      });
    }
    setOpen(prev => !prev);
  };

  return (
    <div
      className={className}
      style={{
        display: mainAction ? 'grid' : 'inline-flex',
        gridTemplateColumns: mainAction ? 'minmax(0, 1fr) auto' : undefined,
        alignItems: 'center',
        gap: '8px',
        width: mainAction && fullWidthOnMobile ? '100%' : 'auto',
        maxWidth: '100%',
        minWidth: 0,
        ...style,
      }}
    >
      {mainAction && (
        <button
          type="button"
          disabled={mainAction.disabled}
          onClick={mainAction.onClick}
          title={mainAction.title || mainAction.label}
          style={getBtnStyle(mainAction.variant || 'primary', true)}
        >
          {mainAction.icon && <span style={{ display: 'inline-flex', flexShrink: 0 }}>{mainAction.icon}</span>}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mainAction.shortLabel || mainAction.label}
          </span>
        </button>
      )}

      <button
        ref={btnRef}
        type="button"
        onClick={toggleMenu}
        data-icon-only="true"
        aria-expanded={open}
        title={`${moreLabel} (${secondaryActions.length})`}
        style={{
          height: menuOnlyOnMobile ? '32px' : '36px',
          width: menuOnlyOnMobile ? '32px' : undefined,
          padding: menuOnlyOnMobile ? 0 : '0 11px',
          borderRadius: menuOnlyOnMobile ? '8px' : '9px',
          border: '1px solid var(--color-border, #cbd5e1)',
          background: open ? '#0f172a' : 'var(--color-surface, #ffffff)',
          color: open ? '#ffffff' : 'var(--color-text, #0f172a)',
          fontSize: '0.78rem',
          fontWeight: 700,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)',
          flexShrink: 0,
        }}
      >
        <MoreHorizontal size={16} />
        {!menuOnlyOnMobile && (
          <>
            <span>{moreLabel}</span>
            <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
          </>
        )}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              onClick={() => setOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 2147483645, background: 'rgba(15, 23, 42, 0.14)' }}
            />
            <div
              ref={menuRef}
              style={{
                position: 'fixed',
                top: pos.top,
                right: pos.right,
                width: 'min(280px, calc(100vw - 24px))',
                maxHeight: pos.maxHeight,
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                zIndex: 2147483646,
                background: 'var(--color-surface, #ffffff)',
                border: '1px solid var(--color-border, #e2e8f0)',
                borderRadius: '12px',
                boxShadow: '0 16px 36px rgba(15, 23, 42, 0.2)',
                padding: '6px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              {secondaryActions.map(act => (
                <button
                  key={act.key}
                  type="button"
                  disabled={act.disabled}
                  onClick={() => {
                    setOpen(false);
                    act.onClick();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    width: '100%',
                    padding: '9px 10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    color: act.variant === 'danger' ? '#dc2626' : 'var(--color-text, #0f172a)',
                    cursor: act.disabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    opacity: act.disabled ? 0.5 : 1,
                  }}
                >
                  {act.icon && (
                    <span style={{ marginTop: '2px', flexShrink: 0, color: act.variant === 'danger' ? '#dc2626' : '#BD1D2D' }}>
                      {act.icon}
                    </span>
                  )}
                  <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.3 }}>{act.label}</span>
                    {act.description && (
                      <span style={{ fontSize: '0.71rem', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                        {act.description}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </>,
          document.body
        )}
    </div>
  );
};
