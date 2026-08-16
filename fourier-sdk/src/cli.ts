#!/usr/bin/env bun
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { searchFourierWorld } from "./search.ts";
import { DEFAULT_FOURIER_WORLD_URL, FourierWorldClient, normalizeWorldUrl } from "./world-client.ts";
import {
  WORLD_COMPONENT_TYPES,
  WORLD_LANGUAGES,
  WORLD_MOODS,
  WORLD_STYLES,
  type WorldComponentType,
  type WorldLanguage,
  type WorldMood,
  type WorldStyle,
} from "./world-manifest.ts";
import {
  readWorldCredentials,
  removeWorldCredentials,
  saveWorldCredentials,
} from "./world-credentials.ts";
import { prepareWorldPackage } from "./world-publish.ts";
import { addWorldComponent, deleteWorldComponent } from "./world-project.ts";
import { defaultPreviewSourcePath, startPreviewServer } from "./preview.ts";

const HELP = `Fourier React/Motion SDK

用法:
  fourier-sdk preview [artifact.tsx|directory] [--host <host>] [--port <port>] [--open] [--no-watch]
  fourier-sdk login [--world <url>] [--email <email>] [--password-stdin]
  fourier-sdk whoami [--world <url>]
  fourier-sdk logout
  fourier-sdk search <自然语言描述> [--type <type>] [--style <style>] [--limit <n>] [--json] [--world <url>]
  fourier-sdk publish [directory|package.json] [--world <url>] [--dry-run]
  fourier-sdk add <@namespace/ComponentName> [--project <dir>] [--dir <dir>] [--world <url>] [--force]
  fourier-sdk del <@namespace/ComponentName> [--project <dir>] [--purge]

publish 目录必须包含 package.json；组件元数据从 package.json 的 fourier 字段读取。
发布会先编译并校验 artifact，再提交到 Fourier World 的 review 状态。
preview 不传入口时会加载 SDK example 目录中的全部组件。
search 使用 Fourier World 的关键词 + 语义混合检索；无需登录，--json 适合 Agent 调用。
默认 World: ${DEFAULT_FOURIER_WORLD_URL}`;

export interface PreviewInvocation {
  readonly command: "preview";
  readonly entryPath: string;
  readonly hostname: string;
  readonly port: number;
  readonly open: boolean;
  readonly watch: boolean;
}

export interface LoginInvocation {
  readonly command: "login";
  readonly worldUrl?: string;
  readonly email?: string;
  readonly passwordStdin: boolean;
}

export interface WhoamiInvocation {
  readonly command: "whoami";
  readonly worldUrl?: string;
}

export interface LogoutInvocation {
  readonly command: "logout";
}

export interface SearchInvocation {
  readonly command: "search";
  readonly query: string;
  readonly worldUrl?: string;
  readonly type?: WorldComponentType;
  readonly styles: readonly WorldStyle[];
  readonly contentDomains: readonly string[];
  readonly moods: readonly WorldMood[];
  readonly languages: readonly WorldLanguage[];
  readonly author?: string;
  readonly page: number;
  readonly limit: number;
  readonly sessionId?: string;
  readonly json: boolean;
}

export interface PublishInvocation {
  readonly command: "publish";
  readonly inputPath: string;
  readonly worldUrl?: string;
  readonly dryRun: boolean;
}

export interface AddInvocation {
  readonly command: "add";
  readonly packageName: string;
  readonly projectDirectory: string;
  readonly componentsDirectory: string;
  readonly worldUrl?: string;
  readonly force: boolean;
}

export interface DeleteInvocation {
  readonly command: "del";
  readonly packageName: string;
  readonly projectDirectory: string;
  readonly purge: boolean;
}

export type CliInvocation =
  | PreviewInvocation
  | LoginInvocation
  | WhoamiInvocation
  | LogoutInvocation
  | SearchInvocation
  | PublishInvocation
  | AddInvocation
  | DeleteInvocation
  | { readonly command: "help" };

function optionValue(argv: readonly string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith("-")) {
    throw new TypeError(`${option} 缺少值`);
  }
  return value;
}

