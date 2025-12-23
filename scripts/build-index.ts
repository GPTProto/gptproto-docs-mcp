/**
 * Build documentation index from docs.json and MDX files
 * This script:
 * 1. Clones the gptproto_doc repository from GitHub (or uses existing clone)
 * 2. Parses the Mintlify docs.json navigation structure
 * 3. Extracts frontmatter + content from each MDX file
 * 4. Creates a searchable index file
 *
 * The index includes document content so the MCP can work standalone without
 * needing access to the original MDX files
 */

import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { execSync } from "child_process"
import matter from "gray-matter"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Configuration
const DOCS_REPO_URL = "https://github.com/chencanbin/gptproto_doc.git"
const TEMP_DIR = join(__dirname, "../.temp")
const DOCS_DIR = join(TEMP_DIR, "gptproto_doc")
const DOCS_JSON_PATH = join(DOCS_DIR, "docs.json")
const OUTPUT_PATH = join(__dirname, "../src/generated/docs-index.json")

interface DocEntry {
  path: string           // e.g., "docs/allapi/OpenAI/gpt-4o/official-format/text-to-text"
  title: string          // From MDX frontmatter
  description: string    // From MDX frontmatter
  vendor: string         // e.g., "OpenAI", "Google", "Claude"
  model: string          // e.g., "gpt-4o", "gemini-2.5-flash"
  format: string         // e.g., "official-format", "openai-format"
  capability: string     // e.g., "text-to-text", "image-to-text", "text-to-image"
  category: string       // "api" | "guide" | "getting-started"
  content: string        // Full document content (cleaned)
}

interface DocsIndex {
  version: string
  generatedAt: string
  totalDocs: number
  vendors: string[]
  entries: DocEntry[]
}

// Clone or update the docs repository
function cloneDocsRepo(): void {
  console.log("📥 Fetching documentation from GitHub...")

  // Create temp directory if not exists
  if (!existsSync(TEMP_DIR)) {
    mkdirSync(TEMP_DIR, { recursive: true })
  }

  if (existsSync(DOCS_DIR)) {
    // Update existing clone
    console.log("   Updating existing clone...")
    try {
      execSync("git pull --ff-only", { cwd: DOCS_DIR, stdio: "pipe" })
    } catch {
      // If pull fails, remove and re-clone
      console.log("   Pull failed, re-cloning...")
      rmSync(DOCS_DIR, { recursive: true, force: true })
      execSync(`git clone --depth 1 ${DOCS_REPO_URL} gptproto_doc`, {
        cwd: TEMP_DIR,
        stdio: "pipe"
      })
    }
  } else {
    // Fresh clone (shallow for speed)
    console.log("   Cloning repository...")
    execSync(`git clone --depth 1 ${DOCS_REPO_URL} gptproto_doc`, {
      cwd: TEMP_DIR,
      stdio: "pipe"
    })
  }

  console.log("   Done!")
}

// Parse docs.json navigation structure
function parseDocsJson(): string[] {
  const docsJson = JSON.parse(readFileSync(DOCS_JSON_PATH, "utf-8"))
  const pages: string[] = []

  function extractPages(obj: unknown): void {
    if (typeof obj === "string") {
      pages.push(obj)
    } else if (Array.isArray(obj)) {
      obj.forEach(extractPages)
    } else if (obj && typeof obj === "object") {
      const record = obj as Record<string, unknown>
      // Extract pages from any object that has a pages property
      if (record.pages) {
        extractPages(record.pages)
      }
      // Extract from groups
      if (record.groups) {
        extractPages(record.groups)
      }
      // Handle tabs array in navigation
      if (record.tabs) {
        extractPages(record.tabs)
      }
    }
  }

  if (docsJson.navigation) {
    extractPages(docsJson.navigation)
  }

  return pages
}

// Parse path to extract metadata
function parsePathMetadata(path: string): Partial<DocEntry> {
  const parts = path.split("/")

  // Handle different path patterns
  // docs/allapi/OpenAI/gpt-4o/official-format/text-to-text
  // docs/api/OpenAI/gpt-4o-mini-tts/gptproto-format/text-to-audio
  // docs/guide/codex
  // introduction
  // quickstart
  // authentication
  // docs/api/quickstart/openai

  if (path.startsWith("docs/allapi/") || (path.startsWith("docs/api/") && parts[2] !== "quickstart")) {
    const vendor = parts[2] || ""
    const model = parts[3] || ""
    const format = parts[4] || ""
    const capability = parts[5] || ""
    return {
      vendor,
      model,
      format,
      capability,
      category: "api"
    }
  } else if (path.startsWith("docs/guide/")) {
    return {
      vendor: "",
      model: "",
      format: "",
      capability: "",
      category: "guide"
    }
  } else if (path.startsWith("docs/api/quickstart/")) {
    // Quick start examples like docs/api/quickstart/openai
    return {
      vendor: "",
      model: "",
      format: "",
      capability: "",
      category: "quickstart"
    }
  } else {
    // Root level docs (introduction, quickstart, authentication)
    return {
      vendor: "",
      model: "",
      format: "",
      capability: "",
      category: "getting-started"
    }
  }
}

