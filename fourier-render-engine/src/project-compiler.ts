import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  bindTemplateProps,
  readProjectElement,
  type AnyProjectDefinition,
  type TemplateDefinition,
  type TemplatePropValue,
  type TimeExpression,
} from "@fourier-video/sdk/project";
import { fail, RenderEngineError } from "./errors.ts";
import { loadProjectModule } from "./project-module-loader.ts";
import {
  parseInteger,
  parsePositiveNumber,
  samplesToCoveringFrames,
  parseTimeToFrames,
} from "./time.ts";
import {
  prepareSubtitleTts,
  type SubtitleTtsSpec,
} from "./tts.ts";
import type {
  AnchorKind,
  AudioNode,
  Canvas,
  FitMode,
  GroupNode,
  ImageNode,
  ProjectMetadata,
  ReactNode,
  ReactPropValue,
  ReactPropType,
  RenderNode,
  RenderModuleNodeBase,
  ResolvedProject,
  ResolvedTimeNode,
  SceneBlend,
  SceneNode,
  SceneOverflow,
  SubtitleTtsArtifact,
  TextNode,
  TimePropValue,
  TransformKeyframe,
  TransformNode,
  TemplateNode,
  TemplateParameterDefinition,
  TemplateParameterSource,
  VideoNode,
  VisualModifier,
  VisualNode,
  TtsOptions,
} from "./types.ts";
import { validateEasing } from "./modifiers.ts";
import { resolveProjectTextLayouts } from "./visual-renderer.ts";

interface AuthorElement {
  name: string;
  attributes: Record<string, string>;
  children: AuthorElement[];
  text: string;
  payload?: Readonly<Record<string, unknown>>;
}

export interface CompileProjectOptions {
  projectDir: string;
  rootProjectDir?: string;
  sourcePath?: string;
  sourceFingerprint?: string;
  validateAssets?: boolean;
  ttsArtifacts?: ReadonlyMap<string, SubtitleTtsArtifact>;
  sceneProjects?: ReadonlyMap<string, PreloadedSceneProject>;
  templateProjects?: ReadonlyMap<string, PreloadedTemplateProject>;
  sceneDirectories?: readonly string[];
  isSceneProject?: boolean;
  isTemplateProject?: boolean;
  parentTemplateDir?: string;
}

export interface PreloadedSceneProject {
  project: ResolvedProject;
  sceneDir: string;
  sourcePath: string;
}

export interface PreloadedTemplateProject {
  project: ResolvedProject;
  templateDir: string;
  sourcePath: string;
  parameterContract: TemplateParameterDefinition[];
  bindings: Record<string, TemplatePropValue>;
  parameterSources: Record<string, TemplateParameterSource>;
}

export interface LoadProjectOptions {
  validateAssets?: boolean;
  tts?: TtsOptions;
  signal?: AbortSignal;
}

interface BuildContext {
  version: ProjectMetadata["version"];
  audioSampleRate: number;
  canvas: Canvas;
  projectDir: string;
  rootProjectDir: string;
  validateAssets: boolean;
  ids: Set<string>;
  timeNodes: Map<string, ResolvedTimeNode>;
  nodes: RenderNode[];
  sceneNodes: SceneNode[];
  templateNodes: TemplateNode[];
  groups: GroupNode[];
  declarationOrder: number;
  ttsArtifacts: ReadonlyMap<string, SubtitleTtsArtifact>;
  sceneProjects: ReadonlyMap<string, PreloadedSceneProject>;
  templateProjects: ReadonlyMap<string, PreloadedTemplateProject>;
  sceneDirectories: readonly string[];
  isSceneProject: boolean;
  isTemplateProject: boolean;
  parentTemplateDir?: string;
  ignoredTimeIds: Set<string>;
}

const TIME_ANCHORS: AnchorKind[] = ["at", "after", "with"];
const NODE_KINDS = new Set([
  "group",
  "video",
  "audio",
  "image",
  "text",
  "subtitle",
  "react",
  "scene",
  "template",
]);
const RENDER_NODE_KINDS = new Set([
  "video",
  "audio",
  "image",
  "text",
  "subtitle",
  "react",
  "scene",
  "template",
]);

const MODIFIER_COMMON_ATTRIBUTES = [
  "id",
  "duration",
  "at",
  "after",
  "with",
  "offset",
  "enabled",
] as const;
const TIME_NODE_COMMON_ATTRIBUTES = [
  ...MODIFIER_COMMON_ATTRIBUTES,
  "preview",
] as const;
const VISUAL_ATTRIBUTES = [
  "x",
  "y",
  "width",
  "height",
  "layer",
  "opacity",
  "rotation",
] as const;

function timeSource(value: TimeExpression): string {
  return typeof value === "string" ? value : value.source;
}

function childElements(value: unknown, owner: string): AuthorElement[] {
  const result: AuthorElement[] = [];
  const visit = (child: unknown): void => {
    if (child === null || child === undefined || typeof child === "boolean") return;
    if (Array.isArray(child)) {
      for (const item of child) visit(item);
      return;
    }
    if (typeof child === "string" && child.trim().length === 0) return;
    const snapshot = readProjectElement(child);
    if (snapshot === undefined) {
      fail(
        "INVALID_PROJECT_DECLARATION",
        `${owner} 只能包含 Fourier 工程 JSX 节点`,
      );
    }
    result.push(authorElement(snapshot.tag, snapshot.props));
  };
  visit(value);
  return result;
}

function authorElement(name: string, props: Readonly<Record<string, unknown>>): AuthorElement {
  const attributes: Record<string, string> = {};
  let payload: Readonly<Record<string, unknown>> | undefined;
  for (const [property, value] of Object.entries(props)) {
    if (property === "children" || value === undefined) continue;
    if (property === "props") {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        fail("INVALID_PROJECT_DECLARATION", `${name}.props 必须是对象`);
      }
      payload = value as Readonly<Record<string, unknown>>;
      continue;
    }
    if (property === "content" || property === "tts" || property === "keyframes") continue;
    const target = property === "sourceIn" ? "in"
      : property === "sourceOut" ? "out"
      : property === "exportName" ? "export"
      : property;
    if (target === "after" || target === "with") {
      if (typeof value !== "string" || value.length === 0 || value.startsWith("#")) {
        fail("INVALID_REFERENCE", `${name}.${target} 必须是裸节点 ID`);
      }
      attributes[target] = `#${value}`;
    } else if (target === "audio") {
      if (typeof value !== "boolean") {
        fail("INVALID_PROJECT_DECLARATION", `${name}.audio 必须是 boolean`);
      }
      attributes[target] = value ? "on" : "off";
    } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      attributes[target] = String(value);
    } else if (
      typeof value === "object" && value !== null &&
      typeof (value as { source?: unknown }).source === "string"
    ) {
      attributes[target] = timeSource(value as TimeExpression);
    } else {
      fail("INVALID_PROJECT_DECLARATION", `${name}.${property} 类型无效`);
    }
  }
  const children = childElements(props.children, name);
  if (name === "text" || name === "subtitle") {
    if (typeof props.content !== "string") {
      fail("INVALID_PROJECT_DECLARATION", `${name}.content 必须是 string`);
    }
    children.unshift({ name: "content", attributes: {}, children: [], text: props.content });
    if (props.tts !== undefined) {
      if (typeof props.tts !== "object" || props.tts === null || Array.isArray(props.tts)) {
        fail("INVALID_PROJECT_DECLARATION", `${name}.tts 必须是对象`);
      }
      children.splice(1, 0, authorElement("tts", props.tts as Readonly<Record<string, unknown>>));
    }
  }
  if (name === "transform") {
    if (!Array.isArray(props.keyframes)) {
      fail("INVALID_PROJECT_DECLARATION", "transform.keyframes 必须是数组");
    }
    for (const keyframe of props.keyframes) {
      if (typeof keyframe !== "object" || keyframe === null || Array.isArray(keyframe)) {
        fail("INVALID_PROJECT_DECLARATION", "transform.keyframes 项必须是对象");
      }
      children.push(authorElement("keyframe", keyframe as Readonly<Record<string, unknown>>));
    }
  }
  return {
    name,
    attributes,
    children,
    text: "",
    ...(payload === undefined ? {} : { payload }),
  };
}

function projectElement(definition: AnyProjectDefinition, bindings: Readonly<Record<string, unknown>> = {}): {
  project: AuthorElement;
  parameterContract: TemplateParameterDefinition[];
  typedBindings: Record<string, TemplatePropValue>;
  parameterSources: Record<string, TemplateParameterSource>;
} {
  if (definition.kind === "project") {
    if (Object.keys(bindings).length > 0) {
      fail("INVALID_TEMPLATE_DEFINITION", "普通 Project 不能接收 Template props");
    }
    const snapshot = readProjectElement(definition.declaration)!;
    return {
      project: authorElement(snapshot.tag, snapshot.props),
      parameterContract: [],
      typedBindings: {},
      parameterSources: {},
    };
  }
  const bound = bindTemplateProps(definition as TemplateDefinition, bindings);
  const snapshot = readProjectElement(definition.render(bound.props))!;
  return {
    project: authorElement(snapshot.tag, snapshot.props),
    parameterContract: Object.entries(definition.schema).map(([name, field]) => ({
      name,
      kind: field.kind as Exclude<typeof field.kind, "node">,
      ...(field.hasDefault ? { defaultValue: field.defaultValue as TemplatePropValue } : {}),
    })),
    typedBindings: { ...bound.props },
    parameterSources: { ...bound.sources },
  };
}

function resolveModuleProjectSource(moduleDir: string): string | undefined {
  const candidate = resolve(moduleDir, "main.tsx");
  return existsSync(candidate) && statSync(candidate).isFile() ? candidate : undefined;
}

function assertAllowedAttributes(
  element: AuthorElement,
  allowed: readonly string[],
): void {
  const set = new Set(allowed);
  const unknown = Object.keys(element.attributes).filter((key) => !set.has(key));
  if (unknown.length > 0) {
    fail(
      "UNKNOWN_ATTRIBUTE",
      `${element.name} 节点包含未知或禁止属性: ${unknown.join(", ")}`,
      { node: element.attributes.id, attributes: unknown },
    );
  }
}

