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

/** Hard ceilings protect the panel from untrusted query results independently of panel options. */
const LIMITS = {
  frames: 50,
  fieldsPerFrame: 256,
  rowsPerFrame: 50_000,
  totalRows: 100_000,
  normalizedEdges: 50_000,
  provenanceFields: 16,
  provenanceRowsPerLink: 100,
  diagnostics: 1_000,
  playbackFrames: 300,
  renderLinks: 50_000,
  renderNodes: 50_000,
} as const;

const EDGE_ALIASES: Record<FieldRole, string[]> = {
  source: ['source', 'src', 'from', 'origin', 'start'],
  target: ['target', 'dst', 'dest', 'destination', 'to', 'end'],
  value: ['value', 'weight', 'count', 'amount', 'metric', 'size'],
  time: ['time', 'timestamp', 'date', 'datetime', 'ts'],
  nodeGroup: ['nodegroup', 'node_group', 'group', 'category'],
  linkGroup: ['linkgroup', 'link_group', 'edgegroup', 'edge_group'],
  label: ['label', 'linklabel', 'link_label', 'name'],
};

const diagnosticOverflows = new WeakSet<GraphDiagnostic[]>();

const nodeKey = (name: string, stage: number | undefined, scoped: boolean) =>
  scoped && stage !== undefined ? `${stage}\u0000${name}` : name;

const vectorValue = (field: Field, index: number): Value => {
  const values = field.values as unknown as { get?: (i: number) => Value; [index: number]: Value } | undefined;
  return values?.get ? values.get(index) : values?.[index];
};

const frameLength = (frame: DataFrame): number => {
  let length = 0;
  for (const field of frame.fields) {
    length = Math.max(length, field.values?.length ?? 0);
  }
  return length;
};
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
const isMissing = (value: Value) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
const isLastAggregation = (aggregation: Aggregation) => aggregation === 'last' || aggregation === 'lastNotNull';
const boundedOption = (value: number, hardLimit: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(Math.floor(value), hardLimit)) : hardLimit;

function diagnostic(
  diagnostics: GraphDiagnostic[],
  code: GraphDiagnostic['code'],
  severity: GraphDiagnostic['severity'],
  message: string,
  frame: DataFrame | undefined,
  rowIndex?: number,
  scope: GraphDiagnostic['scope'] = 'global'
) {
  if (diagnosticOverflows.has(diagnostics)) {
    return;
  }
  if (diagnostics.length >= LIMITS.diagnostics) {
    diagnosticOverflows.add(diagnostics);
    return;
  }
  if (diagnostics.length >= LIMITS.diagnostics - 1) {
    diagnostics.push({
      code: 'limit-exceeded',
      severity: 'warning',
      scope: 'global',
      message: `Stopped collecting diagnostics after ${LIMITS.diagnostics - 1} entries.`,
    });
    diagnosticOverflows.add(diagnostics);
    return;
  }
  diagnostics.push({ code, severity, scope, message, frameRefId: frame?.refId, rowIndex });
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

function provenance(frame: DataFrame, index: number, fields: Field[]): RowProvenance {
  const values: Record<string, Value> = {};
  for (const field of fields) {
    values[field.name] = vectorValue(field, index);
  }
  return { frameRefId: frame.refId, frameName: frame.name, rowIndex: index, values };
}

function provenanceFields(frame: DataFrame, preferred: Array<Field | undefined>, diagnostics: GraphDiagnostic[]): Field[] {
  const selected: Field[] = [];
  const add = (field: Field | undefined) => {
    if (field && !selected.includes(field) && selected.length < LIMITS.provenanceFields) {
      selected.push(field);
    }
  };
  preferred.forEach(add);
  for (const field of frame.fields) {
    add(field);
  }
  if (frame.fields.length > selected.length) {
    diagnostic(
      diagnostics,
      'limit-exceeded',
      'warning',
      `Limited retained provenance in frame '${frame.name ?? frame.refId ?? 'unnamed'}' to ${LIMITS.provenanceFields} fields.`,
      frame
    );
  }
  return selected;
}

function acceptedFrames(frames: DataFrame[], diagnostics: GraphDiagnostic[]): DataFrame[] {
  const accepted: DataFrame[] = [];
  const frameCount = Math.min(frames.length, LIMITS.frames);
  for (let index = 0; index < frameCount; index++) {
    const frame = frames[index];
    if (frame.fields.length > LIMITS.fieldsPerFrame) {
      diagnostic(
        diagnostics,
        'limit-exceeded',
        'warning',
        `Skipped frame '${frame.name ?? frame.refId ?? 'unnamed'}' because it has more than ${LIMITS.fieldsPerFrame} fields.`,
        frame
      );
      continue;
    }
    accepted.push(frame);
  }
  if (frames.length > LIMITS.frames) {
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited ingestion to ${LIMITS.frames} data frames.`, undefined);
  }
  return accepted;
}

interface IngestionBudget {
  remainingRows: number;
  edgeLimitReported: boolean;
}

function rowsToRead(frame: DataFrame, budget: IngestionBudget, diagnostics: GraphDiagnostic[]): number {
  if (budget.remainingRows <= 0) {
    return 0;
  }
  const length = frameLength(frame);
  const frameLimited = Math.min(length, LIMITS.rowsPerFrame);
  if (length > frameLimited) {
    diagnostic(
      diagnostics,
      'limit-exceeded',
      'warning',
      `Limited ingestion from frame '${frame.name ?? frame.refId ?? 'unnamed'}' to ${LIMITS.rowsPerFrame.toLocaleString('en-US')} rows.`,
      frame
    );
  }
  const allowed = Math.min(frameLimited, budget.remainingRows);
  if (allowed < frameLimited) {
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited total ingestion to ${LIMITS.totalRows} rows.`, frame);
  }
  budget.remainingRows -= allowed;
  return allowed;
}

