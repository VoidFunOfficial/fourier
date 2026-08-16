import { realpath, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

export const WORLD_COMPONENT_TYPES = [
  "card",
  "motion",
  "graphic",
  "scene-template",
  "other",
] as const;

export const WORLD_STYLES = [
  "minimal",
  "corporate",
  "editorial",
  "cinematic",
  "futuristic",
  "playful",
  "brutalist",
  "elegant",
  "social",
  "hand-drawn",
] as const;

export const WORLD_MOODS = [
  "restrained",
  "serious",
  "energetic",
  "warm",
  "playful",
  "tense",
  "futuristic",
] as const;

export const WORLD_LANGUAGES = ["en", "zh-CN", "zh-TW", "ja", "ko"] as const;

export type WorldComponentType = (typeof WORLD_COMPONENT_TYPES)[number];
export type WorldStyle = (typeof WORLD_STYLES)[number];
export type WorldMood = (typeof WORLD_MOODS)[number];
export type WorldLanguage = (typeof WORLD_LANGUAGES)[number];

export interface FourierWorldManifest {
  readonly entry: string;
  readonly type: WorldComponentType;
  readonly subtype?: string;
  readonly summary: string;
  readonly instruction: string;
  readonly useCases: readonly string[];
  readonly negativeUseCases?: readonly string[];
  readonly aliases?: readonly string[];
  readonly tags: readonly string[];
  readonly style: readonly WorldStyle[];
  readonly contentDomains?: readonly string[];
  readonly mood?: readonly WorldMood[];
  readonly languages?: readonly WorldLanguage[];
}

export interface FourierWorldPackageJson {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: "MIT";
  readonly files: readonly string[];
  readonly fourier: FourierWorldManifest;
}

export interface LoadedWorldPackage {
  readonly packagePath: string;
  readonly rootDirectory: string;
  readonly entryPath: string;
  readonly namespace: string;
  readonly componentName: string;
  readonly manifest: FourierWorldPackageJson;
}

export class WorldManifestError extends TypeError {
  readonly issues: readonly string[];

  constructor(packagePath: string, issues: readonly string[]) {
    super(`无效的 Fourier World package.json (${packagePath}):\n- ${issues.join("\n- ")}`);
    this.name = "WorldManifestError";
    this.issues = Object.freeze([...issues]);
  }
}

export function parseWorldPackageName(value: string): {
  readonly namespace: string;
  readonly componentName: string;
} {
  const match = /^(@[a-z][a-z0-9_-]{1,30})\/([A-Za-z][A-Za-z0-9_-]*)$/.exec(value);
  if (match === null) {
    throw new TypeError("包名必须是 @namespace/ComponentName");
  }
  return Object.freeze({ namespace: match[1]!, componentName: match[2]! });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requiredString(
  source: Record<string, unknown>,
  key: string,
  issues: string[],
  label = key,
): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${label} 必须是非空字符串`);
    return "";
  }
  return value.trim();
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  issues: string[],
  label: string,
): string | undefined {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(`${label} 必须是非空字符串`);
    return undefined;
  }
  return value.trim();
}

function stringArray(
  value: unknown,
  label: string,
  issues: string[],
  required: boolean,
): string[] | undefined {
  if (value === undefined && !required) return undefined;
  if (!Array.isArray(value) || (required && value.length === 0)) {
    issues.push(`${label} 必须是${required ? "非空" : ""}字符串数组`);
    return undefined;
  }
  const entries: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (typeof item !== "string" || item.trim().length === 0) {
      issues.push(`${label}[${index}] 必须是非空字符串`);
    } else {
      entries.push(item.trim());
    }
  }
  return entries;
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  options: T,
  label: string,
  issues: string[],
): T[number] {
  if (typeof value !== "string" || !options.includes(value)) {
    issues.push(`${label} 必须是 ${options.join("、")} 之一`);
    return options[0]!;
  }
  return value as T[number];
}

function enumArray<const T extends readonly string[]>(
  value: unknown,
  options: T,
  label: string,
  issues: string[],
  required: boolean,
): T[number][] | undefined {
  const entries = stringArray(value, label, issues, required);
  if (entries === undefined) return undefined;
  for (const entry of entries) {
    if (!options.includes(entry)) {
      issues.push(`${label} 包含无效值 ${JSON.stringify(entry)}；可选值: ${options.join("、")}`);
    }
  }
  return entries.filter((entry): entry is T[number] => options.includes(entry));
}

function packageJsonPath(inputPath: string): string {
  const absolute = resolve(inputPath);
  return basename(absolute) === "package.json" ? absolute : resolve(absolute, "package.json");
}

function isInside(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path.length === 0 || (!path.startsWith("..") && !isAbsolute(path));
}

export async function loadWorldPackage(inputPath = process.cwd()): Promise<LoadedWorldPackage> {
  const packagePath = packageJsonPath(inputPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await Bun.file(packagePath).text());
  } catch (error) {
    if (!(await Bun.file(packagePath).exists())) {
      throw new WorldManifestError(packagePath, ["publish 目录必须包含 package.json"]);
    }
    throw new WorldManifestError(packagePath, [
      `JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  const issues: string[] = [];
  const root = record(parsed);
  if (root === undefined) {
    throw new WorldManifestError(packagePath, ["根值必须是 JSON 对象"]);
  }

  const name = requiredString(root, "name", issues);
  let packageIdentity: ReturnType<typeof parseWorldPackageName> | undefined;
  if (name) {
    try {
      packageIdentity = parseWorldPackageName(name);
    } catch {
      issues.push("name 必须是 @namespace/ComponentName；namespace 使用小写字母、数字、_ 或 -，组件名必须以英文字母开头");
    }
  }
  const version = requiredString(root, "version", issues);
  if (version && !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    issues.push("version 必须是 semver，例如 1.0.0 或 1.0.0-beta.1");
  }
  const description = requiredString(root, "description", issues);
  const license = requiredString(root, "license", issues);
  if (license && license !== "MIT") issues.push("license 当前只支持 MIT");
  const files = stringArray(root.files, "files", issues, true) ?? [];
  for (const [index, path] of files.entries()) {
    const segments = path.replaceAll("\\", "/").split("/");
    if (
      isAbsolute(path) ||
      path.includes("\\") ||
      segments.includes("..") ||
      segments.includes("") ||
      /[*?{}\[\]!]/.test(path)
    ) {
      issues.push(`files[${index}] 必须是 package 目录内不含 glob 的相对文件或目录路径`);
    }
    if (segments.some((segment) => segment === ".git" || segment === "node_modules")) {
      issues.push(`files[${index}] 不能包含 .git 或 node_modules`);
    }
  }

  const fourier = record(root.fourier);
  if (fourier === undefined) issues.push("fourier 必须是对象");
  const metadata = fourier ?? {};
  const entry = requiredString(metadata, "entry", issues, "fourier.entry");
  if (entry && isAbsolute(entry)) issues.push("fourier.entry 必须是相对 package.json 的路径");
  const type = enumValue(metadata.type, WORLD_COMPONENT_TYPES, "fourier.type", issues);
  const subtype = optionalString(metadata, "subtype", issues, "fourier.subtype");
  if (subtype !== undefined && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(subtype)) {
    issues.push("fourier.subtype 只能包含英文字母、数字、_ 和 -，且必须以英文字母开头");
  }
  const summary = requiredString(metadata, "summary", issues, "fourier.summary");
  if (summary.length > 180) issues.push("fourier.summary 不能超过 180 个字符");
  const instruction = requiredString(metadata, "instruction", issues, "fourier.instruction");
  const useCases = stringArray(metadata.useCases, "fourier.useCases", issues, true) ?? [];
  const negativeUseCases = stringArray(metadata.negativeUseCases, "fourier.negativeUseCases", issues, false);
  const aliases = stringArray(metadata.aliases, "fourier.aliases", issues, false);
  const tags = stringArray(metadata.tags, "fourier.tags", issues, true) ?? [];
  const style = enumArray(metadata.style, WORLD_STYLES, "fourier.style", issues, true) ?? [];
  if (style.length > 3) issues.push("fourier.style 必须包含 1—3 项");
  const contentDomains = stringArray(metadata.contentDomains, "fourier.contentDomains", issues, false);
  const mood = enumArray(metadata.mood, WORLD_MOODS, "fourier.mood", issues, false);
  const languages = enumArray(metadata.languages, WORLD_LANGUAGES, "fourier.languages", issues, false);

  const rootDirectory = dirname(packagePath);
  const entryPath = resolve(rootDirectory, entry);
  if (entry && !isInside(rootDirectory, entryPath)) {
    issues.push("fourier.entry 不能指向 package.json 目录之外");
  } else if (entry) {
    try {
      const [rootRealPath, entryRealPath, entryStat] = await Promise.all([
        realpath(rootDirectory),
        realpath(entryPath),
        stat(entryPath),
      ]);
      if (!isInside(rootRealPath, entryRealPath)) issues.push("fourier.entry 不能通过符号链接指向 package.json 目录之外");
      if (!entryStat.isFile()) issues.push("fourier.entry 必须指向文件");
    } catch {
      issues.push(`fourier.entry 文件不存在: ${entry}`);
    }
  }

  if (issues.length > 0 || packageIdentity === undefined) {
    throw new WorldManifestError(packagePath, issues);
  }

  const worldManifest: FourierWorldManifest = Object.freeze({
    entry,
    type,
    ...(subtype === undefined ? {} : { subtype }),
    summary,
    instruction,
    useCases: Object.freeze(useCases),
    ...(negativeUseCases === undefined ? {} : { negativeUseCases: Object.freeze(negativeUseCases) }),
    ...(aliases === undefined ? {} : { aliases: Object.freeze(aliases) }),
    tags: Object.freeze(tags),
    style: Object.freeze(style),
    ...(contentDomains === undefined ? {} : { contentDomains: Object.freeze(contentDomains) }),
    ...(mood === undefined ? {} : { mood: Object.freeze(mood) }),
    ...(languages === undefined ? {} : { languages: Object.freeze(languages) }),
  });
  const manifest: FourierWorldPackageJson = Object.freeze({
    name,
    version,
    description,
    license: "MIT",
    files: Object.freeze(files),
    fourier: worldManifest,
  });

  return Object.freeze({
    packagePath,
    rootDirectory,
    entryPath,
    namespace: packageIdentity.namespace,
    componentName: packageIdentity.componentName,
    manifest,
  });
}
