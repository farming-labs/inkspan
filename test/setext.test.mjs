import assert from "node:assert/strict";
import { test } from "node:test";
import * as root from "../index.js";
import { createInkspan } from "../browser.js";

test("reports the reference diagnostic for unclosed JSX in Setext headings", async () => {
  const portable = await createInkspan();
  const wasm = await createInkspan({ experimental: { wasm: true } });
  try {
    for (const source of [
      "text <b>\n---",
      "text <b>\r\nTitle\r\n=\t",
      "> text <Widget>\r> --",
      "- text <>\n  Title\n  ===",
    ]) {
      const options = { format: "mdx", components: true, codeBlocks: true };
      for (const method of ["parseMarkdownOutline", "parseMarkdownSections", "indexMarkdown"]) {
        let expected;
        assert.throws(
          () => portable[method](source, options),
          (error) => {
            assert.ok(error instanceof root.MarkdownSyntaxError);
            expected = error.cause;
            return true;
          },
        );
        for (const parser of [root, wasm]) {
          assert.throws(
            () => parser[method](source, options),
            (error) => {
              assert.ok(error instanceof root.MarkdownSyntaxError, String(error));
              for (const key of ["reason", "line", "column"]) {
                assert.equal(error.cause[key], expected[key]);
              }
              return true;
            },
          );
        }
      }
    }
    const valid = "text <b>Title</b>\n---\n\n## Next";
    for (const parser of [root, wasm]) {
      assert.deepEqual(
        parser.parseMarkdownSections(valid, { format: "mdx" }),
        portable.parseMarkdownSections(valid, { format: "mdx" }),
      );
    }
  } finally {
    portable.dispose();
    wasm.dispose();
  }
});
