# Mask Editor

An MCP App that lets you drop an image onto a canvas, paint a selection with a brush tool, and send the resulting mask to the server.

## Setup

```bash
npm install
npm run build
```

## Running

```bash
npm run serve        # serve pre-built dist/
npm start            # build + serve
npm run dev          # watch + serve (rebuilds on change)
```

Server starts at `http://localhost:3001/mcp` (stateless streamable HTTP).

Set `PORT` env var to change the port.

Masks are saved to `./output/` as `<name>_mask_<timestamp>.png`.

## Connecting an MCP Client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mask-editor": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

Restart Claude Desktop. The `open-mask-editor` tool will appear in the tools list.

### Cursor

Open **Settings → MCP** and add a new server:

- **Type:** HTTP
- **URL:** `http://localhost:3001/mcp`

### VS Code (Continue extension)

In `.continue/config.json`:

```json
{
  "mcpServers": [
    {
      "name": "mask-editor",
      "transport": {
        "type": "http",
        "url": "http://localhost:3001/mcp"
      }
    }
  ]
}
```

### Any MCP client (generic)

The server uses the [Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) (stateless). Point your client at:

```
http://localhost:3001/mcp
```

No API key or session setup required.

---

## Testing with basic-host

```bash
git clone --branch "v$(npm view @modelcontextprotocol/ext-apps version)" --depth 1 \
  https://github.com/modelcontextprotocol/ext-apps.git /tmp/mcp-ext-apps

cd /tmp/mcp-ext-apps/examples/basic-host && npm install
SERVERS='["http://localhost:3001/mcp"]' npm run start
```

Open `http://localhost:8080`, then call the `open-mask-editor` tool.

## Usage

1. Drop an image onto the canvas (or click **Upload Image**)
2. Paint a selection using the brush — adjust size with the slider
3. Click **Confirm Mask** to generate a black/white mask and send it to the server
4. The saved file path is shown in the status bar
