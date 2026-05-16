"use client";

import { cn } from "@/lib/utils";
import layer1 from "@/public/Layer 1.png";
import layer2 from "@/public/Layer 2.png";
import layer3 from "@/public/Layer 3.png";
import layer4 from "@/public/Layer 4.png";
import Image, { type StaticImageData } from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  cubicBezier,
  motion,
  useMotionTemplate,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "motion/react";

type IsomorphicExplosionProps = {
  className?: string;
};

type LayerConfig = {
  distance: number;
  src: StaticImageData;
  zIndex: number;
};

type ExplosionLayerProps = {
  layer: LayerConfig;
  opacity: MotionValue<number>;
  progress: MotionValue<number>;
  scale: MotionValue<number>;
};

const DESKTOP_QUERY = "(min-width: 1024px)";
const easeOutCubic = cubicBezier(0.22, 1, 0.36, 1);

const layers: LayerConfig[] = [
  { distance: -160, src: layer1, zIndex: 40 },
  { distance: -80, src: layer2, zIndex: 30 },
  { distance: 80, src: layer3, zIndex: 20 },
  { distance: 160, src: layer4, zIndex: 10 },
];

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    const updateMatch = () => {
      setMatches(mediaQuery.matches);
    };

    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);

    return () => {
      mediaQuery.removeEventListener("change", updateMatch);
    };
  }, [query]);

  return matches;
}

function ExplosionLayer({
  layer,
  opacity,
  progress,
  scale,
}: ExplosionLayerProps) {
  const y = useTransform(progress, [0, 1], [0, layer.distance]);
  const transform = useMotionTemplate`translate3d(0px, ${y}px, 0px) scale(${scale})`;

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
      style={{ zIndex: layer.zIndex }}
    >
      <motion.div
        style={{
          opacity,
          transform,
          willChange: "transform, opacity",
        }}
      >
        <Image
          alt=""
          className="h-auto w-auto max-h-[72svh] max-w-full sm:max-h-[44rem] sm:max-w-[36rem]"
          draggable={false}
          priority
          sizes="(min-width: 1280px) 36rem, (min-width: 1024px) 32rem, 88vw"
          src={layer.src}
        />
      </motion.div>
    </div>
  );
}

function StaticExplosionLayer({ layer }: { layer: LayerConfig }) {
  return (
    <div
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none"
      style={{ zIndex: layer.zIndex }}
    >
      <div style={{ willChange: "transform, opacity" }}>
        <Image
          alt=""
          className="h-auto w-auto max-h-[72svh] max-w-full sm:max-h-[44rem] sm:max-w-[36rem]"
          draggable={false}
          priority
          sizes="(min-width: 1280px) 36rem, (min-width: 1024px) 32rem, 88vw"
          src={layer.src}
        />
      </div>
    </div>
  );
}

export default function IsomorphicExplosion({
  className,
}: IsomorphicExplosionProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const enableScrollMotion = isDesktop && !prefersReducedMotion;

  const { scrollYProgress } = useScroll({
    offset: ["start end", "end start"],
    target: sectionRef,
  });

  const progress = useTransform(scrollYProgress, [0, 1], [0, 1], {
    ease: easeOutCubic,
  });
  const scale = useTransform(progress, [0, 1], [1, 0.96]);
  const opacity = useTransform(progress, [0, 1], [1, 0.9]);

  return (
    <section
      ref={sectionRef}
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden",
        enableScrollMotion
          ? "h-[200svh]"
          : "flex min-h-[24rem] items-center justify-center py-8 sm:min-h-[32rem] sm:py-12",
        className,
      )}
    >
      <div
        className={cn(
          enableScrollMotion
            ? "sticky top-1/2 -translate-y-1/2"
            : "relative w-full",
        )}
      >
        <div className="relative mx-auto flex h-[72svh] min-h-[24rem] w-full max-w-[36rem] items-center justify-center sm:max-h-[44rem]">
          {enableScrollMotion
            ? layers.map((layer) => (
                <ExplosionLayer
                  key={layer.src.src}
                  layer={layer}
                  opacity={opacity}
                  progress={progress}
                  scale={scale}
                />
              ))
            : layers.map((layer) => (
                <StaticExplosionLayer key={layer.src.src} layer={layer} />
              ))}
        </div>
      </div>
    </section>
  );
}
