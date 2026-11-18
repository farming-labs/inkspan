import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const consumer = createRequire(resolve(process.argv[2] ?? ".", "package.json"));
const { indexMarkdown, parseMarkdownSections, parseMarkdownOutline, MarkdownSyntaxError } =
  await import(pathToFileURL(consumer.resolve("@farming-labs/inkspan")));
const source = "# Guide 🌱\r\n\r\n<Example>\r\n\r\n## Install\r\n\r\n</Example>";
const options = { format: "mdx" };
const index = indexMarkdown(source, { ...options, components: ["Example"] });
assert.equal(
  source.slice(index.components[0].start, index.components[0].end),
  source.slice(source.indexOf("<")),
);
assert.equal(parseMarkdownSections(source, options)[1].startLine, 5);
assert.equal(parseMarkdownOutline(source, { ...options, ignoreElements: ["Example"] }).length, 1);
assert.throws(() => indexMarkdown("{", options), MarkdownSyntaxError);
const browser = await import(pathToFileURL(consumer.resolve("@farming-labs/inkspan/browser")));
assert.equal(browser.MarkdownSyntaxError, MarkdownSyntaxError);
for (const wasm of [false, true]) {
  const parser = await browser.createInkspan({ experimental: { wasm } });
  try {
    assert.deepEqual(
      parser.parseMarkdownSections(source, options),
      parseMarkdownSections(source, options),
    );
    assert.deepEqual(parser.indexMarkdown(source, { ...options, components: ["Example"] }), index);
    assert.throws(() => parser.indexMarkdown("{", options), MarkdownSyntaxError);
  } finally {
    parser.dispose();
  }
  assert.throws(() => parser.parseMarkdownSections(source), { code: "ERR_INKSPAN_DISPOSED" });
}
console.log("Packed root and browser ESM entries passed.");
