## UI 目录结构解读

`ui/` 是 OpenClaw 的 **控制面板 Web UI**（Control UI），基于 **Lit**（Web Components 框架）构建。

### 技术栈

| 技术                    | 用途                                 |
| ----------------------- | ------------------------------------ |
| **Lit**                 | Web Components 组件库                |
| **Vite**                | 构建工具（输出到 `dist/control-ui`） |
| **Vitest + Playwright** | 测试                                 |
| **marked**              | Markdown 渲染                        |
| **DOMPurify**           | HTML 净化                            |

### 核心入口

- `index.html` — 入口 HTML，内联 JS 初始化主题（claw/knot/dash 三套主题 + light/dark/system 三种模式）
- `src/main.ts` — 加载样式和 `app.ts`
- `src/ui/app.ts` — 主组件 `<openclaw-app>`，一个巨大的 Lit 组件，管理全部 UI 状态

### 目录结构

```
ui/
├── index.html                    # 入口 HTML，内联主题初始化脚本
├── vite.config.ts               # Vite 配置，输出到 dist/control-ui
├── package.json
├── public/                       # 静态资源（favicon 等）
└── src/
    ├── main.ts                   # 入口
    ├── styles.css                # 导入所有 CSS 模块
    ├── i18n/                     # 国际化（支持 de, es, pt-BR, zh-CN, zh-TW）
    │   ├── index.ts
    │   ├── lib/
    │   │   ├── lit-controller.ts # Lit i18n 控制器
    │   │   ├── registry.ts
    │   │   └── types.ts
    │   └── locales/
    │       ├── de.ts
    │       ├── es.ts
    │       ├── pt-BR.ts
    │       ├── zh-CN.ts
    │       └── zh-TW.ts
    └── ui/
        ├── app.ts                 # 主应用组件 (~760行)，管理所有 UI 状态
        ├── app-render.ts          # 主渲染函数
        ├── app-gateway.ts         # Gateway WebSocket 连接逻辑
        ├── app-chat.ts            # 聊天发送/中断逻辑
        ├── app-channels.ts         # 渠道（WhatsApp/Nostr）配置处理
        ├── app-lifecycle.ts        # connectedCallback/updated 等生命周期
        ├── app-scroll.ts           # 聊天/日志滚动处理
        ├── app-settings.ts        # 设置/主题/tab 切换
        ├── app-polling.ts          # 定时轮询
        ├── app-events.ts           # 事件日志
        ├── app-tool-stream.ts      # 工具流式输出
        ├── app-view-state.ts       # AppViewState 类型
        ├── app-defaults.ts         # 默认配置常量
        ├── app-lifecycle-connect.node.test.ts
        ├── app-lifecycle.node.test.ts
        ├── app-render.helpers.node.test.ts
        ├── app-scroll.test.ts
        ├── app-tool-stream.node.test.ts
        ├── app-tool-stream.ts
        ├── chat-event-reload.ts
        ├── chat-event-reload.test.ts
        ├── chat-markdown.browser.test.ts
        ├── chat/
        │   ├── message-extract.ts   # 从消息中提取文本/工具调用
        │   ├── message-extract.test.ts
        │   ├── message-normalizer.ts
        │   ├── message-normalizer.test.ts
        │   ├── tool-cards.ts        # 工具卡片渲染
        │   ├── tool-helpers.ts
        │   ├── tool-helpers.test.ts
        │   ├── export.ts            # 导出聊天为 Markdown
        │   ├── export.node.test.ts
        │   ├── attachment-support.ts
        │   ├── input-history.ts
        │   ├── pinned-summary.ts
        │   ├── search-match.ts
        │   ├── session-cache.ts
        │   ├── speech.ts
        │   ├── constants.ts
        │   └── chat-image-open.browser.test.ts
        ├── controllers/             # 业务控制器
        │   ├── control-ui-bootstrap.ts
        │   ├── control-ui-bootstrap.test.ts
        │   ├── assistant-identity.ts
        │   ├── agent-identity.ts
        │   ├── agent-files.ts
        │   ├── agent-skills.ts
        │   ├── agents.ts             # loadToolsEffective 等
        │   ├── config.ts             # 配置表单
        │   ├── config/
        │   │   └── form-coerce.ts
        │   ├── cron.ts               # Cron 作业管理
        │   ├── cron.test.ts
        │   ├── cron-filters.test.ts
        │   ├── exec-approval.ts
        │   ├── exec-approvals.ts
        │   ├── nodes.ts              # 节点管理
        │   ├── models.ts
        │   ├── health.ts
        │   ├── debug.ts
        │   ├── devices.ts
        │   ├── logs.test.ts
        │   ├── usage.node.test.ts
        │   ├── channels.types.ts
        │   └── skills.types.ts (implicit)
        ├── views/                    # 页面视图
        │   ├── config-form.ts        # 配置表单视图
        │   ├── config-form.search.node.test.ts
        │   ├── channels.config.ts    # 渠道配置
        │   ├── channels.types.ts
        │   ├── channel-config-extras.ts
        │   ├── channels.nostr-profile-form.ts
        │   ├── cron.test.ts
        │   ├── cron.ts
        │   ├── usage-query.ts
        │   ├── usage-render-details.test.ts
        │   ├── usage.ts
        │   ├── exec-approval.ts
        │   ├── logs.ts
        │   ├── gateway-url-confirmation.ts
        │   ├── markdown-sidebar.ts
        │   ├── nodes-exec-approvals.ts
        │   ├── nodes-shared.ts
        │   ├── skills-grouping.ts
        │   └── skills-shared.ts
        ├── components/
        │   ├── resizable-divider.ts
        │   └── dashboard-header.ts
        ├── navigation.ts             # Tab 路由（chat/overview/channels/instances/sessions/usage/cron/skills/nodes/config/...）
        ├── presenter.ts              # 格式化工具（时间/Cron/Token 等）
        ├── format.ts
        ├── format.test.ts
        ├── theme.ts                  # 主题系统
        ├── storage.ts               # localStorage 持久化
        ├── types.ts                  # 共享类型定义
        ├── gateway.ts                # Gateway WebSocket 客户端
        ├── usage-types.ts
        ├── usage-helpers.ts
        ├── usage-helpers.node.test.ts
        ├── tool-display.ts
        ├── text-direction.ts
        ├── text-direction.test.ts
        ├── external-link.ts
        ├── external-link.test.ts
        ├── open-external-url.ts
        ├── uuid.ts
        ├── uuid.test.ts
        ├── assistant-identity.ts
        ├── connect-error.ts
        ├── config-form.browser.test.ts
        ├── focus-mode.browser.test.ts
        ├── markdown.test.ts
        ├── navigation.ts
        ├── navigation.test.ts
        ├── navigation-groups.test.ts
        └── __screenshots__/          # 视觉回归测试截图
```

### Tab 导航结构（`navigation.ts`）

4 个 Tab 组：

- **chat** — 聊天界面
- **control** — overview / channels / instances / sessions / usage / cron
- **agent** — agents / skills / nodes
- **settings** — config / communications / appearance / automation / infrastructure / aiAgents / debug / logs

### 主题系统

`index.html` 内联脚本支持 3 套主题（claw/knot/dash）× 3 种模式（light/dark/system），通过 `data-theme` 和 `data-theme-mode` 属性应用到 `<html>`。

### 关键设计模式

1. **状态集中管理** — `OpenClawApp` 是唯一的状态源，所有子组件通过属性传递获取状态
2. **Gateway 通信** — 通过 WebSocket 与本地 Gateway 进程通信（`app-gateway.ts`）
3. **I18n** — 使用 `I18nController`（Lit 控制器）+ `t()` 函数实现响应式翻译
4. **控制器分离** — 业务逻辑分散在 `controllers/` 下的各个文件中，通过 `*Internal` 函数供 `app.ts` 调用
