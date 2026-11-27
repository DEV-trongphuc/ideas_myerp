/**
 * src/utils/fileDownloader.ts
 * Utility to download files with automatic WebP -> JPG format conversion.
 */
import { getStreamTicket, getCurrentSessionToken } from './streamTicket';

const EXTERNAL_CLOUD_DOMAINS = ['drive.google.com', 'docs.google.com', 'youtube.com', 'youtu.be'];

function isSafeDownloadUrl(url: string): boolean {
  const trimmed = (url || '').trim();
  if (!trimmed || trimmed === '#') return false;
  if (/^(javascript|vbscript):/i.test(trimmed)) return false;
  if (/^data:/i.test(trimmed) && !/^data:image\/(png|jpe?g|webp|gif);/i.test(trimmed)) return false;
  return true;
}

function isSameOrApiOrigin(targetUrl: string): boolean {
  if (typeof window === 'undefined') return true;
  if (!/^https?:\/\//i.test(targetUrl)) return true;
  try {
    const parsed = new URL(targetUrl, window.location.origin);
    if (parsed.host === window.location.host) return true;
    const apiBase = import.meta.env.VITE_API_URL || '';
    if (apiBase && /^https?:\/\//i.test(apiBase)) {
      return new URL(apiBase).host === parsed.host;
    }
  } catch {}
  return false;
}

function isUnexpectedHtmlOrJsonResponse(contentType: string, fileName: string): boolean {
  const ct = (contentType || '').toLowerCase();
  const lowerName = (fileName || '').toLowerCase();
  if (ct.includes('text/html') && !/\.html?$/i.test(lowerName)) return true;
  if (ct.includes('application/json') && !/\.json$/i.test(lowerName)) return true;
  return false;
}

function triggerBlobSave(blob: Blob, fileName: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
}

/**
 * Check if a file name or URL is a WebP image
 */
export function isWebpFile(fileNameOrUrl: string): boolean {
  if (!fileNameOrUrl) return false;
  const clean = fileNameOrUrl.split('?')[0].split('#')[0].toLowerCase().trim();
  return clean.endsWith('.webp');
}

/**
 * Convert a WebP Blob to a high-quality JPG Blob using HTML5 Canvas
 */
export async function convertWebpBlobToJpgBlob(blob: Blob, quality = 0.92): Promise<Blob> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(new Error('Image failed to load for canvas conversion: ' + e));
      img.src = objectUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get 2D canvas context');

    // Fill with solid white background to avoid transparent WebP turning black in JPEG
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const jpgBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
    });

    if (!jpgBlob) throw new Error('Canvas toBlob failed');
    return jpgBlob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Convert an image URL to a JPG Blob using Image element + Canvas
 */
async function convertUrlToJpgBlob(url: string, quality = 0.92, signal?: AbortSignal): Promise<Blob> {
  const fetchUrl = resolveFetchableUrl(url);
  const token = getCurrentSessionToken();

  // Attempt authenticated fetch first to get clean blob
  try {
    const headers: Record<string, string> = {};
    if (token && isSameOrApiOrigin(fetchUrl)) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(fetchUrl, { mode: 'cors', headers, signal });
    if (response.ok) {
      const ct = response.headers.get('content-type') || '';
      if (!isUnexpectedHtmlOrJsonResponse(ct, 'image.webp')) {
        const blob = await response.blob();
        return await convertWebpBlobToJpgBlob(blob, quality);
      }
    }
  } catch (fetchErr: any) {
    if (fetchErr?.name === 'AbortError') throw fetchErr;
    console.warn('Fetch failed for image, trying download-file / Image loader:', fetchErr);
  }

  // Secondary attempt via authenticated /api.php?action=download-file
  if (token) {
    try {
      const backendBase = (import.meta.env.VITE_API_URL || '/backend').replace(/\/$/, '');
      const dlUrl = `${backendBase}/api.php?action=download-file&url=${encodeURIComponent(url)}&name=image.webp`;
      const authRes = await fetch(dlUrl, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (authRes.ok) {
        const ct = authRes.headers.get('content-type') || '';
        if (!isUnexpectedHtmlOrJsonResponse(ct, 'image.webp')) {
          const blob = await authRes.blob();
          return await convertWebpBlobToJpgBlob(blob, quality);
        }
      }
    } catch (dlErr: any) {
      if (dlErr?.name === 'AbortError') throw dlErr;
    }
  }

  // Fallback: direct Image element loading
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
    img.src = fetchUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const jpgBlob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });

  if (!jpgBlob) throw new Error('Canvas conversion to JPG failed');
  return jpgBlob;
}

/**
 * Resolve relative or proxy URLs to absolute fetchable URLs
 */
function resolveFetchableUrl(url: string): string {
  let resolvedUrl = url;
  if (!resolvedUrl.startsWith('http://') && !resolvedUrl.startsWith('https://') && !resolvedUrl.startsWith('blob:')) {
    const apiBase = (import.meta.env.VITE_API_URL || '/backend').replace(/\/$/, '');
    const cleanPath = resolvedUrl.replace(/^\/?(backend\/)?/, '');
    resolvedUrl = `${apiBase}/${cleanPath}`;
  }

  // Normalize localhost dev proxy if needed
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    if (/^https?:\/\/[^/]+\/backend\//i.test(resolvedUrl)) {
      resolvedUrl = resolvedUrl.replace(/^https?:\/\/[^/]+\/backend\//i, '/backend/');
    }
  }
  return resolvedUrl;
}

