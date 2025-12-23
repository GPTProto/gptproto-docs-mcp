#!/usr/bin/env node
/**
 * GPTProto Docs MCP Server
 * Provides access to GPTProto API documentation through the Model Context Protocol
 *
 * Features:
 * - Dynamic index loading from GitHub (auto-updates when docs change)
 * - Offline fallback to bundled/cached index
 * - 1-hour cache for performance
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod"

// Import tools
import * as gptprotoDocs from "./tools/gptproto-docs.js"
import { loadIndex } from "./tools/gptproto-docs.js"

// Tool list
const tools = [gptprotoDocs]

// Type definitions
interface JSONSchema {
  type?: string
  description?: string
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  enum?: unknown[]
}

// Create server
const server = new Server(
  {
    name: "gptproto-docs-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
)

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => ({
      name: tool.metadata.name,
      description: tool.metadata.description,
      inputSchema: {
        type: "object",
        properties: Object.entries(tool.inputSchema).reduce(
          (acc, [key, zodSchema]) => {
            acc[key] = zodSchemaToJsonSchema(zodSchema)
            return acc
          },
          {} as Record<string, JSONSchema>
        ),
      },
    })),
  }
})

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  const tool = tools.find((t) => t.metadata.name === name)
  if (!tool) {
    throw new Error(`Tool not found: ${name}`)
  }

  const parsedArgs = parseToolArgs(tool.inputSchema, args || {})

  const result = await (
    tool.handler as (args: Record<string, unknown>) => Promise<string>
  )(parsedArgs)

  return {
    content: [
      {
        type: "text",
        text: result,
      },
    ],
  }
})

// Resources - expose key documentation
interface ResourceMetadata {
  uri: string
  name: string
  description: string
  mimeType: string
}

const resources: ResourceMetadata[] = [
  {
    uri: "gptproto://docs-index",
    name: "GPTProto Docs Index",
    description: "Complete index of all GPTProto API documentation (metadata only)",
    mimeType: "application/json",
  },
  {
    uri: "gptproto://quickstart",
    name: "GPTProto Quickstart",
    description: "Quick start guide for GPTProto API",
    mimeType: "text/markdown",
  },
  {
    uri: "gptproto://authentication",
    name: "GPTProto Authentication",
    description: "Authentication guide for GPTProto API",
    mimeType: "text/markdown",
  },
]

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: resources.map((r) => ({
      uri: r.uri,
      name: r.name,
      description: r.description,
      mimeType: r.mimeType,
    })),
  }
})

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params
  const index = await loadIndex()

  if (uri === "gptproto://docs-index") {
    // Return index without content for smaller payload
    const indexWithoutContent = {
      version: index.version,
      generatedAt: index.generatedAt,
      totalDocs: index.totalDocs,
      vendors: index.vendors,
      entries: index.entries.map(e => ({
        path: e.path,
        title: e.title,
        description: e.description,
        vendor: e.vendor,
        model: e.model,
        format: e.format,
        capability: e.capability,
        category: e.category,
      }))
    }
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(indexWithoutContent, null, 2),
        },
      ],
    }
  }

  if (uri === "gptproto://quickstart") {
    const entry = index.entries.find(e => e.path === "quickstart")
    if (!entry) {
      throw new Error("Quickstart document not found")
    }
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: entry.content,
        },
      ],
    }
  }

  if (uri === "gptproto://authentication") {
    const entry = index.entries.find(e => e.path === "authentication")
    if (!entry) {
      throw new Error("Authentication document not found")
    }
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: entry.content,
        },
      ],
    }
  }

  throw new Error(`Resource not found: ${uri}`)
})

// Helper: Convert Zod schema to JSON Schema
function zodSchemaToJsonSchema(zodSchema: z.ZodTypeAny): JSONSchema {
  const description = zodSchema._def?.description

  if (zodSchema._def?.typeName === "ZodString") {
    return { type: "string", description }
  }
  if (zodSchema._def?.typeName === "ZodNumber") {
    return { type: "number", description }
  }
  if (zodSchema._def?.typeName === "ZodBoolean") {
    return { type: "boolean", description }
  }
  if (zodSchema._def?.typeName === "ZodArray") {
    return {
      type: "array",
      description,
      items: zodSchemaToJsonSchema(zodSchema._def.type),
    }
  }
  if (zodSchema._def?.typeName === "ZodObject") {
    const shape = zodSchema._def.shape()
    const properties: Record<string, JSONSchema> = {}
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodSchemaToJsonSchema(value as z.ZodTypeAny)
    }
    return { type: "object", description, properties }
  }
  if (zodSchema._def?.typeName === "ZodEnum") {
    return { type: "string", enum: zodSchema._def.values, description }
  }
  if (zodSchema._def?.typeName === "ZodOptional") {
    return zodSchemaToJsonSchema(zodSchema._def.innerType)
  }
  if (zodSchema._def?.typeName === "ZodUnion") {
    const options = zodSchema._def.options
    if (options.length === 2) {
      return zodSchemaToJsonSchema(options[0])
    }
  }
  if (zodSchema._def?.typeName === "ZodDefault") {
    return zodSchemaToJsonSchema(zodSchema._def.innerType)
  }

  return { type: "string", description }
}

// Helper: Parse tool arguments with Zod validation
function parseToolArgs(
  schema: Record<string, z.ZodTypeAny>,
  args: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, zodSchema] of Object.entries(schema)) {
    if (args[key] !== undefined) {
      const parsed = zodSchema.safeParse(args[key])
      if (parsed.success) {
        result[key] = parsed.data
      } else {
        throw new Error(`Invalid argument '${key}': ${parsed.error.message}`)
      }
    } else if (!zodSchema.isOptional()) {
      throw new Error(`Missing required argument: ${key}`)
    }
  }

  return result
}

// Main entry point
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("GPTProto Docs MCP server started")
}

main().catch((error) => {
  console.error("Server error:", error)
  process.exit(1)
})