function parsePreview(argv: readonly string[]): PreviewInvocation {
  let entryPath = defaultPreviewSourcePath();
  let hasEntryPath = false;
  let hostname = "127.0.0.1";
  let port = 3211;
  let open = false;
  let watch = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--host") {
      hostname = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--port") {
      port = Number(optionValue(argv, index, arg));
      index += 1;
      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new TypeError("--port 必须是 0—65535 的整数");
      }
    } else if (arg === "--open") {
      open = true;
    } else if (arg === "--no-watch") {
      watch = false;
    } else if (arg.startsWith("-")) {
      throw new TypeError(`未知参数: ${arg}`);
    } else if (!hasEntryPath) {
      entryPath = resolve(arg);
      hasEntryPath = true;
    } else {
      throw new TypeError(`多余位置参数: ${arg}`);
    }
  }
  return { command: "preview", entryPath, hostname, port, open, watch };
}

function parseLogin(argv: readonly string[]): LoginInvocation {
  let worldUrl: string | undefined;
  let email: string | undefined;
  let passwordStdin = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--world") {
      worldUrl = normalizeWorldUrl(optionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--email") {
      email = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--password-stdin") {
      passwordStdin = true;
    } else {
      throw new TypeError(arg.startsWith("-") ? `未知参数: ${arg}` : `多余位置参数: ${arg}`);
    }
  }
  return {
    command: "login",
    ...(worldUrl === undefined ? {} : { worldUrl }),
    ...(email === undefined ? {} : { email }),
    passwordStdin,
  };
}

function parseWhoami(argv: readonly string[]): WhoamiInvocation {
  let worldUrl: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--world") {
      worldUrl = normalizeWorldUrl(optionValue(argv, index, arg));
      index += 1;
    } else {
      throw new TypeError(arg.startsWith("-") ? `未知参数: ${arg}` : `多余位置参数: ${arg}`);
    }
  }
  return { command: "whoami", ...(worldUrl === undefined ? {} : { worldUrl }) };
}

function enumOption<T extends string>(
  value: string,
  allowed: readonly T[],
  option: string,
): T {
  if (!allowed.includes(value as T)) {
    throw new TypeError(`${option} 必须是 ${allowed.join("、")}`);
  }
  return value as T;
}

function integerOption(value: string, option: string, maximum?: number): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || (maximum !== undefined && number > maximum)) {
    throw new TypeError(`${option} 必须是 1—${maximum ?? "∞"} 的整数`);
  }
  return number;
}

function parseSearch(argv: readonly string[]): SearchInvocation {
  const queryParts: string[] = [];
  let worldUrl: string | undefined;
  let type: WorldComponentType | undefined;
  const styles: WorldStyle[] = [];
  const contentDomains: string[] = [];
  const moods: WorldMood[] = [];
  const languages: WorldLanguage[] = [];
  let author: string | undefined;
  let page = 1;
  let limit = 12;
  let sessionId: string | undefined;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--world") {
      worldUrl = normalizeWorldUrl(optionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--type") {
      type = enumOption(optionValue(argv, index, arg), WORLD_COMPONENT_TYPES, arg);
      index += 1;
    } else if (arg === "--style") {
      styles.push(enumOption(optionValue(argv, index, arg), WORLD_STYLES, arg));
      index += 1;
    } else if (arg === "--domain") {
      contentDomains.push(optionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--mood") {
      moods.push(enumOption(optionValue(argv, index, arg), WORLD_MOODS, arg));
      index += 1;
    } else if (arg === "--language") {
      languages.push(enumOption(optionValue(argv, index, arg), WORLD_LANGUAGES, arg));
      index += 1;
    } else if (arg === "--author") {
      author = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--page") {
      page = integerOption(optionValue(argv, index, arg), arg);
      index += 1;
    } else if (arg === "--limit") {
      limit = integerOption(optionValue(argv, index, arg), arg, 48);
      index += 1;
    } else if (arg === "--session") {
      sessionId = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--json") {
      json = true;
    } else if (arg.startsWith("-")) {
      throw new TypeError(`未知参数: ${arg}`);
    } else {
      queryParts.push(arg);
    }
  }
  const query = queryParts.join(" ").trim();
  if (query.length === 0) throw new TypeError("search 缺少自然语言描述");
  return {
    command: "search",
    query,
    ...(worldUrl === undefined ? {} : { worldUrl }),
    ...(type === undefined ? {} : { type }),
    styles: Object.freeze([...new Set(styles)]),
    contentDomains: Object.freeze([...new Set(contentDomains)]),
    moods: Object.freeze([...new Set(moods)]),
    languages: Object.freeze([...new Set(languages)]),
    ...(author === undefined ? {} : { author }),
    page,
    limit,
    ...(sessionId === undefined ? {} : { sessionId }),
    json,
  };
}

