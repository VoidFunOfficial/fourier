import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ForwardedRef,
  type JSX,
  type ReactElement,
  type ReactNode,
} from "react";
import { SdkError } from "./errors.ts";
import { useFourierLifecycle, useFourierTimeline } from "./runtime.ts";
import type { FourierAnimationOptions } from "./types.ts";

type TransformValue = string | number;

/** One deterministic CSS keyframe on the host-controlled Fourier timeline. */
export type FourierMotionTarget = Omit<
  CSSProperties,
  "offset" | "transform" | "translate" | "rotate" | "scale"
> & {
  /** Motion-style transform shortcuts. Numeric translation values use px. */
  x?: TransformValue;
  y?: TransformValue;
  z?: TransformValue;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotate?: TransformValue;
  rotateX?: TransformValue;
  rotateY?: TransformValue;
  skewX?: TransformValue;
  skewY?: TransformValue;
  transform?: string;
  offset?: number;
  easing?: string;
} & {
  [Property in `--${string}`]?: string | number;
};

export interface FourierMotionTransition {
  /** Seconds, matching the familiar Motion authoring convention. Defaults to host duration. */
  duration?: number;
  /** Seconds. Negative delay is allowed by the underlying Fourier timeline. */
  delay?: number;
  /** CSS easing or cubic-bezier control points. */
  ease?: string | readonly [number, number, number, number];
  /** Additional play count after the first iteration. Must be finite. */
  repeat?: number;
  repeatType?: "loop" | "reverse";
  fill?: FillMode;
}

export interface FourierMotionRootProps {
  children?: ReactNode;
}

type MotionElementProps<Tag extends keyof JSX.IntrinsicElements> = Omit<
  JSX.IntrinsicElements[Tag],
  "ref" | "initial" | "animate" | "transition"
> & {
  /** Initial visual state. Pass false to animate from the element's authored CSS. */
  initial?: FourierMotionTarget | false;
  /** End state or an explicit ordered keyframe sequence. */
  animate: FourierMotionTarget | readonly FourierMotionTarget[];
  transition?: FourierMotionTransition;
};

type IntrinsicElement<Tag extends keyof JSX.IntrinsicElements> =
  Tag extends keyof HTMLElementTagNameMap
    ? HTMLElementTagNameMap[Tag]
    : Tag extends keyof SVGElementTagNameMap
      ? SVGElementTagNameMap[Tag]
      : Element;

export type FourierMotionComponent<Tag extends keyof JSX.IntrinsicElements> =
  React.ForwardRefExoticComponent<
    React.PropsWithoutRef<MotionElementProps<Tag>> &
    React.RefAttributes<IntrinsicElement<Tag>>
  >;

export type FourierMotionElements = {
  readonly [Tag in keyof JSX.IntrinsicElements]: FourierMotionComponent<Tag>;
};

export interface FourierMotionFactory {
  create<Tag extends keyof JSX.IntrinsicElements>(
    tag: Tag,
  ): FourierMotionComponent<Tag>;
}

const RootContext = createContext(false);

/**
 * Registers the single lifecycle required by a Fourier Motion artifact.
 * Place exactly one root around any number of motion.* elements.
 */
export function FourierMotion({ children }: FourierMotionRootProps): ReactElement {
  const nested = useContext(RootContext);
  useFourierLifecycle({ fourierStart() {}, fourierEnd() {} });
  if (nested) {
    throw new SdkError(
      "NESTED_FOURIER_MOTION_ROOT",
      "FourierMotion 不能嵌套；一个 artifact 只需要一个根节点",
    );
  }
  return React.createElement(RootContext.Provider, { value: true }, children);
}

const transformKeys = new Set([
  "x",
  "y",
  "z",
  "scale",
  "scaleX",
  "scaleY",
  "rotate",
  "rotateX",
  "rotateY",
  "skewX",
  "skewY",
]);

function dimension(value: TransformValue | undefined): string {
  if (value === undefined) return "0px";
  return typeof value === "number" ? `${value}px` : value;
}

function angle(value: TransformValue): string {
  return typeof value === "number" ? `${value}deg` : value;
}

function transformFor(target: FourierMotionTarget): string | undefined {
  const shortcuts = [...transformKeys].filter(
    (key) => target[key as keyof FourierMotionTarget] !== undefined,
  );
  if (target.transform !== undefined && shortcuts.length > 0) {
    throw new SdkError(
      "AMBIGUOUS_FOURIER_MOTION_TRANSFORM",
      "Fourier Motion keyframe 不能同时声明 transform 与 transform shortcut",
      { fields: shortcuts },
    );
  }
  if (target.transform !== undefined) return target.transform;
  if (shortcuts.length === 0) return undefined;

  const parts: string[] = [];
  if (target.x !== undefined || target.y !== undefined || target.z !== undefined) {
    parts.push(
      `translate3d(${dimension(target.x)}, ${dimension(target.y)}, ${dimension(target.z)})`,
    );
  }
  if (target.scale !== undefined) parts.push(`scale(${target.scale})`);
  if (target.scaleX !== undefined) parts.push(`scaleX(${target.scaleX})`);
  if (target.scaleY !== undefined) parts.push(`scaleY(${target.scaleY})`);
  if (target.rotate !== undefined) parts.push(`rotate(${angle(target.rotate)})`);
  if (target.rotateX !== undefined) parts.push(`rotateX(${angle(target.rotateX)})`);
  if (target.rotateY !== undefined) parts.push(`rotateY(${angle(target.rotateY)})`);
  if (target.skewX !== undefined) parts.push(`skewX(${angle(target.skewX)})`);
  if (target.skewY !== undefined) parts.push(`skewY(${angle(target.skewY)})`);
  return parts.join(" ");
}

