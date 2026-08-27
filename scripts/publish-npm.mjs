#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const REGISTRY = "https://registry.npmjs.org/";
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";
const PACKAGE_DIRS = ["fourier-core", "fourier-sdk", "fourier-render-engine"];

function run(command, args, { cwd = ROOT, capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [`命令失败: ${command} ${args.join(" ")}`, result.stdout, result.stderr]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout?.trim() ?? "";
}

function nextVersion(version, release) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`只支持稳定 SemVer 版本，当前为 ${version}`);
  let [, major, minor, patch] = match.map(Number);
  if (release === "major") [major, minor, patch] = [major + 1, 0, 0];
  else if (release === "minor") [minor, patch] = [minor + 1, 0];
  else if (release === "patch") patch += 1;
  else throw new Error(`未知版本类型: ${release}`);
  return `${major}.${minor}.${patch}`;
}

function updatePackages(packages, release) {
  const [core, sdk, render] = packages;
  core.version = nextVersion(core.version, release);
  sdk.version = nextVersion(sdk.version, release);
  render.version = nextVersion(render.version, release);
  sdk.dependencies[core.name] = `^${core.version}`;
  render.dependencies[core.name] = `^${core.version}`;
  render.peerDependencies[sdk.name] = `^${sdk.version}`;
}

function selfTest() {
  assert.equal(nextVersion("1.2.3", "patch"), "1.2.4");
  assert.equal(nextVersion("1.2.3", "major"), "2.0.0");
  const packages = [
    { name: "@fourier-video/core", version: "1.2.3" },
    {
      name: "@fourier-video/sdk",
      version: "2.3.4",
      dependencies: { "@fourier-video/core": "^1.2.3" },
    },
    {
      name: "@fourier-video/render-engine",
      version: "3.4.5",
      dependencies: { "@fourier-video/core": "^1.2.3" },
      peerDependencies: { "@fourier-video/sdk": "^2.3.4" },
    },
  ];
  updatePackages(packages, "minor");
  assert.deepEqual(
    packages.map(({ version }) => version),
    ["1.3.0", "2.4.0", "3.5.0"],
  );
  assert.equal(packages[1].dependencies[packages[0].name], "^1.3.0");
  assert.equal(packages[2].dependencies[packages[0].name], "^1.3.0");
  assert.equal(packages[2].peerDependencies[packages[1].name], "^2.4.0");
  console.log("发布脚本自检通过");
}

function readPackages() {
  const packages = PACKAGE_DIRS.map((dir) => ({
    dir,
    path: `${ROOT}/${dir}/package.json`,
    manifest: JSON.parse(readFileSync(`${ROOT}/${dir}/package.json`, "utf8")),
  }));
  const names = packages.map(({ manifest }) => manifest.name).join(",");
  const expected = [
    "@fourier-video/core",
    "@fourier-video/sdk",
    "@fourier-video/render-engine",
  ].join(",");
  if (names !== expected) throw new Error(`发布包顺序异常: ${names}`);
  return packages;
}

function ensureVersionAvailable(name, version) {
  const result = spawnSync(
    NPM,
    ["view", `${name}@${version}`, "version", "--registry", REGISTRY],
    { cwd: ROOT, encoding: "utf8", stdio: "pipe" },
  );
  if (result.error) throw result.error;
  if (result.status === 0) throw new Error(`${name}@${version} 已存在`);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (!output.includes("E404")) throw new Error(output.trim());
}

async function main() {
  // const dirty = run("git", ["status", "--porcelain", "--untracked-files=normal"], {
  //   capture: true,
  // });
  // if (dirty) throw new Error(`发布前工作区必须干净:\n${dirty}`);

  run(NPM, ["login", "--registry", REGISTRY, "--scope", "@fourier-video"]);
  const user = run(NPM, ["whoami", "--registry", REGISTRY], { capture: true });
  console.log(`\n已登录 npm: ${user}\n`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question("版本升级类型 [1] patch [2] minor [3] major [q] 退出: "))
      .trim()
      .toLowerCase();
    const release = {
      "1": "patch",
      p: "patch",
      patch: "patch",
      "2": "minor",
      minor: "minor",
      "3": "major",
      major: "major",
    }[answer];
    if (!release) {
      if (answer === "q") return;
      throw new Error(`无效选择: ${answer}`);
    }

    const packages = readPackages();
    const before = packages.map(({ manifest }) => manifest.version);
    updatePackages(
      packages.map(({ manifest }) => manifest),
      release,
    );
    console.log("\n发布计划:");
    packages.forEach(({ manifest }, index) => {
      console.log(`  ${manifest.name}: ${before[index]} -> ${manifest.version}`);
    });

    const confirmed = (await rl.question("\n继续准备发布? [y/N]: ")).trim().toLowerCase();
    if (confirmed !== "y" && confirmed !== "yes") return;

    for (const { manifest } of packages) {
      ensureVersionAvailable(manifest.name, manifest.version);
    }
    for (const { path, manifest } of packages) {
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    run("bun", ["install", "--lockfile-only"]);

    console.log("\n运行全部发布前检查与打包预演...");
    for (const { dir } of packages) {
      run(NPM, ["publish", "--dry-run", "--access", "public", "--registry", REGISTRY], {
        cwd: `${ROOT}/${dir}`,
      });
    }

    const finalConfirmation = await rl.question(
      "\n全部预演通过。输入 publish 开始真实发布: ",
    );
    if (finalConfirmation.trim() !== "publish") {
      console.log("已取消；版本文件已更新但未发布，请检查或还原。");
      return;
    }

    for (const { dir, manifest } of packages) {
      console.log(`\n发布 ${manifest.name}@${manifest.version}...`);
      run(NPM, ["publish", "--access", "public", "--registry", REGISTRY], {
        cwd: `${ROOT}/${dir}`,
      });
    }
    console.log("\nCore、SDK、Render Engine 已依次发布。请提交版本文件和 bun.lock。");
  } finally {
    rl.close();
  }
}

if (process.argv.includes("--self-test")) selfTest();
else main().catch((error) => {
  console.error(`\n发布终止: ${error.message}`);
  process.exitCode = 1;
});
