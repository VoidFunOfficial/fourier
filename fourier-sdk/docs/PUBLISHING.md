# 发布到 Fourier World

`fourier-sdk publish` 会先在本地用 Fourier Render Engine 把 artifact 逐帧渲染为 H.264 MP4，然后把预览视频、源码归档及其语义元数据一起上传到 Fourier World。发布目录必须包含 `package.json`；CLI 不接受用命令行参数临时补齐必填元数据，以保证源码、版本与语义清单可以一起接受代码审查。

当前 Fourier World 使用 Payload `users` 账号登录。账号角色必须是 `admin` 或 `reviewer`，并且 World 中必须已经存在与包名 scope 相同的发布者 namespace。CLI 根据登录凭据获得写权限，根据 namespace 解析发布者，不允许在 `package.json` 中填写 author ID、发布状态或统计数据。

本地渲染需要可用的 Playwright Chromium 和带 `libx264` 的 FFmpeg。可以分别运行 Render Engine 的 `bun run browser:check` 与 `ffmpeg -encoders` 检查环境；渲染失败或预览超过 32 MiB 时不会向 World 提交组件。

## 登录与凭据

交互登录：

```bash
fourier-sdk login --email author@example.com
fourier-sdk whoami
```

本地开发服务器：

```bash
fourier-sdk login --world http://localhost:3000 --email author@example.com
```

CI 不应把密码放进进程参数。可以从标准输入读取密码：

```bash
printf '%s\n' "$FOURIER_WORLD_PASSWORD" | fourier-sdk login --email author@example.com --password-stdin
```

CLI 只保存 World 返回的 token 和账号摘要，不保存密码。凭据默认位于 `~/.config/fourier/credentials.json`，目录权限为 `0700`、文件权限为 `0600`。可用以下环境变量覆盖：

| 环境变量 | 作用 |
| --- | --- |
| `FOURIER_WORLD_URL` | World 服务地址 |
| `FOURIER_WORLD_TOKEN` | 临时 token；优先于本地凭据 |
| `FOURIER_CONFIG_DIR` | 本地凭据目录 |

运行 `fourier-sdk logout` 会删除本地保存的凭据。

## package.json 规范

最小清单：

```json
{
  "name": "@studio/MetricPanel",
  "version": "1.0.0",
  "description": "A detailed description of the component.",
  "license": "MIT",
  "files": ["MetricPanel.tsx", "assets"],
  "fourier": {
    "entry": "./MetricPanel.tsx",
    "type": "card",
    "summary": "在产品视频中展示一组关键指标。",
    "instruction": "需要解释一组结构化指标时使用。",
    "useCases": ["产品发布", "数据摘要"],
    "tags": ["metrics", "product"],
    "style": ["minimal"]
  }
}
```

必填字段：

| 字段 | 约束 | 映射到 World |
| --- | --- | --- |
| `name` | `@namespace/ComponentName`；namespace 为小写，组件名以英文字母开头 | `namespace` + `name` |
| `version` | semver，例如 `1.2.0` | `version` |
| `description` | 非空的详细说明 | `description` |
| `license` | 当前只能是 `MIT` | `license` |
| `files` | 非空的相对文件/目录路径数组，不支持 glob；`package.json` 自动包含 | 源码归档内容 |
| `fourier.entry` | package 目录内存在的相对源码路径 | 发布前编译入口 |
| `fourier.type` | `card`、`motion`、`graphic`、`scene-template`、`other` | `type` |
| `fourier.summary` | 非空，不超过 180 字符 | `summary` |
| `fourier.instruction` | 说明 Agent 何时应选或不应选该组件 | `instruction` |
| `fourier.useCases` | 非空字符串数组 | `useCases` |
| `fourier.tags` | 非空字符串数组 | `tags` |
| `fourier.style` | 1—3 项风格枚举 | `style` |

可选字段：

| 字段 | 约束 |
| --- | --- |
| `fourier.subtype` | 英文标识符 |
| `fourier.negativeUseCases` | 不适用场景字符串数组 |
| `fourier.aliases` | 别名和同义词字符串数组 |
| `fourier.contentDomains` | 内容领域字符串数组 |
| `fourier.mood` | `restrained`、`serious`、`energetic`、`warm`、`playful`、`tense`、`futuristic` |
| `fourier.languages` | `en`、`zh-CN`、`zh-TW`、`ja`、`ko`；新建时省略则由 World 默认为 `en` |

`fourier.style` 可选值为 `minimal`、`corporate`、`editorial`、`cinematic`、`futuristic`、`playful`、`brutalist`、`elegant`、`social`、`hand-drawn`。

