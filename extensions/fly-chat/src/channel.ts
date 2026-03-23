/**
 * fly-chat Channel Plugin for OpenClaw.
 *
 * Supports two transports:
 * - webhook: OpenClaw receives HTTP POST from fly-chat server
 * - websocket: OpenClaw connects to fly-chat server via WebSocket
 */

import {
  createHybridChannelConfigAdapter,
  createScopedDmSecurityResolver,
} from "openclaw/plugin-sdk/channel-config-helpers";
import {
  createConditionalWarningCollector,
  projectWarningCollector,
} from "openclaw/plugin-sdk/channel-policy";
import {
  attachChannelToResult,
  createEmptyChannelDirectoryAdapter,
  createTextPairingAdapter,
} from "openclaw/plugin-sdk/channel-runtime";
import { DEFAULT_ACCOUNT_ID, registerPluginHttpRoute } from "../api.js";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { FlyChatChannelConfigSchema } from "./config-schema.js";
import { getFlyChatRuntime } from "./runtime.js";
import type { ResolvedFlyChatAccount } from "./types.js";
import { createWebhookHandler } from "./webhook/index.js";
import { createFlyChatWsClient, runFlyChatReconnectLoop } from "./ws/index.js";

const CHANNEL_ID = "fly-chat";

const activeRouteUnregisters = new Map<string, () => void>();
const activeWsTeardowns = new Map<string, () => void>();

const resolveFlyChatDmPolicy = createScopedDmSecurityResolver<ResolvedFlyChatAccount>({
  channelKey: CHANNEL_ID,
  resolvePolicy: (account) => account.dmPolicy,
  resolveAllowFrom: (account) => account.allowedUserIds,
  policyPathSuffix: "dmPolicy",
  defaultPolicy: "allowlist",
  approveHint: "openclaw pairing approve fly-chat <code>",
  normalizeEntry: (raw) => raw.toLowerCase().trim(),
});

const flyChatConfigAdapter = createHybridChannelConfigAdapter<ResolvedFlyChatAccount>({
  sectionKey: CHANNEL_ID,
  listAccountIds: (cfg: any) => listAccountIds(cfg),
  resolveAccount: (cfg: any, accountId?: string | null) => resolveAccount(cfg, accountId),
  defaultAccountId: () => DEFAULT_ACCOUNT_ID,
  clearBaseFields: [
    "token",
    "webhookPath",
    "incomingUrl",
    "allowInsecureSsl",
    "serverUrl",
    "reconnect",
    "dmPolicy",
    "allowedUserIds",
    "rateLimitPerMinute",
  ],
  resolveAllowFrom: (account) => account.allowedUserIds,
  formatAllowFrom: (allowFrom) =>
    allowFrom.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean),
});

const collectFlyChatSecurityWarnings = createConditionalWarningCollector<ResolvedFlyChatAccount>(
  (account) =>
    account.transport === "webhook" &&
    !account.token &&
    "- fly-chat: token is not configured. The webhook will reject all requests.",
  (account) =>
    account.transport === "webhook" &&
    !account.incomingUrl &&
    "- fly-chat: incomingUrl is not configured. The bot cannot send replies.",
  (account) =>
    account.transport === "websocket" &&
    !account.serverUrl &&
    "- fly-chat: serverUrl is not configured. WebSocket transport cannot connect.",
  (account) =>
    account.dmPolicy === "open" &&
    '- fly-chat: dmPolicy="open" allows any user to message the bot. Consider "allowlist" for production use.',
  (account) =>
    account.dmPolicy === "allowlist" &&
    account.allowedUserIds.length === 0 &&
    '- fly-chat: dmPolicy="allowlist" with empty allowedUserIds blocks all senders. Add users or set dmPolicy="open".',
);

function waitUntilAbort(signal?: AbortSignal, onAbort?: () => void): Promise<void> {
  return new Promise((resolve) => {
    const complete = () => {
      onAbort?.();
      resolve();
    };
    if (!signal) return;
    if (signal.aborted) {
      complete();
      return;
    }
    signal.addEventListener("abort", complete, { once: true });
  });
}

