/**
 * Inbound webhook handler for fly-chat outgoing webhooks.
 * Parses form-urlencoded/JSON body, validates security, delivers to agent.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import * as querystring from "node:querystring";
import {
  isRequestBodyLimitError,
  readRequestBodyWithLimit,
  requestBodyErrorToText,
} from "../../api.js";
import { sendViaWebhook } from "../client.js";
import { validateToken, authorizeUserForDm, sanitizeInput, RateLimiter } from "../security.js";
import type { FlyChatWebhookPayload, ResolvedFlyChatAccount } from "../types.js";

const PREAUTH_MAX_BODY_BYTES = 64 * 1024;
const PREAUTH_BODY_TIMEOUT_MS = 5_000;

const rateLimiters = new Map<string, RateLimiter>();

function getRateLimiter(account: ResolvedFlyChatAccount): RateLimiter {
  if (account.transport !== "webhook") {
    throw new Error("getRateLimiter called with non-webhook account");
  }
  let rl = rateLimiters.get(account.accountId);
  if (!rl || rl.maxRequests() !== account.rateLimitPerMinute) {
    rl?.clear();
    rl = new RateLimiter(account.rateLimitPerMinute);
    rateLimiters.set(account.accountId, rl);
  }
  return rl;
}

export function clearFlyChatWebhookRateLimiterStateForTest(): void {
  for (const limiter of rateLimiters.values()) {
    limiter.clear();
  }
  rateLimiters.clear();
}

async function readBody(
  req: IncomingMessage,
): Promise<{ ok: true; body: string } | { ok: false; statusCode: number; error: string }> {
  try {
    const body = await readRequestBodyWithLimit(req, {
      maxBytes: PREAUTH_MAX_BODY_BYTES,
      timeoutMs: PREAUTH_BODY_TIMEOUT_MS,
    });
    return { ok: true, body };
  } catch (err) {
    if (isRequestBodyLimitError(err)) {
      return {
        ok: false,
        statusCode: err.statusCode,
        error: requestBodyErrorToText(err.code),
      };
    }
    return { ok: false, statusCode: 400, error: "Invalid request body" };
  }
}

function firstNonEmptyString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = firstNonEmptyString(item);
      if (normalized) return normalized;
    }
    return undefined;
  }
  if (value === null || value === undefined) return undefined;
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

function pickAlias(record: Record<string, unknown>, aliases: string[]): string | undefined {
  for (const alias of aliases) {
    const normalized = firstNonEmptyString(record[alias]);
    if (normalized) return normalized;
  }
  return undefined;
}

function parseQueryParams(req: IncomingMessage): Record<string, unknown> {
  try {
    const url = new URL(req.url ?? "", "http://localhost");
    const out: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) {
      out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function parseFormBody(body: string): Record<string, unknown> {
  return querystring.parse(body) as Record<string, unknown>;
}

function parseJsonBody(body: string): Record<string, unknown> {
  if (!body.trim()) return {};
  const parsed = JSON.parse(body);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Invalid JSON body");
  }
  return parsed as Record<string, unknown>;
}

function headerValue(header: string | string[] | undefined): string | undefined {
  return firstNonEmptyString(header);
}

function extractTokenFromHeaders(req: IncomingMessage): string | undefined {
  const explicit =
    headerValue(req.headers["x-fly-chat-token"]) ??
    headerValue(req.headers["x-webhook-token"]) ??
    headerValue(req.headers["x-openclaw-token"]);
  if (explicit) return explicit;

  const auth = headerValue(req.headers.authorization);
  if (!auth) return undefined;

  const bearerMatch = auth.match(/^Bearer\s+(.+)$/i);
  if (bearerMatch?.[1]) return bearerMatch[1].trim();
  return auth.trim();
}

/**
 * Parse incoming webhook payload.
 *
 * Supports:
 * - application/x-www-form-urlencoded
 * - application/json
 *
 * Token resolution order: body.token -> query.token -> headers
 */
