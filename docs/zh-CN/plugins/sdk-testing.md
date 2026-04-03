---
title: "插件测试"
sidebarTitle: "测试"
summary: "OpenClaw 插件的测试工具和模式"
read_when:
  - 你正在为插件编写测试
  - 你需要从插件 SDK 获取测试工具
  - 你想了解捆绑插件的契约测试
---

# 插件测试

OpenClaw 插件的测试工具、模式和 lint 规则参考文档。

<Tip>
  **需要测试示例？** 操作指南中包含详细的测试示例：
  [频道插件测试](/plugins/sdk-channel-plugins#step-6-test) 和
  [提供商插件测试](/plugins/sdk-provider-plugins#step-6-test)。
</Tip>

## 测试工具

**导入：** `openclaw/plugin-sdk/testing`

测试子路径导出一组供插件作者使用的辅助函数：

```typescript
import {
  installCommonResolveTargetErrorCases,
  shouldAckReaction,
  removeAckReactionAfterReply,
} from "openclaw/plugin-sdk/testing";
```

### 可用导出

| 导出                                   | 功能                                          |
| -------------------------------------- | -------------------------------------------- |
| `installCommonResolveTargetErrorCases` | 目标解析错误处理的共享测试用例                |
| `shouldAckReaction`                    | 检查频道是否应该添加确认反应                  |
| `removeAckReactionAfterReply`          | 在回复投递后移除确认反应                      |

### 类型

测试子路径还重新导出测试文件中可能有用的类型：

```typescript
import type {
  ChannelAccountSnapshot,
  ChannelGatewayContext,
  OpenClawConfig,
  PluginRuntime,
  RuntimeEnv,
  MockFn,
} from "openclaw/plugin-sdk/testing";
```

## 测试目标解析

使用 `installCommonResolveTargetErrorCases` 添加频道目标解析的标准错误用例：

```typescript
import { describe } from "vitest";
import { installCommonResolveTargetErrorCases } from "openclaw/plugin-sdk/testing";

describe("my-channel 目标解析", () => {
  installCommonResolveTargetErrorCases({
    resolveTarget: ({ to, mode, allowFrom }) => {
      // 你频道的目标解析逻辑
      return myChannelResolveTarget({ to, mode, allowFrom });
    },
    implicitAllowFrom: ["user1", "user2"],
  });

  // 添加频道特定的测试用例
  it("应该解析 @username 目标", () => {
    // ...
  });
});
```

## 测试模式

### 频道插件的单元测试

```typescript
import { describe, it, expect, vi } from "vitest";

describe("my-channel 插件", () => {
  it("应该从配置中解析账户", () => {
    const cfg = {
      channels: {
        "my-channel": {
          token: "test-token",
          allowFrom: ["user1"],
        },
      },
    };

    const account = myPlugin.setup.resolveAccount(cfg, undefined);
    expect(account.token).toBe("test-token");
  });

  it("应该在不暴露密钥的情况下检查账户", () => {
    const cfg = {
      channels: {
        "my-channel": { token: "test-token" },
      },
    };

    const inspection = myPlugin.setup.inspectAccount(cfg, undefined);
    expect(inspection.configured).toBe(true);
    expect(inspection.tokenStatus).toBe("available");
    // 不暴露 token 值
    expect(inspection).not.toHaveProperty("token");
  });
});
```

### 提供商插件的单元测试

```typescript
import { describe, it, expect } from "vitest";

describe("my-provider 插件", () => {
  it("应该解析动态模型", () => {
    const model = myProvider.resolveDynamicModel({
      modelId: "custom-model-v2",
      // ... 上下文
    });

    expect(model.id).toBe("custom-model-v2");
    expect(model.provider).toBe("my-provider");
    expect(model.api).toBe("openai-completions");
  });

  it("当 API 密钥可用时应该返回目录", async () => {
    const result = await myProvider.catalog.run({
      resolveProviderApiKey: () => ({ apiKey: "test-key" }),
      // ... 上下文
    });

    expect(result?.provider?.models).toHaveLength(2);
  });
});
```

### 模拟插件运行时

对于使用 `createPluginRuntimeStore` 的代码，在测试中模拟运行时：

```typescript
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "openclaw/plugin-sdk/runtime-store";

const store = createPluginRuntimeStore<PluginRuntime>("test runtime not set");

// 在测试设置中
const mockRuntime = {
  agent: {
    resolveAgentDir: vi.fn().mockReturnValue("/tmp/agent"),
    // ... 其他模拟
  },
  config: {
    loadConfig: vi.fn(),
    writeConfigFile: vi.fn(),
  },
  // ... 其他命名空间
} as unknown as PluginRuntime;

store.setRuntime(mockRuntime);

// 测试后
store.clearRuntime();
```

### 使用实例级存根进行测试

优先使用实例级存根而非原型变更：

```typescript
// 推荐：实例级存根
const client = new MyChannelClient();
client.sendMessage = vi.fn().mockResolvedValue({ id: "msg-1" });

// 避免：原型变更
// MyChannelClient.prototype.sendMessage = vi.fn();
```

## 契约测试（仓库内插件）

捆绑插件有验证注册所有权的契约测试：

```bash
pnpm test -- src/plugins/contracts/
```

这些测试断言：

- 哪些插件注册了哪些提供商
- 哪些插件注册了哪些语音提供商
- 注册形状的正确性
- 运行时契约合规性

### 运行范围测试

针对特定插件：

```bash
pnpm test -- <bundled-plugin-root>/my-channel/
```

仅针对契约测试：

```bash
pnpm test -- src/plugins/contracts/shape.contract.test.ts
pnpm test -- src/plugins/contracts/auth.contract.test.ts
pnpm test -- src/plugins/contracts/runtime.contract.test.ts
```

## Lint 规则（仓库内插件）

`pnpm check` 对仓库内插件强制执行三条规则：

1. **禁止单体根导入** -- 拒绝 `openclaw/plugin-sdk` 根桶文件
2. **禁止直接 `src/` 导入** -- 插件不能直接导入 `../../src/`
3. **禁止自导入** -- 插件不能导入自己的 `plugin-sdk/<name>` 子路径

外部插件不受这些 lint 规则约束，但建议遵循相同的模式。

## 测试配置

OpenClaw 使用 Vitest 和 V8 覆盖率阈值。对于插件测试：

```bash
# 运行所有测试
pnpm test

# 运行特定插件测试
pnpm test -- <bundled-plugin-root>/my-channel/src/channel.test.ts

# 按测试名称过滤运行
pnpm test -- <bundled-plugin-root>/my-channel/ -t "resolves account"

# 带覆盖率运行
pnpm test:coverage
```

如果本地运行导致内存压力：

```bash
OPENCLAW_VITEST_MAX_WORKERS=1 pnpm test
```

## 相关

- [SDK 概览](/plugins/sdk-overview) -- 导入约定
- [SDK 频道插件](/plugins/sdk-channel-plugins) -- 频道插件接口
- [SDK 提供商插件](/plugins/sdk-provider-plugins) -- 提供商插件钩子
- [构建插件](/plugins/building-plugins) -- 入门指南
