/**
 * Reconnect loop with exponential backoff + jitter for fly-chat WebSocket connections.
 */

import { computeBackoff, sleepWithAbort } from "openclaw/plugin-sdk/infra-runtime";
import type { FlyChatReconnectConfig } from "../types.js";

export const FLY_CHAT_WS_RECONNECT_POLICY: FlyChatReconnectConfig = {
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  maxAttempts: 12,
  jitterRatio: 0.25,
};

export interface ReconnectLoopDeps {
  policy: FlyChatReconnectConfig;
  connect: () => Promise<void>;
  onMaxAttemptsReached?: (err: unknown) => void;
}

/**
 * Run a reconnect loop that repeatedly calls connect() with backoff delays.
 * Respects abortSignal for graceful shutdown.
 */
export async function runFlyChatReconnectLoop(
  deps: ReconnectLoopDeps,
  abortSignal?: AbortSignal,
): Promise<void> {
  const { policy, connect, onMaxAttemptsReached } = deps;
  let attempts = 0;

  while (true) {
    try {
      await connect();
      return;
    } catch (err) {
      attempts++;

      if (attempts >= policy.maxAttempts) {
        onMaxAttemptsReached?.(err);
        return;
      }

      const delayMs = computeBackoff(
        {
          initialMs: policy.initialDelayMs,
          maxMs: policy.maxDelayMs,
          factor: 2,
          jitter: policy.jitterRatio,
        },
        attempts,
      );

      await sleepWithAbort(delayMs, abortSignal);
    }
  }
}
