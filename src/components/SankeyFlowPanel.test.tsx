import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FieldType, type DataFrame, type PanelProps } from '@grafana/data';
import { defaultOptions, type SankeyFlowOptions } from '../types';
import { SankeyFlowPanel } from './SankeyFlowPanel';

jest.mock('@grafana/ui', () => ({
  useTheme2: () => ({
    colors: { primary: { main: '#5794f2' }, text: { primary: '#f4f5f5', secondary: '#9fa7b3' } },
  }),
}));

const frame = (fields: Record<string, Array<number | string>>): DataFrame => ({
  fields: Object.entries(fields).map(([name, values]) => ({
    config: {},
    name,
    type: values.every((value) => typeof value === 'number') ? FieldType.number : FieldType.string,
    values,
  })),
  length: Math.max(...Object.values(fields).map((values) => values.length)),
  refId: 'A',
});

function options(overrides: Partial<SankeyFlowOptions> = {}): SankeyFlowOptions {
  return {
    ...defaultOptions,
    ...overrides,
    accessibility: { ...defaultOptions.accessibility, ...overrides.accessibility },
    display: { ...defaultOptions.display, ...overrides.display },
    interaction: { ...defaultOptions.interaction, ...overrides.interaction },
    layout: { ...defaultOptions.layout, ...overrides.layout },
    performance: { ...defaultOptions.performance, ...overrides.performance },
    playback: { ...defaultOptions.playback, ...overrides.playback },
  };
}

function props(series: DataFrame[], config = options()): PanelProps<SankeyFlowOptions> {
  return {
    data: { series },
    height: 260,
    options: config,
    width: 600,
  } as unknown as PanelProps<SankeyFlowOptions>;
}