function buildDeliverFn(account: ResolvedFlyChatAccount, log: any) {
  return async (msg: {
    body: string;
    from: string;
    senderName: string;
    provider: string;
    chatType: string;
    sessionKey: string;
    accountId: string;
    commandAuthorized: boolean;
  }) => {
    const rt = getFlyChatRuntime();
    const currentCfg = await rt.config.loadConfig();

    const msgCtx = rt.channel.reply.finalizeInboundContext({
      Body: msg.body,
      RawBody: msg.body,
      CommandBody: msg.body,
      From: `fly-chat:${msg.from}`,
      To: `fly-chat:${msg.from}`,
      SessionKey: msg.sessionKey,
      AccountId: account.accountId,
      OriginatingChannel: CHANNEL_ID,
      OriginatingTo: `fly-chat:${msg.from}`,
      ChatType: msg.chatType,
      SenderName: msg.senderName,
      SenderId: msg.from,
      Provider: CHANNEL_ID,
      Surface: CHANNEL_ID,
      ConversationLabel: msg.senderName || msg.from,
      Timestamp: Date.now(),
      CommandAuthorized: msg.commandAuthorized,
    });

    let replyText: string | null = null;

    await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx: msgCtx,
      cfg: currentCfg,
      dispatcherOptions: {
        deliver: async (payload: { text?: string; body?: string }) => {
          replyText = payload?.text ?? payload?.body ?? null;
        },
        onReplyStart: () => {
          log?.info?.(`Agent reply started for ${msg.from}`);
        },
      },
    });

    return replyText;
  };
}

