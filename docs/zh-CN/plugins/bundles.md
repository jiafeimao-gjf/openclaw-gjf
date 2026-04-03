---
summary: "安装并使用 Codex、Claude 和 Cursor bundles 作为 OpenClaw 插件"
read_when:
  - 您想安装 Codex、Claude 或 Cursor 兼容的 bundle
  - 您需要了解 OpenClaw 如何将 bundle 内容映射为原生功能
  - 您在调试 bundle 检测或缺失功能
title: "插件 Bundles"
---

# 插件 Bundles

OpenClaw 可以从三个外部生态安装插件：**Codex**、**Claude** 和 **Cursor**。这些被称为 **bundles** —— 内容和支持元数据包，OpenClaw 将它们映射为原生功能，如技能（skills）、钩子（hooks）和 MCP 工具。

<Info>
  Bundles 与原生 OpenClaw 插件**不同**。原生插件在进程内运行，可以注册任何功能。Bundle 是内容包，具有选择性功能映射和更窄的信任边界。
</Info>

## 为什么存在 bundles

许多有用的插件以 Codex、Claude 或 Cursor 格式发布。OpenClaw 无需要求作者将其重写为原生 OpenClaw 插件，而是检测这些格式并将其支持的内容映射到原生功能集。这意味着您可以安装 Claude 命令包或 Codex 技能包并立即使用。

## 安装 bundle

<Steps>
  <Step title="从目录、归档或市场安装">
    ```bash
    # 本地目录
    openclaw plugins install ./my-bundle

    # 归档文件
    openclaw plugins install ./my-bundle.tgz

    # Claude 市场
    openclaw plugins marketplace list <marketplace-name>
    openclaw plugins install <plugin-name>@<marketplace-name>
    ```

  </Step>

  <Step title="验证检测">
    ```bash
    openclaw plugins list
    openclaw plugins inspect <id>
    ```

    Bundles 显示为 `Format: bundle`，子类型为 `codex`、`claude` 或 `cursor`。

  </Step>

  <Step title="重启并使用">
    ```bash
    openclaw gateway restart
    ```

    映射的功能（技能、钩子、MCP 工具）在下一个会话中可用。

  </Step>
</Steps>

## OpenClaw 从 bundles 中映射什么

并非每个 bundle 功能都能在当前的 OpenClaw 中运行。以下是当前已支持的和已检测但尚未连接的功能。

### 目前已支持

| 功能           | 映射方式                                                                                     | 适用于         |
| -------------- | -------------------------------------------------------------------------------------------- | -------------- |
| 技能内容       | Bundle 技能根目录作为普通 OpenClaw 技能加载                                                   | 所有格式       |
| 命令           | `commands/` 和 `.cursor/commands/` 被视为技能根目录                                          | Claude、Cursor |
| 钩子包         | OpenClaw 风格的 `HOOK.md` + `handler.ts` 布局                                                | Codex          |
| MCP 工具       | Bundle MCP 配置合并到嵌入式 Pi 设置中；支持的 stdio 和 HTTP 服务器已加载                     | 所有格式       |
| 设置           | Claude `settings.json` 作为嵌入式 Pi 默认值导入                                              | Claude         |

#### 技能内容

- bundle 技能根目录作为普通 OpenClaw 技能根目录加载
- Claude `commands` 根目录被视为额外的技能根目录
- Cursor `.cursor/commands` 根目录被视为额外的技能根目录

这意味着 Claude markdown 命令文件通过普通 OpenClaw 技能加载器工作。Cursor 命令 markdown 通过相同路径工作。

#### 钩子包

- bundle 钩子根目录**仅**在使用普通 OpenClaw 钩子包布局时有效。今天这主要是 Codex 兼容的情况：
  - `HOOK.md`
  - `handler.ts` 或 `handler.js`

#### MCP for Pi

- 已启用的 bundle 可以提供 MCP 服务器配置
- OpenClaw 将 bundle MCP 配置合并到有效的嵌入式 Pi 设置中作为 `mcpServers`
- OpenClaw 在嵌入式 Pi 智能体轮次中公开支持的 bundle MCP 工具，方法为启动 stdio 服务器或连接到 HTTP 服务器
- 项目本地的 Pi 设置在 bundle 默认值之后仍然适用，因此工作区设置可以在需要时覆盖 bundle MCP 条目

##### 传输方式

MCP 服务器可以使用 stdio 或 HTTP 传输：

**Stdio** 启动子进程：

```json
{
  "mcp": {
    "servers": {
      "my-server": {
        "command": "node",
        "args": ["server.js"],
        "env": { "PORT": "3000" }
      }
    }
  }
}
```

**HTTP** 通过 `sse` 连接到运行中的 MCP 服务器，或者在请求时使用 `streamable-http`：

```json
{
  "mcp": {
    "servers": {
      "my-server": {
        "url": "http://localhost:3100/mcp",
        "transport": "streamable-http",
        "headers": {
          "Authorization": "Bearer ${MY_SECRET_TOKEN}"
        },
        "connectionTimeoutMs": 30000
      }
    }
  }
}
```

