import { tool } from 'ai';
import { z } from 'zod';
import { AgentDelegationService } from '@/services/agents/delegation';
import { MiniRAHExecutor } from '@/services/agents/executor';
import { RequestContext } from '@/services/context/requestContext';
import type { Node } from '@/types/database';
import { nodeService } from '@/services/database/nodes';

type CapsuleNodeRole = 'primary' | 'secondary' | 'referenced';

interface CapsuleNodeSnapshot {
  id: number;
  title: string | null;
  link: string | null;
  dimensions: string[];
  chunkStatus: string;
  hasChunks: boolean;
  excerpt: string | null;
  role: CapsuleNodeRole;
}

interface DelegationCapsule {
  version: number;
  generatedAt: string;
  primary: CapsuleNodeSnapshot | null;
  secondary: CapsuleNodeSnapshot[];
  referenced: CapsuleNodeSnapshot[];
  focusCount: number;
}

function truncateWords(text: string, limit: number): string {
  if (!text) return '';
  const words = text.trim().split(/\s+/);
  if (words.length <= limit) return text.trim();
  return `${words.slice(0, limit).join(' ')}…`;
}

function describeChunk(node: Node): { status: string; hasChunks: boolean } {
  const status = node.chunk_status || 'unknown';
  const hasChunks = status === 'chunked' || (typeof node.chunk === 'string' && node.chunk.length > 0);
  return { status, hasChunks };
}

function buildSnapshot(node: Node, role: CapsuleNodeRole): CapsuleNodeSnapshot {
  const primaryText = (node.content || node.description || '').trim();
  const linkFallback = node.link || '';
  const excerptSource = primaryText.length > 0 ? primaryText : linkFallback;
  const { status, hasChunks } = describeChunk(node);
  return {
    id: node.id,
    title: node.title || null,
    link: node.link || null,
    dimensions: node.dimensions || [],
    chunkStatus: status,
    hasChunks,
    excerpt: excerptSource ? truncateWords(excerptSource, 80) : null,
    role,
  };
}

function formatCapsuleForLLM(capsule: DelegationCapsule): string {
  const lines: string[] = ['=== DELEGATION CAPSULE ==='];
  if (capsule.primary) {
    lines.push('Primary focus:', formatSnapshotLine(capsule.primary));
  } else {
    lines.push('Primary focus: None');
  }

  if (capsule.secondary.length > 0) {
    lines.push('Secondary focus nodes:');
    capsule.secondary.forEach(snapshot => {
      lines.push(`- ${formatSnapshotLine(snapshot)}`);
    });
  } else {
    lines.push('Secondary focus nodes: None');
  }

  if (capsule.referenced.length > 0) {
    lines.push('Referenced nodes provided in this task:');
    capsule.referenced.forEach(snapshot => {
      lines.push(`- ${formatSnapshotLine(snapshot)}`);
    });
  }

  lines.push('Instructions:',
    '- Use the capsule snapshots as ground truth for node IDs and titles.',
    '- Call getNodesById if you need the full record beyond the provided excerpt.',
    '- List the node IDs you used in the "Context sources used" line of your final summary.',
    '=== END CAPSULE ===');
  return lines.join('\n');
}

function formatSnapshotLine(snapshot: CapsuleNodeSnapshot): string {
  const dimensionLabel = snapshot.dimensions.length > 0 ? snapshot.dimensions.join(', ') : 'none';
  const excerpt = snapshot.excerpt ? `Excerpt: ${snapshot.excerpt}` : 'Excerpt: (no stored content; hydrate via getNodesById if required)';
  return `[NODE:${snapshot.id}:"${snapshot.title || 'Untitled'}"] | role=${snapshot.role} | dimensions=${dimensionLabel} | chunk_status=${snapshot.chunkStatus} | ${excerpt}`;
}

function buildSourceBlock(snapshot: CapsuleNodeSnapshot): string {
  return [
    `=== SOURCE: NODE ${snapshot.id} ===`,
    `Title: "${snapshot.title || 'Untitled'}"`,
    `Role: ${snapshot.role}`,
    `Chunk status: ${snapshot.chunkStatus} (has_chunks=${snapshot.hasChunks})`,
    snapshot.link ? `Link: ${snapshot.link}` : 'Link: None',
    snapshot.dimensions.length > 0 ? `Dimensions: ${snapshot.dimensions.join(', ')}` : 'Dimensions: None',
    snapshot.excerpt ? `Excerpt: ${snapshot.excerpt}` : 'Excerpt: (not available) — call getNodesById if you need more context.',
    '====================='
  ].join('\n');
}

