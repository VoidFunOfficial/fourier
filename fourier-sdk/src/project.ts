import { isValidElement, type ReactElement, type ReactNode } from "react";
import { sdkFail } from "./errors.ts";
import {
  defineSchema,
  type AnyFieldDefinition,
  type FieldDefinition,
  type FieldsSchema,
  type TimeValue,
} from "./schema.ts";

/** Data-only JSX project declarations consumed directly by render-engine. */
export const FOURIER_PROJECT_NODE = Symbol.for("@fourier-video/sdk/project-node");
export const FOURIER_PROJECT_DEFINITION = Symbol.for(
  "@fourier-video/sdk/project-definition",
);

export type TimeExpression = string | TimeValue;
export type ProjectPropValue = string | number | boolean | TimeValue;
export type TemplatePropValue = ProjectPropValue;
export type ProjectChildren = ReactNode;

interface WithChildren {
  readonly children?: ProjectChildren;
}

interface TimeNodeProps extends WithChildren {
  readonly id: string;
  readonly duration?: TimeExpression;
  readonly at?: TimeExpression;
  readonly after?: string;
  readonly with?: string;
  readonly offset?: TimeExpression;
  readonly enabled?: boolean;
  readonly preview?: boolean;
}

interface VisualProps {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly layer: number;
  readonly opacity?: number;
  readonly rotation?: number;
}

interface VisualNodeProps extends TimeNodeProps, VisualProps {}

export interface ProjectProps extends WithChildren {
  readonly id: string;
  readonly version: "1.0";
  readonly audioSampleRate: number;
  readonly duration?: TimeExpression;
}

export interface CanvasProps {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly background: string;
  readonly colorSpace: "sRGB";
}

export interface TimelineProps extends WithChildren {}

export interface GroupProps extends Omit<TimeNodeProps, "duration"> {
  readonly mode: "parallel" | "sequence";
}

export interface VideoProps extends VisualNodeProps {
  readonly duration: TimeExpression;
  readonly src: string;
  readonly sourceIn: TimeExpression;
  readonly fit: "cover" | "contain" | "stretch";
  readonly audio: boolean;
  readonly rate?: number;
  readonly volume?: number;
  readonly loop?: boolean;
}

export interface AudioProps extends TimeNodeProps {
  readonly duration: TimeExpression;
  readonly src: string;
  readonly sourceIn: TimeExpression;
  readonly volume: number;
  readonly rate?: number;
  readonly muted?: boolean;
}

export interface ImageProps extends VisualNodeProps {
  readonly duration: TimeExpression;
  readonly src: string;
  readonly fit: "cover" | "contain" | "stretch";
}

export interface TextProps extends Omit<VisualNodeProps, "width" | "height"> {
  readonly duration?: TimeExpression;
  readonly width?: number | "auto";
  readonly height?: number | "auto";
  readonly role: "title" | "body" | "subtitle" | "label";
  readonly font: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly color: string;
  readonly align: "left" | "center" | "right";
  readonly verticalAlign?: "top" | "center" | "bottom";
  readonly maxLines?: number;
  readonly overflow?: "clip" | "ellipsis";
  readonly background?: string;
  readonly content: string;
  readonly tts?: {
    readonly style?: string;
    readonly volume?: number;
    readonly reference?: string;
  };
}

export interface SubtitleProps extends Omit<TextProps, "role"> {
  readonly role?: "subtitle";
}

export interface ReactLayerProps extends VisualNodeProps {
  readonly duration: TimeExpression;
  readonly component: string;
  readonly exportName?: string;
  readonly props?: Readonly<Record<string, ProjectPropValue>>;
}

export interface SceneProps extends TimeNodeProps {
  readonly src: string;
  readonly sourceIn?: TimeExpression;
  readonly sourceOut?: TimeExpression;
  readonly layer?: number;
  readonly opacity?: number;
  readonly blend?:
    | "normal"
    | "multiply"
    | "screen"
    | "overlay"
    | "darken"
    | "lighten"
    | "addition";
  readonly audio?: boolean;
  readonly volume?: number;
  readonly overflow?: "error" | "clip" | "hold" | "loop";
}

export interface TemplateProps extends SceneProps {
  readonly props?: Readonly<Record<string, TemplatePropValue>>;
}

export interface MotionProps extends TimeNodeProps {
  readonly duration: TimeExpression;
  readonly fill: "none" | "forwards" | "backwards" | "both";
  readonly component: string;
  readonly exportName?: string;
  readonly props?: Readonly<Record<string, ProjectPropValue>>;
}

