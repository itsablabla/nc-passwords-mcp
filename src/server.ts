import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { logger } from './logger.js';
import { passwordsTools } from './tools/passwords.js';

const SERVER_NAME = 'nc-passwords-mcp';

/**
 * Create a fully-configured McpServer with all password tools registered.
 */
export async function createServer(): Promise<McpServer> {
  const server = new McpServer({
    name: SERVER_NAME,
    version: '0.1.0',
  });

  for (const tool of passwordsTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema as any,
      },
      async (...args: unknown[]) => {
        const start = Date.now();
        logger.debug({ tool: tool.name }, '[tool] Called');
        const result = await (tool.handler as (...a: unknown[]) => Promise<any>)(...args);
        const ms = Date.now() - start;
        if (result?.isError) {
          const errorText = result.content?.[0]?.text ?? 'unknown error';
          logger.warn({ tool: tool.name, error: errorText, ms }, '[tool] Error response');
        } else {
          logger.debug({ tool: tool.name, ms }, '[tool] Completed');
        }
        return result;
      }
    );
  }

  logger.info({ tools: passwordsTools.length }, '[startup] Registered password tools');
  return server;
}
