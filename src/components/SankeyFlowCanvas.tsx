import React, { useEffect, useRef } from 'react';
import type { SankeyScene, SankeySceneLink } from '../layout';

export interface LinkPaint {
  color: string;
  opacity: number;
}

/** Keep large hybrid panels below browser texture and memory limits. */
export const MAX_CANVAS_BACKING_DIMENSION = 8_192;
export const MAX_CANVAS_BACKING_PIXELS = 16_777_216;

export function linkPath(link: SankeySceneLink, scene: SankeyScene): string {
  const route = linkRoute(link, scene);
  return `M${link.source.x},${link.source.y} C${route.control1.x},${route.control1.y} ${route.control2.x},${route.control2.y} ${link.target.x},${link.target.y}`;
}

interface LinkRoute {
  control1: { x: number; y: number };
  control2: { x: number; y: number };
}

function linkRoute(link: SankeySceneLink, scene: SankeyScene): LinkRoute {
  const { source, target } = link;
  if (link.circular) {
    const offset = Math.max(24, (scene.direction === 'top-to-bottom' ? scene.width : scene.height) * 0.06);
    if (scene.direction === 'top-to-bottom') {
      const x =
        link.circularSide === 'top' ? Math.min(source.x, target.x) - offset : Math.max(source.x, target.x) + offset;
      return { control1: { x, y: source.y }, control2: { x, y: target.y } };
    }
    const y =
      link.circularSide === 'top' ? Math.min(source.y, target.y) - offset : Math.max(source.y, target.y) + offset;
    return { control1: { x: source.x, y }, control2: { x: target.x, y } };
  }

  if (scene.direction === 'top-to-bottom') {
    const y = (source.y + target.y) / 2;
    return { control1: { x: source.x, y }, control2: { x: target.x, y } };
  }
  const x = (source.x + target.x) / 2;
  return { control1: { x, y: source.y }, control2: { x, y: target.y } };
}

function paintLink(
  context: CanvasRenderingContext2D,
  link: SankeySceneLink,
  scene: SankeyScene,
  paint: LinkPaint,
  pattern: CanvasPattern | null
) {
  const route = linkRoute(link, scene);
  context.beginPath();
  context.moveTo(link.source.x, link.source.y);
  context.bezierCurveTo(
    route.control1.x,
    route.control1.y,
    route.control2.x,
    route.control2.y,
    link.target.x,
    link.target.y
  );
  context.strokeStyle = pattern ?? paint.color;
  context.globalAlpha = Number.isFinite(paint.opacity) ? Math.max(0, Math.min(1, paint.opacity)) : 1;
  context.lineCap = 'round';
  context.lineWidth = Number.isFinite(link.width) ? Math.max(1, link.width) : 1;
  context.stroke();
}

export interface CanvasPatternOptions {
  enabled: boolean;
  color?: string;
}

export interface SankeyFlowCanvasProps {
  scene: SankeyScene;
  linkPaint: (link: SankeySceneLink) => LinkPaint;
  /**
   * Optional so the current Panel caller remains compatible. When omitted, the
   * canvas reads the sibling SVG's existing pattern marker used by the Panel.
   */
  pattern?: CanvasPatternOptions;
}

interface CanvasMetrics {
  backingHeight: number;
  backingWidth: number;
  height: number;
  scale: number;
  width: number;
}

/** Calculates a uniform, capped backing-store scale for a CSS-sized canvas. */
export function canvasMetrics(width: number, height: number, devicePixelRatio: number): CanvasMetrics {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 0;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  const requestedScale = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;

  if (safeWidth === 0 || safeHeight === 0) {
    return { backingWidth: 1, backingHeight: 1, width: safeWidth, height: safeHeight, scale: 1 };
  }

  const scale = Math.min(
    requestedScale,
    MAX_CANVAS_BACKING_DIMENSION / safeWidth,
    MAX_CANVAS_BACKING_DIMENSION / safeHeight,
    Math.sqrt(MAX_CANVAS_BACKING_PIXELS / (safeWidth * safeHeight))
  );
  const backingWidth = Math.max(1, Math.floor(safeWidth * scale));
  const backingHeight = Math.max(1, Math.floor(safeHeight * scale));
  const effectiveScale = Math.min(backingWidth / safeWidth, backingHeight / safeHeight);

  return { backingWidth, backingHeight, width: safeWidth, height: safeHeight, scale: effectiveScale };
}

function existingPatternColor(canvas: HTMLCanvasElement): string | undefined {
  const diagram = canvas.parentElement?.parentElement;
  return diagram?.querySelector('#sankey-flow-pattern path')?.getAttribute('stroke') ?? undefined;
}

function hasExistingPattern(canvas: HTMLCanvasElement): boolean {
  const diagram = canvas.parentElement?.parentElement;
  return diagram?.querySelector('rect[fill="url(#sankey-flow-pattern)"]') !== null;
}

function hatchPattern(context: CanvasRenderingContext2D, color: string): CanvasPattern | null {
  const tile = document.createElement('canvas');
  tile.width = 6;
  tile.height = 6;
  const tileContext = tile.getContext('2d');
  if (!tileContext) {
    return null;
  }
  tileContext.beginPath();
  tileContext.moveTo(-1, 1);
  tileContext.lineTo(1, -1);
  tileContext.moveTo(0, 6);
  tileContext.lineTo(6, 0);
  tileContext.moveTo(5, 7);
  tileContext.lineTo(7, 5);
  tileContext.strokeStyle = color;
  tileContext.lineWidth = 1;
  tileContext.stroke();
  return context.createPattern(tile, 'repeat');
}

/** Draws the visual link layer for large diagrams while SVG retains interaction semantics. */
export function SankeyFlowCanvas({ scene, linkPaint, pattern }: SankeyFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const metrics = canvasMetrics(scene.width, scene.height, window.devicePixelRatio);
    canvas.width = metrics.backingWidth;
    canvas.height = metrics.backingHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(metrics.scale, 0, 0, metrics.scale, 0, 0);
    context.clearRect(0, 0, metrics.width, metrics.height);
    const usePattern = pattern?.enabled ?? hasExistingPattern(canvas);
    const svgPatternColor = usePattern ? existingPatternColor(canvas) : undefined;
    const patterns = new Map<string, CanvasPattern | null>();
    for (const link of scene.links) {
      const paint = linkPaint(link);
      let linkPattern: CanvasPattern | null = null;
      if (usePattern) {
        const patternColor = pattern?.color ?? svgPatternColor ?? paint.color;
        if (!patterns.has(patternColor)) {
          patterns.set(patternColor, hatchPattern(context, patternColor));
        }
        linkPattern = patterns.get(patternColor) ?? null;
      }
      paintLink(context, link, scene, paint, linkPattern);
    }
  }, [linkPaint, pattern, scene]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ height: scene.height, left: 0, pointerEvents: 'none', position: 'absolute', top: 0, width: scene.width }}
    />
  );
}
