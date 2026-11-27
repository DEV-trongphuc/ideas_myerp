import React, { createContext, useContext } from 'react';

/**
 * Reports whether the current route tab inside AppTabs is actively visible (`true`)
 * or parked in hidden keep-alive state (`false`). Pages with polling intervals should
 * pause network polling when `isTabActive` is `false`.
 */
export const TabActiveContext = createContext<boolean>(true);

export const useTabActive = (): boolean => useContext(TabActiveContext);
