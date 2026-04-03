---
title: "插件设置和配置"
sidebarTitle: "设置和配置"
summary: "设置向导、setup-entry.ts、配置模式和 package.json 元数据"
read_when:
  - 为插件添加设置向导
  - 需要了解 setup-entry.ts 与 index.ts 的区别
  - 定义插件配置模式或 package.json 中的 openclaw 元数据
---

# 插件设置和配置

插件打包（`package.json` 元数据）、清单（`openclaw.plugin.json`）、
设置入口和配置模式的参考文档。

<Tip>
  **需要入门指南？** 操作指南中包含了上下文中的打包说明：
  [频道插件](/plugins/sdk-channel-plugins#step-1-package-and-manifest) 和
  [提供商插件](/plugins/sdk-provider-plugins#step-1-package-and-manifest)。
</Tip>

## 包元数据

你的 `package.json` 需要一个 `openclaw` 字段，用于告诉插件系统你的插件提供了什么：

**频道插件：**

```json
{
  "name": "@myorg/openclaw-my-channel",
  "version": "1.0.0",
  "type": "module",
  "openclaw": {
    "extensions": ["./index.ts"],
    "setupEntry": "./setup-entry.ts",
    "channel": {
      "id": "my-channel",
      "label": "My Channel",
      "blurb": "Short description of the channel."
    }
  }
}
```

**提供商插件 / ClawHub 发布基线：**

```json openclaw-clawhub-package.json
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

如果你在 ClawHub 上外部发布插件，则需要 `compat` 和 `build` 字段。
规范发布代码片段位于 `docs/snippets/plugin-publish/`。

### `openclaw` 字段

| 字段           | 类型       | 描述                                                                                      |
| -------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `extensions`   | `string[]` | 入口点文件（相对于包根目录）                                                               |
| `setupEntry`   | `string`   | 轻量级仅设置入口（可选）                                                                   |
| `channel`      | `object`   | 频道元数据：`id`、`label`、`blurb`、`selectionLabel`、`docsPath`、`order`、`aliases`      |
| `providers`   | `string[]` | 此插件注册的提供商 ID                                                                     |
| `install`     | `object`   | 安装提示：`npmSpec`、`localPath`、`defaultChoice`                                          |
| `startup`     | `object`   | 启动行为标志                                                                              |

### 延迟完整加载

频道插件可以选择延迟加载：

```json
{
  "openclaw": {
    "extensions": ["./index.ts"],
    "setupEntry": "./setup-entry.ts",
    "startup": {
      "deferConfiguredChannelFullLoadUntilAfterListen": true
    }
  }
}
```

启用后，OpenClaw 在预监听启动阶段仅加载 `setupEntry`，即使对于已配置的频道也是如此。
完整入口在网关开始监听后才加载。

<Warning>
  仅当你的 `setupEntry` 注册了网关在开始监听前所需的所有内容时，才启用延迟加载
  （频道注册、HTTP 路由、网关方法）。如果完整入口拥有必需的启动能力，
  请保持默认行为。
</Warning>

## 插件清单

每个原生插件必须在包根目录中包含 `openclaw.plugin.json`。
OpenClaw 使用此文件在执行插件代码之前验证配置。

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "description": "Adds My Plugin capabilities to OpenClaw",
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {
      "webhookSecret": {
        "type": "string",
        "description": "Webhook verification secret"
      }
    }
  }
}
```

对于频道插件，添加 `kind` 和 `channels`：

```json
{
  "id": "my-channel",
  "kind": "channel",
  "channels": ["my-channel"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

即使没有配置的插件也必须包含清单。空模式是有效的：

```json
{
  "id": "my-plugin",
  "configSchema": {
    "type": "object",
    "additionalProperties": false
  }
}
```

有关完整的模式参考，请参见 [插件清单](/plugins/manifest)。

## ClawHub 发布

对于插件包，请使用包特定的 ClawHub 命令：

```bash
clawhub package publish your-org/your-plugin --dry-run
clawhub package publish your-org/your-plugin
```

传统的仅技能发布别名用于技能。插件包应始终使用 `clawhub package publish`。

## 设置入口

`setup-entry.ts` 文件是 `index.ts` 的轻量级替代方案，
OpenClaw 仅在需要设置界面（引导、配置修复、已禁用频道检查）时加载它。

```typescript
// setup-entry.ts
import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { myChannelPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(myChannelPlugin);
```

这避免了在设置流程期间加载重型运行时代码（加密库、CLI 注册、后端服务）。

**OpenClaw 使用 `setupEntry` 而非完整入口的时机：**

- 频道已禁用但需要设置/引导界面
- 频道已启用但未配置
- 启用了延迟加载（`deferConfiguredChannelFullLoadUntilAfterListen`）

**`setupEntry` 必须注册的内容：**

- 频道插件对象（通过 `defineSetupPluginEntry`）
- 网关监听前所需的任何 HTTP 路由
- 启动期间所需的任何网关方法

**`setupEntry` 不应包含的内容：**

- CLI 注册
- 后端服务
- 重型运行时导入（加密、SDK）
- 仅在启动后需要的网关方法

## 配置模式

插件配置根据清单中的 JSON Schema 进行验证。用户通过以下方式配置插件：

```json5
{
  plugins: {
    entries: {
      "my-plugin": {
        config: {
          webhookSecret: "abc123",
        },
      },
    },
  },
}
```

你的插件在注册期间通过 `api.pluginConfig` 接收此配置。

对于频道特定配置，请使用频道配置部分：

```json5
{
  channels: {
    "my-channel": {
      token: "bot-token",
      allowFrom: ["user1", "user2"],
    },
  },
}
```

### 构建频道配置模式

使用 `openclaw/plugin-sdk/core` 中的 `buildChannelConfigSchema`
将 Zod 模式转换为 OpenClaw 验证的 `ChannelConfigSchema` 包装器：

```typescript
import { z } from "zod";
import { buildChannelConfigSchema } from "openclaw/plugin-sdk/core";

const accountSchema = z.object({
  token: z.string().optional(),
  allowFrom: z.array(z.string()).optional(),
  accounts: z.object({}).catchall(z.any()).optional(),
  defaultAccount: z.string().optional(),
});

const configSchema = buildChannelConfigSchema(accountSchema);
```

## 设置向导

频道插件可以为 `openclaw onboard` 提供交互式设置向导。
向导是 `ChannelPlugin` 上的 `ChannelSetupWizard` 对象：

```typescript
import type { ChannelSetupWizard } from "openclaw/plugin-sdk/channel-setup";

const setupWizard: ChannelSetupWizard = {
  channel: "my-channel",
  status: {
    configuredLabel: "Connected",
    unconfiguredLabel: "Not configured",
    resolveConfigured: ({ cfg }) => Boolean((cfg.channels as any)?.["my-channel"]?.token),
  },
  credentials: [
    {
      inputKey: "token",
      providerHint: "my-channel",
      credentialLabel: "Bot token",
      preferredEnvVar: "MY_CHANNEL_BOT_TOKEN",
      envPrompt: "Use MY_CHANNEL_BOT_TOKEN from environment?",
      keepPrompt: "Keep current token?",
      inputPrompt: "Enter your bot token:",
      inspect: ({ cfg, accountId }) => {
        const token = (cfg.channels as any)?.["my-channel"]?.token;
        return {
          accountConfigured: Boolean(token),
          hasConfiguredValue: Boolean(token),
        };
      },
    },
  ],
};
```

`ChannelSetupWizard` 类型支持 `credentials`、`textInputs`、
`dmPolicy`、`allowFrom`、`groupAccess`、`prepare`、`finalize` 等。
参见捆绑插件包（例如 Discord 插件的 `src/channel.setup.ts`）以获取完整示例。

对于只需标准 `note -> prompt -> parse -> merge -> patch` 流程的
DM 允许列表提示，请优先使用 `openclaw/plugin-sdk/setup` 中的共享设置助手：
`createPromptParsedAllowFromForAccount(...)`、`createTopLevelChannelParsedAllowFromPrompt(...)`
和 `createNestedChannelParsedAllowFromPrompt(...)`。

对于仅在标签、分数和可选额外行方面有所不同的频道设置状态块，
请优先使用 `openclaw/plugin-sdk/setup` 中的
`createStandardChannelSetupStatus(...)`，而不是在每个插件中手动编写相同的 `status` 对象。

对于仅在某些上下文中才应出现的可选设置界面，
请使用 `openclaw/plugin-sdk/channel-setup` 中的
`createOptionalChannelSetupSurface`：

```typescript
import { createOptionalChannelSetupSurface } from "openclaw/plugin-sdk/channel-setup";

const setupSurface = createOptionalChannelSetupSurface({
  channel: "my-channel",
  label: "My Channel",
  npmSpec: "@myorg/openclaw-my-channel",
  docsPath: "/channels/my-channel",
});
// 返回 { setupAdapter, setupWizard }
```

## 发布和安装

**外部插件：** 发布到 [ClawHub](/tools/clawhub) 或 npm，然后安装：

```bash
openclaw plugins install @myorg/openclaw-my-plugin
```

OpenClaw 会先尝试 ClawHub，自动回退到 npm。你也可以强制使用特定来源：

```bash
openclaw plugins install clawhub:@myorg/openclaw-my-plugin   # 仅 ClawHub
openclaw plugins install npm:@myorg/openclaw-my-plugin       # 仅 npm
```

**仓库内插件：** 放置在捆绑插件工作区树下，它们会在构建期间自动被发现。

**用户可以浏览和安装：**

```bash
openclaw plugins search <query>
openclaw plugins install <package-name>
```

<Info>
  对于从 npm 安装的插件，`openclaw plugins install` 运行
  `npm install --ignore-scripts`（不执行生命周期脚本）。
  保持插件依赖树为纯 JS/TS，避免使用需要 `postinstall` 构建的包。
</Info>

## 相关内容

- [SDK 入口点](/plugins/sdk-entrypoints) -- `definePluginEntry` 和 `defineChannelPluginEntry`
- [插件清单](/plugins/manifest) -- 完整清单模式参考
- [构建插件](/plugins/building-plugins) -- 分步骤入门指南
