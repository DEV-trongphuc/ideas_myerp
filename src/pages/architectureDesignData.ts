export interface ArchSectionBlock {
  id: string;
  heading: string;
  paragraphs?: string[];
  bullets?: Array<{ label?: string; text: string; code?: string }>;
  diagram?: 'c4' | 'approval-state' | 'lead-pipeline' | 'ai-sequence' | 'core-erd' | 'z-index';
  table?: {
    headers: string[];
    rows: string[][];
  };
  callout?: {
    tone: 'info' | 'warn' | 'success';
    title: string;
    body: string;
  };
  codeBlock?: {
    title: string;
    lang: string;
    code: string;
  };
}

export interface ArchChapter {
  id: string;
  code: string;
  group: string;
  title: string;
  shortTitle: string;
  summary: string;
  badges: Array<{ label: string; tone?: 'slate' | 'blue' | 'green' | 'amber' | 'red' }>;
  fileAnchors: string[];
  sections: ArchSectionBlock[];
}

export const archChapters: ArchChapter[] = [
  // =========================================================================
  // I. KIẾN TRÚC TỔNG THỂ & HẠ TẦNG (3 MỤC)
  // =========================================================================
  {
    id: 'c4-topology',
    code: '01',
    group: 'I. KIẾN TRÚC TỔNG THỂ',
    title: 'C4 Container Topology & Luồng Request Tổng thể',
    shortTitle: 'C4 Container Topology',
    summary:
      'MYERP (Enterprise SaaS Operations Suite) áp dụng kiến trúc Modular Monolith kết hợp Dual-Router Gateway, chạy trên React 19 SPA/PWA ở Client và PHP 8.1+ (PDO + MySQLi) + MySQL/MariaDB InnoDB ở Server.',
    badges: [
      { label: 'Modular Monolith', tone: 'blue' },
      { label: 'React 19.2 SPA/PWA', tone: 'slate' },
      { label: 'PHP 8.1+ Dual-Router', tone: 'green' },
      { label: 'MySQL ~251 Tables', tone: 'amber' }
    ],
    fileAnchors: ['src/App.tsx', 'vite.config.ts', 'public/.htaccess', 'backend/api.php', 'backend/index.php'],
    sections: [
      {
        id: 'sec-c4-diagram',
        heading: '1.1. Sơ đồ C4 Container Topology',
        paragraphs: [
          'Mọi kết nối HTTPS từ trình duyệt hoặc PWA đi qua lớp HTTP Edge (.htaccess). Tệp tĩnh JS/CSS được phục vụ trực tiếp, còn toàn bộ API /api/* được rewrite về backend/api.php?action=$1 để điều hướng tới Legacy Handler hoặc OOP Front-Controller (backend/index.php).'
        ],
        diagram: 'c4'
      },
      {
        id: 'sec-c4-flow',
        heading: '1.2. Chuỗi Xử lý End-to-End cho 1 Request API',
        bullets: [
          {
            label: 'Bước 1 — Frontend Request Normalization',
            text: 'Axios interceptor trong src/api/axios.ts tự động đổi PUT/PATCH/DELETE sang POST kèm query _method=<METHOD>, chuyển đường dẫn /<endpoint> thành api.php?action=<endpoint>, xóa Content-Type trên GET/HEAD để tránh WAF chặn 415.',
            code: 'src/api/axios.ts'
          },
          {
            label: 'Bước 2 — Edge Rewrite (.htaccess)',
            text: 'LiteSpeed RewriteRule ^api/(.*)$ backend/api.php?action=$1 [QSA,L] đưa request vào gateway; các asset hash bị thiếu trong /assets/* bị ép trả 404 thay vì fallback index.html.',
            code: 'public/.htaccess'
          },
          {
            label: 'Bước 3 — Gateway Bridge',
            text: 'backend/api.php tách segment đầu (loại tiền tố v1/ hoặc api/), kiểm tra $baseAction thuộc danh sách 73 resource prefix REST để nạp backend/index.php và exit sớm.',
            code: 'backend/api.php'
          },
          {
            label: 'Bước 4 — Front-Controller Security & Dispatch',
            text: 'backend/index.php xử lý Multi-Tenant CORS cache 300s, tắt nén zlib cho SSE stream, chạy requireAuth() xác thực JWT HS256 + active user cache 60s, sanitize getBody() rồi dispatch tới 65 OOP Controllers.'
          }
        ]
      }
    ]
  },
  {
    id: 'workspace-inventory',
    code: '02',
    group: 'I. KIẾN TRÚC TỔNG THỂ',
    title: 'Bản đồ Workspace & Kiểm kê Toàn bộ Modules',
    shortTitle: 'Workspace & Modules Map',
    summary:
      'Tổng hợp cấu trúc thư mục nguồn và ánh xạ trực tiếp từ 14 phân hệ nghiệp vụ sang Page TSX, Controller PHP, Worker chạy ngầm và các bảng MySQL trọng tâm.',
    badges: [
      { label: 'Core ERP SPA', tone: 'blue' },
      { label: 'OOP Controllers', tone: 'green' }
    ],
    fileAnchors: ['src/pages/', 'backend/controllers/', 'backend/migrations/', 'tests/e2e/runner.js'],
    sections: [
      {
        id: 'sec-inv-containers',
        heading: '2.1. Kiểm kê Thành phần Kỹ thuật trong Repo',
        table: {
          headers: ['Thư mục / Thành phần', 'Quy mô / Công nghệ', 'Chức năng Cốt lõi', 'File Neo Chính'],
          rows: [
            ['src/ (Frontend SPA/PWA)', 'React 19.2, TS ~6.0, Vite 8.0, Tailwind 4.3', 'Giao diện toàn hệ thống, Zustand state, Recharts BI, WorkChat', 'src/App.tsx, src/main.tsx'],
            ['public/ (Edge & PWA Assets)', '.htaccess, sw.js, manifest.json, openapi.json, stickers/*', 'PWA Pass-Through Service Worker, static assets, stickers chatbot & Apache rewrite', 'public/.htaccess, public/sw.js'],
            ['backend/ (Gateway & Core)', 'PHP 8.1+ (PDO Prepared + MySQLi)', 'Dual-router api.php + index.php, JWT HS256, 2FA TOTP, Notification & Webhook Logic', 'backend/api.php, backend/index.php'],
            ['backend/controllers/', 'OOP Controllers + agent_tools/', 'Controllers theo domain + 6 Chat Traits + AI Agents Tool Registry', 'AgentToolRegistry.php, ChatController.php'],
            ['backend/cron_*.php', '11 scheduled scripts + cron_master.php', 'Master Cron 1 phút/lần với flock(), Google Sheets 2 chiều, Reminder công nợ/học vụ', 'cron_master.php, cron_sync.php'],
            ['backend/migrations/', 'run_migrations.php (targetVersion = 352)', 'Tiến hóa schema idempotent với GET_LOCK, tạo SQL Views tương thích ngược', 'backend/run_migrations.php'],
            ['tests/', 'Node + PHP E2E Suite', 'Kiểm thử Feature, Boundary, Cross-Feature Interaction và Chaos Defense', 'tests/e2e/runner.js']
          ]
        }
      },
      {
        id: 'sec-inv-domain-map',
        heading: '2.2. Ma trận Ánh xạ Nghiệp vụ (UI -> Controller -> Database)',
        table: {
          headers: ['Phân hệ Nghiệp vụ', 'Frontend Routes / Pages', 'Backend Controllers', 'Bảng SQL Trọng tâm'],
          rows: [
            ['CRM & Tuyển sinh 14 bước', '/contacts, /students, /companies, /deals, /quotes', 'ContactController, CompanyController, DealController, QuoteController', 'contacts, companies, deals, quotes, pipeline_stages'],
            ['Chia số & Gatekeeper', '/rounds, /rules, /gatekeeper, /fair-share-audit', 'LeadDistributionController, ConsultantShiftController, ConnectorController', 'distribution_rounds, distribution_logs, blocked_leads, consultant_shifts'],
            ['Tài chính, Cọc & Hợp tác', '/deposits, /financial-dashboard, /cooperation-slips', 'DepositController, CooperationController, FinanceController', 'deposits, deposit_milestones, cooperation_slips, invoices, expenses'],
            ['Mua / Bán / POS & Kho', '/products, /inventory, POSModal, PurchaseOrdersTab', 'SalesOrderController, PurchaseOrderController, POSController, InventoryController', 'sales_orders, purchase_orders, pos_sessions, products, inventory_logs'],
            ['HRM, Chấm công & Kế toán A-Z', '/hrm, /attendance, /my-payslips, /accounting-az, /approvals', 'HRMController, CheckInController, AssetController, TeamController', 'users, check_ins, hrm_leave_requests, monthly_payslips, hrm_assets'],
            ['Học vụ & Lịch 1:1', '/public-schedule/*, /public-booking/1on1/*, StudentAcademicWorkspace', 'AcademicAffairsController, StudentDocOcrService', 'student_subject_grades, student_postpone_records, mentoring_1on1_bookings'],
            ['Công việc, Dự án & Social', '/projects, /workspace, /calendar, /feed, /tickets', 'ProjectController, ActivityController, TaskGroupController, TicketController, PostController', 'projects, activities, task_groups, task_whiteboards, support_tickets, posts'],
            ['WorkChat & AI Swarm', 'WorkChatModal, QwenAgentLabPage, AITrainingPage', 'ChatController (6 Traits), AIController, QwenAgentController, AgentToolRegistry', 'chat_conversations, chat_messages, ai_query_audit_logs, ai_knowledge_base']
          ]
        }
      }
    ]
  },
  {
    id: 'http-edge-pwa',
    code: '03',
    group: 'I. KIẾN TRÚC TỔNG THỂ',
    title: 'HTTP Edge (.htaccess), PWA Service Worker & Live Versioning',
    shortTitle: 'HTTP Edge & PWA Anti-Stale',
    summary:
      'Cấu hình lớp biên LiteSpeed / Apache kết hợp Pass-Through Service Worker nhằm đáp ứng chuẩn cài đặt PWA Desktop/Mobile nhưng triệt tiêu 100% lỗi kẹt cache chunk cũ (MIME text/html) sau mỗi lần deploy.',
    badges: [
      { label: 'alt-php81', tone: 'slate' },
      { label: 'Strict 404 Assets', tone: 'red' },
      { label: 'Pass-Through SW', tone: 'green' }
    ],
    fileAnchors: ['public/.htaccess', 'public/sw.js', 'src/components/AutoUpdateChecker.tsx', 'vite.config.ts'],
    sections: [
      {
        id: 'sec-edge-htaccess',
        heading: '3.1. Quy tắc LiteSpeed / Apache Edge (public/.htaccess)',
        bullets: [
          { label: 'Ép Runtime PHP 8.1', text: 'Dùng AddHandler application/x-httpd-alt-php81 .php để ổn định socket và tránh lỗi segfault trên CloudLinux alt-php82.' },
          { label: 'Chống Trả HTML Cho Chunk Hỏng', text: 'RewriteRule ^assets/ - [R=404,L] bắt buộc trả HTTP 404 nếu file JS/CSS trong /assets/* không còn tồn tại sau build mới, tuyệt đối không fallback về index.html.' },
          { label: 'No-Store Metadata Files', text: 'Ép Cache-Control: no-store, no-cache, must-revalidate, max-age=0 đối với version.json, sw.js, manifest.json và index.html; ngược lại ảnh/css/js hợp lệ được mod_expires cache 1 tuần đến 1 tháng.' }
        ],
        codeBlock: {
          title: 'Trích đoạn public/.htaccess (Routing, 404 Assets & Cache Control)',
          lang: 'apacheconf',
          code: `AddHandler application/x-httpd-alt-php81 .php

RewriteEngine On
RewriteBase /
RewriteRule ^api/(.*)$ backend/api.php?action=$1 [QSA,L]
RewriteRule ^uploads/(.*)$ backend/uploads/$1 [L]
RewriteRule ^backend/ - [L]

RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

# Không bao giờ trả index.html cho file bundle /assets/* đã bị thay hash
RewriteRule ^assets/ - [R=404,L]

RewriteCond %{REQUEST_URI} !\\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|eot|map|mp4|webm|xlsx?|docx?|pdf)$ [NC]
RewriteRule ^ index.html [L]`
        }
      },
      {
        id: 'sec-edge-sw',
        heading: '3.2. Pass-Through Service Worker (public/sw.js) & X-App-Version',
        bullets: [
          {
            label: 'Tự dọn Cache khi Kích hoạt',
            text: 'Event install gọi self.skipWaiting(); event activate xóa toàn bộ caches.keys() cũ và gọi self.clients.claim(). Nhận postMessage SKIP_WAITING / PURGE_CACHE để ép cập nhật từ UI.',
            code: 'public/sw.js'
          },
          {
            label: 'Pure Pass-Through Fetch Handler',
            text: 'Listener fetch trả về trực tiếp (không gọi event.respondWith()) đối với điều hướng trang, document, script, style và mọi đường dẫn /assets/* để trình duyệt dùng tầng HTTP tự nhiên, tránh rejected FetchEvent.',
            code: 'public/sw.js'
          },
          {
            label: 'Version Handshake 2 Chiều',
            text: 'Backend gửi header X-App-Version hoặc trả /backend/version.json; Axios bắt x-app-version bắn CustomEvent("app-backend-version") tới AutoUpdateChecker.tsx để đối chiếu /version.json.',
            code: 'src/api/axios.ts'
          }
        ]
      }
    ]
  },

  // =========================================================================
  // II. KIẾN TRÚC FRONTEND (4 MỤC)
  // =========================================================================
  {
    id: 'fe-build-safety',
    code: '04',
    group: 'II. KIẾN TRÚC FRONTEND',
    title: 'Build Pipeline, Code Splitting & Defensive Runtime Guards',
    shortTitle: 'Build Splitting & Array Guards',
    summary:
      'Quy trình đóng gói Vite 8 + TypeScript ~6.0 tách 8 vendor chunks độc lập, tự động đóng dấu versionManifestPlugin() và trang bị lớp bảo vệ Collection Guards chống crash runtime khi dữ liệu API biến dạng.',
    badges: [
      { label: 'Vite 8 + tsc -b', tone: 'blue' },
      { label: '8 Vendor Chunks', tone: 'slate' },
      { label: 'safeArray.ts', tone: 'green' }
    ],
    fileAnchors: ['vite.config.ts', 'src/utils/safeArray.ts', 'src/components/ErrorBoundary.tsx'],
    sections: [
      {
        id: 'sec-fe-chunks',
        heading: '4.1. Chiến lược Manual Chunk Splitting (vite.config.ts)',
        paragraphs: [
          'build.rollupOptions.output.manualChunks tách các thư viện kích thước lớn thành các bundle độc lập giúp người dùng không phải tải lại thư viện nền mỗi khi triển khai bản sửa UI mới, đồng thời production build tự drop console và debugger.'
        ],
        table: {
          headers: ['Tên Chunk', 'Thư viện được gom nhóm', 'Mục đích Tối ưu'],
          rows: [
            ['vendor-react', 'react, react-dom, react-router, react-router-dom, scheduler', 'Ổn định core runtime & Router across releases'],
            ['vendor-icons', 'lucide-react', 'Cache dài hạn toàn bộ hệ thống SVG icons'],
            ['vendor-charts', 'recharts, d3', 'Nạp tách biệt chỉ khi mở các Dashboard BI & Reports'],
            ['vendor-xlsx', 'xlsx', 'Nạp theo nhu cầu khi xuất/nhập file Excel'],
            ['vendor-pptx', 'pptxgenjs, jszip', 'Cô lập thư viện xuất trình chiếu & nén ZIP'],
            ['vendor-framer / vendor-dnd', 'framer-motion / @dnd-kit', 'Phục vụ animation Drawers và kéo thả Kanban / Flow'],
            ['vendor', 'Các dependency node_modules còn lại', 'Tách bạch khỏi app code của dự án']
          ]
        }
      },
      {
        id: 'sec-fe-guards',
        heading: '4.2. Collection Safety Layer (src/utils/safeArray.ts)',
        paragraphs: [
          'Đảm bảo mọi thao tác .map(), .filter(), .slice(), .forEach() trên dữ liệu trả về từ API, cache IndexedDB hoặc localStorage không bao giờ văng lỗi TypeError khi API trả về object rỗng {}, wrapper phân trang hoặc giá trị null/undefined.'
        ],
        codeBlock: {
          title: 'src/utils/safeArray.ts — Chuẩn hóa mọi Payload Collection đa dạng',
          lang: 'ts',
          code: `export function ensureArray<T = any>(value: unknown, fallback: T[] = []): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

// Hỗ trợ: raw array [...], { data: [...] }, { data: { items: [...] } }, { items/list/rows/records/results/files/users/... }
export function extractArray<T = any>(payload: any, ...extraKeys: string[]): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (!payload || typeof payload !== 'object') return [];
  const keys = extraKeys.length > 0 ? [...extraKeys, ...DEFAULT_COLLECTION_KEYS] : DEFAULT_COLLECTION_KEYS;
  if (payload.data !== undefined && payload.data !== null) {
    if (Array.isArray(payload.data)) return payload.data as T[];
    if (typeof payload.data === 'object') {
      for (const k of keys) if (Array.isArray(payload.data[k])) return payload.data[k] as T[];
    }
  }
  for (const k of keys) if (Array.isArray(payload[k])) return payload[k] as T[];
  return [];
}`
        }
      }
    ]
  },
  {
    id: 'fe-routing-apptabs',
    code: '05',
    group: 'II. KIẾN TRÚC FRONTEND',
    title: 'Routing Matrix, Pre-React Splash Guard & Persistent AppTabs',
    shortTitle: 'Routing & Persistent AppTabs',
    summary:
      'Cơ chế định tuyến kết hợp Pre-React Splash Guard tại index.html (tránh nhấp nháy màn hình chờ ở trang công khai) và AppTabs giữ sống trạng thái DOM của các module đã mở bằng CSS contain.',
    badges: [
      { label: '0ms Splash Guard', tone: 'green' },
      { label: 'Keep-Alive Tabs', tone: 'blue' },
      { label: 'Strict Role Matrix', tone: 'red' }
    ],
    fileAnchors: ['index.html', 'src/App.tsx', 'src/utils/roleUtils.ts'],
    sections: [
      {
        id: 'sec-fe-splash',
        heading: '5.1. Pre-React Splash Guard & AppTabs Lifecycle',
        bullets: [
          {
            label: 'Pre-React Guard (index.html)',
            text: 'Script đồng bộ chạy ngay trong <head>: kiểm tra localStorage Ideas_token/access_token và đường dẫn public (/login, /download, /public-schedule, /public-booking, /docs, /documentation, /architecture*, /api-docs*, /api-v1-docs) để gán class hide-initial-splash (display: none !important) trước khi React mount.',
            code: 'index.html'
          },
          {
            label: 'Persistent AppTabs Engine',
            text: 'Lưu visitedPaths trong state của AppTabs (src/App.tsx). Mỗi tuyến ẩn được giữ sống bằng CSS display: none, contain: strict, contentVisibility: hidden để không mất bộ lọc/scroll khi chuyển tab; hỗ trợ refresh riêng từng tab qua CustomEvent("refresh-page", { detail: { path } }).',
            code: 'src/App.tsx'
          },
          {
            label: 'Static Import cho Cổng Tài liệu Khẩn',
            text: 'ArchitectureDesignPage được import tĩnh trong App.tsx thay vì React.lazy để loại bỏ hoàn toàn loading fallback khi truy cập /architecture-design.',
            code: 'src/App.tsx'
          }
        ]
      },
      {
        id: 'sec-fe-routetable',
        heading: '5.2. Ma trận Tuyến Public vs Protected & Dynamic Role Guards',
        table: {
          headers: ['Tuyến URL (Path)', 'Điều kiện Quyền Truy cập', 'Component Đích'],
          rows: [
            ['/login, /report-data, /demo, /download, /splash-preview', 'Public (không bọc ProtectedRoute)', 'Login, ReportData, DemoEntry, DownloadPage, SplashPreviewPage'],
            ['/public-schedule/*, /public-booking/1on1/*', 'Public Portal theo mã booking lịch học & 1:1', 'PublicSchedulePage, PublicBooking1on1Page'],
            ['/docs, /documentation, /api-docs, /architecture-design (+ /architecture, /docs/architecture)', 'Public Technical Portals (ẩn ChatFloatingLauncher)', 'DocumentationPage, ApiV1DocumentationPage, ArchitectureDesignPage'],
            ['/', 'isAcademic -> SalePortal; role sale -> SalePortal; Khác -> Dashboard', 'SalePortal / Dashboard'],
            ['/workspace, /account, /calendar, /personal-calendar', 'Authenticated (Accountant trên /calendar -> DataList)', 'SalePortal / DataList / CalendarPage'],
            ['/contacts, /students, /data, /companies, /deals, /quotes, /activities, /gatekeeper, /tickets', 'ProtectedRoute + Row-level RBAC scope', 'ContactsPage, DataList, CompaniesPage, DealsPage, QuotesPage, Gatekeeper, Tickets'],
            ['/rounds, /rules, /integrations, /settings, /accounts', 'admin, superadmin, director, marketing (settings thêm manager; accounts thêm hr) hoặc dynamic grant', 'Rounds, RuleSettings, Integrations, Settings, Accounts'],
            ['/deposits, /cash-flow, /accounting-az, /financial-dashboard, /hrm, /my-payslips', 'deposits:read, finance:read, hrm:read hoặc Executive / Accountant / HR', 'DepositsPage, HrmAccountingAzWorkspace, FinancialDashboard, HRM, MyPayslips']
          ]
        }
      }
    ]
  },
  {
    id: 'fe-state-http',
    code: '06',
    group: 'II. KIẾN TRÚC FRONTEND',
    title: 'State Management (Zustand + Contexts) & Tầng HTTP Caching',
    shortTitle: 'Zustand State & HTTP Layer',
    summary:
      'Hệ thống tách 3 kho Zustand (authStore, uiStore, chatStore) cùng TenantConfigContext, tích hợp Axios method tunneling, 29 endpoint LRU cache và Single-Flight 401 Refresh Mutex.',
    badges: [
      { label: 'Zustand Persistent', tone: 'slate' },
      { label: '29 LRU Endpoints', tone: 'blue' },
      { label: 'Single-Flight 401', tone: 'green' }
    ],
    fileAnchors: ['src/store/authStore.ts', 'src/store/uiStore.ts', 'src/store/chatStore.ts', 'src/api/axios.ts'],
    sections: [
      {
        id: 'sec-fe-stores',
        heading: '6.1. Hệ thống 3 Zustand Stores & Runtime TenantContext',
        bullets: [
          {
            label: 'useAuthStore (key: minth-auth)',
            text: 'Lưu user, accessToken, refreshToken, chuẩn hóa sales -> sale và super_admin -> superadmin; hàm clearAuth() gọi clearApiCache() để xóa toàn bộ cache phiên cũ.',
            code: 'src/store/authStore.ts'
          },
          {
            label: 'useUIStore',
            text: 'Khử trùng lặp Toast trong TOAST_DEDUPE_WINDOW_MS = 1200ms; điều phối showPOS, confirmModal (hỗ trợ requireWordMatch / requirePromptInput), callModal và 5 Global Drawers (customerDrawer, taskDrawer, expenseDrawer, approvalDrawer, depositDrawer).',
            code: 'src/store/uiStore.ts'
          },
          {
            label: 'useChatStore + IndexedDB + BroadcastChannel',
            text: 'Đồng bộ đa tab qua chatBroadcast.ts, lưu cache tin nhắn offline bằng chatIndexedDB.ts, preload stickers qua chatAssetPrewarmer.ts và gửi ngữ cảnh trang hiện tại qua getClientCurrentContext().',
            code: 'src/store/chatStore.ts'
          },
          {
            label: 'TenantConfigContext',
            text: 'Nạp runtime TenantOrganization, TenantRoleDef[], TenantTeamDef[], TenantStudentTabDef[] và TenantAcademicProgramDef[] theo tenant đang đăng nhập.',
            code: 'src/contexts/TenantConfigContext.tsx'
          }
        ]
      },
      {
        id: 'sec-fe-http',
        heading: '6.2. Cơ chế Cache 2 Tầng, Method Tunneling & 401 Refresh Mutex',
        table: {
          headers: ['Cơ chế Networking', 'Cấu hình / Ngưỡng thực tế', 'Hành vi Kỹ thuật'],
          rows: [
            ['Base URL Auto-Detect (env.ts)', 'localhost/127.0.0.1 -> /backend; Domain thật -> origin/backend', 'Dev đi qua Vite proxy giả lập Chrome User-Agent vượt WAF'],
            ['Method Tunneling (axios.ts)', 'PUT / PATCH / DELETE -> POST + _method=<METHOD>', 'Bọc url thành api.php?action=<path>'],
            ['ERP Core Reference Cache', '29 endpoints • TTL 60s • Pending GET deduplication', 'Tự xóa toàn bộ cacheMap khi bất kỳ mutation POST/PUT/PATCH/DELETE nào hoàn thành'],
            ['401 Refresh Mutex & Retry', 'refreshInFlightPromise đơn lẻ; retry tối đa 2 lần (600ms, 1200ms)', 'Gom nhiều API 401 đồng thời vào 1 call auth/refresh; bỏ qua endpoint /auth/* khi fail']
          ]
        }
      }
    ]
  },
  {
    id: 'fe-overlay-design',
    code: '07',
    group: 'II. KIẾN TRÚC FRONTEND',
    title: '6-Tier Z-Index Overlay Stack, Phím tắt LIFO & Brand UI System',
    shortTitle: 'Overlay Z-Index & Shortcuts',
    summary:
      'Quản lý ngăn xếp Portal 6 tầng chống đè lớp giữa Floating Chat, Slide-over Drawers, Nested Drawers, Confirm Modals và Toast; đồng thời bảo vệ bộ gõ tiếng Việt IME khỏi xung đột phím tắt.',
    badges: [
      { label: 'LIFO Esc Stack', tone: 'blue' },
      { label: '6 Z-Index Tiers', tone: 'slate' },
      { label: 'IME Telex/VNI Safe', tone: 'green' }
    ],
    fileAnchors: ['src/utils/overlayStack.ts', 'src/index.css', 'src/components/common/AppIcons.tsx', 'src/hooks/useNativeAppBackGuard.ts'],
    sections: [
      {
        id: 'sec-fe-zindex-diagram',
        heading: '7.1. Phân cấp Z-Index 6 Tầng (overlayStack.ts & index.css)',
        paragraphs: [
          'Chú ý kỹ thuật với LightningCSS / Vite CSS minifier: không đặt số nguyên 10 chữ số (21474836xx) vào fallback của var(--z, ...) trong CSS vì f32 float bị làm tròn thành 2147480000; các giá trị Tier 3–5 được khai báo trực tiếp bằng class hoặc inline style chuẩn.'
        ],
        diagram: 'z-index'
      },
      {
        id: 'sec-fe-ergonomics',
        heading: '7.2. Phím tắt Toàn cục, IME Guard & Hệ thống App Icons',
        bullets: [
          { label: 'LIFO Escape Closing', text: 'pushOverlay(id, close, priority) tự chuẩn hóa độ ưu tiên và popAndCloseTopOverlay() chỉ đóng đúng lớp trên cùng khi bấm ESC.' },
          { label: 'IME Composition Protection', text: 'Global keyboard handler kiểm tra e.isComposing || e.keyCode === 229 để không cắt ngang dấu tiếng Việt Telex/VNI; hỗ trợ Ctrl+S lưu form, J/K/Enter điều hướng bảng và Alt+[phím] chuyển phân hệ.' },
          { label: 'App Icons Gradient Safety', text: 'Mỗi icon trong AppIcons.tsx sở hữu SVG linearGradient id riêng biệt (không trùng ID), kết hợp nền đa sắc phân biệt trực quan giữa các phân hệ trên Sidebar và AppLauncherModal.' }
        ]
      }
    ]
  },

  // =========================================================================
  // III. KIẾN TRÚC BACKEND (4 MỤC)
  // =========================================================================
  {
    id: 'be-dual-router',
    code: '08',
    group: 'III. KIẾN TRÚC BACKEND',
    title: 'Dual-Router Bridge (api.php -> index.php) & Lifecycle Bảo vệ DB',
    shortTitle: 'Dual-Router Bridge & Lifecycle',
    summary:
      'Cơ chế Dual-Router giữ nguyên tương thích cho các legacy actions trong api.php trong khi điều hướng 73 nhóm tài nguyên REST chuẩn hóa sang OOP Front-Controller (index.php) với Auto-Rollback và ETag.',
    badges: [
      { label: '73 Bridged Resources', tone: 'blue' },
      { label: 'Auto-Rollback PDO', tone: 'red' },
      { label: 'ETag 304 Cache', tone: 'green' }
    ],
    fileAnchors: ['backend/api.php', 'backend/index.php', 'backend/config/Database.php'],
    sections: [
      {
        id: 'sec-be-router-rules',
        heading: '8.1. Cơ chế Điều hướng & Tự phục hồi Query trong api.php',
        codeBlock: {
          title: 'backend/api.php — Self-healing query & OOP Bridge',
          lang: 'php',
          code: `// Phục hồi nếu client truyền nhầm dấu ? thay vì & (vd action=contacts?page=2)
if (strpos($action, '?') !== false) {
    $parts = explode('?', $action, 2);
    $action = trim($parts[0], '/');
    parse_str($parts[1], $extraGet);
    $_GET = array_merge($_GET, $extraGet);
}
// Bóc tiền tố v1/ hoặc api/ -> so khớp 73 domain prefix để chuyển sang index.php
if (in_array($baseAction, ['auth','contacts','deals','deposits','finance','expenses','hrm','chat','academic-affairs','tenant-config', ...], true)) {
    $_SERVER['REQUEST_URI'] = '/backend/' . $action . (!empty($_GET) ? '?' . http_build_query($_GET) : '');
    require_once __DIR__ . '/index.php';
    exit;
}`
        }
      },
      {
        id: 'sec-be-index-helpers',
        heading: '8.2. Chuẩn hóa Payload (getBody) & Auto-Rollback (respond)',
        bullets: [
          {
            label: 'getBody() Date & Numeric Sanitization',
            text: 'Đệ quy qua JSON body + $_POST: chuyển "", "0000-00-00", "1970-01-01" ở 22 khóa ngày (dob, join_date, start_date, due_date, paid_date...) thành null; chuyển "" ở các trường tiền tệ (amount, price, expected_commission, base_salary...) thành 0 trước khi chạm MySQL PDO.',
            code: 'backend/index.php'
          },
          {
            label: 'respond() Transaction Guard & 304 ETag',
            text: 'Khi $code >= 400, tự động gọi $db->rollBack() nếu $db->inTransaction() đang mở để giải phóng InnoDB lock tức thì; với GET 200, sinh ETag = md5($json) trả 304 Not Modified khi khớp HTTP_IF_NONE_MATCH.',
            code: 'backend/index.php'
          },
          {
            label: 'Database Singleton Strict Mode',
            text: 'Database.php thiết lập ATTR_ERRMODE => ERRMODE_EXCEPTION, ATTR_EMULATE_PREPARES => false (native prepared statements), charset utf8mb4_unicode_ci, time_zone = +07:00 và timeout 300s.',
            code: 'backend/config/Database.php'
          }
        ]
      }
    ]
  },
  {
    id: 'be-auth-rbac',
    code: '09',
    group: 'III. KIẾN TRÚC BACKEND',
    title: 'Env-Only Auth, JWT HS256, 2FA TOTP & Dynamic Multi-Tenant RBAC',
    shortTitle: 'Auth JWT, TOTP & Dynamic RBAC',
    summary:
      'Xác thực Zero-Trust đọc secret bắt buộc từ backend/.env, kiểm tra JWT HMAC-SHA256 kèm file cache user 60s và giải phân quyền 3 lớp đồng bộ giữa Frontend và Backend qua TenantConfigService.',
    badges: [
      { label: 'Env-Only Fail-Closed', tone: 'red' },
      { label: '2FA TOTP', tone: 'blue' },
      { label: '33 Modules RBAC', tone: 'green' }
    ],
    fileAnchors: ['backend/config.php', 'backend/config/Config.php', 'backend/config/JWT.php', 'backend/config/TenantConfigService.php', 'backend/permission_matrix_helper.php', 'backend/utils/TOTP.php'],
    sections: [
      {
        id: 'sec-be-auth-flow',
        heading: '9.1. Cấu hình Fail-Closed & Vòng đời requireAuth()',
        bullets: [
          { label: 'Strict Env Loading', text: 'backend/config.php và Config.php nạp backend/.env qua env.php; không còn fallback DB_PASS hay JWT_SECRET tĩnh trong source code.' },
          { label: 'Token Validation & Active Cache', text: 'requireAuth() bóc Bearer token (hoặc $_GET["token"] cho SSE), giải mã JWT HS256, xác minh DB user còn is_active = 1 AND deleted_at IS NULL thông qua file cache sys_get_temp_dir()/myerp_auth_u_{uid}_{tid}.json (TTL 60s).' },
          { label: 'Two-Factor Authentication', text: 'AuthController hỗ trợ 2FA TOTP (backend/utils/TOTP.php) cùng backup codes mã hóa lưu tại bảng users.' }
        ]
      },
      {
        id: 'sec-be-rbac-layers',
        heading: '9.2. Cơ chế Giải Phân quyền 3 Lớp (permission_matrix_helper.php)',
        table: {
          headers: ['Thứ tự ưu tiên', 'Nguồn Phân quyền', 'Quy tắc Quyết định Scope (all | team | own | none)'],
          rows: [
            ['Tầng 1 (Bypass)', 'role = superadmin | admin', 'Luôn trả về scope "all" trên toàn bộ 33 modules của tenant'],
            ['Tầng 2 (User Override)', 'users.permissions_json', 'Nếu admin cấp ngoại lệ riêng cho user tại cặp [module][action], ưu tiên dùng ngay scope này'],
            ['Tầng 3 (Dynamic Role)', 'tenant_roles (is_active = 1 AND deleted_at IS NULL)', 'Tra role_slug trong tenant; nếu là custom role chưa cấu hình module -> trả "none" (Fail-Closed)'],
            ['Tầng 4 (Built-in Fallback)', 'TenantConfigService::defaultRoleDefinitions()', 'Dùng ma trận chuẩn cho system roles (director, manager, hr, accountant, marketing, sales, assistant, viewer)']
          ]
        }
      },
      {
        id: 'sec-be-tcfg',
        heading: '9.3. TenantConfigService — 33 Modules & 6 Bảng Cấu hình SaaS',
        paragraphs: [
          'TenantConfigService::MODULES định nghĩa 33 phân hệ: dashboard, workspace, contacts, students, deals, leads, projects, campaigns, schedules, companies, suppliers, products, inventory, quotes, invoices, sales_orders, purchase_orders, deposits, expenses, finance, cooperations, hrm, attendance, approvals, tickets, gatekeeper, marketing, files, reports, users, teams, settings, ai. Mọi thay đổi cấu hình đều gọi invalidateCache($tenantId) để dọn sạch cache tạm trong /tmp.'
        ]
      }
    ]
  },
  {
    id: 'be-controllers-matrix',
    code: '10',
    group: 'III. KIẾN TRÚC BACKEND',
    title: 'Kho 62 Controllers Nghiệp vụ & Cơ chế Bảo vệ Dữ liệu',
    shortTitle: '62 Controllers & IDOR Guards',
    summary:
      'Phân loại chi tiết toàn bộ các Controller trong backend/controllers/, phạm vi phụ trách, kiểm soát IDOR cấp bản ghi và chuẩn Xóa mềm (Soft-Delete) bắt buộc.',
    badges: [
      { label: '62 Root + 3 Agent Tools', tone: 'blue' },
      { label: '100% Soft-Delete', tone: 'green' },
      { label: 'IDOR Row Checks', tone: 'red' }
    ],
    fileAnchors: ['backend/controllers/', 'backend/index.php'],
    sections: [
      {
        id: 'sec-be-ctrl-table',
        heading: '10.1. Bảng Chi tiết Các Controller Trọng tâm',
        table: {
          headers: ['Nhóm Phân hệ', 'Danh sách Controllers Chính', 'Cơ chế Bảo vệ & Bất biến Dữ liệu'],
          rows: [
            ['System, Auth & SaaS', 'AuthController, UserCtrl, PresenceCtrl...', 'Admin/Director, tenant_id'],
            ['CRM Core', 'ContactCtrl, CompanyCtrl, DealCtrl...', 'Owner_id/Team, Soft-Delete'],
            ['Phân phối Lead', 'LeadDistCtrl, ConsultantShiftCtrl...', 'FOR UPDATE, chia lead'],
            ['Tài chính & Đặt cọc', 'DepositCtrl, FinanceCtrl...', 'Transaction, duyệt 2 cấp'],
            ['Thương mại & Kho', 'SalesOrderCtrl, POSCtrl, InventoryCtrl...', 'Tồn kho nguyên tử, workflow'],
            ['Nhân sự & Học vụ', 'HRMCtrl, CheckInCtrl, AssetCtrl...', 'Khóa lương, self-service'],
            ['Work, Helpdesk & TB', 'ProjectCtrl, TicketCtrl, PostCtrl...', 'Gộp thông báo, deep-link'],
            ['WorkChat, AI & Meta Ads', 'ChatCtrl, AIController, QwenAgentCtrl, MetaAdsCtrl', 'Domain-scoped, Working Memory']
          ]
        }
      }
    ]
  },
  {
    id: 'be-files-search-export',
    code: '11',
    group: 'III. KIẾN TRÚC BACKEND',
    title: 'Quản trị Tệp Tin, OCR Hợp đồng/CCCD, Export & Global Search',
    shortTitle: 'Files, OCR, Export & Search',
    summary:
      'Kiến trúc upload/download tệp tin bảo mật chống Path Traversal, trích xuất dữ liệu CCCD/hợp đồng tự động qua StudentDocOcrService và xuất Excel/CSV chuẩn 4-Way Data Parity.',
    badges: [
      { label: 'Anti Path Traversal', tone: 'red' },
      { label: 'Doc OCR Service', tone: 'blue' },
      { label: 'Data Parity Export', tone: 'green' }
    ],
    fileAnchors: ['backend/controllers/CloudFileController.php', 'backend/controllers/UploadController.php', 'backend/utils/StudentDocOcrService.php', 'backend/controllers/ExportController.php', 'backend/utils/search_helpers.php'],
    sections: [
      {
        id: 'sec-be-files',
        heading: '11.1. Tải lên, Lưu trữ Đám mây & Phòng chống Path Traversal',
        bullets: [
          {
            label: 'CloudFileController & UploadController',
            text: 'Quản lý danh mục FileCategoryController, gắn tệp vào contact/deposit/expense/task/chat; mọi thao tác xóa file vật lý (deleteServerFile) đều chuẩn hóa realpath() nằm gọn trong uploads/ và bảo toàn bản ghi lịch sử khi xóa mềm.',
            code: 'CloudFileController.php'
          },
          {
            label: 'StudentDocOcrService',
            text: 'Hỗ trợ OCR CCCD, hộ chiếu, bảng điểm, chứng từ UNC khi nhân sự tải ảnh hồ sơ hoặc phiếu bảo lưu/nhập hợp đồng.',
            code: 'StudentDocOcrService.php'
          },
          {
            label: 'ExportController & ImportController',
            text: 'Xuất CSV/Excel với UTF-8 BOM sạch sẽ, kế thừa chính xác điều kiện lọc RBAC (owner/team/all) của màn hình Contacts, Finance, Attendance và CRM Analytics.',
            code: 'ExportController.php'
          }
        ]
      }
    ]
  },

  // =========================================================================
  // IV. NGHIỆP VỤ & CONCURRENCY (4 MỤC)
  // =========================================================================
  {
    id: 'sm-finance-approvals',
    code: '12',
    group: 'IV. NGHIỆP VỤ & CONCURRENCY',
    title: 'State Machine Phê duyệt Tài chính, Đặt cọc & Chống Race Condition',
    shortTitle: 'Finance Approval State Machine',
    summary:
      'Tài chính & Đặt cọc sử dụng Transaction ACID kết hợp Row-Level Locking (FOR UPDATE), máy trạng thái 3 cấp phê duyệt (status_level_1..3) và kiểm tra chống tự duyệt (Anti-Self-Approval).',
    badges: [
      { label: 'ACID + FOR UPDATE', tone: 'red' },
      { label: '3-Level Workflow', tone: 'blue' },
      { label: 'Anti-Self-Approval', tone: 'amber' }
    ],
    fileAnchors: ['backend/controllers/DepositController.php', 'backend/controllers/FinanceController.php', 'backend/controllers/CooperationController.php'],
    sections: [
      {
        id: 'sec-sm-fin-diagram',
        heading: '12.1. Máy Trạng thái Phê duyệt 3 Cấp (expenses & deposits)',
        paragraphs: [
          'Cột status_level_1, status_level_2, status_level_3 và approver_id, approver_id_2, approver_id_3 trên bảng expenses điều phối luồng duyệt đa cấp. Riêng deposit_milestones ghi nhận lộ trình từng đợt đóng (pending -> paid -> approved | failed) với unc_file_path.'
        ],
        diagram: 'approval-state'
      },
      {
        id: 'sec-sm-fin-invariants',
        heading: '12.2. Các Bất biến Chống Double-Spending & Can thiệp Giá',
        bullets: [
          {
            label: 'Row Locking (FOR UPDATE / SQLite Compat)',
            text: 'DepositController và FinanceController thực hiện SELECT ... FROM deposits WHERE id = ? FOR UPDATE (dùng helper $isSqlite ? "" : " FOR UPDATE") bên trong $db->beginTransaction() trước khi cập nhật trạng thái đợt thanh toán.',
            code: 'DepositController.php'
          },
          {
            label: 'Anti-Self-Approval Rules',
            text: 'Kiểm tra (int)$record["created_by"] === (int)$auth["user_id"] thông qua TenantConfigService::canUserSelfApprove() và canUserApproveWorkflowLevel(): chặn HTTP 403 ngay nếu nhân viên tự duyệt phiếu chi/cọc/nghỉ phép của chính mình.'
          },
          {
            label: 'Cooperation Slip Chữ ký Đa bên',
            text: 'CooperationController quản lý tỷ lệ phần trăm hoa hồng đồng chia giữa nhiều nhân sự (shareholders); yêu cầu đủ chữ ký điện tử trước khi kích hoạt giải ngân hoa hồng.'
          }
        ]
      }
    ]
  },
  {
    id: 'sm-orders-inventory',
    code: '13',
    group: 'IV. NGHIỆP VỤ & CONCURRENCY',
    title: 'Quy trình Đơn hàng (PO / SO / POS) & Quản trị Tồn kho Nguyên tử',
    shortTitle: 'PO / SO / POS & Inventory',
    summary:
      'Quản lý khép kín từ Đơn mua hàng NCC (Purchase Orders), Đơn bán hàng học phí/dịch vụ (Sales Orders), Điểm bán POS tới trừ/nhập kho an toàn với server-side price validation.',
    badges: [
      { label: 'Atomic Inventory', tone: 'green' },
      { label: 'Server Price Calc', tone: 'red' },
      { label: 'inventory_logs', tone: 'slate' }
    ],
    fileAnchors: ['backend/controllers/SalesOrderController.php', 'backend/controllers/PurchaseOrderController.php', 'backend/controllers/POSController.php', 'backend/controllers/InventoryController.php'],
    sections: [
      {
        id: 'sec-sm-po-so',
        heading: '13.1. Nguyên tắc Đồng nhất Số liệu PO/SO & Chống Gian lận Client',
        bullets: [
          { label: 'Chuẩn Cột Mã Đơn', text: 'Truy vấn chuẩn dùng po.po_number và so.so_number (tuyệt đối không nhầm với order_number). Liên kết trực tiếp tới supplier_id hoặc contact_id / company_id / deposit_id.' },
          { label: 'Server-Side Amount Validation', text: 'Từ chối mọi đơn hàng, hóa đơn hoặc hoàn tiền có quantity <= 0 hoặc amount < 0; tổng tiền & VAT luôn được backend tính lại từ đơn giá chuẩn.' },
          { label: 'Atomic Conditional Stock Update', text: 'Khi xuất bán qua POSController hoặc duyệt phiếu xuất kho trong InventoryController, cập nhật tồn kho sử dụng điều kiện UPDATE ... SET stock = stock - ? WHERE id = ? AND stock >= ? trong transaction và ghi chi tiết vào inventory_logs.' }
        ]
      }
    ]
  },
  {
    id: 'sm-lead-distribution',
    code: '14',
    group: 'IV. NGHIỆP VỤ & CONCURRENCY',
    title: 'Động cơ Chia Số, Gatekeeper, Fair-Share & Sync Sheets 2 Chiều',
    shortTitle: 'Lead Distribution & 2-Way Sync',
    summary:
      'Đường ống 8 bước từ tiếp nhận dữ liệu (Google Sheets, Webhook, Form) qua kiểm tra danh sách chặn, giữ Owner cũ khi trùng CRM, đánh giá Screener tới phân bổ theo vòng/ca trực và ghi ngược Google Sheet.',
    badges: [
      { label: 'Fair-Share Round-Robin', tone: 'blue' },
      { label: 'Gatekeeper Screener', tone: 'amber' },
      { label: 'LockService 2-Way', tone: 'green' }
    ],
    fileAnchors: ['backend/webhook_logic.php', 'backend/controllers/LeadDistributionController.php', 'backend/controllers/ConsultantShiftController.php', 'backend/two_way_sync.gs'],
    sections: [
      {
        id: 'sec-sm-lead-diagram',
        heading: '14.1. Sơ đồ Đường ống 8 Bước Tiếp nhận & Chia số',
        diagram: 'lead-pipeline'
      },
      {
        id: 'sec-sm-lead-details',
        heading: '14.2. Cơ chế Gatekeeper, Đền bù Công bằng (Fair-Share) & 2-Way Sync',
        bullets: [
          {
            label: 'Duplicate Check & Owner Retention',
            text: 'Chuẩn hóa SĐT 9 số cuối và email trong webhook_logic.php; nếu contact trùng vẫn còn nhân sự phụ trách hoạt động trong khung duplicate_check_months -> cập nhật tương tác vào lead cũ và KHÔNG chia lại cho người khác.',
            code: 'backend/webhook_logic.php'
          },
          {
            label: 'Gatekeeper & Shift Gates',
            text: 'Lead không đạt chuẩn Screener bị giữ ở hàng đợi Gatekeeper (pipeline_status held) để Admin duyệt/hủy hoặc giao thủ công (yêu cầu quyền contacts:approve); phân bổ tự động bỏ qua nhân sự đang nghỉ phép hoặc ngoài ca đăng ký trong consultant_shifts.',
            code: 'LeadDistributionController.php'
          },
          {
            label: 'Fair-Share Compensation Logs',
            text: 'Admin duyệt ticket data lỗi sẽ tự động ghi nhận chỉ số đền bù công bằng vào active_compensation_logs & distribution_logs để vòng xoay ưu tiên cấp lại lead mới.'
          },
          {
            label: 'Google Sheets 2-Way Apps Script',
            text: 'backend/two_way_sync.gs dùng LockService.getScriptLock().waitLock(10000) để đồng bộ trạng thái chăm sóc và TVV phụ trách ngược về file Google Sheet tuyển sinh mà không xung đột ghi đè.',
            code: 'backend/two_way_sync.gs'
          }
        ]
      }
    ]
  },
  {
    id: 'sm-parity-14stages',
    code: '15',
    group: 'IV. NGHIỆP VỤ & CONCURRENCY',
    title: 'Chuẩn Phễu Tuyển Sinh 14 Bước & 3-Way Data Parity',
    shortTitle: '14 Stages & 3-Way Parity',
    summary:
      'Mọi bộ lọc đa chiều trên hệ thống (program, project_id, stage_id, owner_id, nhiệt độ, thời gian) đều trả về cùng một tập dữ liệu đồng nhất 100% giữa UI, AI Multi-Agent và Export Excel.',
    badges: [
      { label: 'Migration 237 Stages', tone: 'blue' },
      { label: '3-Way Data Parity', tone: 'green' },
      { label: 'SARGable SQL', tone: 'slate' }
    ],
    fileAnchors: ['backend/migrations/237_ideas_14_pipeline_stages.sql', 'backend/controllers/ContactController.php', 'backend/controllers/AgentToolRegistry.php', 'backend/controllers/ExportController.php'],
    sections: [
      {
        id: 'sec-sm-parity-table',
        heading: '15.1. Bảo toàn Đồng nhất trên 3 Bề Mặt Dữ liệu',
        table: {
          headers: ['Bề mặt Dữ liệu', 'Module Đảm nhiệm', 'Tiêu chuẩn Đồng bộ'],
          rows: [
            ['1. Web UI & BI Decks', 'ContactsPage, DataList, ...', 'Truy vấn MySQL theo lọc stage/status/temp'],
            ['2. AI Tools', 'AgentToolRegistry::query_crm_leads_multitier', 'Kế thừa bộ lọc UI (__MYERP_ACTIVE_FILTERS__)'],
            ['3. Excel Exports', 'ExportController.php', 'Áp dụng WHERE/RBAC khớp 100% KPI trên UI']
          ]
        }
      },
      {
        id: 'sec-sm-14-stages',
        heading: '15.2. Mô hình Trạng thái Hồ sơ Song song (Stage + Status + Temperature)',
        paragraphs: [
          'Từ Migration 237, hồ sơ contacts theo dõi đồng thời 3 trục: stage_id / pipeline_status (vị trí trên 14 bước phễu tuyển sinh), status (lead | qualified | customer | churned) và temperature (hot | warm | neutral | cool | cold) kết hợp chỉ số ttl1_completed, last_contact để tính tỷ lệ bỏ sót chưa chăm sóc.'
        ]
      }
    ]
  },

  // =========================================================================
  // V. WORKCHAT & AI MULTI-AGENT (3 MỤC)
  // =========================================================================
  {
    id: 'workchat-sse-traits',
    code: '16',
    group: 'V. WORKCHAT & AI MULTI-AGENT',
    title: 'Kiến trúc ChatController 6 Traits & Kênh SSE Non-Blocking',
    shortTitle: 'WorkChat SSE & 6 Traits',
    summary:
      'Tách biệt logic WorkChat khổng lồ thành 6 PHP Traits độc lập và tối ưu endpoint chat/stream bằng kiểm tra Global Index (< 5ms) kết hợp Redis Presence.',
    badges: [
      { label: '6 PHP Traits', tone: 'slate' },
      { label: 'Global Index < 5ms', tone: 'green' },
      { label: 'Redis Presence 60s', tone: 'blue' }
    ],
    fileAnchors: ['backend/controllers/ChatController.php', 'backend/controllers/ChatCoreTrait.php', 'backend/controllers/ChatManagementTrait.php', 'backend/controllers/ChatStreamAndAiEntryTrait.php'],
    sections: [
      {
        id: 'sec-wc-traits',
        heading: '16.1. Bảng Phân rã 6 PHP Traits trong ChatController',
        table: {
          headers: ['Trait File', 'Chức năng Phụ trách', 'Chi tiết Kỹ thuật Chính'],
          rows: [
            ['ChatCoreTrait.php', 'Tin nhắn & Media Vault', 'Gửi/sửa/xóa mềm tin nhắn, thả cảm xúc, ghim, chuyển tiếp (forward), danh sách file Vault'],
            ['ChatManagementTrait.php', 'Hội thoại & Thành viên', 'Tạo chat 1-1 / nhóm, cập nhật nhóm, thêm/xóa thành viên, dọn lịch sử hội thoại'],
            ['ChatStreamAndAiEntryTrait.php', 'SSE Realtime Stream & AI Entry', 'Endpoint chat/stream check SELECT MAX(id) FROM chat_messages; chỉ JOIN 4 bảng khi có tin mới; cập nhật chat:presence:{tid}:{uid} TTL 60s'],
            ['ChatAgentContextTrait.php', 'Ngữ cảnh & RAG Tri thức', 'Nhận getClientCurrentContext() từ useChatStore, tổng hợp bài viết ai_knowledge_base & ngữ cảnh thực thể đang mở'],
            ['ChatGeminiEngineTrait.php', 'Động cơ Gemini Function Calling', 'Ánh xạ $agentToolMap, thực thi tool call song song (Parallel Calling) và tổng hợp câu trả lời cuối'],
            ['ChatGroqAndMemoryTrait.php', 'Groq Fallback & Working Memory', 'Quản lý nén lịch sử tin nhắn cũ, đọc/ghi <working_memory> trong chat_messages.metadata']
          ]
        }
      }
    ]
  },
  {
    id: 'ai-engine-memory',
    code: '17',
    group: 'V. WORKCHAT & AI MULTI-AGENT',
    title: 'Động cơ Gemini Tool Loop, Working Memory & Action Proposal',
    shortTitle: 'AI Tool Loop & Working Memory',
    summary:
      'Sử dụng động cơ chính gemini-3.5-flash-lite với Domain-Scoped Tool Injection (5–9 tools/lượt), trí nhớ 2 tầng <working_memory> giúp hiểu ngữ cảnh hỏi nối tiếp và thẻ ActionProposalCard an toàn.',
    badges: [
      { label: 'gemini-3.5-flash-lite', tone: 'blue' },
      { label: '5–9 Tools / Turn', tone: 'green' },
      { label: 'Human-in-the-Loop', tone: 'red' }
    ],
    fileAnchors: ['backend/controllers/ChatGeminiEngineTrait.php', 'backend/controllers/ChatGroqAndMemoryTrait.php', 'src/components/chat/ActionProposalCard.tsx', 'src/components/chat/chatTagParsers.ts'],
    sections: [
      {
        id: 'sec-ai-seq-diagram',
        heading: '17.1. Sơ đồ Chuỗi Thực thi Multi-Agent & Smart Drafter',
        diagram: 'ai-sequence'
      },
      {
        id: 'sec-ai-tokens',
        heading: '17.2. Chiến lược Tiết kiệm Token & Kế thừa Ngữ cảnh Hội thoại',
        bullets: [
          {
            label: 'Domain-Scoped Tool Injection',
            text: 'Thay vì nạp hàng chục schema công cụ nặng mỗi lượt, Router kết hợp Agent ID chỉ nạp 5–9 function đúng phân hệ và gỡ bỏ hoàn toàn Tool Schema ở lượt tổng hợp văn bản cuối (Turn 2 Synthesis Slimming).'
          },
          {
            label: '<working_memory> Two-Tier Memory',
            text: 'Sau khi thực thi tool thành công, hệ thống lưu domain, last_tool, active_filters, total_matching và entity_refs vào chat_messages.metadata để các câu hỏi nối tiếp ("trong số đó ai ở HCM?") kế thừa chính xác bộ lọc.'
          },
          {
            label: 'Rich Tag Protocol (chatTagParsers.ts)',
            text: 'Frontend parse các khối <<<ERP_CARD:...>>> (mở Side-by-Side Drawer mà không đóng cửa sổ Chat), <<<DYNAMIC_CHART:...>>> (Recharts trực quan) và <<<ACTION_PROPOSAL:...>>> (Prefill Form/Drawer chờ người dùng xác nhận).'
          }
        ]
      }
    ]
  },
  {
    id: 'ai-agents-matrix',
    code: '18',
    group: 'V. WORKCHAT & AI MULTI-AGENT',
    title: 'Hội đồng 11 Chuyên Gia AI (SI IDEAS) & Tuyến Qwen Groq Lab',
    shortTitle: '11 AI Agents & Qwen Lab',
    summary:
      'Đồng bộ 1-1 giữa src/constants/aiAgents.ts và backend/controllers/ChatGeminiEngineTrait.php, đi kèm 3 thư viện tool chuyên sâu (agent_tools/) và tuyến QwenAgentController tách rời trên Groq.',
    badges: [
      { label: '11 Agents Synced', tone: 'blue' },
      { label: '3 Tool Modules', tone: 'slate' },
      { label: 'Qwen Lab Isolated', tone: 'amber' }
    ],
    fileAnchors: ['src/constants/aiAgents.ts', 'backend/controllers/AgentToolRegistry.php', 'backend/controllers/agent_tools/', 'backend/controllers/QwenAgentController.php'],
    sections: [
      {
        id: 'sec-ai-11agents',
        heading: '18.1. Bảng Cấu hình & Rào chắn Bảo mật 11 AI Agents',
        table: {
          headers: ['Agent ID', 'Tên & Vai trò', 'Kho Tools Chính', 'RBAC / Safety Guardrails'],
          rows: [
            ['master', 'SI IDEAS (Chỉ huy & Tri thức)', 'query_cross_domain_executive_synthesis, search_ideas_knowledge, get_program_details, trace_approval_blocker', 'Dữ liệu qua ActionProposalCard'],
            ['tasks', 'Agent Task (WBS & Deadline)', 'query_tasks_and_projects_multitier, smart_manage_tasks_and_subtasks, complete_task_checklist_item', 'Task do mình tạo/giao/giám sát'],
            ['finance', 'Agent Thu Chi (PO / SO / Cọc)', 'query_finance_multitier_analytics, query_deposits_and_revenue_multitier, smart_manage_po_so_and_approvals', 'Duyệt 2 cấp cho chi phí lớn'],
            ['sales', 'Agent Sales (CRM 360°)', 'query_crm_leads_multitier, get_sales_leaderboard, reassign_lead_owner', 'Cô lập dữ liệu owner/collaborator'],
            ['hrm', 'Agent Nhân Sự (Công & Lương)', 'query_hrm_workforce_and_payroll_multitier, manage_my_hr_profile_and_requests, get_my_payslip', 'Phân quyền lương theo chính chủ'],
            ['academic', 'Agent Đào Tạo', 'get_academic_students_filter, get_academic_schedule_and_intakes, get_program_details', 'Tuân thủ khung tín chỉ ECTS'],
            ['records_legal', 'Agent Hồ Sơ & Pháp Lý', 'check_student_admission_records, attach_files_to_contact, get_contact_360_profile', 'Kiểm soát tính hợp lệ giấy tờ'],
            ['assets_inventory', 'Agent Tài Sản & Kho', 'query_inventory_and_assets_multitier, get_inventory_health_check, get_inventory_and_asset_status', 'Giao nhận qua phiếu duyệt'],
            ['marketing_campaigns', 'Agent Chiến Dịch & Lead', 'get_campaign_marketing_stats, query_crm_leads_multitier', 'Hạn chế chi phí quảng cáo'],
            ['executive_bi', 'Agent Trợ Lý Giám Đốc (BI)', 'Toàn bộ *_multitier tools, get_executive_morning_brief, get_executive_financial_pulse', 'Cho Director, Superadmin, Account'],
            ['system_it', 'Agent Kỹ Thuật & SLA', 'query_tickets_and_sla_multitier, get_system_health_status, get_ticket_status_and_sla_breaches', 'Bảo mật DB & Secret Key']
          ]
        }
      },
      {
        id: 'sec-ai-tools-files',
        heading: '18.2. Phân tách Thư viện Tool Chuyên sâu & Qwen Lab',
        bullets: [
          { label: 'AgentHrmAttendanceTools.php', text: 'Bảng công chi tiết, đi trễ theo định mức giới tính (Điều 14 NQLĐ), tăng ca OT, phép và phiếu lương.' },
          { label: 'AgentPoSoFinanceTools.php', text: 'Đối soát PO/SO, khoản chi >= 5M, đặt cọc đa đợt và dòng tiền.' },
          { label: 'AgentTaskProjectTools.php', text: 'Truy vấn công việc dự án đa tầng, phân rã subtask và hoàn tất checklist.' },
          { label: 'QwenAgentController.php (/api/qwen-agent/*)', text: 'Tuyến thử nghiệm & đối chiếu model Qwen trên Groq Cloud, hoàn toàn độc lập với tuyến Gemini chính.' }
        ]
      }
    ]
  },

  // =========================================================================
  // VII. KIẾN TRÚC DỮ LIỆU (BẢNG CORE ERP)
  // =========================================================================
  {
    id: 'data-3layers-erd',
    code: '19',
    group: 'VII. KIẾN TRÚC DỮ LIỆU',
    title: 'Phân tầng Dữ liệu & Lược đồ Core ERD',
    shortTitle: 'Core Schema & ERD',
    summary:
      'CSDL MySQL/MariaDB chuẩn utf8mb4_unicode_ci gồm lớp bảng Core ERP (gắn tenant_id) và các bảng SaaS/Nghiệp vụ.',
    badges: [
      { label: 'Core Multi-Tenant', tone: 'blue' },
      { label: 'tenant_id', tone: 'slate' },
      { label: 'Core ERD', tone: 'green' }
    ],
    fileAnchors: ['database_schema.json', 'backend/schema/chartdb_erd.json'],
    sections: [
      {
        id: 'sec-erd-clusters',
        heading: '19.1. Sơ đồ Cụm Thực thể & Quan hệ Liên phân hệ',
        diagram: 'core-erd'
      },
      {
        id: 'sec-erd-tiers',
        heading: '19.2. Thống kê Quy mô Lược đồ Thực tế',
        table: {
          headers: ['Tầng Dữ liệu', 'Quy mô', 'Khóa Cô lập', 'Danh mục Bảng Trọng tâm'],
          rows: [
            ['1. Lớp Cốt lõi ERP (database_schema.json)', 'Core ERP Tables', 'tenant_id (hoặc join users.tenant_id)', 'contacts, users, teams, deals, deposits, deposit_milestones, sales_orders, purchase_orders, invoices, expenses, activities, chat_conversations, chat_messages'],
            ['2. Lớp SaaS & Nghiệp vụ Mở rộng', 'SaaS + Nghiệp vụ', 'tenant_id', 'tenant_roles, tenant_approval_workflows, tenant_notification_rules, tenant_student_tabs, tenant_academic_programs, tenant_email_templates, task_whiteboards, student_subject_grades']
          ]
        }
      }
    ]
  },
  {
    id: 'data-schema-dict',
    code: '23',
    group: 'VII. KIẾN TRÚC DỮ LIỆU',
    title: 'Schema Dictionary — Cấu trúc Các Bảng Trọng tâm Thực tế',
    shortTitle: 'Schema Dictionary (Core Tables)',
    summary:
      'Chi tiết các cột định danh, kiểu enum, khóa liên kết và cột Soft-Delete thực tế của những bảng có tần suất truy vấn và cập nhật cao nhất trong MYERP.',
    badges: [
      { label: 'Verified Columns', tone: 'green' },
      { label: 'Enum & Constraints', tone: 'slate' }
    ],
    fileAnchors: ['database_schema.json'],
    sections: [
      {
        id: 'sec-dict-table',
        heading: '23.1. Chi tiết Cột Trọng yếu của Các Bảng Cốt lõi',
        table: {
          headers: ['Tên Bảng (Số cột)', 'Khóa Định danh & Liên kết', 'Trạng thái / Enum & Cột Nghiệp vụ Đặc thù'],
          rows: [
            [
              'contacts (74 cols)',
              'id (PRI), tenant_id, person_id, owner_id, collaborator_ids, project_id, company_id, stage_id, deleted_at',
              'status (lead|qualified|customer|churned), pipeline_status, temperature (hot|warm|neutral|cool|cold), phone/mobile/phone2/zalo_phone, dob, ttl1_completed, lead_score, not_lead_proposed'
            ],
            [
              'users (43 cols)',
              'id (PRI), tenant_id, team_id, deleted_at (checked in requireAuth)',
              'username, email, password_hash, role enum(13 giá trị: super_admin, admin, manager, assistant, sales, viewer, superadmin, director, hr, accountant, marketing, sale_admin...), two_factor_enabled/secret, signature_url'
            ],
            [
              'deals (23 cols)',
              'id (PRI), tenant_id, stage_id, contact_id, company_id, owner_id, created_by',
              'title, priority (low|medium|high), value decimal(15,2), currency char(3), probability tinyint, expected_close_date, actual_close_date'
            ],
            [
              'deposits (21 cols)',
              'id (PRI), contact_id, project_id, created_by, accountant_id, participant_ids',
              'unit_code, price decimal(15,2), expected_commission, currency, exchange_rate, status enum(pending_admin|approved|cancelled), auto_remind, remind_days_before (tenant lấy qua users.tenant_id)'
            ],
            [
              'deposit_milestones (13 cols)',
              'id (PRI), deposit_id (FK -> deposits.id), approved_by',
              'milestone_name, expected_amount, expected_pay_date, original_amount, actual_amount, unc_file_path, status enum(pending|paid|approved|failed), approval_date'
            ],
            [
              'expenses (30 cols)',
              'id (PRI), tenant_id, created_by, approver_id, approver_id_2, approver_id_3, refunder_id, deleted_at',
              'amount, vat_amount, has_vat_invoice, is_vat_inclusive, status enum(pending|approved|rejected), status_level_1..3, approval_status, is_refunded, image_url, refund_image_url'
            ],
            [
              'activities (26 cols)',
              'id (PRI), tenant_id, user_id, created_by, contact_id, related_type/id, approver_id, deleted_at',
              'type, subject, status enum(planned|done|cancelled), priority (low|medium|high), start_date, due_date, done_at, progress, require_approval, approval_status, edit_history'
            ],
            [
              'distribution_rounds & _logs',
              'round: id, tenant_id, project_id, last_assigned_consultant_id • log: lead_id, assigned_to, round_id',
              'Quản trị trạng thái hoạt động vòng xoay (is_active), email CC nhận thông báo và lịch sử nhận số / đền bù theo timestamp'
            ]
          ]
        }
      }
    ]
  },
  {
    id: 'data-sql-migrations',
    code: '24',
    group: 'VII. KIẾN TRÚC DỮ LIỆU',
    title: 'Kỷ luật Truy vấn SQL, Indexing & Idempotent Migrations (v338)',
    shortTitle: 'SQL Discipline & Migrations v338',
    summary:
      '4 nguyên tắc viết SQL hiệu năng cao phòng bẫy NULL, HY093 và Cartesian Explosion trên MySQL InnoDB kết hợp cơ chế khóa phân tán GET_LOCK trong backend/run_migrations.php.',
    badges: [
      { label: 'NOT EXISTS vs NOT IN', tone: 'red' },
      { label: 'SARGable B-Tree', tone: 'green' },
      { label: 'GET_LOCK v338', tone: 'blue' }
    ],
    fileAnchors: ['backend/run_migrations.php', 'backend/tools/schema_sql_linter.php', 'backend/tools/phpstan_dba_guard.php'],
    sections: [
      {
        id: 'sec-sql-4rules',
        heading: '24.1. 4 Quy tắc Vàng Truy vấn MySQL PDO trên MYERP',
        bullets: [
          {
            label: '1. Cấm NOT IN (SELECT ...) trên cột Nullable',
            text: 'Luôn thay thế bằng NOT EXISTS (SELECT 1 FROM ... WHERE ...) vì một giá trị NULL duy nhất trong subquery sẽ làm NOT IN trả về tập rỗng hoàn toàn.'
          },
          {
            label: '2. Chống SQLSTATE[HY093] với WHERE IN (...)',
            text: 'Sau array_unique() hoặc array_filter() trên mảng ID động truyền vào WHERE col IN (?, ?), bắt buộc bọc array_values($ids) để reset index tuần tự từ 0.'
          },
          {
            label: '3. Chống N+1 & Cartesian Explosion',
            text: 'Không chạy query đơn trong vòng lặp foreach khi import CSV/chia lead/tính lương; luôn dùng INSERT IGNORE ... SELECT hoặc Derived Subquery gom nhóm trước khi JOIN 1-N để không nhân bản tổng SUM().'
          },
          {
            label: '4. Truy vấn SARGable & Soft-Delete Mandate',
            text: 'Không bọc cột index trong DATE(created_at) = ? — dùng khoảng created_at >= ? AND created_at <= ? kết hợp deleted_at IS NULL ở mọi truy vấn nghiệp vụ.'
          }
        ]
      },
      {
        id: 'sec-sql-migrations',
        heading: '24.2. Cơ chế Idempotent Migration (backend/run_migrations.php)',
        bullets: [
          { label: 'Distributed MySQL Lock', text: 'Xin khóa SELECT GET_LOCK("db_migration_lock", 30) bảo đảm 2 quá trình triển khai hoặc cron không chạy migration đè nhau.' },
          { label: 'Schema Guard Idempotent', text: 'Mọi bản nâng cấp từ v1 đến targetVersion = 352 kiểm tra tồn tại bảng/cột/index qua information_schema trước khi ALTER TABLE.' },
          { label: 'SQL Views Tương thích Ngược', text: 'Tự động tái tạo 2 SQL Views accounts và consultants ở mỗi lần chạy migration để các module cũ tiếp tục đọc đồng nhất từ users.' }
        ]
      }
    ]
  },

  // =========================================================================
  // VIII. VẬN HÀNH & BÀN GIAO (4 MỤC)
  // =========================================================================
  {
    id: 'ops-dev-env',
    code: '25',
    group: 'VIII. VẬN HÀNH & BÀN GIAO',
    title: 'Môi trường Local Dev, Bảng Biến Môi trường & Bộ 88 Ca E2E',
    shortTitle: 'Local Dev, .env & 88 E2E Suite',
    summary:
      'Hướng dẫn thiết lập biến môi trường sạch từ .env.example & backend/.env.example, khởi chạy Vite Dev Proxy, biên dịch Production và vận hành bộ kiểm thử tự động 4 tầng (88 test cases).',
    badges: [
      { label: 'Node 20+ / PHP 8.1+', tone: 'slate' },
      { label: 'Env Templates', tone: 'green' },
      { label: '88 E2E Pass', tone: 'blue' }
    ],
    fileAnchors: ['.env.example', 'backend/.env.example', 'package.json', 'tests/e2e/runner.js'],
    sections: [
      {
        id: 'sec-ops-cli',
        heading: '25.1. Thiết lập Cục bộ & Lệnh Thực thi Chuẩn',
        codeBlock: {
          title: 'Khởi tạo .env từ template, chạy Dev, Build Production & Test E2E',
          lang: 'bash',
          code: `# 1. Tạo tệp cấu hình cục bộ từ mẫu (không commit lên Git)
cp .env.example .env
cp backend/.env.example backend/.env

# 2. Cài dependencies & chạy Vite Dev Server (proxy /backend -> VITE_API_URL)
npm install
npm run dev

# 3. Kiểm tra TypeScript + Build Production (xuất dist/ + version.json)
npm run build
npm run lint

# 4. Chạy bộ kiểm thử hồi quy 88 ca E2E & kiểm tra cú pháp PHP
node tests/e2e/runner.js
php -l backend/index.php`
        }
      },
      {
        id: 'sec-ops-envtable',
        heading: '25.2. Từ điển Biến Môi trường (backend/.env & .env)',
        table: {
          headers: ['Biến Môi trường', 'Phạm vi', 'Ý nghĩa & Yêu cầu Bảo mật'],
          rows: [
            ['VITE_API_URL, VITE_APP_TITLE', 'Frontend .env', 'Target proxy khi dev localhost và tiêu đề mặc định hệ thống'],
            ['DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS', 'Backend .env', 'Thông số MySQL InnoDB bắt buộc (fail-closed nếu thiếu)'],
            ['JWT_SECRET, JWT_EXPIRE_ACCESS, JWT_EXPIRE_REFRESH', 'Backend .env', 'Khóa ký HMAC-SHA256 (>= 32 ký tự ngẫu nhiên) và thời hạn token'],
            ['ALLOWED_ORIGINS, APP_ENV, DISABLE_ZALO, DISABLE_EMAILS, MYERP_TEST_MODE', 'Backend .env', 'Whitelist CORS & công tắc ngắt gửi tin thật khi chạy trên Staging / Test'],
            ['DIAG_TOKEN / MYERP_DIAG_TOKEN, CRON_SECRET', 'Backend .env', 'Token bảo vệ endpoint diagnostic/migration qua HTTP (để rỗng để khóa hoàn toàn HTTP) và cron'],
            ['GEMINI_API_KEY, GEMINI_MODEL', 'Backend .env / system_settings', 'Khóa Google Gemini & model mặc định (gemini-3.5-flash-lite); có thể cấu hình riêng theo tenant_id'],
            ['SSH_KEY, SSH_USER, SSH_PORT, PROD_SSH_HOST, STAGING_SSH_HOST, BACKUP_SSH_*', 'Shell Env', 'Tùy biến khóa SSH ($HOME/.ssh/id_ed25519 mặc định) & host khi chạy deploy/backup']
          ]
        }
      },
      {
        id: 'sec-ops-e2e',
        heading: '25.3. Cấu trúc Bộ Kiểm thử Hồi quy 4 Tầng (tests/e2e/runner.js)',
        bullets: [
          { label: 'Tier 1 (feat01–feat13)', text: 'Feature Coverage: Tách Ticket data lỗi, Soft-Delete Mandate, SQL IN reindexing, Anti-Self-Approval, RBAC, IDOR Contacts/Tickets, Academic Modal, UI Brand DNA.' },
          { label: 'Tier 2 (feat01_boundary–feat13_boundary)', text: 'Boundary Cases: Empty states 0 bản ghi, giá trị NULL/corrupt, ngày nhuận 29/02, dải 365 ngày và tương phản WCAG AA.' },
          { label: 'Tier 3 (xf01–xf08)', text: 'Pairwise Integration giữa các cặp module (Data Error + RBAC/IDOR, Soft-Delete + Deposit Approvals, Academic + Brand DNA).' },
          { label: 'Tier 4 (rw01–rw05)', text: '4 kịch bản E2E hoàn chỉnh & phòng thủ tấn công đa tenant.' }
        ]
      }
    ]
  },
  {
    id: 'ops-deploy-sop',
    code: '26',
    group: 'VIII. VẬN HÀNH & BÀN GIAO',
    title: 'Phân tách Triển khai (Staging vs Production) & Smoke SOP',
    shortTitle: 'Deploy Staging vs Production',
    summary:
      'Tách biệt vật lý tuyệt đối giữa Production (myerp_prod) và Staging (myerp_staging) qua deploy-myerp.ps1 & deploy-staging.ps1 với cơ chế khóa an toàn và kiểm chứng sau deploy.',
    badges: [
      { label: 'STAGING LOCKED Guard', tone: 'red' },
      { label: 'Zero .env Overwrite', tone: 'green' },
      { label: 'Auto-Detect FE/BE', tone: 'blue' }
    ],
    fileAnchors: ['deploy-myerp.ps1', 'deploy-staging.ps1', 'sync-staging-db.ps1'],
    sections: [
      {
        id: 'sec-ops-topology',
        heading: '26.1. So sánh Pipeline Triển khai Staging vs Production',
        table: {
          headers: ['Thuộc tính', 'Staging (deploy-staging.ps1)', 'Production (deploy-myerp.ps1)'],
          rows: [
            ['Domain & Thư mục Đích', 'Staging domain riêng (myerp-stagging.ideas.edu.vn)', 'Production domain chính thức (myerp.ideas.edu.vn)'],
            ['Cơ sở Dữ liệu', 'myerp_staging (cô lập hoàn toàn; sync-staging-db.ps1 đã khóa cứng)', 'myerp_prod'],
            ['Cờ Thực thi Hỗ trợ', '-FrontendOnly (-fe), -BackendOnly (-be), -SkipBuild, -SyncSchemaOnly', '-FrontendOnly (-fe), -BackendOnly (-be), -CheckTypes, -SyncMedia, -SkipBuild'],
            ['Cơ chế Chống Nhầm', 'Chỉ phục vụ môi trường thử nghiệm tách rời', 'Chặn cứng [STAGING LOCKED] ngay lập tức nếu RemoteDir chứa chữ staging/stagging'],
            ['Exclude An toàn Khi Nén', 'Giữ nguyên uploads/*, .env, .env.*, *.log, scratch*, _locks trên server', 'Giữ nguyên uploads/*, .env, .env.*, *.log, scratch*, _locks trên server']
          ]
        }
      },
      {
        id: 'sec-ops-smoke',
        heading: '26.2. 3 Bước Kiểm chứng Bắt buộc Ngay Sau Deploy',
        bullets: [
          { label: '1. Đối chiếu version.json', text: 'So sánh giá trị version trong public/version.json cục bộ khớp 100% với /version.json trên server.' },
          { label: '2. Kiểm tra Quy tắc 404 Assets', text: 'Gửi request tới /assets/nonexistent_test.js — bắt buộc nhận HTTP 404 (đảm bảo .htaccess không trả index.html 200).' },
          { label: '3. Kiểm tra Cấu hình & error_log', text: 'Xác nhận backend/.env & backend/uploads còn nguyên vẹn trên server; soi cuối error_log không phát sinh PHP Fatal hoặc Parse Error mới.' }
        ]
      }
    ]
  },
  {
    id: 'ops-cron-backup',
    code: '27',
    group: 'VIII. VẬN HÀNH & BÀN GIAO',
    title: 'Master Cron Orchestrator (cron_master.php) & Backup/Restore DB',
    shortTitle: 'Cron Orchestrator & Backup DB',
    summary:
      'Chỉ cấu hình 1 Cronjob duy nhất mỗi phút chạy backend/cron_master.php (dùng khóa flock chống chồng lấn) để điều phối 5 tiến trình con và chuỗi script cron_*.php; kèm bộ công cụ Backup/Restore DB qua SSH stream.',
    badges: [
      { label: '1 Cronjob + flock()', tone: 'green' },
      { label: '5 Child Tasks', tone: 'blue' },
      { label: 'mysqldump Stream', tone: 'slate' }
    ],
    fileAnchors: ['backend/cron_master.php', 'backend/cron_sync.php', 'scripts/backup-database.js', 'scripts/restore-database.js'],
    sections: [
      {
        id: 'sec-ops-crontab',
        heading: '27.1. Crontab & Cơ chế Khóa Tiến trình (flock)',
        codeBlock: {
          title: 'Crontab duy nhất cấu hình trên Server + Danh sách 5 Child Tasks',
          lang: 'cron',
          code: `* * * * * /usr/local/bin/ea-php81 /path/to/myerp/backend/cron_master.php >> /path/to/cron_master.log 2>&1

# Lock file: sys_get_temp_dir()/cron_master_<md5(__DIR__)>.lock (LOCK_EX | LOCK_NB)
# 5 Tiến trình con được spawn bất đồng bộ mỗi chu kỳ:
#  1. cron_sync.php (Sync Sheets, tự nhả syncing > 3 phút, chia Lead 5-Gates, Report)
#  2. cron_recurring_tasks.php (Tạo công việc định kỳ)
#  3. cron_deposit_reminders.php (Nhắc hạn đặt cọc & công nợ)
#  4. cron_academic_reminders.php (Nhắc lịch học & học vụ)
#  5. cron_mailer.php (Queue gửi Email AWS SES/SMTP & Zalo Bot)`
        }
      },
      {
        id: 'sec-ops-backup',
        heading: '27.2. Quy trình Sao lưu & Phục hồi Cơ sở Dữ liệu',
        bullets: [
          {
            label: 'Sao lưu Tự động (npm run backup:db)',
            text: 'scripts/backup-database.js đọc DB_USER, DB_PASS, DB_NAME, BACKUP_SSH_* từ .env/môi trường, chạy mysqldump --single-transaction --quick --max_allowed_packet=512M --routines --triggers trên server, nén gzip và giải nén ra backups/myerp_backup_latest.sql.',
            code: 'scripts/backup-database.js'
          },
          {
            label: 'Phục hồi An toàn (npm run restore:db)',
            text: 'Yêu cầu xác nhận từ khóa "yes" (hoặc --force) trước khi tải file .sql.gz lên nạp đè database đích.',
            code: 'scripts/restore-database.js'
          }
        ]
      }
    ]
  },
  {
    id: 'ops-security-checklist',
    code: '28',
    group: 'VIII. VẬN HÀNH & BÀN GIAO',
    title: 'Checklist Bảo mật, Xoay vòng Khóa & Bảo trì Sau Bàn giao',
    shortTitle: 'Post-Handover Security Checklist',
    summary:
      'Danh mục các đầu việc bảo mật ưu tiên từ CRITICAL tới LOW đội ngũ tiếp nhận cần thực hiện ngay sau khi nhận quyền quản trị hạ tầng và mã nguồn MYERP.',
    badges: [
      { label: 'Rotate Credentials', tone: 'red' },
      { label: 'JWT Revocation', tone: 'amber' },
      { label: 'Surface Reduction', tone: 'blue' }
    ],
    fileAnchors: ['backend/config.php', 'backend/.env.example', 'backend/export_db_schema.php'],
    sections: [
      {
        id: 'sec-ops-checklist',
        heading: '28.1. Danh mục Hành động Bàn giao Chuẩn Production',
        table: {
          headers: ['Mức độ', 'Hạng mục Bảo mật / Vận hành', 'Vị trí Tham chiếu', 'Hành động Khuyến nghị'],
          rows: [
            [
              'CRITICAL',
              'Xoay vòng (Rotate) toàn bộ mật khẩu, token & khóa tích hợp',
              'backend/.env trên Production & Staging, Git history',
              'Cấp mới mật khẩu MySQL DB_PASS, chuỗi JWT_SECRET (>= 64 hex), DIAG_TOKEN / MYERP_DIAG_TOKEN, CRON_SECRET, SSH deploy key và API key Gemini/Zalo/Meta.'
            ],
            [
              'HIGH',
              'Điều chỉnh kỳ hạn Access Token & Hỗ trợ thu hồi phiên',
              'backend/config.php (JWT_EXPIRE_ACCESS)',
              'Rút ngắn JWT_EXPIRE_ACCESS từ 10 năm xuống 1–24 giờ kết hợp xoay vòng Refresh Token trên bảng refresh_tokens để thu hồi quyền tức thì khi nhân sự nghỉ việc.'
            ],
            [
              'HIGH',
              'Khóa cứng CRON_SECRET & Thu gọn bề mặt HTTP Production',
              'backend/test_*.php, scripts/*.py',
              'Khai báo tường minh CRON_SECRET trong backend/.env rồi gỡ nhánh fallback ở các worker HTTP; loại bỏ script ad-hoc (test_*.php, audit_*.php) khỏi package upload Production.'
            ],
            [
              'LOW',
              'Đồng bộ lại Snapshot tài liệu Schema JSON',
              'backend/export_db_schema.php, database_schema.json',
              'Chạy php backend/export_db_schema.php đối chiếu trực tiếp DB Production hiện hành (v352) để làm mới bộ database_schema.json.'
            ]
          ]
        }
      }
    ]
  }
];
