import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Mesh, Program, Renderer, Texture, Transform } from 'ogl';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import type { SiteCopy } from '@/data/i18n';
import { useCatalog } from '@/data/catalog';
import { resolveMediaUrl } from '@/data/media';
import { selectCylinderAlbums } from '@/lib/selectCylinderAlbums';
import {
  createCylinderGeometry,
  createParticleGeometry,
  drawImageCover,
  type ParticleUserData,
} from '@/lib/ogl/utils';
import {
  cylinderFragment,
  cylinderVertex,
  particleFragment,
  particleVertex,
} from '@/lib/ogl/shaders';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger, CustomEase);
  try {
    CustomEase.create('cinematicSilk', '0.45, 0.05, 0.55, 0.95');
    CustomEase.create('cinematicSmooth', '0.25, 0.1, 0.25, 1');
    CustomEase.create('cinematicFlow', '0.33, 0, 0.2, 1');
  } catch {
    // Custom eases already created
  }
}


interface CylinderExperienceProps {
  copy: SiteCopy['cylinder'];
  onLoaded: () => void;
}

type ParticleMesh = Mesh & { userData: ParticleUserData };

const CYLINDER_CORS_CACHE_REVISION = '2';

function withFreshCrossOriginCacheKey(src: string): string | undefined {
  try {
    const url = new URL(src, window.location.href);
    if (url.origin === window.location.origin
      || url.searchParams.get('cylinder-cors') === CYLINDER_CORS_CACHE_REVISION) return undefined;
    url.searchParams.set('cylinder-cors', CYLINDER_CORS_CACHE_REVISION);
    return url.href;
  } catch {
    return undefined;
  }
}

/**
 * WebGL 可用性探测。
 * 访客禁用硬件加速、或在无 GPU 的虚拟机里打开时，OGL 的 Renderer 会直接抛错。
 * 提前判断，才能优雅降级而不是留下一张白屏。
 */
function isWebGLAvailable() {
  try {
    const probe = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (probe.getContext('webgl2') || probe.getContext('webgl')),
    );
  } catch {
    return false;
  }
}

/**
 * 无 WebGL 时的静态替代：把原本由 3D 圆柱承载的四段叙事和已发现的专辑
 * 用排版与横向画廊呈现，保持同一套视觉语言。
 */