function requiredAttribute(element: AuthorElement, name: string): string {
  const value = element.attributes[name];
  if (value === undefined || value === "") {
    fail(
      "MISSING_ATTRIBUTE",
      `${element.name} 节点缺少必填属性 ${name}`,
      { node: element.attributes.id, attribute: name },
    );
  }
  return value;
}

function optionalAttribute(
  element: AuthorElement,
  name: string,
  fallback: string,
): string {
  return element.attributes[name] ?? fallback;
}

function parseBoolean(
  source: string,
  field: string,
): boolean {
  if (source === "true") return true;
  if (source === "false") return false;
  fail("INVALID_ATTRIBUTE", `${field} 必须是 true 或 false，收到 "${source}"`);
}

function parseEnum<T extends string>(
  source: string,
  field: string,
  values: readonly T[],
): T {
  if ((values as readonly string[]).includes(source)) return source as T;
  fail(
    "INVALID_ATTRIBUTE",
    `${field} 必须是 ${values.join("、")} 之一，收到 "${source}"`,
  );
}

function parseFiniteNumber(source: string, field: string): number {
  const value = Number(source);
  if (!Number.isFinite(value)) {
    fail("INVALID_ATTRIBUTE", `${field} 必须是有限数值，收到 "${source}"`);
  }
  return value;
}

function parseRange(
  source: string,
  field: string,
  minimum: number,
  maximum: number,
): number {
  const value = parseFiniteNumber(source, field);
  if (value < minimum || value > maximum) {
    fail(
      "INVALID_ATTRIBUTE",
      `${field} 必须在 ${minimum}—${maximum} 之间，收到 "${source}"`,
    );
  }
  return value;
}

function validateColor(source: string, field: string): string {
  if (
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(
      source,
    ) ||
    /^[a-zA-Z]+$/.test(source)
  ) {
    return source;
  }
  fail("INVALID_ATTRIBUTE", `${field} 不是受支持的颜色: "${source}"`);
}

function validateId(id: string): string {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
    fail("INVALID_ID", `节点 ID "${id}" 不符合 V1 ID 规则`, { id });
  }
  return id;
}

function registerId(context: BuildContext, id: string): void {
  if (context.ids.has(id)) {
    fail("DUPLICATE_ID", `节点 ID "${id}" 重复`, { id });
  }
  context.ids.add(id);
}

function assertNoElementChildren(element: AuthorElement): void {
  if (element.children.length > 0 || element.text.trim().length > 0) {
    fail(
      "INVALID_STRUCTURE",
      `${element.name} 节点不允许包含子元素或文本`,
      { node: element.attributes.id },
    );
  }
}

function assertWhitespaceOnly(element: AuthorElement): void {
  if (element.text.trim().length > 0) {
    fail(
      "INVALID_STRUCTURE",
      `${element.name} 节点不允许直接包含文本`,
      { node: element.attributes.id },
    );
  }
}

function resolveProjectPath(
  projectDir: string,
  rootProjectDir: string,
  moduleDirectories: readonly string[],
  source: string,
  field: string,
  validateAssets: boolean,
  parentTemplateDir?: string,
): string {
  if (
    source.length === 0 ||
    isAbsolute(source) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(source)
  ) {
    fail(
      "INVALID_PATH",
      `${field} 必须是工程目录内的相对路径，收到 "${source}"`,
      { field, value: source },
    );
  }
  const privatePath = resolve(projectDir, source);
  const pathFromScope = relative(projectDir, privatePath);
  if (
    pathFromScope === ".." ||
    pathFromScope.startsWith(`..${sep}`)
  ) {
    fail("INVALID_PATH", `${field} 不能指向工程目录外: "${source}"`, {
      field,
      value: source,
    });
  }
  if (!validateAssets) return privatePath;

  const lookupRoots = [...new Set([
    projectDir,
    ...(parentTemplateDir === undefined ? [] : [parentTemplateDir]),
    rootProjectDir,
  ])];
  const canonicalProjectDir = realpathSync(projectDir);
  for (const lookupRoot of lookupRoots) {
    const candidate = resolve(lookupRoot, source);
    const relativeCandidate = relative(lookupRoot, candidate);
    if (relativeCandidate === ".." || relativeCandidate.startsWith(`..${sep}`)) {
      continue;
    }
    if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
    const canonicalRoot = realpathSync(lookupRoot);
    const canonicalCandidate = realpathSync(candidate);
    const canonicalRelative = relative(canonicalRoot, canonicalCandidate);
    if (canonicalRelative === ".." || canonicalRelative.startsWith(`..${sep}`)) {
      fail("INVALID_PATH", `${field} 不能通过符号链接逃出资源作用域`, {
        field,
        value: source,
        resolvedPath: canonicalCandidate,
      });
    }
    const otherModule = moduleDirectories.find((directory) => {
      const canonicalDirectory = realpathSync(directory);
      if (canonicalDirectory === canonicalProjectDir) return false;
      const fromModule = relative(canonicalDirectory, canonicalCandidate);
      return fromModule === "" ||
        (!fromModule.startsWith(`..${sep}`) && fromModule !== "..");
    });
    if (otherModule !== undefined) {
      fail(
        "SCENE_PRIVATE_RESOURCE",
        `${field} 不允许访问其他 Scene/Template 的私有资源: "${source}"`,
        { field, value: source, moduleDirectory: otherModule },
      );
    }
    return candidate;
  }
  fail("ASSET_NOT_FOUND", `${field} 文件不存在: "${source}"`, {
    field,
    value: source,
    privatePath,
    sharedPaths: lookupRoots.map((root) => resolve(root, source)),
  });
}

function parseMetadata(project: AuthorElement): ProjectMetadata {
  assertAllowedAttributes(project, ["id", "version", "audioSampleRate", "duration"]);
  assertWhitespaceOnly(project);
  const version = requiredAttribute(project, "version");
  if (version !== "1.0") {
    fail("UNSUPPORTED_VERSION", `只支持 Project JSX V1.0，收到 "${version}"`);
  }
  return {
    id: requiredAttribute(project, "id"),
    version: version as ProjectMetadata["version"],
    audioSampleRate: parseInteger(
      requiredAttribute(project, "audioSampleRate"),
      "project.audioSampleRate",
      { positive: true },
    ),
  };
}

function parseCanvas(element: AuthorElement): Canvas {
  assertAllowedAttributes(element, [
    "width",
    "height",
    "fps",
    "background",
    "colorSpace",
  ]);
  assertNoElementChildren(element);
  const fpsSource = requiredAttribute(element, "fps");
  if (!/^\d+(?:\.\d+)?$/.test(fpsSource)) {
    fail("INVALID_FPS", `canvas.fps 必须是十进制正数，收到 "${fpsSource}"`);
  }
  const fps = parsePositiveNumber(fpsSource, "canvas.fps");
  const colorSpace = requiredAttribute(element, "colorSpace");
  if (colorSpace !== "sRGB") {
    fail("UNSUPPORTED_COLOR_SPACE", `V1 只支持 sRGB，收到 "${colorSpace}"`);
  }
  return {
    width: parseInteger(requiredAttribute(element, "width"), "canvas.width", {
      positive: true,
    }),
    height: parseInteger(
      requiredAttribute(element, "height"),
      "canvas.height",
      { positive: true },
    ),
    fps,
    fpsSource,
    background: validateColor(
      requiredAttribute(element, "background"),
      "canvas.background",
    ),
    colorSpace,
  };
}

function parseAnchor(
  element: AuthorElement,
  context: BuildContext,
): { startFrame: number; offsetFrames: number } {
  const present = TIME_ANCHORS.filter(
    (name) => element.attributes[name] !== undefined,
  );
  if (present.length !== 1) {
    fail(
      "INVALID_TIME_ANCHOR",
      `${element.name} "${element.attributes.id ?? ""}" 顶层节点必须且只能声明 at、after、with 中的一个`,
      { node: element.attributes.id, anchors: present },
    );
  }
  const anchor = present[0];
  if (anchor === undefined) {
    fail("INVALID_TIME_ANCHOR", "无法解析时间锚点");
  }
  const source = requiredAttribute(element, anchor);
  let base: number;
  if (anchor === "at") {
    base = parseTimeToFrames(source, context.canvas.fpsSource, "at");
    if (base < 0) fail("INVALID_TIME", "at 不允许为负数");
  } else {
    if (!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(source)) {
      fail(
        "INVALID_REFERENCE",
        `${anchor} 必须使用 #id 格式，收到 "${source}"`,
      );
    }
    const targetId = source.slice(1);
    const target = context.timeNodes.get(targetId);
    if (target === undefined) {
      if (context.ignoredTimeIds.has(targetId)) {
        fail(
          "INVALID_REFERENCE",
          `${element.name} "${element.attributes.id ?? ""}" 不能引用已禁用的 Scene "${targetId}"`,
          { node: element.attributes.id, target: targetId },
        );
      }
      fail(
        "FORWARD_REFERENCE",
        `${element.name} "${element.attributes.id ?? ""}" 引用了尚未声明的节点 "${targetId}"`,
        { node: element.attributes.id, target: targetId },
      );
    }
    base = anchor === "after" ? target.endFrame : target.startFrame;
  }
  const offsetFrames =
    element.attributes.offset === undefined
      ? 0
      : parseTimeToFrames(
          element.attributes.offset,
          context.canvas.fpsSource,
          "offset",
        );
  const startFrame = base + offsetFrames;
  if (startFrame < 0) {
    fail(
      "NEGATIVE_START",
      `${element.name} "${element.attributes.id ?? ""}" 的开始时间不能小于 0f`,
      { node: element.attributes.id, startFrame },
    );
  }
  return { startFrame, offsetFrames };
}

function parseChildOffset(
  element: AuthorElement,
  context: BuildContext,
): number {
  const illegal = TIME_ANCHORS.filter(
    (name) => element.attributes[name] !== undefined,
  );
  if (illegal.length > 0) {
    fail(
      "INVALID_GROUP_CHILD",
      `Group 子节点 "${element.attributes.id ?? ""}" 不允许声明 ${illegal.join(", ")}`,
      { node: element.attributes.id, attributes: illegal },
    );
  }
  return element.attributes.offset === undefined
    ? 0
    : parseTimeToFrames(
        element.attributes.offset,
        context.canvas.fpsSource,
        "offset",
      );
}

