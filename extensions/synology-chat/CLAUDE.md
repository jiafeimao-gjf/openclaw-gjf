# CLAUDE.md

此文件为 Claude Code (claude.ai/code) 在此仓库中处理代码时提供指导。

## 概述

`synology-chat` 是一个 OpenClaw 频道插件，通过 webhooks 将 Synology NAS Chat 连接到 OpenClaw。它通过 Synology 的传出 webhook 接收消息，并通过 Synology 的传入 webhook 发送回复。

## 架构

```
Synology NAS Chat  -->  outgoing webhook  -->  OpenClaw gateway (webhook-handler.ts)
                                                          |
                                                          v
OpenClaw gateway  -->  incoming webhook  -->  Synology NAS Chat
```

### 关键二元性：webhook user_id vs Chat API user_id

Synology Chat 使用两个不同的 user_id 空间：
- **传出 webhook user_id**：每个集成的顺序 ID（例如 `1`）
- **Chat API user_id**：`method=chatbot` 所需的全局内部 ID

`client.ts` 的 `resolveChatUserId()` 通过查询 `user_list` API 并按昵称/用户名匹配来弥合这一差距。发送回复时始终使用 `chatUserId`（来自 `msg.chatUserId ?? msg.from`）。

### 核心模块

| 文件 | 目的 |
|------|---------|
| `src/channel.ts` | 主插件入口 — 实现 `ChannelPlugin` 接口。注册入站 webhooks 的 HTTP 路由，处理出站发送/媒体、安全策略、配对。 |
| `src/webhook-handler.ts` | 入站 HTTP 处理程序。解析表单/JSON 负载，验证令牌，检查 DM 允许列表，速率限制，清理输入，立即 ACK（204），然后分派给代理。 |
| `src/client.ts` | 出站 HTTP 客户端。将文本/file_url 发送到 Synology 传入 webhook，具有重试（3 次尝试）、速率限制（500ms 间隔）和通过 `user_list` API 的 user_id 解析。 |
| `src/security.ts` | 令牌验证（恒定时间 HMAC）、DM 策略授权、输入清理（提示注入模式）、滑动窗口速率限制器。 |
| `src/accounts.ts` | 账户解析：合并基础配置 → 每个账户覆盖 → 环境变量（`SYNOLOGY_CHAT_TOKEN`、`SYNOLOGY_CHAT_INCOMING_URL`、`SYNOLOGY_NAS_HOST`、`SYNOLOGY_ALLOWED_USER_IDS`、`SYNOLOGY_RATE_LIMIT`）。 |
| `src/runtime.ts` | 插件运行时存储，使用 `createPluginRuntimeStore<PluginRuntime>` — 在插件方法被调用之前由 OpenClaw 核心初始化。 |
| `src/setup-surface.ts` | 设置向导适配器 + `openclaw setup` CLI 流程的向导定义。 |
| `src/types.ts` | TypeScript 接口：`SynologyChatChannelConfig`、`ResolvedSynologyChatAccount`、`SynologyWebhookPayload`。 |

### 入口点

- `index.ts` — 频道插件入口（`defineChannelPluginEntry`），导出 `synologyChatPlugin` + `setSynologyRuntime`
- `setup-entry.ts` — 设置向导入口（`defineSetupPluginEntry`）

## 配置

`openclaw.json` 中的频道配置路径：`channels.synology-chat`

```json
{
  "channels": {
    "synology-chat": {
      "token": "...",
      "incomingUrl": "https://nas.example.com/webapi/entry.cgi?api=SYNO.Chat.External&method=incoming&...",
      "webhookPath": "/webhook/synology",
      "dmPolicy": "allowlist",
      "allowedUserIds": ["123456"],
      "rateLimitPerMinute": 30,
      "allowInsecureSsl": false,
      "accounts": {
        "secondary": { "token": "...", "incomingUrl": "..." }
      }
    }
  }
}
```

环境变量回退（仅默认账户）：`SYNOLOGY_CHAT_TOKEN`、`SYNOLOGY_CHAT_INCOMING_URL`、`SYNOLOGY_NAS_HOST`、`SYNOLOGY_ALLOWED_USER_IDS`、`SYNOLOGY_RATE_LIMIT`、`OPENCLAW_BOT_NAME`。

## 测试

从仓库根目录运行：`pnpm test -- extensions/synology-chat`

关键测试文件：
- `src/channel.test.ts` / `src/channel.integration.test.ts` — 插件能力和网关生命周期
- `src/webhook-handler.test.ts` — 入站 webhook 解析、认证、速率限制
- `src/security.test.ts` — 令牌验证、清理、速率限制器
- `src/accounts.test.ts` — 账户解析和环境变量回退
- `src/client.test.ts` — 出站 HTTP 客户端行为

## 安全模型

- 令牌通过恒定时间 HMAC 比较验证（防止时间攻击）
- DM 策略：`open` | `allowlist` | `disabled`；允许列表默认阻止所有
- 速率限制器：每个用户的固定窗口（默认 30 req/min）
- 输入清理：剥离提示注入模式（`ignore previous instructions`、`<|...|>` 令牌等），在 4000 个字符处截断
