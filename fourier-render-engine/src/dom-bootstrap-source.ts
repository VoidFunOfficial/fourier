export function createDomBootstrapSource(entryPath: string): string {
  return `
import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import {
  SDK_ARTIFACT,
  bindSchemaProps,
  createFourierRuntimeController,
  FourierRuntimeProvider,
} from "@fourier-video/sdk";
import artifact from ${JSON.stringify(entryPath)};

const metadata = artifact?.[SDK_ARTIFACT];
if (metadata?.sdkAbiVersion !== 1 || !["dom-timeline", "dom-timeline-ffmpeg-video"].includes(metadata?.renderer)) {
  throw Object.assign(new Error("browser bundle 需要 SDK ABI v1 dom-timeline artifact"), {
    code: "ARTIFACT_RUNTIME_MISMATCH",
  });
}

const rootNode = document.getElementById("fourier-root");
if (rootNode === null) throw new Error("missing #fourier-root");
const root = createRoot(rootNode);
let controller;
let animations = [];
let mediaElements = [];
let smilAnimations = [];
let smilRoots = [];
let baselineDom = "";
let baselineAnimations = "";
let mutationCount = 0;
let observer;

function fail(code, message, details) {
  throw Object.assign(new Error(message), { code, details });
}

function synchronous(value, operation) {
  if (value !== null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function") {
    fail("FOURIER_LIFECYCLE_ASYNC", operation + " 必须同步返回");
  }
  return value;
}

function forceLayout() {
  void rootNode.getBoundingClientRect();
  void getComputedStyle(rootNode).opacity;
}

function domManifest() {
  return rootNode.innerHTML;
}

function targetPath(target) {
  const parts = [];
  let current = target;
  while (current instanceof Element && current !== rootNode) {
    const parent = current.parentElement;
    const index = parent === null ? 0 : Array.prototype.indexOf.call(parent.children, current);
    parts.push(current.tagName.toLowerCase() + ":" + index);
    current = parent;
  }
  return parts.reverse().join("/");
}

function animationManifest() {
  return JSON.stringify(animations.map((animation) => {
    const effect = animation.effect;
    const timing = effect?.getTiming?.() ?? {};
    const target = effect instanceof KeyframeEffect ? effect.target : null;
    return {
      constructor: animation.constructor.name,
      id: animation.id,
      target: targetPath(target),
      delay: timing.delay ?? 0,
      duration: timing.duration ?? 0,
      iterations: timing.iterations ?? 1,
      direction: timing.direction ?? "normal",
      fill: timing.fill ?? "none",
      easing: timing.easing ?? "linear",
      keyframes: effect instanceof KeyframeEffect ? effect.getKeyframes() : [],
    };
  }));
}

function mediaError(media, operation) {
  const source = media.currentSrc || media.getAttribute("src") || "";
  const sourcePreview = source.slice(0, 160);
  const code = media.error?.code;
  fail(
    "DOM_MEDIA_FAILED",
    operation + " media 失败" + (sourcePreview === "" ? "" : ": " + sourcePreview),
    { operation, source: sourcePreview, sourceLength: source.length, mediaErrorCode: code },
  );
}

function waitForMediaEvent(media, eventName, operation) {
  return new Promise((resolve, reject) => {
    const complete = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      try {
        mediaError(media, operation);
      } catch (error) {
        reject(error);
      }
    };
    const cleanup = () => {
      media.removeEventListener(eventName, complete);
      media.removeEventListener("error", failed);
    };
    media.addEventListener(eventName, complete, { once: true });
    media.addEventListener("error", failed, { once: true });
  });
}

async function prepareMedia(media) {
  media.pause();
  media.playbackRate = 1;
  if (media.error !== null) mediaError(media, "初始化");
  if (media.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    const declaredSource = media.getAttribute("src") ??
      media.querySelector("source[src]")?.getAttribute("src") ?? "";
    if (declaredSource === "") mediaError(media, "初始化（缺少 source）");
    const loaded = waitForMediaEvent(media, "loadeddata", "加载当前帧");
    media.load();
    await loaded;
  }
  await setMediaTime(media, 0);
}

function resolvedMediaTime(media, milliseconds) {
  const seconds = milliseconds / 1000;
  const duration = media.duration;
  if (!Number.isFinite(duration) || duration <= 0) return seconds;
  if (media.loop) return seconds % duration;
  return Math.min(seconds, duration);
}

async function setMediaTime(media, milliseconds) {
  const target = resolvedMediaTime(media, milliseconds);
  media.pause();
  media.playbackRate = 1;
  if (media.error !== null) mediaError(media, "采样");
  if (Math.abs(media.currentTime - target) <= 1e-7 && !media.seeking) return;
  try {
    media.currentTime = target;
  } catch {
    mediaError(media, "seek");
  }
  if (media.seeking) await waitForMediaEvent(media, "seeked", "seek");
}

function collectSmilTimelines() {
  smilAnimations = Array.from(
    rootNode.querySelectorAll("animate,animateMotion,animateTransform,set"),
  );
  smilRoots = Array.from(new Set(smilAnimations.map((animation) => {
    let svg = animation.ownerSVGElement;
    while (svg?.ownerSVGElement !== null && svg?.ownerSVGElement !== undefined) {
      svg = svg.ownerSVGElement;
    }
    return svg;
  })))
    .filter((svg) => svg !== null);
  for (const svg of smilRoots) {
    if (typeof svg.pauseAnimations !== "function" || typeof svg.setCurrentTime !== "function") {
      fail("DOM_SMIL_UNSUPPORTED", "当前浏览器不支持宿主控制 SMIL timeline");
    }
    svg.pauseAnimations();
    svg.setCurrentTime(0);
    svg.pauseAnimations();
  }
}

async function readinessBarrier() {
  await document.fonts.ready;
  await Promise.all(Array.from(rootNode.querySelectorAll("img"), (image) => image.decode()));
}

function lifecycleCommit(callback, label) {
  let result;
  flushSync(() => {
    result = callback();
  });
  synchronous(result, label);
  forceLayout();
}

function subjectFromConfig(config, preview) {
  if (config.subjectDataUrl !== undefined) {
    return React.createElement("img", {
      src: config.subjectDataUrl,
      alt: "",
      "data-fourier-subject": "",
      style: { width: "100%", height: "100%", display: "block" },
    });
  }
  return preview?.subject;
}

async function initialize(config) {
  const preview = synchronous(metadata.designPreview(), metadata.name + ".designPreview()");
  controller = createFourierRuntimeController({
    width: config.width,
    height: config.height,
    seed: config.seed,
    fps: config.fps,
    durationInFrames: config.durationInFrames,
  }, config.durationMilliseconds);
  const resolvedProps = config.useDesignPreview === true
    ? bindSchemaProps(metadata.schema, preview.props, { fps: config.fps })
    : config.props;
  const textSubject = config.textSubject !== undefined
    ? config.textSubject
    : config.useDesignPreview === true && preview.text !== undefined
      ? preview.text
      : undefined;
  const textMotion = metadata.kind === "motion" && textSubject !== undefined;
  if (textMotion && (!metadata.supportsTextMotion || typeof metadata.textComponent !== "function")) {
    fail("TEXT_MOTION_UNSUPPORTED", metadata.name + " 未实现 Text Motion");
  }
  const component = textMotion ? metadata.textComponent : metadata.component;
  const componentProps = metadata.kind === "react"
    ? { props: Object.freeze({ ...resolvedProps }) }
    : metadata.renderer === "dom-timeline-ffmpeg-video"
      ? {
          video: Object.freeze({ id: config.videoId ?? "subject" }),
          props: Object.freeze({ ...resolvedProps }),
        }
    : textMotion
      ? {
          text: textSubject,
          props: Object.freeze({ ...resolvedProps }),
        }
      : {
          subject: subjectFromConfig(config, preview),
          props: Object.freeze({ ...resolvedProps }),
        };
  const componentElement = React.createElement(component, componentProps);
  const element = metadata.kind === "motion" &&
      metadata.renderer !== "dom-timeline-ffmpeg-video" &&
      config.directPreview === true
    ? React.createElement(React.Fragment, null,
        React.createElement("div", {
          "data-fourier-motion-layer": "",
          style: { width: "100%", height: "100%", display: "block" },
          children: componentElement,
        }),
        React.createElement("div", {
          "data-fourier-original-layer": "",
          style: { width: "100%", height: "100%", display: "none" },
          children: subjectFromConfig(config, preview),
        }),
      )
    : componentElement;
  flushSync(() => root.render(
    React.createElement(FourierRuntimeProvider, {
      bindings: controller.bindings,
      children: element,
    }),
  ));
  forceLayout();

  const lifecycle = controller.getLifecycle();
  if (metadata.kind === "motion" && lifecycle === undefined) {
    fail("FOURIER_LIFECYCLE_REQUIRED", "ABI v1 Motion 必须恰好注册一个 lifecycle");
  }
  if (lifecycle !== undefined) {
    lifecycleCommit(() => lifecycle.fourierStart(), metadata.name + ".fourierStart()");
    lifecycleCommit(() => lifecycle.fourierEnd(), metadata.name + ".fourierEnd()");
  }

  await controller.prepareRenderDrivers();
  controller.renderFrame(0);

  mediaElements = Array.from(rootNode.querySelectorAll("audio,video"));
  await Promise.all(mediaElements.map(prepareMedia));
  collectSmilTimelines();

  animations = rootNode.getAnimations({ subtree: true });
  const registered = new Set(controller.getAnimations());
  const unregisteredWaapi = animations.filter((animation) =>
    animation.constructor.name === "Animation" && !registered.has(animation));
  if (unregisteredWaapi.length > 0) {
    fail("UNREGISTERED_WAAPI_ANIMATION", "原生 WAAPI 必须通过 useFourierTimeline() 注册");
  }
  for (const animation of animations) animation.pause();
  for (const animation of animations) {
    animation.currentTime = 0;
    animation.playbackRate = 1;
    animation.pause();
  }
  forceLayout();
  await Promise.resolve();
  if (animations.some((animation) => animation.currentTime === null)) {
    fail("DOM_ANIMATION_NOT_READY", "DOM animation 初始化后仍没有 currentTime");
  }
  await readinessBarrier();
  baselineDom = domManifest();
  baselineAnimations = animationManifest();
  observer = new MutationObserver((records) => {
    mutationCount += records.length;
  });
  observer.observe(rootNode, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
  const renderState = controller.getRenderState();
  const inferredStatic = lifecycle === undefined && animations.length === 0 &&
    mediaElements.length === 0 && smilAnimations.length === 0 && renderState.driverCount === 0;
  if (metadata.static === true && !inferredStatic) {
    fail(
      "STATIC_REACT_TIMELINE_VIOLATION",
      metadata.name + " 声明 static: true，但注册了 lifecycle、animation、media、SMIL 或 render driver",
      {
        hasLifecycle: lifecycle !== undefined,
        animationCount: animations.length,
        mediaCount: mediaElements.length,
        smilAnimationCount: smilAnimations.length,
        renderDriverCount: renderState.driverCount,
      },
    );
  }
  return {
    kind: metadata.kind,
    name: metadata.name,
    animationCount: animations.length,
    mediaCount: mediaElements.length,
    smilAnimationCount: smilAnimations.length,
    renderDriverCount: renderState.driverCount,
    static: metadata.static ?? inferredStatic,
  };
}

async function setTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    fail("INVALID_SAMPLE_TIME", "sample time 必须是有限非负毫秒数");
  }
  if (mutationCount !== 0 || domManifest() !== baselineDom || animationManifest() !== baselineAnimations) {
    fail("DOM_TIMELINE_MUTATED", "artifact DOM/animation manifest 在采样前发生变化");
  }
  for (const animation of animations) {
    animation.currentTime = milliseconds;
    animation.playbackRate = 1;
    animation.pause();
  }
  await Promise.all(mediaElements.map((media) => setMediaTime(media, milliseconds)));
  for (const svg of smilRoots) {
    svg.pauseAnimations();
    svg.setCurrentTime(milliseconds / 1000);
    svg.pauseAnimations();
  }
  controller.renderFrame(milliseconds);
  forceLayout();
  await readinessBarrier();
  await Promise.resolve();
  if (mutationCount !== 0 || domManifest() !== baselineDom || animationManifest() !== baselineAnimations) {
    fail("DOM_TIMELINE_MUTATED", "artifact DOM/animation manifest 在采样事务中发生变化");
  }
  return timelineSnapshot();
}

function timelineSnapshot() {
  return {
    animations: animations.map((animation) => ({
      currentTime: animation.currentTime === null ? null : Number(animation.currentTime),
      playState: animation.playState,
      playbackRate: animation.playbackRate,
    })),
    media: mediaElements.map((media) => ({
      currentTime: media.currentTime,
      paused: media.paused,
      playbackRate: media.playbackRate,
    })),
    smil: smilRoots.map((svg) => ({
      currentTime: svg.getCurrentTime(),
      paused: svg.animationsPaused(),
    })),
    videoSurfaces: controller.getRenderState().videoSurfaces,
  };
}

async function setSubject(dataUrl) {
  const images = Array.from(rootNode.querySelectorAll("img[data-fourier-subject]"));
  if (images.length === 0 || images.some((image) => !(image instanceof HTMLImageElement))) {
    fail("MOTION_SUBJECT_MISSING", "动态 Motion subject image 不存在");
  }
  observer?.disconnect();
  mutationCount = 0;
  for (const image of images) image.src = dataUrl;
  await Promise.all(images.map((image) => image.decode()));
  forceLayout();
  baselineDom = domManifest();
  mutationCount = 0;
  observer?.observe(rootNode, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function setMotionActive(active) {
  const motionLayer = rootNode.querySelector("[data-fourier-motion-layer]");
  const originalLayer = rootNode.querySelector("[data-fourier-original-layer]");
  if (!(motionLayer instanceof HTMLElement) || !(originalLayer instanceof HTMLElement)) {
    if (!active) fail("MOTION_PREVIEW_LAYER_MISSING", "直接 DOM preview 缺少原 subject layer");
    return;
  }
  observer?.disconnect();
  mutationCount = 0;
  motionLayer.style.display = active ? "block" : "none";
  originalLayer.style.display = active ? "none" : "block";
  forceLayout();
  baselineDom = domManifest();
  mutationCount = 0;
  observer?.observe(rootNode, {
    attributes: true,
    childList: true,
    characterData: true,
    subtree: true,
  });
}

function snapshot() {
  if (mutationCount !== 0 || domManifest() !== baselineDom || animationManifest() !== baselineAnimations) {
    fail("DOM_TIMELINE_MUTATED", "artifact DOM/animation manifest 在截图事务中发生变化");
  }
  return timelineSnapshot();
}

globalThis.__fourierDomTimeline = Object.freeze({
  initialize,
  setTime,
  setSubject,
  setMotionActive,
  snapshot,
});
`;
}
