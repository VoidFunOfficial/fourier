export const FOURIER_RENDERING_STATUS_MESSAGE = "Fourier 正在渲染中，请勿关闭";

const renderingStatusDocument = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${FOURIER_RENDERING_STATUS_MESSAGE}</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body {
        display: grid;
        place-items: center;
        overflow: hidden;
        color: #f7f8ff;
        background:
          radial-gradient(circle at 50% 20%, rgba(111, 91, 255, 0.28), transparent 52%),
          #0b0d16;
      }
      main {
        display: flex;
        width: min(390px, calc(100% - 40px));
        align-items: center;
        gap: 18px;
        padding: 24px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.07);
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.34);
      }
      .indicator {
        width: 14px;
        height: 14px;
        flex: 0 0 auto;
        background: #9f8cff;
        border-radius: 50%;
        box-shadow: 0 0 0 7px rgba(159, 140, 255, 0.14);
      }
      p { margin: 0; font-size: 17px; font-weight: 650; line-height: 1.5; }
      small { display: block; margin-top: 4px; color: #aeb3c7; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main role="status" aria-live="polite">
      <span class="indicator" aria-hidden="true"></span>
      <div>
        <p>${FOURIER_RENDERING_STATUS_MESSAGE}</p>
        <small>渲染完成后，此窗口会自动关闭。</small>
      </div>
    </main>
  </body>
</html>`;

export const FOURIER_RENDERING_STATUS_URL =
  `data:text/html;charset=utf-8,${encodeURIComponent(renderingStatusDocument)}`;