function appendEdge(edges: NormalizedEdge[], edge: NormalizedEdge, budget: IngestionBudget, diagnostics: GraphDiagnostic[], frame: DataFrame): boolean {
  if (edges.length >= LIMITS.normalizedEdges) {
    if (!budget.edgeLimitReported) {
      diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited normalized input to ${LIMITS.normalizedEdges} links.`, frame);
      budget.edgeLimitReported = true;
    }
    return false;
  }
  edges.push(edge);
  return true;
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

function parseEdges(frames: DataFrame[], options: SankeyFlowOptions, diagnostics: GraphDiagnostic[], budget: IngestionBudget): NormalizedEdge[] {
  const edges: NormalizedEdge[] = [];
  for (const frame of frames) {
    if (budget.remainingRows <= 0 || budget.edgeLimitReported) {
      break;
    }
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
    const retainedFields = provenanceFields(frame, Object.values(fields), diagnostics);
    const rowCount = rowsToRead(frame, budget, diagnostics);
    for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
      const source = text(vectorValue(fields.source, rowIndex));
      const target = text(vectorValue(fields.target, rowIndex));
      const rawValue = vectorValue(fields.value, rowIndex);
      const value = number(rawValue);
      if (!source || !target) {
        diagnostic(diagnostics, 'invalid-row', 'warning', 'Source and target must be non-empty.', frame, rowIndex);
        continue;
      }
      if (source === target) {
        diagnostic(diagnostics, 'self-link', 'warning', 'Self-links are ignored.', frame, rowIndex);
        continue;
      }
      if (value === undefined && (!isMissing(rawValue) || !isLastAggregation(options.aggregation))) {
        diagnostic(diagnostics, 'invalid-value', 'warning', 'Value must be a finite number.', frame, rowIndex);
        continue;
      }
      if (value !== undefined && value < 0) {
        diagnostic(diagnostics, 'negative-value', 'warning', 'Negative link values are ignored.', frame, rowIndex);
        continue;
      }
      const rawTime = fields.time ? vectorValue(fields.time, rowIndex) : undefined;
      const parsedTime = fields.time ? timestamp(rawTime) : undefined;
      if (fields.time && rawTime !== null && rawTime !== undefined && parsedTime === undefined) {
        diagnostic(diagnostics, 'invalid-value', 'warning', 'Time must be a valid timestamp.', frame, rowIndex);
      }
      if (!appendEdge(edges, {
        source,
        target,
        value,
        time: parsedTime,
        nodeGroup: fields.nodeGroup ? text(vectorValue(fields.nodeGroup, rowIndex)) : undefined,
        linkGroup: fields.linkGroup ? text(vectorValue(fields.linkGroup, rowIndex)) : undefined,
        label: fields.label ? text(vectorValue(fields.label, rowIndex)) : undefined,
        provenance: provenance(frame, rowIndex, retainedFields),
      }, budget, diagnostics, frame)) {
        break;
      }
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
  ].filter(Boolean).map((name) => normalizedName(name!)));
  return frame.fields.filter((field) => {
    const name = normalizedName(field.name);
    return !reserved.has(name) && field.type !== FieldType.number && field.type !== FieldType.time;
  });
}

function parsePaths(frames: DataFrame[], options: SankeyFlowOptions, diagnostics: GraphDiagnostic[], budget: IngestionBudget): NormalizedEdge[] {
  const edges: NormalizedEdge[] = [];
  for (const frame of frames) {
    if (budget.remainingRows <= 0 || budget.edgeLimitReported) {
      break;
    }
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
    const retainedFields = provenanceFields(frame, [...stages, valueField, timeField], diagnostics);
    const rowCount = rowsToRead(frame, budget, diagnostics);
    for (let rowIndex = 0; rowIndex < rowCount && !budget.edgeLimitReported; rowIndex++) {
      const rawValue = vectorValue(valueField, rowIndex);
      const value = number(rawValue);
      if (value === undefined && (!isMissing(rawValue) || !isLastAggregation(options.aggregation))) {
        diagnostic(diagnostics, 'invalid-value', 'warning', 'Value must be a finite number.', frame, rowIndex);
        continue;
      }
      if (value !== undefined && value < 0) {
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
        if (!appendEdge(edges, {
          source: previous.name,
          target: current.name,
          value,
          sourceStage: previous.stage,
          targetStage: current.stage,
          time: parsedTime,
          provenance: provenance(frame, rowIndex, retainedFields),
        }, budget, diagnostics, frame)) {
          break;
        }
      }
    }
  }
  return edges;
}

interface EdgeGroup {
  key: string;
  first: NormalizedEdge;
  sum: number;
  count: number;
  max?: number;
  last?: number;
  lastNotNull?: number;
  rows: RowProvenance[];
  provenanceTruncated: boolean;
}

function addToGroup(group: EdgeGroup, edge: NormalizedEdge) {
  group.last = edge.value;
  if (edge.value !== undefined) {
    group.sum += edge.value;
    group.count++;
    group.max = group.max === undefined ? edge.value : Math.max(group.max, edge.value);
    group.lastNotNull = edge.value;
  }
  if (group.rows.length < LIMITS.provenanceRowsPerLink) {
    group.rows.push(edge.provenance);
  } else {
    group.provenanceTruncated = true;
  }
}

function aggregatedValue(group: EdgeGroup, aggregation: Aggregation): number | undefined {
  if (aggregation === 'max') {
    return group.max;
  }
  if (aggregation === 'mean') {
    return group.count ? group.sum / group.count : undefined;
  }
  if (aggregation === 'last') {
    return group.last;
  }
  if (aggregation === 'lastNotNull') {
    return group.lastNotNull;
  }
  return group.count ? group.sum : undefined;
}

function hasCycle(links: SankeyGraphLink[]): boolean {
  const graph = new Map<string, string[]>();
  for (const link of links) {
    const targets = graph.get(link.source);
    if (targets) {
      targets.push(link.target);
    } else {
      graph.set(link.source, [link.target]);
    }
  }
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
export function buildGraph(
  edges: NormalizedEdge[],
  options: SankeyFlowOptions,
  initialDiagnostics: GraphDiagnostic[] = [],
  diagnosticScope: GraphDiagnostic['scope'] = 'global'
): SankeyGraph {
  const diagnostics = [...initialDiagnostics];
  const scoped = options.pathFields.scopeNodesByStage;
  const groups = new Map<string, EdgeGroup>();
  let provenanceTruncated = false;
  for (const edge of edges) {
    const source = nodeKey(edge.source, edge.sourceStage, scoped);
    const target = nodeKey(edge.target, edge.targetStage, scoped);
    if (source === target) {
      diagnostic(
        diagnostics,
        'self-link',
        'warning',
        `The link '${edge.source}' to '${edge.target}' resolves to the same node and was ignored.`,
        undefined,
        edge.provenance.rowIndex,
        diagnosticScope
      );
      continue;
    }
    const key = [source, target, edge.linkGroup ?? '', edge.label ?? ''].join('\u0001');
    let group = groups.get(key);
    if (!group) {
      group = { key, first: edge, sum: 0, count: 0, rows: [], provenanceTruncated: false };
      groups.set(key, group);
    }
    addToGroup(group, edge);
    provenanceTruncated ||= group.provenanceTruncated;
  }
  if (provenanceTruncated) {
    diagnostic(
      diagnostics,
      'limit-exceeded',
      'warning',
      `Limited retained provenance to ${LIMITS.provenanceRowsPerLink} rows per link.`,
      undefined,
      undefined,
      diagnosticScope
    );
  }
  const details = new Map<string, { name: string; stage?: number; group?: string }>();
  const minimumValue = Number.isFinite(options.interaction.minimumValue) ? options.interaction.minimumValue : 0;
  let links: SankeyGraphLink[] = [];
  for (const group of groups.values()) {
    const value = aggregatedValue(group, options.aggregation);
    if (value === undefined) {
      diagnostic(
        diagnostics,
        'invalid-value',
        'warning',
        `The ${options.aggregation === 'last' ? 'last' : 'last non-null'} value for a link is missing; the link was ignored.`,
        undefined,
        group.first.provenance.rowIndex,
        diagnosticScope
      );
      continue;
    }
    if (value < minimumValue) {
      continue;
    }
    const edge = group.first;
    const source = nodeKey(edge.source, edge.sourceStage, scoped);
    const target = nodeKey(edge.target, edge.targetStage, scoped);
    details.set(source, { name: edge.source, stage: scoped ? edge.sourceStage : undefined, group: edge.nodeGroup });
    details.set(target, { name: edge.target, stage: scoped ? edge.targetStage : undefined, group: edge.nodeGroup });
    links.push({ id: group.key, source, target, value, group: edge.linkGroup, label: edge.label, rows: group.rows });
  }
  const topN = boundedOption(options.interaction.topN, LIMITS.renderLinks);
  if (topN > 0 && links.length > topN) {
    links = links.sort((a, b) => b.value - a.value).slice(0, topN);
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited links to top ${topN}.`, undefined, undefined, diagnosticScope);
  }
  const maxLinks = boundedOption(options.performance.maxLinks, LIMITS.renderLinks);
  if (links.length > maxLinks) {
    links = links.slice(0, maxLinks);
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited links to ${maxLinks}.`, undefined, undefined, diagnosticScope);
  }
  let nodes = [...new Set(links.flatMap((link) => [link.source, link.target]))].map((id): SankeyGraphNode => ({
    id, name: details.get(id)?.name ?? id, stage: details.get(id)?.stage, group: details.get(id)?.group,
    value: 0, incoming: [], outgoing: [],
  }));
  const maxNodes = boundedOption(options.performance.maxNodes, LIMITS.renderNodes);
  if (nodes.length > maxNodes) {
    const kept = new Set(nodes.slice(0, maxNodes).map((node) => node.id));
    nodes = nodes.slice(0, maxNodes);
    links = links.filter((link) => kept.has(link.source) && kept.has(link.target));
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited nodes to ${maxNodes}.`, undefined, undefined, diagnosticScope);
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
  if (cyclic) {diagnostic(diagnostics, 'cycle', 'warning', 'The graph contains a cycle.', undefined, undefined, diagnosticScope);}
  if (!links.length) {diagnostic(diagnostics, 'no-data', 'info', 'No valid Sankey links were found.', undefined, undefined, diagnosticScope);}
  return { nodes, links, total: links.reduce((sum, link) => sum + link.value, 0), diagnostics, cyclic };
}

