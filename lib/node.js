import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import bytes from "../generated/engine-bytes.js";
import { initSync, outline, structural_index } from "../generated/engine.js";
import { createAccelerator } from "./accelerator.js";

function initialize() {
  initSync({ module: gunzipSync(Buffer.from(bytes, "base64")) });
}

export const { acceleratedIndex, acceleratedOutline } = createAccelerator(
  { outline, structural_index },
  initialize,
);
