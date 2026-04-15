import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.subtle.digest for SHA-1 hashing
const mockDigest = vi.fn();
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
  },
});

// Set env vars before importing modules
process.env.NEXTCLOUD_URL = 'https://next.example.com';
process.env.NEXTCLOUD_USER = 'admin';
process.env.NEXTCLOUD_PASSWORD = 'test-app-password';

// Import after env vars are set
const { passwordsApi, openSession, closeSession, checkPasswordsApi } =
  await import('../client/passwords.js');

describe('passwords client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    closeSession();
  });

  describe('checkPasswordsApi', () => {
    it('should call /session/request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await checkPasswordsApi();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/apps/passwords/api/1.0/session/request');
    });
  });

  describe('openSession', () => {
    it('should open session when no challenge/token required', async () => {
      // GET /session/request → empty requirements
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      // POST /session/open → success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ success: true }),
      });

      await openSession();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [, openCall] = mockFetch.mock.calls;
      expect(openCall[0]).toContain('/session/open');
      expect(openCall[1].method).toBe('POST');
    });

    it('should throw when challenge (master password) is required', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ challenge: { type: 'PWDv1r1' } }),
      });

      await expect(openSession()).rejects.toThrow('master password');
    });

    it('should throw when 2FA token is required', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ token: [{ type: 'totp' }] }),
      });

      await expect(openSession()).rejects.toThrow('2FA');
    });
  });

  describe('passwordsApi', () => {
    it('should auto-open session before API call', async () => {
      // openSession: request + open
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      // Actual API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [{ id: '123', label: 'Test' }],
      });

      const result = await passwordsApi('/password/list');
      expect(result).toEqual([{ id: '123', label: 'Test' }]);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should include Basic Auth header', async () => {
      // openSession
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      // API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      });

      await passwordsApi('/password/list');

      const expectedAuth = 'Basic ' + Buffer.from('admin:test-app-password').toString('base64');
      const [, , apiCall] = mockFetch.mock.calls;
      expect(apiCall[1].headers.Authorization).toBe(expectedAuth);
    });

    it('should throw on HTTP error', async () => {
      // openSession
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });
      // API call returns 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error',
      });

      await expect(passwordsApi('/password/list')).rejects.toThrow('500');
    });
  });
});
