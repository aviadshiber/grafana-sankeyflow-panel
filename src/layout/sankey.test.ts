import type { SankeyGraph } from '../data/model';
import type { LayoutOptions } from '../types';
import { layoutSankey } from './sankey';

const layoutOptions: LayoutOptions = {
  direction: 'left-to-right',
  alignment: 'justify',
  sort: 'input',
  nodeWidth: 18,
  nodePadding: 12,
  iterations: 32,
  enableCircular: true,
  circularLinkGap: 4,
};

const graph = (nodes: SankeyGraph['nodes'], links: SankeyGraph['links'], cyclic = false): SankeyGraph => ({
  nodes,
  links,
  total: links.reduce((sum, link) => sum + link.value, 0),
  diagnostics: [],
  cyclic,
});

const node = (id: string, value = 1) => ({ id, name: id, value, incoming: [], outgoing: [] });

const link = (id: string, source: string, target: string, value = 1) => ({
  id,
  source,
  target,
  value,
  rows: [],
});

describe('layoutSankey', () => {
  it('lays out a DAG deterministically without mutating the graph', () => {
    const input = graph(
      [node('source', 10), node('left', 4), node('right', 6), node('sink', 10)],
      [
        link('source-left', 'source', 'left', 4),
        link('source-right', 'source', 'right', 6),
        link('left-sink', 'left', 'sink', 4),
        link('right-sink', 'right', 'sink', 6),
      ]
    );
    const original = JSON.parse(JSON.stringify(input));

    const scene = layoutSankey(
      input,
      { width: 400, height: 200 },
      { ...layoutOptions, nodeWidth: 20, nodePadding: 16 }
    );
    const repeated = layoutSankey(
      input,
      { width: 400, height: 200 },
      { ...layoutOptions, nodeWidth: 20, nodePadding: 16 }
    );

    expect(scene).toEqual(repeated);
    expect(scene.engine).toBe('dag');
    expect(scene.nodes).toHaveLength(4);
    expect(scene.links).toHaveLength(4);
    expect(scene.nodes.every((item) => item.x1 - item.x0 === 20)).toBe(true);
    expect(scene.links.every((item) => item.circular === false && item.width > 0)).toBe(true);
    expect(input).toEqual(original);
  });

  it('uses the circular engine and exposes circular link geometry', () => {
    const input = graph(
      [node('a'), node('b'), node('c')],
      [link('a-b', 'a', 'b', 3), link('b-c', 'b', 'c', 2), link('c-a', 'c', 'a', 1)],
      true
    );

    const scene = layoutSankey(input, { width: 360, height: 180 }, layoutOptions);

    expect(scene.engine).toBe('circular');
    expect(scene.links.some((item) => item.circular)).toBe(true);
    expect(
      scene.links
        .filter((item) => item.circular)
        .every((item) => item.circularSide === 'top' || item.circularSide === 'bottom')
    ).toBe(true);
  });

  it('rejects cyclic graphs when circular links are disabled', () => {
    const input = graph([node('a'), node('b')], [link('a-b', 'a', 'b'), link('b-a', 'b', 'a')], true);

    expect(() => layoutSankey(input, { width: 360, height: 180 }, { ...layoutOptions, enableCircular: false })).toThrow(
      'circular links are disabled'
    );
  });

  it('rejects non-empty all-zero graphs before a layout engine can create invalid geometry', () => {
    const input = graph([node('a', 0), node('b', 0)], [link('a-b', 'a', 'b', 0)]);

    expect(() => layoutSankey(input, { width: 360, height: 180 }, layoutOptions)).toThrow('positive total flow');
  });

  it('returns an empty scene without calling a layout engine', () => {
    const scene = layoutSankey(graph([], []), { width: 320, height: 120 }, layoutOptions);

    expect(scene).toEqual({
      width: 320,
      height: 120,
      direction: 'left-to-right',
      engine: 'dag',
      nodes: [],
      links: [],
    });
  });

  it('transforms the horizontal layout for right-to-left and top-to-bottom directions', () => {
    const input = graph([node('a'), node('b')], [link('a-b', 'a', 'b', 5)]);
    const ltr = layoutSankey(input, { width: 180, height: 320 }, layoutOptions);
    const rtl = layoutSankey(input, { width: 180, height: 320 }, { ...layoutOptions, direction: 'right-to-left' });
    const ttb = layoutSankey(input, { width: 320, height: 180 }, { ...layoutOptions, direction: 'top-to-bottom' });

    for (const horizontalNode of ltr.nodes) {
      const rightToLeftNode = rtl.nodes.find((item) => item.id === horizontalNode.id)!;
      const topToBottomNode = ttb.nodes.find((item) => item.id === horizontalNode.id)!;
      expect(rightToLeftNode.x0).toBeCloseTo(180 - horizontalNode.x1);
      expect(rightToLeftNode.x1).toBeCloseTo(180 - horizontalNode.x0);
      expect(rightToLeftNode.y0).toBeCloseTo(horizontalNode.y0);
      expect(rightToLeftNode.y1).toBeCloseTo(horizontalNode.y1);
      expect(topToBottomNode.x0).toBeCloseTo(horizontalNode.y0);
      expect(topToBottomNode.x1).toBeCloseTo(horizontalNode.y1);
      expect(topToBottomNode.y0).toBeCloseTo(horizontalNode.x0);
      expect(topToBottomNode.y1).toBeCloseTo(horizontalNode.x1);
    }
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid layout dimensions (%p)', (dimension) => {
    expect(() =>
      layoutSankey(
        graph([node('a'), node('b')], [link('a-b', 'a', 'b')]),
        { width: dimension, height: 180 },
        layoutOptions
      )
    ).toThrow(RangeError);
  });

  it.each(['left', 'right', 'center', 'justify'] as const)('supports the %s alignment branch', (alignment) => {
    const scene = layoutSankey(
      graph(
        [node('source'), node('middle'), node('sink'), node('shortcut')],
        [
          link('source-middle', 'source', 'middle'),
          link('middle-sink', 'middle', 'sink'),
          link('shortcut-sink', 'shortcut', 'sink'),
        ]
      ),
      { width: 360, height: 180 },
      { ...layoutOptions, alignment }
    );

    expect(scene.nodes).toHaveLength(4);
    expect(scene.nodes.flatMap((item) => [item.x0, item.x1, item.y0, item.y1]).every(Number.isFinite)).toBe(true);
  });

  it.each(['auto', 'input', 'name', 'value'] as const)('supports the %s node-sort branch', (sort) => {
    const scene = layoutSankey(
      graph(
        [node('zeta', 1), node('alpha', 9), node('sink', 10)],
        [link('zeta-sink', 'zeta', 'sink', 1), link('alpha-sink', 'alpha', 'sink', 9)]
      ),
      { width: 360, height: 180 },
      { ...layoutOptions, sort }
    );

    expect(scene.links.every((item) => Number.isFinite(item.width) && item.width > 0)).toBe(true);
  });
});
