/**
 * Standalone build script for docs-index.json
 * This script runs directly in the gptproto_doc repository (via GitHub Actions)
 * and generates the docs-index.json file in the repository root.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import matter from "gray-matter"

// Configuration - runs in the current directory (gptproto_doc repo root)
const DOCS_DIR = process.cwd()
const DOCS_JSON_PATH = join(DOCS_DIR, "docs.json")
const OUTPUT_PATH = join(DOCS_DIR, "docs-index.json")

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
      if (record.pages) {
        extractPages(record.pages)
      }
      if (record.groups) {
        extractPages(record.groups)
      }
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
    return {
      vendor: "",
      model: "",
      format: "",
      capability: "",
      category: "quickstart"
    }
  } else {
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

// Main build function
function buildIndex(): void {
  console.log("🔨 Building GPTProto docs index...\n")

  // Parse docs.json
  console.log(`📖 Reading docs.json...`)
  const pages = parseDocsJson()
  console.log(`   Found ${pages.length} pages in navigation`)

  // Process all pages
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

  // Write index
  const index: DocsIndex = {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    totalDocs: entries.length,
    vendors: Array.from(vendors).sort(),
    entries
  }

  writeFileSync(OUTPUT_PATH, JSON.stringify(index, null, 2))

  console.log(`\n✅ Index generated successfully!`)
  console.log(`   Output: ${OUTPUT_PATH}`)
  console.log(`   Total docs: ${index.totalDocs}`)
  console.log(`   Vendors: ${index.vendors.join(", ")}`)
}

buildIndex()
