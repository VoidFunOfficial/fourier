# Fourier SDK Agent 接入指南

本文件适用于 `fourier-sdk/` 及其所有子目录。它是 Agent 进入本包后的第一入口；更具体的 API 和 artifact 编写规则以文末链接的文档为准。

## 先判断你在做哪一类任务

这个仓库同时承担两种不同工作，规则不要混用：

1. **维护 SDK 本体**：修改 `src/`、`tests/`、构建、CLI、预览服务或 World 集成。SDK 内部可以直接依赖 `react`、`three` 和 `@fourier-video/core`，但不得依赖 render-engine。
2. **编写或修改视觉 artifact**：通常修改 `example/`，或创建供用户复制、预览、测试、发布的 React/Motion/Three.js 组件。artifact 必须通过 SDK 的公开入口导入 React/Three.js API，并遵守确定性渲染合同。

如果用户只说“写组件”“做动效”“做 3D 场景”，默认按 artifact 任务处理。如果用户要求改 API、runtime、preview、testing、CLI、World 或 package exports，按 SDK 本体任务处理。

## 开始工作

1. 从本目录执行 `git status --short`，保留用户已有改动。这个包位于 Bun workspace 中；相邻的 `../fourier-core` 与 `../fourier-render-engine` 可能已有独立改动，不要清理、回退或顺手修改。
2. 阅读目标文件、相邻实现和直接相关测试。先用 `rg` 定位符号，不要根据文件名猜行为。
3. 确认改动属于公开 ABI、内部实现、artifact 示例、World 流程还是文档；据此选择验证范围。
4. 只修改任务所需文件。不要更新版本号、锁文件、生成物或跨包接口，除非任务确实要求。

首次安装依赖时从 workspace 根目录执行 `bun install`。要求 Bun `>=1.3`。真实 DOM 测试还需要与 Core 固定版本匹配的 Playwright Chromium；缺失时使用：

```bash
bunx playwright install chromium
```

不要仅为“确保最新”重新安装依赖或改动 `../bun.lock`。

## 项目地图

- `src/types.ts`：ABI 常量、artifact definition、preview、Motion 和 runtime 公共类型。
- `src/schema.ts`：字段定义、输入校验和 props 类型推导。
- `src/definitions.ts`：`defineReact` / `defineMotion` 的定义期校验和 metadata 组装。
- `src/runtime.ts`：稳定上下文、lifecycle、受控 timeline 和 render driver。
- `src/fourier-motion.ts`、`src/motion.ts`：声明式 `FourierMotion` / `motion.*` 与 Motion 子路径出口。
- `src/react-runtime.ts`、`src/react.ts`、`src/jsx-*.ts`：SDK 持有的 React 与 JSX runtime 出口。
- `src/three.ts`：Three.js 出口和由 Fourier 绝对时间驱动的 `FourierCanvas`。
- `src/universe.ts`、`src/universe-core.ts`：二维世界、Camera、World 投影和多镜头程序。
- `src/project.ts`：`Project`、`Scene`、`Template`、`Motion` 等数据型 TSX 工程声明。
- `src/preview-config.ts`、`src/preview.ts`、`src/preview-app.tsx`、`src/player.ts`：设计预览解析、开发服务器和播放器。
- `src/testing.ts`：从源码路径打开 artifact、采样与确定性断言的公开测试入口。
- `src/artifact-host.ts`：SDK 的 Core host facade；只在这里用 `Bun.resolveSync(specifier, import.meta.dir)` 注入 author-runtime adapter。
- `src/world-*.ts`、`src/cli.ts`：World 清单、归档、认证、客户端、安装/删除/发布和 CLI。
- `src/index.ts` 及各子路径文件：公开导出面。
- `scripts/build.ts`：JavaScript bundle 入口；`tsconfig.build.json` 生成声明文件。
- `tests/`：Bun 单元、类型合同和浏览器 DOM 集成测试。
- `example/`：可运行的公开用法与回归 fixture；不是随意的试验场。
- `placeholder/`：可复现的本地预览素材。
- `dist/`：生成物。不要手工编辑。

`@fourier-video/core` 是 SDK 的基础 workspace 依赖，负责 artifact 编译、真实时间轴和独立 MP4。SDK preview、testing 与 World 必须通过本地 Core host，不能导入 render-engine。工程编译、缓存、TTS、CLI/HTTP 与工程级 FFmpeg 合成仍属于 `../fourier-render-engine`；跨包改动必须明确说明并分别验证涉及的包。