export interface TransformKeyframe {
  readonly offset: number;
  readonly translateX: number;
  readonly translateY: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotation: number;
  readonly opacity: number;
}

export interface TransformProps extends TimeNodeProps {
  readonly duration: TimeExpression;
  readonly fill: "none" | "forwards" | "backwards" | "both";
  readonly easing: string;
  readonly keyframes: readonly TransformKeyframe[];
}

export interface ProjectNodeComponent<Props> {
  (props: Props): ReactElement | null;
  readonly [FOURIER_PROJECT_NODE]: string;
}

function projectNode<Props>(tag: string): ProjectNodeComponent<Props> {
  const component = (() => null) as unknown as ProjectNodeComponent<Props>;
  Object.defineProperty(component, FOURIER_PROJECT_NODE, { value: tag });
  Object.defineProperty(component, "displayName", { value: `FourierProject.${tag}` });
  return component;
}

export const Project = projectNode<ProjectProps>("project");
export const Canvas = projectNode<CanvasProps>("canvas");
export const Timeline = projectNode<TimelineProps>("timeline");
export const Group = projectNode<GroupProps>("group");
export const Video = projectNode<VideoProps>("video");
export const Audio = projectNode<AudioProps>("audio");
export const Image = projectNode<ImageProps>("image");
export const Text = projectNode<TextProps>("text");
export const Subtitle = projectNode<SubtitleProps>("subtitle");
export const ReactLayer = projectNode<ReactLayerProps>("react");
export const Scene = projectNode<SceneProps>("scene");
export const Template = projectNode<TemplateProps>("template");
export const Motion = projectNode<MotionProps>("motion");
export const Transform = projectNode<TransformProps>("transform");

function nodeTag(type: unknown): string | undefined {
  if ((typeof type !== "function" && typeof type !== "object") || type === null) {
    return undefined;
  }
  const tag = (type as Record<PropertyKey, unknown>)[FOURIER_PROJECT_NODE];
  return typeof tag === "string" ? tag : undefined;
}

export interface ProjectElementSnapshot {
  readonly tag: string;
  readonly props: Readonly<Record<string, unknown>>;
}

export function readProjectElement(value: unknown): ProjectElementSnapshot | undefined {
  if (!isValidElement<Record<string, unknown>>(value)) return undefined;
  const tag = nodeTag(value.type);
  return tag === undefined ? undefined : { tag, props: value.props };
}

export interface ProjectDefinition {
  readonly package: "@fourier-video/sdk";
  readonly version: 1;
  readonly kind: "project";
  readonly declaration: ReactElement;
  readonly [FOURIER_PROJECT_DEFINITION]: true;
}

type FieldInput<Field> = Field extends FieldDefinition<any, infer Input, any>
  ? Input
  : never;

export type TemplateRenderProps<Schema extends FieldsSchema> = {
  readonly [Key in keyof Schema]: FieldInput<Schema[Key]>;
};

export interface TemplateDefinition<Schema extends FieldsSchema = FieldsSchema> {
  readonly package: "@fourier-video/sdk";
  readonly version: 1;
  readonly kind: "template";
  readonly schema: Readonly<Schema>;
  readonly render: (props: Readonly<TemplateRenderProps<Schema>>) => ReactElement;
  readonly [FOURIER_PROJECT_DEFINITION]: true;
}

export type AnyProjectDefinition = ProjectDefinition | TemplateDefinition<any>;

function definitionBase<Kind extends "project" | "template">(kind: Kind) {
  return {
    package: "@fourier-video/sdk" as const,
    version: 1 as const,
    kind,
    [FOURIER_PROJECT_DEFINITION]: true as const,
  };
}

function assertProjectRoot(declaration: unknown): asserts declaration is ReactElement {
  if (readProjectElement(declaration)?.tag !== "project") {
    sdkFail(
      "INVALID_PROJECT_DEFINITION",
      "defineProject/defineTemplate.render 必须返回 <Project> 根节点",
    );
  }
}

export function defineProject(declaration: ReactElement): ProjectDefinition {
  assertProjectRoot(declaration);
  return Object.freeze({ ...definitionBase("project"), declaration });
}

