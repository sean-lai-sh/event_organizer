"use client";

import { motion, useReducedMotion } from "motion/react";

const layers = [
  {
    src: "/layer_1.png",
    collapsed: { x: 0, y: 60, scale: 0.988, rotate: -0.28 },
    expanded: { x: 0, y: 120, scale: 0.972, rotate: -0.28 },
    shadow: "0 18px 34px rgba(0, 0, 0, 0.14)",
  },
  {
    src: "/layer_2.png",
    collapsed: { x: 0, y: 20, scale: 0.998, rotate: -0.08 },
    expanded: { x: 0, y: 40, scale: 0.992, rotate: -0.08 },
    shadow: "0 14px 28px rgba(0, 0, 0, 0.12)",
  },
  {
    src: "/layer_3.png",
    collapsed: { x: 0, y: -20, scale: 1.004, rotate: 0.08 },
    expanded: { x: 0, y: -40, scale: 1.006, rotate: 0.08 },
    shadow: "0 11px 22px rgba(0, 0, 0, 0.1)",
  },
  {
    src: "/layer_4.png",
    collapsed: { x: 0, y: -60, scale: 1.012, rotate: 0.18 },
    expanded: { x: 0, y: -120, scale: 1.018, rotate: 0.18 },
    shadow: "0 8px 18px rgba(0, 0, 0, 0.08)",
  },
] as const;

const spring = {
  type: "spring",
  stiffness: 86,
  damping: 26,
  mass: 0.9,
} as const;

export default function ExplodedArchitectureView() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="group relative flex h-[85vh] w-[30vw] min-w-[320px] max-w-[420px] items-center justify-center overflow-visible outline-none max-[1240px]:w-[40vw] max-[1024px]:h-[95vh] max-[1024px]:w-full max-[1024px]:max-w-[420px]"
      aria-label="Platform architecture layers"
      role="img"
      tabIndex={0}
      initial="collapsed"
      animate="collapsed"
      whileHover={reduceMotion ? "collapsed" : "expanded"}
      whileFocus={reduceMotion ? "collapsed" : "expanded"}
    >
      <motion.div
        className="relative h-[min(72vh,560px)] w-[min(92%,380px)]"
        variants={{
          collapsed: { y: 0, scale: 1 },
          expanded: { y: -2, scale: 1.006 },
        }}
        transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1] }}
        style={{
          transformStyle: "preserve-3d",
          perspective: 1200,
        }}
      >
        <motion.div
          className="absolute left-1/2 top-1/2 h-[40%] w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-[32px] bg-black/10 blur-3xl"
          variants={{
            collapsed: { opacity: 0.14, scale: 0.82 },
            expanded: { opacity: 0.1, scale: 1.16 },
          }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />

        {layers.map((layer, index) => {
          return (
            <motion.img
              key={layer.src}
              src={layer.src}
              alt=""
              aria-hidden
              draggable={false}
              className="absolute left-0 top-1/2 block w-full max-w-none select-none"
              initial={false}
              variants={{
                collapsed: {
                  x: layer.collapsed.x,
                  y: `calc(-50% + ${layer.collapsed.y}px)`,
                  scale: layer.collapsed.scale,
                  rotate: layer.collapsed.rotate,
                  z: index * 6,
                },
                expanded: {
                  x: layer.expanded.x,
                  y: `calc(-50% + ${layer.expanded.y}px)`,
                  scale: layer.expanded.scale,
                  rotate: layer.expanded.rotate,
                  z: index * 18,
                },
              }}
              transition={reduceMotion ? { duration: 0 } : spring}
              style={{
                filter: `drop-shadow(${layer.shadow})`,
                transformStyle: "preserve-3d",
                zIndex: layers.length - index,
              }}
            />
          );
        })}
      </motion.div>
    </motion.div>
  );
}
