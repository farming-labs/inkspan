import referenceParser from "../generated/reference.js";

function validateImportBlock(value) {
  try {
    const { children } = referenceParser("mdx").parse(value);
    return children.length === 1 && children[0].type === "mdxjsEsm" && children[0].value === value;
  } catch (error) {
    if (typeof error?.reason === "string") return false;
    throw error;
  }
}

export class MarkdownSyntaxError extends SyntaxError {
  code = "ERR_MARKDOWN_SYNTAX";

  constructor(cause) {
    super(cause.message, { cause });
    this.name = "MarkdownSyntaxError";
  }
}

function parseReference(source, format) {
  try {
    return referenceParser(format).parse(source);
  } catch (cause) {
    if (typeof cause?.reason === "string") throw new MarkdownSyntaxError(cause);
    throw cause;
  }
}

function referenceOutline(source, format, ignoreElements) {
  const root = parseReference(source, format);
  const outline = [];
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (
      (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
      ignoreElements.includes(node.name)
    )
      continue;
    if (node.type === "heading" || node.type === "definition") {
      outline.push(node);
    } else if (node.children) {
      for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
    }
  }
  return outline;
}

// Offsets differ between a UTF-8 parser and JavaScript. The public outline exposes line numbers.
function inlineNode(node) {
  const result = { type: node.type };
  for (const key of ["value", "alt", "identifier", "label", "referenceType"]) {
    if (typeof node[key] === "string") result[key] = node[key];
  }
  if (node.children) result.children = node.children.map(inlineNode);
  return result;
}

export function parseMarkdownOutline(accelerator, source, options = {}) {
  if (typeof source !== "string") throw new TypeError("Pass a Markdown string as `source`.");
  const { format = "md", ignoreElements = [] } = options;
  if (format !== "md" && format !== "mdx") throw new TypeError('Set `format` to "md" or "mdx".');
  if (
    !Array.isArray(ignoreElements) ||
    !ignoreElements.every((name) => typeof name === "string" && name.length > 0)
  ) {
    throw new TypeError("Pass an array of component names as `ignoreElements`.");
  }
  const nodes =
    accelerator.acceleratedOutline(source, format === "mdx", ignoreElements, validateImportBlock) ??
    referenceOutline(source, format, ignoreElements);
  return nodes.map((node) =>
    node.type === "definition"
      ? { type: "definition", identifier: node.identifier }
      : {
          type: "heading",
          depth: node.depth,
          position: { start: { line: node.position.start.line } },
          children: node.children.map(inlineNode),
        },
  );
}

function headingText(node) {
  if (node.children) return node.children.map(headingText).join("");
  if (node.type === "html") return "";
  return node.alt ?? node.value ?? "";
}

export function parseMarkdownSections(accelerator, source, options) {
  const outline = parseMarkdownOutline(accelerator, source, options);
  const starts = [0];
  for (const match of source.matchAll(/\r\n|[\r\n]/g)) starts.push(match.index + match[0].length);
  const sections = [];
  const open = [];
  for (const node of outline) {
    if (node.type !== "heading") continue;
    const startLine = node.position.start.line;
    while (open.length && open.at(-1).depth >= node.depth) {
      open.pop().endLine = startLine - 1;
    }
    const section = {
      title: headingText(node).replace(/\s+/gu, " ").trim(),
      depth: node.depth,
      startLine,
      endLine: starts.length,
      content: "",
    };
    sections.push(section);
    open.push(section);
  }
  for (const section of sections) {
    section.content = source.slice(
      starts[section.startLine - 1],
      starts[section.endLine] ?? source.length,
    );
  }
  return sections;
}

function indexedText(root, includeCode) {
  const chunks = [];
  function visit(node) {
    if (
      ["mdxjsEsm", "mdxFlowExpression", "mdxTextExpression", "html", "definition", "yaml"].includes(
        node.type,
      )
    )
      return;
    if (node.type === "code") {
      if (includeCode) chunks.push(node.value, "\n");
      return;
    }
    if (node.type === "break") {
      chunks.push("\n");
      return;
    }
    if (node.type === "text" || node.type === "inlineCode") {
      chunks.push(node.value);
      return;
    }
    if (node.type === "image" || node.type === "imageReference") {
      chunks.push(node.alt ?? "");
      return;
    }
    for (const child of node.children ?? []) visit(child);
    if (["paragraph", "heading", "listItem", "tableRow", "blockquote"].includes(node.type))
      chunks.push("\n");
    if (node.type === "tableCell") chunks.push(" ");
  }
  visit(root);
  return chunks
    .join("")
    .split(/[\r\n]+/)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function indexMarkdown(accelerator, source, options = {}) {
  if (typeof source !== "string") throw new TypeError("Pass a Markdown string as `source`.");
  const { format = "md", components, codeBlocks, text } = options;
  if (format !== "md" && format !== "mdx") throw new TypeError('Set `format` to "md" or "mdx".');
  const defaults = components === undefined && codeBlocks === undefined && text === undefined;
  if (
    components !== undefined &&
    typeof components !== "boolean" &&
    !(
      Array.isArray(components) &&
      Array.from(components).every((n) => typeof n === "string" && n.length > 0)
    )
  )
    throw new TypeError("Pass component names or a boolean as `components`.");
  if (codeBlocks !== undefined && typeof codeBlocks !== "boolean")
    throw new TypeError("Pass a boolean as `codeBlocks`.");
  if (
    text !== undefined &&
    typeof text !== "boolean" &&
    !(
      text &&
      typeof text === "object" &&
      !Array.isArray(text) &&
      (text.includeCode === undefined || typeof text.includeCode === "boolean")
    )
  )
    throw new TypeError("Set `text` to a boolean or an object with a boolean `includeCode`.");
  const names = Array.isArray(components) ? components : [];
  const wantComponents = format === "mdx" && (defaults || components === true || names.length > 0);
  const wantCode = codeBlocks ?? defaults;
  const wantText = text ?? defaults;
  if (!wantText) {
    const fast = accelerator.acceleratedIndex(
      source,
      format === "mdx",
      wantComponents,
      names,
      wantCode,
      validateImportBlock,
    );
    if (fast !== undefined) return fast;
  }
  const bom = source.startsWith("\uFEFF") ? 1 : 0;
  const root = parseReference(source.slice(bom), format);
  const result = { components: [], codeBlocks: [] };
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (
      wantComponents &&
      (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") &&
      node.name &&
      (!names.length || names.includes(node.name))
    ) {
      result.components.push({
        name: node.name,
        start: node.position.start.offset + bom,
        end: node.position.end.offset + bom,
      });
    }
    if (wantCode && node.type === "code") {
      const start = node.position.start.offset + bom,
        end = node.position.end.offset + bom;
      if (source.startsWith("```", start) || source.startsWith("~~~", start))
        result.codeBlocks.push({
          start,
          end,
          startLine: node.position.start.line,
          endLine: node.position.end.line,
          language: node.lang ?? null,
          meta: node.meta ?? null,
          code: node.value,
        });
    }
    if (node.children)
      for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
  }
  if (wantText)
    result.text = indexedText(root, typeof wantText === "object" && wantText.includeCode === true);
  return result;
}

export function createMarkdownApi(accelerator) {
  return {
    parseMarkdownOutline: (source, options) => parseMarkdownOutline(accelerator, source, options),
    parseMarkdownSections: (source, options) => parseMarkdownSections(accelerator, source, options),
    indexMarkdown: (source, options) => indexMarkdown(accelerator, source, options),
  };
}
