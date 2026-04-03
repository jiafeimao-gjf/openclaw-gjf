---
title: "构建频道插件"
sidebarTitle: "频道插件"
summary: "为 OpenClaw 构建消息频道插件的分步指南"
read_when:
  - 您正在构建一个新的消息频道插件
  - 您想将 OpenClaw 连接到消息平台
  - 您需要了解 ChannelPlugin 适配器接口
---

# 构建频道插件

本指南将引导您构建一个将 OpenClaw 连接到消息平台的频道插件。完成后，您将拥有一个具备 DM 安全、配对、回复线程化和出站消息功能的工作频道。

<Info>
  如果您之前没有构建过任何 OpenClaw 插件，请先阅读
  [入门指南](/plugins/building-plugins)，了解基本的包结构和清单设置。
</Info>

## 频道插件的工作原理

频道插件不需要自己的发送/编辑/反应工具。OpenClaw 在核心中保留一个共享的 `message` 工具。您的插件负责：

- **配置** — 账户解析和设置向导
- **安全** — DM 策略和允许列表
- **配对** — DM 审批流程
- **会话语法** — 提供商特定的会话 ID 如何映射到基础聊天、线程 ID 和父级回退
- **出站** — 向平台发送文本、媒体和投票
- **线程化** — 回复如何被打线程

核心负责共享的消息工具、提示词连接、外部会话密钥结构、通用 `:thread:` 记账和调度。

如果您的平台在会话 ID 中存储了额外的范围，请使用 `messaging.resolveSessionConversation(...)` 将解析逻辑保留在插件中。这是将 `rawId` 映射到基础会话 ID、可选线程 ID、显式 `baseConversationId` 和任何 `parentConversationCandidates` 的规范钩子。当您返回 `parentConversationCandidates` 时，请按从最窄父级到最宽/基础会话的顺序排列。

在频道注册表启动之前需要相同解析的捆绑插件也可以暴露一个顶层 `session-key-api.ts` 文件，其中包含匹配的 `resolveSessionConversation(...)` 导出。核心仅在运行时插件注册表尚不可用时才使用这个引导安全的接口。

`messaging.resolveParentConversationCandidates(...)` 仍然作为传统兼容性回退可用，当插件仅需要在通用/原始 ID 之上获得父级回退时。如果两个钩子都存在，核心首先使用 `resolveSessionConversation(...).parentConversationCandidates`，仅当规范钩子省略它们时才回退到 `resolveParentConversationCandidates(...)`。

## 审批和频道能力

大多数频道插件不需要审批特定代码。

- 核心拥有同聊天 `/approve`、共享审批按钮负载和通用回退传递。
- 当频道需要审批特定行为时，首选一个 `approvalCapability` 对象。
- `approvalCapability.authorizeActorAction` 和 `approvalCapability.getActionAvailabilityState` 是规范的审批认证接口。
- 使用 `outbound.shouldSuppressLocalPayloadPrompt` 或 `outbound.beforeDeliverPayload` 处理频道特定的负载生命周期行为，例如隐藏重复的本地审批提示或在传递前发送打字指示器。
- 仅将 `approvalCapability.delivery` 用于原生审批路由或回退抑制。
- 仅当频道真正需要自定义审批负载而不是共享渲染器时才使用 `approvalCapability.render`。
- 如果频道可以从现有配置中推断出稳定的类所有者 DM 身份，请使用 `openclaw/plugin-sdk/approval-runtime` 中的 `createResolvedApproverActionAuthAdapter` 来限制同聊天 `/approve`，而无需添加审批特定的核心逻辑。
- 如果频道需要原生审批传递，请保持频道代码专注于目标标准化和传输钩子。使用 `openclaw/plugin-sdk/approval-runtime` 中的 `createChannelExecApprovalProfile`、`createChannelNativeOriginTargetResolver`、`createChannelApproverDmTargetResolver`、`createApproverRestrictedNativeApprovalCapability` 和 `createChannelNativeApprovalRuntime`，以便核心拥有请求过滤、路由、去重、过期和网关订阅。
- 原生审批频道必须通过这些帮助函数传递 `accountId` 和 `approvalKind`。`accountId` 保持多账户审批策略限定在正确的机器人账户，而 `approvalKind` 保持 exec 与插件审批行为对频道可用，而无需在核心中进行硬编码分支。
- `createApproverRestrictedNativeApprovalAdapter` 仍然作为兼容性包装器存在，但新代码应该优先使用 capability 构建器并在插件上暴露 `approvalCapability`。

仅认证频道通常可以在默认路径停止：核心处理审批，插件仅暴露出站/认证能力。原生审批频道（如 Matrix、Slack、Telegram 和自定义聊天传输）应使用共享的原生帮助函数，而不是自行实现审批生命周期。

## 教程