## SDK 本体修改规则

### 公开合同优先

- 把 `package.json` 的 `exports`、对应的 `src/<subpath>.ts`、`scripts/build.ts` entrypoint 和生成的 `.d.ts` 看作同一份公开接口。新增子路径时必须同步它们；只增加现有 barrel export 时不要无故创建新子路径。
- 公共类型或运行时语义变化必须补测试，并同步 `docs/API.md`；改变 artifact 作者工作流时还要同步 `README.md`、`docs/DEVELOPMENT.md` 或 `docs/AGENT_SDK_GUIDE.md` 中最接近事实来源的一处。
- ABI marker、renderer 名称、schema 格式、错误码、preview descriptor 和 CLI 参数都是兼容性合同。不要静默改名或改变含义。
- 新增稳定失败路径时优先沿用 `SdkError` / `sdkFail` 和可断言的错误码，不要让调用方只能匹配模糊消息。
- 不要为了兼容猜测而同时保留两套入口。若需要兼容层，先确认用户要求，并用测试固定其生命周期。

### TypeScript 与实现风格

- 使用 ESM 和带 `.ts` 后缀的相对导入；类型导入使用 `import type` 或行内 `type`。
- 项目开启 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 和 `verbatimModuleSyntax`。边界数据先以 `unknown` 接收并验证；不要用 `any` 或宽泛类型绕过合同。
- 可选字段不存在时通常使用条件展开，不要显式写入 `undefined`。
- 公共数据和 metadata 延续现有的 `readonly` / `Object.freeze` 语义；不要暴露调用方可变的内部对象。
- 公共函数给出清晰返回类型。错误文本和测试名称沿用相邻文件的中文风格，标识符和协议字段保持英文。
- 使用 Bun/Web 标准 API 和现有依赖。未经请求不要添加依赖。
- 长生命周期资源必须可关闭：server、watcher、browser、runtime、fixture 和 WebGL 资源都应在错误路径上释放。

### 不要把 artifact 约束误用于基础设施

SDK 本体为了实现功能可以直接导入 `react`、`three`，CLI/World 客户端可以访问网络，preview UI 可以使用浏览器事件循环。真正的约束边界是“被 Fourier 宿主编译并逐时刻采样的 artifact 代码”：其输出必须仅由稳定输入和宿主绝对时间决定。

因此，修改 runtime 或编译边界时必须继续阻止 artifact 使用未受控的网络、墙钟时间、随机数、timer、原生 WAAPI、媒体 seek 和增量式逐帧状态；不要因为 preview app 自己使用了 `requestAnimationFrame` 就放宽 artifact 合同。

## Artifact 编写规则

详细流程和模板必须阅读 [`docs/AGENT_SDK_GUIDE.md`](docs/AGENT_SDK_GUIDE.md)。以下是不可违背的最小集合：

- React/Motion 源文件默认导出唯一的 `defineReact()` 或 `defineMotion()` definition，使用 `component`，不能恢复旧 `render` 入口。
- schema 是 props 的单一事实来源；无默认值字段必须出现在 `designPreview().props` 中。
- Motion 必须显式选择：普通/Text Motion 使用 `supportsTextMotion: false | true`，声明 `true` 时实现独立 `textComponent`；FFmpeg Video Motion 使用 `videoComposition: "ffmpeg"`，不能再声明 text 能力或 overlay。
- artifact 的 React hooks/types 只从 `@fourier-video/sdk`、`/react`、`/motion` 或 `/three` 导入；Three.js class、loader 和类型只从 `/three` 导入。不要在 artifact 中直接依赖 `react` 或 `three`。
- 动画使用一个 `FourierMotion` 根或一次 `useFourierLifecycle()` + `useFourierTimeline()` 注册。不要调用原生 `element.animate()`。
- 3D 的异步加载放在 `FourierCanvas.onCreate`；`onFrame` 保持同步，并由 `timeSeconds` / `timeMilliseconds` / `progress` 直接计算状态，禁止 `+=` 累加。
- 随机效果使用 `createFourierPrng()` 和稳定 seed。禁止在采样路径使用 `Date`、`performance.now()`、`Math.random()`、timer、网络或自行驱动 media/SMIL。
- 素材和字体使用本地相对 import 或 data URI；浏览器不能直接读取 `.blend`，应使用 GLB/GLTF。
- 根元素显式覆盖画布尺寸；没有设计底色时保持透明。
- 生产画面完全不随宿主时间变化的 React artifact 声明 `static: true`，且不能注册 lifecycle、animation、media、SMIL 或 render driver。
- 不创建第二套 preview renderer、逐帧截图服务或独立 preview config；`designPreview()` 是预览样例输入的事实来源。

