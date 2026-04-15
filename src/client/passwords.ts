import { getNextcloudConfig } from '../config.js';
import { logger } from '../logger.js';

/**
 * Nextcloud Passwords API client.
 *
 * Handles Basic Auth, session lifecycle (open/keepalive),
 * and all REST calls to /apps/passwords/api/1.0/*.
 */

const API_BASE = '/index.php/apps/passwords/api/1.0';

/** Session keepalive interval (4 minutes — session times out at ~5 min) */
const KEEPALIVE_MS = 4 * 60 * 1000;

let sessionOpen = false;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

function authHeader(): string {
  const config = getNextcloudConfig();
  return 'Basic ' + Buffer.from(`${config.user}:${config.password}`).toString('base64');
}

function apiUrl(path: string): string {
  const config = getNextcloudConfig();
  return `${config.url}${API_BASE}${path}`;
}

/**
 * Low-level fetch wrapper with auth + JSON handling.
 */
async function apiFetch<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  const url = apiUrl(path);
  const method = options.method || 'GET';

  const headers: Record<string, string> = {
    Authorization: authHeader(),
    Accept: 'application/json',
  };

  let body: string | undefined;
  if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers['Content-Type'] = 'application/json';
  }

  const t0 = Date.now();
  const response = await fetch(url, { method, headers, body });
  logger.trace({ method, url, status: response.status, ms: Date.now() - t0 }, '[pw] HTTP');

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Passwords API error: ${response.status} ${response.statusText} - ${text}`);
  }

  // DELETE returns 200 with empty body
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    return {} as T;
  }

  return (await response.json()) as T;
}

/**
 * Open an authenticated session with the Passwords API.
 *
 * The Passwords app requires an active session for most endpoints.
 * If no challenge/token is required (no E2E encryption, no 2FA on the API),
 * the session opens with an empty POST body.
 */
export async function openSession(): Promise<void> {
  if (sessionOpen) return;

  try {
    // 1. Check what's required to open a session
    const requirements = await apiFetch<Record<string, unknown>>('/session/request');
    logger.debug({ requirements }, '[pw] Session requirements');

    // 2. Open the session — if no challenge/token needed, empty body works
    if (requirements.challenge) {
      throw new Error(
        'Nextcloud Passwords has a master password (challenge) enabled. ' +
          'This MCP server does not support client-side encryption yet. ' +
          'Disable the master password in Passwords settings, or wait for CSE support.'
      );
    }

    const tokenRequired = Array.isArray(requirements.token) && requirements.token.length > 0;
    if (tokenRequired) {
      throw new Error(
        'Nextcloud Passwords requires a 2FA token for API sessions. ' +
          'This is not supported yet. Use an app password instead.'
      );
    }

    await apiFetch('/session/open', { method: 'POST', body: {} });
    sessionOpen = true;
    logger.info('[pw] Session opened');

    // 3. Start keepalive timer
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    keepaliveTimer = setInterval(async () => {
      try {
        await apiFetch('/session/keepalive');
        logger.trace('[pw] Session keepalive');
      } catch (err) {
        logger.warn(
          { err: err instanceof Error ? err.message : String(err) },
          '[pw] Session keepalive failed — will re-open on next request'
        );
        sessionOpen = false;
      }
    }, KEEPALIVE_MS);
  } catch (err) {
    sessionOpen = false;
    throw err;
  }
}

/**
 * Ensure session is open before making API calls.
 * Re-opens if it was lost.
 */
async function ensureSession(): Promise<void> {
  if (!sessionOpen) {
    await openSession();
  }
}

/**
 * Make an authenticated, session-aware request to the Passwords API.
 * Automatically opens/re-opens the session if needed.
 */
export async function passwordsApi<T = unknown>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {}
): Promise<T> {
  await ensureSession();

  try {
    return await apiFetch<T>(path, options);
  } catch (err) {
    // If we get a session-related error, try re-opening once
    if (
      err instanceof Error &&
      (err.message.includes('403') ||
        err.message.includes('401') ||
        err.message.includes('session'))
    ) {
      logger.info('[pw] Session expired — re-opening');
      sessionOpen = false;
      await openSession();
      return await apiFetch<T>(path, options);
    }
    throw err;
  }
}

/** Close the session and stop keepalive. */
export function closeSession(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
  sessionOpen = false;
}

/**
 * Check if the Passwords API is reachable.
 * Does NOT require a session — just checks that the endpoint responds.
 */
export async function checkPasswordsApi(): Promise<void> {
  await apiFetch('/session/request');
}
