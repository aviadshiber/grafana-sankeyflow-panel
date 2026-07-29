import type { DataFrame, Field, TimeRange } from '@grafana/data';
import type { SankeyFlowOptions } from '../types';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';
export type DiagnosticScope = 'global' | 'frame';

export interface GraphDiagnostic {
  code:
    | 'missing-frame'
    | 'missing-field'
    | 'invalid-row'
    | 'invalid-value'
    | 'negative-value'
    | 'self-link'
    | 'cycle'
    | 'limit-exceeded'
    | 'no-data';
  severity: DiagnosticSeverity;
  /** Global diagnostics describe parsed input; frame diagnostics describe one playback graph. */
  scope: DiagnosticScope;
  message: string;
  frameRefId?: string;
  rowIndex?: number;
}

export interface RowProvenance {
  frameRefId?: string;
  frameName?: string;
  rowIndex: number;
  values: Record<string, unknown>;
}

export interface NormalizedEdge {
  source: string;
  target: string;
  /** Undefined is retained only for the final null row of `last` aggregations. */
  value?: number;
  sourceStage?: number;
  targetStage?: number;
  time?: number;
  nodeGroup?: string;
  linkGroup?: string;
  label?: string;
  provenance: RowProvenance;
}

export interface SankeyGraphNode {
  id: string;
  name: string;
  stage?: number;
  group?: string;
  value: number;
  incoming: string[];
  outgoing: string[];
}

export interface SankeyGraphLink {
  id: string;
  source: string;
  target: string;
  value: number;
  group?: string;
  label?: string;
  rows: RowProvenance[];
}

export interface SankeyGraph {
  nodes: SankeyGraphNode[];
  links: SankeyGraphLink[];
  total: number;
  diagnostics: GraphDiagnostic[];
  cyclic: boolean;
}

export interface PlaybackFrame {
  timestamp: number;
  graph: SankeyGraph;
}

export interface ParsedPanelData {
  graph: SankeyGraph;
  frames: PlaybackFrame[];
  mode: 'edges' | 'paths';
  /** Grafana may represent numeric values as string fields, so do not promise a numeric Field here. */
  valueField?: Field;
}

export interface ParseContext {
  frames: DataFrame[];
  options: SankeyFlowOptions;
  timeRange?: TimeRange;
}