export function createFlyChatPlugin() {
  return {
    id: CHANNEL_ID,

    meta: {
      id: CHANNEL_ID,
      label: "fly-chat",
      selectionLabel: "fly-chat",
      detailLabel: "fly-chat",
      docsPath: "/channels/fly-chat",
      blurb: "Connect fly-chat to OpenClaw via webhook or WebSocket",
      order: 90,
    },

    capabilities: {
      chatTypes: ["direct" as const],
      media: false,
      threads: false,
      reactions: false,
      edit: false,
      unsend: false,
      reply: false,
      effects: false,
      blockStreaming: false,
    },

    reload: { configPrefixes: [`channels.${CHANNEL_ID}`] },

    configSchema: FlyChatChannelConfigSchema,
    config: {
      ...flyChatConfigAdapter,
    },

    pairing: createTextPairingAdapter({
      idLabel: "flyChatUserId",
      message: "OpenClaw: your access has been approved.",
      normalizeAllowEntry: (entry: string) => entry.toLowerCase().trim(),
      notify: async ({ cfg, id, message }) => {
        // Notify via the configured transport
        const account = resolveAccount(cfg);
        if (account.transport === "websocket") {
          // WebSocket notification not supported in pairing adapter
          return;
        }
        // For webhook, we would need incomingUrl to send - handled via outbound.sendText
      },
    }),

    security: {
      resolveDmPolicy: resolveFlyChatDmPolicy,
      collectWarnings: projectWarningCollector(
        ({ account }: { account: ResolvedFlyChatAccount }) => account,
        collectFlyChatSecurityWarnings,
      ),
    },

    messaging: {
      normalizeTarget: (target: string) => {
        const trimmed = target.trim();
        if (!trimmed) return undefined;
        return trimmed.replace(/^fly-chat:?/i, "").trim();
      },
      targetResolver: {
        looksLikeId: (id: string) => {
          const trimmed = id?.trim();
          if (!trimmed) return false;
          return /^fly-chat:?/i.test(trimmed) || !/[\s@#]/.test(trimmed);
        },
        hint: "<userId>",
      },
    },

    directory: createEmptyChannelDirectoryAdapter(),

    outbound: {
      deliveryMode: "gateway" as const,
      textChunkLimit: 2000,

      sendText: async ({ to, text, accountId, cfg }: any) => {
        const account: ResolvedFlyChatAccount = resolveAccount(cfg ?? {}, accountId);

        if (account.transport === "webhook") {
          if (!account.incomingUrl) {
            throw new Error("fly-chat incomingUrl not configured");
          }
          const { sendViaWebhook } = await import("./client.js");
          const ok = await sendViaWebhook(account.incomingUrl, text, to, account.allowInsecureSsl);
          if (!ok) {
            throw new Error("Failed to send message to fly-chat");
          }
        } else {
          // WebSocket - must have active connection
          // Outbound via WS is handled by the active WS client
          throw new Error(
            "fly-chat WebSocket outbound not yet implemented - use webhook transport",
          );
        }

        return attachChannelToResult(CHANNEL_ID, { messageId: `fc-${Date.now()}`, chatId: to });
      },
    },

    gateway: {
      startAccount: async (ctx: any) => {
        const { cfg, accountId, log, abortSignal } = ctx;
        const account = resolveAccount(cfg, accountId);

        if (!account.enabled) {
          log?.info?.(`fly-chat account ${accountId} is disabled, skipping`);
          return waitUntilAbort(abortSignal);
        }

        if (account.transport === "webhook") {
          return startWebhookTransport(ctx, account);
        } else {
          return startWebSocketTransport(ctx, account);
        }
      },

      stopAccount: async (ctx: any) => {
        ctx.log?.info?.(`fly-chat account ${ctx.accountId} stopped`);
      },
    },

    agentPrompt: {
      messageToolHints: () => [
        "",
        "### fly-chat Formatting",
        "fly-chat supports plain text messages.",
        "Keep messages concise and clear.",
        "Best practices:",
        "- Use short, direct responses",
        "- Use line breaks to separate sections",
        "- Keep messages under 2000 characters",
      ],
    },
  };
}

async function startWebhookTransport(ctx: any, account: ResolvedFlyChatAccount) {
  const { cfg, accountId, log, abortSignal } = ctx;

  if (account.transport !== "webhook") return waitUntilAbort(abortSignal);

  if (!account.token && !account.incomingUrl) {
    log?.warn?.(
      `fly-chat account ${accountId} not fully configured (missing token and incomingUrl)`,
    );
    return waitUntilAbort(abortSignal);
  }
  if (account.dmPolicy === "allowlist" && account.allowedUserIds.length === 0) {
    log?.warn?.(
      `fly-chat account ${accountId} has dmPolicy=allowlist but empty allowedUserIds; refusing to start route`,
    );
    return waitUntilAbort(abortSignal);
  }

  log?.info?.(
    `Starting fly-chat webhook channel (account: ${accountId}, path: ${account.webhookPath})`,
  );

  const handler = createWebhookHandler({
    account,
    deliver: buildDeliverFn(account, log),
    log,
  });

  const routeKey = `${accountId}:${account.webhookPath}`;
  const prevUnregister = activeRouteUnregisters.get(routeKey);
  if (prevUnregister) {
    log?.info?.(`Deregistering stale route before re-registering: ${account.webhookPath}`);
    prevUnregister();
    activeRouteUnregisters.delete(routeKey);
  }

  const unregister = registerPluginHttpRoute({
    path: account.webhookPath,
    auth: "plugin",
    replaceExisting: true,
    pluginId: CHANNEL_ID,
    accountId: account.accountId,
    log: (msg: string) => log?.info?.(msg),
    handler,
  });
  activeRouteUnregisters.set(routeKey, unregister);

  log?.info?.(`Registered HTTP route: ${account.webhookPath} for fly-chat`);

  return waitUntilAbort(abortSignal, () => {
    log?.info?.(`Stopping fly-chat webhook channel (account: ${accountId})`);
    if (typeof unregister === "function") unregister();
    activeRouteUnregisters.delete(routeKey);
  });
}

async function startWebSocketTransport(ctx: any, account: ResolvedFlyChatAccount) {
  const { cfg, accountId, log, abortSignal } = ctx;

  if (account.transport !== "websocket") return waitUntilAbort(abortSignal);

  if (!account.serverUrl) {
    log?.warn?.(`fly-chat account ${accountId} has no serverUrl configured`);
    return waitUntilAbort(abortSignal);
  }

  log?.info?.(
    `Starting fly-chat WebSocket channel (account: ${accountId}, server: ${account.serverUrl})`,
  );

  let wsTeardown: (() => void) | null = null;
  let reconnectAttempts = 0;

  await runFlyChatReconnectLoop(
    {
      policy: account.reconnect,
      connect: async () => {
        const teardownKey = `${accountId}`;

        const { ws, teardown } = await createFlyChatWsClient({
          account,
          deliver: buildDeliverFn(account, log),
          onConnect: () => {
            reconnectAttempts = 0;
            log?.info?.(`fly-chat WebSocket connected (account: ${accountId})`);
          },
          onDisconnect: (err) => {
            log?.warn?.(
              `fly-chat WebSocket disconnected (account: ${accountId}): ${
                err instanceof Error ? err.message : String(err ?? "unknown")
              }`,
            );
          },
          log,
        });

        wsTeardown = () => {
          teardown();
          activeWsTeardowns.delete(teardownKey);
        };
        activeWsTeardowns.set(teardownKey, wsTeardown);

        // Wait for the WS to actually open (or fail)
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error("WS connection timeout")), 30_000);
          ws.once("open", () => {
            clearTimeout(timeout);
            resolve();
          });
          ws.once("error", (err) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
      },
      onMaxAttemptsReached: (err) => {
        log?.error?.(
          `fly-chat WebSocket: max reconnect attempts reached (account: ${accountId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      },
    },
    abortSignal,
  );

  return waitUntilAbort(abortSignal, () => {
    log?.info?.(`Stopping fly-chat WebSocket channel (account: ${accountId})`);
    if (wsTeardown) wsTeardown();
    const teardownKey = `${accountId}`;
    activeWsTeardowns.delete(teardownKey);
  });
}

export const flyChatPlugin = createFlyChatPlugin();
