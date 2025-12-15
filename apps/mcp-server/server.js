/**
 * RA-H MCP Server
 *
 * Exposes a minimal HTTP-based Model Context Protocol endpoint that lets external
 * assistants read/write the local RA-H SQLite graph by calling our existing API routes.
 * Designed to run locally (packaged with the desktop app) and never exposes data
 * beyond 127.0.0.1.
 */

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { URL } = require('node:url');

const { z } = require('zod');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { McpError, ErrorCode } = require('@modelcontextprotocol/sdk/types.js');
const getRawBody = require('raw-body');

const packageJson = require('../../package.json');

const DEFAULT_PORT = Number(process.env.RAH_MCP_PORT || 44145);
const DEFAULT_HOST = '127.0.0.1';
const STATUS_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'RA-H',
  'config'
);
const STATUS_FILE = path.join(STATUS_DIR, 'mcp-status.json');

let baseUrlResolver =
  typeof process.env.RAH_MCP_TARGET_URL === 'string'
    ? () => process.env.RAH_MCP_TARGET_URL
    : () => process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000';

let httpServer = null;
let httpPort = null;
let lastErrorMessage = null;
let logger = (message) => console.log(`[mcp] ${message}`);

const instructions = [
  'Use rah.add_node to summarize conversations or files into nodes with dimensions.',
  'Use rah.search_nodes to recall prior notes before you suggest creating new ones.',
  'All operations happen locally on this device; data never leaves 127.0.0.1.'
].join(' ');

const serverInfo = {
  name: 'ra-h-local-mcp',
  version: packageJson.version || '0.0.0'
};

const createServer = () =>
  new McpServer(serverInfo, {
    instructions,
    capabilities: {
      tools: {}
    }
  });

const mcpServer = createServer();

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

async function resolveBaseUrl() {
  try {
    const value = await baseUrlResolver();
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.replace(/\/+$/, '');
    }
  } catch (error) {
    lastErrorMessage = error instanceof Error ? error.message : String(error);
  }
  return (process.env.NEXT_PUBLIC_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
}

async function callRaHApi(pathname, options = {}) {
  const baseUrl = await resolveBaseUrl();
  const targetUrl = `${baseUrl}${pathname}`;
  try {
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
      lastErrorMessage = errorMessage;
      throw new McpError(ErrorCode.InternalError, errorMessage);
    }
    lastErrorMessage = null;
    return body;
  } catch (error) {
    const message =
      error instanceof McpError
        ? error.message
        : `Unable to reach local RA-H API at ${targetUrl}`;
    lastErrorMessage = message;
    if (error instanceof McpError) {
      throw error;
    }
    throw new McpError(ErrorCode.InternalError, message);
  }
}

mcpServer.registerTool(
  'rah.add_node',
  {
    title: 'Add RA-H node',
    description: 'Create a new node in the local RA-H knowledge base.',
    inputSchema: addNodeInputSchema,
    outputSchema: addNodeOutputSchema
  },
  async ({ title, content, link, description, dimensions, metadata, chunk }) => {
    const normalizedDimensions = sanitizeDimensions(dimensions);
    if (normalizedDimensions.length === 0) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'At least one dimension/tag is required when creating a node.'
      );
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

mcpServer.registerTool(
  'rah.search_nodes',
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
    const summary = nodes.length === 0
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

async function readRequestBody(req) {
  if (req.method !== 'POST') return undefined;
  try {
    const raw = await getRawBody(req, {
      limit: '4mb',
      encoding: 'utf-8'
    });
    return raw ? JSON.parse(raw) : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.ParseError, `Invalid JSON body: ${message}`);
  }
}

async function handleMcpRequest(req, res) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on('close', () => {
    transport.close().catch(() => undefined);
  });

  try {
    const parsedBody = await readRequestBody(req);
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, parsedBody);
  } catch (error) {
    const message = error instanceof McpError ? error.message : 'MCP transport failure';
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      error: { code: ErrorCode.InternalError, message }
    }));
    logger(`MCP request error: ${message}`);
  }
}

function ensureStatusDir() {
  fs.mkdirSync(STATUS_DIR, { recursive: true });
}

async function getStatusSnapshot() {
  const baseUrl = await resolveBaseUrl();
  return {
    enabled: !!httpServer,
    port: httpPort,
    url: httpPort ? `http://${DEFAULT_HOST}:${httpPort}/mcp` : null,
    target_base_url: baseUrl,
    last_updated: new Date().toISOString(),
    last_error: lastErrorMessage
  };
}

async function persistStatus() {
  try {
    if (!httpServer) {
      ensureStatusDir();
      fs.writeFileSync(
        STATUS_FILE,
        JSON.stringify({
          enabled: false,
          port: null,
          url: null,
          last_updated: new Date().toISOString()
        }, null, 2)
      );
      return;
    }
    const snapshot = await getStatusSnapshot();
    ensureStatusDir();
    fs.writeFileSync(STATUS_FILE, JSON.stringify(snapshot, null, 2));
  } catch (error) {
    logger(`Failed to persist MCP status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function ensureMcpServer(options = {}) {
  if (typeof options.logger === 'function') {
    logger = options.logger;
  }
  if (typeof options.resolveBaseUrl === 'function') {
    baseUrlResolver = options.resolveBaseUrl;
  }

  if (httpServer) {
    await persistStatus();
    return { port: httpPort };
  }

  const port = Number(options.port || DEFAULT_PORT);
  const host = options.host || DEFAULT_HOST;

  httpServer = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
      res.end();
      return;
    }

    if (parsedUrl.pathname === '/status') {
      const snapshot = await getStatusSnapshot();
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify(snapshot));
      return;
    }

    if (parsedUrl.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Route not found' }));
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Use POST for MCP requests' }));
      return;
    }

    await handleMcpRequest(req, res);
  });

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpPort = port;
      logger(`MCP server listening on http://${host}:${port}/mcp`);
      resolve();
    });
  });

  await persistStatus();
  return { port };
}

function updateBaseUrlResolver(resolver) {
  if (typeof resolver === 'function') {
    baseUrlResolver = resolver;
    persistStatus().catch(() => undefined);
  }
}

async function stopMcpServer() {
  if (!httpServer) return;
  await new Promise((resolve) => {
    httpServer.close(() => resolve());
  });
  httpServer = null;
  httpPort = null;
  await persistStatus();
}

module.exports = {
  ensureMcpServer,
  updateBaseUrlResolver,
  getStatusSnapshot,
  stopMcpServer,
  STATUS_FILE
};

if (require.main === module) {
  ensureMcpServer({
    port: DEFAULT_PORT,
    resolveBaseUrl: baseUrlResolver
  }).catch((error) => {
    console.error('Failed to start RA-H MCP server:', error);
    process.exit(1);
  });
}
