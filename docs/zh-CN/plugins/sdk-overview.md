---
title: "Plugin SDK 概述"
sidebarTitle: "SDK 概述"
summary: "导入映射表、注册 API 参考和 SDK 架构"
read_when:
  - 你需要了解应从哪个 SDK 子路径导入
  - 你需要 OpenClawPluginApi 所有注册方法的参考
  - 你在查找特定的 SDK 导出
---

# Plugin SDK 概述

插件 SDK 是插件与核心之间的类型化契约。本页是关于**导入内容**和**可注册内容**的参考。

<Tip>
  **在寻找操作指南？**
  - 第一个插件？从 [快速开始](/plugins/building-plugins) 开始
  - 渠道插件？参见 [渠道插件](/plugins/sdk-channel-plugins)
  - 提供商插件？参见 [提供商插件](/plugins/sdk-provider-plugins)
</Tip>

## 导入约定

始终从特定的子路径导入：

```typescript
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
```

每个子路径都是一个小型、自包含的模块。这保持了启动快速并防止循环依赖问题。

不要添加或依赖提供商命名的便捷接口，如
`openclaw/plugin-sdk/slack`、`openclaw/plugin-sdk/discord`、
`openclaw/plugin-sdk/signal` 或 `openclaw/plugin-sdk/whatsapp`。捆绑插件应在自己的 `api.ts` 或 `runtime-api.ts` 桶中组合通用的 SDK
子路径，核心应使用这些插件本地的桶，或者在真正需要跨渠道时添加窄粒度的通用 SDK 契约。

## 子路径参考

最常用的子路径，按用途分组。完整的 100+
个子路径列表在 `scripts/lib/plugin-sdk-entrypoints.json` 中。

### 插件入口

