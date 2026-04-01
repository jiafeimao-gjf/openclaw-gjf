import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";

// Use unknown as runtime type since Fly doesn't need the full PluginRuntime
const { setRuntime: setFlyChannelRuntime, getRuntime: getFlyChannelRuntime } =
  createPluginRuntimeStore<unknown>("Fly runtime not initialized");
export { getFlyChannelRuntime, setFlyChannelRuntime };
