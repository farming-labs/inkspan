import * as accelerator from "#accelerator";
import {
  parseMarkdownOutline as outline,
  parseMarkdownSections as sections,
  indexMarkdown as index,
} from "./lib/core.js";

export { MarkdownSyntaxError } from "./lib/core.js";
export function parseMarkdownOutline(source, options = {}) {
  return outline(accelerator, source, options);
}

export function parseMarkdownSections(source, options) {
  return sections(accelerator, source, options);
}

export function indexMarkdown(source, options = {}) {
  return index(accelerator, source, options);
}
