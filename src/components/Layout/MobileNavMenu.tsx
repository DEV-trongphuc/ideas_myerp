import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Search, Sparkles, X } from 'lucide-react';
import { AppIcon } from '../common/AppIcons';
import { Avatar } from '../ui/Avatar';
import { useLanguage } from '../../contexts/LanguageContext';
import { fetchAPI } from '../../utils/api';
import { getUserDisplayRoleOrTitle } from '../../utils/roleUtils';
import {
  buildVisibleSidebarGroups,
  checkSidebarItemActive,
  resolveSidebarItemHref,
} from './Sidebar';

interface MobileNavMenuProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  tenantConfig: any;
  brandShortName: string;
  pathname: string;
  search: string;
  onNavigate: (href: string) => void;
  onOpenChat?: () => void;
  fallbackBadges?: {
    tickets?: number;
    supportTickets?: number;
    gatekeeper?: number;
    coopSlips?: number;
    pendingExpenses?: number;
    pendingApprovals?: number;
  };
}

/**
 * Full-screen mobile navigation drawer aligned with MYERP Obsidian/Ruby aesthetic and colorful AppIcons.
 */
export const MobileNavMenu: React.FC<MobileNavMenuProps> = ({
  isOpen,
  onClose,
  user,
  tenantConfig,
  brandShortName,
  pathname,
  search,
  onNavigate,
  onOpenChat,
  fallbackBadges = {},
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [badges, setBadges] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      return;
    }
    let mounted = true;
    fetchAPI('badges')
      .then((res) => {
        if (!mounted || !res?.success || !res.data) return;
        const next: Record<string, number> = {};
        Object.keys(res.data).forEach((k) => {
          if (typeof res.data[k] === 'number') {
            next[k] = res.data[k];
          }
        });
        setBadges(next);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [isOpen]);

  const visibleGroups = useMemo(
    () => buildVisibleSidebarGroups(user, tenantConfig),
    [user, tenantConfig]
  );

  const resolveBadgeCount = (badgeKey?: string): number => {
    if (!badgeKey) return 0;
    if (typeof badges[badgeKey] === 'number') return badges[badgeKey];
    if (badgeKey === 'tickets') return fallbackBadges.tickets || 0;
    if (badgeKey === 'supportTickets') return fallbackBadges.supportTickets || 0;
    if (badgeKey === 'gatekeeper') return fallbackBadges.gatekeeper || 0;
    if (badgeKey === 'coopSlips') return fallbackBadges.coopSlips || 0;
    if (badgeKey === 'pendingExpenses') return fallbackBadges.pendingExpenses || 0;
    if (badgeKey === 'pendingApprovals') return fallbackBadges.pendingApprovals || 0;
    return 0;
  };

  const quickShortcuts = useMemo(() => {
    const allItems = visibleGroups.flatMap((g) => g.items);
    const priorityHrefs = ['/', '/workspace', '/approvals', '/contacts'];
    const picks: Array<{ name: string; href: string; iconKey?: string; badgeKey?: string; isChat?: boolean }> = [];
    for (const h of priorityHrefs) {
      const found = allItems.find((it) => it.href === h);
      if (found) picks.push(found);
    }
    if (picks.length < 4 && onOpenChat) {
      picks.push({ name: 'WorkChat', href: '#chat', iconKey: 'WorkChat', isChat: true });
    }
    return picks.slice(0, 4);
  }, [visibleGroups, onOpenChat]);

  const filteredGroups = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return visibleGroups;
    return visibleGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const localized = t(item.name).toLowerCase();
          return (
            localized.includes(trimmed) ||
            item.name.toLowerCase().includes(trimmed) ||
            group.title.toLowerCase().includes(trimmed)
          );
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [visibleGroups, query, t]);

  if (!isOpen || typeof document === 'undefined') return null;

  const logoSrc = tenantConfig?.organization?.logo_url || '/LOGO.webp';
  const displayName = user?.full_name || user?.name || 'Thành viên';
  const roleLabel = getUserDisplayRoleOrTitle(user);

  const handleSelectItem = (item: any) => {
    if (item.isChat || item.href === '#chat') {
      onClose();
      if (onOpenChat) onOpenChat();
      return;
    }
    const effectiveHref = resolveSidebarItemHref(item.name, item.href, user);
    onNavigate(effectiveHref);
    onClose();
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        height: '100dvh',
        zIndex: 2147483625,
        background:
          'radial-gradient(ellipse at 12% 0%, rgba(189, 29, 45, 0.24) 0%, transparent 46%), radial-gradient(ellipse at 88% 100%, rgba(56, 189, 248, 0.1) 0%, transparent 46%), linear-gradient(180deg, #130e10 0%, #0d0a0b 55%, #070709 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        color: '#f1f5f9',
        overflow: 'hidden',
      }}
    >
      {/* Top Pinned Glass Header */}
      <div
        style={{
          padding: 'max(14px, env(safe-area-inset-top, 14px)) 16px 12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(13, 10, 11, 0.78)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        {/* Brand + User + Close Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src={logoSrc}
                alt={brandShortName}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, minWidth: 0 }}>
              <span
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 900,
                  color: '#ffffff',
                  letterSpacing: '-0.025em',
                  whiteSpace: 'nowrap',
                }}
              >
                {brandShortName || 'MYERP'}
              </span>
              <span
                style={{
                  fontSize: '0.56rem',
                  fontWeight: 800,
                  letterSpacing: '0.09em',
                  color: '#ef4444',
                  marginTop: '3px',
                  whiteSpace: 'nowrap',
                }}
              >
                / AI AUTOMATION
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => {
                onNavigate('/account');
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                padding: '4px 10px 4px 5px',
                borderRadius: '999px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f8fafc',
                cursor: 'pointer',
                maxWidth: '155px',
              }}
            >
              <Avatar
                src={user?.avatar_url || user?.avatar}
                name={displayName}
                size={24}
              />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', minWidth: 0 }}>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '105px',
                    lineHeight: 1.15,
                  }}
                >
                  {displayName}
                </span>
                {roleLabel && (
                  <span
                    style={{
                      fontSize: '0.58rem',
                      color: 'rgba(255,255,255,0.52)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '105px',
                      lineHeight: 1.1,
                    }}
                  >
                    {roleLabel}
                  </span>
                )}
              </div>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label={t('Đóng menu')}
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.09)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Integrated Search Input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.07)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '12px',
            padding: '0 12px',
            height: '38px',
          }}
        >
          <Search size={15} color="rgba(255,255,255,0.52)" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Tìm nhanh chức năng...')}
            data-no-autofocus="true"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#ffffff',
              fontSize: '0.85rem',
            }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.65)',
                padding: 2,
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Single Clean Scrollable Area */}
      <div
        className="no-scrollbar"
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          padding: '14px 16px calc(24px + env(safe-area-inset-bottom, 0px)) 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Quick Launch Strip when not searching */}
        {!query.trim() && quickShortcuts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: '2px' }}>
              <Sparkles size={11} color="#f87171" />
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 800,
                  color: 'rgba(255, 255, 255, 0.5)',
                  letterSpacing: '0.09em',
                  textTransform: 'uppercase',
                }}
              >
                {t('Truy cập nhanh')}
              </span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${quickShortcuts.length}, minmax(0, 1fr))`,
                gap: '8px',
              }}
            >
              {quickShortcuts.map((item) => {
                const effectiveHref = resolveSidebarItemHref(item.name, item.href, user);
                const isActive = !item.isChat && checkSidebarItemActive(pathname, search, effectiveHref);
                const badgeCount = resolveBadgeCount(item.badgeKey);
                return (
                  <button
                    key={`quick-${item.name}`}
                    type="button"
                    onClick={() => handleSelectItem(item)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '10px 6px',
                      borderRadius: '14px',
                      background: isActive
                        ? 'linear-gradient(135deg, rgba(189, 29, 45, 0.30) 0%, rgba(189, 29, 45, 0.12) 100%)'
                        : 'rgba(255, 255, 255, 0.055)',
                      border: isActive
                        ? '1px solid rgba(239, 68, 68, 0.6)'
                        : '1px solid rgba(255, 255, 255, 0.08)',
                      cursor: 'pointer',
                      position: 'relative',
                      color: '#f8fafc',
                    }}
                  >
                    <div
                      style={{
                        position: 'relative',
                        width: 34,
                        height: 34,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        filter: 'drop-shadow(0 3px 6px rgba(0, 0, 0, 0.4))',
                      }}
                    >
                      <AppIcon name={item.iconKey || item.name} size={34} />
                      {badgeCount > 0 && (
                        <span
                          style={{
                            position: 'absolute',
                            top: -4,
                            right: -6,
                            minWidth: 16,
                            height: 16,
                            padding: badgeCount > 9 ? '0 4px' : '0',
                            borderRadius: '999px',
                            background: 'linear-gradient(135deg, #ef4444 0%, #BD1D2D 100%)',
                            color: '#ffffff',
                            fontSize: '0.6rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 0 1.5px #120d10',
                          }}
                        >
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: isActive ? 700 : 600,
                        color: isActive ? '#ffffff' : 'rgba(255,255,255,0.85)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: '100%',
                      }}
                    >
                      {t(item.name)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Menu Groups */}
        {filteredGroups.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'rgba(255,255,255,0.48)', fontSize: '0.85rem' }}>
            {t('Không tìm thấy chức năng phù hợp.')}
          </div>
        ) : (
          filteredGroups.map((group, groupIdx) => (
            <div key={group.title || groupIdx} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingLeft: '2px' }}>
                <span
                  style={{
                    fontSize: '0.64rem',
                    fontWeight: 800,
                    color: 'rgba(255, 255, 255, 0.45)',
                    letterSpacing: '0.09em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {t(group.title)}
                </span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255, 255, 255, 0.06)' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                {group.items.map((item) => {
                  const effectiveHref = resolveSidebarItemHref(item.name, item.href, user);
                  const isActive = checkSidebarItemActive(pathname, search, effectiveHref);
                  const badgeCount = resolveBadgeCount(item.badgeKey);
                  const isSingle = group.items.length === 1;

                  return (
                    <button
                      key={`${item.name}-${item.href}`}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      style={{
                        gridColumn: isSingle ? '1 / -1' : undefined,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 11px',
                        background: isActive
                          ? 'linear-gradient(135deg, rgba(189, 29, 45, 0.30) 0%, rgba(189, 29, 45, 0.12) 100%)'
                          : 'rgba(255, 255, 255, 0.055)',
                        border: isActive
                          ? '1px solid rgba(239, 68, 68, 0.6)'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: '14px',
                        color: isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                        fontSize: '0.8125rem',
                        fontWeight: isActive ? 700 : 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'transform 0.15s ease, background-color 0.15s ease',
                        position: 'relative',
                        boxShadow: isActive ? '0 4px 14px rgba(189, 29, 45, 0.22)' : 'none',
                        minWidth: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 30,
                          height: 30,
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          filter: 'drop-shadow(0 2px 5px rgba(0, 0, 0, 0.35))',
                        }}
                      >
                        <AppIcon name={item.iconKey || item.name} size={30} />
                      </div>
                      <span
                        style={{
                          flex: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t(item.name)}
                      </span>
                      {badgeCount > 0 && (
                        <span
                          style={{
                            minWidth: '18px',
                            height: '18px',
                            padding: badgeCount > 9 ? '0 5px' : '0',
                            borderRadius: '999px',
                            background: 'linear-gradient(135deg, #ef4444 0%, #BD1D2D 100%)',
                            color: '#ffffff',
                            fontSize: '0.625rem',
                            fontWeight: 800,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontVariantNumeric: 'tabular-nums',
                            flexShrink: 0,
                          }}
                        >
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                      {isSingle && badgeCount === 0 && (
                        <ChevronRight size={15} color="rgba(255,255,255,0.4)" style={{ flexShrink: 0 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  );
};
