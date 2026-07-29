import type { FieldColorModeId } from '@grafana/data';

export const OPTIONS_SCHEMA_VERSION = 1;

export type DataMode = 'auto' | 'edges' | 'paths';
export type Aggregation = 'sum' | 'mean' | 'max' | 'last' | 'lastNotNull';
export type LayoutDirection = 'left-to-right' | 'right-to-left' | 'top-to-bottom';
export type NodeAlignment = 'justify' | 'left' | 'right' | 'center';
export type SortMode = 'auto' | 'name' | 'value' | 'input';
export type RendererMode = 'auto' | 'svg' | 'hybrid';
export type TimeMode = 'snapshot' | 'playback';

export interface EdgeFieldMapping {
  source?: string;
  target?: string;
  value?: string;
  time?: string;
  nodeGroup?: string;
  linkGroup?: string;
  label?: string;
  tooltipFields: string[];
}

export interface PathFieldMapping {
  stages: string[];
  value?: string;
  time?: string;
  tooltipFields: string[];
  scopeNodesByStage: boolean;
}

export interface LayoutOptions {
  direction: LayoutDirection;
  alignment: NodeAlignment;
  sort: SortMode;
  nodeWidth: number;
  nodePadding: number;
  iterations: number;
  enableCircular: boolean;
  circularLinkGap: number;
}

export interface DisplayOptions {
  showLabels: boolean;
  showValues: boolean;
  showPercentages: boolean;
  showStageHeaders: boolean;
  linkOpacity: number;
  dimOpacity: number;
  colorMode: FieldColorModeId | 'categorical' | 'source' | 'target' | 'fixed';
  fixedColor: string;
  usePatterns: boolean;
}

export interface InteractionOptions {
  highlightPath: boolean;
  enableSelection: boolean;
  enableSearch: boolean;
  enableCopy: boolean;
  minimumValue: number;
  topN: number;
}

export interface PlaybackOptions {
  mode: TimeMode;
  bucketSizeMs: number;
  speed: number;
  loop: boolean;
  autoplay: boolean;
  maxFrames: number;
}

export interface PerformanceOptions {
  renderer: RendererMode;
  hybridLinkThreshold: number;
  maxNodes: number;
  maxLinks: number;
}

export interface AccessibilityOptions {
  showAccessibleTable: boolean;
  highContrast: boolean;
  reduceMotion: 'system' | 'always' | 'never';
}

export interface SankeyFlowOptions {
  schemaVersion: number;
  dataMode: DataMode;
  aggregation: Aggregation;
  edgeFields: EdgeFieldMapping;
  pathFields: PathFieldMapping;
  layout: LayoutOptions;
  display: DisplayOptions;
  interaction: InteractionOptions;
  playback: PlaybackOptions;
  performance: PerformanceOptions;
  accessibility: AccessibilityOptions;
}

export const defaultOptions: SankeyFlowOptions = {
  schemaVersion: OPTIONS_SCHEMA_VERSION,
  dataMode: 'auto',
  aggregation: 'sum',
  edgeFields: {
    tooltipFields: [],
  },
  pathFields: {
    stages: [],
    tooltipFields: [],
    scopeNodesByStage: true,
  },
  layout: {
    direction: 'left-to-right',
    alignment: 'justify',
    sort: 'auto',
    nodeWidth: 18,
    nodePadding: 12,
    iterations: 32,
    enableCircular: true,
    circularLinkGap: 4,
  },
  display: {
    showLabels: true,
    showValues: true,
    showPercentages: false,
    showStageHeaders: true,
    linkOpacity: 0.38,
    dimOpacity: 0.08,
    colorMode: 'categorical',
    fixedColor: 'blue',
    usePatterns: false,
  },
  interaction: {
    highlightPath: true,
    enableSelection: true,
    enableSearch: true,
    enableCopy: true,
    minimumValue: 0,
    topN: 0,
  },
  playback: {
    mode: 'snapshot',
    bucketSizeMs: 60_000,
    speed: 1,
    loop: false,
    autoplay: false,
    maxFrames: 300,
  },
  performance: {
    renderer: 'auto',
    hybridLinkThreshold: 1_000,
    maxNodes: 500,
    maxLinks: 5_000,
  },
  accessibility: {
    showAccessibleTable: false,
    highContrast: false,
    reduceMotion: 'system',
  },
};
