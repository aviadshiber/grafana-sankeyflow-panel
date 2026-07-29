import React, { KeyboardEvent, useCallback, useEffect, useId, useMemo, useState } from 'react';
import type { PanelProps } from '@grafana/data';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import { parsePanelData } from '../data';
import type { GraphDiagnostic, ParsedPanelData, SankeyGraph } from '../data/model';
import { layoutSankey, type SankeyScene, type SankeySceneLink, type SankeySceneNode } from '../layout';
import { defaultOptions, type SankeyFlowOptions } from '../types';
import { linkPath, SankeyFlowCanvas, type LinkPaint } from './SankeyFlowCanvas';

type SelectedItem = { kind: 'node' | 'link'; id: string } | undefined;

type SelectionDetailsDto =
  | { kind: 'node'; id: string; name: string; value: number }
  | {
      kind: 'link';
      id: string;
      source: { id: string; name: string };
      target: { id: string; name: string };
      value: number;
      label?: string;
    };

interface GraphIndex {
  linkById: Map<string, SankeyGraph['links'][number]>;
  nodeById: Map<string, SankeyGraph['nodes'][number]>;
  linksByNode: Map<string, Array<SankeyGraph['links'][number]>>;
}

const MAX_HYBRID_INTERACTION_OVERLAYS = 200;

interface Presentation {
  parsed?: ParsedPanelData;
  error?: string;
}

interface LayoutPresentation {
  error?: string;
  scene?: SankeyScene;
}

const styles = {
  panel: css`
    color: var(--text-primary, inherit);
    font-family: Inter, Roboto, Helvetica, Arial, sans-serif;
    height: 100%;
    min-height: 0;
    overflow: auto;
    position: relative;
    width: 100%;
  `,
  toolbar: css`
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-height: 30px;
    padding: 2px 4px 4px;
  `,
  input: css`
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 3px;
    color: inherit;
    font: inherit;
    max-width: 190px;
    padding: 3px 6px;
  `,
  button: css`
    background: transparent;
    border: 1px solid currentColor;
    border-radius: 3px;
    color: inherit;
    cursor: pointer;
    font: inherit;
    padding: 3px 7px;
  `,
  canvasLayer: css`
    inset: 0;
    position: absolute;
  `,
  diagram: css`
    min-height: 0;
    overflow: auto;
    position: relative;
  `,
  svg: css`
    display: block;
    overflow: visible;
  `,
  focusable: css`
    outline: none;
    &:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
  `,
  state: css`
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: 8px;
    justify-content: center;
    min-height: 120px;
    padding: 16px;
    text-align: center;
  `,
  diagnostics: css`
    font-size: 12px;
    margin: 4px 0 0;
    max-height: 86px;
    overflow: auto;
    padding: 0 4px;
  `,
  selection: css`
    border-left: 3px solid currentColor;
    font-size: 12px;
    margin: 0 4px 4px;
    padding: 3px 7px;
  `,
  table: css`
    border-collapse: collapse;
    font-size: 12px;
    margin: 6px 4px;
    width: calc(100% - 8px);
    td,
    th {
      border-bottom: 1px solid currentColor;
      padding: 4px;
      text-align: left;
    }
  `,
};

function resolveOptions(options: SankeyFlowOptions): SankeyFlowOptions {
  return {
    ...defaultOptions,
    ...options,
    accessibility: { ...defaultOptions.accessibility, ...options.accessibility },
    display: { ...defaultOptions.display, ...options.display },
    edgeFields: { ...defaultOptions.edgeFields, ...options.edgeFields },
    interaction: { ...defaultOptions.interaction, ...options.interaction },
    layout: { ...defaultOptions.layout, ...options.layout },
    pathFields: { ...defaultOptions.pathFields, ...options.pathFields },
    performance: { ...defaultOptions.performance, ...options.performance },
    playback: { ...defaultOptions.playback, ...options.playback },
  };
}

