/**
 * fly-chat HTTP outbound client.
 * Sends messages back to fly-chat via the incoming webhook URL (webhook transport).
 */

import * as http from "node:http";
import * as https from "node:https";

const MIN_SEND_INTERVAL_MS = 500;
let lastSendTime = 0;

/**
 * Send a text message to fly-chat via the incoming webhook.
 */
export async function sendViaWebhook(
  incomingUrl: string,
  text: string,
  to: string,
  allowInsecureSsl = true,
): Promise<boolean> {
  const payload = JSON.stringify({ to, text });
  const now = Date.now();
  const elapsed = now - lastSendTime;
  if (elapsed < MIN_SEND_INTERVAL_MS) {
    await sleep(MIN_SEND_INTERVAL_MS - elapsed);
  }

  const maxRetries = 3;
  const baseDelay = 300;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ok = await doPost(incomingUrl, payload, allowInsecureSsl);
      lastSendTime = Date.now();
      if (ok) return true;
    } catch {
      // will retry
    }

    if (attempt < maxRetries - 1) {
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }

  return false;
}

function doPost(url: string, body: string, allowInsecureSsl = true): Promise<boolean> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      reject(new Error(`Invalid URL: ${url}`));
      return;
    }
    const transport = parsedUrl.protocol === "https:" ? https : http;

    const req = transport.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        timeout: 30_000,
        rejectUnauthorized: !allowInsecureSsl,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          resolve(res.statusCode === 200);
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timeout"));
    });
    req.write(body);
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
