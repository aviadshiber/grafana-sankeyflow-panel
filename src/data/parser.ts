import { FieldType, type DataFrame, type Field } from '@grafana/data';
import type { Aggregation, SankeyFlowOptions } from '../types';
import type {
  GraphDiagnostic,
  NormalizedEdge,
  ParsedPanelData,
  ParseContext,
  RowProvenance,
  SankeyGraph,
  SankeyGraphLink,
  SankeyGraphNode,
} from './model';

type FieldRole = 'source' | 'target' | 'value' | 'time' | 'nodeGroup' | 'linkGroup' | 'label';
type Value = unknown;

const EDGE_ALIASES: Record<FieldRole, string[]> = {
  source: ['source', 'src', 'from', 'origin', 'start'],
  target: ['target', 'dst', 'dest', 'destination', 'to', 'end'],
  value: ['value', 'weight', 'count', 'amount', 'metric', 'size'],
  time: ['time', 'timestamp', 'date', 'datetime', 'ts'],
  nodeGroup: ['nodegroup', 'node_group', 'group', 'category'],
  linkGroup: ['linkgroup', 'link_group', 'edgegroup', 'edge_group'],
  label: ['label', 'linklabel', 'link_label', 'name'],
};

const nodeKey = (name: string, stage: number | undefined, scoped: boolean) =>
  scoped && stage !== undefined ? `${stage}\u0000${name}` : name;

const vectorValue = (field: Field, index: number): Value => {
  const values = field.values as unknown as { get?: (i: number) => Value; [index: number]: Value } | undefined;
  return values?.get ? values.get(index) : values?.[index];
};

