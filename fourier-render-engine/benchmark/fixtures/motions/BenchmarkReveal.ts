import React from "react";

interface BenchmarkRevealProps {
  subject: React.ReactNode;
  props: Record<string, unknown>;
  motionContext: {
    progress: number;
    width: number;
    height: number;
  };
}

export default function BenchmarkReveal({
  subject,
  props,
  motionContext,
}: BenchmarkRevealProps) {
  const direction = props.direction === "right" ? -1 : 1;
  const distance =
    typeof props.distance === "number" ? props.distance : 24;
  const translateX =
    (1 - motionContext.progress) * distance * direction;

  return React.createElement(
    "div",
    {
      style: {
        width: motionContext.width,
        height: motionContext.height,
        display: "flex",
        overflow: "hidden",
        opacity: 0.35 + motionContext.progress * 0.65,
      },
    },
    React.createElement(
      "div",
      {
        style: {
          width: motionContext.width,
          height: motionContext.height,
          display: "flex",
          transform: `translateX(${translateX}px)`,
        },
      },
      subject,
    ),
  );
}
