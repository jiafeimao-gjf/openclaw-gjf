import WebSocket from "ws";

// ============================================================================
// Types
// ============================================================================

export type FlyWebSocketMessage = {
  type: string;
  id?: string;
  from?: string;
  to?: string;
  content?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
  token?: string;
  user_id?: string;
};

export type FlyWsStatus = {
  connected: boolean;
  lastConnectedAt?: number;
  lastDisconnect?: {
    at: number;
    status: number;
    error?: string;
  };
  lastError?: string;
};

export type FlyInboundMessageHandler = (msg: FlyWebSocketMessage) => Promise<void>;

export type FlyWsFactory = (url: string) => FlyWsLike;

export type FlyWsLike = {
  on(event: "open", listener: () => void): void;
  on(event: "message", listener: (data: WebSocket.RawData) => void | Promise<void>): void;
  on(event: "close", listener: (code: number, reason: Buffer) => void): void;
  on(event: "error", listener: (err: unknown) => void): void;
  send(data: string): void;
  close(): void;
  terminate(): void;
  readyState: number;
};

export type CreateFlyWsClientOpts = {
  wsUrl: string;
  authToken?: string;
  authUserId?: string;
  abortSignal?: AbortSignal;
  statusSink?: (patch: {
    connected?: boolean;
    lastConnectedAt?: number;
    lastDisconnect?: { at: number; status: number; error?: string };
    lastError?: string;
  }) => void;
  runtime?: FlyRuntimeEnv;
  onMessage: FlyInboundMessageHandler;
  webSocketFactory?: FlyWsFactory;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
};

export type FlyRuntimeEnv = {
  log?: (msg: string) => void;
  error?: (msg: string) => void;
};

export class WebSocketClosedBeforeOpenError extends Error {
  constructor(
    public readonly code: number,
    public readonly reason?: string,
  ) {
    super(`WebSocket closed before open (code ${code})`);
    this.name = "WebSocketClosedBeforeOpenError";
  }
}

export class FlyWsClient {
  private ws: FlyWsLike | null = null;
  private wsUrl: string;
  private authToken?: string;
  private authUserId?: string;
  private abortSignal?: AbortSignal;
  private statusSink?: (patch: {
    connected?: boolean;
    lastConnectedAt?: number;
    lastDisconnect?: { at: number; status: number; error?: string };
    lastError?: string;
  }) => void;
  private runtime: FlyRuntimeEnv;
  private onMessage: FlyInboundMessageHandler;
  private webSocketFactory: FlyWsFactory;
  private reconnectDelayMs: number;
  private maxReconnectDelayMs: number;
  private reconnectTimeout?: ReturnType<typeof setTimeout>;
  private abortHandler?: () => void;
  private opened = false;
  private shouldReconnect = true;
  private seq = 1;

  constructor(opts: CreateFlyWsClientOpts) {
    this.wsUrl = opts.wsUrl;
    this.authToken = opts.authToken;
    this.authUserId = opts.authUserId;
    this.abortSignal = opts.abortSignal;
    this.statusSink = opts.statusSink;
    this.runtime = opts.runtime ?? { log: console.log, error: console.error };
    this.onMessage = opts.onMessage;
    this.webSocketFactory = opts.webSocketFactory ?? defaultFlyWebSocketFactory;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 1000;
    this.maxReconnectDelayMs = opts.maxReconnectDelayMs ?? 30000;
  }

  async connect(): Promise<void> {
    this.shouldReconnect = true;
    this.abortHandler = () => {
      this.shouldReconnect = false;
      this.scheduleReconnect();
    };
    this.abortSignal?.addEventListener("abort", this.abortHandler, { once: true });

    try {
      await this.doConnect();
    } finally {
      this.abortSignal?.removeEventListener("abort", this.abortHandler);
    }
  }

  private async doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const rejectOnce = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      this.ws = this.webSocketFactory(this.wsUrl);

      this.ws.on("open", () => {
        this.opened = true;
        this.runtime.log?.("WebSocket connected");
        this.statusSink?.({
          connected: true,
          lastConnectedAt: Date.now(),
          lastDisconnect: undefined,
          lastError: undefined,
        });

        if (this.authToken) {
          this.sendAuth(this.authToken);
        }

        resolveOnce();
      });