export function defineTemplate<const Schema extends FieldsSchema>(definition: {
  readonly schema: Schema;
  readonly render: (props: Readonly<TemplateRenderProps<Schema>>) => ReactElement;
}): TemplateDefinition<Schema> {
  if (typeof definition?.render !== "function") {
    sdkFail("INVALID_TEMPLATE_DEFINITION", "defineTemplate.render 必须是函数");
  }
  const schema = defineSchema(definition.schema);
  for (const [name, field] of Object.entries(schema)) {
    if (field.kind === "node") {
      sdkFail(
        "INVALID_TEMPLATE_DEFINITION",
        `Template schema.${name} 不支持 node 字段`,
      );
    }
  }
  const render = (props: Readonly<TemplateRenderProps<Schema>>) => {
    const declaration = definition.render(props);
    assertProjectRoot(declaration);
    return declaration;
  };
  return Object.freeze({ ...definitionBase("template"), schema, render });
}

export function readProjectDefinition(value: unknown): AnyProjectDefinition | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Partial<AnyProjectDefinition> & Record<PropertyKey, unknown>;
  return candidate[FOURIER_PROJECT_DEFINITION] === true &&
      candidate.package === "@fourier-video/sdk" && candidate.version === 1 &&
      (candidate.kind === "project" || candidate.kind === "template")
    ? candidate as AnyProjectDefinition
    : undefined;
}

function timeInput(value: unknown): boolean {
  if (typeof value === "string") {
    return /^(?:\d+(?:\.\d+)?(?:ms|s|f))+$/.test(value);
  }
  return typeof value === "object" && value !== null &&
    typeof (value as TimeValue).source === "string" &&
    Number.isInteger((value as TimeValue).frames) &&
    Number.isFinite((value as TimeValue).seconds);
}

function validateTemplateValue(name: string, field: AnyFieldDefinition, value: unknown): void {
  if (field.kind === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) ||
      (field.integer === true && !Number.isInteger(value)) ||
      (field.min !== undefined && value < field.min) ||
      (field.max !== undefined && value > field.max)) {
      sdkFail("INVALID_TEMPLATE_PROP", `${name} 不符合 number schema`, { field: name });
    }
    return;
  }
  if (field.kind === "boolean") {
    if (typeof value !== "boolean") {
      sdkFail("INVALID_TEMPLATE_PROP", `${name} 必须是 boolean`, { field: name });
    }
    return;
  }
  if (field.kind === "time") {
    if (!timeInput(value)) {
      sdkFail("INVALID_TEMPLATE_PROP", `${name} 必须是有效时间`, { field: name });
    }
    return;
  }
  if (typeof value !== "string") {
    sdkFail("INVALID_TEMPLATE_PROP", `${name} 必须是 string`, { field: name });
  }
  if (field.kind === "enum" && !field.values?.includes(value)) {
    sdkFail("INVALID_TEMPLATE_PROP", `${name} 不在 schema 枚举中`, { field: name });
  }
  if (field.kind === "color" && !(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value) ||
    /^[a-zA-Z]+$/.test(value)
  )) {
    sdkFail("INVALID_TEMPLATE_PROP", `${name} 不是受支持的颜色`, { field: name });
  }
  if ((field.minLength !== undefined && value.length < field.minLength) ||
    (field.maxLength !== undefined && value.length > field.maxLength)) {
    sdkFail("INVALID_TEMPLATE_PROP", `${name} 长度超出 schema 范围`, { field: name });
  }
}

export function bindTemplateProps(
  definition: TemplateDefinition<any>,
  input: Readonly<Record<string, unknown>>,
): {
  readonly props: Readonly<Record<string, TemplatePropValue>>;
  readonly sources: Readonly<Record<string, "explicit" | "default">>;
} {
  const unknown = Object.keys(input).filter((name) => !Object.hasOwn(definition.schema, name));
  if (unknown.length > 0) {
    sdkFail("UNKNOWN_TEMPLATE_PROP", `存在 schema 未声明参数: ${unknown.join(", ")}`);
  }
  const props: Record<string, TemplatePropValue> = {};
  const sources: Record<string, "explicit" | "default"> = {};
  for (const [name, field] of Object.entries(definition.schema)) {
    const explicit = Object.hasOwn(input, name);
    if (!explicit && !field.hasDefault) {
      sdkFail("MISSING_TEMPLATE_PROP", `缺少必填 Template 参数 ${name}`, { field: name });
    }
    const value = explicit ? input[name] : field.defaultValue;
    validateTemplateValue(name, field, value);
    props[name] = value as TemplatePropValue;
    sources[name] = explicit ? "explicit" : "default";
  }
  return { props: Object.freeze(props), sources: Object.freeze(sources) };
}
