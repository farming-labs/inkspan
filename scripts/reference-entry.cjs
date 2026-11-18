let mdx;
let markdown;

module.exports = function referenceParser(format) {
  // esbuild turns these imports into synchronous, lazy initializers in the portable ESM bundle.
  const { unified } = require("unified");
  const { default: parse } = require("remark-parse");
  const { default: gfm } = require("remark-gfm");
  if (format === "mdx") {
    const { default: mdxSyntax } = require("remark-mdx");
    return (mdx ??= unified().use(parse).use(mdxSyntax).use(gfm));
  }
  return (markdown ??= unified().use(parse).use(gfm));
};
