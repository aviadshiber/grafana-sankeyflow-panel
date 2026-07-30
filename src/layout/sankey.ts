import { sankey, sankeyCenter, sankeyJustify, sankeyLeft, sankeyRight } from 'd3-sankey';
import * as circularD3Module from 'd3-sankey-circular';
import type { SankeyGraph, SankeyGraphLink, SankeyGraphNode } from '../data/model';
import type { LayoutDirection, LayoutOptions, NodeAlignment } from '../types';

/** A renderer-independent point in panel coordinates. */
export interface SankeyScenePoint {
  x: number;
  y: number;
}

/** A positioned node rectangle, preserving the source graph node. */
export interface SankeySceneNode {
  id: string;
  node: SankeyGraphNode;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Geometry a renderer can use to route a link without depending on D3 objects. */
export interface SankeySceneLink {
  id: string;
  link: SankeyGraphLink;
  source: SankeyScenePoint;
  target: SankeyScenePoint;
  width: number;
  circular: boolean;
  circularSide?: 'top' | 'bottom';
}

export interface SankeyScene {
  width: number;
  height: number;
  direction: LayoutDirection;
  engine: 'dag' | 'circular';
  nodes: SankeySceneNode[];
  links: SankeySceneLink[];
}

export interface SankeyLayoutSize {
  width: number;
  height: number;
}

interface LayoutNode extends SankeyGraphNode {
  index?: number;
  depth?: number;
  height?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
}

interface LayoutLink extends Omit<SankeyGraphLink, 'source' | 'target'> {
  source: string | LayoutNode;
  target: string | LayoutNode;
  index?: number;
  width?: number;
  y0?: number;
  y1?: number;
  circular?: boolean;
  circularLinkType?: 'top' | 'bottom';
}

interface LayoutInput {
  nodes: LayoutNode[];
  links: LayoutLink[];
}

interface CircularSankeyGenerator {
  (input: LayoutInput): { nodes: LayoutNode[]; links: LayoutLink[] };
  nodeId(accessor: (node: LayoutNode) => string): this;
  nodeAlign(accessor: AlignmentAccessor): this;
  nodeWidth(width: number): this;
  nodePadding(padding: number): this;
  extent(extent: [[number, number], [number, number]]): this;
  iterations(iterations: number): this;
  circularLinkGap(gap: number): this;
  sortNodes(comparator: NodeComparator | null): this;
}

type AlignmentAccessor = (node: LayoutNode, columns: number) => number;
type NodeComparator = (left: LayoutNode, right: LayoutNode) => number;

interface CircularSankeyModule {
  sankeyCircular(): CircularSankeyGenerator;
  sankeyCenter: AlignmentAccessor;
  sankeyJustify: AlignmentAccessor;
  sankeyLeft: AlignmentAccessor;
  sankeyRight: AlignmentAccessor;
}

// d3-sankey-circular does not publish TypeScript declarations. Keep its dynamic
// boundary private so consumers of this adapter remain fully typed.
const circularD3 = circularD3Module as CircularSankeyModule;

/**
 * Computes a renderer-neutral Sankey scene. The source graph is never mutated.
 */
export function layoutSankey(graph: SankeyGraph, size: SankeyLayoutSize, options: LayoutOptions): SankeyScene {
  const width = validateDimension(size.width, 'width');
  const height = validateDimension(size.height, 'height');
  const circular = graph.cyclic;

  if (circular && !options.enableCircular) {
    throw new Error('Cannot lay out a cyclic Sankey graph when circular links are disabled.');
  }

  if (graph.nodes.length === 0) {
    return {
      width,
      height,
      direction: options.direction,
      engine: circular ? 'circular' : 'dag',
      nodes: [],
      links: [],
    };
  }

  if (graph.links.length > 0 && !graph.links.some((link) => Number.isFinite(link.value) && link.value > 0)) {
    throw new Error('Cannot lay out a Sankey graph without a positive total flow.');
  }

  const input = toLayoutInput(graph);
  const engineSize = options.direction === 'top-to-bottom' ? { width: height, height: width } : { width, height };
  const laidOut = circular ? layoutCircular(input, engineSize, options) : layoutDag(input, engineSize, options);

  return {
    width,
    height,
    direction: options.direction,
    engine: circular ? 'circular' : 'dag',
    nodes: laidOut.nodes.map((node) => toSceneNode(node, options.direction, width, height)),
    links: laidOut.links.map((link) => toSceneLink(link, options.direction, width, height)),
  };
}

/** Alias for callers that use the graph-oriented name. */
export const layoutGraph = layoutSankey;

function layoutDag(input: LayoutInput, size: SankeyLayoutSize, options: LayoutOptions) {
  const generator = sankey<LayoutInput, LayoutNode, LayoutLink>()
    .nodeId((node) => node.id)
    .nodeAlign(dagAlignment(options.alignment))
    .nodeWidth(options.nodeWidth)
    .nodePadding(options.nodePadding)
    .iterations(options.iterations)
    .extent([
      [0, 0],
      [size.width, size.height],
    ]);
  const comparator = nodeComparator(options);
  if (comparator) {
    generator.nodeSort(comparator);
  }
  return generator(input);
}

function layoutCircular(input: LayoutInput, size: SankeyLayoutSize, options: LayoutOptions) {
  const generator = circularD3
    .sankeyCircular()
    .nodeId((node) => node.id)
    .nodeAlign(circularAlignment(options.alignment))
    .nodeWidth(options.nodeWidth)
    .nodePadding(options.nodePadding)
    .iterations(options.iterations)
    .circularLinkGap(options.circularLinkGap)
    .extent([
      [0, 0],
      [size.width, size.height],
    ]);
  generator.sortNodes(nodeComparator(options));
  return generator(input);
}

function toLayoutInput(graph: SankeyGraph): LayoutInput {
  return {
    nodes: graph.nodes.map((node) => ({ ...node, incoming: [...node.incoming], outgoing: [...node.outgoing] })),
    links: graph.links.map((link) => ({ ...link, rows: [...link.rows] })),
  };
}

function toSceneNode(node: LayoutNode, direction: LayoutDirection, width: number, height: number): SankeySceneNode {
  const [x0, y0] = transformPoint(node.x0 ?? 0, node.y0 ?? 0, direction, width, height);
  const [x1, y1] = transformPoint(node.x1 ?? 0, node.y1 ?? 0, direction, width, height);
  return {
    id: node.id,
    node: toGraphNode(node),
    x0: Math.min(x0, x1),
    x1: Math.max(x0, x1),
    y0: Math.min(y0, y1),
    y1: Math.max(y0, y1),
  };
}

function toSceneLink(link: LayoutLink, direction: LayoutDirection, width: number, height: number): SankeySceneLink {
  const source = link.source as LayoutNode;
  const target = link.target as LayoutNode;
  const [sourceX, sourceY] = transformPoint(source.x1 ?? 0, link.y0 ?? 0, direction, width, height);
  const [targetX, targetY] = transformPoint(target.x0 ?? 0, link.y1 ?? 0, direction, width, height);
  return {
    id: link.id,
    link: toGraphLink(link, source.id, target.id),
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    width: link.width ?? 0,
    circular: link.circular === true,
    circularSide: link.circularLinkType,
  };
}

function toGraphNode(node: LayoutNode): SankeyGraphNode {
  return {
    id: node.id,
    name: node.name,
    ...(node.stage === undefined ? {} : { stage: node.stage }),
    ...(node.group === undefined ? {} : { group: node.group }),
    value: node.value,
    incoming: [...node.incoming],
    outgoing: [...node.outgoing],
  };
}

function toGraphLink(link: LayoutLink, source: string, target: string): SankeyGraphLink {
  return {
    id: link.id,
    source,
    target,
    value: link.value,
    ...(link.group === undefined ? {} : { group: link.group }),
    ...(link.label === undefined ? {} : { label: link.label }),
    rows: [...link.rows],
  };
}

function transformPoint(
  x: number,
  y: number,
  direction: LayoutDirection,
  width: number,
  _height: number
): [number, number] {
  switch (direction) {
    case 'right-to-left':
      return [width - x, y];
    case 'top-to-bottom':
      return [y, x];
    case 'left-to-right':
      return [x, y];
  }
}

function dagAlignment(alignment: NodeAlignment): AlignmentAccessor {
  switch (alignment) {
    case 'left':
      return sankeyLeft;
    case 'right':
      return sankeyRight;
    case 'center':
      return sankeyCenter;
    case 'justify':
      return sankeyJustify;
  }
}

function circularAlignment(alignment: NodeAlignment): AlignmentAccessor {
  switch (alignment) {
    case 'left':
      return circularD3.sankeyLeft;
    case 'right':
      return circularD3.sankeyRight;
    case 'center':
      return circularD3.sankeyCenter;
    case 'justify':
      return circularD3.sankeyJustify;
  }
}

function nodeComparator(options: LayoutOptions): NodeComparator | null {
  switch (options.sort) {
    case 'name':
      return (left, right) => compareText(left.name, right.name) || compareText(left.id, right.id);
    case 'value':
      return (left, right) => right.value - left.value || compareText(left.id, right.id);
    case 'input':
    case 'auto':
      return null;
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateDimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Sankey layout ${name} must be a finite positive number.`);
  }
  return value;
}
