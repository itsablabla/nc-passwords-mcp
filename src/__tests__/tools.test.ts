import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the passwords API client
vi.mock('../client/passwords.js', () => ({
  passwordsApi: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
  checkPasswordsApi: vi.fn(),
}));

// Mock crypto.subtle.digest
const mockDigest = vi.fn().mockResolvedValue(new ArrayBuffer(20));
Object.defineProperty(global, 'crypto', {
  value: {
    subtle: {
      digest: mockDigest,
    },
  },
  writable: true,
});

import { passwordsApi } from '../client/passwords.js';
import {
  searchPasswordsTool,
  getPasswordTool,
  listPasswordsTool,
  createPasswordTool,
  updatePasswordTool,
  deletePasswordTool,
  generatePasswordTool,
} from '../tools/passwords.js';

const mockPasswordsApi = vi.mocked(passwordsApi);

const samplePassword = {
  id: 'abc-123',
  label: 'Test Service',
  username: 'user@test.com',
  password: 's3cret',
  url: 'https://test.com',
  notes: 'Test notes',
  customFields: '',
  status: 0,
  statusCode: 'GOOD',
  hash: 'abcdef1234567890',
  folder: '00000000-0000-0000-0000-000000000000',
  revision: 'rev-1',
  share: null,
  shared: false,
  cseType: 'none',
  sseType: 'SSEv2r1',
  hidden: false,
  trashed: false,
  favorite: false,
  editable: true,
  edited: 1700000000,
  created: 1699000000,
  updated: 1700000000,
};

describe('password tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('search_passwords', () => {
    it('should search by label and return results', async () => {
      mockPasswordsApi.mockResolvedValueOnce([samplePassword] as any);

      const result = await searchPasswordsTool.handler({ query: 'Test' });

      expect(result.content[0].text).toContain('Found 1 password(s)');
      expect(result.content[0].text).toContain('Test Service');
      expect(result.content[0].text).toContain('s3cret');
      expect(mockPasswordsApi).toHaveBeenCalledWith('/password/find', {
        method: 'POST',
        body: { criteria: [['label', 'Test', 'contains', false]] },
      });
    });

    it('should search by url when field specified', async () => {
      mockPasswordsApi.mockResolvedValueOnce([] as any);

      const result = await searchPasswordsTool.handler({ query: 'test.com', field: 'url' });

      expect(result.content[0].text).toContain('No passwords found');
      expect(mockPasswordsApi).toHaveBeenCalledWith('/password/find', {
        method: 'POST',
        body: { criteria: [['url', 'test.com', 'contains', false]] },
      });
    });

    it('should handle API errors gracefully', async () => {
      mockPasswordsApi.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await searchPasswordsTool.handler({ query: 'test' });

      expect((result as any).isError).toBe(true);
      expect(result.content[0].text).toContain('Connection refused');
    });
  });

  describe('get_password', () => {
    it('should return full password details', async () => {
      mockPasswordsApi.mockResolvedValueOnce(samplePassword as any);

      const result = await getPasswordTool.handler({ id: 'abc-123' });

      expect(result.content[0].text).toContain('Test Service');
      expect(result.content[0].text).toContain('s3cret');
      expect(result.content[0].text).toContain('user@test.com');
    });
  });

  describe('list_passwords', () => {
    it('should list all passwords without values', async () => {
      mockPasswordsApi.mockResolvedValueOnce([samplePassword] as any);

      const result = await listPasswordsTool.handler({});

      expect(result.content[0].text).toContain('Passwords (1)');
      expect(result.content[0].text).toContain('Test Service');
      expect(result.content[0].text).toContain('user@test.com');
      // list should NOT include the actual password
      expect(result.content[0].text).not.toContain('s3cret');
    });

    it('should filter by folder when specified', async () => {
      mockPasswordsApi.mockResolvedValueOnce([] as any);

      await listPasswordsTool.handler({ folder_id: 'folder-uuid' });

      expect(mockPasswordsApi).toHaveBeenCalledWith('/password/find', {
        method: 'POST',
        body: { criteria: [['folder', 'folder-uuid', 'eq', false]] },
      });
    });
  });

  describe('create_password', () => {
    it('should create a password with required fields', async () => {
      mockPasswordsApi.mockResolvedValueOnce({ id: 'new-123', revision: 'rev-1' } as any);

      const result = await createPasswordTool.handler({
        label: 'New Service',
        password: 'mypassword',
      });

      expect(result.content[0].text).toContain('Password created');
      expect(result.content[0].text).toContain('New Service');
      expect(mockPasswordsApi).toHaveBeenCalledWith(
        '/password/create',
        expect.objectContaining({
          method: 'POST',
          body: expect.objectContaining({
            label: 'New Service',
            password: 'mypassword',
          }),
        })
      );
    });

    it('should include optional fields when provided', async () => {
      mockPasswordsApi.mockResolvedValueOnce({ id: 'new-456', revision: 'rev-1' } as any);

      await createPasswordTool.handler({
        label: 'Full Entry',
        password: 'pass123',
        username: 'admin',
        url: 'https://example.com',
        notes: 'Some notes',
        folder_id: 'folder-uuid',
        favorite: true,
      });

      expect(mockPasswordsApi).toHaveBeenCalledWith(
        '/password/create',
        expect.objectContaining({
          body: expect.objectContaining({
            label: 'Full Entry',
            username: 'admin',
            url: 'https://example.com',
            notes: 'Some notes',
            folder: 'folder-uuid',
            favorite: true,
          }),
        })
      );
    });
  });

  describe('update_password', () => {
    it('should fetch current state and merge updates', async () => {
      // First call: get current password
      mockPasswordsApi.mockResolvedValueOnce(samplePassword as any);
      // Second call: update
      mockPasswordsApi.mockResolvedValueOnce({ id: 'abc-123', revision: 'rev-2' } as any);

      const result = await updatePasswordTool.handler({
        id: 'abc-123',
        label: 'Updated Service',
      });

      expect(result.content[0].text).toContain('Password updated');
      expect(result.content[0].text).toContain('Updated Service');

      // Should have merged: new label, kept old password/username/url/notes
      const updateCall = mockPasswordsApi.mock.calls[1];
      expect(updateCall[1]?.body).toMatchObject({
        id: 'abc-123',
        label: 'Updated Service',
        password: 's3cret',
        username: 'user@test.com',
        url: 'https://test.com',
      });
    });
  });

  describe('delete_password', () => {
    it('should delete a password', async () => {
      mockPasswordsApi.mockResolvedValueOnce({} as any);

      const result = await deletePasswordTool.handler({ id: 'abc-123' });

      expect(result.content[0].text).toContain('moved to trash');
      expect(mockPasswordsApi).toHaveBeenCalledWith('/password/delete', {
        method: 'DELETE',
        body: { id: 'abc-123' },
      });
    });
  });

  describe('generate_password', () => {
    it('should generate a password with defaults', async () => {
      mockPasswordsApi.mockResolvedValueOnce({
        password: 'xK9$mP2qR5',
        words: [],
        strength: 3,
      } as any);

      const result = await generatePasswordTool.handler({});

      expect(result.content[0].text).toContain('xK9$mP2qR5');
      expect(result.content[0].text).toContain('Strength: 3');
    });

    it('should pass strength and special params', async () => {
      mockPasswordsApi.mockResolvedValueOnce({
        password: 'abc123',
        words: [],
        strength: 1,
      } as any);

      await generatePasswordTool.handler({ strength: 1, special: false });

      const [path] = mockPasswordsApi.mock.calls[0];
      expect(path).toContain('strength=1');
      expect(path).toContain('special=false');
    });
  });
});
