import React from 'react';
import { Node } from '@/types/database';
import type { AgentDelegation } from '@/services/agents/delegation';

// The six pane types
export type PaneType = 'node' | 'chat' | 'workflows' | 'dimensions' | 'map' | 'views';

// State for each slot
export interface SlotState {
  type: PaneType;
  // NodePane state
  nodeTabs?: number[];
  activeNodeTab?: number | null;
  // DimensionsPane state
  selectedDimension?: string | null;
  viewMode?: 'grid' | 'list' | 'kanban';
}

// Actions panes can emit to the layout
export type PaneAction =
  | { type: 'open-node'; nodeId: number; targetSlot?: 'A' | 'B' }
  | { type: 'open-dimension'; dimension: string; targetSlot?: 'A' | 'B' }
  | { type: 'switch-pane-type'; paneType: PaneType }
  | { type: 'close-pane' };

// Common props for all panes
export interface BasePaneProps {
  slot: 'A' | 'B';
  isActive: boolean;
  onPaneAction?: (action: PaneAction) => void;
  onCollapse?: () => void;
  onSwapPanes?: () => void;
  tabBar?: React.ReactNode;
}

// NodePane specific props
export interface NodePaneProps extends BasePaneProps {
  openTabs: number[];
  activeTab: number | null;
  onTabSelect: (nodeId: number) => void;
  onTabClose: (nodeId: number) => void;
  onNodeClick?: (nodeId: number) => void;
  onReorderTabs?: (fromIndex: number, toIndex: number) => void;
  refreshTrigger?: number;
  onOpenInOtherSlot?: (nodeId: number) => void;
  onTextSelect?: (nodeId: number, nodeTitle: string, text: string) => void;
  highlightedPassage?: HighlightedPassage | null;
}

// Highlighted passage for source awareness
export interface HighlightedPassage {
  nodeId: number;
  nodeTitle: string;
  selectedText: string;
}

// ChatPane specific props
export interface ChatPaneProps extends BasePaneProps {
  openTabsData: Node[];
  activeTabId: number | null;
  activeDimension?: string | null;
  onClearDimension?: () => void;
  onNodeClick?: (nodeId: number) => void;
  delegations: AgentDelegation[];
  // Lifted state for persistence
  chatMessages?: unknown[];
  setChatMessages?: React.Dispatch<React.SetStateAction<unknown[]>>;
  // Source awareness
  highlightedPassage?: HighlightedPassage | null;
  onClearPassage?: () => void;
}

// WorkflowsPane specific props
export interface WorkflowsPaneProps extends BasePaneProps {
  delegations: AgentDelegation[];
  onNodeClick?: (nodeId: number) => void;
  openTabsData?: Node[];
  activeTabId?: number | null;
  activeDimension?: string | null;
}

// DimensionsPane specific props
export interface DimensionsPaneProps extends BasePaneProps {
  onNodeOpen: (nodeId: number) => void;
  refreshToken: number;
  onDataChanged?: () => void;
  onDimensionSelect?: (dimensionName: string | null) => void;
}

// MapPane specific props
export interface MapPaneProps extends BasePaneProps {
  onNodeClick?: (nodeId: number) => void;
  activeTabId?: number | null;
}

// ViewsPane specific props
export interface ViewsPaneProps extends BasePaneProps {
  onNodeClick: (nodeId: number) => void;
  onNodeOpenInOtherPane?: (nodeId: number) => void;
  refreshToken?: number;
}

// Pane header props
export interface PaneHeaderProps {
  slot?: 'A' | 'B';
  onCollapse?: () => void;
  onSwapPanes?: () => void;
  tabBar?: React.ReactNode;
  children?: React.ReactNode;
}

// Labels for pane types
export const PANE_LABELS: Record<PaneType, string> = {
  node: 'Nodes',
  chat: 'Chat',
  workflows: 'Workflows',
  dimensions: 'Dimensions',
  map: 'Map',
  views: 'Feed',
};

// Default slot states
export const DEFAULT_SLOT_A: SlotState = {
  type: 'node',
  nodeTabs: [],
  activeNodeTab: null,
};

export const DEFAULT_SLOT_B: SlotState = {
  type: 'chat',
};
