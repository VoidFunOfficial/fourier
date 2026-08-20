import type { ReactNode } from "react";
import {
  SDK_SCHEMA_FIELD_PACKAGE,
  SDK_SCHEMA_VERSION,
} from "@fourier-video/core/protocol";
import { sdkFail } from "./errors.ts";

export { SDK_SCHEMA_FIELD_PACKAGE, SDK_SCHEMA_VERSION };

export interface TimeValue {
  source: string;
  frames: number;
  seconds: number;
}

export type FieldKind =
  | "string"
  | "number"
  | "boolean"
  | "color"
  | "time"
  | "enum"
  | "asset"
  | "node";

export interface FieldDefinition<
  Value = unknown,
  Input = Value,
  HasDefault extends boolean = boolean,
> {
  readonly package: typeof SDK_SCHEMA_FIELD_PACKAGE;
  readonly schemaVersion: typeof SDK_SCHEMA_VERSION;
  readonly kind: FieldKind;
  readonly hasDefault: HasDefault;
  readonly defaultValue?: Input;
  readonly label?: string;
  readonly description?: string;
  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly values?: readonly string[];
  readonly accept?: readonly string[];
  /** Type-only markers; field() does not emit them at runtime. */
  readonly "~value"?: Value;
  readonly "~input"?: Input;
}

export type AnyFieldDefinition = FieldDefinition<any, any, boolean>;
export type FieldsSchema = Readonly<Record<string, AnyFieldDefinition>>;

type ValueOf<Field> = Field extends FieldDefinition<infer Value, any, any>
  ? Value
  : never;
type InputOf<Field> = Field extends FieldDefinition<any, infer Input, any>
  ? Input
  : never;
type DefaultKeys<Schema extends FieldsSchema> = {
  [Key in keyof Schema]-?: Schema[Key] extends FieldDefinition<any, any, true>
    ? Key
    : never;
}[keyof Schema];
type RequiredKeys<Schema extends FieldsSchema> = Exclude<
  keyof Schema,
  DefaultKeys<Schema>
>;

export type InferFields<Schema extends FieldsSchema> = {
  readonly [Key in keyof Schema]: ValueOf<Schema[Key]>;
};

export type InferFieldInputs<Schema extends FieldsSchema> = {
  readonly [Key in RequiredKeys<Schema>]: InputOf<Schema[Key]>;
} & {
  readonly [Key in DefaultKeys<Schema>]?: InputOf<Schema[Key]>;
};

interface CommonOptions {
  label?: string;
  description?: string;
}

interface StringOptions extends CommonOptions {
  minLength?: number;
  maxLength?: number;
}

interface NumberOptions extends CommonOptions {
  min?: number;
  max?: number;
  integer?: boolean;
}

interface AssetOptions extends CommonOptions {
  accept?: readonly string[];
}

type WithDefault<Options, Value> = Options & { default: Value };

interface StringFieldFactory {
  (): FieldDefinition<string, string, false>;
  (options: WithDefault<StringOptions, string>): FieldDefinition<string, string, true>;
  (options: StringOptions): FieldDefinition<string, string, false>;
}

interface NumberFieldFactory {
  (): FieldDefinition<number, number, false>;
  (options: WithDefault<NumberOptions, number>): FieldDefinition<number, number, true>;
  (options: NumberOptions): FieldDefinition<number, number, false>;
}

interface BooleanFieldFactory {
  (): FieldDefinition<boolean, boolean, false>;
  (options: WithDefault<CommonOptions, boolean>): FieldDefinition<boolean, boolean, true>;
  (options: CommonOptions): FieldDefinition<boolean, boolean, false>;
}

interface ColorFieldFactory {
  (): FieldDefinition<string, string, false>;
  (options: WithDefault<CommonOptions, string>): FieldDefinition<string, string, true>;
  (options: CommonOptions): FieldDefinition<string, string, false>;
}

interface TimeFieldFactory {
  (): FieldDefinition<TimeValue, string | TimeValue, false>;
  (options: WithDefault<CommonOptions, string | TimeValue>): FieldDefinition<TimeValue, string | TimeValue, true>;
  (options: CommonOptions): FieldDefinition<TimeValue, string | TimeValue, false>;
}

interface AssetFieldFactory {
  (): FieldDefinition<string, string, false>;
  (options: WithDefault<AssetOptions, string>): FieldDefinition<string, string, true>;
  (options: AssetOptions): FieldDefinition<string, string, false>;
}

interface NodeFieldFactory {
  (options?: CommonOptions): FieldDefinition<
    Exclude<ReactNode, undefined>,
    Exclude<ReactNode, undefined>,
    false
  >;
}