function parsePublish(argv: readonly string[]): PublishInvocation {
  let inputPath = process.cwd();
  let hasInput = false;
  let worldUrl: string | undefined;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--world") {
      worldUrl = normalizeWorldUrl(optionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg.startsWith("-")) {
      throw new TypeError(`未知参数: ${arg}`);
    } else if (!hasInput) {
      inputPath = resolve(arg);
      hasInput = true;
    } else {
      throw new TypeError(`多余位置参数: ${arg}`);
    }
  }
  return {
    command: "publish",
    inputPath,
    ...(worldUrl === undefined ? {} : { worldUrl }),
    dryRun,
  };
}

function parseAdd(argv: readonly string[]): AddInvocation {
  let packageName: string | undefined;
  let projectDirectory = process.cwd();
  let componentsDirectory = "components";
  let worldUrl: string | undefined;
  let force = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--project") {
      projectDirectory = resolve(optionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--dir") {
      componentsDirectory = optionValue(argv, index, arg);
      index += 1;
    } else if (arg === "--world") {
      worldUrl = normalizeWorldUrl(optionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (arg.startsWith("-")) {
      throw new TypeError(`未知参数: ${arg}`);
    } else if (packageName === undefined) {
      packageName = arg;
    } else {
      throw new TypeError(`多余位置参数: ${arg}`);
    }
  }
  if (packageName === undefined) throw new TypeError("add 缺少 @namespace/ComponentName");
  return {
    command: "add",
    packageName,
    projectDirectory,
    componentsDirectory,
    ...(worldUrl === undefined ? {} : { worldUrl }),
    force,
  };
}

function parseDelete(argv: readonly string[]): DeleteInvocation {
  let packageName: string | undefined;
  let projectDirectory = process.cwd();
  let purge = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--project") {
      projectDirectory = resolve(optionValue(argv, index, arg));
      index += 1;
    } else if (arg === "--purge") {
      purge = true;
    } else if (arg.startsWith("-")) {
      throw new TypeError(`未知参数: ${arg}`);
    } else if (packageName === undefined) {
      packageName = arg;
    } else {
      throw new TypeError(`多余位置参数: ${arg}`);
    }
  }
  if (packageName === undefined) throw new TypeError("del 缺少 @namespace/ComponentName");
  return { command: "del", packageName, projectDirectory, purge };
}

export function parseCliInvocation(argv: readonly string[]): CliInvocation {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return { command: "help" };
  const [command, ...rest] = argv;
  if (command === "preview") return parsePreview(rest);
  if (command === "login") return parseLogin(rest);
  if (command === "whoami") return parseWhoami(rest);
  if (command === "logout") {
    if (rest.length > 0) throw new TypeError(`logout 不接受参数: ${rest.join(" ")}`);
    return { command: "logout" };
  }
  if (command === "search") return parseSearch(rest);
  if (command === "publish") return parsePublish(rest);
  if (command === "add") return parseAdd(rest);
  if (command === "del" || command === "remove") return parseDelete(rest);
  throw new TypeError(`未知命令: ${command ?? ""}`);
}

async function openBrowser(url: string): Promise<void> {
  const command = process.platform === "darwin"
    ? ["open", url]
    : process.platform === "win32"
      ? ["cmd", "/c", "start", "", url]
      : ["xdg-open", url];
  const child = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
  await child.exited;
}

async function promptLine(label: string): Promise<string> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await readline.question(label)).trim();
  } finally {
    readline.close();
  }
}