// Read MDX file and extract frontmatter + content
function readMdxFile(relativePath: string): { title: string; description: string; content: string } {
  const mdxPath = join(DOCS_DIR, `${relativePath}.mdx`)

  if (!existsSync(mdxPath)) {
    console.warn(`  Warning: MDX file not found: ${mdxPath}`)
    return { title: "", description: "", content: "" }
  }

  try {
    const rawContent = readFileSync(mdxPath, "utf-8")
    const { data, content } = matter(rawContent)

    // Clean the content
    const cleanedContent = cleanMintlifyContent(content)

    return {
      title: data.title || "",
      description: data.description || "",
      content: cleanedContent
    }
  } catch (error) {
    console.warn(`  Warning: Error reading ${mdxPath}:`, error)
    return { title: "", description: "", content: "" }
  }
}

// Clean Mintlify-specific components
function cleanMintlifyContent(content: string): string {
  // Remove or transform Mintlify components
  content = content.replace(/<\/?CodeGroup>/g, "")
  content = content.replace(/<Card[^>]*>/g, "")
  content = content.replace(/<\/Card>/g, "")
  content = content.replace(/<\/?CardGroup[^>]*>/g, "")
  content = content.replace(/<Note>/g, "> **Note:** ")
  content = content.replace(/<\/Note>/g, "")
  content = content.replace(/<Warning>/g, "> **Warning:** ")
  content = content.replace(/<\/Warning>/g, "")
  content = content.replace(/<Info>/g, "> **Info:** ")
  content = content.replace(/<\/Info>/g, "")
  content = content.replace(/<Accordion\s+title="([^"]+)"[^>]*>/g, "### $1\n")
  content = content.replace(/<\/Accordion>/g, "")
  content = content.replace(/<\/?AccordionGroup>/g, "")
  content = content.replace(/<\/?Steps>/g, "")
  content = content.replace(/<Step\s+title="([^"]+)">/g, "**$1**\n")
  content = content.replace(/<\/Step>/g, "")
  content = content.replace(
    /<ParamField\s+([^>]+)>/g,
    (_, attrs) => {
      const nameMatch = attrs.match(/name="([^"]+)"/)
      const typeMatch = attrs.match(/type="([^"]+)"/)
      const requiredMatch = attrs.match(/required/)
      const name = nameMatch ? nameMatch[1] : ""
      const type = typeMatch ? typeMatch[1] : ""
      const required = requiredMatch ? " (required)" : ""
      return `- **${name}**${required}: \`${type}\` `
    }
  )
  content = content.replace(/<\/ParamField>/g, "")
  content = content.replace(/\n{3,}/g, "\n\n")
  return content.trim()
}

// Ensure output directory exists
function ensureOutputDir(): void {
  const outputDir = dirname(OUTPUT_PATH)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }
}

// Main build function
function buildIndex(): void {
  console.log("🔨 Building GPTProto docs index...\n")

  // Step 1: Clone/update docs repo
  cloneDocsRepo()

  // Step 2: Parse docs.json
  console.log(`\n📖 Reading docs.json...`)
  const pages = parseDocsJson()
  console.log(`   Found ${pages.length} pages in navigation`)

  // Step 3: Process all pages
  console.log(`\n⚙️  Processing pages...`)
  const entries: DocEntry[] = []
  const vendors = new Set<string>()

  let processedCount = 0
  for (const page of pages) {
    const metadata = parsePathMetadata(page)
    const mdxData = readMdxFile(page)

    if (metadata.vendor) {
      vendors.add(metadata.vendor)
    }

    entries.push({
      path: page,
      title: mdxData.title,
      description: mdxData.description,
      vendor: metadata.vendor || "",
      model: metadata.model || "",
      format: metadata.format || "",
      capability: metadata.capability || "",
      category: metadata.category || "api",
      content: mdxData.content
    })

    processedCount++
    if (processedCount % 100 === 0) {
      console.log(`   Processed ${processedCount}/${pages.length} pages...`)
    }
  }

  // Step 4: Write index
  const index: DocsIndex = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    totalDocs: entries.length,
    vendors: Array.from(vendors).sort(),
    entries
  }

  ensureOutputDir()
  writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2))

  console.log(`\n✅ Index generated successfully!`)
  console.log(`   Output: ${OUTPUT_PATH}`)
  console.log(`   Total docs: ${index.totalDocs}`)
  console.log(`   Vendors: ${index.vendors.join(", ")}`)
}

buildIndex()
