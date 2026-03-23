# fly-chat 频道插件架构

## 概述

`fly-chat` 是一个 OpenClaw 频道插件，通过两种互斥的传输方式连接到 fly-chat 服务器：

- **Webhook 模式**：OpenClaw 作为 HTTP 服务器，接收来自 fly-chat 的 POST 请求
- **WebSocket 模式**：OpenClaw 作为 WebSocket 客户端，连接到 fly-chat 服务器

传输方式由配置中的 `transport` 字段按账户确定，如果存在 `serverUrl`，则默认为 `webhook`。

---

## 目录结构

```
extensions/fly-chat/
├── index.ts                      # defineChannelPluginEntry 入口
├── setup-entry.ts                # setup 向导入口（重导出）
├── setup-api.ts                  # setup defineSetupPluginEntry
├── api.ts                        # barrel: re-exports from plugin-sdk
├── package.json
└── src/
    ├── channel.ts                # ChannelPlugin 主定义，transport 分派逻辑
    ├── config-schema.ts          # Zod 配置 schema（transport union）
    ├── accounts.ts               # 账号解析（共享）
    ├── types.ts                 # TypeScript 类型（共享）
    ├── security.ts              # token 验证、DM 策略、限速（共享）
    ├── runtime.ts               # createPluginRuntimeStore
    ├── client.ts                # HTTP outbound 客户端（webhook 回复）
    │
    ├── webhook/
    │   ├── index.ts             # barrel
    │   └── handler.ts           # HTTP webhook 处理函数
    │
    └── ws/
        ├── index.ts             # barrel
        ├── client.ts             # WebSocket 客户端（ws 库）
        ├── protocol.ts          # 消息格式解析/序列化
        ├── reconnect.ts         # 重连循环（exponential backoff + jitter）
        └── ws-runtime.ts        # ws 库的动态导入边界
```

---

## 核心设计

### Transport 判别联合

每个解析的账户都是两种类型之一，由 `.transport` 判别：

```typescript
type ResolvedFlyChatAccount =
  | ResolvedFlyChatWebhookAccount  // transport: "webhook"
  | ResolvedFlyChatWebSocketAccount // transport: "websocket"
```

`channel.ts` 的 `gateway.startAccount` 根据 `account.transport` 分派：

```typescript
if (account.transport === "webhook") {
  return startWebhookTransport(ctx, account);
} else {
  return startWebSocketTransport(ctx, account);
}
```

### 配置优先级

```
account override > base channel config > env var
```

环境变量回退（仅默认账户）：`FLY_CHAT_TOKEN`、`FLY_CHAT_INCOMING_URL`、`FLY_CHAT_SERVER_URL`、`FLY_CHAT_ALLOWED_USER_IDS`、`FLY_CHAT_RATE_LIMIT`。

### 共享模块

| 模块 | 职责 |
|--------|---------------|
| `accounts.ts` | `listAccountIds()` / `resolveAccount()` — 所有 transport 共享 |
| `security.ts` | `validateToken()` (HMAC constant-time), `authorizeUserForDm()`, `RateLimiter` (固定窗口) |
| `runtime.ts` | `createPluginRuntimeStore<PluginRuntime>` |
| `client.ts` | HTTP outbound — `sendViaWebhook()` 用于 webhook transport 的回复 |

---

## Webhook Transport

```
fly-chat server  --POST-->  /webhook/fly-chat  (registerPluginHttpRoute)
                              |
                              v
                        webhook/handler.ts
                              |
                              +--> validateToken (HMAC)
                              +--> authorizeUserForDm (dmPolicy)
                              +--> RateLimiter (per-user, 30/min)
                              +--> sanitizeInput (prompt injection filter)
                              |
                              v (async)
                        deliver() --> agent (dispatchReplyWithBufferedBlockDispatcher)
                              |
                              v
                        HTTP POST to incomingUrl (client.ts: sendViaWebhook)
```

**关键文件：`src/webhook/handler.ts`**

- 立即 ACK (204)，异步 dispatch 到 agent
- 支持 `application/json` 和 `application/x-www-form-urlencoded`
- Token 解析顺序: `body.token` > `query.token` > `headers.Authorization`
- 字段别名: `user_id` / `userId` / `user`; `text` / `message` / `content`

---

## WebSocket Transport

```
OpenClaw gateway  --WS connect-->  fly-chat server (wss://...)
                              |
                              <---- message: { type: "message", data: { from, text, ... } }
                              |
                              v
                        ws/client.ts: handleMessage()
                              |
                              +--> parseWsMessage() (protocol.ts)
                              +--> authorizeUserForDm()
                              +--> RateLimiter
                              +--> sanitizeInput()
                              |
                              v
                        deliver() --> agent
                              |
                              v
                        ws.send({ type: "reply", data: { to, text } })
```

**关键文件：`src/ws/client.ts`**

- `createFlyChatWsClient()` — 异步创建 WS 连接，返回 `{ ws, teardown }`
- `ws-runtime.ts` — `ws` 库的动态导入边界（避免与静态 import 混用）
- 每 30s 发送一次 `ws.ping()` 保持连接活跃
- Inbound 消息格式（用户定义）：
  ```json
  { "type": "message", "data": { "from": "user1", "text": "hello", "sessionKey": "s1" } }
  ```
- Outbound 回复格式（用户定义）：
  ```json
  { "type": "reply", "data": { "to": "user1", "text": "hi there" } }
  ```

**重连：`src/ws/reconnect.ts`**

- 使用 `computeBackoff()` (exponential backoff + jitter)
- Policy: `initialDelayMs: 2000`, `maxDelayMs: 30000`, `maxAttempts: 12`, `jitterRatio: 0.25`
- `runFlyChatReconnectLoop()` 循环调用 `connect()` 直到成功或达到 maxAttempts

---

## 安全模型

- **Token 验证**：HMAC-SHA256 恒定时间比较（防止时间攻击）
- **DM 策略**：`open` | `allowlist` | `disabled`；allowlist 默认阻止所有
- **速率限制器**：固定窗口，每用户（默认 30 req/min）
- **输入清理**：剥离提示注入模式（`ignore previous instructions`、`<|...|>` 令牌），在 4000 个字符处截断

---

## 配置 Schema (`src/config-schema.ts`)

```typescript
// Webhook variant
{ transport: "webhook", webhookPath, token?, incomingUrl?, allowInsecureSsl }

// WebSocket variant
{ transport: "websocket", serverUrl, token?, reconnect: { initialDelayMs, maxDelayMs, maxAttempts, jitterRatio } }

// Shared
{ enabled, dmPolicy, allowedUserIds, rateLimitPerMinute }
```

---

## 关键设计决策

1. **动态导入 `ws`**：`ws` 库通过 `ws-runtime.ts` 动态导入边界加载，因此扩展的生产代码可以懒加载它，而不混合 `await import("ws")` 与静态 `import ... from "ws"`。

2. **Transport-agnostic deliver 函数**：`channel.ts` 中的 `buildDeliverFn()` 为两种 transport 创建相同的 `deliver` 回调形状 — 唯一的区别是如何发送回复（HTTP POST vs WS.send）。

3. **WebSocket transport 尚无 outbound**：`outbound.sendText` 目前仅适用于 webhook transport。WebSocket outbound 需要维护 `userId -> WebSocket` 映射，并留作 TODO。

4. **多账户支持**：Webhook 和 WebSocket transport 都通过 `channels.fly-chat.accounts.<name>` 支持多个命名账户。
