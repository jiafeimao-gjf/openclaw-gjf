import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { flyChatPlugin } from "./src/channel.js";
import { setFlyChatRuntime } from "./src/runtime.js";

export { flyChatPlugin } from "./src/channel.js";
export { setFlyChatRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "fly-chat",
  name: "fly-chat",
  description: "fly-chat channel plugin for OpenClaw",
  plugin: flyChatPlugin,
  setRuntime: setFlyChatRuntime,
});
