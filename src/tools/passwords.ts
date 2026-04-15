import { z } from 'zod';
import { passwordsApi } from '../client/passwords.js';

/**
 * Password object from the Nextcloud Passwords API.
 */
export interface Password {
  id: string;
  label: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  customFields: string;
  status: number;
  statusCode: string;
  hash: string;
  folder: string;
  revision: string;
  share: string | null;
  shared: boolean;
  cseType: string;
  sseType: string;
  hidden: boolean;
  trashed: boolean;
  favorite: boolean;
  editable: boolean;
  edited: number;
  created: number;
  updated: number;
}

/** Format a password for display (never expose the actual password unless asked) */
function formatPassword(pw: Password, includePassword = false): string {
  const parts = [`[${pw.id}] ${pw.label}`];
  if (pw.username) parts.push(`  username: ${pw.username}`);
  if (pw.url) parts.push(`  url: ${pw.url}`);
  if (includePassword) parts.push(`  password: ${pw.password}`);
  if (pw.notes) parts.push(`  notes: ${pw.notes}`);
  if (pw.favorite) parts.push(`  favorite: yes`);
  if (pw.folder && pw.folder !== '00000000-0000-0000-0000-000000000000')
    parts.push(`  folder: ${pw.folder}`);
  const edited = pw.edited ? new Date(pw.edited * 1000).toISOString() : 'never';
  parts.push(`  edited: ${edited}`);
  return parts.join('\n');
}

function handleError(
  error: unknown,
  context: string
): { content: { type: 'text'; text: string }[]; isError: true } {
  return {
    content: [
      {
        type: 'text',
        text: `${context}: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

// ── search_passwords ─────────────────────────────────────────────────────

export const searchPasswordsTool = {
  name: 'search_passwords',
  description:
    'Search for passwords by label, URL, or username. Returns matching entries with their details (password value included).',
  inputSchema: z.object({
    query: z.string().describe('Search term to match against password entries'),
    field: z
      .enum(['label', 'url', 'username'])
      .optional()
      .describe('Specific field to search in (default: searches label)'),
  }),
  handler: async (args: { query: string; field?: 'label' | 'url' | 'username' }) => {
    try {
      const field = args.field || 'label';
      const criteria: [string, string, string, boolean][] = [
        [field, args.query, 'contains', false],
      ];

      const passwords = await passwordsApi<Password[]>('/password/find', {
        method: 'POST',
        body: { criteria },
      });

      if (passwords.length === 0) {
        return {
          content: [
            { type: 'text' as const, text: `No passwords found matching "${args.query}".` },
          ],
        };
      }

      const formatted = passwords.map((pw) => formatPassword(pw, true)).join('\n\n');
      return {
        content: [
          {
            type: 'text' as const,
            text: `Found ${passwords.length} password(s):\n\n${formatted}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'Error searching passwords');
    }
  },
};

// ── get_password ─────────────────────────────────────────────────────────

export const getPasswordTool = {
  name: 'get_password',
  description:
    'Get the full details of a specific password by its UUID, including the password value.',
  inputSchema: z.object({
    id: z.string().describe('UUID of the password (from search_passwords or list_passwords)'),
  }),
  handler: async (args: { id: string }) => {
    try {
      const pw = await passwordsApi<Password>('/password/show', {
        method: 'POST',
        body: { id: args.id },
      });

      return {
        content: [{ type: 'text' as const, text: formatPassword(pw, true) }],
      };
    } catch (error) {
      return handleError(error, 'Error getting password');
    }
  },
};

// ── list_passwords ───────────────────────────────────────────────────────

export const listPasswordsTool = {
  name: 'list_passwords',
  description:
    'List all passwords. Returns labels, usernames, and URLs (not password values — use get_password for that).',
  inputSchema: z.object({
    folder_id: z.string().optional().describe('Filter by folder UUID (omit for all passwords)'),
  }),
  handler: async (args: { folder_id?: string }) => {
    try {
      let passwords: Password[];

      if (args.folder_id) {
        passwords = await passwordsApi<Password[]>('/password/find', {
          method: 'POST',
          body: { criteria: [['folder', args.folder_id, 'eq', false]] },
        });
      } else {
        passwords = await passwordsApi<Password[]>('/password/list');
      }

      if (passwords.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No passwords found.' }],
        };
      }

      const lines = passwords.map(
        (pw) =>
          `[${pw.id}] ${pw.label}${pw.username ? ` (${pw.username})` : ''}${pw.url ? ` — ${pw.url}` : ''}`
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `Passwords (${passwords.length}):\n\n${lines.join('\n')}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'Error listing passwords');
    }
  },
};

// ── create_password ──────────────────────────────────────────────────────

export const createPasswordTool = {
  name: 'create_password',
  description: 'Create a new password entry in Nextcloud Passwords.',
  inputSchema: z.object({
    label: z.string().describe('Label/name for the password entry'),
    password: z.string().describe('The password value'),
    username: z.string().optional().describe('Username associated with this password'),
    url: z.string().optional().describe('URL of the website'),
    notes: z.string().optional().describe('Additional notes (Markdown supported)'),
    folder_id: z.string().optional().describe('UUID of the folder to put this password in'),
    favorite: z.boolean().optional().describe('Mark as favorite'),
  }),
  handler: async (args: {
    label: string;
    password: string;
    username?: string;
    url?: string;
    notes?: string;
    folder_id?: string;
    favorite?: boolean;
  }) => {
    try {
      // Compute SHA1 hash of the password (required by the API)
      const encoder = new TextEncoder();
      const data = encoder.encode(args.password);
      const hashBuffer = await crypto.subtle.digest('SHA-1', data);
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const body: Record<string, unknown> = {
        password: args.password,
        label: args.label,
        hash,
      };
      if (args.username) body.username = args.username;
      if (args.url) body.url = args.url;
      if (args.notes) body.notes = args.notes;
      if (args.folder_id) body.folder = args.folder_id;
      if (args.favorite !== undefined) body.favorite = args.favorite;

      const result = await passwordsApi<{ id: string; revision: string }>('/password/create', {
        method: 'POST',
        body,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Password created: ${args.label} (id: ${result.id})`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'Error creating password');
    }
  },
};

