import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer } from '../server.js';
import { logger } from '../logger.js';
import { checkPasswordsApi, openSession } from '../client/passwords.js';
import http from 'node:http';

const DEFAULT_PORT = 3340;
const MCP_PATH = '/mcp';

export async function startHttp(): Promise<void> {
  const port = parseInt(process.env.MCP_PORT || String(DEFAULT_PORT), 10);
  const host = process.env.MCP_HOST || '0.0.0.0';

  const server = http.createServer(async (req, res) => {
    // Health check
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // MCP endpoint
    if (req.url === MCP_PATH || req.url === '/') {
      const mcpServer = await createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      await mcpServer.connect(transport);
      res.on('close', () => {
        void transport.close();
        void mcpServer.close();
      });

      // Collect body
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', async () => {
        const bodyStr = Buffer.concat(chunks).toString();
        try {
          (req as any).body = JSON.parse(bodyStr);
        } catch {
          (req as any).body = {};
        }
        await transport.handleRequest(req as any, res as any, (req as any).body);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  server.listen(port, host, () => {
    logger.info({ host, port, path: MCP_PATH }, 'nc-passwords-mcp running (http transport)');

    // Non-blocking startup probe
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
          '[startup] Passwords API unreachable'
        );
      }
    })();
  });
}
