export interface MarkdownSectionOptions {
  /** GitHub Flavored Markdown by default. */
  format?: "md" | "mdx";
  /** Skip headings and reference definitions inside these MDX components. */
  ignoreElements?: readonly string[];
}

export interface MarkdownInlineNode {
  type: string;
  value?: string;
  alt?: string;
  identifier?: string;
  label?: string;
  referenceType?: string;
  children?: MarkdownInlineNode[];
}

export type MarkdownOutlineNode =
  | { type: "definition"; identifier: string }
  | {
      type: "heading";
      depth: number;
      position: { start: { line: number } };
      children: MarkdownInlineNode[];
    };

export interface MarkdownSection {
  title: string;
  depth: number;
  /** 1-based inclusive source lines. */
  startLine: number;
  endLine: number;
  /** Exact source slice, including the heading and nested subsections. */
  content: string;
}

export class MarkdownSyntaxError extends SyntaxError {
  constructor(cause: Error);
  readonly code: "ERR_MARKDOWN_SYNTAX";
}

export function parseMarkdownOutline(
  source: string,
  options?: MarkdownSectionOptions,
): MarkdownOutlineNode[];
export function parseMarkdownSections(
  source: string,
  options?: MarkdownSectionOptions,
): MarkdownSection[];

export interface MarkdownIndexOptions {
  format?: "md" | "mdx";
  components?: boolean | readonly string[];
  codeBlocks?: boolean;
  text?: boolean | { includeCode?: boolean };
}
export interface MdxComponentSpan {
  name: string;
  /** Half-open UTF-16 offsets suitable for source.slice(start, end). */
  start: number;
  end: number;
}
export interface MarkdownCodeBlock {
  start: number;
  end: number;
  startLine: number;
  endLine: number;
  language: string | null;
  meta: string | null;
  code: string;
}
export interface MarkdownIndex {
  components: MdxComponentSpan[];
  codeBlocks: MarkdownCodeBlock[];
  text?: string;
}
export function indexMarkdown(source: string, options?: MarkdownIndexOptions): MarkdownIndex;