// ── update_password ──────────────────────────────────────────────────────

export const updatePasswordTool = {
  name: 'update_password',
  description: 'Update an existing password entry. Provide only the fields you want to change.',
  inputSchema: z.object({
    id: z.string().describe('UUID of the password to update'),
    label: z.string().optional().describe('New label'),
    password: z.string().optional().describe('New password value'),
    username: z.string().optional().describe('New username'),
    url: z.string().optional().describe('New URL'),
    notes: z.string().optional().describe('New notes'),
    favorite: z.boolean().optional().describe('Favorite flag'),
  }),
  handler: async (args: {
    id: string;
    label?: string;
    password?: string;
    username?: string;
    url?: string;
    notes?: string;
    favorite?: boolean;
  }) => {
    try {
      // Fetch current state to merge with updates
      const current = await passwordsApi<Password>('/password/show', {
        method: 'POST',
        body: { id: args.id },
      });

      const newPassword = args.password ?? current.password;

      // Recompute hash if password changed
      const encoder = new TextEncoder();
      const data = encoder.encode(newPassword);
      const hashBuffer = await crypto.subtle.digest('SHA-1', data);
      const hash = Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      const body: Record<string, unknown> = {
        id: args.id,
        revision: current.revision,
        password: newPassword,
        label: args.label ?? current.label,
        username: args.username ?? current.username,
        url: args.url ?? current.url,
        notes: args.notes ?? current.notes,
        hash,
        edited: Math.floor(Date.now() / 1000),
      };
      if (args.favorite !== undefined) body.favorite = args.favorite;

      await passwordsApi<{ id: string; revision: string }>('/password/update', {
        method: 'PATCH',
        body,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Password updated: ${body.label} (id: ${args.id})`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'Error updating password');
    }
  },
};

// ── delete_password ──────────────────────────────────────────────────────

export const deletePasswordTool = {
  name: 'delete_password',
  description: 'Move a password to trash. Can be restored from the Passwords app.',
  inputSchema: z.object({
    id: z.string().describe('UUID of the password to delete'),
  }),
  handler: async (args: { id: string }) => {
    try {
      await passwordsApi('/password/delete', {
        method: 'DELETE',
        body: { id: args.id },
      });

      return {
        content: [{ type: 'text' as const, text: `Password ${args.id} moved to trash.` }],
      };
    } catch (error) {
      return handleError(error, 'Error deleting password');
    }
  },
};

// ── generate_password ────────────────────────────────────────────────────

export const generatePasswordTool = {
  name: 'generate_password',
  description: 'Generate a secure random password using the Nextcloud Passwords generator.',
  inputSchema: z.object({
    strength: z
      .number()
      .int()
      .min(0)
      .max(4)
      .optional()
      .describe('Password strength (0=weak, 1=low, 2=medium, 3=strong, 4=ultra). Default: 3'),
    numbers: z.boolean().optional().describe('Include numbers (default: true)'),
    special: z.boolean().optional().describe('Include special characters (default: true)'),
  }),
  handler: async (args: { strength?: number; numbers?: boolean; special?: boolean }) => {
    try {
      const params = new URLSearchParams();
      if (args.strength !== undefined) params.set('strength', String(args.strength));
      if (args.numbers !== undefined) params.set('numbers', String(args.numbers));
      if (args.special !== undefined) params.set('special', String(args.special));

      const query = params.toString() ? `?${params.toString()}` : '';
      const result = await passwordsApi<{ password: string; words: string[]; strength: number }>(
        `/service/password${query}`
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: `Generated password: ${result.password}\nStrength: ${result.strength}`,
          },
        ],
      };
    } catch (error) {
      return handleError(error, 'Error generating password');
    }
  },
};

// ── Export all tools ─────────────────────────────────────────────────────

export const passwordsTools = [
  searchPasswordsTool,
  getPasswordTool,
  listPasswordsTool,
  createPasswordTool,
  updatePasswordTool,
  deletePasswordTool,
  generatePasswordTool,
];
