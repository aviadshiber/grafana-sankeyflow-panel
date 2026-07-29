import { FieldColorModeId, PanelPlugin } from '@grafana/data';
import { SankeyFlowPanel } from './components/SankeyFlowPanel';
import { migrationHandler } from './migrations';
import { defaultOptions, type SankeyFlowOptions } from './types';

const colorModeOptions: Array<{ value: SankeyFlowOptions['display']['colorMode']; label: string }> = [
  { value: 'categorical', label: 'Categorical' },
  { value: 'source', label: 'Source node' },
  { value: 'target', label: 'Target node' },
  { value: 'fixed', label: 'Fixed color' },
  ...Object.values(FieldColorModeId)
    .filter((value) => value !== FieldColorModeId.Fixed)
    .map((value) => ({ value, label: value })),
];

const enumOptions = <const T extends string>(options: ReadonlyArray<{ value: T; label: string }>) => ({
  settings: { options: [...options] },
});

export const plugin = new PanelPlugin<SankeyFlowOptions>(SankeyFlowPanel)
  .setPanelOptions((builder) => {
    builder
      .addSelect({
        path: 'dataMode',
        name: 'Data mode',
        description: 'Choose how the panel interprets the incoming data.',
        category: ['Data'],
        defaultValue: defaultOptions.dataMode,
        ...enumOptions([
          { value: 'auto', label: 'Auto-detect' },
          { value: 'edges', label: 'Edges' },
          { value: 'paths', label: 'Paths' },
        ]),
      })
      .addSelect({
        path: 'aggregation',
        name: 'Aggregation',
        description: 'How duplicate links and time buckets are combined.',
        category: ['Data'],
        defaultValue: defaultOptions.aggregation,
        ...enumOptions([
          { value: 'sum', label: 'Sum' },
          { value: 'mean', label: 'Mean' },
          { value: 'max', label: 'Maximum' },
          { value: 'last', label: 'Last' },
          { value: 'lastNotNull', label: 'Last non-null' },
        ]),
      })
      .addTextInput({
        path: 'edgeFields.source',
        name: 'Source field',
        description: 'Field containing the source node name.',
        category: ['Data', 'Edge fields'],
        defaultValue: defaultOptions.edgeFields.source,
        showIf: (options) => options.dataMode !== 'paths',
      })
      .addTextInput({
        path: 'edgeFields.target',
        name: 'Target field',
        description: 'Field containing the target node name.',
        category: ['Data', 'Edge fields'],
        defaultValue: defaultOptions.edgeFields.target,
        showIf: (options) => options.dataMode !== 'paths',
      })
      .addTextInput({
        path: 'edgeFields.value',
        name: 'Value field',
        description: 'Field containing the link value.',
        category: ['Data', 'Edge fields'],
        defaultValue: defaultOptions.edgeFields.value,
        showIf: (options) => options.dataMode !== 'paths',
      })
      .addTextInput({
        path: 'edgeFields.time',
        name: 'Time field',
        description: 'Optional field used for playback buckets.',
        category: ['Data', 'Edge fields'],
        defaultValue: defaultOptions.edgeFields.time,
        showIf: (options) => options.dataMode !== 'paths',
      })
      .addTextInput({
        path: 'edgeFields.nodeGroup',
        name: 'Node group field',
        description: 'Optional field grouping related nodes.',
        category: ['Data', 'Edge fields'],
        defaultValue: defaultOptions.edgeFields.nodeGroup,
        showIf: (options) => options.dataMode !== 'paths',
      })
      .addTextInput({
        path: 'edgeFields.linkGroup',
        name: 'Link group field',
        description: 'Optional field grouping related links.',
        category: ['Data', 'Edge fields'],
        defaultValue: defaultOptions.edgeFields.linkGroup,
        showIf: (options) => options.dataMode !== 'paths',
      })
      .addTextInput({
        path: 'edgeFields.label',
        name: 'Label field',
        description: 'Optional field used for link labels.',
        category: ['Data', 'Edge fields'],
        defaultValue: defaultOptions.edgeFields.label,
        showIf: (options) => options.dataMode !== 'paths',
      })
      .addStringArray({
        path: 'edgeFields.tooltipFields',
        name: 'Tooltip fields',
        description: 'Additional fields shown in link tooltips.',
        category: ['Data', 'Edge fields'],
        defaultValue: defaultOptions.edgeFields.tooltipFields,
        showIf: (options) => options.dataMode !== 'paths',
      })
      .addStringArray({
        path: 'pathFields.stages',
        name: 'Stage fields',
        description: 'Fields that define the ordered path stages.',
        category: ['Data', 'Path fields'],
        defaultValue: defaultOptions.pathFields.stages,
        showIf: (options) => options.dataMode !== 'edges',
      })
      .addTextInput({
        path: 'pathFields.value',
        name: 'Value field (required)',
        description: 'Field containing the path value. Required for path data.',
        category: ['Data', 'Path fields'],
        defaultValue: defaultOptions.pathFields.value,
        showIf: (options) => options.dataMode !== 'edges',
      })
      .addTextInput({
        path: 'pathFields.time',
        name: 'Time field',
        description: 'Optional field used for playback buckets.',
        category: ['Data', 'Path fields'],
        defaultValue: defaultOptions.pathFields.time,
        showIf: (options) => options.dataMode !== 'edges',
      })
      .addStringArray({
        path: 'pathFields.tooltipFields',
        name: 'Tooltip fields',
        description: 'Additional fields shown in path tooltips.',
        category: ['Data', 'Path fields'],
        defaultValue: defaultOptions.pathFields.tooltipFields,
        showIf: (options) => options.dataMode !== 'edges',
      })
      .addBooleanSwitch({
        path: 'pathFields.scopeNodesByStage',
        name: 'Scope nodes by stage',
        description: 'Keep node names distinct when they occur in different stages.',
        category: ['Data', 'Path fields'],
        defaultValue: defaultOptions.pathFields.scopeNodesByStage,
        showIf: (options) => options.dataMode !== 'edges',
      })
      .addNestedOptions({
        path: 'layout',
        category: ['Layout'],
        defaultValue: defaultOptions.layout,
        build: (nested) =>
          nested
            .addSelect({
              path: 'direction',
              name: 'Direction',
              defaultValue: defaultOptions.layout.direction,
              ...enumOptions([
                { value: 'left-to-right', label: 'Left to right' },
                { value: 'right-to-left', label: 'Right to left' },
                { value: 'top-to-bottom', label: 'Top to bottom' },
              ]),
            })
            .addSelect({
              path: 'alignment',
              name: 'Node alignment',
              defaultValue: defaultOptions.layout.alignment,
              ...enumOptions([
                { value: 'justify', label: 'Justify' },
                { value: 'left', label: 'Left' },
                { value: 'right', label: 'Right' },
                { value: 'center', label: 'Center' },
              ]),
            })
            .addSelect({
              path: 'sort',
              name: 'Node sort',
              defaultValue: defaultOptions.layout.sort,
              ...enumOptions([
                { value: 'auto', label: 'Automatic' },
                { value: 'name', label: 'Name' },
                { value: 'value', label: 'Value' },
                { value: 'input', label: 'Input order' },
              ]),
            })
            .addSliderInput({
              path: 'nodeWidth',
              name: 'Node width',
              defaultValue: defaultOptions.layout.nodeWidth,
              settings: { min: 1, max: 100, step: 1 },
            })
            .addSliderInput({
              path: 'nodePadding',
              name: 'Node padding',
              defaultValue: defaultOptions.layout.nodePadding,
              settings: { min: 0, max: 100, step: 1 },
            })
            .addSliderInput({
              path: 'iterations',
              name: 'Layout iterations',
              defaultValue: defaultOptions.layout.iterations,
              settings: { min: 1, max: 200, step: 1 },
            })
            .addBooleanSwitch({
              path: 'enableCircular',
              name: 'Enable circular links',
              defaultValue: defaultOptions.layout.enableCircular,
            })
            .addSliderInput({
              path: 'circularLinkGap',
              name: 'Circular link gap',
              defaultValue: defaultOptions.layout.circularLinkGap,
              settings: { min: 0, max: 50, step: 1 },
              showIf: (options) => options.enableCircular,
            }),
      })
      .addNestedOptions({
        path: 'display',
        category: ['Display'],
        defaultValue: defaultOptions.display,
        build: (nested) =>
          nested
            .addBooleanSwitch({
              path: 'showLabels',
              name: 'Show labels',
              defaultValue: defaultOptions.display.showLabels,
            })
            .addBooleanSwitch({
              path: 'showValues',
              name: 'Show values',
              defaultValue: defaultOptions.display.showValues,
            })
            .addBooleanSwitch({
              path: 'showPercentages',
              name: 'Show percentages',
              defaultValue: defaultOptions.display.showPercentages,
            })
            .addBooleanSwitch({
              path: 'showStageHeaders',
              name: 'Show stage headers',
              defaultValue: defaultOptions.display.showStageHeaders,
            })
            .addSliderInput({
              path: 'linkOpacity',
              name: 'Link opacity',
              defaultValue: defaultOptions.display.linkOpacity,
              settings: { min: 0, max: 1, step: 0.01 },
            })
            .addSliderInput({
              path: 'dimOpacity',
              name: 'Dim opacity',
              defaultValue: defaultOptions.display.dimOpacity,
              settings: { min: 0, max: 1, step: 0.01 },
            })
            .addSelect({
              path: 'colorMode',
              name: 'Color mode',
              defaultValue: defaultOptions.display.colorMode,
              settings: { options: colorModeOptions },
            })
            .addColorPicker({
              path: 'fixedColor',
              name: 'Fixed color',
              defaultValue: defaultOptions.display.fixedColor,
              showIf: (options) => options.colorMode === 'fixed',
            })
            .addBooleanSwitch({
              path: 'usePatterns',
              name: 'Use patterns',
              defaultValue: defaultOptions.display.usePatterns,
            }),
      })
      .addNestedOptions({
        path: 'interaction',
        category: ['Interaction'],
        defaultValue: defaultOptions.interaction,
        build: (nested) =>
          nested
            .addBooleanSwitch({
              path: 'highlightPath',
              name: 'Highlight paths',
              defaultValue: defaultOptions.interaction.highlightPath,
            })
            .addBooleanSwitch({
              path: 'enableSelection',
              name: 'Enable selection',
              defaultValue: defaultOptions.interaction.enableSelection,
            })
            .addBooleanSwitch({
              path: 'enableSearch',
              name: 'Enable search',
              defaultValue: defaultOptions.interaction.enableSearch,
            })
            .addBooleanSwitch({
              path: 'enableCopy',
              name: 'Enable copy',
              defaultValue: defaultOptions.interaction.enableCopy,
            })
            .addNumberInput({
              path: 'minimumValue',
              name: 'Minimum value',
              defaultValue: defaultOptions.interaction.minimumValue,
              settings: { min: 0, step: 1 },
            })
            .addSliderInput({
              path: 'topN',
              name: 'Top N links',
              description: 'Limit the rendered links; use zero to show all links.',
              defaultValue: defaultOptions.interaction.topN,
              settings: { min: 0, max: 10000, step: 1 },
            }),
      })
      .addNestedOptions({
        path: 'playback',
        category: ['Playback'],
        defaultValue: defaultOptions.playback,
        build: (nested) =>
          nested
            .addSelect({
              path: 'mode',
              name: 'Time mode',
              defaultValue: defaultOptions.playback.mode,
              ...enumOptions([
                { value: 'snapshot', label: 'Snapshot' },
                { value: 'playback', label: 'Playback' },
              ]),
            })
            .addSliderInput({
              path: 'bucketSizeMs',
              name: 'Bucket size',
              defaultValue: defaultOptions.playback.bucketSizeMs,
              settings: { min: 1000, max: 86400000, step: 1000 },
              showIf: (options) => options.mode === 'playback',
            })
            .addSliderInput({
              path: 'speed',
              name: 'Playback speed',
              defaultValue: defaultOptions.playback.speed,
              settings: { min: 0.1, max: 10, step: 0.1 },
              showIf: (options) => options.mode === 'playback',
            })
            .addBooleanSwitch({
              path: 'loop',
              name: 'Loop playback',
              defaultValue: defaultOptions.playback.loop,
              showIf: (options) => options.mode === 'playback',
            })
            .addBooleanSwitch({
              path: 'autoplay',
              name: 'Autoplay',
              defaultValue: defaultOptions.playback.autoplay,
              showIf: (options) => options.mode === 'playback',
            })
            .addSliderInput({
              path: 'maxFrames',
              name: 'Maximum frames',
              defaultValue: defaultOptions.playback.maxFrames,
              settings: { min: 1, max: 10000, step: 1 },
              showIf: (options) => options.mode === 'playback',
            }),
      })
      .addNestedOptions({
        path: 'performance',
        category: ['Performance'],
        defaultValue: defaultOptions.performance,
        build: (nested) =>
          nested
            .addSelect({
              path: 'renderer',
              name: 'Renderer',
              defaultValue: defaultOptions.performance.renderer,
              ...enumOptions([
                { value: 'auto', label: 'Automatic' },
                { value: 'svg', label: 'SVG' },
                { value: 'hybrid', label: 'Hybrid' },
              ]),
            })
            .addSliderInput({
              path: 'hybridLinkThreshold',
              name: 'Hybrid link threshold',
              defaultValue: defaultOptions.performance.hybridLinkThreshold,
              settings: { min: 1, max: 1000000, step: 1 },
              showIf: (options) => options.renderer !== 'svg',
            })
            .addSliderInput({
              path: 'maxNodes',
              name: 'Maximum nodes',
              defaultValue: defaultOptions.performance.maxNodes,
              settings: { min: 1, max: 100000, step: 1 },
            })
            .addSliderInput({
              path: 'maxLinks',
              name: 'Maximum links',
              defaultValue: defaultOptions.performance.maxLinks,
              settings: { min: 1, max: 1000000, step: 1 },
            }),
      })
      .addNestedOptions({
        path: 'accessibility',
        category: ['Accessibility'],
        defaultValue: defaultOptions.accessibility,
        build: (nested) =>
          nested
            .addBooleanSwitch({
              path: 'showAccessibleTable',
              name: 'Show accessible table',
              defaultValue: defaultOptions.accessibility.showAccessibleTable,
            })
            .addBooleanSwitch({
              path: 'highContrast',
              name: 'High contrast',
              defaultValue: defaultOptions.accessibility.highContrast,
            })
            .addSelect({
              path: 'reduceMotion',
              name: 'Reduce motion',
              defaultValue: defaultOptions.accessibility.reduceMotion,
              ...enumOptions([
                { value: 'system', label: 'Use system setting' },
                { value: 'always', label: 'Always reduce' },
                { value: 'never', label: 'Never reduce' },
              ]),
            }),
      });
  })
  .setMigrationHandler(migrationHandler);