function parseDuration(
  element: AuthorElement,
  context: BuildContext,
  derivedDurationFrames?: number,
): number {
  if (
    derivedDurationFrames !== undefined &&
    element.attributes.duration !== undefined
  ) {
    fail(
      "CONFLICTING_DURATION",
      `${element.name} "${element.attributes.id ?? ""}" 启用 TTS 后不能声明 duration；时长由合成音频自动推导`,
      { node: element.attributes.id },
    );
  }
  const durationFrames =
    derivedDurationFrames ??
    parseTimeToFrames(
      requiredAttribute(element, "duration"),
      context.canvas.fpsSource,
      "duration",
    );
  if (durationFrames <= 0) {
    fail(
      "INVALID_DURATION",
      `${element.name} "${element.attributes.id ?? ""}" 的 duration 必须至少为 1f`,
      { node: element.attributes.id, durationFrames },
    );
  }
  return durationFrames;
}

function parseVisual(
  element: AuthorElement,
): Pick<
  VisualNode,
  "x" | "y" | "width" | "height" | "layer" | "opacity" | "rotation"
> {
  return {
    x: parseFiniteNumber(requiredAttribute(element, "x"), `${element.name}.x`),
    y: parseFiniteNumber(requiredAttribute(element, "y"), `${element.name}.y`),
    width: parseInteger(
      requiredAttribute(element, "width"),
      `${element.name}.width`,
      { positive: true },
    ),
    height: parseInteger(
      requiredAttribute(element, "height"),
      `${element.name}.height`,
      { positive: true },
    ),
    layer: parseInteger(
      requiredAttribute(element, "layer"),
      `${element.name}.layer`,
    ),
    opacity: parseRange(
      optionalAttribute(element, "opacity", "1"),
      `${element.name}.opacity`,
      0,
      1,
    ),
    rotation: parseFiniteNumber(
      optionalAttribute(element, "rotation", "0"),
      `${element.name}.rotation`,
    ),
  };
}

function estimateTextWidth(
  content: string,
  fontSize: number,
  canvasWidth: number,
): number {
  const lines = content.split(/\r?\n/);
  const longestLine = Math.max(
    1,
    ...lines.map((line) =>
      Array.from(line).reduce((width, character) => {
        if (/\s/u.test(character)) return width + 0.35;
        return width + (/^[\u0000-\u00ff]$/u.test(character) ? 0.62 : 1);
      }, 0)
    ),
  );
  return Math.max(1, Math.min(canvasWidth, Math.ceil(longestLine * fontSize)));
}

function parseTextVisual(
  element: AuthorElement,
  context: BuildContext,
  content: string,
  fontSize: number,
  lineHeight: number,
): Pick<
  TextNode,
  | "x"
  | "y"
  | "width"
  | "height"
  | "layer"
  | "opacity"
  | "rotation"
  | "autoWidth"
  | "autoHeight"
> {
  const widthSource = element.attributes.width;
  const heightSource = element.attributes.height;
  const autoWidth = widthSource === undefined || widthSource === "auto";
  const autoHeight = heightSource === undefined || heightSource === "auto";
  const estimatedLineCount = Math.max(1, content.split(/\r?\n/).length);
  return {
    x: parseFiniteNumber(requiredAttribute(element, "x"), `${element.name}.x`),
    y: parseFiniteNumber(requiredAttribute(element, "y"), `${element.name}.y`),
    width: autoWidth
      ? estimateTextWidth(content, fontSize, context.canvas.width)
      : parseInteger(widthSource, `${element.name}.width`, { positive: true }),
    height: autoHeight
      ? Math.max(1, Math.ceil(estimatedLineCount * fontSize * lineHeight))
      : parseInteger(heightSource, `${element.name}.height`, { positive: true }),
    layer: parseInteger(
      requiredAttribute(element, "layer"),
      `${element.name}.layer`,
    ),
    opacity: parseRange(
      optionalAttribute(element, "opacity", "1"),
      `${element.name}.opacity`,
      0,
      1,
    ),
    rotation: parseFiniteNumber(
      optionalAttribute(element, "rotation", "0"),
      `${element.name}.rotation`,
    ),
    autoWidth,
    autoHeight,
  };
}

function baseNode(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
  derivedDurationFrames?: number,
): {
  id: string;
  startFrame: number;
  endFrame: number;
  durationFrames: number;
  offsetFrames: number;
  enabled: boolean;
  preview: boolean;
  declarationOrder: number;
} {
  const id = validateId(requiredAttribute(element, "id"));
  registerId(context, id);
  const durationFrames = parseDuration(
    element,
    context,
    derivedDurationFrames,
  );
  const enabled =
    inheritedEnabled &&
    parseBoolean(optionalAttribute(element, "enabled", "true"), "enabled");
  const preview = parseBoolean(
    optionalAttribute(element, "preview", String(inheritedPreview)),
    "preview",
  );
  const declarationOrder = context.declarationOrder++;
  return {
    id,
    startFrame,
    endFrame: startFrame + durationFrames,
    durationFrames,
    offsetFrames,
    enabled,
    preview,
    declarationOrder,
  };
}

interface ModifierHost {
  id: string;
  startFrame: number;
  durationFrames: number;
  enabled: boolean;
}

function resolveMotionComponentPath(
  context: BuildContext,
  component: string,
): string {
  if (
    component.length === 0 ||
    component.startsWith("#") ||
    isAbsolute(component) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(component)
  ) {
    fail(
      "INVALID_PATH",
      `motion.component 必须是 motions/ 内的相对路径，收到 "${component}"`,
    );
  }
  const motionsDirectory = resolve(context.projectDir, "motions");
  const privatePath = resolve(motionsDirectory, component);
  const pathFromMotions = relative(motionsDirectory, privatePath);
  if (
    pathFromMotions === ".." ||
    pathFromMotions.startsWith(
      `..${process.platform === "win32" ? "\\" : "/"}`,
    )
  ) {
    fail(
      "INVALID_PATH",
      `motion.component 不能指向 motions/ 外: "${component}"`,
    );
  }
  const sharedMotionsDirectory = resolve(context.rootProjectDir, "motions");
  const sharedPath = resolve(sharedMotionsDirectory, component);
  const path =
    existsSync(privatePath) || context.projectDir === context.rootProjectDir
      ? privatePath
      : sharedPath;
  if (
    context.validateAssets &&
    (!existsSync(path) || !statSync(path).isFile())
  ) {
    fail("ASSET_NOT_FOUND", `motion.component 文件不存在: "${component}"`, {
      value: component,
      resolvedPath: path,
    });
  }
  return path;
}

function parseModifierAnchor(
  element: AuthorElement,
  context: BuildContext,
  previous: Map<string, VisualModifier>,
): { localStartFrame: number; offsetFrames: number } {
  const present = TIME_ANCHORS.filter(
    (name) => element.attributes[name] !== undefined,
  );
  if (present.length !== 1) {
    fail(
      "INVALID_TIME_ANCHOR",
      `${element.name} "${element.attributes.id ?? ""}" 必须且只能声明 at、after、with 中的一个`,
      { node: element.attributes.id, anchors: present },
    );
  }
  const anchor = present[0];
  if (anchor === undefined) fail("INVALID_TIME_ANCHOR", "无法解析时间锚点");
  const source = requiredAttribute(element, anchor);
  let base: number;
  if (anchor === "at") {
    base = parseTimeToFrames(source, context.canvas.fpsSource, "modifier.at");
    if (base < 0) fail("INVALID_TIME", "modifier.at 不允许为负数");
  } else {
    if (!/^#[A-Za-z][A-Za-z0-9_-]*$/.test(source)) {
      fail(
        "INVALID_REFERENCE",
        `${element.name}.${anchor} 必须使用 #id 格式，收到 "${source}"`,
      );
    }
    const targetId = source.slice(1);
    const target = previous.get(targetId);
    if (target === undefined) {
      fail(
        "INVALID_MODIFIER_REFERENCE",
        `${element.name} "${element.attributes.id ?? ""}" 只能引用同一宿主内已经声明的修饰节点 "${targetId}"`,
        { node: element.attributes.id, target: targetId },
      );
    }
    base =
      anchor === "after" ? target.localEndFrame : target.localStartFrame;
  }
  const offsetFrames =
    element.attributes.offset === undefined
      ? 0
      : parseTimeToFrames(
          element.attributes.offset,
          context.canvas.fpsSource,
          "modifier.offset",
        );
  const localStartFrame = base + offsetFrames;
  if (localStartFrame < 0) {
    fail(
      "NEGATIVE_START",
      `${element.name} "${element.attributes.id ?? ""}" 的局部开始时间不能小于 0f`,
    );
  }
  return { localStartFrame, offsetFrames };
}

function parseModifierBase(
  element: AuthorElement,
  context: BuildContext,
  host: ModifierHost,
  previous: Map<string, VisualModifier>,
): Omit<
  VisualModifier,
  "kind" | "component" | "componentPath" | "exportName" | "props" |
    "easing" | "keyframes"
> {
  const id = validateId(requiredAttribute(element, "id"));
  registerId(context, id);
  const durationFrames = parseDuration(element, context);
  if (element.name === "transform" && durationFrames < 2) {
    fail(
      "INVALID_DURATION",
      `transform "${id}" 的 duration 必须至少为 2f`,
    );
  }
  const { localStartFrame, offsetFrames } = parseModifierAnchor(
    element,
    context,
    previous,
  );
  const localEndFrame = localStartFrame + durationFrames;
  if (localEndFrame > host.durationFrames) {
    fail(
      "MODIFIER_OUT_OF_BOUNDS",
      `${element.name} "${id}" 的结束边界 ${localEndFrame}f 超过宿主 "${host.id}" 的 ${host.durationFrames}f`,
      { node: id, host: host.id, localEndFrame },
    );
  }
  return {
    id,
    hostId: host.id,
    localStartFrame,
    localEndFrame,
    absoluteStartFrame: host.startFrame + localStartFrame,
    absoluteEndFrame: host.startFrame + localEndFrame,
    durationFrames,
    offsetFrames,
    fill: parseEnum(
      requiredAttribute(element, "fill"),
      `${element.name}.fill`,
      ["none", "forwards", "backwards", "both"],
    ),
    enabled:
      host.enabled &&
      parseBoolean(optionalAttribute(element, "enabled", "true"), "enabled"),
    declarationOrder: context.declarationOrder++,
  };
}

