import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "../api.js";

const { setRuntime: setFlyChatRuntime, getRuntime: getFlyChatRuntime } =
  createPluginRuntimeStore<PluginRuntime>(
    "fly-chat runtime not initialized - plugin not registered",
  );
export { getFlyChatRuntime, setFlyChatRuntime };
