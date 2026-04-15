import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from '../server.js';
import { logger } from '../logger.js';
import { checkPasswordsApi, openSession } from '../client/passwords.js';

export async function startStdio(): Promise<void> {
  const server = await createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('nc-passwords-mcp running (stdio transport)');

  // Non-blocking startup probe: check Passwords API + open session
  void (async () => {
    try {
      const t0 = Date.now();
      await checkPasswordsApi();
      logger.info(
        { nc: process.env.NEXTCLOUD_URL, ms: Date.now() - t0 },
        '[startup] Passwords API reachable'
      );
      await openSession();
    } catch (err) {
      logger.warn(
        {
          nc: process.env.NEXTCLOUD_URL,
          err: err instanceof Error ? err.message : String(err),
        },
        '[startup] Passwords API unreachable — session will open on first tool call'
      );
    }
  })();
}