function formatValue(value: number, parsed: ParsedPanelData): string {
  const display = parsed.valueField?.display;
  if (display) {
    return display(value).text;
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
}

function safeSize(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function onActivate(event: KeyboardEvent<SVGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    action();
  }
}

function containsText(value: string, query: string): boolean {
  return query === '' || value.toLocaleLowerCase().includes(query.toLocaleLowerCase());
}

function indexGraph(graph: SankeyGraph): GraphIndex {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const linkById = new Map(graph.links.map((link) => [link.id, link]));
  const linksByNode = new Map<string, Array<SankeyGraph['links'][number]>>();
  for (const link of graph.links) {
    for (const nodeId of [link.source, link.target]) {
      const links = linksByNode.get(nodeId);
      if (links) {
        links.push(link);
      } else {
        linksByNode.set(nodeId, [link]);
      }
    }
  }
  return { linkById, nodeById, linksByNode };
}

function relatedPath(index: GraphIndex, selected: SelectedItem): Set<string> | undefined {
  if (!selected) {
    return undefined;
  }
  const startingNodes =
    selected.kind === 'node'
      ? [selected.id]
      : (() => {
          const link = index.linkById.get(selected.id);
          return link ? [link.source, link.target] : [];
        })();
  const nodeIds = new Set(startingNodes);
  const linkIds = new Set<string>();
  const pending = [...startingNodes];
  while (pending.length) {
    const nodeId = pending.pop()!;
    for (const link of index.linksByNode.get(nodeId) ?? []) {
      linkIds.add(link.id);
      const nextNodeId = link.source === nodeId ? link.target : link.source;
      if (!nodeIds.has(nextNodeId)) {
        nodeIds.add(nextNodeId);
        pending.push(nextNodeId);
      }
    }
  }
  return new Set([...nodeIds, ...linkIds]);
}

function nodeName(index: GraphIndex, id: string): string {
  return index.nodeById.get(id)?.name ?? id;
}

function selectionDetails(index: GraphIndex, selected: SelectedItem): SelectionDetailsDto | undefined {
  if (!selected) {
    return undefined;
  }
  if (selected.kind === 'node') {
    const node = index.nodeById.get(selected.id);
    return node && { kind: 'node', id: node.id, name: node.name, value: node.value };
  }
  const link = index.linkById.get(selected.id);
  return (
    link && {
      kind: 'link',
      id: link.id,
      source: { id: link.source, name: nodeName(index, link.source) },
      target: { id: link.target, name: nodeName(index, link.target) },
      value: link.value,
      ...(link.label === undefined ? {} : { label: link.label }),
    }
  );
}

function getStageHeaders(
  scene: SankeyScene
): Array<{ label: string; textAnchor: 'middle' | 'start'; x: number; y: number }> {
  const stages = new Map<number, SankeySceneNode[]>();
  for (const node of scene.nodes) {
    if (node.node.stage !== undefined) {
      stages.set(node.node.stage, [...(stages.get(node.node.stage) ?? []), node]);
    }
  }
  return [...stages.entries()].map(([stage, nodes]) => {
    const x = nodes.reduce((sum, node) => sum + (node.x0 + node.x1) / 2, 0) / nodes.length;
    const y = nodes.reduce((sum, node) => sum + (node.y0 + node.y1) / 2, 0) / nodes.length;
    return scene.direction === 'top-to-bottom'
      ? { label: `Stage ${stage + 1}`, textAnchor: 'start', x: 4, y }
      : { label: `Stage ${stage + 1}`, textAnchor: 'middle', x, y: 12 };
  });
}

function diagnosticsList(diagnostics: GraphDiagnostic[]) {
  if (!diagnostics.length) {
    return null;
  }
  return (
    <details className={styles.diagnostics} open>
      <summary>Diagnostics ({diagnostics.length})</summary>
      <ul>
        {diagnostics.map((diagnostic, index) => (
          <li key={`${diagnostic.code}-${diagnostic.rowIndex ?? index}`}>{diagnostic.message}</li>
        ))}
      </ul>
    </details>
  );
}

function PlaybackControls({
  frames,
  options,
  reducedMotion,
  onFrame,
}: {
  frames: ParsedPanelData['frames'];
  options: SankeyFlowOptions;
  reducedMotion: boolean;
  onFrame: (index: number) => void;
}) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(options.playback.autoplay && !reducedMotion);
  const [speed, setSpeed] = useState(options.playback.speed);
  const [loop, setLoop] = useState(options.playback.loop);
  const lastIndex = Math.max(0, frames.length - 1);
  const currentIndex = Math.min(index, lastIndex);

  useEffect(() => {
    onFrame(currentIndex);
  }, [currentIndex, onFrame]);
  useEffect(() => {
    if (!playing || frames.length < 2 || reducedMotion) {
      return;
    }
    const timer = window.setInterval(
      () => {
        setIndex((current) => {
          if (current < lastIndex) {
            return current + 1;
          }
          if (loop) {
            return 0;
          }
          setPlaying(false);
          return current;
        });
      },
      Math.max(100, 1000 / Math.max(0.25, speed))
    );
    return () => window.clearInterval(timer);
  }, [frames.length, lastIndex, loop, playing, reducedMotion, speed]);

  if (frames.length === 0) {
    return null;
  }
  const timestamp = frames[currentIndex]?.timestamp;
  return (
    <div aria-label="Playback controls" className={styles.toolbar} role="group">
      <button
        className={styles.button}
        disabled={reducedMotion}
        onClick={() => setPlaying((current) => !current)}
        type="button"
      >
        {playing ? 'Pause' : 'Play'}
      </button>
      <input
        aria-label="Playback position"
        max={lastIndex}
        min="0"
        onChange={(event) => setIndex(Number(event.currentTarget.value))}
        type="range"
        value={currentIndex}
      />
      <label>
        Speed{' '}
        <select
          aria-label="Playback speed"
          onChange={(event) => setSpeed(Number(event.currentTarget.value))}
          value={speed}
        >
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
          <option value="4">4×</option>
        </select>
      </label>
      <button
        aria-pressed={loop}
        className={styles.button}
        onClick={() => setLoop((current) => !current)}
        type="button"
      >
        Loop
      </button>
      <output aria-label="Current timestamp">
        {timestamp === undefined ? 'No timestamp' : new Date(timestamp).toISOString()}
      </output>
    </div>
  );
}

