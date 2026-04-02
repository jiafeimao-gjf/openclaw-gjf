import { buildCatchallMultiAccountChannelSchema } from "openclaw/plugin-sdk/channel-config-schema";
import { z } from "zod";

const flyAccountSchema = z.object({
  name: z.string().optional(),
  enabled: z.boolean().optional(),
  /** WebSocket server URL (e.g., ws://localhost:8080 or wss://example.com/ws) */
  wsUrl: z.string().url().optional(),
  /** User ID for WebSocket connection verification */
  userId: z.string().optional(),
  /** Authentication token for the IM server */
  token: z.string().optional(),
  /** Read token from file path instead of config */
  tokenFile: z.string().optional(),
  /** DM policy: pairing, allowlist, open, disabled */
  dmPolicy: z.enum(["pairing", "allowlist", "open", "disabled"]).optional().default("pairing"),
  /** Allowed sender IDs or "*" for any */
  allowFrom: z.array(z.string()).optional(),
  /** Reconnect delay in ms (default: 1000) */
  reconnectDelayMs: z.number().optional(),
  /** Max reconnect delay in ms (default: 30000) */
  maxReconnectDelayMs: z.number().optional(),
  /** Message chunk size limit */
  textChunkLimit: z.number().optional(),
});

export const FlyConfigSchema = buildCatchallMultiAccountChannelSchema(flyAccountSchema);

export type FlyAccountConfig = z.infer<typeof flyAccountSchema>;
