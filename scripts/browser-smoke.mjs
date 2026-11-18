import { createInkspan, InkspanError, MarkdownSyntaxError } from "inkspan/browser";
import {
  MarkdownSyntaxError as RootSyntaxError,
  parseMarkdownSections,
} from "inkspan";

function check(value, message) {
  if (!value) throw new Error(message);
}

function canonical(value) {
  return JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
}

function hasWasmRequest() {
  return performance
    .getEntriesByType("resource")
    .some(({ name }) => name.includes("browser-wasm-"));
}

window.verifyInkspan = async function verifyInkspan() {
  check(!hasWasmRequest(), "Importing the browser entry requested Wasm.");
  const js = await createInkspan();
  const off = await createInkspan({ experimental: { wasm: false } });
  const parsers = [js, off];
  try {
    check(!hasWasmRequest(), "A disabled factory requested Wasm.");
    const wasmParsers = await Promise.all(
      [1, 2].map(() => createInkspan({ experimental: { wasm: true } })),
    );
    parsers.push(...wasmParsers);
    check(hasWasmRequest(), "The opt-in did not load the Wasm chunk.");
    const inputs = [
      "# Guide 🌱\r\n\r\n<Example>\r\n\r\n## Install\r\n\r\n</Example>\r\n\r\n~~~js\r\nrun()\r\n~~~",
      "# Guide\n\n<Widget items={rows.map(row => row.id)} />",
      "# a\uD800",
      "# Guide\n\n{let}",
    ];
    let comparisons = 0;
    function capture(parser, method, source, options) {
      try {
        const result = parser[method](source, options);
        check(!(result instanceof Promise), "Parsing returned a promise.");
        return result;
      } catch (error) {
        if (!(error instanceof MarkdownSyntaxError)) throw error;
        return {
          code: error.code,
          reason: error.cause.reason,
          line: error.cause.line,
          column: error.cause.column,
        };
      }
    }
    for (const source of inputs) {
      for (const method of ["parseMarkdownSections", "parseMarkdownOutline", "indexMarkdown"]) {
        for (const options of [
          { format: "mdx" },
          { format: "mdx", components: true, codeBlocks: true },
        ]) {
          const expected = canonical(capture(js, method, source, options));
          for (const parser of wasmParsers) {
            check(
              canonical(capture(parser, method, source, options)) === expected,
              `${method} output mismatch.`,
            );
            comparisons++;
          }
        }
      }
    }
    check(RootSyntaxError === MarkdownSyntaxError, "Syntax error identity differs across entries.");
    const retained = wasmParsers[0].parseMarkdownSections;
    wasmParsers[0].dispose();
    wasmParsers[0].dispose();
    try {
      retained("# Guide");
      throw new Error("Disposed parser still accepted input.");
    } catch (error) {
      check(
        error instanceof InkspanError && error.code === "ERR_INKSPAN_DISPOSED",
        "Unexpected disposal error.",
      );
    }
    check(
      wasmParsers[1].parseMarkdownSections(inputs[0], { format: "mdx" })[1].title === "Install",
      "Disposal affected another instance.",
    );
    check(parseMarkdownSections("# Default")[0].title === "Default", "Default parsing changed.");
    return {
      passed: true,
      comparisons,
      deferredWasm: true,
      independentInstances: true,
      synchronous: true,
      userAgent: navigator.userAgent,
    };
  } finally {
    for (const parser of parsers) parser.dispose();
  }
};

window.verifyDeniedWasm = async function verifyDeniedWasm() {
  try {
    const parser = await createInkspan({ experimental: { wasm: true } });
    parser.dispose();
    throw new Error("CSP-denied Wasm unexpectedly initialized.");
  } catch (error) {
    check(
      error instanceof InkspanError && error.code === "ERR_INKSPAN_WASM_INIT",
      "Initialization did not reject with its stable code.",
    );
    check(
      error.cause instanceof WebAssembly.CompileError,
      "CSP failure lost the original compile error.",
    );
    const js = await createInkspan({ experimental: { wasm: false } });
    try {
      check(
        js.parseMarkdownSections("# Portable")[0].title === "Portable",
        "Explicit JavaScript failed after Wasm rejection.",
      );
      return { passed: true, code: error.code, cause: error.cause.name, explicitJavaScript: true };
    } finally {
      js.dispose();
    }
  }
};
