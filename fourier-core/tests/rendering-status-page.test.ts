import { describe, expect, test } from "bun:test";
import {
  FOURIER_RENDERING_STATUS_MESSAGE,
  FOURIER_RENDERING_STATUS_URL,
} from "../src/rendering-status-page.ts";

describe("rendering status page", () => {
  test("显示渲染中提示，并说明完成后自动关闭", () => {
    const document = decodeURIComponent(
      FOURIER_RENDERING_STATUS_URL.slice(FOURIER_RENDERING_STATUS_URL.indexOf(",") + 1),
    );

    expect(FOURIER_RENDERING_STATUS_MESSAGE).toBe("Fourier 正在渲染中，请勿关闭");
    expect(document).toContain(`<title>${FOURIER_RENDERING_STATUS_MESSAGE}</title>`);
    expect(document).toContain(`<p>${FOURIER_RENDERING_STATUS_MESSAGE}</p>`);
    expect(document).toContain("渲染完成后，此窗口会自动关闭。");
    expect(document).toContain('role="status"');
    expect(document).not.toContain("animation:");
    expect(document).not.toContain("@keyframes");
  });
});
