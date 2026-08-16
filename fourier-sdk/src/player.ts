export const PLAYER_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#090909" />
  <title>Fourier Studio</title>
  <link rel="stylesheet" href="/preview-app.css?v=__FOURIER_PREVIEW_ASSET_VERSION__" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/preview-app.js?v=__FOURIER_PREVIEW_ASSET_VERSION__"></script>
</body>
</html>`;

export const PLAYER_CSS = String.raw`
:root {
  color: #f5f2eb;
  background: #090909;
  font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-synthesis: none;
  text-rendering: geometricPrecision;
  --ink: #f5f2eb;
  --muted: #999a94;
  --line: rgba(255, 255, 255, 0.11);
  --panel: #121212;
  --acid: #dfff58;
  color-scheme: dark;
}

* { box-sizing: border-box; }

html { min-width: 320px; min-height: 100%; background: #090909; }

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
  overflow-x: hidden;
  background:
    radial-gradient(circle at 82% 4%, rgba(177, 103, 255, 0.16), transparent 26rem),
    radial-gradient(circle at 8% 28%, rgba(223, 255, 88, 0.08), transparent 24rem),
    #090909;
}

body.preview-embed { min-width: 0; min-height: 0; overflow: hidden; background: #101010; }

button, input { font: inherit; }
button, a { -webkit-tap-highlight-color: transparent; }
a { color: inherit; text-decoration: none; }

button:focus-visible, a:focus-visible, input:focus-visible {
  outline: 2px solid var(--acid);
  outline-offset: 3px;
}

.shell { width: min(1480px, 100%); margin: 0 auto; padding: 0 36px 72px; }

.topbar {
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
}

.brand { display: inline-flex; align-items: center; gap: 13px; font-size: 14px; font-weight: 720; letter-spacing: .04em; }
.brand-mark { position: relative; width: 31px; height: 31px; border: 1px solid rgba(255,255,255,.72); border-radius: 50%; }
.brand-mark::before, .brand-mark::after { content: ""; position: absolute; border-radius: 50%; }
.brand-mark::before { inset: 6px; border: 1px solid var(--acid); }
.brand-mark::after { width: 5px; height: 5px; right: -2px; top: 6px; background: var(--acid); box-shadow: 0 0 16px rgba(223,255,88,.8); }
.topbar-note { color: var(--muted); font-size: 12px; letter-spacing: .14em; text-transform: uppercase; }

.hero { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(260px, .55fr); gap: 64px; align-items: end; padding: 76px 0 52px; }
.eyebrow { display: flex; align-items: center; gap: 12px; margin: 0 0 20px; color: var(--acid); font-size: 12px; font-weight: 760; letter-spacing: .16em; text-transform: uppercase; }
.eyebrow::before { content: ""; width: 32px; height: 1px; background: currentColor; }
.hero h1 { max-width: 880px; margin: 0; font-size: clamp(48px, 7.2vw, 112px); font-weight: 580; line-height: .89; letter-spacing: -.068em; }
.hero h1 em { color: var(--acid); font-family: Georgia, "Times New Roman", serif; font-weight: 400; }
.hero-copy { max-width: 360px; margin: 0 0 7px auto; color: #b7b6af; font-size: 16px; line-height: 1.7; }

.library-toolbar { display: flex; gap: 16px; align-items: center; justify-content: space-between; margin-bottom: 22px; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; }
.filter-button {
  appearance: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 9px 14px;
  color: #a7a7a1;
  background: rgba(255,255,255,.025);
  cursor: pointer;
  font-size: 12px;
  transition: color .2s ease, border-color .2s ease, background .2s ease;
}
.filter-button:hover { color: var(--ink); border-color: rgba(255,255,255,.28); }
.filter-button.active { color: #090909; background: var(--acid); border-color: var(--acid); }
.search-wrap { position: relative; width: min(320px, 42vw); }
.search-wrap::before { content: "⌕"; position: absolute; left: 14px; top: 8px; color: #787973; font-size: 20px; line-height: 1; }
.search {
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 10px 16px 10px 40px;
  color: var(--ink);
  background: rgba(255,255,255,.035);
  outline: none;
}
.search::placeholder { color: #6d6e69; }
.search:focus { border-color: rgba(223,255,88,.6); }

.component-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
.component-card {
  --card-accent: #9f7aea;
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(255,255,255,.065), rgba(255,255,255,.018));
  box-shadow: 0 24px 70px rgba(0,0,0,.28);
  animation: card-in .55s cubic-bezier(.2,.8,.2,1) both;
  animation-delay: calc(var(--index, 0) * 55ms);
  transition: transform .35s cubic-bezier(.2,.8,.2,1), border-color .35s ease, box-shadow .35s ease;
}
.component-card.motion { --card-accent: #c09aff; }
.component-card.react { --card-accent: #78d9ff; }
.component-card:hover { transform: translateY(-5px); border-color: rgba(255,255,255,.25); box-shadow: 0 30px 90px rgba(0,0,0,.42); }
.component-card::after { content: ""; position: absolute; inset: auto 12% -45% 12%; height: 58%; background: var(--card-accent); filter: blur(90px); opacity: .09; pointer-events: none; }
.card-preview { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-bottom: 1px solid var(--line); background: #101010; }
.card-preview iframe { width: 100%; height: 100%; display: block; border: 0; pointer-events: none; }
.card-preview-idle { width: 100%; height: 100%; background: linear-gradient(135deg, #151515, #101010); }
.card-preview-idle::after { content: ""; position: absolute; width: 24px; height: 24px; left: 50%; top: 50%; border: 2px solid rgba(255,255,255,.1); border-top-color: rgba(223,255,88,.72); border-radius: 50%; animation: spin 1s linear infinite; transform: translate(-50%, -50%); }
.card-no-preview { height: 100%; display: grid; place-items: center; padding: 28px; color: #ffadad; background: repeating-linear-gradient(-45deg, #131313, #131313 12px, #171717 12px, #171717 24px); text-align: center; font-size: 13px; }
.card-body { position: relative; z-index: 2; display: grid; grid-template-columns: 1fr auto; gap: 20px; align-items: end; padding: 22px 24px 24px; }
.card-kicker { margin-bottom: 9px; color: var(--card-accent); font-size: 10px; font-weight: 760; letter-spacing: .15em; text-transform: uppercase; }
.card-title { margin: 0 0 7px; font-size: clamp(21px, 2vw, 30px); font-weight: 610; letter-spacing: -.035em; }
.card-path { max-width: 42ch; margin: 0; overflow: hidden; color: #858681; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.card-open { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; color: var(--ink); background: rgba(0,0,0,.12); font-size: 19px; transition: color .2s ease, background .2s ease, transform .2s ease; }
.component-card:hover .card-open { color: #0a0a0a; background: var(--acid); transform: rotate(5deg); }
.card-link { position: absolute; z-index: 4; inset: 0; border-radius: inherit; }

.empty-state, .loading-state { min-height: 360px; display: grid; place-items: center; border: 1px dashed var(--line); border-radius: 24px; color: var(--muted); text-align: center; }
.loading-state span { width: 28px; height: 28px; border: 2px solid rgba(255,255,255,.15); border-top-color: var(--acid); border-radius: 50%; animation: spin .8s linear infinite; }

.detail-shell { width: min(1560px, 100%); margin: 0 auto; padding: 0 36px 52px; }
.detail-topbar { height: 82px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--line); }
.back-link { display: inline-flex; align-items: center; gap: 10px; color: #b7b7b1; font-size: 13px; transition: color .2s ease; }
.back-link:hover { color: var(--ink); }
.key-hint { padding: 5px 8px; border: 1px solid var(--line); border-radius: 6px; color: #777872; font-size: 10px; }
.detail-heading { display: flex; align-items: end; justify-content: space-between; gap: 32px; padding: 54px 0 28px; }
.detail-heading h1 { margin: 0; font-size: clamp(42px, 6vw, 88px); font-weight: 570; line-height: .95; letter-spacing: -.06em; }
.detail-type { margin-bottom: 7px; color: var(--acid); font-size: 11px; font-weight: 760; letter-spacing: .16em; text-transform: uppercase; }
.detail-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 22px; align-items: start; }
.detail-player-card { min-width: 0; overflow: hidden; border: 1px solid var(--line); border-radius: 24px; background: #101010; box-shadow: 0 32px 100px rgba(0,0,0,.4); }
.detail-aside { display: grid; gap: 1px; overflow: hidden; border: 1px solid var(--line); border-radius: 18px; background: var(--line); }
.fact { min-width: 0; padding: 18px; background: #111; }
.fact-label { margin-bottom: 7px; color: #6f706b; font-size: 9px; font-weight: 760; letter-spacing: .14em; text-transform: uppercase; }
.fact-value { overflow-wrap: anywhere; color: #d7d5ce; font-size: 13px; line-height: 1.5; }
.fact-value.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }

.preview-player { min-width: 0; background: #101010; }
.preview-player.compact { width: 100vw; height: 100vh; }
.preview-stage {
  position: relative;
  width: 100%;
  height: min(68vh, 780px);
  min-height: 420px;
  overflow: hidden;
  background: #151515;
}
.compact .preview-stage { height: 100vh; min-height: 0; }
.preview-stage.checkerboard {
  background-color: #151515;
  background-image:
    linear-gradient(45deg, #202020 25%, transparent 25%),
    linear-gradient(-45deg, #202020 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #202020 75%),
    linear-gradient(-45deg, transparent 75%, #202020 75%);
  background-position: 0 0, 0 12px, 12px -12px, -12px 0;
  background-size: 24px 24px;
}
.preview-viewport { position: absolute; inset: 0; overflow: hidden; }
.preview-mount { position: absolute; display: block; overflow: hidden; transform-origin: center; will-change: transform; }
.preview-mount > #fourier-root { display: block; overflow: hidden; }
.preview-loading, .preview-error { position: absolute; z-index: 3; inset: 0; display: grid; place-items: center; padding: 24px; color: #999a94; background: #121212; text-align: center; font-size: 13px; }
.preview-error { color: #ffb2b2; }
.preview-loading::before { content: ""; width: 24px; height: 24px; border: 2px solid rgba(255,255,255,.15); border-top-color: var(--acid); border-radius: 50%; animation: spin .8s linear infinite; }
.compact-badge { position: absolute; z-index: 4; left: 14px; bottom: 12px; display: flex; align-items: center; gap: 7px; padding: 6px 9px; border: 1px solid rgba(255,255,255,.14); border-radius: 999px; color: rgba(255,255,255,.7); background: rgba(0,0,0,.46); backdrop-filter: blur(14px); font-size: 9px; font-weight: 700; letter-spacing: .11em; text-transform: uppercase; opacity: 0; transition: opacity .25s ease; }
.compact:hover .compact-badge { opacity: 1; }
.live-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--acid); box-shadow: 0 0 8px var(--acid); }
.player-controls { display: grid; grid-template-columns: auto auto auto minmax(120px, 1fr) auto auto; gap: 12px; align-items: center; padding: 16px 18px; border-top: 1px solid var(--line); }
.control-button { height: 36px; min-width: 36px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 10px; color: #d7d7d1; background: rgba(255,255,255,.035); cursor: pointer; transition: background .2s ease, border-color .2s ease; }
.control-button:hover:not(:disabled) { background: rgba(255,255,255,.1); border-color: rgba(255,255,255,.24); }
.control-button:disabled { opacity: .32; cursor: not-allowed; }
.control-button.primary { width: 42px; color: #090909; background: var(--acid); border-color: var(--acid); font-weight: 850; }
.timeline { width: 100%; height: 3px; accent-color: var(--acid); cursor: pointer; }
.timeline:disabled { opacity: .3; cursor: not-allowed; }
.position { min-width: 104px; color: #989993; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; text-align: right; }
.loop-control { display: inline-flex; align-items: center; gap: 7px; color: #8d8e88; font-size: 11px; white-space: nowrap; }
.loop-control input { accent-color: var(--acid); }
.player-status { min-height: 43px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 0 19px; border-top: 1px solid rgba(255,255,255,.06); color: #6f706a; font-size: 10px; }
.player-status .error { color: #ffaaaa; }
.snapshot { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes card-in { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

@media (max-width: 980px) {
  .hero { grid-template-columns: 1fr; gap: 28px; padding-top: 56px; }
  .hero-copy { margin-left: 0; }
  .component-grid { grid-template-columns: 1fr; }
  .detail-grid { grid-template-columns: 1fr; }
  .detail-aside { grid-template-columns: repeat(2, 1fr); }
  .preview-stage { height: min(62vh, 680px); }
}

@media (max-width: 640px) {
  .shell, .detail-shell { padding-left: 16px; padding-right: 16px; }
  .topbar, .detail-topbar { height: 70px; }
  .topbar-note { display: none; }
  .hero { padding: 46px 0 38px; }
  .hero h1 { font-size: clamp(46px, 15vw, 70px); }
  .library-toolbar { align-items: stretch; flex-direction: column; }
  .search-wrap { width: 100%; }
  .component-grid { gap: 14px; }
  .component-card { border-radius: 18px; }
  .card-body { padding: 18px; }
  .detail-heading { align-items: start; flex-direction: column; padding-top: 38px; }
  .detail-heading h1 { font-size: 46px; }
  .detail-aside { grid-template-columns: 1fr; }
  .preview-stage { height: 54vh; min-height: 300px; }
  .player-controls { grid-template-columns: auto auto auto 1fr; gap: 8px; }
  .player-controls .position { grid-column: 1 / 4; grid-row: 2; text-align: left; }
  .player-controls .loop-control { grid-column: 4; grid-row: 2; justify-self: end; }
  .player-status { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto !important; }
  .component-card, .preview-loading::before, .card-preview-idle::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
}
`;
