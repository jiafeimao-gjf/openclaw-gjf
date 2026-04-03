---
summary: "插件内部实现：能力模型、所有权、契约、加载管道和运行时辅助函数"
read_when:
  - 构建或调试原生 OpenClaw 插件
  - 理解插件能力模型或所有权边界
  - 从事插件加载管道或注册表工作
  - 实现提供商运行时钩子或渠道插件
title: "插件内部实现"
sidebarTitle: "内部实现"
---

# 插件内部实现

<Info>
  这是**深度架构参考**。如需实用指南，参见：
  - [安装和使用插件](/tools/plugin) — 用户指南
  - [入门指南](/plugins/building-plugins) — 第一个插件教程
  - [渠道插件](/plugins/sdk-channel-plugins) — 构建消息渠道
  - [提供商插件](/plugins/sdk-provider-plugins) — 构建模型提供商
  - [SDK 概览](/plugins/sdk-overview) — 导入地图和注册 API
</Info>

本页面涵盖 OpenClaw 插件系统的内部架构。

## 公共能力模型

能力是 OpenClaw 内部**原生插件**的公共模型。每个
原生 OpenClaw 插件注册一个或多个能力类型：

| 能力 | 注册方法 | 示例插件 |
| --------------------- | --------------------------------------------- | ------------------------- |
| 文本推理 | `api.registerProvider(...)` | `openai`、`anthropic` |
| CLI 推理后端 | `api.registerCliBackend(...)` | `openai`、`anthropic` |
| 语音 | `api.registerSpeechProvider(...)` | `elevenlabs`、`microsoft` |
| 媒体理解 | `api.registerMediaUnderstandingProvider(...)` | `openai`、`google` |
| 图片生成 | `api.registerImageGenerationProvider(...)` | `openai`、`google` |
| 网络搜索 | `api.registerWebSearchProvider(...)` | `google` |
| 渠道/消息 | `api.registerChannel(...)` | `msteams`、`matrix` |

注册零个能力但提供钩子、工具或服务的插件是**仅钩子旧插件**。该模式仍然完全支持。

### 外部兼容性立场

能力模型已在核心中落地并被捆绑/原生插件使用，但外部插件兼容性仍然需要比"它被导出了，因此它是冻结的"更严格的门槛。

当前指导：

- **现有外部插件：** 保持基于钩子的集成工作；将此作为兼容性基线
- **新的捆绑/原生插件：** 优先使用明确的 capability 注册，而非供应商特定的 reach-in 或新的仅钩子设计
- **采用 capability 注册的外部插件：** 允许，但将 capability 特定的辅助函数表面视为正在发展，除非文档明确将某个契约标记为稳定

实用规则：

- capability 注册 API 是预期方向
- 传统钩子在过渡期间仍然是外部插件最安全的无破坏路径
- 导出的辅助函数子路径并非都相同；优先使用窄文档化契约，而非偶然的辅助函数导出

### 插件形态

OpenClaw 根据插件的实际注册行为（而非静态元数据）将每个已加载插件分类为一种形态：

- **plain-capability** — 仅注册一种 capability 类型（例如仅提供商的插件如 `mistral`）
- **hybrid-capability** — 注册多种 capability 类型（例如 `openai` 拥有文本推理、语音、媒体理解和图片生成）
- **hook-only** — 仅注册钩子（类型化或自定义），无 capabilities、工具、命令或服务
- **non-capability** — 注册工具、命令、服务或路由，但无 capabilities