| 子路径                      | 关键导出                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plugin-sdk/plugin-entry`   | `definePluginEntry`                                                                                                                              |
| `plugin-sdk/core`            | `defineChannelPluginEntry`、`createChatChannelPlugin`、`createChannelPluginBase`、`defineSetupPluginEntry`、`buildChannelConfigSchema`               |

<AccordionGroup>
  <Accordion title="渠道子路径">
    | 子路径 | 关键导出 |
    | --- | --- |
    | `plugin-sdk/channel-setup` | `createOptionalChannelSetupSurface` |
    | `plugin-sdk/channel-pairing` | `createChannelPairingController` |
    | `plugin-sdk/channel-reply-pipeline` | `createChannelReplyPipeline` |
    | `plugin-sdk/channel-config-helpers` | `createHybridChannelConfigAdapter` |
    | `plugin-sdk/channel-config-schema` | 渠道配置模式类型 |
    | `plugin-sdk/channel-policy` | `resolveChannelGroupRequireMention` |
    | `plugin-sdk/channel-lifecycle` | `createAccountStatusSink` |
    | `plugin-sdk/channel-inbound` | 防抖、提及匹配、信封辅助函数 |
    | `plugin-sdk/channel-send-result` | 回复结果类型 |
    | `plugin-sdk/channel-actions` | `createMessageToolButtonsSchema`、`createMessageToolCardSchema` |
    | `plugin-sdk/channel-targets` | 目标解析/匹配辅助函数 |
    | `plugin-sdk/channel-contract` | 渠道契约类型 |
    | `plugin-sdk/channel-feedback` | 反馈/反应接线 |
  </Accordion>

  <Accordion title="提供商子路径">
    | 子路径 | 关键导出 |
    | --- | --- |
    | `plugin-sdk/cli-backend` | CLI 后端默认值 + 看门狗常量 |
    | `plugin-sdk/provider-auth` | `createProviderApiKeyAuthMethod`、`ensureApiKeyFromOptionEnvOrPrompt`、`upsertAuthProfile` |
    | `plugin-sdk/provider-model-shared` | `normalizeModelCompat` |
    | `plugin-sdk/provider-catalog-shared` | `findCatalogTemplate`、`buildSingleProviderApiKeyCatalog` |
    | `plugin-sdk/provider-usage` | `fetchClaudeUsage` 及类似函数 |
    | `plugin-sdk/provider-stream` | 流包装器类型 |
    | `plugin-sdk/provider-onboard` | 入职配置补丁辅助函数 |
    | `plugin-sdk/global-singleton` | 进程本地单例/映射/缓存辅助函数 |
  </Accordion>

  <Accordion title="认证和安全子路径">
    | 子路径 | 关键导出 |
    | --- | --- |
    | `plugin-sdk/command-auth` | `resolveControlCommandGate` |
    | `plugin-sdk/allow-from` | `formatAllowFromLowercase` |
    | `plugin-sdk/secret-input` | 密钥输入解析辅助函数 |
    | `plugin-sdk/webhook-ingress` | Webhook 请求/目标辅助函数 |
    | `plugin-sdk/webhook-request-guards` | 请求体大小/超时辅助函数 |
  </Accordion>

  <Accordion title="运行时和存储子路径">
    | 子路径 | 关键导出 |
    | --- | --- |
    | `plugin-sdk/runtime-store` | `createPluginRuntimeStore` |
    | `plugin-sdk/config-runtime` | 配置加载/写入辅助函数 |
    | `plugin-sdk/approval-runtime` | 执行/插件审批辅助函数、审批能力构建器、认证/配置文件辅助函数、本地路由/运行时辅助函数 |
    | `plugin-sdk/infra-runtime` | 系统事件/心跳辅助函数 |
    | `plugin-sdk/collection-runtime` | 小型有限缓存辅助函数 |
    | `plugin-sdk/diagnostic-runtime` | 诊断标志和事件辅助函数 |
    | `plugin-sdk/error-runtime` | 错误图和格式化辅助函数 |
    | `plugin-sdk/fetch-runtime` | 包装的 fetch、代理和固定查询辅助函数 |
    | `plugin-sdk/host-runtime` | 主机名和 SCP 主机规范化辅助函数 |
    | `plugin-sdk/retry-runtime` | 重试配置和重试运行辅助函数 |
    | `plugin-sdk/agent-runtime` | 代理目录/身份/工作区辅助函数 |
    | `plugin-sdk/directory-runtime` | 配置支持的目录查询/去重 |
    | `plugin-sdk/keyed-async-queue` | `KeyedAsyncQueue` |
  </Accordion>

  <Accordion title="能力和测试子路径">
    | 子路径 | 关键导出 |
    | --- | --- |
    | `plugin-sdk/image-generation` | 图像生成提供商类型 |
    | `plugin-sdk/media-understanding` | 媒体理解提供商类型 |
    | `plugin-sdk/speech` | 语音提供商类型 |
    | `plugin-sdk/testing` | `installCommonResolveTargetErrorCases`、`shouldAckReaction` |
  </Accordion>
</AccordionGroup>

## 注册 API

`register(api)` 回调接收一个具有以下方法的 `OpenClawPluginApi` 对象：

### 能力注册

| 方法                                          | 注册内容                   |
| --------------------------------------------- | -------------------------- |
| `api.registerProvider(...)`                   | 文本推理（LLM）            |
| `api.registerCliBackend(...)`                 | 本地 CLI 推理后端          |
| `api.registerChannel(...)`                    | 消息渠道                   |
| `api.registerSpeechProvider(...)`            | 文本转语音 / STT 合成       |
| `api.registerMediaUnderstandingProvider(...)` | 图像/音频/视频分析          |
| `api.registerImageGenerationProvider(...)`    | 图像生成                   |
| `api.registerWebSearchProvider(...)`           | 网络搜索                   |

### 工具和命令

| 方法                          | 注册内容                                |
| ----------------------------- | -------------------------------------- |
| `api.registerTool(tool, opts?)` | 代理工具（必需或 `{ optional: true }`） |
| `api.registerCommand(def)`      | 自定义命令（绕过 LLM）                 |

### 基础设施

| 方法                                          | 注册内容             |
| ---------------------------------------------- | -------------------- |
| `api.registerHook(events, handler, opts?)`     | 事件钩子             |
| `api.registerHttpRoute(params)`                 | Gateway HTTP 端点   |
| `api.registerGatewayMethod(name, handler)`     | Gateway RPC 方法    |
| `api.registerCli(registrar, opts?)`             | CLI 子命令           |
| `api.registerService(service)`                  | 后台服务             |
| `api.registerInteractiveHandler(registration)` | 交互式处理器         |

### CLI 注册元数据

`api.registerCli(registrar, opts?)` 接受两种顶级元数据：

- `commands`：注册器拥有的显式命令根
- `descriptors`：解析时命令描述符，用于根 CLI 帮助、
  路由和延迟插件 CLI 注册

如果你希望插件命令在正常根 CLI 路径中保持延迟加载，
请提供覆盖该注册器公开的每个顶级命令根的 `descriptors`。

```typescript
api.registerCli(
  async ({ program }) => {
    const { registerMatrixCli } = await import("./src/cli.js");
    registerMatrixCli({ program });
  },
  {
    descriptors: [
      {
        name: "matrix",
        description: "Manage Matrix accounts, verification, devices, and profile state",
        hasSubcommands: true,
      },
    ],
  },
);
```

仅使用 `commands` 当你不需要延迟根 CLI 注册时。
该急切兼容性路径仍然受支持，但它不会为解析时延迟加载安装
基于描述符的占位符。

### CLI 后端注册

`api.registerCliBackend(...)` 允许插件拥有本地 AI CLI 后端的默认配置，
如 `claude-cli` 或 `codex-cli`。

- 后端 `id` 成为模型引用中的提供商前缀，如 `claude-cli/opus`。
- 后端 `config` 使用与 `agents.defaults.cliBackends.<id>` 相同的形状。
- 用户配置优先。OpenClaw 在运行 CLI 之前将 `agents.defaults.cliBackends.<id>` 合并到插件默认值之上。
- 当后端需要合并后的兼容性重写时使用 `normalizeConfig`
  （例如规范化旧标志形状）。

### 独占槽位

| 方法                                        | 注册内容                        |
| ------------------------------------------ | ------------------------------ |
| `api.registerContextEngine(id, factory)`   | 上下文引擎（一次只有一个活跃）  |
| `api.registerMemoryPromptSection(builder)` | 内存提示节构建器                |
| `api.registerMemoryFlushPlan(resolver)`    | 内存刷新计划解析器              |
| `api.registerMemoryRuntime(runtime)`       | 内存运行时适配器                |

### 内存嵌入适配器

| 方法                                          | 注册内容                              |
| ---------------------------------------------- | ------------------------------------ |
| `api.registerMemoryEmbeddingProvider(adapter)` | 活跃插件的内存嵌入适配器              |

- `registerMemoryPromptSection`、`registerMemoryFlushPlan` 和
  `registerMemoryRuntime` 是内存插件专用的。
- `registerMemoryEmbeddingProvider` 允许活跃的内存插件注册一个或多个嵌入适配器 ID（例如 `openai`、`gemini`，或自定义插件定义的 ID）。
- 用户配置（如 `agents.defaults.memorySearch.provider` 和
  `agents.defaults.memorySearch.fallback`）根据这些注册的适配器 ID 进行解析。

### 事件和生命周期

| 方法                                         | 功能                          |
| -------------------------------------------- | ----------------------------- |
| `api.on(hookName, handler, opts?)`            | 类型化生命周期钩子            |
| `api.onConversationBindingResolved(handler)` | 对话绑定回调                  |

### 钩子决策语义

- `before_tool_call`：返回 `{ block: true }` 是终态。一旦任何处理程序设置它，优先级较低的处理程序将被跳过。
- `before_tool_call`：返回 `{ block: false }` 被视为无决策（与省略 `block` 相同），而不是覆盖。
- `before_install`：返回 `{ block: true }` 是终态。一旦任何处理程序设置它，优先级较低的处理程序将被跳过。
- `before_install`：返回 `{ block: false }` 被视为无决策（与省略 `block` 相同），而不是覆盖。
- `message_sending`：返回 `{ cancel: true }` 是终态。一旦任何处理程序设置它，优先级较低的处理程序将被跳过。
- `message_sending`：返回 `{ cancel: false }` 被视为无决策（与省略 `cancel` 相同），而不是覆盖。

### API 对象字段

| 字段                      | 类型                        | 描述                                              |
| ------------------------ | -------------------------- | ------------------------------------------------ |
| `api.id`                 | `string`                  | 插件 ID                                          |
| `api.name`               | `string`                  | 显示名称                                          |
| `api.version`            | `string?`                 | 插件版本（可选）                                  |
| `api.description`        | `string?`                 | 插件描述（可选）                                  |
| `api.source`             | `string`                  | 插件源路径                                        |
| `api.rootDir`            | `string?`                 | 插件根目录（可选）                                |
| `api.config`             | `OpenClawConfig`          | 当前配置快照                                      |
| `api.pluginConfig`       | `Record<string, unknown>` | 来自 `plugins.entries.<id>.config` 的插件特定配置 |
| `api.runtime`            | `PluginRuntime`           | [运行时辅助函数](/plugins/sdk-runtime)            |
| `api.logger`             | `PluginLogger`            | 作用域记录器（`debug`、`info`、`warn`、`error`）  |
| `api.registrationMode`   | `PluginRegistrationMode`  | `"full"`、`"setup-only"`、`"setup-runtime"` 或 `"cli-metadata"` |
| `api.resolvePath(input)` | `(string) => string`      | 解析相对于插件根的路径                            |

## 内部模块约定

在你的插件中，使用本地桶文件进行内部导入：

```
my-plugin/
  api.ts            # 外部消费者的公共导出
  runtime-api.ts    # 内部专用运行时导出
  index.ts          # 插件入口点
  setup-entry.ts    # 轻量级仅设置入口（可选）
```

<Warning>
  永远不要通过 `openclaw/plugin-sdk/<your-plugin>`
  从生产代码导入你自己的插件。通过 `./api.ts` 或
  `./runtime-api.ts` 路由内部导入。SDK 路径仅是外部契约。
</Warning>

<Warning>
  扩展生产代码也应避免 `openclaw/plugin-sdk/<other-plugin>`
  导入。如果辅助函数真正需要共享，应将其提升到中立的 SDK 子路径，
  如 `openclaw/plugin-sdk/speech`、`.../provider-model-shared` 或其他
  面向能力的表面，而不是将两个插件耦合在一起。
</Warning>

## 相关内容

- [入口点](/plugins/sdk-entrypoints) — `definePluginEntry` 和 `defineChannelPluginEntry` 选项
- [运行时辅助函数](/plugins/sdk-runtime) — 完整的 `api.runtime` 命名空间参考
- [设置和配置](/plugins/sdk-setup) — 打包、清单配置、配置模式
- [测试](/plugins/sdk-testing) — 测试工具和 lint 规则
- [SDK 迁移](/plugins/sdk-migration) — 从已弃用表面迁移
- [插件内部原理](/plugins/architecture) — 深度架构和能力模型
