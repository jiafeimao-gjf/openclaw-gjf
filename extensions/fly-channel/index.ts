import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { flyPlugin } from "./src/channel.js";
import { setFlyChannelRuntime } from "./src/runtime.js";

export { flyPlugin } from "./src/channel.js";
export { setFlyChannelRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "fly-channel",
  name: "Fly",
  description: "Fly custom channel plugin",
  plugin: flyPlugin,
  setRuntime: setFlyChannelRuntime,
});