function CylinderFallback({ copy, images }: { copy: SiteCopy['cylinder']; images: string[] }) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.cylinder-fallback-block').forEach((el) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 42 },
          {
            opacity: 1,
            y: 0,
            duration: 1.1,
            ease: 'power3.out',
            scrollTrigger: { trigger: el, start: 'top 82%' },
          },
        );
      });
      gsap.fromTo(
        '.cylinder-fallback-frame',
        { opacity: 0, y: 34 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          stagger: 0.05,
          ease: 'power3.out',
          scrollTrigger: { trigger: '.cylinder-fallback-gallery', start: 'top 85%' },
        },
      );
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      id="journey"
      ref={rootRef}
      className="cylinder-fallback"
      aria-label={copy.perspectives[0]?.title ?? 'The cylinder'}
    >
      {copy.perspectives.map((item, index) => (
        <article className="cylinder-fallback-block" key={item.tag}>
          <span className="cylinder-fallback-index">{String(index + 1).padStart(2, '0')}</span>
          <div>
            <p className="section-kicker">{item.tag}</p>
            <h2>{item.title}</h2>
            <p>{item.subtitle}</p>
          </div>
        </article>
      ))}

      <div className="cylinder-fallback-gallery">
        {images.map((src, index) => (
          <figure className="cylinder-fallback-frame" key={src}>
            <img src={src} alt="" loading="lazy" />
            <figcaption>{String(index + 1).padStart(2, '0')}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

export function CylinderExperience({ copy, onLoaded }: CylinderExperienceProps) {
  const { albums } = useCatalog();
  const cylinderImages = useMemo(
    () => selectCylinderAlbums(albums).map((album) => resolveMediaUrl(album.artwork.presentation)),
    [albums],
  );
  const didNotifyLoadedRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const textShellRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);
  /**
   * 首帧就决定走 3D 还是静态版，而不是等挂载后再切换。
   *
   * 原因是 ErasCorridor 的 ScrollTrigger pin 会把元素重新包进 pin-spacer，
   * React 对父节点子元素的记录会因此失效；此时再插入/替换兄弟节点会抛
   * NotFoundError（insertBefore）。渲染期定好形状就没有这个风险。
   */
  const [hasFailed, setHasFailed] = useState(() => !isWebGLAvailable());

  const rendererRef = useRef<Renderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const cylinderRef = useRef<Mesh | null>(null);
  const cameraAnimRef = useRef({ x: 0, y: 0, z: 8 });
  const cylinderUniformsRef = useRef<{ uDarkness: { value: number }; uFade: { value: number } }>({
    uDarkness: { value: 0.25 },
    uFade: { value: 1.0 },
  });
  const particlesRef = useRef<ParticleMesh[]>([]);

  useEffect(() => {
    const notifyLoaded = () => {
      if (didNotifyLoadedRef.current) return;
      didNotifyLoadedRef.current = true;
      onLoaded();
    };
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      // 静态降级版没有画布，这里直接放行加载动画，否则整屏 Loader 会一直停着
      notifyLoaded();
      return;
    }

    let isDestroyed = false;
    let hasImageFailed = false;
    let animationFrame = 0;
    let animationContext: gsap.Context | undefined;
    let sceneVisible = false;
    const visibilityObserver = new IntersectionObserver(([entry]) => { sceneVisible = entry.isIntersecting; });
    visibilityObserver.observe(container);

    const fallbackToStatic = () => {
      if (isDestroyed || hasImageFailed) return;
      hasImageFailed = true;
      visibilityObserver.disconnect();
      setHasFailed(true);
      notifyLoaded();
    };

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        canvas,
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: Math.min(window.devicePixelRatio, 2),
        alpha: true,
        antialias: true,
      });
    } catch (error) {
      console.warn('WebGL context creation failed — falling back to the static layout.', error);
      fallbackToStatic();
      return () => { isDestroyed = true; visibilityObserver.disconnect(); };
    }

    const gl = renderer.gl;
    // 透明清屏：让下方的环境光晕透出来，圆柱周围不再是死黑
    gl.clearColor(0, 0, 0, 0);
    gl.disable(gl.CULL_FACE);
    rendererRef.current = renderer;

    const getResponsiveConfig = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const isMobile = width < 768;
      const isTablet = width >= 768 && width < 1024;
      const radius = isMobile ? 1.9 : isTablet ? 2.3 : 2.5;
      const fov = isMobile ? 52 : 45;
      // 圆柱默认占画面宽度的比例。手机上允许略微出血，反而更有临场感。
      const coverage = isMobile ? 1.05 : isTablet ? 0.72 : 0.62;
      // 由「目标占比」反推相机距离，而不是写死一个 z，这样任何窗口比例下
      // 圆柱在画面里的分量都是一致的，也就不会出现大片空黑把它压小。
      const halfWidthPerUnit = Math.tan((fov * Math.PI) / 360) * (width / height);
      const cameraZ = Math.max(radius / (halfWidthPerUnit * coverage), radius * 1.8);
      return {
        radius,
        height: isMobile ? 1.4 : isTablet ? 1.8 : 2.0,
        cameraZ,
        fov,
        isMobile,
      };
    };

    const baseDimensions = getResponsiveConfig();
    let dimensions = baseDimensions;
    const camera = new Camera(gl, {
      fov: baseDimensions.fov,
      aspect: window.innerWidth / window.innerHeight,
    });
    camera.position.set(0, 0, baseDimensions.cameraZ);
    cameraAnimRef.current.z = baseDimensions.cameraZ;
    cameraRef.current = camera;

    const scene = new Transform();
    const cylinderGeometry = createCylinderGeometry(gl, {
      radius: baseDimensions.radius,
      height: baseDimensions.height,
      radialSegments: 64,
      heightSegments: 1,
    });

    // High performance texture baking
    const textureCanvas = document.createElement('canvas');
    const ctx = textureCanvas.getContext('2d', { alpha: false })!;
    const singleWidth = 1024;
    const singleHeight = 1024;
    const hardwareLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const safeMax = baseDimensions.isMobile
      ? Math.min(hardwareLimit, 2048)
      : Math.min(hardwareLimit, 8192);
    const totalOriginalWidth = singleWidth * cylinderImages.length;
    const scaleFactor = Math.min(1, safeMax / totalOriginalWidth);

    textureCanvas.width = Math.floor(totalOriginalWidth * scaleFactor);
    textureCanvas.height = Math.floor(singleHeight * scaleFactor);

    let loadedCount = 0;
    const imageObjects: HTMLImageElement[] = [];

    let lastRotation = 0;
    let velocity = 0;
    let momentum = 0;

    const handleResize = () => {
      if (!rendererRef.current || !cameraRef.current || isDestroyed) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      const next = getResponsiveConfig();
      dimensions = next;

      rendererRef.current.setSize(width, height);
      cameraRef.current.perspective({
        fov: next.fov,
        aspect: width / height,
      });
      const radiusScale = next.radius / baseDimensions.radius;
      const heightScale = next.height / baseDimensions.height;
      cylinderRef.current?.scale.set(radiusScale, heightScale, radiusScale);
      particlesRef.current.forEach((particle) => {
        particle.scale.set(radiusScale, heightScale, radiusScale);
      });
      if (!animationContext) cameraAnimRef.current.z = next.cameraZ;
      ScrollTrigger.refresh();
    };

    window.addEventListener('resize', handleResize);

    cylinderImages.forEach((src, idx) => {
      const img = new Image();
      let retriedWithFreshCacheKey = false;
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (isDestroyed || hasImageFailed) return;
        imageObjects[idx] = img;
        loadedCount += 1;

        if (loadedCount === cylinderImages.length) {
          // Draw all images onto panorama texture strip
          imageObjects.forEach((imageItem, imageIdx) => {
            const x0 = Math.floor((imageIdx / cylinderImages.length) * textureCanvas.width);
            const x1 = Math.floor(((imageIdx + 1) / cylinderImages.length) * textureCanvas.width);
            drawImageCover(ctx, imageItem, x0, 0, x1 - x0, textureCanvas.height);
          });

          const texture = new Texture(gl, {
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.LINEAR,
            magFilter: gl.LINEAR,
            generateMipmaps: false,
          });
          texture.image = textureCanvas;
          texture.needsUpdate = true;

          const program = new Program(gl, {
            vertex: cylinderVertex,
            fragment: cylinderFragment,
            uniforms: {
              tMap: { value: texture },
              uDarkness: cylinderUniformsRef.current.uDarkness,
              uFade: cylinderUniformsRef.current.uFade,
            },
            cullFace: null,
          });

          const cylinder = new Mesh(gl, { geometry: cylinderGeometry, program });
          cylinder.scale.set(
            dimensions.radius / baseDimensions.radius,
            dimensions.height / baseDimensions.height,
            dimensions.radius / baseDimensions.radius,
          );
          cylinder.setParent(scene);
          cylinder.rotation.y = 0.5;
          cylinderRef.current = cylinder;

          // Create particle trails
          const numParticles = baseDimensions.isMobile ? 8 : 16;
          for (let i = 0; i < numParticles; i++) {
            const { geometry: pGeom, userData } = createParticleGeometry(
              gl,
              {
                numParticles,
                particleRadius: baseDimensions.radius * 1.35,
                segments: 20,
                angleSpan: 0.35,
              },
              i,
              baseDimensions.height
            );

            const pProgram = new Program(gl, {
              vertex: particleVertex,
              fragment: particleFragment,
              uniforms: {
                uColor: { value: [0.95, 0.95, 1.0] },
                uOpacity: { value: 0 },
              },
              transparent: true,
              depthTest: true,
            });

            const pMesh = new Mesh(gl, {
              geometry: pGeom,
              program: pProgram,
              mode: gl.LINE_STRIP,
            }) as ParticleMesh;
            pMesh.scale.set(
              dimensions.radius / baseDimensions.radius,
              dimensions.height / baseDimensions.height,
              dimensions.radius / baseDimensions.radius,
            );
            pMesh.userData = userData;
            pMesh.setParent(scene);
            particlesRef.current.push(pMesh);
          }

          // GSAP Timeline for Cylinder Scroll
          animationContext = gsap.context(() => {
            // Main camera trajectory across the cylinder
            const tl = gsap.timeline({
              scrollTrigger: {
                trigger: container,
                start: 'top top',
                end: 'bottom bottom',
                scrub: 1.2,
                invalidateOnRefresh: true,
              },
            });

            // Camera movement keyframes:
            // 0 -> 25%: Orbiting wide
            tl.to(cameraAnimRef.current, {
              x: 0,
              y: 0,
              z: () => dimensions.cameraZ,
              duration: 1.5,
              ease: 'power2.inOut',
            })
              // 25% -> 50%: Elevation & looking down
              .to(cameraAnimRef.current, {
                x: () => dimensions.radius * 0.16,
                y: () => dimensions.height * 1.8,
                z: () => dimensions.cameraZ * 0.72,
                duration: 2.2,
                ease: 'cinematicFlow',
              })
              // 50% -> 75%: Close glide along cylinder wall
              .to(cameraAnimRef.current, {
                x: () => dimensions.radius * 0.44,
                y: () => dimensions.height * 0.6,
                z: () => dimensions.radius * 1.35,
                duration: 2.5,
                ease: 'power1.inOut',
              })
              // 75% -> 92%: Centering directly in front of target hero image
              .to(cameraAnimRef.current, {
                x: 0,
                y: 0,
                z: () => dimensions.radius + 1.1,
                duration: 2.0,
                ease: 'power2.out',
              })
              // 92% -> 100%: Accelerating straight into the photograph (The Dive!)
              .to(cameraAnimRef.current, {
                x: 0,
                y: 0,
                z: () => dimensions.radius + 0.15,
                duration: 1.2,
                ease: 'power3.in',
              });

            // Cylinder continuous rotation, aligning on the hero transition frame at the end
            tl.to(
              cylinder.rotation,
              {
                y: '+=25.132', // Approx 4 full rotations, smoothly settling
                duration: 9.4,
                ease: 'none',
              },
              0
            );

            // Synchronized text reveals — PROMPT & INFORMATIVE!
            // No waiting 50% to see text. Text appears right as camera keyframes transition.
            textRefs.current.forEach((el, index) => {
              if (!el) return;
              const segStart = (index * 24);
              const segEnd = ((index + 1) * 24);

              gsap
                .timeline({
                  scrollTrigger: {
                    trigger: container,
                    start: `${segStart}% top`,
                    end: `${segEnd}% top`,
                    scrub: 0.8,
                  },
                })
                .fromTo(
                  el,
                  { opacity: 0, y: 35, filter: 'blur(8px)' },
                  { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.3, ease: 'power2.out' }
                )
                .to(el, { opacity: 1, duration: 0.4 })
                .to(el, { opacity: 0, y: -25, filter: 'blur(6px)', duration: 0.3, ease: 'power2.in' });
            });

            // Canvas shell fadeout at the very end of cylinder as it enters portal
            gsap.to(canvasShellRef.current, {
              opacity: 0,
              ease: 'power2.in',
              scrollTrigger: {
                trigger: container,
                start: '92% top',
                end: '100% top',
                scrub: true,
              },
            });

            // Text shell fadeout
            gsap.to(textShellRef.current, {
              opacity: 0,
              ease: 'power2.in',
              scrollTrigger: {
                trigger: container,
                start: '90% top',
                end: '96% top',
                scrub: true,
              },
            });
          });

          notifyLoaded();
          ScrollTrigger.refresh();

          // Continuous Render Loop
          const renderLoop = () => {
            if (isDestroyed) return;
            animationFrame = requestAnimationFrame(renderLoop);
            if (!sceneVisible || document.hidden) return;

            camera.position.set(
              cameraAnimRef.current.x,
              cameraAnimRef.current.y,
              cameraAnimRef.current.z
            );
            camera.lookAt([0, 0, 0]);

            // Velocity physics for particle trails
            const currentRot = cylinder.rotation.y;
            velocity = currentRot - lastRotation;
            lastRotation = currentRot;
            momentum = momentum * 0.92 + velocity * 0.15;
            const speed = Math.abs(velocity) * 100;
            const isSpinning = Math.abs(velocity) > 0.0001;

            particlesRef.current.forEach((particle) => {
              const uData = particle.userData;
              const targetOp = isSpinning ? Math.min(speed * 3.2, 0.9) : 0;
              const curOp = particle.program.uniforms.uOpacity.value as number;
              particle.program.uniforms.uOpacity.value = curOp + (targetOp - curOp) * 0.15;

              if (!isSpinning) return;
              uData.baseAngle += velocity * uData.speed * 1.6;
              const posData = particle.geometry.attributes.position.data as Float32Array;

              for (let j = 0; j <= 20; j++) {
                const t = j / 20;
                const angle = uData.baseAngle + uData.angleSpan * t;
                posData[j * 3] = Math.cos(angle) * uData.radius;
                posData[j * 3 + 1] = uData.baseY;
                posData[j * 3 + 2] = Math.sin(angle) * uData.radius;
              }
              particle.geometry.attributes.position.needsUpdate = true;
            });

            renderer.render({ scene, camera });
          };

          renderLoop();

        }
      };
      img.onerror = () => {
        if (isDestroyed || hasImageFailed) return;
        if (!retriedWithFreshCacheKey) {
          const retrySrc = withFreshCrossOriginCacheKey(src);
          if (retrySrc) {
            retriedWithFreshCacheKey = true;
            console.warn('Cylinder image failed; retrying with a fresh cross-origin cache key:', src);
            img.src = retrySrc;
            return;
          }
        }
        console.warn('Cylinder image failed; trying the existing stage fallback:', src);
        if (src === resolveMediaUrl('./theme/taylor/finale.webp')) {
          fallbackToStatic();
          return;
        }
        img.onerror = () => {
          if (isDestroyed || hasImageFailed) return;
          console.error('Cylinder stage fallback failed; using the static layout.');
          fallbackToStatic();
        };
        img.src = resolveMediaUrl('./theme/taylor/finale.webp');
      };
      img.src = src;
    });

    return () => {
      isDestroyed = true;
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrame);
      visibilityObserver.disconnect();
      animationContext?.revert();
      cylinderRef.current?.geometry.remove();
      cylinderRef.current?.program.remove();
      particlesRef.current.forEach((particle) => { particle.geometry.remove(); particle.program.remove(); });
      particlesRef.current = [];
    };
  }, [onLoaded, hasFailed, cylinderImages]);

  if (hasFailed) return <CylinderFallback copy={copy} images={cylinderImages} />;

  return (
    <>
      {/* Fixed WebGL Canvas Container */}
      <div
        ref={canvasShellRef}
        aria-hidden="true"
        className="fixed inset-0 z-10 pointer-events-none transition-opacity duration-300"
      >
        {/* 舞台光晕：让圆柱周围的留白是「被打亮的黑」，而不是空黑 */}
        <div className="cylinder-ambient" />
        <canvas ref={canvasRef} className="relative block w-full h-full" />
      </div>

      {/* Floating Perspective Typography Overlay */}
      <div
        ref={textShellRef}
        className="fixed inset-0 z-20 pointer-events-none flex items-center justify-center p-6"
      >
        {copy.perspectives.map((item, index) => (
          <div
            key={index}
            ref={(el) => {
              textRefs.current[index] = el;
            }}
            className="absolute max-w-xl text-center flex flex-col items-center opacity-0 drop-shadow-[0_2px_24px_rgba(0,0,0,0.85)]"
          >
            <span className="font-sans text-[11px] tracking-[0.32em] uppercase text-amber-300/80 mb-3.5">
              {item.tag}
            </span>
            <h2 className="font-cinzel text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-normal text-white tracking-[0.08em] leading-tight">
              {item.title}
            </h2>
            <p className="mt-4 font-serif text-sm sm:text-base md:text-lg text-white/70 leading-relaxed max-w-md font-light">
              {item.subtitle}
            </p>
          </div>
        ))}
      </div>

      {/* Scroll Trigger spacer section for Cylinder (380vh for perfect pacing) */}
      <div
        id="journey"
        ref={containerRef}
        className="relative w-full h-[380vh] pointer-events-none"
        aria-label="Cylinder 3D scroll timeline"
      />
    </>
  );
}

