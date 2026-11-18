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
console.log("Packed ESM entry passed.");
