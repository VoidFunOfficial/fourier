import React, {
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
} from "react";
import { SdkError, sdkFail } from "./errors.ts";
import {
  useFourierContext,
  useFourierRenderDriver,
  type FourierRenderDriver,
  type FourierRenderFrame,
} from "./runtime.ts";

export type FourierShaderUniformType =
  | "float"
  | "int"
  | "bool"
  | "vec2"
  | "vec3"
  | "vec4"
  | "mat3"
  | "mat4";

export type FourierShaderVec2 = readonly [number, number];
export type FourierShaderVec3 = readonly [number, number, number];
export type FourierShaderVec4 = readonly [number, number, number, number];
export type FourierShaderMat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];
export type FourierShaderMat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export type FourierShaderUniformLayout = Readonly<
  Record<string, FourierShaderUniformType>
>;

type FourierShaderUniformValue<Type extends FourierShaderUniformType> =
  Type extends "float" ? number
    : Type extends "int" ? number
    : Type extends "bool" ? boolean
    : Type extends "vec2" ? FourierShaderVec2
    : Type extends "vec3" ? FourierShaderVec3
    : Type extends "vec4" ? FourierShaderVec4
    : Type extends "mat3" ? FourierShaderMat3
    : Type extends "mat4" ? FourierShaderMat4
    : never;

export type FourierShaderUniformValues<
  Layout extends FourierShaderUniformLayout,
> = Readonly<{
  [Name in keyof Layout]: FourierShaderUniformValue<Layout[Name]>;
}>;

export type FourierShaderBlendMode = "replace" | "alpha" | "additive";

interface FourierShaderDefinitionBase {
  /** Optional label included in compile/link failures. */
  readonly name?: string;
  /** Defaults to a WebGL2 full-screen triangle vertex shader. */
  readonly vertexShader?: string;
  readonly fragmentShader: string;
  /** Defaults to replacing the full canvas. */
  readonly blend?: FourierShaderBlendMode;
  /** Clear before drawing. Omit when the fragment shader covers the canvas. */
  readonly clearColor?: FourierShaderVec4;
}

export type FourierShaderDefinitionInput<
  Layout extends FourierShaderUniformLayout = Readonly<{}>,
> = FourierShaderDefinitionBase & Readonly<{ uniforms?: Layout }>;

export interface FourierShaderDefinition<
  Layout extends FourierShaderUniformLayout = FourierShaderUniformLayout,
> {
  readonly name?: string;
  readonly vertexShader: string;
  readonly fragmentShader: string;
  readonly uniforms: Layout;
  readonly blend: FourierShaderBlendMode;
  readonly clearColor?: FourierShaderVec4;
}

export interface FourierShaderFrame extends FourierRenderFrame {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
}

export interface FourierWebGLContext {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
}

export interface FourierWebGLFrame extends FourierWebGLContext, FourierRenderFrame {}

export type FourierWebGLCleanup = () => void;

export interface FourierWebGLCanvasProps {
  readonly onCreate?: (
    context: Readonly<FourierWebGLContext>,
  ) => void | FourierWebGLCleanup | Promise<void | FourierWebGLCleanup>;
  readonly onFrame: (frame: Readonly<FourierWebGLFrame>) => void;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ariaLabel?: string;
}

export type FourierShaderUniformSource<
  Layout extends FourierShaderUniformLayout,
> = FourierShaderUniformValues<Layout> | ((
  frame: Readonly<FourierShaderFrame>,
) => FourierShaderUniformValues<Layout>);

interface FourierShaderCanvasBaseProps<
  Layout extends FourierShaderUniformLayout,
> {
  readonly shader: FourierShaderDefinition<Layout>;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly ariaLabel?: string;
}

type FourierShaderUniformProps<
  Layout extends FourierShaderUniformLayout,
> = keyof Layout extends never
  ? { readonly uniforms?: FourierShaderUniformSource<Layout> }
  : { readonly uniforms: FourierShaderUniformSource<Layout> };

export type FourierShaderCanvasProps<
  Layout extends FourierShaderUniformLayout,
> = FourierShaderCanvasBaseProps<Layout> & FourierShaderUniformProps<Layout>;

