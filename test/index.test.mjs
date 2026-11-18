import assert from "node:assert/strict";
import { test } from "node:test";
import { indexMarkdown, MarkdownSyntaxError } from "../index.js";

test("indexes real MDX elements in source order with JavaScript string offsets", () => {
  const source =
    '\uFEFF# 🌱\r\n\r\n<Outer data-x=">"><Inner /></Outer>\r\n\r\n`<Inner />`\r\n\r\n~~~md\r\n<Inner />\r\n~~~';
  const { components, codeBlocks } = indexMarkdown(source, {
    format: "mdx",
    components: true,
    codeBlocks: true,
  });
  assert.deepEqual(
    components.map((c) => [c.name, source.slice(c.start, c.end)]),
    [
      ["Outer", '<Outer data-x=">"><Inner /></Outer>'],
      ["Inner", "<Inner />"],
    ],
  );
  assert.deepEqual(
    codeBlocks.map((b) => [b.language, b.code, source.slice(b.start, b.end)]),
    [["md", "<Inner />", "~~~md\r\n<Inner />\r\n~~~"]],
  );
  assert.deepEqual(indexMarkdown(source, { format: "mdx", components: ["Inner"] }).components, [
    components[1],
  ]);
});

test("keeps JavaScript opaque and validates all MDX before returning an index", () => {
  const source =
    'import Widget from "./widget.js"\n\n{show && <Inside />}\n\n<Widget value={<InProp />} /><Widget />';
  const { components } = indexMarkdown(source, { format: "mdx", components: true });
  assert.deepEqual(
    components.map((n) => source.slice(n.start, n.end)),
    ["<Widget value={<InProp />} />", "<Widget />"],
  );
  assert.throws(
    () => indexMarkdown("<Widget/>\n\n{bad!", { format: "mdx", components: ["Absent"] }),
    MarkdownSyntaxError,
  );
  assert.throws(() => indexMarkdown("# Hi", { components: [""] }), TypeError);
});

test("distinguishes indented code from fences and keeps text extraction configurable", () => {
  const source =
    '# Read *this*\n\nSee [the guide](/guide) and ![a leaf](leaf.png).\n\n    indented\n\n~~~js title="demo"\nrun()\n~~~';
  const out = indexMarkdown(source);
  assert.deepEqual(out.codeBlocks, [
    {
      start: source.indexOf("~~~"),
      end: source.length,
      startLine: 7,
      endLine: 9,
      language: "js",
      meta: 'title="demo"',
      code: "run()",
    },
  ]);
  assert.equal(out.text, "Read this\nSee the guide and a leaf.");
  assert.equal(
    indexMarkdown(source, { text: { includeCode: true } }).text,
    "Read this\nSee the guide and a leaf.\nindented\nrun()",
  );
  assert.equal(indexMarkdown(source, { codeBlocks: true }).text, undefined);
});
