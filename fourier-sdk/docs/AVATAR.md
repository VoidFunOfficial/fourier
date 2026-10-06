# Fourier Avatar

`@fourier-video/sdk/avatar` 是由 Fourier 绝对时间驱动的 2D 角色运行时。它提供标准参数、语义动作、参数混合、PNG 图层、父子变形节点、三角网格 BlendShape、透明遮罩、预计算口型和 60 Hz 弹簧。预览和最终视频共用已有 Core 宿主；运行时没有自己的播放时钟。

## 使用 voidavatar

已有角色通过 `example/voidavatar/index.ts` 提供 `VoidAvatar` 组件、`createVoidTimeline(options = {})` 与包含完整 rig 的 `createVoidBackend()`。普通场景无需组装 Core、模型和后端。以下片段位于 `example/` 下的 `defineReact({ component })` 中：

```tsx
import { VoidAvatar } from "./voidavatar/index.ts";

<VoidAvatar
  position={[480, 285]}
  scale={.32}
  animation={{ expression: "happy", hands: { right: "magicWand" } }}
/>
```

`animation` 支持时长、表情、语义动作、人物／猫咪幅度、左右手道具和独立眉毛。也可传 `timeline` 替代 `animation`，二者互斥；无需重复传时长和动作。动画时长不改变宿主 composition，需自行匹配场景时长。组件默认 12 秒、自信表情、双手空手；主展示文件 `VoidAvatar.tsx` 明确默认右手魔法棒。

角色组件的 `animation`、`timeline` 和 `mode` 在挂载时固定；替换它们应使用新的 React `key`，布局属性可更新。

默认模式的既有 Cubism 资源位于 `example/voidavatar/cubism/`，独立原生视图的新导出位于 `cubism-native/`，来源与哈希见各自的 `provenance.json`；默认模式的重绘眼眉和十种透明道具在 `art/`。详细使用与迁移见 [VoidAvatar Agent 教程](../../fourier-avatar/AGENT_GUIDE.md)。

```bash
# 在 Fourier-Project 根目录运行
bun run preview:avatar --demo=idle
bun run verify:avatar --demo=props
```

下文描述通用 SDK `Avatar`，仍适用于任意模型。`position` 是画布中的角色中心，`scale` 是模型像素到画布像素的比例；省略时按画布等比适配。`opacity` 控制整个角色；`gesture` 接受单个动作名或动作数组，`timeline` 可传入预先编译的时间轴。模型与时间轴配置在挂载时固定，新配置应创建新实例。

## 参数和动作

标准参数由 `AVATAR_PARAMETERS` 导出。头部、身体、视线、眉毛、手臂与手部通常为 `[-1,1]`，睁眼、张嘴、微笑与呼吸为 `[0,1]`；每帧最终值会限制在模型声明的范围内。模型可通过 `parameters: { Custom: [min,max,default] }` 定义附加参数。

`avatarMotion()` 提供 `idle / nod / shakeHead / lookAt（作为 action） / point / thinking / explain / wave / emphasize` 对应能力。`lookAt`、`emotion`、`react`、`smile`、`surprised`、`speak` 和 `motion` 是额外的语义 action。Agent 只需声明动作、目标和时间，不必直接改变网格。

目标 `camera` 是 `[0,0]`；命名目标由 `targets` 映射到 `[-1,1]` 的视线坐标，X 向右、Y 向下。未知目标或动作、越界时间以及负时长会立即报 `INVALID_AVATAR`。

混合顺序：默认值 → idle 呼吸与眨眼 → 基础表情／视线 → 按 `priority` 从低到高的 action（相同优先级按输入顺序）→ 口型 → 显式 `parameters` → 弹簧输出。曲线支持线性、smoothstep、阶梯插值，轨道支持 `replace / add / multiply`。自定义 motion 可循环；非循环 motion 按 action 时长缩放。action 在结束时返回基础状态。

