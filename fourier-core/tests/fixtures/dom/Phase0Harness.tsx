import React, { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

interface Lifecycle {
  fourierStart(): void;
  fourierEnd(): void;
}

declare global {
  interface Window {
    phase0Harness: {
      initialize(): Promise<void>;
      setTime(milliseconds: number): Promise<void>;
      snapshot(): Array<{ currentTime: number | null; playState: AnimationPlayState }>;
    };
  }
}

let lifecycle: Lifecycle | undefined;
let animations: Animation[] = [];

function Probe(): React.ReactNode {
  const [ended, setEnded] = useState(false);
  const waapiTarget = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    lifecycle = {
      fourierStart: () => setEnded(false),
      fourierEnd: () => setEnded(true),
    };
    return () => {
      lifecycle = undefined;
    };
  }, []);
  useLayoutEffect(() => {
    const target = waapiTarget.current;
    if (target === null) throw new Error("missing WAAPI target");
    const animation = target.animate([
      { transform: "scale(0.75)" },
      { transform: "scale(1)" },
    ], { duration: 1000, fill: "both", easing: "linear" });
    animation.pause();
    return () => animation.cancel();
  }, []);
  return (
    <div id="probe" style={{ position: "relative", width: 64, height: 64, overflow: "hidden" }}>
      <style>{`@keyframes phase0-hue { from { filter: hue-rotate(0deg) } to { filter: hue-rotate(90deg) } }`}</style>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: ended ? 1 : 0,
          transform: ended ? "translateX(0px)" : "translateX(24px)",
          transition: "opacity 1000ms linear, transform 1000ms linear",
          background: "#22c55e",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 8,
          background: "#2563eb",
          animation: "phase0-hue 1000ms linear both",
        }}
      />
      <div
        ref={waapiTarget}
        style={{ position: "absolute", inset: 16, background: "#f97316" }}
      />
      <img
        alt="phase0"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8'%3E%3Crect width='8' height='8' fill='%23fff'/%3E%3C/svg%3E"
        style={{ position: "absolute", left: 28, top: 28, width: 8, height: 8 }}
      />
    </div>
  );
}

const rootNode = document.getElementById("root");
if (rootNode === null) throw new Error("missing #root");
const root = createRoot(rootNode);
flushSync(() => root.render(<Probe />));

function forceLayout(): void {
  const probe = document.getElementById("probe");
  if (probe === null) throw new Error("missing #probe");
  void probe.getBoundingClientRect();
  void getComputedStyle(probe).opacity;
}

window.phase0Harness = {
  async initialize() {
    if (lifecycle === undefined) throw new Error("lifecycle was not registered");
    flushSync(() => lifecycle!.fourierStart());
    forceLayout();
    flushSync(() => lifecycle!.fourierEnd());
    forceLayout();
    await document.fonts.ready;
    await Promise.all(Array.from(document.images, (image) => image.decode()));
    animations = document.getElementById("root")!.getAnimations({ subtree: true });
    if (animations.length !== 4) {
      throw new Error(`expected transition/keyframes/WAAPI manifest of 4, received ${animations.length}`);
    }
    for (const animation of animations) animation.pause();
    await Promise.all(animations.map((animation) => animation.ready));
    for (const animation of animations) animation.currentTime = 0;
    forceLayout();
  },
  async setTime(milliseconds) {
    for (const animation of animations) {
      animation.currentTime = milliseconds;
      animation.pause();
    }
    await Promise.resolve();
    forceLayout();
  },
  snapshot() {
    return animations.map((animation) => ({
      currentTime: animation.currentTime === null
        ? null
        : Number(animation.currentTime),
      playState: animation.playState,
    }));
  },
};
