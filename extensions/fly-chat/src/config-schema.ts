import { z } from "zod";
import { buildChannelConfigSchema } from "../api.js";

const FlyChatReconnectSchema = z.object({
  initialDelayMs: z.number().default(2000),
  maxDelayMs: z.number().default(30000),
  maxAttempts: z.number().default(12),
  jitterRatio: z.number().default(0.25),
});

const FlyChatWebhookAccountSchema = z.object({
  transport: z.literal("webhook"),
  webhookPath: z.string().default("/webhook/fly-chat"),
  token: z.string().optional(),
  incomingUrl: z.string().optional(),
  allowInsecureSsl: z.boolean().default(false),
});

const FlyChatWebSocketAccountSchema = z.object({
  transport: z.literal("websocket"),
  serverUrl: z.string(),
  token: z.string().optional(),
  reconnect: FlyChatReconnectSchema.optional(),
});

const FlyChatBaseAccountSchema = z.object({
  enabled: z.boolean().default(true),
  dmPolicy: z.enum(["open", "allowlist", "disabled"]).default("allowlist"),
  allowedUserIds: z.union([z.string(), z.array(z.string())]).default([]),
  rateLimitPerMinute: z.number().default(30),
});

export const FlyChatAccountSchema = z.discriminatedUnion("transport", [
  FlyChatBaseAccountSchema.merge(FlyChatWebhookAccountSchema),
  FlyChatBaseAccountSchema.merge(FlyChatWebSocketAccountSchema),
]);

export const FlyChatChannelConfigSchema = buildChannelConfigSchema(
  z
    .object({
      enabled: z.boolean().default(true),
      dmPolicy: z.enum(["open", "allowlist", "disabled"]).default("allowlist"),
      allowedUserIds: z.union([z.string(), z.array(z.string())]).default([]),
      rateLimitPerMinute: z.number().default(30),
      webhookPath: z.string().default("/webhook/fly-chat"),
      incomingUrl: z.string().optional(),
      allowInsecureSsl: z.boolean().default(false),
      serverUrl: z.string().optional(),
      reconnect: FlyChatReconnectSchema.optional(),
    })
    .passthrough(),
);
