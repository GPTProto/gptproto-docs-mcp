/**
 * GPTProto Docs Tool
 * Main documentation tool supporting search, get, and list operations
 *
 * Supports two modes:
 * 1. Dynamic mode (default): Fetches latest index from GitHub
 * 2. Offline mode: Uses bundled index when network is unavailable
 */

import { z } from "zod"
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { homedir } from "os"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Configuration
const REMOTE_INDEX_URL = process.env.GPTPROTO_DOCS_INDEX_URL ||
  "https://raw.githubusercontent.com/chencanbin/gptproto_doc/main/docs-index.json"
const LOCAL_INDEX_PATH = join(__dirname, "../generated/docs-index.json")
const CACHE_DIR = join(homedir(), ".gptproto-docs-mcp")
const CACHE_INDEX_PATH = join(CACHE_DIR, "docs-index.json")
const CACHE_TTL = 60 * 60 * 1000 // 1 hour in milliseconds

interface DocEntry {
  path: string
  title: string
  description: string
  vendor: string
  model: string
  format: string
  capability: string
  category: string
  content: string
}

interface DocsIndex {
  version: string
  generatedAt: string
  totalDocs: number
  vendors: string[]
  entries: DocEntry[]
}

// Index cache
let cachedIndex: DocsIndex | null = null
let lastFetchTime: number = 0

// Ensure cache directory exists
function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true })
  }
}

// Try to fetch index from remote
async function fetchRemoteIndex(): Promise<DocsIndex | null> {
  try {
    const response = await fetch(REMOTE_INDEX_URL, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10000) // 10s timeout
    })

    if (!response.ok) {
      console.error(`Failed to fetch remote index: ${response.status}`)
      return null
    }

    const index = await response.json() as DocsIndex

    // Cache to disk for offline use
    try {
      ensureCacheDir()
      writeFileSync(CACHE_INDEX_PATH, JSON.stringify(index))
    } catch {
      // Ignore cache write errors
    }

    return index
  } catch (error) {
    console.error("Failed to fetch remote index:", error)
    return null
  }
}

// Load cached index from disk
function loadCachedIndex(): DocsIndex | null {
  // Try disk cache first
  if (existsSync(CACHE_INDEX_PATH)) {
    try {
      return JSON.parse(readFileSync(CACHE_INDEX_PATH, "utf-8"))
    } catch {
      // Ignore read errors
    }
  }

  // Fall back to bundled index
  if (existsSync(LOCAL_INDEX_PATH)) {
    try {
      return JSON.parse(readFileSync(LOCAL_INDEX_PATH, "utf-8"))
    } catch {
      // Ignore read errors
    }
  }

  return null
}

// Load index with caching and fallback
async function loadIndex(): Promise<DocsIndex> {
  const now = Date.now()

  // Return memory cache if fresh
  if (cachedIndex && (now - lastFetchTime) < CACHE_TTL) {
    return cachedIndex
  }

  // Try to fetch from remote
  const remoteIndex = await fetchRemoteIndex()
  if (remoteIndex) {
    cachedIndex = remoteIndex
    lastFetchTime = now
    return cachedIndex
  }

  // Fall back to cached/bundled index
  const fallbackIndex = loadCachedIndex()
  if (fallbackIndex) {
    cachedIndex = fallbackIndex
    lastFetchTime = now
    return cachedIndex
  }

  throw new Error(
    "Documentation index not available. Check your network connection or run 'npm run build:index' to create a local index."
  )
}

// Synchronous version for compatibility (uses cached data)
function loadIndexSync(): DocsIndex {
  if (cachedIndex) return cachedIndex

  const fallbackIndex = loadCachedIndex()
  if (fallbackIndex) {
    cachedIndex = fallbackIndex
    return cachedIndex
  }

  throw new Error("Documentation index not loaded. Call handler first to initialize.")
}

// Input schema
export const inputSchema = {
  action: z
    .enum(["search", "get", "list"])
    .describe(
      "Action to perform: 'search' to find docs by keyword, 'get' to fetch full document content, 'list' to list available APIs by vendor"
    ),
  query: z
    .string()
    .optional()
    .describe(
      "For 'search' action: keyword to search for in doc titles, descriptions, and paths (e.g., 'gpt-4o image', 'claude text', 'gemini video')"
    ),
  path: z
    .string()
    .optional()
    .describe(
      "For 'get' action: document path from search results (e.g., 'docs/allapi/OpenAI/gpt-4o/official-format/text-to-text')"
    ),
  vendor: z
    .string()
    .optional()
    .describe(
      "For 'list' action: vendor name to filter (e.g., 'OpenAI', 'Google', 'Claude'). Omit to list all vendors."
    ),
}

type GptprotoDocsArgs = {
  action: "search" | "get" | "list"
  query?: string
  path?: string
  vendor?: string
}

