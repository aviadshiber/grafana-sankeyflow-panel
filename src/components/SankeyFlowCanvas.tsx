import React, { useEffect, useRef } from 'react';
import type { SankeyScene, SankeySceneLink } from '../layout';

export interface LinkPaint {
  color: string;
  opacity: number;
}

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
      const x = link.circularSide === 'top' ? Math.min(source.x, target.x) - offset : Math.max(source.x, target.x) + offset;
      return { control1: { x, y: source.y }, control2: { x, y: target.y } };
    }
    const y = link.circularSide === 'top' ? Math.min(source.y, target.y) - offset : Math.max(source.y, target.y) + offset;
    return { control1: { x: source.x, y }, control2: { x: target.x, y } };
  }

  if (scene.direction === 'top-to-bottom') {
    const y = (source.y + target.y) / 2;
    return { control1: { x: source.x, y }, control2: { x: target.x, y } };
  }
  const x = (source.x + target.x) / 2;
  return { control1: { x, y: source.y }, control2: { x, y: target.y } };
}

function paintLink(context: CanvasRenderingContext2D, link: SankeySceneLink, scene: SankeyScene, paint: LinkPaint) {
  const route = linkRoute(link, scene);
  context.beginPath();
  context.moveTo(link.source.x, link.source.y);
  context.bezierCurveTo(route.control1.x, route.control1.y, route.control2.x, route.control2.y, link.target.x, link.target.y);
  context.strokeStyle = paint.color;
  context.globalAlpha = paint.opacity;
  context.lineWidth = Math.max(1, link.width);
  context.stroke();
}

interface SankeyFlowCanvasProps {
  scene: SankeyScene;
  linkPaint: (link: SankeySceneLink) => LinkPaint;
}

/** Draws the visual link layer for large diagrams while SVG retains interaction semantics. */
export function SankeyFlowCanvas({ scene, linkPaint }: SankeyFlowCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(scene.width * ratio));
    canvas.height = Math.max(1, Math.round(scene.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, scene.width, scene.height);
    for (const link of scene.links) {
      paintLink(context, link, scene, linkPaint(link));
    }
  }, [linkPaint, scene]);

  return <canvas ref={canvasRef} aria-hidden="true" style={{ height: scene.height, left: 0, pointerEvents: 'none', position: 'absolute', top: 0, width: scene.width }} />;
}
