/**
 * Type definitions for the fly-chat channel plugin.
 */

/** Raw channel config from openclaw.json channels.fly-chat */
export interface FlyChatChannelConfig {
  enabled?: boolean;
  token?: string;
  dmPolicy?: "open" | "allowlist" | "disabled";
  allowedUserIds?: string | string[];
  rateLimitPerMinute?: number;
  accounts?: Record<string, FlyChatAccountRaw>;
  /** Explicit transport override */
  transport?: "webhook" | "websocket";
  /** Webhook transport fields */
  webhookPath?: string;
  incomingUrl?: string;
  allowInsecureSsl?: boolean;
  /** WebSocket transport fields */
  serverUrl?: string;
  reconnect?: FlyChatReconnectConfig;
}

/** Raw per-account config (overrides base config) */
export interface FlyChatAccountRaw extends FlyChatChannelConfig {}

/** Webhook-specific account fields */
export interface FlyChatWebhookAccount {
  transport: "webhook";
  webhookPath: string;
  token?: string;
  incomingUrl?: string;
  allowInsecureSsl: boolean;
}

/** WebSocket-specific account fields */
export interface FlyChatWebSocketAccount {
  transport: "websocket";
  serverUrl: string;
  token?: string;
  reconnect: FlyChatReconnectConfig;
}

/** Reconnect policy configuration */
export interface FlyChatReconnectConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  jitterRatio: number;
}

/** Fully resolved account config with defaults applied (webhook variant) */
export interface ResolvedFlyChatWebhookAccount {
  accountId: string;
  enabled: boolean;
  transport: "webhook";
  webhookPath: string;
  token: string;
  incomingUrl: string;
  dmPolicy: "open" | "allowlist" | "disabled";
  allowedUserIds: string[];
  rateLimitPerMinute: number;
  allowInsecureSsl: boolean;
}

/** Fully resolved account config with defaults applied (websocket variant) */
export interface ResolvedFlyChatWebSocketAccount {
  accountId: string;
  enabled: boolean;
  transport: "websocket";
  serverUrl: string;
  token: string;
  dmPolicy: "open" | "allowlist" | "disabled";
  allowedUserIds: string[];
  rateLimitPerMinute: number;
  reconnect: FlyChatReconnectConfig;
}

/** Discriminated union of resolved account configs */
export type ResolvedFlyChatAccount =
  | ResolvedFlyChatWebhookAccount
  | ResolvedFlyChatWebSocketAccount;

/** Inbound message from fly-chat webhook */
export interface FlyChatInboundMessage {
  from: string;
  text: string;
  timestamp?: string;
  sessionKey?: string;
  token?: string;
}

/** Parsed webhook payload (user-defined format) */
export interface FlyChatWebhookPayload {
  token?: string;
  user_id?: string;
  userId?: string;
  user?: string;
  text?: string;
  message?: string;
  content?: string;
  timestamp?: string;
  sessionKey?: string;
  session_key?: string;
  username?: string;
  name?: string;
  senderName?: string;
}
