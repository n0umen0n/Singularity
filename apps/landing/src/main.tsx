import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { AdaptiveDpr, Stars } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { gsap } from "gsap";
import * as THREE from "three";
import "./styles.css";

type Chapter = {
  eyebrow: string;
  label: string;
  title: string;
  body?: string;
  lines?: string[];
  cta?: {
    label: string;
    href: string;
    secondary?: {
      label: string;
      href: string;
    };
  };
  metric: string;
  poweredByMeteora?: boolean;
};

const chapters: Chapter[] = [
  {
    eyebrow: "Powered by Meteora",
    label: "Intro",
    title: "Fundraising redefined",
    body: "Singularity connects investors with founders to grow capital together",
    cta: {
      label: "Launch platform",
      href: "https://app.singularity.diy",
      secondary: {
        label: "Learn more",
        href: "/learn",
      },
    },
    metric: "00",
    poweredByMeteora: true,
  },
  {
    eyebrow: "The problem",
    label: "Problem",
    title: "Fundraising is brutally hard for founders",
    body: "Raising means living in limbo for months. No clarity on timing. Just pitch, wait, and hope someone responds.",
    metric: "01",
  },
  {
    eyebrow: "The solution",
    label: "Solution",
    title: "Instant capital formation around your idea",
    metric: "02",
  },
  {
    eyebrow: "How it works / Create",
    label: "Create",
    title: "Launch a mission market",
    body: "Describe what's your mission, open the market, and enable investors around the world to back you.",
    metric: "03",
  },
  {
    eyebrow: "How it works / Tokenize",
    label: "Token",
    title: "Tokenomics for every mission",
    body: "Every mission launches with a token and treasury built in.",
    lines: ["80% bonding curve / AMM", "20% mission treasury"],
    metric: "04",
  },
  {
    eyebrow: "How it works / Invest",
    label: "Invest",
    title: "Investors bet on missions",
    body: "Fully liquid markets from day one. Investors can enter or exit their positions anytime.",
    metric: "05",
  },
  {
    eyebrow: "How it works / Founder",
    label: "Founder",
    title: "Founders earn for progress",
    body: "Launch with capital behind you from day one. The more results a founder produces, the more investors pour capital in.",
    metric: "06",
  },
  {
    eyebrow: "How it works / Allocate",
    label: "Allocate",
    title: "Allocate capital together",
    body: "Investors control the mission's treasury and allocate it to founders doing the work.",
    lines: ["MSIG system", "Timelock protection"],
    cta: {
      label: "Launch platform",
      href: "https://app.singularity.diy",
    },
    metric: "07",
  },
];

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const smoothstep = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

function structureRadius(y: number) {
  const waist = Math.abs(y) / 4.7;
  return 0.028 + Math.pow(waist, 1.55) * 3.18;
}

function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max <= 0 ? 0 : clamp01(window.scrollY / max));
    };

    const scheduleUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return progress;
}

function useSmoothValue(target: number, damping = 0.07) {
  const smooth = useRef(target);

  useFrame(() => {
    smooth.current = gsap.utils.interpolate(smooth.current, target, damping);
  });

  return smooth;
}

function makeRingGeometry(radius: number, y: number, segments = 192) {
  const points: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    points.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

function makeVerticalGeometry(angle: number, segments = 150) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const y = THREE.MathUtils.lerp(-4.7, 4.7, t);
    const radius = structureRadius(y);
    const twist = y * 0.12;
    const bow = Math.sin(t * Math.PI * 2) * 0.08 * Math.min(Math.abs(y) / 1.8, 1);
    points.push(
      new THREE.Vector3(
        Math.cos(angle + twist) * (radius + bow),
        y,
        Math.sin(angle + twist) * (radius + bow),
      ),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function GlowLine({
  geometry,
  color,
  opacity = 0.65,
  introDelay = 0,
  introDuration = 0.9,
}: {
  geometry: THREE.BufferGeometry;
  color: string;
  opacity?: number;
  introDelay?: number;
  introDuration?: number;
}) {
  const line = useMemo(() => {
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    const entry = new THREE.Line(geometry, material);
    entry.scale.setScalar(0.001);
    return entry;
  }, [color, geometry, opacity]);

  useFrame(({ clock }) => {
    const material = line.material;
    if (Array.isArray(material)) return;

    const reveal = smoothstep((clock.elapsedTime - introDelay) / introDuration);
    const wave = Math.max(0, 1 - Math.abs(clock.elapsedTime - introDelay - introDuration * 0.42) / (introDuration * 0.42));
    const scale = 0.001 + reveal * 0.999;

    line.scale.setScalar(scale);
    material.opacity = Math.min(opacity, opacity * reveal + wave * 0.18);
  });

  useEffect(() => {
    return () => {
      const material = line.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => entry.dispose());
      } else {
        material.dispose();
      }
    };
  }, [line]);

  return <primitive object={line} />;
}

