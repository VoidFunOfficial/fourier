import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { normalizeWorldUrl, type WorldLoginResult, type WorldUser } from "./world-client.ts";

export interface StoredWorldCredentials {
  readonly version: 1;
  readonly worldUrl: string;
  readonly token: string;
  readonly expiresAt?: number;
  readonly user: WorldUser;
}

export function worldConfigDirectory(environment: NodeJS.ProcessEnv = process.env): string {
  const configured = environment.FOURIER_CONFIG_DIR;
  return configured && configured.trim().length > 0
    ? resolve(configured)
    : join(homedir(), ".config", "fourier");
}

export function worldCredentialsPath(environment: NodeJS.ProcessEnv = process.env): string {
  return join(worldConfigDirectory(environment), "credentials.json");
}

function isUser(value: unknown): value is WorldUser {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Partial<WorldUser>;
  return (
    (typeof user.id === "string" || typeof user.id === "number") &&
    typeof user.email === "string" &&
    typeof user.name === "string" &&
    (user.role === "admin" || user.role === "reviewer" || user.role === "user")
  );
}

function parseCredentials(value: unknown, path: string): StoredWorldCredentials {
  if (typeof value !== "object" || value === null) {
    throw new TypeError(`Fourier World 登录文件格式无效: ${path}`);
  }
  const item = value as Partial<StoredWorldCredentials>;
  if (
    item.version !== 1 ||
    typeof item.worldUrl !== "string" ||
    typeof item.token !== "string" ||
    item.token.length === 0 ||
    !isUser(item.user) ||
    (item.expiresAt !== undefined && typeof item.expiresAt !== "number")
  ) {
    throw new TypeError(`Fourier World 登录文件格式无效: ${path}`);
  }
  return Object.freeze({
    version: 1,
    worldUrl: normalizeWorldUrl(item.worldUrl),
    token: item.token,
    ...(item.expiresAt === undefined ? {} : { expiresAt: item.expiresAt }),
    user: Object.freeze({ ...item.user }),
  });
}

export async function saveWorldCredentials(
  worldUrl: string,
  login: WorldLoginResult,
  environment: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const directory = worldConfigDirectory(environment);
  const path = worldCredentialsPath(environment);
  const temporaryPath = join(directory, `.credentials-${process.pid}-${randomUUID()}.tmp`);
  const credentials: StoredWorldCredentials = {
    version: 1,
    worldUrl: normalizeWorldUrl(worldUrl),
    token: login.token,
    ...(login.exp === undefined ? {} : { expiresAt: login.exp }),
    user: login.user,
  };
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  try {
    await writeFile(temporaryPath, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, path);
    await chmod(path, 0o600);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
  return path;
}

export async function readWorldCredentials(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<StoredWorldCredentials | undefined> {
  const path = worldCredentialsPath(environment);
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return parseCredentials(JSON.parse(source), path);
  } catch (error) {
    if (error instanceof SyntaxError) throw new TypeError(`Fourier World 登录文件不是有效 JSON: ${path}`);
    throw error;
  }
}

export async function removeWorldCredentials(
  environment: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  const path = worldCredentialsPath(environment);
  try {
    await rm(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
