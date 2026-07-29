import type { PanelMigrationHandler } from '@grafana/data';
import {
  defaultOptions,
  OPTIONS_SCHEMA_VERSION,
  SUPPORTED_COLOR_MODES,
  type AccessibilityOptions,
  type Aggregation,
  type DataMode,
  type DisplayOptions,
  type EdgeFieldMapping,
  type InteractionOptions,
  type LayoutOptions,
  type PathFieldMapping,
  type PerformanceOptions,
  type PlaybackOptions,
  type SankeyFlowOptions,
  type TimeMode,
} from './types';

type UnknownRecord = Record<string, unknown>;

const dataModes = ['auto', 'edges', 'paths'] as const satisfies readonly DataMode[];
const aggregations = ['sum', 'mean', 'max', 'last', 'lastNotNull'] as const satisfies readonly Aggregation[];
const directions = ['left-to-right', 'right-to-left', 'top-to-bottom'] as const;
const alignments = ['justify', 'left', 'right', 'center'] as const;
const sortModes = ['auto', 'name', 'value', 'input'] as const;
const timeModes = ['snapshot', 'playback'] as const satisfies readonly TimeMode[];
const renderers = ['auto', 'svg', 'hybrid'] as const;
const reduceMotionModes = ['system', 'always', 'never'] as const;
function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function recordValue(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function pickValue(root: UnknownRecord, nested: UnknownRecord, key: string, aliases: readonly string[] = []): unknown {
  if (hasOwn(nested, key)) {
    return nested[key];
  }

  if (hasOwn(root, key)) {
    return root[key];
  }

  for (const alias of aliases) {
    if (hasOwn(root, alias)) {
      return root[alias];
    }
  }

  return undefined;
}

function enumValue<T extends string>(value: unknown, validValues: readonly T[], fallback: T): T {
  return typeof value === 'string' && validValues.includes(value as T) ? (value as T) : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function optionalStringValue(value: unknown, fallback: string | undefined): string | undefined {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : fallback;
}

function stringArrayValue(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function colorModeValue(value: unknown): DisplayOptions['colorMode'] {
  return enumValue(value, SUPPORTED_COLOR_MODES, defaultOptions.display.colorMode);
}

function migrateEdgeFields(root: UnknownRecord): EdgeFieldMapping {
  const nested = recordValue(root.edgeFields);
  const fields: EdgeFieldMapping = {};
  const source = optionalStringValue(
    pickValue(root, nested, 'source', ['sourceField']),
    defaultOptions.edgeFields.source
  );
  const target = optionalStringValue(
    pickValue(root, nested, 'target', ['targetField']),
    defaultOptions.edgeFields.target
  );
  const value = optionalStringValue(pickValue(root, nested, 'value', ['valueField']), defaultOptions.edgeFields.value);
  const time = optionalStringValue(pickValue(root, nested, 'time', ['timeField']), defaultOptions.edgeFields.time);
  const nodeGroup = optionalStringValue(
    pickValue(root, nested, 'nodeGroup', ['nodeGroupField']),
    defaultOptions.edgeFields.nodeGroup
  );
  const linkGroup = optionalStringValue(
    pickValue(root, nested, 'linkGroup', ['linkGroupField']),
    defaultOptions.edgeFields.linkGroup
  );
  const label = optionalStringValue(pickValue(root, nested, 'label', ['labelField']), defaultOptions.edgeFields.label);

  if (source !== undefined) {
    fields.source = source;
  }
  if (target !== undefined) {
    fields.target = target;
  }
  if (value !== undefined) {
    fields.value = value;
  }
  if (time !== undefined) {
    fields.time = time;
  }
  if (nodeGroup !== undefined) {
    fields.nodeGroup = nodeGroup;
  }
  if (linkGroup !== undefined) {
    fields.linkGroup = linkGroup;
  }
  if (label !== undefined) {
    fields.label = label;
  }

  return fields;
}

function migratePathFields(root: UnknownRecord): PathFieldMapping {
  const nested = recordValue(root.pathFields);
  const fields: PathFieldMapping = {
    stages: stringArrayValue(
      pickValue(root, nested, 'stages', ['stageFields', 'pathStages']),
      defaultOptions.pathFields.stages
    ),
    scopeNodesByStage: booleanValue(
      pickValue(root, nested, 'scopeNodesByStage', ['scopePathNodesByStage']),
      defaultOptions.pathFields.scopeNodesByStage
    ),
  };
  const value = optionalStringValue(
    pickValue(root, nested, 'value', ['pathValueField']),
    defaultOptions.pathFields.value
  );
  const time = optionalStringValue(pickValue(root, nested, 'time', ['pathTimeField']), defaultOptions.pathFields.time);

  if (value !== undefined) {
    fields.value = value;
  }
  if (time !== undefined) {
    fields.time = time;
  }

  return fields;
}

function migrateLayout(root: UnknownRecord): LayoutOptions {
  const nested = recordValue(root.layout);

  return {
    direction: enumValue(
      pickValue(root, nested, 'direction', ['layoutDirection']),
      directions,
      defaultOptions.layout.direction
    ),
    alignment: enumValue(
      pickValue(root, nested, 'alignment', ['nodeAlignment']),
      alignments,
      defaultOptions.layout.alignment
    ),
    sort: enumValue(pickValue(root, nested, 'sort', ['sortMode', 'nodeSort']), sortModes, defaultOptions.layout.sort),
    nodeWidth: numberValue(pickValue(root, nested, 'nodeWidth'), defaultOptions.layout.nodeWidth, 1, 100),
    nodePadding: numberValue(pickValue(root, nested, 'nodePadding'), defaultOptions.layout.nodePadding, 0, 100),
    iterations: numberValue(
      pickValue(root, nested, 'iterations', ['layoutIterations']),
      defaultOptions.layout.iterations,
      1,
      200
    ),
    enableCircular: booleanValue(pickValue(root, nested, 'enableCircular'), defaultOptions.layout.enableCircular),
    circularLinkGap: numberValue(
      pickValue(root, nested, 'circularLinkGap'),
      defaultOptions.layout.circularLinkGap,
      0,
      50
    ),
  };
}

function migrateDisplay(root: UnknownRecord): DisplayOptions {
  const nested = recordValue(root.display);

  return {
    showLabels: booleanValue(pickValue(root, nested, 'showLabels'), defaultOptions.display.showLabels),
    showValues: booleanValue(pickValue(root, nested, 'showValues'), defaultOptions.display.showValues),
    showPercentages: booleanValue(pickValue(root, nested, 'showPercentages'), defaultOptions.display.showPercentages),
    showStageHeaders: booleanValue(
      pickValue(root, nested, 'showStageHeaders'),
      defaultOptions.display.showStageHeaders
    ),
    linkOpacity: numberValue(pickValue(root, nested, 'linkOpacity'), defaultOptions.display.linkOpacity, 0, 1),
    dimOpacity: numberValue(pickValue(root, nested, 'dimOpacity'), defaultOptions.display.dimOpacity, 0, 1),
    colorMode: colorModeValue(pickValue(root, nested, 'colorMode')),
    fixedColor: stringValue(pickValue(root, nested, 'fixedColor'), defaultOptions.display.fixedColor),
    usePatterns: booleanValue(pickValue(root, nested, 'usePatterns'), defaultOptions.display.usePatterns),
  };
}

function migrateInteraction(root: UnknownRecord): InteractionOptions {
  const nested = recordValue(root.interaction);

  return {
    highlightPath: booleanValue(pickValue(root, nested, 'highlightPath'), defaultOptions.interaction.highlightPath),
    enableSelection: booleanValue(
      pickValue(root, nested, 'enableSelection'),
      defaultOptions.interaction.enableSelection
    ),
    enableSearch: booleanValue(pickValue(root, nested, 'enableSearch'), defaultOptions.interaction.enableSearch),
    enableCopy: booleanValue(pickValue(root, nested, 'enableCopy'), defaultOptions.interaction.enableCopy),
    minimumValue: numberValue(
      pickValue(root, nested, 'minimumValue', ['minValue']),
      defaultOptions.interaction.minimumValue,
      0,
      1_000_000_000_000
    ),
    topN: numberValue(pickValue(root, nested, 'topN'), defaultOptions.interaction.topN, 0, 10_000),
  };
}

function migratePlayback(root: UnknownRecord): PlaybackOptions {
  const nested = recordValue(root.playback);

  return {
    mode: enumValue(pickValue(root, nested, 'mode', ['timeMode']), timeModes, defaultOptions.playback.mode),
    bucketSizeMs: numberValue(
      pickValue(root, nested, 'bucketSizeMs', ['timeBucketMs']),
      defaultOptions.playback.bucketSizeMs,
      1_000,
      86_400_000
    ),
    speed: numberValue(pickValue(root, nested, 'speed', ['playbackSpeed']), defaultOptions.playback.speed, 0.1, 10),
    loop: booleanValue(pickValue(root, nested, 'loop'), defaultOptions.playback.loop),
    autoplay: booleanValue(pickValue(root, nested, 'autoplay'), defaultOptions.playback.autoplay),
    maxFrames: numberValue(pickValue(root, nested, 'maxFrames'), defaultOptions.playback.maxFrames, 1, 10_000),
  };
}

function migratePerformance(root: UnknownRecord): PerformanceOptions {
  const nested = recordValue(root.performance);

  return {
    renderer: enumValue(pickValue(root, nested, 'renderer'), renderers, defaultOptions.performance.renderer),
    hybridLinkThreshold: numberValue(
      pickValue(root, nested, 'hybridLinkThreshold'),
      defaultOptions.performance.hybridLinkThreshold,
      1,
      1_000_000
    ),
    maxNodes: numberValue(pickValue(root, nested, 'maxNodes'), defaultOptions.performance.maxNodes, 1, 100_000),
    maxLinks: numberValue(pickValue(root, nested, 'maxLinks'), defaultOptions.performance.maxLinks, 1, 1_000_000),
  };
}

function migrateAccessibility(root: UnknownRecord): AccessibilityOptions {
  const nested = recordValue(root.accessibility);

  return {
    showAccessibleTable: booleanValue(
      pickValue(root, nested, 'showAccessibleTable'),
      defaultOptions.accessibility.showAccessibleTable
    ),
    highContrast: booleanValue(pickValue(root, nested, 'highContrast'), defaultOptions.accessibility.highContrast),
    reduceMotion: enumValue(
      pickValue(root, nested, 'reduceMotion'),
      reduceMotionModes,
      defaultOptions.accessibility.reduceMotion
    ),
  };
}

/**
 * Converts dashboard-stored options into the current, fully-populated schema.
 * Unknown keys are deliberately omitted so future or malformed settings cannot
 * leak into the panel runtime.
 */
export function migrateSankeyFlowOptions(savedOptions: unknown): SankeyFlowOptions {
  const root = recordValue(savedOptions);

  return {
    schemaVersion: OPTIONS_SCHEMA_VERSION,
    dataMode: enumValue(pickValue(root, {}, 'dataMode', ['mode']), dataModes, defaultOptions.dataMode),
    aggregation: enumValue(root.aggregation, aggregations, defaultOptions.aggregation),
    edgeFields: migrateEdgeFields(root),
    pathFields: migratePathFields(root),
    layout: migrateLayout(root),
    display: migrateDisplay(root),
    interaction: migrateInteraction(root),
    playback: migratePlayback(root),
    performance: migratePerformance(root),
    accessibility: migrateAccessibility(root),
  };
}

export const migrationHandler: PanelMigrationHandler<SankeyFlowOptions> = (panel) =>
  migrateSankeyFlowOptions(panel.options);
