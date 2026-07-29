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
    config.edgeFields = { source: 'upstream', target: 'downstream', value: 'count' };
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
    config.pathFields = { stages: ['first', 'middle', 'last'], value: 'weight', scopeNodesByStage: true };
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

  it('aggregates duplicate rows without retaining unbounded provenance', () => {
    const values = Array.from({ length: 101 }, () => 1);
    const result = parsePanelData({
      frames: [frame({ source: values.map(() => 'A'), target: values.map(() => 'B'), value: values })],
      options: options(),
    });

    expect(result.graph.links).toEqual([expect.objectContaining({ source: 'A', target: 'B', value: 101 })]);
    expect(result.graph.links[0].rows).toHaveLength(100);
    expect(result.graph.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'limit-exceeded', message: expect.stringContaining('provenance') }),
    ]));
  });

  it('applies minimumValue after duplicate aggregation and then applies graph caps', () => {
    const config = options();
    config.interaction.minimumValue = 10;
    config.interaction.topN = 1;
    const result = parsePanelData({
      frames: [frame({ source: ['A', 'A', 'C'], target: ['B', 'B', 'D'], value: [6, 6, 11] })],
      options: config,
    });

    expect(result.graph.links).toEqual([expect.objectContaining({ source: 'A', target: 'B', value: 12 })]);
    expect(result.graph.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'limit-exceeded' })]));
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

  it('caps timestamp buckets before graph construction and keeps parser diagnostics global', () => {
    const config = options();
    config.playback = { ...config.playback, mode: 'playback', bucketSizeMs: 1_000, maxFrames: 2 };
    const result = parsePanelData({
      frames: [frame({
        source: ['A', 'A', 'A', 'A', 'A', ''],
        target: ['B', 'B', 'B', 'B', 'B', 'B'],
        value: [1, 1, 1, 1, 1, 1],
        time: [0, 1_000, 2_000, 3_000, 4_000, 5_000],
      })],
      options: config,
    });

    expect(result.frames.map((item) => item.timestamp)).toEqual([0, 1_000]);
    expect(result.graph.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-row', scope: 'global' }),
      expect.objectContaining({ code: 'limit-exceeded', message: expect.stringContaining('before graph construction'), scope: 'global' }),
    ]));
    expect(result.frames.flatMap((item) => item.graph.diagnostics)).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ scope: 'global' }),
    ]));
  });

  it('accepts ISO timestamps and can intentionally share path nodes across stages', () => {
    const config = options();
    config.dataMode = 'paths';
    config.pathFields = { stages: ['one', 'two'], value: 'value', time: 'when', scopeNodesByStage: false };
    config.playback = { ...config.playback, mode: 'playback', bucketSizeMs: 1_000 };
    const result = parsePanelData({
      frames: [frame({ one: ['A'], two: ['B'], value: [1], when: ['2026-01-01T00:00:00.000Z'] })],
      options: config,
    });

    expect(result.graph.nodes.map((node) => node.id)).toEqual(['A', 'B']);
    expect(result.frames[0].timestamp).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });

  it('accepts numeric strings without claiming the Grafana value field is numeric', () => {
    const result = parsePanelData({
      frames: [frame({ source: ['A', 'A'], target: ['B', 'B'], value: ['2.5', '3.5'] })],
      options: options(),
    });

    expect(result.graph.links[0].value).toBe(6);
    expect(result.valueField?.type).toBe(FieldType.string);
  });

  it('distinguishes last from lastNotNull when the final duplicate value is null', () => {
    const last = options();
    last.aggregation = 'last';
    const lastNotNull = options();
    lastNotNull.aggregation = 'lastNotNull';
    const input = [frame({ source: ['A', 'A'], target: ['B', 'B'], value: [5, null] })];

    expect(parsePanelData({ frames: input, options: last }).graph.links).toEqual([]);
    expect(parsePanelData({ frames: input, options: lastNotNull }).graph.links).toEqual([
      expect.objectContaining({ source: 'A', target: 'B', value: 5 }),
    ]);
  });

  it('enforces ingestion and diagnostic ceilings with explicit diagnostics', () => {
    const rowCount = 50_001;
    const result = parsePanelData({
      frames: [frame({
        source: Array.from({ length: rowCount }, () => 'A'),
        target: Array.from({ length: rowCount }, () => 'B'),
        value: Array.from({ length: rowCount }, () => 1),
      })],
      options: options(),
    });
    const invalidRows = parsePanelData({
      frames: [frame({ source: Array.from({ length: 1_001 }, () => ''), target: Array.from({ length: 1_001 }, () => 'B'), value: Array.from({ length: 1_001 }, () => 1) })],
      options: options(),
    });

    expect(result.graph.links[0].value).toBe(50_000);
    expect(result.graph.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'limit-exceeded', message: expect.stringContaining('50,000 rows') }),
    ]));
    expect(invalidRows.graph.diagnostics).toHaveLength(1_000);
    expect(invalidRows.graph.diagnostics.at(-1)).toEqual(expect.objectContaining({
      code: 'limit-exceeded',
      message: expect.stringContaining('Stopped collecting diagnostics'),
    }));
  });

  it('drops links that collapse into self-links when stages intentionally share node identity', () => {
    const config = options();
    config.dataMode = 'paths';
    config.pathFields = {
      stages: ['one', 'two', 'three'],
      value: 'value',
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
