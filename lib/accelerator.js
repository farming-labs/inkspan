export function createAccelerator(engine, initialize = () => {}) {
  let initialized = false;
  function checked(result, validateImportBlock) {
    if (result === undefined) return undefined;
    const [value, imports] = JSON.parse(result);
    return imports.every(validateImportBlock) ? value : undefined;
  }

  function acceleratedIndex(source, mdx, components, names, fences, validateImportBlock) {
    if (!source.isWellFormed()) return undefined;
    if (!initialized) {
      initialize();
      initialized = true;
    }
    return checked(
      engine.structural_index(source, mdx, components, names, fences),
      validateImportBlock,
    );
  }

  function acceleratedOutline(source, mdx, ignoreElements, validateImportBlock) {
    // Wasm accepts Unicode scalar values. Preserve any lone JavaScript surrogate verbatim.
    if (!source.isWellFormed()) return undefined;
    if (!initialized) {
      // A single literal ATX heading can be returned before paying the Wasm startup cost.
      const literal = /^(#{1,6}) +([A-Za-z0-9][A-Za-z0-9 -]*)$/u.exec(source);
      if (literal && literal[0].length === source.length) {
        return [
          {
            type: "heading",
            depth: literal[1].length,
            position: { start: { line: 1 } },
            children: [{ type: "text", value: literal[2].trimEnd() }],
          },
        ];
      }
      initialize();
      initialized = true;
    }
    return checked(engine.outline(source, mdx, ignoreElements), validateImportBlock);
  }
  return { acceleratedIndex, acceleratedOutline };
}
