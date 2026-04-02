// Local type definition to avoid importing from monolithic openclaw/plugin-sdk
type LocalRuntimeEnv = {
  log?: (...args: unknown[]) => void;
  error?: (...args: unknown[]) => void;
  exit?: (code: number) => never;
};

import type { MsgContext, ReplyDispatcher } from "openclaw/plugin-sdk/reply-runtime";
import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ResolvedFlyAccount } from "./runtime-api.js";
import type { FlyWsClient, FlyWebSocketMessage } from "./ws-client.js";
import { createFlyWsClient } from "./ws-client.js";

export type MonitorFlyOpts = {
  wsUrl?: string;
  authToken?: string;
  authUserId?: string;
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: LocalRuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: {
    connected?: boolean;
    lastConnectedAt?: number;
    lastDisconnect?: { at: number; status: number; error?: string };
    lastError?: string;
  }) => void;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  /**
   * Handler for inbound messages. Called for each incoming message of type "message".
   * The handler receives the parsed message context and should dispatch to AI and send reply.
   */
  onInbound?: (params: {
    ctx: MsgContext;
    dispatcher: ReplyDispatcher;
    cfg: OpenClawConfig;
    runtime: LocalRuntimeEnv;
  }) => Promise<void>;
};

export type FlyInboundMessageHandler = (
  msg: FlyWebSocketMessage,
  ctx: FlyMessageContext,
) => Promise<void>;

export type FlyMessageContext = {
  accountId: string;
  wsClient: FlyWsClient;
  runtime: LocalRuntimeEnv;
  statusSink?: (patch: {
    connected?: boolean;
    lastConnectedAt?: number;
    lastDisconnect?: { at: number; status: number; error?: string };
    lastError?: string;
  }) => void;
};

export async function monitorFlyChannel(opts: MonitorFlyOpts = {}): Promise<void> {
  const wsUrl = opts.wsUrl;
  const authToken = opts.authToken;
  const accountId = opts.accountId ?? "default";
  const runtime = opts.runtime ?? {
    log: console.log,
    error: console.error,
    exit: (code: number) => {
      throw new Error(`exit ${code}`);
    },
  };
  const abortSignal = opts.abortSignal;

  if (!wsUrl?.trim()) {
    runtime.error?.("[fly] WebSocket URL is required");
    throw new Error("Fly WebSocket URL is required");
  }

  runtime.log?.(`[fly] Connecting to ${wsUrl}`);

  let flyClient: FlyWsClient | null = null;

  const handleMessage: FlyInboundMessageHandler = async (msg) => {
    if (msg.type !== "message") return;
    if (!msg.content?.trim()) return;

    const from = msg.from ?? "unknown";
    const content = msg.content;

    runtime.log?.(`[fly] Message from ${from}: ${content.slice(0, 50)}...`);

    if (opts.onInbound) {
      const messageId = msg.id ?? `fly-${Date.now()}-${from}`;
      const ctx: MsgContext = {
        Body: content,
        RawBody: content,
        CommandBody: content,
        From: from,
        To: "self",
        SessionKey: `fly:${accountId}:${from}`,
        AccountId: accountId,
        MessageSid: messageId,
        MessageSidFull: messageId,
      };

      const { createReplyDispatcherWithTyping } = await import(
        "openclaw/plugin-sdk/reply-runtime"
      );
      const { dispatcher } = createReplyDispatcherWithTyping({
        deliver: async (payload) => {
          if (!flyClient) return;
          const text = payload.text ?? "";
          if (!text) return;
          flyClient.sendText(from, text);
        },
      });

      await opts.onInbound({ ctx, dispatcher, cfg: opts.config!, runtime });
    }
  };

  flyClient = createFlyWsClient({
    wsUrl,
    authToken,
    authUserId: opts.authUserId,
    abortSignal,
    statusSink: opts.statusSink,
    runtime: {
      log: (msg) => runtime.log?.(`[fly] ${msg}`),
      error: (msg) => runtime.error?.(`[fly] ${msg}`),
    },
    onMessage: async (msg) => {
      if (opts.onInbound) {
        await handleMessage(msg, {
          accountId,
          wsClient: flyClient!,
          runtime,
          statusSink: opts.statusSink,
        });
      }
    },
    reconnectDelayMs: opts.reconnectDelayMs ?? 1000,
    maxReconnectDelayMs: opts.maxReconnectDelayMs ?? 30000,
  });

  await flyClient.connect();
}

export type FlyMessageHandler = (msg: FlyWebSocketMessage, ctx: FlyMessageContext) => Promise<void>;