<Steps>
  <a id="step-1-package-and-manifest"></a>
  <Step title="包和清单">
    创建标准的插件文件。`package.json` 中的 `channel` 字段决定了它是一个频道插件：

    <CodeGroup>
    ```json package.json
    {
      "name": "@myorg/openclaw-acme-chat",
      "version": "1.0.0",
      "type": "module",
      "openclaw": {
        "extensions": ["./index.ts"],
        "setupEntry": "./setup-entry.ts",
        "channel": {
          "id": "acme-chat",
          "label": "Acme Chat",
          "blurb": "Connect OpenClaw to Acme Chat."
        }
      }
    }
    ```

    ```json openclaw.plugin.json
    {
      "id": "acme-chat",
      "kind": "channel",
      "channels": ["acme-chat"],
      "name": "Acme Chat",
      "description": "Acme Chat channel plugin",
      "configSchema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "acme-chat": {
            "type": "object",
            "properties": {
              "token": { "type": "string" },
              "allowFrom": {
                "type": "array",
                "items": { "type": "string" }
              }
            }
          }
        }
      }
    }
    ```
    </CodeGroup>

  </Step>

  <Step title="构建频道插件对象">
    `ChannelPlugin` 接口有许多可选的适配器接口。从最小配置开始 — `id` 和 `setup` — 然后根据需要添加适配器。

    创建 `src/channel.ts`：

    ```typescript src/channel.ts
    import {
      createChatChannelPlugin,
      createChannelPluginBase,
    } from "openclaw/plugin-sdk/core";
    import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
    import { acmeChatApi } from "./client.js"; // your platform API client

    type ResolvedAccount = {
      accountId: string | null;
      token: string;
      allowFrom: string[];
      dmPolicy: string | undefined;
    };

    function resolveAccount(
      cfg: OpenClawConfig,
      accountId?: string | null,
    ): ResolvedAccount {
      const section = (cfg.channels as Record<string, any>)?.["acme-chat"];
      const token = section?.token;
      if (!token) throw new Error("acme-chat: token is required");
      return {
        accountId: accountId ?? null,
        token,
        allowFrom: section?.allowFrom ?? [],
        dmPolicy: section?.dmSecurity,
      };
    }

    export const acmeChatPlugin = createChatChannelPlugin<ResolvedAccount>({
      base: createChannelPluginBase({
        id: "acme-chat",
        setup: {
          resolveAccount,
          inspectAccount(cfg, accountId) {
            const section =
              (cfg.channels as Record<string, any>)?.["acme-chat"];
            return {
              enabled: Boolean(section?.token),
              configured: Boolean(section?.token),
              tokenStatus: section?.token ? "available" : "missing",
            };
          },
        },
      }),

      // DM security: who can message the bot
      security: {
        dm: {
          channelKey: "acme-chat",
          resolvePolicy: (account) => account.dmPolicy,
          resolveAllowFrom: (account) => account.allowFrom,
          defaultPolicy: "allowlist",
        },
      },

      // Pairing: approval flow for new DM contacts
      pairing: {
        text: {
          idLabel: "Acme Chat username",
          message: "Send this code to verify your identity:",
          notify: async ({ target, code }) => {
            await acmeChatApi.sendDm(target, `Pairing code: ${code}`);
          },
        },
      },

      // Threading: how replies are delivered
      threading: { topLevelReplyToMode: "reply" },

      // Outbound: send messages to the platform
      outbound: {
        attachedResults: {
          sendText: async (params) => {
            const result = await acmeChatApi.sendMessage(
              params.to,
              params.text,
            );
            return { messageId: result.id };
          },
        },
        base: {
          sendMedia: async (params) => {
            await acmeChatApi.sendFile(params.to, params.filePath);
          },
        },
      },
    });
    ```

    <Accordion title="createChatChannelPlugin 为您做了什么">
      无需手动实现低级适配器接口，您可以传递声明性选项，构建器会组合它们：

      | 选项 | 连接内容 |
      | --- | --- |
      | `security.dm` | 来自配置字段的 scoped DM 安全解析器 |
      | `pairing.text` | 基于代码交换的文本 DM 配对流程 |
      | `threading` | 回复模式解析器（固定、账户范围或自定义） |
      | `outbound.attachedResults` | 返回结果元数据的发送函数（消息 ID） |

      如果需要完全控制，您也可以传递原始适配器对象。
    </Accordion>

  </Step>

  <Step title="连接入口点">
    创建 `index.ts`：

    ```typescript index.ts
    import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
    import { acmeChatPlugin } from "./src/channel.js";

    export default defineChannelPluginEntry({
      id: "acme-chat",
      name: "Acme Chat",
      description: "Acme Chat channel plugin",
      plugin: acmeChatPlugin,
      registerCliMetadata(api) {
        api.registerCli(
          ({ program }) => {
            program
              .command("acme-chat")
              .description("Acme Chat management");
          },
          {
            descriptors: [
              {
                name: "acme-chat",
                description: "Acme Chat management",
                hasSubcommands: false,
              },
            ],
          },
        );
      },
      registerFull(api) {
        api.registerGatewayMethod(/* ... */);
      },
    });
    ```

    将频道拥有的 CLI 描述符放在 `registerCliMetadata(...)` 中，这样 OpenClaw 可以在不激活完整频道运行时的情况下在根帮助中显示它们，而正常的完整加载仍然会拾取相同的描述符进行真正的命令注册。将 `registerFull(...)` 保留用于仅运行时的工作。`defineChannelPluginEntry` 自动处理注册模式分割。参见[入口点](/plugins/sdk-entrypoints#definechannelpluginentry)获取所有选项。

  </Step>

  <Step title="添加设置入口">
    为 onboarding 期间的轻量级加载创建 `setup-entry.ts`：

    ```typescript setup-entry.ts
    import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
    import { acmeChatPlugin } from "./src/channel.js";

    export default defineSetupPluginEntry(acmeChatPlugin);
    ```

    当频道被禁用或未配置时，OpenClaw 会加载此文件而不是完整入口。这避免了在设置流程期间引入重型运行时代码。参见[设置和配置](/plugins/sdk-setup#setup-entry)获取详细信息。

  </Step>

  <Step title="处理入站消息">
    您的插件需要从平台接收消息并将其转发到 OpenClaw。典型模式是一个 webhook，验证请求并通过频道的入站处理程序分发：

    ```typescript
    registerFull(api) {
      api.registerHttpRoute({
        path: "/acme-chat/webhook",
        auth: "plugin", // plugin-managed auth (verify signatures yourself)
        handler: async (req, res) => {
          const event = parseWebhookPayload(req);

          // Your inbound handler dispatches the message to OpenClaw.
          // The exact wiring depends on your platform SDK —
          // see a real example in the bundled Microsoft Teams or Google Chat plugin package.
          await handleAcmeChatInbound(api, event);

          res.statusCode = 200;
          res.end("ok");
          return true;
        },
      });
    }
    ```

    <Note>
      入站消息处理是频道特定的。每个频道插件拥有自己的入站管道。查看捆绑的频道插件
      （例如 Microsoft Teams 或 Google Chat 插件包）获取真实模式。
    </Note>

  </Step>

<a id="step-6-test"></a>
<Step title="测试">
在 `src/channel.test.ts` 中编写并置测试：

    ```typescript src/channel.test.ts
    import { describe, it, expect } from "vitest";
    import { acmeChatPlugin } from "./channel.js";

    describe("acme-chat plugin", () => {
      it("resolves account from config", () => {
        const cfg = {
          channels: {
            "acme-chat": { token: "test-token", allowFrom: ["user1"] },
          },
        } as any;
        const account = acmeChatPlugin.setup!.resolveAccount(cfg, undefined);
        expect(account.token).toBe("test-token");
      });

      it("inspects account without materializing secrets", () => {
        const cfg = {
          channels: { "acme-chat": { token: "test-token" } },
        } as any;
        const result = acmeChatPlugin.setup!.inspectAccount!(cfg, undefined);
        expect(result.configured).toBe(true);
        expect(result.tokenStatus).toBe("available");
      });

      it("reports missing config", () => {
        const cfg = { channels: {} } as any;
        const result = acmeChatPlugin.setup!.inspectAccount!(cfg, undefined);
        expect(result.configured).toBe(false);
      });
    });
    ```

    ```bash
    pnpm test -- <bundled-plugin-root>/acme-chat/
    ```

    有关共享测试帮助函数，参见[测试](/plugins/sdk-testing)。

  </Step>
</Steps>

## 文件结构

```
<bundled-plugin-root>/acme-chat/
├── package.json              # openclaw.channel metadata
├── openclaw.plugin.json      # Manifest with config schema
├── index.ts                  # defineChannelPluginEntry
├── setup-entry.ts            # defineSetupPluginEntry
├── api.ts                    # Public exports (optional)
├── runtime-api.ts            # Internal runtime exports (optional)
└── src/
    ├── channel.ts            # ChannelPlugin via createChatChannelPlugin
    ├── channel.test.ts       # Tests
    ├── client.ts             # Platform API client
    └── runtime.ts            # Runtime store (if needed)
```

## 高级主题

<CardGroup cols={2}>
  <Card title="线程化选项" icon="git-branch" href="/plugins/sdk-entrypoints#registration-mode">
    固定、账户范围或自定义回复模式
  </Card>
  <Card title="消息工具集成" icon="puzzle" href="/plugins/architecture#channel-plugins-and-the-shared-message-tool">
    describeMessageTool 和操作发现
  </Card>
  <Card title="目标解析" icon="crosshair" href="/plugins/architecture#channel-target-resolution">
    inferTargetChatType、looksLikeId、resolveTarget
  </Card>
  <Card title="运行时帮助函数" icon="settings" href="/plugins/sdk-runtime">
    通过 api.runtime 实现 TTS、STT、媒体、子 agent
  </Card>
</CardGroup>

## 下一步

- [提供商插件](/plugins/sdk-provider-plugins) — 如果您的插件也提供模型
- [SDK 概述](/plugins/sdk-overview) — 完整子路径导入参考
- [SDK 测试](/plugins/sdk-testing) — 测试工具和合约测试
- [插件清单](/plugins/manifest) — 完整清单架构