async function promptPassword(label: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.stdin.setRawMode === undefined) {
    throw new TypeError("非交互终端请使用 --password-stdin");
  }
  return new Promise<string>((resolvePassword, reject) => {
    const input = process.stdin;
    const output = process.stdout;
    const wasRaw = input.isRaw;
    let password = "";
    const finish = (error?: Error) => {
      input.off("data", onData);
      input.setRawMode(wasRaw);
      input.pause();
      output.write("\n");
      if (error) reject(error);
      else resolvePassword(password);
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === "\u0003") {
          finish(new Error("已取消登录"));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          password = password.slice(0, -1);
        } else {
          password += character;
        }
      }
    };
    output.write(label);
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

async function passwordFromStdin(): Promise<string> {
  const value = (await Bun.stdin.text()).replace(/\r?\n$/, "");
  if (value.length === 0) throw new TypeError("stdin 中的密码为空");
  return value;
}

async function session(explicitWorldUrl?: string): Promise<{ worldUrl: string; token: string }> {
  const stored = await readWorldCredentials();
  const worldUrl = normalizeWorldUrl(
    explicitWorldUrl ?? process.env.FOURIER_WORLD_URL ?? stored?.worldUrl ?? DEFAULT_FOURIER_WORLD_URL,
  );
  const environmentToken = process.env.FOURIER_WORLD_TOKEN?.trim();
  if (environmentToken) return { worldUrl, token: environmentToken };
  if (stored === undefined) throw new TypeError("尚未登录 Fourier World，请先运行 fourier-sdk login");
  if (stored.worldUrl !== worldUrl) {
    throw new TypeError(`当前凭据属于 ${stored.worldUrl}，请针对 ${worldUrl} 重新运行 fourier-sdk login`);
  }
  if (stored.expiresAt !== undefined && stored.expiresAt * 1000 <= Date.now()) {
    throw new TypeError("Fourier World 登录已过期，请重新运行 fourier-sdk login");
  }
  return { worldUrl, token: stored.token };
}

async function runPreview(invocation: PreviewInvocation): Promise<never> {
  const handle = await startPreviewServer({
    entryPath: invocation.entryPath,
    hostname: invocation.hostname,
    port: invocation.port,
    watch: invocation.watch,
  });
  console.log(`Fourier SDK preview: ${handle.url}`);
  if (invocation.open) void openBrowser(handle.url);
  const stop = async (): Promise<void> => {
    await handle.stop();
    process.exit(0);
  };
  process.once("SIGINT", () => void stop());
  process.once("SIGTERM", () => void stop());
  return await new Promise<never>(() => {});
}

async function runLogin(invocation: LoginInvocation): Promise<void> {
  const worldUrl = normalizeWorldUrl(
    invocation.worldUrl ?? process.env.FOURIER_WORLD_URL ?? DEFAULT_FOURIER_WORLD_URL,
  );
  const email = invocation.email ?? await promptLine("Fourier World 邮箱: ");
  if (email.length === 0) throw new TypeError("邮箱不能为空");
  const password = invocation.passwordStdin
    ? await passwordFromStdin()
    : await promptPassword("Fourier World 密码: ");
  const login = await new FourierWorldClient({ worldUrl }).login(email, password);
  const path = await saveWorldCredentials(worldUrl, login);
  console.log(`✓ 已登录 ${worldUrl}`);
  console.log(`  ${login.user.name} <${login.user.email}> · ${login.user.role}`);
  console.log(`  凭据已安全保存到 ${path}`);
}

async function runWhoami(invocation: WhoamiInvocation): Promise<void> {
  const active = await session(invocation.worldUrl);
  const user = await new FourierWorldClient(active).currentUser();
  console.log(`${user.name} <${user.email}> · ${user.role}`);
  console.log(active.worldUrl);
}