```ts
const timeline = compileAvatarTimeline(model, { duration: 12, seed: 7, actions });
const params = timeline.sample(3.5);
```

重复、倒序或分散采样同一时刻会得到相同参数。弹簧输入在编译时按 1/60 秒烘焙，使用稳定的隐式积分；任意采样率读取相同的缓存。最长单条时间轴为 3600 秒。

## 模型格式

`defineAvatar(unknown)` 校验并深拷贝、冻结输入。`version: 1`，`canvas: [width,height]`，`name` 和 `layers` 必填。

图层支持 `id / parent / texture / size / position / anchor / rotation / scale / opacity / zIndex / masks / invertedMask / maskOnly / mesh / bindings`。旋转单位为度，锚点以图层本地像素表示。省略 texture 的节点是父级变形节点。父级变换、透明度和层级会传给子节点。引用不存在的父级／遮罩或父级环会被拒绝。

`texture` 应通过本地图片 import 绑定为 Fourier 资源 URL。PNG 文件若已裁切，必须用实际 PNG 尺寸作 `size`，用原画布局作 `position`；不要把裁切图当成完整画布。

```json
{
  "version": 1,
  "name": "example",
  "canvas": [800, 800],
  "layers": [{
    "id": "face", "texture": "textures/face.png",
    "size": [300, 300], "position": [400, 300], "anchor": [150, 150],
    "bindings": [{"parameter":"HeadRoll","property":"rotation","keys":[{"t":-1,"value":-12},{"t":1,"value":12}]}]
  }]
}
```

`bindings.keys[].t` 是输入参数值。其余时间曲线中的 `t` 是秒。`mesh.vertices` 和 `mesh.uvs` 是平铺 XY／UV 数组；`indices` 是三角形索引；`blendShapes` 将参数名映射到等长顶点位移数组。每帧都从基础顶点重新计算，不累积变形。

`masks` 是图层 ID 数组，组合其纹理 alpha 的并集；`maskOnly` 隐藏遮罩层自身，`invertedMask` 反转结果。遮罩采样其原始几何和透明度，不递归应用遮罩自身的 masks。渲染器为 WebGL2，失败会明确报告 `AVATAR_WEBGL_UNAVAILABLE`。

`motions` 和 `expressions` 是命名数据字典，`physics` 是 `{input,output,stiffness,damping,mass?,gain?}` 数组。弹簧输出必须唯一，不允许反馈环。可将这些数据分开保存再通过本地 JSON import 组装成模型。

## 离线口型与缓存

`speak` 接收 `AvatarSpeech`，不在每帧识别音频或调用 TTS。先使用现有 TTS 生成音频，然后运行：

```bash
bun fourier-avatar/scripts/prepare-speech.ts narration.wav narration.speech.json phonemes.json
# 没有音素时间戳时省略最后一项，使用预计算的音量包络近似张嘴
```

`phonemes.json` 为 `[{"start":0.12,"end":0.19,"phoneme":"a"}]`。工具解码音频并把音频 SHA-256、对齐文件与算法版本组成缓存键；重复运行会复用未变更的 sidecar。无音素时会明确标记 `amplitude-fallback`，它不代表音素识别。

`phonemesToSpeech()`、`pcmToSpeech()` 和 `defineAvatarSpeech()` 可独立调用。Viseme 为 `sil/A/I/U/E/O/M/F`，支持强度和短过渡；时间戳之间的空白及音频前后都关闭嘴部。原始文本不是合法的 `speak` 输入，TypeScript 和运行时都会要求预先准备的数据。音频仍由工程的 `Audio` 层负责播放／合成。

## Cubism 直接导入

```tsx
import { Avatar } from "@fourier-video/sdk/avatar";
import voidavatar from "./voidavatar/voidavatar.moc3";

<Avatar model={voidavatar} expression="happy" gesture="nod" />
```

也支持导入同一导出包的 `.model3.json`。单独的 moc3 不含纹理，必须保留 Cubism 导出的目录结构：