      this.ws.on("message", async (data) => {
        try {
          const msg = this.parseMessage(data);
          if (!msg) return;

          if (msg.type === "auth_ack") {
            const authResp = msg as { type: string; ok: boolean; error?: string; userId?: string };
            if (authResp.ok) {
              this.runtime.log?.(`Authenticated, userId: ${authResp.userId}`);
            } else {
              this.runtime.error?.(`Auth failed: ${authResp.error}`);
            }
            return;
          }

          if (msg.type === "ping") {
            this.send({ type: "pong", id: msg.id });
            return;
          }

          await this.onMessage(msg);
        } catch (err) {
          this.runtime.error?.(`Message handler error: ${String(err)}`);
        }
      });

      this.ws.on("close", (code, reason) => {
        this.opened = false;
        const message = reasonToString(reason);
        this.runtime.log?.(`WebSocket closed: code=${code} reason=${message}`);
        this.statusSink?.({
          connected: false,
          lastDisconnect: {
            at: Date.now(),
            status: code,
            error: message || undefined,
          },
        });

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (err) => {
        const errStr = String(err);
        this.runtime.error?.(`WebSocket error: ${errStr}`);
        this.statusSink?.({
          lastError: errStr,
        });
        if (!this.opened) {
          rejectOnce(new Error(`WebSocket error: ${errStr}`));
        }
      });

      setTimeout(() => {
        if (!this.opened && this.ws) {
          this.ws.terminate();
          rejectOnce(new Error("WebSocket connection timeout"));
        }
      }, 10000);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    if (!this.shouldReconnect || this.abortSignal?.aborted) {
      return;
    }

    const delay = this.calculateReconnectDelay();
    this.runtime.log?.(`Reconnecting in ${Math.round(delay / 1000)}s...`);
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = undefined;
      this.abortHandler &&
        this.abortSignal?.addEventListener("abort", this.abortHandler, { once: true });
      this.doConnect().catch((err) => {
        this.runtime.error?.(`Reconnect failed: ${String(err)}`);
      });
    }, delay);
  }

  private calculateReconnectDelay(): number {
    const jitter = Math.random() * 0.3 * this.reconnectDelayMs;
    const delay = this.reconnectDelayMs + jitter;
    this.reconnectDelayMs = Math.min(delay * 2, this.maxReconnectDelayMs);
    return delay;
  }

  private sendAuth(token: string): void {
    this.send({ type: "auth", token, user_id: this.authUserId });
  }

  send(msg: FlyWebSocketMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.runtime.error?.("Cannot send: WebSocket not connected");
      return false;
    }
    try {
      this.ws.send(JSON.stringify({ ...msg, seq: this.seq++ }));
      return true;
    } catch (err) {
      this.runtime.error?.(`Send error: ${String(err)}`);
      return false;
    }
  }

  sendText(to: string, text: string): boolean {
    return this.send({
      type: "message",
      to,
      content: text,
      timestamp: Date.now(),
    });
  }

  close(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = undefined;
    }
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }

  private parseMessage(data: WebSocket.RawData): FlyWebSocketMessage | null {
    const raw = rawDataToString(data);
    try {
      return JSON.parse(raw) as FlyWebSocketMessage;
    } catch {
      this.runtime.error?.(`Failed to parse message: ${raw}`);
      return null;
    }
  }

  isConnected(): boolean {
    return this.opened && this.ws?.readyState === WebSocket.OPEN;
  }
}

function rawDataToString(data: WebSocket.RawData): string {
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  if (typeof data === "string") {
    return data;
  }
  return data.toString();
}

function reasonToString(reason: Buffer | string | undefined): string {
  if (!reason) return "";
  if (typeof reason === "string") return reason;
  return reason.length > 0 ? reason.toString("utf8") : "";
}

export const defaultFlyWebSocketFactory: FlyWsFactory = (url) => {
  const ws = new WebSocket(url);
  return ws as unknown as FlyWsLike;
};

export function createFlyWsClient(opts: CreateFlyWsClientOpts): FlyWsClient {
  return new FlyWsClient(opts);
}