async function hydrateReferencedNodes(nodeIds: number[]): Promise<Node[]> {
  const nodes: Node[] = [];
  for (const id of nodeIds) {
    try {
      const node = await nodeService.getNodeById(id);
      if (node) {
        nodes.push(node);
      }
    } catch (error) {
      console.warn(`delegateToMiniRAH: failed to load node ${id}`, error);
    }
  }
  return nodes;
}

export const delegateToMiniRAHTool = tool({
  description: 'Delegate task to mini worker',
  inputSchema: z.object({
    task: z.string().describe('Clear, actionable description of what the mini ra-h should do'),
    context: z.array(z.string()).max(16).default([]).describe('Optional context: URLs, node IDs, or key information the worker needs'),
    expectedOutcome: z.string().optional().describe('Optional: what format or structure you expect in the summary'),
  }),
  execute: async ({ task, context = [], expectedOutcome }) => {
    const requestContext = RequestContext.get();
    const openTabs = (requestContext.openTabs ?? []) as Node[];
    const activeTabId = requestContext.activeTabId ?? null;

    const providedEntries = Array.isArray(context) ? context.filter(entry => typeof entry === 'string') as string[] : [];
    const referencedNodeIds = new Set<number>();
    const passthroughEntries: string[] = [];

    providedEntries.forEach(entry => {
      const trimmed = entry.trim();
      const numericMatch = trimmed.match(/^(?:node_id:)?(\d+)$/i);
      if (numericMatch) {
        const id = Number(numericMatch[1]);
        if (Number.isFinite(id) && id > 0) {
          referencedNodeIds.add(id);
        }
        return;
      }
      passthroughEntries.push(entry);
    });

    const focusMap = new Map<number, Node>();
    openTabs.forEach(node => {
      if (node && typeof node.id === 'number') {
        focusMap.set(node.id, node);
      }
    });

    const additionalIds = Array.from(referencedNodeIds).filter(id => !focusMap.has(id));
    const referencedNodes = await hydrateReferencedNodes(additionalIds);

    referencedNodes.forEach(node => focusMap.set(node.id, node));

    const focusNodes = Array.from(focusMap.values());
    const primaryNode = focusNodes.find(node => node.id === activeTabId) || focusNodes[0] || null;
    const secondaryNodes = focusNodes.filter(node => primaryNode && node.id !== primaryNode.id && openTabs.some(tab => tab.id === node.id));
    const referencedOnlyNodes = focusNodes.filter(node => !openTabs.some(tab => tab.id === node.id));

    const capsule: DelegationCapsule = {
      version: 1,
      generatedAt: new Date().toISOString(),
      primary: primaryNode ? buildSnapshot(primaryNode, 'primary') : null,
      secondary: secondaryNodes.map(node => buildSnapshot(node, 'secondary')),
      referenced: referencedOnlyNodes.map(node => buildSnapshot(node, 'referenced')),
      focusCount: openTabs.length,
    };

    const sourceBlocks: string[] = [];
    const snapshots: CapsuleNodeSnapshot[] = [];
    if (capsule.primary) snapshots.push(capsule.primary);
    snapshots.push(...capsule.secondary, ...capsule.referenced);
    snapshots.forEach(snapshot => {
      sourceBlocks.push(buildSourceBlock(snapshot));
    });

    const enrichedContext: string[] = [
      `CAPSULE_JSON::${JSON.stringify(capsule)}`,
      formatCapsuleForLLM(capsule),
      ...sourceBlocks,
      ...passthroughEntries,
    ].slice(0, 16);

    const delegation = AgentDelegationService.createDelegation({
      task,
      context: enrichedContext,
      expectedOutcome,
      supabaseToken: null,
    });

    const execution = await MiniRAHExecutor.execute({
      sessionId: delegation.sessionId,
      task,
      context: enrichedContext,
      expectedOutcome,
      traceId: requestContext.traceId,
      parentChatId: requestContext.parentChatId,
      workflowKey: requestContext.workflowKey,
      workflowNodeId: requestContext.workflowNodeId,
    });

    const summary = execution?.summary || 'Task delegated but no summary returned.';
    const status = execution?.status || 'completed';
    const sessionSuffix = delegation.sessionId.split('_').pop();
    const statusLabel = status === 'completed' ? 'completed the task' : 'flagged an issue';
    return `Mini ra-h (session ${sessionSuffix}) ${statusLabel}:\n\n${summary}`;
  },
});
