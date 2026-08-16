# SDK ABI v1 Examples

示例都生成 ABI v1 marker，并由标准 path runtime 在浏览器中直接渲染。

示例中的 React hook 和类型全部从 SDK 子路径导入；把文件复制到没有 `package.json`/`node_modules` 的视频工程也无需安装 React。

[`publish`](./publish/README.md) 包含 32 个可直接上传到 Fourier World 的独立组件包。每个目录都有自己的 `package.json`、`files` 归档清单、源码和本地依赖，可以运行 `fourier-sdk publish <目录>`；普通本地 artifact 不需要该文件。按要求，`FourierGallery3D` 与 `CinematicPageFlip3D` 未纳入发布集合。

这些示例优先使用 SDK [`placeholder`](../placeholder) 目录中的本地占位资源：Motion 和窗口组件从 [`pic`](../placeholder/pic) 导入图片，3D 示例从 [`3d_model`](../placeholder/3d_model) 导入 GLB。这样可以直接验证图片 readiness、静态资源打包和无网络预览；作者复制示例到独立组件时，也应把用到的资源一起复制到组件自己的 `assets/` 目录。

## Example3D

[Example3D.tsx](./Example3D.tsx) 只从 `@fourier-video/sdk/three` 导入 React hook、Three.js、`GLTFLoader` 和 `FourierCanvas`。它加载 [`Low+Poly+Earth.glb`](../placeholder/3d_model/Low+Poly+Earth.glb)，自动居中缩放模型，并用 Fourier 的绝对 `progress` 旋转地球：

```bash
bun run preview ./example/Example3D.tsx --open
fourier check ./example/Example3D.tsx
```

`onCreate` 负责异步加载本地 GLB，初始化完成前 Fourier 不会截图；`onFrame` 不运行自己的动画循环，而是在预览、拖动和导出的每一个宿主时间点同步设置模型姿态。

## Universe Architecture

[UniverseArchitecture.tsx](./UniverseArchitecture.tsx) 把四个普通 React 模块放进 World Space，Camera 依次使用 Bezier、Curve、Arc 和 Linear path 聚焦 Backend、Render Engine、Visual Cache 与 GPU Worker。示例只理解 SDK；render-engine 继续使用标准 DOM timeline 采样和截图。

```bash
bun run preview ./example/UniverseArchitecture.tsx --open
```

## Hitchcock Poster Montage 3D

[CinematicPageFlip3D.tsx](./CinematicPageFlip3D.tsx) 在一个无边框 Three.js 场景中逐张
闪现 11 张本地海报。Universe Camera 全程沿单一轨迹缓慢退镜；Three.js Camera 同步后移
并连续收窄 FOV，形成希区柯克 dolly zoom。海报主体尺寸保持稳定，纵深背景持续变化，
切图瞬间叠加短促闪白与方向性动态模糊，全部状态只由 Fourier 绝对时间决定。

```bash
bun run preview ./example/CinematicPageFlip3D.tsx --open
fourier check ./example/CinematicPageFlip3D.tsx
```

## Rolling Text 3D

[RollingText3D.tsx](./RollingText3D.tsx) 使用两个完整的 3D 文字面完成挤压切换：新字
固定上边缘向下展开，旧字固定下边缘向后压薄；两者在中间重叠，由新字覆盖旧字，落地时
带轻微过冲和回弹。静止阶段只渲染落稳的完整文字。`text` 接受一至四行文字，`font`
接受本地 TTF、OTF、WOFF 或 WOFF2；所有状态由 Fourier 绝对进度直接计算。

```bash
bun run preview ./example/RollingText3D.tsx --open
fourier check ./example/RollingText3D.tsx
```

## 声明式常用动画

下面这些 example 只从 `@fourier-video/sdk/motion` 导入，不安装第三方 Motion 包，也不引用 SDK `src`：

