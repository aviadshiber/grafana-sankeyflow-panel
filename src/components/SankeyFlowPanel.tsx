import React, { KeyboardEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { PanelProps } from '@grafana/data';
import { css } from '@emotion/css';
import { useTheme2 } from '@grafana/ui';
import { parsePanelData } from '../data';
import type { GraphDiagnostic, ParsedPanelData, SankeyGraph } from '../data/model';
import { layoutSankey, type SankeyScene, type SankeySceneLink, type SankeySceneNode } from '../layout';
import { defaultOptions, type SankeyFlowOptions } from '../types';
import { linkPath, SankeyFlowCanvas, type LinkPaint } from './SankeyFlowCanvas';

type SelectedItem = { kind: 'node' | 'link'; id: string } | undefined;

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

function relatedPath(graph: SankeyGraph, selected: SelectedItem): Set<string> | undefined {
  if (!selected) {
    return undefined;
  }
  const startingNodes = selected.kind === 'node'
    ? [selected.id]
    : graph.links.filter((link) => link.id === selected.id).flatMap((link) => [link.source, link.target]);
  const nodeIds = new Set(startingNodes);
  const linkIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const link of graph.links) {
      if (nodeIds.has(link.source) || nodeIds.has(link.target)) {
        linkIds.add(link.id);
        for (const id of [link.source, link.target]) {
          if (!nodeIds.has(id)) {
            nodeIds.add(id);
            changed = true;
          }
        }
      }
    }
  }
  return new Set([...nodeIds, ...linkIds]);
}

function nodeName(graph: SankeyGraph, id: string): string {
  return graph.nodes.find((node) => node.id === id)?.name ?? id;
}

