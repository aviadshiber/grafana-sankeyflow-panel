import React from 'react';
import { cleanup, render } from '@testing-library/react';
import type { SankeyScene, SankeySceneLink } from '../layout';
import {
  canvasMetrics,
  linkPath,
  MAX_CANVAS_BACKING_DIMENSION,
  MAX_CANVAS_BACKING_PIXELS,
  SankeyFlowCanvas,
} from './SankeyFlowCanvas';

type ContextMock = jest.Mocked<
  Pick<
    CanvasRenderingContext2D,
    'beginPath' | 'bezierCurveTo' | 'clearRect' | 'createPattern' | 'lineTo' | 'moveTo' | 'setTransform' | 'stroke'
  >
> & {
  globalAlpha: number;
  lineCap: CanvasLineCap;
  lineWidth: number;
  strokeStyle: string | CanvasPattern;
};

const makeContext = (): ContextMock => ({
  beginPath: jest.fn(),
  bezierCurveTo: jest.fn(),
  clearRect: jest.fn(),
  createPattern: jest.fn<CanvasPattern | null, [CanvasImageSource, string | null]>(() => ({}) as CanvasPattern),
  globalAlpha: 1,
  lineCap: 'butt',
  lineTo: jest.fn(),
  lineWidth: 1,
  moveTo: jest.fn(),
  setTransform: jest.fn(),
  stroke: jest.fn(),
  strokeStyle: '',
});

const link = (overrides: Partial<SankeySceneLink> = {}): SankeySceneLink => ({
  id: 'a-b',
  link: { id: 'a-b', source: 'a', target: 'b', value: 4, rows: [] },
  source: { x: 0, y: 10 },
  target: { x: 100, y: 30 },
  width: 4,
  circular: false,
  ...overrides,
});

const scene = (links: SankeySceneLink[], overrides: Partial<SankeyScene> = {}): SankeyScene => ({
  width: 100,
  height: 50,
  direction: 'left-to-right',
  engine: 'dag',
  nodes: [],
  links,
  ...overrides,
});

describe('SankeyFlowCanvas', () => {
  let context: ContextMock;
  let tileContext: ContextMock;
  let getContext: jest.SpyInstance;

  beforeEach(() => {
    context = makeContext();
    tileContext = makeContext();
    getContext = jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => context as unknown as CanvasRenderingContext2D);
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 });
  });

  afterEach(() => {
    cleanup();
    getContext.mockRestore();
  });

  it('sizes for DPR, transforms, clears, and strokes rounded links in scene coordinates', () => {
    const { container } = render(
      <SankeyFlowCanvas linkPaint={() => ({ color: '#246', opacity: 0.4 })} scene={scene([link()])} />
    );
    const canvas = container.querySelector('canvas')!;

    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 100, 50);
    expect(context.moveTo).toHaveBeenCalledWith(0, 10);
    expect(context.bezierCurveTo).toHaveBeenCalledWith(50, 10, 50, 30, 100, 30);
    expect(context.strokeStyle).toBe('#246');
    expect(context.globalAlpha).toBe(0.4);
    expect(context.lineCap).toBe('round');
    expect(context.lineWidth).toBe(4);
    expect(context.stroke).toHaveBeenCalledTimes(1);
  });

  it('caps the effective DPR and backing-store allocation for large panels', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 3 });
    const largeScene = scene([link()], { width: 8_000, height: 4_000 });
    const { container } = render(
      <SankeyFlowCanvas linkPaint={() => ({ color: '#246', opacity: 1 })} scene={largeScene} />
    );
    const canvas = container.querySelector('canvas')!;
    const metrics = canvasMetrics(largeScene.width, largeScene.height, 3);

    expect(canvas.width).toBe(metrics.backingWidth);
    expect(canvas.height).toBe(metrics.backingHeight);
    expect(canvas.width).toBeLessThanOrEqual(MAX_CANVAS_BACKING_DIMENSION);
    expect(canvas.height).toBeLessThanOrEqual(MAX_CANVAS_BACKING_DIMENSION);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(MAX_CANVAS_BACKING_PIXELS);
    expect(metrics.scale).toBeLessThan(3);
    expect(context.setTransform).toHaveBeenCalledWith(metrics.scale, 0, 0, metrics.scale, 0, 0);
  });

  it('uses an explicit hatch pattern for hybrid links', () => {
    getContext
      .mockImplementationOnce(() => context as unknown as CanvasRenderingContext2D)
      .mockImplementationOnce(() => tileContext as unknown as CanvasRenderingContext2D);

    render(
      <SankeyFlowCanvas
        linkPaint={() => ({ color: '#246', opacity: 1 })}
        pattern={{ enabled: true, color: '#fff' }}
        scene={scene([link()])}
      />
    );

    expect(tileContext.strokeStyle).toBe('#fff');
    expect(context.createPattern).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 'repeat');
    expect(context.strokeStyle).toEqual(expect.any(Object));
  });

  it('detects the Panel SVG marker so existing high-contrast patterns survive without changing its caller', () => {
    getContext
      .mockImplementationOnce(() => context as unknown as CanvasRenderingContext2D)
      .mockImplementationOnce(() => tileContext as unknown as CanvasRenderingContext2D);

    render(
      <div>
        <div>
          <SankeyFlowCanvas linkPaint={() => ({ color: '#246', opacity: 1 })} scene={scene([link()])} />
        </div>
        <svg>
          <defs>
            <pattern id="sankey-flow-pattern">
              <path stroke="#f4f5f5" />
            </pattern>
          </defs>
          <rect fill="url(#sankey-flow-pattern)" />
        </svg>
      </div>
    );

    expect(tileContext.strokeStyle).toBe('#f4f5f5');
    expect(context.createPattern).toHaveBeenCalledTimes(1);
  });

  it('builds straight and circular top-to-bottom paths with the expected control points', () => {
    expect(linkPath(link(), scene([]))).toBe('M0,10 C50,10 50,30 100,30');

    const topToBottom = scene([], { width: 200, height: 100, direction: 'top-to-bottom' });
    expect(
      linkPath(
        link({ source: { x: 20, y: 10 }, target: { x: 60, y: 90 }, circular: true, circularSide: 'top' }),
        topToBottom
      )
    ).toBe('M20,10 C-4,10 -4,90 60,90');
  });
});
