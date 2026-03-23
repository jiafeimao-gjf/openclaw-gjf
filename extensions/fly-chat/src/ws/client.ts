/**
 * fly-chat WebSocket client using the `ws` library.
 * Connects to the fly-chat server and handles message dispatch.
 */

import type { WebSocket } from "ws";
import type { ResolvedFlyChatWebSocketAccount } from "../types.js";
import { parseWsMessage, serializeWsReply } from "./protocol.js";
import { getWsModule } from "./ws-runtime.js";

const MIN_SEND_INTERVAL_MS = 500;
let lastSendTime = 0;

export interface FlyChatWsClientDeps {
  account: ResolvedFlyChatWebSocketAccount;
  deliver: (msg: {
    body: string;
    from: string;
    senderName: string;
    provider: string;
    chatType: string;
    sessionKey: string;
    accountId: string;
    commandAuthorized: boolean;
  }) => Promise<string | null>;
  onConnect?: () => void;
  onDisconnect?: (err?: unknown) => void;
  log?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/** Sleep helper */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Internal rate-limit: minimum interval between outbound WS sends.
 */
async function rateLimitSend(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastSendTime;
  if (elapsed < MIN_SEND_INTERVAL_MS) {
    await sleep(MIN_SEND_INTERVAL_MS - elapsed);
  }
  lastSendTime = Date.now();
}

/**
 * Send a text reply to a fly-chat user over the WebSocket connection.
 */
export async function sendViaWs(ws: WebSocket, to: string, text: string): Promise<boolean> {
  if (ws.readyState !== ws.OPEN) {
    return false;
  }

  await rateLimitSend();

  return new Promise((resolve) => {
    const payload = serializeWsReply(to, text);
    ws.send(payload, (err) => {
      if (err) {
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

/**
 * Create and return a connected WebSocket client, plus a teardown function.
 * Must be called within an async context.
 */
export async function createFlyChatWsClient(deps: FlyChatWsClientDeps): Promise<{
  ws: WebSocket;
  teardown: () => void;
}> {
  const { account, deliver, onConnect, onDisconnect, log } = deps;
  const url = account.serverUrl;
  const headers: Record<string, string> = {};

  if (account.token) {
    headers["Authorization"] = `Bearer ${account.token}`;
  }

  const { WebSocket: WS } = await getWsModule();

  const ws = new WS(url, {
    headers,
    handshakeTimeout: 30_000,
  });

  const sessionKeyByUser = new Map<string, string>();
  let closed = false;

  function handleMessage(raw: string) {
    const msg = parseWsMessage(raw);
    if (!msg) return;

    if (msg.type === "message") {
      const { from, text, timestamp, sessionKey } = msg.data;
      const userId = from ?? "unknown";

      const sk = sessionKey ?? sessionKeyByUser.get(userId) ?? `fly-chat-ws-${userId}`;
      if (sessionKey) {
        sessionKeyByUser.set(userId, sessionKey);
      }

      const preview = text.length > 100 ? `${text.slice(0, 100)}...` : text;
      log?.info(`WS message from ${userId}: ${preview}`);

      deliver({
        body: text,
        from: userId,
        senderName: userId,
        provider: "fly-chat",
        chatType: "direct",
        sessionKey: sk,
        accountId: account.accountId,
        commandAuthorized: true,
      })
        .then((reply) => {
          if (reply && ws.readyState === ws.OPEN) {
            sendViaWs(ws, userId, reply).catch(() => {});
          }
        })
        .catch(() => {});
    }
  }

  ws.on("open", () => {
    log?.info?.(`fly-chat WebSocket connected to ${url}`);
    onConnect?.();
  });

  ws.on("message", (data: Buffer | string) => {
    try {
      handleMessage(typeof data === "string" ? data : data.toString());
    } catch (err) {
      log?.warn?.("Failed to handle WS message", err);
    }
  });

  ws.on("error", (err) => {
    log?.error?.(`fly-chat WebSocket error: ${err instanceof Error ? err.message : String(err)}`);
    if (!closed) {
      onDisconnect?.(err);
    }
  });

  ws.on("close", (code, reason) => {
    log?.info?.(`fly-chat WebSocket closed (code=${code}, reason=${reason?.toString() ?? ""})`);
    if (!closed) {
      onDisconnect?.();
    }
  });

  ws.on("pong", () => {
    log?.info?.("fly-chat WebSocket pong received");
  });

  // Periodic ping to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    }
  }, 30_000);

  const teardown = () => {
    closed = true;
    clearInterval(pingInterval);
    if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
      ws.terminate();
    }
  };

  return { ws, teardown };
}