```text
voidavatar/
  voidavatar.moc3
  voidavatar.model3.json
  textures/texture_00.png
```

默认 `natural` 模式保留 `voidavatar/cubism/` 中的既有导出：20 个原始网格、1 张 4096 图集、28 个参数。已确认 `ParamAngleX`、`ParamAngleY`、`Param_Angle_Rotation2` 三个原生参数驱动完整的 11 个头部网格，其余身体与次级动作由 Fourier 提供。角色组件的 `mode="source"` 通过独立资源入口查看原生导出；默认 `natural` 模式使用完整后端。

`native-head.ts` 显式映射 `HeadYaw → ParamAngleX ×30`、`HeadPitch → ParamAngleY ×30`、`HeadRoll → Param_Angle_Rotation2 ×(-15)`，其余 Core 通道禁用。身体、发梢、肩口、猫咪、独立眼眉与手持道具通过原有 Avatar/WebGL 路径组合；头部 rig 不重复应用原生头转。`natural-timeline.ts` 使用绝对时间曲线和弹簧预热支持循环及乱序采样。

默认模式的女孩使用透明画稿提供 13 种眼部表情和独立眉毛，眨眼在开、半、闭画稿之间混合；猫眼沿原图集局部网格变化，保留嘴部与轮廓。袖子锁定肩口、渐变弯曲；道具追踪弯曲后的手掌，并与身体接受同一次变换。这些 Fourier 后端继续使用既有模型，不依赖新原生导出的绑定。

`rig` 是 `AvatarModel` 格式的变换节点图；其 `canvas` 必须和 backend 一致，节点 ID 对应已有 drawable ID，额外父节点用于组合变换。该模式不接受 `texture / size / mesh / masks / invertedMask / maskOnly`，这些信息保留自 backend。未匹配的叶节点会报错，未指定的原网格原样保留。锚点与位置以 backend 画布坐标表示；设置 `position === anchor` 可得到中性枢轴，子节点直接作用于已有画布顶点，不再次加上父级锚点。透明度相乘、层级相加，其余 UV、索引、遮罩和混合模式保持原值。

传入 `rig` 时，其 motions、expressions、parameters 和 physics 作为时间轴模型；`timeline` 仍可显式覆盖。低层 `createAvatarMeshRig(backend, rig)` 可单独使用，包装后负责 backend 的释放。每次 sample 从底层当前样本重新变换，不积累顶点状态。

```bash
bun run avatar:inspect fourier-sdk/example/voidavatar/cubism/voidavatar.moc3
bun run verify:avatar --demo=actions
bun fourier-avatar/scripts/render-video.ts --demo=showcase --output ./fourier-avatar/verification/showcase.mp4
```

角色工具统一支持 `--demo=idle|actions|props|showcase|expressions|hair|cat`。检查命令采样代表帧并进行倒序确定性检查；加 `--video` 才导出视频。直接导出使用 production composition，完整 Showcase 为 84 秒；覆盖已有文件需明确传 `--overwrite`。

不再需要为每个角色手工写 backend factory、Base64 包装或标准参数映射。Fourier 在编译阶段收集并固定整套本地资源，模型或纹理改变会进入内容哈希；运行时不访问外网。路径越界、网络资源、符号链接逃逸和不匹配的 Moc 引用会明确失败。

