# TypeScript Build 错误分析

## 错误 1: `accounts.ts` — `transport` 属性不存在

**文件**: `extensions/fly-chat/src/accounts.ts:74-79`

**原因**: `FlyChatAccountRaw` 类型定义中，`transport` 字段不在接口直接定义里。`FlyChatAccountRaw = FlyChatChannelConfig`，而 `FlyChatChannelConfig` 中的 `transport` 字段定义是通过 Zod schema 推导的，但 TypeScript 接口层面没有显式声明 `transport?: "webhook" | "websocket"`。

**修复方向**: 在 `types.ts` 的 `FlyChatAccountRaw` 或 `FlyChatChannelConfig` 接口中显式声明 `transport?: "webhook" | "websocket"`。

---

## 错误 2: `config-schema.ts` — Zod `.default({})` 类型不匹配

**文件**: `extensions/fly-chat/src/config-schema.ts:23` 和 `48`

```
Overload 1 of 2, '(def: { initialDelayMs: number; ... }): ZodDefault<...>', gave the following error.
  Argument of type '{}' is not assignable to parameter of type '{ initialDelayMs: number; ... }'.
```

**原因**: `FlyChatReconnectSchema.default({})` — `.default({})` 语义是"默认为空对象"，但 Zod 尝试用空对象 `{}` 作为 `FlyChatReconnectSchema` 的输入进行 parse，而该 schema 要求所有字段都有值（虽然都有默认值）。空对象 `{}` 不满足 required 字段的类型检查。

**修复方向**:
- 方案 A: 改为 `.default(undefined)` 或 `.optional()`（如果允许不传）
- 方案 B: 传入完整的默认对象 `.default({ initialDelayMs: 2000, maxDelayMs: 30000, maxAttempts: 12, jitterRatio: 0.25 })`

---

## 错误 3: `src/plugin-sdk/fly-chat.ts` — 命名导入错误

**文件**: `src/plugin-sdk/fly-chat.ts:18-19`

```typescript
flyChatSetupAdapter,
flyChatSetupWizard,
```

**原因**: `setup-api.js` 导出的是 **default export**，不是 named exports。

- 实际: `export default defineSetupPluginEntry({ ... })` — default export
- 错误: `import { flyChatSetupAdapter, flyChatSetupWizard }` — 命名导入

**修复方向**: 改为 default import：
```typescript
import flyChatSetupAdapter from "../../extensions/fly-chat/setup-api.js";
// 而不是
import { flyChatSetupAdapter } from "...";
```

---

## 优先级

| 优先级 | 问题 | 文件 |
|--------|------|------|
| P0 | `transport` 属性缺失导致 accounts.ts 类型错误 | accounts.ts / types.ts |
| P0 | Zod `.default({})` 类型不匹配 | config-schema.ts |
| P0 | setup-api.js default/named export 不匹配 | src/plugin-sdk/fly-chat.ts |
