# nc-passwords-mcp

MCP server for the [Nextcloud Passwords](https://apps.nextcloud.com/apps/passwords) app. Gives AI agents (OpenHands, Claude Desktop, Cursor, etc.) the ability to search, create, update, and delete credentials stored in your Nextcloud instance.

## Tools

| Tool | Description |
|------|-------------|
| `search_passwords` | Find passwords by label, URL, or username |
| `get_password` | Get full details of a specific password by UUID |
| `list_passwords` | List all passwords (optionally filtered by folder) |
| `create_password` | Store a new credential |
| `update_password` | Update an existing credential |
| `delete_password` | Move a password to trash |
| `generate_password` | Generate a secure random password |

## Quick Start

### Prerequisites

- Node.js 20+
- Nextcloud with the [Passwords](https://apps.nextcloud.com/apps/passwords) app installed
- A Nextcloud **app password** (Settings → Security → App Passwords)

### Install & Run

```bash
# Clone
git clone https://github.com/itsablabla/nc-passwords-mcp.git
cd nc-passwords-mcp

# Install dependencies
npm install

# Build
npm run build

# Configure
export NEXTCLOUD_URL=https://your-nextcloud.example.com
export NEXTCLOUD_USER=admin
export NEXTCLOUD_PASSWORD=your-app-password

# Run (stdio transport — for MCP clients)
npm start

# Or run with HTTP transport
MCP_TRANSPORT=http npm start
```

### Use with OpenHands (Jada Coder)

Add to your OpenHands `settings.json`:

```json
{
  "mcp_config": {
    "stdio_servers": [
      {
        "name": "nextcloud-passwords",
        "command": "node",
        "args": ["/path/to/nc-passwords-mcp/dist/index.js"],
        "env": {
          "NEXTCLOUD_URL": "https://next.garzaos.cloud",
          "NEXTCLOUD_USER": "admin",
          "NEXTCLOUD_PASSWORD": "your-app-password"
        }
      }
    ]
  }
}
```

### Use with Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "nextcloud-passwords": {
      "command": "node",
      "args": ["/path/to/nc-passwords-mcp/dist/index.js"],
      "env": {
        "NEXTCLOUD_URL": "https://your-nextcloud.example.com",
        "NEXTCLOUD_USER": "admin",
        "NEXTCLOUD_PASSWORD": "your-app-password"
      }
    }
  }
}
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTCLOUD_URL` | Yes | — | Nextcloud instance URL |
| `NEXTCLOUD_USER` | Yes | — | Nextcloud username |
| `NEXTCLOUD_PASSWORD` | Yes | — | App password (not user password) |
| `MCP_TRANSPORT` | No | `stdio` | `stdio` or `http` |
| `MCP_PORT` | No | `3340` | HTTP transport port |
| `MCP_HOST` | No | `0.0.0.0` | HTTP transport bind address |
| `LOG_LEVEL` | No | `info` | `trace`/`debug`/`info`/`warn`/`error`/`fatal` |

## Development

```bash
npm run dev          # Hot reload via tsx
npm test             # Run tests
npm run lint         # ESLint
npm run format       # Prettier auto-fix
npm run format:check # Prettier check only
```

## Architecture

```
MCP Client ──(stdio/HTTP)──▶ nc-passwords-mcp ──(REST)──▶ Nextcloud Passwords API
                                    │
                              Session management
                              (open → keepalive → retry)
```

The server manages a persistent session with the Passwords API, sending keepalive pings every 4 minutes and auto-reopening if the session expires.

## Limitations

- **No client-side encryption (CSE) support yet.** If your Passwords app has a master password / E2E encryption enabled, the server will error on session open. Most installs use server-side encryption only.
- **Single-user.** The server authenticates as one Nextcloud user. Multi-user support would require per-request auth.

## License

MIT