function parseProjectProps(
  element: AuthorElement,
  context: BuildContext,
): { props: Record<string, ReactPropValue>; propTypes: Record<string, ReactPropType | null> } {
  const props: Record<string, ReactPropValue> = {};
  const propTypes: Record<string, ReactPropType | null> = {};
  for (const [name, input] of Object.entries(element.payload ?? {})) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      fail("INVALID_REACT_PROP", `React prop 名称非法: "${name}"`);
    }
    if (typeof input === "string") {
      props[name] = input;
      propTypes[name] = null;
    } else if (typeof input === "number" && Number.isFinite(input)) {
      props[name] = input;
      propTypes[name] = "number";
    } else if (typeof input === "boolean") {
      props[name] = input;
      propTypes[name] = "boolean";
    } else if (
      typeof input === "object" && input !== null &&
      typeof (input as TimePropValue).source === "string"
    ) {
      const source = (input as TimePropValue).source;
      const frames = parseTimeToFrames(source, context.canvas.fpsSource, `prop.${name}`);
      props[name] = { source, frames, seconds: frames / context.canvas.fps };
      propTypes[name] = "time";
    } else {
      fail(
        "INVALID_REACT_PROP",
        `React prop "${name}" 只支持 string、number、boolean 或 TimeValue`,
      );
    }
  }
  return { props, propTypes };
}

function parseMotion(
  element: AuthorElement,
  context: BuildContext,
  host: ModifierHost,
  previous: Map<string, VisualModifier>,
): VisualModifier {
  assertAllowedAttributes(element, [
    ...MODIFIER_COMMON_ATTRIBUTES,
    "fill",
    "component",
    "export",
  ]);
  assertWhitespaceOnly(element);
  if (element.children.length > 0) fail("INVALID_STRUCTURE", "Motion 不能包含子节点");
  const { props, propTypes } = parseProjectProps(element, context);
  const component = requiredAttribute(element, "component");
  const exportName = optionalAttribute(element, "export", "default");
  if (
    exportName !== "default" &&
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)
  ) {
    fail("INVALID_ATTRIBUTE", `motion.export 非法: "${exportName}"`);
  }
  return {
    ...parseModifierBase(element, context, host, previous),
    kind: "motion",
    component,
    componentPath: resolveMotionComponentPath(context, component),
    exportName,
    props,
    propTypes,
  };
}

function parseTransformKeyframe(element: AuthorElement): TransformKeyframe {
  assertAllowedAttributes(element, [
    "offset",
    "translateX",
    "translateY",
    "scaleX",
    "scaleY",
    "rotation",
    "opacity",
  ]);
  assertNoElementChildren(element);
  return {
    offset: parseRange(
      requiredAttribute(element, "offset"),
      "keyframe.offset",
      0,
      1,
    ),
    translateX: parseFiniteNumber(
      requiredAttribute(element, "translateX"),
      "keyframe.translateX",
    ),
    translateY: parseFiniteNumber(
      requiredAttribute(element, "translateY"),
      "keyframe.translateY",
    ),
    scaleX: parseRange(
      requiredAttribute(element, "scaleX"),
      "keyframe.scaleX",
      0,
      Number.MAX_VALUE,
    ),
    scaleY: parseRange(
      requiredAttribute(element, "scaleY"),
      "keyframe.scaleY",
      0,
      Number.MAX_VALUE,
    ),
    rotation: parseFiniteNumber(
      requiredAttribute(element, "rotation"),
      "keyframe.rotation",
    ),
    opacity: parseRange(
      requiredAttribute(element, "opacity"),
      "keyframe.opacity",
      0,
      1,
    ),
  };
}

function parseTransform(
  element: AuthorElement,
  context: BuildContext,
  host: ModifierHost,
  previous: Map<string, VisualModifier>,
): TransformNode {
  assertAllowedAttributes(element, [
    ...MODIFIER_COMMON_ATTRIBUTES,
    "fill",
    "easing",
  ]);
  assertWhitespaceOnly(element);
  if (element.children.some((child) => child.name !== "keyframe")) {
    fail("INVALID_STRUCTURE", "transform 节点只能包含 keyframe 子元素");
  }
  if (element.children.length < 2) {
    fail("INVALID_TRANSFORM", "Transform 至少需要两个 Keyframe");
  }
  const keyframes = element.children.map(parseTransformKeyframe);
  if (keyframes[0]?.offset !== 0 || keyframes.at(-1)?.offset !== 1) {
    fail(
      "INVALID_TRANSFORM",
      "Transform 的第一个 Keyframe offset 必须为 0，最后一个必须为 1",
    );
  }
  for (let index = 1; index < keyframes.length; index++) {
    if ((keyframes[index]?.offset ?? 0) <= (keyframes[index - 1]?.offset ?? 0)) {
      fail("INVALID_TRANSFORM", "Keyframe offset 必须严格递增");
    }
  }
  return {
    ...parseModifierBase(element, context, host, previous),
    kind: "transform",
    easing: validateEasing(requiredAttribute(element, "easing")),
    keyframes,
  };
}

function parseVisualModifiers(
  elements: AuthorElement[],
  context: BuildContext,
  host: ModifierHost,
): VisualModifier[] {
  const previous = new Map<string, VisualModifier>();
  const modifiers: VisualModifier[] = [];
  let motionCount = 0;
  for (const element of elements) {
    let modifier: VisualModifier;
    if (element.name === "motion") {
      motionCount++;
      if (motionCount > 1) {
        fail(
          "INVALID_STRUCTURE",
          `视觉宿主 "${host.id}" 最多只能包含一个 Motion`,
        );
      }
      modifier = parseMotion(element, context, host, previous);
    } else if (element.name === "transform") {
      modifier = parseTransform(element, context, host, previous);
    } else {
      fail("INVALID_STRUCTURE", `视觉宿主包含未知子元素 ${element.name}`);
    }
    modifiers.push(modifier);
    previous.set(modifier.id, modifier);
  }
  return modifiers;
}

function parseVideo(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
): VideoNode {
  assertAllowedAttributes(element, [
    ...TIME_NODE_COMMON_ATTRIBUTES,
    ...VISUAL_ATTRIBUTES,
    "src",
    "in",
    "fit",
    "audio",
    "rate",
    "volume",
    "loop",
  ]);
  const nodeBase = baseNode(
    element,
    context,
    startFrame,
    offsetFrames,
    inheritedEnabled,
    inheritedPreview,
  );
  assertWhitespaceOnly(element);
  if (
    element.children.some(
      (child) => child.name !== "motion" && child.name !== "transform",
    )
  ) {
    fail("INVALID_STRUCTURE", "video 节点只能包含 motion 或 transform");
  }
  const src = requiredAttribute(element, "src");
  const inFrame = parseTimeToFrames(
    requiredAttribute(element, "in"),
    context.canvas.fpsSource,
    "video.in",
  );
  if (inFrame < 0) fail("INVALID_ATTRIBUTE", "video.in 不能为负数");
  return {
    ...nodeBase,
    kind: "video",
    ...parseVisual(element),
    src,
    sourcePath: resolveProjectPath(
      context.projectDir,
      context.rootProjectDir,
      context.sceneDirectories,
      src,
      "video.src",
      context.validateAssets,
      context.parentTemplateDir,
    ),
    inFrame,
    fit: parseEnum<FitMode>(
      requiredAttribute(element, "fit"),
      "video.fit",
      ["cover", "contain", "stretch"],
    ),
    audio: parseEnum(requiredAttribute(element, "audio"), "video.audio", [
      "on",
      "off",
    ]) === "on",
    rate: parsePositiveNumber(
      optionalAttribute(element, "rate", "1"),
      "video.rate",
    ),
    volume: parseRange(
      optionalAttribute(element, "volume", "1"),
      "video.volume",
      0,
      100,
    ),
    loop: parseBoolean(
      optionalAttribute(element, "loop", "false"),
      "video.loop",
    ),
    modifiers: parseVisualModifiers(element.children, context, nodeBase),
  };
}

function parseAudio(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
): AudioNode {
  assertAllowedAttributes(element, [
    ...TIME_NODE_COMMON_ATTRIBUTES,
    "src",
    "in",
    "volume",
    "rate",
    "muted",
  ]);
  assertNoElementChildren(element);
  const nodeBase = baseNode(
    element,
    context,
    startFrame,
    offsetFrames,
    inheritedEnabled,
    inheritedPreview,
  );
  const src = requiredAttribute(element, "src");
  const inFrame = parseTimeToFrames(
    requiredAttribute(element, "in"),
    context.canvas.fpsSource,
    "audio.in",
  );
  if (inFrame < 0) fail("INVALID_ATTRIBUTE", "audio.in 不能为负数");
  return {
    ...nodeBase,
    kind: "audio",
    src,
    sourcePath: resolveProjectPath(
      context.projectDir,
      context.rootProjectDir,
      context.sceneDirectories,
      src,
      "audio.src",
      context.validateAssets,
      context.parentTemplateDir,
    ),
    inFrame,
    volume: parseRange(
      requiredAttribute(element, "volume"),
      "audio.volume",
      0,
      100,
    ),
    rate: parsePositiveNumber(
      optionalAttribute(element, "rate", "1"),
      "audio.rate",
    ),
    muted: parseBoolean(
      optionalAttribute(element, "muted", "false"),
      "audio.muted",
    ),
  };
}

function parseImage(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
): ImageNode {
  assertAllowedAttributes(element, [
    ...TIME_NODE_COMMON_ATTRIBUTES,
    ...VISUAL_ATTRIBUTES,
    "src",
    "fit",
  ]);
  const src = requiredAttribute(element, "src");
  assertWhitespaceOnly(element);
  if (
    element.children.some(
      (child) => child.name !== "motion" && child.name !== "transform",
    )
  ) {
    fail("INVALID_STRUCTURE", "image 节点只能包含 motion 或 transform");
  }
  const nodeBase = baseNode(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedEnabled,
      inheritedPreview,
    );
  return {
    ...nodeBase,
    kind: "image",
    ...parseVisual(element),
    src,
    sourcePath: resolveProjectPath(
      context.projectDir,
      context.rootProjectDir,
      context.sceneDirectories,
      src,
      "image.src",
      context.validateAssets,
      context.parentTemplateDir,
    ),
    fit: parseEnum<FitMode>(
      requiredAttribute(element, "fit"),
      "image.fit",
      ["cover", "contain", "stretch"],
    ),
    modifiers: parseVisualModifiers(element.children, context, nodeBase),
  };
}

