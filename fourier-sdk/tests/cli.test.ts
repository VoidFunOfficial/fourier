import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { parseCliInvocation } from "../src/cli.ts";

describe("fourier-sdk CLI arguments", () => {
  test("preview 默认加载 example 目录，也支持显式文件或目录", () => {
    const defaultPreview = parseCliInvocation(["preview"]);
    expect(defaultPreview.command).toBe("preview");
    if (defaultPreview.command !== "preview") throw new Error("unexpected command");
    expect(defaultPreview.entryPath.endsWith("/fourier-sdk/example")).toBe(true);

    expect(parseCliInvocation(["preview", "./components", "--no-watch"])).toEqual({
      command: "preview",
      entryPath: resolve("./components"),
      hostname: "127.0.0.1",
      port: 3211,
      publicPort: 3212,
      open: false,
      watch: false,
    });

    expect(parseCliInvocation(["preview", "--public-port", "4321"])).toMatchObject({
      command: "preview",
      publicPort: 4321,
    });
    expect(() => parseCliInvocation(["preview", "--public-port", "65536"])).toThrow(
      "--public-port 必须是 0—65535 的整数",
    );
  });

  test("解析 login", () => {
    expect(parseCliInvocation([
      "login",
      "--world",
      "http://localhost:3000/",
      "--email",
      "author@example.com",
      "--password-stdin",
    ])).toEqual({
      command: "login",
      worldUrl: "http://localhost:3000",
      email: "author@example.com",
      passwordStdin: true,
    });
  });

  test("publish 默认要求当前目录 package.json 并支持 dry-run", () => {
    expect(parseCliInvocation(["publish", "./component", "--dry-run"])).toEqual({
      command: "publish",
      inputPath: resolve("./component"),
      dryRun: true,
    });
  });

  test("拒绝未知参数和明文 password 参数", () => {
    expect(() => parseCliInvocation(["login", "--password", "secret"])).toThrow("未知参数: --password");
    expect(() => parseCliInvocation(["publish", "one", "two"])).toThrow("多余位置参数: two");
  });

  test("解析 add 和 del 项目指令", () => {
    expect(parseCliInvocation([
      "add", "@studio/MetricPanel", "--project", "./video", "--dir", "src/components", "--force",
    ])).toEqual({
      command: "add",
      packageName: "@studio/MetricPanel",
      projectDirectory: resolve("./video"),
      componentsDirectory: "src/components",
      force: true,
    });
    expect(parseCliInvocation(["remove", "@studio/MetricPanel", "--purge"])).toEqual({
      command: "del",
      packageName: "@studio/MetricPanel",
      projectDirectory: process.cwd(),
      purge: true,
    });
  });

  test("解析面向 Agent 的语义 search 参数", () => {
    expect(parseCliInvocation([
      "search",
      "产品发布的电影感标题动画",
      "--type", "motion",
      "--style", "cinematic",
      "--style", "cinematic",
      "--domain", "product-launch",
      "--mood", "energetic",
      "--language", "zh-CN",
      "--author", "@studio",
      "--page", "2",
      "--limit", "8",
      "--session", "agent-run-7",
      "--world", "http://localhost:3000/",
      "--json",
    ])).toEqual({
      command: "search",
      query: "产品发布的电影感标题动画",
      worldUrl: "http://localhost:3000",
      type: "motion",
      styles: ["cinematic"],
      contentDomains: ["product-launch"],
      moods: ["energetic"],
      languages: ["zh-CN"],
      author: "@studio",
      page: 2,
      limit: 8,
      sessionId: "agent-run-7",
      json: true,
    });
  });

  test("search 支持未加引号的多词查询并拒绝非法筛选", () => {
    expect(parseCliInvocation(["search", "cinematic", "launch", "title"])).toMatchObject({
      command: "search",
      query: "cinematic launch title",
    });
    expect(() => parseCliInvocation(["search"])).toThrow("缺少自然语言描述");
    expect(() => parseCliInvocation(["search", "title", "--style", "unknown"])).toThrow("--style 必须是");
    expect(() => parseCliInvocation(["search", "title", "--limit", "49"])).toThrow("--limit 必须是 1—48");
  });
});