`author`、`status`、`qualityScore`、浏览/收藏/采用次数以及数据库 ID 都是平台字段，写入 `package.json` 不会改变它们。每次 CLI 提交都会进入 `review`，只有审核人员能把组件改为 `published`。

## Placeholder 与预览素材

组件尚未接入真实素材时，推荐使用 SDK `placeholder/` 提供的图片、视频、字体和 3D 模型构建设计预览。请把实际引用的文件复制到发布目录内的 `assets/` 或 `fonts/`，使用相对 import，并确保对应目录出现在 `files` 中。不要在 `designPreview()` 中依赖远程 URL；Fourier runtime 默认拒绝网络，World 审核也需要可复现的本地预览。

Placeholder 是样例输入，不是生产默认内容。图片、视频等真实素材应由 schema props、Motion subject 或工程资源传入，避免安装组件后仍固定显示占位素材。

## 校验与发布

先执行不写入服务器的完整校验：

```bash
fourier-sdk publish ./my-component --dry-run
```

CLI 会检查：

1. `package.json` 语法和全部字段约束。
2. `fourier.entry` 存在且没有逃逸 package 目录，包括符号链接逃逸。
3. artifact 可以由 Fourier 编译。
4. `name` 中的组件名等于 `defineReact` / `defineMotion` 的 `name`。
5. Motion artifact 的 `fourier.type` 为 `motion`，React artifact 不冒充 Motion。
6. `files` 覆盖入口的全部本地依赖，归档不包含符号链接、`.git`、`node_modules` 或 `.env*`。
7. 归档最多 500 个文件、解压后 20 MiB、压缩后 10 MiB，并生成 SHA-256。
8. Render Engine 能按 artifact 的画布、时长与 60 fps 时间线渲染全部帧，并编码为浏览器兼容的 H.264/yuv420p MP4；静态 artifact 生成 1 秒视频。
9. 预览 MP4 不超过 32 MiB，并生成 SHA-256。

登录后提交：

```bash
fourier-sdk publish ./my-component
```

上传顺序为源码归档、预览 MP4、组件记录；组件记录会把视频绑定到 `preview` 字段。任一步失败时，CLI 会尽力清理本次新上传的文件。World 发布后，目录页会优先使用该视频并静音循环自动播放。

同一 `namespace + name` 首次提交会创建记录，后续版本会更新现有记录并重新进入审核。`package name + version` 是不可变的：同版本内容不同会被拒绝，必须提升 `version`。只有审核为 `published` 且组件记录指向同版本归档时，公开下载端点才会返回源码包。

## Agent 语义检索

检索只读取已审核发布的组件，不要求登录。CLI 接受自然语言用途描述，以及可重复的风格、领域、情绪和语言筛选：

```bash
fourier-sdk search "产品发布的电影感标题动画" \
  --type motion \
  --style cinematic \
  --domain product-launch \
  --mood energetic \
  --language zh-CN \
  --limit 8 \
  --json
```

未加引号的多个位置参数会合并成一句查询。`--json` 输出 `results`、分页、服务端 latency 和匿名 `queryId`；每个 result 包含 `packageName`、`instruction`、`useCases`、`negativeUseCases`、`downloadable`，以及 `match.score`、`semanticScore`、`keywordScore` 和可解释 `reasons`。Agent 应结合负向场景与 `downloadable` 判断是否采用，不能只看单一分数。

程序化入口使用同一份合同：

```ts
import { searchFourierWorld } from "@fourier-video/sdk/search";

const { results } = await searchFourierWorld("clean data summary card", {
  type: "card",
  styles: ["minimal"],
  limit: 5,
});
```

## 添加和删除项目组件

`add` 不要求登录，只能下载 World 中已审核发布的组件。默认安装到当前项目的 `components/@namespace/ComponentName`，并在项目根目录维护 `.fourier-world.json`：

```bash
fourier-sdk add @studio/MetricPanel
fourier-sdk add @studio/MetricPanel --project ./my-video --dir src/components
```

下载时会校验服务端元数据、10 MiB 上限和 SHA-256，再检查归档内的 `package.json` 包名/版本及所有路径。目标目录已存在时默认拒绝覆盖；明确需要替换时使用 `--force`。

`del` 只处理 `.fourier-world.json` 中登记的组件，并再次核对目标目录内的 package name，避免删除用户自行维护的同名目录：

```bash
fourier-sdk del @studio/MetricPanel
```

默认会把目录移动到项目的 `.fourier-trash`，CLI 输出可恢复路径。确认不需要恢复时可永久删除：

```bash
fourier-sdk del @studio/MetricPanel --purge
```

`remove` 是 `del` 的别名。

完整示例见 [`example/publish`](../example/publish)。