## 测试策略

先跑最窄的相关测试，再扩大范围。Bun 可以直接接收测试文件：

```bash
bun test tests/definitions.test.ts
bun test tests/world-client.test.ts tests/world-manifest.test.ts
```

按改动类型选择验证：

| 改动 | 必做验证 |
| --- | --- |
| schema、definitions、纯工具函数、World 或 CLI | 相关 `bun test tests/<name>.test.ts`，再运行 `bun run typecheck` |
| 公共类型、overload、exports | `bun run typecheck`；保留或新增 `tests/type-contract.ts` / `tests/universe-type-contract.tsx` 中的正反类型合同 |
| runtime、Motion、Three.js、Universe、testing、真实 preview runtime | 相关单元测试 + `bun run test:dom` + `bun run typecheck` |
| build、package exports、新子路径 | `bun run build`，并检查目标入口确实生成；同时运行 `bun run typecheck` |
| artifact 示例 | 对应 `example/*.test.ts` 或 `openArtifact()` 确定性测试 + `bun run typecheck`；视觉任务再检查 preview 的开始/中间/结束和乱序 seek |
| 发布前或发布相关 | `bun run prepack`；World package 先执行 `fourier-sdk publish <dir> --dry-run` |
| 仅文档 | 检查相对链接、命令和当前代码一致；不声称代码测试已通过 |

常用全量命令：

```bash
bun run typecheck
bun test
bun run test:dom
bun run build
# 上述全部：
bun run prepack
```

注意：

- `bun test` 中的浏览器 DOM suite 默认 skip；只有 `bun run test:dom` 才会设置 `RUN_DOM_TESTS=1`。
- DOM 测试依赖 Core 及其固定 Chromium。若浏览器、系统能力或依赖缺失，记录失败原文和未验证范围，不要把 skip 或环境失败写成 PASS。
- 测试创建的 fixture、server、browser 和临时目录必须在 `finally` / cleanup 中关闭。
- `openArtifact()` 接收源码绝对路径；`assertDeterministic()` 每次必须且只能提供非空 `frames` 或 `times` 之一。
- 只有需要人工视觉检查时才启动长驻 preview。不要把“服务器能启动”当成像素或确定性测试。

## World 与外部副作用

- `publish --dry-run` 是首选的本地发布校验。
- `login` 会写本地凭据；真实 `publish` 会上传并创建 review；`add` / `del` 会修改目标项目。除非用户明确要求，不要替用户执行这些命令。
- 不打印 token、密码或凭据文件内容。认证相关测试使用临时目录或现有 mock。
- 不改远端版本、不发布 package、不提交或推送 Git，除非用户明确授权。

## 完成标准

交付前：

1. 查看 `git diff --check`、`git diff -- <本次文件>` 和 `git status --short`，确认没有覆盖用户改动或混入生成物。
2. 实际运行与改动匹配的最小测试，并尽可能运行 `bun run typecheck`；ABI/runtime/release 改动按上表扩大验证。
3. 确认公共 API、测试、文档和示例没有相互矛盾。
4. 最终回复列出改动文件、关键合同、实际执行的 PASS 命令，以及未运行项目和原因。不得把未执行、skip 或失败的检查描述为通过。

## 事实来源

- [`README.md`](README.md)：安装、核心能力、快速示例和维护命令。
- [`docs/API.md`](docs/API.md)：公开 API 与类型行为。
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)：artifact ABI、确定性和测试硬约束。
- [`docs/AGENT_SDK_GUIDE.md`](docs/AGENT_SDK_GUIDE.md)：Agent 编写 React/Motion/Text Motion/Three.js artifact 的完整流程与模板。
- [`docs/PUBLISHING.md`](docs/PUBLISHING.md)：Fourier World package、认证、dry-run 和发布流程。
- [`example/README.md`](example/README.md)：可运行示例索引。

当文档与实现不一致时，不要默默选择其一：用类型、测试和实际代码确认当前行为，并在同一次改动中修正文档，或明确向用户报告冲突。
