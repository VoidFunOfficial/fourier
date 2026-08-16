import { describe, expect, test } from "bun:test";
import {
  FourierWorldApiError,
  searchFourierWorld,
} from "../src/search.ts";

function asFetch(
  implementation: (request: Request) => Promise<Response> | Response,
): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    implementation(new Request(input, init))) as typeof globalThis.fetch;
}

function searchBody(): unknown {
  return {
    docs: [{
      id: 44,
      name: "LaunchTitle",
      namespace: "@studio",
      packageName: "@studio/LaunchTitle",
      downloadable: true,
      version: "2.1.0",
      type: "motion",
      subtype: "title",
      summary: "电影感产品发布标题动画。",
      description: "A deterministic cinematic launch title.",
      instruction: "Use for premium product launches; avoid casual tutorials.",
      style: ["cinematic", "elegant"],
      useCases: ["Product launch"],
      negativeUseCases: ["Casual tutorial"],
      aliases: ["launch title"],
      tags: ["title", "launch"],
      contentDomains: ["product-launch"],
      mood: ["energetic"],
      languages: ["en", "zh-CN"],
      license: "MIT",
      author: {
        id: 7,
        name: "Studio",
        namespace: "@studio",
        bio: null,
        verified: true,
        avatarUrl: "/media/studio.png",
      },
      cover: { url: "/media/cover.jpg", alt: "Launch title cover", mimeType: "image/jpeg" },
      preview: { url: "/media/preview.mp4", alt: "Launch title preview", mimeType: "video/mp4" },
      metrics: {
        viewCount: 100,
        clickCount: 20,
        favoriteCount: 8,
        adoptionCount: 5,
        qualityScore: 0.91,
      },
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      match: {
        score: 0.874,
        reasons: ["用途与自然语言意图相近", "风格匹配 · cinematic"],
        keywordScore: 0.35,
        semanticScore: 0.82,
      },
    }],
    total: 1,
    page: 2,
    limit: 8,
    queryId: 71,
    latencyMs: 14,
    mode: "hybrid",
  };
}

describe("Fourier World semantic search", () => {
  test("把自然语言和结构化筛选发送到混合检索并返回只读 Agent 结果", async () => {
    let requestUrl: URL | undefined;
    let authorization: string | null = "unexpected";
    const fetcher = asFetch((request) => {
      requestUrl = new URL(request.url);
      authorization = request.headers.get("authorization");
      return Response.json(searchBody());
    });

    const result = await searchFourierWorld("  产品发布的电影感标题动画  ", {
      worldUrl: "https://world.test/",
      fetch: fetcher,
      type: "motion",
      styles: ["cinematic", "cinematic", "elegant"],
      contentDomains: [" product-launch ", "product-launch"],
      moods: ["energetic"],
      languages: ["zh-CN"],
      author: " @studio ",
      page: 2,
      limit: 8,
      sessionId: "agent-run-7",
    });

    expect(requestUrl?.pathname).toBe("/api/search");
    expect(requestUrl?.searchParams.get("q")).toBe("产品发布的电影感标题动画");
    expect(requestUrl?.searchParams.get("type")).toBe("motion");
    expect(requestUrl?.searchParams.getAll("style")).toEqual(["cinematic", "elegant"]);
    expect(requestUrl?.searchParams.getAll("domain")).toEqual(["product-launch"]);
    expect(requestUrl?.searchParams.get("author")).toBe("@studio");
    expect(requestUrl?.searchParams.get("page")).toBe("2");
    expect(requestUrl?.searchParams.get("limit")).toBe("8");
    expect(authorization).toBeNull();

    expect(result).toMatchObject({
      total: 1,
      page: 2,
      queryId: 71,
      mode: "hybrid",
      results: [{
        packageName: "@studio/LaunchTitle",
        styles: ["cinematic", "elegant"],
        moods: ["energetic"],
        match: { score: 0.874, semanticScore: 0.82 },
        cover: { url: "https://world.test/media/cover.jpg" },
        preview: { url: "https://world.test/media/preview.mp4" },
        author: { avatarUrl: "https://world.test/media/studio.png" },
      }],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.results)).toBe(true);
    expect(Object.isFrozen(result.results[0]?.match.reasons)).toBe(true);
  });

  test("在发请求前拒绝空查询和越界分页", async () => {
    let requests = 0;
    const fetcher = asFetch(() => {
      requests += 1;
      return Response.json(searchBody());
    });
    await expect(searchFourierWorld("  ", { fetch: fetcher })).rejects.toThrow("1—500");
    await expect(searchFourierWorld("title", { fetch: fetcher, limit: 49 })).rejects.toThrow("limit 必须是 1—48");
    await expect(searchFourierWorld("title", {
      fetch: fetcher,
      styles: ["unknown" as "cinematic"],
    })).rejects.toThrow("styles 包含不支持的值");
    expect(requests).toBe(0);
  });

  test("把不可信 World 响应包装成可识别的 502 错误", async () => {
    const fetcher = asFetch(() => Response.json({
      ...(searchBody() as Record<string, unknown>),
      docs: [{ packageName: "broken" }],
    }));
    let thrown: unknown;
    try {
      await searchFourierWorld("title", { fetch: fetcher });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FourierWorldApiError);
    expect(thrown).toMatchObject({ status: 502 });
    expect((thrown as Error).message).toContain("检索响应格式无效");
  });
});
