# Opt-in browser Wasm with owned parser instances

Status: implemented for `0.1.0-beta.1` in [#2](https://github.com/farming-labs/inkspan/pull/2). Tracks [#1](https://github.com/farming-labs/inkspan/issues/1).

## Problem

The Rust accelerator improves sustained structural parsing, but initialization and its payload are unnecessary for small browser jobs and operations that need the JavaScript parser. Default browser and edge imports must stay portable. An opt-in must not change another caller's parser or hide initialization failures.

## Decision

Add `inkspan/browser` with an asynchronous `createInkspan(options?)` factory. Initialization happens once per instance; all three parsing methods remain synchronous. Wasm is experimental and disabled unless `experimental.wasm` is `true`.

```js
import { createInkspan } from "inkspan/browser";

const parser = await createInkspan({ experimental: { wasm: true } });
try {
  const sections = parser.parseMarkdownSections("# Guide\n\n## Install");
} finally {
  parser.dispose();
}
```

Omitted options, omitted `experimental.wasm`, and `false` use JavaScript without importing or initializing Wasm. Invalid options reject. The factory always returns a promise. Parsing before initialization is impossible because the instance is returned only after readiness.

Reuse the existing compressed engine bytes. Dynamically import the Wasm loader only when requested, decode and decompress with browser APIs, and initialize the existing engine asynchronously. Do not add runtime npm dependencies, external asset hosting, implicit network requests beyond module loading, or a synchronous browser startup path. The opt-in requires WebAssembly, `DecompressionStream`, and standard browser stream/encoding APIs; unsupported runtimes reject with a stable code, a cause, and an explicit JavaScript alternative.

Generate instance-scoped browser bindings from the pinned wasm-bindgen output. Each factory call owns its Wasm instance and memory; concurrent calls cannot replace one another's exports. The default Node bindings remain unchanged. Extract the existing parser and accelerator logic into shared internal functions rather than implementing another parser.

`dispose()` is idempotent and drops the parser's engine references. All subsequent parsing calls throw `ERR_INKSPAN_DISPOSED`. It does not promise immediate garbage collection or unloading of cached ESM code. A failed initialization creates no usable parser and a later factory call can retry.

Keep semantic delegation to the JavaScript parser for complex MDX, lone UTF-16 surrogates, and readable text. This is existing parsing behavior, distinct from initialization failures, which must reject rather than silently disable Wasm. Preserve `MarkdownSyntaxError` identity across entries.

## Alternatives

- Replacing the browser default adds startup and payload costs for every consumer.
- A global enable/disable switch changes unrelated callers and complicates disposal and concurrent initialization.
- Uncompressed embedded Wasm preserves synchronous startup but increased the prototype's bundle and first-use cost.
- A separately hosted `.wasm` asset requires a URL/bundler contract. Defer it until a concrete consumer needs one.

## Acceptance and verification

- Exercise enabled, disabled, invalid, failed, retry, concurrent, and disposed states against the actual Wasm engine.
- Preserve full output and syntax diagnostics against the portable parser, including the differential corpus.
- Verify the published subpath and declarations from a packed tarball installed with scripts disabled, including strict TypeScript.
- Build a production browser bundle and assert no Node built-ins or Wasm assets enter the default import graph. With code splitting, a disabled factory must not request the Wasm chunk.
- Run the packed browser bundle in Chromium, checking initialization, synchronous operations, delegation, disposal, and failure/retry. Record the exact tested browser; do not claim other browsers or edge deployments without running them.
- Regenerate bindings with the pinned build tools, run package tests, and format/lint the touched source.

## Release and compatibility

This is an additive experimental subpath. Root exports, Node selection, browser/edge defaults, and existing function signatures stay unchanged. The addition is documented in the README and changelog. Release tags publish the verified tarball through the repository's [npm workflow](./publishing.md).

## Outcome

Version `0.1.0-beta.1` includes the opt-in factory, independent engine instances, disposal, and explicit initialization errors described above. The synchronous browser benchmark prototype was not shipped, and its timings do not measure this asynchronous loader. The default browser and edge parser remains JavaScript.

## Local verification

- The new test failed before implementation because the browser entry did not exist. `pnpm test` passes 17 tests under Node conditions and 17 under portable conditions, with no skipped tests. The five browser tests cover synchronous parsing, real Wasm memory independence, disposal, invalid options, missing capabilities, and retry.
- The 464-input differential suite matches the existing portable parser for both the root API and a packed browser Wasm instance. This extended differential run executes in Node.
- A clean npm consumer installed the tarball with scripts disabled. Both root runtime conditions passed the packed smoke test, and the browser subpath passed strict TypeScript with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, using only the ES2022 library.
- Chromium 152.0.7977.169 in Electron passed 48 comparisons on the minified, code-split production bundle. Disabled instances made no Wasm chunk request; enabled instances loaded it, preserved synchronous methods, and disposed independently. A real Content Security Policy denying Wasm compilation rejected with `ERR_INKSPAN_WASM_INIT` and a `CompileError` cause; explicitly selecting JavaScript still worked.
- The default browser module graph contains the portable accelerator, JavaScript reference parser, shared parser, and root entry only. It excludes Node built-ins and generated Wasm bindings/bytes.

To repeat browser verification after installing a packed tarball into a consumer directory, run `node scripts/verify-browser.mjs <consumer> --serve`. Open the printed local URL and call `window.verifyInkspan()`. Then open `/denied` and call `window.verifyDeniedWasm()`. Stop the server afterward. The script also writes bundle metadata and can run without `--serve` for graph checks alone.

Safari, Firefox, physical phones, edge deployments, network throttling, and peak memory were not verified. The earlier synchronous browser benchmark is not a performance measurement of this asynchronous loader. Browser module downloads and CSP changes can require a page reload before retry; the factory itself does not cache rejected initialization promises.
