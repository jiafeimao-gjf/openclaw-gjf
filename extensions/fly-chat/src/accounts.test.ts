import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAccountIds, resolveAccount } from "./accounts.js";

// Save and restore env vars
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  delete process.env.FLY_CHAT_TOKEN;
  delete process.env.FLY_CHAT_INCOMING_URL;
  delete process.env.FLY_CHAT_SERVER_URL;
  delete process.env.FLY_CHAT_ALLOWED_USER_IDS;
  delete process.env.FLY_CHAT_RATE_LIMIT;
});

describe("listAccountIds", () => {
  it("returns empty array when no channel config", () => {
    expect(listAccountIds({})).toEqual([]);
    expect(listAccountIds({ channels: {} })).toEqual([]);
  });

  it("returns ['default'] when base config has token", () => {
    const cfg = { channels: { "fly-chat": { token: "abc" } } };
    expect(listAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns ['default'] when env var has token", () => {
    process.env.FLY_CHAT_TOKEN = "env-token";
    const cfg = { channels: { "fly-chat": {} } };
    expect(listAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns ['default'] when base config has serverUrl (websocket)", () => {
    const cfg = { channels: { "fly-chat": { serverUrl: "wss://fly.example.com/ws" } } };
    expect(listAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns ['default'] when env var has serverUrl (websocket)", () => {
    process.env.FLY_CHAT_SERVER_URL = "wss://fly.example.com/ws";
    const cfg = { channels: { "fly-chat": {} } };
    expect(listAccountIds(cfg)).toEqual(["default"]);
  });

  it("returns named accounts", () => {
    const cfg = {
      channels: {
        "fly-chat": {
          accounts: {
            work: { serverUrl: "wss://work.example.com/ws" },
            home: { serverUrl: "wss://home.example.com/ws" },
          },
        },
      },
    };
    const ids = listAccountIds(cfg);
    expect(ids).toContain("work");
    expect(ids).toContain("home");
  });

  it("returns default + named accounts", () => {
    const cfg = {
      channels: {
        "fly-chat": {
          token: "base-token",
          accounts: { work: { token: "t1" } },
        },
      },
    };
    const ids = listAccountIds(cfg);
    expect(ids).toContain("default");
    expect(ids).toContain("work");
  });
});

describe("resolveAccount", () => {
  it("returns full defaults for empty config (webhook, no serverUrl)", () => {
    const cfg = { channels: { "fly-chat": {} } };
    const account = resolveAccount(cfg, "default");
    expect(account.accountId).toBe("default");
    expect(account.enabled).toBe(true);
    expect(account.transport).toBe("webhook");
    expect(account.webhookPath).toBe("/webhook/fly-chat");
    expect(account.dmPolicy).toBe("allowlist");
    expect(account.rateLimitPerMinute).toBe(30);
  });

  it("returns websocket transport when serverUrl is set", () => {
    const cfg = {
      channels: { "fly-chat": { serverUrl: "wss://fly.example.com/ws" } },
    };
    const account = resolveAccount(cfg, "default");
    expect(account.transport).toBe("websocket");
    expect((account as any).serverUrl).toBe("wss://fly.example.com/ws");
  });

  it("uses env var fallbacks for webhook", () => {
    process.env.FLY_CHAT_TOKEN = "env-tok";
    process.env.FLY_CHAT_INCOMING_URL = "https://fly.example.com/incoming";

    const cfg = { channels: { "fly-chat": {} } };
    const account = resolveAccount(cfg);
    expect(account.token).toBe("env-tok");
    expect((account as any).incomingUrl).toBe("https://fly.example.com/incoming");
  });

  it("uses env var fallbacks for websocket serverUrl", () => {
    process.env.FLY_CHAT_SERVER_URL = "wss://fly.example.com/ws";
    process.env.FLY_CHAT_TOKEN = "env-tok";

    const cfg = { channels: { "fly-chat": {} } };
    const account = resolveAccount(cfg);
    expect(account.transport).toBe("websocket");
    expect((account as any).serverUrl).toBe("wss://fly.example.com/ws");
    expect(account.token).toBe("env-tok");
  });

  it("config overrides env vars", () => {
    process.env.FLY_CHAT_TOKEN = "env-tok";
    const cfg = {
      channels: { "fly-chat": { token: "config-tok" } },
    };
    const account = resolveAccount(cfg);
    expect(account.token).toBe("config-tok");
  });

  it("account override takes priority over base config", () => {
    const cfg = {
      channels: {
        "fly-chat": {
          token: "base-tok",
          serverUrl: "wss://base.example.com/ws",
          accounts: {
            work: { token: "work-tok", serverUrl: "wss://work.example.com/ws" },
          },
        },
      },
    };
    const account = resolveAccount(cfg, "work");
    expect(account.token).toBe("work-tok");
    expect(account.transport).toBe("websocket");
    expect((account as any).serverUrl).toBe("wss://work.example.com/ws");
  });

  it("webhook account has allowInsecureSsl default false", () => {
    const cfg = { channels: { "fly-chat": {} } };
    const account = resolveAccount(cfg);
    expect(account.transport).toBe("webhook");
    expect((account as any).allowInsecureSsl).toBe(false);
  });

  it("websocket account has reconnect defaults", () => {
    const cfg = {
      channels: { "fly-chat": { serverUrl: "wss://fly.example.com/ws" } },
    };
    const account = resolveAccount(cfg);
    expect(account.transport).toBe("websocket");
    expect((account as any).reconnect).toEqual({
      initialDelayMs: 2000,
      maxDelayMs: 30000,
      maxAttempts: 12,
      jitterRatio: 0.25,
    });
  });

  it("reconnect config can be overridden per account", () => {
    const cfg = {
      channels: {
        "fly-chat": {
          serverUrl: "wss://fly.example.com/ws",
          accounts: {
            fast: {
              serverUrl: "wss://fast.example.com/ws",
              reconnect: {
                initialDelayMs: 500,
                maxDelayMs: 5000,
                maxAttempts: 3,
                jitterRatio: 0.1,
              },
            },
          },
        },
      },
    };
    const account = resolveAccount(cfg, "fast");
    expect(account.transport).toBe("websocket");
    expect((account as any).reconnect.initialDelayMs).toBe(500);
    expect((account as any).reconnect.maxAttempts).toBe(3);
  });

  it("parses comma-separated allowedUserIds string", () => {
    const cfg = {
      channels: { "fly-chat": { allowedUserIds: "user1, user2, user3" } },
    };
    const account = resolveAccount(cfg);
    expect(account.allowedUserIds).toEqual(["user1", "user2", "user3"]);
  });

  it("handles allowedUserIds as array", () => {
    const cfg = {
      channels: { "fly-chat": { allowedUserIds: ["u1", "u2"] } },
    };
    const account = resolveAccount(cfg);
    expect(account.allowedUserIds).toEqual(["u1", "u2"]);
  });

  it("falls back to 30 for malformed FLY_CHAT_RATE_LIMIT values", () => {
    process.env.FLY_CHAT_RATE_LIMIT = "0abc";
    const cfg = { channels: { "fly-chat": {} } };
    const account = resolveAccount(cfg);
    expect(account.rateLimitPerMinute).toBe(30);
  });

  it("respects FLY_CHAT_RATE_LIMIT=0", () => {
    process.env.FLY_CHAT_RATE_LIMIT = "0";
    const cfg = { channels: { "fly-chat": {} } };
    const account = resolveAccount(cfg);
    expect(account.rateLimitPerMinute).toBe(0);
  });
});
