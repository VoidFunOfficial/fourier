import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readWorldCredentials,
  removeWorldCredentials,
  saveWorldCredentials,
  worldCredentialsPath,
} from "../src/world-credentials.ts";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Fourier World credentials", () => {
  test("以 0600 保存 token 且不保存密码", async () => {
    const directory = await mkdtemp(join(tmpdir(), "fourier-world-credentials-"));
    directories.push(directory);
    const environment = { FOURIER_CONFIG_DIR: directory };
    await saveWorldCredentials("https://www.fourier.video/", {
      token: "secret-token",
      exp: 2_000_000_000,
      user: { id: 1, email: "author@example.com", name: "@author", role: "user" },
    }, environment);
    const path = worldCredentialsPath(environment);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await Bun.file(path).text()).not.toContain("password");
    expect(await readWorldCredentials(environment)).toEqual({
      version: 1,
      worldUrl: "https://www.fourier.video",
      token: "secret-token",
      expiresAt: 2_000_000_000,
      user: { id: 1, email: "author@example.com", name: "@author", role: "user" },
    });
    expect(await removeWorldCredentials(environment)).toBe(true);
    expect(await removeWorldCredentials(environment)).toBe(false);
  });
});
