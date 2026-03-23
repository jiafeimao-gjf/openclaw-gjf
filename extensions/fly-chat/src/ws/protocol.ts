/**
 * fly-chat WebSocket message protocol parser/serializer.
 *
 * Protocol format (user-defined):
 * - Outbound: JSON { type: "message", data: { from: string, text: string, timestamp?: string, sessionKey?: string } }
 * - Inbound reply: JSON { type: "reply", data: { to: string, text: string } }
 */

export interface FlyChatWsOutboundMessage {
  type: "message";
  data: {
    from: string;
    text: string;
    timestamp?: string;
    sessionKey?: string;
  };
}

export interface FlyChatWsInboundReply {
  type: "reply";
  data: {
    to: string;
    text: string;
  };
}

export type FlyChatWsInboundMessage = FlyChatWsOutboundMessage | FlyChatWsInboundReply;

/**
 * Parse a raw WebSocket message into a structured fly-chat message.
 */
export function parseWsMessage(raw: string): FlyChatWsInboundMessage | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    if (
      parsed.type === "message" &&
      parsed.data &&
      typeof parsed.data.from === "string" &&
      typeof parsed.data.text === "string"
    ) {
      return parsed as FlyChatWsOutboundMessage;
    }

    if (
      parsed.type === "reply" &&
      parsed.data &&
      typeof parsed.data.to === "string" &&
      typeof parsed.data.text === "string"
    ) {
      return parsed as FlyChatWsInboundReply;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Serialize an outbound reply to a JSON string.
 */
export function serializeWsReply(to: string, text: string): string {
  return JSON.stringify({
    type: "reply",
    data: { to, text },
  });
}

/**
 * Serialize an outbound keepalive/ping.
 */
export function serializeWsPing(): string {
  return JSON.stringify({ type: "ping" });
}