async function runSearch(invocation: SearchInvocation): Promise<void> {
  const worldUrl = normalizeWorldUrl(
    invocation.worldUrl ?? process.env.FOURIER_WORLD_URL ?? DEFAULT_FOURIER_WORLD_URL,
  );
  const result = await searchFourierWorld(invocation.query, {
    worldUrl,
    ...(invocation.type === undefined ? {} : { type: invocation.type }),
    styles: invocation.styles,
    contentDomains: invocation.contentDomains,
    moods: invocation.moods,
    languages: invocation.languages,
    ...(invocation.author === undefined ? {} : { author: invocation.author }),
    page: invocation.page,
    limit: invocation.limit,
    ...(invocation.sessionId === undefined ? {} : { sessionId: invocation.sessionId }),
  });
  if (invocation.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`${result.total} 个匹配 · ${result.latencyMs} ms`);
  for (const [index, item] of result.results.entries()) {
    console.log(`${index + 1}. ${item.packageName}@${item.version} · ${(item.match.score * 100).toFixed(1)}%`);
    console.log(`   ${item.summary}`);
    console.log(`   ${item.match.reasons.join("；")}`);
    console.log(item.downloadable ? `   fourier-sdk add ${item.packageName}` : "   当前版本暂不可下载");
  }
}

async function runPublish(invocation: PublishInvocation): Promise<void> {
  const prepared = await prepareWorldPackage(invocation.inputPath);
  const packageName = prepared.componentPackage.manifest.name;
  console.log(`✓ package.json: ${packageName}@${prepared.componentPackage.manifest.version}`);
  console.log(`✓ artifact: ${prepared.artifact.kind} · ABI v${prepared.artifact.sdkAbiVersion} · ${prepared.artifact.renderer}`);
  console.log(`✓ preview: ${prepared.preview.width}×${prepared.preview.height} · ${prepared.preview.durationSeconds.toFixed(2)}s · ${(prepared.preview.bytes.byteLength / 1024 / 1024).toFixed(2)} MiB`);
  if (invocation.dryRun) {
    console.log("✓ dry-run 完成；未向 Fourier World 写入数据");
    return;
  }
  const active = await session(invocation.worldUrl);
  const result = await new FourierWorldClient(active).publish(
    prepared.componentPackage,
    prepared.archive,
    prepared.preview,
  );
  console.log(`✓ ${result.created ? "已创建" : "已更新"} ${packageName}@${result.component.version}`);
  console.log(`  状态: ${result.component.status}（等待 Fourier World 审核）`);
  console.log(`  ${active.worldUrl}/components/${result.component.id}`);
}

async function runAdd(invocation: AddInvocation): Promise<void> {
  const worldUrl = normalizeWorldUrl(
    invocation.worldUrl ?? process.env.FOURIER_WORLD_URL ?? DEFAULT_FOURIER_WORLD_URL,
  );
  const result = await addWorldComponent({
    packageName: invocation.packageName,
    projectDirectory: invocation.projectDirectory,
    componentsDirectory: invocation.componentsDirectory,
    worldUrl,
    force: invocation.force,
  });
  console.log(result.unchanged
    ? `· 已是最新版本 ${result.packageName}@${result.version}`
    : `✓ 已添加 ${result.packageName}@${result.version}`);
  console.log(`  ${result.path}`);
}

async function runDelete(invocation: DeleteInvocation): Promise<void> {
  const result = await deleteWorldComponent({
    packageName: invocation.packageName,
    projectDirectory: invocation.projectDirectory,
    purge: invocation.purge,
  });
  if (result.missing) console.log(`· 组件目录已不存在，已清理安装清单: ${result.packageName}`);
  else console.log(`✓ 已移除 ${result.packageName}`);
  if (result.trashPath !== undefined) console.log(`  可恢复副本: ${result.trashPath}`);
}

export async function runCli(argv: readonly string[]): Promise<number> {
  try {
    const invocation = parseCliInvocation(argv);
    if (invocation.command === "help") {
      console.log(HELP);
    } else if (invocation.command === "preview") {
      await runPreview(invocation);
    } else if (invocation.command === "login") {
      await runLogin(invocation);
    } else if (invocation.command === "whoami") {
      await runWhoami(invocation);
    } else if (invocation.command === "logout") {
      const removed = await removeWorldCredentials();
      console.log(removed ? "✓ 已退出 Fourier World" : "· 当前没有已保存的 Fourier World 登录");
    } else if (invocation.command === "search") {
      await runSearch(invocation);
    } else if (invocation.command === "publish") {
      await runPublish(invocation);
    } else if (invocation.command === "add") {
      await runAdd(invocation);
    } else {
      await runDelete(invocation);
    }
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

if (import.meta.main) process.exitCode = await runCli(Bun.argv.slice(2));
