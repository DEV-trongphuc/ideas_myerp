/**
 * High-Performance Route Prefetcher (Instant Zero-Latency Page Transitions)
 * Loads dynamic module chunks into browser memory ahead of time when user hovers over links.
 */

const prefetchedRoutes = new Set<string>();

const routeLoaders: Record<string, () => Promise<any>> = {
  '/': () => import('../pages/Dashboard'),
  '/workspace': () => import('../pages/SalePortal'),
  '/calendar': () => import('../pages/CalendarPage'),
  '/personal-calendar': () => import('../pages/SalePortal'),
  '/feed': () => import('../pages/EnterpriseFeed'),
  '/approvals': () => import('../pages/Approvals'),
  '/projects': () => import('../pages/ProjectsPage'),
  '/schedules': () => import('../pages/InternalSchedulePage'),
  '/companies': () => import('../pages/CompaniesPage'),
  '/files': () => import('../pages/FilesPage'),
  '/suppliers': () => import('../pages/SuppliersPage'),
  '/contacts': () => import('../pages/ContactsPage'),
  '/deals': () => import('../pages/DealsPage'),
  '/quotes': () => import('../pages/QuotesPage'),
  '/products': () => import('../pages/ProductsPage'),
  '/inventory': () => import('../pages/InventoryPage'),
  '/purchase-orders': () => import('../pages/InventoryPage'),
  '/invoices': () => import('../pages/InvoicesPage'),
  '/sales-orders': () => import('../pages/InvoicesPage'),
  '/cooperation-slips': () => import('../pages/CooperationSlipsPage'),
  '/cooperations': () => import('../pages/CooperationSlipsPage'),
  '/students': () => import('../pages/ContactsPage'),
  '/data': () => import('../pages/DataList'),
  '/fair-share': () => import('../pages/FairShareAudit'),
  '/gatekeeper': () => import('../pages/Gatekeeper'),
  '/tickets': () => import('../pages/Tickets'),
  '/support-tickets': () => import('../pages/TicketsPage'),
  '/account': () => import('../pages/SalePortal'),
  '/my-payslips': () => import('../pages/MyPayslips'),
  '/consultants': () => import('../pages/Consultants'),
  '/attendance': () => import('../pages/AttendancePage'),
  '/hrm': () => import('../pages/HRM'),
  '/accounting-az': () => import('../components/HRM/HrmAccountingAzWorkspace'),
  '/expenses': () => import('../pages/ExpensesPage'),
  '/deposits': () => import('../pages/DepositsPage'),
  '/cash-flow': () => import('../pages/DepositsPage'),
  '/financial-dashboard': () => import('../pages/FinancialDashboard'),
  '/reports-crm': () => import('../pages/ReportsPage'),
  '/settings': () => import('../pages/Settings'),
  '/ai-training': () => import('../pages/AITrainingPage'),
  '/qwen-agent-lab': () => import('../pages/QwenAgentLabPage'),
  '/accounts': () => import('../pages/Accounts'),
  '/rounds': () => import('../pages/Rounds'),
  '/rules': () => import('../pages/RuleSettings'),
  '/integrations': () => import('../pages/Integrations'),
};

export const prefetchRoute = (href: string): void => {
  if (!href) return;
  const path = href.split('?')[0]; // strip query params
  if (prefetchedRoutes.has(path)) return;

  const loader = routeLoaders[path];
  if (loader) {
    prefetchedRoutes.add(path);
    // Execute during browser idle time or immediate async microtask
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        loader().catch(() => {
          // Silent fallback
        });
      }, { timeout: 1200 });
    } else {
      setTimeout(() => {
        loader().catch(() => {
          // Silent fallback
        });
      }, 50);
    }
  }
};
