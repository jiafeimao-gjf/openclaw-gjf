import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { flyChatPlugin } from "./src/channel.js";

export default defineSetupPluginEntry(flyChatPlugin);
