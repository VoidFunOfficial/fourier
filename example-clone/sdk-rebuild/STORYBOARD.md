# Work / Play 参考片复刻

参考文件是用户提供的 `../clone.mp4`，1280×720、24 fps、457 个画面帧。复刻版画布为 1920×1080 / 60 fps，复刻部分为 19.05 秒，追加片尾后总长 23.05 秒，保留镜头顺序、内容、原始音轨与作者署名。转换帧率时，切点四舍五入到最近的 60 fps 帧。

| Scene | 输出帧区间，左闭右开 | 场景与局部运动 |
| --- | --- | --- |
| 01-orbit | 0–190 | 柔焦色场中出现八个工具图标；倾斜环绕、压成侧向队列、放大四枚图标、落到左侧。 |
| 02-edit | 190–495 | 图标变成轨道。色条伸展、指针裁切绿色片段、错位复制、交换合成轨道、播放头扫过。 |
| 03-export | 495–660 | 深色画面，进度条变细，彩色填充从 0 到 100%；快速推近圆角和百分比。 |
| 04-switch | 660–745 | 色条收成胶囊，暗玻璃变为银白金属；沙漏与四色圆点出现。 |
| 05-play | 745–878 | 蓝绿色光晕和定位线显出游戏面板，能力条增长；镜头推向 Continue，彩色指针点击。 |
| 06-playstation | 878–938 | 保留参考片 PlayStation 标志，轻微缩放回落。 |
| 07-work-play | 938–1093 | Work / 四色圆点 / Play 静置收尾，缓慢后退。 |
| 08-credit | 1093–1143 | 保留参考片的小号 yukaji 署名。 |
| 09-this-video | 1143–1383 | 复用 ad-apple 的 4 秒 this video / 完全由 Fourier Harness + GPT6 / 独立完成 场景与对应音效。 |

## 实现方式

遵循 `fourier-best-pratice.md` 的 Scene → Component → Motion → Render 流程。`main.tsx` 仅组合 Scene 与音轨；`shots.ts` 仅记录场景顺序和帧数。每个 Scene 有独立工程入口及默认导出的 `defineReact` artifact，可单独预览、乱序采样和渲染。

公共视觉能力位于 `components`：Stage、Icons、Chromatic、MetalSwitch、GamePanel。动画由单个 FourierMotion 根下的声明式 motion 元素驱动。所有轨迹由场景局部关键帧或确定性几何函数产生，没有墙钟、随机逐帧状态、网络或另建时间轴语言。

优先搜索并检查了本地 Fourier Styles、Fourier-ad 的窗口、光效、卡片和指针实现。复用了 GrainyMatteGradient 的 `sonduckMatteBlobFrames`，局部快照位于 `components/reused/matte-motion.ts`；复用了 Fourier-ad 的原始光标 SVG。现有窗口与加载卡片的外观和参考片不同，金属开关和游戏面板使用专门组合，保留参考片留白。

字体来自本机 Apple SF Pro 和 Fourier-ad 的 Montserrat Medium，经本地子集化后由 SDK loadFont 加载。人物剪影与 PlayStation 标志从用户给定参考帧提取并平滑为 SVG 轮廓。全部轨道、布局、图标、镜头和形变均重新构建，参考视频及其完整画面没有被作为视觉层导入。声音直接复用用户提供的参考音轨。

## 复查

先校验类型和工程，再通过 SDK `openArtifact` 检查开始、代表、结束画面，并以相反顺序再次取帧核对 SHA-256。发现的尺寸单位、镜头缓动与遮挡问题在对应组件内修正。整片导出后，`verify-media.py` 检查编码分辨率、帧数、音轨、九场景连续拼接，并生成 16 个时点的参考/复刻对照图。

这是基于参考片重新搭建的可编辑 MG 工程；曲线、材质和字形经过近似重建，不宣称与原始制作工程逐像素相同。

最终打磨根据参考帧的图标中心建立姿态测量数据，以三次 Hermite 插值保证路径在关键姿态间平滑。SVG 轮廓保留锐角，仅柔化曲线段；开关、进度条及光晕分别由其 Scene 的局部 Motion 控制。编码音轨直接从 PCM 封装，并核对其与源音轨的波形相关度。

新增场景直接复用 `ad-apple/templates/ending/scenes/20-credits` 的视觉源码，依赖在本目录快照保存。Stage 保留原来的 1920×1080 设计坐标、背景、Apple SF Pro 与 Heiti 字体。场景的 Canvas 元数据适配父工程，Stage 内实际背景仍为原片尾的浅白色。音轨由 19.05 秒参考片 PCM 与 ad-apple 主音效的 71–75 秒片段顺序拼接，最终封装保持采样时序。
