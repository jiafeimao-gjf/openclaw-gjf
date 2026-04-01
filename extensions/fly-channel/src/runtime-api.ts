// Private runtime barrel for the bundled Fly extension.

import type { FlyAccountConfig } from "./config-schema.js";

export type FlyChannelRuntime = {
  wsUrl?: string;
  authToken?: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
};

export type ResolvedFlyAccount = {
  accountId?: string | null;
  name?: string;
  enabled?: boolean;
  config: FlyAccountConfig;
  token?: string;
  tokenSource?: "config" | "env" | "file";
  wsUrl?: string;
};

export type FlyProbeResult = {
  ok: boolean;
  error?: string;
  elapsedMs: number;
  connected?: boolean;
  userId?: string;
};
