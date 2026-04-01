import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

const { setRuntime: setFlyChannelRuntime, getRuntime: getFlyChannelRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Fly runtime not initialized");
export { getFlyChannelRuntime, setFlyChannelRuntime };