function makeField(
  kind: FieldKind,
  options: Readonly<Record<string, unknown>> = {},
  extras: Readonly<Record<string, unknown>> = {},
): AnyFieldDefinition {
  const hasDefault = Object.hasOwn(options, "default");
  const { default: defaultValue, ...rest } = options;
  return Object.freeze({
    package: SDK_SCHEMA_FIELD_PACKAGE,
    schemaVersion: SDK_SCHEMA_VERSION,
    kind,
    hasDefault,
    ...(hasDefault ? { defaultValue } : {}),
    ...rest,
    ...extras,
  }) as AnyFieldDefinition;
}

function enumField<
  const Values extends readonly [string, ...string[]],
>(values: Values): FieldDefinition<Values[number], Values[number], false>;
function enumField<
  const Values extends readonly [string, ...string[]],
>(
  values: Values,
  options: WithDefault<CommonOptions, Values[number]>,
): FieldDefinition<Values[number], Values[number], true>;
function enumField<
  const Values extends readonly [string, ...string[]],
>(
  values: Values,
  options: CommonOptions,
): FieldDefinition<Values[number], Values[number], false>;
function enumField(
  values: readonly string[],
  options: any = {},
): FieldDefinition<any, any, any> {
  if (
    values.length === 0 ||
    new Set(values).size !== values.length ||
    values.some((value) => value.length === 0)
  ) {
    sdkFail("INVALID_ARTIFACT_SCHEMA", "field.enum values 必须是非空且不重复的字符串");
  }
  return makeField("enum", options, { values: Object.freeze([...values]) });
}

export const field = Object.freeze({
  string: ((options: Readonly<Record<string, unknown>> = {}) =>
    makeField("string", options)) as StringFieldFactory,
  number: ((options: Readonly<Record<string, unknown>> = {}) =>
    makeField("number", options)) as NumberFieldFactory,
  boolean: ((options: Readonly<Record<string, unknown>> = {}) =>
    makeField("boolean", options)) as BooleanFieldFactory,
  color: ((options: Readonly<Record<string, unknown>> = {}) =>
    makeField("color", options)) as ColorFieldFactory,
  time: ((options: Readonly<Record<string, unknown>> = {}) =>
    makeField("time", options)) as TimeFieldFactory,
  enum: enumField,
  asset: ((options: Readonly<Record<string, unknown>> = {}) =>
    makeField("asset", options)) as AssetFieldFactory,
  node: ((options: Readonly<Record<string, unknown>> = {}) =>
    makeField("node", options)) as NodeFieldFactory,
});

function finiteNonNegativeInteger(value: unknown): boolean {
  return Number.isInteger(value) && (value as number) >= 0;
}

function validateField(name: string, value: unknown): asserts value is AnyFieldDefinition {
  if (
    typeof value !== "object" ||
    value === null ||
    (value as AnyFieldDefinition).package !== SDK_SCHEMA_FIELD_PACKAGE ||
    (value as AnyFieldDefinition).schemaVersion !== SDK_SCHEMA_VERSION
  ) {
    sdkFail("INVALID_ARTIFACT_SCHEMA", `schema.${name} 必须由 field.*() 创建`, { field: name });
  }
  const definition = value as AnyFieldDefinition;
  if (![
    "string",
    "number",
    "boolean",
    "color",
    "time",
    "enum",
    "asset",
    "node",
  ].includes(definition.kind)) {
    sdkFail("INVALID_ARTIFACT_SCHEMA", `schema.${name}.kind 无效`, { field: name });
  }
  if (
    definition.min !== undefined && !Number.isFinite(definition.min) ||
    definition.max !== undefined && !Number.isFinite(definition.max) ||
    definition.minLength !== undefined && !finiteNonNegativeInteger(definition.minLength) ||
    definition.maxLength !== undefined && !finiteNonNegativeInteger(definition.maxLength)
  ) {
    sdkFail("INVALID_ARTIFACT_SCHEMA", `schema.${name} 的约束无效`, { field: name });
  }
  if (
    definition.min !== undefined &&
    definition.max !== undefined &&
    definition.min > definition.max
  ) {
    sdkFail("INVALID_ARTIFACT_SCHEMA", `schema.${name}.min 不能大于 max`, { field: name });
  }
  if (
    definition.minLength !== undefined &&
    definition.maxLength !== undefined &&
    definition.minLength > definition.maxLength
  ) {
    sdkFail("INVALID_ARTIFACT_SCHEMA", `schema.${name}.minLength 不能大于 maxLength`, { field: name });
  }
}

export function defineSchema<const Schema extends FieldsSchema>(
  input: Schema,
): Readonly<Schema> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    sdkFail("INVALID_ARTIFACT_SCHEMA", "schema 必须是字段对象");
  }
  const entries = Object.entries(input);
  for (const [name, definition] of entries) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
      sdkFail("INVALID_ARTIFACT_SCHEMA", `schema 字段名非法: ${name}`, { field: name });
    }
    validateField(name, definition);
  }
  return Object.freeze({ ...input }) as Readonly<Schema>;
}