使用 `openclaw plugins inspect <id>` 查看插件的形态和 capability 分解。参见 [CLI 参考](/cli/plugins#inspect) 获取详情。

### 传统钩子

`before_agent_start` 钩子仍然作为仅钩子插件的兼容性路径被支持。传统现实世界插件仍然依赖它。

方向：

- 保持其工作
- 标记为传统
- 优先使用 `before_model_resolve` 进行模型/提供商覆盖工作
- 优先使用 `before_prompt_build` 进行提示修改工作
- 仅在实际使用量下降且 fixture 覆盖证明迁移安全性后才能移除

### 兼容性信号

当你运行 `openclaw doctor` 或 `openclaw plugins inspect <id>` 时，你可能会看到以下标签之一：

| 信号 | 含义 |
| -------------------------- | ------------------------------------------------------------ |
| **config valid** | 配置解析正常且插件可解析 |
| **compatibility advisory** | 插件使用支持但较旧的模式（例如 `hook-only`） |
| **legacy warning** | 插件使用 `before_agent_start`，已弃用 |
| **hard error** | 配置无效或插件加载失败 |

`hook-only` 和 `before_agent_start` 今天都不会破坏你的插件 — `hook-only` 是建议性的，`before_agent_start` 只触发警告。这些信号也出现在 `openclaw status --all` 和 `openclaw plugins doctor` 中。

## 架构概述

OpenClaw 的插件系统有四层：

1. **清单 + 发现**
   OpenClaw 从配置的路径、工作区根、全局扩展根和捆绑扩展中找到候选插件。发现首先读取原生
   `openclaw.plugin.json` 清单以及支持的 bundle 清单。
2. **启用 + 验证**
   核心决定已发现插件是启用、禁用、阻止，还是选择用于内存等独占槽。
3. **运行时加载**
   原生 OpenClaw 插件通过 jiti 加载到进程中，并注册
   capabilities 到中央注册表。兼容 bundle 在不导入运行时代码的情况下被规范化为注册表记录。
4. **表面消费**
   OpenClaw 的其余部分读取注册表以暴露工具、渠道、提供商设置、钩子、HTTP 路由、CLI 命令和服务。

对于插件 CLI，根命令发现分为两个阶段：

- 解析时元数据来自 `registerCli(..., { descriptors: [...] })`
- 真正的插件 CLI 模块可以保持惰性并在首次调用时注册

这使得插件拥有的 CLI 代码保留在插件内部，同时仍让 OpenClaw 在解析前保留根命令名称。

重要的设计边界：

- 发现 + 配置验证应该从**清单/schema 元数据**工作，不执行插件代码
- 原生运行时行为来自插件模块的 `register(api)` 路径

这种分离让 OpenClaw 在完整运行时激活之前验证配置、解释缺失/禁用的插件，并构建 UI/schema 提示。

### 渠道插件和共享消息工具

渠道插件不需要为正常聊天操作注册单独的发送/编辑/反应工具。OpenClaw 在核心中保留一个共享的 `message` 工具，而渠道插件在其后拥有渠道特定的发现和执行。

当前边界是：

- 核心拥有共享 `message` 工具宿主、提示线路、会话/线程簿记和执行调度
- 渠道插件拥有作用域操作发现、能力发现和任何渠道特定的 schema 片段
- 渠道插件拥有提供商特定的会话对话语法，例如对话 id 如何编码线程 id 或从父对话继承
- 渠道插件通过其操作适配器执行最终操作

对于渠道插件，SDK 表面是
`ChannelMessageActionAdapter.describeMessageTool(...)`。这个统一发现调用让插件可以一起返回其可见操作、能力
和 schema 贡献，这样这些部分就不会相互偏离。

核心将运行时范围传递到该发现步骤。重要字段包括：

- `accountId`
- `currentChannelId`
- `currentThreadTs`
- `currentMessageId`
- `sessionKey`
- `sessionId`
- `agentId`
- 受信任的入站 `requesterSenderId`

这对于上下文敏感插件很重要。渠道可以根据活动账户、当前房间/线程/消息或受信任请求者身份隐藏或暴露消息操作，而无需在核心 `message` 工具中硬编码渠道特定分支。

这就是 embedded-runner 路由变更仍然是插件工作的原因：runner 负责将当前聊天/会话身份转发到插件发现边界，使共享 `message` 工具为当前轮次暴露正确的渠道拥有表面。

对于渠道拥有的执行辅助函数，捆绑插件应将执行运行时保留在自己的扩展模块内部。核心不再拥有 Discord、Slack、Telegram 或 WhatsApp 消息操作运行时代码位于 `src/agents/tools`。我们不发布单独的 `plugin-sdk/*-action-runtime` 子路径，捆绑插件应直接从其扩展拥有的模块导入自己的本地运行时代码。

相同的边界也适用于提供商命名的 SDK 接缝：核心不应为 Slack、Discord、Signal、WhatsApp 或类似扩展导入渠道特定的便利桶。如果核心需要某种行为，要么消费捆绑插件自己的 `api.ts` / `runtime-api.ts` 桶，要么将需求提升为共享 SDK 中的窄泛型 capability。

对于投票，具体有两种执行路径：

- `outbound.sendPoll` 是适合通用投票模型的渠道的共享基线
- `actions.handleAction("poll")` 是渠道特定投票语义或额外投票参数的首选路径

核心现在将共享投票解析推迟到插件投票调度拒绝操作之后，因此插件拥有的投票处理器可以接受渠道特定的投票字段，而不会被通用投票解析器首先阻止。

参见 [加载管道](#load-pipeline) 获取完整的启动序列。

## 能力所有权模型

OpenClaw 将原生插件视为**公司**或**功能**的所有权边界，而不是无关集成的杂烩袋。

这意味着：

- 公司插件通常应拥有该公司所有面向 OpenClaw 的表面
- 功能插件通常应拥有它引入的完整功能表面
- 渠道应消费共享核心能力，而非临时重新实现提供商行为

示例：

- 捆绑的 `openai` 插件拥有 OpenAI 模型提供商行为以及 OpenAI 语音 + 媒体理解 + 图片生成行为
- 捆绑的 `elevenlabs` 插件拥有 ElevenLabs 语音行为
- 捆绑的 `microsoft` 插件拥有 Microsoft 语音行为
- 捆绑的 `google` 插件拥有 Google 模型提供商行为以及 Google 媒体理解 + 图片生成 + 网络搜索行为
- 捆绑的 `minimax`、`mistral`、`moonshot` 和 `zai` 插件拥有各自的媒体理解后端
- `voice-call` 插件是一个功能插件：它拥有通话传输、工具、CLI、路由和运行时，但它消费核心 TTS/STT capability 而非发明第二个语音堆栈

预期最终状态是：

- OpenAI 生活在一个插件中，即使用它跨越文本模型、语音、图片和未来视频
- 另一个供应商可以为其自己的表面区域做同样的事情
- 渠道不关心哪个供应商插件拥有该提供商；它们消费核心暴露的共享 capability 契约

关键区别：

- **插件** = 所有权边界
- **能力** = 多个插件可以实现或消费的核心契约

所以如果 OpenClaw 添加了新领域（如视频），第一个问题不是"哪个提供商应该硬编码视频处理？"第一个问题是"核心视频能力契约是什么？"一旦该契约存在，供应商插件可以注册它，渠道/功能插件可以消费它。

如果能力尚不存在，正确的做法通常是：

1. 在核心中定义缺失的能力
2. 通过类型化的方式通过插件 API/运行时暴露它
3. 将渠道/功能连接到此能力
4. 让供应商插件注册实现

这保持所有权明确，同时避免依赖于单一供应商或临时插件特定代码路径的核心行为。

### 能力分层

在决定代码属于哪里时使用这个心智模型：

- **核心能力层**：共享编排、策略、回退、配置合并规则、传递语义和类型化契约
- **供应商插件层**：供应商特定 API、认证、模型目录、语音合成、图片生成、未来视频后端、使用量端点
- **渠道/功能插件层**：Slack/Discord/语音通话等集成，消费核心能力并在其表面呈现

例如，TTS 遵循此形态：

- 核心拥有回复时 TTS 策略、回退顺序、首选项和渠道传递
- `openai`、`elevenlabs` 和 `microsoft` 拥有合成实现
- `voice-call` 消费电话 TTS 运行时辅助函数

未来的能力应优先采用相同模式。

### 多能力公司插件示例

公司插件从外部应感觉是内聚的。如果 OpenClaw 有模型、语音、媒体理解和网络搜索的共享契约，供应商可以在一处拥有其所有表面：

```ts
import type { OpenClawPluginDefinition } from "openclaw/plugin-sdk/plugin-entry";
import {
  describeImageWithModel,
  transcribeOpenAiCompatibleAudio,
} from "openclaw/plugin-sdk/media-understanding";

const plugin: OpenClawPluginDefinition = {
  id: "exampleai",
  name: "ExampleAI",
  register(api) {
    api.registerProvider({
      id: "exampleai",
      // auth/model catalog/runtime hooks
    });

    api.registerSpeechProvider({
      id: "exampleai",
      // vendor speech config — implement the SpeechProviderPlugin interface directly
    });

    api.registerMediaUnderstandingProvider({
      id: "exampleai",
      capabilities: ["image", "audio", "video"],
      async describeImage(req) {
        return describeImageWithModel({
          provider: "exampleai",
          model: req.model,
          input: req.input,
        });
      },
      async transcribeAudio(req) {
        return transcribeOpenAiCompatibleAudio({
          provider: "exampleai",
          model: req.model,
          input: req.input,
        });
      },
    });

    api.registerWebSearchProvider(
      createPluginBackedWebSearchProvider({
        id: "exampleai-search",
        // credential + fetch logic
      }),
    );
  },
};

export default plugin;
```

重要的不是确切辅助函数名称。形态很重要：

- 一个插件拥有供应商表面
- 核心仍然拥有能力契约
- 渠道和功能插件消费 `api.runtime.*` 辅助函数，而非供应商代码
- 契约测试可以断言插件注册了它声称拥有的 capabilities

### 能力示例：视频理解

OpenClaw 已经将图片/音频/视频理解视为一个共享能力。同样的所有权模型适用：

1. 核心定义 media-understanding 契约
2. 供应商插件注册 `describeImage`、`transcribeAudio` 和 `describeVideo`（如适用）
3. 渠道和功能插件消费共享核心行为，而非直接连接到供应商代码

这避免将一个提供商的视频假设烘焙到核心中。插件拥有供应商表面；核心拥有能力契约和回退行为。

如果 OpenClaw 稍后添加新领域（如视频生成），使用相同的序列：先定义核心能力，然后让供应商插件注册实现。

需要具体的推广检查清单？参见[能力烹饪书](/tools/capability-cookbook)。

## 契约和执行

插件 API 表面在 `OpenClawPluginApi` 中有意类型化并集中。该契约定义了支持的注册点和插件可能依赖的运行时辅助函数。

为什么这很重要：

- 插件作者获得一个稳定的内部标准
- 核心可以拒绝重复所有权，例如两个插件注册相同的提供商 id
- 启动可以为主控错误注册提供可操作的诊断
- 契约测试可以执行捆绑插件所有权并防止静默偏离

执行有两个层：

1. **运行时注册执行**
   插件注册表在插件加载时验证注册。例如：重复的提供商 id、重复的语音提供商 id 和格式错误的注册会产生插件诊断，而非未定义行为。
2. **契约测试**
   捆绑插件在测试运行期间被捕获到契约注册表中，以便 OpenClaw 可以明确断言所有权。目前这用于模型提供商、语音提供商、网络搜索提供商和捆绑注册所有权。

实际效果是 OpenClaw 预先知道哪个插件拥有哪个表面。这让核心和渠道可以无缝组合，因为所有权是声明性的、类型化的和可测试的，而非隐式的。

### 什么属于契约

好的插件契约是：

- 类型化的
- 小型的
- 能力特定的
- 由核心拥有的
- 可被多个插件复用的
- 可被渠道/功能消费而无需供应商知识的

坏的插件契约是：

- 隐藏在核心中的供应商特定策略
- 绕过注册表的临时插件逃生口
- 渠道代码直接进入供应商实现
- 不属于 `OpenClawPluginApi` 或 `api.runtime` 的临时运行时对象

如有疑问，提升抽象级别：先定义能力，然后让插件插入。

## 执行模型

原生 OpenClaw 插件与 Gateway **在同一进程中**运行。它们不是沙箱化的。加载的原生插件与核心代码具有相同的进程级信任边界。

含义：

- 原生插件可以注册工具、网络处理器、钩子和服务
- 原生插件错误可能崩溃或破坏 gateway
- 恶意原生插件等同于 OpenClaw 进程内的任意代码执行

兼容 bundle 默认更安全，因为 OpenClaw 目前将它们视为元数据/内容包。在当前版本中，这主要包括捆绑的技能。

对非捆绑插件使用白名单和明确的安装/加载路径。将工作区插件视为开发时代码，而非生产默认值。

对于捆绑工作区包名称，请在 npm 名称中保持插件 id 锚定：默认情况下为 `@openclaw/<id>`，或批准的类型化后缀如 `-provider`、`-plugin`、`-speech`、`-sandbox` 或 `-media-understanding`，当包故意暴露较窄的插件角色时。

重要的信任说明：

- `plugins.allow` 信任**插件 id**，而非来源出处。
- 具有与捆绑插件相同 id 的工作区插件在启用/列入白名单时有意覆盖捆绑副本。
- 这对于本地开发、补丁测试和热修复是正常且有用的。

## 导出边界

OpenClaw 导出 capabilities，而非实现便利。

保持 capability 注册公开。精简非契约辅助函数导出：

- 捆绑插件特定的辅助函数子路径
- 不打算作为公共 API 的运行时管道子路径
- 供应商特定的便利辅助函数
- 作为实现细节的设置/入职辅助函数

## 加载管道

在启动时，OpenClaw 大致执行以下操作：

1. 发现候选插件根
2. 读取原生或兼容 bundle 清单和包元数据
3. 拒绝不安全的候选
4. 规范化插件配置（`plugins.enabled`、`allow`、`deny`、`entries`、`slots`、`load.paths`）
5. 为每个候选决定启用状态
6. 通过 jiti 加载启用的原生模块
7. 调用原生 `register(api)`（或 `activate(api)` — 传统别名）钩子并将注册收集到插件注册表
8. 向命令/运行时表面暴露注册表

<Note>
`activate` 是 `register` 的传统别名 — 加载器解析存在的那个（`def.register ?? def.activate`）并在相同时间点调用它。所有捆绑插件使用 `register`；新插件请优先使用 `register`。
</Note>

安全门发生在**运行时执行之前**。候选在以下情况下被阻止：条目逃逸插件根、路径是全局可写的，或者路径所有权对非捆绑插件看起来可疑。

### 清单优先行为

清单是控制平面的真实来源。OpenClaw 使用它来：

- 识别插件
- 发现声明的渠道/技能/配置 schema 或 bundle capabilities
- 验证 `plugins.entries.<id>.config`
- 增强控制 UI 标签/占位符
- 显示安装/目录元数据

对于原生插件，运行时模块是数据平面部分。它注册实际行为，如钩子、工具、命令或提供商流程。

### 加载器缓存什么

OpenClaw 为以下内容保持短期进程内缓存：

- 发现结果
- 清单注册表数据
- 已加载插件注册表

这些缓存减少突发启动和重复命令开销。它们可以安全地视为短期性能缓存，而非持久化。

性能说明：

- 设置 `OPENCLAW_DISABLE_PLUGIN_DISCOVERY_CACHE=1` 或 `OPENCLAW_DISABLE_PLUGIN_MANIFEST_CACHE=1` 可禁用这些缓存。
- 使用 `OPENCLAW_PLUGIN_DISCOVERY_CACHE_MS` 和 `OPENCLAW_PLUGIN_MANIFEST_CACHE_MS` 调整缓存窗口。

## 注册表模型

已加载插件不直接修改随机核心全局变量。它们注册到中央插件注册表。

注册表跟踪：

- 插件记录（身份、来源、起源、状态、诊断）
- 工具
- 传统钩子和类型化钩子
- 渠道
- 提供商
- Gateway RPC 处理器
- HTTP 路由
- CLI 注册器
- 后台服务
- 插件拥有的命令

核心功能然后从注册表读取，而非直接与插件模块通信。这保持加载单向：

- 插件模块 -> 注册表注册
- 核心运行时 -> 注册表消费

这种分离对可维护性很重要。它意味着大多数核心表面只需要一个集成点："读取注册表"，而非"特殊处理每个插件模块"。

## 对话绑定回调

绑定对话的插件可以在批准被解析时做出反应。

使用 `api.onConversationBindingResolved(...)` 在绑定请求被批准或拒绝后接收回调：

```ts
export default {
  id: "my-plugin",
  register(api) {
    api.onConversationBindingResolved(async (event) => {
      if (event.status === "approved") {
        // 此插件和对话的绑定现在存在。
        console.log(event.binding?.conversationId);
        return;
      }

      // 请求被拒绝；清除任何本地待处理状态。
      console.log(event.request.conversation.conversationId);
    });
  },
};
```

回调负载字段：

- `status`：`"approved"` 或 `"denied"`
- `decision`：`"allow-once"`、`"allow-always"` 或 `"deny"`
- `binding`：已批准请求的解析绑定
- `request`：原始请求摘要、分离提示、发送者 id 和对话元数据

此回调仅用于通知。它不改变谁被允许绑定对话，且它在核心批准处理完成后运行。

## 提供商运行时钩子

提供商插件现在有两层：

- 清单元数据：`providerAuthEnvVars` 用于运行时加载前的廉价环境认证查找，加上 `providerAuthChoices` 用于运行时加载前的廉价入职/认证选择标签和 CLI 标志元数据
- 配置时钩子：`catalog` / 传统 `discovery`
- 运行时钩子：`resolveDynamicModel`、`prepareDynamicModel`、`normalizeResolvedModel`、`capabilities`、`prepareExtraParams`、`wrapStreamFn`、`formatApiKey`、`refreshOAuth`、`buildAuthDoctorHint`、`isCacheTtlEligible`、`buildMissingAuthMessage`、`suppressBuiltInModel`、`augmentModelCatalog`、`isBinaryThinking`、`supportsXHighThinking`、`resolveDefaultThinkingLevel`、`isModernModelRef`、`prepareRuntimeAuth`、`resolveUsageAuth`、`fetchUsageSnapshot`、`buildReplayPolicy`、`sanitizeReplayHistory`、`validateReplayTurns`

OpenClaw 仍然拥有通用 Agent 循环、故障转移、转录处理和工具策略。这些钩子是提供商特定行为的扩展表面，无需完整的自定义推理传输。

当提供商有环境凭证且通用认证/状态/模型选择器路径应在不加载插件运行时的情况下看到时，使用清单 `providerAuthEnvVars`。当入职/认证选择 CLI 表面应知道提供商的选项 id、分组标签和简单单标志认证接线而不加载提供商运行时时，使用清单 `providerAuthChoices`。保持提供商运行时 `envVars` 用于操作员面向的提示，如入职标签或 OAuth 客户端 id/客户端密钥设置变量。

### 钩子顺序和用法

对于模型/提供商插件，OpenClaw 大致按此顺序调用钩子。"何时使用"列是快速决策指南。

| # | 钩子 | 作用 | 何时使用 |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 | `catalog` | 在 `models.json` 生成期间将提供商配置发布到 `models.providers` | 提供商拥有目录或 base URL 默认值 |
| -- | _(内置模型查找)_ | OpenClaw 先尝试正常的注册表/目录路径 | _(不是插件钩子)_ |
| 2 | `resolveDynamicModel` | 提供商拥有的模型 id（尚不在本地注册表中）的同步回退 | 提供商接受任意上游模型 id |
| 3 | `prepareDynamicModel` | 异步预热，然后再次运行 `resolveDynamicModel` | 提供商在解析未知 id 前需要网络元数据 |
| 4 | `normalizeResolvedModel` | 嵌入式运行器使用解析模型前的最终重写 | 提供商需要传输重写但仍使用核心传输 |
| 5 | `capabilities` | 共享核心逻辑使用的提供商拥有的转录/工具元数据 | 提供商需要转录/提供商家族怪癖 |
| 6 | `prepareExtraParams` | 通用流选项包装器之前的请求参数规范化 | 提供商需要默认请求参数或按提供商的参数清理 |
| 7 | `wrapStreamFn` | 通用包装器应用后的流包装器 | 提供商需要请求头/ body/模型兼容包装器而无自定义传输 |
| 8 | `formatApiKey` | 认证配置格式化器：存储的配置成为运行时 `apiKey` 字符串 | 提供商存储额外认证元数据并需要自定义运行时令牌形状 |
| 9 | `refreshOAuth` | 自定义刷新端点或刷新失败策略的 OAuth 刷新覆盖 | 提供商不适合共享 `pi-ai` 刷新器 |
| 10 | `buildAuthDoctorHint` | OAuth 刷新失败时追加的修复提示 | 提供商在刷新失败后需要提供商拥有的认证修复指导 |
| 11 | `isCacheTtlEligible` | 代理/回程提供商的提示缓存策略 | 提供商需要代理特定缓存 TTL 门控 |
| 12 | `buildMissingAuthMessage` | 通用缺少认证恢复消息的替代 | 提供商需要提供商特定的缺少认证恢复提示 |
| 13 | `suppressBuiltInModel` | 过时上游模型抑制以及可选的用户面向错误提示 | 提供商需要隐藏过时的上游行或用供应商提示替换它们 |
| 14 | `augmentModelCatalog` | 发现后追加的合成/最终目录行 | 提供商需要在 `models list` 和选择器中需要合成前瞻兼容行 |
| 15 | `isBinaryThinking` | 二进制思考提供商的开关 | 提供商仅暴露二进制思考开关 |
| 16 | `supportsXHighThinking` | 所选模型的 `xhigh` 推理支持 | 提供商希望在模型子集上使用 `xhigh` |
| 17 | `resolveDefaultThinkingLevel` | 特定模型家族的默认 `/think` 级别 | 提供商拥有模型家族的默认 `/think` 策略 |
| 18 | `isModernModelRef` | 实时配置过滤和烟雾选择的现代模型匹配器 | 提供商拥有实时/烟雾首选模型匹配 |
| 19 | `prepareRuntimeAuth` | 在推理前不久将配置的凭证交换为实际运行时令牌/密钥 | 提供商需要令牌交换或短生命周期请求凭证 |
| 20 | `resolveUsageAuth` | 为 `/usage` 和相关状态表面解析使用量/计费凭证 | 提供商需要自定义使用量/配额令牌解析或不同的使用量凭证 |
| 21 | `fetchUsageSnapshot` | 认证解析后获取并规范化提供商特定的使用量/配额快照 | 提供商需要提供商特定的使用量端点或负载解析器 |
| 22 | `buildReplayPolicy` | 返回控制提供商转录处理的回放策略 | 提供商需要自定义转录策略（例如思考块剥离） |
| 23 | `sanitizeReplayHistory` | 通用转录清理后的回放历史重写 | 提供商需要超出共享压缩辅助函数的提供商特定回放重写 |
| 24 | `validateReplayTurns` | 嵌入式运行器之前的最终回放轮验证或重塑 | 提供商传输在通用清理后需要更严格的轮验证 |

如果提供商需要完全自定义的线协议或自定义请求执行器，那是不同类的扩展。这些钩子适用于仍在 OpenClaw 正常推理循环上运行的提供商行为。

### 提供商示例

```ts
api.registerProvider({
  id: "example-proxy",
  label: "Example Proxy",
  auth: [],
  catalog: {
    order: "simple",
    run: async (ctx) => {
      const apiKey = ctx.resolveProviderApiKey("example-proxy").apiKey;
      if (!apiKey) {
        return null;
      }
      return {
        provider: {
          baseUrl: "https://proxy.example.com/v1",
          apiKey,
          api: "openai-completions",
          models: [{ id: "auto", name: "Auto" }],
        },
      };
    },
  },
  resolveDynamicModel: (ctx) => ({
    id: ctx.modelId,
    name: ctx.modelId,
    provider: "example-proxy",
    api: "openai-completions",
    baseUrl: "https://proxy.example.com/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  }),
  prepareRuntimeAuth: async (ctx) => {
    const exchanged = await exchangeToken(ctx.apiKey);
    return {
      apiKey: exchanged.token,
      baseUrl: exchanged.baseUrl,
      expiresAt: exchanged.expiresAt,
    };
  },
  resolveUsageAuth: async (ctx) => {
    const auth = await ctx.resolveOAuthToken();
    return auth ? { token: auth.token } : null;
  },
  fetchUsageSnapshot: async (ctx) => {
    return await fetchExampleProxyUsage(ctx.token, ctx.timeoutMs, ctx.fetchFn);
  },
});
```

### 内置示例

- Anthropic 使用 `resolveDynamicModel`、`capabilities`、`buildAuthDoctorHint`、`resolveUsageAuth`、`fetchUsageSnapshot`、`isCacheTtlEligible`、`resolveDefaultThinkingLevel` 和 `isModernModelRef`，因为它拥有 Claude 4.6 前瞻兼容、提供商家族提示、认证修复指导、使用量端点集成、提示缓存资格以及 Claude 默认/自适应思考策略。
- OpenAI 使用 `resolveDynamicModel`、`normalizeResolvedModel` 和 `capabilities` 加上 `buildMissingAuthMessage`、`suppressBuiltInModel`、`augmentModelCatalog`、`supportsXHighThinking` 和 `isModernModelRef`，因为它拥有 GPT-5.4 前瞻兼容、直接 OpenAI `openai-completions` -> `openai-responses` 规范化、Codex 感知认证提示、Spark 抑制、合成 OpenAI 列表行以及 GPT-5 思考/实时模型策略。
- OpenRouter 使用 `catalog` 加上 `resolveDynamicModel` 和 `prepareDynamicModel`，因为该提供商是直通式的，可能在 OpenClaw 静态目录更新之前暴露新模型 id；它还使用 `capabilities`、`wrapStreamFn` 和 `isCacheTtlEligible` 以保持提供商特定的请求头、路由元数据、推理补丁和提示缓存策略在核心之外。
- GitHub Copilot 使用 `catalog`、`auth`、`resolveDynamicModel` 和 `capabilities` 加上 `prepareRuntimeAuth` 和 `fetchUsageSnapshot`，因为它需要提供商拥有的设备登录、模型回退行为、Claude 转录怪癖、GitHub 令牌 -> Copilot 令牌交换以及提供商拥有的使用量端点。
- OpenAI Codex 使用 `catalog`、`resolveDynamicModel`、`normalizeResolvedModel`、`refreshOAuth` 和 `augmentModelCatalog` 加上 `prepareExtraParams`、`resolveUsageAuth` 和 `fetchUsageSnapshot`，因为它仍在核心 OpenAI 传输上运行，但拥有其传输/ base URL 规范化、OAuth 刷新回退策略、默认传输选择、合成 Codex 目录行和 ChatGPT 使用量端点集成。
- Google AI Studio 和 Gemini CLI OAuth 使用 `resolveDynamicModel` 和 `isModernModelRef`，因为它们拥有 Gemini 3.1 前瞻兼容回退和现代模型匹配；Gemini CLI OAuth 还使用 `formatApiKey`、`resolveUsageAuth` 和 `fetchUsageSnapshot` 用于令牌格式化、令牌解析和配额端点接线。
- Moonshot 使用 `catalog` 加上 `wrapStreamFn`，因为它仍使用共享 OpenAI 传输，但需要提供商拥有的思考负载规范化。
- Kilocode 使用 `catalog`、`capabilities`、`wrapStreamFn` 和 `isCacheTtlEligible`，因为它需要提供商拥有的请求头、推理负载规范化、Gemini 转录提示和 Anthropic 缓存 TTL 门控。
- Z.AI 使用 `resolveDynamicModel`、`prepareExtraParams`、`wrapStreamFn`、`isCacheTtlEligible`、`isBinaryThinking`、`isModernModelRef`、`resolveUsageAuth` 和 `fetchUsageSnapshot`，因为它拥有 GLM-5 回退、`tool_stream` 默认值、二进制思考 UX、现代模型匹配以及使用量认证 + 配额获取。
- Mistral、OpenCode Zen 和 OpenCode Go 仅使用 `capabilities` 以将转录/工具怪癖保持在核心之外。
- 仅目录的捆绑提供商如 `byteplus`、`cloudflare-ai-gateway`、`huggingface`、`kimi-coding`、`modelstudio`、`nvidia`、`qianfan`、`synthetic`、`together`、`venice`、`vercel-ai-gateway` 和 `volcengine` 仅使用 `catalog`。
- MiniMax 和 Xiaomi 使用 `catalog` 加上使用量钩子，因为它们的 `/usage` 行为是插件拥有的，尽管推理仍通过共享传输运行。

## 运行时辅助函数

插件可以通过 `api.runtime` 访问选定的核心辅助函数。对于 TTS：

```ts
const clip = await api.runtime.tts.textToSpeech({
  text: "Hello from OpenClaw",
  cfg: api.config,
});

const result = await api.runtime.tts.textToSpeechTelephony({
  text: "Hello from OpenClaw",
  cfg: api.config,
});

const voices = await api.runtime.tts.listVoices({
  provider: "elevenlabs",
  cfg: api.config,
});
```

注意：

- `textToSpeech` 返回文件/语音便笺表面的正常核心 TTS 输出负载。
- 使用核心 `messages.tts` 配置和提供商选择。
- 返回 PCM 音频缓冲区 + 采样率。插件必须为提供商重新采样/编码。
- `listVoices` 按提供商可选。使用它用于供应商拥有的语音选择器或设置流程。
- 语音列表可以包含更丰富的元数据，如语言环境、性别和人格标签，用于提供商感知的选择器。
- OpenAI 和 ElevenLabs 目前支持电话。Microsoft 不支持。

插件也可以通过 `api.registerSpeechProvider(...)` 注册语音提供商。

```ts
api.registerSpeechProvider({
  id: "acme-speech",
  label: "Acme Speech",
  isConfigured: ({ config }) => Boolean(config.messages?.tts),
  synthesize: async (req) => {
    return {
      audioBuffer: Buffer.from([]),
      outputFormat: "mp3",
      fileExtension: ".mp3",
      voiceCompatible: false,
    };
  },
});
```

注意：

- 将 TTS 策略、回退和回复传递保持在核心。
- 使用语音提供商用于供应商拥有的合成行为。
- 传统 Microsoft `edge` 输入被规范化为 `microsoft` 提供商 id。
- 首选所有权模型是公司导向的：一个供应商插件可以拥有文本、语音、图片和未来媒体提供商，因为 OpenClaw 添加了这些能力契约。

对于图片/音频/视频理解，插件注册一个类型化的 media-understanding 提供商，而非通用键/值袋：

```ts
api.registerMediaUnderstandingProvider({
  id: "google",
  capabilities: ["image", "audio", "video"],
  describeImage: async (req) => ({ text: "..." }),
  transcribeAudio: async (req) => ({ text: "..." }),
  describeVideo: async (req) => ({ text: "..." }),
});
```

注意：

- 将编排、回退、配置和渠道接线保持在核心。
- 将供应商行为保持在提供商插件中。
- 添加性扩展应保持类型化：新可选方法、新可选结果字段、新可选 capabilities。
- 如果 OpenClaw 稍后添加新能力（如视频生成），先定义核心能力契约，然后让供应商插件注册它。

对于 media-understanding 运行时辅助函数，插件可以调用：

```ts
const image = await api.runtime.mediaUnderstanding.describeImageFile({
  filePath: "/tmp/inbound-photo.jpg",
  cfg: api.config,
  agentDir: "/tmp/agent",
});

const video = await api.runtime.mediaUnderstanding.describeVideoFile({
  filePath: "/tmp/inbound-video.mp4",
  cfg: api.config,
});
```

对于音频转录，插件可以使用 media-understanding 运行时或较旧的 STT 别名：

```ts
const { text } = await api.runtime.mediaUnderstanding.transcribeAudioFile({
  filePath: "/tmp/inbound-audio.ogg",
  cfg: api.config,
  // 当 MIME 无法可靠推断时可选：
  mime: "audio/ogg",
});
```

注意：

- `api.runtime.mediaUnderstanding.*` 是图片/音频/视频理解的首选共享表面。
- 使用核心 media-understanding 音频配置（`tools.media.audio`）和提供商回退顺序。
- 当没有产生转录输出时返回 `{ text: undefined }`（例如跳过/不支持的输入）。
- `api.runtime.stt.transcribeAudioFile(...)` 保留作为兼容性别名。

插件也可以通过 `api.runtime.subagent` 启动后台子代理运行：

```ts
const result = await api.runtime.subagent.run({
  sessionKey: "agent:main:subagent:search-helper",
  message: "Expand this query into focused follow-up searches.",
  provider: "openai",
  model: "gpt-4.1-mini",
  deliver: false,
});
```

注意：

- `provider` 和 `model` 是可选的每次运行覆盖，而非持久会话更改。
- OpenClaw 仅对受信任调用者兑现这些覆盖字段。
- 对于插件拥有的回退运行，操作员必须通过 `plugins.entries.<id>.subagent.allowModelOverride: true` 选择加入。
- 使用 `plugins.entries.<id>.subagent.allowedModels` 将受信任插件限制为特定规范 `provider/model` 目标，或 `"*"` 明确允许任何目标。
- 不受信任插件的子代理运行仍然有效，但覆盖请求会被拒绝而非静默回退。

对于网络搜索，插件可以消费共享运行时辅助函数，而非进入代理工具接线：

```ts
const providers = api.runtime.webSearch.listProviders({
  config: api.config,
});

const result = await api.runtime.webSearch.search({
  config: api.config,
  args: {
    query: "OpenClaw plugin runtime helpers",
    count: 5,
  },
});
```

插件也可以通过 `api.registerWebSearchProvider(...)` 注册网络搜索提供商。

注意：

- 将提供商选择、凭证解析和共享请求语义保持在核心。
- 使用网络搜索提供商用于供应商特定的搜索传输。
- `api.runtime.webSearch.*` 是需要搜索行为而无需依赖代理工具包装器的功能/渠道插件的首选共享表面。

### `api.runtime.imageGeneration`

```ts
const result = await api.runtime.imageGeneration.generate({
  config: api.config,
  args: { prompt: "A friendly lobster mascot", size: "1024x1024" },
});

const providers = api.runtime.imageGeneration.listProviders({
  config: api.config,
});
```

- `generate(...)`：使用配置的图片生成提供商链生成图片。
- `listProviders(...)`：列出可用图片生成提供商及其能力。

## Gateway HTTP 路由

插件可以通过 `api.registerHttpRoute(...)` 暴露 HTTP 端点。

```ts
api.registerHttpRoute({
  path: "/acme/webhook",
  auth: "plugin",
  match: "exact",
  handler: async (_req, res) => {
    res.statusCode = 200;
    res.end("ok");
    return true;
  },
});
```

路由字段：

- `path`：Gateway HTTP 服务器下的路由路径。
- `auth`：必需。使用 `"gateway"` 要求正常 Gateway 认证，或 `"plugin"` 用于插件管理的认证/webhook 验证。
- `match`：可选。`"exact"`（默认）或 `"prefix"`。
- `replaceExisting`：可选。允许同一插件替换自己的现有路由注册。
- `handler`：当路由处理请求时返回 `true`。

注意：

- `api.registerHttpHandler(...)` 已被移除，会导致插件加载错误。请改用 `api.registerHttpRoute(...)`。
- 插件路由必须明确声明 `auth`。
- 精确 `path + match` 冲突会被拒绝，除非 `replaceExisting: true`，且一个插件不能替换另一个插件的路由。
- 具有不同 `auth` 级别的重叠路由会被拒绝。仅在同一 auth 级别上保持精确/前缀顺序链。

## 插件 SDK 导入路径

创作插件时使用 SDK 子路径而非整体的 `openclaw/plugin-sdk` 导入：

- `openclaw/plugin-sdk/plugin-entry` 用于插件注册原语。
- `openclaw/plugin-sdk/core` 用于通用共享插件面向契约。
- 稳定的渠道原语如 `openclaw/plugin-sdk/channel-setup`、`openclaw/plugin-sdk/channel-pairing`、`openclaw/plugin-sdk/channel-contract`、`openclaw/plugin-sdk/channel-feedback`、`openclaw/plugin-sdk/channel-inbound`、`openclaw/plugin-sdk/channel-lifecycle`、`openclaw/plugin-sdk/channel-reply-pipeline`、`openclaw/plugin-sdk/command-auth`、`openclaw/plugin-sdk/secret-input` 和 `openclaw/plugin-sdk/webhook-ingress` 用于共享设置/认证/回复/webhook 接线。`channel-inbound` 是防抖、提及匹配、信封格式化和入站信封上下文辅助函数的共享家园。
- 领域子路径如 `openclaw/plugin-sdk/channel-config-helpers`、`openclaw/plugin-sdk/allow-from`、`openclaw/plugin-sdk/channel-config-schema`、`openclaw/plugin-sdk/channel-policy`、`openclaw/plugin-sdk/approval-runtime`、`openclaw/plugin-sdk/config-runtime`、`openclaw/plugin-sdk/infra-runtime`、`openclaw/plugin-sdk/agent-runtime`、`openclaw/plugin-sdk/lazy-runtime`、`openclaw/plugin-sdk/reply-history`、`openclaw/plugin-sdk/routing`、`openclaw/plugin-sdk/status-helpers`、`openclaw/plugin-sdk/runtime-store` 和 `openclaw/plugin-sdk/directory-runtime` 用于共享运行时/配置辅助函数。
- 特定于批准渠道的接缝应优先使用一个 `approvalCapability` 契约。核心然后通过该契约读取批准认证、传递、渲染和原生路由行为，而非将批准行为混合到无关插件字段中。
- `openclaw/plugin-sdk/channel-runtime` 已弃用，仅作为旧插件的兼容性垫片保留。新代码应改为导入更窄的通用原语，仓库代码不应添加垫片的新导入。
- 捆绑扩展内部实现保持私有。外部插件应仅使用 `openclaw/plugin-sdk/*` 子路径。OpenClaw 核心/测试代码可以使用插件包根目录下的仓库公共入口点，如 `index.js`、`api.js`、`runtime-api.js`、`setup-entry.js` 和窄范围文件如 `login-qr-api.js`。切勿从核心或另一个扩展导入插件包的 `src/*`。
- 仓库入口点拆分：`<plugin-package-root>/api.js` 是辅助函数/类型桶，`<plugin-package-root>/runtime-api.js` 是仅运行时桶，`<plugin-package-root>/index.js` 是捆绑插件入口点，`<plugin-package-root>/setup-entry.js` 是设置插件入口点。
- 不再有捆绑渠道品牌公共子路径。渠道特定的辅助函数和运行时接缝位于 `<plugin-package-root>/api.js` 和 `<plugin-package-root>/runtime-api.js` 下；公共 SDK 契约是通用共享原语。

兼容性说明：

- 避免为新代码使用根 `openclaw/plugin-sdk` 桶。
- 优先使用窄稳定原语。更新/配对/回复/反馈/契约/入站/线程/命令/secret-input/webhook/infra/allowlist/status/message-tool 子路径是新的捆绑和外部插件工作的预期契约。目标解析/匹配属于 `openclaw/plugin-sdk/channel-targets`。消息操作门控和反应消息 id 辅助函数属于 `openclaw/plugin-sdk/channel-actions`。
- 捆绑扩展特定的辅助函数桶默认不稳定。如果辅助函数仅被捆绑扩展需要，请将其保留在扩展自己的本地 `api.js` 或 `runtime-api.js` 接缝后，而非提升到 `openclaw/plugin-sdk/<extension>`。
- 新的共享辅助函数接缝应该是通用的，而非渠道品牌的。共享目标解析属于 `openclaw/plugin-sdk/channel-targets`；渠道特定的内部实现保留在拥有插件自己的本地 `api.js` 或 `runtime-api.js` 接缝后。
- 特定于能力的子路径如 `image-generation`、`media-understanding` 和 `speech` 存在是因为捆绑/原生插件今天使用它们。它们的存在本身并不意味着每个导出的辅助函数都是长期冻结的外部契约。

## 消息工具 Schema

插件应拥有渠道特定的 `describeMessageTool(...)` schema 贡献。将提供商特定字段保留在插件中，而非共享核心中。

对于共享可移植 schema 片段，重用通过 `openclaw/plugin-sdk/channel-actions` 导出的通用辅助函数：

- `createMessageToolButtonsSchema()` 用于按钮网格样式负载
- `createMessageToolCardSchema()` 用于结构化卡片负载

如果 schema 形状仅对一个提供商有意义，在该插件自己的源中定义它，而非提升到共享 SDK。

## 渠道目标解析

渠道插件应拥有渠道特定的目标语义。保持共享出站主机通用，并使用消息适配器表面用于提供商规则：

- `messaging.inferTargetChatType({ to })` 决定在目录查找之前是否将规范化目标视为 `direct`、`group` 或 `channel`。
- `messaging.targetResolver.looksLikeId(raw, normalized)` 告诉核心输入是否应跳过直接进行 id 类解析而非目录搜索。
- `messaging.targetResolver.resolveTarget(...)` 是核心在规范化后或目录未命中后需要最终提供商拥有解析时的插件回退。
- `messaging.resolveOutboundSessionRoute(...)` 拥有目标解析后提供商特定的会话路由构建。

推荐拆分：

- 使用 `inferTargetChatType` 用于应在搜索对等体/组之前发生的类别决策。
- 使用 `looksLikeId` 用于"将此视为显式/原生目标 id"检查。
- 使用 `resolveTarget` 用于提供商特定的规范化回退，而非广泛目录搜索。
- 将提供商原生 id（如聊天 id、线程 id、JID、句柄和房间 id）保留在 `target` 值或提供商特定参数中，而非通用 SDK 字段中。

## 配置支持的目录

从配置派生目录条目的插件应将逻辑保留在插件中，并重用 `openclaw/plugin-sdk/directory-runtime` 中的共享辅助函数。

在以下情况下使用：

- 渠道需要配置支持的对等体/组，如白名单驱动的 DM 对等体、配置的渠道/组映射、账户范围的静态目录回退

`directory-runtime` 中的共享辅助函数仅处理通用操作：

- 查询过滤
- 限制应用
- 去重/规范化辅助函数
- 构建 `ChannelDirectoryEntry[]`

渠道特定的账户检查和 id 规范化应保留在插件实现中。

## 提供商目录

提供商插件可以使用 `registerProvider({ catalog: { run(...) { ... } } })` 定义推理模型目录。

`catalog.run(...)` 返回 OpenClaw 写入 `models.providers` 的相同形状：

- `{ provider }` 用于一个提供商条目
- `{ providers }` 用于多个提供商条目

当插件拥有提供商特定的模型 id、base URL 默认值或认证保护的模型元数据时使用 `catalog`。

`catalog.order` 控制插件目录相对于 OpenClaw 内置隐式提供商的合并时机：

- `simple`：纯 API 密钥或环境驱动提供商
- `profile`：当认证配置存在时出现的提供商
- `paired`：合成多个相关提供商条目的提供商
- `late`：最后一次通过，在其他隐式提供商之后

后到的提供商在键冲突时获胜，因此插件可以有意使用相同提供商 id 覆盖内置提供商条目。

兼容性：

- `discovery` 仍然作为传统别名工作
- 如果 `catalog` 和 `discovery` 都注册了，OpenClaw 使用 `catalog`

## 只读渠道检查

如果你的插件注册了渠道，优先实现 `plugin.config.inspectAccount(cfg, accountId)` 以及 `resolveAccount(...)`。

原因：

- `resolveAccount(...)` 是运行时路径。它被允许假设凭证已完全实例化，并在缺少必需密钥时快速失败。
- `openclaw status`、`openclaw status --all`、`openclaw channels status`、`openclaw channels resolve` 和 doctor/配置修复流程等只读命令路径不应仅为描述配置而实例化运行时凭证。

推荐的 `inspectAccount(...)` 行为：

- 仅返回描述性账户状态。
- 保留 `enabled` 和 `configured`。
- 在相关时包含凭证源/状态字段，例如：
  - `tokenSource`、`tokenStatus`
  - `botTokenSource`、`botTokenStatus`
  - `appTokenSource`、`appTokenStatus`
  - `signingSecretSource`、`signingSecretStatus`
- 你不需要仅为报告只读可用性而返回原始令牌值。返回 `tokenStatus: "available"`（及匹配的源字段）足以用于状态风格命令。
- 当凭证通过 SecretRef 配置但在当前命令路径中不可用时使用 `configured_unavailable`。

这让只读命令报告"在此命令路径中已配置但不可用"，而非崩溃或误报账户未配置。

## 包包

插件目录可以包含带有 `openclaw.extensions` 的 `package.json`：

```json
{
  "name": "my-pack",
  "openclaw": {
    "extensions": ["./src/safety.ts", "./src/tools.ts"],
    "setupEntry": "./src/setup-entry.ts"
  }
}
```

每个条目成为一个插件。如果包列出多个扩展，插件 id 变为 `name/<fileBase>`。

如果你的插件导入 npm 依赖，请在那个目录中安装它们，以便 `node_modules` 可用（`npm install` / `pnpm install`）。

安全护栏：每个 `openclaw.extensions` 条目在符号链接解析后必须保留在插件目录内。逃逸包目录的条目会被拒绝。

安全说明：`openclaw plugins install` 使用 `npm install --omit=dev --ignore-scripts` 安装插件依赖（无生命周期脚本，运行时无 dev 依赖）。保持插件依赖树为"纯 JS/TS"，避免需要 `postinstall` 构建的包。

可选：`openclaw.setupEntry` 可以指向轻量级仅设置模块。当 OpenClaw 需要禁用渠道插件的设置表面时，或当渠道插件已启用但仍未配置时，它加载 `setupEntry` 而非完整插件入口点。这在你主插件入口点也连接工具、钩子或其他仅运行时代码时保持启动和设置更轻量。

可选：`openclaw.startup.deferConfiguredChannelFullLoadUntilAfterListen` 可以让渠道插件选择加入与 gateway 预监听启动阶段相同的 `setupEntry` 路径，即使渠道已配置。

仅当 `setupEntry` 完全覆盖启动必须在 gateway 开始监听之前存在的表面时使用此选项。实际上，这意味着设置条目必须注册启动所依赖的每个渠道拥有的能力，例如：

- 渠道注册本身
- 任何在 gateway 开始监听前必须可用的 HTTP 路由
- 任何在此相同窗口期间必须存在的网关方法、工具或服务

如果你的完整入口点仍然拥有任何必需的启动能力，不要启用此标志。保持插件使用默认行为，让 OpenClaw 在启动期间加载完整入口点。

示例：

```json
{
  "name": "@scope/my-channel",
  "openclaw": {
    "extensions": ["./index.ts"],
    "setupEntry": "./setup-entry.ts",
    "startup": {
      "deferConfiguredChannelFullLoadUntilAfterListen": true
    }
  }
}
```

### 渠道目录元数据

渠道插件可以通过 `openclaw.channel` 和 `openclaw.install` 广告设置/发现元数据。这将核心目录数据保持为无数据。

示例：

```json
{
  "name": "@openclaw/nextcloud-talk",
  "openclaw": {
    "extensions": ["./index.ts"],
    "channel": {
      "id": "nextcloud-talk",
      "label": "Nextcloud Talk",
      "selectionLabel": "Nextcloud Talk (self-hosted)",
      "docsPath": "/channels/nextcloud-talk",
      "docsLabel": "nextcloud-talk",
      "blurb": "Self-hosted chat via Nextcloud Talk webhook bots.",
      "order": 65,
      "aliases": ["nc-talk", "nc"]
    },
    "install": {
      "npmSpec": "@openclaw/nextcloud-talk",
      "localPath": "<bundled-plugin-local-path>",
      "defaultChoice": "npm"
    }
  }
}
```

OpenClaw 还可以合并**外部渠道目录**（例如 MPM 注册表导出）。在以下位置之一放置 JSON 文件：

- `~/.openclaw/mpm/plugins.json`
- `~/.openclaw/mpm/catalog.json`
- `~/.openclaw/plugins/catalog.json`

或将 `OPENCLAW_PLUGIN_CATALOG_PATHS`（或 `OPENCLAW_MPM_CATALOG_PATHS`）指向一个或多个 JSON 文件（逗号/分号/`PATH` 分隔）。每个文件应包含 `{ "entries": [ { "name": "@scope/pkg", "openclaw": { "channel": {...}, "install": {...} } } ] }`。解析器也接受 `"packages"` 或 `"plugins"` 作为 `"entries"` 键的传统别名。

## 上下文引擎插件

上下文引擎插件拥有会话上下文编排用于摄取、组装和压缩。通过 `api.registerContextEngine(id, factory)` 从你的插件注册它们，然后使用 `plugins.slots.contextEngine` 选择活动引擎。

当你需要替换或扩展默认上下文管道而非仅添加内存搜索或钩子时使用此功能。

```ts
export default function (api) {
  api.registerContextEngine("lossless-claw", () => ({
    info: { id: "lossless-claw", name: "Lossless Claw", ownsCompaction: true },
    async ingest() {
      return { ingested: true };
    },
    async assemble({ messages }) {
      return { messages, estimatedTokens: 0 };
    },
    async compact() {
      return { ok: true, compacted: false };
    },
  }));
}
```

如果你的引擎**不**拥有压缩算法，保持 `compact()` 实现并明确委托它：

```ts
import { delegateCompactionToRuntime } from "openclaw/plugin-sdk/core";

export default function (api) {
  api.registerContextEngine("my-memory-engine", () => ({
    info: {
      id: "my-memory-engine",
      name: "My Memory Engine",
      ownsCompaction: false,
    },
    async ingest() {
      return { ingested: true };
    },
    async assemble({ messages }) {
      return { messages, estimatedTokens: 0 };
    },
    async compact(params) {
      return await delegateCompactionToRuntime(params);
    },
  }));
}
```

## 添加新能力

当插件需要当前 API 不适合的行为时，不要用私有 reach-in 绕过插件系统。添加缺失的能力。

推荐序列：

1. 定义核心契约
   决定核心应拥有的共享行为：策略、回退、配置合并生命周期、渠道面向语义和运行时辅助函数形状。
2. 添加类型化插件注册/运行时表面
   使用最小有用类型化能力表面扩展 `OpenClawPluginApi` 和/或 `api.runtime`。
3. 连接核心 + 渠道/功能消费者
   渠道和功能插件应通过核心消费新能力，而非直接导入供应商实现。
4. 注册供应商实现
   供应商插件然后针对该能力注册其后端。
5. 添加契约覆盖
   添加测试以使所有权和注册形状随时间保持明确。

这就是 OpenClaw 保持有主见而不变得固执己见于一个提供商世界观的方式。参见[能力烹饪书](/tools/capability-cookbook)获取具体的文件检查清单和示例。

### 能力检查清单

当你添加新能力时，实现通常应同时触及这些表面：

- `src/<capability>/types.ts` 中的核心契约类型
- `src/<capability>/runtime.ts` 中的核心运行器/运行时辅助函数
- `src/plugins/types.ts` 中的插件 API 注册表面
- `src/plugins/registry.ts` 中的插件注册表接线
- 当功能/渠道插件需要消费时，`src/plugins/runtime/*` 中的插件运行时暴露
- `src/test-utils/plugin-registration.ts` 中的捕获/测试辅助函数
- `src/plugins/contracts/registry.ts` 中的所有权/契约断言
- `docs/` 中的操作员/插件文档

如果这些表面中缺少任何一个，这通常是能力尚未完全集成的迹象。

### 能力模板

最小模式：

```ts
// 核心契约
export type VideoGenerationProviderPlugin = {
  id: string;
  label: string;
  generateVideo: (req: VideoGenerationRequest) => Promise<VideoGenerationResult>;
};

// 插件 API
api.registerVideoGenerationProvider({
  id: "openai",
  label: "OpenAI",
  async generateVideo(req) {
    return await generateOpenAiVideo(req);
  },
});

// 功能/渠道插件的共享运行时辅助函数
const clip = await api.runtime.videoGeneration.generateFile({
  prompt: "Show the robot walking through the lab.",
  cfg,
});
```

契约测试模式：

```ts
expect(findVideoGenerationProviderIdsForPlugin("openai")).toEqual(["openai"]);
```

这保持规则简单：

- 核心拥有能力契约 + 编排
- 供应商插件拥有供应商实现
- 功能/渠道插件消费运行时辅助函数
- 契约测试保持所有权明确