/**
 * Robustly download any file preserving the exact original file name.
 * 1. Primary approach: fetch as Blob -> URL.createObjectURL -> a.download = originalFileName.
 *    Because Blob URLs originate from the current client domain, browsers strictly honor the download attribute!
 * 2. Fallback approach: server endpoint /api.php?action=download-file which sends RFC 5987/6266 Content-Disposition attachment headers.
 */
export async function downloadFileWithName(
  url: string,
  originalFileName: string,
  skipWebpConversion = false,
  signal?: AbortSignal
): Promise<void> {
  if (!isSafeDownloadUrl(url)) return;

  // Validate external / cloud URL using proper URL parsing (prevents substring /uploads/ bypass)
  let isCloudOrExternal = false;
  let parsedExternalUrl: URL | null = null;
  try {
    const originBase = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    parsedExternalUrl = new URL(url, originBase);
    const hostname = parsedExternalUrl.hostname.toLowerCase();
    const isCloudDomain = EXTERNAL_CLOUD_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`)
    );
    const isHttpScheme = parsedExternalUrl.protocol === 'http:' || parsedExternalUrl.protocol === 'https:';
    isCloudOrExternal = isCloudDomain || (isHttpScheme && !isSameOrApiOrigin(parsedExternalUrl.href));
  } catch {
    isCloudOrExternal = /^https?:\/\//i.test(url);
  }

  if (isCloudOrExternal) {
    if (parsedExternalUrl && (parsedExternalUrl.protocol === 'http:' || parsedExternalUrl.protocol === 'https:')) {
      window.open(parsedExternalUrl.href, '_blank', 'noopener,noreferrer');
    } else if (/^https?:\/\//i.test(url)) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  // Clean filename: remove file size suffix in parentheses like "(2.4 MB)" if captured by DOM parser
  let cleanName = (originalFileName || '').trim();
  cleanName = cleanName.replace(/\s*\(\s*[\d.]+\s*(?:KB|MB|GB|Bytes|B|b)\s*\)$/i, '').trim();

  // If filename is empty, extract from URL
  if (!cleanName) {
    cleanName = url.split('/').pop()?.split('?')[0] || 'tai-ve';
  }

  // Ensure file extension exists if URL has one
  const urlExt = url.split('?')[0].match(/\.([a-zA-Z0-9]+)$/)?.[1];
  const nameExt = cleanName.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  if (!nameExt && urlExt) {
    cleanName = `${cleanName}.${urlExt}`;
  }

  // If it's a WebP image, convert to JPG
  if (!skipWebpConversion && (isWebpFile(cleanName) || isWebpFile(url))) {
    return downloadFileWithWebpToJpg(url, cleanName, signal);
  }

  const fetchUrl = resolveFetchableUrl(url);
  const token = getCurrentSessionToken();

  // Approach 1: Client-side Blob download (Guarantees client-assigned filename across all modern browsers)
  try {
    const headers: Record<string, string> = {};
    if (token && isSameOrApiOrigin(fetchUrl)) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(fetchUrl, { mode: 'cors', headers, signal });
    if (res.ok) {
      const ct = res.headers.get('content-type') || '';
      if (!isUnexpectedHtmlOrJsonResponse(ct, cleanName)) {
        const blob = await res.blob();
        triggerBlobSave(blob, cleanName);
        return;
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    console.warn('Blob fetch failed, falling back to server download-file endpoint:', err);
  }

  // Approach 2: Server-side attachment endpoint with Content-Disposition header (via Authorization header or short-lived download ticket)
  const backendBase = (import.meta.env.VITE_API_URL || '/backend').replace(/\/$/, '');
  const baseDownloadEndpoint = `${backendBase}/api.php?action=download-file&url=${encodeURIComponent(url)}&name=${encodeURIComponent(cleanName)}`;

  if (token) {
    try {
      const authRes = await fetch(baseDownloadEndpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (authRes.ok) {
        const ct = authRes.headers.get('content-type') || '';
        if (!isUnexpectedHtmlOrJsonResponse(ct, cleanName)) {
          const blob = await authRes.blob();
          triggerBlobSave(blob, cleanName);
          return;
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
    }
  }

  const ticket = await getStreamTicket('download', true, signal);
  if (!ticket && !token) return;
  const downloadEndpoint = `${baseDownloadEndpoint}${ticket ? `&ticket=${encodeURIComponent(ticket)}` : ''}`;

  try {
    const ticketRes = await fetch(downloadEndpoint, { method: 'GET', signal });
    if (ticketRes.ok) {
      const ct = ticketRes.headers.get('content-type') || '';
      if (!isUnexpectedHtmlOrJsonResponse(ct, cleanName)) {
        const blob = await ticketRes.blob();
        triggerBlobSave(blob, cleanName);
        return;
      }
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
  }

  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = downloadEndpoint;
  a.rel = 'noopener noreferrer';
  a.download = cleanName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * Download a file. If it's a WebP image, automatically convert to JPG and download as .jpg.
 * Otherwise, download directly with original format and preserved filename.
 */
export async function downloadFileWithWebpToJpg(
  url: string,
  originalFileName: string,
  signal?: AbortSignal
): Promise<void> {
  if (!isSafeDownloadUrl(url)) return;

  const isWebp = isWebpFile(originalFileName) || isWebpFile(url);

  // If not WebP, delegate to downloadFileWithName to ensure original filename is always preserved
  if (!isWebp) {
    return downloadFileWithName(url, originalFileName, false, signal);
  }

  // File is WebP -> Target JPG (guarantee .jpg suffix even when originalFileName had no extension)
  let baseName = (originalFileName || '').trim() || url.split('/').pop()?.split('?')[0] || 'image';
  baseName = baseName.replace(/\s*\(\s*[\d.]+\s*(?:KB|MB|GB|Bytes|B|b)\s*\)$/i, '').trim();
  const jpgFileName = /\.webp$/i.test(baseName)
    ? baseName.replace(/\.webp$/i, '.jpg')
    : (/\.jpe?g$/i.test(baseName) ? baseName : `${baseName}.jpg`);

  try {
    const jpgBlob = await convertUrlToJpgBlob(url, 0.92, signal);
    triggerBlobSave(jpgBlob, jpgFileName);
  } catch (err: any) {
    if (err?.name === 'AbortError') return;
    console.error('Lỗi khi chuyển đổi WebP sang JPG:', err);
    // Fallback without infinite recursion into WebP conversion
    return downloadFileWithName(url, jpgFileName, true, signal);
  }
}

/**
 * Global click interceptor for comment attachment chips.
 * Ensures that clicking on any attachment chip in comments (both newly created and existing in database)
 * automatically downloads the file using its exact displayed name instead of the server's hashed filename.
 */
export function initAttachmentDownloadInterceptor(): void {
  if (typeof window === 'undefined') return;
  if ((window as any).__attachmentDownloadInterceptorInit) return;
  (window as any).__attachmentDownloadInterceptorInit = true;

  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // Check if clicked element or parent is an attachment chip, link, or card with file data
    const chip = target.closest<HTMLElement>('.comment-attachment-chip, a[data-file-url], a[data-file-name], .task-attachment-item, [data-attachment-download], a.attachment-link, a.download-link');
    if (!chip) return;

    // Ignore if clicked on a delete/remove button or external link inside the chip
    if (target.closest('button.btn-delete-link, button.remove-chip, button.btn-remove, [data-remove-attachment], a.btn-external-link')) return;

    // For task-attachment-item, if it's image or pdf and not clicking download button, let drawer/lightbox handle preview
    if (chip.classList.contains('task-attachment-item') && !target.closest('.btn-download-link, [data-attachment-download]')) {
      const testUrl = chip.getAttribute('data-file-url') || chip.getAttribute('href') || '';
      if (/\.(jpg|jpeg|png|gif|webp|svg|pdf)($|\?)/i.test(testUrl)) {
        return;
      }
    }

    const fileUrl = chip.getAttribute('data-file-url') || chip.getAttribute('href');
    if (!fileUrl || !isSafeDownloadUrl(fileUrl)) return;

    // Prevent default browser navigation / random filename download
    e.preventDefault();
    e.stopPropagation();

    // Determine filename using explicit attributes / filename selectors first, skipping badge pills like "PDF"
    let fileName = chip.getAttribute('data-file-name') || chip.getAttribute('download') || '';
    if (!fileName || fileName === 'true' || fileName === 'download') {
      const explicitEl = chip.querySelector<HTMLElement>('[data-filename], .attachment-filename, .file-name, .attachment-name');
      if (explicitEl?.textContent) {
        fileName = explicitEl.textContent.trim();
      }
    }
    if (!fileName || fileName === 'true' || fileName === 'download') {
      const spans = Array.from(chip.querySelectorAll('span'));
      const badgeOrSizePattern = /^(PDF|EXCEL|CSV|WORD|PPT|ZIP|RAR|7Z|AUDIO|VIDEO|FILE|PNG|JPG|JPEG|WEBP|GIF|\d+(?:\.\d+)?\s*(?:KB|MB|GB|Bytes|B))$/i;
      for (const span of spans) {
        if (span.className && /badge|size|icon|ext/i.test(span.className)) continue;
        const text = span.textContent?.trim() || '';
        if (text && !text.startsWith('(') && !badgeOrSizePattern.test(text) && text.length > 2) {
          fileName = text;
          break;
        }
      }
    }

    if (!fileName) {
      const fullText = chip.textContent || '';
      fileName = fullText.replace(/\s*\(\s*[\d.]+\s*(?:KB|MB|GB|Bytes|B|b)\s*\)/i, '').trim();
    }

    downloadFileWithName(fileUrl, fileName);
  }, true); // Use capture phase so it runs before any default browser navigation!
}
