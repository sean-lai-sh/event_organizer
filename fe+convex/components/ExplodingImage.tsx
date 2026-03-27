"use client";

import { useEffect, useRef, useState } from "react";

const layers = [
  { src: "/dashboard_img.png", z: 4, centerAdjustY: 2, separationDeltaY: -68 },
  { src: "/graphic_img.png", z: 3, centerAdjustY: 0, separationDeltaY: -28 },
  { src: "/Features_img.png", z: 2, centerAdjustY: -28, separationDeltaY: 28 },
  { src: "/random_ai_img.png", z: 1, centerAdjustY: -6, separationDeltaY: 68 },
] as const;

export default function ExplodingImage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [separationProgress, setSeparationProgress] = useState(0);
  const baseSpacing = 24;
  const separationScale = 1.2;
  const layerMidpoint = (layers.length - 1) / 2;

  useEffect(() => {
    let frameId = 0;

    const updateProgressFromScroll = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const start = window.innerHeight * 0.9;
      const end = window.innerHeight * 0.2;
      const rawProgress = (start - rect.top) / (start - end);
      const nextProgress = Math.min(1, Math.max(0, rawProgress));
      setSeparationProgress(nextProgress);
    };

    const onScrollOrResize = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        updateProgressFromScroll();
      });
    };

    updateProgressFromScroll();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("scroll", onScrollOrResize);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "420px",
        maxWidth: "min(100vw - 48px, 420px)",
        height: "420px",
        minWidth: "280px",
        overflow: "visible",
        backgroundColor: "transparent",
      }}
      aria-hidden
    >
      {layers.map((layer, i) => {
        const equalBaseY = (i - layerMidpoint) * baseSpacing + layer.centerAdjustY;
        const separationY =
          layer.separationDeltaY * separationScale * separationProgress;

        return (
          <img
            key={layer.src}
            src={layer.src}
            alt={`Layer ${i + 1}`}
            draggable={false}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              zIndex: layer.z,
              transform: `translateY(${equalBaseY + separationY}px)`,
              willChange: "transform",
              filter: "drop-shadow(0 10px 24px rgba(0, 0, 0, 0.16))",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
        );
      })}
    </div>
  );
}
