import { createAccountListHelpers } from "openclaw/plugin-sdk/account-helpers";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk/account-id";
import { buildChannelConfigSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { createRawChannelSendResultAdapter } from "openclaw/plugin-sdk/channel-send-result";
import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import { createPatchedAccountSetupAdapter } from "openclaw/plugin-sdk/setup";
import WebSocket from "ws";
import { FlyConfigSchema, type FlyAccountConfig } from "./config-schema.js";
import type { ResolvedFlyAccount, FlyProbeResult } from "./runtime-api.js";

const meta = {
  id: "fly" as const,
  label: "Fly",
  selectionLabel: "Fly (Custom Channel)",
  docsPath: "/channels/fly",
  docsLabel: "fly",
  blurb: "Self-developed custom messaging channel via WebSocket.",
  order: 80,
  quickstartAllowFrom: true,
};

function normalizeFlyMessagingTarget(raw: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.replace(/^(fly):/i, "").trim();
}

const flySetupAdapter = createPatchedAccountSetupAdapter({
  channelKey: "fly",
  validateInput: ({ input }) => {
    if (!input.token && !input.tokenFile && !input.useEnv) {
      return "Fly requires --token, --token-file, or --use-env.";
    }
    return null;
  },
  buildPatch: (input) =>
    input.useEnv
      ? {}
      : input.tokenFile
        ? { tokenFile: input.tokenFile }
        : input.token
          ? { token: input.token }
          : {},
});

const { listAccountIds: listFlyAccountIds, resolveDefaultAccountId: resolveDefaultFlyAccountId } =
  createAccountListHelpers("fly");
export { listFlyAccountIds, resolveDefaultFlyAccountId };

function resolveFlyAccount(
  cfg: {
    channels?: {
      fly?: { accounts?: Record<string, Partial<FlyAccountConfig>>; enabled?: boolean };
    };
  },
  accountId?: string | null,
): ResolvedFlyAccount {
  const accountIdOrDefault = accountId ?? DEFAULT_ACCOUNT_ID;
  const flyConfig = cfg.channels?.fly;
  const enabled = flyConfig?.enabled !== false;

  let wsUrl: string | undefined;
  let token: string | undefined;
  let tokenSource: "config" | "env" | "file" | undefined;
  const rawAccountConfig =
    accountIdOrDefault === DEFAULT_ACCOUNT_ID
      ? flyConfig?.accounts?.default
      : flyConfig?.accounts?.[accountIdOrDefault];

  wsUrl = rawAccountConfig?.wsUrl;
  token = rawAccountConfig?.token;
  const envToken = process.env.FLY_AUTH_TOKEN;
  if (!token && envToken) {
    token = envToken;
    tokenSource = "env";
  }

  const accountConfig: FlyAccountConfig = {
    name: rawAccountConfig?.name,
    enabled: rawAccountConfig?.enabled,
    wsUrl: rawAccountConfig?.wsUrl,
    token: rawAccountConfig?.token,
    tokenFile: rawAccountConfig?.tokenFile,
    dmPolicy: rawAccountConfig?.dmPolicy ?? "pairing",
    allowFrom: rawAccountConfig?.allowFrom,
    reconnectDelayMs: rawAccountConfig?.reconnectDelayMs,
    maxReconnectDelayMs: rawAccountConfig?.maxReconnectDelayMs,
    textChunkLimit: rawAccountConfig?.textChunkLimit,
  };

  return {
    accountId: accountIdOrDefault,
    name: accountConfig.name,
    enabled,
    config: accountConfig,
    token,
    tokenSource,
    wsUrl,
  };
}

export type { ResolvedFlyAccount };

const flyRawSendResultAdapter = createRawChannelSendResultAdapter({
  channel: "fly",
  sendText: async ({ to, text, cfg, accountId }) => {
    const account = resolveFlyAccount(cfg as Parameters<typeof resolveFlyAccount>[0], accountId);
    const wsUrl = account.wsUrl;

    if (!wsUrl) {
      return { ok: false, error: "WebSocket URL not configured", messageId: null };
    }

    return new Promise((resolve) => {
      let ws: WebSocket | null = null;
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ws?.close();
          resolve({ ok: false, error: "Send timeout", messageId: null });
        }
      }, 5000);

      try {
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (account.token) {
            ws?.send(JSON.stringify({ type: "auth", token: account.token }));
          }
          ws?.send(
            JSON.stringify({
              type: "message",
              to,
              content: text,
              timestamp: Date.now(),
            }),
          );
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string);
            if (msg.type === "ack" || msg.type === "error") {
              if (!settled) {
                settled = true;
                clearTimeout(timeout);
                ws?.close();
                if (msg.type === "error") {
                  resolve({ ok: false, error: msg.error, messageId: msg.id ?? null });
                } else {
                  resolve({ ok: true, messageId: msg.id ?? `fly-${Date.now()}-${to}` });
                }
              }
            }
          } catch {}
        };

        ws.onerror = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            ws?.close();
            resolve({ ok: false, error: "WebSocket error", messageId: null });
          }
        };

        ws.onclose = () => {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve({ ok: true, messageId: `fly-${Date.now()}-${to}` });
          }
        };
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve({ ok: false, error: String(err), messageId: null });
        }
      }
    });
  },
});

export const flyPlugin: ChannelPlugin<ResolvedFlyAccount, FlyProbeResult> = createChatChannelPlugin(
  {
    base: {
      id: "fly",
      meta,
      setup: flySetupAdapter,
      capabilities: {
        chatTypes: ["direct"],
        media: false,
        reactions: false,
        threads: false,
        polls: false,
        nativeCommands: false,
        blockStreaming: true,
      },
      configSchema: buildChannelConfigSchema(FlyConfigSchema),
      config: {
        listAccountIds: listFlyAccountIds,
        resolveAccount: resolveFlyAccount as (
          cfg: unknown,
          accountId?: string | null,
        ) => ResolvedFlyAccount,
        defaultAccountId: resolveDefaultFlyAccountId,
        isConfigured: (account) => Boolean(account.wsUrl),
        describeAccount: (account) => ({
          accountId: account.accountId ?? DEFAULT_ACCOUNT_ID,
          name: account.name ?? "Fly",
          enabled: account.enabled ?? true,
          configured: Boolean(account.wsUrl),
          extra: {
            wsUrl: account.wsUrl ? maskedUrl(account.wsUrl) : undefined,
            tokenSource: account.tokenSource,
          },
        }),
      },
      messaging: {
        normalizeTarget: normalizeFlyMessagingTarget,
      },
    },
    security: {
      dm: {
        channelKey: "fly",
        resolvePolicy: (account) => account.config.dmPolicy ?? "pairing",
        resolveAllowFrom: (account) => account.config.allowFrom ?? [],
        defaultPolicy: "pairing",
      },
    },
    pairing: {
      idLabel: "flyUserId",
      notifyApproval: async ({ id }) => {
        // TODO: Send notification via WebSocket
      },
    },
    threading: {
      resolveReplyToMode: () => "off",
    },
    outbound: {
      deliveryMode: "direct",
      ...flyRawSendResultAdapter,
    },
  },
);

function maskedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname.slice(0, 20)}...`;
  } catch {
    return url;
  }
}
