---
title: "插件 SDK 迁移指南"
sidebarTitle: "迁移到 SDK"
summary: "从旧的向下兼容层迁移到现代插件 SDK"
read_when:
  - 你看到了 OPENCLAW_PLUGIN_SDK_COMPAT_DEPRECATED 警告
  - 你看到了 OPENCLAW_EXTENSION_API_DEPRECATED 警告
  - 你正在将插件更新到现代插件架构
  - 你维护着一个外部 OpenClaw 插件
---

# 插件 SDK 迁移指南

OpenClaw 已从宽泛的向下兼容层迁移到具有针对性、已文档化的导入路径的现代插件
架构。如果你的插件是在新架构之前构建的，本指南将帮助你完成迁移。

## 正在发生什么变化

旧的插件系统提供了两个开放接口，让插件可以从单个入口点导入
它们需要的任何东西：

- **`openclaw/plugin-sdk/compat`** — 一个导入，导出数十个
  辅助函数。引入它是为了在新插件架构构建期间保持旧的基于钩子的插件继续工作。
- **`openclaw/extension-api`** — 一座桥，让插件直接访问
  主机端的辅助函数，如嵌入式 agent 运行器。

这两个接口现在都**已弃用**。它们在运行时仍然有效，但新
插件不得使用它们，现有插件应在下一个主要
版本移除它们之前完成迁移。

<Warning>
  向下兼容层将在未来某个主要版本中被移除。
  仍在从这些接口导入的插件届时将会失效。
</Warning>

## 变化原因

旧方法导致了以下问题：

- **启动缓慢** — 导入一个辅助函数会加载数十个不相关的模块
- **循环依赖** — 广泛的重新导出使得创建导入循环变得容易
- **API 表面不清晰** — 无法区分哪些导出是稳定的，哪些是内部的

现代插件 SDK 解决了这些问题：每个导入路径（`openclaw/plugin-sdk/\<子路径\>`）
都是一个小型、自包含的模块，具有明确的用途和文档化的契约。

捆绑频道的旧版提供商便捷接口也已移除。诸如 `openclaw/plugin-sdk/slack`、`openclaw/plugin-sdk/discord`、
`openclaw/plugin-sdk/signal`、`openclaw/plugin-sdk/whatsapp` 和
`openclaw/plugin-sdk/telegram-core` 等导入是私有 mono-repo 快捷方式，而非
稳定的插件契约。请改用窄化的通用 SDK 子路径。在
捆绑插件工作区内，将提供商所有的辅助函数保留在该插件自己的
`api.ts` 或 `runtime-api.ts` 中。

## 如何迁移

<Steps>
  <Step title="审查 Windows 包装器回退行为">
    如果你的插件使用 `openclaw/plugin-sdk/windows-spawn`，未解析的 Windows
    `.cmd`/`.bat` 包装器现在默认会失败关闭，除非你明确传递
    `allowShellFallback: true`。

    ```typescript
    // 之前
    const program = applyWindowsSpawnProgramPolicy({ candidate });

    // 之后
    const program = applyWindowsSpawnProgramPolicy({
      candidate,
      // 仅对有意接受 shell 介导回退的受信任兼容调用者设置此项。
      allowShellFallback: true,
    });
    ```

    如果你的调用者不是有意依赖 shell 回退，请不要设置
    `allowShellFallback`，而是处理抛出的错误。

  </Step>

  <Step title="查找已弃用的导入">
    在你的插件中搜索这两个已弃用接口的导入：

    ```bash
    grep -r "plugin-sdk/compat" my-plugin/
    grep -r "openclaw/extension-api" my-plugin/
    ```

  </Step>

  <Step title="替换为针对性导入">
    旧接口中的每个导出都对应一个特定的现代导入路径：

    ```typescript
    // 之前（已弃用的向下兼容层）
    import {
      createChannelReplyPipeline,
      createPluginRuntimeStore,
      resolveControlCommandGate,
    } from "openclaw/plugin-sdk/compat";

    // 之后（现代针对性导入）
    import { createChannelReplyPipeline } from "openclaw/plugin-sdk/channel-reply-pipeline";
    import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
    import { resolveControlCommandGate } from "openclaw/plugin-sdk/command-auth";
    ```

    对于主机端辅助函数，请使用注入的插件运行时而非直接导入：

    ```typescript
    // 之前（已弃用的 extension-api 桥接）
    import { runEmbeddedPiAgent } from "openclaw/extension-api";
    const result = await runEmbeddedPiAgent({ sessionId, prompt });

    // 之后（注入的运行时）
    const result = await api.runtime.agent.runEmbeddedPiAgent({ sessionId, prompt });
    ```

    其他旧版桥接辅助函数也适用相同的模式：

    | 旧导入                          | 现代等价物                               |
    | --- | --- |
    | `resolveAgentDir` | `api.runtime.agent.resolveAgentDir` |
    | `resolveAgentWorkspaceDir` | `api.runtime.agent.resolveAgentWorkspaceDir` |
    | `resolveAgentIdentity` | `api.runtime.agent.resolveAgentIdentity` |
    | `resolveThinkingDefault` | `api.runtime.agent.resolveThinkingDefault` |
    | `resolveAgentTimeoutMs` | `api.runtime.agent.resolveAgentTimeoutMs` |
    | `ensureAgentWorkspace` | `api.runtime.agent.ensureAgentWorkspace` |
    | session store 辅助函数 | `api.runtime.agent.session.*` |

  </Step>

  <Step title="构建和测试">
    ```bash
    pnpm build
    pnpm test -- my-plugin/
    ```
  </Step>
