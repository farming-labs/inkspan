import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMarkdownOutline, parseMarkdownSections, MarkdownSyntaxError } from "../index.js";

test("preserves nested source ranges and original line endings", () => {
  const source = "# Parent\r\n\r\n## Child\r\nbody\r\n\r\nNext\r\n====";
  assert.deepEqual(parseMarkdownSections(source), [
    {
      title: "Parent",
      depth: 1,
      startLine: 1,
      endLine: 5,
      content: "# Parent\r\n\r\n## Child\r\nbody\r\n\r\n",
    },
    { title: "Child", depth: 2, startLine: 3, endLine: 5, content: "## Child\r\nbody\r\n\r\n" },
    { title: "Next", depth: 1, startLine: 6, endLine: 7, content: "Next\r\n====" },
  ]);
});

test("preserves authored heading order, inline labels, GFM and literal fences", () => {
  const source =
    "# ~~Old~~ [link][ref] ![pic](image.png)\n\n[ref]: https://example.org\n\n~~~md\n# Code\n~~~\n\n> ## Café 🎈\n\n# Café 🎈";
  const sections = parseMarkdownSections(source);
  assert.deepEqual(
    sections.map((s) => s.title),
    ["Old link pic", "Café 🎈", "Café 🎈"],
  );
  assert.ok(
    parseMarkdownOutline(source).some((n) => n.type === "definition" && n.identifier === "ref"),
  );
});

test("skips only requested MDX components and retains JavaScript syntax semantics", () => {
  const component =
    '<Tabs items={["a", "b"]}>\n\n## Tab\n\n</Tabs>\n\n<Literal>\n\n# Hidden\n\n</Literal>';
  for (const prefix of [
    "",
    "export const tabs = ['a']\n\n",
    "<Other x={items.map(x => x.name)} />\n\n",
  ]) {
    assert.deepEqual(
      parseMarkdownSections(prefix + component, { format: "mdx", ignoreElements: ["Literal"] }).map(
        (s) => s.title,
      ),
      ["Tab"],
    );
    assert.deepEqual(
      parseMarkdownSections(prefix + component, { format: "mdx" }).map((s) => s.title),
      ["Tab", "Hidden"],
    );
  }
  assert.throws(
    () => parseMarkdownSections("## OK\n\n{", { format: "mdx" }),
    (error) =>
      error instanceof MarkdownSyntaxError &&
      error.code === "ERR_MARKDOWN_SYNTAX" &&
      Boolean(error.cause),
  );
});

test("validates options and retains lone UTF-16 surrogates", () => {
  assert.equal(parseMarkdownSections("# a\uD800")[0].title, "a\uD800");
  assert.throws(() => parseMarkdownSections(null), TypeError);
  assert.throws(() => parseMarkdownSections("", { format: "html" }), /format/);
  assert.throws(() => parseMarkdownOutline("", { ignoreElements: [""] }), /ignoreElements/);
});

test("preserves reference label whitespace and the reference parser's Setext source range", () => {
  const outline = parseMarkdownOutline("[Two words]: /url\n\n# [Heading][Two words]");
  assert.equal(outline[0].identifier, "two words");
  assert.equal(outline[1].children[0].identifier, "two words");
  const [section] = parseMarkdownSections("[foo]: /url\nbar\n===\n[foo]\n");
  assert.equal(section.startLine, 1);
  assert.equal(section.title, "bar");
});

test("retains literal leading hashes, nested image labels and escaped email links", () => {
  assert.equal(parseMarkdownSections("> ##  #hashtag")[0].title, "#hashtag");
  assert.equal(parseMarkdownSections("# ![foo ![bar](/url)](/url2)")[0].title, "foo bar");
  assert.equal(parseMarkdownOutline("# <foo\\+@bar.example.com>")[0].children[1].type, "link");
});

test("keeps Markdown and MDX fence indentation rules distinct", () => {
  const source = "# Start\n\n```sh\ncommand\n        ```\n## Visible in MDX";
  assert.deepEqual(
    parseMarkdownSections(source, { format: "mdx" }).map((s) => s.title),
    ["Start", "Visible in MDX"],
  );
  assert.deepEqual(
    parseMarkdownSections(source).map((s) => s.title),
    ["Start"],
  );
});

test("preserves import diagnostics and validates expressions inside ignored components", () => {
  const valid = 'import { Item } from "./item.js"\n\n# Guide\n\n<Item>{"Text"}</Item>';
  assert.equal(parseMarkdownSections(valid, { format: "mdx" })[0].title, "Guide");
  for (const source of [
    'import { 3 } from "./item.js"\n\n# Guide',
    "<Hidden>\n\n{let}\n\n</Hidden>",
  ]) {
    assert.throws(
      () => parseMarkdownOutline(source, { format: "mdx", ignoreElements: ["Hidden"] }),
      MarkdownSyntaxError,
    );
  }
});

test("keeps source inside JSX attributes and literal fences opaque", () => {
  const source =
    '<Box title="\n\nOrdinary prose here.\n\n```md\n# Inside attribute\n```\n\n">\n\n# Visible\n\n</Box>\n\n# End';
  assert.deepEqual(
    parseMarkdownSections(source, { format: "mdx" }).map((s) => s.title),
    ["Visible", "End"],
  );
});
