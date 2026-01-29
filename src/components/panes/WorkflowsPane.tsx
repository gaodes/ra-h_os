"use client";

import { useState } from 'react';
import PaneHeader from './PaneHeader';
import { WorkflowsPaneProps, AgentDelegation } from './types';

export default function WorkflowsPane({
  slot,
  isActive,
  onPaneAction,
  onCollapse,
  onSwapPanes,
  delegations,
  onNodeClick,
  openTabsData = [],
  activeTabId = null,
  activeDimension,
}: WorkflowsPaneProps) {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'transparent',
      overflow: 'hidden',
    }}>
      <PaneHeader slot={slot} onCollapse={onCollapse} onSwapPanes={onSwapPanes} />

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <WorkflowsListView />
      </div>
    </div>
  );
}

// Workflows list view - simplified for rah-light (delegation system removed)
function WorkflowsListView() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'transparent',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span style={{
          color: '#e5e5e5',
          fontSize: '13px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em'
        }}>
          Workflows
        </span>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px'
      }}>
        <div style={{
          color: '#666',
          fontSize: '12px',
          textAlign: 'center',
          padding: '40px 20px',
          maxWidth: '300px'
        }}>
          <p style={{ marginBottom: '16px' }}>
            Workflows are available via MCP server integration.
          </p>
          <p style={{ color: '#555', fontSize: '11px' }}>
            Connect your coding agent (Claude Code, Cursor, etc.) via MCP to run workflows like Integrate, Extract, and more.
          </p>
        </div>
      </div>
    </div>
  );
}
