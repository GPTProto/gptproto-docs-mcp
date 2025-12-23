# GPTProto Docs MCP

MCP (Model Context Protocol) server for accessing GPTProto API documentation directly from Claude Code and other MCP-compatible clients.

## Features

- **Search** - Find API documentation by keywords
- **Get** - Retrieve full documentation for specific APIs
- **List** - Browse available APIs by vendor
- **Auto-update** - Automatically fetches latest documentation (no npm update needed!)

## Supported Vendors

| Vendor | Models |
|--------|--------|
| OpenAI | GPT-4.1, GPT-4o, GPT-5, DALL-E, Sora, o3, o4 |
| Google | Gemini 2.0/2.5/3, Veo3 |
| Claude | Claude 3.5, Claude Opus 4, Claude Sonnet 4 |
| Others | DeepSeek, Doubao, Flux, Grok, Ideogram, Kling, Midjourney, MiniMax, Runway, Suno, Higgsfield, Alibaba |

## Installation

### For Claude Code Users

Add to your Claude Code MCP settings (`~/.claude.json`):

```json
{
  "mcpServers": {
    "gptproto-docs": {
      "command": "npx",
      "args": ["-y", "gptproto-docs-mcp@latest"]
    }
  }
}
```

### For Cursor Users

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "gptproto-docs": {
      "command": "npx",
      "args": ["-y", "gptproto-docs-mcp@latest"]
    }
  }
}
```

### For Other MCP Clients

```bash
npx gptproto-docs-mcp
```

## Usage

Once configured, you can ask Claude questions like:

- "How do I use the GPT-4o API for image generation?"
- "Show me the Claude API documentation for text generation"
- "List all available Gemini models"

### Tool: `gptproto_docs`

The MCP provides a single tool with three actions:

#### Search

Find documentation by keywords:

```json
{
  "action": "search",
  "query": "gpt-4o image"
}
```

#### Get Document

Retrieve full documentation content:

```json
{
  "action": "get",
  "path": "docs/allapi/OpenAI/gpt-4o/official-format/text-to-text-chat"
}
```

#### List APIs

Browse available APIs by vendor:

```json
{
  "action": "list",
  "vendor": "OpenAI"
}
```

## Resources

The MCP also exposes these resources:

| Resource | Description |
|----------|-------------|
| `gptproto://docs-index` | Complete API documentation index |
| `gptproto://quickstart` | Quick start guide |
| `gptproto://authentication` | Authentication guide |

## How Updates Work

This MCP uses **dynamic loading** - documentation is fetched from GitHub at runtime:

- No npm update needed when docs change
- 1-hour cache for performance
- Automatic offline fallback

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GPTPROTO_DOCS_INDEX_URL` | Custom URL for the docs index (overrides default) |

## Links

- [GPTProto Documentation](https://docs.gptproto.com)
- [GPTProto API](https://gptproto.com)

## License

MIT