interface PlaybackBucket {
  timestamp: number;
  edges: NormalizedEdge[];
}

function selectPlaybackBuckets(edges: NormalizedEdge[], options: SankeyFlowOptions, diagnostics: GraphDiagnostic[]): PlaybackBucket[] {
  const bucketSize = Math.max(1, Number.isFinite(options.playback.bucketSizeMs) ? options.playback.bucketSizeMs : 1);
  const buckets = new Map<number, NormalizedEdge[]>();
  for (const edge of edges) {
    if (edge.time === undefined) {continue;}
    const timestamp = Math.floor(edge.time / bucketSize) * bucketSize;
    const bucket = buckets.get(timestamp);
    if (bucket) {
      bucket.push(edge);
    } else {
      buckets.set(timestamp, [edge]);
    }
  }
  const maxFrames = boundedOption(options.playback.maxFrames, LIMITS.playbackFrames);
  if (buckets.size > maxFrames) {
    diagnostic(diagnostics, 'limit-exceeded', 'warning', `Limited playback to ${maxFrames} frames before graph construction.`, undefined);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, maxFrames)
    .map(([timestamp, bucket]) => ({ timestamp, edges: bucket }));
}

/** Parse all Grafana DataFrames into a validated Sankey graph and optional playback buckets. */
export function parsePanelData(context: ParseContext): ParsedPanelData {
  const diagnostics: GraphDiagnostic[] = [];
  if (!context.frames.length) {
    diagnostic(diagnostics, 'missing-frame', 'error', 'No data frames were supplied.', undefined);
    return { graph: buildGraph([], context.options, diagnostics), frames: [], mode: configuredMode(context.options, []) };
  }
  const frames = acceptedFrames(context.frames, diagnostics);
  const mode = configuredMode(context.options, frames);
  const budget: IngestionBudget = { remainingRows: LIMITS.totalRows, edgeLimitReported: false };
  const edges = mode === 'edges'
    ? parseEdges(frames, context.options, diagnostics, budget)
    : parsePaths(frames, context.options, diagnostics, budget);
  const valueName = mode === 'edges' ? context.options.edgeFields.value : context.options.pathFields.value;
  const valueField = frames.map((frame) => detectField(frame, 'value', valueName)).find((field): field is Field => !!field);
  const buckets = context.options.playback.mode === 'playback' ? selectPlaybackBuckets(edges, context.options, diagnostics) : [];
  const graph = buildGraph(edges, context.options, diagnostics);
  const playbackFrames = buckets.map(({ timestamp, edges: bucket }) => ({
    timestamp,
    graph: buildGraph(bucket, context.options, [], 'frame'),
  }));
  return { graph, frames: playbackFrames, mode, valueField };
}

export const parseSankeyData = parsePanelData;