export const FOURIER_FULLSCREEN_VERTEX_SHADER = `
  out vec2 vUv;

  void main() {
    vec2 position = vec2(
      gl_VertexID == 2 ? 3.0 : -1.0,
      gl_VertexID == 1 ? 3.0 : -1.0
    );
    vUv = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

/**
 * Composes GLSL snippets without changing whitespace or coercing arbitrary
 * objects. `defineFourierShader` adds the WebGL2 version and Fourier uniforms.
 */
export function glsl(source: string): string;
export function glsl(
  strings: TemplateStringsArray,
  ...values: readonly (string | number)[]
): string;
export function glsl(
  input: string | TemplateStringsArray,
  ...values: readonly (string | number)[]
): string {
  if (typeof input === "string") return input;
  let source = input[0] ?? "";
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (typeof value === "number" && !Number.isFinite(value)) {
      sdkFail("INVALID_FOURIER_SHADER", "GLSL 插值 number 必须是有限数", {
        index,
        value,
      });
    }
    source += String(value) + (input[index + 1] ?? "");
  }
  return source;
}

const uniformTypes = new Set<FourierShaderUniformType>([
  "float",
  "int",
  "bool",
  "vec2",
  "vec3",
  "vec4",
  "mat3",
  "mat4",
]);

function validateShaderSource(source: unknown, field: string): asserts source is string {
  if (typeof source !== "string" || source.trim().length === 0) {
    sdkFail("INVALID_FOURIER_SHADER", `Fourier shader ${field} 必须是非空 GLSL`, {
      field,
    });
  }
}

function validateUniformLayout(
  layout: unknown,
): asserts layout is FourierShaderUniformLayout {
  if (typeof layout !== "object" || layout === null || Array.isArray(layout)) {
    sdkFail("INVALID_FOURIER_SHADER", "Fourier shader uniforms 必须是字段对象");
  }
  for (const [name, type] of Object.entries(layout)) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      name.startsWith("gl_") ||
      name.startsWith("uFourier") ||
      name.includes("__")
    ) {
      sdkFail(
        "INVALID_FOURIER_SHADER",
        `Fourier shader uniform 名称非法或属于保留命名空间: ${name}`,
        { uniform: name },
      );
    }
    if (!uniformTypes.has(type as FourierShaderUniformType)) {
      sdkFail(
        "INVALID_FOURIER_SHADER",
        `Fourier shader uniform "${name}" 类型无效: ${String(type)}`,
        { uniform: name, type },
      );
    }
  }
}

export function defineFourierShader<
  const Layout extends FourierShaderUniformLayout = Readonly<{}>,
>(
  input: FourierShaderDefinitionBase & { readonly uniforms?: Layout },
): FourierShaderDefinition<Readonly<Layout>> {
  if (typeof input !== "object" || input === null) {
    sdkFail("INVALID_FOURIER_SHADER", "Fourier shader definition 必须是对象");
  }
  validateShaderSource(input.fragmentShader, "fragmentShader");
  if (input.vertexShader !== undefined) {
    validateShaderSource(input.vertexShader, "vertexShader");
  }
  if (input.name !== undefined && input.name.trim().length === 0) {
    sdkFail("INVALID_FOURIER_SHADER", "Fourier shader name 不能为空");
  }
  const uniforms = input.uniforms ?? {};
  validateUniformLayout(uniforms);
  const blend = input.blend ?? "replace";
  if (!["replace", "alpha", "additive"].includes(blend)) {
    sdkFail("INVALID_FOURIER_SHADER", `Fourier shader blend 无效: ${blend}`);
  }
  if (input.clearColor !== undefined) {
    finiteTuple(input.clearColor, 4, "clearColor");
  }
  return Object.freeze({
    ...(input.name === undefined ? {} : { name: input.name }),
    vertexShader: input.vertexShader ?? FOURIER_FULLSCREEN_VERTEX_SHADER,
    fragmentShader: input.fragmentShader,
    uniforms: Object.freeze({ ...uniforms }),
    blend,
    ...(input.clearColor === undefined
      ? {}
      : { clearColor: Object.freeze([...input.clearColor]) as FourierShaderVec4 }),
  }) as FourierShaderDefinition<Readonly<Layout>>;
}

const FOURIER_GLSL_HEADER = `
precision highp float;
precision highp int;

uniform vec2 uFourierResolution;
uniform float uFourierTime;
uniform float uFourierProgress;
uniform float uFourierDuration;
uniform float uFourierSeed;
`;

function shaderSource(source: string): string {
  const version = source.match(/^\s*#version[^\r\n]*(?:\r?\n|$)/);
  if (version === null) {
    return `#version 300 es\n${FOURIER_GLSL_HEADER}\n${source}`;
  }
  return `${version[0]}${FOURIER_GLSL_HEADER}\n${source.slice(version[0].length)}`;
}

