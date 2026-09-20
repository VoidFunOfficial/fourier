# Work / Play · Fourier SDK 复刻

23.05 秒 · 1920×1080 · 60 fps · 9 个可独立编辑、预览和渲染的场景。

- 成片：`output/Work-Play-1080p60.mp4`
- 工程入口：`main.tsx`
- 分镜与实现：`STORYBOARD.md`
- 源素材记录：`review/asset-sources.json`
- 场景与编码复查：`review/`
- 双画面对照播放器：`review/compare.html`

本版本位于 `ad-clone/sdk-rebuild`。建立该目录是因为另一条活动任务正在同时写父目录，两个实现分别保留，避免覆盖。详见 `ISOLATION.md`。

从 Fourier-Project 根目录运行：

```sh
python3 ad-clone/sdk-rebuild/scripts/prepare-assets.py
python3 ad-clone/sdk-rebuild/scripts/prepare-credits.py
bun fourier-sdk/node_modules/typescript/bin/tsc -p ad-clone/sdk-rebuild/tsconfig.json
bun fourier-render-engine/src/cli.ts validate ad-clone/sdk-rebuild/main.tsx > ad-clone/sdk-rebuild/review/project-validation.json
bun ad-clone/sdk-rebuild/scripts/preview.ts
bun fourier-render-engine/src/cli.ts render ad-clone/sdk-rebuild/main.tsx --output ad-clone/sdk-rebuild/output/Work-Play-1080p60.mp4 --overwrite --crf 17 --preset medium --dom-pages 1 --frame-concurrency 1
python3 ad-clone/sdk-rebuild/scripts/finalize-audio.py
python3 ad-clone/sdk-rebuild/scripts/verify-media.py
```

`preview.ts 05` 只复查游戏面板 Scene。单独渲染时，将 render 输入替换为 `ad-clone/sdk-rebuild/scenes/05-play/main.tsx`。所有视觉资源在本目录本地加载，预览与渲染需要能启动本机 Chromium 的执行环境。素材重建脚本使用已安装的 Python Pillow、NumPy、SciPy 和 fontTools。

原片音轨、人物、品牌标志与结尾署名随本次参考复刻保留。19.05 秒后追加 ad-apple 的 4 秒 this video 场景，保留原排版、文字入场、字体与对应音效。复用来源见 `review/credits-sources.json`。该工程没有把原视频当作视觉素材直接回放。动效曲线和材质是重新构建的近似实现。

最终封装保留 Fourier 渲染的视频包，直接编码原始 PCM 为 320 kb/s AAC。这样避免当前渲染器默认 `atempo=1` 对波形的额外处理；原生渲染文件与其 manifest 也保存在 output 中，封装记录见 `review/final-audio-mux.json`。

成片验收记录见 `review/media-verification.json`；本次追加片尾的完整渲染记录见 `review/render-with-credits.jsonl`。九个场景分别保留采样和确定性报告。四张 `review/comparison-*.jpg` 对照原片部分（左侧原片，右侧复刻），新增片尾的编码画面位于 `review/encoded/credits-*.png`。
