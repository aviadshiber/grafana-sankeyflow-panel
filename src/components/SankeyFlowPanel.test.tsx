import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
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
  it('renders an SVG Sankey scene with node, link, and search semantics', () => {
    render(<SankeyFlowPanel {...props([frame({ source: ['Source', 'Source'], target: ['Target', 'Other'], value: [8, 2] })])} />);

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

  it('plays through timestamp buckets and cleans up its interval', () => {
    jest.useFakeTimers();
    const config = options({ playback: { ...defaultOptions.playback, mode: 'playback', bucketSizeMs: 1_000, speed: 1 } });
    const view = render(<SankeyFlowPanel {...props([frame({ source: ['A', 'A'], target: ['B', 'B'], value: [2, 3], time: [100, 1100] })], config)} />);

    expect(screen.getByLabelText('Current timestamp')).toHaveTextContent('1970-01-01T00:00:00.000Z');
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    act(() => { jest.advanceTimersByTime(1_010); });
    expect(screen.getByLabelText('Current timestamp')).toHaveTextContent('1970-01-01T00:00:01.000Z');
    view.unmount();
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });

  it('offers a labelled diagram and accessible table when requested', () => {
    const config = options({ accessibility: { ...defaultOptions.accessibility, showAccessibleTable: true } });
    render(<SankeyFlowPanel {...props([frame({ source: ['A'], target: ['B'], value: [5] })], config)} />);

    expect(screen.getByRole('group', { name: /Sankey diagram/i })).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Sankey flow data' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Source' })).toBeInTheDocument();
  });
});