Cubism Core 是单独许可的官方运行库。阅读并同意 [Live2D 软件许可](https://www.live2d.com/en/sdk/download/web/) 后，在仓库根目录执行一次：

```bash
bun run avatar:setup-core --accept-license
```

运行库缓存在 `.fourier/cubism/`，不提交到 Git。编译器校验固定 SHA-256，仅把该官方运行库放入浏览器准备阶段；不会执行模型目录提供的脚本。外部宿主可用 `FOURIER_CUBISM_CORE_PATH` 指向同版本文件，仍需通过校验。未安装时报告 `CUBISM_CORE_REQUIRED`，校验失败报告 `INVALID_CUBISM_CORE`，渲染不会自动下载任何东西。

`CubismAvatarSource` 是 moc 导入的公开类型。自定义参数 ID 可创建 `{ ...model, parameterMap: { HeadYaw: { id: "CustomAngle", scale: 30 }, MouthOpen: null } }`；`null` 禁用通道。低层 `createCubismAvatar({core,moc,textures})` 仍可供已初始化 Core 的应用使用，返回 `supportedParameters` / `unsupportedParameters`。参数存在不代表已经绑定了变形，实际动作效果由导出的模型 rig 决定。

Core 负责参数到网格的计算，Fourier 负责绝对时间、参数混合、透明遮罩与 WebGL 绘制。每次 sample 恢复参数与部件默认值，支持乱序渲染，不继承前一帧。模型名称、参数映射和资源在挂载时固定。

支持常规三角网格、纹理、绘制顺序、透明度、普通／加法／乘法及反向遮罩。不自动播放 `.motion3.json`／`.physics3.json`；Fourier 使用自己的标准时间轴和弹簧。Cubism 5.3 扩展混合／离屏组合不在当前渲染器支持范围内。

这份模型在 `live/model/idle-native-v1/` 的 Viewer 导出包可含 Idle motion 引用；Fourier 复制的 model3 清单刻意仅保留 MOC、纹理和显示信息，实际待机来自 `natural-timeline.ts`。Viewer 的 Idle 播放和 Fourier 的混合待机是两个独立验收对象。

VoidAvatar 的 `natural` 模式由 `cubism-source.ts` 使用这套既有模型与 Fourier 后端；`source` 模式通过独立的 `cubism-native-source.ts` 读取新原生导出。两种模式不共享替换后的模型来源，避免新原生眼眉与既有 Fourier 画稿叠加。`native-controls.ts` 将现有时间轴映射到原生头部、眨眼、眼眉款式、眉毛升降与九路头发关键形；头发复用既有弹簧通道并限幅，不增加独立循环或物理积分。未映射的参数保留导出默认值，physics3、exp3、motion3 仍不会自动执行。

参考：[官方模型资源说明](https://docs.live2d.com/en/cubism-sdk-manual/model-web/)、[Core 与 Framework 的职责](https://docs.live2d.com/en/cubism-sdk-manual/cubism-core-api-reference/)。官方 Core 不属于 Fourier 的 MIT 代码。

## 验证

```bash
cd fourier-sdk
bun test tests/avatar.test.ts tests/avatar-cubism.test.ts
RUN_DOM_TESTS=1 bun test --max-concurrency=1 tests/avatar-dom.test.ts
bun run typecheck
bun run build
```

真实浏览器测试使用 voidavatar 的 MOC3 与图集，另有 Mesh / Mask 测试；资源路径边界和参数映射使用独立单元测试。角色专用测试位于 `example/voidavatar/`，可执行 `bun test example/voidavatar`。验证记录应注明实际命令与结果，不能用旧版本报告代替当前代码检查。

### voidavatar 的专用展示与控制

主示例保留表情、人物／猫咪幅度、动作演示、左右手道具、角色大小及背景八项常用设置。完整类型化接口支持 `animation.brows` 的独立表情、升降与倾斜，以及 `animation.hands` 的大小和握持角度。`catAmount=0` 可让猫咪静止并保持睁眼，不改变女孩动作。

`VoidAvatarActions.tsx` 为 28 秒八段动作；`VoidAvatarProps.tsx` 为 30 秒十种道具展示；`VoidAvatarShowcase.tsx` 的完整 production 演示为 84 秒。表情、发型、猫咪仍有各自的展示入口。具体参数、最小可运行 artifact 和 Agent 工作流程见 [VoidAvatar Agent 教程](../../fourier-avatar/AGENT_GUIDE.md)，展示选择见 [角色 README](../../fourier-avatar/README.md)。