interface ParsedTtsDeclaration {
  style?: string;
  volume: number;
  reference?: string;
  referencePath?: string;
}

function parseTtsDeclaration(
  element: AuthorElement,
  context: Pick<
    BuildContext,
    | "projectDir"
    | "rootProjectDir"
    | "sceneDirectories"
    | "validateAssets"
    | "parentTemplateDir"
  >,
): ParsedTtsDeclaration {
  assertAllowedAttributes(element, ["style", "reference", "volume"]);
  assertNoElementChildren(element);
  const style = element.attributes.style;
  if (style !== undefined && style.trim().length === 0) {
    fail("INVALID_ATTRIBUTE", "tts.style 必须是非空字符串");
  }
  const reference = element.attributes.reference;
  return {
    ...(style === undefined ? {} : { style }),
    volume: parseRange(
      optionalAttribute(element, "volume", "1"),
      "tts.volume",
      0,
      100,
    ),
    ...(reference === undefined
      ? {}
      : {
          reference,
          referencePath: resolveProjectPath(
            context.projectDir,
            context.rootProjectDir,
            context.sceneDirectories,
            reference,
            "tts.reference",
            context.validateAssets,
            context.parentTemplateDir,
          ),
        }),
  };
}

function parseText(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
): TextNode {
  assertAllowedAttributes(element, [
    ...TIME_NODE_COMMON_ATTRIBUTES,
    ...VISUAL_ATTRIBUTES,
    "role",
    "font",
    "fontSize",
    "lineHeight",
    "color",
    "align",
    "verticalAlign",
    "maxLines",
    "overflow",
    "background",
  ]);
  assertWhitespaceOnly(element);
  const contentElements = element.children.filter(
    (child) => child.name === "content",
  );
  const ttsElements = element.children.filter(
    (child) => child.name === "tts",
  );
  const modifierElements = element.children.filter(
    (child) => child.name === "motion" || child.name === "transform",
  );
  const invalidChildren = element.children.filter(
    (child) =>
      child.name !== "content" &&
      child.name !== "tts" &&
      child.name !== "motion" &&
      child.name !== "transform",
  );
  const ttsIndex = element.children.findIndex(
    (child) => child.name === "tts",
  );
  const firstModifierIndex = element.children.findIndex(
    (child) => child.name === "motion" || child.name === "transform",
  );
  if (
    invalidChildren.length > 0 ||
    contentElements.length !== 1 ||
    ttsElements.length > 1 ||
    element.children[0]?.name !== "content" ||
    (ttsIndex >= 0 && ttsIndex !== 1) ||
    (ttsIndex >= 0 &&
      firstModifierIndex >= 0 &&
      ttsIndex > firstModifierIndex)
  ) {
    fail(
      "INVALID_STRUCTURE",
      `${element.name} 节点必须先包含一个 content、可选的 tts，随后才能声明修饰节点`,
      { node: element.attributes.id },
    );
  }
  const content = contentElements[0];
  if (
    content === undefined ||
    content.children.length > 0 ||
    Object.keys(content.attributes).length > 0
  ) {
    fail("INVALID_STRUCTURE", "content 只能包含纯文本");
  }
  const font = requiredAttribute(element, "font");
  const fontSize = parsePositiveNumber(
    requiredAttribute(element, "fontSize"),
    `${element.name}.fontSize`,
  );
  const lineHeight = parsePositiveNumber(
    requiredAttribute(element, "lineHeight"),
    `${element.name}.lineHeight`,
  );
  const roleSource =
    element.name === "subtitle"
      ? optionalAttribute(element, "role", "subtitle")
      : requiredAttribute(element, "role");
  const role = parseEnum(roleSource, `${element.name}.role`, [
    "title",
    "body",
    "subtitle",
    "label",
  ]);
  const ttsElement = ttsElements[0];
  if (ttsElement !== undefined && role !== "subtitle") {
    fail(
      "INVALID_STRUCTURE",
      `只有 subtitle 或 role="subtitle" 的 text 节点可以包含 tts`,
      { node: element.attributes.id },
    );
  }
  const tts =
    ttsElement === undefined
      ? undefined
      : parseTtsDeclaration(ttsElement, context);
  if (tts !== undefined && content.text.trim().length === 0) {
    fail("INVALID_STRUCTURE", "启用 TTS 的字幕 content 不能为空", {
      node: element.attributes.id,
    });
  }
  const id = requiredAttribute(element, "id");
  const artifact =
    tts === undefined ? undefined : context.ttsArtifacts.get(id);
  if (tts !== undefined && artifact === undefined) {
    fail(
      "TTS_NOT_PREPARED",
      `字幕 "${id}" 的 TTS 音频尚未合成；请通过 loadProject/validateProject/renderProject 加载工程`,
      { node: id },
    );
  }
  const derivedDurationFrames =
    artifact === undefined
      ? undefined
      : samplesToCoveringFrames(
          artifact.samples,
          artifact.sampleRate,
          context.canvas.fpsSource,
        );
  const nodeBase = baseNode(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedEnabled,
      inheritedPreview,
      derivedDurationFrames,
    );
  return {
    ...nodeBase,
    kind: element.name as "text" | "subtitle",
    ...parseTextVisual(
      element,
      context,
      content.text,
      fontSize,
      lineHeight,
    ),
    role,
    font,
    fontPath: resolveProjectPath(
      context.projectDir,
      context.rootProjectDir,
      context.sceneDirectories,
      font,
      `${element.name}.font`,
      context.validateAssets,
      context.parentTemplateDir,
    ),
    fontSize,
    lineHeight,
    color: validateColor(
      requiredAttribute(element, "color"),
      `${element.name}.color`,
    ),
    align: parseEnum(
      requiredAttribute(element, "align"),
      `${element.name}.align`,
      ["left", "center", "right"],
    ),
    verticalAlign: parseEnum(
      optionalAttribute(element, "verticalAlign", "center"),
      `${element.name}.verticalAlign`,
      ["top", "center", "bottom"],
    ),
    ...(element.attributes.maxLines === undefined
      ? {}
      : {
          maxLines: parseInteger(
            element.attributes.maxLines,
            `${element.name}.maxLines`,
            { positive: true },
          ),
        }),
    overflow: parseEnum(
      optionalAttribute(element, "overflow", "clip"),
      `${element.name}.overflow`,
      ["clip", "ellipsis"],
    ),
    ...(element.attributes.background === undefined
      ? {}
      : {
          background: validateColor(
            element.attributes.background,
            `${element.name}.background`,
          ),
        }),
    content: content.text,
    ...(tts === undefined || artifact === undefined
      ? {}
      : {
          voice: {
            ...(tts.style === undefined ? {} : { style: tts.style }),
            volume: tts.volume,
            ...(tts.reference === undefined
              ? {}
              : { reference: tts.reference }),
            sourcePath: artifact.sourcePath,
            samples: artifact.samples,
            sampleRate: artifact.sampleRate,
            durationSeconds: artifact.samples / artifact.sampleRate,
          },
        }),
    modifiers: parseVisualModifiers(modifierElements, context, nodeBase),
  };
}

function parseReact(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
): ReactNode {
  assertAllowedAttributes(element, [
    ...TIME_NODE_COMMON_ATTRIBUTES,
    ...VISUAL_ATTRIBUTES,
    "component",
    "export",
  ]);
  assertWhitespaceOnly(element);
  if (element.children.some(
    (child) => child.name !== "motion" && child.name !== "transform"
  )) {
    fail("INVALID_STRUCTURE", "ReactLayer 只能包含 Motion 或 Transform");
  }
  const modifierElements = element.children;
  const { props, propTypes } = parseProjectProps(element, context);
  const component = requiredAttribute(element, "component");
  const exportName = optionalAttribute(element, "export", "default");
  if (
    exportName !== "default" &&
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(exportName)
  ) {
    fail("INVALID_ATTRIBUTE", `react.export 非法: "${exportName}"`);
  }
  const nodeBase = baseNode(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedEnabled,
      inheritedPreview,
    );
  return {
    ...nodeBase,
    kind: "react",
    ...parseVisual(element),
    component,
    componentPath: resolveProjectPath(
      context.projectDir,
      context.rootProjectDir,
      context.sceneDirectories,
      component,
      "react.component",
      context.validateAssets,
      context.parentTemplateDir,
    ),
    exportName,
    props,
    propTypes,
    modifiers: parseVisualModifiers(modifierElements, context, nodeBase),
  };
}

function moduleEnabled(
  element: AuthorElement,
  inheritedEnabled: boolean,
): boolean {
  return inheritedEnabled &&
    parseBoolean(
      optionalAttribute(element, "enabled", "true"),
      `${element.name}.enabled`,
    );
}

function assertMatchingModuleProject(
  element: AuthorElement,
  context: BuildContext,
  project: ResolvedProject,
): void {
  const label = element.name === "template" ? "Template" : "Scene";
  const code = element.name === "template" ? "TEMPLATE" : "SCENE";
  const fields: Array<keyof Canvas> = [
    "width",
    "height",
    "fps",
    "background",
    "colorSpace",
  ];
  const mismatches = fields.filter(
    (field) => project.canvas[field] !== context.canvas[field],
  );
  if (mismatches.length > 0) {
    fail(
      `${code}_CANVAS_MISMATCH`,
      `${label} "${element.attributes.id ?? ""}" 的 canvas 必须与父项目完全一致`,
      { node: element.attributes.id, fields: mismatches },
    );
  }
  if (project.metadata.audioSampleRate !== context.audioSampleRate) {
    fail(
      `${code}_AUDIO_SAMPLE_RATE_MISMATCH`,
      `${label} "${element.attributes.id ?? ""}" 的 audioSampleRate 必须与父项目一致`,
      {
        node: element.attributes.id,
        expected: context.audioSampleRate,
        actual: project.metadata.audioSampleRate,
      },
    );
  }
}

const RENDER_MODULE_ATTRIBUTES = [
  ...TIME_NODE_COMMON_ATTRIBUTES,
  "src",
  "layer",
  "in",
  "out",
  "overflow",
  "opacity",
  "blend",
  "audio",
  "volume",
] as const;