function Structure({ progress }: { progress: React.MutableRefObject<number> }) {
  const group = useRef<THREE.Group>(null);
  const ringGeometries = useMemo(() => {
    const levels = [
      -4.7, -4.45, -4.2, -3.9, -3.55, -3.05, -2.45, -1.8, -1.25, -0.72, -0.35, 0, 0.35, 0.72, 1.25, 1.8,
      2.45, 3.05, 3.55, 3.9, 4.2, 4.45, 4.7,
    ];
    return levels.map((y) => {
      const radius = structureRadius(y);
      return { y, geometry: makeRingGeometry(radius, y) };
    });
  }, []);

  const verticalGeometries = useMemo(
    () => Array.from({ length: 18 }, (_, i) => makeVerticalGeometry((i / 18) * Math.PI * 2)),
    [],
  );

  useFrame(({ clock }) => {
    if (!group.current) return;
    const p = progress.current;
    const intro = smoothstep(clock.elapsedTime / 1.9);

    group.current.scale.setScalar(1);
    group.current.rotation.y = (1 - intro) * -0.42 + clock.elapsedTime * 0.045 + p * Math.PI * 0.42;
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.22) * 0.025;
    group.current.position.y = THREE.MathUtils.lerp(-0.5, 0.7, p);
  });

  return (
    <group ref={group}>
      {ringGeometries.map(({ geometry, y }, index) => {
        const color = y < 0 ? "#766cff" : "#ff6a4a";
        const opacity = index === 5 ? 0.82 : 0.48 + Math.abs(y) * 0.045;
        return (
          <GlowLine
            key={`ring-${y}`}
            geometry={geometry}
            color={color}
            opacity={opacity}
            introDelay={Math.abs(y) * 0.095}
            introDuration={0.64}
          />
        );
      })}

      {verticalGeometries.map((geometry, index) => (
        <GlowLine
          key={`vertical-${index}`}
          geometry={geometry}
          color={index % 2 === 0 ? "#ff6a4a" : "#8f7cff"}
          opacity={0.44}
          introDelay={0.22 + (index % 6) * 0.025}
          introDuration={1.08}
        />
      ))}

      <mesh>
        <sphereGeometry args={[0.055, 32, 32]} />
        <meshBasicMaterial color="#fff3e7" transparent opacity={0.92} />
      </mesh>
      <pointLight color="#ff6a4a" intensity={36} distance={8} position={[0, 0, 0]} />
      <pointLight color="#766cff" intensity={24} distance={8} position={[0, -2.4, 0]} />
    </group>
  );
}

function ParticleField({ progress }: { progress: React.MutableRefObject<number> }) {
  const points = useRef<THREE.Points>(null);
  const sprite = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    if (!context) return null;

    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 31);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.34, "rgba(255,255,255,0.78)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(32, 32, 31, 0, Math.PI * 2);
    context.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }, []);

  const geometry = useMemo(() => {
    const count = 1800;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i += 1) {
      const radius = 2 + Math.random() * 9;
      const angle = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 12;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius - 1.5;

      const brightness = 0.28 + Math.random() * 0.72;
      colors[i * 3] = brightness;
      colors[i * 3 + 1] = brightness;
      colors[i * 3 + 2] = brightness;
    }

    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return buffer;
  }, []);

  useFrame(({ clock }) => {
    if (!points.current) return;
    points.current.rotation.y = clock.elapsedTime * 0.018 + progress.current * 0.8;
    points.current.position.z = THREE.MathUtils.lerp(-3, 3, progress.current);
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial
        vertexColors
        map={sprite ?? undefined}
        transparent
        opacity={0.7}
        alphaTest={0.01}
        size={0.052}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function CameraRig({ progress }: { progress: React.MutableRefObject<number> }) {
  const { camera } = useThree();
  const targetPosition = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const p = progress.current;
    const y = THREE.MathUtils.lerp(-7.2, 4.9, p);
    const z = THREE.MathUtils.lerp(8.2, 2.25, p);

    targetPosition.set(0, y, z);
    camera.position.copy(targetPosition);
    camera.lookAt(0, THREE.MathUtils.lerp(-1.1, 1.2, p), 0);
  });

  return null;
}

