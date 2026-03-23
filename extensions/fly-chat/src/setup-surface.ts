import {
  DEFAULT_ACCOUNT_ID,
  formatDocsLink,
  normalizeAccountId,
  setSetupChannelEnabled,
  type ChannelSetupAdapter,
  type ChannelSetupWizard,
  type OpenClawConfig,
} from "openclaw/plugin-sdk/setup";
import { listAccountIds, resolveAccount } from "./accounts.js";
import type { FlyChatAccountRaw, FlyChatChannelConfig } from "./types.js";

const channel = "fly-chat" as const;
const DEFAULT_WEBHOOK_PATH = "/webhook/fly-chat";

const FLY_CHAT_SETUP_HELP_LINES = [
  "1) Choose a transport: webhook (receive HTTP POST) or WebSocket (connect to fly-chat server)",
  "2) For webhook: configure the incoming webhook URL and optional token",
  "3) For WebSocket: configure the fly-chat server WebSocket URL and optional token",
  `Docs: ${formatDocsLink("/channels/fly-chat", "channels/fly-chat")}`,
];

function getChannelConfig(cfg: OpenClawConfig): FlyChatChannelConfig {
  return (cfg.channels?.[channel] as FlyChatChannelConfig | undefined) ?? {};
}

function getRawAccountConfig(cfg: OpenClawConfig, accountId: string): FlyChatAccountRaw {
  const channelConfig = getChannelConfig(cfg);
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return channelConfig;
  }
  return channelConfig.accounts?.[accountId] ?? {};
}

function patchFlyChatAccountConfig(params: {
  cfg: OpenClawConfig;
  accountId: string;
  patch: Record<string, unknown>;
  clearFields?: string[];
  enabled?: boolean;
}): OpenClawConfig {
  const channelConfig = getChannelConfig(params.cfg);
  if (params.accountId === DEFAULT_ACCOUNT_ID) {
    const nextChannelConfig = { ...channelConfig } as Record<string, unknown>;
    for (const field of params.clearFields ?? []) {
      delete nextChannelConfig[field];
    }
    return {
      ...params.cfg,
      channels: {
        ...params.cfg.channels,
        [channel]: {
          ...nextChannelConfig,
          ...(params.enabled ? { enabled: true } : {}),
          ...params.patch,
        },
      },
    };
  }

  const nextAccounts = { ...(channelConfig.accounts ?? {}) } as Record<
    string,
    Record<string, unknown>
  >;
  const nextAccountConfig = { ...(nextAccounts[params.accountId] ?? {}) };
  for (const field of params.clearFields ?? []) {
    delete nextAccountConfig[field];
  }
  nextAccounts[params.accountId] = {
    ...nextAccountConfig,
    ...(params.enabled ? { enabled: true } : {}),
    ...params.patch,
  };

  return {
    ...params.cfg,
    channels: {
      ...params.cfg.channels,
      [channel]: {
        ...channelConfig,
        ...(params.enabled ? { enabled: true } : {}),
        accounts: nextAccounts,
      },
    },
  };
}

function isFlyChatConfigured(cfg: OpenClawConfig, accountId: string): boolean {
  const account = resolveAccount(cfg, accountId);
  if (account.transport === "webhook") {
    return Boolean(account.token.trim() && account.incomingUrl.trim());
  }
  return Boolean(account.serverUrl.trim());
}

function validateWebhookUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "URL must use http:// or https://.";
    }
  } catch {
    return "Must be a valid URL.";
  }
  return undefined;
}

function validateWebhookPath(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("/") ? undefined : "Webhook path must start with /.";
}

export const flyChatSetupAdapter: ChannelSetupAdapter = {
  resolveAccountId: ({ accountId }) => normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID,
  validateInput: ({ accountId, input }) => {
    if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
      return "fly-chat env credentials only support the default account.";
    }
    return null;
  },
  applyAccountConfig: ({ cfg, accountId, input }) =>
    patchFlyChatAccountConfig({
      cfg,
      accountId,
      enabled: true,
      patch: {},
    }),
};

