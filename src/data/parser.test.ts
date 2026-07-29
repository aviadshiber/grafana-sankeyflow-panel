import { FieldType, type DataFrame } from '@grafana/data';
import fc from 'fast-check';
import { defaultOptions } from '../types';
import { parsePanelData } from './parser';

const frame = (fields: Record<string, unknown[]>, refId = 'A'): DataFrame => ({
  refId,
  name: `Frame ${refId}`,
  fields: Object.entries(fields).map(([name, values]) => ({
    name,
    type: values.every((value) => typeof value === 'number') ? FieldType.number : FieldType.string,
    values,
    config: {},
  })),
  length: Math.max(0, ...Object.values(fields).map((values) => values.length)),
});

const options = () => JSON.parse(JSON.stringify(defaultOptions));

describe('parsePanelData', () => {
  it('auto-detects edge fields across frames and aggregates duplicates', () => {
    const result = parsePanelData({
      frames: [frame({ from: ['A'], to: ['B'], amount: [2] }, 'A'), frame({ source: ['A'], target: ['B'], value: [3] }, 'B')],
      options: options(),
    });

    expect(result.mode).toBe('edges');
    expect(result.graph.links).toHaveLength(1);
    expect(result.graph.links[0]).toMatchObject({ source: 'A', target: 'B', value: 5 });
    expect(result.graph.links[0].rows).toHaveLength(2);
  });

  it('honors explicit mappings and reports invalid input without poisoning valid rows', () => {
    const config = options();
    config.dataMode = 'edges';
    config.edgeFields = { source: 'upstream', target: 'downstream', value: 'count', tooltipFields: [] };
    const result = parsePanelData({
      frames: [frame({ upstream: ['A', '', 'C'], downstream: ['B', 'B', 'D'], count: [2, 5, -1] })],
      options: config,
    });

    expect(result.graph.links).toEqual([expect.objectContaining({ source: 'A', target: 'B', value: 2 })]);
    expect(result.graph.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(['invalid-row', 'negative-value']));
  });

  it('turns nullable path stages into links between nearest present stages with scoped IDs', () => {
    const config = options();
    config.dataMode = 'paths';
    config.pathFields = { stages: ['first', 'middle', 'last'], value: 'weight', tooltipFields: [], scopeNodesByStage: true };
    const result = parsePanelData({ frames: [frame({ first: ['A'], middle: [null], last: ['A'], weight: [4] })], options: config });

    expect(result.graph.links).toEqual([expect.objectContaining({ source: '0\u0000A', target: '2\u0000A', value: 4 })]);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(['0\u0000A', '2\u0000A']);
  });

  it.each([
    ['sum', 9],
    ['mean', 3],
    ['max', 5],
    ['last', 3],
    ['lastNotNull', 3],
  ] as const)('uses %s duplicate aggregation', (aggregation, expected) => {
    const config = options();
    config.aggregation = aggregation;
    const result = parsePanelData({ frames: [frame({ source: ['A', 'A', 'A'], target: ['B', 'B', 'B'], value: [1, 5, 3] })], options: config });
    expect(result.graph.links[0].value).toBe(expected);
  });

  it('buckets playback timestamps, detects cycles, and enforces frame limits', () => {
    const config = options();
    config.playback = { ...config.playback, mode: 'playback', bucketSizeMs: 1000, maxFrames: 1 };
    const result = parsePanelData({
      frames: [frame({ source: ['A', 'B', 'C'], target: ['B', 'A', 'D'], value: [1, 2, 3], time: [100, 900, 2100] })],
      options: config,
    });

    expect(result.graph.cyclic).toBe(true);
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].timestamp).toBe(0);
  });

  it('accepts ISO timestamps and can intentionally share path nodes across stages', () => {
    const config = options();
    config.dataMode = 'paths';
    config.pathFields = { stages: ['one', 'two'], value: 'value', time: 'when', tooltipFields: [], scopeNodesByStage: false };
    config.playback = { ...config.playback, mode: 'playback', bucketSizeMs: 1_000 };
    const result = parsePanelData({
      frames: [frame({ one: ['A'], two: ['B'], value: [1], when: ['2026-01-01T00:00:00.000Z'] })],
      options: config,
    });

    expect(result.graph.nodes.map((node) => node.id)).toEqual(['A', 'B']);
    expect(result.frames[0].timestamp).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  it('drops links that collapse into self-links when stages intentionally share node identity', () => {
    const config = options();
    config.dataMode = 'paths';
    config.pathFields = {
      stages: ['one', 'two', 'three'],
      value: 'value',
      tooltipFields: [],
      scopeNodesByStage: false,
    };
    const result = parsePanelData({
      frames: [frame({ one: ['A'], two: ['A'], three: ['B'], value: [2] })],
      options: config,
    });

    expect(result.graph.links).toEqual([expect.objectContaining({ source: 'A', target: 'B', value: 2 })]);
    expect(result.graph.nodes).toEqual([
      expect.objectContaining({ id: 'A', stage: undefined }),
      expect.objectContaining({ id: 'B', stage: undefined }),
    ]);
    expect(result.graph.diagnostics).toEqual([expect.objectContaining({ code: 'self-link' })]);
  });

  it('never emits non-finite link or node values for arbitrary numeric inputs', () => {
    fc.assert(fc.property(fc.array(fc.oneof(fc.double(), fc.constant(null)), { minLength: 1, maxLength: 40 }), (values) => {
      const result = parsePanelData({
        frames: [frame({ source: values.map((_, index) => `s${index}`), target: values.map((_, index) => `t${index}`), value: values })],
        options: options(),
      });
      return [...result.graph.links, ...result.graph.nodes].every((item) => Number.isFinite(item.value));
    }));
  });
});