function getStageHeaders(scene: SankeyScene): Array<{ label: string; textAnchor: 'middle' | 'start'; x: number; y: number }> {
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
        {diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${diagnostic.rowIndex ?? index}`}>{diagnostic.message}</li>)}
      </ul>
    </details>
  );
}

function PlaybackControls({ frames, options, reducedMotion, onFrame }: { frames: ParsedPanelData['frames']; options: SankeyFlowOptions; reducedMotion: boolean; onFrame: (index: number) => void }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(options.playback.autoplay && !reducedMotion);
  const [speed, setSpeed] = useState(options.playback.speed);
  const [loop, setLoop] = useState(options.playback.loop);
  const lastIndex = Math.max(0, frames.length - 1);
  const currentIndex = Math.min(index, lastIndex);

  useEffect(() => { onFrame(currentIndex); }, [currentIndex, onFrame]);
  useEffect(() => {
    if (!playing || frames.length < 2 || reducedMotion) {
      return;
    }
    const timer = window.setInterval(() => {
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
    }, Math.max(100, 1000 / Math.max(0.25, speed)));
    return () => window.clearInterval(timer);
  }, [frames.length, lastIndex, loop, playing, reducedMotion, speed]);

  if (frames.length === 0) {
    return null;
  }
  const timestamp = frames[currentIndex]?.timestamp;
  return (
    <div aria-label="Playback controls" className={styles.toolbar} role="group">
      <button className={styles.button} disabled={reducedMotion} onClick={() => setPlaying((current) => !current)} type="button">
        {playing ? 'Pause' : 'Play'}
      </button>
      <input aria-label="Playback position" max={lastIndex} min="0" onChange={(event) => setIndex(Number(event.currentTarget.value))} type="range" value={currentIndex} />
      <label>Speed <select aria-label="Playback speed" onChange={(event) => setSpeed(Number(event.currentTarget.value))} value={speed}><option value="0.5">0.5×</option><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label>
      <button aria-pressed={loop} className={styles.button} onClick={() => setLoop((current) => !current)} type="button">Loop</button>
      <output aria-label="Current timestamp">{timestamp === undefined ? 'No timestamp' : new Date(timestamp).toISOString()}</output>
    </div>
  );
}

function AccessibleTable({ graph, parsed, visible }: { graph: SankeyGraph; parsed: ParsedPanelData; visible: boolean }) {
  if (!visible) {
    return null;
  }
  return (
    <table aria-label="Sankey flow data" className={styles.table}>
      <caption>Sankey flow data</caption>
      <thead><tr><th>Source</th><th>Target</th><th>Value</th></tr></thead>
      <tbody>{graph.links.map((link) => <tr key={link.id}><td>{graph.nodes.find((node) => node.id === link.source)?.name ?? link.source}</td><td>{graph.nodes.find((node) => node.id === link.target)?.name ?? link.target}</td><td>{formatValue(link.value, parsed)}</td></tr>)}</tbody>
    </table>
  );
}

export const SankeyFlowPanel: React.FC<PanelProps<SankeyFlowOptions>> = ({ data, height, options: rawOptions, width }) => {
  const theme = useTheme2();
  const options = useMemo(() => resolveOptions(rawOptions), [rawOptions]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SelectedItem>();
  const [frameIndex, setFrameIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const reducedMotion = options.accessibility.reduceMotion === 'always' || (options.accessibility.reduceMotion === 'system' && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  const presentation = useMemo<Presentation>(() => {
    try {
      return { parsed: parsePanelData({ frames: data.series, options }) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'The panel data could not be parsed.' };
    }
  }, [data.series, options]);
  const parsed = presentation.parsed;
  const graph = parsed?.frames.length && options.playback.mode === 'playback' ? parsed.frames[Math.min(frameIndex, parsed.frames.length - 1)]?.graph : parsed?.graph;
  const scenePresentation = useMemo<LayoutPresentation>(() => {
    if (!graph) {
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
  const highlighted = graph && options.interaction.highlightPath ? relatedPath(graph, selected) : undefined;
  const useHybrid = scene !== undefined && (options.performance.renderer === 'hybrid' || (options.performance.renderer === 'auto' && scene.links.length > options.performance.hybridLinkThreshold));
  const primaryColor = theme.colors.primary.main;
  const mutedColor = theme.colors.text.secondary;
  const contrastColor = options.accessibility.highContrast ? theme.colors.text.primary : primaryColor;
  const colorFor = useCallback((key: string): string => {
    if (options.display.colorMode === 'fixed') {
      return options.display.fixedColor || primaryColor;
    }
    if (options.accessibility.highContrast || !['categorical', 'source', 'target'].includes(options.display.colorMode)) {
      return contrastColor;
    }
    const palette = [primaryColor, '#73bf69', '#ff9830', '#b877d9', '#f2495c', '#33a2e5'];
    const hash = [...key].reduce((value, character) => ((value << 5) - value + character.charCodeAt(0)) | 0, 0);
    return palette[Math.abs(hash) % palette.length];
  }, [contrastColor, options.accessibility.highContrast, options.display.colorMode, options.display.fixedColor, primaryColor]);
  const linkPaint = useCallback((link: SankeySceneLink): LinkPaint => {
    const isHighlighted = highlighted?.has(link.id) ?? true;
    const matches = containsText(link.link.label ?? `${link.link.source} ${link.link.target}`, query);
    const colorKey = options.display.colorMode === 'source' ? link.link.source : options.display.colorMode === 'target' ? link.link.target : link.link.group ?? link.id;
    return { color: colorFor(colorKey), opacity: isHighlighted && matches ? options.display.linkOpacity : options.display.dimOpacity };
  }, [colorFor, highlighted, options.display.colorMode, options.display.dimOpacity, options.display.linkOpacity, query]);
  const select = (item: Exclude<SelectedItem, undefined>) => setSelected((current) => current?.kind === item.kind && current.id === item.id ? undefined : item);
  const selectedDetails = useMemo(() => {
    if (!selected || !graph || !parsed) {
      return undefined;
    }
    if (selected.kind === 'node') {
      const node = graph.nodes.find((candidate) => candidate.id === selected.id);
      return node ? `${node.name}: ${formatValue(node.value, parsed)}` : undefined;
    }
    const link = graph.links.find((candidate) => candidate.id === selected.id);
    return link
      ? `${nodeName(graph, link.source)} to ${nodeName(graph, link.target)}: ${formatValue(link.value, parsed)}`
      : undefined;
  }, [graph, parsed, selected]);
  const copySelected = async () => {
    if (!selected || !graph) {
      return;
    }
    const item = selected.kind === 'node' ? graph.nodes.find((node) => node.id === selected.id) : graph.links.find((link) => link.id === selected.id);
    if (!item) {
      return;
    }
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(item, null, 2));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (presentation.error) {
    return <div className={styles.state} role="alert"><strong>Unable to read Sankey data</strong><span>{presentation.error}</span></div>;
  }
  if (!parsed || !graph || graph.links.length === 0) {
    return <div className={styles.state} role="status"><strong>No Sankey flow to display</strong><span>Provide source, target, and value fields, or two path stages and a value.</span>{parsed && diagnosticsList(parsed.graph.diagnostics)}</div>;
  }
  if (scenePresentation.error || !scene) {
    return <div className={styles.state} role="alert"><strong>Unable to lay out Sankey flow</strong><span>{scenePresentation.error}</span>{diagnosticsList(graph.diagnostics)}</div>;
  }

  const headers = options.display.showStageHeaders ? getStageHeaders(scene) : [];
  const summary = `${graph.nodes.length} nodes, ${graph.links.length} links, total ${formatValue(graph.total, parsed)}.`;
  return (
    <section aria-label={`Sankey flow: ${summary}`} className={styles.panel}>
      <div className={styles.toolbar}>
        {options.interaction.enableSearch && <input aria-label="Search Sankey flow" className={styles.input} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search nodes or links" type="search" value={query} />}
        {options.interaction.enableCopy && selected && <button className={styles.button} onClick={copySelected} type="button">{copied ? 'Copied details' : 'Copy details'}</button>}
        <span aria-live="polite">{selected ? `Selected ${selected.kind}` : summary}</span>
      </div>
      {selectedDetails && <div aria-label="Selection details" className={styles.selection} role="status">{selectedDetails}</div>}
      {options.playback.mode === 'playback' && <PlaybackControls frames={parsed.frames} key={parsed.frames.map((frame) => frame.timestamp).join(',')} onFrame={setFrameIndex} options={options} reducedMotion={reducedMotion} />}
      <div className={styles.diagram} style={{ height: Math.max(0, safeSize(height) - (options.playback.mode === 'playback' ? 68 : 34)) }}>
        {useHybrid && <div className={styles.canvasLayer}><SankeyFlowCanvas linkPaint={linkPaint} scene={scene} /></div>}
        <svg aria-label={`Sankey diagram, ${summary}`} className={styles.svg} height={scene.height} role="group" viewBox={`0 0 ${scene.width} ${scene.height}`} width={scene.width}>
          <defs>
            <pattern height="6" id="sankey-flow-pattern" patternUnits="userSpaceOnUse" width="6"><path d="M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5" stroke={contrastColor} strokeWidth="1" /></pattern>
          </defs>
          {!useHybrid && scene.links.map((link) => {
            const paint = linkPaint(link);
            return <path aria-label={`${nodeName(graph, link.link.source)} to ${nodeName(graph, link.link.target)}: ${formatValue(link.link.value, parsed)}`} aria-pressed={options.interaction.enableSelection ? selected?.kind === 'link' && selected.id === link.id : undefined} className={styles.focusable} d={linkPath(link, scene)} fill="none" key={link.id} onClick={() => options.interaction.enableSelection && select({ kind: 'link', id: link.id })} onKeyDown={(event) => onActivate(event, () => options.interaction.enableSelection && select({ kind: 'link', id: link.id }))} role={options.interaction.enableSelection ? 'button' : 'img'} stroke={options.display.usePatterns ? 'url(#sankey-flow-pattern)' : paint.color} strokeLinecap="round" strokeOpacity={paint.opacity} strokeWidth={Math.max(1, link.width)} tabIndex={options.interaction.enableSelection ? 0 : -1} />;
          })}
          {useHybrid && scene.links.map((link) => <path aria-label={`${nodeName(graph, link.link.source)} to ${nodeName(graph, link.link.target)}: ${formatValue(link.link.value, parsed)}`} aria-pressed={options.interaction.enableSelection ? selected?.kind === 'link' && selected.id === link.id : undefined} className={styles.focusable} d={linkPath(link, scene)} fill="none" key={link.id} onClick={() => options.interaction.enableSelection && select({ kind: 'link', id: link.id })} onKeyDown={(event) => onActivate(event, () => options.interaction.enableSelection && select({ kind: 'link', id: link.id }))} role={options.interaction.enableSelection ? 'button' : 'img'} stroke="transparent" strokeWidth={Math.max(10, link.width)} tabIndex={options.interaction.enableSelection ? 0 : -1} />)}
          {headers.map((header) => <text fill={mutedColor} fontSize="11" key={header.label} textAnchor={header.textAnchor} x={header.x} y={header.y}>{header.label}</text>)}
          {scene.nodes.map((node) => {
            const visible = containsText(node.node.name, query);
            const active = highlighted?.has(node.id) ?? true;
            const percentage = graph.total > 0 ? `${((node.node.value / graph.total) * 100).toFixed(1)}%` : '';
            const label = [node.node.name, options.display.showValues ? formatValue(node.node.value, parsed) : '', options.display.showPercentages ? percentage : ''].filter(Boolean).join(' · ');
            const ariaLabel = [node.node.name, formatValue(node.node.value, parsed), percentage].filter(Boolean).join(' · ');
            const labelOnRight = (node.x0 + node.x1) / 2 < scene.width / 2;
            return <g aria-label={ariaLabel} aria-pressed={options.interaction.enableSelection ? selected?.kind === 'node' && selected.id === node.id : undefined} className={styles.focusable} key={node.id} onClick={() => options.interaction.enableSelection && select({ kind: 'node', id: node.id })} onKeyDown={(event) => onActivate(event, () => options.interaction.enableSelection && select({ kind: 'node', id: node.id }))} role={options.interaction.enableSelection ? 'button' : 'img'} tabIndex={options.interaction.enableSelection ? 0 : -1}>
              <rect fill={options.display.usePatterns ? 'url(#sankey-flow-pattern)' : colorFor(node.node.group ?? node.id)} fillOpacity={visible && active ? 1 : options.display.dimOpacity} height={Math.max(1, node.y1 - node.y0)} rx="2" width={Math.max(1, node.x1 - node.x0)} x={node.x0} y={node.y0} />
              {options.display.showLabels && <text fill={theme.colors.text.primary} fontSize="11" pointerEvents="none" textAnchor={labelOnRight ? 'start' : 'end'} x={labelOnRight ? node.x1 + 5 : node.x0 - 5} y={(node.y0 + node.y1) / 2}>{label}</text>}
            </g>;
          })}
        </svg>
      </div>
      {diagnosticsList(graph.diagnostics)}
      <AccessibleTable graph={graph} parsed={parsed} visible={options.accessibility.showAccessibleTable} />
    </section>
  );
};
