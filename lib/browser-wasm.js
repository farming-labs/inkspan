import bytes from "../generated/engine-bytes.js";
import { createEngine } from "../generated/engine-factory.js";
import { createAccelerator } from "./accelerator.js";

export async function createBrowserAccelerator() {
  if (typeof globalThis.WebAssembly?.instantiate !== "function") {
    throw new Error(
      "WebAssembly is unavailable. Enable browser WebAssembly support or use the JavaScript parser.",
    );
  }
  if (typeof globalThis.DecompressionStream !== "function") {
    throw new Error(
      "`DecompressionStream` is unavailable. Use a browser with gzip decompression support or the JavaScript parser.",
    );
  }
  const binary = atob(bytes);
  const compressed = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) compressed[i] = binary.charCodeAt(i);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
  const module = await new Response(stream).arrayBuffer();
  const engine = createEngine();
  await engine.init({ module_or_path: module });
  return createAccelerator(engine);
}
