import { createMarkdownApi } from "./lib/core.js";
import * as portable from "./lib/portable.js";

export { MarkdownSyntaxError } from "./lib/core.js";

export class InkspanError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = "InkspanError";
    this.code = code;
  }
}

function record(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function wasmEnabled(options) {
  const issues = [];
  if (!record(options)) {
    issues.push("Pass an options object to `createInkspan()`.");
  } else {
    for (const key of Object.keys(options)) {
      if (key !== "experimental") issues.push(`Remove the unsupported option \`${key}\`.`);
    }
    if (options.experimental !== undefined) {
      if (!record(options.experimental)) {
        issues.push("Set `experimental` to an object containing `wasm`.");
      } else {
        for (const key of Object.keys(options.experimental)) {
          if (key !== "wasm") issues.push(`Remove the unsupported option \`experimental.${key}\`.`);
        }
        if (
          options.experimental.wasm !== undefined &&
          typeof options.experimental.wasm !== "boolean"
        ) {
          issues.push("Set `experimental.wasm` to `true` or `false`.");
        }
      }
    }
  }
  if (issues.length) {
    const message = issues.join(" ");
    throw new InkspanError("ERR_INKSPAN_OPTIONS", message, { cause: new TypeError(message) });
  }
  return options.experimental?.wasm === true;
}

export async function createInkspan(options = {}) {
  let accelerator = portable;
  if (wasmEnabled(options)) {
    try {
      const { createBrowserAccelerator } = await import("./lib/browser-wasm.js");
      accelerator = await createBrowserAccelerator();
    } catch (cause) {
      throw new InkspanError(
        "ERR_INKSPAN_WASM_INIT",
        "Could not initialize browser Wasm. Check `cause` and browser permissions, then retry `createInkspan()`, or set `experimental.wasm` to `false`.",
        { cause },
      );
    }
  }
  let api = createMarkdownApi(accelerator);
  function active() {
    if (api === null) {
      throw new InkspanError(
        "ERR_INKSPAN_DISPOSED",
        "This Inkspan instance was disposed. Call `createInkspan()` to create another parser.",
      );
    }
    return api;
  }
  return {
    parseMarkdownOutline: (source, options) => active().parseMarkdownOutline(source, options),
    parseMarkdownSections: (source, options) => active().parseMarkdownSections(source, options),
    indexMarkdown: (source, options) => active().indexMarkdown(source, options),
    dispose() {
      api = null;
      accelerator = null;
    },
  };
}