function buildRenderModuleNode(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedPreview: boolean,
  loaded: { project: ResolvedProject; moduleDir: string; sourcePath: string },
): Omit<RenderModuleNodeBase, "kind"> {
  const kind = element.name as "scene" | "template";
  const label = kind === "template" ? "Template" : "Scene";
  const code = kind === "template" ? "TEMPLATE" : "SCENE";
  const id = validateId(requiredAttribute(element, "id"));
  assertMatchingModuleProject(element, context, loaded.project);
  const rawDurationFrames = loaded.project.totalFrames;
  const inFrame = element.attributes.in === undefined
    ? 0
    : parseTimeToFrames(element.attributes.in, context.canvas.fpsSource, `${kind}.in`);
  const outFrame = element.attributes.out === undefined
    ? rawDurationFrames
    : parseTimeToFrames(element.attributes.out, context.canvas.fpsSource, `${kind}.out`);
  if (inFrame < 0 || outFrame <= inFrame || outFrame > rawDurationFrames) {
    fail(
      `INVALID_${code}_RANGE`,
      `${label} "${id}" 的读取区间必须满足 0 <= in < out <= ${rawDurationFrames}f`,
      { node: id, inFrame, outFrame, rawDurationFrames },
    );
  }
  const sourceDurationFrames = outFrame - inFrame;
  if (element.attributes.duration === undefined && element.attributes.overflow !== undefined) {
    fail(
      `INVALID_${code}_OVERFLOW`,
      `${label} "${id}" 只有声明 duration 时才能声明 overflow`,
      { node: id },
    );
  }
  const durationFrames = element.attributes.duration === undefined
    ? sourceDurationFrames
    : parseDuration(element, context);
  const overflow = parseEnum<SceneOverflow>(
    optionalAttribute(element, "overflow", "error"),
    `${kind}.overflow`,
    ["error", "clip", "hold", "loop"],
  );
  if (overflow === "error" && durationFrames !== sourceDurationFrames) {
    fail(
      `${code}_DURATION_MISMATCH`,
      `${label} "${id}" 的 duration 与截取时长不一致`,
      { node: id, durationFrames, sourceDurationFrames },
    );
  }
  if (overflow === "clip" && durationFrames > sourceDurationFrames) {
    fail(
      `INVALID_${code}_OVERFLOW`,
      `${label} "${id}" 的 clip 只能缩短内容`,
      { node: id, durationFrames, sourceDurationFrames },
    );
  }
  const explicitPreview = parseBoolean(
    optionalAttribute(element, "preview", String(inheritedPreview)),
    `${kind}.preview`,
  );
  const nestedPreview = loaded.project.nodes.some(
    (node) => node.enabled && node.kind !== "audio" && node.preview,
  ) || loaded.project.sceneNodes.some((node) => node.preview) ||
    loaded.project.templateNodes.some((node) => node.preview);
  const declarationOrder = context.declarationOrder++;
  return {
    id,
    src: requiredAttribute(element, "src"),
    moduleDir: loaded.moduleDir,
    sourcePath: loaded.sourcePath,
    startFrame,
    endFrame: startFrame + durationFrames,
    durationFrames,
    rawDurationFrames,
    inFrame,
    outFrame,
    offsetFrames,
    enabled: true,
    preview: explicitPreview || nestedPreview,
    declarationOrder,
    layer: parseInteger(optionalAttribute(element, "layer", "0"), `${kind}.layer`),
    opacity: parseRange(optionalAttribute(element, "opacity", "1"), `${kind}.opacity`, 0, 1),
    blend: parseEnum<SceneBlend>(
      optionalAttribute(element, "blend", "normal"),
      `${kind}.blend`,
      ["normal", "multiply", "screen", "overlay", "darken", "lighten", "addition"],
    ),
    audio: parseEnum(optionalAttribute(element, "audio", "on"), `${kind}.audio`, [
      "on",
      "off",
    ]) === "on",
    volume: parseRange(optionalAttribute(element, "volume", "1"), `${kind}.volume`, 0, 100),
    overflow,
    project: loaded.project,
  };
}

function parseScene(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
): SceneNode | undefined {
  assertAllowedAttributes(element, RENDER_MODULE_ATTRIBUTES);
  assertNoElementChildren(element);
  const id = validateId(requiredAttribute(element, "id"));
  requiredAttribute(element, "src");
  registerId(context, id);
  const enabled = moduleEnabled(element, inheritedEnabled);
  if (!enabled) {
    context.ignoredTimeIds.add(id);
    return undefined;
  }
  if (context.isSceneProject) {
    fail("NESTED_SCENE", `Scene "${id}" 内不允许继续挂载 Scene`, {
      node: id,
      sourcePath: context.projectDir,
    });
  }
  const loaded = context.sceneProjects.get(id);
  if (loaded === undefined) {
    fail(
      "SCENE_REQUIRES_LOAD_PROJECT",
      `Scene "${id}" 需要通过异步 loadProject() 解析`,
      { node: id },
    );
  }
  const node: SceneNode = {
    ...buildRenderModuleNode(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedPreview,
      { project: loaded.project, moduleDir: loaded.sceneDir, sourcePath: loaded.sourcePath },
    ),
    id,
    kind: "scene",
    sceneDir: loaded.sceneDir,
  };
  context.sceneNodes.push(node);
  context.timeNodes.set(id, node);
  return node;
}

function parseTemplate(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
): TemplateNode | undefined {
  assertAllowedAttributes(element, RENDER_MODULE_ATTRIBUTES);
  const id = validateId(requiredAttribute(element, "id"));
  requiredAttribute(element, "src");
  registerId(context, id);
  if (!moduleEnabled(element, inheritedEnabled)) {
    context.ignoredTimeIds.add(id);
    return undefined;
  }
  if (context.isSceneProject) {
    fail("NESTED_SCENE", `Scene 内不允许挂载 Template "${id}"`, {
      node: id,
      sourcePath: context.projectDir,
    });
  }
  const loaded = context.templateProjects.get(id);
  if (loaded === undefined) {
    fail(
      "TEMPLATE_REQUIRES_LOAD_PROJECT",
      `Template "${id}" 需要通过异步 loadProject() 解析`,
      { node: id },
    );
  }
  const node: TemplateNode = {
    ...buildRenderModuleNode(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedPreview,
      {
        project: loaded.project,
        moduleDir: loaded.templateDir,
        sourcePath: loaded.sourcePath,
      },
    ),
    id,
    kind: "template",
    templateDir: loaded.templateDir,
    parameterContract: loaded.parameterContract,
    bindings: loaded.bindings,
    parameterSources: loaded.parameterSources,
  };
  context.templateNodes.push(node);
  context.timeNodes.set(id, node);
  return node;
}

function parseRenderNode(
  element: AuthorElement,
  context: BuildContext,
  startFrame: number,
  offsetFrames: number,
  inheritedEnabled: boolean,
  inheritedPreview: boolean,
): RenderNode {
  let node: RenderNode;
  if (element.name === "video") {
    node = parseVideo(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedEnabled,
      inheritedPreview,
    );
  } else if (element.name === "audio") {
    node = parseAudio(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedEnabled,
      inheritedPreview,
    );
  } else if (element.name === "image") {
    node = parseImage(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedEnabled,
      inheritedPreview,
    );
  } else if (element.name === "text" || element.name === "subtitle") {
    node = parseText(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedEnabled,
      inheritedPreview,
    );
  } else if (element.name === "react") {
    node = parseReact(
      element,
      context,
      startFrame,
      offsetFrames,
      inheritedEnabled,
      inheritedPreview,
    );
  } else {
    fail("UNKNOWN_NODE", `未知渲染节点 ${element.name}`);
  }
  context.nodes.push(node);
  context.timeNodes.set(node.id, node);
  return node;
}

function parseGroup(element: AuthorElement, context: BuildContext): GroupNode | undefined {
  assertAllowedAttributes(element, [
    "id",
    "mode",
    "at",
    "after",
    "with",
    "offset",
    "enabled",
    "preview",
  ]);
  assertWhitespaceOnly(element);
  const id = validateId(requiredAttribute(element, "id"));
  registerId(context, id);
  const mode = parseEnum(requiredAttribute(element, "mode"), "group.mode", [
    "parallel",
    "sequence",
  ]);
  if (element.children.length === 0) {
    fail("INVALID_GROUP", `Group "${id}" 至少需要一个渲染子节点`);
  }
  for (const child of element.children) {
    if (!RENDER_NODE_KINDS.has(child.name)) {
      fail(
        "INVALID_GROUP_CHILD",
        `Group "${id}" 只能包含渲染节点，收到 ${child.name}`,
      );
    }
  }
  const { startFrame } = parseAnchor(element, context);
  const enabled = parseBoolean(
    optionalAttribute(element, "enabled", "true"),
    "group.enabled",
  );
  const preview = parseBoolean(
    optionalAttribute(element, "preview", "false"),
    "preview",
  );
  const groupOrder = context.declarationOrder++;
  const childIds: string[] = [];
  let cursor = startFrame;
  let endFrame = Number.NEGATIVE_INFINITY;

  for (const child of element.children) {
    const childOffset = parseChildOffset(child, context);
    const childStart =
      mode === "parallel"
        ? startFrame + childOffset
        : cursor + childOffset;
    if (childStart < 0) {
      fail(
        "NEGATIVE_START",
        `Group "${id}" 的子节点 "${child.attributes.id ?? ""}" 开始时间不能小于 0f`,
      );
    }
    const node = child.name === "scene"
      ? parseScene(
          child,
          context,
          childStart,
          childOffset,
          enabled,
          preview,
        )
      : child.name === "template"
      ? parseTemplate(
          child,
          context,
          childStart,
          childOffset,
          enabled,
          preview,
        )
      : parseRenderNode(
          child,
          context,
          childStart,
          childOffset,
          enabled,
          preview,
        );
    if (node === undefined) continue;
    childIds.push(node.id);
    if (mode === "parallel") {
      endFrame = Math.max(endFrame, node.endFrame);
    } else {
      cursor = node.endFrame;
      endFrame = node.endFrame;
    }
  }
  if (childIds.length === 0) {
    context.ignoredTimeIds.add(id);
    return undefined;
  }
  if (!Number.isFinite(endFrame) || endFrame <= startFrame) {
    fail("INVALID_GROUP", `Group "${id}" 推导出的结束时间必须晚于开始时间`, {
      id,
      startFrame,
      endFrame,
    });
  }
  const group: GroupNode = {
    id,
    kind: "group",
    mode,
    startFrame,
    endFrame,
    durationFrames: endFrame - startFrame,
    enabled,
    preview,
    declarationOrder: groupOrder,
    childIds,
  };
  context.groups.push(group);
  context.timeNodes.set(id, group);
  return group;
}

