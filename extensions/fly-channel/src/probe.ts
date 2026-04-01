import WebSocket from "ws";
import type { FlyProbeResult } from "./runtime-api.js";

export type { FlyProbeResult };

export async function probeFly(wsUrl?: string, timeoutMs = 5000): Promise<FlyProbeResult> {
  if (!wsUrl?.trim()) {
    return { ok: false, error: "No WebSocket URL configured", elapsedMs: 0 };
  }

  const startTime = Date.now();

  return new Promise((resolve) => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let resolved = false;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (ws) {
        try {
          ws.close();
        } catch {}
      }
    };

    const finish = (result: FlyProbeResult) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    try {
      ws = new WebSocket(wsUrl);

      timer = setTimeout(() => {
        finish({
          ok: false,
          error: `Connection timed out after ${timeoutMs}ms`,
          elapsedMs: timeoutMs,
        });
      }, timeoutMs);

      ws.onopen = () => {
        const elapsedMs = Date.now() - startTime;
        ws?.close();
        finish({ ok: true, elapsedMs, connected: true });
      };

      ws.onerror = () => {
        const elapsedMs = Date.now() - startTime;
        finish({ ok: false, error: "WebSocket connection failed", elapsedMs });
      };
    } catch (err) {
      const elapsedMs = Date.now() - startTime;
      finish({ ok: false, error: String(err), elapsedMs });
    }
  });
}