export const metadata = {
  name: "gptproto_docs",
  description: `Search and retrieve GPTProto API documentation.
Three actions:
1. 'search' - Find docs by keyword (searches titles, descriptions, model names)
2. 'get' - Fetch full document content by path
3. 'list' - List available APIs, optionally filtered by vendor

Supported vendors: OpenAI, Google, Claude, DeepSeek, Doubao, Flux, Grok, Ideogram, Kling, Midjourney, MiniMax, Runway, Suno, Higgsfield, Alibaba`,
}

// Search function
async function searchDocs(query: string, limit: number = 20): Promise<DocEntry[]> {
  const index = await loadIndex()
  const queryLower = query.toLowerCase()
  const queryTerms = queryLower.split(/\s+/).filter(Boolean)

  // Score each entry based on matches
  const scored = index.entries.map((entry) => {
    let score = 0
    const searchableText = [
      entry.title,
      entry.description,
      entry.path,
      entry.vendor,
      entry.model,
      entry.capability,
    ]
      .join(" ")
      .toLowerCase()

    for (const term of queryTerms) {
      // Exact match in model name (highest priority)
      if (entry.model.toLowerCase().includes(term)) {
        score += 10
      }
      // Match in vendor name
      if (entry.vendor.toLowerCase().includes(term)) {
        score += 8
      }
      // Match in title
      if (entry.title.toLowerCase().includes(term)) {
        score += 5
      }
      // Match in capability
      if (entry.capability.toLowerCase().includes(term)) {
        score += 4
      }
      // Match in description
      if (entry.description.toLowerCase().includes(term)) {
        score += 2
      }
      // Match anywhere
      if (searchableText.includes(term)) {
        score += 1
      }
    }

    return { entry, score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry)
}

// Get document content from index
async function getDocContent(docPath: string): Promise<{ content: string; metadata: DocEntry | null }> {
  const index = await loadIndex()

  // Find entry in index
  const entry = index.entries.find((e) => e.path === docPath)

  if (!entry) {
    throw new Error(`Document not found: ${docPath}`)
  }

  return { content: entry.content, metadata: entry }
}

// List APIs by vendor
async function listApis(vendor?: string): Promise<{ vendors: string[]; apis: { vendor: string; model: string; capabilities: string[] }[] }> {
  const index = await loadIndex()

  if (vendor) {
    // List APIs for specific vendor
    const vendorLower = vendor.toLowerCase()
    const vendorEntries = index.entries.filter(
      (e) => e.vendor.toLowerCase() === vendorLower && e.category === "api"
    )

    // Group by model
    const modelMap = new Map<string, Set<string>>()
    for (const entry of vendorEntries) {
      if (!modelMap.has(entry.model)) {
        modelMap.set(entry.model, new Set())
      }
      if (entry.capability) {
        modelMap.get(entry.model)!.add(entry.capability)
      }
    }

    const apis = Array.from(modelMap.entries()).map(([model, caps]) => ({
      vendor: vendorEntries[0]?.vendor || vendor,
      model,
      capabilities: Array.from(caps).sort(),
    }))

    return { vendors: [vendor], apis }
  } else {
    // List all vendors and their model counts
    const vendorModels = new Map<string, Set<string>>()
    for (const entry of index.entries) {
      if (entry.vendor && entry.category === "api") {
        if (!vendorModels.has(entry.vendor)) {
          vendorModels.set(entry.vendor, new Set())
        }
        vendorModels.get(entry.vendor)!.add(entry.model)
      }
    }

    const apis = Array.from(vendorModels.entries()).map(([v, models]) => ({
      vendor: v,
      model: `${models.size} models available`,
      capabilities: [],
    }))

    return { vendors: index.vendors, apis }
  }
}

export async function handler({
  action,
  query,
  path,
  vendor,
}: GptprotoDocsArgs): Promise<string> {
  if (action === "search") {
    if (!query) {
      throw new Error("query parameter is required for search action")
    }

    const results = await searchDocs(query)

    if (results.length === 0) {
      return JSON.stringify({
        query,
        results: [],
        message: "No documentation found matching your query.",
        suggestion: "Try different keywords or use 'list' action to see available APIs.",
      })
    }

    return JSON.stringify({
      query,
      resultCount: results.length,
      results: results.map((r) => ({
        path: r.path,
        title: r.title || r.path.split("/").pop(),
        description: r.description,
        vendor: r.vendor,
        model: r.model,
        capability: r.capability,
      })),
    })
  } else if (action === "get") {
    if (!path) {
      throw new Error("path parameter is required for get action")
    }

    const { content, metadata } = await getDocContent(path)

    return JSON.stringify({
      path,
      title: metadata?.title || path.split("/").pop(),
      vendor: metadata?.vendor || "",
      model: metadata?.model || "",
      url: `https://docs.gptproto.com/${path.replace(/^docs\//, "")}`,
      content,
    })
  } else if (action === "list") {
    const result = await listApis(vendor)

    return JSON.stringify({
      vendor: vendor || "all",
      vendors: result.vendors,
      apis: result.apis,
    })
  } else {
    throw new Error(`Invalid action: ${action}`)
  }
}

// Export loadIndex for use in index.ts resources
export { loadIndex, loadIndexSync }