- [ElegantEntranceMotion.tsx](./ElegantEntranceMotion.tsx)：fade、rise、zoom、blur、clip reveal 五种常用入场，可调距离、柔化和回弹。
- [CinematicDriftMotion.tsx](./CinematicDriftMotion.tsx)：适合图片/视频的 Ken Burns 漂移、缓慢推进、掠光和暗角。
- [StaggerTextMotion.tsx](./StaggerTextMotion.tsx)：原始文本逐字符错落出现，并为普通 React/image subject 提供柔和降落路径。
- [BouncyTextMotion.tsx](./BouncyTextMotion.tsx)：文字从下方逐字蹦出，以拉伸、落地挤压、二次回弹和交替摇摆形成生动可爱的入场节奏。
- [Expand2LR.tsx](./Expand2LR.tsx)：所有字形从文字中心聚拢态向左右成对展开，带中心先行的波纹节奏、柔焦和轻微回弹；支持多行文本与普通 React subject。
- [SlidingLightMotion.tsx](./SlidingLightMotion.tsx)：固定长度的荧光光条从文字左侧露出一小段后向右移动；拖尾从左侧低透明度连续增强到右侧高亮头，文字在亮头经过时从光条内透出并完整保留，亮头抵达文字结尾时整条消失。
- [MarkerHighlightMotion.tsx](./MarkerHighlightMotion.tsx)：包裹任意 React 节点，用带不规则边缘、纸面纹理和移动笔尖的马克笔从左向右涂抹高亮；颜色、位置、粗细、倾斜、浓度和混合模式均可调。
- [OutlineDraw.tsx](./OutlineDraw.tsx)：从透明图片的 alpha 通道自动提取最大外围（示例使用 `human.png`），再从指定周长百分比起点画满一圈粗线；颜色、粗细、外扩、平滑、线帽、透明度和发光均可调。直接传 `<img>` 时自动使用它的 `src`，复杂 subject 可另传轮廓蒙版。
- [OutlineLight.tsx](./OutlineLight.tsx)：复用 `OutlineDraw` 的透明图片 alpha 外围提取，只显示一根沿轮廓移动的短光条，不显示底轨或运动残影；光条长度、粗细、颜色、发光范围、方向和绕行圈数均可调。
- [ColorWipe.tsx](./ColorWipe.tsx)：全画布透明转场层，可切换横屏/竖屏、正反方向、三色循环、1—8 层、层间错位、遮挡停留与边缘斜度；在时间轴中点切换前后场景即可完成 Color Wipe 转场。
- [ColorWaveWipe.tsx](./ColorWaveWipe.tsx)：接收 `string[]` 颜色列表，每种颜色对应一条；所有横向长方条的左边缘都固定在 `x=0`，并在第 0 帧同时以相同的高速向右延伸。默认中心条初始仅 1%，长度向上下两边逐条递增、相邻条最多增加 20 个百分点，形成严格中心对称；默认 5 色轮廓为 41% / 21% / 1% / 21% / 41%。最慢一条约在时间轴 12% 即完成，抵达后立即静止。
- [SmoothChange.tsx](./SmoothChange.tsx)：接收两张图片，第一张在 Generate-Fill 阶段快速高频抖动；第二张继承相同抖动相位，并通过互补透明度的 SmoothAlpha 曲线无缝接管后稳定。设计预览使用 `mail-draft.svg` 与 `mail-ready.svg`。
- [ColorRotation.tsx](./ColorRotation.tsx)：从初始颜色开始，按顺序执行最多 6 次全画布换色；每次都能独立设置下一颜色与左上、右上、左下、右下圆心。旋转的是扇形颜色分界线而非矩形色板，每段使用连续的缓入缓出曲线平滑扫满画面。
- [ColorDropIntro.tsx](./ColorDropIntro.tsx)：横屏多色块开场，1—8 个纵向色块按秒级错位从上方落下，在底部急刹、挤压并回弹；八个颜色槽、间距、内容位置、下落时长和刹车强度均可调，`contents` 接受与色块顺序对应的 ReactNode 数组。
- [ColorDropIntroNext.tsx](./ColorDropIntroNext.tsx)：在所有色块落稳后，用 `selectedBlock` 选择一个色块蓄力展开到全屏；其余色块按距离接收碰撞波，先被横向挤压，再带过冲地推出画面。展开时长、落稳停顿、碰撞强度和碰撞传递延迟均可调。
- [BallReaction.tsx](./BallReaction.tsx)：横屏黑底球体反应动画，20 个带元素符号的 SVG 矢量蓝边白心发光球按列出现、激烈碰撞、汇聚成一个球并无损放大至白屏；第一行拼出 `F O U Re Er`，通过 `loadFont()` 携带本地字体。
- [BackgroundWaveShare.tsx](./BackgroundWaveShare.tsx)：1920×1080 深色密集像素方格；单个全屏 GPU shader 按每个方块到画面中心的真实距离计算变橙和下落时刻，以 3 秒快速循环共同形成持续向外传播的同心光波。最上层使用覆盖全画布的可调 Gaussian blur，画面没有圆形遮罩或独立光环；离开波峰后方块回到灰色原位。
- [AuroraFlux.tsx](./AuroraFlux.tsx)：把参考 FLUX 网页 AURORA 卡片的 WebGL 材质扩展为 1920×1080 全屏背景；保留原始 5 层 FBM、域扭曲系数、0.22 流速、14.7 种子以及青绿 / 蓝 / 紫浮点配色，只把时间源替换为 Fourier 绝对时间。毛玻璃直接模糊并放大 WebGL 色场，再覆盖半透明白膜，避免离屏捕获时 `backdrop-filter` 丢失 WebGL 合成层；同配色静态 fallback 保证初始化异常时画面仍可见。
- [LightEffectCard.tsx](./LightEffectCard.tsx)：参考蓝色胶囊按钮造型的圆角光效卡片，使用柔和外光晕、轻微明暗层次和低透明度表面掠光；`text`、`glowColor` 与 `fillColor` 分别控制文字内容、光效色和卡片填充色。
- [VerticalChooser.tsx](./VerticalChooser.tsx)：竖向选择器的焦点药丸固定在画面中心，七项内容以 outQuint 明显减速吸附并在每次落定后完全静止；字号、透明度和灰度按中心距离分层，落定瞬间只有药丸做极轻 `scaleY` 呼吸。

