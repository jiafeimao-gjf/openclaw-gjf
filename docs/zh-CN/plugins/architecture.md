---
title: "插件开发入门"
sidebarTitle: "入门指南"
summary: "快速创建你的第一个 OpenClaw 插件"
read_when:
  - 你想创建一个新的 OpenClaw 插件
  - 你需要插件开发的快速入门指南
  - 你正在为 OpenClaw 添加新的渠道、提供商、工具或其他功能
---

# 插件开发入门

插件为 OpenClaw 扩展新功能：渠道、模型提供商、语音、图片生成、网络搜索、Agent 工具，或任意组合。

你不需要将插件添加到 OpenClaw 仓库。发布到 [ClawHub](/tools/clawhub) 或 npm，用户通过
`openclaw plugins install <package-name>` 安装。OpenClaw 会先尝试 ClawHub，
自动回退到 npm。

## 前置要求

- Node >= 22 及包管理器（npm 或 pnpm）
- 熟悉 TypeScript（ESM）
- 对于仓库内插件：已克隆仓库并完成 `pnpm install`

## 需要什么类型的插件？

<CardGroup cols={3}>
  <Card title="渠道插件" icon="messages-square" href="/plugins/sdk-channel-plugins">
    将 OpenClaw 连接到消息平台（Discord、IRC 等）
  </Card>
  <Card title="提供商插件" icon="cpu" href="/plugins/sdk-provider-plugins">
    添加模型提供商（LLM、代理或自定义端点）
  </Card>
  <Card title="工具/钩子插件" icon="wrench">
    注册 Agent 工具、事件钩子或服务 — 继续阅读下方内容
  </Card>
</CardGroup>

## 快速入门：工具插件

本指南创建一个注册 Agent 工具的最小插件。渠道
和提供商插件有专门的指南，链接见上方。

<Steps>
  <Step title="创建包和清单文件">
    <CodeGroup>
    ```json package.json
    {
      "name": "@myorg/openclaw-my-plugin",
      "version": "1.0.0",
      "type": "module",
      "openclaw": {
        "extensions": ["./index.ts"],
        "compat": {
          "pluginApi": ">=2026.3.24-beta.2",
          "minGatewayVersion": "2026.3.24-beta.2"
        },
        "build": {
          "openclawVersion": "2026.3.24-beta.2",
          "pluginSdkVersion": "2026.3.24-beta.2"
        }
      }
    }
    ```

    ```json openclaw.plugin.json
    {
      "id": "my-plugin",
      "name": "My Plugin",
      "description": "Adds a custom tool to OpenClaw",
      "configSchema": {
        "type": "object",
        "additionalProperties": false
      }
    }
    ```
    </CodeGroup>

    每个插件都需要清单文件，即使没有配置也不例外。参见
    [清单文件](/plugins/manifest) 获取完整 schema。ClawHub
    发布的规范代码段位于 `docs/snippets/plugin-publish/`。

  </Step>

  <Step title="编写入口点">

    ```typescript
    // index.ts
    import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
    import { Type } from "@sinclair/typebox";

    export default definePluginEntry({
      id: "my-plugin",
      name: "My Plugin",
      description: "Adds a custom tool to OpenClaw",
      register(api) {
        api.registerTool({
          name: "my_tool",
          description: "Do a thing",
          parameters: Type.Object({ input: Type.String() }),
          async execute(_id, params) {
            return { content: [{ type: "text", text: `Got: ${params.input}` }] };
          },
        });
      },
    });
    ```

    `definePluginEntry` 用于非渠道插件。对于渠道，请使用
    `defineChannelPluginEntry` — 参见 [渠道插件](/plugins/sdk-channel-plugins)。
    完整的入口点选项，参见 [入口点](/plugins/sdk-entrypoints)。

  </Step>

  <Step title="测试和发布">

    **外部插件：** 使用 ClawHub 验证和发布，然后安装：

    ```bash
    clawhub package publish your-org/your-plugin --dry-run
    clawhub package publish your-org/your-plugin
    openclaw plugins install clawhub:@myorg/openclaw-my-plugin
    ```

    OpenClaw 也会在 npm 之前检查 ClawHub 对于裸包规范，如
    `@myorg/openclaw-my-plugin`。

    **仓库内插件：** 放置在捆绑插件工作区树下 — 自动被发现。

    ```bash
    pnpm test -- <bundled-plugin-root>/my-plugin/
    ```

  </Step>
