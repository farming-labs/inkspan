import type { parseMarkdownOutline, parseMarkdownSections, indexMarkdown } from "./index.js";

export { MarkdownSyntaxError } from "./index.js";

export interface InkspanOptions {
  experimental?: {
    /** Opt into browser Wasm initialization. Omitted or false uses JavaScript. */
    wasm?: boolean;
  };
}

export interface Inkspan {
  parseMarkdownOutline: typeof parseMarkdownOutline;
  parseMarkdownSections: typeof parseMarkdownSections;
  indexMarkdown: typeof indexMarkdown;
  /** Release this instance's engine references. Idempotent; later parsing throws. */
  dispose(): void;
}

export type InkspanErrorCode =
  | "ERR_INKSPAN_OPTIONS"
  | "ERR_INKSPAN_WASM_INIT"
  | "ERR_INKSPAN_DISPOSED";

export class InkspanError extends Error {
  constructor(code: InkspanErrorCode, message: string, options?: { cause?: unknown });
  readonly code: InkspanErrorCode;
}

/** Initialize once, then parse synchronously. Each call creates an independent instance. */
export function createInkspan(options?: InkspanOptions): Promise<Inkspan>;
