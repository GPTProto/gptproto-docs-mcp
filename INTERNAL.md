# GPTProto Docs MCP - Internal Maintenance Documentation

> This document is for maintainers only and is not publicly released.

## Project Architecture

```
gptproto-docs-mcp/
├── package.json              # npm package config
├── tsconfig.json             # TypeScript config
├── README.md                 # Public documentation (for npm users)
├── INTERNAL.md               # Internal documentation (for maintainers)
├── scripts/
│   ├── build-index.ts        # Index build script
│   └── publish-index.sh      # Index publish script
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── tools/
│   │   └── gptproto-docs.ts  # Main tool implementation
│   └── generated/
│       └── docs-index.json   # Generated index file (3MB)
└── dist/                     # Compiled output
```

## Core Implementation Logic

### 1. Index Building (`scripts/build-index.ts`)

**Purpose**: Convert 591 MDX files into a single JSON index file

**Process**:
```
gptproto_doc/docs.json  →  Parse navigation structure  →  Get all page paths
                                                              ↓
gptproto_doc/*.mdx      →  gray-matter parsing        →  Extract frontmatter + content
                                                              ↓
                        cleanMintlifyContent          →  Clean Mintlify components
                                                              ↓
                        parsePathMetadata             →  Extract metadata from path
                                                              ↓
                        Generate docs-index.json      →  3MB, 591 entries
```

**Key Functions**:

| Function | Purpose |
|----------|---------|
| `parseDocsJson()` | Parse docs.json, extract all page paths |
| `parsePathMetadata(path)` | Parse vendor/model/format/capability from path |
| `readMdxFile(path)` | Read MDX, parse frontmatter with gray-matter |
| `cleanMintlifyContent(content)` | Clean Mintlify components (CodeGroup, Card, Note, etc.) |

**Path Parsing Rules**:
```
docs/allapi/OpenAI/gpt-4o/official-format/text-to-text-chat
         ↓      ↓           ↓              ↓
      vendor  model      format       capability

docs/guide/codex        → category: "guide"
docs/api/quickstart/*   → category: "quickstart"
introduction/quickstart → category: "getting-started"
```

### 2. Index Loading (`src/tools/gptproto-docs.ts`)

**Three-Level Caching Strategy**:

```
┌─────────────────────────────────────────────────────────────┐
│                      loadIndex() call                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 1. Memory Cache (cachedIndex)                               │
│    - Check if lastFetchTime is within 1 hour                │
│    - If yes, return the in-memory index directly            │
└─────────────────────────────────────────────────────────────┘
                              ↓ Cache expired or first load
┌─────────────────────────────────────────────────────────────┐
│ 2. Remote Fetch (fetchRemoteIndex)                          │
│    - URL: GitHub Raw (chencanbin/gptproto_doc)              │
│    - Timeout: 10 seconds                                    │
│    - Write to disk cache on success                         │
└─────────────────────────────────────────────────────────────┘
                              ↓ Network failure
┌─────────────────────────────────────────────────────────────┐
│ 3. Disk Cache (loadCachedIndex)                             │
│    - First check: ~/.gptproto-docs-mcp/docs-index.json      │
│    - Then check: dist/generated/docs-index.json (npm built-in) │
└─────────────────────────────────────────────────────────────┘
```

**Configuration Constants**:
```typescript
REMOTE_INDEX_URL = "https://raw.githubusercontent.com/chencanbin/gptproto_doc/main/docs-index.json"
CACHE_DIR = "~/.gptproto-docs-mcp"
CACHE_TTL = 60 * 60 * 1000  // 1 hour
```

### 3. Tool Functions (`handler` function)

**search operation**:
```typescript
// Scoring rules (higher = more relevant)
model name match:       +10 points
vendor name match:      +8 points
title match:            +5 points
capability match:       +4 points
description match:      +2 points
other location match:   +1 point

// Returns top 20 most relevant results
```

**get operation**:
```typescript
// Find entry by path, return complete content
// Also returns document URL: https://docs.gptproto.com/{path}
```

