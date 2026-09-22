import { Geometry, type OGLRenderingContext } from 'ogl';

export interface CylinderDimensions {
  radius: number;
  height: number;
  radialSegments: number;
  heightSegments: number;
}

export interface ParticleConfig {
  numParticles: number;
  particleRadius: number;
  segments: number;
  angleSpan: number;
}

export interface ParticleUserData {
  baseAngle: number;
  angleSpan: number;
  baseY: number;
  speed: number;
  radius: number;
}

/**
 * Draws an image with object-fit: cover on canvas context
 */
export function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = w / h;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = img.naturalWidth;
  let sourceHeight = img.naturalHeight;

  if (imgRatio > canvasRatio) {
    sourceWidth = img.naturalHeight * canvasRatio;
    sourceX = (img.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = img.naturalWidth / canvasRatio;
    sourceY = (img.naturalHeight - sourceHeight) / 2;
  }

  ctx.save();
  ctx.translate(x, y + h);
  ctx.scale(1, -1);
  ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, w, h);
  ctx.restore();
}

/**
 * Creates 3D Cylinder geometry for OGL
 */
export function createCylinderGeometry(gl: WebGLRenderingContext, config: CylinderDimensions) {
  const { radius, height, radialSegments, heightSegments } = config;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let y = 0; y <= heightSegments; y++) {
    const v = y / heightSegments;
    const yPos = (v - 0.5) * height;

    for (let x = 0; x <= radialSegments; x++) {
      const u = x / radialSegments;
      const theta = u * Math.PI * 2;

      const xPos = Math.cos(theta) * radius;
      const zPos = Math.sin(theta) * radius;

      positions.push(xPos, yPos, zPos);
      uvs.push(u, 1 - v);
    }
  }

  for (let y = 0; y < heightSegments; y++) {
    for (let x = 0; x < radialSegments; x++) {
      const a = y * (radialSegments + 1) + x;
      const b = a + radialSegments + 1;
      const c = a + 1;
      const d = b + 1;

      indices.push(a, b, c);
      indices.push(b, d, c);
    }
  }

  return new Geometry(gl as unknown as OGLRenderingContext, {
    position: { size: 3, data: new Float32Array(positions) },
    uv: { size: 2, data: new Float32Array(uvs) },
    index: { data: new Uint16Array(indices) },
  });
}

/**
 * Creates particle streak geometry for OGL
 */
export function createParticleGeometry(
  gl: WebGLRenderingContext,
  config: ParticleConfig,
  index: number,
  height: number
) {
  const { numParticles, particleRadius, segments, angleSpan } = config;

  const linePositions: number[] = [];
  const startAngle = (index / numParticles) * Math.PI * 2;

  const isTopHalf = index < numParticles / 2;
  const yPosition = isTopHalf
    ? height * 0.75 + Math.random() * height * 0.25
    : -height * 1.0 + Math.random() * height * 0.25;

  for (let j = 0; j <= segments; j++) {
    const t = j / segments;
    const angle = startAngle + angleSpan * t;
    const x = Math.cos(angle) * particleRadius;
    const z = Math.sin(angle) * particleRadius;

    linePositions.push(x, yPosition, z);
  }

  return {
    geometry: new Geometry(gl as unknown as OGLRenderingContext, {
      position: { size: 3, data: new Float32Array(linePositions) },
    }),
    userData: {
      baseAngle: startAngle,
      angleSpan: angleSpan,
      baseY: yPosition,
      speed: 0.6 + Math.random() * 0.9,
      radius: particleRadius,
    },
  };
}