- `transport` 可以设置为 `"streamable-http"` 或 `"sse"`；省略时，OpenClaw 使用 `sse`
- 仅允许 `http:` 和 `https:` URL 方案
- `headers` 值支持 `${ENV_VAR}` 插值
- 同时包含 `command` 和 `url` 的服务器条目将被拒绝
- URL 凭据（userinfo 和查询参数）将从工具描述和日志中删除
- `connectionTimeoutMs` 覆盖 stdio 和 HTTP 传输的默认 30 秒连接超时

##### 工具命名

OpenClaw 以 `serverName__toolName` 形式注册 bundle MCP 工具，使用提供者安全的名称。例如，键为 `"vigil-harbor"` 的服务器公开 `memory_search` 工具将注册为 `vigil-harbor__memory_search`。

- `A-Za-z0-9_-` 之外的字符替换为 `-`
- 服务器前缀最多 30 个字符
- 完整工具名称最多 64 个字符
- 空服务器名称回退到 `mcp`
- 冲突的清理后的名称使用数字后缀消除歧义

#### 嵌入式 Pi 设置

- 当 bundle 启用时，Claude `settings.json` 作为默认嵌入式 Pi 设置导入
- OpenClaw 在应用之前清理 shell 覆盖键

清理的键：

- `shellPath`
- `shellCommandPrefix`

### 已检测但未执行

这些被识别并显示在诊断中，但 OpenClaw 不运行它们：

- Claude `agents`、`hooks.json` 自动化、`lspServers`、`outputStyles`
- Cursor `.cursor/agents`、`.cursor/hooks.json`、`.cursor/rules`
- Codex 内联/app 元数据（超出能力报告的部分）

## Bundle 格式

<AccordionGroup>
  <Accordion title="Codex bundles">
    标记：`.codex-plugin/plugin.json`

    可选内容：`skills/`、`hooks/`、`.mcp.json`、`.app.json`

    Codex bundles 在使用技能根目录和 OpenClaw 风格钩子包目录（`HOOK.md` + `handler.ts`）时与 OpenClaw 配合最佳。

  </Accordion>

  <Accordion title="Claude bundles">
    两种检测模式：

    - **基于清单：** `.claude-plugin/plugin.json`
    - **无清单：** 默认 Claude 布局（`skills/`、`commands/`、`agents/`、`hooks/`、`.mcp.json`、`settings.json`）

    Claude 特定行为：

    - `commands/` 被视为技能内容
    - `settings.json` 导入到嵌入式 Pi 设置中（shell 覆盖键被清理）
    - `.mcp.json` 向嵌入式 Pi 公开支持的 stdio 工具
    - `hooks/hooks.json` 被检测但不执行
    - 清单中的自定义组件路径是附加的（扩展默认值，而不是替换）

  </Accordion>

  <Accordion title="Cursor bundles">
    标记：`.cursor-plugin/plugin.json`

    可选内容：`skills/`、`.cursor/commands/`、`.cursor/agents/`、`.cursor/rules/`、`.cursor/hooks.json`、`.mcp.json`

    - `.cursor/commands/` 被视为技能内容
    - `.cursor/rules/`、`.cursor/agents/` 和 `.cursor/hooks.json` 仅检测

  </Accordion>
</AccordionGroup>

## 检测优先级

OpenClaw 首先检查原生插件格式：

1. `openclaw.plugin.json` 或带有 `openclaw.extensions` 的有效 `package.json` —— 视为**原生插件**
2. Bundle 标记（`.codex-plugin/`、`.claude-plugin/` 或默认 Claude/Cursor 布局）—— 视为 **bundle**

如果目录同时包含两者，OpenClaw 使用原生路径。这可以防止双格式包被部分安装为 bundles。

## 安全性

Bundles 的信任边界比原生插件更窄：

- OpenClaw **不会**在进程内加载任意 bundle 运行时模块
- 技能和钩子包路径必须保持在插件根目录内（边界检查）
- 设置文件使用相同的边界检查读取
- 支持的 stdio MCP 服务器可以作为子进程启动

这使得 bundles 默认更安全，但您仍应将第三方 bundles 视为受信任内容（就它们公开的功能而言）。

## 故障排除

<AccordionGroup>
  <Accordion title="Bundle 被检测到但功能未运行">
    运行 `openclaw plugins inspect <id>`。如果某个功能已列出但标记为未连接，那是产品限制 —— 不是安装损坏。
  </Accordion>

  <Accordion title="Claude 命令文件未出现">
    确保 bundle 已启用且 markdown 文件位于检测到的 `commands/` 或 `skills/` 根目录内。
  </Accordion>

  <Accordion title="Claude 设置未应用">
    仅支持来自 `settings.json` 的嵌入式 Pi 设置。OpenClaw 不会将 bundle 设置视为原始配置补丁。
  </Accordion>

  <Accordion title="Claude 钩子未执行">
    `hooks/hooks.json` 仅检测。如果您需要可运行的钩子，请使用 OpenClaw 钩子包布局或发布原生插件。
  </Accordion>
</AccordionGroup>

## 相关

- [安装和配置插件](/tools/plugin)
- [构建插件](/plugins/building-plugins) —— 创建原生插件
- [插件清单](/plugins/manifest) —— 原生清单架构
