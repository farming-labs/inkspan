# Inkspan

**Index Markdown sections, MDX components, and fenced code with exact source ranges.**

Inkspan is a synchronous ESM library with a Rust WebAssembly engine for Node and a bundled JavaScript parser for browsers and edge runtimes. The package has zero runtime npm dependencies. It reads authored source. Rendering MDX and executing its JavaScript are outside its scope.

## Install

The beta is available from this repository. To create and install the npm tarball, run:

```sh
git clone https://github.com/farming-labs/inkspan.git
cd inkspan
npm pack
# From your application, using the path to that checkout
npm install /path/to/inkspan/farming-labs-inkspan-0.1.0-beta.0.tgz
```

The package includes the built engine, parser, and TypeScript declarations. Installation requires Node 20 or later and works with lifecycle scripts disabled.

## Find sections

```js
import { parseMarkdownSections } from "@farming-labs/inkspan";

const source = "# Guide\n\n## Install\nRun npm install.\n\n# Reference";
const [, install] = parseMarkdownSections(source);
console.log(install.title);     // Install
console.log(install.startLine); // 3
console.log(install.endLine);   // 5
console.log(install.content);   // "## Install\nRun npm install.\n\n"
```

Sections include their nested subsections. Lines are 1-based and inclusive. Source slices retain whitespace and line endings. Pass the body when your application handles frontmatter separately. Use `{ format: "mdx", ignoreElements: ["ExampleSource"] }` to skip headings inside example components. For custom anchors, `parseMarkdownOutline(source, options)` returns heading nodes and reference definitions in document order.

## Find components, code, and text

```js
import { indexMarkdown } from "@farming-labs/inkspan";

const source = "# Demo 🌱\n\n<Example>Copy me.</Example>";
const { components } = indexMarkdown(source, {
  format: "mdx",
  components: ["Example"],
});
const [example] = components;
console.log(source.slice(example.start, example.end)); // <Example>Copy me.</Example>
```

| Selection | Result |
| --- | --- |
| `components: true` or an array of names | Complete named Markdown-level JSX elements in source order. Offsets are half-open UTF-16 positions for JavaScript's `slice`. JavaScript expressions and ESM are opaque. |
| `codeBlocks: true` | Fenced code with source offsets, inclusive line numbers, language, metadata, and parsed code. |
| `text: true` | Readable text, including inline code, image alt text, and text inside Markdown-level components. Block code is omitted. Use `text: { includeCode: true }` to include it. |

With no selections, all three are returned. With explicit selections, unselected arrays are empty and unselected text is absent. The default format is GitHub Flavored Markdown. Use `format: "mdx"` for JSX. Invalid MDX throws `MarkdownSyntaxError` with code `ERR_MARKDOWN_SYNTAX` and the parser diagnostic in `cause`.

## Performance and development

On the 53-page Farming Labs corpus, section extraction was **4.18× faster on human pages** and **4.03× faster on agent sidecars** than the portable JavaScript implementation. The measured small JSX expression took 21.3 ms on Node and 12.9 ms with the portable parser. [Benchmark results and reproduction](https://github.com/farming-labs/inkspan/blob/main/docs/benchmarks.md).

Node uses Rust for eligible outlines, components, and fences. Complex syntax and readable-text requests use the reference parser. A small literal heading can return before Wasm initialization. Browser and edge imports use the portable parser.

Run a cold-process comparison on your own corpus with `node benchmark/corpus.mjs ./content sections` or `node benchmark/corpus.mjs ./content components`. Both run nine samples after a warmup, alternate order, compare the full output, and report median, p95, and an independent baseline control. The output reports syntax errors for locally extended dialects.

Run `pnpm install --frozen-lockfile` and `pnpm test` for the Node and portable test suites. Run `node benchmark/check-parity.mjs` for differential fixtures. Pass a CommonMark specification JSON file for the extended suite. Use `pnpm build:reference` to rebuild the bundled parser. To rebuild Wasm, install Rust 1.99.1 with the `wasm32-unknown-unknown` target and `wasm-bindgen-cli` 0.2.128, then run `pnpm build:wasm`.