type ShaderStage = "vertex" | "fragment";

function compileShader(
  gl: WebGL2RenderingContext,
  definition: FourierShaderDefinition,
  stage: ShaderStage,
  source: string,
): WebGLShader {
  const shader = gl.createShader(
    stage === "vertex" ? gl.VERTEX_SHADER : gl.FRAGMENT_SHADER,
  );
  if (shader === null) {
    throw new SdkError(
      "FOURIER_SHADER_RESOURCE_FAILED",
      `无法创建 ${stage} shader${definition.name === undefined ? "" : ` "${definition.name}"`}`,
      { stage },
    );
  }
  gl.shaderSource(shader, shaderSource(source));
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true) return shader;
  const log = gl.getShaderInfoLog(shader)?.trim() || "未知 GLSL 编译错误";
  gl.deleteShader(shader);
  throw new SdkError(
    "FOURIER_SHADER_COMPILE_FAILED",
    `${definition.name ?? "Fourier shader"} 的 ${stage} GLSL 编译失败: ${log}`,
    { stage, log },
  );
}

function linkProgram(
  gl: WebGL2RenderingContext,
  definition: FourierShaderDefinition,
): WebGLProgram {
  const vertex = compileShader(gl, definition, "vertex", definition.vertexShader);
  let fragment: WebGLShader | undefined;
  try {
    fragment = compileShader(gl, definition, "fragment", definition.fragmentShader);
    const program = gl.createProgram();
    if (program === null) {
      throw new SdkError(
        "FOURIER_SHADER_RESOURCE_FAILED",
        `无法创建 shader program${definition.name === undefined ? "" : ` "${definition.name}"`}`,
      );
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS) === true) return program;
    const log = gl.getProgramInfoLog(program)?.trim() || "未知 GLSL 链接错误";
    gl.deleteProgram(program);
    throw new SdkError(
      "FOURIER_SHADER_LINK_FAILED",
      `${definition.name ?? "Fourier shader"} 的 GLSL 链接失败: ${log}`,
      { log },
    );
  } finally {
    gl.deleteShader(vertex);
    if (fragment !== undefined) gl.deleteShader(fragment);
  }
}

/** Compiles and links a Fourier shader definition for an owned WebGL2 context. */
export function createFourierShaderProgram(
  gl: WebGL2RenderingContext,
  definition: FourierShaderDefinition,
): WebGLProgram {
  return linkProgram(gl, definition);
}

function finiteTuple(
  value: unknown,
  length: number,
  field: string,
): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    throw new SdkError(
      "INVALID_FOURIER_SHADER_UNIFORM",
      `Fourier shader ${field} 必须是 ${length} 个有限 number`,
      { field, length },
    );
  }
  return value as readonly number[];
}

function setUniform(
  gl: WebGL2RenderingContext,
  location: WebGLUniformLocation,
  name: string,
  type: FourierShaderUniformType,
  value: unknown,
): void {
  if (type === "bool") {
    if (typeof value !== "boolean") {
      throw new SdkError(
        "INVALID_FOURIER_SHADER_UNIFORM",
        `Fourier shader uniform "${name}" 必须是 boolean`,
        { uniform: name, type },
      );
    }
    gl.uniform1i(location, value ? 1 : 0);
    return;
  }
  if (type === "float" || type === "int") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (type === "int" && (!Number.isInteger(value) || value < -2_147_483_648 || value > 2_147_483_647))
    ) {
      throw new SdkError(
        "INVALID_FOURIER_SHADER_UNIFORM",
        `Fourier shader uniform "${name}" 必须是${type === "int" ? " 32-bit 整数" : "有限 number"}`,
        { uniform: name, type, value },
      );
    }
    if (type === "int") gl.uniform1i(location, value);
    else gl.uniform1f(location, value);
    return;
  }
  const length = type === "vec2" ? 2
    : type === "vec3" || type === "mat3" ? type === "vec3" ? 3 : 9
    : type === "vec4" ? 4
    : 16;
  const tuple = new Float32Array(finiteTuple(value, length, name));
  if (type === "vec2") gl.uniform2fv(location, tuple);
  else if (type === "vec3") gl.uniform3fv(location, tuple);
  else if (type === "vec4") gl.uniform4fv(location, tuple);
  else if (type === "mat3") gl.uniformMatrix3fv(location, false, tuple);
  else gl.uniformMatrix4fv(location, false, tuple);
}

