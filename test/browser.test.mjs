import assert from "node:assert/strict";
import { test } from "node:test";
import { createInkspan, InkspanError, MarkdownSyntaxError } from "../browser.js";
import { MarkdownSyntaxError as RootSyntaxError } from "../index.js";

const source =
  "# Guide 🌱\r\n\r\n<Example>\r\n\r\n## Install\r\n\r\n</Example>\r\n\r\n~~~js\r\nrun()\r\n~~~";

test("browser Wasm matches portable parsing and keeps operations synchronous", async () => {
  const js = await createInkspan();
  const wasm = await createInkspan({ experimental: { wasm: true } });
  try {
    for (const value of [
      source,
      "# Café\n\n<Widget items={rows.map(row => row.id)} />",
      "# a\uD800",
    ]) {
      for (const method of ["parseMarkdownSections", "parseMarkdownOutline", "indexMarkdown"]) {
        for (const options of [
          { format: "mdx" },
          { format: "mdx", components: true, codeBlocks: true },
        ]) {
          const actual = wasm[method](value, options);
          assert.equal(actual instanceof Promise, false);
          assert.deepEqual(actual, js[method](value, options));
        }
      }
    }
    assert.equal(MarkdownSyntaxError, RootSyntaxError);
    assert.throws(() => wasm.indexMarkdown("{let}", { format: "mdx" }), RootSyntaxError);
  } finally {
    js.dispose();
    wasm.dispose();
  }
});

test("Wasm instances initialize concurrently and dispose independently", async (context) => {
  const instantiate = context.mock.method(WebAssembly, "instantiate");
  const parsers = await Promise.all(
    Array.from({ length: 3 }, () => createInkspan({ experimental: { wasm: true } })),
  );
  assert.equal(instantiate.mock.calls.length, 3);
  const instances = await Promise.all(instantiate.mock.calls.map((call) => call.result));
  assert.equal(new Set(instances.map(({ instance }) => instance.exports.memory)).size, 3);
  const retained = parsers[0].parseMarkdownSections;
  parsers[0].dispose();
  parsers[0].dispose();
  assert.throws(() => retained(source), { code: "ERR_INKSPAN_DISPOSED" });
  for (const parser of parsers.slice(1)) {
    assert.equal(parser.parseMarkdownSections(source, { format: "mdx" })[1].title, "Install");
    parser.dispose();
  }
});

test("missing browser decompression support rejects without poisoning later initialization", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "DecompressionStream");
  Object.defineProperty(globalThis, "DecompressionStream", {
    configurable: true,
    value: undefined,
  });
  try {
    await assert.rejects(createInkspan({ experimental: { wasm: true } }), (error) => {
      assert.equal(error.code, "ERR_INKSPAN_WASM_INIT");
      assert.match(error.cause.message, /DecompressionStream/);
      return true;
    });
  } finally {
    Object.defineProperty(globalThis, "DecompressionStream", descriptor);
  }
  const parser = await createInkspan({ experimental: { wasm: true } });
  assert.equal(
    parser.indexMarkdown(source, { format: "mdx", components: true }).components.length,
    1,
  );
  parser.dispose();
});

test("disabled factories work without Wasm and initialization errors retain their cause and permit retry", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "WebAssembly");
  Object.defineProperty(globalThis, "WebAssembly", { configurable: true, value: undefined });
  try {
    for (const options of [
      undefined,
      {},
      { experimental: {} },
      { experimental: { wasm: false } },
    ]) {
      const parser = await createInkspan(options);
      assert.equal(parser.parseMarkdownSections("# Guide")[0].title, "Guide");
      parser.dispose();
      for (const method of ["parseMarkdownSections", "parseMarkdownOutline", "indexMarkdown"]) {
        assert.throws(() => parser[method](source), { code: "ERR_INKSPAN_DISPOSED" });
      }
    }
    await assert.rejects(createInkspan({ experimental: { wasm: true } }), (error) => {
      assert.ok(error instanceof InkspanError);
      assert.equal(error.code, "ERR_INKSPAN_WASM_INIT");
      assert.ok(error.cause instanceof Error);
      assert.match(error.message, /experimental\.wasm/);
      return true;
    });
  } finally {
    Object.defineProperty(globalThis, "WebAssembly", descriptor);
  }
  const parser = await createInkspan({ experimental: { wasm: true } });
  assert.equal(parser.parseMarkdownSections(source, { format: "mdx" }).length, 2);
  parser.dispose();
});

test("invalid browser options reject instead of silently disabling acceleration", async () => {
  for (const options of [
    null,
    true,
    [],
    { wasm: true },
    { experimental: null },
    { experimental: [] },
    { experimental: { wasm: "enabled" } },
    { experimental: { unknown: true } },
  ]) {
    await assert.rejects(createInkspan(options), { code: "ERR_INKSPAN_OPTIONS" });
  }
});
