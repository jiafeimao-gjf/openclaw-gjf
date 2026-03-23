/**
 * WebSocket runtime boundary — dynamically imports the `ws` library.
 * This file is the single canonical dynamic-import site for `ws`.
 */

let wsModule: typeof import("ws") | null = null;

export async function getWsModule(): Promise<typeof import("ws")> {
  if (!wsModule) {
    wsModule = await import("ws");
  }
  return wsModule;
}
