import api from '../api/axios';
import { safeLocalStorageGet } from './authPersistence';

export type StreamTicketScope = 'sse' | 'download';

interface CachedTicket {
  ticket: string;
  expiresAtMs: number;
  ownerToken: string;
}

let cachedSseTicket: CachedTicket | null = null;
let inFlightSsePromise: Promise<string | null> | null = null;

export function clearStreamTicketCache(): void {
  cachedSseTicket = null;
  inFlightSsePromise = null;
}

export function getCurrentSessionToken(): string {
  const direct =
    safeLocalStorageGet('Ideas_token') ||
    safeLocalStorageGet('access_token') ||
    (typeof localStorage !== 'undefined'
      ? localStorage.getItem('Ideas_token') || localStorage.getItem('access_token') || ''
      : '');
  if (direct) return direct;
  try {
    const rawZustand = safeLocalStorageGet('minth-auth');
    if (rawZustand) {
      const parsed = JSON.parse(rawZustand);
      if (parsed?.state?.accessToken) {
        return String(parsed.state.accessToken);
      }
    }
  } catch {}
  return '';
}

export function getCurrentSessionUserId(): number {
  const keys = ['Ideas_user', 'auth_user'];
  for (const key of keys) {
    try {
      const raw = safeLocalStorageGet(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const id = Number(parsed?.id || parsed?.user_id || 0);
        if (id > 0) return id;
      }
    } catch {}
  }
  try {
    const rawZustand = safeLocalStorageGet('minth-auth');
    if (rawZustand) {
      const parsed = JSON.parse(rawZustand);
      const id = Number(parsed?.state?.user?.id || 0);
      if (id > 0) return id;
    }
  } catch {}
  return 0;
}

/**
 * Mints a short-lived, single-purpose stream/download ticket (60s-300s TTL)
 * via POST /auth/stream-ticket so long-lived JWTs are never exposed in URLs.
 */
export async function getStreamTicket(
  scope: StreamTicketScope = 'sse',
  forceRefresh = false,
  signal?: AbortSignal
): Promise<string | null> {
  const currentToken = getCurrentSessionToken();
  if (!currentToken) {
    clearStreamTicketCache();
    return null;
  }

  if (scope === 'sse' && !forceRefresh && cachedSseTicket) {
    if (
      cachedSseTicket.ownerToken === currentToken &&
      Date.now() < cachedSseTicket.expiresAtMs - 10_000
    ) {
      return cachedSseTicket.ticket;
    }
    cachedSseTicket = null;
  }

  if (scope === 'sse' && inFlightSsePromise) {
    return inFlightSsePromise;
  }

  const runFetch = async (): Promise<string | null> => {
    try {
      const res = await api.post('/auth/stream-ticket', { scope }, signal ? { signal } : undefined);
      const data = res.data?.data || res.data || {};
      const ticket = typeof data.ticket === 'string' ? data.ticket.trim() : '';
      if (!ticket) return null;

      if (scope === 'sse') {
        const expiresInSec = Number(data.expires_in) || 300;
        const rawWindowMs = expiresInSec * 1000 - 15_000;
        const safeWindowMs = Math.min(240_000, Math.max(0, rawWindowMs));
        if (expiresInSec > 15 && safeWindowMs > 0) {
          cachedSseTicket = {
            ticket,
            expiresAtMs: Date.now() + safeWindowMs,
            ownerToken: currentToken,
          };
        } else {
          cachedSseTicket = null;
        }
      }
      return ticket;
    } catch {
      return null;
    } finally {
      if (scope === 'sse') {
        inFlightSsePromise = null;
      }
    }
  };

  if (scope === 'sse') {
    inFlightSsePromise = runFetch();
    return inFlightSsePromise;
  }

  return runFetch();
}
