---
title: "构建提供商插件"
sidebarTitle: "提供商插件"
summary: "为 OpenClaw 构建模型提供商插件的分步指南"
read_when:
  - 你正在构建一个新的模型提供商插件
  - 你想将 OpenAI 兼容代理或自定义 LLM 添加到 OpenClaw
  - 你需要了解提供商认证、目录和运行时钩子
---

# 构建提供商插件

本指南逐步介绍构建为 OpenClaw 添加模型提供商（LLM）的提供商插件。完成后，你将拥有一个带有模型目录、
API 密钥认证和动态模型解析的提供商。

<Info>
  如果你之前没有构建过任何 OpenClaw 插件，请先阅读
  [快速开始](/plugins/building-plugins)，了解基本的包
  结构和清单设置。
</Info>

## 演练

<Steps>
  <a id="step-1-package-and-manifest"></a>
  <Step title="包和清单">
    <CodeGroup>
    ```json package.json
    {
      "name": "@myorg/openclaw-acme-ai",
      "version": "1.0.0",
      "type": "module",
      "openclaw": {
        "extensions": ["./index.ts"],
        "providers": ["acme-ai"],
        "compat": {
          "pluginApi": ">=2026.3.24-beta.2",
          "minGatewayVersion": "2026.3.24-beta.2"
        },
        "build": {
          "openclawVersion": "2026.3.24-beta.2",
          "pluginSdkVersion": "2026.3.24-beta.2"
        }
      }
    }
    ```

    ```json openclaw.plugin.json
    {
      "id": "acme-ai",
      "name": "Acme AI",
      "description": "Acme AI model provider",
      "providers": ["acme-ai"],
      "providerAuthEnvVars": {
        "acme-ai": ["ACME_AI_API_KEY"]
      },
      "providerAuthChoices": [
        {
          "provider": "acme-ai",
          "method": "api-key",
          "choiceId": "acme-ai-api-key",
          "choiceLabel": "Acme AI API key",
          "groupId": "acme-ai",
          "groupLabel": "Acme AI",
          "cliFlag": "--acme-ai-api-key",
          "cliOption": "--acme-ai-api-key <key>",
          "cliDescription": "Acme AI API key"
        }
      ],
      "configSchema": {
        "type": "object",
        "additionalProperties": false
      }
    }
    ```
    </CodeGroup>

    清单声明 `providerAuthEnvVars` 以便 OpenClaw 可以在不加载
    插件运行时的情况下检测凭据。如果你在 ClawHub 上发布该
    提供商，则 `package.json` 中需要这些 `openclaw.compat` 和 `openclaw.build` 字段。

  </Step>

  <Step title="注册提供商">
    一个最小的提供商需要 `id`、`label`、`auth` 和 `catalog`：

    ```typescript index.ts
    import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
    import { createProviderApiKeyAuthMethod } from "openclaw/plugin-sdk/provider-auth";

    export default definePluginEntry({
      id: "acme-ai",
      name: "Acme AI",
      description: "Acme AI model provider",
      register(api) {
        api.registerProvider({
          id: "acme-ai",
          label: "Acme AI",
          docsPath: "/providers/acme-ai",
          envVars: ["ACME_AI_API_KEY"],

          auth: [
            createProviderApiKeyAuthMethod({
              providerId: "acme-ai",
              methodId: "api-key",
              label: "Acme AI API key",
              hint: "API key from your Acme AI dashboard",
              optionKey: "acmeAiApiKey",
              flagName: "--acme-ai-api-key",
              envVar: "ACME_AI_API_KEY",
              promptMessage: "Enter your Acme AI API key",
              defaultModel: "acme-ai/acme-large",
            }),
          ],

          catalog: {
            order: "simple",
            run: async (ctx) => {
              const apiKey =
                ctx.resolveProviderApiKey("acme-ai").apiKey;
              if (!apiKey) return null;
              return {
                provider: {
                  baseUrl: "https://api.acme-ai.com/v1",
                  apiKey,
                  api: "openai-completions",
                  models: [
                    {
                      id: "acme-large",
                      name: "Acme Large",
                      reasoning: true,
                      input: ["text", "image"],
                      cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
                      contextWindow: 200000,
                      maxTokens: 32768,
                    },
                    {
                      id: "acme-small",
                      name: "Acme Small",
                      reasoning: false,
                      input: ["text"],
                      cost: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
                      contextWindow: 128000,
                      maxTokens: 8192,
                    },
                  ],
                },
              };
            },
          },
        });
      },
    });
    ```

    这就是一个可用的提供商。用户现在可以运行
    `openclaw onboard --acme-ai-api-key <key>` 并选择
    `acme-ai/acme-large` 作为模型。

    对于仅注册一个带 API 密钥认证的文本提供商和单一目录支持运行时的
    捆绑提供商，首选更窄粒度的
    `defineSingleProviderPluginEntry(...)` 辅助函数：

    ```typescript
    import { defineSingleProviderPluginEntry } from "openclaw/plugin-sdk/provider-entry";

    export default defineSingleProviderPluginEntry({
      id: "acme-ai",
      name: "Acme AI",
      description: "Acme AI model provider",
      provider: {
        label: "Acme AI",
        docsPath: "/providers/acme-ai",
        auth: [
          {
            methodId: "api-key",
            label: "Acme AI API key",
            hint: "API key from your Acme AI dashboard",
            optionKey: "acmeAiApiKey",
            flagName: "--acme-ai-api-key",
            envVar: "ACME_AI_API_KEY",
            promptMessage: "Enter your Acme AI API key",
            defaultModel: "acme-ai/acme-large",
          },
        ],
        catalog: {
          buildProvider: () => ({
            api: "openai-completions",
            baseUrl: "https://api.acme-ai.com/v1",
            models: [{ id: "acme-large", name: "Acme Large" }],
          }),
        },
      },
    });
    ```

    如果你的认证流程还需要在入职期间修补 `models.providers.*`、别名和
    代理默认模型，请使用
    `openclaw/plugin-sdk/provider-onboard` 中的预设辅助函数。
    最窄粒度的辅助函数是
    `createDefaultModelPresetAppliers(...)`、
    `createDefaultModelsPresetAppliers(...)` 和
    `createModelCatalogPresetAppliers(...)`。

  </Step>

  <Step title="添加动态模型解析">
    如果你的提供商接受任意模型 ID（如代理或路由器），
    添加 `resolveDynamicModel`：

    ```typescript
    api.registerProvider({
      // ... id, label, auth, catalog from above

      resolveDynamicModel: (ctx) => ({
        id: ctx.modelId,
        name: ctx.modelId,
        provider: "acme-ai",
        api: "openai-completions",
        baseUrl: "https://api.acme-ai.com/v1",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 8192,
      }),
    });
    ```

    如果解析需要网络调用，请使用 `prepareDynamicModel` 进行异步
    预热 — `resolveDynamicModel` 在其完成后再次运行。

  </Step>

  <Step title="添加运行时钩子（按需）">
    大多数提供商只需要 `catalog` + `resolveDynamicModel`。随着你的提供商需要它们，
    增量添加钩子。

    <Tabs>
      <Tab title="令牌交换">
        对于在每次推理调用前需要令牌交换的提供商：

        ```typescript
        prepareRuntimeAuth: async (ctx) => {
          const exchanged = await exchangeToken(ctx.apiKey);
          return {
            apiKey: exchanged.token,
            baseUrl: exchanged.baseUrl,
            expiresAt: exchanged.expiresAt,
          };
        },
        ```
      </Tab>
      <Tab title="自定义请求头">
        对于需要自定义请求头或请求体修改的提供商：

        ```typescript
        // wrapStreamFn returns a StreamFn derived from ctx.streamFn
        wrapStreamFn: (ctx) => {
          if (!ctx.streamFn) return undefined;
          const inner = ctx.streamFn;
          return async (params) => {
            params.headers = {
              ...params.headers,
              "X-Acme-Version": "2",
            };
            return inner(params);
          };
        },
        ```
      </Tab>
      <Tab title="使用量和计费">
        对于公开使用量/计费数据的提供商：

        ```typescript
        resolveUsageAuth: async (ctx) => {
          const auth = await ctx.resolveOAuthToken();
          return auth ? { token: auth.token } : null;
        },
        fetchUsageSnapshot: async (ctx) => {
          return await fetchAcmeUsage(ctx.token, ctx.timeoutMs);
        },
        ```
      </Tab>
    </Tabs>

    <Accordion title="所有可用的提供商钩子">
      OpenClaw 按此顺序调用钩子。大多数提供商只使用 2-3 个：

      | # | 钩子 | 使用时机 |
      | --- | --- | --- |
      | 1 | `catalog` | 模型目录或基础 URL 默认值 |
      | 2 | `resolveDynamicModel` | 接受任意上游模型 ID |
      | 3 | `prepareDynamicModel` | 解析前的异步元数据获取 |
      | 4 | `normalizeResolvedModel` | 运行器之前的传输重写 |
      | 5 | `capabilities` | 转录/工具元数据（数据，非可调用） |
      | 6 | `prepareExtraParams` | 默认请求参数 |
      | 7 | `wrapStreamFn` | 自定义请求头/请求体包装器 |
      | 8 | `formatApiKey` | 自定义运行时令牌形状 |
      | 9 | `refreshOAuth` | 自定义 OAuth 刷新 |
      | 10 | `buildAuthDoctorHint` | 认证修复指导 |
      | 11 | `isCacheTtlEligible` | 提示缓存 TTL 门控 |
      | 12 | `buildMissingAuthMessage` | 自定义缺失认证提示 |
      | 13 | `suppressBuiltInModel` | 隐藏过时的上游行 |
      | 14 | `augmentModelCatalog` | 合成向前兼容行 |
      | 15 | `isBinaryThinking` | 二元思维开关 |
      | 16 | `supportsXHighThinking` | `xhigh` 推理支持 |
      | 17 | `resolveDefaultThinkingLevel` | 默认 `/think` 策略 |
      | 18 | `isModernModelRef` | 实时/冒烟模型匹配 |
      | 19 | `prepareRuntimeAuth` | 推理前的令牌交换 |
      | 20 | `resolveUsageAuth` | 自定义使用量凭据解析 |
      | 21 | `fetchUsageSnapshot` | 自定义使用量端点 |
      | 22 | `onModelSelected` | 选择后回调（例如遥测） |
      | 23 | `buildReplayPolicy` | 自定义转录策略（例如思考块剥离） |
      | 24 | `sanitizeReplayHistory` | 通用清理后的提供商特定重放重写 |
      | 25 | `validateReplayTurns` | 嵌入式运行器之前的严格重放轮次验证 |

      有关详细描述和真实示例，请参阅
      [内部原理：提供商运行时钩子](/plugins/architecture#provider-runtime-hooks)。
    </Accordion>

  </Step>

  <Step title="添加额外能力（可选）">
    <a id="step-5-add-extra-capabilities"></a>
    提供商插件可以 alongside 文本推理注册语音、媒体理解、图像
    生成和网络搜索：

    ```typescript
    register(api) {
      api.registerProvider({ id: "acme-ai", /* ... */ });

      api.registerSpeechProvider({
        id: "acme-ai",
        label: "Acme Speech",
        isConfigured: ({ config }) => Boolean(config.messages?.tts),
        synthesize: async (req) => ({
          audioBuffer: Buffer.from(/* PCM data */),
          outputFormat: "mp3",
          fileExtension: ".mp3",
          voiceCompatible: false,
        }),
      });

      api.registerMediaUnderstandingProvider({
        id: "acme-ai",
        capabilities: ["image", "audio"],
        describeImage: async (req) => ({ text: "A photo of..." }),
        transcribeAudio: async (req) => ({ text: "Transcript..." }),
      });

      api.registerImageGenerationProvider({
        id: "acme-ai",
        label: "Acme Images",
        generate: async (req) => ({ /* image result */ }),
      });
    }
    ```

    OpenClaw 将其分类为 **混合能力** 插件。这是
    公司插件的推荐模式（每个供应商一个插件）。请参阅
    [内部原理：能力所有权](/plugins/architecture#capability-ownership-model)。

  </Step>

  <Step title="测试">
    <a id="step-6-test"></a>
    ```typescript src/provider.test.ts
    import { describe, it, expect } from "vitest";
    // Export your provider config object from index.ts or a dedicated file
    import { acmeProvider } from "./provider.js";

    describe("acme-ai provider", () => {
      it("resolves dynamic models", () => {
        const model = acmeProvider.resolveDynamicModel!({
          modelId: "acme-beta-v3",
        } as any);
        expect(model.id).toBe("acme-beta-v3");
        expect(model.provider).toBe("acme-ai");
      });

      it("returns catalog when key is available", async () => {
        const result = await acmeProvider.catalog!.run({
          resolveProviderApiKey: () => ({ apiKey: "test-key" }),
        } as any);
        expect(result?.provider?.models).toHaveLength(2);
      });

      it("returns null catalog when no key", async () => {
        const result = await acmeProvider.catalog!.run({
          resolveProviderApiKey: () => ({ apiKey: undefined }),
        } as any);
        expect(result).toBeNull();
      });
    });
    ```

  </Step>
</Steps>

## 发布到 ClawHub

提供商插件的发布方式与任何其他外部代码插件相同：

```bash
clawhub package publish your-org/your-plugin --dry-run
clawhub package publish your-org/your-plugin
```

不要在此使用传统的 skill-only 发布别名；插件包应使用
`clawhub package publish`。

## 文件结构

```
<bundled-plugin-root>/acme-ai/
├── package.json              # openclaw.providers 元数据
├── openclaw.plugin.json      # 带 providerAuthEnvVars 的清单
├── index.ts                  # definePluginEntry + registerProvider
└── src/
    ├── provider.test.ts      # 测试
    └── usage.ts              # 使用量端点（可选）
```

## 目录顺序参考

`catalog.order` 控制你的目录相对于内置
提供商的合并时机：

| 顺序      | 时机           | 使用场景                                           |
| --------- | -------------- | -------------------------------------------------- |
| `simple`  | 第一轮         | 纯 API 密钥提供商                                   |
| `profile` | simple 之后    | 按认证配置文件限制的提供商                         |
| `paired`  | profile 之后   | 综合多个相关条目                                    |
| `late`    | 最后一轮       | 覆盖现有提供商（冲突时获胜）                       |

## 下一步

- [渠道插件](/plugins/sdk-channel-plugins) — 如果你的插件也提供渠道
- [SDK 运行时](/plugins/sdk-runtime) — `api.runtime` 辅助函数（TTS、搜索、子代理）
- [SDK 概述](/plugins/sdk-overview) — 完整的子路径导入参考
- [插件内部原理](/plugins/architecture#provider-runtime-hooks) — 钩子详情和捆绑示例
