import { useEffect, useRef } from 'react';
import { Camera, Mesh, Program, Renderer, Texture, Transform } from 'ogl';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';
import type { SiteCopy } from '@/data/i18n';
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

const CYLINDER_IMAGES = [
  './img/taylor/era-01.webp',
  './img/taylor/era-02.webp',
  './img/taylor/era-03.webp',
  './img/taylor/era-04.webp',
  './img/taylor/era-05.webp',
  './img/taylor/era-06.webp',
  './img/taylor/era-07.webp',
  './img/taylor/era-08.webp',
  './img/taylor/era-09.webp',
  './img/taylor/era-10.webp',
  './img/taylor/era-11.webp',
  './img/taylor/era-12.webp',
];

interface CylinderExperienceProps {
  copy: SiteCopy['cylinder'];
  onLoaded: () => void;
}

type ParticleMesh = Mesh & { userData: ParticleUserData };

export function CylinderExperience({ copy, onLoaded }: CylinderExperienceProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasShellRef = useRef<HTMLDivElement>(null);
  const textShellRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<(HTMLDivElement | null)[]>([]);

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
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let isDestroyed = false;
    let animationFrame = 0;
    let animationContext: gsap.Context | undefined;
    let sceneVisible = false;
    const visibilityObserver = new IntersectionObserver(([entry]) => { sceneVisible = entry.isIntersecting; });
    visibilityObserver.observe(container);

    const renderer = new Renderer({
      canvas,
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio, 2),
      alpha: true,
      antialias: true,
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 1);
    gl.disable(gl.CULL_FACE);
    rendererRef.current = renderer;

    const getResponsiveConfig = () => {
      const width = window.innerWidth;
      const isMobile = width < 768;
      const isTablet = width >= 768 && width < 1024;
      return {
        radius: isMobile ? 1.9 : isTablet ? 2.3 : 2.5,
        height: isMobile ? 1.4 : isTablet ? 1.8 : 2.0,
        cameraZ: isMobile ? 6.2 : isTablet ? 7.2 : 8.0,
        fov: isMobile ? 52 : 45,
        isMobile,
      };
    };

    const dimensions = getResponsiveConfig();
    const camera = new Camera(gl, {
      fov: dimensions.fov,
      aspect: window.innerWidth / window.innerHeight,
    });
    camera.position.set(0, 0, dimensions.cameraZ);
    cameraAnimRef.current.z = dimensions.cameraZ;
    cameraRef.current = camera;

    const scene = new Transform();
    const cylinderGeometry = createCylinderGeometry(gl, {
      radius: dimensions.radius,
      height: dimensions.height,
      radialSegments: 64,
      heightSegments: 1,
    });

    // High performance texture baking
    const textureCanvas = document.createElement('canvas');
    const ctx = textureCanvas.getContext('2d', { alpha: false })!;
    const singleWidth = 1024;
    const singleHeight = 1024;
    const hardwareLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const safeMax = dimensions.isMobile ? 2048 : Math.min(hardwareLimit, 8192);
    const totalOriginalWidth = singleWidth * CYLINDER_IMAGES.length;
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

      rendererRef.current.setSize(width, height);
      cameraRef.current.perspective({
        fov: next.fov,
        aspect: width / height,
      });
      ScrollTrigger.refresh();
    };

    CYLINDER_IMAGES.forEach((src, idx) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (isDestroyed) return;
        imageObjects[idx] = img;
        loadedCount += 1;

        if (loadedCount === CYLINDER_IMAGES.length) {
          // Draw all images onto panorama texture strip
          imageObjects.forEach((imageItem, imageIdx) => {
            const x0 = Math.floor((imageIdx / CYLINDER_IMAGES.length) * textureCanvas.width);
            const x1 = Math.floor(((imageIdx + 1) / CYLINDER_IMAGES.length) * textureCanvas.width);
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
          cylinder.setParent(scene);
          cylinder.rotation.y = 0.5;
          cylinderRef.current = cylinder;

          // Create particle trails
          const numParticles = dimensions.isMobile ? 8 : 16;
          for (let i = 0; i < numParticles; i++) {
            const { geometry: pGeom, userData } = createParticleGeometry(
              gl,
              {
                numParticles,
                particleRadius: dimensions.radius * 1.35,
                segments: 20,
                angleSpan: 0.35,
              },
              i,
              dimensions.height
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
              z: dimensions.cameraZ,
              duration: 1.5,
              ease: 'power2.inOut',
            })
              // 25% -> 50%: Elevation & looking down
              .to(cameraAnimRef.current, {
                x: 0.4,
                y: 3.6,
                z: dimensions.cameraZ * 0.72,
                duration: 2.2,
                ease: 'cinematicFlow',
              })
              // 50% -> 75%: Close glide along cylinder wall
              .to(cameraAnimRef.current, {
                x: 1.1,
                y: 1.2,
                z: dimensions.radius * 1.35,
                duration: 2.5,
                ease: 'power1.inOut',
              })
              // 75% -> 92%: Centering directly in front of target hero image
              .to(cameraAnimRef.current, {
                x: 0,
                y: 0,
                z: dimensions.radius + 1.1,
                duration: 2.0,
                ease: 'power2.out',
              })
              // 92% -> 100%: Accelerating straight into the photograph (The Dive!)
              .to(cameraAnimRef.current, {
                x: 0,
                y: 0,
                z: dimensions.radius + 0.15,
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

          onLoaded();
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
          window.addEventListener('resize', handleResize);


        }
      };
      img.onerror = () => {
        console.error('Failed to load cylinder image:', src);
        onLoaded();
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
  }, [onLoaded]);

  return (
    <>
      {/* Fixed WebGL Canvas Container */}
      <div
        ref={canvasShellRef}
        aria-hidden="true"
        className="fixed inset-0 z-10 pointer-events-none transition-opacity duration-300"
      >
        <canvas ref={canvasRef} className="block w-full h-full" />
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

