# Changelog

## Unreleased

## 0.1.0-beta.3

- Preserve reference parser diagnostics when malformed JSX is read as text, including a stray `<` before a heading.

## 0.1.0-beta.2

- Return `MarkdownSyntaxError` for unclosed inline JSX in underlined headings on Node and browser Wasm.

## 0.1.0-beta.1

- Add `@farming-labs/inkspan/browser` with `createInkspan({ experimental: { wasm: true } })` for independently disposable browser Wasm parsers, asynchronous initialization, and synchronous parsing while preserving the default JavaScript path. Tracks [#1](https://github.com/farming-labs/inkspan/issues/1).