</Steps>

## 导入路径参考

<Accordion title="完整导入路径表">
  | 导入路径                              | 用途                          | 关键导出                                    |
  | --- | --- | --- |
  | `plugin-sdk/plugin-entry` | 规范插件入口辅助函数                 | `definePluginEntry`                         |
  | `plugin-sdk/core` | 频道入口定义、频道构建器、基础类型         | `defineChannelPluginEntry`、`createChatChannelPlugin` |
  | `plugin-sdk/channel-setup` | 设置向导适配器                       | `createOptionalChannelSetupSurface`         |
  | `plugin-sdk/channel-pairing` | 私信配对原语                       | `createChannelPairingController`            |
  | `plugin-sdk/channel-reply-pipeline` | 回复前缀 + 打字状态接线               | `createChannelReplyPipeline`               |
  | `plugin-sdk/channel-config-helpers` | 配置适配器工厂                       | `createHybridChannelConfigAdapter`         |
  | `plugin-sdk/channel-config-schema` | 配置 schema 构建器                  | 频道配置 schema 类型                          |
  | `plugin-sdk/channel-policy` | 群组/私信策略解析                     | `resolveChannelGroupRequireMention`        |
  | `plugin-sdk/channel-lifecycle` | 账户状态追踪                        | `createAccountStatusSink`                  |
  | `plugin-sdk/channel-runtime` | 已弃用兼容填充                       | 仅旧版频道运行时工具                           |
  | `plugin-sdk/channel-send-result` | 发送结果类型                        | 回复结果类型                                  |
  | `plugin-sdk/runtime-store` | 持久化插件存储                       | `createPluginRuntimeStore`                 |
  | `plugin-sdk/approval-runtime` | 审批提示辅助函数                      | Exec/plugin 审批负载、审批能力/配置文件辅助函数、本机审批路由/运行时辅助函数 |
  | `plugin-sdk/collection-runtime` | 有界缓存辅助函数                     | `pruneMapToMaxSize`                         |
  | `plugin-sdk/diagnostic-runtime` | 诊断门控辅助函数                     | `isDiagnosticFlagEnabled`、`isDiagnosticsEnabled` |
  | `plugin-sdk/error-runtime` | 错误格式化辅助函数                    | `formatUncaughtError`、错误图辅助函数           |
  | `plugin-sdk/fetch-runtime` | 包装 fetch/代理辅助函数               | `resolveFetch`、代理辅助函数                   |
  | `plugin-sdk/host-runtime` | 主机标准化辅助函数                    | `normalizeHostname`、`normalizeScpRemoteHost` |
  | `plugin-sdk/retry-runtime` | 重试辅助函数                        | `RetryConfig`、`retryAsync`、策略运行器         |
  | `plugin-sdk/allow-from` | 允许列表格式化                        | `formatAllowFromLowercase`                 |
  | `plugin-sdk/allowlist-resolution` | 允许列表输入映射                     | `mapAllowlistResolutionInputs`              |
  | `plugin-sdk/command-auth` | 命令门控                          | `resolveControlCommandGate`                |
  | `plugin-sdk/secret-input` | 密钥输入解析                        | 密钥输入辅助函数                               |
  | `plugin-sdk/webhook-ingress` | Webhook 请求辅助函数                 | Webhook 目标工具                             |
  | `plugin-sdk/webhook-request-guards` | Webhook body guard 辅助函数         | 请求 body 读取/限制辅助函数                    |
  | `plugin-sdk/reply-payload` | 消息回复类型                        | 回复负载类型                                  |
  | `plugin-sdk/provider-onboard` | 提供商入职补丁                       | 入职配置辅助函数                              |
  | `plugin-sdk/keyed-async-queue` | 有序异步队列                        | `KeyedAsyncQueue`                          |
  | `plugin-sdk/testing` | 测试工具                           | 测试辅助函数与 mock                           |
</Accordion>

使用最窄化的、与任务匹配的导入。如果找不到某个导出，
请查看 `src/plugin-sdk/` 中的源码或在 Discord 上提问。

## 移除时间线

| 时间                   | 将发生的事情                                                   |
| ---------------------- | ---------------------------------------------------------------- |
| **现在**                | 已弃用的接口发出运行时警告                                        |
| **下一个主要版本**       | 已弃用的接口将被移除；仍在使用它们的插件将会失效                       |

所有核心插件已完成迁移。外部插件应在下一个主要版本之前完成迁移。

## 临时抑制警告

在处理迁移期间设置以下环境变量：

```bash
OPENCLAW_SUPPRESS_PLUGIN_SDK_COMPAT_WARNING=1 openclaw gateway run
OPENCLAW_SUPPRESS_EXTENSION_API_WARNING=1 openclaw gateway run
```

这是一个临时的应急方案，不是永久解决方案。

## 相关内容

- [入门指南](/plugins/building-plugins) — 构建你的第一个插件
- [SDK 概述](/plugins/sdk-overview) — 完整子路径导入参考
- [频道插件](/plugins/sdk-channel-plugins) — 构建频道插件
- [提供商插件](/plugins/sdk-provider-plugins) — 构建提供商插件
- [插件内部原理](/plugins/architecture) — 架构深入探讨
- [插件清单](/plugins/manifest) — 清单 schema 参考