function parsePayload(req: IncomingMessage, body: string): FlyChatWebhookPayload | null {
  const contentType = String(req.headers["content-type"] ?? "").toLowerCase();

  let bodyFields: Record<string, unknown> = {};
  if (contentType.includes("application/json")) {
    bodyFields = parseJsonBody(body);
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    bodyFields = parseFormBody(body);
  } else {
    try {
      bodyFields = parseJsonBody(body);
    } catch {
      bodyFields = parseFormBody(body);
    }
  }

  const queryFields = parseQueryParams(req);
  const headerToken = extractTokenFromHeaders(req);

  const token =
    pickAlias(bodyFields, ["token"]) ?? pickAlias(queryFields, ["token"]) ?? headerToken;

  const userId =
    pickAlias(bodyFields, ["user_id", "userId", "user"]) ??
    pickAlias(queryFields, ["user_id", "userId", "user"]);
  const text =
    pickAlias(bodyFields, ["text", "message", "content"]) ??
    pickAlias(queryFields, ["text", "message", "content"]);

  return {
    token,
    user_id: userId,
    text,
    timestamp: pickAlias(bodyFields, ["timestamp"]) ?? pickAlias(queryFields, ["timestamp"]),
    sessionKey:
      pickAlias(bodyFields, ["sessionKey", "session_key"]) ??
      pickAlias(queryFields, ["sessionKey", "session_key"]),
    username:
      pickAlias(bodyFields, ["username", "user_name", "name", "senderName"]) ??
      pickAlias(queryFields, ["username", "user_name", "name", "senderName"]),
  };
}

function respondJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function respondNoContent(res: ServerResponse) {
  res.writeHead(204);
  res.end();
}

export interface WebhookHandlerDeps {
  account: ResolvedFlyChatAccount;
  deliver: (msg: {
    body: string;
    from: string;
    senderName: string;
    provider: string;
    chatType: string;
    sessionKey: string;
    accountId: string;
    commandAuthorized: boolean;
  }) => Promise<string | null>;
  log?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Create an HTTP request handler for fly-chat outgoing webhooks.
 */
export function createWebhookHandler(deps: WebhookHandlerDeps) {
  const { account, deliver, log } = deps;
  if (account.transport !== "webhook") {
    throw new Error("createWebhookHandler called with non-webhook account");
  }
  const rateLimiter = getRateLimiter(account);

  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      respondJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const bodyResult = await readBody(req);
    if (!bodyResult.ok) {
      log?.error("Failed to read request body", bodyResult.error);
      respondJson(res, bodyResult.statusCode, { error: bodyResult.error });
      return;
    }

    let payload: FlyChatWebhookPayload | null = null;
    try {
      payload = parsePayload(req, bodyResult.body);
    } catch (err) {
      log?.warn("Failed to parse webhook payload", err);
      respondJson(res, 400, { error: "Invalid request body" });
      return;
    }
    if (!payload) {
      respondJson(res, 400, { error: "Missing required fields (token, user_id, text)" });
      return;
    }

    if (account.token && !validateToken(payload.token ?? "", account.token)) {
      log?.warn(`Invalid token from ${req.socket?.remoteAddress}`);
      respondJson(res, 401, { error: "Invalid token" });
      return;
    }

    const userId = payload.user_id ?? "unknown";
    const auth = authorizeUserForDm(userId, account.dmPolicy, account.allowedUserIds);
    if (!auth.allowed) {
      if (auth.reason === "disabled") {
        respondJson(res, 403, { error: "DMs are disabled" });
        return;
      }
      if (auth.reason === "allowlist-empty") {
        log?.warn("fly-chat allowlist is empty while dmPolicy=allowlist; rejecting message");
        respondJson(res, 403, {
          error: "Allowlist is empty. Configure allowedUserIds or use dmPolicy=open.",
        });
        return;
      }
      log?.warn(`Unauthorized user: ${userId}`);
      respondJson(res, 403, { error: "User not authorized" });
      return;
    }

    if (!rateLimiter.check(userId)) {
      log?.warn(`Rate limit exceeded for user: ${userId}`);
      respondJson(res, 429, { error: "Rate limit exceeded" });
      return;
    }

    const cleanText = sanitizeInput(payload.text ?? "");

    if (!cleanText) {
      respondNoContent(res);
      return;
    }

    const preview = cleanText.length > 100 ? `${cleanText.slice(0, 100)}...` : cleanText;
    log?.info(`Message from ${payload.username ?? userId} (${userId}): ${preview}`);

    respondNoContent(res);

    const sessionKey = payload.sessionKey ?? `fly-chat-${userId}`;

    try {
      const deliverPromise = deliver({
        body: cleanText,
        from: userId,
        senderName: payload.username ?? userId,
        provider: "fly-chat",
        chatType: "direct",
        sessionKey,
        accountId: account.accountId,
        commandAuthorized: auth.allowed,
      });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error("Agent response timeout (120s)")), 120_000),
      );

      const reply = await Promise.race([deliverPromise, timeoutPromise]);

      if (reply && account.incomingUrl) {
        await sendViaWebhook(account.incomingUrl, reply, userId, account.allowInsecureSsl);
        const replyPreview = reply.length > 100 ? `${reply.slice(0, 100)}...` : reply;
        log?.info(`Reply sent to ${payload.username ?? userId}: ${replyPreview}`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      log?.error(`Failed to process message from ${payload.username ?? userId}: ${errMsg}`);
    }
  };
}