describe('SankeyFlowPanel', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders an SVG Sankey scene with node, link, and search semantics', () => {
    render(
      <SankeyFlowPanel
        {...props([frame({ source: ['Source', 'Source'], target: ['Target', 'Other'], value: [8, 2] })])}
      />
    );

    expect(screen.getByRole('region', { name: /Sankey flow: 3 nodes, 2 links/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Sankey diagram/i })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search Sankey flow' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Source/i }).length).toBeGreaterThan(0);
  });

  it('selects a node from the keyboard and exposes copy details', () => {
    render(<SankeyFlowPanel {...props([frame({ source: ['Source'], target: ['Target'], value: [8] })])} />);

    const node = screen.getByRole('button', { name: /^Source · 8/ });
    fireEvent.keyDown(node, { key: 'Enter' });

    expect(screen.getByText('Selected node')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Selection details' })).toHaveTextContent('Source: 8');
    expect(node).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Copy details' })).toBeInTheDocument();
  });

  it('shows an honest empty state with parser diagnostics', () => {
    render(<SankeyFlowPanel {...props([])} />);

    expect(screen.getByRole('status')).toHaveTextContent('No Sankey flow to display');
    expect(screen.getByText('No data frames were supplied.')).toBeInTheDocument();
  });

  it('renders a stable empty state for an all-zero graph', () => {
    render(<SankeyFlowPanel {...props([frame({ source: ['A'], target: ['B'], value: [0] })])} />);

    expect(screen.getByRole('status')).toHaveTextContent('No Sankey flow to display');
    expect(screen.getByText('At least one link must have a positive value.')).toBeInTheDocument();
  });

  it('does not fall back to the snapshot graph when playback has no timestamped frames', () => {
    const config = options({ playback: { ...defaultOptions.playback, mode: 'playback' } });
    render(<SankeyFlowPanel {...props([frame({ source: ['A'], target: ['B'], value: [5] })], config)} />);

    expect(screen.getByRole('status')).toHaveTextContent('No Sankey flow to display');
    expect(screen.queryByRole('group', { name: /Sankey diagram/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Playback controls')).not.toBeInTheDocument();
  });

  it('plays through timestamp buckets and cleans up its interval', () => {
    jest.useFakeTimers();
    const config = options({
      playback: { ...defaultOptions.playback, mode: 'playback', bucketSizeMs: 1_000, speed: 1 },
    });
    const view = render(
      <SankeyFlowPanel
        {...props([frame({ source: ['A', 'A'], target: ['B', 'B'], value: [2, 3], time: [100, 1100] })], config)}
      />
    );

    expect(screen.getByLabelText('Current timestamp')).toHaveTextContent('1970-01-01T00:00:00.000Z');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(jest.getTimerCount()).toBe(1);
    act(() => {
      jest.advanceTimersByTime(1_010);
    });
    expect(screen.getByLabelText('Current timestamp')).toHaveTextContent('1970-01-01T00:00:01.000Z');
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('offers a labelled diagram and accessible table when requested', () => {
    const config = options({ accessibility: { ...defaultOptions.accessibility, showAccessibleTable: true } });
    render(<SankeyFlowPanel {...props([frame({ source: ['A'], target: ['B'], value: [5] })], config)} />);

    expect(screen.getByRole('group', { name: /Sankey diagram/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Sankey flow data' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
  });

  it('copies a safe selection DTO without provenance or unrelated frame fields', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(
      <SankeyFlowPanel
        {...props([frame({ source: ['Source'], target: ['Target'], value: [8], secret: ['do-not-copy'] })])}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Source to Target: 8' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy details' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = writeText.mock.calls[0][0] as string;
    expect(JSON.parse(copied)).toEqual({
      kind: 'link',
      id: expect.any(String),
      source: { id: 'Source', name: 'Source' },
      target: { id: 'Target', name: 'Target' },
      value: 8,
    });
    expect(copied).not.toContain('do-not-copy');
    expect(copied).not.toContain('rows');
    expect(copied).not.toContain('provenance');
  });

  it('uses unique SVG pattern IDs for separate panel instances', () => {
    const config = options({ display: { ...defaultOptions.display, usePatterns: true } });
    const { container } = render(
      <>
        <SankeyFlowPanel {...props([frame({ source: ['A'], target: ['B'], value: [5] })], config)} />
        <SankeyFlowPanel {...props([frame({ source: ['C'], target: ['D'], value: [6] })], config)} />
      </>
    );

    const patternIds = [...container.querySelectorAll('pattern')].map((pattern) => pattern.id);
    expect(patternIds).toHaveLength(2);
    expect(new Set(patternIds).size).toBe(2);
    expect(container.querySelector(`rect[fill="url(#${patternIds[0]})"]`)).toBeInTheDocument();
    expect(container.querySelector(`rect[fill="url(#${patternIds[1]})"]`)).toBeInTheDocument();
  });

  it('highlights the selected connected path without affecting disconnected links', () => {
    const config = options({ display: { ...defaultOptions.display, dimOpacity: 0.05, linkOpacity: 0.6 } });
    render(<SankeyFlowPanel {...props([frame({ source: ['A', 'C'], target: ['B', 'D'], value: [2, 3] })], config)} />);

    fireEvent.click(screen.getByRole('button', { name: /^A · 2/ }));

    expect(screen.getByRole('button', { name: 'A to B: 2' })).toHaveAttribute('stroke-opacity', '0.6');
    expect(screen.getByRole('button', { name: 'C to D: 3' })).toHaveAttribute('stroke-opacity', '0.05');
  });

  it('bounds hybrid link overlays and creates one only for a link selected from the accessible table', () => {
    const getContext = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const links = Array.from({ length: 201 }, (_, index) => index);
    const config = options({
      accessibility: { ...defaultOptions.accessibility, showAccessibleTable: true },
      performance: { ...defaultOptions.performance, renderer: 'hybrid', hybridLinkThreshold: 1 },
    });
    const { container } = render(
      <SankeyFlowPanel
        {...props(
          [
            frame({
              source: links.map((index) => `A${index}`),
              target: links.map((index) => `B${index}`),
              value: links.map(() => 1),
            }),
          ],
          config
        )}
      />
    );

    expect(container.querySelectorAll('svg path[stroke="transparent"]')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Select A0 to B0' }));
    expect(container.querySelectorAll('svg path[stroke="transparent"]')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'A0 to B0: 1' })).toBeInTheDocument();
    getContext.mockRestore();
  });
});
