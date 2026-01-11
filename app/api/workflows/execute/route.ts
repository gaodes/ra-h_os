import { NextRequest, NextResponse } from 'next/server';
import { WorkflowRegistry } from '@/services/workflows/registry';
import { getSQLiteClient } from '@/services/database/sqlite-client';
import { AgentDelegationService } from '@/services/agents/delegation';
import { WiseRAHExecutor } from '@/services/agents/wiseRAHExecutor';
import { getAutoContextSummaries } from '@/services/context/autoContext';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { workflowKey, nodeId, userContext } = body;

    // Validate workflowKey
    if (!workflowKey || typeof workflowKey !== 'string') {
      return NextResponse.json(
        { success: false, error: 'workflowKey is required' },
        { status: 400 }
      );
    }

    // Fetch workflow definition
    const workflow = await WorkflowRegistry.getWorkflowByKey(workflowKey);
    if (!workflow) {
      return NextResponse.json(
        { success: false, error: `Workflow '${workflowKey}' not found` },
        { status: 404 }
      );
    }

    if (!workflow.enabled) {
      return NextResponse.json(
        { success: false, error: `Workflow '${workflowKey}' is disabled` },
        { status: 400 }
      );
    }

    // Validate node requirement
    if (workflow.requiresFocusedNode && !nodeId) {
      return NextResponse.json(
        { success: false, error: `Workflow '${workflowKey}' requires a nodeId` },
        { status: 400 }
      );
    }

    // Prevent re-running same workflow on same node within 1 hour
    if (nodeId) {
      const db = getSQLiteClient();
      const recentRuns = db.query<{ id: number }>(
        `SELECT id FROM chats
         WHERE json_extract(metadata, '$.workflow_key') = ?
         AND json_extract(metadata, '$.workflow_node_id') = ?
         AND datetime(created_at) > datetime('now', '-1 hour')
         LIMIT 1`,
        [workflowKey, nodeId]
      ).rows;

      if (recentRuns.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Workflow '${workflowKey}' already ran on node ${nodeId} within the last hour`
          },
          { status: 429 }
        );
      }
    }

    // Build context
    let contextLines: string[] = [];
    if (nodeId) {
      const db = getSQLiteClient();
      const stmt = db.prepare('SELECT * FROM nodes WHERE id = ?');
      const node = stmt.get(nodeId) as any;
      if (!node) {
        return NextResponse.json(
          { success: false, error: `Node ${nodeId} not found` },
          { status: 404 }
        );
      }

      contextLines = [
        `Focused Node: [NODE:${node.id}:"${node.title}"]`,
        node.description ? `Description: ${node.description}` : null,
        node.content ? `Content: ${node.content}` : null,
        node.link ? `Link: ${node.link}` : null,
      ].filter(Boolean) as string[];
    }

    if (userContext) {
      contextLines.push(`User Context: ${userContext}`);
    }

    // Add auto-context summaries
    const autoContextSummaries = getAutoContextSummaries(6);
    if (autoContextSummaries.length > 0) {
      contextLines.push('Background Context (Top Hubs):');
      autoContextSummaries.forEach((summary) => {
        contextLines.push(
          `[NODE:${summary.id}:"${summary.title}"] (${summary.edgeCount} edges)`
        );
      });
    }

    const task = `Execute workflow: ${workflow.displayName}

${workflow.instructions}

${nodeId ? `Target Node ID: ${nodeId}` : 'No specific node targeted (general workflow)'}`;

    // Create delegation
    const delegation = AgentDelegationService.createDelegation({
      task,
      context: contextLines,
      expectedOutcome: workflow.expectedOutcome,
      agentType: 'wise-rah',
      supabaseToken: null,
    });

    // Fire-and-forget execution
    void WiseRAHExecutor.execute({
      sessionId: delegation.sessionId,
      task,
      context: contextLines,
      expectedOutcome: workflow.expectedOutcome,
      workflowKey,
      workflowNodeId: nodeId,
    }).catch((error) => {
      console.error('[/api/workflows/execute] Execution failed:', error);
    });

    return NextResponse.json({
      success: true,
      delegationId: delegation.sessionId,
      workflowKey,
      nodeId: nodeId || null,
      status: 'executing',
      message: `Workflow '${workflow.displayName}' started`,
    });
  } catch (error) {
    console.error('Error executing workflow:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to execute workflow' },
      { status: 500 }
    );
  }
}