</Steps>

## 插件能力

单个插件可以通过 `api` 对象注册任意数量的能力：

| 能力 | 注册方法 | 详细指南 |
| --------------------- | --------------------------------------------- | ------------------------------------------------------------------------------- |
| 文本推理（LLM） | `api.registerProvider(...)` | [提供商插件](/plugins/sdk-provider-plugins) |
| CLI 推理后端 | `api.registerCliBackend(...)` | [CLI 后端](/gateway/cli-backends) |
| 渠道/消息 | `api.registerChannel(...)` | [渠道插件](/plugins/sdk-channel-plugins) |
| 语音（TTS/STT） | `api.registerSpeechProvider(...)` | [提供商插件](/plugins/sdk-provider-plugins#step-5-add-extra-capabilities) |
| 媒体理解 | `api.registerMediaUnderstandingProvider(...)` | [提供商插件](/plugins/sdk-provider-plugins#step-5-add-extra-capabilities) |
| 图片生成 | `api.registerImageGenerationProvider(...)` | [提供商插件](/plugins/sdk-provider-plugins#step-5-add-extra-capabilities) |
| 网络搜索 | `api.registerWebSearchProvider(...)` | [提供商插件](/plugins/sdk-provider-plugins#step-5-add-extra-capabilities) |
| Agent 工具 | `api.registerTool(...)` | 见下方 |
| 自定义命令 | `api.registerCommand(...)` | [入口点](/plugins/sdk-entrypoints) |
| 事件钩子 | `api.registerHook(...)` | [入口点](/plugins/sdk-entrypoints) |
| HTTP 路由 | `api.registerHttpRoute(...)` | [内部实现](/plugins/architecture#gateway-http-routes) |
| CLI 子命令 | `api.registerCli(...)` | [入口点](/plugins/sdk-entrypoints) |

完整的注册 API，参见 [SDK 概览](/plugins/sdk-overview#registration-api)。

需要注意的钩子守卫语义：

- `before_tool_call`：`{ block: true }` 是终止性的，会停止低优先级处理器。
- `before_tool_call`：`{ block: false }` 等同于未做决策。
- `before_tool_call`：`{ requireApproval: true }` 暂停 Agent 执行并通过执行批准叠加层、Telegram 按钮、Discord 交互或任意渠道上的 `/approve` 命令提示用户批准。
- `before_install`：`{ block: true }` 是终止性的，会停止低优先级处理器。
- `before_install`：`{ block: false }` 等同于未做决策。
- `message_sending`：`{ cancel: true }` 是终止性的，会停止低优先级处理器。
- `message_sending`：`{ cancel: false }` 等同于未做决策。

`/approve` 命令同时处理执行和插件批准，具有自动回退功能。插件批准转发可通过配置中 `approvals.plugin` 独立配置。

详情参见 [SDK 概览钩子决策语义](/plugins/sdk-overview#hook-decision-semantics)。

## 注册 Agent 工具

工具是 LLM 可以调用的类型化函数。它们可以是必需的（始终可用）或可选的（用户选择启用）：

```typescript
register(api) {
  // 必需工具 — 始终可用
  api.registerTool({
    name: "my_tool",
    description: "Do a thing",
    parameters: Type.Object({ input: Type.String() }),
    async execute(_id, params) {
      return { content: [{ type: "text", text: params.input }] };
    },
  });

  // 可选工具 — 用户必须添加到白名单
  api.registerTool(
    {
      name: "workflow_tool",
      description: "Run a workflow",
      parameters: Type.Object({ pipeline: Type.String() }),
      async execute(_id, params) {
        return { content: [{ type: "text", text: params.pipeline }] };
      },
    },
    { optional: true },
  );
}
```

用户在配置中启用可选工具：

```json5
{
  tools: { allow: ["workflow_tool"] },
}
```

- 工具名称不得与核心工具冲突（冲突会被跳过）
- 对于有副作用或额外二进制依赖的工具使用 `optional: true`
- 用户可以通过将插件 ID 添加到 `tools.allow` 来启用插件的所有工具

## 导入约定

始终从聚焦的 `openclaw/plugin-sdk/<subpath>` 路径导入：

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

// 错误： monolithic root（已弃用，将被移除）
import { ... } from "openclaw/plugin-sdk";
```

完整的子路径参考，参见 [SDK 概览](/plugins/sdk-overview)。

在你的插件内部，使用本地桶文件（`api.ts`、`runtime-api.ts`）进行内部导入 — 永远不要通过 SDK 路径导入你自己的插件。

## 提交前检查清单

<Check>**package.json** 具有正确的 `openclaw` 元数据</Check>
<Check>**openclaw.plugin.json** 清单文件存在且有效</Check>
<Check>入口点使用 `defineChannelPluginEntry` 或 `definePluginEntry`</Check>
<Check>所有导入使用聚焦的 `plugin-sdk/<subpath>` 路径</Check>
<Check>内部导入使用本地模块，而非 SDK 自我导入</Check>
<Check>测试通过（`pnpm test -- <bundled-plugin-root>/my-plugin/`）</Check>
<Check>`pnpm check` 通过（仓库内插件）</Check>

## Beta 版本测试

1. 关注 [openclaw/openclaw](https://github.com/openclaw/openclaw/releases) 上的 GitHub 发布标签并通过 `Watch` > `Releases` 订阅。Beta 标签格式为 `v2026.3.N-beta.1`。你也可以关注官方 OpenClaw X 账户 [@openclaw](https://x.com/openclaw) 获取发布公告并开启通知。
2. 在 beta 标签出现后尽快用你的插件测试。稳定版之前的窗口期通常只有几个小时。
3. 测试后无论显示 `all good` 还是出现问题，都在 `plugin-forum` Discord 频道的插件线程中发帖。如果你还没有线程，请创建一个。
4. 如果出现问题，打开或更新一个 issue，标题为 `Beta blocker: <plugin-name> - <summary>`，并添加 `beta-blocker` 标签。将 issue 链接放到你的线程中。
5. 向 `main` 分支打开一个 PR，标题为 `fix(<plugin-id>): beta blocker - <summary>`，并在 PR 和 Discord 线程中都链接该 issue。贡献者无法为 PR 添加标签，因此标题是维护者和自动化识别的 PR 端信号。有 PR 的阻塞问题会被合并；没有 PR 的阻塞问题可能会被发布。在 beta 测试期间维护者会关注这些线程。
6. 沉默意味着绿灯。如果你错过了窗口期，你的修复可能会进入下一个周期。

## 下一步

<CardGroup cols={2}>
  <Card title="渠道插件" icon="messages-square" href="/plugins/sdk-channel-plugins">
    构建消息渠道插件
  </Card>
  <Card title="提供商插件" icon="cpu" href="/plugins/sdk-provider-plugins">
    构建模型提供商插件
  </Card>
  <Card title="SDK 概览" icon="book-open" href="/plugins/sdk-overview">
    导入地图和注册 API 参考
  </Card>
  <Card title="运行时辅助函数" icon="settings" href="/plugins/sdk-runtime">
    通过 api.runtime 使用 TTS、搜索、子 Agent
  </Card>
  <Card title="测试" icon="test-tubes" href="/plugins/sdk-testing">
    测试工具和模式
  </Card>
  <Card title="插件清单" icon="file-json" href="/plugins/manifest">
    完整清单 schema 参考
  </Card>
</CardGroup>

## 相关内容

- [插件架构](/plugins/architecture) — 内部架构深入解析
- [SDK 概览](/plugins/sdk-overview) — 插件 SDK 参考
- [清单文件](/plugins/manifest) — 插件清单格式
- [渠道插件](/plugins/sdk-channel-plugins) — 构建渠道插件
- [提供商插件](/plugins/sdk-provider-plugins) — 构建提供商插件