function parseTime(source: string, fps: number, name: string): TimeValue {
  const pattern = /(\d+(?:\.\d+)?)(ms|s|f)/g;
  let cursor = 0;
  let frames = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (match.index !== cursor) {
      sdkFail("INVALID_ARTIFACT_PROP", `${name} 不是有效时间: ${source}`, { field: name });
    }
    cursor = pattern.lastIndex;
    const amount = Number(match[1]);
    const unit = match[2];
    frames += unit === "f" ? amount : unit === "s" ? amount * fps : amount * fps / 1000;
  }
  if (cursor !== source.length || cursor === 0) {
    sdkFail("INVALID_ARTIFACT_PROP", `${name} 不是有效时间: ${source}`, { field: name });
  }
  const rounded = Math.round(frames);
  return Object.freeze({ source, frames: rounded, seconds: rounded / fps });
}

function validateBoundValue(
  name: string,
  definition: AnyFieldDefinition,
  input: unknown,
  fps: number,
): unknown {
  if (definition.kind === "node") {
    if (input === undefined) {
      sdkFail("MISSING_ARTIFACT_PROP", `缺少必填字段 ${name}`, { field: name });
    }
    return input;
  }
  if (definition.kind === "number") {
    if (typeof input !== "number" || !Number.isFinite(input)) {
      sdkFail("INVALID_ARTIFACT_PROP", `${name} 必须是有限 number`, { field: name, value: input });
    }
    if (definition.integer && !Number.isInteger(input)) {
      sdkFail("INVALID_ARTIFACT_PROP", `${name} 必须是整数`, { field: name, value: input });
    }
    if (definition.min !== undefined && input < definition.min || definition.max !== undefined && input > definition.max) {
      sdkFail("INVALID_ARTIFACT_PROP", `${name} 超出 schema 范围`, { field: name, value: input });
    }
    return input;
  }
  if (definition.kind === "boolean") {
    if (typeof input !== "boolean") {
      sdkFail("INVALID_ARTIFACT_PROP", `${name} 必须是 boolean`, { field: name, value: input });
    }
    return input;
  }
  if (definition.kind === "time") {
    if (typeof input === "string") return parseTime(input, fps, name);
    if (
      typeof input === "object" &&
      input !== null &&
      typeof (input as TimeValue).source === "string" &&
      Number.isInteger((input as TimeValue).frames) &&
      typeof (input as TimeValue).seconds === "number"
    ) {
      return Object.freeze({ ...(input as TimeValue) });
    }
    sdkFail("INVALID_ARTIFACT_PROP", `${name} 必须是时间字符串或 TimeValue`, { field: name });
  }
  if (typeof input !== "string") {
    sdkFail("INVALID_ARTIFACT_PROP", `${name} 必须是 string`, { field: name, value: input });
  }
  if (definition.kind === "enum" && !definition.values?.includes(input)) {
    sdkFail("INVALID_ARTIFACT_PROP", `${name} 必须是 schema 枚举值`, { field: name, value: input });
  }
  if (definition.kind === "color" && !(
    /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(input) ||
    /^[a-zA-Z]+$/.test(input)
  )) {
    sdkFail("INVALID_ARTIFACT_PROP", `${name} 不是受支持的颜色`, { field: name, value: input });
  }
  if (definition.minLength !== undefined && input.length < definition.minLength || definition.maxLength !== undefined && input.length > definition.maxLength) {
    sdkFail("INVALID_ARTIFACT_PROP", `${name} 长度超出 schema 范围`, { field: name, value: input });
  }
  return input;
}

export function bindSchemaProps<Schema extends FieldsSchema>(
  schema: Schema,
  input: InferFieldInputs<Schema> | Readonly<Record<string, unknown>>,
  options: { fps: number },
): Readonly<InferFields<Schema>> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    sdkFail("INVALID_ARTIFACT_PROP", "props 必须是对象");
  }
  const unknown = Object.keys(input).filter((name) => !Object.hasOwn(schema, name));
  if (unknown.length > 0) {
    sdkFail("UNKNOWN_ARTIFACT_PROP", `存在 schema 未声明字段: ${unknown.join(", ")}`, { fields: unknown });
  }
  const result: Record<string, unknown> = {};
  for (const [name, definition] of Object.entries(schema)) {
    const hasValue = Object.hasOwn(input, name);
    if (!hasValue && !definition.hasDefault) {
      sdkFail("MISSING_ARTIFACT_PROP", `缺少必填字段 ${name}`, { field: name });
    }
    const value = hasValue
      ? (input as Readonly<Record<string, unknown>>)[name]
      : definition.defaultValue;
    result[name] = validateBoundValue(name, definition, value, options.fps);
  }
  return Object.freeze(result) as Readonly<InferFields<Schema>>;
}
