# MYERP — Frontend UI Repository (Staging-Connected)

Repository này chỉ chứa mã nguồn **Frontend UI** (`src/`, `public/`, `vite.config.ts`) dành cho team phát triển giao diện.
Mọi API khi chạy local (`npm run dev`) đều được Vite dev server **tự động proxy trực tiếp vào Staging API** (`https://myerp-stagging.ideas.edu.vn/backend`) — không cần cài PHP, MySQL hay chạy backend ở máy cá nhân.

---

## Cài đặt & Chạy Local (Quickstart)

1. **Clone repo & cài thư viện:**
   ```bash
   git clone https://github.com/DEV-trongphuc/ideas_myerp.git
   cd ideas_myerp
   npm install
   ```

2. **Chạy dev server (kết nối sẵn Staging API):**
   ```bash
   npm run dev
   ```
   Mở trình duyệt tại `http://localhost:5173`. Toàn bộ request `/backend/*` và `/uploads/*` từ browser sẽ tự động đi qua Vite proxy tới `https://myerp-stagging.ideas.edu.vn`, không gặp lỗi CORS và tự động chuyển đổi cookie cho `localhost`.

3. **Kiểm tra TypeScript & Production Build:**
   ```bash
   npm run build
   ```

---

## Lưu ý cho Dev UI

- **Không cần tạo `.env`** để chạy local với Staging API. Nếu cần đổi endpoint proxy tùy chỉnh, copy `.env.example` thành `.env.local` và chỉnh `VITE_PROXY_TARGET`.
- **Tuyệt đối không trỏ local dev vào Production** (`myerp.ideas.edu.vn`) và không commit `.env` / `.env.*`.
- Các script bảo mật, deploy server và mã nguồn backend không nằm trong repository này.