function nativeKeyframe(target: FourierMotionTarget): Keyframe {
  const frame: Record<string, string | number | null | undefined> = {};
  for (const [property, value] of Object.entries(target)) {
    if (transformKeys.has(property) || property === "transform") continue;
    frame[property] = value as string | number | null | undefined;
  }
  const transform = transformFor(target);
  if (transform !== undefined) frame.transform = transform;
  return frame as Keyframe;
}

function keyframesFor(
  initial: FourierMotionTarget | false | undefined,
  animate: FourierMotionTarget | readonly FourierMotionTarget[],
): Keyframe[] {
  const targets = Array.isArray(animate) ? [...animate] : [animate];
  if (targets.length === 0) {
    throw new SdkError(
      "EMPTY_FOURIER_MOTION_KEYFRAMES",
      "Fourier Motion animate 至少需要一个 keyframe",
    );
  }
  if (initial !== undefined && initial !== false) targets.unshift(initial);
  return targets.map(nativeKeyframe);
}

function easingValue(
  ease: FourierMotionTransition["ease"],
): string | undefined {
  if (ease === undefined || typeof ease === "string") return ease;
  return `cubic-bezier(${ease.join(",")})`;
}

function animationOptions(
  transition: FourierMotionTransition | undefined,
): FourierAnimationOptions {
  if (transition === undefined) return {};
  const easing = easingValue(transition.ease);
  return {
    ...(transition.duration === undefined
      ? {}
      : { duration: transition.duration * 1_000 }),
    ...(transition.delay === undefined ? {} : { delay: transition.delay * 1_000 }),
    ...(easing === undefined ? {} : { easing }),
    ...(transition.repeat === undefined
      ? {}
      : { iterations: transition.repeat + 1 }),
    ...(transition.repeatType === undefined
      ? {}
      : { direction: transition.repeatType === "reverse" ? "alternate" : "normal" }),
    ...(transition.fill === undefined ? {} : { fill: transition.fill }),
  };
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref !== null) {
    ref.current = value;
  }
}

const componentCache = new Map<keyof JSX.IntrinsicElements, unknown>();

function createMotionComponent<Tag extends keyof JSX.IntrinsicElements>(
  tag: Tag,
): FourierMotionComponent<Tag> {
  const cached = componentCache.get(tag);
  if (cached !== undefined) return cached as FourierMotionComponent<Tag>;

  const Component = forwardRef<IntrinsicElement<Tag>, MotionElementProps<Tag>>(
    function FourierMotionElement(rawProps, forwardedRef) {
      const props = rawProps as MotionElementProps<Tag>;
      const insideRoot = useContext(RootContext);
      const timeline = useFourierTimeline();
      const target = useRef<IntrinsicElement<Tag> | null>(null);
      const declaration = useRef({
        initial: props.initial,
        animate: props.animate,
        transition: props.transition,
      });
      const setTarget = useCallback((value: IntrinsicElement<Tag> | null) => {
        target.current = value;
        assignRef(forwardedRef, value);
      }, [forwardedRef]);

      useLayoutEffect(() => {
        if (!insideRoot) {
          throw new SdkError(
            "FOURIER_MOTION_ROOT_REQUIRED",
            `motion.${String(tag)} 必须放在 FourierMotion 内`,
          );
        }
        if (target.current === null) {
          throw new SdkError(
            "FOURIER_MOTION_TARGET_REQUIRED",
            `motion.${String(tag)} 未挂载动画目标`,
          );
        }
        timeline.animate(
          target.current,
          keyframesFor(declaration.current.initial, declaration.current.animate),
          animationOptions(declaration.current.transition),
        );
      }, [insideRoot, timeline]);

      const {
        initial: _initial,
        animate: _animate,
        transition: _transition,
        ...elementProps
      } = props;
      return React.createElement(tag, { ...elementProps, ref: setTarget });
    },
  );
  Component.displayName = `motion.${String(tag)}`;
  componentCache.set(tag, Component);
  return Component;
}

const factory: FourierMotionFactory = Object.freeze({
  create: createMotionComponent,
});

/** Motion-style intrinsic elements backed only by the Fourier SDK timeline. */
export const motion = new Proxy(factory as FourierMotionFactory & FourierMotionElements, {
  get(target, property, receiver) {
    if (Reflect.has(target, property)) return Reflect.get(target, property, receiver);
    if (typeof property !== "string") return undefined;
    return createMotionComponent(property as keyof JSX.IntrinsicElements);
  },
});
