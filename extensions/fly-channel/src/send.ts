import type { FlyWsClient } from "./ws-client.js";

export type FlySendParams = {
  to: string;
  text: string;
  accountId?: string;
  wsClient?: FlyWsClient;
};

export async function sendFlyText(params: FlySendParams): Promise<{
  ok: boolean;
  messageId?: string | null;
  error?: string | null;
}> {
  const { to, text, wsClient } = params;

  if (!wsClient) {
    return { ok: false, error: "WebSocket client not initialized", messageId: null };
  }

  if (!wsClient.isConnected()) {
    return { ok: false, error: "WebSocket not connected", messageId: null };
  }

  const sent = wsClient.sendText(to, text);
  if (!sent) {
    return { ok: false, error: "Failed to send message", messageId: null };
  }

  // Generate a message ID based on timestamp and target
  const messageId = `fly-${Date.now()}-${to}`;
  return { ok: true, messageId };
}
