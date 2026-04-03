---
summary: "社区维护的 OpenClaw 插件：浏览、安装和提交您的插件"
read_when:
  - 您想找到第三方 OpenClaw 插件
  - 您想发布或列出自己的插件
title: "社区插件"
---

# 社区插件

社区插件是由社区构建和维护的第三方软件包，用于扩展 OpenClaw 的新渠道、工具、提供商或其他功能。它们发布在 [ClawHub](/tools/clawhub) 或 npm 上，可以通过一条命令安装。

```bash
openclaw plugins install <package-name>
```

OpenClaw 会先检查 ClawHub，自动回退到 npm。

## 已收录插件

### Codex App Server Bridge

独立的 OpenClaw 桥接器，用于 Codex App Server 对话。将聊天绑定到 Codex 线程，使用纯文本进行对话，并使用聊天原生命令进行控制，包括恢复、规划、审查、模型选择、压缩等功能。

- **npm:** `openclaw-codex-app-server`
- **repo:** [github.com/pwrdrvr/openclaw-codex-app-server](https://github.com/pwrdrvr/openclaw-codex-app-server)

```bash
openclaw plugins install openclaw-codex-app-server
```

### DingTalk

使用 Stream 模式的企业机器人集成。支持通过任何 DingTalk 客户端发送文本、图片和文件消息。

- **npm:** `@largezhou/ddingtalk`
- **repo:** [github.com/largezhou/openclaw-dingtalk](https://github.com/largezhou/openclaw-dingtalk)

```bash
openclaw plugins install @largezhou/ddingtalk
```

### Lossless Claw (LCM)

OpenClaw 的无损上下文管理插件。基于 DAG 的对话摘要和增量压缩，在减少 token 用量的同时保持完整的上下文保真度。

- **npm:** `@martian-engineering/lossless-claw`
- **repo:** [github.com/Martian-Engineering/lossless-claw](https://github.com/Martian-Engineering/lossless-claw)

```bash
openclaw plugins install @martian-engineering/lossless-claw
```

### Opik

将 agent 追踪导出到 Opik 的官方插件。监控 agent 行为、成本、token、错误等。

- **npm:** `@opik/opik-openclaw`
- **repo:** [github.com/comet-ml/opik-openclaw](https://github.com/comet-ml/opik-openclaw)

```bash
openclaw plugins install @opik/opik-openclaw
```

### QQbot

通过 QQ Bot API 将 OpenClaw 连接到 QQ。支持私聊、群聊提及、频道消息以及语音、图片、视频和文件等富媒体。

- **npm:** `@tencent-connect/openclaw-qqbot`
- **repo:** [github.com/tencent-connect/openclaw-qqbot](https://github.com/tencent-connect/openclaw-qqbot)

```bash
openclaw plugins install @tencent-connect/openclaw-qqbot
```

### wecom

由腾讯企业微信团队开发的 OpenClaw 企业微信频道插件。基于企业微信机器人 WebSocket 持久连接，支持私信和群聊、流式回复、主动消息、图片/文件处理、Markdown 格式、内置访问控制以及文档/会议/消息技能。

- **npm:** `@wecom/wecom-openclaw-plugin`
- **repo:** [github.com/WecomTeam/wecom-openclaw-plugin](https://github.com/WecomTeam/wecom-openclaw-plugin)

```bash
openclaw plugins install @wecom/wecom-openclaw-plugin
```

## 提交您的插件

我们欢迎有用的、有文档的、安全运行的社区插件。

<Steps>
  <Step title="发布到 ClawHub 或 npm">
    您的插件必须可以通过 `openclaw plugins install \<package-name\>` 安装。
    发布到 [ClawHub](/tools/clawhub)（首选）或 npm。
    参见 [构建插件](/plugins/building-plugins) 获取完整指南。

  </Step>

  <Step title="托管在 GitHub 上">
    源代码必须位于具有设置文档和问题追踪器的公共仓库中。

  </Step>

  <Step title="提交 PR">
    将您的插件添加到此页面，包括：

    - 插件名称
    - npm 包名称
    - GitHub 仓库 URL
    - 一行描述
    - 安装命令

  </Step>
</Steps>

## 质量标准

| 要求 | 原因 |
| --- | --- |
| 发布在 ClawHub 或 npm | 用户需要 `openclaw plugins install` 能正常工作 |
| 公共 GitHub 仓库 | 源代码审查、问题追踪、透明性 |
| 设置和使用文档 | 用户需要知道如何配置它 |
| 积极维护 | 近期更新或响应迅速的问题处理 |

低质量包装、所有权不明确或无人维护的包可能会被拒绝。

## 相关内容

- [安装和配置插件](/tools/plugin) — 如何安装任何插件
- [构建插件](/plugins/building-plugins) — 创建您自己的插件
- [插件清单](/plugins/manifest) — 清单架构
