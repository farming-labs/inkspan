# Inkspan

**Index Markdown sections, MDX components, and fenced code with exact source ranges.**

Inkspan is a synchronous ESM library with a Rust WebAssembly engine for Node and a bundled JavaScript parser for browsers and edge runtimes. The package has zero runtime npm dependencies. It reads authored source. Rendering MDX and executing its JavaScript are outside its scope.

## Install

```sh
npm install inkspan
```

Versions through `0.1.0-beta.3` were published as `@farming-labs/inkspan`. To migrate, replace that name with `inkspan` in `package.json` and imports. The API is the same.

The package includes the built engine, parser, and TypeScript declarations. Installation requires Node 20 or later and works with lifecycle scripts disabled.

## Find sections

```js
import { parseMarkdownSections } from "inkspan";

const source = "# Guide\n\n## Install\nRun npm install.\n\n# Reference";
const [, install] = parseMarkdownSections(source);
console.log(install.title); // Install
console.log(install.startLine); // 3
console.log(install.endLine); // 5
console.log(install.content); // "## Install\nRun npm install.\n\n"
```

Sections include their nested subsections. Lines are 1-based and inclusive. Source slices retain whitespace and line endings. Pass the body when your application handles frontmatter separately. Use `{ format: "mdx", ignoreElements: ["ExampleSource"] }` to skip headings inside example components. For custom anchors, `parseMarkdownOutline(source, options)` returns heading nodes and reference definitions in document order.

## Find components, code, and text

```js
import { indexMarkdown } from "inkspan";

const source = "# Demo 🌱\n\n<Example>Copy me.</Example>";
const { components } = indexMarkdown(source, {
  format: "mdx",
  components: ["Example"],
});
const [example] = components;
console.log(source.slice(example.start, example.end)); // <Example>Copy me.</Example>
```

| Selection                               | Result                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components: true` or an array of names | Complete named Markdown-level JSX elements in source order. Offsets are half-open UTF-16 positions for JavaScript's `slice`. JavaScript expressions and ESM are opaque.  |
| `codeBlocks: true`                      | Fenced code with source offsets, inclusive line numbers, language, metadata, and parsed code.                                                                            |
| `text: true`                            | Readable text, including inline code, image alt text, and text inside Markdown-level components. Block code is omitted. Use `text: { includeCode: true }` to include it. |

With no selections, all three are returned. With explicit selections, unselected arrays are empty and unselected text is absent. The default format is GitHub Flavored Markdown. Use `format: "mdx"` for JSX. Invalid MDX throws `MarkdownSyntaxError` with code `ERR_MARKDOWN_SYNTAX` and the parser diagnostic in `cause`.

## Opt into browser Wasm

The browser default uses JavaScript. For sustained structural indexing, the experimental browser entry can initialize a separate Wasm parser:

```js
import { createInkspan } from "inkspan/browser";

const parser = await createInkspan({ experimental: { wasm: true } });
try {
  const sections = parser.parseMarkdownSections(source);
  const index = parser.indexMarkdown(source, { format: "mdx", components: true });
} finally {
  parser.dispose();
}
```

Initialization is asynchronous; `parseMarkdownSections`, `parseMarkdownOutline`, and `indexMarkdown` stay synchronous. Each factory call owns an independent parser. `dispose()` is idempotent and releases that instance's engine references; later parsing throws `InkspanError` with code `ERR_INKSPAN_DISPOSED`. ESM code remains cached, and garbage collection is controlled by the runtime.

`createInkspan()`, `{ experimental: {} }`, and `{ experimental: { wasm: false } }` use JavaScript without initializing Wasm. Existing root imports keep their current defaults. The Wasm loader and compressed bytes load through a dynamic import; enable ESM code splitting in your bundler to defer that chunk's download. The package has no separate Wasm URL to configure and adds no runtime npm dependencies.

The opt-in needs WebAssembly and browser APIs including [`DecompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream). A site's Content Security Policy must permit Wasm compilation. Initialization failures reject with `InkspanError`, code `ERR_INKSPAN_WASM_INIT`, and the original error in `cause`; they never silently select JavaScript. After fixing an engine initialization failure, call `createInkspan()` again. Reload the page after CSP changes or a failed module download cached by the browser. To explicitly choose JavaScript, omit the flag or set it to `false`. Invalid factory options reject with `ERR_INKSPAN_OPTIONS`.

Complex MDX and readable text still use the bundled JavaScript parser, preserving syntax diagnostics and `MarkdownSyntaxError` identity. Wasm is intended for repeated structural work, not an unconditional speed improvement. Edge runtimes retain their current JavaScript default; this opt-in is not an edge deployment compatibility claim. [Design and verification](./docs/browser-wasm.md).

## Performance and development

On the 53-page Farming Labs corpus, section extraction was **4.18× faster on human pages** and **4.03× faster on agent sidecars** than the portable JavaScript implementation. The measured small JSX expression took 21.3 ms on Node and 12.9 ms with the portable parser. [Benchmark results and reproduction](https://github.com/farming-labs/inkspan/blob/main/docs/benchmarks.md).

Node uses Rust for eligible outlines, components, and fences. Complex syntax and readable-text requests use the reference parser. A small literal heading can return before Wasm initialization. Default browser and edge imports use the portable parser.

Run a cold-process comparison on your own corpus with `node benchmark/corpus.mjs ./content sections` or `node benchmark/corpus.mjs ./content components`. Both run nine samples after a warmup, alternate order, compare the full output, and report median, p95, and an independent baseline control. The output reports syntax errors for locally extended dialects.

Run `pnpm install --frozen-lockfile` and `pnpm test` for the Node and portable test suites. Run `node benchmark/check-parity.mjs` for differential fixtures. Pass a CommonMark specification JSON file for the extended suite. Use `pnpm build:reference` to rebuild the bundled parser. To rebuild Wasm, install Rust 1.99.1 with the `wasm32-unknown-unknown` target and `wasm-bindgen-cli` 0.2.128, then run `pnpm build:wasm`.

Maintainers can follow the [npm publishing guide](docs/publishing.md) to configure trusted publishing and release a tested tarball.