function parseTimeline(element: AuthorElement, context: BuildContext): void {
  assertAllowedAttributes(element, []);
  assertWhitespaceOnly(element);
  if (element.children.length === 0) {
    fail("EMPTY_TIMELINE", "timeline 至少需要一个渲染节点");
  }
  for (const child of element.children) {
    if (!NODE_KINDS.has(child.name)) {
      fail("UNKNOWN_NODE", `timeline 中存在未知节点 ${child.name}`);
    }
    if (child.name === "group") {
      parseGroup(child, context);
    } else if (child.name === "scene" || child.name === "template") {
      if (!moduleEnabled(child, true)) {
        const anchors = TIME_ANCHORS.filter(
          (name) => child.attributes[name] !== undefined,
        );
        if (anchors.length !== 1) {
          fail(
            "INVALID_TIME_ANCHOR",
            `${child.name} "${child.attributes.id ?? ""}" 顶层节点必须且只能声明 at、after、with 中的一个`,
            { node: child.attributes.id, anchors },
          );
        }
        if (child.name === "scene") {
          parseScene(child, context, 0, 0, true, false);
        } else {
          parseTemplate(child, context, 0, 0, true, false);
        }
        continue;
      }
      const { startFrame, offsetFrames } = parseAnchor(child, context);
      if (child.name === "scene") {
        parseScene(child, context, startFrame, offsetFrames, true, false);
      } else {
        parseTemplate(child, context, startFrame, offsetFrames, true, false);
      }
    } else {
      const { startFrame, offsetFrames } = parseAnchor(child, context);
      parseRenderNode(
        child,
        context,
        startFrame,
        offsetFrames,
        true,
        false,
      );
    }
  }
}

function resolveAuthorProject(
  project: AuthorElement,
  options: CompileProjectOptions,
): ResolvedProject {
  try {
    const metadata = parseMetadata(project);
    const invalidChildren = project.children.filter(
      (child) => child.name !== "canvas" && child.name !== "timeline",
    );
    const canvases = project.children.filter((child) => child.name === "canvas");
    const timelines = project.children.filter(
      (child) => child.name === "timeline",
    );
    if (
      invalidChildren.length > 0 ||
      canvases.length !== 1 ||
      timelines.length !== 1
    ) {
      fail(
        "INVALID_STRUCTURE",
        "project 必须且只能包含一个 canvas 和一个 timeline",
      );
    }
    const canvasElement = canvases[0];
    const timelineElement = timelines[0];
    if (canvasElement === undefined || timelineElement === undefined) {
      fail("INVALID_STRUCTURE", "缺少 canvas 或 timeline");
    }
    if (
      project.children.indexOf(canvasElement) >
      project.children.indexOf(timelineElement)
    ) {
      fail("INVALID_STRUCTURE", "canvas 必须出现在 timeline 前面");
    }
    const canvas = parseCanvas(canvasElement);
    const declaredDurationFrames = project.attributes.duration === undefined
      ? undefined
      : parseTimeToFrames(
          project.attributes.duration,
          canvas.fpsSource,
          "project.duration",
        );
    if (declaredDurationFrames !== undefined && declaredDurationFrames <= 0) {
      fail("INVALID_DURATION", "project.duration 必须至少为 1f");
    }
    const projectDir = resolve(options.projectDir);
    const rootProjectDir = resolve(options.rootProjectDir ?? projectDir);
    const context: BuildContext = {
      version: metadata.version,
      audioSampleRate: metadata.audioSampleRate,
      canvas,
      projectDir,
      rootProjectDir,
      validateAssets: options.validateAssets ?? true,
      ids: new Set(),
      timeNodes: new Map(),
      nodes: [],
      sceneNodes: [],
      templateNodes: [],
      groups: [],
      declarationOrder: 0,
      ttsArtifacts: options.ttsArtifacts ?? new Map(),
      sceneProjects: options.sceneProjects ?? new Map(),
      templateProjects: options.templateProjects ?? new Map(),
      sceneDirectories: options.sceneDirectories ?? [],
      isSceneProject: options.isSceneProject ?? false,
      isTemplateProject: options.isTemplateProject ?? false,
      ...(options.parentTemplateDir === undefined
        ? {}
        : { parentTemplateDir: options.parentTemplateDir }),
      ignoredTimeIds: new Set(),
    };
    parseTimeline(timelineElement, context);
    const enabledEnds = [
      ...context.nodes.filter((node) => node.enabled).map((node) => node.endFrame),
      ...context.sceneNodes.map((node) => node.endFrame),
      ...context.templateNodes.map((node) => node.endFrame),
    ];
    const compatibilityEnds = context.nodes.map((node) => node.endFrame);
    const totalFrames = Math.max(
      declaredDurationFrames ?? 0,
      ...enabledEnds,
      ...(enabledEnds.length === 0 && !context.isSceneProject && !context.isTemplateProject
        ? compatibilityEnds
        : []),
    );
    if (!Number.isFinite(totalFrames) || totalFrames <= 0) {
      fail(
        "INVALID_TIMELINE",
        "工程必须包含启用内容或声明正数 project.duration",
      );
    }
    return {
      metadata,
      canvas,
      projectDir: context.projectDir,
      rootProjectDir: context.rootProjectDir,
      resourceRoots: [...new Set([
        context.projectDir,
        ...(context.parentTemplateDir === undefined
          ? []
          : [context.parentTemplateDir]),
        context.rootProjectDir,
      ])],
      ...(options.sourcePath === undefined
        ? {}
        : { sourcePath: options.sourcePath }),
      ...(options.sourceFingerprint === undefined
        ? {}
        : { sourceFingerprint: options.sourceFingerprint }),
      ...(declaredDurationFrames === undefined
        ? {}
        : { declaredDurationFrames }),
      totalFrames,
      nodes: context.nodes,
      sceneNodes: context.sceneNodes,
      templateNodes: context.templateNodes,
      groups: context.groups,
      timeNodes: context.timeNodes,
    };
  } catch (error) {
    if (error instanceof RenderEngineError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    fail("INVALID_PROJECT", message);
  }
}

export function compileProjectDeclaration(
  definition: AnyProjectDefinition,
  options: CompileProjectOptions,
): ResolvedProject {
  return resolveAuthorProject(projectElement(definition).project, options);
}

function collectSubtitleTtsSpecs(
  project: AuthorElement,
  projectDir: string,
  rootProjectDir: string,
  sceneDirectories: readonly string[],
  validateAssets: boolean,
  parentTemplateDir?: string,
): SubtitleTtsSpec[] {
  const specs: SubtitleTtsSpec[] = [];
  const visit = (element: AuthorElement): void => {
    if (element.name === "subtitle" || element.name === "text") {
      const ttsElements = element.children.filter(
        (child) => child.name === "tts",
      );
      if (ttsElements.length > 0) {
        if (ttsElements.length !== 1) {
          fail(
            "INVALID_STRUCTURE",
            `${element.name} "${element.attributes.id ?? ""}" 最多只能包含一个 tts`,
          );
        }
        if (
          element.name === "text" &&
          element.attributes.role !== "subtitle"
        ) {
          fail(
            "INVALID_STRUCTURE",
            `只有 subtitle 或 role="subtitle" 的 text 节点可以包含 tts`,
            { node: element.attributes.id },
          );
        }
        if (element.attributes.duration !== undefined) {
          fail(
            "CONFLICTING_DURATION",
            `${element.name} "${element.attributes.id ?? ""}" 启用 TTS 后不能声明 duration；时长由合成音频自动推导`,
            { node: element.attributes.id },
          );
        }
        const id = validateId(requiredAttribute(element, "id"));
        const contentElements = element.children.filter(
          (child) => child.name === "content",
        );
        const content = contentElements[0];
        if (
          contentElements.length !== 1 ||
          content === undefined ||
          content.children.length > 0 ||
          Object.keys(content.attributes).length > 0 ||
          content.text.trim().length === 0
        ) {
          fail(
            "INVALID_STRUCTURE",
            `启用 TTS 的字幕 "${id}" 必须包含一个非空纯文本 content`,
            { node: id },
          );
        }
        const declaration = parseTtsDeclaration(ttsElements[0]!, {
          projectDir,
          rootProjectDir,
          sceneDirectories,
          validateAssets,
          ...(parentTemplateDir === undefined ? {} : { parentTemplateDir }),
        });
        specs.push({
          id,
          text: content.text,
          ...(declaration.style === undefined
            ? {}
            : { style: declaration.style }),
          ...(declaration.referencePath === undefined
            ? {}
            : { referencePath: declaration.referencePath }),
        });
      }
    }
    for (const child of element.children) visit(child);
  };
  visit(project);
  return specs;
}

interface RenderModuleDeclaration {
  kind: "scene" | "template";
  id: string;
  moduleDir: string;
  sourcePath: string;
  bindings: Record<string, TemplatePropValue>;
}

function resolveRenderModuleDeclaration(
  element: AuthorElement,
  containingProjectDir: string,
): RenderModuleDeclaration {
  const kind = element.name as "scene" | "template";
  const label = kind === "scene" ? "Scene" : "Template";
  const code = kind === "scene" ? "SCENE" : "TEMPLATE";
  const id = validateId(requiredAttribute(element, "id"));
  const src = requiredAttribute(element, "src");
  if (
    src.length === 0 ||
    isAbsolute(src) ||
    /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(src)
  ) {
    fail("INVALID_PATH", `${kind}.src 必须是当前工程内的相对目录，收到 "${src}"`, {
      node: id,
      value: src,
    });
  }
  const moduleDir = resolve(containingProjectDir, src);
  const fromContainer = relative(containingProjectDir, moduleDir);
  if (fromContainer === ".." || fromContainer.startsWith(`..${sep}`)) {
    fail("INVALID_PATH", `${kind}.src 不能指向当前工程目录外: "${src}"`, {
      node: id,
      value: src,
    });
  }
  if (!existsSync(moduleDir) || !statSync(moduleDir).isDirectory()) {
    fail(`${code}_NOT_FOUND`, `${label} 目录不存在: "${src}"`, {
      node: id,
      moduleDir,
    });
  }
  const canonicalContainer = realpathSync(containingProjectDir);
  const canonicalModuleDir = realpathSync(moduleDir);
  const canonicalRelative = relative(canonicalContainer, canonicalModuleDir);
  if (
    canonicalRelative === ".." ||
    canonicalRelative.startsWith(`..${sep}`)
  ) {
    fail("INVALID_PATH", `${kind}.src 不能通过符号链接逃出当前工程目录: "${src}"`, {
      node: id,
      value: src,
      resolvedPath: canonicalModuleDir,
    });
  }
  const sourcePath = resolveModuleProjectSource(canonicalModuleDir);
  if (sourcePath === undefined) {
    fail(`${code}_MAIN_NOT_FOUND`, `${label} "${id}" 缺少 main.tsx`, {
      node: id,
      moduleDir: canonicalModuleDir,
    });
  }
  return {
    kind,
    id,
    moduleDir: canonicalModuleDir,
    sourcePath: realpathSync(sourcePath),
    bindings: kind === "template"
      ? { ...(element.payload as Readonly<Record<string, TemplatePropValue>> | undefined) }
      : {},
  };
}

function collectEnabledRenderModuleDeclarations(
  project: AuthorElement,
  containingProjectDir: string,
): RenderModuleDeclaration[] {
  const timeline = project.children.find((child) => child.name === "timeline");
  if (timeline === undefined) return [];
  const declarations: RenderModuleDeclaration[] = [];
  const enabledIds = new Set<string>();
  const visit = (element: AuthorElement, inheritedEnabled: boolean): void => {
    if (element.name === "scene" || element.name === "template") {
      if (moduleEnabled(element, inheritedEnabled)) {
        const declaration = resolveRenderModuleDeclaration(
          element,
          containingProjectDir,
        );
        if (enabledIds.has(declaration.id)) {
          fail("DUPLICATE_ID", `节点 ID "${declaration.id}" 重复`, {
            id: declaration.id,
          });
        }
        enabledIds.add(declaration.id);
        declarations.push(declaration);
      }
      return;
    }
    if (element.name !== "group") return;
    const enabled = inheritedEnabled && parseBoolean(
      optionalAttribute(element, "enabled", "true"),
      "group.enabled",
    );
    for (const child of element.children) visit(child, enabled);
  };
  for (const child of timeline.children) visit(child, true);
  return declarations;
}

function hasRenderModuleElement(element: AuthorElement): boolean {
  return element.name === "scene" || element.name === "template" ||
    element.children.some(hasRenderModuleElement);
}

function wrapRenderModuleError(
  error: unknown,
  declaration: RenderModuleDeclaration,
): never {
  if (error instanceof RenderEngineError) {
    const label = declaration.kind === "scene" ? "Scene" : "Template";
    const priorStack = Array.isArray(error.details?.moduleStack)
      ? error.details.moduleStack
      : [];
    throw new RenderEngineError(
      error.code,
      `${label} "${declaration.id}" 编译失败: ${error.message}`,
      {
        ...error.details,
        ...(declaration.kind === "scene"
          ? {
              sceneId: declaration.id,
              sceneDir: declaration.moduleDir,
              scenePath: declaration.sourcePath,
            }
          : {
              templateId: declaration.id,
              templateDir: declaration.moduleDir,
              templatePath: declaration.sourcePath,
            }),
        moduleStack: [
          { kind: declaration.kind, id: declaration.id, path: declaration.sourcePath },
          ...priorStack,
        ],
      },
    );
  }
  throw error;
}

interface LoadedRenderModule {
  project: ResolvedProject;
  parameterContract: TemplateParameterDefinition[];
  bindings: Record<string, TemplatePropValue>;
  parameterSources: Record<string, TemplateParameterSource>;
}

interface RecursiveLoadContext {
  rootProjectDir: string,
  options: LoadProjectOptions;
  projectsByKey: Map<string, Promise<LoadedRenderModule>>;
  modulesByPath: Map<string, ReturnType<typeof loadProjectModule>>;
}

function canonicalBindings(bindings: Readonly<Record<string, TemplatePropValue>>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(bindings).sort(([left], [right]) =>
      left.localeCompare(right)
    )),
  );
}