**list operation**:
```typescript
// If vendor specified: return all models and capabilities for that vendor
// If not specified: return list of all vendors and model counts
```

### 4. MCP Server (`src/index.ts`)

**Registered Tools**:
- `gptproto_docs`: search, get, list

**Registered Resources**:
- `gptproto://docs-index`: Index metadata (without content, reduced size)
- `gptproto://quickstart`: Quick start documentation
- `gptproto://authentication`: Authentication documentation

## Daily Maintenance Commands

### After Updating Documentation

```bash
cd /Users/sparkle/tl/gptproto-api-mcp/gptproto-docs-mcp

# 1. Rebuild index
npm run build:index

# 2. Publish to GitHub (users get updates automatically)
./scripts/publish-index.sh

# No need for npm publish!
```

### Publishing a New Version to npm

```bash
# 1. Update version number in package.json
# 2. Rebuild
npm run build

# 3. Publish
npm publish
```

### Local Testing

```bash
# Test search
node -e "
const { handler } = await import('./dist/tools/gptproto-docs.js');
const result = await handler({ action: 'search', query: 'gpt-4o image' });
console.log(result);
"

# Test get
node -e "
const { handler } = await import('./dist/tools/gptproto-docs.js');
const result = await handler({ action: 'get', path: 'docs/allapi/OpenAI/gpt-4o/official-format/text-to-text-chat' });
console.log(JSON.parse(result).content.substring(0, 500));
"

# Test list
node -e "
const { handler } = await import('./dist/tools/gptproto-docs.js');
const result = await handler({ action: 'list', vendor: 'OpenAI' });
console.log(result);
"
```

### Clear Local Cache

```bash
rm -rf ~/.gptproto-docs-mcp
```

## File Path Reference

| Purpose | Path |
|---------|------|
| MDX documentation source | `/Users/sparkle/tl/gptproto-api-mcp/gptproto_doc/` |
| Navigation config | `/Users/sparkle/tl/gptproto-api-mcp/gptproto_doc/docs.json` |
| MCP project | `/Users/sparkle/tl/gptproto-api-mcp/gptproto-docs-mcp/` |
| Local index | `src/generated/docs-index.json` |
| User cache | `~/.gptproto-docs-mcp/docs-index.json` |
| Remote index | `https://raw.githubusercontent.com/chencanbin/gptproto_doc/main/docs-index.json` |

## docs-index.json Structure

```json
{
  "version": "1.0.0",
  "generatedAt": "2025-01-01T00:00:00.000Z",
  "totalDocs": 591,
  "vendors": ["Alibaba", "Claude", "DeepSeek", ...],  // 16 vendors
  "entries": [
    {
      "path": "docs/allapi/OpenAI/gpt-4o/official-format/text-to-text-chat",
      "title": "gpt-4o (Text to Text (Chat))",
      "description": "Generate conversational responses...",
      "vendor": "OpenAI",
      "model": "gpt-4o",
      "format": "official-format",
      "capability": "text-to-text-chat",
      "category": "api",
      "content": "## Initiate Request\n\n```bash cURL\ncurl ..."  // Complete documentation
    },
    // ... 591 entries
  ]
}
```

## FAQ

### Q: User reports documentation is not up to date?
A: The index has a 1-hour cache. Ask the user to delete the `~/.gptproto-docs-mcp` directory and try again.

### Q: Remote index returns 404?
A: Check if `docs-index.json` has been pushed to the GitHub repository root.

### Q: Search results are inaccurate?
A: Check the scoring rules in the `searchDocs` function, weights can be adjusted.

### Q: Adding a new vendor/model?
A:
1. Add MDX files in `gptproto_doc/`
2. Update `docs.json` navigation
3. Run `npm run build:index`
4. Run `./scripts/publish-index.sh`

## Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP protocol implementation |
| `zod` | Input parameter validation |
| `gray-matter` | Parse MDX frontmatter |
| `tsx` | Run TypeScript scripts |