function SceneContents({ scrollProgress }: { scrollProgress: number }) {
  const smoothProgress = useSmoothValue(scrollProgress, 0.055);

  return (
    <>
      <color attach="background" args={["#020203"]} />
      <fog attach="fog" args={["#020203", 5, 16]} />
      <ambientLight intensity={0.14} />
      <Stars radius={40} depth={16} count={900} factor={2.5} saturation={0} fade speed={0.35} />
      <ParticleField progress={smoothProgress} />
      <Structure progress={smoothProgress} />
      <CameraRig progress={smoothProgress} />
      <EffectComposer multisampling={0}>
        <Bloom intensity={1.35} luminanceThreshold={0.12} luminanceSmoothing={0.22} mipmapBlur />
      </EffectComposer>
      <AdaptiveDpr pixelated />
    </>
  );
}

function Scene({ scrollProgress }: { scrollProgress: number }) {
  return (
    <Canvas camera={{ position: [0, -7.2, 8.2], fov: 48 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
      <SceneContents scrollProgress={scrollProgress} />
    </Canvas>
  );
}

function App() {
  const scrollProgress = useScrollProgress();
  const [isLoaded, setIsLoaded] = useState(false);
  const activeIndex = Math.min(chapters.length - 1, Math.round(scrollProgress * (chapters.length - 1)));
  const stopCount = Math.max(chapters.length - 1, 1);
  const hasPreviousChapter = activeIndex > 0;
  const hasNextChapter = activeIndex < chapters.length - 1;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsLoaded(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  const scrollToChapter = (index: number) => {
    document.getElementById(`chapter-${index + 1}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <main className={isLoaded ? "page loaded" : "page"}>
      <section className="hero">
        <div className="webgl" aria-hidden="true">
          <Scene scrollProgress={scrollProgress} />
        </div>

        <div className="vignette" aria-hidden="true" />
        <header className="nav">
          <div className="brand-wordmark" aria-label="Singularity">
            <svg className="brand-cone" viewBox="0 0 64 64" aria-hidden="true">
              <g className="brand-cone-shell">
                <path d="M11 10 C22 23 25 27 32 32 C39 37 42 41 53 54" />
                <path d="M53 10 C42 23 39 27 32 32 C25 37 22 41 11 54" />
                <path d="M20 11 C28 24 29 40 20 53" />
                <path d="M44 11 C36 24 35 40 44 53" />
              </g>
              <g className="brand-cone-rings">
                <ellipse cx="32" cy="10" rx="21" ry="4.6" />
                <ellipse cx="32" cy="16" rx="15" ry="3.2" />
                <ellipse cx="32" cy="32" rx="5.2" ry="2" />
                <ellipse cx="32" cy="48" rx="15" ry="3.2" />
                <ellipse cx="32" cy="54" rx="21" ry="4.6" />
              </g>
            </svg>
            <span>Singularity</span>
          </div>
          <nav className="social-links" aria-label="Social links">
            <a className="social-link github-link" href="https://github.com/n0umen0n/Singularity" aria-label="GitHub" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.62 2.29 6.69 5.47 7.77.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.16-.28-.16-.68-.56-.01-.57.63-.01 1.08.59 1.23.83.72 1.23 1.87.89 2.33.67.07-.53.28-.89.51-1.09-1.78-.21-3.64-.91-3.64-4.03 0-.89.31-1.62.82-2.19-.08-.21-.36-1.04.08-2.16 0 0 .67-.22 2.2.84A7.43 7.43 0 0 1 8 3.94c.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.12.16 1.95.08 2.16.51.57.82 1.3.82 2.19 0 3.13-1.87 3.82-3.65 4.03.29.26.54.75.54 1.52 0 1.09-.01 1.97-.01 2.24 0 .22.15.48.55.4A8.16 8.16 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z" />
              </svg>
            </a>
            <a className="social-link telegram-link" href="https://t.me/singularity_diy" aria-label="Telegram" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M21.7 4.1c.3-1.2-.86-1.66-1.72-1.3L2.9 9.4c-1.16.46-1.14 1.12-.2 1.4l4.38 1.36 10.16-6.42c.48-.3.92-.14.56.18l-8.24 7.44-.32 4.78c.46 0 .66-.2.92-.44l2.2-2.14 4.58 3.38c.84.46 1.44.22 1.66-.78l3.1-14.1Z" />
              </svg>
            </a>
            <a className="social-link" href="https://x.com/fundraisebest" aria-label="X" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.42 10.17 22.3 1h-1.87l-6.84 7.96L8.13 1H1.82l8.26 12.03L1.82 22.64h1.87l7.22-8.4 5.76 8.4h6.31l-8.56-12.47Zm-2.56 2.98-.84-1.2L4.36 2.4h2.88l5.38 7.7.84 1.2 6.98 9.98h-2.88l-5.7-8.14Z" />
              </svg>
            </a>
          </nav>
        </header>

        <aside className="timeline" aria-label="Scroll chapters">
          <span className="timeline-kicker">Overview</span>
          {chapters.map((chapter, index) => (
            <a
              className={index === activeIndex ? "timeline-item active" : "timeline-item"}
              href={`#chapter-${index + 1}`}
              key={chapter.label}
            >
              <span>{chapter.metric}</span>
              <strong>{chapter.label}</strong>
            </a>
          ))}
        </aside>

        <div className="chapter-stage" aria-live="polite">
          {chapters.map((chapter, index) => {
            const chapterProgress = scrollProgress * stopCount;
            const distance = Math.abs(chapterProgress - index);
            const visibility = smoothstep(1 - Math.max(0, distance - 0.08) / 0.62);
            const isActive = index === activeIndex;
            const sharpness = isActive ? Math.max(visibility, 0.96) : visibility;
            const opacity = isActive ? Math.max(visibility, 0.98) : visibility * 0.86;
            const lift = (index - chapterProgress) * 1.35;

            return (
              <article
                className={["chapter-card", index <= 1 ? "intro-card" : ""].filter(Boolean).join(" ")}
                key={chapter.label}
                style={
                  {
                    "--text-opacity": opacity.toFixed(3),
                    "--text-lift": `${lift.toFixed(3)}rem`,
                    "--text-blur": `${((1 - sharpness) * 6).toFixed(3)}px`,
                    "--text-scale": (0.99 + sharpness * 0.01).toFixed(3),
                  } as React.CSSProperties
                }
                aria-hidden={!isActive}
              >
                {chapter.poweredByMeteora ? (
                  <a
                    className="eyebrow meteora-powered"
                    href="https://www.meteora.ag/?tab=top"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Powered by Meteora"
                  >
                    <span>Powered by Meteora</span>
                    <img src="/meteora-symbol.svg" alt="" aria-hidden="true" />
                  </a>
                ) : chapter.eyebrow ? (
                  <p className="eyebrow">{chapter.eyebrow}</p>
                ) : null}
                <h2>{chapter.title}</h2>
                {chapter.body ? <p>{chapter.body}</p> : null}
                {chapter.lines ? (
                  <ul className="chapter-list">
                    {chapter.lines.map((line) => {
                      const splitLine = line.match(/^(\d+%)\s(.+)$/);

                      return (
                        <li key={line}>
                          {splitLine ? (
                            <>
                              <strong>{splitLine[1]}</strong>
                              <span>{splitLine[2]}</span>
                            </>
                          ) : (
                            <span>{line}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
                {chapter.cta ? (
                  <div className="chapter-actions">
                    <a className="chapter-action" href={chapter.cta.href}>
                      {chapter.cta.label}
                    </a>
                    {chapter.cta.secondary ? (
                      <a className="chapter-action-secondary" href={chapter.cta.secondary.href}>
                        {chapter.cta.secondary.label}
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>

        <nav className="section-arrows" aria-label="Chapter navigation">
          {hasPreviousChapter ? (
            <button className="section-arrow section-arrow-prev" type="button" aria-label="Previous section" onClick={() => scrollToChapter(activeIndex - 1)}>
              <span aria-hidden="true" />
            </button>
          ) : null}
          {hasNextChapter ? (
            <button className="section-arrow section-arrow-next" type="button" aria-label="Next section" onClick={() => scrollToChapter(activeIndex + 1)}>
              <span aria-hidden="true" />
            </button>
          ) : null}
        </nav>
      </section>

      <div className="chapters">
        {chapters.map((chapter, index) => (
          <section
            className="chapter-spacer"
            id={`chapter-${index + 1}`}
            key={chapter.label}
            aria-label={chapter.title}
          />
        ))}
      </div>

    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