async function loadRenderModuleSource(
  declaration: RenderModuleDeclaration,
  parentTemplateDir: string | undefined,
  peerModuleDirectories: readonly string[],
  context: RecursiveLoadContext,
  stack: readonly string[],
): Promise<LoadedRenderModule> {
  if (stack.includes(declaration.sourcePath)) {
    fail("RECURSIVE_TEMPLATE", `Template/Scene 形成递归引用: ${[
      ...stack,
      declaration.sourcePath,
    ].join(" -> ")}`, {
      node: declaration.id,
      moduleStack: [...stack, declaration.sourcePath],
    });
  }
  const key = [
    declaration.kind,
    declaration.sourcePath,
    parentTemplateDir ?? "",
    canonicalBindings(declaration.bindings),
  ].join("\0");
  let promise = context.projectsByKey.get(key);
  if (promise !== undefined) return promise;
  promise = (async () => {
    let modulePromise = context.modulesByPath.get(declaration.sourcePath);
    if (modulePromise === undefined) {
      modulePromise = loadProjectModule(declaration.sourcePath);
      context.modulesByPath.set(declaration.sourcePath, modulePromise);
    }
    const module = await modulePromise;
    if (
      declaration.kind === "scene" && module.definition.kind !== "project" ||
      declaration.kind === "template" && module.definition.kind !== "template"
    ) {
      fail(
        "INVALID_PROJECT_DEFINITION",
        `${declaration.kind} 入口必须由 ${
          declaration.kind === "scene" ? "defineProject" : "defineTemplate"
        } 创建`,
        { sourcePath: declaration.sourcePath },
      );
    }
    const materialized = projectElement(module.definition, declaration.bindings);
    if (declaration.kind === "scene") {
      if (hasRenderModuleElement(materialized.project)) {
        fail("NESTED_SCENE", "Scene main.tsx 不允许包含 Scene 或 Template");
      }
    }
    const project = await loadResolvedProject(
      materialized.project,
      declaration.sourcePath,
      module.bundleHash,
      declaration.moduleDir,
      declaration.kind,
      parentTemplateDir,
      peerModuleDirectories,
      context,
      [...stack, declaration.sourcePath],
    );
    return {
      project,
      parameterContract: materialized.parameterContract,
      bindings: materialized.typedBindings,
      parameterSources: materialized.parameterSources,
    };
  })();
  context.projectsByKey.set(key, promise);
  return promise;
}

async function loadResolvedProject(
  authorProject: AuthorElement,
  sourcePath: string,
  sourceFingerprint: string,
  projectDir: string,
  projectKind: "root" | "scene" | "template",
  parentTemplateDir: string | undefined,
  peerModuleDirectories: readonly string[],
  context: RecursiveLoadContext,
  stack: readonly string[],
): Promise<ResolvedProject> {
  const declarations = collectEnabledRenderModuleDeclarations(authorProject, projectDir);
  if (projectKind === "scene" && declarations.length > 0) {
    fail("NESTED_SCENE", "Scene main.tsx 不允许包含 Scene 或 Template");
  }
  const moduleDirectories = [...new Set(declarations.map((item) => item.moduleDir))];
  const privateModuleDirectories = [...new Set([
    ...peerModuleDirectories,
    ...moduleDirectories,
  ])];
  const sceneProjects = new Map<string, PreloadedSceneProject>();
  const templateProjects = new Map<string, PreloadedTemplateProject>();
  await Promise.all(declarations.map(async (declaration) => {
    try {
      const loaded = await loadRenderModuleSource(
        declaration,
        projectKind === "template" ? projectDir : parentTemplateDir,
        moduleDirectories,
        context,
        stack,
      );
      if (declaration.kind === "scene") {
        sceneProjects.set(declaration.id, {
          project: loaded.project,
          sceneDir: declaration.moduleDir,
          sourcePath: declaration.sourcePath,
        });
      } else {
        templateProjects.set(declaration.id, {
          project: loaded.project,
          templateDir: declaration.moduleDir,
          sourcePath: declaration.sourcePath,
          parameterContract: loaded.parameterContract,
          bindings: loaded.bindings,
          parameterSources: loaded.parameterSources,
        });
      }
    } catch (error) {
      wrapRenderModuleError(error, declaration);
    }
  }));
  const validateAssets = context.options.validateAssets ?? true;
  const ttsSpecs = collectSubtitleTtsSpecs(
    authorProject,
    projectDir,
    context.rootProjectDir,
    privateModuleDirectories,
    validateAssets,
    parentTemplateDir,
  );
  const ttsArtifacts = await prepareSubtitleTts(
    ttsSpecs,
    projectDir,
    context.options.tts,
    context.options.signal,
  );
  return resolveAuthorProject(authorProject, {
    projectDir,
    rootProjectDir: context.rootProjectDir,
    sourcePath,
    sourceFingerprint,
    validateAssets,
    ttsArtifacts,
    sceneProjects,
    templateProjects,
    sceneDirectories: privateModuleDirectories,
    isSceneProject: projectKind === "scene",
    isTemplateProject: projectKind === "template",
    ...(parentTemplateDir === undefined ? {} : { parentTemplateDir }),
  });
}

export async function loadProject(
  projectPath: string,
  options: LoadProjectOptions = {},
): Promise<ResolvedProject> {
  const sourcePath = resolve(projectPath);
  const module = await loadProjectModule(sourcePath);
  const projectDir = dirname(sourcePath);
  const materialized = projectElement(module.definition);
  const context: RecursiveLoadContext = {
    rootProjectDir: projectDir,
    options,
    projectsByKey: new Map(),
    modulesByPath: new Map([[sourcePath, Promise.resolve(module)]]),
  };
  const project = await loadResolvedProject(
    materialized.project,
    sourcePath,
    module.bundleHash,
    projectDir,
    module.definition.kind === "template" ? "template" : "root",
    undefined,
    [],
    context,
    [sourcePath],
  );
  if (options.validateAssets ?? true) {
    await resolveProjectTextLayouts(project);
  }
  return project;
}