它们用一个 `<FourierMotion>` 承担 lifecycle，再由多个 `motion.*` element 声明动画。关键帧始终由 Fourier 宿主按绝对时间采样；示例可以直接在组件库预览中循环播放：

```bash
bun run preview ./example
```

## GlitchMotion

[GlitchMotion.tsx](./GlitchMotion.tsx) 展示：

- `useFourierLifecycle()` 恰好注册一次 Motion lifecycle。
- `supportsTextMotion: false` 显式声明该图片故障效果不接受文本宿主。
- `useFourierTimeline()` 注册 root/cyan/magenta 三组宿主控制 WAAPI。
- `createFourierPrng()` 配合稳定 seed 一次生成 glitch keyframes。
- subject、schema、同步 preview descriptor 和 design preview。

```bash
bun run preview ./example/GlitchMotion.tsx --open
fourier check ./example/GlitchMotion.tsx
```

## TextGlowMotion

[TextGlowMotion.tsx](./TextGlowMotion.tsx) 展示标准 Text Motion 写法：

- `supportsTextMotion: true` 显式声明支持文字宿主。
- 独立的 `textComponent({ text, props })` 接收原始文字，自行完成排版和动画。
- `useFourierTimeline()` 注册从左向右扫过文字的 WAAPI 光带。
- 普通 `component({ subject })` 单独实现非文字宿主，不与 Text Motion 混用渲染逻辑。
- `designPreview().subject` 直接传 string，SDK 自动选择 `textComponent`。

```bash
bun run preview ./example/TextGlowMotion.tsx --open
fourier check ./example/TextGlowMotion.tsx
```

## Expand2LR

[Expand2LR.tsx](./Expand2LR.tsx) 是从中间向两边展开的 Text Motion：

- `textComponent` 按每一行的视觉中心计算字形初始位移，中心字形先稳定，外侧字形成对向左右展开。
- 左右细光线从中心同步延伸，字形使用柔焦、横向压缩与轻微过冲完成自然回弹。
- 字号、字重、字距、行距、颜色、柔化与回弹强度都由 schema 控制。
- 普通 `component({ subject })` 使用独立的对称展开路径，不猜测 subject 类型。

```bash
bun run preview ./example/Expand2LR.tsx --open
fourier check ./example/Expand2LR.tsx
```

## Windows7Window

[Windows7Window.tsx](./Windows7Window.tsx) 是静态 ABI v1 React：

- 用 `useFourierContext()` 读取稳定 width/height。
- `field.node()` 提供 title/icon/content 编程插槽。
- 没有 lifecycle 或 animation，因此 runtime 只采样一次并跨时间复用 PNG。

```bash
bun run preview ./example/Windows7Window.tsx --open
fourier check ./example/Windows7Window.tsx
```

## VideoPanel

[VideoPanelHand.tsx](./VideoPanelHand.tsx) 是一个平面的手绘视频 Motion：

- 设计预览直接使用 [`placeholder/video/1.mp4`](../placeholder/video/1.mp4)。
- 多圈铅笔线聚拢在同一条边缘带内，每圈预先生成三次约 1–2px 差异的重描轮廓。
- 三套轮廓以约 8fps 持续离散切换，各圈切换时间略微错开，形成贯穿时间轴的逐帧重描扭动。
- 视频保持稳定，线框同步进行连续两轮不到 0.2% 的非等比缓慢收放和极轻明暗起伏，让画面始终保持呼吸感。
- 轮廓沿视频边缘的外法线留出默认 10px 间距，重描抖动时也不会贴住画面。
- 可调铅笔色、圈数、粗细、疏密、线框间距、粗糙度、呼吸幅度和圆角。

```bash
bun run preview ./example/VideoPanelHand.tsx --open
fourier check ./example/VideoPanelHand.tsx
```

## Tests

```bash
bun test ./example/examples.test.ts
bun run test:dom
```

普通测试检查 ABI marker/schema/descriptor；DOM 测试通过 `openArtifact(entryPath)` 对真实示例采样和验证确定性。
