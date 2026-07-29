import { COLOR_MODE_OPTIONS } from './module';
import { migrationHandler, migrateSankeyFlowOptions } from './migrations';
import { defaultOptions, OPTIONS_SCHEMA_VERSION, SUPPORTED_COLOR_MODES } from './types';

describe('migrateSankeyFlowOptions', () => {
  it('deep-merges defaults, filters unknown data, and preserves current nested values', () => {
    const saved = {
      schemaVersion: 0,
      dataMode: 'paths',
      edgeFields: { source: ' from ' },
      pathFields: { stages: ['stage_a', 'stage_b'], value: 'amount' },
      layout: { nodePadding: 24 },
      display: { colorMode: 'fixed', fixedColor: '#123456' },
      unknownOption: 'discard me',
    };

    const migrated = migrateSankeyFlowOptions(saved);

    expect(migrated).toEqual({
      ...defaultOptions,
      dataMode: 'paths',
      edgeFields: { ...defaultOptions.edgeFields, source: 'from' },
      pathFields: { ...defaultOptions.pathFields, stages: ['stage_a', 'stage_b'], value: 'amount' },
      layout: { ...defaultOptions.layout, nodePadding: 24 },
      display: { ...defaultOptions.display, colorMode: 'fixed', fixedColor: '#123456' },
      schemaVersion: OPTIONS_SCHEMA_VERSION,
    });
    expect(migrated).not.toHaveProperty('unknownOption');
  });

  it('migrates recognized flat legacy fields and normalizes invalid values', () => {
    const migrated = migrateSankeyFlowOptions({
      mode: 'edges',
      sourceField: 'source',
      targetField: 'target',
      valueField: 'weight',
      stageFields: ['not-used'],
      layoutDirection: 'top-to-bottom',
      nodeWidth: 500,
      nodePadding: -4,
      linkOpacity: 2,
      topN: -1,
      playbackSpeed: 0,
      maxNodes: Number.POSITIVE_INFINITY,
      reduceMotion: 'invalid',
    });

    expect(migrated.dataMode).toBe('edges');
    expect(migrated.edgeFields).toMatchObject({ source: 'source', target: 'target', value: 'weight' });
    expect(migrated.layout).toMatchObject({ direction: 'top-to-bottom', nodeWidth: 100, nodePadding: 0 });
    expect(migrated.display.linkOpacity).toBe(1);
    expect(migrated.interaction.topN).toBe(0);
    expect(migrated.playback.speed).toBe(0.1);
    expect(migrated.performance.maxNodes).toBe(defaultOptions.performance.maxNodes);
    expect(migrated.accessibility.reduceMotion).toBe(defaultOptions.accessibility.reduceMotion);
  });

  it('applies nested, canonical, then legacy alias precedence and sanitizes strings', () => {
    const migrated = migrateSankeyFlowOptions({
      dataMode: 'paths',
      mode: 'edges',
      source: ' root-source ',
      sourceField: 'legacy-source',
      edgeFields: { source: ' nested-source ', target: ' root-target ', label: '   ', tooltipFields: ['legacy'] },
      stageFields: [' stage-a ', ' ', 42, 'stage-b'],
      fixedColor: '  #abcdef  ',
    });

    expect(migrated.dataMode).toBe('paths');
    expect(migrated.edgeFields.source).toBe('nested-source');
    expect(migrated.edgeFields.target).toBe('root-target');
    expect(migrated.edgeFields.label).toBeUndefined();
    expect(migrated.pathFields.stages).toEqual(['stage-a', 'stage-b']);
    expect(migrated.edgeFields).not.toHaveProperty('tooltipFields');
    expect(migrated.display.fixedColor).toBe('#abcdef');
  });

  it('rejects renderer-unsupported color modes and keeps the UI list in sync', () => {
    expect(migrateSankeyFlowOptions({ display: { colorMode: 'thresholds' } }).display.colorMode).toBe(
      defaultOptions.display.colorMode
    );
    expect(COLOR_MODE_OPTIONS.map((option) => option.value)).toEqual([...SUPPORTED_COLOR_MODES]);
    expect(COLOR_MODE_OPTIONS.map((option) => option.value)).not.toContain('thresholds');
  });

  it('accepts unknown input without throwing and is idempotent', () => {
    const migrated = migrateSankeyFlowOptions(null);
    const secondPass = migrateSankeyFlowOptions(migrated);

    expect(migrated).toEqual(defaultOptions);
    expect(secondPass).toEqual(migrated);
  });

  it('does not mutate saved options while migrating', () => {
    const saved = { layout: { nodeWidth: 42 }, pathFields: { stages: ['one'] } };
    const original = JSON.parse(JSON.stringify(saved)) as typeof saved;

    migrateSankeyFlowOptions(saved);

    expect(saved).toEqual(original);
  });

  it('exposes the same migration behavior through the Grafana handler', () => {
    const options = { dataMode: 'edges', sourceField: 'source' };

    expect(migrationHandler({ options } as never)).toEqual(migrateSankeyFlowOptions(options));
  });
});