const frameLength = (frame: DataFrame) => Math.max(0, ...frame.fields.map((field) => field.values?.length ?? 0));
const normalizedName = (name: string) => name.trim().toLowerCase().replace(/[\s-]+/g, '_');
const text = (value: Value): string | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }
  const result = String(value).trim();
  return result === '' ? undefined : result;
};
const number = (value: Value): number | undefined => {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  const result = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(result) ? result : undefined;
};
const timestamp = (value: Value): number | undefined => {
  const numeric = number(value);
  if (numeric !== undefined) {
    return numeric;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

function diagnostic(
  diagnostics: GraphDiagnostic[],
  code: GraphDiagnostic['code'],
  severity: GraphDiagnostic['severity'],
  message: string,
  frame: DataFrame | undefined,
  rowIndex?: number
) {
  diagnostics.push({ code, severity, message, frameRefId: frame?.refId, rowIndex });
}

function fieldByName(frame: DataFrame, name: string | undefined): Field | undefined {
  if (!name) {
    return undefined;
  }
  const wanted = normalizedName(name);
  return frame.fields.find((field) => normalizedName(field.name) === wanted);
}

function detectField(frame: DataFrame, role: FieldRole, configured?: string): Field | undefined {
  if (configured) {
    return fieldByName(frame, configured);
  }
  const aliases = EDGE_ALIASES[role];
  return frame.fields.find((field) => aliases.includes(normalizedName(field.name)));
}

function rowValues(frame: DataFrame, index: number): Record<string, Value> {
  return Object.fromEntries(frame.fields.map((field) => [field.name, vectorValue(field, index)]));
}

function provenance(frame: DataFrame, index: number): RowProvenance {
  return { frameRefId: frame.refId, frameName: frame.name, rowIndex: index, values: rowValues(frame, index) };
}

function configuredMode(options: SankeyFlowOptions, frames: DataFrame[]): 'edges' | 'paths' {
  if (options.dataMode !== 'auto') {
    return options.dataMode;
  }
  if (options.pathFields.stages.length >= 2) {
    return 'paths';
  }
  return frames.some((frame) => detectField(frame, 'source') && detectField(frame, 'target')) ? 'edges' : 'paths';
}

function parseEdges(frames: DataFrame[], options: SankeyFlowOptions, diagnostics: GraphDiagnostic[]): NormalizedEdge[] {
  const edges: NormalizedEdge[] = [];
  for (const frame of frames) {
    const fields = {
      source: detectField(frame, 'source', options.edgeFields.source),
      target: detectField(frame, 'target', options.edgeFields.target),
      value: detectField(frame, 'value', options.edgeFields.value),
      time: detectField(frame, 'time', options.edgeFields.time),
      nodeGroup: detectField(frame, 'nodeGroup', options.edgeFields.nodeGroup),
      linkGroup: detectField(frame, 'linkGroup', options.edgeFields.linkGroup),
      label: detectField(frame, 'label', options.edgeFields.label),
    };
    for (const role of ['source', 'target', 'value'] as const) {
      if (!fields[role]) {
        diagnostic(diagnostics, 'missing-field', 'error', `Missing ${role} field in frame '${frame.name ?? frame.refId ?? 'unnamed'}'.`, frame);
      }
    }
    if (!fields.source || !fields.target || !fields.value) {
      continue;
    }
    for (let rowIndex = 0; rowIndex < frameLength(frame); rowIndex++) {
      const source = text(vectorValue(fields.source, rowIndex));
      const target = text(vectorValue(fields.target, rowIndex));
      const value = number(vectorValue(fields.value, rowIndex));
      if (!source || !target) {
        diagnostic(diagnostics, 'invalid-row', 'warning', 'Source and target must be non-empty.', frame, rowIndex);
        continue;
      }
      if (value === undefined) {
        diagnostic(diagnostics, 'invalid-value', 'warning', 'Value must be a finite number.', frame, rowIndex);
        continue;
      }
      if (value < 0) {
        diagnostic(diagnostics, 'negative-value', 'warning', 'Negative link values are ignored.', frame, rowIndex);
        continue;
      }
      if (source === target) {
        diagnostic(diagnostics, 'self-link', 'warning', 'Self-links are ignored.', frame, rowIndex);
        continue;
      }
      const rawTime = fields.time ? vectorValue(fields.time, rowIndex) : undefined;
      const parsedTime = fields.time ? timestamp(rawTime) : undefined;
      if (fields.time && rawTime !== null && rawTime !== undefined && parsedTime === undefined) {
        diagnostic(diagnostics, 'invalid-value', 'warning', 'Time must be a valid timestamp.', frame, rowIndex);
      }
      edges.push({
        source,
        target,
        value,
        time: parsedTime,
        nodeGroup: fields.nodeGroup ? text(vectorValue(fields.nodeGroup, rowIndex)) : undefined,
        linkGroup: fields.linkGroup ? text(vectorValue(fields.linkGroup, rowIndex)) : undefined,
        label: fields.label ? text(vectorValue(fields.label, rowIndex)) : undefined,
        provenance: provenance(frame, rowIndex),
      });
    }
  }
  return edges;
}

function inferStages(frame: DataFrame, options: SankeyFlowOptions): Field[] {
  if (options.pathFields.stages.length) {
    return options.pathFields.stages.map((name) => fieldByName(frame, name)).filter((field): field is Field => !!field);
  }
  const reserved = new Set([
    options.pathFields.value,
    options.pathFields.time,
    ...options.pathFields.tooltipFields,
  ].filter(Boolean).map((name) => normalizedName(name!)));
  return frame.fields.filter((field) => {
    const name = normalizedName(field.name);
    return !reserved.has(name) && field.type !== FieldType.number && field.type !== FieldType.time;
  });
}

function parsePaths(frames: DataFrame[], options: SankeyFlowOptions, diagnostics: GraphDiagnostic[]): NormalizedEdge[] {
  const edges: NormalizedEdge[] = [];
  for (const frame of frames) {
    const stages = inferStages(frame, options);
    const valueField = detectField(frame, 'value', options.pathFields.value);
    const timeField = detectField(frame, 'time', options.pathFields.time);
    if (stages.length < 2) {
      diagnostic(diagnostics, 'missing-field', 'error', 'Path mode requires at least two stage fields.', frame);
      continue;
    }
    if (!valueField) {
      diagnostic(diagnostics, 'missing-field', 'error', `Missing value field in frame '${frame.name ?? frame.refId ?? 'unnamed'}'.`, frame);
      continue;
    }
    for (let rowIndex = 0; rowIndex < frameLength(frame); rowIndex++) {
      const value = number(vectorValue(valueField, rowIndex));
      if (value === undefined) {
        diagnostic(diagnostics, 'invalid-value', 'warning', 'Value must be a finite number.', frame, rowIndex);
        continue;
      }
      if (value < 0) {
        diagnostic(diagnostics, 'negative-value', 'warning', 'Negative link values are ignored.', frame, rowIndex);
        continue;
      }
      const present = stages
        .map((field, stage) => ({ name: text(vectorValue(field, rowIndex)), stage }))
        .filter((entry): entry is { name: string; stage: number } => !!entry.name);
      if (present.length < 2) {
        diagnostic(diagnostics, 'invalid-row', 'warning', 'A path needs at least two non-empty stages.', frame, rowIndex);
        continue;
      }
      const rawTime = timeField ? vectorValue(timeField, rowIndex) : undefined;
      const parsedTime = timeField ? timestamp(rawTime) : undefined;
      if (timeField && rawTime !== null && rawTime !== undefined && parsedTime === undefined) {
        diagnostic(diagnostics, 'invalid-value', 'warning', 'Time must be a valid timestamp.', frame, rowIndex);
      }
      for (let index = 1; index < present.length; index++) {
        const previous = present[index - 1];
        const current = present[index];
        if (previous.name === current.name && previous.stage === current.stage) {
          continue;
        }
        edges.push({
          source: previous.name,
          target: current.name,
          value,
          sourceStage: previous.stage,
          targetStage: current.stage,
          time: parsedTime,
          provenance: provenance(frame, rowIndex),
        });
      }
    }
  }
  return edges;
}

function aggregate(values: NormalizedEdge[], aggregation: Aggregation): number {
  if (aggregation === 'max') {return Math.max(...values.map((edge) => edge.value));}
  if (aggregation === 'mean') {return values.reduce((sum, edge) => sum + edge.value, 0) / values.length;}
  if (aggregation === 'last' || aggregation === 'lastNotNull') {return values[values.length - 1].value;}
  return values.reduce((sum, edge) => sum + edge.value, 0);
}

function hasCycle(links: SankeyGraphLink[]): boolean {
  const graph = new Map<string, string[]>();
  for (const link of links) {graph.set(link.source, [...(graph.get(link.source) ?? []), link.target]);}
  const active = new Set<string>();
  const seen = new Set<string>();
  const visit = (node: string): boolean => {
    if (active.has(node)) {return true;}
    if (seen.has(node)) {return false;}
    seen.add(node); active.add(node);
    const cycle = (graph.get(node) ?? []).some(visit);
    active.delete(node);
    return cycle;
  };
  return [...graph.keys()].some(visit);
}

/** Builds a stable graph from normalized edges. Exported for renderer-side reuse and focused tests. */
export function buildGraph(edges: NormalizedEdge[], options: SankeyFlowOptions, initialDiagnostics: GraphDiagnostic[] = []): SankeyGraph {
  const diagnostics = [...initialDiagnostics];
  const scoped = options.pathFields.scopeNodesByStage;
  const filtered = edges.filter((edge) => edge.value >= options.interaction.minimumValue);
  const groups = new Map<string, NormalizedEdge[]>();
  for (const edge of filtered) {
    const source = nodeKey(edge.source, edge.sourceStage, scoped);
    const target = nodeKey(edge.target, edge.targetStage, scoped);
    if (source === target) {
      diagnostic(
        diagnostics,
        'self-link',
        'warning',
        `The link '${edge.source}' to '${edge.target}' resolves to the same node and was ignored.`,
        undefined,
        edge.provenance.rowIndex
      );
      continue;
    }
    const key = [source, target, edge.linkGroup ?? '', edge.label ?? ''].join('\u0001');
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  let links = [...groups.entries()].map(([key, rows]): SankeyGraphLink => {
    const edge = rows[0];
    return {
      id: key,
      source: nodeKey(edge.source, edge.sourceStage, scoped),
      target: nodeKey(edge.target, edge.targetStage, scoped),
      value: aggregate(rows, options.aggregation),
      group: edge.linkGroup,
      label: edge.label,
      rows: rows.map((row) => row.provenance),
    };
  });
  if (options.interaction.topN > 0 && links.length > options.interaction.topN) {
    links = links.sort((a, b) => b.value - a.value).slice(0, options.interaction.topN);
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited links to top ${options.interaction.topN}.`, undefined);
  }
  if (links.length > options.performance.maxLinks) {
    links = links.slice(0, options.performance.maxLinks);
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited links to ${options.performance.maxLinks}.`, undefined);
  }
  const details = new Map<string, { name: string; stage?: number; group?: string }>();
  for (const edge of filtered) {
    details.set(nodeKey(edge.source, edge.sourceStage, scoped), {
      name: edge.source,
      stage: scoped ? edge.sourceStage : undefined,
      group: edge.nodeGroup,
    });
    details.set(nodeKey(edge.target, edge.targetStage, scoped), {
      name: edge.target,
      stage: scoped ? edge.targetStage : undefined,
      group: edge.nodeGroup,
    });
  }
  let nodes = [...new Set(links.flatMap((link) => [link.source, link.target]))].map((id): SankeyGraphNode => ({
    id, name: details.get(id)?.name ?? id, stage: details.get(id)?.stage, group: details.get(id)?.group,
    value: 0, incoming: [], outgoing: [],
  }));
  if (nodes.length > options.performance.maxNodes) {
    const kept = new Set(nodes.slice(0, options.performance.maxNodes).map((node) => node.id));
    nodes = nodes.slice(0, options.performance.maxNodes);
    links = links.filter((link) => kept.has(link.source) && kept.has(link.target));
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited nodes to ${options.performance.maxNodes}.`, undefined);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const linksById = new Map(links.map((link) => [link.id, link]));
  for (const link of links) {
    const source = byId.get(link.source); const target = byId.get(link.target);
    if (source) {source.outgoing.push(link.id);}
    if (target) {target.incoming.push(link.id);}
  }
  for (const node of nodes) {
    const incoming = node.incoming.reduce((sum, id) => sum + (linksById.get(id)?.value ?? 0), 0);
    const outgoing = node.outgoing.reduce((sum, id) => sum + (linksById.get(id)?.value ?? 0), 0);
    node.value = Math.max(incoming, outgoing);
  }
  const cyclic = hasCycle(links);
  if (cyclic) {diagnostic(diagnostics, 'cycle', 'warning', 'The graph contains a cycle.', undefined);}
  if (!links.length) {diagnostic(diagnostics, 'no-data', 'info', 'No valid Sankey links were found.', undefined);}
  return { nodes, links, total: links.reduce((sum, link) => sum + link.value, 0), diagnostics, cyclic };
}

function playbackFrames(edges: NormalizedEdge[], options: SankeyFlowOptions, diagnostics: GraphDiagnostic[]): ParsedPanelData['frames'] {
  const bucketSize = Math.max(1, options.playback.bucketSizeMs);
  const buckets = new Map<number, NormalizedEdge[]>();
  for (const edge of edges) {
    if (edge.time === undefined) {continue;}
    const timestamp = Math.floor(edge.time / bucketSize) * bucketSize;
    buckets.set(timestamp, [...(buckets.get(timestamp) ?? []), edge]);
  }
  let frames = [...buckets.entries()].sort(([a], [b]) => a - b).map(([timestamp, bucket]) => ({
    timestamp,
    graph: buildGraph(bucket, options, diagnostics),
  }));
  if (frames.length > options.playback.maxFrames) {
    frames = frames.slice(0, options.playback.maxFrames);
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited playback to ${options.playback.maxFrames} frames.`, undefined);
  }
  return frames;
}

/** Parse all Grafana DataFrames into a validated Sankey graph and optional playback buckets. */
export function parsePanelData(context: ParseContext): ParsedPanelData {
  const diagnostics: GraphDiagnostic[] = [];
  if (!context.frames.length) {
    diagnostic(diagnostics, 'missing-frame', 'error', 'No data frames were supplied.', undefined);
    return { graph: buildGraph([], context.options, diagnostics), frames: [], mode: configuredMode(context.options, []) };
  }
  const mode = configuredMode(context.options, context.frames);
  const edges = mode === 'edges' ? parseEdges(context.frames, context.options, diagnostics) : parsePaths(context.frames, context.options, diagnostics);
  const valueName = mode === 'edges' ? context.options.edgeFields.value : context.options.pathFields.value;
  const valueField = context.frames.map((frame) => detectField(frame, 'value', valueName)).find(Boolean) as Field<number> | undefined;
  const graph = buildGraph(edges, context.options, diagnostics);
  const frames = context.options.playback.mode === 'playback' ? playbackFrames(edges, context.options, diagnostics) : [];
  return { graph, frames, mode, valueField };
}

export const parseSankeyData = parsePanelData;
