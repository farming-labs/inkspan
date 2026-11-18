import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = fileURLToPath(import.meta.url);
const [mode, ...args] = process.argv.slice(2);
function cases(spec) {
  const inputs = [];
  const blocks = [
    "Ordinary words, numbers 123 and *formatting*.\nMore prose.",
    "import { Widget } from './widget.js'",
    "import { Broken + } from './invalid.js'",
    "import { X } from 'a'\nimport { X } from 'b'",
    "{VALUE}",
    "{let}",
    '{"a string"}',
    "# Guide",
    "# \u00e9 and 42",
    "# #hash",
    "## [linked title][ref]",
    "[ref]: /target\nTitle\n===",
    "~~~md\n# Code\n~~~",
    "```md\n# Code\n        ```\n## Next",
    "````md\n```\n# Code\n````",
    "- `code`\n- More prose",
    "- # Nested",
    "1. - # Nested",
    "> ## Quoted",
    "    # Indented",
    "| Heading | Name |\n| --- | --- |\n| example | one |\n| # Hidden | two |",
    "| Name |\n| --- |\n| {missing |",
    "Hello\r\n\r\n## Windows",
    "Hello\r\r## Old Mac",
    "# \uD800",
    "## \u{1F331} Café",
    "Title\n---",
    "<Box x={items.map(f)} />",
    "<!-- comment -->",
  ];
  const contexts = [
    (s) => s,
    (s) => "# Before\n\n" + s + "\n\n## After",
    (s) => "<Widget>\n\n" + s + "\n\n</Widget>\n\n# End",
    (s) => "<Hidden>\n\n" + s + "\n\n</Hidden>",
    (s) => '<Box title="\n\n' + s + '\n\n" />\n\n# End',
    (s) => "export const value = `\n\n" + s + "\n\n`\n\n# End",
    (s) => "````md\n" + s + "\n````\n\n# End",
    (s) => ["> Intro", ...s.split("\n").map((line) => "> " + line), "", "# End"].join("\n"),
  ];
  for (const format of ["md", "mdx"])
    for (const context of contexts)
      for (const block of blocks) {
        inputs.push([format, context(block)]);
      }
  if (spec)
    for (const { markdown } of JSON.parse(readFileSync(spec, "utf8"))) {
      inputs.push(["md", markdown], ["md", "# " + markdown.trim().replace(/[\r\n]+/g, " ")]);
    }
  return inputs;
}

if (mode === "worker") {
  const [entry, spec] = args;
  const api = await import(pathToFileURL(resolve(entry)));
  const outputs = cases(spec).map(([format, source]) => {
    const options = { format, ignoreElements: ["Hidden"] };
    function capture(run) {
      try {
        return run();
      } catch (error) {
        if (error.code !== "ERR_MARKDOWN_SYNTAX") throw error;
        return {
          code: error.code,
          reason: error.cause.reason,
          line: error.cause.line,
          column: error.cause.column,
        };
      }
    }
    return [
      capture(() => api.parseMarkdownOutline(source, options)),
      capture(() => api.parseMarkdownSections(source, options)),
      capture(() => api.indexMarkdown(source, { format, components: true, codeBlocks: true })),
    ];
  });
  process.stdout.write(JSON.stringify(outputs));
} else {
  const [
    spec,
    candidate = fileURLToPath(new URL("../index.js", import.meta.url)),
    reference = candidate,
  ] = process.argv.slice(2);
  const run = (entry, conditions) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [...conditions, here, "worker", entry, ...(spec ? [spec] : [])],
        { maxBuffer: 32 * 1024 * 1024 },
      ),
    );
  const expected = run(reference, ["--conditions=workerd"]),
    actual = run(candidate, []);
  const inputs = cases(spec);
  for (let i = 0; i < inputs.length; i++)
    assert.deepStrictEqual(actual[i], expected[i], JSON.stringify(inputs[i]));
  console.log(
    inputs.length +
      " inputs matched on outlines, sections, component/fence indexes and syntax diagnostics.",
  );
}
