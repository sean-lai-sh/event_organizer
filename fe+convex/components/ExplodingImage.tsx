"use client";

import { useState } from "react";

const layers = [
  { src: "/dashboard_img.png", z: 4, centerAdjustY: 2, hoverDeltaY: -68 },
  { src: "/graphic_img.png", z: 3, centerAdjustY: 0, hoverDeltaY: -28 },
  { src: "/Features_img.png", z: 2, centerAdjustY: -28, hoverDeltaY: 28 },
  { src: "/random_ai_img.png", z: 1, centerAdjustY: -6, hoverDeltaY: 68 },
] as const;

export default function ExplodingImage() {
  const [hovered, setHovered] = useState(false);
  const baseSpacing = 24;
  const layerMidpoint = (layers.length - 1) / 2;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "relative",
        width: "420px",
        maxWidth: "min(100vw - 48px, 420px)",
        height: "420px",
        minWidth: "280px",
        cursor: "pointer",
        overflow: "visible",
        backgroundColor: "transparent",
      }}
      aria-hidden
    >
      {layers.map((layer, i) => {
        const equalBaseY = (i - layerMidpoint) * baseSpacing + layer.centerAdjustY;

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
              transform: `translateY(${equalBaseY + (hovered ? layer.hoverDeltaY : 0)}px)`,
              transition: "transform 560ms cubic-bezier(0.22, 1, 0.36, 1)",
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
