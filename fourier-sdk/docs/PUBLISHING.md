# 发布 npm 组件包到 Fourier World

Fourier World 不保存组件源码。源码必须先发布到公开 npm registry，SDK 和 World 都会重新解析精确版本、验证 registry 的 SHA-512 integrity，并拒绝无法完整解析的包。World 只保存 npm 引用、审核数据和预览媒体。

## URL 格式

只接受 npmjs.com 精确版本 URL：

```text
https://www.npmjs.com/package/@scope/package-name/v/1.2.3
https://www.npmjs.com/package/@scope/package-name/v/1.2.3#ComponentName
```

包 URL 用于 `publish` 和整包 `add`/`del`；带 `#ComponentName` 的 URL 用于单组件 `add`/`del`。不接受 `latest`、版本范围、tgz URL、其他 registry、查询参数或无效 fragment。

## npm package.json

根 manifest 声明包内 1—50 个组件：

```json
{
  "name": "@studio/fourier-components",
  "version": "1.2.3",
  "description": "Fourier component collection",
  "license": "MIT",
  "files": ["components"],
  "fourier": {
    "schemaVersion": 1,
    "components": [
      "components/MetricPanel/package.json",
      "components/LaunchTitle/package.json"
    ]
  }
}
```

每个成员继续使用原有单组件 manifest：

```json
{
  "name": "@studio/MetricPanel",
  "version": "1.2.3",
  "description": "A reusable metric panel.",
  "license": "MIT",
  "files": ["main.tsx", "assets"],
  "fourier": {
    "entry": "./main.tsx",
    "type": "card",
    "summary": "Metrics at a glance.",
    "instruction": "Use for concise product metrics.",
    "useCases": ["Product launch"],
    "negativeUseCases": ["Long-form analysis"],
    "aliases": ["KPI panel"],
    "tags": ["metrics"],
    "style": ["minimal"],
    "languages": ["en"]
  }
}
```

根包、成员和登录用户必须使用相同 scope；成员版本必须等于根版本。每个成员的 `entry`、`files` 和编译依赖必须留在自己的目录中。

## 发布

先运行 npm 自身的检查并发布：

```bash
npm pack --dry-run
npm publish --access public
```

然后用不可变精确版本 URL 验证和提交：

```bash
fourier-sdk publish https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3 --dry-run
fourier-sdk login --email author@example.com
fourier-sdk publish https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3
```

SDK 会逐一编译所有 artifact 并生成预览。World 再次从 npm 解析同一版本；所有成员进入 review。新版本审核期间旧版本继续可用，全部成员与包审核通过后才原子切换。

## 安装与删除

只有 World 已审核发布的精确 npm release 可以安装：

```bash
# 整包
fourier-sdk add https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3

# 单组件
fourier-sdk add https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3#MetricPanel
fourier-sdk del https://www.npmjs.com/package/@studio/fourier-components/v/1.2.3#MetricPanel
```

无论单组件还是整包，成员都安装到 `components/@namespace/ComponentName`。`.fourier-world.json` v2 记录精确 npm URL 和 integrity；旧 v1 清单没有可验证 npm 来源，必须重新安装。