function AccessibleTable({
  graph,
  index,
  onSelect,
  parsed,
  selected,
  selectionEnabled,
  visible,
}: {
  graph: SankeyGraph;
  index: GraphIndex;
  onSelect: (item: Exclude<SelectedItem, undefined>) => void;
  parsed: ParsedPanelData;
  selected: SelectedItem;
  selectionEnabled: boolean;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }
  return (
    <table aria-label="Sankey flow data" className={styles.table}>
      <caption>Sankey flow data</caption>
      <thead>
        <tr>
          <th>Source</th>
          <th>Target</th>
          <th>Value</th>
          {selectionEnabled && <th>Select</th>}
        </tr>
      </thead>
      <tbody>
        {graph.links.map((link) => (
          <tr key={link.id}>
            <td>{nodeName(index, link.source)}</td>
            <td>{nodeName(index, link.target)}</td>
            <td>{formatValue(link.value, parsed)}</td>
            {selectionEnabled && (
              <td>
                <button
                  aria-pressed={selected?.kind === 'link' && selected.id === link.id}
                  className={styles.button}
                  onClick={() => onSelect({ kind: 'link', id: link.id })}
                  type="button"
                >
                  Select {nodeName(index, link.source)} to {nodeName(index, link.target)}
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const SankeyFlowPanel: React.FC<PanelProps<SankeyFlowOptions>> = ({
  data,
  height,
  options: rawOptions,
  width,
}) => {
  const theme = useTheme2();
  const options = useMemo(() => resolveOptions(rawOptions), [rawOptions]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SelectedItem>();
  const [frameIndex, setFrameIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const patternId = `sankey-flow-pattern-${useId().replace(/:/g, '')}`;
  const reducedMotion =
    options.accessibility.reduceMotion === 'always' ||
    (options.accessibility.reduceMotion === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  const presentation = useMemo<Presentation>(() => {
    try {
      return { parsed: parsePanelData({ frames: data.series, options }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'The panel data could not be parsed.' };
    }
  }, [data.series, options]);
  const parsed = presentation.parsed;
  const graph =
    options.playback.mode === 'playback'
      ? parsed?.frames[Math.min(frameIndex, Math.max(0, (parsed?.frames.length ?? 0) - 1))]?.graph
      : parsed?.graph;
  const graphIndex = useMemo(() => graph && indexGraph(graph), [graph]);
  const scenePresentation = useMemo<LayoutPresentation>(() => {
    if (!graph || graph.total <= 0) {
      return {};
    }
    const sceneWidth = safeSize(width);
    const sceneHeight = Math.max(0, safeSize(height) - 38);
    if (sceneWidth < 24 || sceneHeight < 24) {
      return { error: 'Panel is too small to display a Sankey flow.' };
    }
    try {
      return { scene: layoutSankey(graph, { width: sceneWidth, height: sceneHeight }, options.layout) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'The Sankey layout failed.' };
    }
  }, [graph, height, options.layout, width]);
  const scene = scenePresentation.scene;
  const highlighted = useMemo(
    () => (graphIndex && options.interaction.highlightPath ? relatedPath(graphIndex, selected) : undefined),
    [graphIndex, options.interaction.highlightPath, selected]
  );
  const useHybrid =
    scene !== undefined &&
    (options.performance.renderer === 'hybrid' ||
      (options.performance.renderer === 'auto' && scene.links.length > options.performance.hybridLinkThreshold));
  const sceneLinkById = useMemo(() => new Map(scene?.links.map((link) => [link.id, link])), [scene]);
  const hybridOverlayLinks = useMemo(() => {
    if (!useHybrid || !options.interaction.enableSelection || !scene) {
      return [];
    }
    if (scene.links.length <= MAX_HYBRID_INTERACTION_OVERLAYS) {
      return scene.links;
    }
    const selectedLink = selected?.kind === 'link' ? sceneLinkById.get(selected.id) : undefined;
    return selectedLink ? [selectedLink] : [];
  }, [options.interaction.enableSelection, scene, sceneLinkById, selected, useHybrid]);
  const primaryColor = theme.colors.primary.main;
  const mutedColor = theme.colors.text.secondary;
  const contrastColor = options.accessibility.highContrast ? theme.colors.text.primary : primaryColor;
  const colorFor = useCallback(
    (key: string): string => {
      if (options.display.colorMode === 'fixed') {
        return options.display.fixedColor || primaryColor;
      }
      if (
        options.accessibility.highContrast ||
        !['categorical', 'source', 'target'].includes(options.display.colorMode)
      ) {
        return contrastColor;
      }
      const palette = [primaryColor, '#73bf69', '#ff9830', '#b877d9', '#f2495c', '#33a2e5'];
      const hash = [...key].reduce((value, character) => ((value << 5) - value + character.charCodeAt(0)) | 0, 0);
      return palette[Math.abs(hash) % palette.length];
    },
    [
      contrastColor,
      options.accessibility.highContrast,
      options.display.colorMode,
      options.display.fixedColor,
      primaryColor,
    ]
  );
  const linkPaint = useCallback(
    (link: SankeySceneLink): LinkPaint => {
      const isHighlighted = highlighted?.has(link.id) ?? true;
      const matches = containsText(link.link.label ?? `${link.link.source} ${link.link.target}`, query);
      const colorKey =
        options.display.colorMode === 'source'
          ? link.link.source
          : options.display.colorMode === 'target'
            ? link.link.target
            : (link.link.group ?? link.id);
      return {
        color: colorFor(colorKey),
        opacity: isHighlighted && matches ? options.display.linkOpacity : options.display.dimOpacity,
      };
    },
    [colorFor, highlighted, options.display.colorMode, options.display.dimOpacity, options.display.linkOpacity, query]
  );
  const select = useCallback((item: Exclude<SelectedItem, undefined>) => {
    setCopied(false);
    setSelected((current) => (current?.kind === item.kind && current.id === item.id ? undefined : item));
  }, []);
  const selectedDto = useMemo(() => graphIndex && selectionDetails(graphIndex, selected), [graphIndex, selected]);
  const selectedDetails =
    selectedDto && parsed
      ? selectedDto.kind === 'node'
        ? `${selectedDto.name}: ${formatValue(selectedDto.value, parsed)}`
        : `${selectedDto.source.name} to ${selectedDto.target.name}: ${formatValue(selectedDto.value, parsed)}`
      : undefined;
  const copySelected = async () => {
    if (!selectedDto) {
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedDto, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (presentation.error) {
    return (
      <div className={styles.state} role="alert">
        <strong>Unable to read Sankey data</strong>
        <span>{presentation.error}</span>
      </div>
    );
  }
  if (!parsed || !graph || graph.links.length === 0 || graph.total <= 0) {
    return (
      <div className={styles.state} role="status">
        <strong>No Sankey flow to display</strong>
        <span>
          {graph && graph.links.length > 0
            ? 'At least one link must have a positive value.'
            : 'Provide source, target, and value fields, or two path stages and a value.'}
        </span>
        {parsed && diagnosticsList(parsed.graph.diagnostics)}
      </div>
    );
  }
  if (scenePresentation.error || !scene) {
    return (
      <div className={styles.state} role="alert">
        <strong>Unable to lay out Sankey flow</strong>
        <span>{scenePresentation.error}</span>
        {diagnosticsList(graph.diagnostics)}
      </div>
    );
  }

  const headers = options.display.showStageHeaders ? getStageHeaders(scene) : [];
  const summary = `${graph.nodes.length} nodes, ${graph.links.length} links, total ${formatValue(graph.total, parsed)}.`;
  return (
    <section aria-label={`Sankey flow: ${summary}`} className={styles.panel}>
      <div className={styles.toolbar}>
        {options.interaction.enableSearch && (
          <input
            aria-label="Search Sankey flow"
            className={styles.input}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Search nodes or links"
            type="search"
            value={query}
          />
        )}
        {options.interaction.enableCopy && selected && (
          <button className={styles.button} onClick={copySelected} type="button">
            {copied ? 'Copied details' : 'Copy details'}
          </button>
        )}
        <span aria-live="polite">{selected ? `Selected ${selected.kind}` : summary}</span>
      </div>
      {selectedDetails && (
        <div aria-label="Selection details" className={styles.selection} role="status">
          {selectedDetails}
        </div>
      )}
      {options.playback.mode === 'playback' && (
        <PlaybackControls
          frames={parsed.frames}
          key={parsed.frames.map((frame) => frame.timestamp).join(',')}
          onFrame={setFrameIndex}
          options={options}
          reducedMotion={reducedMotion}
        />
      )}
      <div
        className={styles.diagram}
        style={{ height: Math.max(0, safeSize(height) - (options.playback.mode === 'playback' ? 68 : 34)) }}
      >
        {useHybrid && (
          <div className={styles.canvasLayer}>
            <SankeyFlowCanvas
              linkPaint={linkPaint}
              pattern={{ color: contrastColor, enabled: options.display.usePatterns }}
              scene={scene}
            />
          </div>
        )}
        <svg
          aria-label={`Sankey diagram, ${summary}`}
          className={styles.svg}
          height={scene.height}
          role="group"
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          width={scene.width}
        >
          <defs>
            <pattern height="6" id={patternId} patternUnits="userSpaceOnUse" width="6">
              <path d="M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5" stroke={contrastColor} strokeWidth="1" />
            </pattern>
          </defs>
          {!useHybrid &&
            scene.links.map((link) => {
              const paint = linkPaint(link);
              return (
                <path
                  aria-label={`${nodeName(graphIndex!, link.link.source)} to ${nodeName(graphIndex!, link.link.target)}: ${formatValue(link.link.value, parsed)}`}
                  aria-pressed={
                    options.interaction.enableSelection
                      ? selected?.kind === 'link' && selected.id === link.id
                      : undefined
                  }
                  className={styles.focusable}
                  d={linkPath(link, scene)}
                  fill="none"
                  key={link.id}
                  onClick={() => options.interaction.enableSelection && select({ kind: 'link', id: link.id })}
                  onKeyDown={(event) =>
                    onActivate(
                      event,
                      () => options.interaction.enableSelection && select({ kind: 'link', id: link.id })
                    )
                  }
                  role={options.interaction.enableSelection ? 'button' : 'img'}
                  stroke={options.display.usePatterns ? `url(#${patternId})` : paint.color}
                  strokeLinecap="round"
                  strokeOpacity={paint.opacity}
                  strokeWidth={Math.max(1, link.width)}
                  tabIndex={options.interaction.enableSelection ? 0 : -1}
                />
              );
            })}
          {useHybrid &&
            hybridOverlayLinks.map((link) => (
              <path
                aria-label={`${nodeName(graphIndex!, link.link.source)} to ${nodeName(graphIndex!, link.link.target)}: ${formatValue(link.link.value, parsed)}`}
                aria-pressed={selected?.kind === 'link' && selected.id === link.id}
                className={styles.focusable}
                d={linkPath(link, scene)}
                fill="none"
                key={link.id}
                onClick={() => select({ kind: 'link', id: link.id })}
                onKeyDown={(event) => onActivate(event, () => select({ kind: 'link', id: link.id }))}
                role="button"
                stroke="transparent"
                strokeWidth={Math.max(10, link.width)}
                tabIndex={0}
              />
            ))}
          {headers.map((header) => (
            <text
              fill={mutedColor}
              fontSize="11"
              key={header.label}
              textAnchor={header.textAnchor}
              x={header.x}
              y={header.y}
            >
              {header.label}
            </text>
          ))}
          {scene.nodes.map((node) => {
            const visible = containsText(node.node.name, query);
            const active = highlighted?.has(node.id) ?? true;
            const percentage = graph.total > 0 ? `${((node.node.value / graph.total) * 100).toFixed(1)}%` : '';
            const label = [
              node.node.name,
              options.display.showValues ? formatValue(node.node.value, parsed) : '',
              options.display.showPercentages ? percentage : '',
            ]
              .filter(Boolean)
              .join(' · ');
            const ariaLabel = [node.node.name, formatValue(node.node.value, parsed), percentage]
              .filter(Boolean)
              .join(' · ');
            const labelOnRight = (node.x0 + node.x1) / 2 < scene.width / 2;
            return (
              <g
                aria-label={ariaLabel}
                aria-pressed={
                  options.interaction.enableSelection ? selected?.kind === 'node' && selected.id === node.id : undefined
                }
                className={styles.focusable}
                key={node.id}
                onClick={() => options.interaction.enableSelection && select({ kind: 'node', id: node.id })}
                onKeyDown={(event) =>
                  onActivate(event, () => options.interaction.enableSelection && select({ kind: 'node', id: node.id }))
                }
                role={options.interaction.enableSelection ? 'button' : 'img'}
                tabIndex={options.interaction.enableSelection ? 0 : -1}
              >
                <rect
                  fill={options.display.usePatterns ? `url(#${patternId})` : colorFor(node.node.group ?? node.id)}
                  fillOpacity={visible && active ? 1 : options.display.dimOpacity}
                  height={Math.max(1, node.y1 - node.y0)}
                  rx="2"
                  width={Math.max(1, node.x1 - node.x0)}
                  x={node.x0}
                  y={node.y0}
                />
                {options.display.showLabels && (
                  <text
                    fill={theme.colors.text.primary}
                    fontSize="11"
                    pointerEvents="none"
                    textAnchor={labelOnRight ? 'start' : 'end'}
                    x={labelOnRight ? node.x1 + 5 : node.x0 - 5}
                    y={(node.y0 + node.y1) / 2}
                  >
                    {label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {diagnosticsList(graph.diagnostics)}
      <AccessibleTable
        graph={graph}
        index={graphIndex!}
        onSelect={select}
        parsed={parsed}
        selected={selected}
        selectionEnabled={options.interaction.enableSelection}
        visible={options.accessibility.showAccessibleTable}
      />
    </section>
  );
};
