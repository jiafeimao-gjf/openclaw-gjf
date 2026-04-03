---
title: "插件入口点"
sidebarTitle: "入口点"
summary: "definePluginEntry、defineChannelPluginEntry 和 defineSetupPluginEntry 的类型签名参考"
read_when:
  - 你需要 definePluginEntry 或 defineChannelPluginEntry 的精确类型签名
  - 你想了解注册模式（全量模式 vs 设置模式 vs CLI 元数据模式）
  - 你在查找入口点选项
---

# 插件入口点

每个插件都导出一个默认入口对象。SDK 提供了三个辅助函数来创建它们。

<Tip>
  **需要入门教程？** 请参阅[频道插件](/plugins/sdk-channel-plugins)
  或[提供商插件](/plugins/sdk-provider-plugins)以获取分步指南。
</Tip>

## `definePluginEntry`

**导入路径：** `openclaw/plugin-sdk/plugin-entry`

适用于提供商插件、工具插件、钩子插件，以及所有**不是**
消息频道的插件。

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

export default definePluginEntry({
  id: "my-plugin",
  name: "My Plugin",
  description: "Short summary",
  register(api) {
    api.registerProvider({
      /* ... */
    });
    api.registerTool({
      /* ... */
    });
  },
});
```

| 字段             | 类型                                                             | 必填 | 默认值              |
| -------------- | ---------------------------------------------------------------- | --- | ------------------- |
| `id`           | `string`                                                         | 是   | —                   |
| `name`         | `string`                                                         | 是   | —                   |
| `description`  | `string`                                                         | 是   | —                   |
| `kind`         | `string`                                                         | 否   | —                   |
| `configSchema` | `OpenClawPluginConfigSchema \| () => OpenClawPluginConfigSchema` | 否   | 空对象 schema       |
| `register`     | `(api: OpenClawPluginApi) => void`                               | 是   | —                   |

- `id` 必须与你的 `openclaw.plugin.json` 清单中的值匹配。
- `kind` 用于独占槽位：`"memory"` 或 `"context-engine"`。
- `configSchema` 可以是一个函数，用于延迟求值。

## `defineChannelPluginEntry`

**导入路径：** `openclaw/plugin-sdk/core`

在 `definePluginEntry` 基础上封装了频道特定的接线逻辑。自动调用
`api.registerChannel({ plugin })`，暴露可选的根帮助 CLI 元数据
接口，并将 `registerFull` 的执行限制在注册模式上。

```typescript
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";

export default defineChannelPluginEntry({
  id: "my-channel",
  name: "My Channel",
  description: "Short summary",
  plugin: myChannelPlugin,
  setRuntime: setMyRuntime,
  registerCliMetadata(api) {
    api.registerCli(/* ... */);
  },
  registerFull(api) {
    api.registerGatewayMethod(/* ... */);
  },
});
```

| 字段                   | 类型                                                             | 必填 | 默认值              |
| --------------------- | ---------------------------------------------------------------- | --- | ------------------- |
| `id`                  | `string`                                                         | 是   | —                   |
| `name`                | `string`                                                         | 是   | —                   |
| `description`         | `string`                                                         | 是   | —                   |
| `plugin`              | `ChannelPlugin`                                                  | 是   | —                   |
| `configSchema`        | `OpenClawPluginConfigSchema \| () => OpenClawPluginConfigSchema` | 否   | 空对象 schema       |
| `setRuntime`          | `(runtime: PluginRuntime) => void`                               | 否   | —                   |
| `registerCliMetadata` | `(api: OpenClawPluginApi) => void`                               | 否   | —                   |
| `registerFull`        | `(api: OpenClawPluginApi) => void`                               | 否   | —                   |

- `setRuntime` 在注册期间调用，以便你存储运行时引用
  （通常通过 `createPluginRuntimeStore`）。在 CLI 元数据
  捕获期间会被跳过。
- `registerCliMetadata` 在 `api.registrationMode === "cli-metadata"`
  和 `api.registrationMode === "full"` 两种模式下都会运行。
  将其作为频道所有 CLI 描述符的规范位置，这样根帮助
  保持非激活状态，同时常规 CLI 命令注册仍然与完整插件加载兼容。
- `registerFull` 仅在 `api.registrationMode === "full"` 时运行。在仅设置加载期间会被跳过。
- 对于插件所有的根 CLI 命令，当你想让命令保持延迟加载而不出现在
  根 CLI 解析树中时，优先使用 `api.registerCli(..., { descriptors: [...] })`。
  对于频道插件，优先从 `registerCliMetadata(...)` 中注册这些描述符，
  并让 `registerFull(...)` 专注于仅运行时的注册工作。

## `defineSetupPluginEntry`

**导入路径：** `openclaw/plugin-sdk/core`

用于轻量级的 `setup-entry.ts` 文件。仅返回 `{ plugin }`，无
运行时或 CLI 接线逻辑。

```typescript
import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";

export default defineSetupPluginEntry(myChannelPlugin);
```

当频道被禁用、未配置或启用延迟加载时，OpenClaw 会加载此入口而非完整入口。
请参阅[设置与配置](/plugins/sdk-setup#setup-entry)以了解具体场景。

## 注册模式

`api.registrationMode` 告知你的插件它是如何被加载的：

| 模式                | 触发时机                          | 应注册的 内容                    |
| ----------------- | ------------------------------- | ----------------------------- |
| `"full"`          | 正常网关启动                      | 所有内容                        |
| `"setup-only"`    | 禁用/未配置的频道                  | 仅频道注册                       |
| `"setup-runtime"` | 设置流程中运行时可用                | 频道 + 轻量级运行时                |
| `"cli-metadata"`  | 根帮助 / CLI 元数据捕获            | 仅 CLI 描述符                    |

`defineChannelPluginEntry` 自动处理此分离。如果你为频道直接使用
`definePluginEntry`，请自行检查模式：

```typescript
register(api) {
  if (api.registrationMode === "cli-metadata" || api.registrationMode === "full") {
    api.registerCli(/* ... */);
    if (api.registrationMode === "cli-metadata") return;
  }

  api.registerChannel({ plugin: myPlugin });
  if (api.registrationMode !== "full") return;

  // 仅运行时的大量注册
  api.registerService(/* ... */);
}
```

对于 CLI 注册器，特别注意：

- 当注册器拥有一个或多个根命令且你希望 OpenClaw 在首次调用时延迟加载真实 CLI 模块时，
  使用 `descriptors`
- 确保这些描述符覆盖了注册器暴露的每个顶级命令根
- 仅为急切兼容路径单独使用 `commands`

## 插件形态

OpenClaw 根据加载插件的注册行为对其进行分类：

| 形态                   | 描述                                              |
| --------------------- | ------------------------------------------------ |
| **plain-capability**  | 一种能力类型（例如仅提供商）                         |
| **hybrid-capability** | 多种能力类型（例如提供商 + 语音）                    |
| **hook-only**         | 仅钩子，无能力                                     |
| **non-capability**    | 工具/命令/服务但无能力                             |

使用 `openclaw plugins inspect <id>` 查看插件的形态。

## 相关内容

- [SDK 概述](/plugins/sdk-overview) — 注册 API 和子路径参考
- [运行时辅助函数](/plugins/sdk-runtime) — `api.runtime` 和 `createPluginRuntimeStore`
- [设置与配置](/plugins/sdk-setup) — 清单、设置入口、延迟加载
- [频道插件](/plugins/sdk-channel-plugins) — 构建 `ChannelPlugin` 对象
- [提供商插件](/plugins/sdk-provider-plugins) — 提供商注册和钩子
