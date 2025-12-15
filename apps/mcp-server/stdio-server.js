#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const packageJson = require('../../package.json');

const instructions = [
  'Use rah.add_node to summarize conversations or files into nodes with dimensions.',
  'Use rah.search_nodes to recall prior notes before you suggest creating new ones.',
  'All operations happen locally on this device; data never leaves 127.0.0.1.'
].join(' ');

const serverInfo = {
  name: 'ra-h-local-stdio',
  version: packageJson.version || '0.0.0'
};

const STATUS_PATH = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'RA-H',
  'config',
  'mcp-status.json'
);

const addNodeInputSchema = {
  title: z.string().min(1).max(160),
  content: z.string().max(20000).optional(),
  link: z.string().url().optional(),
  description: z.string().max(2000).optional(),
  dimensions: z.array(z.string()).min(1).max(5),
  metadata: z.record(z.any()).optional(),
  chunk: z.string().max(50000).optional()
};

const addNodeOutputSchema = {
  nodeId: z.number(),
  title: z.string(),
  dimensions: z.array(z.string()),
  message: z.string()
};

const searchNodesInputSchema = {
  query: z.string().min(1).max(400),
  limit: z.number().min(1).max(25).optional(),
  dimensions: z.array(z.string()).max(5).optional()
};

const searchNodesOutputSchema = {
  count: z.number(),
  nodes: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      content: z.string().nullable(),
      description: z.string().nullable(),
      link: z.string().nullable(),
      dimensions: z.array(z.string()),
      updated_at: z.string()
    })
  )
};

const server = new McpServer(serverInfo, { instructions });

function logError(...args) {
  console.error('[ra-h-stdio]', ...args);
}

const sanitizeDimensions = (raw) => {
  if (!Array.isArray(raw)) return [];
  const result = [];
  const seen = new Set();
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const lowered = trimmed.toLowerCase();
    if (seen.has(lowered)) continue;
    seen.add(lowered);
    result.push(trimmed);
    if (result.length >= 5) break;
  }
  return result;
};

function readStatusFile() {
  try {
    if (!fs.existsSync(STATUS_PATH)) {
      return null;
    }
    const raw = fs.readFileSync(STATUS_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function resolveBaseUrl() {
  const envTarget = process.env.RAH_MCP_TARGET_URL || process.env.NEXT_PUBLIC_BASE_URL;
  if (envTarget && envTarget.trim().length > 0) {
    return envTarget.replace(/\/+$/, '');
  }
  const status = readStatusFile();
  if (status?.target_base_url) {
    return String(status.target_base_url).replace(/\/+$/, '');
  }
  if (status?.port) {
    return `http://127.0.0.1:${status.port}`.replace(/\/+$/, '');
  }
  return 'http://127.0.0.1:3000';
}

async function callRaHApi(pathname, options = {}) {
  const baseUrl = (await resolveBaseUrl()).replace(/\/+$/, '');
  const targetUrl = `${baseUrl}${pathname}`;

  const response = await fetch(targetUrl, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success === false) {
    const errorMessage = body?.error || `RA-H API request failed at ${pathname}`;
    throw new Error(errorMessage);
  }
  return body;
}

server.registerTool(
  'rah_add_node',
  {
    title: 'Add RA-H node',
    description: 'Create a new node in the local RA-H knowledge base.',
    inputSchema: addNodeInputSchema,
    outputSchema: addNodeOutputSchema
  },
  async ({ title, content, link, description, dimensions, metadata, chunk }) => {
    const normalizedDimensions = sanitizeDimensions(dimensions);
    if (normalizedDimensions.length === 0) {
      throw new Error('At least one dimension/tag is required when creating a node.');
    }

    const payload = {
      title: title.trim(),
      content: content?.trim() || undefined,
      link: link?.trim() || undefined,
      description: description?.trim() || undefined,
      dimensions: normalizedDimensions,
      metadata: metadata || {},
      chunk: chunk?.trim() || undefined
    };

    const result = await callRaHApi('/api/nodes', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    const node = result.data;
    const summary = `Created node #${node.id}: ${node.title} [${(node.dimensions || normalizedDimensions).join(', ')}]`;

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        nodeId: node.id,
        title: node.title,
        dimensions: node.dimensions || normalizedDimensions,
        message: result.message || summary
      }
    };
  }
);

server.registerTool(
  'rah_search_nodes',
  {
    title: 'Search RA-H nodes',
    description: 'Find existing RA-H entries that mention a topic before adding new ones.',
    inputSchema: searchNodesInputSchema,
    outputSchema: searchNodesOutputSchema
  },
  async ({ query, limit = 10, dimensions }) => {
    const params = new URLSearchParams();
    params.set('search', query.trim());
    params.set('limit', String(Math.min(Math.max(limit, 1), 25)));

    const dimensionList = sanitizeDimensions(dimensions || []);
    if (dimensionList.length > 0) {
      params.set('dimensions', dimensionList.join(','));
    }

    const result = await callRaHApi(`/api/nodes?${params.toString()}`, {
      method: 'GET'
    });

    const nodes = Array.isArray(result.data) ? result.data : [];
    const summary =
      nodes.length === 0
        ? 'No existing RA-H nodes mention that topic yet.'
        : `Found ${nodes.length} node(s) mentioning that topic.`;

    return {
      content: [{ type: 'text', text: summary }],
      structuredContent: {
        count: nodes.length,
        nodes: nodes.map((node) => ({
          id: node.id,
          title: node.title,
          content: node.content ?? null,
          description: node.description ?? null,
          link: node.link ?? null,
          dimensions: node.dimensions || [],
          updated_at: node.updated_at
        }))
      }
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logError('STDIO MCP server ready');
}

main().catch((error) => {
  logError('Fatal error:', error);
  process.exit(1);
});