export const flyChatSetupWizard: ChannelSetupWizard = {
  channel,
  status: {
    configuredLabel: "configured",
    unconfiguredLabel: "not configured",
    configuredHint: "configured",
    unconfiguredHint: "not configured",
    configuredScore: 1,
    unconfiguredScore: 0,
    resolveConfigured: ({ cfg }) =>
      listAccountIds(cfg).some((accountId) => isFlyChatConfigured(cfg, accountId)),
    resolveStatusLines: ({ cfg, configured }) => [
      `fly-chat: ${configured ? "configured" : "not configured"}`,
      `Accounts: ${listAccountIds(cfg).length || 0}`,
    ],
  },
  introNote: {
    title: "fly-chat setup",
    lines: FLY_CHAT_SETUP_HELP_LINES,
  },
  credentials: [],
  textInputs: [
    {
      inputKey: "url",
      message: "fly-chat WebSocket server URL",
      placeholder: "wss://fly-chat.example.com/ws",
      helpTitle: "fly-chat WebSocket server",
      helpLines: ["Enter the WebSocket URL for the fly-chat server."],
      currentValue: ({ cfg, accountId }) => getRawAccountConfig(cfg, accountId).serverUrl?.trim(),
      keepPrompt: (value) => `WebSocket server URL set (${value}). Keep it?`,
      validate: ({ value }) => (!value.trim() ? undefined : validateWebhookUrl(value.trim())),
      applySet: async ({ cfg, accountId, value }) =>
        patchFlyChatAccountConfig({
          cfg,
          accountId,
          enabled: true,
          clearFields: value.trim() ? undefined : ["serverUrl"],
          patch: value.trim() ? { transport: "websocket", serverUrl: value.trim() } : {},
        }),
    },
    {
      inputKey: "webhookUrl",
      message: "fly-chat incoming webhook URL (webhook transport)",
      placeholder: "https://fly-chat.example.com/webhook",
      helpTitle: "fly-chat incoming webhook",
      helpLines: ["Enter the incoming webhook URL for the fly-chat server."],
      currentValue: ({ cfg, accountId }) => getRawAccountConfig(cfg, accountId).incomingUrl?.trim(),
      keepPrompt: (value) => `Incoming webhook URL set (${value}). Keep it?`,
      validate: ({ value }) => (!value.trim() ? undefined : validateWebhookUrl(value.trim())),
      applySet: async ({ cfg, accountId, value }) =>
        patchFlyChatAccountConfig({
          cfg,
          accountId,
          enabled: true,
          clearFields: value.trim() ? undefined : ["incomingUrl"],
          patch: value.trim() ? { transport: "webhook", incomingUrl: value.trim() } : {},
        }),
    },
    {
      inputKey: "webhookPath",
      message: "Webhook path (optional, webhook transport only)",
      placeholder: DEFAULT_WEBHOOK_PATH,
      required: false,
      applyEmptyValue: true,
      helpTitle: "fly-chat webhook path",
      helpLines: [`Default path: ${DEFAULT_WEBHOOK_PATH}`],
      currentValue: ({ cfg, accountId }) => getRawAccountConfig(cfg, accountId).webhookPath?.trim(),
      keepPrompt: (value) => `Webhook path set (${value}). Keep it?`,
      validate: ({ value }) => validateWebhookPath(value),
      applySet: async ({ cfg, accountId, value }) =>
        patchFlyChatAccountConfig({
          cfg,
          accountId,
          enabled: true,
          clearFields: value.trim() ? undefined : ["webhookPath"],
          patch: value.trim() ? { webhookPath: value.trim() } : {},
        }),
    },
  ],
  completionNote: {
    title: "fly-chat configuration",
    lines: [
      `Configure fly-chat via the channel config in openclaw.json`,
      `Docs: ${formatDocsLink("/channels/fly-chat", "channels/fly-chat")}`,
    ],
  },
  disable: (cfg) => setSetupChannelEnabled(cfg, channel, false),
};
