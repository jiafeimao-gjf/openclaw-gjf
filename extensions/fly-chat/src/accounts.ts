/**
 * Account resolution: reads config from channels.fly-chat,
 * merges per-account overrides, falls back to environment variables.
 */

import type {
  FlyChatChannelConfig,
  FlyChatAccountRaw,
  ResolvedFlyChatAccount,
  ResolvedFlyChatWebhookAccount,
  ResolvedFlyChatWebSocketAccount,
} from "./types.js";

/** Extract the channel config from the full OpenClaw config object. */
function getChannelConfig(cfg: any): FlyChatChannelConfig | undefined {
  return cfg?.channels?.["fly-chat"];
}

/** Parse allowedUserIds from string or array to string[]. */
function parseAllowedUserIds(raw: string | string[] | undefined): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(Boolean);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseRateLimitPerMinute(raw: string | undefined): number {
  if (raw == null) return 30;
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) return 30;
  return Number.parseInt(trimmed, 10);
}

/** Default reconnect policy */
const DEFAULT_RECONNECT = {
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  maxAttempts: 12,
  jitterRatio: 0.25,
};

/**
 * List all configured account IDs for this channel.
 */
export function listAccountIds(cfg: any): string[] {
  const channelCfg = getChannelConfig(cfg);
  if (!channelCfg) return [];

  const ids = new Set<string>();

  // Named accounts
  if (channelCfg.accounts) {
    for (const id of Object.keys(channelCfg.accounts)) {
      ids.add(id);
    }
  }

  // If base config has a token or serverUrl, there's a "default" account
  const hasBaseToken = channelCfg.token || process.env.FLY_CHAT_TOKEN;
  const hasBaseServerUrl = channelCfg.serverUrl || process.env.FLY_CHAT_SERVER_URL;
  const hasBaseIncomingUrl = channelCfg.incomingUrl || process.env.FLY_CHAT_INCOMING_URL;
  if (hasBaseToken || hasBaseServerUrl || hasBaseIncomingUrl) {
    ids.add("default");
  }

  return Array.from(ids);
}

/** Detect transport mode from config fields */
function detectTransport(
  accountOverride: FlyChatAccountRaw,
  channelCfg: FlyChatChannelConfig,
): "webhook" | "websocket" {
  // Explicit transport in account override
  if (accountOverride.transport === "webhook" || accountOverride.transport === "websocket") {
    return accountOverride.transport;
  }
  // Explicit transport in base config
  if (channelCfg.transport === "webhook" || channelCfg.transport === "websocket") {
    return channelCfg.transport;
  }
  // Heuristic: serverUrl implies websocket, incomingUrl implies webhook
  const accountServerUrl =
    accountOverride.serverUrl ?? channelCfg.serverUrl ?? process.env.FLY_CHAT_SERVER_URL;
  const accountIncomingUrl =
    accountOverride.incomingUrl ?? channelCfg.incomingUrl ?? process.env.FLY_CHAT_INCOMING_URL;
  if (accountServerUrl && !accountIncomingUrl) return "websocket";
  return "webhook";
}

/**
 * Resolve a specific account by ID with full defaults applied.
 */
export function resolveAccount(cfg: any, accountId?: string | null): ResolvedFlyChatAccount {
  const channelCfg = getChannelConfig(cfg) ?? {};
  const id = accountId || "default";

  const accountOverride = channelCfg.accounts?.[id] ?? {};

  const envToken = process.env.FLY_CHAT_TOKEN ?? "";
  const envIncomingUrl = process.env.FLY_CHAT_INCOMING_URL ?? "";
  const envServerUrl = process.env.FLY_CHAT_SERVER_URL ?? "";
  const envAllowedUserIds = process.env.FLY_CHAT_ALLOWED_USER_IDS ?? "";
  const envRateLimitValue = parseRateLimitPerMinute(process.env.FLY_CHAT_RATE_LIMIT);

  const transport = detectTransport(accountOverride, channelCfg);

  const base = {
    accountId: id,
    enabled: accountOverride.enabled ?? channelCfg.enabled ?? true,
    token: accountOverride.token ?? channelCfg.token ?? envToken,
    dmPolicy: accountOverride.dmPolicy ?? channelCfg.dmPolicy ?? "allowlist",
    allowedUserIds: parseAllowedUserIds(
      accountOverride.allowedUserIds ?? channelCfg.allowedUserIds ?? envAllowedUserIds,
    ),
    rateLimitPerMinute:
      accountOverride.rateLimitPerMinute ?? channelCfg.rateLimitPerMinute ?? envRateLimitValue,
  };

  if (transport === "websocket") {
    return {
      ...base,
      transport: "websocket",
      serverUrl: accountOverride.serverUrl ?? channelCfg.serverUrl ?? envServerUrl,
      reconnect: {
        ...DEFAULT_RECONNECT,
        ...(accountOverride.reconnect ?? channelCfg.reconnect ?? {}),
      },
    } satisfies ResolvedFlyChatWebSocketAccount;
  }

  return {
    ...base,
    transport: "webhook",
    webhookPath: accountOverride.webhookPath ?? channelCfg.webhookPath ?? "/webhook/fly-chat",
    incomingUrl: accountOverride.incomingUrl ?? channelCfg.incomingUrl ?? envIncomingUrl,
    allowInsecureSsl: accountOverride.allowInsecureSsl ?? channelCfg.allowInsecureSsl ?? false,
  } satisfies ResolvedFlyChatWebhookAccount;
}
