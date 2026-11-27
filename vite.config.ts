import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import fs from 'fs'
import path from 'path'

const buildVersion = Date.now().toString();
const DEFAULT_STAGING_ORIGIN = 'https://myerp-stagging.ideas.edu.vn';

function versionManifestPlugin() {
  return {
    name: 'version-manifest-plugin',
    buildStart() {
      const payload = JSON.stringify({
        version: buildVersion,
        buildTime: new Date().toISOString()
      }, null, 2);

      const publicDir = path.resolve(__dirname, 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      fs.writeFileSync(path.resolve(publicDir, 'version.json'), payload, 'utf-8');

      // Stamp SW_VERSION in public/sw.js to trigger byte-change detection by browser
      const swPath = path.resolve(publicDir, 'sw.js');
      if (fs.existsSync(swPath)) {
        try {
          let swContent = fs.readFileSync(swPath, 'utf-8');
          swContent = swContent.replace(/const SW_VERSION = ['"][^'"]*['"]/, `const SW_VERSION = 'myerp-sw-v${buildVersion}'`);
          fs.writeFileSync(swPath, swContent, 'utf-8');
        } catch (e) {
          console.warn('[Vite] Failed to stamp SW_VERSION:', e);
        }
      }
    }
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawTarget = (env.VITE_PROXY_TARGET || env.VITE_API_URL || `${DEFAULT_STAGING_ORIGIN}/backend`).trim();
  const targetUrl = /^https?:\/\//i.test(rawTarget)
    ? rawTarget.replace(/\/+$/, '')
    : `${DEFAULT_STAGING_ORIGIN}/backend`;
  const targetOrigin = new URL(targetUrl).origin;

  return {
    define: {
      __APP_VERSION__: JSON.stringify(buildVersion),
    },
    plugins: [
      versionManifestPlugin(),
      react(),
      tailwindcss(),
    ],
    build: {
      minify: 'oxc',
      chunkSizeWarningLimit: 800,
      rolldownOptions: {
        output: {
          ...(mode === 'production'
            ? {
                minify: {
                  compress: {
                    dropConsole: true,
                    dropDebugger: true,
                  },
                  mangle: true,
                  codegen: true,
                },
              }
            : {}),
          codeSplitting: {
            groups: [
              {
                name(id) {
                  if (id.includes('db_schema.json')) {
                    return 'db-schema-erd';
                  }
                  if (id.includes('node_modules')) {
                    if (id.includes('xlsx')) {
                      return 'vendor-xlsx';
                    }
                    if (id.includes('pptxgenjs') || id.includes('jszip')) {
                      return 'vendor-pptx';
                    }
                    if (id.includes('framer-motion')) {
                      return 'vendor-framer';
                    }
                    if (id.includes('@dnd-kit')) {
                      return 'vendor-dnd';
                    }
                    if (id.includes('recharts') || id.includes('d3')) {
                      return 'vendor-charts';
                    }
                    if (id.includes('lucide-react')) {
                      return 'vendor-icons';
                    }
                    if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) {
                      return 'vendor-react';
                    }
                    return 'vendor';
                  }
                  return undefined;
                },
              },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/backend': {
          target: targetUrl,
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: '',
          rewrite: (p) => p.replace(/^\/backend/, ''),
          configure: (proxy) => {
            proxy.on('error', (err, _req, res) => {
              console.warn('[Vite Staging Proxy Error]', err.message);
              if (res && typeof (res as any).writeHead === 'function' && !(res as any).headersSent) {
                (res as any).writeHead(502, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({ success: false, message: 'Vite Staging Proxy Connection Error', error: err.message }));
              }
            });
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
              proxyReq.setHeader('Origin', targetOrigin);
              proxyReq.setHeader('Referer', `${targetOrigin}/`);
              proxyReq.removeHeader('x-playwright-version');
              proxyReq.removeHeader('x-cypress-instance');
              proxyReq.removeHeader('x-puppeteer-version');
            });
            proxy.on('proxyRes', (proxyRes) => {
              const setCookie = proxyRes.headers['set-cookie'];
              if (Array.isArray(setCookie)) {
                proxyRes.headers['set-cookie'] = setCookie.map((cookie) =>
                  cookie
                    .replace(/;\s*Secure/gi, '')
                    .replace(/;\s*SameSite=None/gi, '; SameSite=Lax')
                );
              }
            });
          }
        },
        '/uploads': {
          target: targetOrigin,
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
              proxyReq.setHeader('Origin', targetOrigin);
              proxyReq.setHeader('Referer', `${targetOrigin}/`);
            });
          }
        }
      }
    }
  };
});