function configureBlend(
  gl: WebGL2RenderingContext,
  blend: FourierShaderBlendMode,
): void {
  if (blend === "replace") {
    gl.disable(gl.BLEND);
    return;
  }
  gl.enable(gl.BLEND);
  if (blend === "additive") gl.blendFunc(gl.ONE, gl.ONE);
  else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

const builtinUniformNames = [
  "uFourierResolution",
  "uFourierTime",
  "uFourierProgress",
  "uFourierDuration",
  "uFourierSeed",
] as const;

type BuiltinUniformName = typeof builtinUniformNames[number];

interface FourierWebGLState {
  readonly gl: WebGL2RenderingContext;
  readonly program: WebGLProgram;
  readonly vertexArray: WebGLVertexArrayObject;
  readonly builtins: Readonly<Record<BuiltinUniformName, WebGLUniformLocation | null>>;
  readonly uniforms: Readonly<Record<string, WebGLUniformLocation | null>>;
}

function loseContext(gl: WebGL2RenderingContext): void {
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

/**
 * Low-level WebGL2 canvas for deterministic multi-pass renderers. Fourier owns
 * the canvas, output size, context lifetime, and absolute sampling clock.
 */
export function FourierWebGLCanvas(props: FourierWebGLCanvasProps): ReactElement {
  const { width, height, seed } = useFourierContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbacksRef = useRef({
    onCreate: props.onCreate,
    onFrame: props.onFrame,
  });
  callbacksRef.current = {
    onCreate: props.onCreate,
    onFrame: props.onFrame,
  };

  const driver = useMemo<FourierRenderDriver>(() => {
    let context: FourierWebGLContext | undefined;
    let cleanup: FourierWebGLCleanup | undefined;
    let readyPromise: Promise<void> | undefined;

    return {
      ready() {
        if (readyPromise !== undefined) return readyPromise;
        readyPromise = (async () => {
          const canvas = canvasRef.current;
          if (canvas === null) {
            throw new SdkError(
              "FOURIER_WEBGL_CANVAS_MISSING",
              "FourierWebGLCanvas 在初始化时找不到 canvas",
            );
          }
          const gl = canvas.getContext("webgl2", {
            alpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
            powerPreference: "high-performance",
          });
          if (gl === null) {
            throw new SdkError(
              "FOURIER_WEBGL2_UNAVAILABLE",
              "当前渲染环境不支持 FourierWebGLCanvas 所需的 WebGL2",
            );
          }
          context = Object.freeze({ canvas, gl, width, height, seed });
          try {
            const result = await callbacksRef.current.onCreate?.(context);
            if (typeof result === "function") cleanup = result;
          } catch (error) {
            loseContext(gl);
            context = undefined;
            throw error;
          }
        })();
        return readyPromise;
      },
      render(frame) {
        if (context === undefined) {
          throw new SdkError(
            "FOURIER_RENDER_DRIVER_NOT_READY",
            "FourierWebGLCanvas 尚未完成初始化",
          );
        }
        const result: unknown = callbacksRef.current.onFrame(Object.freeze({
          ...context,
          ...frame,
          seed,
        }));
        if (
          typeof result === "object" &&
          result !== null &&
          "then" in result &&
          typeof (result as { then?: unknown }).then === "function"
        ) {
          throw new SdkError(
            "FOURIER_RENDER_FRAME_ASYNC",
            "FourierWebGLCanvas.onFrame 必须同步返回",
          );
        }
      },
      dispose() {
        cleanup?.();
        if (context !== undefined) loseContext(context.gl);
        context = undefined;
      },
    };
  }, [height, seed, width]);

  useFourierRenderDriver(driver);

  return React.createElement("canvas", {
    ref: canvasRef,
    className: props.className,
    "aria-label": props.ariaLabel,
    width,
    height,
    style: {
      display: "block",
      width,
      height,
      ...props.style,
    },
  });
}

/**
 * Full-screen WebGL2 shader canvas sampled only by Fourier's absolute clock.
 * It owns program compilation, built-in uniforms, drawing, and GPU cleanup.
 */
export function FourierShaderCanvas<
  const Layout extends FourierShaderUniformLayout,
>(props: FourierShaderCanvasProps<Layout>): ReactElement {
  const { width, height, seed } = useFourierContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uniformsRef = useRef(props.uniforms);
  uniformsRef.current = props.uniforms;
  const configRef = useRef({
    shader: props.shader,
  });

  const driver = useMemo<FourierRenderDriver>(() => {
    let state: FourierWebGLState | undefined;

    return {
      ready() {
        const canvas = canvasRef.current;
        if (canvas === null) {
          throw new SdkError(
            "FOURIER_SHADER_CANVAS_MISSING",
            "FourierShaderCanvas 在初始化时找不到 canvas",
          );
        }
        const gl = canvas.getContext("webgl2", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        });
        if (gl === null) {
          throw new SdkError(
            "FOURIER_WEBGL2_UNAVAILABLE",
            "当前渲染环境不支持 FourierShaderCanvas 所需的 WebGL2",
          );
        }
        try {
          const shader = configRef.current.shader;
          const program = linkProgram(gl, shader);
          const vertexArray = gl.createVertexArray();
          if (vertexArray === null) {
            gl.deleteProgram(program);
            throw new SdkError(
              "FOURIER_SHADER_RESOURCE_FAILED",
              "无法创建全屏 shader vertex array",
            );
          }
          const builtins = Object.freeze(Object.fromEntries(
            builtinUniformNames.map((name) => [name, gl.getUniformLocation(program, name)]),
          )) as Readonly<Record<BuiltinUniformName, WebGLUniformLocation | null>>;
          const uniforms = Object.freeze(Object.fromEntries(
            Object.keys(shader.uniforms).map((name) => [
              name,
              gl.getUniformLocation(program, name),
            ]),
          ));
          state = Object.freeze({ gl, program, vertexArray, builtins, uniforms });
        } catch (error) {
          loseContext(gl);
          throw error;
        }
      },
      render(frame) {
        if (state === undefined) {
          throw new SdkError(
            "FOURIER_RENDER_DRIVER_NOT_READY",
            "FourierShaderCanvas 尚未完成初始化",
          );
        }
        const { gl, program, vertexArray, builtins, uniforms } = state;
        const shader = configRef.current.shader;
        gl.viewport(0, 0, width, height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.SCISSOR_TEST);
        configureBlend(gl, shader.blend);
        if (shader.clearColor !== undefined) {
          gl.clearColor(...shader.clearColor);
          gl.clear(gl.COLOR_BUFFER_BIT);
        }
        gl.useProgram(program);
        gl.bindVertexArray(vertexArray);
        const durationSeconds = frame.durationMilliseconds / 1_000;
        if (builtins.uFourierResolution !== null) {
          gl.uniform2f(builtins.uFourierResolution, width, height);
        }
        if (builtins.uFourierTime !== null) {
          gl.uniform1f(builtins.uFourierTime, frame.timeSeconds);
        }
        if (builtins.uFourierProgress !== null) {
          gl.uniform1f(builtins.uFourierProgress, frame.progress);
        }
        if (builtins.uFourierDuration !== null) {
          gl.uniform1f(builtins.uFourierDuration, durationSeconds);
        }
        if (builtins.uFourierSeed !== null) {
          gl.uniform1f(builtins.uFourierSeed, seed);
        }

        const source = uniformsRef.current;
        const values = typeof source === "function"
          ? source(Object.freeze({ ...frame, width, height, seed }))
          : source;
        if (
          typeof values === "object" &&
          values !== null &&
          "then" in values &&
          typeof (values as { then?: unknown }).then === "function"
        ) {
          throw new SdkError(
            "FOURIER_SHADER_UNIFORMS_ASYNC",
            "FourierShaderCanvas uniforms 必须同步返回",
          );
        }
        for (const [name, type] of Object.entries(shader.uniforms)) {
          if (values === undefined || !Object.hasOwn(values, name)) {
            throw new SdkError(
              "INVALID_FOURIER_SHADER_UNIFORM",
              `Fourier shader 缺少 uniform "${name}"`,
              { uniform: name, type },
            );
          }
          const location = uniforms[name];
          if (location !== null && location !== undefined) {
            setUniform(
              gl,
              location,
              name,
              type,
              (values as Readonly<Record<string, unknown>>)[name],
            );
          }
        }
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
      },
      dispose() {
        if (state === undefined) return;
        state.gl.deleteVertexArray(state.vertexArray);
        state.gl.deleteProgram(state.program);
        loseContext(state.gl);
        state = undefined;
      },
    };
  }, [height, seed, width]);

  useFourierRenderDriver(driver);

  return React.createElement("canvas", {
    ref: canvasRef,
    className: props.className,
    "aria-label": props.ariaLabel,
    width,
    height,
    style: {
      display: "block",
      width,
      height,
      ...props.style,
    },
  });
}
